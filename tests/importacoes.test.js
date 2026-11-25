// Histórico das importações e "desfazer importação" (dados FICTÍCIOS)
import { describe, it, expect, beforeEach } from 'vitest'
import { lerConsolidado, juntarExtratos } from '../src/lib/santander.js'
import { prepararImportacao, executarImportacao, novoLote } from '../src/lib/importacao.js'
import { listarImportacoes, desfazerImportacao } from '../src/lib/importacoes.js'
import { saldoConta } from '../src/lib/calculos.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'
import { consolidado } from './exemplos-santander.js'

const EU = 'FULANO DE TAL SOUZA'
const extrato = () => juntarExtratos([lerConsolidado(consolidado({
  mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 100000,
  lancamentos: [
    { data: '01/09', desc: 'DEBITO AUT. FAT.CARTAO MASTER CARD', desc2: 'FINAL 1234', valor: -80000 },
    { data: '05/09', desc: 'CREDITO DE SALARIO EMPRESA', valor: 500000 },
    { data: '08/09', desc: 'PIX ENVIADO Fulano De Tal Souza da', valor: -30000 },
    { data: '20/09', desc: 'COMPRA CARTAO DEB MC 19/09 PADARIA', valor: -1590 },
  ],
}))])

let b
beforeEach(async () => { b = await bancoNovo() })
const dados = async () => ({ lancamentos: await db.lancamentos.toArray(), contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() })
const destino = () => ({ tipo: 'conta', id: b.conta('Santander') })

async function importar(lote) {
  const ex = extrato()
  const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: { titular: EU, contaPixProprio: b.conta('Inter'), historico: true } })
  await executarImportacao({ itens, destino: destino(), saldoInicial: ex.saldoInicial.valor, lote })
  return ex
}

describe('a importação guarda o lote', () => {
  it('lançamentos, pagamentos de fatura, cartão criado e saldo inicial levam o mesmo lote', async () => {
    const lote = novoLote(1764000000000)
    await importar(lote)
    const L = await db.lancamentos.toArray()
    expect(L.length).toBe(4)
    expect(L.every((l) => l.lote === lote)).toBe(true)
    expect((await db.cartoes.toArray()).map((c) => c.loteImportacao)).toEqual([lote])
    expect((await db.contas.get(b.conta('Santander'))).saldoInicialAntes).toEqual({ lote, valor: 0 })
  })
})

describe('histórico', () => {
  it('lista a importação com destino, quantidade e período; as antigas (sem lote) aparecem sem desfazer', async () => {
    const lote = novoLote(1764000000000)
    await importar(lote)
    await db.lancamentos.add({ tipo: 'despesa', valor: 100, data: '2024-01-02', contaId: b.conta('Inter'), idExterno: `conta:${b.conta('Inter')}:p:1`, criadoEm: 1700000000000 })
    const lista = listarImportacoes(await db.lancamentos.toArray(), { contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray() })
    expect(lista).toEqual([
      { lote, quando: 1764000000000, destino: 'Santander', quantidade: 4, convertidos: 0, de: '2025-09-01', ate: '2025-09-20', podeDesfazer: true },
      { lote: null, quando: 1700000000000, destino: 'Inter', quantidade: 1, convertidos: 0, de: '2024-01-02', ate: '2024-01-02', podeDesfazer: false },
    ])
  })
  it('lançamentos digitados à mão não aparecem', () => {
    expect(listarImportacoes([{ tipo: 'despesa', valor: 1, data: '2025-01-01', contaId: 'a' }])).toEqual([])
  })
})

describe('desfazer', () => {
  it('apaga o que entrou, tira o cartão criado e devolve o saldo inicial', async () => {
    const lote = novoLote(1764000000000)
    await db.lancamentos.add({ tipo: 'despesa', valor: 999, data: '2025-08-01', contaId: b.conta('Santander'), descricao: 'manual' })
    await importar(lote)
    const n = await desfazerImportacao(lote)
    expect(n).toBe(4)
    const L = await db.lancamentos.toArray()
    expect(L.map((l) => l.descricao)).toEqual(['manual'])
    expect(await db.cartoes.toArray()).toEqual([])
    const conta = await db.contas.get(b.conta('Santander'))
    expect(conta.saldoInicial).toBe(0)
    expect(conta.saldoInicialAntes).toBeUndefined()
    expect(saldoConta(conta, L, '2025-09-30')).toBe(-999)
  })
  it('importar de novo depois de desfazer funciona (não acusa repetido)', async () => {
    const lote = novoLote(1764000000000)
    await importar(lote)
    await desfazerImportacao(lote)
    const ex = await importar(novoLote(1764000001000))
    expect(saldoConta(await db.contas.get(b.conta('Santander')), await db.lancamentos.toArray(), '2025-09-30')).toBe(ex.saldo.valor)
  })
  it('lançamento de outra conta que tinha virado transferência volta a ser o que era', async () => {
    const lote = novoLote(1764000000000)
    const id = await db.lancamentos.add({ tipo: 'transferencia', valor: 500, data: '2025-09-02', contaId: 'x', contaDestinoId: 'y', categoriaId: null, cartaoId: null,
      antesDaImportacao: { lote, tipo: 'receita', contaId: 'y', contaDestinoId: null, categoriaId: 'cat', cartaoId: null } })
    await db.lancamentos.add({ tipo: 'despesa', valor: 1, data: '2025-09-02', contaId: 'x', lote })
    await desfazerImportacao(lote)
    const l = await db.lancamentos.get(id)
    expect(l).toMatchObject({ tipo: 'receita', contaId: 'y', contaDestinoId: null, categoriaId: 'cat' })
    expect(l.antesDaImportacao).toBeUndefined()
  })
  it('conta criada pela importação só sai se nada mais usa ela', async () => {
    const lote = novoLote(1764000000000)
    const caixa = await db.contas.add({ nome: 'Caixa', saldoInicial: 0, loteImportacao: lote })
    const outra = await db.contas.add({ nome: 'Corretora', saldoInicial: 0, loteImportacao: lote })
    await db.lancamentos.add({ tipo: 'transferencia', valor: 1, data: '2025-09-02', contaId: b.conta('Santander'), contaDestinoId: caixa, lote })
    await db.lancamentos.add({ tipo: 'despesa', valor: 1, data: '2025-09-03', contaId: outra, descricao: 'manual depois' })
    await desfazerImportacao(lote)
    expect(await db.contas.get(caixa)).toBeUndefined()
    expect(await db.contas.get(outra)).toBeTruthy()
  })
  it('se uma importação mais nova mexeu nesta, pede para desfazer a nova primeiro', async () => {
    const velho = novoLote(1764000000000)
    const novo = novoLote(1764000005000)
    await db.lancamentos.add({ tipo: 'transferencia', valor: 1, data: '2025-09-02', contaId: 'a', contaDestinoId: 'b', lote: velho,
      antesDaImportacao: { lote: novo, tipo: 'receita', contaId: 'b', contaDestinoId: null, categoriaId: null, cartaoId: null } })
    await expect(desfazerImportacao(velho)).rejects.toThrow(/Desfaça a mais nova primeiro/)
    expect(await db.lancamentos.count()).toBe(1)
  })
  it('desfazer duas vezes avisa; lote inventado também', async () => {
    const lote = novoLote(1764000000000)
    await importar(lote)
    await desfazerImportacao(lote)
    await expect(desfazerImportacao(lote)).rejects.toThrow(/já foi desfeita/)
    await expect(desfazerImportacao('qualquer')).rejects.toThrow(/não encontrada/)
  })
})
