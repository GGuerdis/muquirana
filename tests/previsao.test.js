// Previsão do saldo nos próximos meses (dados FICTÍCIOS)
import { describe, it, expect } from 'vitest'
import { previsaoSaldo, efeitoNasContas } from '../src/lib/previsao.js'
import { saldoPrevisto } from '../src/lib/recorrentes.js'

const HOJE = '2026-11-24'
const contas = [{ id: 'a', saldoInicial: 100000 }, { id: 'b', saldoInicial: 50000 }]
const cartao = { id: 'k', nome: 'Inter', diaFechamento: 10, diaVencimento: 17 }
const L = (o) => ({ id: Math.random().toString(36).slice(2), descricao: 'x', ...o })

describe('efeito de um lançamento na soma das contas', () => {
  const ids = new Set(['a', 'b'])
  it('receita soma, despesa na conta tira, compra no cartão não mexe', () => {
    expect(efeitoNasContas({ tipo: 'receita', contaId: 'a', valor: 10 }, ids)).toBe(10)
    expect(efeitoNasContas({ tipo: 'despesa', contaId: 'a', valor: 10 }, ids)).toBe(-10)
    expect(efeitoNasContas({ tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 10 }, ids)).toBe(0)
  })
  it('transferência entre contas suas não muda o total; para fora, tira', () => {
    expect(efeitoNasContas({ tipo: 'transferencia', contaId: 'a', contaDestinoId: 'b', valor: 10 }, ids)).toBe(0)
    expect(efeitoNasContas({ tipo: 'transferencia', contaId: 'a', contaDestinoId: 'z', valor: 10 }, ids)).toBe(-10)
    expect(efeitoNasContas({ tipo: 'pagamentoFatura', contaId: 'b', valor: 10 }, ids)).toBe(-10)
  })
})

describe('previsão', () => {
  it('sem nada agendado, o saldo fica igual até o fim', () => {
    const p = previsaoSaldo({ contas, cartoes: [], recorrentes: [], lancamentos: [], meses: 3, dia: HOJE })
    expect(p.saldoHoje).toBe(150000)
    expect(p.saldoFinal).toBe(150000)
    expect(p.fim).toBe('2027-01-31')
    expect(p.fimDosMeses.map((m) => m.mes)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(p.dias[0]).toEqual({ data: HOJE, saldo: 150000 })
  })

  it('agendados, contas fixas e faturas (com parcelas futuras) entram no dia certo', () => {
    const lancamentos = [
      L({ tipo: 'receita', contaId: 'a', valor: 500000, data: '2026-12-05', descricao: 'Salário' }), // agendado
      L({ tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 30000, data: '2026-11-20', fatura: '2026-12' }), // fatura de dez (vence 17/12)
      L({ tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 10000, data: '2026-11-20', fatura: '2027-01', parcela: 2 }), // parcela futura
      L({ tipo: 'despesa', contaId: 'a', valor: 999999, data: '2027-03-01' }), // depois do período: fora
    ]
    const recorrentes = [{ id: 'r1', descricao: 'Aluguel', tipo: 'despesa', valor: 180000, dia: 10, contaId: 'a', cartaoId: null, categoriaId: 'c', inicio: '2026-01', fim: null, pulados: ['2027-01'] }]
    const p = previsaoSaldo({ contas, cartoes: [cartao], recorrentes, lancamentos, meses: 3, dia: HOJE })
    const ev = p.eventos.map((e) => [e.data, e.valor, e.origem])
    expect(ev).toEqual([
      [HOJE, -180000, 'fixa'], // aluguel de novembro (dia 10) não foi lançado: atrasado, entra hoje
      ['2026-12-05', 500000, 'agendado'],
      ['2026-12-10', -180000, 'fixa'],
      ['2026-12-17', -30000, 'fatura'],
      ['2027-01-17', -10000, 'fatura'],
    ]) // janeiro foi pulado
    expect(p.saldoFinal).toBe(150000 + 500000 - 2 * 180000 - 30000 - 10000)
  })

  it('conta fixa atrasada e fatura atrasada entram hoje; o dia mais apertado aparece', () => {
    const recorrentes = [{ id: 'r1', descricao: 'Luz', tipo: 'despesa', valor: 20000, dia: 5, contaId: 'b', cartaoId: null, categoriaId: 'c', inicio: '2026-11', fim: '2026-11', pulados: [] }]
    const lancamentos = [L({ tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 200000, data: '2026-10-01', fatura: '2026-11' })] // venceu 17/11, não paga
    const p = previsaoSaldo({ contas, cartoes: [cartao], recorrentes, lancamentos, meses: 2, dia: HOJE })
    expect(p.eventos.map((e) => [e.data, e.valor])).toEqual([[HOJE, -200000], [HOJE, -20000]])
    expect(p.menor).toEqual({ data: HOJE, saldo: 150000 - 220000 })
  })

  it('conta fixa paga já lançada ou fatura paga não contam de novo', () => {
    const recorrentes = [{ id: 'r1', descricao: 'Aluguel', tipo: 'despesa', valor: 180000, dia: 28, contaId: 'a', cartaoId: null, categoriaId: 'c', inicio: '2026-11', fim: '2026-11', pulados: [] }]
    const lancamentos = [
      L({ tipo: 'despesa', contaId: 'a', valor: 180000, data: '2026-11-28', recorrenteId: 'r1', competencia: '2026-11' }),
      L({ tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 5000, data: '2026-11-01', fatura: '2026-12' }),
      L({ tipo: 'pagamentoFatura', cartaoId: 'k', contaId: 'a', valor: 5000, data: '2026-11-02', fatura: '2026-12' }),
    ]
    const p = previsaoSaldo({ contas, cartoes: [cartao], recorrentes, lancamentos, meses: 2, dia: HOJE })
    expect(p.eventos.map((e) => [e.data, e.valor, e.origem])).toEqual([['2026-11-28', -180000, 'agendado']])
  })

  it('conta fixa no cartão vai para a fatura certa', () => {
    const recorrentes = [{ id: 'r2', descricao: 'Streaming', tipo: 'despesa', valor: 4490, dia: 12, contaId: null, cartaoId: 'k', categoriaId: 'c', inicio: '2026-12', fim: '2026-12', pulados: [] }]
    const p = previsaoSaldo({ contas, cartoes: [cartao], recorrentes, lancamentos: [], meses: 3, dia: HOJE })
    // compra em 12/12 (depois do fechamento dia 10) cai na fatura de janeiro, vence 17/01
    expect(p.eventos.map((e) => [e.data, e.valor, e.descricao])).toEqual([['2027-01-17', -4490, 'Fatura Inter']])
  })

  it('o fim do mês atual bate com o "Previsto" do Início', () => {
    const recorrentes = [{ id: 'r1', descricao: 'Aluguel', tipo: 'despesa', valor: 180000, dia: 28, contaId: 'a', cartaoId: null, categoriaId: 'c', inicio: '2026-01', fim: null, pulados: [] }]
    const lancamentos = [
      L({ tipo: 'receita', contaId: 'a', valor: 7000, data: '2026-11-26' }),
      L({ tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 30000, data: '2026-10-20', fatura: '2026-11' }),
    ]
    const p = previsaoSaldo({ contas, cartoes: [cartao], recorrentes, lancamentos, meses: 1, dia: HOJE })
    const inicio = saldoPrevisto({ mes: '2026-11', contas, cartoes: [cartao], recorrentes, lancamentos, dia: HOJE })
    expect(p.fimDosMeses[0].saldo).toBe(inicio.previsto)
  })
})
