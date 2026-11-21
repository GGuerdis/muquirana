// Espaços compartilhados (ex.: "Casa"): cada espaço tem as próprias contas, cartões, categorias,
// lançamentos, contas fixas e orçamento, e é dividido com quem você convidar.
// Por baixo, cada espaço é um "realm" do Dexie Cloud; o espaço Pessoal é o seu realm privado.
import { db, criarDadosIniciais, definirEspacoParaNovos, salvarConfig } from './db.js'

export const TABELAS_DO_ESPACO = ['contas', 'cartoes', 'categorias', 'lancamentos', 'regras', 'recorrentes', 'orcamentos']
export const PAPEIS = { editor: 'Pode editar', leitor: 'Só ver' }

// Separa os registros do espaço atual (null = Pessoal)
export function doEspaco(lista, espacoId, idsCompartilhados) {
  if (espacoId) return lista.filter((x) => x.realmId === espacoId)
  return lista.filter((x) => !idsCompartilhados.has(x.realmId))
}

export async function abrirEspaco(espacoId) {
  definirEspacoParaNovos(espacoId)
  await salvarConfig('espacoAtual', espacoId || null)
}

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

// Cria o espaço já com categorias e uma conta, e abre ele
export async function criarEspaco(nome, { nomeConta = 'Conta da casa' } = {}) {
  nome = (nome || '').trim().slice(0, 40)
  if (!nome) throw new Error('Dê um nome para o espaço.')
  const realmId = await db.realms.add({ name: nome, represents: 'um espaço do Muquirana' })
  definirEspacoParaNovos(realmId)
  await criarDadosIniciais({ contas: [{ nome: nomeConta, emoji: '🏠', saldoInicial: 0 }], espaco: realmId })
  await salvarConfig('espacoAtual', realmId)
  return realmId
}

export async function renomearEspaco(realmId, nome) {
  nome = (nome || '').trim().slice(0, 40)
  if (!nome) throw new Error('Dê um nome para o espaço.')
  await db.realms.update(realmId, { name: nome })
}

export async function convidar(realmId, { email, nome = '', papel = 'editor' }) {
  email = (email || '').trim().toLowerCase()
  if (!emailValido(email)) throw new Error('E-mail inválido.')
  if (!PAPEIS[papel]) throw new Error('Permissão inválida.')
  const ja = await db.members.where('realmId').equals(realmId).filter((m) => (m.email || '').toLowerCase() === email).first()
  if (ja) throw new Error('Esta pessoa já foi convidada.')
  return db.members.add({ realmId, email, name: nome.trim() || email, invite: true, roles: [papel] })
}

export const mudarPapel = (membroId, papel) => {
  if (!PAPEIS[papel]) throw new Error('Permissão inválida.')
  return db.members.update(membroId, { roles: [papel] })
}

export const removerMembro = (membroId) => db.members.delete(membroId)

// Apaga o espaço inteiro (só quem criou). Os dados do espaço somem para todos.
export async function excluirEspaco(realmId) {
  await db.transaction('rw', [...TABELAS_DO_ESPACO.map((t) => db.table(t)), db.realms, db.members], async () => {
    for (const t of TABELAS_DO_ESPACO) {
      const ids = (await db.table(t).toArray()).filter((x) => x.realmId === realmId).map((x) => x.id)
      await db.table(t).bulkDelete(ids)
    }
    await db.members.where('realmId').equals(realmId).delete()
    await db.realms.delete(realmId)
  })
  await abrirEspaco(null)
}

// Sair de um espaço de outra pessoa: remove o seu convite/participação
export async function sairDoEspaco(realmId, meuEmail) {
  const eu = await db.members.where('realmId').equals(realmId).filter((m) => (m.email || '').toLowerCase() === (meuEmail || '').toLowerCase()).first()
  if (!eu) throw new Error('Não encontrei a sua participação neste espaço.')
  await db.members.delete(eu.id)
  await abrirEspaco(null)
}

export const papelDe = (membro) => (membro?.roles?.includes('leitor') ? 'leitor' : 'editor')
