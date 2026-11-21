import Dexie from 'dexie'
import dexieCloud from 'dexie-cloud-addon'

// Banco de dados do app. Fica no aparelho (IndexedDB) e, quando você entra na sua conta,
// é sincronizado com a nuvem (Dexie Cloud). Sem login, funciona só no aparelho, como antes.
export const NOME_BANCO = 'muquirana-nuvem'
export const NOME_BANCO_ANTIGO = 'muquirana' // versão 1 e 2 do app (só local, ids numéricos)
export const URL_NUVEM = 'https://z9i8sqn4t.dexie.cloud'

export const db = new Dexie(NOME_BANCO, { addons: [dexieCloud] })

// '@id' = identificador único gerado no aparelho (necessário para sincronizar sem conflito)
db.version(1).stores({
  contas: '@id, nome',
  cartoes: '@id, nome',
  categorias: '@id, tipo, nome',
  lancamentos: '@id, data, tipo, contaId, cartaoId, fatura, categoriaId, grupoParcelaId, idExterno, recorrenteId',
  regras: '@id, chave',
  recorrentes: '@id',
  orcamentos: '@id, categoriaId',
  config: 'chave', // preferências deste aparelho (não sincroniza)
})

// Chamado uma vez ao abrir o app (no navegador). Nos testes não é chamado: o banco fica só local.
export function conectarNuvem() {
  db.cloud.configure({
    databaseUrl: URL_NUVEM,
    requireAuth: false, // dá para usar sem conta; o login é opcional
    customLoginGui: true, // tela de login própria, em português
    unsyncedTables: ['config'],
    nameSuffix: false,
    socialAuth: false,
  })
}

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

// Contas e categorias iniciais de quem está começando. Não é automático (como era antes):
// quem entra numa conta que já existe recebe os dados da nuvem e não pode ganhar cópias.
export async function criarDadosIniciais() {
  return db.transaction('rw', db.contas, db.categorias, async () => {
    if ((await db.contas.count()) > 0 || (await db.categorias.count()) > 0) return false
    await db.contas.bulkAdd(CONTAS_PADRAO.map((c) => ({ ...c })))
    await db.categorias.bulkAdd(CATEGORIAS_PADRAO.map(([tipo, emoji, nome]) => ({ tipo, emoji, nome })))
    return true
  })
}

export const salvarConfig = (chave, valor) => db.config.put({ chave, valor })
export async function lerConfig(chave) {
  return (await db.config.get(chave))?.valor
}

// ---------- Importar dados (backup e migração do banco antigo) ----------
export const TABELAS_DADOS = ['contas', 'cartoes', 'categorias', 'lancamentos', 'regras', 'recorrentes', 'orcamentos']
const TABELAS = [...TABELAS_DADOS, 'config']

// Campos que apontam para outro registro: [campo, tabela de destino]
const LIGACOES = {
  contas: [],
  categorias: [],
  cartoes: [['contaPagamentoId', 'contas']],
  recorrentes: [['contaId', 'contas'], ['cartaoId', 'cartoes'], ['categoriaId', 'categorias']],
  lancamentos: [['contaId', 'contas'], ['contaDestinoId', 'contas'], ['cartaoId', 'cartoes'], ['categoriaId', 'categorias'], ['recorrenteId', 'recorrentes']],
  regras: [['categoriaId', 'categorias']],
  orcamentos: [['categoriaId', 'categorias']],
}
const ORDEM = ['contas', 'categorias', 'cartoes', 'recorrentes', 'lancamentos', 'regras', 'orcamentos']
const CAMPOS_DA_NUVEM = ['realmId', 'owner', '$ts']

/**
 * Grava dados vindos de fora (backup de qualquer versão ou banco antigo), criando identificadores novos
 * e reconectando todas as ligações (lançamento → conta, cartão, categoria, conta fixa...).
 * Deve ser chamado dentro de uma transação que inclua as tabelas de dados.
 */
async function gravarDados(dados) {
  const mapa = Object.fromEntries(TABELAS_DADOS.map((t) => [t, new Map()]))
  for (const t of ORDEM) {
    const linhas = Array.isArray(dados[t]) ? dados[t] : []
    const novas = linhas.map((linha) => {
      const { id, ...resto } = linha
      for (const c of CAMPOS_DA_NUVEM) delete resto[c]
      for (const [campo, alvo] of LIGACOES[t]) {
        if (resto[campo] != null) resto[campo] = mapa[alvo].get(resto[campo]) ?? null
      }
      // o identificador de importação inclui a conta/cartão de destino: precisa apontar para o id novo
      if (t === 'lancamentos' && typeof resto.idExterno === 'string') {
        resto.idExterno = resto.idExterno.replace(/^(conta|cartao):([^:]+):/, (tudo, tipo, idAntigo) => {
          const novo = mapa[tipo === 'conta' ? 'contas' : 'cartoes'].get(isNaN(idAntigo) ? idAntigo : Number(idAntigo)) ?? mapa[tipo === 'conta' ? 'contas' : 'cartoes'].get(idAntigo)
          return novo ? `${tipo}:${novo}:` : tudo
        })
      }
      return resto
    })
    if (novas.length) {
      const chaves = await db.table(t).bulkAdd(novas, { allKeys: true })
      linhas.forEach((l, i) => { if (l.id != null) mapa[t].set(l.id, chaves[i]) })
    }
  }
  return mapa
}

