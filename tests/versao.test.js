import { describe, it, expect } from 'vitest'
import { estaDesatualizado, VERSAO } from '../src/lib/versao.js'

describe('versão do app', () => {
  it('só avisa quando a publicada é mais nova', () => {
    expect(estaDesatualizado('2026-11-21 10:00', '2026-11-21 13:40')).toBe(true)
    expect(estaDesatualizado('2026-11-21 13:40', '2026-11-21 13:40')).toBe(false)
    expect(estaDesatualizado('2026-11-21 13:40', '2026-11-21 10:00')).toBe(false) // cópia velha no servidor
    expect(estaDesatualizado('2026-11-21 13:40', null)).toBe(false) // sem internet
    expect(estaDesatualizado('dev', '2026-11-21 13:40')).toBe(false) // computador de desenvolvimento
  })
  it('nos testes a versão é "dev"', () => {
    expect(VERSAO).toBe('dev')
  })
})
