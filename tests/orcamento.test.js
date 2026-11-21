import { describe, it, expect, beforeEach } from 'vitest'
import { db, exportarBackup, restaurarBackup } from '../src/lib/db.js'
import { definirOrcamento, situacao, orcamentoDoMes, avisoDeOrcamento, textoAviso } from '../src/lib/orcamento.js'
import { salvarLancamento, pagarFatura } from '../src/lib/lancamentos.js'
import { salvarCartao, salvarCategoria, excluirCategoria } from '../src/lib/cadastros.js'
import { saldoConta } from '../src/lib/calculos.js'
import { bancoNovo } from './ajuda.js'

let b
beforeEach(async () => { b = await bancoNovo() })
const gastar = (valor, nome = 'Alimentação', data = '2026-11-10', extra = {}) =>
  salvarLancamento({ tipo: 'despesa', valor, categoriaId: b.cat('despesa', nome), contaId: b.conta('Inter'), cartaoId: null, data, parcelas: 1, ...extra })
const orc = () => db.orcamentos.toArray()
const lancs = () => db.lancamentos.toArray()

describe('definir orçamento', () => {
  it('define, troca e remove', async () => {
    const alim = b.cat('despesa', 'Alimentação')
    await definirOrcamento(alim, 80000)
    await definirOrcamento(alim, 90000)
    expect((await orc()).map((o) => [o.categoriaId, o.limite])).toEqual([[alim, 90000]])
    await definirOrcamento(alim, 0)
    expect(await orc()).toEqual([])
  })

  it('recusa categoria de receita, categoria inexistente e valor inválido', async () => {
    await expect(definirOrcamento(b.cat('receita', 'Salário'), 1000)).rejects.toThrow('despesa')
    await expect(definirOrcamento(999, 1000)).rejects.toThrow('Categoria')
    await expect(definirOrcamento(b.cat('despesa', 'Lazer'), 10.5)).rejects.toThrow('Limite')
    await expect(definirOrcamento(b.cat('despesa', 'Lazer'), -100)).rejects.toThrow('Limite')
    expect(await orc()).toEqual([])
  })

  it('excluir categoria remove o orçamento dela; backup guarda', async () => {
    const id = await salvarCategoria({ nome: 'Academia', tipo: 'despesa' })
    await definirOrcamento(id, 15000)
    await definirOrcamento(b.cat('despesa', 'Lazer'), 30000)
    const bk = JSON.parse(JSON.stringify(await exportarBackup()))
    await excluirCategoria(id)
    expect((await orc()).map((o) => o.categoriaId)).toEqual([b.cat('despesa', 'Lazer')])
    await restaurarBackup(bk)
    expect((await orc()).length).toBe(2)
  })
})

describe('faixas: ok / alerta (80%) / estourado', () => {
  it.each([
    [0, 100000, 'ok'],
    [79999, 100000, 'ok'], // 79,999%
    [80000, 100000, 'alerta'], // 80% exato
    [100000, 100000, 'alerta'], // no limite ainda não estourou
    [100001, 100000, 'estourado'], // 1 centavo a mais
    [1, 1, 'alerta'],
    [3, 3, 'alerta'],
    [2, 3, 'ok'], // 66%
    [12, 15, 'alerta'], // 80% exato com valores pequenos
    [11, 15, 'ok'], // 73%
  ])('gasto %i de %i → %s', (gasto, limite, esperado) => {
    expect(situacao(gasto, limite)).toBe(esperado)
  })
})

