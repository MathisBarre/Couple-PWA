// Planning et réservations UCPA, repris de « UCPA simplifié » (lib/reservations.js).
// Le téléphone ne choisit que le billet, la date et la séance : le serveur relit droits et
// disponibilités et reconstruit lui-même chaque requête UCPA. Une écriture n'est jamais rejouée.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { API, UcpaError, type UcpaClient } from './client.js'

const inFlight = new Set<string>()
const changed = () => new UcpaError('Le format du planning UCPA a changé. Consultez le site officiel.')
const text = (value: unknown) => String(value ?? '').trim()
const post = (client: UcpaClient, path: string, body: unknown) => client.json(`${API}/${path}`, { method: 'POST', body })

export function parisDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function validateDate(date: unknown): string {
  const today = parisDate()
  const last = parisDate(new Date(Date.now() + 90 * 86400_000))
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    date < today ||
    date > last
  ) {
    throw new UcpaError('Choisissez une date dans les 90 prochains jours.', 400, 'BAD_REQUEST')
  }
  return date
}

// Reconstitue le billet du planning officiel à partir des contrats, contacts et achats du compte.
export function normalizeContracts(records: any, user: any) {
  if (!Array.isArray(records)) throw changed()
  return records.flatMap((record: any) => {
    const customer = user.contacts?.find((c: any) => text(c.horanet_id) === text(record.horanetId))
    if (
      !customer?.uuid ||
      !customer.horanet_id ||
      !record.contratReservable ||
      record.blocked ||
      !record.qrcode ||
      String(record.qrcode).length === 13 ||
      !record.contractNumber
    )
      return []
    if (Number(record.startDate) * 1000 > Date.now() || Number(record.endDate) * 1000 < Date.now()) return []
    const order = user.orders?.find((o: any) => record.salesNumber?.includes(o.uuid))
    const items = order?.order?.order_items || []
    const matches = (item: any) =>
      item.customer?.uuid === customer.uuid &&
      text(item.horanet_product_reference) === text(record.productReference) &&
      (!item.unit_sales || item.qrcode?.includes(record.qrcode) || record.salesNumber?.includes(order?.uuid))
    const item =
      items.find(matches) || items.flatMap((i: any) => i.options || []).find((i: any) => text(i.horanet_product_reference) === text(record.productReference))
    if ((order && !item) || item?.contremarque) return []
    const hasSession = Boolean(record.sessions?.length)
    const type = item?.unit_sales
      ? 'single-entry'
      : item?.reservation || item?.inscription || (hasSession && !Object.hasOwn(record, 'produitsRechargeables'))
        ? 'single-session'
        : item?.recurring
          ? 'recurring'
          : 'reloadable'
    // Échanges et réservations spécialisées : autre parcours UCPA.
    if (type === 'single-session' || !(Number(record.contractStock) > 0 || record.modeAccess === 11 || record.modeAccess === 4 || hasSession)) return []
    return [
      {
        uuid: `${item?.uuid || record.salesNumber?.[0] || record.contractNumber}-${record.qrcode}`,
        type,
        customer,
        modeAccess: record.modeAccess,
        product_name: item?.product_name || record.productLabel,
        product_uuid: item?.product_uuid,
        horanet_product_reference: record.productReference,
        contractNumber: record.contractNumber,
        numeroContrat: record.contractNumber,
        qrcode: record.qrcode,
        codeTechnologie: record.codeTechnologie,
        salesNumber: record.salesNumber,
        order_uuid: order?.uuid || null,
        order_contremarque: item?.contremarque,
        remainingQuantity: record.contractStock,
        unlimited_usage: record.modeAccess === 4,
        blocked: record.blocked,
        contratReservable: record.contratReservable,
        recurring: item?.recurring,
        reloadable: item?.reloadable,
        inscription: item?.inscription,
        offer_type: item?.offer_type,
        startDateTimestamp: record.startDate,
        endDateTimestamp: record.endDate,
        sessions: record.sessions,
        serviceId: record.serviceId,
        servicesId: record.servicesId,
        availableCredit: record.availableCredit || null,
        sessionsCount: record.sessionsCount || null,
      },
    ]
  })
}

