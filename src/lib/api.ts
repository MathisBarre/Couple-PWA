// Appels à l'API (fonctions Vercel dans /api). La session est un cookie HttpOnly.

export interface Couple {
  id: string
  invite_code: string
  default_cycle_length: number
  iud_inserted_on: string | null
}

export interface Member {
  id: string
  display_name: string
}

export interface Me {
  user: { id: string; email: string; display_name: string; couple_id: string | null }
  couple: Couple | null
  members: Member[]
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Émis sur `window` quand le serveur ne reconnaît plus la session en cours d'utilisation (cookie expiré). */
export const SESSION_EXPIRED = 'session-expired'

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    // Pas de réponse du tout (hors ligne, réseau coupé) : statut 0, message lisible.
    throw new ApiError(
      navigator.onLine ? 'Impossible de joindre le serveur. Vérifiez la connexion, puis réessayez.' : 'Pas de connexion. Réessayez une fois le réseau revenu.',
      0,
    )
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Session perdue en cours de route (ailleurs que sur l'écran de connexion) : l'app renvoie à la connexion.
    if (res.status === 401 && path !== 'auth') window.dispatchEvent(new Event(SESSION_EXPIRED))
    const fallback = res.status >= 500 ? 'Le serveur a rencontré un problème. Réessayez dans un instant.' : `Erreur ${res.status}`
    throw new ApiError((data as { error?: string }).error ?? fallback, res.status)
  }
  return data as T
}

/** Profil, couple et membres ; null si non connecté. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await api<Me>('auth')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    throw e
  }
}

export const logout = () => api('auth', { method: 'POST', body: { action: 'logout' } })
