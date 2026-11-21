// Datas são guardadas como texto 'AAAA-MM-DD' (dia local) e meses como 'AAAA-MM'.
const pad = (n) => String(n).padStart(2, '0')

export const paraTexto = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hoje = () => paraTexto(new Date())
export const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return paraTexto(d) }

export const mesDe = (data) => data.slice(0, 7)
export const mesAtual = () => mesDe(hoje())

export const partes = (data) => data.split('-').map(Number) // [ano, mes, dia]
export const diasNoMes = (ano, mes) => new Date(ano, mes, 0).getDate()

// 'AAAA-MM-DD' de um dia que existe de verdade (rejeita 2026-02-30, 2026-13-01 etc.)
export function dataValida(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const [a, m, d] = partes(data)
  return a >= 1900 && a <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= diasNoMes(a, m)
}

export function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

// Mesmo dia N meses depois (31/01 + 1 mês = 28 ou 29/02)
export function somarMesesData(data, n) {
  const [, , dia] = partes(data)
  const mes = somarMeses(mesDe(data), n)
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${pad(Math.min(dia, diasNoMes(a, m)))}`
}

// Dia do mês, limitado ao último dia (ex.: dia 31 em fevereiro vira 28)
export function dataNoMes(mes, dia) {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${pad(Math.min(dia, diasNoMes(a, m)))}`
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function nomeMes(mes, curto = false) {
  const [a, m] = mes.split('-').map(Number)
  const nome = (curto ? MESES_CURTOS : MESES)[m - 1]
  return a === new Date().getFullYear() ? nome : `${nome} ${curto ? String(a).slice(2) : a}`
}

export function dataCurta(data) {
  const [, m, d] = partes(data)
  return `${pad(d)}/${MESES_CURTOS[m - 1]}`
}

export function rotuloDia(data) {
  if (data === hoje()) return 'Hoje'
  if (data === ontem()) return 'Ontem'
  const [a, m, d] = partes(data)
  const sem = DIAS_SEMANA[new Date(a, m - 1, d).getDay()]
  return `${sem}, ${d} de ${MESES[m - 1]}`
}
