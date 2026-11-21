import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/lib/db.js'
import { salvarLancamento } from '../src/lib/lancamentos.js'
import { salvarCartao, excluirCartao, salvarConta, excluirConta, salvarCategoria, excluirCategoria } from '../src/lib/cadastros.js'
import { saldoConta } from '../src/lib/calculos.js'
import { bancoNovo } from './ajuda.js'

let b
beforeEach(async () => { b = await bancoNovo() })

const cartaoBase = { nome: 'Inter', limite: 0, diaFechamento: 3, diaVencimento: 10 }

describe('cartões', () => {
  it('valida nome e dias', async () => {
    await expect(salvarCartao({ ...cartaoBase, nome: '  ' })).rejects.toThrow('nome')
    await expect(salvarCartao({ ...cartaoBase, diaFechamento: 0 })).rejects.toThrow('1 a 31')
    await expect(salvarCartao({ ...cartaoBase, diaVencimento: 32 })).rejects.toThrow('1 a 31')
    await expect(salvarCartao({ ...cartaoBase, diaFechamento: '' })).rejects.toThrow('1 a 31')
    await expect(salvarCartao({ ...cartaoBase, diaFechamento: 2.5 })).rejects.toThrow('1 a 31')
    await expect(salvarCartao({ ...cartaoBase, diaVencimento: 3 })).rejects.toThrow('mesmo dia')
    expect(await db.cartoes.count()).toBe(0)
  })

  it('aceita dias vindos do formulário como texto', async () => {
    await salvarCartao({ ...cartaoBase, diaFechamento: '3', diaVencimento: '10' })
    expect((await db.cartoes.toArray())[0]).toMatchObject({ diaFechamento: 3, diaVencimento: 10 })
  })

  it('corrigir os dias recalcula compras das faturas abertas, mas não das já fechadas', async () => {
    await salvarCartao(cartaoBase) // fecha 3, vence 10
    const cartao = (await db.cartoes.toArray())[0]
    const cat = b.cat('despesa', 'Compras')
    const compra = (data, extra = {}) => salvarLancamento({ tipo: 'despesa', valor: 10000, categoriaId: cat, cartaoId: cartao.id, contaId: null, data, parcelas: 1, ...extra })
    await compra('2026-10-25') // fatura de nov (já fechou em 03/nov)
    await compra('2026-11-20') // fatura de dez (aberta)
    await compra('2026-11-28', { parcelas: 3, valor: 30000 }) // dez, jan, fev
    await compra('2026-10-01', { parcelas: 3, valor: 30000, descricao: 'travada' }) // out e nov (fechadas) e dez

    // Hoje é 20/nov. Usuário corrige: fecha dia 25, vence dia 5
    const mudou = await salvarCartao({ ...cartao, diaFechamento: 25, diaVencimento: 5 }, '2026-11-20')
    const L = await db.lancamentos.toArray()
    const fat = (pred) => L.filter(pred).map((l) => l.fatura).sort()
    expect(fat((l) => l.data === '2026-10-25')).toEqual(['2026-11']) // fatura fechada: não mexe
    expect(fat((l) => l.data === '2026-11-20' && !l.grupoParcelaId)).toEqual(['2026-12']) // 20/nov < 25: fecha 25/nov, vence 5/dez
    expect(fat((l) => l.dataCompra === '2026-11-28')).toEqual(['2027-01', '2027-02', '2027-03']) // depois do dia 25
    // parcelamento com parcela em fatura fechada: intocado (pela regra nova a 3ª parcela iria para janeiro)
    expect(fat((l) => l.descricao === 'travada')).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(mudou).toBe(3)
  })

  it('não exclui cartão com lançamentos', async () => {
    await salvarCartao(cartaoBase)
    const cartao = (await db.cartoes.toArray())[0]
    await salvarLancamento({ tipo: 'despesa', valor: 100, categoriaId: b.cat('despesa', 'Compras'), cartaoId: cartao.id, contaId: null, data: '2026-11-20', parcelas: 1 })
    await expect(excluirCartao(cartao.id)).rejects.toThrow('lançamentos')
    await db.lancamentos.clear()
    await excluirCartao(cartao.id)
    expect(await db.cartoes.count()).toBe(0)
  })
})

describe('contas', () => {
  it('informar o saldo atual ajusta o saldo inicial considerando o que já foi lançado', async () => {
    const id = b.conta('Santander')
    await salvarLancamento({ tipo: 'despesa', valor: 30000, categoriaId: b.cat('despesa', 'Mercado'), contaId: id, cartaoId: null, data: '2026-11-10', parcelas: 1 })
    await salvarLancamento({ tipo: 'despesa', valor: 99900, categoriaId: b.cat('despesa', 'Mercado'), contaId: id, cartaoId: null, data: '2026-12-10', parcelas: 1 }) // futuro
    await salvarConta({ id, nome: 'Santander', emoji: '🔴', saldoAtual: 250000 }, '2026-11-20')
    const conta = await db.contas.get(id)
    const L = await db.lancamentos.toArray()
    expect(saldoConta(conta, L, '2026-11-20')).toBe(250000)
    expect(conta.saldoInicial).toBe(280000)
  })

  it('saldo negativo (cheque especial) é aceito', async () => {
    await salvarConta({ id: b.conta('Inter'), nome: 'Inter', saldoAtual: -5000 }, '2026-11-20')
    expect((await db.contas.get(b.conta('Inter'))).saldoInicial).toBe(-5000)
  })

  it('nova conta e validações', async () => {
    const id = await salvarConta({ nome: ' Nubank ', saldoAtual: 1000 })
    expect(await db.contas.get(id)).toMatchObject({ nome: 'Nubank', saldoInicial: 1000 })
    await expect(salvarConta({ nome: '', saldoAtual: 0 })).rejects.toThrow('nome')
    await expect(salvarConta({ nome: 'X', saldoAtual: 1.5 })).rejects.toThrow('Saldo')
  })

  it('não exclui conta com lançamentos, como destino de transferência ou que paga fatura de cartão', async () => {
    const santander = b.conta('Santander'), inter = b.conta('Inter'), carteira = b.conta('Carteira')
    await salvarLancamento({ tipo: 'transferencia', valor: 100, contaId: santander, contaDestinoId: inter, data: '2026-11-20', parcelas: 1 })
    await expect(excluirConta(santander)).rejects.toThrow('lançamentos')
    await expect(excluirConta(inter)).rejects.toThrow('lançamentos')
    await salvarCartao({ ...cartaoBase, contaPagamentoId: carteira })
    await expect(excluirConta(carteira)).rejects.toThrow('fatura')
    expect(await db.contas.count()).toBe(3)
  })
})

describe('categorias', () => {
  it('cria, renomeia e só exclui se nunca foi usada', async () => {
    const id = await salvarCategoria({ nome: 'Academia', emoji: '🏋️', tipo: 'despesa' })
    await salvarCategoria({ id, nome: 'Academia e esportes', emoji: '🏋️', tipo: 'despesa' })
    expect((await db.categorias.get(id)).nome).toBe('Academia e esportes')
    await salvarLancamento({ tipo: 'despesa', valor: 100, categoriaId: id, contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-20', parcelas: 1 })
    await expect(excluirCategoria(id)).rejects.toThrow('usada')
    const nova = await salvarCategoria({ nome: 'Temporária', tipo: 'receita' })
    await excluirCategoria(nova)
    expect(await db.categorias.get(nova)).toBeUndefined()
    await expect(salvarCategoria({ nome: 'X', tipo: 'outro' })).rejects.toThrow('Tipo')
  })
})
