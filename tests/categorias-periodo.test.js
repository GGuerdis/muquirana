// Relatórios → Categorias: quanto foi gasto em cada categoria num período, e tudo de uma categoria. Dados FICTÍCIOS.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { intervaloDoPeriodo, mesesNoIntervalo, totaisPorCategoria, detalheDaCategoria, PERIODOS_CATEGORIA } from '../src/lib/relatorios.js'

const ler = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const DIA = '2026-11-25'
let n = 0
const g = (data, valor, categoriaId, extra = {}) => ({ id: `x${++n}`, tipo: 'despesa', contaId: 'c', valor, data, categoriaId, ...extra })
const L = [
  g('2026-11-02', 10000, 'saude'), g('2026-11-20', 5000, 'saude'), g('2026-11-10', 30000, 'transporte'),
  g('2026-10-05', 20000, 'saude'), g('2026-09-30', 7000, 'saude'), g('2026-08-31', 99900, 'saude'),
  g('2026-11-12', 4000, 'transporte', { cartaoId: 'k', contaId: null }), // compra no cartão conta pela data
  g('2026-11-26', 50000, 'saude'), // amanhã (agendado): fora de "até hoje"
  g('2026-11-15', 1500, null), // sem categoria
  g('2026-11-16', 500, undefined), // sem categoria (campo vazio)
  { id: 'r1', tipo: 'receita', contaId: 'c', valor: 300000, data: '2026-11-05', categoriaId: 'sal' },
  { id: 't1', tipo: 'transferencia', contaId: 'c', contaDestinoId: 'd', valor: 80000, data: '2026-11-06' },
]

describe('período', () => {
  it('este mês, 3 meses, 6 meses e este ano vão até hoje; "3 meses" inclui o mês atual inteiro desde o dia 1', () => {
    expect(intervaloDoPeriodo('mes', { dia: DIA })).toEqual({ de: '2026-11-01', ate: DIA })
    expect(intervaloDoPeriodo('3m', { dia: DIA })).toEqual({ de: '2026-09-01', ate: DIA })
    expect(intervaloDoPeriodo('6m', { dia: DIA })).toEqual({ de: '2026-06-01', ate: DIA })
    expect(intervaloDoPeriodo('ano', { dia: DIA })).toEqual({ de: '2026-01-01', ate: DIA })
    expect(intervaloDoPeriodo('3m', { dia: '2026-02-10' })).toEqual({ de: '2025-12-01', ate: '2026-02-10' })
  })
  it('datas escolhidas: invertidas são trocadas; inválidas caem no padrão (início do mês até hoje)', () => {
    expect(intervaloDoPeriodo('livre', { dia: DIA, de: '2026-03-10', ate: '2026-01-05' })).toEqual({ de: '2026-01-05', ate: '2026-03-10' })
    expect(intervaloDoPeriodo('livre', { dia: DIA, de: '2026-02-31', ate: '' })).toEqual({ de: '2026-11-01', ate: DIA })
  })
  it('meses que o período toca', () => {
    expect(mesesNoIntervalo({ de: '2026-09-10', ate: '2026-11-05' })).toBe(3)
    expect(mesesNoIntervalo({ de: '2025-12-31', ate: '2026-01-01' })).toBe(2)
    expect(mesesNoIntervalo({ de: '2026-11-01', ate: '2026-11-25' })).toBe(1)
  })
  it('as opções aparecem na ordem: mês, 3, 6, ano, datas', () => {
    expect(PERIODOS_CATEGORIA.map((p) => p.valor)).toEqual(['mes', '3m', '6m', 'ano', 'livre'])
  })
})

describe('totais por categoria', () => {
  it('no mês: só despesas do período (com cartão), da maior para a menor, com quantidade; sem categoria vira null', () => {
    const t = totaisPorCategoria(L, intervaloDoPeriodo('mes', { dia: DIA }))
    expect(t.categorias).toEqual([
      { categoriaId: 'transporte', total: 34000, quantidade: 2 },
      { categoriaId: 'saude', total: 15000, quantidade: 2 },
      { categoriaId: null, total: 2000, quantidade: 2 },
    ])
    expect(t.total).toBe(51000)
  })
  it('as bordas do período contam (1º dia e hoje); o dia antes não', () => {
    const t = totaisPorCategoria(L, { de: '2026-09-30', ate: '2026-11-02' })
    expect(t.categorias.find((c) => c.categoriaId === 'saude')).toEqual({ categoriaId: 'saude', total: 37000, quantidade: 3 })
  })
  it('entradas, quando pedido', () => {
    expect(totaisPorCategoria(L, intervaloDoPeriodo('mes', { dia: DIA }), 'receita').categorias).toEqual([{ categoriaId: 'sal', total: 300000, quantidade: 1 }])
  })
})

describe('tudo de uma categoria', () => {
  it('lançamentos do mais novo para o mais velho, total, média pelos meses do período e total de cada mês', () => {
    const d = detalheDaCategoria(L, 'saude', intervaloDoPeriodo('3m', { dia: DIA }))
    expect(d.itens.map((l) => l.data)).toEqual(['2026-11-20', '2026-11-02', '2026-10-05', '2026-09-30'])
    expect(d.total).toBe(42000)
    expect(d.meses).toBe(3)
    expect(d.mediaPorMes).toBe(14000)
    expect(d.porMes).toEqual([{ mes: '2026-09', total: 7000 }, { mes: '2026-10', total: 20000 }, { mes: '2026-11', total: 15000 }])
  })
  it('"Sem categoria" também abre; mês sem gasto aparece com zero', () => {
    const d = detalheDaCategoria(L, null, { de: '2026-10-01', ate: DIA })
    expect(d.itens.map((l) => l.valor)).toEqual([500, 1500])
    expect(d.mediaPorMes).toBe(1000) // 2 meses no período, mesmo um sem gasto
    expect(d.porMes).toEqual([{ mes: '2026-10', total: 0 }, { mes: '2026-11', total: 2000 }])
  })
})

describe('na tela', () => {
  it('Relatórios abre na aba Categorias; tocar numa categoria mostra os lançamentos dela', () => {
    const r = ler('pages/Relatorios.jsx')
    expect(r).toMatch(/const VISTAS = \[\{ valor: 'categorias', rotulo: 'Categorias' \}/)
    expect(r).toMatch(/useState\('categorias'\)/)
    expect(r).toMatch(/onClick=\{\(\) => setAberta\(c\.categoriaId\)\}/)
    expect(r).toMatch(/d\.itens\.map\(\(l\) => <ItemLancamento key=\{l\.id\} l=\{l\} mostrarData \/>\)/)
  })
})
