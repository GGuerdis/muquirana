// Conta e sincronização com a nuvem (Dexie Cloud)
import { db, NOME_BANCO } from './db.js'

const MARCA_ENTRAR = 'muquirana-entrar-depois-de-limpar'

// Quantos dados deste aparelho ainda não pertencem a nenhuma conta
export async function dadosLocais() {
  const [lancamentos, cartoes, recorrentes] = await Promise.all([db.lancamentos.count(), db.cartoes.count(), db.recorrentes.count()])
  return { lancamentos, cartoes, recorrentes, tem: lancamentos + cartoes + recorrentes > 0 }
}

export const estaLogado = () => !!db.cloud.currentUser.value?.isLoggedIn

export function entrar() {
  return db.cloud.login()
}

// Apaga tudo deste aparelho e, depois de recarregar, abre o login (para usar só os dados da conta)
export async function apagarAparelhoEEntrar() {
  try { sessionStorage.setItem(MARCA_ENTRAR, '1') } catch { /* sem sessionStorage: o usuário toca em Entrar de novo */ }
  db.close()
  await db.delete()
  location.reload()
}

export function deveEntrarAoAbrir() {
  try {
    const sim = sessionStorage.getItem(MARCA_ENTRAR) === '1'
    sessionStorage.removeItem(MARCA_ENTRAR)
    return sim
  } catch {
    return false
  }
}

export const sair = () => db.cloud.logout()
export const sincronizarAgora = () => db.cloud.sync({ wait: false, purpose: 'pull' }).catch(() => {})

// Texto curto do estado da sincronização
export function textoSincronizacao(usuario, estado) {
  if (!usuario?.isLoggedIn) return { icone: '📱', texto: 'Só neste aparelho', tipo: 'local' }
  if (!estado) return { icone: '☁️', texto: 'Conectando…', tipo: 'andamento' }
  if (estado.license === 'expired') return { icone: '⚠️', texto: 'Período de avaliação acabou: dados salvos só neste aparelho', tipo: 'erro' }
  if (estado.license === 'deactivated') return { icone: '⚠️', texto: 'Conta desativada na nuvem', tipo: 'erro' }
  if (estado.status === 'offline' || estado.phase === 'offline') return { icone: '📴', texto: 'Sem internet: salvo no aparelho, sincroniza depois', tipo: 'offline' }
  if (estado.phase === 'error' || estado.status === 'error') return { icone: '⚠️', texto: 'Erro ao sincronizar. Vamos tentar de novo.', tipo: 'erro' }
  if (estado.phase === 'pushing' || estado.phase === 'pulling' || estado.status === 'connecting') return { icone: '🔄', texto: 'Sincronizando…', tipo: 'andamento' }
  if (estado.phase === 'in-sync') return { icone: '☁️', texto: 'Sincronizado', tipo: 'ok' }
  return { icone: '☁️', texto: 'Conectando…', tipo: 'andamento' }
}

// Tradução das mensagens do servidor de login
const ALERTAS = {
  INVALID_OTP: 'Código incorreto ou vencido. Confira e tente de novo.',
  INVALID_EMAIL: 'E-mail inválido.',
  LICENSE_LIMIT_REACHED: 'O limite de usuários do plano foi atingido.',
  NO_SEATS_AVAILABLE: 'O limite de usuários do plano foi atingido.',
  USER_NOT_REGISTERED: 'Este e-mail não tem acesso ao Muquirana.',
  USER_NOT_ACCEPTED: 'Este e-mail não foi aceito.',
  USER_DEACTIVATED: 'Este usuário foi desativado.',
  LOGOUT_CONFIRMATION: 'Existem {numUnsyncedChanges} alteração(ões) que ainda não foram para a nuvem. Se sair agora, elas serão perdidas.',
  OTP_SENT: 'Enviamos um código para {email}. Olhe também a caixa de spam.',
}

export function traduzirAlerta(alerta) {
  const modelo = ALERTAS[alerta.messageCode]
  if (!modelo) return alerta.message
  return modelo.replace(/\{(\w+)\}/g, (_, p) => alerta.messageParams?.[p] ?? '')
}

export function textosDaInteracao(ui) {
  switch (ui.type) {
    case 'email':
      return { titulo: 'Entrar no Muquirana', explicacao: 'Vamos mandar um código para o seu e-mail. Não precisa de senha.', enviar: 'Enviar código', cancelar: 'Cancelar', rotulos: { email: 'Seu e-mail' } }
    case 'otp':
      return { titulo: 'Digite o código', explicacao: '', enviar: 'Entrar', cancelar: 'Cancelar', rotulos: { otp: 'Código recebido por e-mail' } }
    case 'logout-confirmation':
      return { titulo: 'Sair da conta?', explicacao: '', enviar: 'Sair mesmo assim', cancelar: 'Cancelar', rotulos: {} }
    default:
      return { titulo: ui.title, explicacao: '', enviar: 'Ok', cancelar: ui.cancelLabel ? 'Cancelar' : null, rotulos: {} }
  }
}

export { NOME_BANCO }
