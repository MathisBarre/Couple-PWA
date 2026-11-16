// Client du protocole UCPA (connexion Cognito SRP + SSO, lecture des billets), repris de
// l'app « UCPA simplifié » (github.com/MathisBarre/ucpa-simplified, lib/ucpa.js) sans changement
// de comportement. Détail du protocole observé : docs/ucpa-protocol.md.
//
// Le mot de passe ne sert qu'à `login()` : il n'est jamais conservé. Ce qui est gardé ensuite
// (jetons Cognito + cookies UCPA) est chiffré dans la base par ./session.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CookieJar } from 'tough-cookie'

const WEBSITE = 'https://www.ucpa.com'
const AUTH = 'https://authent.ucpa.com'
export const API = `${WEBSITE}/sport-station/espacepersonnel/api/paris-19`
const ALLOWED_HOSTS = new Set(['www.ucpa.com', 'authent.ucpa.com'])
/** Durée maximale locale d'une session, sans rapport avec la durée (non publiée) du refresh token UCPA. */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000
const REFRESH_MARGIN = 60_000

export class UcpaError extends Error {
  status: number
  code: string
  constructor(message: string, status = 502, code = 'UCPA_UNAVAILABLE') {
    super(message)
    this.status = status
    this.code = code
  }
}
const expired = () => new UcpaError('Votre session UCPA a expiré. Reconnectez-vous.', 401, 'SESSION_EXPIRED')

// Modules lourds chargés à la demande (seulement par la fonction /api/ucpa).
const cookies = () => import('tough-cookie')
export async function newJar(): Promise<CookieJar> {
  return new (await cookies()).CookieJar()
}
export async function jarFrom(serialized: unknown): Promise<CookieJar> {
  return (await cookies()).CookieJar.deserialize(serialized as any)
}

function tokenExpiry(token: string) {
  // Sert seulement à planifier le renouvellement ; l'authentification est vérifiée par Cognito et /user.
  try {
    const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp
    return Number.isFinite(exp) ? exp * 1000 : Infinity
  } catch {
    return Infinity
  }
}

class MemoryStorage {
  #values = new Map<string, string>()
  setItem(key: string, value: string) {
    this.#values.set(key, value)
    return value
  }
  getItem(key: string) {
    return this.#values.get(key) ?? null
  }
  removeItem(key: string) {
    this.#values.delete(key)
  }
  clear() {
    this.#values.clear()
  }
}

export interface Tokens {
  idToken: string
  accessToken: string
  refreshToken: string
  deviceKey?: string
  expiresAt: number
}
export interface AuthState {
  config: { userPool: string; clientId: string }
  tokens: Tokens
  needsSso: boolean
}

async function authenticate(config: { userPool: string; clientId: string }, email: string, password: string): Promise<Tokens> {
  const { AuthenticationDetails, CognitoUser, CognitoUserPool } = (await import('amazon-cognito-identity-js')) as any
  // Un stockage propre à chaque connexion : celui du SDK sous Node est partagé.
  const storage = new MemoryStorage()
  const pool = new CognitoUserPool({ UserPoolId: config.userPool, ClientId: config.clientId, Storage: storage })
  const user = new CognitoUser({ Username: email, Pool: pool, Storage: storage })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      storage.clear()
      reject(new UcpaError('UCPA met trop de temps à répondre. Réessayez.', 504))
    }, 25_000)
    const fail = (error: Error) => {
      clearTimeout(timer)
      storage.clear()
      reject(error)
    }
    const challenge = () =>
      fail(new UcpaError('Votre compte UCPA demande une vérification supplémentaire. Faites-la sur le site UCPA, puis réessayez.', 422, 'AUTH_CHALLENGE'))
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess(session: any) {
        clearTimeout(timer)
        const result: Tokens = {
          idToken: session.getIdToken().getJwtToken(),
          accessToken: session.getAccessToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
          deviceKey: user.deviceKey,
          expiresAt: Math.min(session.getIdToken().getExpiration(), session.getAccessToken().getExpiration()) * 1000,
        }
        storage.clear()
        resolve(result)
      },
      onFailure(error: any) {
        const code = error.code || error.name
        if (['NotAuthorizedException', 'UserNotFoundException'].includes(code)) {
          fail(new UcpaError('Adresse e-mail ou mot de passe UCPA incorrect.', 401, 'INVALID_CREDENTIALS'))
        } else if (['TooManyRequestsException', 'LimitExceededException'].includes(code)) {
          fail(new UcpaError('Trop de tentatives. Patientez avant de réessayer.', 429, 'RATE_LIMITED'))
        } else if (['UserNotConfirmedException', 'PasswordResetRequiredException'].includes(code)) {
          challenge()
        } else {
          fail(new UcpaError('Connexion à UCPA impossible pour le moment. Réessayez.'))
        }
      },
      mfaRequired: challenge,
      totpRequired: challenge,
      newPasswordRequired: challenge,
      customChallenge: challenge,
      selectMFAType: challenge,
      mfaSetup: challenge,
    })
  })
}

