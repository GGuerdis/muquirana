import { describe, it, expect } from 'vitest'
import { gastosPorCategoria } from '../src/lib/historico.js'

// lançamentos inventados
const L = [
  { tipo: 'despesa', valor: 1000, data: '2026-01-10', categoriaId: 'merc' },
  { tipo: 'despesa', valor: 500, data: '2026-01-20', categoriaId: 'merc', cartaoId: 'k1' },
  { tipo: 'despesa', valor: 3000, data: '2026-02-05', categoriaId: 'mor' },
  { tipo: 'despesa', valor: 700, data: '2026-03-01', categoriaId: 'merc' },
  { tipo: 'despesa', valor: 200, data: '2025-12-31', categoriaId: 'merc' },
  { tipo: 'despesa', valor: 90, data: '2026-02-02', categoriaId: null },
  { tipo: 'receita', valor: 99999, data: '2026-01-05', categoriaId: 'sal' },
  { tipo: 'transferencia', valor: 5000, data: '2026-01-06' },
]

describe('gastos por categoria ao longo do tempo', () => {
  it('soma só despesas (conta e cartão), por mês do ano escolhido', () => {
    const r = gastosPorCategoria(L, { granularidade: 'mes', ano: 2026, hoje: '2026-11-24' })
    expect(r.categorias).toEqual([{ categoriaId: 'mor', total: 3000 }, { categoriaId: 'merc', total: 2200 }, { categoriaId: null, total: 90 }])
    const merc = r.serieDe('merc')
    expect(merc).toHaveLength(12)
    expect(merc.slice(0, 4).map((p) => p.valor)).toEqual([1500, 0, 700, 0])
    expect(merc[0].rotulo).toBe('jan')
  })
  it('meses que ainda não chegaram ficam sem valor', () => {
    const r = gastosPorCategoria(L, { granularidade: 'mes', ano: 2026, hoje: '2026-03-15' })
    const v = r.serieDe('merc').map((p) => p.valor)
    expect(v[2]).toBe(700)
    expect(v[3]).toBeNull()
    expect(v[11]).toBeNull()
  })
  it('por ano: um ponto para cada ano com gastos', () => {
    const r = gastosPorCategoria(L, { granularidade: 'ano', ano: 2026, hoje: '2026-11-24' })
    expect(r.serieDe('merc').map((p) => [p.chave, p.valor])).toEqual([['2025', 200], ['2026', 2200]])
  })
  it('sem gastos: nenhuma categoria e série zerada', () => {
    const r = gastosPorCategoria([], { granularidade: 'mes', ano: 2026, hoje: '2026-11-24' })
    expect(r.categorias).toEqual([])
    expect(r.serieDe('x').filter((p) => p.valor === 0)).toHaveLength(11)
  })
})
