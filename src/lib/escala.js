export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
export const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

const p2 = n => String(n).padStart(2, '0')
export const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
export const fmt = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
export const diasDoMes = (ano, mes) =>
  Array.from({ length: new Date(ano, mes + 1, 0).getDate() }, (_, i) => `${ano}-${p2(mes + 1)}-${p2(i + 1)}`)
export const diaSemana = iso => DIAS[new Date(iso + 'T12:00:00').getDay()]

// Ciclo 4x2: posições 0..3 = trabalho, 4..5 = folga
export function tipoDoDia(iso, ancoraIso, offset) {
  const ms = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  const dias = Math.round((ms(iso) - ms(ancoraIso)) / 86400000)
  return ((((dias + offset) % 6) + 6) % 6) < 4 ? 'T' : 'F'
}

export const TURNOS = {
  diurno: { nome: 'Diurno', horario: '07h às 19h' },
  noturno: { nome: 'Noturno', horario: '19h às 07h' }
}
