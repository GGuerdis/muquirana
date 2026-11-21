// Quando a nuvem recusa uma alteração (permissão, dado inválido...), o Dexie Cloud desfaz a alteração no aparelho
// sem avisar ninguém: os dados simplesmente somem. Aqui o app espia a resposta da sincronização e, se houver
// recusas ("rejections"), avisa na tela e guarda o motivo para diagnóstico.
const CHAVE = 'muquirana-recusas'

export function extrairRecusas(texto) {
  if (typeof texto !== 'string' || !texto.includes('rejections')) return []
  try {
    const lista = acharRecusas(JSON.parse(texto))
    if (!lista.length) return []
    return lista.map((r) => ({
      motivo: String(r?.reason ?? r?.message ?? r?.error ?? JSON.stringify(r)).slice(0, 300),
      tabela: r?.table ?? r?.tableName ?? null,
    }))
  } catch {
    return []
  }
}

// "rejections" pode vir no topo (resposta do /sync) ou dentro da mensagem do WebSocket
function acharRecusas(obj, prof = 0) {
  if (!obj || typeof obj !== 'object' || prof > 4) return []
  if (Array.isArray(obj.rejections)) return obj.rejections
  for (const v of Object.values(obj)) {
    const r = acharRecusas(v, prof + 1)
    if (r.length) return r
  }
  return []
}

function registrar(recusas, aoRecusar) {
  if (!recusas.length) return
  try { localStorage.setItem(CHAVE, JSON.stringify({ em: new Date().toISOString(), recusas })) } catch { /* sem localStorage */ }
  aoRecusar(recusas)
}

export function vigiarRecusasDaNuvem(aoRecusar) {
  // WebSocket: com a conexão aberta, o Dexie Cloud manda e recebe as mudanças por ele
  if (typeof window !== 'undefined' && window.WebSocket && !window.WebSocket.__muquirana) {
    const WSOriginal = window.WebSocket
    class WSVigiado extends WSOriginal {
      constructor(...args) {
        super(...args)
        try {
          this.addEventListener('message', (ev) => {
            if (typeof ev.data === 'string' && ev.data.includes('rejections')) registrar(extrairRecusas(ev.data), aoRecusar)
          })
        } catch { /* nunca atrapalha */ }
      }
    }
    WSVigiado.__muquirana = true
    window.WebSocket = WSVigiado
  }
  if (typeof window === 'undefined' || !window.fetch || window.fetch.__muquirana) return
  const original = window.fetch.bind(window)
  const vigiado = async (...args) => {
    const res = await original(...args)
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
      if (/\/sync(\?|$)/.test(url)) {
        res.clone().text().then((txt) => registrar(extrairRecusas(txt), aoRecusar)).catch(() => {})
      }
    } catch { /* nunca atrapalha a sincronização */ }
    return res
  }
  vigiado.__muquirana = true
  window.fetch = vigiado
}

export function ultimasRecusas() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') } catch { return null }
}
