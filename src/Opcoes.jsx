import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { ativarPush, pararPush } from './lib/push'
import AdminLogin from './AdminLogin'
import { assinar, podeInstalar, instalar, foiInstalado } from './lib/install'

const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone

function InstalarApp() {
  const [, atualizar] = useState(0)
  const [guia, setGuia] = useState(ios)
  useEffect(() => assinar(() => atualizar(n => n + 1)), [])

  if (instalado || foiInstalado())
    return <div className="card"><p className="font-semibold">✅ App instalado neste aparelho.</p></div>

  const direto = podeInstalar()
  return (
    <div className="card space-y-3">
      <h2 className="font-extrabold">📲 Instalar o app</h2>
      <p className="text-sm text-slate-300">Adicione à tela inicial para abrir em tela cheia e receber as notificações.</p>
      <button className="btn w-full" onClick={() => (direto ? instalar() : setGuia(!guia))}>
        {direto ? 'Instalar app' : 'Como instalar'}
      </button>
      {guia && (ios ? (
        <ol className="text-sm text-slate-200 list-decimal pl-5 space-y-1">
          <li>Abra este endereço no <b>Safari</b> (o Chrome do iPhone não instala).</li>
          <li>Toque em <b>Compartilhar</b> (quadrado com seta para cima).</li>
          <li>Toque em <b>Adicionar à Tela de Início</b>.</li>
          <li>Deixe <b>Abrir como app web</b> ligado e toque em <b>Adicionar</b>.</li>
          <li>Abra o app <b>pelo ícone</b> na tela inicial.</li>
        </ol>
      ) : (
        <ol className="text-sm text-slate-200 list-decimal pl-5 space-y-1">
          <li>No <b>Chrome</b>, toque no menu <b>⋮</b> (canto superior direito).</li>
          <li>Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
          <li>Confirme em <b>Instalar</b>.</li>
        </ol>
      ))}
    </div>
  )
}

function Notificacoes({ eu }) {
  const [ativa, setAtiva] = useState(false)
  const [horario, setHorario] = useState('15:00')
  const [msg, setMsg] = useState('')
  const args = { p_id: eu.id, p_pin: eu.pin }

  useEffect(() => {
    supabase.rpc('obter_config', args).then(({ data }) => { if (data) { setAtiva(data.ativa); setHorario(data.horario.slice(0, 5)) } })
  }, [])

  async function salvar(novaAtiva, novoHorario) {
    try {
      let sub = {}
      if (novaAtiva && novaAtiva !== ativa) { const s = await ativarPush(import.meta.env.VITE_VAPID_PUBLIC_KEY); sub = { p_endpoint: s.endpoint, p_p256dh: s.keys.p256dh, p_auth: s.keys.auth } }
      if (!novaAtiva) { const ep = await pararPush(); if (ep) sub = { p_endpoint: ep } }
      const { error } = await supabase.rpc('salvar_config', { ...args, p_ativa: novaAtiva, p_horario: novoHorario, ...sub })
      if (error) throw error
      setAtiva(novaAtiva); setHorario(novoHorario); setMsg('✅ Configuração salva')
    } catch (e) { setMsg('❌ ' + e.message) }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-extrabold">Notificação diária</h2>
      {ios && !instalado && <p className="text-xs text-amber-300">No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Só assim as notificações funcionam.</p>}
      <label className="flex items-center justify-between">
        <span>Avisar nos dias de plantão</span>
        <button role="switch" aria-checked={ativa} onClick={() => salvar(!ativa, horario)}
          className={`w-14 h-8 rounded-full p-1 transition ${ativa ? 'bg-emerald-500' : 'bg-slate-600'}`}>
          <span className={`block w-6 h-6 rounded-full bg-white transition ${ativa ? 'translate-x-6' : ''}`} />
        </button>
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>Horário do aviso</span>
        <input type="time" className="inp !w-auto" value={horario} disabled={!ativa}
          onChange={e => e.target.value && salvar(true, e.target.value)} />
      </label>
      <p className="text-xs text-slate-400">Mensagem: “Hoje você está escalado para o plantão noturno (19h às 07h)!”</p>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}

function AdminPanel({ analistas, recarregar }) {
  const [nome, setNome] = useState('')
  const [offset, setOffset] = useState(0)
  const [msg, setMsg] = useState('')
  const rodar = async (p, ok) => { const { error } = await p; setMsg(error ? '❌ ' + error.message : ok); recarregar() }

  return (
    <div className="card space-y-3">
      <h2 className="font-extrabold">Analistas</h2>
      {analistas.map(a => (
        <div key={a.id} className="flex items-center justify-between text-sm gap-2">
          <span><b>{a.nome}</b> <span className="text-slate-400">(offset {a.offset_ciclo})</span></span>
          <span className="flex gap-2">
            <button className="btn-sec !py-1 !px-2 text-xs" onClick={() => confirm(`Resetar o PIN de ${a.nome}?`) && rodar(supabase.from('analistas').update({ pin_hash: null }).eq('id', a.id), 'PIN resetado')}>Resetar PIN</button>
            <button className="btn-sec !py-1 !px-2 text-xs" onClick={() => confirm(`Desativar ${a.nome}?`) && rodar(supabase.from('analistas').update({ ativo: false }).eq('id', a.id), 'Analista desativado')}>Desativar</button>
          </span>
        </div>
      ))}
      <form className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--linha)' }}
        onSubmit={e => { e.preventDefault(); rodar(supabase.from('analistas').insert({ nome, offset_ciclo: +offset }), 'Analista cadastrado. Use “Gerar dias faltantes” na Escala.'); setNome('') }}>
        <input className="inp" placeholder="Nome do novo analista" value={nome} onChange={e => setNome(e.target.value)} required />
        <label className="text-xs text-slate-400 block">Posição no ciclo em 07/10/2026 (0–3 trabalho, 4–5 folga)</label>
        <select className="inp" value={offset} onChange={e => setOffset(e.target.value)}>{[0, 1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>
        <button className="btn w-full">Cadastrar analista</button>
      </form>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}

export default function Opcoes({ eu, admin, analistas, recarregar, sair }) {
  return (
    <div className="space-y-4">
      <InstalarApp />
      {eu && <Notificacoes eu={eu} />}
      {admin ? <AdminPanel analistas={analistas} recarregar={recarregar} /> : <AdminLogin />}
      <button className="btn-sec w-full" onClick={sair}>Sair {eu ? `(${eu.nome})` : ''}</button>
    </div>
  )
}