async function context(client: UcpaClient) {
  const reads = await Promise.allSettled([client.json(`${API}/user`), client.json(`${API}/site`)])
  const failure = reads.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
  if (failure) throw failure.reason
  const [identity, configuration] = reads.map((r) => (r as PromiseFulfilledResult<any>).value)
  const user = identity.data,
    site = configuration.data
  if (!identity.success || !user?.uuid || !configuration.success || !site?.workspace) throw changed()
  if (site.horanetSource !== 'postgres' || site.is_internal_session) {
    throw new UcpaError('Ce type de réservation se fait sur le site UCPA.', 422, 'UNSUPPORTED_BOOKING')
  }
  const records = await post(client, 'amplify/reservableEbillets', {
    contacts: (user.contacts || []).filter((c: any) => c.horanet_id).map((c: any) => c.horanet_id),
    codeSiteComptage: site.code_site_comptage,
    shared_workspaces: site.shared_workspaces || [],
    isInternalSession: site.is_internal_session,
  })
  return { user, site, contracts: normalizeContracts(records, user) }
}
type Context = Awaited<ReturnType<typeof context>>

export function flattenSessions(activities: any): any[] {
  if (!Array.isArray(activities)) throw changed()
  const sessions = new Map<string, any>()
  for (const activity of activities) {
    for (const day of activity.days || []) {
      for (const item of day.items || []) {
        for (const session of item.activities ? Object.values(item.activities as Record<string, any>) : [item]) {
          if (session.code === undefined || !Number.isFinite(Number(session.startTimestamp)) || !Number.isFinite(Number(session.endTimestamp))) throw changed()
          sessions.set(String(session.code), {
            ...session,
            max_amount: session.max_amount ?? activity.max_amount,
            reservations: session.reservations ?? activity.reservations,
          })
        }
      }
    }
  }
  return [...sessions.values()].sort((a, b) => a.startTimestamp - b.startTimestamp || text(a.type).localeCompare(text(b.type)))
}

export function canBook(session: any, canReserve: unknown) {
  const limit = Number(session.reservationHoursLimit || 0) * 3600_000
  return Boolean(
    canReserve === true &&
      session.isReservable === true &&
      !session.isReserved &&
      !session.isFull &&
      !session.isPending &&
      !session.disable &&
      !session.isDisabled &&
      !session.isLimitReservation &&
      !session.isTerrainSession &&
      !session.isClubPass &&
      !session.reserveWithCustomerHorse &&
      Number(session.stock) > 0 &&
      Number(session.startTimestamp) > Date.now() + limit &&
      !(session.max_amount && Number(session.reservations) >= Number(session.max_amount)),
  )
}
export function canCancel(session: any, site: any) {
  const settings = site.perso_settings || {}
  const minutes = Number(settings.maxLimitInMinutesBeforeCancelation ?? Number(settings.maxLimitInHoursBeforeCancelation || 0) * 60)
  return Boolean(
    session.isReserved === true &&
      session.isCancelable === true &&
      session.isAnulationPossible !== false &&
      session.isInLimit !== false &&
      !session.isTerrainSession &&
      !session.isClubPass &&
      !session.reserveWithCustomerHorse &&
      Number.isFinite(minutes) &&
      Number(session.startTimestamp) > Date.now() + Math.max(0, minutes) * 60_000,
  )
}

// Requête officielle en mode Jour (start === end), la seule forme observée.
async function contractActivities(client: UcpaClient, { site, user }: Context, contract: any, date: string) {
  const result = await post(client, 'amplify/contractActivities', {
    uuid: contract.customer.uuid,
    workspace: site.workspace,
    product_reference: contract.horanet_product_reference,
    start: date,
    end: date,
    qrcode: contract.qrcode,
    isDaily: true,
    product_uuid: contract.product_uuid,
    contractNumber: contract.numeroContrat,
    contract,
    codeSiteComptage: site.code_site_comptage,
    horanet_id: contract.customer.horanet_id,
    order: user.orders?.find((o: any) => o.uuid === contract.order_uuid),
    maxLimitInMinutesBeforeCancelation: site.perso_settings?.maxLimitInMinutesBeforeCancelation,
    timezone: site.timezone,
    shared_workspaces: site.shared_workspaces || [],
    isInternalSession: site.is_internal_session,
    source: site.apiSource,
    enableCourtProject: site.enableCourtProject,
  })
  if (!result.success || !Array.isArray(result.data?.activities)) throw changed()
  return result.data
}

async function load(client: UcpaClient, date: string, contractId: string) {
  validateDate(date)
  const ctx = await context(client)
  const contract = contractId ? ctx.contracts.find((c) => c.uuid === contractId) : ctx.contracts[0]
  if (!contract) {
    if (contractId) throw new UcpaError('Ce billet n’est plus disponible pour réserver.', 409, 'CONTRACT_UNAVAILABLE')
    return { ...ctx, contract: null, sessions: [] as any[], canReserve: false }
  }
  const data = await contractActivities(client, ctx, contract, date)
  return { ...ctx, contract, sessions: flattenSessions(data.activities), canReserve: data.canReserve }
}

