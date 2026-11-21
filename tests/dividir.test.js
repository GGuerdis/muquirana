import { describe, it, expect, beforeEach } from 'vitest'
import { dividirLancamento, podeDividir, salvarLancamento } from '../src/lib/lancamentos.js'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'

describe('dividir um lançamento em dois', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const novo = async (extra = {}) => {
    await salvarLancamento({ tipo: 'despesa', valor: 180000, categoriaId: b.cat('despesa', 'Moradia'), contaId: b.conta('Santander'), cartaoId: null, data: '2026-09-02', parcelas: 1, descricao: 'PIX Caixa', ...extra })
    return (await db.lancamentos.toArray()).at(-1)
  }

  it('R$ 1.800 em 02/09 vira R$ 900 em agosto e R$ 900 em setembro; o saldo final não muda', async () => {
    const l = await db.lancamentos.get((await novo({ idExterno: 'conta:x:p:1' })).id)
    const antes = saldoConta(await db.contas.get(b.conta('Santander')), await db.lancamentos.toArray(), '2026-12-31')
    await dividirLancamento(l.id, { valor: 90000, data: '2026-08-31' })
    const L = await db.lancamentos.toArray()
    expect(L.map((x) => [x.data, x.valor, x.categoriaId, x.descricao])).toEqual([
      ['2026-09-02', 90000, b.cat('despesa', 'Moradia'), 'PIX Caixa'],
      ['2026-08-31', 90000, b.cat('despesa', 'Moradia'), 'PIX Caixa'],
    ])
    expect(L[0].idExterno).toBe('conta:x:p:1') // a importação continua reconhecendo o original
    expect(L[1].idExterno).toBeUndefined()
    expect(L[1].divididoDe).toBe(l.id)
    expect(saldoConta(await db.contas.get(b.conta('Santander')), L, '2026-12-31')).toBe(antes)
    expect(resumoMes('2026-08', L).saiu).toBe(90000)
    expect(resumoMes('2026-09', L).saiu).toBe(90000)
  })

  it('valores inválidos, data inválida e parcela/cartão são recusados sem mudar nada', async () => {
    const l = await novo()
    for (const v of [0, -1, 180000, 200000, 1.5]) await expect(dividirLancamento(l.id, { valor: v, data: '2026-08-31' })).rejects.toThrow('outra parte')
    await expect(dividirLancamento(l.id, { valor: 100, data: '2026-02-30' })).rejects.toThrow('data')
    await expect(dividirLancamento('nao-existe', { valor: 100, data: '2026-08-31' })).rejects.toThrow('não encontrado')
    expect((await db.lancamentos.toArray()).map((x) => x.valor)).toEqual([180000])
    expect(podeDividir({ tipo: 'despesa', cartaoId: 'k' })).toBe(false)
    expect(podeDividir({ tipo: 'despesa', grupoParcelaId: 'g' })).toBe(false)
    expect(podeDividir({ tipo: 'pagamentoFatura' })).toBe(false)
    expect(podeDividir({ tipo: 'transferencia' })).toBe(true)
  })

  it('a parte nova fica no mesmo espaço do original', async () => {
    const l = await novo()
    await db.lancamentos.update(l.id, { realmId: 'rlm-casa' })
    const id2 = await dividirLancamento(l.id, { valor: 1000, data: '2026-08-01' })
    expect((await db.lancamentos.get(id2)).realmId).toBe('rlm-casa')
  })
})
