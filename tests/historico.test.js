import { describe, it, expect } from 'vitest'
import { movimentos, saldoInicialDe, serie, compararMeses, compararAnos, acumuladoDoMes, variacao, periodosDisponiveis, resumoPeriodo } from '../src/lib/historico.js'
import { saldoConta } from '../src/lib/calculos.js'
import { aleatorio, pad } from './ajuda.js'

const S = 'santander', I = 'inter', CART = 'cartao'
const contas = [{ id: S, saldoInicial: 100000 }, { id: I, saldoInicial: 5000 }]
const L = [
  { tipo: 'receita', valor: 500000, contaId: S, data: '2025-01-05', categoriaId: 'sal' },
  { tipo: 'despesa', valor: 10000, contaId: S, cartaoId: null, data: '2025-01-10', categoriaId: 'alim' },
  { tipo: 'despesa', valor: 99999, contaId: null, cartaoId: CART, data: '2025-01-11', categoriaId: 'alim' }, // cartão: não é caixa
  { tipo: 'transferencia', valor: 20000, contaId: S, contaDestinoId: I, data: '2025-02-01' },
  { tipo: 'pagamentoFatura', valor: 99999, contaId: S, cartaoId: CART, data: '2025-02-10' },
  { tipo: 'despesa', valor: 3000, contaId: S, cartaoId: null, data: '2026-01-10', categoriaId: 'transp' },
  { tipo: 'receita', valor: 600000, contaId: S, data: '2026-01-05', categoriaId: 'sal' },
  { tipo: 'despesa', valor: 7000, contaId: I, cartaoId: null, data: '2026-01-12', categoriaId: 'alim' },
]
const HOJE = '2026-01-20'

describe('movimentos de caixa', () => {
  it('uma conta: transferências e pagamento de fatura contam; compra no cartão não', () => {
    const m = movimentos(L, S)
    expect(m.map((x) => [x.data, x.entrada, x.saida])).toEqual([
      ['2025-01-05', 500000, 0], ['2025-01-10', 0, 10000], ['2025-02-01', 0, 20000], ['2025-02-10', 0, 99999],
      ['2026-01-05', 600000, 0], ['2026-01-10', 0, 3000],
    ])
  })
  it('conta que recebe a transferência: entra como entrada, e o saldo bate', () => {
    const m = movimentos(L, I)
    expect(m.map((x) => [x.data, x.entrada, x.saida])).toEqual([['2025-02-01', 20000, 0], ['2026-01-12', 0, 7000]])
    const s = serie({ granularidade: 'mes', ano: 2025, movs: m, saldoInicial: 5000, hoje: HOJE })
    expect(s[1].saldoFim).toBe(saldoConta(contas[1], L, '2025-02-28'))
  })

  it('todas as contas: transferência entre as suas contas não conta', () => {
    const m = movimentos(L, null)
    expect(m.some((x) => x.tipo === 'transferencia')).toBe(false)
    expect(m.reduce((s, x) => s + x.entrada - x.saida, 0)).toBe(500000 - 10000 - 99999 + 600000 - 3000 - 7000)
  })
  it('saldo inicial de uma conta ou de todas', () => {
    expect(saldoInicialDe(contas, S)).toBe(100000)
    expect(saldoInicialDe(contas, null)).toBe(105000)
  })
})

