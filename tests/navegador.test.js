import { describe, it, expect } from 'vitest'
import { navegadorEmbutido, linkParaChrome } from '../src/lib/navegador.js'

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const WEBVIEW_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36'
const WHATSAPP_ANDROID = WEBVIEW_ANDROID + ' WhatsApp/2.24.25.78'
const INSTAGRAM_ANDROID = WEBVIEW_ANDROID + ' Instagram 357.0.0.25.101 Android'
const FACEBOOK_ANDROID = WEBVIEW_ANDROID + ' [FB_IAB/FB4A;FBAV/490.0.0.38.109;]'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1'
const EMBUTIDO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const INSTAGRAM_IOS = EMBUTIDO_IOS + ' Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1)'
const CHROME_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

describe('navegador de dentro de outro app', () => {
  it('Chrome, Safari e o computador são navegadores normais', () => {
    for (const ua of [CHROME_ANDROID, SAFARI_IOS, CHROME_IOS, CHROME_PC]) expect(navegadorEmbutido(ua), ua).toBeNull()
  })

  it('WhatsApp, Instagram e Facebook no Android são reconhecidos', () => {
    expect(navegadorEmbutido(WHATSAPP_ANDROID)).toEqual({ app: 'WhatsApp', android: true, ios: false })
    expect(navegadorEmbutido(INSTAGRAM_ANDROID).app).toBe('Instagram')
    expect(navegadorEmbutido(FACEBOOK_ANDROID).app).toBe('Facebook')
  })

  it('qualquer WebView do Android (mesmo sem o nome do app) é reconhecida', () => {
    expect(navegadorEmbutido(WEBVIEW_ANDROID)).toEqual({ app: null, android: true, ios: false })
  })

  it('no iPhone, navegador sem "Safari/" é embutido', () => {
    expect(navegadorEmbutido(EMBUTIDO_IOS)).toEqual({ app: null, android: false, ios: true })
    expect(navegadorEmbutido(INSTAGRAM_IOS).app).toBe('Instagram')
  })

  it('aberto pelo ícone do app instalado nunca avisa', () => {
    expect(navegadorEmbutido(WHATSAPP_ANDROID, { standalone: true })).toBeNull()
    expect(navegadorEmbutido(EMBUTIDO_IOS, { standalone: true })).toBeNull()
  })

  it('link que abre a mesma página no Chrome', () => {
    expect(linkParaChrome('https://exemplo.github.io/muquirana/')).toBe(
      'intent://exemplo.github.io/muquirana/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fexemplo.github.io%2Fmuquirana%2F;end',
    )
  })
})