function trustedUrl(input: string) {
  const url = new URL(input)
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.port || url.username || url.password) {
    throw new UcpaError('Redirection UCPA inattendue.')
  }
  return url
}

interface RequestOptions {
  method?: string
  body?: unknown
  redirect?: boolean
}

export class UcpaClient {
  fetch: typeof fetch
  jar!: CookieJar
  expiresAt = 0
  auth: AuthState | null = null
  generation = 0
  refreshing: Promise<void> | null = null
  closed = false

  constructor({ fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}) {
    this.fetch = fetchImpl
  }

  static async create(options?: { fetchImpl?: typeof fetch }) {
    const client = new UcpaClient(options)
    client.jar = await newJar()
    return client
  }

  async cognito(operation: string, body: unknown): Promise<any> {
    const response = await this.fetch('https://cognito-idp.eu-west-1.amazonaws.com/', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${operation}` },
      body: JSON.stringify(body),
    })
    if (response.ok && operation === 'RevokeToken') {
      await response.body?.cancel()
      return
    }
    let data: any
    try {
      data = await response.json()
    } catch {
      throw new UcpaError('Réponse de connexion UCPA invalide.')
    }
    if (!response.ok) {
      const code = String(data?.__type || data?.code || '').split('#').at(-1)!
      if (['NotAuthorizedException', 'UserNotFoundException', 'RefreshTokenReuseException'].includes(code)) throw expired()
      if (code === 'TooManyRequestsException') throw new UcpaError('Trop de demandes. Patientez avant de réessayer.', 429, 'RATE_LIMITED')
      throw new UcpaError('Renouvellement UCPA momentanément impossible. Réessayez.')
    }
    return data
  }

  async ensureSession({ force = false, generation = this.generation } = {}) {
    if (this.closed) throw expired()
    if (!this.auth) return
    if (this.expiresAt <= Date.now()) throw expired()
    if (this.refreshing) return this.refreshing
    if (generation !== this.generation || (!force && !this.auth.needsSso && this.auth.tokens.expiresAt > Date.now() + REFRESH_MARGIN)) return
    this.refreshing = this.renewSession()
    try {
      await this.refreshing
    } finally {
      this.refreshing = null
    }
  }

  async renewSession() {
    const auth = this.auth!
    if (auth.tokens.expiresAt <= Date.now() + REFRESH_MARGIN) {
      const result = await this.cognito('GetTokensFromRefreshToken', {
        ClientId: auth.config.clientId,
        RefreshToken: auth.tokens.refreshToken,
        ...(auth.tokens.deviceKey ? { DeviceKey: auth.tokens.deviceKey } : {}),
      })
      const tokens = result?.AuthenticationResult
      // Un refresh token renouvelé est gardé même si l'échange SSO qui suit échoue.
      if (typeof tokens?.RefreshToken === 'string' && tokens.RefreshToken) auth.tokens.refreshToken = tokens.RefreshToken
      if (
        typeof tokens?.IdToken !== 'string' ||
        !tokens.IdToken ||
        typeof tokens.AccessToken !== 'string' ||
        !tokens.AccessToken ||
        !Number.isFinite(tokens.ExpiresIn) ||
        tokens.ExpiresIn <= 0
      )
        throw new UcpaError('Réponse de renouvellement UCPA invalide.')
      auth.tokens = {
        ...auth.tokens,
        idToken: tokens.IdToken,
        accessToken: tokens.AccessToken,
        expiresAt: Math.min(Date.now() + tokens.ExpiresIn * 1000, tokenExpiry(tokens.IdToken), tokenExpiry(tokens.AccessToken)),
      }
    }
    auth.needsSso = true
    if (this.closed) throw expired()
    // Nouvelle transaction SSO sur un cookie jar neuf : l'ancien reste intact si le réseau lâche en route.
    const renewed = await UcpaClient.create({ fetchImpl: this.fetch })
    const transaction = await renewed.beginSso()
    if (transaction.config.clientId !== auth.config.clientId || transaction.config.userPool !== auth.config.userPool) throw expired()
    await renewed.finishSso(transaction, auth.tokens)
    if (this.closed) throw expired()
    this.jar = renewed.jar
    auth.needsSso = false
    this.generation++
  }

  async request(input: string, { method = 'GET', body, redirect = true }: RequestOptions = {}) {
    let url = trustedUrl(input)
    for (let count = 0; count < 10; count++) {
      const cookie = await this.jar.getCookieString(url.href)
      const response = await this.fetch(url.href, {
        method,
        headers: {
          Accept: 'application/json, text/html;q=0.9',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: url.origin }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      })
      for (const c of response.headers.getSetCookie()) await this.jar.setCookie(c, url.href)
      const location = response.headers.get('location')
      if (redirect && location && [301, 302, 303, 307, 308].includes(response.status)) {
        const next = trustedUrl(new URL(location, url).href)
        // Ne jamais transmettre un corps (jetons) à une autre origine via 307/308.
        if (body !== undefined && next.origin !== url.origin && [307, 308].includes(response.status)) throw new UcpaError('Redirection UCPA inattendue.')
        if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) {
          method = 'GET'
          body = undefined
        }
        await response.body?.cancel()
        url = next
        continue
      }
      return { response, url }
    }
    throw new UcpaError('La connexion UCPA tourne en boucle.')
  }

  /** Lecture JSON ; rétablit la session une fois si UCPA la refuse. Jamais pour une écriture. */
  async json(url: string, options?: RequestOptions): Promise<any> {
    await this.ensureSession()
    const generation = this.generation
    try {
      return await this.readJson(url, options)
    } catch (error) {
      if ((error as UcpaError).code !== 'SESSION_EXPIRED' || !this.auth) throw error
      await this.ensureSession({ force: true, generation })
      return this.readJson(url, options)
    }
  }

  async readJson(url: string, options?: RequestOptions): Promise<any> {
    const { response, url: finalUrl } = await this.request(url, options)
    if ([401, 403].includes(response.status) || (new URL(url).origin === WEBSITE && finalUrl.origin === AUTH)) {
      await response.body?.cancel()
      throw expired()
    }
    let data: any
    try {
      data = await response.json()
    } catch {
      throw new UcpaError('UCPA a renvoyé une réponse inattendue.')
    }
    if (data?.loginUrl) throw expired()
    if (!response.ok || data?.success === false) throw new UcpaError('Impossible de récupérer les données UCPA.')
    return data
  }

  async beginSso() {
    // Nouvelle transaction SSO à chaque fois : les codes des liens de connexion sont éphémères.
    const { response, url } = await this.request(`${WEBSITE}/af/sso/login?context=alpha`)
    await response.body?.cancel()
    const code = url.searchParams.get('authorization_code')
    const context = url.searchParams.get('context')
    const redirectUri = url.searchParams.get('redirect_uri')
    if (!response.ok || url.origin !== AUTH || !code || !context || !redirectUri) throw new UcpaError('Le parcours de connexion UCPA a changé.')
    const callback = trustedUrl(redirectUri)
    if (callback.origin !== WEBSITE || callback.pathname !== '/af/sso/authorize') throw new UcpaError('Adresse de retour UCPA inattendue.')
    const config = await this.json(`${AUTH}/idp/cognito-contexts/${encodeURIComponent(context)}`)
    if (!/^eu-west-1_[a-zA-Z0-9]+$/.test(config.userPool) || !/^[a-zA-Z0-9]+$/.test(config.clientId)) {
      throw new UcpaError('Configuration de connexion UCPA inattendue.')
    }
    return { config: { userPool: String(config.userPool), clientId: String(config.clientId) }, code, context, callback, state: url.searchParams.get('state') }
  }

  async finishSso(
    { code, context, callback, state }: { code: string; context: string; callback: URL; state: string | null },
    tokens: Pick<Tokens, 'idToken' | 'accessToken'>,
  ) {
    const stored = await this.request(`${AUTH}/idp/storage`, {
      method: 'POST',
      redirect: false,
      body: { authorization_code: code, id_token: tokens.idToken, access_token: tokens.accessToken },
    })
    await stored.response.body?.cancel()
    if (stored.response.status !== 200) throw new UcpaError('Le code de connexion a expiré. Réessayez.')
    callback.searchParams.set('code', code)
    callback.searchParams.set('context', context)
    if (state) callback.searchParams.set('state', state)
    const authorized = await this.request(callback.href)
    await authorized.response.body?.cancel()
    if (!authorized.response.ok) throw new UcpaError('UCPA n’a pas confirmé la connexion.')
    const identity = await this.readJson(`${API}/user`)
    if (!identity.success || !identity.data?.uuid) throw new UcpaError('UCPA n’a pas confirmé votre session.')
    return identity.data
  }

  /** Connexion ; renvoie le nom du titulaire du compte. */
  async login(email: string, password: string, authenticateImpl = authenticate): Promise<string> {
    this.closed = false
    const transaction = await this.beginSso()
    const tokens = await authenticateImpl(transaction.config, email, password)
    const user = await this.finishSso(transaction, tokens)
    this.auth = tokens.refreshToken ? { config: transaction.config, tokens, needsSso: false } : null
    this.expiresAt = this.auth ? Date.now() + SESSION_MAX_AGE : tokens.expiresAt
    return [user.firstname, user.lastname].filter(Boolean).join(' ')
  }

  async tickets() {
    // Les deux lectures vont au bout : l'une ou l'autre peut renouveler la session SSO.
    const reads = await Promise.allSettled([this.json(`${API}/user`), this.json(`${API}/site`)])
    const failure = reads.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    if (failure) throw failure.reason
    const [identity, configuration] = reads.map((r) => (r as PromiseFulfilledResult<any>).value)
    const user = identity.data
    const site = configuration.data
    if (!identity.success || !user?.uuid || !configuration.success || !site?.workspace) throw new UcpaError('Le format des données UCPA a changé.')
    const contacts = Array.isArray(user.contacts) ? user.contacts : []
    let records: any[]
    if (site.horanetSource === 'postgres' && !site.is_internal_session) {
      const result = await this.json(`${API}/amplify/ebillets`, {
        method: 'POST',
        body: {
          contacts: contacts.filter((c: any) => c.horanet_id).map((c: any) => c.horanet_id),
          codeSiteComptage: site.code_site_comptage,
          shared_workspaces: site.shared_workspaces || [],
          isInternalSession: site.is_internal_session,
          filters: { availableCredit: { gt: 0 } },
        },
      })
      if (!Array.isArray(result)) throw new UcpaError('Le format des billets UCPA a changé.')
      records = result
    } else {
      const result = await this.json(`${API}/ebillets/${encodeURIComponent(site.workspace)}?source=${encodeURIComponent(site.apiSource)}`)
      if (!Array.isArray(result.data)) throw new UcpaError('Le format des billets UCPA a changé.')
      records = result.data
    }
    return normalizeTickets(records, user, contacts)
  }

  /** Révoque le refresh token et ferme la session web UCPA. Vrai si UCPA a confirmé la fermeture. */
  async logout() {
    this.closed = true
    try {
      await this.refreshing
    } catch {
      /* on révoque et on ferme quand même */
    }
    try {
      let revoked = !this.auth
      if (this.auth) {
        try {
          await this.cognito('RevokeToken', { ClientId: this.auth.config.clientId, Token: this.auth.tokens.refreshToken })
          revoked = true
        } catch {
          /* on ferme quand même la session web */
        }
      }
      const { response } = await this.request(`${WEBSITE}/sport-station/af/logout?return=${encodeURIComponent(`${WEBSITE}/sport-station/paris-19`)}`)
      await response.body?.cancel()
      const check = await this.request(`${API}/user`)
      const result = await check.response.json()
      return revoked && result.success === false && Boolean(result.loginUrl)
    } finally {
      await this.jar.removeAllCookies()
      this.expiresAt = 0
      this.auth = null
    }
  }
}

function timestamp(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value)
    return n < 1e12 ? n * 1000 : n
  }
  const n = Date.parse(String(value))
  return Number.isFinite(n) ? n : null
}

export interface Ticket {
  code: string
  label: string
  holder: string
  validUntil?: number
  /** Image PNG du QR (data URL), encodée ici à partir du numéro du billet. */
  qr: string
}

export async function normalizeTickets(records: any[], user: any, contacts: any[], now = Date.now()): Promise<Ticket[]> {
  const QRCode = (await import('qrcode')).default
  const tickets: Ticket[] = []
  const seen = new Set<string>()
  for (const record of records) {
    const code = record.qrcode
    if (typeof code !== 'string' || !code.trim() || code.length > 1024 || seen.has(code)) continue
    if (record.blocked || record.contremarque || record.order_contremarque || record.order_sans_support || code.length === 13) continue
    const start = timestamp(record.startDateTimestamp ?? record.startDate)
    const end = timestamp(record.endDateTimestamp ?? record.endDate)
    if ((start !== null && start > now) || (end !== null && end <= now)) continue
    const contact = contacts.find((c) => String(c.horanet_id) === String(record.horanetId)) || record.customer
    if (!contact) continue
    const order = (user.orders || []).find((o: any) => (record.salesNumber || []).includes(o.uuid))
    const item = order?.order?.order_items?.find(
      (i: any) => i.customer?.uuid === contact.uuid && String(i.horanet_product_reference).trim() === String(record.productReference).trim(),
    )
    if (item?.contremarque || item?.sans_support) continue
    seen.add(code)
    tickets.push({
      code,
      label: item?.product_name || record.product_name || record.productLabel?.trim() || 'Mon e-billet',
      holder: [contact.firstname, contact.lastname].filter(Boolean).join(' '),
      ...(end !== null ? { validUntil: end } : {}),
      // Le QR est encodé ici depuis le numéro : aucun HTML venu d'UCPA n'est affiché.
      qr: await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 4, width: 768, type: 'image/png' }),
    })
  }
  return tickets
}
