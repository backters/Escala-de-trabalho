const b64 = s => {
  const r = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...r].map(c => c.charCodeAt(0)))
}

export async function ativarPush(chavePublica) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw new Error('Este aparelho não suporta notificações. No iPhone, instale o app na Tela de Início primeiro.')
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('Permissão negada. Libere as notificações nas configurações do aparelho.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(chavePublica) }))
  return sub.toJSON() // { endpoint, keys: { p256dh, auth } }
}

export async function pararPush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}
