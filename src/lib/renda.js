// Renda automática: o app aprende a sua renda (o salário, que pode vir em partes, e outras rendas)
// pelas entradas que você já importa.
//
// A renda é uma EXPECTATIVA, não um lançamento: ela não cria entradas nem muda saldos.
// O dinheiro de verdade continua chegando pelo extrato; cada crédito que bate com uma parte da renda
// (mesma categoria, dia parecido) marca aquela parte como recebida no mês. Por isso nada conta duas vezes.
//
// Cada parte da renda fica guardada como uma conta fixa de receita com o campo `renda`:
//   { descricao, tipo: 'receita', valor, dia, categoriaId, contaId, inicio, fim,
//     renda: { aprendida, ignorados: [ids de lançamentos que não são renda], recusado: valor } }
import { hoje as hojeTexto, mesDe, somarMeses, dataNoMes } from './datas.js'

export const JANELA_MESES = 6 // meses completos olhados para aprender
export const MINIMO = 5000 // R$ 50: créditos menores (rendimentos de centavos etc.) não viram renda
const PERTO = 4 // dias de folga para juntar créditos numa parte (ao aprender): dia 5 e dia 30 são partes diferentes
const PERTO_RENDA = 5 // dias de folga para um crédito bater com uma parte já confirmada
const ACIMA = 1.4 // acima de 1,4× o normal, o que passa é renda extra (13º, férias, PLR)
const MUDOU = 0.03 // diferença a partir da qual o valor "mudou" (aumento ou redução)

const diaDe = (data) => Number(data.slice(8, 10))
// distância entre dois dias do mês, dando a volta (dia 30 e dia 1 estão a 2 dias)
export const distanciaDia = (a, b) => { const d = Math.abs(a - b) % 31; return Math.min(d, 31 - d) }
const mediana = (v) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2) }

// Dia "típico" de um grupo de dias, dando a volta no mês (29, 30, 31 e 1 → perto de 30)
export function diaCentral(dias) {
  let s = 0, c = 0
  for (const d of dias) { const a = ((d - 1) / 31) * 2 * Math.PI; s += Math.sin(a); c += Math.cos(a) }
  let a = Math.atan2(s, c)
  if (a < 0) a += 2 * Math.PI
  const d = Math.round((a / (2 * Math.PI)) * 31) + 1
  return d > 31 ? d - 31 : d
}

// A que mês um crédito pertence, olhando o dia típico da parte:
// a parte do dia 30 que caiu no dia 1º é do mês anterior; a do dia 1º que caiu no dia 30 é do seguinte.
export function competenciaDe(data, diaTipico) {
  const d = diaDe(data)
  const m = mesDe(data)
  if (diaTipico - d > 15) return somarMeses(m, -1)
  if (d - diaTipico > 15) return somarMeses(m, 1)
  return m
}

const ehCredito = (l) => l.tipo === 'receita' && l.contaId != null && !l.cartaoId

// Junta créditos com dia parecido (dando a volta no mês)
function agrupar(creditos) {
  const grupos = []
  for (const l of [...creditos].sort((a, b) => a.data.localeCompare(b.data))) {
    const d = diaDe(l.data)
    let melhor = null
    for (const g of grupos) {
      const dist = distanciaDia(d, g.centro)
      if (dist <= PERTO && (!melhor || dist < melhor.dist)) melhor = { g, dist }
    }
    if (melhor) { melhor.g.itens.push(l); melhor.g.centro = diaCentral(melhor.g.itens.map((x) => diaDe(x.data))) }
    else grupos.push({ itens: [l], centro: d })
  }
  // dois grupos que acabaram com o centro perto viram um só
  for (let juntou = true; juntou;) {
    juntou = false
    for (let i = 0; i < grupos.length && !juntou; i++) {
      for (let j = i + 1; j < grupos.length && !juntou; j++) {
        if (distanciaDia(grupos[i].centro, grupos[j].centro) <= PERTO) {
          grupos[i].itens.push(...grupos[j].itens)
          grupos[i].centro = diaCentral(grupos[i].itens.map((x) => diaDe(x.data)))
          grupos.splice(j, 1)
          juntou = true
        }
      }
    }
  }
  return grupos
}

// Em cada mês, o crédito "normal" é o mais perto da referência; os outros do mesmo mês são extras
const maisPerto = (itens, ref) => itens.reduce((a, b) => (Math.abs(b.valor - ref) < Math.abs(a.valor - ref) ? b : a))