describe('orçamento do mês', () => {
  it('soma gastos da categoria no mês (cartão e conta), ignora outros meses e outras categorias', async () => {
    await salvarCartao({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
    const cartao = (await db.cartoes.toArray())[0]
    await definirOrcamento(b.cat('despesa', 'Alimentação'), 80000)
    await definirOrcamento(b.cat('despesa', 'Lazer'), 20000)
    await gastar(30000)
    await gastar(45000, 'Alimentação', '2026-11-25', { contaId: null, cartaoId: cartao.id }) // cartão
    await gastar(99999, 'Alimentação', '2026-12-01') // outro mês
    await gastar(25000, 'Lazer')
    await gastar(10000, 'Mercado') // sem orçamento
    const r = orcamentoDoMes('2026-11', await orc(), await lancs())
    expect(r.itens.map((i) => [i.categoriaId, i.gasto, i.restante, i.porcentagem, i.situacao])).toEqual([
      [b.cat('despesa', 'Lazer'), 25000, -5000, 125, 'estourado'],
      [b.cat('despesa', 'Alimentação'), 75000, 5000, 93, 'alerta'],
    ])
    expect(r).toMatchObject({ limiteTotal: 100000, gastoTotal: 100000 })
  })

  it('compra parcelada conta em cada mês só o valor da parcela', async () => {
    await salvarCartao({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
    const cartao = (await db.cartoes.toArray())[0]
    await definirOrcamento(b.cat('despesa', 'Compras'), 50000)
    await gastar(120000, 'Compras', '2026-11-20', { contaId: null, cartaoId: cartao.id, parcelas: 4 })
    for (const mes of ['2026-11', '2026-12', '2027-01', '2027-02']) {
      expect(orcamentoDoMes(mes, await orc(), await lancs()).itens[0]).toMatchObject({ gasto: 30000, situacao: 'ok' })
    }
    expect(orcamentoDoMes('2027-03', await orc(), await lancs()).itens[0].gasto).toBe(0)
  })

  it('transferências, receitas e pagamento de fatura não contam como gasto', async () => {
    await salvarCartao({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
    const cartao = (await db.cartoes.toArray())[0]
    await definirOrcamento(b.cat('despesa', 'Alimentação'), 10000)
    await gastar(5000, 'Alimentação', '2026-10-20', { contaId: null, cartaoId: cartao.id })
    await pagarFatura({ cartaoId: cartao.id, fatura: '2026-11', contaId: b.conta('Inter'), valor: 5000, data: '2026-11-10' })
    await salvarLancamento({ tipo: 'transferencia', valor: 99900, contaId: b.conta('Inter'), contaDestinoId: b.conta('Carteira'), data: '2026-11-11', parcelas: 1 })
    expect(orcamentoDoMes('2026-11', await orc(), await lancs()).itens[0].gasto).toBe(0)
  })
})

describe('aviso ao lançar', () => {
  it('avisa só quando muda de faixa para pior', async () => {
    const alim = b.cat('despesa', 'Alimentação')
    await definirOrcamento(alim, 100000)
    const passo = async (valor) => {
      const antes = await lancs()
      await gastar(valor)
      return avisoDeOrcamento({ meses: ['2026-11'], orcamentos: await orc(), antes, depois: await lancs() })
    }
    expect(await passo(50000)).toBeNull() // 50%
    expect(await passo(30000)).toMatchObject({ situacao: 'alerta', porcentagem: 80, restante: 20000 }) // 80%
    expect(await passo(10000)).toBeNull() // 90%: continua alerta, não repete
    expect(await passo(10001)).toMatchObject({ situacao: 'estourado', gasto: 100001 })
    expect(await passo(5000)).toBeNull() // já estourado
  })

  it('pula direto de ok para estourado', async () => {
    await definirOrcamento(b.cat('despesa', 'Lazer'), 10000)
    const antes = await lancs()
    await gastar(20000, 'Lazer')
    expect(avisoDeOrcamento({ meses: ['2026-11'], orcamentos: await orc(), antes, depois: await lancs() })).toMatchObject({ situacao: 'estourado' })
  })

  it('textos do aviso, com e sem zoeira', () => {
    const alerta = { situacao: 'alerta', porcentagem: 85, restante: 15000, gasto: 85000, limite: 100000 }
    const estouro = { situacao: 'estourado', porcentagem: 110, restante: -10000, gasto: 110000, limite: 100000 }
    const limpar = (s) => s.replace(/\s/g, ' ')
    expect(limpar(textoAviso(alerta, 'Alimentação', false))).toBe('Você já usou 85% do orçamento de Alimentação. Restam R$ 150,00.')
    expect(limpar(textoAviso(estouro, 'Alimentação', false))).toBe('Orçamento de Alimentação ultrapassado em R$ 100,00.')
    expect(textoAviso(estouro, 'Alimentação', true)).toContain('Estourou')
    expect(textoAviso(null, 'x', true)).toBeNull()
  })
})

describe('pagamento de fatura com data escolhida', () => {
  it('pagamento agendado só sai do saldo na data', async () => {
    await salvarCartao({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
    const cartao = (await db.cartoes.toArray())[0]
    await gastar(5000, 'Alimentação', '2026-11-20', { contaId: null, cartaoId: cartao.id })
    await pagarFatura({ cartaoId: cartao.id, fatura: '2026-12', contaId: b.conta('Inter'), valor: 5000, data: '2026-12-08' })
    const conta = await db.contas.get(b.conta('Inter'))
    expect(saldoConta(conta, await lancs(), '2026-12-07')).toBe(0)
    expect(saldoConta(conta, await lancs(), '2026-12-08')).toBe(-5000)
    await expect(pagarFatura({ cartaoId: cartao.id, fatura: '2026-12', contaId: b.conta('Inter'), valor: 1, data: '2026-02-30' })).rejects.toThrow()
  })
})
