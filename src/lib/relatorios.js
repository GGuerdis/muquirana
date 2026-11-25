// Relatórios: resumo para o Imposto de Renda e o fluxo do dinheiro no mês.
import { normalizar } from './cores.js'
import { mesDe } from './datas.js'
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
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + folga)
  const limite = altura - 8
  for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i === ys.length - 1 ? limite : ys[i + 1] - folga)
  return nos.map((n, i) => ({ ...n, rotuloY: Math.max(ys[i], 8) }))
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
