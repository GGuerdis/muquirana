// Números da tela de Histórico: evolução por ano/mês/dia e comparações.
// Visão de CAIXA (o dinheiro que entrou e saiu das contas):
//  - uma conta: receitas e transferências recebidas entram; despesas à vista, transferências enviadas
//    e pagamentos de fatura saem;
//  - todas as contas: transferências entre as suas contas não contam (o dinheiro não saiu de você).
import { diasNoMes, somarMeses } from './datas.js'

const pad = (n) => String(n).padStart(2, '0')
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function movimentos(lancamentos, contaId = null) {
  const lista = []
  for (const l of lancamentos) {
    let entrada = 0, saida = 0
    if (contaId != null) {
      if (l.tipo === 'receita' && l.contaId === contaId) entrada = l.valor
      else if (l.tipo === 'despesa' && l.contaId === contaId && !l.cartaoId) saida = l.valor
      else if (l.tipo === 'transferencia') {
        if (l.contaDestinoId === contaId) entrada = l.valor
        if (l.contaId === contaId) saida = l.valor
      } else if (l.tipo === 'pagamentoFatura' && l.contaId === contaId) saida = l.valor
    } else if (l.tipo === 'receita') entrada = l.valor
    else if (l.tipo === 'despesa' && !l.cartaoId) saida = l.valor
    else if (l.tipo === 'pagamentoFatura') saida = l.valor
    if (entrada || saida) lista.push({ data: l.data, entrada, saida, categoriaId: l.tipo === 'despesa' ? l.categoriaId : null, tipo: l.tipo })
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data))
}

export const saldoInicialDe = (contas, contaId = null) => (contaId != null
  ? contas.find((c) => c.id === contaId)?.saldoInicial || 0
  : contas.reduce((s, c) => s + (c.saldoInicial || 0), 0))