/**
 * Procura a renda nas entradas dos últimos meses.
 * Uma parte é um crédito da mesma categoria, perto do mesmo dia, em pelo menos 3 dos últimos 6 meses
 * completos (e em algum dos 2 últimos, para não sugerir renda que acabou).
 * O valor sugerido é o do último mês (se não for fora do normal): assim um aumento recente já entra.
 * Partes que já estão cadastradas (mesma categoria e dia parecido) não voltam como sugestão.
 */
export function aprenderRenda({ lancamentos, categorias, rendas = [], dia = hojeTexto() }) {
  const mesHoje = mesDe(dia)
  const inicio = somarMeses(mesHoje, -JANELA_MESES)
  const completos = Array.from({ length: JANELA_MESES }, (_, i) => somarMeses(inicio, i))
  const receitas = new Map(categorias.filter((c) => c.tipo === 'receita').map((c) => [c.id, c]))
  const ignorados = new Set(rendas.flatMap((r) => r.renda?.ignorados || []))
  const candidatos = lancamentos.filter((l) => ehCredito(l) && receitas.has(l.categoriaId) && l.valor >= MINIMO && l.data <= dia && mesDe(l.data) >= inicio && !ignorados.has(l.id))

  const porCategoria = new Map()
  for (const l of candidatos) { if (!porCategoria.has(l.categoriaId)) porCategoria.set(l.categoriaId, []); porCategoria.get(l.categoriaId).push(l) }

  const achadas = []
  for (const [categoriaId, lista] of porCategoria) {
    const partesDaCategoria = []
    for (const g of agrupar(lista)) {
      const t = g.centro
      const ref = mediana(g.itens.map((l) => l.valor))
      const porMes = new Map()
      for (const l of g.itens) { const m = competenciaDe(l.data, t); if (!porMes.has(m)) porMes.set(m, []); porMes.get(m).push(l) }
      const normais = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, itens]) => ({ mes: m, l: maisPerto(itens, ref) })).filter((x) => x.l.valor >= ref * 0.6)
      const meses = normais.filter((x) => completos.includes(x.mes)).length
      const recente = normais.some((x) => x.mes >= completos[completos.length - 2])
      if (meses < 3 || !recente) continue
      // valor: o último normal; se ele for muito diferente dos 3 anteriores, a mediana deles
      const valores = normais.filter((x) => x.l.valor <= ref * ACIMA)
      if (!valores.length) continue
      const ultimo = valores[valores.length - 1]
      const anteriores = valores.slice(-4, -1).map((x) => x.l.valor)
      // (se os 2 últimos vieram iguais, é o valor novo: vale mesmo sendo bem diferente dos anteriores)
      const penultimo = valores[valores.length - 2]
      const doisIguais = penultimo && Math.abs(penultimo.l.valor - ultimo.l.valor) <= ultimo.l.valor * MUDOU
      const foraDoNormal = anteriores.length >= 3 && Math.abs(ultimo.l.valor - mediana(anteriores)) > mediana(anteriores) * 0.25
      const base = foraDoNormal && !doisIguais ? mediana(anteriores) : ultimo.l.valor
      if (rendas.some((r) => r.categoriaId === categoriaId && distanciaDia(r.dia, t) <= PERTO_RENDA)) continue
      partesDaCategoria.push({ categoriaId, dia: t, valor: base, contaId: ultimo.l.contaId, meses, desde: normais.find((x) => completos.includes(x.mes))?.mes ?? ultimo.mes, ultimo: { data: ultimo.l.data, valor: ultimo.l.valor } })
    }
    partesDaCategoria.sort((a, b) => a.dia - b.dia)
    const nome = receitas.get(categoriaId).nome
    // quantas partes essa categoria tem no total (as já cadastradas contam, para numerar certo)
    const jaTem = rendas.filter((r) => r.categoriaId === categoriaId).length
    partesDaCategoria.forEach((p, i) => achadas.push({ ...p, descricao: partesDaCategoria.length + jaTem > 1 ? `${nome} · parte ${jaTem + i + 1}` : nome }))
  }
  // a categoria que mais rende (normalmente o salário) vem marcada; as outras você marca se quiser
  const somas = new Map()
  for (const p of achadas) somas.set(p.categoriaId, (somas.get(p.categoriaId) || 0) + p.valor)
  const principal = [...somas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return achadas.map((p) => ({ ...p, principal: p.categoriaId === principal })).sort((a, b) => a.dia - b.dia || a.descricao.localeCompare(b.descricao))
}

// O que salvar quando você confirma uma parte sugerida
export const rendaDaSugestao = (p) => ({
  descricao: p.descricao, tipo: 'receita', valor: p.valor, dia: p.dia, categoriaId: p.categoriaId, contaId: p.contaId, cartaoId: null,
  inicio: p.desde, fim: null, renda: { aprendida: true, ignorados: [] },
})

