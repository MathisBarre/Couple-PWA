import { toDate } from '../../supabase/functions/_shared/cycles'

/** Date du jour de l'appareil (YYYY-MM-DD, heure locale). */
export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts })
const long = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const short = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const dm = fmt({ day: 'numeric', month: 'short' })
const month = fmt({ month: 'long', year: 'numeric' })

export const formatLong = (day: string) => long.format(toDate(day))
export const formatShort = (day: string) => short.format(toDate(day))
export const formatDM = (day: string) => dm.format(toDate(day))
export const formatMonth = (day: string) => month.format(toDate(day))
