// Trava com a digital (WebAuthn) — o celular é simulado
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { travaLigada, aparelhoTemTrava, ligarTrava, desbloquear, desligarTrava } from '../src/lib/trava.js'

const memoria = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m } }
const celular = ({ cria = true, confirma = true } = {}) => ({
  credentials: {
    create: vi.fn(async () => (cria ? { rawId: new Uint8Array([1, 2, 3, 250]).buffer } : null)),
    get: vi.fn(async () => { if (!confirma) { const e = new Error('cancelou'); e.name = 'NotAllowedError'; throw e } return { id: 'ok' } }),
  },
})
const local = { hostname: 'gguerdis.github.io' }

describe('ligar e desbloquear', () => {
  it('ligar pede ao celular uma chave do próprio aparelho, com verificação do dono, e guarda só o id', async () => {
    const nav = celular(), arm = memoria()
    expect(travaLigada(arm)).toBe(false)
    await ligarTrava({ nav, armazenamento: arm, local })
    const pedido = nav.credentials.create.mock.calls[0][0].publicKey
    expect(pedido.rp).toEqual({ name: 'Mukirana', id: 'gguerdis.github.io' })
    expect(pedido.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' })
    expect(travaLigada(arm)).toBe(true)
    expect(JSON.parse(arm.getItem('muquirana-trava')).id).toBe(btoa(String.fromCharCode(1, 2, 3, 250)))
  })
  it('desbloquear pede a mesma chave de volta, com verificação do dono', async () => {
    const nav = celular(), arm = memoria()
    await ligarTrava({ nav, armazenamento: arm, local })
    await desbloquear({ nav, armazenamento: arm })
    const pedido = nav.credentials.get.mock.calls[0][0].publicKey
    expect(pedido.userVerification).toBe('required')
    expect([...pedido.allowCredentials[0].id]).toEqual([1, 2, 3, 250])
  })
  it('se o dono cancela, não desbloqueia (lança erro)', async () => {
    const arm = memoria()
    await ligarTrava({ nav: celular(), armazenamento: arm, local })
    await expect(desbloquear({ nav: celular({ confirma: false }), armazenamento: arm })).rejects.toThrow('cancelou')
  })
  it('sem trava ligada, desbloquear passa direto (e não chama o celular)', async () => {
    const nav = celular()
    expect(await desbloquear({ nav, armazenamento: memoria() })).toBe(true)
    expect(nav.credentials.get).not.toHaveBeenCalled()
  })
  it('celular não confirmou ao ligar: a trava não fica ligada', async () => {
    const arm = memoria()
    await expect(ligarTrava({ nav: celular({ cria: false }), armazenamento: arm, local })).rejects.toThrow(/não confirmou/)
    expect(travaLigada(arm)).toBe(false)
  })
})

describe('desligar', () => {
  it('pede a digital antes; se não confirmar, continua ligada', async () => {
    const arm = memoria()
    await ligarTrava({ nav: celular(), armazenamento: arm, local })
    await expect(desligarTrava({ nav: celular({ confirma: false }), armazenamento: arm })).rejects.toThrow()
    expect(travaLigada(arm)).toBe(true)
    await desligarTrava({ nav: celular(), armazenamento: arm })
    expect(travaLigada(arm)).toBe(false)
  })
})

describe('aparelho sem digital', () => {
  it('sem WebAuthn ou sem autenticador do aparelho: não oferece a trava', async () => {
    expect(await aparelhoTemTrava({}, undefined)).toBe(false)
    expect(await aparelhoTemTrava(celular(), { isUserVerifyingPlatformAuthenticatorAvailable: async () => false })).toBe(false)
    expect(await aparelhoTemTrava(celular(), { isUserVerifyingPlatformAuthenticatorAvailable: async () => true })).toBe(true)
    expect(await aparelhoTemTrava(celular(), { isUserVerifyingPlatformAuthenticatorAvailable: async () => { throw new Error('x') } })).toBe(false)
  })
})

describe('no app', () => {
  const ler = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
  it('trancado, o App mostra só a tela da trava (nada dos dados nem o formulário)', () => {
    const app = ler('App.jsx')
    expect(app).toMatch(/\{trancado \? <><Cenario \/><TelaTrava aoDesbloquear=\{destrancar\} \/><\/> : <Telas \/>\}/)
    expect(app).toMatch(/\{lancAberto && !trancado && \(/)
  })
  it('a trava fica fora do backup e da nuvem (só neste aparelho)', () => {
    expect(ler('lib/trava.js')).toMatch(/localStorage/)
    expect(ler('lib/db.js')).not.toMatch(/muquirana-trava/)
  })
})

describe('mensagens da trava', () => {
  it('erros do navegador (em inglês) viram texto em português', async () => {
    const { textoErro } = await import('../src/components/Trava.jsx')
    expect(textoErro({ name: 'NotAllowedError', message: 'The operation either timed out or was not allowed.' })).toMatch(/^Não confirmou/)
    expect(textoErro({ name: 'OperationError', message: 'A request is already pending.' })).toMatch(/^Não foi possível confirmar/)
    expect(textoErro(null)).toMatch(/^Não foi possível confirmar/)
  })
})
