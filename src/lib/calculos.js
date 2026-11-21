import { hoje, mesDe } from './datas.js'

// Saldo de uma conta até hoje (lançamentos com data futura ainda não contam)
export function saldoConta(conta, lancamentos, ate = hoje()) {
  let saldo = conta.saldoInicial || 0
  for (const l of lancamentos) {
    if (l.data > ate) continue
    if (l.tipo === 'receita' && l.contaId === conta.id) saldo += l.valor
    else if (l.tipo === 'despesa' && l.contaId === conta.id && !l.cartaoId) saldo -= l.valor
    else if (l.tipo === 'transferencia') {
      if (l.contaId === conta.id) saldo -= l.valor
      if (l.contaDestinoId === conta.id) saldo += l.valor
    } else if (l.tipo === 'pagamentoFatura' && l.contaId === conta.id) saldo -= l.valor
  }
  return saldo
}

// Resumo do mês: o que entrou e o que saiu (compras no cartão contam pela data da compra/parcela).
// Transferências e pagamentos de fatura não contam, para não somar o mesmo gasto duas vezes.
export function resumoMes(mes, lancamentos) {
  let entrou = 0
  let saiu = 0
  const porCategoria = new Map()
  for (const l of lancamentos) {
    if (mesDe(l.data) !== mes) continue
    if (l.tipo === 'receita') entrou += l.valor
    else if (l.tipo === 'despesa') {
      saiu += l.valor
      porCategoria.set(l.categoriaId, (porCategoria.get(l.categoriaId) || 0) + l.valor)
    }
  }
  const categorias = [...porCategoria.entries()]
    .map(([categoriaId, valor]) => ({ categoriaId, valor }))
    .sort((a, b) => b.valor - a.valor)
  return { entrou, saiu, resultado: entrou - saiu, categorias }
}

/**
 * Contas cujo saldo é só uma estimativa: receberam lançamentos vindos do extrato de OUTRA conta
 * (ex.: PIX do Santander para o Inter), mas o extrato delas mesmas nunca foi importado e o saldo
 * não foi conferido depois disso. Ex.: o Inter só com as entradas, sem os gastos dele.
 */
export function contasEstimadas(contas, lancamentos) {
  const comExtrato = new Set()
  const deFora = new Map() // conta → quando chegou o último lançamento vindo de outro extrato
  for (const l of lancamentos) {
    if (typeof l.idExterno !== 'string') continue
    const origem = /^conta:([^:]+):/.exec(l.idExterno)?.[1] ?? null
    if (!origem) continue
    comExtrato.add(origem)
    const outra = l.contaDestinoId != null && l.contaDestinoId !== origem ? l.contaDestinoId : l.contaId != null && l.contaId !== origem ? l.contaId : null
    if (outra != null) deFora.set(outra, Math.max(deFora.get(outra) ?? 0, l.criadoEm ?? 0))
  }
  return new Set(contas.filter((c) => deFora.has(c.id) && !comExtrato.has(c.id) && !(c.saldoConferidoEm >= deFora.get(c.id))).map((c) => c.id))
}
