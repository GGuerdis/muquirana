import { describe, it, expect, beforeEach } from 'vitest'
import { acharRepetidos, juntarRepetidos } from '../src/lib/repetidos.js'
import { db, criarDadosIniciais } from '../src/lib/db.js'
import { salvarLancamento } from '../src/lib/lancamentos.js'
import { bancoNovo } from './ajuda.js'

const tudo = async () => ({
  contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray(),
  lancamentos: await db.lancamentos.toArray(), recorrentes: await db.recorrentes.toArray(), orcamentos: await db.orcamentos.toArray(), regras: await db.regras.toArray(),
})

// Simula: o aparelho tinha os dados iniciais e a conta na nuvem também (mesmos nomes, ids diferentes)
async function dadosDuasVezes() {
  const b = await bancoNovo()
  const iniciais = { contas: await db.contas.toArray(), categorias: await db.categorias.toArray() }
  await db.contas.bulkAdd(iniciais.contas.map(({ id, ...c }) => ({ ...c })))
  await db.categorias.bulkAdd(iniciais.categorias.map(({ id, ...c }) => ({ ...c })))
  return b
}

describe('repetidos ao entrar na conta', () => {
  beforeEach(async () => { db.close(); await db.delete(); await db.open() })

  it('com tudo sem uso, sobra uma de cada (contas e categorias)', async () => {
    await dadosDuasVezes()
    expect(await db.contas.count()).toBe(6)
    expect(await db.categorias.count()).toBe(38)
    expect(await juntarRepetidos(await tudo())).toBe(3 + 19)
    expect((await db.contas.toArray()).map((c) => c.nome).sort()).toEqual(['Carteira', 'Inter', 'Santander'])
    expect(await db.categorias.count()).toBe(19)
    expect(await juntarRepetidos(await tudo())).toBe(0) // de novo: nada
  })

  it('a cópia usada fica, mesmo sendo a "segunda"; a outra sai', async () => {
    await dadosDuasVezes()
    const santanderes = (await db.contas.toArray()).filter((c) => c.nome === 'Santander')
    const mercados = (await db.categorias.toArray()).filter((c) => c.nome === 'Mercado')
    const usada = santanderes[1], catUsada = mercados[1]
    await salvarLancamento({ tipo: 'despesa', valor: 100, categoriaId: catUsada.id, contaId: usada.id, cartaoId: null, data: '2025-01-01', parcelas: 1, descricao: 'x' })
    await juntarRepetidos(await tudo())
    expect((await db.contas.toArray()).filter((c) => c.nome === 'Santander').map((c) => c.id)).toEqual([usada.id])
    expect((await db.categorias.toArray()).filter((c) => c.nome === 'Mercado').map((c) => c.id)).toEqual([catUsada.id])
  })

  it('duas cópias usadas: nenhuma é apagada', async () => {
    await dadosDuasVezes()
    const [a, b2] = (await db.contas.toArray()).filter((c) => c.nome === 'Inter')
    const cat = (await db.categorias.toArray()).find((c) => c.nome === 'Outros' && c.tipo === 'despesa')
    for (const c of [a, b2]) await salvarLancamento({ tipo: 'despesa', valor: 100, categoriaId: cat.id, contaId: c.id, cartaoId: null, data: '2025-01-01', parcelas: 1, descricao: 'x' })
    await juntarRepetidos(await tudo())
    expect((await db.contas.toArray()).filter((c) => c.nome === 'Inter').length).toBe(2)
  })

  it('conta usada por cartão, conta fixa ou orçamento/regra conta como usada', () => {
    const contas = [{ id: 'a', nome: 'Inter' }, { id: 'b', nome: 'Inter' }]
    expect(acharRepetidos({ contas, cartoes: [{ id: 'k', nome: 'X', contaPagamentoId: 'a' }] }).contas).toEqual(['b'])
    expect(acharRepetidos({ contas, recorrentes: [{ contaId: 'b' }] }).contas).toEqual(['a'])
    const categorias = [{ id: 'c1', tipo: 'despesa', nome: 'Lazer' }, { id: 'c2', tipo: 'despesa', nome: 'Lazer' }, { id: 'c3', tipo: 'receita', nome: 'Lazer' }]
    expect(acharRepetidos({ categorias, orcamentos: [{ categoriaId: 'c2' }] }).categorias).toEqual(['c1'])
    expect(acharRepetidos({ categorias, regras: [{ categoriaId: 'c1' }] }).categorias).toEqual(['c2']) // receita "Lazer" é outra
  })

  it('sem uso: fica a que tem saldo informado; nomes com acento/maiúscula diferentes são o mesmo', () => {
    const contas = [{ id: 'a', nome: 'Itaú', saldoInicial: 0 }, { id: 'b', nome: ' itau ', saldoInicial: 5000 }]
    expect(acharRepetidos({ contas }).contas).toEqual(['a'])
  })

  it('cartões repetidos sem compra saem; a escolha é a mesma em qualquer ordem (dois aparelhos)', () => {
    const cartoes = [{ id: 'z', nome: 'Inter' }, { id: 'm', nome: 'Inter' }]
    expect(acharRepetidos({ cartoes }).cartoes).toEqual(['z'])
    expect(acharRepetidos({ cartoes: [...cartoes].reverse() }).cartoes).toEqual(['z'])
    expect(acharRepetidos({ cartoes, lancamentos: [{ cartaoId: 'z' }] }).cartoes).toEqual(['m'])
  })

  it('nomes diferentes nunca são juntados', async () => {
    await criarDadosIniciais()
    expect(acharRepetidos(await tudo())).toEqual({ contas: [], cartoes: [], categorias: [] })
  })
})
