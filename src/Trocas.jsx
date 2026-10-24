import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { fmt, hojeISO, diaSemana } from './lib/escala'

const COR = { pendente: 'bg-amber-400/20 text-amber-200', aceito: 'bg-emerald-500/20 text-emerald-200', recusado: 'bg-red-500/20 text-red-200', cancelado: 'bg-slate-500/30 text-slate-300' }
const dt = s => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

export default function Trocas({ eu, analistas, admin }) {
  const hoje = hojeISO()
  const [trocas, setTrocas] = useState([])
  const [pl, setPl] = useState([])
  const [dest, setDest] = useState('')
  const [dsol, setDsol] = useState('')
  const [ddest, setDdest] = useState('')
  const [msg, setMsg] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [form, setForm] = useState(null)

  const carregar = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from('trocas').select('*').order('criado_em', { ascending: false }),
      supabase.from('plantoes').select('analista_id,data,tipo').gte('data', hoje)
    ])
    setTrocas(t.data || []); setPl(p.data || [])
  }, [hoje])

  useEffect(() => {
    carregar()
    const ch = supabase.channel('trocas-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trocas' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plantoes' }, carregar).subscribe()
    return () => supabase.removeChannel(ch)
  }, [carregar])

  // Painel do administrador: vê todas as trocas do turno e pode aprovar, recusar, cancelar ou desfazer
  if (admin) {
    const nomeA = id => analistas.find(a => a.id === id)?.nome || '?'
    const doTurno = trocas.filter(t => analistas.some(a => a.id === t.solicitante_id))
    const lista = doTurno.filter(t => filtro === 'todas' || t.status === filtro)
    const agir = async (t, acao, pergunta) => {
      if (pergunta && !confirm(pergunta)) return
      const { error } = await supabase.rpc('admin_gerenciar_troca', { p_troca: t.id, p_acao: acao })
      setMsg(error ? '❌ ' + error.message : '✅ Troca atualizada')
      setTimeout(() => setMsg(''), 4000)
      carregar()
    }
    // Troca direta: o admin define as datas e a escala muda na hora, sem aceite das analistas
    const tp = (id, d) => pl.find(r => r.analista_id === id && r.data === d)?.tipo
    const tipoBase = (id, d) => {
      const e = form?.editar
      if (e && e.status === 'aceito') {  // simula a escala sem a troca antiga
        if (id === e.solicitante_id && d === e.data_solicitante) return 'T'
        if (id === e.solicitante_id && d === e.data_destinatario) return 'F'
        if (id === e.destinatario_id && d === e.data_solicitante) return 'F'
        if (id === e.destinatario_id && d === e.data_destinatario) return 'T'
      }
      return tp(id, d)
    }
    const datasF = [...new Set([...pl.map(r => r.data), ...(form?.editar ? [form.editar.data_solicitante, form.editar.data_destinatario] : [])])].sort()
    const ok = form?.sol && form?.dest
    const opSol = ok ? datasF.filter(d => tipoBase(form.sol, d) === 'T' && tipoBase(form.dest, d) === 'F') : []
    const opDest = ok ? datasF.filter(d => tipoBase(form.sol, d) === 'F' && tipoBase(form.dest, d) === 'T') : []
    const opt = d => <option key={d} value={d}>{fmt(d)} ({diaSemana(d)})</option>
    const aplicar = async () => {
      const { error } = await supabase.rpc('admin_trocar_direto', {
        p_sol: form.sol, p_dest: form.dest, p_dsol: form.dsol, p_ddest: form.ddest, p_editar: form.editar?.id ?? null })
      setMsg(error ? '❌ ' + error.message : '✅ Troca aplicada na escala')
      setTimeout(() => setMsg(''), 4000)
      if (!error) setForm(null)
      carregar()
    }

    return (
      <div className="space-y-3">
        <h2 className="font-extrabold">Trocas do turno ({doTurno.filter(t => t.status === 'pendente').length} pendentes)</h2>
        {!form && <button className="btn w-full" onClick={() => setForm({ sol: '', dest: '', dsol: '', ddest: '', editar: null })}>➕ Nova troca direta</button>}
        {form && (
          <div className="card space-y-3 border-amber-300/60">
            <p className="font-bold">{form.editar ? 'Editar datas da troca' : 'Nova troca direta'}</p>
            <p className="text-xs text-slate-400">Aplicada na hora na escala, sem precisar do aceite das analistas.</p>
            <select className="inp" value={form.sol} disabled={!!form.editar} onChange={e => setForm({ ...form, sol: e.target.value, dest: '', dsol: '', ddest: '' })}>
              <option value="">Analista que vai folgar…</option>
              {analistas.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <select className="inp" value={form.dest} disabled={!!form.editar || !form.sol} onChange={e => setForm({ ...form, dest: e.target.value, dsol: '', ddest: '' })}>
              <option value="">Troca com…</option>
              {analistas.filter(a => a.id !== form.sol).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            <select className="inp" value={form.dsol} disabled={!ok} onChange={e => setForm({ ...form, dsol: e.target.value })}>
              <option value="">Dia em que {ok ? nomeA(form.sol) : 'ela'} folga (hoje trabalha)</option>{opSol.map(opt)}
            </select>
            <select className="inp" value={form.ddest} disabled={!ok} onChange={e => setForm({ ...form, ddest: e.target.value })}>
              <option value="">Dia em que {ok ? nomeA(form.sol) : 'ela'} trabalha (hoje folga)</option>{opDest.map(opt)}
            </select>
            {ok && (!opSol.length || !opDest.length) && <p className="text-xs text-amber-300">Não há datas compatíveis entre as duas nos dias cadastrados.</p>}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-sec" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn" disabled={!ok || !form.dsol || !form.ddest} onClick={aplicar}>Aplicar troca</button>
            </div>
          </div>
        )}
        <select className="inp !py-2" value={filtro} onChange={e => setFiltro(e.target.value)}>
          {['todas', 'pendente', 'aceito', 'recusado', 'cancelado'].map(s => <option key={s} value={s}>{s === 'todas' ? 'Todas' : s}</option>)}
        </select>
        {lista.length === 0 && <p className="text-slate-400 text-sm">Nenhuma troca encontrada.</p>}
        {lista.map(t => (
          <div key={t.id} className="card !p-3 text-sm space-y-2">
            <div className="flex justify-between items-center">
              <b>{nomeA(t.solicitante_id)} → {nomeA(t.destinatario_id)}</b>
              <span className={`rounded-full px-2 py-0.5 text-xs ${COR[t.status]}`}>{t.status}</span>
            </div>
            <p className="text-slate-300">{nomeA(t.solicitante_id)} folga {fmt(t.data_solicitante)} · {nomeA(t.destinatario_id)} folga {fmt(t.data_destinatario)}</p>
            <p className="text-xs text-slate-400">Pedido em {dt(t.criado_em)}{t.respondido_em && ` · respondido em ${dt(t.respondido_em)}`}</p>
            <div className="flex gap-2 flex-wrap">
              {t.status === 'pendente' && <>
                <button className="btn !py-1 !px-3 text-xs" onClick={() => agir(t, 'aceitar', 'Aprovar e aplicar esta troca na escala?')}>Aprovar</button>
                <button className="btn-sec !py-1 !px-3 text-xs" onClick={() => agir(t, 'recusar')}>Recusar</button>
                <button className="btn-sec !py-1 !px-3 text-xs" onClick={() => agir(t, 'cancelar', 'Cancelar este pedido?')}>Cancelar</button>
              </>}
              {t.status === 'aceito' &&
                <button className="btn-sec !py-1 !px-3 text-xs" onClick={() => agir(t, 'desfazer', 'Desfazer a troca? A escala volta ao que era antes.')}>Desfazer troca</button>}
              {(t.status === 'pendente' || t.status === 'aceito') &&
                <button className="btn-sec !py-1 !px-3 text-xs" onClick={() => setForm({ sol: t.solicitante_id, dest: t.destinatario_id, dsol: t.data_solicitante, ddest: t.data_destinatario, editar: t })}>Editar datas</button>}
            </div>
          </div>
        ))}
        {msg && <div className="fixed bottom-24 inset-x-0 mx-auto w-fit max-w-[90%] card !py-2 z-40 text-sm">{msg}</div>}
      </div>
    )
  }

  if (!eu) return <p className="card text-slate-300">Entre como analista para solicitar ou responder trocas.</p>

  const nome = id => analistas.find(a => a.id === id)?.nome || '?'
  const tipo = (id, d) => pl.find(r => r.analista_id === id && r.data === d)?.tipo
  const minhas = trocas.filter(t => analistas.some(a => a.id === t.solicitante_id))
  const datas = [...new Set(pl.map(r => r.data))].sort()
  // A trabalha em dsol e folga em ddest; B folga em dsol e trabalha em ddest
  const opSol = dest ? datas.filter(d => tipo(eu.id, d) === 'T' && tipo(dest, d) === 'F') : []
  const opDest = dest ? datas.filter(d => tipo(eu.id, d) === 'F' && tipo(dest, d) === 'T') : []
  const recebidas = minhas.filter(t => t.destinatario_id === eu.id && t.status === 'pendente')
  const aviso = t => { setMsg(t); setTimeout(() => setMsg(''), 4000) }

  async function rpc(fn, args, ok) {
    const { error } = await supabase.rpc(fn, { p_id: eu.id, p_pin: eu.pin, ...args })
    aviso(error ? '❌ ' + error.message : ok)
    carregar()
    return !error
  }

  async function solicitar(e) {
    e.preventDefault()
    if (await rpc('solicitar_troca', { p_dest: dest, p_dsol: dsol, p_ddest: ddest }, '✅ Pedido enviado')) { setDsol(''); setDdest('') }
  }

  const opt = d => <option key={d} value={d}>{fmt(d)} ({diaSemana(d)})</option>

  return (
    <div className="space-y-4">
      {recebidas.map(t => (
        <div key={t.id} className="card border-amber-300/60 space-y-3">
          <p>🔔 <b>{nome(t.solicitante_id)}</b> solicitou uma troca casada para o dia <b>{fmt(t.data_solicitante)}</b> em troca do dia <b>{fmt(t.data_destinatario)}</b>. Aceitar?</p>
          <p className="text-xs text-slate-400">Se aceitar, você trabalha em {fmt(t.data_solicitante)} e folga em {fmt(t.data_destinatario)}.</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sec" onClick={() => rpc('responder_troca', { p_troca: t.id, p_aceitar: false }, 'Troca recusada')}>Recusar</button>
            <button className="btn" onClick={() => rpc('responder_troca', { p_troca: t.id, p_aceitar: true }, '✅ Troca aceita, escala atualizada')}>Aceitar</button>
          </div>
        </div>
      ))}

      <form onSubmit={solicitar} className="card space-y-3">
        <h2 className="font-extrabold">Solicitar troca casada</h2>
        <select className="inp" value={dest} onChange={e => { setDest(e.target.value); setDsol(''); setDdest('') }} required>
          <option value="">Trocar com…</option>
          {analistas.filter(a => a.id !== eu.id).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <select className="inp" value={dsol} onChange={e => setDsol(e.target.value)} required disabled={!dest}>
          <option value="">Dia que quero folgar (hoje trabalho)</option>{opSol.map(opt)}
        </select>
        <select className="inp" value={ddest} onChange={e => setDdest(e.target.value)} required disabled={!dest}>
          <option value="">Dia que ofereço trabalhar (hoje folgo)</option>{opDest.map(opt)}
        </select>
        {dest && (!opSol.length || !opDest.length) && <p className="text-xs text-amber-300">Não há datas compatíveis com {nome(dest)} nos dias já cadastrados.</p>}
        <button className="btn w-full" disabled={!dest || !dsol || !ddest}>Enviar pedido</button>
      </form>

      <section className="space-y-2">
        <h2 className="font-extrabold">Histórico de trocas</h2>
        {minhas.length === 0 && <p className="text-slate-400 text-sm">Nenhuma troca registrada ainda. Use o formulário acima para pedir a primeira.</p>}
        {minhas.map(t => (
          <div key={t.id} className="card !p-3 text-sm space-y-1">
            <div className="flex justify-between items-center">
              <b>{nome(t.solicitante_id)} → {nome(t.destinatario_id)}</b>
              <span className={`rounded-full px-2 py-0.5 text-xs ${COR[t.status]}`}>{t.status}</span>
            </div>
            <p className="text-slate-300">{nome(t.solicitante_id)} folga {fmt(t.data_solicitante)} · {nome(t.destinatario_id)} folga {fmt(t.data_destinatario)}</p>
            <p className="text-xs text-slate-400">Pedido em {dt(t.criado_em)}{t.status === 'aceito' && ` · aceito em ${dt(t.respondido_em)}`}</p>
            {t.status === 'pendente' && t.solicitante_id === eu.id &&
              <button className="text-xs underline text-slate-300" onClick={() => rpc('cancelar_troca', { p_troca: t.id }, 'Pedido cancelado')}>Cancelar pedido</button>}
          </div>
        ))}
      </section>
      {msg && <div className="fixed bottom-24 inset-x-0 mx-auto w-fit max-w-[90%] card !py-2 z-40 text-sm">{msg}</div>}
    </div>
  )
}
