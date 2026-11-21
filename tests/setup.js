// Banco IndexedDB em memória para os testes
import 'fake-indexeddb/auto'

// O pacote da nuvem espera um ambiente de navegador ('self' com eventos online/offline).
// Nos testes não há nuvem: só simulamos o mínimo para ele carregar.
globalThis.addEventListener ??= () => {}
globalThis.removeEventListener ??= () => {}
globalThis.self ??= globalThis
globalThis.document ??= { visibilityState: 'visible', hidden: false, addEventListener() {}, removeEventListener() {} }

// localStorage em memória (o Node não tem)
if (!globalThis.localStorage) {
  const mem = new Map()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  }
}
