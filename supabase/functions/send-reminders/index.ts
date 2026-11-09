// Fonction appelée toutes les heures par pg_cron.
// Pour chaque couple dont c'est l'heure de rappel (dans son fuseau), calcule
// s'il faut envoyer un rappel et l'envoie en Web Push aux deux partenaires.
//
// Appel avec un JWT utilisateur et {"test": true} : envoie une notification
// de test aux appareils de cet utilisateur (bouton dans les Réglages).

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { reminderFor, todayIn, type DayLog, type Reminder } from '../_shared/cycles.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sendToUsers(userIds: string[], payload: Reminder & { url?: string }) {
  const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds)
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...payload, url: payload.url ?? '/' }),
        { TTL: 60 * 60 * 12 },
      )
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      // Abonnement expiré ou révoqué : on le supprime.
      if (code === 404 || code === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      else console.error('push error', code, e)
    }
  }
  return sent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const body = await req.json().catch(() => ({}))

  // Notification de test déclenchée depuis l'app.
  if (body?.test) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const { data } = await supabase.auth.getUser(token)
    if (!data.user) return json({ error: 'unauthorized' }, 401)
    const sent = await sendToUsers([data.user.id], {
      kind: 'test',
      title: 'Notifications activées',
      body: 'Vous recevrez ici les rappels de cycle.',
    })
    return json({ sent })
  }

  // Appel planifié : protégé par un secret partagé avec pg_cron.
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'unauthorized' }, 401)

  const force = body?.force === true // pour tester sans attendre l'heure de rappel
  const { data: couples, error } = await supabase.from('couples').select('*')
  if (error) return json({ error: error.message }, 500)

  const report: unknown[] = []
  for (const c of couples ?? []) {
    const now = new Date()
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: c.time_zone, hour: 'numeric', hourCycle: 'h23' }).format(now))
    if (!force && hour !== c.reminder_hour) continue

    const today = todayIn(c.time_zone, now)
    const { data: already } = await supabase.from('reminder_log').select('kind').eq('couple_id', c.id).eq('day', today).maybeSingle()
    if (already) continue

    const { data: logs } = await supabase
      .from('day_logs')
      .select('day, flow, pain, symptoms, note')
      .eq('couple_id', c.id)
      .gte('day', new Date(now.getTime() - 400 * 86_400_000).toISOString().slice(0, 10))
    const reminder = reminderFor((logs ?? []) as DayLog[], today, c.default_cycle_length)
    if (!reminder) continue

    const { data: members } = await supabase.from('profiles').select('id').eq('couple_id', c.id)
    const sent = await sendToUsers((members ?? []).map((m) => m.id), { ...reminder, url: '/?log=today' })
    await supabase.from('reminder_log').insert({ couple_id: c.id, day: today, kind: reminder.kind })
    report.push({ couple: c.id, kind: reminder.kind, sent })
  }
  return json({ ok: true, report })
})
