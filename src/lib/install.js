// Guarda o evento de instalação do navegador (ele dispara uma única vez, logo no carregamento)
let evento = null
let instalou = false
const ouvintes = new Set()
const avisar = () => ouvintes.forEach(f => f())

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evento = e; avisar() })
window.addEventListener('appinstalled', () => { evento = null; instalou = true; avisar() })

export const podeInstalar = () => !!evento
export const foiInstalado = () => instalou
export const assinar = f => { ouvintes.add(f); return () => ouvintes.delete(f) }

export async function instalar() {
  if (!evento) return null
  evento.prompt()
  const { outcome } = await evento.userChoice
  evento = null
  avisar()
  return outcome
}