/**
 * Liga cada crédito às partes da renda.
 * Devolve:
 *  - porRenda: Map(id da parte → Map(mês → { lancamento, regular, extra }))
 *  - extras: [{ lancamento, valor, competencia, rendaId }] — o que entrou além do normal
 *    (um 2º crédito da parte no mesmo mês, ou o que passou de 1,4× o normal)
 * Créditos bem pequenos perto da parte (menos de 20% dela) são ignorados: não são salário nem extra.
 */
export function recebimentosDaRenda(rendas, lancamentos) {
  const porRenda = new Map(rendas.map((r) => [r.id, new Map()]))
  const extras = []
  if (!rendas.length) return { porRenda, extras }
  const porCategoria = new Map()
  for (const r of rendas) { if (!porCategoria.has(r.categoriaId)) porCategoria.set(r.categoriaId, []); porCategoria.get(r.categoriaId).push(r) }
  const ignorados = new Set(rendas.flatMap((r) => r.renda?.ignorados || []))

  const brutos = new Map(rendas.map((r) => [r.id, new Map()])) // id → mês → [lançamentos]
  for (const l of lancamentos) {
    if (!ehCredito(l) || ignorados.has(l.id)) continue
    const partes = porCategoria.get(l.categoriaId)
    if (!partes) continue
    const d = diaDe(l.data)
    let r = null
    for (const p of partes) if (distanciaDia(d, p.dia) <= PERTO_RENDA && (!r || distanciaDia(d, p.dia) < distanciaDia(d, r.dia))) r = p
    if (!r) continue // longe de qualquer parte: é uma entrada comum, não renda
    if (l.valor < r.valor * 0.2) continue
    const m = competenciaDe(l.data, r.dia)
    const doMes = brutos.get(r.id)
    if (!doMes.has(m)) doMes.set(m, [])
    doMes.get(m).push(l)
  }

  for (const r of rendas) {
    const meses = [...brutos.get(r.id).entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const escolhidos = meses.map(([m, itens]) => ({ m, itens, l: maisPerto(itens, r.valor) }))
    // valor normal de referência perto de cada mês (para separar o extra de um mês "inchado")
    const normais = escolhidos.filter((x) => x.l.valor <= r.valor * ACIMA)
    for (const x of escolhidos) {
      let regular = x.l.valor
      let extra = 0
      if (x.l.valor > r.valor * ACIMA) {
        const vizinhos = normais.filter((n) => Math.abs(distMeses(n.m, x.m)) <= 3).map((n) => n.l.valor)
        regular = Math.min(x.l.valor, vizinhos.length ? mediana(vizinhos) : r.valor)
        extra = x.l.valor - regular
        extras.push({ lancamento: x.l, valor: extra, competencia: x.m, rendaId: r.id })
      }
      porRenda.get(r.id).set(x.m, { lancamento: x.l, regular, extra })
      for (const outro of x.itens) if (outro !== x.l && outro.valor >= MINIMO) extras.push({ lancamento: outro, valor: outro.valor, competencia: x.m, rendaId: r.id })
    }
  }
  extras.sort((a, b) => a.lancamento.data.localeCompare(b.lancamento.data))
  return { porRenda, extras }
}

const distMeses = (a, b) => (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + Number(a.slice(5, 7)) - Number(b.slice(5, 7))
const ativaNoMes = (r, mes) => r.inicio <= mes && (!r.fim || mes <= r.fim)

/**
 * A renda num mês: o que era esperado, o que já veio e o que ainda falta.
 * `ajuste` é a correção do "entrou" do mês pela competência: + o salário deste mês que caiu em outro mês,
 * − o salário de outro mês que caiu neste.
 */
export function rendaDoMes(mes, rendas, lancamentos, dia = hojeTexto(), rec = recebimentosDaRenda(rendas, lancamentos)) {
  const mesHoje = mesDe(dia)
  const partes = rendas.filter((r) => ativaNoMes(r, mes)).sort((a, b) => a.dia - b.dia).map((r) => {
    const x = rec.porRenda.get(r.id)?.get(mes)
    const previsto = dataNoMes(mes, r.dia)
    const situacao = x ? 'recebida' : (r.pulados || []).includes(mes) ? 'pulada' : previsto < dia ? 'atrasada' : 'aguardando'
    return { renda: r, previsto, situacao, recebido: x?.regular ?? 0, lancamento: x?.lancamento ?? null }
  })
  const esperado = partes.reduce((s, p) => s + p.renda.valor, 0)
  const recebido = partes.reduce((s, p) => s + p.recebido, 0)
  // ainda deve entrar: só no mês atual e nos próximos (num mês que já passou, o que não veio não vem mais)
  const pendentes = mes >= mesHoje ? partes.filter((p) => p.situacao === 'aguardando' || p.situacao === 'atrasada') : []
  const falta = pendentes.reduce((s, p) => s + p.renda.valor, 0)
  const extras = rec.extras.filter((e) => e.competencia === mes)
  let ajuste = 0
  for (const doMes of rec.porRenda.values()) {
    for (const [m, x] of doMes) {
      const mesDaData = mesDe(x.lancamento.data)
      if (m === mes && mesDaData !== mes) ajuste += x.lancamento.valor
      else if (m !== mes && mesDaData === mes) ajuste -= x.lancamento.valor
    }
  }
  return { mes, partes, esperado, recebido, falta, pendentes, extras, totalExtras: extras.reduce((s, e) => s + e.valor, 0), ajuste }
}

// Renda esperada por mês (as partes que valem neste mês)
export const rendaMensal = (rendas, mes = mesDe(hojeTexto())) => rendas.filter((r) => ativaNoMes(r, mes)).reduce((s, r) => s + r.valor, 0)

/**
 * Partes cujo valor mudou: os 2 últimos meses recebidos (seguidos) vieram com o mesmo valor novo
 * (diferente do cadastrado em mais de 3%). Se você já disse "manter" para esse valor, não pergunta de novo.
 */
export function mudancasDaRenda(rendas, rec) {
  const lista = []
  for (const r of rendas) {
    const meses = [...(rec.porRenda.get(r.id) || new Map()).entries()].filter(([, x]) => x.extra === 0).sort((a, b) => a[0].localeCompare(b[0]))
    if (meses.length < 2) continue
    const [[m1, a], [m2, b]] = meses.slice(-2)
    if (somarMeses(m1, 1) !== m2) continue
    const novo = b.regular
    const diferente = (v) => Math.abs(v - r.valor) > r.valor * MUDOU
    if (!diferente(a.regular) || !diferente(b.regular) || Math.abs(a.regular - b.regular) > b.regular * MUDOU) continue
    if (Math.sign(a.regular - r.valor) !== Math.sign(b.regular - r.valor)) continue
    if (r.renda?.recusado === novo) continue
    lista.push({ renda: r, de: r.valor, para: novo, desde: m1, subiu: novo > r.valor })
  }
  return lista
}

/**
 * Quanto sobrou da renda em cada um dos últimos meses completos (taxa de poupança):
 * entrou (corrigido pela competência do salário) − saiu, e a porcentagem do que entrou.
 */
export function sobrasPorMes({ rendas, lancamentos, meses = 6, dia = hojeTexto(), rec = recebimentosDaRenda(rendas, lancamentos) }) {
  const ultimo = somarMeses(mesDe(dia), -1)
  const lista = []
  for (let i = meses - 1; i >= 0; i--) {
    const mes = somarMeses(ultimo, -i)
    let entrou = 0, saiu = 0
    for (const l of lancamentos) {
      if (mesDe(l.data) !== mes) continue
      if (l.tipo === 'receita') entrou += l.valor
      else if (l.tipo === 'despesa') saiu += l.valor
    }
    entrou += rendaDoMes(mes, rendas, lancamentos, dia, rec).ajuste
    if (!entrou && !saiu) continue
    const sobrou = entrou - saiu
    lista.push({ mes, entrou, saiu, sobrou, porcentagem: entrou > 0 ? Math.round((sobrou / entrou) * 100) : null })
  }
  return lista
}

/**
 * Quanto costuma sobrar por mês: renda esperada − média do que saiu nos últimos 3 meses completos.
 * Serve para as metas ("cabe na sua renda?") e os orçamentos (% da renda).
 */
// `fora`: categorias que não contam como gasto (as das metas: o que vai para a meta é o que sobrou)
export function sobraMedia({ rendas, lancamentos, dia = hojeTexto(), fora = new Set() }) {
  const renda = rendaMensal(rendas, mesDe(dia))
  if (!renda) return null
  const meses = [1, 2, 3].map((n) => somarMeses(mesDe(dia), -n))
  const saidas = meses.map((m) => lancamentos.filter((l) => l.tipo === 'despesa' && mesDe(l.data) === m && !fora.has(l.categoriaId)).reduce((s, l) => s + l.valor, 0))
  const comDados = saidas.filter((v) => v > 0)
  const gastoMedio = comDados.length ? Math.round(comDados.reduce((s, v) => s + v, 0) / comDados.length) : 0
  return { renda, gastoMedio, sobra: renda - gastoMedio }
}

// "perto do dia 15" / "no fim do mês"
export const textoDia = (d) => (d >= 28 ? 'no fim do mês' : `perto do dia ${d}`)
