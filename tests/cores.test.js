import { describe, it, expect } from 'vitest'
import { tomDaCategoria, desenhoDaCategoria } from '../src/lib/cores.js'
import { CATEGORIAS_PADRAO } from '../src/lib/db.js'
import { DESENHOS_CATEGORIA } from '../src/components/Icones.jsx'

describe('ícones de categoria (losango HUD)', () => {
  it('toda categoria que vem com o app tem um desenho próprio', () => {
    for (const [, , nome] of CATEGORIAS_PADRAO) {
      const d = desenhoDaCategoria(nome)
      expect(d, nome).not.toBeNull()
      expect(DESENHOS_CATEGORIA[d], nome).toBeTruthy()
    }
  })
  it('ignora acento e maiúsculas', () => {
    expect(desenhoDaCategoria('saúde')).toBe('saude')
    expect(desenhoDaCategoria('  Alimentação ')).toBe('alimentacao')
    expect(desenhoDaCategoria('Impostos e taxas')).toBe('impostos')
  })
  it('categoria criada por você não tem desenho (mostra o emoji dela)', () => {
    expect(desenhoDaCategoria('Apartamento')).toBeNull()
    expect(desenhoDaCategoria('')).toBeNull()
    expect(desenhoDaCategoria(undefined)).toBeNull()
  })
  it('desenhos especiais existem (transferência, fatura, demais)', () => {
    for (const k of ['transferencia', 'fatura', 'mais']) expect(DESENHOS_CATEGORIA[k]).toBeTruthy()
  })
  it('a cor é estável e fica entre 0 e 359', () => {
    expect(tomDaCategoria('Mercado')).toBe(tomDaCategoria('MERCADO'))
    expect(tomDaCategoria('Apartamento')).toBe(tomDaCategoria('apartamento'))
    for (const n of ['Apartamento', 'Pets', 'Viagem', 'x']) {
      const t = tomDaCategoria(n)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(360)
    }
  })
})
