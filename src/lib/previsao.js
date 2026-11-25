// Previsão do saldo para os próximos meses: parte do saldo de hoje (todas as contas) e aplica,
// dia a dia, o que já se sabe que vai acontecer:
//  - lançamentos agendados (com data futura) nas contas;
//  - contas fixas que ainda não foram lançadas nem puladas (as atrasadas entram hoje);
//  - faturas de cartão a pagar, no vencimento (as atrasadas entram hoje), com as parcelas futuras
//    e as contas fixas que caem no cartão.
// Não adivinha gastos do dia a dia que ainda não foram lançados.
import { hoje as hojeTexto, mesDe, somarMeses, dataNoMes, partes, paraTexto, diasNoMes } from './datas.js'
import { saldoConta } from './calculos.js'
import { contasDoMes } from './recorrentes.js'
import { faturaDaCompra, resumoFatura, vencimentoDaFatura } from './fatura.js'

// Quanto um lançamento muda a soma das contas (mesma regra de saldoConta)
export function efeitoNasContas(l, contaIds) {
  const tem = (id) => id != null && contaIds.has(id)
  if (l.tipo === 'receita') return tem(l.contaId) ? l.valor : 0
  if (l.tipo === 'despesa') return tem(l.contaId) && !l.cartaoId ? -l.valor : 0
  if (l.tipo === 'transferencia') return (tem(l.contaDestinoId) ? l.valor : 0) - (tem(l.contaId) ? l.valor : 0)
  if (l.tipo === 'pagamentoFatura') return tem(l.contaId) ? -l.valor : 0
  return 0
}

const diaSeguinte = (data) => { const [a, m, d] = partes(data); return paraTexto(new Date(a, m - 1, d + 1)) }

/**
 * Quanto costuma sair por mês no dia a dia: média das despesas dos últimos 3 meses completos,
 * sem as contas fixas lançadas e sem as parcelas (essas a previsão já conhece uma a uma).
 */
export function gastoMensalMedio(lancamentos, dia = hojeTexto()) {
  const meses = [1, 2, 3].map((n) => somarMeses(mesDe(dia), -n))
  const totais = meses.map((m) => lancamentos.filter((l) => l.tipo === 'despesa' && mesDe(l.data) === m && !l.recorrenteId && !l.grupoParcelaId).reduce((s, l) => s + l.valor, 0))
  const comGasto = totais.filter((v) => v > 0)
  return comGasto.length ? Math.round(comGasto.reduce((s, v) => s + v, 0) / comGasto.length) : 0
}

// `gastoMensal`: gasto do dia a dia esperado por mês (ver gastoMensalMedio); sai um pouco a cada dia,
// a partir de amanhã. Aparece em "O que vem por aí" como uma linha por mês (origem 'media').
export function previsaoSaldo({ contas, cartoes, recorrentes, lancamentos, meses = 6, dia = hojeTexto(), gastoMensal = 0 }) {
  const mesHoje = mesDe(dia)
  const ultimoMes = somarMeses(mesHoje, meses - 1)
  const fim = dataNoMes(ultimoMes, 31)
  const contaIds = new Set(contas.map((c) => c.id))
  const saldoHoje = contas.reduce((s, c) => s + saldoConta(c, lancamentos, dia), 0)
  const eventos = []
  const quando = (data) => (data < dia ? dia : data) // o que está atrasado entra hoje

  // 1) lançamentos agendados nas contas
  for (const l of lancamentos) {
    if (l.data <= dia || l.data > fim) continue
    const valor = efeitoNasContas(l, contaIds)
    if (valor) eventos.push({ data: l.data, valor, descricao: l.descricao || 'Lançamento agendado', origem: 'agendado' })
  }

  // 2) contas fixas ainda não lançadas (na conta: entram no dia; no cartão: vão para a fatura)
  const fixasNoCartao = new Map() // cartaoId → Map(fatura → valor)
  for (let m = mesHoje; m <= ultimoMes; m = somarMeses(m, 1)) {
    for (const x of contasDoMes(m, recorrentes, lancamentos, dia)) {
      if (x.situacao !== 'pendente' && x.situacao !== 'atrasada') continue
      const r = x.recorrente
      if (r.contaId != null) {
        if (!contaIds.has(r.contaId)) continue
        eventos.push({ data: quando(x.vencimento), valor: r.tipo === 'receita' ? r.valor : -r.valor, descricao: r.descricao, origem: r.renda ? 'renda' : 'fixa' })
      } else if (r.cartaoId != null) {
        const cartao = cartoes.find((c) => c.id === r.cartaoId)
        if (!cartao) continue
        const fatura = faturaDaCompra(cartao, x.vencimento)
        const porFatura = fixasNoCartao.get(cartao.id) || new Map()
        porFatura.set(fatura, (porFatura.get(fatura) || 0) + r.valor)
        fixasNoCartao.set(cartao.id, porFatura)
      }
    }
  }

  // 3) faturas a pagar (inclui parcelas futuras já lançadas)
  for (const c of cartoes) {
    const faturas = new Set(fixasNoCartao.get(c.id)?.keys() || [])
    for (const l of lancamentos) if (l.cartaoId === c.id && l.tipo === 'despesa' && l.fatura) faturas.add(l.fatura)
    for (const f of [...faturas].sort()) {
      const venc = vencimentoDaFatura(c, f)
      if (venc > fim) continue
      const restante = resumoFatura(c, f, lancamentos, dia).restante + (fixasNoCartao.get(c.id)?.get(f) || 0)
      if (restante > 0) eventos.push({ data: quando(venc), valor: -restante, descricao: `Fatura ${c.nome}`, origem: 'fatura', fatura: f })
    }
  }

  eventos.sort((a, b) => a.data.localeCompare(b.data) || a.valor - b.valor)

  // saldo dia a dia (hoje até o fim), o dia mais apertado e o fim de cada mês
  const porDia = new Map()
  for (const e of eventos) porDia.set(e.data, (porDia.get(e.data) || 0) + e.valor)
  const doDia = (d) => { const [a, m] = partes(d); return Math.round(gastoMensal / diasNoMes(a, m)) }
  const mediaPorMes = new Map()
  const dias = []
  let saldo = saldoHoje
  let menor = null
  for (let d = dia; d <= fim; d = diaSeguinte(d)) {
    saldo += porDia.get(d) || 0
    if (gastoMensal > 0 && d > dia) {
      saldo -= doDia(d)
      mediaPorMes.set(mesDe(d), (mediaPorMes.get(mesDe(d)) || 0) + doDia(d))
    }
    dias.push({ data: d, saldo })
    if (!menor || saldo < menor.saldo) menor = { data: d, saldo }
  }
  const fimDosMeses = []
  for (let m = mesHoje; m <= ultimoMes; m = somarMeses(m, 1)) {
    const ultimo = dias.filter((x) => mesDe(x.data) === m).pop()
    if (ultimo) fimDosMeses.push({ mes: m, saldo: ultimo.saldo })
  }
  // uma linha por mês com o gasto do dia a dia (só para mostrar: o saldo acima já desconta dia a dia)
  for (const [m, valor] of mediaPorMes) eventos.push({ data: dataNoMes(m, 31), valor: -valor, descricao: 'Gastos do dia a dia', origem: 'media' })
  eventos.sort((a, b) => a.data.localeCompare(b.data) || a.valor - b.valor)
  return { saldoHoje, eventos, dias, menor, fimDosMeses, saldoFinal: saldo, fim, gastoMensal }
}
