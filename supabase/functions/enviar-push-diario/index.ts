// Roda a cada 15 min (pg_cron). Envia o aviso a quem tem plantão hoje e cujo horário caiu nesta janela.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC')!, Deno.env.get('VAPID_PRIVATE')!)

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const janela = agora.getHours() * 60 + Math.floor(agora.getMinutes() / 15) * 15

  const { data: cfgs } = await sb.from('config_notificacao').select('analista_id,horario').eq('ativa', true)
  const ids = (cfgs ?? []).filter(c => {
    const [h, m] = c.horario.split(':').map(Number)
    const min = h * 60 + m
    return min >= janela && min < janela + 15
  }).map(c => c.analista_id)
  if (!ids.length) return new Response('nada a enviar')

  const { data: plant } = await sb.from('plantoes').select('analista_id').eq('data', hoje).eq('tipo', 'T').in('analista_id', ids)
  const alvo = (plant ?? []).map(p => p.analista_id)
  if (!alvo.length) return new Response('ninguém escalado')

  const { data: subs } = await sb.from('push_subscriptions').select('*').in('analista_id', alvo)
  const payload = JSON.stringify({ title: 'Escala SAME', body: 'Hoje você está escalado para o plantão noturno (19h às 07h)!' })
  let enviados = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      enviados++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await sb.from('push_subscriptions').delete().eq('id', s.id)
    }
  }
  return new Response(`enviados: ${enviados}`)
})