export interface PublicSession {
  id: string
  name: string
  start: number
  end: number
  stock: number
  reserved: boolean | null
  available: boolean
  cancellable: boolean
}
export interface DayPlanning {
  date: string
  sessions: PublicSession[]
}

const publicContracts = (ctx: Context) =>
  ctx.contracts.map((c) => ({ id: c.uuid, label: [c.product_name, c.customer.firstname, c.customer.lastname].filter(Boolean).join(' ') }))
const publicSessions = (sessions: any[], canReserve: unknown, site: any): PublicSession[] =>
  sessions.map((s) => ({
    id: String(s.code),
    name: text(s.type),
    start: Number(s.startTimestamp),
    end: Number(s.endTimestamp),
    stock: Math.max(0, Number(s.stock) || 0),
    reserved: typeof s.isReserved === 'boolean' ? s.isReserved : null,
    available: canBook(s, canReserve),
    cancellable: canCancel(s, site),
  }))

export async function planning(client: UcpaClient, { date = parisDate(), contractId = '' }: { date?: string; contractId?: string } = {}) {
  const ctx = await load(client, date, contractId)
  return { date, contractId: ctx.contract?.uuid || '', contracts: publicContracts(ctx), sessions: publicSessions(ctx.sessions, ctx.canReserve, ctx.site) }
}

// Arithmétique de calendrier sur une date de Paris (ajouter 24 h peut répéter un jour au changement d'heure).
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10)

// Au plus `limit` lectures à la fois. Après un échec, plus de nouvelle lecture, mais celles en
// cours vont au bout : l'une d'elles peut être en train de renouveler la session.
async function bounded<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  let failure: { error: unknown } | null = null
  const worker = async () => {
    while (!failure && next < tasks.length) {
      const index = next++
      try {
        results[index] = await tasks[index]()
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  if (failure) throw (failure as { error: unknown }).error
  return results
}

/** Le planning complet des `days` prochains jours en une lecture (une lecture du compte, puis une par jour). */
export async function upcomingPlanning(client: UcpaClient, { contractId = '', days = 14 }: { contractId?: string; days?: number } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new UcpaError('Période invalide.', 400, 'BAD_REQUEST')
  const from = parisDate()
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i))
  const ctx = await context(client)
  const contract = contractId ? ctx.contracts.find((c) => c.uuid === contractId) : ctx.contracts[0]
  if (!contract && contractId) throw new UcpaError('Ce billet n’est plus disponible pour réserver.', 409, 'CONTRACT_UNAVAILABLE')
  const reads = contract
    ? await bounded(
        dates.map((date) => async () => {
          const data = await contractActivities(client, ctx, contract, date)
          return { sessions: flattenSessions(data.activities), canReserve: data.canReserve }
        }),
        4,
      )
    : []
  return {
    from,
    to: dates.at(-1)!,
    contractId: contract?.uuid || '',
    contracts: publicContracts(ctx),
    days: reads.map((read, i): DayPlanning => ({ date: dates[i], sessions: publicSessions(read.sessions, read.canReserve, ctx.site) })),
  }
}

export interface MutationInput {
  contractId: string
  sessionId: string
  date: string
  expectedSession?: { name: string; start: number; end: number }
  previousConfirmation?: 'reserve' | 'cancel'
}
export interface MutationResult {
  confirmed: true
  alreadyReserved?: boolean
  alreadyCancelled?: boolean
  /** La séance telle que relue avant l'envoi (nom, horaires), pour la liste partagée. */
  session?: { id: string; name: string; start: number; end: number }
}

export const reserve = (client: UcpaClient, input: MutationInput) => mutateReservation(client, input, false)
export const cancel = (client: UcpaClient, input: MutationInput) => mutateReservation(client, input, true)

