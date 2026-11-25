// Relatórios: resumo para o Imposto de Renda, o fluxo do dinheiro no mês e os gastos por categoria num período.
import { normalizar } from './cores.js'
import { mesDe, somarMeses, hoje as hojeTexto, dataValida } from './datas.js'
import { saldoConta } from './calculos.js'

// ---------- Imposto de Renda ----------
// Categorias que interessam na declaração, pelo nome (sem acento, maiúsculo)
const GRUPOS_IR = {
  saude: (n) => /SAUDE|MEDIC|DENTIS|ODONTO|PLANO DE SAUDE|EXAME|HOSPITAL|PSICOLOG/.test(n),
  educacao: (n) => /EDUCACAO|ESCOLA|FACULDADE|CURSO|COLEGIO/.test(n),
  rendimentos: (n) => /RENDIMENTO/.test(n),
  salario: (n) => /SALARIO/.test(n),
}
const TIPO_IR = { saude: 'despesa', educacao: 'despesa', rendimentos: 'receita', salario: 'receita' }

function porDescricao(itens) {
  const g = new Map()
  for (const l of itens) {
    const nome = (l.descricao || '').trim() || 'Sem descrição'
    const chave = normalizar(nome)
    if (!g.has(chave)) g.set(chave, { nome, total: 0, quantidade: 0 })
    const x = g.get(chave)
    x.total += l.valor
    x.quantidade += 1
  }
  return [...g.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
}

export function resumoIR(ano, { lancamentos, contas, categorias }) {
  const doAno = lancamentos.filter((l) => l.data?.startsWith(`${ano}-`))
  const grupos = {}
  for (const [grupo, bate] of Object.entries(GRUPOS_IR)) {
    const cats = new Set(categorias.filter((c) => c.tipo === TIPO_IR[grupo] && bate(normalizar(c.nome))).map((c) => c.id))
    const itens = doAno.filter((l) => l.tipo === TIPO_IR[grupo] && cats.has(l.categoriaId))
    grupos[grupo] = { total: itens.reduce((s, l) => s + l.valor, 0), quantidade: itens.length, porDescricao: porDescricao(itens) }
  }
  const saldos = contas.map((c) => ({
    conta: c,
    fimAnoAnterior: saldoConta(c, lancamentos, `${ano - 1}-12-31`),
    fimAno: saldoConta(c, lancamentos, `${ano}-12-31`),
  }))
  return { ano, ...grupos, saldos }
}

// ---------- Fluxo do mês ----------
// De onde veio (receitas por categoria) e para onde foi (despesas por categoria) o dinheiro do mês.
// As menores viram "Outras" para o desenho caber no celular. Compras no cartão contam pela data da compra.
export function fluxoDoMes(mes, lancamentos, categorias, maximo = 5) {
  const nomeDe = new Map(categorias.map((c) => [c.id, c.nome]))
  const somar = (tipo) => {
    const g = new Map()
    for (const l of lancamentos) {
      if (l.tipo !== tipo || mesDe(l.data) !== mes) continue
      const k = l.categoriaId ?? null
      g.set(k, (g.get(k) || 0) + l.valor)
    }
    const lista = [...g.entries()].map(([categoriaId, valor]) => ({ categoriaId, nome: nomeDe.get(categoriaId) ?? 'Sem categoria', valor }))
      .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome))
    if (lista.length <= maximo) return lista
    const resto = lista.slice(maximo - 1)
    return [...lista.slice(0, maximo - 1), { categoriaId: null, nome: `Outras (${resto.length})`, valor: resto.reduce((s, x) => s + x.valor, 0), outras: true }]
  }
  const entradas = somar('receita')
  const saidas = somar('despesa')
  const entrou = entradas.reduce((s, x) => s + x.valor, 0)
  const saiu = saidas.reduce((s, x) => s + x.valor, 0)
  return { entradas, saidas, entrou, saiu, sobrou: entrou - saiu }
}

/**
 * Posições do desenho do fluxo (sankey em 3 colunas: de onde veio → o mês → para onde foi).
 * Cada lado soma o mesmo total: se sobrou dinheiro, "Sobrou" entra nas saídas; se faltou, "Do saldo" entra nas entradas.
 */
// Rótulos (nome + valor) a pelo menos `folga` px um do outro: nós pequenos em sequência não se sobrepõem
export function posicionarRotulos(nos, altura, folga = 26) {
  const ys = nos.map((n) => n.y + n.h / 2)
  if (ys.length) ys[0] = Math.max(ys[0], 8)
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + folga)
  const limite = altura - 8
  for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i === ys.length - 1 ? limite : ys[i + 1] - folga)
  return nos.map((n, i) => ({ ...n, rotuloY: ys[i] }))
}

