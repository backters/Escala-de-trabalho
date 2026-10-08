import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { MESES, diasDoMes, hojeISO, tipoDoDia, fmt, diaSemana } from './lib/escala'

function Editor({ sel, atual, onSave, onClose }) {
  const [tipo, setTipo] = useState(atual?.tipo || 'T')
  const [obs, setObs] = useState(atual?.observacao || '')
  return (
    <div className="fixed inset-0 z-30 bg-black/60 grid place-items-end sm:place-items-center" onClick={onClose}>
      <div className="card w-full max-w-sm space-y-3 rounded-b-none sm:rounded-b-2xl" onClick={e => e.stopPropagation()}>
        <p className="font-bold">{sel.a.nome} · {fmt(sel.d)} ({diaSemana(sel.d)})</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTipo('T')} className={`rounded-xl py-3 font-bold ${tipo === 'T' ? 'bg-blue-500 ring-2 ring-white' : 'bg-blue-500/30'}`}>Trabalho (T)</button>
          <button onClick={() => setTipo('F')} className={`rounded-xl py-3 font-bold ${tipo === 'F' ? 'bg-amber-300 text-slate-900 ring-2 ring-white' : 'bg-amber-300/30'}`}>Folga (F)</button>
        </div>
        <input className="inp" placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-sec" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={() => onSave(tipo, obs)}>Salvar alteração</button>
        </div>
      </div>
    </div>
  )
}