async function mutateReservation(client: UcpaClient, input: MutationInput, cancelling: boolean): Promise<MutationResult> {
  const label = cancelling ? 'Annulation' : 'Réservation'
  const prefix = cancelling ? 'CANCELLATION' : 'BOOKING'
  if (
    !input ||
    typeof input.contractId !== 'string' ||
    !input.contractId ||
    input.contractId.length > 300 ||
    typeof input.sessionId !== 'string' ||
    !input.sessionId ||
    input.sessionId.length > 200
  ) {
    throw new UcpaError('Séance invalide.', 400, 'BAD_REQUEST')
  }
  validateDate(input.date)
  if (
    input.expectedSession !== undefined &&
    (!input.expectedSession ||
      typeof input.expectedSession.name !== 'string' ||
      !Number.isFinite(input.expectedSession.start) ||
      !Number.isFinite(input.expectedSession.end))
  ) {
    throw new UcpaError('Séance invalide.', 400, 'BAD_REQUEST')
  }
  // Verrou synchrone avant le premier await (même instance). Entre instances, UCPA reste juge.
  const key = JSON.stringify([input.contractId, input.sessionId])
  if (inFlight.has(key)) throw new UcpaError('Une vérification est déjà en cours.', 409, 'BOOKING_IN_PROGRESS')
  inFlight.add(key)
  try {
    const ctx = await load(client, input.date, input.contractId)
    const session = ctx.sessions.find((s) => String(s.code) === input.sessionId)
    const summary = session && { id: String(session.code), name: text(session.type), start: Number(session.startTimestamp), end: Number(session.endTimestamp) }
    const expected = input.expectedSession
    if (session && expected && (expected.name !== text(session.type) || expected.start !== Number(session.startTimestamp) || expected.end !== Number(session.endTimestamp))) {
      throw new UcpaError('Cette séance a changé. Vérifiez ses horaires et confirmez à nouveau.', 409, 'SESSION_CHANGED')
    }
    if (input.previousConfirmation === (cancelling ? 'reserve' : 'cancel') && session?.isReserved === !cancelling) {
      throw new UcpaError('UCPA n’a pas encore actualisé cette séance. Réessayez dans un instant.', 409, 'PLANNING_NOT_READY')
    }
    if (!cancelling && session?.isReserved === true) return { confirmed: true, alreadyReserved: true, session: summary }
    if (cancelling && session?.isReserved === false) return { confirmed: true, alreadyCancelled: true, session: summary }
    if (!session || !(cancelling ? canCancel(session, ctx.site) : canBook(session, ctx.canReserve))) {
      throw new UcpaError(cancelling ? 'Cette séance ne peut plus être annulée.' : 'Cette séance n’est plus réservable.', 409, 'SESSION_UNAVAILABLE')
    }
    const c = ctx.contract!
    try {
      // Pas de redirection suivie ni de nouvel envoi pour une écriture.
      const { response } = await client.request(`${API}/${cancelling ? 'cancel' : 'reserver'}/${encodeURIComponent(ctx.site.workspace)}`, {
        method: 'POST',
        redirect: false,
        body: cancelling
          ? {
              workspace: ctx.site.workspace,
              sessionCode: session.code,
              numeroContrat: session.sessionparticipant?.contract_number || session.numeroContrat || c.numeroContrat,
              user: c.customer.uuid,
              sessionName: session.type,
              startTimestamp: session.startTimestamp,
              endTimestamp: session.endTimestamp,
              removeHorse: false,
            }
          : {
              user_logged: ctx.user,
              workspace: ctx.site.workspace,
              passCode: c.qrcode,
              participant: c.customer,
              technologie: c.codeTechnologie,
              horanetProductReference: c.horanet_product_reference,
              product_uuid: c.product_uuid,
              order_uuid: c.order_uuid,
              contract_number: c.numeroContrat,
              sessionCode: session.code,
              idActivity: session.code,
              sessionName: session.type,
              startTimestamp: session.startTimestamp,
              endTimestamp: session.endTimestamp,
              isInternalSession: ctx.site.is_internal_session || null,
              horse: null,
            },
      })
      const result: any = await response.json()
      if (response.ok && (!cancelling || result?.success === true) && result?.data?.success === true) return { confirmed: true, session: summary }
      if (result?.loginUrl || [401, 403].includes(response.status))
        throw new UcpaError(`Session expirée. Reconnectez-vous pour vérifier ${cancelling ? 'l’annulation' : 'la réservation'}.`, 401, 'SESSION_EXPIRED')
      if (response.ok && (!cancelling || result?.success === true) && result?.data?.success === false)
        throw new UcpaError(`UCPA a refusé ${cancelling ? 'cette annulation' : 'cette réservation'}. Actualisez le planning.`, 409, `${prefix}_REJECTED`)
    } catch (error) {
      if (error instanceof UcpaError && ['SESSION_EXPIRED', `${prefix}_REJECTED`].includes(error.code)) throw error
    }
    // Réponse perdue ou ambiguë : on relit, on ne renvoie jamais.
    try {
      const check = await load(client, input.date, input.contractId)
      if (check.sessions.some((s) => String(s.code) === input.sessionId && s.isReserved === !cancelling)) return { confirmed: true, session: summary }
    } catch {
      /* l'incertitude demeure */
    }
    throw new UcpaError(`${label} non confirmée. Vérifiez son état avant toute nouvelle tentative.`, 409, `${prefix}_UNCERTAIN`)
  } finally {
    inFlight.delete(key)
  }
}
