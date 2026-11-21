import { describe, it, expect } from 'vitest'
import { faturaDaCompra, fechamentoDaFatura, vencimentoDaFatura, resumoFatura, faturasPendentes, limiteUsado, faturaAtual } from '../src/lib/fatura.js'
import { somarMeses } from '../src/lib/datas.js'
import { aleatorio, pad } from './ajuda.js'

const mesmoMes = { id: 1, diaFechamento: 3, diaVencimento: 10 } // fecha e vence no mesmo mês
const mesSeguinte = { id: 2, diaFechamento: 25, diaVencimento: 5 } // vence no mês seguinte ao fechamento
const fimDeMes = { id: 3, diaFechamento: 31, diaVencimento: 8 }

describe('em qual fatura cai a compra', () => {
  it.each([
    [mesmoMes, '2026-03-02', '2026-03'], // antes do fechamento
    [mesmoMes, '2026-03-03', '2026-04'], // no dia do fechamento: próxima
    [mesmoMes, '2026-03-04', '2026-04'],
    [mesmoMes, '2026-12-05', '2027-01'], // virada de ano
    [mesSeguinte, '2026-03-24', '2026-04'],
    [mesSeguinte, '2026-03-25', '2026-05'],
    [mesSeguinte, '2026-12-26', '2027-02'],
    [mesSeguinte, '2026-12-24', '2027-01'],
    [fimDeMes, '2026-02-27', '2026-03'], // fevereiro fecha dia 28
    [fimDeMes, '2026-02-28', '2026-04'],
    [fimDeMes, '2028-02-28', '2028-03'], // bissexto: fecha dia 29
    [fimDeMes, '2028-02-29', '2028-04'],
    [fimDeMes, '2026-04-29', '2026-05'], // abril fecha dia 30
    [fimDeMes, '2026-04-30', '2026-06'],
    [fimDeMes, '2026-05-30', '2026-06'],
    [fimDeMes, '2026-05-31', '2026-07'],
  ])('cartão %o, compra em %s → fatura %s', (cartao, data, esperado) => {
    expect(faturaDaCompra(cartao, data)).toBe(esperado)
  })

  it('datas de fechamento e vencimento', () => {
    expect(fechamentoDaFatura(mesmoMes, '2026-04')).toBe('2026-04-03')
    expect(vencimentoDaFatura(mesmoMes, '2026-04')).toBe('2026-04-10')
    expect(fechamentoDaFatura(mesSeguinte, '2026-05')).toBe('2026-04-25')
    expect(vencimentoDaFatura(mesSeguinte, '2026-05')).toBe('2026-05-05')
    expect(fechamentoDaFatura(fimDeMes, '2026-03')).toBe('2026-02-28')
    expect(fechamentoDaFatura(fimDeMes, '2026-05')).toBe('2026-04-30')
  })

  it('regra geral: toda compra cai entre o fechamento anterior e o fechamento da sua fatura (30 mil casos)', () => {
    const r = aleatorio(123)
    for (let i = 0; i < 30000; i++) {
      const diaFechamento = r.inteiro(1, 31)
      let diaVencimento = r.inteiro(1, 31)
      if (diaVencimento === diaFechamento) diaVencimento = (diaVencimento % 31) + 1
      const cartao = { id: 9, diaFechamento, diaVencimento }
      const ano = r.inteiro(2024, 2030), mes = r.inteiro(1, 12)
      const dia = r.inteiro(1, new Date(ano, mes, 0).getDate())
      const data = `${ano}-${pad(mes)}-${pad(dia)}`

      const f = faturaDaCompra(cartao, data)
      const fechaEsta = fechamentoDaFatura(cartao, f)
      const fechaAnterior = fechamentoDaFatura(cartao, somarMeses(f, -1))
      const vence = vencimentoDaFatura(cartao, f)
      // a compra entra no ciclo [fechamento anterior, fechamento desta)
      expect(data >= fechaAnterior, `${JSON.stringify(cartao)} ${data}`).toBe(true)
      expect(data < fechaEsta, `${JSON.stringify(cartao)} ${data}`).toBe(true)
      // o vencimento nunca é antes do fechamento (só coincide em casos como fecha 30 / vence 31 em fevereiro),
      // e fica no máximo ~45 dias depois
      expect(vence >= fechaEsta).toBe(true)
      const dias = (new Date(vence) - new Date(fechaEsta)) / 86400000
      expect(dias).toBeLessThanOrEqual(45)
      // o vencimento cai no mês da fatura
      expect(vence.slice(0, 7)).toBe(f)
    }
  })
})