describe('série por ano / mês / dia', () => {
  it('saldo no fim de cada período bate com o saldo da conta (calculado do jeito normal)', () => {
    const movs = movimentos(L, S)
    for (const gran of ['ano', 'mes', 'dia']) {
      const s = serie({ granularidade: gran, ano: 2025, mes: '2025-02', movs, saldoInicial: 100000, hoje: HOJE })
      for (const p of s) if (p.saldoFim != null) expect(p.saldoFim, `${gran} ${p.chave}`).toBe(saldoConta(contas[0], L, p.fim))
    }
  })
  it('anual: do primeiro ano com dados até o ano atual', () => {
    const s = serie({ granularidade: 'ano', movs: movimentos(L, S), saldoInicial: 100000, hoje: HOJE })
    expect(s.map((p) => [p.chave, p.entradas, p.saidas])).toEqual([['2025', 500000, 129999], ['2026', 600000, 3000]])
  })
  it('mês: 12 meses; meses futuros sem saldo (não desenha o futuro)', () => {
    const s = serie({ granularidade: 'mes', ano: 2026, movs: movimentos(L, S), saldoInicial: 100000, hoje: HOJE })
    expect(s.length).toBe(12)
    expect(s[0].saldoFim).not.toBeNull()
    expect(s[1].saldoFim).toBeNull()
  })
  it('dia: um ponto por dia do mês (fevereiro de ano bissexto tem 29)', () => {
    expect(serie({ granularidade: 'dia', mes: '2028-02', movs: [], saldoInicial: 0, hoje: '2028-03-01' }).length).toBe(29)
    expect(serie({ granularidade: 'dia', mes: '2026-01', movs: movimentos(L, S), saldoInicial: 100000, hoje: HOJE }).filter((p) => p.saldoFim == null).length).toBe(11)
  })
  it('a soma das entradas e saídas dos períodos é igual ao total (5 mil movimentos aleatórios)', () => {
    const r = aleatorio(99)
    const movs = Array.from({ length: 5000 }, () => {
      const v = r.inteiro(1, 100000)
      return { data: `${r.inteiro(2024, 2026)}-${pad(r.inteiro(1, 12))}-${pad(r.inteiro(1, 28))}`, entrada: r.prox() < 0.3 ? v : 0, saida: r.prox() < 0.3 ? 0 : v }
    }).sort((a, b) => a.data.localeCompare(b.data))
    const s = serie({ granularidade: 'ano', movs, saldoInicial: 777, hoje: '2026-12-31' })
    const total = movs.reduce((t, m) => t + m.entrada - m.saida, 777)
    expect(s[s.length - 1].saldoFim).toBe(total)
    expect(s.reduce((t, p) => t + p.entradas, 0)).toBe(movs.reduce((t, m) => t + m.entrada, 0))
    for (const ano of [2024, 2025, 2026]) {
      const meses = serie({ granularidade: 'mes', ano, movs, saldoInicial: 777, hoje: '2026-12-31' })
      expect(meses.reduce((t, p) => t + p.saidas, 0)).toBe(s.find((p) => p.chave === String(ano)).saidas)
      expect(meses[11].saldoFim).toBe(s.find((p) => p.chave === String(ano)).saldoFim)
    }
  })
})

describe('comparações', () => {
  it('meses: totais, variação e gastos por categoria', () => {
    const c = compararMeses(movimentos(L, S), '2025-01', '2026-01', HOJE)
    expect(c.a).toMatchObject({ entradas: 500000, saidas: 10000 })
    expect(c.b).toMatchObject({ entradas: 600000, saidas: 3000 })
    expect(c.variacaoSaidas).toBe(-70)
    expect(c.variacaoEntradas).toBe(20)
    expect(c.categorias.map((x) => [x.categoriaId, x.a, x.b])).toEqual([['alim', 10000, 0], ['transp', 0, 3000]])
  })
  it('ritmo do mês: saídas acumuladas, sem desenhar dias futuros', () => {
    const a = acumuladoDoMes(movimentos(L, S), '2026-01', HOJE)
    expect(a.length).toBe(31)
    expect(a[8]).toBe(0)
    expect(a[9]).toBe(3000)
    expect(a[19]).toBe(3000)
    expect(a[20]).toBeNull()
  })
  it('anos: compara só os mesmos meses quando o ano atual ainda não acabou', () => {
    const c = compararAnos(movimentos(L, S), 2025, 2026, HOJE)
    expect(c.mesesComparados).toBe(1) // estamos em janeiro de 2026: compara jan x jan
    expect(c.ateAgoraA).toEqual({ entradas: 500000, saidas: 10000 })
    expect(c.ateAgoraB).toEqual({ entradas: 600000, saidas: 3000 })
    expect(c.totalA.saidas).toBe(129999) // o ano de 2025 inteiro
    expect(c.variacaoSaidas).toBe(-70)
    expect(c.meses[1].a.saidas).toBe(119999)
  })
  it('anos que já acabaram: compara os 12 meses', () => {
    expect(compararAnos(movimentos(L, S), 2024, 2025, HOJE).mesesComparados).toBe(12)
  })
  it('variação: sem base não inventa número', () => {
    expect(variacao(0, 100)).toBeNull()
    expect(variacao(200, 100)).toBe(-50)
    expect(variacao(300, 400)).toBe(33.3)
  })
  it('períodos disponíveis incluem o mês e o ano atuais', () => {
    const d = periodosDisponiveis(movimentos(L, S), '2026-11-21')
    expect(d.anos).toEqual([2025, 2026])
    expect(d.meses[0]).toBe('2025-01')
    expect(d.meses[d.meses.length - 1]).toBe('2026-11')
  })
  it('resumo de período só conta categoria de despesa', () => {
    const r = resumoPeriodo(movimentos(L, S), '2025-02-01', '2025-02-28')
    expect(r.saidas).toBe(119999)
    expect(r.porCategoria.size).toBe(0) // transferência e fatura não são categoria de gasto
  })
})
