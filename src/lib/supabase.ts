import { createClient } from '@supabase/supabase-js'

// VITE_* en local ; NEXT_PUBLIC_SUPABASE_* sont créées automatiquement
// par l'intégration Supabase de Vercel (valeurs publiques, sans risque côté client).
const env = import.meta.env
const url = (env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL) as string | undefined
const key = (env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export interface Couple {
  id: string
  invite_code: string
  time_zone: string
  reminder_hour: number
  default_cycle_length: number
  iud_inserted_on: string | null
}

export interface Profile {
  id: string
  couple_id: string | null
  display_name: string
}
