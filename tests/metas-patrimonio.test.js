// Metas (cada uma com a sua categoria) e Patrimônio (contas − dívidas no cartão). Dados FICTÍCIOS.
import { describe, it, expect, beforeEach } from 'vitest'
import { salvarMeta, tirarMeta, progressoMeta, categoriasComMeta, validarMeta } from '../src/lib/metas.js'
import { patrimonio, dividaCartao, evolucaoPatrimonio } from '../src/lib/patrimonio.js'
import { salvarCategoria } from '../src/lib/cadastros.js'
import { TELAS } from '../src/lib/telas.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'

describe('criar e editar meta', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  it('sem categoria escolhida, cria uma categoria de despesa com o nome da meta', async () => {
    const id = await salvarMeta({ nome: 'Entrada do apartamento', alvo: 5000000, prazo: '2027-12' })
    const c = await db.categorias.get(id)
    expect(c).toMatchObject({ nome: 'Entrada do apartamento', tipo: 'despesa', desenho: 'meta', meta: { alvo: 5000000, prazo: '2027-12' } })
    expect(c.meta.criadaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('se já existe uma categoria de despesa com esse nome, usa ela (não duplica)', async () => {
    const existente = await salvarCategoria({ nome: 'Apartamento', tipo: 'despesa' })
    const id = await salvarMeta({ nome: 'apartamento', alvo: 100000 })
    expect(id).toBe(existente)
    expect((await db.categorias.where('nome').equals('apartamento').count()) + (await db.categorias.where('nome').equals('Apartamento').count())).toBe(1)
  })
  it('pode ligar a uma categoria que já existe; editar mantém a data de criação; tirar mantém a categoria', async () => {
    const cat = b.cat('despesa', 'Moradia')
    await salvarMeta({ categoriaId: cat, nome: 'Moradia', alvo: 100000 })
    const criada = (await db.categorias.get(cat)).meta.criadaEm
    await salvarMeta({ categoriaId: cat, nome: 'Reforma', alvo: 200000, prazo: '2027-01' })
    expect((await db.categorias.get(cat))).toMatchObject({ nome: 'Reforma', meta: { alvo: 200000, prazo: '2027-01', criadaEm: criada } })
    await tirarMeta(cat)
    const c = await db.categorias.get(cat)
    expect(c.meta).toBeUndefined()
    expect(c.nome).toBe('Reforma')
  })
  it('categoria de receita não serve; validações', async () => {
    await expect(salvarMeta({ categoriaId: b.cat('receita', 'Salário'), nome: 'X', alvo: 100 })).rejects.toThrow(/despesa/)
    expect(validarMeta({ nome: '', alvo: 100 })).toMatch(/nome/)
    expect(validarMeta({ nome: 'X', alvo: 0 })).toMatch(/juntar/)
    expect(validarMeta({ nome: 'X', alvo: 100, prazo: '2027-13' })).toMatch(/prazo/)
    expect(validarMeta({ nome: 'X', alvo: 100, prazo: '' })).toBeNull()
  })
})

describe('progresso da meta', () => {
  const cat = { id: 'apto', nome: 'Apartamento', meta: { alvo: 1000000, prazo: '2027-04' } }
  const g = (valor, data, extra = {}) => ({ categoriaId: 'apto', tipo: 'despesa', valor, data, ...extra })
  const HOJE = '2026-11-24'
  it('soma o que foi lançado na categoria (até hoje), quanto falta e quanto por mês até o prazo', () => {
    const L = [g(100000, '2026-08-10'), g(100000, '2026-09-10'), g(100000, '2026-10-10'), g(50000, '2026-11-05'), g(999999, '2026-12-01'), g(5, '2026-11-01', { categoriaId: 'outra' })]
    const p = progressoMeta(cat, L, HOJE)
    expect(p).toMatchObject({ guardado: 350000, falta: 650000, porcentagem: 35, mesesAtePrazo: 6, porMesNecessario: Math.ceil(650000 / 6), concluida: false, atrasada: false })
    expect(p.ritmo).toBe(100000) // média de ago, set e out
    expect(p.chegaEm).toBe('2027-06') // 650.000 / 100.000 = 6,5 → 7 meses
  })
  it('alcançada: 100% e nada falta; prazo passado com falta: atrasada', () => {
    expect(progressoMeta(cat, [g(1200000, '2026-01-01')], HOJE)).toMatchObject({ porcentagem: 100, falta: 0, concluida: true, chegaEm: null })
    const vencida = { ...cat, meta: { alvo: 1000000, prazo: '2026-06' } }
    expect(progressoMeta(vencida, [g(10, '2026-01-01')], HOJE).atrasada).toBe(true)
  })
  it('sem nada nos últimos 3 meses, não inventa data de chegada', () => {
    expect(progressoMeta(cat, [g(100, '2025-01-01')], HOJE)).toMatchObject({ ritmo: 0, chegaEm: null })
  })
  it('só categorias com meta aparecem', () => {
    expect(categoriasComMeta([cat, { id: 'x', nome: 'X' }, { id: 'y', nome: 'Y', meta: { alvo: 0 } }]).map((c) => c.id)).toEqual(['apto'])
  })
})

describe('patrimônio', () => {
  const contas = [{ id: 'a', nome: 'Santander', saldoInicial: 500000 }, { id: 'b', nome: 'Inter', saldoInicial: 20000 }]
  const cartao = { id: 'k', nome: 'Inter', diaFechamento: 10, diaVencimento: 17 }
  const parcela = (n, data) => ({ tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 10000, data, dataCompra: '2026-10-05', grupoParcelaId: 'p', parcela: n, totalParcelas: 3 })
  const L = [
    parcela(1, '2026-10-05'), parcela(2, '2026-11-05'), parcela(3, '2026-12-05'),
    { tipo: 'despesa', cartaoId: 'k', contaId: null, valor: 5000, data: '2026-11-20' },
    { tipo: 'pagamentoFatura', cartaoId: 'k', contaId: 'a', valor: 10000, data: '2026-11-17' },
    { tipo: 'despesa', contaId: 'a', valor: 30000, data: '2026-11-02' },
  ]
  it('dívida do cartão conta todas as parcelas da compra já feita, menos o que foi pago', () => {
    expect(dividaCartao(cartao, L, '2026-11-24')).toEqual({ total: 30000 + 5000 - 10000, futuras: 10000 })
    expect(dividaCartao(cartao, L, '2026-10-01')).toEqual({ total: 0, futuras: 0 }) // antes da compra
  })
  it('patrimônio = contas − dívidas', () => {
    const p = patrimonio({ contas, cartoes: [cartao], lancamentos: L, dia: '2026-11-24' })
    expect(p.nasContas).toBe(500000 + 20000 - 10000 - 30000)
    expect(p.dividas).toBe(25000)
    expect(p.liquido).toBe(480000 - 25000)
    expect(p.porCartao.map((x) => x.cartao.id)).toEqual(['k'])
  })
  it('cartão sem dívida não aparece na lista', () => {
    expect(patrimonio({ contas, cartoes: [cartao], lancamentos: [], dia: '2026-11-24' }).porCartao).toEqual([])
  })
  it('evolução: um ponto por mês, o último é hoje', () => {
    const ev = evolucaoPatrimonio({ contas, cartoes: [cartao], lancamentos: L, meses: 3, dia: '2026-11-24' })
    expect(ev.map((p) => p.mes)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(ev[0].liquido).toBe(520000)
    expect(ev[1].liquido).toBe(520000 - 30000) // fim de outubro: compra parcelada inteira como dívida
    expect(ev[2].liquido).toBe(455000)
  })
})

describe('menu completo', () => {
  it('9 telas: grade 3×3 fechada', () => {
    expect(TELAS.map((t) => t.id)).toEqual(['inicio', 'lancamentos', 'cartoes', 'historico', 'previsao', 'metas', 'assinaturas', 'patrimonio', 'relatorios'])
  })
})
