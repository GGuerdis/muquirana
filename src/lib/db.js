import Dexie from 'dexie'

// Banco de dados local (IndexedDB): os dados ficam só neste aparelho.
export const db = new Dexie('muquirana')

db.version(1).stores({
  contas: '++id, nome',
  cartoes: '++id, nome',
  categorias: '++id, tipo, nome',
  lancamentos: '++id, data, tipo, contaId, cartaoId, fatura, categoriaId, grupoParcelaId',
  config: 'chave',
})

const CATEGORIAS_PADRAO = [
  ['despesa', '🍔', 'Alimentação'],
  ['despesa', '🛒', 'Mercado'],
  ['despesa', '🏠', 'Moradia'],
  ['despesa', '💡', 'Contas da casa'],
  ['despesa', '🚗', 'Transporte'],
  ['despesa', '💊', 'Saúde'],
  ['despesa', '🎉', 'Lazer'],
  ['despesa', '📱', 'Assinaturas'],
  ['despesa', '👕', 'Compras'],
  ['despesa', '📚', 'Educação'],
  ['despesa', '🎁', 'Presentes'],
  ['despesa', '🧾', 'Impostos e taxas'],
  ['despesa', '📦', 'Outros'],
  ['receita', '💰', 'Salário'],
  ['receita', '💼', 'Freela / extra'],
  ['receita', '📈', 'Rendimentos'],
  ['receita', '🔁', 'Reembolso'],
  ['receita', '🎁', 'Presente'],
  ['receita', '📦', 'Outros'],
]

const CONTAS_PADRAO = [
  { nome: 'Santander', emoji: '🔴', saldoInicial: 0 },
  { nome: 'Inter', emoji: '🟠', saldoInicial: 0 },
  { nome: 'Carteira', emoji: '👛', saldoInicial: 0 },
]

db.on('populate', async (tx) => {
  await tx.table('contas').bulkAdd(CONTAS_PADRAO)
  await tx.table('categorias').bulkAdd(CATEGORIAS_PADRAO.map(([tipo, emoji, nome]) => ({ tipo, emoji, nome })))
  await tx.table('config').bulkAdd([
    { chave: 'zoeira', valor: true },
    { chave: 'boasVindas', valor: false },
  ])
})

export const salvarConfig = (chave, valor) => db.config.put({ chave, valor })

// ---------- Backup ----------
const TABELAS = ['contas', 'cartoes', 'categorias', 'lancamentos', 'config']

export async function exportarBackup() {
  const dados = {}
  for (const t of TABELAS) dados[t] = await db.table(t).toArray()
  return { app: 'muquirana', versao: 1, exportadoEm: new Date().toISOString(), dados }
}

export async function restaurarBackup(backup) {
  if (backup?.app !== 'muquirana' || !backup.dados) throw new Error('Este arquivo não é um backup do Muquirana.')
  for (const t of TABELAS) {
    if (backup.dados[t] != null && !Array.isArray(backup.dados[t])) throw new Error('Backup corrompido.')
  }
  if (!Array.isArray(backup.dados.lancamentos) || !Array.isArray(backup.dados.contas)) throw new Error('Backup incompleto.')
  await db.transaction('rw', TABELAS.map((t) => db.table(t)), async () => {
    for (const t of TABELAS) {
      await db.table(t).clear()
      if (backup.dados[t]?.length) await db.table(t).bulkAdd(backup.dados[t])
    }
  })
}
