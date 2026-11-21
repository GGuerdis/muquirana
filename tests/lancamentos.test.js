import { describe, it, expect, beforeEach } from 'vitest'
import { db, exportarBackup, restaurarBackup } from '../src/lib/db.js'
import { salvarLancamento, apagarLancamento, formDoLancamento, pagarFatura, validarLancamento } from '../src/lib/lancamentos.js'
import { salvarCartao } from '../src/lib/cadastros.js'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { resumoFatura, limiteUsado } from '../src/lib/fatura.js'
import { bancoNovo, fotografia } from './ajuda.js'

let b, cartaoId
beforeEach(async () => {
  b = await bancoNovo()
  await salvarCartao({ nome: 'Inter', limite: 500000, diaFechamento: 3, diaVencimento: 10, contaPagamentoId: b.conta('Inter') })
  cartaoId = (await db.cartoes.toArray())[0].id
})

const todos = () => db.lancamentos.toArray()
const despesaConta = (extra = {}) => ({ tipo: 'despesa', valor: 4590, categoriaId: b.cat('despesa', 'Alimentação'), contaId: b.conta('Santander'), cartaoId: null, data: '2026-11-20', descricao: 'Almoço', parcelas: 1, ...extra })
const compraCartao = (extra = {}) => ({ tipo: 'despesa', valor: 120000, categoriaId: b.cat('despesa', 'Compras'), contaId: null, cartaoId, data: '2026-11-20', descricao: 'Tênis', parcelas: 4, ...extra })

describe('banco novo', () => {
  it('vem com 3 contas zeradas e categorias padrão', () => {
    expect(b.contas.map((c) => [c.nome, c.saldoInicial])).toEqual([['Santander', 0], ['Inter', 0], ['Carteira', 0]])
    expect(b.categorias.filter((c) => c.tipo === 'despesa').length).toBe(13)
    expect(b.categorias.filter((c) => c.tipo === 'receita').length).toBe(6)
  })
})

