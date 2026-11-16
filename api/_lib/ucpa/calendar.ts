// Une séance au format iCalendar (repris de « UCPA simplifié », lib/calendar.js). Aucun appel
// UCPA ni donnée du compte : iOS peut ouvrir le fichier dans Safari, hors de l'app et sans session.
import { UcpaError } from './client.js'

export const CENTRE = 'UCPA Sport Station Paris 19, 28 allée Rose Dieng-Kuntz, 75019 Paris'
// En ligne : iOS propose « Ajouter au calendrier » pour une page text/calendar, mais range une pièce jointe dans Fichiers.
export const calendarHeaders = { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="seance-ucpa.ics"' }

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '')
// Valeurs texte RFC 5545 : échappement, puis lignes repliées à 75 octets.
const text = (value: string) => value.replace(/[\;,]/g, (c) => `\\${c}`)
function fold(line: string) {
  const lines: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = Buffer.byteLength(char)
    if (size + bytes > 75) {
      lines.push(current)
      current = ' '
      size = 1
    }
    current += char
    size += bytes
  }
  return [...lines, current].join('\r\n')
}

export function calendarEvent({ id, name, start, end }: Record<string, string | undefined> = {}, now = Date.now()) {
  const from = Number(start)
  const to = Number(end)
  if (
    typeof id !== 'string' ||
    !/^[\x21-\x7e]{1,100}$/.test(id) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 120 ||
    /\p{Cc}/u.test(name) ||
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    to <= from ||
    to - from > 12 * 3600_000 ||
    from < now - 86400_000 ||
    from > now + 120 * 86400_000
  ) {
    throw new UcpaError('Séance invalide.', 400, 'BAD_REQUEST')
  }
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//A deux//UCPA//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${text(id)}-${from}@a-deux-ucpa`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(from)}`,
    `DTEND:${utc(to)}`,
    `SUMMARY:${text(`${name.trim()} · UCPA`)}`,
    `LOCATION:${text(CENTRE)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
    .map(fold)
    .join('\r\n')
}
