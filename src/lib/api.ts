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

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: init.method ?? 'GET',
    headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Erreur ${res.status}`, res.status)
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
