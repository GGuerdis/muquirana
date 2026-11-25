// Patrimônio: o que você tem nas contas menos o que deve no cartão (faturas abertas e parcelas futuras).
// Investimentos ainda não entram (decisão de 25/11/2026: só contas e dívidas por enquanto).
import { hoje as hojeTexto, mesDe, somarMeses, dataNoMes } from './datas.js'
import { saldoConta } from './calculos.js'

// Quanto se deve num cartão numa data: compras feitas até ela (todas as parcelas) menos os pagamentos até ela
export function dividaCartao(cartao, lancamentos, ate = hojeTexto()) {
  let compras = 0, pago = 0, futuras = 0
  for (const l of lancamentos) {
    if (l.cartaoId !== cartao.id) continue
    if (l.tipo === 'despesa' && (l.dataCompra ?? l.data) <= ate) {
      compras += l.valor
      if (l.data > ate) futuras += l.valor // parcelas que ainda vão cair
    } else if (l.tipo === 'pagamentoFatura' && l.data <= ate) pago += l.valor
  }
  const total = Math.max(compras - pago, 0)
  return { total, futuras: Math.min(futuras, total) }
}

export function patrimonio({ contas, cartoes, lancamentos, dia = hojeTexto() }) {
  const porConta = contas.map((c) => ({ conta: c, saldo: saldoConta(c, lancamentos, dia) }))
  const porCartao = cartoes.map((c) => ({ cartao: c, ...dividaCartao(c, lancamentos, dia) })).filter((x) => x.total > 0)
  const nasContas = porConta.reduce((s, x) => s + x.saldo, 0)
  const dividas = porCartao.reduce((s, x) => s + x.total, 0)
  return { nasContas, dividas, liquido: nasContas - dividas, porConta, porCartao }
}

// Patrimônio no fim de cada um dos últimos `meses` meses (o atual vai até hoje)
export function evolucaoPatrimonio({ contas, cartoes, lancamentos, meses = 12, dia = hojeTexto() }) {
  const mesHoje = mesDe(dia)
  const pontos = []
  for (let i = meses - 1; i >= 0; i--) {
    const m = somarMeses(mesHoje, -i)
    const ate = i === 0 ? dia : dataNoMes(m, 31)
    const p = patrimonio({ contas, cartoes, lancamentos, dia: ate })
    pontos.push({ mes: m, liquido: p.liquido, nasContas: p.nasContas, dividas: p.dividas })
  }
  return pontos
}
