import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')

  async function entrar(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setErro(error ? 'Usuário ou senha inválidos.' : '')
  }

  return (
    <form onSubmit={entrar} className="card space-y-3">
      <p className="font-bold">🔐 Acesso do administrador</p>
      <input className="inp" type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />
      <input className="inp" type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} required />
      {erro && <p className="text-red-400 text-sm">{erro}</p>}
      <button className="btn w-full">Entrar como admin</button>
    </form>
  )
}