export function desenhoFluxo(fluxo, { altura: alturaMinima = 280, espaco = 8 } = {}) {
  const esquerda = [...fluxo.entradas]
  const direita = [...fluxo.saidas]
  if (fluxo.sobrou > 0) direita.push({ nome: 'Sobrou', valor: fluxo.sobrou, sobra: true })
  if (fluxo.sobrou < 0) esquerda.push({ nome: 'Do saldo', valor: -fluxo.sobrou, saldo: true })
  const total = Math.max(fluxo.entrou, fluxo.saiu)
  if (!total) return null
  const altura = Math.max(alturaMinima, Math.max(esquerda.length, direita.length) * 34)
  const pilha = (nos) => {
    const util = altura - espaco * Math.max(0, nos.length - 1)
    let y = 0
    return nos.map((n) => {
      const h = Math.max(2, (n.valor / total) * util)
      const r = { ...n, y, h }
      y += h + espaco
      return r
    })
  }
  return { esquerda: posicionarRotulos(pilha(esquerda), altura), direita: posicionarRotulos(pilha(direita), altura), total, altura }
}

// ---------- Por categoria, num período ----------
export const PERIODOS_CATEGORIA = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: '3m', rotulo: '3 meses' },
  { valor: '6m', rotulo: '6 meses' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'livre', rotulo: 'Escolher datas' },
]

// Datas do período até hoje ("3 meses" = este mês e os 2 anteriores, inteiros). No livre, as datas que você escolheu.
export function intervaloDoPeriodo(periodo, { dia = hojeTexto(), de, ate } = {}) {
  const mes = mesDe(dia)
  if (periodo === 'livre') {
    const a = dataValida(de || '') ? de : `${mes}-01`
    const b = dataValida(ate || '') ? ate : dia
    return a <= b ? { de: a, ate: b } : { de: b, ate: a }
  }
  const voltar = { mes: 0, '3m': 2, '6m': 5 }[periodo]
  if (periodo === 'ano') return { de: `${dia.slice(0, 4)}-01-01`, ate: dia }
  return { de: `${somarMeses(mes, -(voltar ?? 0))}-01`, ate: dia }
}

// Quantos meses (do calendário) o período toca: de 10/09 a 05/11 = 3
export const mesesNoIntervalo = ({ de, ate }) => {
  let n = 0
  for (let m = mesDe(de); m <= mesDe(ate); m = somarMeses(m, 1)) n++
  return n
}

const noIntervalo = (l, { de, ate }) => l.data >= de && l.data <= ate

/**
 * Total de cada categoria no período (despesas ou receitas), da maior para a menor.
 * Compras no cartão contam pela data da compra (ou da parcela), como no resto do app.
 * Sem categoria vira categoriaId null.
 */
export function totaisPorCategoria(lancamentos, intervalo, tipo = 'despesa') {
  const g = new Map()
  for (const l of lancamentos) {
    if (l.tipo !== tipo || !noIntervalo(l, intervalo)) continue
    const k = l.categoriaId ?? null
    if (!g.has(k)) g.set(k, { categoriaId: k, total: 0, quantidade: 0 })
    const x = g.get(k)
    x.total += l.valor
    x.quantidade += 1
  }
  const categorias = [...g.values()].sort((a, b) => b.total - a.total || a.quantidade - b.quantidade)
  return { total: categorias.reduce((s, x) => s + x.total, 0), categorias }
}

/**
 * Tudo de uma categoria no período: os lançamentos (mais recentes primeiro), o total,
 * a média por mês (pelos meses do período) e o total de cada mês.
 */
export function detalheDaCategoria(lancamentos, categoriaId, intervalo, tipo = 'despesa') {
  const itens = lancamentos
    .filter((l) => l.tipo === tipo && (l.categoriaId ?? null) === categoriaId && noIntervalo(l, intervalo))
    .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0))
  const total = itens.reduce((s, l) => s + l.valor, 0)
  const meses = mesesNoIntervalo(intervalo)
  const porMes = []
  for (let m = mesDe(intervalo.de); m <= mesDe(intervalo.ate); m = somarMeses(m, 1)) porMes.push({ mes: m, total: 0 })
  for (const l of itens) porMes.find((x) => x.mes === mesDe(l.data)).total += l.valor
  return { itens, total, meses, mediaPorMes: Math.round(total / meses), porMes }
}
