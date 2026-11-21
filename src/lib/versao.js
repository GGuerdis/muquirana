// Versão do app e conferência de atualização. O app fica guardado no aparelho (PWA) e só troca de versão
// depois de baixar a nova em segundo plano; antes de importar, o app confere se está na versão mais nova.
/* global __VERSAO__ */
export const VERSAO = typeof __VERSAO__ !== 'undefined' ? __VERSAO__ : 'dev'

export const estaDesatualizado = (local, remota) => !!remota && local !== 'dev' && remota !== local && remota > local

// Retorna a versão publicada se for mais nova que esta, ou null
export async function versaoNova() {
  if (VERSAO === 'dev') return null
  try {
    const r = await fetch(`./versao.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const { versao } = await r.json()
    return estaDesatualizado(VERSAO, versao) ? versao : null
  } catch {
    return null // sem internet: segue com a versão que tem
  }
}

// Troca para a versão nova: tira o app guardado (não mexe nos seus dados) e recarrega
export async function atualizarApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
    await Promise.all(regs.map((r) => r.unregister()))
    if (self.caches) for (const k of await caches.keys()) await caches.delete(k)
  } finally {
    location.reload()
  }
}