describe('salvar lançamentos', () => {
  it('despesa à vista sai do saldo da conta', async () => {
    await salvarLancamento(despesaConta())
    const [l] = await todos()
    expect(l).toMatchObject({ tipo: 'despesa', valor: 4590, descricao: 'Almoço', cartaoId: null })
    const conta = await db.contas.get(b.conta('Santander'))
    expect(saldoConta(conta, await todos(), '2026-11-20')).toBe(-4590)
  })

  it('compra parcelada no cartão: 4 parcelas, soma exata, faturas consecutivas', async () => {
    await salvarLancamento(compraCartao({ valor: 100000, parcelas: 3 }))
    const ls = (await todos()).sort((x, y) => x.parcela - y.parcela)
    expect(ls.map((l) => l.valor)).toEqual([33334, 33333, 33333])
    expect(ls.reduce((s, l) => s + l.valor, 0)).toBe(100000)
    expect(ls.map((l) => l.fatura)).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(ls.map((l) => l.data)).toEqual(['2026-11-20', '2026-12-20', '2027-01-20'])
    expect(new Set(ls.map((l) => l.grupoParcelaId)).size).toBe(1)
    expect(ls.every((l) => l.totalParcelas === 3 && l.valorTotal === 100000 && l.dataCompra === '2026-11-20' && l.contaId === null)).toBe(true)
  })

  it('compra à vista no cartão não cria grupo de parcelas', async () => {
    await salvarLancamento(compraCartao({ parcelas: 1, valor: 5000, data: '2026-12-03' }))
    const [l] = await todos()
    expect(l.grupoParcelaId).toBeUndefined()
    expect(l.fatura).toBe('2027-01') // comprou no dia do fechamento
  })

  it('compra parcelada no dia 31 mantém o fim do mês nas parcelas', async () => {
    await salvarLancamento(compraCartao({ data: '2027-01-31', parcelas: 3, valor: 30000 }))
    const ls = (await todos()).sort((x, y) => x.parcela - y.parcela)
    expect(ls.map((l) => l.data)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
    expect(ls.map((l) => l.fatura)).toEqual(['2027-02', '2027-03', '2027-04'])
  })

  it('transferência move dinheiro sem mudar o total', async () => {
    await salvarLancamento({ tipo: 'transferencia', valor: 25000, contaId: b.conta('Santander'), contaDestinoId: b.conta('Inter'), data: '2026-11-20', parcelas: 1 })
    const contas = await db.contas.toArray()
    const L = await todos()
    const saldos = Object.fromEntries(contas.map((c) => [c.nome, saldoConta(c, L, '2026-11-20')]))
    expect(saldos).toEqual({ Santander: -25000, Inter: 25000, Carteira: 0 })
    expect(L[0].categoriaId).toBeNull()
    expect(resumoMes('2026-11', L)).toMatchObject({ entrou: 0, saiu: 0 })
  })

  it('receita entra na conta', async () => {
    await salvarLancamento({ tipo: 'receita', valor: 500000, categoriaId: b.cat('receita', 'Salário'), contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-05', parcelas: 1 })
    const inter = await db.contas.get(b.conta('Inter'))
    expect(saldoConta(inter, await todos(), '2026-11-20')).toBe(500000)
  })

  it('descrição é limpa e limitada', async () => {
    await salvarLancamento(despesaConta({ descricao: '   ' + 'x'.repeat(200) + '  ' }))
    expect((await todos())[0].descricao.length).toBe(80)
  })
})

describe('validação (nada inválido é gravado)', () => {
  const casos = [
    ['valor zero', () => despesaConta({ valor: 0 }), 'valor'],
    ['valor negativo', () => despesaConta({ valor: -100 }), 'valor'],
    ['valor quebrado', () => despesaConta({ valor: 10.5 }), 'valor'],
    ['data inexistente', () => despesaConta({ data: '2026-02-30' }), 'Data'],
    ['sem categoria', () => despesaConta({ categoriaId: null }), 'categoria'],
    ['categoria de receita numa despesa', () => despesaConta({ categoriaId: b.cat('receita', 'Salário') }), 'categoria'],
    ['conta inexistente', () => despesaConta({ contaId: 999 }), 'saiu'],
    ['conta e cartão ao mesmo tempo', () => compraCartao({ contaId: b.conta('Inter') }), 'OU'],
    ['cartão inexistente', () => compraCartao({ cartaoId: 999 }), 'Cartão'],
    ['parcelas demais', () => compraCartao({ parcelas: 49 }), 'Parcelas'],
    ['parcelas zero', () => compraCartao({ parcelas: 0 }), 'Parcelas'],
    ['parcela de zero centavos', () => compraCartao({ valor: 3, parcelas: 4 }), 'pequeno'],
    ['parcelar sem cartão', () => despesaConta({ parcelas: 3 }), 'cartão'],
    ['receita no cartão', () => ({ tipo: 'receita', valor: 100, categoriaId: b.cat('receita', 'Salário'), contaId: null, cartaoId, data: '2026-11-20' }), 'cartão'],
    ['transferência para a mesma conta', () => ({ tipo: 'transferencia', valor: 100, contaId: b.conta('Inter'), contaDestinoId: b.conta('Inter'), data: '2026-11-20' }), 'mesma'],
    ['transferência sem destino', () => ({ tipo: 'transferencia', valor: 100, contaId: b.conta('Inter'), contaDestinoId: null, data: '2026-11-20' }), 'destino'],
    ['tipo desconhecido', () => despesaConta({ tipo: 'pagamentoFatura' }), 'Tipo'],
  ]
  it.each(casos)('%s', async (_, form, trecho) => {
    await expect(salvarLancamento(form())).rejects.toThrow(trecho)
    expect(await db.lancamentos.count()).toBe(0)
  })

  it('a tela e o banco usam a mesma validação', async () => {
    const refs = { contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() }
    expect(validarLancamento(despesaConta(), refs)).toBeNull()
    expect(validarLancamento(compraCartao(), refs)).toBeNull()
    expect(validarLancamento(despesaConta({ valor: 0 }), refs)).toMatch(/valor/)
  })
})

describe('editar e apagar', () => {
  it('editar lançamento simples mantém o mesmo registro (edição em dois aparelhos não duplica)', async () => {
    await salvarLancamento(despesaConta())
    const [original] = await todos()
    await salvarLancamento({ ...formDoLancamento(original), valor: 5000, descricao: 'Jantar' }, original)
    await salvarLancamento({ ...formDoLancamento(original), contaId: b.conta('Carteira') }, original)
    const ls = await todos()
    expect(ls.length).toBe(1)
    expect(ls[0].id).toBe(original.id)
    expect(ls[0]).toMatchObject({ contaId: b.conta('Carteira'), criadoEm: original.criadoEm })
  })

  it('editar mantém o lançamento no mesmo espaço (pessoal ou compartilhado)', async () => {
    const id = await db.lancamentos.add({ tipo: 'despesa', valor: 100, descricao: 'x', categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-20', criadoEm: 1, realmId: 'rlm-casa' })
    const original = await db.lancamentos.get(id)
    await salvarLancamento({ ...formDoLancamento(original), valor: 200 }, original)
    expect((await db.lancamentos.get(id)).realmId).toBe('rlm-casa')
    // e também quando vira parcelado
    await salvarCartao({ nome: 'Outro', limite: 0, diaFechamento: 3, diaVencimento: 10 })
    const cartao2 = (await db.cartoes.toArray()).find((c) => c.nome === 'Outro')
    const editado = await db.lancamentos.get(id)
    await salvarLancamento({ ...formDoLancamento(editado), contaId: null, cartaoId: cartao2.id, parcelas: 2 }, editado)
    expect((await todos()).filter((l) => l.cartaoId === cartao2.id).every((l) => l.realmId === 'rlm-casa')).toBe(true)
  })

  it('lançamento simples virando parcelado (e vice-versa) troca os registros sem sobrar nada', async () => {
    await salvarLancamento(compraCartao({ parcelas: 1, valor: 9000 }))
    const [simples] = await todos()
    await salvarLancamento({ ...formDoLancamento(simples), parcelas: 3 }, simples)
    let ls = await todos()
    expect(ls.length).toBe(3)
    expect(ls.some((l) => l.id === simples.id)).toBe(false)
    await salvarLancamento({ ...formDoLancamento(ls[0]), parcelas: 1 }, ls[0])
    ls = await todos()
    expect(ls.length).toBe(1)
    expect(ls[0].grupoParcelaId).toBeUndefined()
    expect(ls[0].valor).toBe(9000)
  })

  it('editar compra parcelada substitui todas as parcelas (4x → 2x, outro valor)', async () => {
    await salvarLancamento(compraCartao())
    const original = (await todos())[2]
    const form = formDoLancamento(original)
    expect(form).toMatchObject({ valor: 120000, data: '2026-11-20', parcelas: 4 })
    await salvarLancamento({ ...form, valor: 50001, parcelas: 2 }, original)
    const ls = (await todos()).sort((x, y) => x.parcela - y.parcela)
    expect(ls.length).toBe(2)
    expect(ls.map((l) => l.valor)).toEqual([25001, 25000])
    expect(ls[0].criadoEm).toBe(original.criadoEm)
  })

  it('editar parcelada para à vista na conta', async () => {
    await salvarLancamento(compraCartao())
    const original = (await todos())[0]
    await salvarLancamento({ ...formDoLancamento(original), cartaoId: null, contaId: b.conta('Carteira'), parcelas: 1 }, original)
    const ls = await todos()
    expect(ls.length).toBe(1)
    expect(ls[0]).toMatchObject({ valor: 120000, contaId: b.conta('Carteira'), cartaoId: null })
  })

  it('edição inválida não apaga o original', async () => {
    await salvarLancamento(despesaConta())
    const original = (await todos())[0]
    await expect(salvarLancamento({ ...original, valor: 0 }, original)).rejects.toThrow()
    const ls = await todos()
    expect(ls.length).toBe(1)
    expect(ls[0].valor).toBe(4590)
  })

  it('apagar uma parcela apaga a compra inteira, e só ela', async () => {
    await salvarLancamento(compraCartao())
    await salvarLancamento(compraCartao({ descricao: 'Outra', valor: 2000, parcelas: 2 }))
    await salvarLancamento(despesaConta())
    const tenis = (await todos()).find((l) => l.descricao === 'Tênis' && l.parcela === 3)
    await apagarLancamento(tenis)
    const ls = await todos()
    expect(ls.length).toBe(3)
    expect(ls.some((l) => l.descricao === 'Tênis')).toBe(false)
  })
})

describe('pagar fatura', () => {
  it('pagamento sai da conta, quita a fatura e libera o limite', async () => {
    await salvarLancamento(compraCartao())
    const cartao = await db.cartoes.get(cartaoId)
    await pagarFatura({ cartaoId, fatura: '2026-12', contaId: b.conta('Inter'), valor: 30000, data: '2026-12-05' })
    const L = await todos()
    expect(resumoFatura(cartao, '2026-12', L, '2026-12-05')).toMatchObject({ total: 30000, pago: 30000, restante: 0, status: 'paga' })
    expect(resumoFatura(cartao, '2027-01', L, '2026-12-05')).toMatchObject({ total: 30000, pago: 0 })
    expect(limiteUsado(cartao, L)).toBe(90000)
    expect(saldoConta(await db.contas.get(b.conta('Inter')), L, '2026-12-05')).toBe(-30000)
    // pagamento não conta como gasto do mês
    expect(resumoMes('2026-12', L).saiu).toBe(30000) // só a 2ª parcela, de dezembro
  })

  it('pagamento parcial e depois o resto', async () => {
    await salvarLancamento(compraCartao())
    const cartao = await db.cartoes.get(cartaoId)
    await pagarFatura({ cartaoId, fatura: '2026-12', contaId: b.conta('Inter'), valor: 10000, data: '2026-12-05' })
    expect(resumoFatura(cartao, '2026-12', await todos()).restante).toBe(20000)
    await pagarFatura({ cartaoId, fatura: '2026-12', contaId: b.conta('Santander'), valor: 20000, data: '2026-12-06' })
    expect(resumoFatura(cartao, '2026-12', await todos()).restante).toBe(0)
  })

  it('recusa pagar mais do que falta, conta inexistente e valor inválido', async () => {
    await salvarLancamento(compraCartao())
    const base = { cartaoId, fatura: '2026-12', contaId: b.conta('Inter'), data: '2026-12-05' }
    await expect(pagarFatura({ ...base, valor: 30001 })).rejects.toThrow('passa')
    await expect(pagarFatura({ ...base, valor: 100, contaId: 999 })).rejects.toThrow('conta')
    await expect(pagarFatura({ ...base, valor: 0 })).rejects.toThrow('valor')
    await expect(pagarFatura({ ...base, fatura: '2030-01', valor: 1 })).rejects.toThrow('passa') // fatura vazia
    expect((await todos()).filter((l) => l.tipo === 'pagamentoFatura').length).toBe(0)
  })
})

describe('backup', () => {
  it('exportar e restaurar devolve exatamente os mesmos dados', async () => {
    await salvarLancamento(compraCartao())
    await salvarLancamento(despesaConta())
    await pagarFatura({ cartaoId, fatura: '2026-12', contaId: b.conta('Inter'), valor: 30000, data: '2026-12-05' })
    const antes = await fotografia()
    const json = JSON.parse(JSON.stringify(await exportarBackup())) // como se fosse salvo em arquivo
    await bancoNovo()
    await restaurarBackup(json)
    const depois = await fotografia()
    expect(depois).toEqual(antes)
    expect(JSON.stringify(depois)).not.toContain('QUEBRADO') // nenhuma ligação perdida
  })

  it('recusa arquivo que não é backup, sem apagar nada', async () => {
    await salvarLancamento(despesaConta())
    await expect(restaurarBackup({ foo: 1 })).rejects.toThrow()
    await expect(restaurarBackup({ app: 'muquirana', dados: { lancamentos: 'x', contas: [] } })).rejects.toThrow()
    await expect(restaurarBackup({ app: 'muquirana', dados: { contas: [] } })).rejects.toThrow()
    expect(await db.lancamentos.count()).toBe(1)
  })
})
