import { describe, it, expect } from 'vitest'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { humorDoMes } from '../src/lib/zoeira.js'

const conta = { id: 1, saldoInicial: 100000 }
const L = [
  { id: 1, tipo: 'receita', contaId: 1, valor: 500000, data: '2026-11-05', categoriaId: 20 },
  { id: 2, tipo: 'despesa', contaId: 1, cartaoId: null, valor: 4590, data: '2026-11-06', categoriaId: 1 },
  { id: 3, tipo: 'despesa', contaId: null, cartaoId: 7, valor: 30000, data: '2026-11-07', categoriaId: 2, fatura: '2026-12' }, // cartão: não mexe no saldo
  { id: 4, tipo: 'transferencia', contaId: 1, contaDestinoId: 2, valor: 20000, data: '2026-11-08' },
  { id: 5, tipo: 'transferencia', contaId: 2, contaDestinoId: 1, valor: 5000, data: '2026-11-09' },
  { id: 6, tipo: 'pagamentoFatura', contaId: 1, cartaoId: 7, valor: 30000, data: '2026-11-10', fatura: '2026-12' },
  { id: 7, tipo: 'despesa', contaId: 1, cartaoId: null, valor: 99900, data: '2026-12-15', categoriaId: 1 }, // futuro
  { id: 8, tipo: 'receita', contaId: 2, valor: 77700, data: '2026-11-05', categoriaId: 20 }, // outra conta
  { id: 9, tipo: 'despesa', contaId: 1, cartaoId: null, valor: 1000, data: '2026-10-31', categoriaId: 1 }, // mês anterior
]

describe('saldo da conta', () => {
  it('soma receitas, transferências recebidas; subtrai despesas à vista, transferências enviadas e pagamentos de fatura', () => {
    // 100000 + 500000 - 4590 - 20000 + 5000 - 30000 - 1000 = 549410
    expect(saldoConta(conta, L, '2026-11-20')).toBe(549410)
  })
  it('lançamentos com data futura só contam quando a data chega', () => {
    expect(saldoConta(conta, L, '2026-12-14')).toBe(549410)
    expect(saldoConta(conta, L, '2026-12-15')).toBe(549410 - 99900)
  })
  it('compras no cartão não mexem no saldo da conta', () => {
    expect(saldoConta(conta, L.filter((l) => l.id !== 3), '2026-11-20')).toBe(549410)
  })
  it('transferência entre contas não muda o total', () => {
    const c2 = { id: 2, saldoInicial: 0 }
    const so = L.filter((l) => l.tipo === 'transferencia')
    expect(saldoConta(conta, so, '2026-11-20') + saldoConta(c2, so, '2026-11-20')).toBe(100000)
  })
})

describe('resumo do mês', () => {
  it('conta receitas e despesas (inclusive cartão), ignora transferências e pagamentos de fatura', () => {
    const r = resumoMes('2026-11', L)
    expect(r.entrou).toBe(500000 + 77700)
    expect(r.saiu).toBe(4590 + 30000)
    expect(r.resultado).toBe(577700 - 34590)
    expect(r.categorias).toEqual([
      { categoriaId: 2, valor: 30000 },
      { categoriaId: 1, valor: 4590 },
    ])
    expect(r.categorias.reduce((s, c) => s + c.valor, 0)).toBe(r.saiu)
  })
  it('mês sem nada', () => {
    expect(resumoMes('2030-01', L)).toEqual({ entrou: 0, saiu: 0, resultado: 0, categorias: [] })
  })
})

describe('humor do Muquirana', () => {
  const r = (entrou, saiu) => ({ entrou, saiu })
  it.each([
    [r(0, 0), true, 'sumido'],
    [r(0, 500), true, 'semEntrada'],
    [r(1000, 1001), true, 'chorando'],
    [r(1000, 801), true, 'suando'],
    [r(1000, 800), false, 'comemorando'],
  ])('%o mês atual=%s → %s', (resumo, atual, humor) => {
    expect(humorDoMes(resumo, atual, true).humor).toBe(humor)
  })
  it('modo sério não faz piada', () => {
    expect(humorDoMes(r(1000, 2000), true, false).mensagem).toBe('Os gastos do mês passaram das entradas.')
  })
})
