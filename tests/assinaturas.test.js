// Assinaturas achadas no histórico (dados FICTÍCIOS)
import { describe, it, expect } from 'vitest'
import { acharAssinaturas, modeloContaFixa } from '../src/lib/assinaturas.js'

const HOJE = '2026-11-24'
let n = 0
const g = (descricao, valor, data, extra = {}) => ({ id: `l${++n}`, tipo: 'despesa', descricao, valor, data, categoriaId: 'cat', contaId: null, cartaoId: 'k', ...extra })
const meses = (descricao, valores, dia = 12, extra = {}) => valores.map((v, i) => g(descricao, v, `2026-${String(11 - valores.length + 1 + i).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, extra))

describe('o que conta como assinatura', () => {
  it('mesma cobrança, uma vez por mês, valor parecido, 3+ meses e ainda ativa', () => {
    const a = acharAssinaturas(meses('NETFLIX.COM', [5590, 5590, 5590, 5590]), { dia: HOJE })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ chave: 'NETFLIX', valor: 5590, dia: 12, meses: 4, cartaoId: 'k', contaId: null, porAno: 5590 * 12, subiu: false, ehContaFixa: false })
  })
  it('compras frequentes (várias no mês) ficam de fora', () => {
    const l = [...meses('PADARIA DO ZE', [1500, 1500, 1500]), g('PADARIA DO ZE', 1500, '2026-11-02')]
    expect(acharAssinaturas(l, { dia: HOJE })).toEqual([])
  })
  it('só 2 meses não basta; parou há 2 meses também não', () => {
    expect(acharAssinaturas(meses('SPOTIFY', [2190, 2190]), { dia: HOJE })).toEqual([])
    const parada = [g('DEEZER', 1990, '2026-06-10'), g('DEEZER', 1990, '2026-07-10'), g('DEEZER', 1990, '2026-08-10'), g('DEEZER', 1990, '2026-09-10')]
    expect(acharAssinaturas(parada, { dia: HOJE })).toEqual([])
  })
  it('valores muito diferentes (ex.: conta de luz) não são assinatura', () => {
    expect(acharAssinaturas(meses('ENEL', [12000, 25000, 9000]), { dia: HOJE })).toEqual([])
  })
  it('parcelas não contam; receitas e lançamentos futuros também não', () => {
    expect(acharAssinaturas(meses('LOJA X', [10000, 10000, 10000], 5, { grupoParcelaId: 'p1' }), { dia: HOJE })).toEqual([])
    expect(acharAssinaturas(meses('SALARIO', [10000, 10000, 10000], 5, { tipo: 'receita' }), { dia: HOJE })).toEqual([])
    expect(acharAssinaturas([...meses('APP Y', [990, 990]), g('APP Y', 990, '2026-12-01')], { dia: HOJE })).toEqual([])
  })
})

describe('aviso de aumento', () => {
  it('a última cobrança mais cara que a anterior marca "subiu"', () => {
    const [a] = acharAssinaturas(meses('SPOTIFY', [2190, 2190, 2390]), { dia: HOJE })
    expect(a).toMatchObject({ subiu: true, valor: 2390, valorAnterior: 2190 })
  })
  it('as que subiram aparecem primeiro', () => {
    const l = [...meses('NETFLIX', [5590, 5590, 5590]), ...meses('SPOTIFY', [2190, 2190, 2390], 3)]
    expect(acharAssinaturas(l, { dia: HOJE }).map((a) => a.chave)).toEqual(['SPOTIFY', 'NETFLIX'])
  })
  it('preço que baixou não é aviso', () => {
    const [a] = acharAssinaturas(meses('SPOTIFY', [2390, 2390, 2190]), { dia: HOJE })
    expect(a.subiu).toBe(false)
  })
})

describe('contas fixas', () => {
  it('quem já é conta fixa vem marcado (pelo nome ou pelo lançamento ligado a ela)', () => {
    const r = [{ id: 'r1', tipo: 'despesa', descricao: 'Netflix.com' }]
    expect(acharAssinaturas(meses('NETFLIX.COM', [5590, 5590, 5590]), { recorrentes: r, dia: HOJE })[0].ehContaFixa).toBe(true)
    const ligado = meses('HBO MAX', [3490, 3490, 3490]).map((l) => ({ ...l, recorrenteId: 'r9' }))
    expect(acharAssinaturas(ligado, { dia: HOJE })[0].ehContaFixa).toBe(true)
  })
  it('o formulário de conta fixa abre preenchido com o cartão, o dia e o valor', () => {
    const [a] = acharAssinaturas(meses('NETFLIX.COM', [5590, 5590, 5590], 7), { dia: HOJE })
    expect(modeloContaFixa(a, '2026-11')).toEqual({ tipo: 'despesa', descricao: 'NETFLIX.COM', valor: 5590, dia: 7, categoriaId: 'cat', origem: 'cartao:k', inicio: '2026-11', fim: null })
    const naConta = { ...a, cartaoId: null, contaId: 'c1' }
    expect(modeloContaFixa(naConta, '2026-11').origem).toBe('conta:c1')
  })
})