export default function Grid({ analistas, admin }) {
  const hoje = hojeISO()
  const [ano, setAno] = useState(+hoje.slice(0, 4))
  const [mes, setMes] = useState(+hoje.slice(5, 7) - 1)
  const [pl, setPl] = useState({})
  const [edit, setEdit] = useState(false)
  const [sel, setSel] = useState(null)
  const [msg, setMsg] = useState('')
  const dias = diasDoMes(ano, mes)

  const carregar = useCallback(async () => {
    const d = diasDoMes(ano, mes)
    const { data } = await supabase.from('plantoes').select('analista_id,data,tipo,observacao,origem_troca')
      .gte('data', d[0]).lte('data', d[d.length - 1])
    const m = {}
    ;(data || []).forEach(r => { m[r.analista_id + '|' + r.data] = r })
    setPl(m)
  }, [ano, mes])

  useEffect(() => {
    carregar()
    const ch = supabase.channel(`pl-${ano}-${mes}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plantoes' }, carregar).subscribe()
    return () => supabase.removeChannel(ch)
  }, [carregar, ano, mes])

  const aviso = t => { setMsg(t); setTimeout(() => setMsg(''), 3000) }
  const mover = n => {
    let m = mes + n, a = ano
    if (m < 0) { m = 11; a-- } else if (m > 11) { m = 0; a++ }
    setMes(m); setAno(a)
  }

  async function salvar(tipo, obs) {
    const old = pl[sel.a.id + '|' + sel.d]
    const { error } = await supabase.from('plantoes').upsert({
      analista_id: sel.a.id, data: sel.d, tipo, observacao: obs || null,
      origem_troca: old && old.tipo !== tipo ? null : old?.origem_troca ?? null,
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'analista_id,data' })
    aviso(error ? '❌ ' + error.message : '✅ Alteração salva')
    setSel(null); carregar()
  }

  async function gerar(sobrescrever) {
    if (sobrescrever && !confirm(`Redefinir ${MESES[mes]} para o ciclo 4x2? Trocas e edições manuais do mês serão perdidas.`)) return
    const { data: c } = await supabase.from('config_escala').select('valor').eq('chave', 'data_ancora').single()
    const rows = analistas.flatMap(a => dias.map(d => ({ analista_id: a.id, data: d, tipo: tipoDoDia(d, c.valor, a.offset_ciclo), observacao: null, origem_troca: null })))
    const { error } = await supabase.from('plantoes').upsert(rows, { onConflict: 'analista_id,data', ignoreDuplicates: !sobrescrever })
    aviso(error ? '❌ ' + error.message : sobrescrever ? '✅ Mês redefinido' : '✅ Dias faltantes gerados')
    carregar()
  }

  const hojeLinhas = analistas.filter(a => pl[a.id + '|' + hoje])
  const anos = [ano - 1, ano, ano + 1]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-sec" onClick={() => mover(-1)} aria-label="Mês anterior">‹</button>
        <select className="inp !py-2 flex-1" value={mes} onChange={e => setMes(+e.target.value)}>
          {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select className="inp !py-2 !w-24" value={ano} onChange={e => setAno(+e.target.value)}>
          {anos.map(a => <option key={a}>{a}</option>)}
        </select>
        <button className="btn-sec" onClick={() => mover(1)} aria-label="Próximo mês">›</button>
      </div>

      {hojeLinhas.length > 0 && (
        <div className="card text-sm">
          <b>Hoje ({fmt(hoje)}):</b>{' '}
          <span className="text-blue-300">trabalham {hojeLinhas.filter(a => pl[a.id + '|' + hoje].tipo === 'T').map(a => a.nome).join(', ') || '—'}</span>
          {' · '}
          <span className="text-amber-300">folga {hojeLinhas.filter(a => pl[a.id + '|' + hoje].tipo === 'F').map(a => a.nome).join(', ') || '—'}</span>
        </div>
      )}

      <div className="flex gap-3 text-xs text-slate-300 flex-wrap">
        <span><i className="inline-block w-3 h-3 rounded bg-blue-500 align-middle" /> Trabalho</span>
        <span><i className="inline-block w-3 h-3 rounded bg-amber-300 align-middle" /> Folga</span>
        <span><i className="inline-block w-3 h-3 rounded bg-emerald-500 align-middle" /> Troca casada</span>
      </div>

      <div className="card !p-0 overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-24" style={{ background: 'var(--painel)' }} />
              {dias.map(d => (
                <th key={d} className={`text-[10px] font-semibold rounded-md px-1 py-1 ${d === hoje ? 'hoje-col text-amber-200' : 'text-slate-400'}`}>
                  <div>{diaSemana(d)}</div><div className="text-sm">{+d.slice(8)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analistas.map(a => (
              <tr key={a.id}>
                <td className="sticky left-0 z-10 px-3 text-sm font-bold whitespace-nowrap" style={{ background: 'var(--painel)' }}>{a.nome}</td>
                {dias.map(d => {
                  const r = pl[a.id + '|' + d]
                  const cor = !r ? 'bg-slate-800 text-slate-500' : r.origem_troca ? 'bg-emerald-500 text-white'
                    : r.tipo === 'T' ? 'bg-blue-500 text-white' : 'bg-amber-300 text-slate-900'
                  return (
                    <td key={d}>
                      <button disabled={!(admin && edit)} onClick={() => setSel({ a, d })} title={r?.observacao || ''}
                        className={`relative w-10 h-10 rounded-lg text-sm font-extrabold ${cor} ${d === hoje ? 'hoje-col' : ''} ${admin && edit ? 'ring-1 ring-white/40' : ''}`}>
                        {r ? r.tipo : '–'}
                        {r?.observacao && <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-white" />}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {admin && (
        <div className="card space-y-3">
          <label className="flex items-center justify-between font-semibold">
            Modo edição
            <button role="switch" aria-checked={edit} onClick={() => setEdit(!edit)}
              className={`w-14 h-8 rounded-full p-1 transition ${edit ? 'bg-emerald-500' : 'bg-slate-600'}`}>
              <span className={`block w-6 h-6 rounded-full bg-white transition ${edit ? 'translate-x-6' : ''}`} />
            </button>
          </label>
          {edit && <p className="text-xs text-slate-400">Toque em qualquer célula para alternar T/F ou adicionar observação.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-sec text-sm" onClick={() => gerar(false)}>Gerar dias faltantes</button>
            <button className="btn-sec text-sm" onClick={() => gerar(true)}>Redefinir mês pelo ciclo</button>
          </div>
        </div>
      )}
      {msg && <div className="fixed bottom-24 inset-x-0 mx-auto w-fit card !py-2 z-40 text-sm">{msg}</div>}
      {sel && <Editor sel={sel} atual={pl[sel.a.id + '|' + sel.d]} onSave={salvar} onClose={() => setSel(null)} />}
    </div>
  )
}
