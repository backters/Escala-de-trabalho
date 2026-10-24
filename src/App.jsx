import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { TURNOS } from './lib/escala'
import Grid from './Grid'
import Trocas from './Trocas'
import Opcoes from './Opcoes'
import AdminLogin from './AdminLogin'

function Login({ analistas, onEu }) {
  const [turno, setTurno] = useState('')
  const [id, setId] = useState('')
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [adm, setAdm] = useState(false)
  const a = analistas.find(x => x.id === id)
  const lista = analistas.filter(x => x.turno === turno)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    const { data, error } = await supabase.rpc('login_analista', { p_id: id, p_pin: pin })
    if (error || !data) return setErro('PIN incorreto. Use 4 números.')
    const eu = { id, nome: a.nome, pin }
    localStorage.setItem('eu', JSON.stringify(eu))
    onEu(eu)
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="text-5xl">🌙</div>
          <h1 className="text-2xl font-extrabold mt-2">Escala 4X2 SAME</h1>
          <p className="text-slate-400 text-sm">Diurno e Noturno</p>
        </div>
        {adm ? <AdminLogin /> : (
          <form onSubmit={entrar} className="card space-y-3">
            <select className="inp" value={turno} onChange={e => { setTurno(e.target.value); setId('') }} required>
              <option value="">Selecione o turno</option>
              {Object.entries(TURNOS).map(([k, t]) => <option key={k} value={k}>{t.nome} ({t.horario})</option>)}
            </select>
            <select className="inp" value={id} onChange={e => setId(e.target.value)} required disabled={!turno}>
              <option value="">Quem é você?</option>
              {lista.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <input className="inp" type="password" inputMode="numeric" maxLength={4} required
              placeholder={a && !a.tem_pin ? 'Primeiro acesso: crie um PIN de 4 números' : 'PIN de 4 números'}
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
            {erro && <p className="text-red-400 text-sm">{erro}</p>}
            <button className="btn w-full" disabled={!id || pin.length !== 4}>Entrar</button>
          </form>
        )}
        <button className="text-sm text-slate-400 underline w-full" onClick={() => setAdm(!adm)}>
          {adm ? 'Voltar ao acesso de analista' : 'Acesso do administrador'}
        </button>
      </div>
    </main>
  )
}

export default function App() {
  const [aba, setAba] = useState('escala')
  const [eu, setEu] = useState(() => { try { return JSON.parse(localStorage.getItem('eu')) } catch { return null } })
  const [admin, setAdmin] = useState(false)
  const [analistas, setAnalistas] = useState([])
  const [pend, setPend] = useState(0)
  const [turnoAdm, setTurnoAdm] = useState('noturno')

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('analistas').select('id,nome,offset_ciclo,tem_pin,turno').eq('ativo', true).order('nome')
    setAnalistas(data || [])
  }, [])

  const checarAdmin = async s => {
    if (!s) return setAdmin(false)
    const { data } = await supabase.from('admins').select('user_id').maybeSingle()
    setAdmin(!!data)
  }

  useEffect(() => {
    carregar()
    supabase.auth.getSession().then(({ data }) => checarAdmin(data.session))
    const { data: l } = supabase.auth.onAuthStateChange((_, s) => setTimeout(() => checarAdmin(s), 0))
    return () => l.subscription.unsubscribe()
  }, [carregar])

  const contar = useCallback(async () => {
    if (!eu) return
    const { count } = await supabase.from('trocas').select('id', { count: 'exact', head: true })
      .eq('destinatario_id', eu.id).eq('status', 'pendente')
    setPend(count || 0)
  }, [eu])

  useEffect(() => {
    contar()
    const ch = supabase.channel('badge-trocas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trocas' }, contar).subscribe()
    return () => supabase.removeChannel(ch)
  }, [contar])

  const sair = () => { localStorage.removeItem('eu'); setEu(null); supabase.auth.signOut() }

  if (!eu && !admin) return <Login analistas={analistas} onEu={setEu} />

  const turno = admin ? turnoAdm : analistas.find(a => a.id === eu?.id)?.turno || 'noturno'
  const visiveis = analistas.filter(a => a.turno === turno)
  const T = TURNOS[turno]
  const abas = [['escala', '📅', 'Escala'], ['trocas', '🔄', 'Trocas'], ['opcoes', '⚙️', 'Opções']]
  return (
    <div className="max-w-3xl mx-auto pb-24">
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between backdrop-blur"
        style={{ background: '#0b1220ee', borderBottom: '1px solid var(--linha)' }}>
        <div>
          <h1 className="font-extrabold leading-tight">Escala 4X2 SAME {T.nome}</h1>
          <p className="text-xs text-slate-400">{T.horario}</p>
        </div>
        <span className="text-xs rounded-full px-3 py-1 bg-blue-500/20 text-blue-200">
          {admin ? '🔐 Admin' : eu?.nome}
        </span>
      </header>

      <main className="p-3">
        {admin && (
          <select className="inp !py-2 mb-3" value={turnoAdm} onChange={e => setTurnoAdm(e.target.value)}>
            {Object.entries(TURNOS).map(([k, t]) => <option key={k} value={k}>Turno {t.nome} ({t.horario})</option>)}
          </select>
        )}
        {aba === 'escala' && <Grid analistas={visiveis} admin={admin} eu={eu} />}
        {aba === 'trocas' && <Trocas eu={eu} analistas={visiveis} admin={admin} />}
        {aba === 'opcoes' && <Opcoes eu={eu} admin={admin} analistas={analistas} recarregar={carregar} sair={sair} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-20 flex justify-around py-2"
        style={{ background: '#0b1220f5', borderTop: '1px solid var(--linha)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
        {abas.map(([k, ic, nome]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`relative flex flex-col items-center px-6 py-1 text-xs ${aba === k ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
            <span className="text-xl">{ic}</span>{nome}
            {k === 'trocas' && pend > 0 &&
              <span className="absolute top-0 right-3 bg-red-500 text-white rounded-full text-[10px] w-5 h-5 grid place-items-center">{pend}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
