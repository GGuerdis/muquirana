import { describe, it, expect } from 'vitest'
import { somarMeses, somarMesesData, dataNoMes, diasNoMes, dataValida, mesDe } from '../src/lib/datas.js'
import { dividirParcelas, valorValido, formatar, VALOR_MAXIMO } from '../src/lib/dinheiro.js'
import { aleatorio } from './ajuda.js'

describe('datas', () => {
  it('soma meses atravessando anos, para frente e para trás', () => {
    expect(somarMeses('2026-11', 1)).toBe('2026-12')
    expect(somarMeses('2026-12', 1)).toBe('2027-01')
    expect(somarMeses('2026-01', -1)).toBe('2025-12')
    expect(somarMeses('2026-05', 24)).toBe('2028-05')
    expect(somarMeses('2026-05', -17)).toBe('2024-12')
    expect(somarMeses('2026-05', 0)).toBe('2026-05')
  })

  it('mantém o dia ao somar meses, limitando ao fim do mês', () => {
    expect(somarMesesData('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMesesData('2028-01-31', 1)).toBe('2028-02-29') // ano bissexto
    expect(somarMesesData('2026-01-31', 2)).toBe('2026-03-31')
    expect(somarMesesData('2026-03-31', 1)).toBe('2026-04-30')
    expect(somarMesesData('2026-12-15', 1)).toBe('2027-01-15')
    expect(somarMesesData('2026-08-31', 6)).toBe('2027-02-28')
  })

  it('conhece a quantidade de dias de cada mês', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => diasNoMes(2026, m))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    expect(diasNoMes(2028, 2)).toBe(29)
    expect(diasNoMes(2100, 2)).toBe(28) // não é bissexto
    expect(diasNoMes(2000, 2)).toBe(29)
  })

  it('dataNoMes limita ao último dia', () => {
    expect(dataNoMes('2026-02', 31)).toBe('2026-02-28')
    expect(dataNoMes('2026-04', 31)).toBe('2026-04-30')
    expect(dataNoMes('2026-04', 5)).toBe('2026-04-05')
  })

  it('valida datas', () => {
    expect(dataValida('2026-11-20')).toBe(true)
    expect(dataValida('2028-02-29')).toBe(true)
    for (const ruim of ['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-01', '', null, undefined, 20261120, '20-11-2026']) {
      expect(dataValida(ruim)).toBe(false)
    }
  })

  it('mesDe pega o mês', () => {
    expect(mesDe('2026-11-20')).toBe('2026-11')
  })
})

describe('dinheiro', () => {
  it('divide parcelas com soma exata e diferença na 1ª parcela', () => {
    expect(dividirParcelas(100000, 3)).toEqual([33334, 33333, 33333])
    expect(dividirParcelas(120000, 4)).toEqual([30000, 30000, 30000, 30000])
    expect(dividirParcelas(1, 1)).toEqual([1])
    expect(dividirParcelas(10, 3)).toEqual([4, 3, 3])
  })

  it('a soma das parcelas é sempre igual ao total (10 mil casos aleatórios)', () => {
    const r = aleatorio(7)
    for (let i = 0; i < 10000; i++) {
      const n = r.inteiro(1, 48)
      const total = r.inteiro(n, 50_000_000)
      const p = dividirParcelas(total, n)
      expect(p.length).toBe(n)
      expect(p.reduce((s, v) => s + v, 0)).toBe(total)
      expect(Math.min(...p)).toBeGreaterThan(0)
      expect(Math.max(...p) - Math.min(...p)).toBeLessThan(n) // diferença menor que n centavos
      expect(p.every(Number.isInteger)).toBe(true)
    }
  })

  it('recusa parcelamento inválido', () => {
    expect(() => dividirParcelas(100, 0)).toThrow()
    expect(() => dividirParcelas(10.5, 2)).toThrow()
  })

  it('valida valores', () => {
    expect(valorValido(1)).toBe(true)
    expect(valorValido(VALOR_MAXIMO)).toBe(true)
    expect(valorValido(VALOR_MAXIMO + 1)).toBe(false)
    expect(valorValido(0)).toBe(false)
    expect(valorValido(-5)).toBe(false)
    expect(valorValido(10.5)).toBe(false)
    expect(valorValido(NaN)).toBe(false)
    expect(valorValido('100')).toBe(false)
  })

  it('formata em reais', () => {
    const limpo = (s) => s.replace(/\s/g, ' ')
    expect(limpo(formatar(123456))).toBe('R$ 1.234,56')
    expect(limpo(formatar(5))).toBe('R$ 0,05')
    expect(limpo(formatar(0))).toBe('R$ 0,00')
    expect(limpo(formatar(-1990))).toBe('-R$ 19,90')
  })
})