function configImportada(config, mapa) {
  const lista = Array.isArray(config) ? config : []
  return lista
    .filter((c) => c && typeof c.chave === 'string')
    .map((c) => {
      if (c.chave === 'ultimaOrigem' && typeof c.valor === 'string') {
        const [tipo, id] = c.valor.split(':')
        const novo = mapa[tipo === 'cartao' ? 'cartoes' : 'contas']?.get(isNaN(id) ? id : Number(id))
        return { chave: c.chave, valor: novo ? `${tipo}:${novo}` : null }
      }
      return { chave: c.chave, valor: c.valor }
    })
}

// ---------- Backup ----------
export async function exportarBackup() {
  const dados = {}
  for (const t of TABELAS) dados[t] = await db.table(t).toArray()
  return { app: 'muquirana', versao: 3, exportadoEm: new Date().toISOString(), dados }
}

export function validarBackup(backup) {
  if (backup?.app !== 'muquirana' || !backup.dados) throw new Error('Este arquivo não é um backup do Muquirana.')
  for (const t of TABELAS) {
    if (backup.dados[t] != null && !Array.isArray(backup.dados[t])) throw new Error('Backup corrompido.')
  }
  if (!Array.isArray(backup.dados.lancamentos) || !Array.isArray(backup.dados.contas)) throw new Error('Backup incompleto.')
}

// Substitui todos os dados pelos do backup (de qualquer versão do app)
export async function restaurarBackup(backup) {
  validarBackup(backup)
  await db.transaction('rw', TABELAS.map((t) => db.table(t)), async () => {
    for (const t of TABELAS_DADOS) await db.table(t).clear()
    const mapa = await gravarDados(backup.dados)
    for (const c of configImportada(backup.dados.config, mapa)) await db.config.put(c)
    await db.config.put({ chave: 'boasVindas', valor: true })
  })
}

// ---------- Migração do banco antigo (versões 1 e 2, só no aparelho) ----------
function abrirBancoAntigo() {
  const antigo = new Dexie(NOME_BANCO_ANTIGO)
  antigo.version(1).stores({
    contas: '++id, nome', cartoes: '++id, nome', categorias: '++id, tipo, nome',
    lancamentos: '++id, data, tipo, contaId, cartaoId, fatura, categoriaId, grupoParcelaId', config: 'chave',
  })
  antigo.version(2).stores({
    lancamentos: '++id, data, tipo, contaId, cartaoId, fatura, categoriaId, grupoParcelaId, idExterno, recorrenteId',
    regras: '++id, &chave', recorrentes: '++id', orcamentos: 'categoriaId',
  })
  return antigo
}

/**
 * Na primeira vez que a versão nova abre, traz os dados do banco antigo para o novo.
 * O banco antigo NÃO é apagado (fica como cópia de segurança no aparelho).
 * Retorna { lancamentos } se migrou, ou null se não havia o que migrar.
 */
const MARCA_MIGROU = 'muquirana-migrou-banco-antigo'
const lerMarca = () => { try { return localStorage.getItem(MARCA_MIGROU) === '1' } catch { return false } }
const gravarMarca = () => { try { localStorage.setItem(MARCA_MIGROU, '1') } catch { /* sem localStorage */ } }

export async function migrarBancoAntigo() {
  if (lerMarca() || (await lerConfig('migracaoLocal'))) return null
  if (!(await Dexie.exists(NOME_BANCO_ANTIGO))) {
    await salvarConfig('migracaoLocal', { em: new Date().toISOString(), nada: true })
    gravarMarca()
    return null
  }
  const antigo = abrirBancoAntigo()
  const dados = {}
  try {
    await antigo.open()
    for (const t of TABELAS) dados[t] = await antigo.table(t).toArray()
  } finally {
    antigo.close()
  }
  const usouOApp = dados.config.some((c) => c.chave === 'boasVindas' && c.valor === true) || dados.lancamentos.length > 0
  let resultado = null
  await db.transaction('rw', TABELAS.map((t) => db.table(t)), async () => {
    if (await lerConfig('migracaoLocal')) return // outra aba já migrou
    if (usouOApp && (await db.contas.count()) === 0) {
      const mapa = await gravarDados(dados)
      for (const c of configImportada(dados.config, mapa)) await db.config.put(c)
      resultado = { lancamentos: dados.lancamentos.length }
    }
    await db.config.put({ chave: 'migracaoLocal', valor: { em: new Date().toISOString(), lancamentos: resultado?.lancamentos ?? 0 } })
  })
  gravarMarca()
  return resultado
}
