// Trava do app com a digital (ou o rosto / PIN) do próprio celular, pelo padrão WebAuthn.
// Nada vai para servidor: o celular guarda a chave e só confirma "é o dono". O app guarda, NESTE aparelho
// (localStorage, fora do backup e da nuvem), só o identificador dessa chave.
// É uma proteção de privacidade contra quem pega o celular desbloqueado, não uma criptografia dos dados.
const CHAVE = 'muquirana-trava'
export const BLOQUEAR_DEPOIS_MS = 60 * 1000 // fora do app por mais de 1 minuto: pede de novo

const paraBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const deBase64 = (txt) => Uint8Array.from(atob(txt), (c) => c.charCodeAt(0))
const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n))

export function travaLigada(armazenamento = globalThis.localStorage) {
  try { return !!JSON.parse(armazenamento.getItem(CHAVE) || 'null')?.id } catch { return false }
}

export async function aparelhoTemTrava(nav = globalThis.navigator, PKC = globalThis.PublicKeyCredential) {
  try {
    if (!nav?.credentials || !PKC?.isUserVerifyingPlatformAuthenticatorAvailable) return false
    return await PKC.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}

export async function ligarTrava({ nav = globalThis.navigator, armazenamento = globalThis.localStorage, local = globalThis.location } = {}) {
  const cred = await nav.credentials.create({
    publicKey: {
      challenge: aleatorio(32),
      rp: { name: 'Mukirana', id: local.hostname },
      user: { id: aleatorio(16), name: 'mukirana', displayName: 'Mukirana' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  })
  if (!cred?.rawId) throw new Error('O celular não confirmou a digital.')
  armazenamento.setItem(CHAVE, JSON.stringify({ id: paraBase64(cred.rawId), em: Date.now() }))
  return true
}

// true se o dono confirmou; lança erro se cancelou ou falhou
export async function desbloquear({ nav = globalThis.navigator, armazenamento = globalThis.localStorage } = {}) {
  const salvo = JSON.parse(armazenamento.getItem(CHAVE) || 'null')
  if (!salvo?.id) return true
  const r = await nav.credentials.get({
    publicKey: { challenge: aleatorio(32), allowCredentials: [{ type: 'public-key', id: deBase64(salvo.id) }], userVerification: 'required', timeout: 60000 },
  })
  if (!r) throw new Error('Não foi possível confirmar.')
  return true
}

// Desligar pede a digital antes (para quem pegou o celular não desligar a trava)
export async function desligarTrava(opcoes = {}) {
  const armazenamento = opcoes.armazenamento ?? globalThis.localStorage
  await desbloquear(opcoes)
  armazenamento.removeItem(CHAVE)
  return true
}
