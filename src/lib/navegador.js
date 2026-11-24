// Navegador "de dentro" de outro app (WhatsApp, Instagram, Facebook...): quando você toca num link nesses apps,
// a página pode abrir num navegador interno que guarda os dados separado do Chrome e pode apagá-los ao fechar.
// O Mukirana guarda tudo no aparelho, então nesses casos é preciso abrir no navegador de verdade.

const APPS = [
  ['WhatsApp', /WhatsApp/i],
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i],
  ['Messenger', /Messenger/i],
  ['TikTok', /musical_ly|BytedanceWebview|TikTok/i],
  ['LinkedIn', /LinkedInApp/i],
  ['Telegram', /Telegram/i],
  ['app do Google', /\bGSA\//],
]

/**
 * Diz se a página está aberta num navegador embutido em outro app.
 * Retorna null se é um navegador normal (Chrome, Safari, app instalado), ou { app, android, ios }.
 */
export function navegadorEmbutido(ua = '', { standalone = false } = {}) {
  if (standalone) return null // aberto pelo ícone do app instalado
  const android = /Android/i.test(ua)
  const ios = /iPhone|iPad|iPod/i.test(ua)
  const app = APPS.find(([, re]) => re.test(ua))?.[0] ?? null
  // Android WebView: "; wv)" no user agent (o Chrome de verdade e as "abas personalizadas" não têm)
  const webview = android && /;\s*wv\)/.test(ua)
  // iOS: navegador embutido não tem "Safari/" no final (o Safari, o Chrome e o Firefox do iPhone têm)
  const iosEmbutido = ios && !/Safari\//.test(ua)
  if (!app && !webview && !iosEmbutido) return null
  return { app, android, ios }
}

// Link que abre esta mesma página no Chrome (Android). No iPhone não há como forçar: a pessoa copia o link.
export function linkParaChrome(url) {
  const u = new URL(url)
  const fallback = encodeURIComponent(u.href)
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${fallback};end`
}

export function navegadorAtual() {
  if (typeof navigator === 'undefined') return null
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
  return navegadorEmbutido(navigator.userAgent || '', { standalone })
}