// Períodos de cada granularidade
function periodos(granularidade, { ano, mes, primeiroAno, ultimoAno }) {
  if (granularidade === 'ano') {
    return Array.from({ length: ultimoAno - primeiroAno + 1 }, (_, i) => {
      const a = primeiroAno + i
      return { chave: String(a), rotulo: String(a), inicio: `${a}-01-01`, fim: `${a}-12-31` }
    })
  }
  if (granularidade === 'mes') {
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${ano}-${pad(i + 1)}`
      return { chave: m, rotulo: MESES_CURTOS[i], inicio: `${m}-01`, fim: `${m}-${pad(diasNoMes(ano, i + 1))}` }
    })
  }
  const [a, m] = mes.split('-').map(Number)
  return Array.from({ length: diasNoMes(a, m) }, (_, i) => {
    const d = `${mes}-${pad(i + 1)}`
    return { chave: d, rotulo: String(i + 1), inicio: d, fim: d }
  })
}

/**
 * Série para os gráficos: para cada período, quanto entrou, saiu, o resultado e o saldo no fim.
 * Períodos depois de `hoje` ficam com saldo null (não desenha o futuro).
 */
export function serie({ granularidade, ano, mes, movs, saldoInicial, hoje }) {
  const anoHoje = Number(hoje.slice(0, 4))
  const primeiroAno = movs.length ? Number(movs[0].data.slice(0, 4)) : anoHoje
  const ultimoAno = Math.max(anoHoje, movs.length ? Number(movs[movs.length - 1].data.slice(0, 4)) : anoHoje)
  const lista = periodos(granularidade, { ano, mes, primeiroAno, ultimoAno })
  let i = 0
  let saldo = saldoInicial
  return lista.map((p) => {
    // tudo antes do começo deste período entra no saldo acumulado
    while (i < movs.length && movs[i].data < p.inicio) { saldo += movs[i].entrada - movs[i].saida; i++ }
    let entradas = 0, saidas = 0
    while (i < movs.length && movs[i].data <= p.fim) { entradas += movs[i].entrada; saidas += movs[i].saida; i++ }
    saldo += entradas - saidas
    const futuro = p.inicio > hoje
    return { ...p, entradas, saidas, resultado: entradas - saidas, saldoFim: futuro ? null : saldo }
  })
}

// Totais de um período qualquer, com gastos por categoria e saídas acumuladas dia a dia
export function resumoPeriodo(movs, inicio, fim) {
  let entradas = 0, saidas = 0
  const porCategoria = new Map()
  for (const m of movs) {
    if (m.data < inicio || m.data > fim) continue
    entradas += m.entrada
    saidas += m.saida
    if (m.saida && m.tipo === 'despesa') porCategoria.set(m.categoriaId, (porCategoria.get(m.categoriaId) || 0) + m.saida)
  }
  return { entradas, saidas, resultado: entradas - saidas, porCategoria }
}

// Saídas acumuladas por dia do mês (para comparar o ritmo de gastos entre dois meses)
export function acumuladoDoMes(movs, mes, hoje) {
  const [a, m] = mes.split('-').map(Number)
  const dias = diasNoMes(a, m)
  const porDia = new Array(dias).fill(0)
  for (const x of movs) if (x.data.startsWith(mes)) porDia[Number(x.data.slice(8, 10)) - 1] += x.saida
  let soma = 0
  return porDia.map((v, i) => {
    const dia = `${mes}-${pad(i + 1)}`
    soma += v
    return dia > hoje ? null : soma
  })
}

export const variacao = (antes, depois) => (antes ? Math.round(((depois - antes) / antes) * 1000) / 10 : null)

export function compararMeses(movs, mesA, mesB, hoje) {
  const fim = (mes) => { const [a, m] = mes.split('-').map(Number); return `${mes}-${pad(diasNoMes(a, m))}` }
  const a = resumoPeriodo(movs, `${mesA}-01`, fim(mesA))
  const b = resumoPeriodo(movs, `${mesB}-01`, fim(mesB))
  const categorias = [...new Set([...a.porCategoria.keys(), ...b.porCategoria.keys()])]
    .map((id) => ({ categoriaId: id, a: a.porCategoria.get(id) || 0, b: b.porCategoria.get(id) || 0 }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b))
  return {
    a, b, categorias,
    acumuladoA: acumuladoDoMes(movs, mesA, hoje),
    acumuladoB: acumuladoDoMes(movs, mesB, hoje),
    variacaoSaidas: variacao(a.saidas, b.saidas),
    variacaoEntradas: variacao(a.entradas, b.entradas),
  }
}

/**
 * Compara dois anos mês a mês. Se um dos anos ainda está em andamento, a variação "até agora"
 * compara só os mesmos meses (ex.: jan–nov de 2025 x jan–nov de 2026), para ser justa.
 */
export function compararAnos(movs, anoA, anoB, hoje) {
  const mesesDe = (ano) => Array.from({ length: 12 }, (_, i) => {
    const m = `${ano}-${pad(i + 1)}`
    return resumoPeriodo(movs, `${m}-01`, `${m}-${pad(diasNoMes(ano, i + 1))}`)
  })
  const A = mesesDe(anoA), B = mesesDe(anoB)
  const mesHoje = hoje.slice(0, 7)
  const anoMaior = Math.max(anoA, anoB)
  // último mês com dados comparáveis: se o ano mais recente é o atual, vai até o mês atual
  const ultimoMes = String(anoMaior) === hoje.slice(0, 4) ? Number(mesHoje.slice(5, 7)) : 12
  const soma = (lista, campo, ate = 12) => lista.slice(0, ate).reduce((s, x) => s + x[campo], 0)
  return {
    meses: MESES_CURTOS.map((rotulo, i) => ({ rotulo, a: A[i], b: B[i] })),
    totalA: { entradas: soma(A, 'entradas'), saidas: soma(A, 'saidas'), resultado: soma(A, 'resultado') },
    totalB: { entradas: soma(B, 'entradas'), saidas: soma(B, 'saidas'), resultado: soma(B, 'resultado') },
    mesesComparados: ultimoMes,
    ateAgoraA: { entradas: soma(A, 'entradas', ultimoMes), saidas: soma(A, 'saidas', ultimoMes) },
    ateAgoraB: { entradas: soma(B, 'entradas', ultimoMes), saidas: soma(B, 'saidas', ultimoMes) },
    variacaoSaidas: variacao(soma(A, 'saidas', ultimoMes), soma(B, 'saidas', ultimoMes)),
    variacaoEntradas: variacao(soma(A, 'entradas', ultimoMes), soma(B, 'entradas', ultimoMes)),
  }
}

// Anos e meses que têm dados (para os seletores)
export function periodosDisponiveis(movs, hoje) {
  const anos = new Set([Number(hoje.slice(0, 4))])
  const meses = new Set([hoje.slice(0, 7)])
  for (const m of movs) { anos.add(Number(m.data.slice(0, 4))); meses.add(m.data.slice(0, 7)) }
  return { anos: [...anos].sort((a, b) => a - b), meses: [...meses].sort() }
}

export const mesAnterior = (mes) => somarMeses(mes, -1)
