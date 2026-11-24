import { describe, it, expect, beforeEach } from 'vitest'
import { db, exportarBackup, validarBackup, ehBackupDoApp, restaurarBackup, criarDadosIniciais, APP_BACKUP } from '../src/lib/db.js'

beforeEach(async () => {
  db.close()
  await db.delete()
  await db.open()
})

describe('troca de nome para Mukirana', () => {
  it('backup novo sai com o nome novo', async () => {
    await criarDadosIniciais()
    const b = await exportarBackup()
    expect(APP_BACKUP).toBe('mukirana')
    expect(b.app).toBe('mukirana')
    expect(() => validarBackup(b)).not.toThrow()
  })
  it('backup feito antes da troca (muquirana) continua valendo', async () => {
    await criarDadosIniciais()
    const antigo = { ...(await exportarBackup()), app: 'muquirana' }
    expect(ehBackupDoApp(antigo)).toBe(true)
    expect(() => validarBackup(antigo)).not.toThrow()
    await expect(restaurarBackup(antigo)).resolves.not.toThrow()
  })
  it('arquivo de outro app ou sem dados é recusado', () => {
    expect(ehBackupDoApp({ app: 'outro', dados: {} })).toBe(false)
    expect(ehBackupDoApp({ app: 'mukirana' })).toBe(false)
    expect(ehBackupDoApp(null)).toBe(false)
    expect(() => validarBackup({ app: 'outro', dados: { lancamentos: [], contas: [] } })).toThrow(/Mukirana/)
  })
})