describe('resumo da fatura', () => {
  const c = mesmoMes
  const L = [
    { id: 1, tipo: 'despesa', cartaoId: 1, fatura: '2026-12', valor: 10000, data: '2026-11-20' },
    { id: 2, tipo: 'despesa', cartaoId: 1, fatura: '2026-12', valor: 5050, data: '2026-11-21' },
    { id: 3, tipo: 'despesa', cartaoId: 1, fatura: '2027-01', valor: 7000, data: '2026-12-20' },
    { id: 4, tipo: 'despesa', cartaoId: 99, fatura: '2026-12', valor: 99999, data: '2026-11-20' }, // outro cartão
    { id: 5, tipo: 'despesa', contaId: 1, cartaoId: null, valor: 1234, data: '2026-11-20' }, // à vista
  ]

  it('soma só as compras daquele cartão e daquela fatura', () => {
    const r = resumoFatura(c, '2026-12', L, '2026-11-25')
    expect(r.total).toBe(15050)
    expect(r.pago).toBe(0)
    expect(r.restante).toBe(15050)
    expect(r.itens.map((i) => i.id)).toEqual([2, 1])
    expect(r.status).toBe('aberta')
  })

  it('status ao longo do tempo: aberta → fechada → atrasada → paga', () => {
    expect(resumoFatura(c, '2026-12', L, '2026-12-02').status).toBe('aberta')
    expect(resumoFatura(c, '2026-12', L, '2026-12-03').status).toBe('fechada')
    expect(resumoFatura(c, '2026-12', L, '2026-12-10').status).toBe('fechada') // vence hoje: ainda não atrasou
    expect(resumoFatura(c, '2026-12', L, '2026-12-11').status).toBe('atrasada')
    const parcial = [...L, { id: 6, tipo: 'pagamentoFatura', cartaoId: 1, fatura: '2026-12', valor: 5000, contaId: 1, data: '2026-12-08' }]
    const rp = resumoFatura(c, '2026-12', parcial, '2026-12-11')
    expect(rp.status).toBe('atrasada')
    expect(rp.restante).toBe(10050)
    const total = [...parcial, { id: 7, tipo: 'pagamentoFatura', cartaoId: 1, fatura: '2026-12', valor: 10050, contaId: 1, data: '2026-12-09' }]
    const rt = resumoFatura(c, '2026-12', total, '2026-12-11')
    expect(rt.status).toBe('paga')
    expect(rt.restante).toBe(0)
    expect(rt.pago).toBe(15050)
  })

  it('faturas pendentes incluem fatura fechada não paga além da aberta', () => {
    const cartao = { id: 5, diaFechamento: 15, diaVencimento: 25 }
    const lanc = [
      { id: 1, tipo: 'despesa', cartaoId: 5, fatura: '2026-11', valor: 30000, data: '2026-11-01' },
      { id: 2, tipo: 'despesa', cartaoId: 5, fatura: '2026-10', valor: 10000, data: '2026-10-01' },
      { id: 3, tipo: 'pagamentoFatura', cartaoId: 5, fatura: '2026-10', valor: 10000, contaId: 1, data: '2026-10-20' },
      { id: 4, tipo: 'despesa', cartaoId: 5, fatura: '2026-12', valor: 2000, data: '2026-11-18' },
    ]
    // Em 20/nov: a fatura de novembro fechou dia 15 e vence dia 25; a de dezembro está aberta
    expect(faturaAtual(cartao, '2026-11-20')).toBe('2026-12')
    const p = faturasPendentes(cartao, lanc, '2026-11-20')
    expect(p.map((x) => [x.fatura, x.status, x.restante])).toEqual([
      ['2026-11', 'fechada', 30000],
      ['2026-12', 'aberta', 2000],
    ])
  })

  it('limite usado considera parcelas futuras e pagamentos', () => {
    const lanc = [
      { tipo: 'despesa', cartaoId: 1, valor: 30000 },
      { tipo: 'despesa', cartaoId: 1, valor: 30000 },
      { tipo: 'pagamentoFatura', cartaoId: 1, valor: 30000 },
      { tipo: 'despesa', cartaoId: 2, valor: 99900 },
    ]
    expect(limiteUsado({ id: 1 }, lanc)).toBe(30000)
    expect(limiteUsado({ id: 2 }, lanc)).toBe(99900)
    expect(limiteUsado({ id: 3 }, lanc)).toBe(0)
  })
})
