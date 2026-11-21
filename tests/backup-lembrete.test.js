import { describe, it, expect } from 'vitest'
import { lembreteBackup, adiarPara } from '../src/lib/backupArquivo.js'

const base = { hoje: '2026-11-21', totalLancamentos: 500 }

describe('lembrete de backup', () => {
  it('poucos dados: não lembra', () => {
    expect(lembreteBackup({ ...base, totalLancamentos: 19 })).toBeNull()
    expect(lembreteBackup({ ...base, totalLancamentos: 20 })).toEqual({ nunca: true, dias: null })
  })
  it('lembra depois de 30 dias (60 com conta na nuvem)', () => {
    expect(lembreteBackup({ ...base, ultimoBackup: '2026-10-22' })).toBeNull() // 30 dias
    expect(lembreteBackup({ ...base, ultimoBackup: '2026-10-21' })).toEqual({ nunca: false, dias: 31 })
    expect(lembreteBackup({ ...base, ultimoBackup: '2026-10-21', logado: true })).toBeNull()
    expect(lembreteBackup({ ...base, ultimoBackup: '2026-09-21', logado: true })).toEqual({ nunca: false, dias: 61 })
  })
  it('"lembrar depois" adia 7 dias', () => {
    expect(adiarPara('2026-11-21')).toBe('2026-11-28')
    expect(adiarPara('2026-12-28')).toBe('2027-01-04')
    expect(lembreteBackup({ ...base, adiadoAte: '2026-11-28' })).toBeNull()
    expect(lembreteBackup({ ...base, hoje: '2026-11-28', adiadoAte: '2026-11-28' })).toEqual({ nunca: true, dias: null })
  })
})
