// Quem já usa o app (banco versão 1) não pode perder nada ao receber a atualização
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'

describe('migração do banco da versão 1 para a 2', () => {
  it('mantém contas, cartões e lançamentos e cria as tabelas novas', async () => {
    const antigo = new Dexie('muquirana')
    antigo.version(1).stores({
      contas: '++id, nome',
      cartoes: '++id, nome',
      categorias: '++id, tipo, nome',
      lancamentos: '++id, data, tipo, contaId, cartaoId, fatura, categoriaId, grupoParcelaId',
      config: 'chave',
    })
    await antigo.open()
    await antigo.contas.bulkAdd([{ nome: 'Santander', emoji: '🔴', saldoInicial: 123456 }])
    await antigo.categorias.add({ tipo: 'despesa', emoji: '🍔', nome: 'Alimentação' })
    await antigo.lancamentos.bulkAdd([
      { tipo: 'despesa', valor: 4590, contaId: 1, cartaoId: null, categoriaId: 1, data: '2026-11-20', criadoEm: 1 },
      { tipo: 'despesa', valor: 30000, contaId: null, cartaoId: 1, categoriaId: 1, data: '2026-11-20', fatura: '2026-12', criadoEm: 2, grupoParcelaId: 'g', parcela: 1, totalParcelas: 2, valorTotal: 60000, dataCompra: '2026-11-20' },
    ])
    await antigo.config.bulkAdd([{ chave: 'boasVindas', valor: true }, { chave: 'zoeira', valor: false }])
    antigo.close()

    const { db } = await import('../src/lib/db.js')
    await db.open()
    expect(db.verno).toBe(2)
    expect(await db.contas.toArray()).toEqual([{ id: 1, nome: 'Santander', emoji: '🔴', saldoInicial: 123456 }])
    expect(await db.lancamentos.count()).toBe(2)
    expect((await db.lancamentos.where('grupoParcelaId').equals('g').first()).valorTotal).toBe(60000)
    expect((await db.config.get('zoeira')).valor).toBe(false)
    // não recria contas/categorias padrão em cima dos dados de quem já usava
    expect(await db.categorias.count()).toBe(1)
    expect(await db.regras.count()).toBe(0)
    expect(await db.recorrentes.count()).toBe(0)
    expect(await db.orcamentos.count()).toBe(0)
    // índice novo funciona
    await db.lancamentos.update(1, { idExterno: 'conta:1:f:X' })
    expect(await db.lancamentos.where('idExterno').equals('conta:1:f:X').count()).toBe(1)
  })
})
