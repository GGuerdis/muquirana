// Regras de fatura de cartão de crédito.
// Uma fatura é identificada pelo MÊS DE VENCIMENTO ('AAAA-MM').
import { mesDe, partes, somarMeses, dataNoMes, diasNoMes, hoje } from './datas.js'
import { compararIds } from './ids.js'

export const diaValido = (d) => Number.isInteger(d) && d >= 1 && d <= 31

// Em qual fatura cai uma compra feita em `data`?
// Compras no dia do fechamento ou depois já vão para a fatura seguinte.
// Se o dia de fechamento não existe no mês (ex.: 31 em fevereiro), fecha no último dia do mês.
export function faturaDaCompra(cartao, data) {
  const [a, m, d] = partes(data)
  const fechamento = Math.min(cartao.diaFechamento, diasNoMes(a, m))
  const mesFechamento = d >= fechamento ? somarMeses(mesDe(data), 1) : mesDe(data)
  return cartao.diaVencimento > cartao.diaFechamento ? mesFechamento : somarMeses(mesFechamento, 1)
}

export function vencimentoDaFatura(cartao, fatura) {
  return dataNoMes(fatura, cartao.diaVencimento)
}

export function fechamentoDaFatura(cartao, fatura) {
  const mesFech = cartao.diaVencimento > cartao.diaFechamento ? fatura : somarMeses(fatura, -1)
  return dataNoMes(mesFech, cartao.diaFechamento)
}

// A fatura que está aberta hoje (recebendo compras)
export const faturaAtual = (cartao, dia = hoje()) => faturaDaCompra(cartao, dia)

export function resumoFatura(cartao, fatura, lancamentos, dia = hoje()) {
  let total = 0
  let pago = 0
  const itens = []
  const pagamentos = []
  for (const l of lancamentos) {
    if (l.cartaoId !== cartao.id || l.fatura !== fatura) continue
    if (l.tipo === 'despesa') { total += l.valor; itens.push(l) }
    else if (l.tipo === 'pagamentoFatura') { pago += l.valor; pagamentos.push(l) }
  }
  const fechamento = fechamentoDaFatura(cartao, fatura)
  const vencimento = vencimentoDaFatura(cartao, fatura)
  let status = 'aberta'
  if (total > 0 && pago >= total) status = 'paga'
  else if (dia > vencimento && total > pago) status = 'atrasada'
  else if (dia >= fechamento) status = 'fechada'
  itens.sort((x, y) => y.data.localeCompare(x.data) || compararIds(y.id, x.id))
  pagamentos.sort((x, y) => y.data.localeCompare(x.data) || compararIds(y.id, x.id))
  return { fatura, total, pago, restante: Math.max(total - pago, 0), fechamento, vencimento, status, itens, pagamentos }
}

// Faturas que pedem atenção: as anteriores que ainda têm valor a pagar (fechadas ou atrasadas)
// e a fatura aberta atual. Ordenadas da mais antiga para a mais nova.
export function faturasPendentes(cartao, lancamentos, dia = hoje()) {
  const atual = faturaAtual(cartao, dia)
  const anteriores = new Set()
  for (const l of lancamentos) {
    if (l.cartaoId === cartao.id && l.tipo === 'despesa' && l.fatura < atual) anteriores.add(l.fatura)
  }
  const pendentes = [...anteriores].sort()
    .map((f) => resumoFatura(cartao, f, lancamentos, dia))
    .filter((r) => r.restante > 0)
  return [...pendentes, resumoFatura(cartao, atual, lancamentos, dia)]
}

// Limite usado: tudo que já foi comprado (inclusive parcelas futuras) menos o que já foi pago
export function limiteUsado(cartao, lancamentos) {
  let usado = 0
  for (const l of lancamentos) {
    if (l.cartaoId !== cartao.id) continue
    if (l.tipo === 'despesa') usado += l.valor
    else if (l.tipo === 'pagamentoFatura') usado -= l.valor
  }
  return Math.max(usado, 0)
}
