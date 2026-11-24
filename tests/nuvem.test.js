import { describe, it, expect, beforeEach } from 'vitest'
import { db, criarDadosIniciais } from '../src/lib/db.js'
import { textoSincronizacao, traduzirAlerta, textosDaInteracao, dadosLocais } from '../src/lib/nuvem.js'
import { definirOrcamento, orcamentoDoMes } from '../src/lib/orcamento.js'
import { salvarLancamento } from '../src/lib/lancamentos.js'
import { bancoNovo } from './ajuda.js'

let b
beforeEach(async () => { b = await bancoNovo() })

describe('dados iniciais', () => {
  it('criados só uma vez (abrir as boas-vindas de novo não duplica contas e categorias)', async () => {
    expect(await criarDadosIniciais()).toBe(false) // o bancoNovo já criou
    expect(await db.contas.count()).toBe(3)
    expect(await db.categorias.count()).toBe(19)
  })

  it('não cria nada num aparelho que já recebeu dados da conta', async () => {
    db.close()
    await db.delete()
    await db.open()
    await db.categorias.add({ tipo: 'despesa', emoji: '🐶', nome: 'Pet' }) // veio da nuvem
    expect(await criarDadosIniciais()).toBe(false)
    expect(await db.contas.count()).toBe(0)
  })

  it('ids são textos únicos (formato da nuvem)', async () => {
    const ids = [...(await db.contas.toArray()), ...(await db.categorias.toArray())].map((x) => x.id)
    expect(ids.every((id) => typeof id === 'string' && id.length > 10)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('dados deste aparelho antes de entrar na conta', () => {
  it('conta lançamentos, cartões e contas fixas', async () => {
    expect(await dadosLocais()).toEqual({ lancamentos: 0, cartoes: 0, recorrentes: 0, tem: false })
    await salvarLancamento({ tipo: 'despesa', valor: 100, categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-20', parcelas: 1 })
    expect(await dadosLocais()).toMatchObject({ lancamentos: 1, tem: true })
  })
})

describe('orçamento repetido vindo de dois aparelhos', () => {
  it('conta uma vez só, e definir de novo limpa a cópia', async () => {
    const alim = b.cat('despesa', 'Alimentação')
    // dois aparelhos offline criaram o orçamento da mesma categoria
    await db.orcamentos.bulkAdd([{ categoriaId: alim, limite: 80000 }, { categoriaId: alim, limite: 90000 }])
    await salvarLancamento({ tipo: 'despesa', valor: 5000, categoriaId: alim, contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-10', parcelas: 1 })
    const r = orcamentoDoMes('2026-11', await db.orcamentos.toArray(), await db.lancamentos.toArray())
    expect(r.itens.length).toBe(1)
    expect(r.limiteTotal).toBe(80000) // vale o primeiro
    await definirOrcamento(alim, 70000)
    expect((await db.orcamentos.toArray()).map((o) => o.limite)).toEqual([70000])
  })
})

describe('textos de sincronização', () => {
  const logado = { isLoggedIn: true }
  it.each([
    [null, null, 'local'],
    [{ isLoggedIn: false }, { phase: 'in-sync' }, 'local'],
    [logado, undefined, 'andamento'],
    [logado, { status: 'connected', phase: 'in-sync' }, 'ok'],
    [logado, { status: 'connected', phase: 'pushing' }, 'andamento'],
    [logado, { status: 'offline', phase: 'offline' }, 'offline'],
    [logado, { status: 'error', phase: 'error' }, 'erro'],
    [logado, { status: 'connected', phase: 'in-sync', license: 'expired' }, 'erro'],
  ])('usuário %j, estado %j → %s', (u, e, tipo) => {
    expect(textoSincronizacao(u, e).tipo).toBe(tipo)
  })
  it('com fila para enviar: "Enviando N… não feche o app", mesmo se a fase diz in-sync', () => {
    const t = textoSincronizacao(logado, { status: 'connected', phase: 'in-sync' }, 2163)
    expect(t).toMatchObject({ tipo: 'andamento' })
    expect(t.texto).toBe('Enviando 2.163 para a nuvem… não feche o app')
    expect(textoSincronizacao(logado, { status: 'offline', phase: 'offline' }, 5).texto).toMatch(/5 ainda não foram para a nuvem/)
    expect(textoSincronizacao(logado, { status: 'error', phase: 'error' }, 1).texto).toMatch(/1 ainda não foi para a nuvem/)
    expect(textoSincronizacao({ isLoggedIn: false }, null, 50).tipo).toBe('local') // sem conta: não fala de nuvem
    expect(textoSincronizacao(logado, { status: 'connected', phase: 'in-sync' }, 0).texto).toBe('Sincronizado')
  })
  it('licença vencida explica que os dados ficam só no aparelho', () => {
    expect(textoSincronizacao(logado, { phase: 'in-sync', license: 'expired' }).texto).toMatch(/aparelho/)
  })
})

describe('mensagens do login em português', () => {
  it('traduz códigos conhecidos, com parâmetros', () => {
    expect(traduzirAlerta({ messageCode: 'OTP_SENT', message: 'Sent', messageParams: { email: 'a@b.com' } })).toBe('Enviamos um código para a@b.com. Olhe também a caixa de spam.')
    expect(traduzirAlerta({ messageCode: 'INVALID_OTP', message: 'Invalid', messageParams: {} })).toMatch(/Código incorreto/)
    expect(traduzirAlerta({ messageCode: 'LOGOUT_CONFIRMATION', message: 'x', messageParams: { numUnsyncedChanges: '3' } })).toMatch(/^Existem 3 alteração/)
  })
  it('código desconhecido mostra a mensagem original', () => {
    expect(traduzirAlerta({ messageCode: 'NOVO_CODIGO', message: 'Something new', messageParams: {} })).toBe('Something new')
  })
  it('títulos e botões de cada etapa', () => {
    expect(textosDaInteracao({ type: 'email' })).toMatchObject({ titulo: 'Entrar no Mukirana', enviar: 'Enviar código' })
    expect(textosDaInteracao({ type: 'otp' })).toMatchObject({ titulo: 'Digite o código', enviar: 'Entrar' })
    expect(textosDaInteracao({ type: 'logout-confirmation' })).toMatchObject({ enviar: 'Sair mesmo assim' })
    expect(textosDaInteracao({ type: 'message-alert', title: 'Aviso', cancelLabel: null })).toMatchObject({ titulo: 'Aviso', cancelar: null })
  })
})
