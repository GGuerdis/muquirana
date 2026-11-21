import { describe, it, expect, beforeEach } from 'vitest'
import { db, exportarBackup, restaurarBackup } from '../src/lib/db.js'
import { salvarRecorrente, excluirRecorrente, pularMes, contasDoMes, modeloDoMes, saldoPrevisto, validarRecorrente } from '../src/lib/recorrentes.js'
import { salvarLancamento, apagarLancamento, formDoLancamento } from '../src/lib/lancamentos.js'
import { salvarCartao, salvarConta, excluirConta, excluirCartao, excluirCategoria } from '../src/lib/cadastros.js'
import { bancoNovo } from './ajuda.js'

let b
beforeEach(async () => { b = await bancoNovo() })

const HOJE = '2026-11-20'
const base = (extra = {}) => ({ descricao: 'Aluguel', tipo: 'despesa', valor: 150000, dia: 10, categoriaId: b.cat('despesa', 'Moradia'), contaId: b.conta('Santander'), cartaoId: null, inicio: '2026-11', fim: null, ...extra })
const todas = () => db.recorrentes.toArray()
const lancs = () => db.lancamentos.toArray()
const lancar = async (r, mes, mudancas = {}) => salvarLancamento({ ...modeloDoMes(r, mes), ...mudancas })

describe('cadastro de contas fixas', () => {
  it('salva e valida', async () => {
    const id = await salvarRecorrente(base({ descricao: '  Aluguel  ' }))
    expect(await db.recorrentes.get(id)).toMatchObject({ descricao: 'Aluguel', dia: 10, pulados: [], fim: null })
  })

  it.each([
    ['sem nome', { descricao: ' ' }, 'nome'],
    ['valor zero', { valor: 0 }, 'valor'],
    ['dia 32', { dia: 32 }, 'dia'],
    ['dia vazio', { dia: '' }, 'dia'],
    ['categoria de receita numa despesa', () => ({ categoriaId: b.cat('receita', 'Salário') }), 'categoria'],
    ['sem conta nem cartão', { contaId: null }, 'conta ou um cartão'],
    ['conta e cartão juntos', { cartaoId: 1 }, 'conta ou um cartão'],
    ['conta inexistente', { contaId: 999 }, 'Conta'],
    ['início inválido', { inicio: '2026-13' }, 'início'],
    ['fim antes do início', { fim: '2026-10' }, 'depois do início'],
  ])('recusa %s', async (_, mudanca, trecho) => {
    const m = typeof mudanca === 'function' ? mudanca() : mudanca
    await expect(salvarRecorrente(base(m))).rejects.toThrow(trecho)
    expect(await db.recorrentes.count()).toBe(0)
  })

  it('receita no cartão é recusada', async () => {
    await salvarCartao({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
    const cartao = (await db.cartoes.toArray())[0]
    const refs = { contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() }
    expect(validarRecorrente(base({ tipo: 'receita', categoriaId: b.cat('receita', 'Salário'), contaId: null, cartaoId: cartao.id }), refs)).toMatch(/cartão/)
  })
})

describe('contas do mês', () => {
  it('situações: pendente, atrasada, lançada e pulada; ordem por vencimento', async () => {
    const aluguel = await salvarRecorrente(base({ dia: 10 }))
    const salario = await salvarRecorrente(base({ descricao: 'Salário', tipo: 'receita', categoriaId: b.cat('receita', 'Salário'), valor: 500000, dia: 30 }))
    const netflix = await salvarRecorrente(base({ descricao: 'Netflix', valor: 4590, dia: 15, categoriaId: b.cat('despesa', 'Assinaturas') }))
    const academia = await salvarRecorrente(base({ descricao: 'Academia', valor: 9990, dia: 5 }))
    await lancar(await db.recorrentes.get(netflix), '2026-11')
    await pularMes(academia, '2026-11')

    const lista = contasDoMes('2026-11', await todas(), await lancs(), HOJE)
    expect(lista.map((x) => [x.recorrente.descricao, x.vencimento, x.situacao])).toEqual([
      ['Academia', '2026-11-05', 'pulada'],
      ['Aluguel', '2026-11-10', 'atrasada'],
      ['Netflix', '2026-11-15', 'lancada'],
      ['Salário', '2026-11-30', 'pendente'],
    ])
    // em dezembro tudo volta a ficar pendente
    expect(contasDoMes('2026-12', await todas(), await lancs(), HOJE).every((x) => x.situacao === 'pendente')).toBe(true)
    expect(aluguel && salario).toBeTruthy()
  })

  it('respeita início e fim, e dia 31 em mês curto', async () => {
    await salvarRecorrente(base({ descricao: 'Curso', inicio: '2026-12', fim: '2027-02', dia: 31 }))
    const r = await todas()
    expect(contasDoMes('2026-11', r, [], HOJE)).toEqual([])
    expect(contasDoMes('2027-02', r, [], HOJE)[0].vencimento).toBe('2027-02-28')
    expect(contasDoMes('2027-03', r, [], HOJE)).toEqual([])
  })

  it('lançar duas vezes no mesmo mês é recusado; em outro mês pode', async () => {
    const id = await salvarRecorrente(base())
    const r = await db.recorrentes.get(id)
    await lancar(r, '2026-11', { valor: 151000 }) // o valor pode ser ajustado ao lançar
    await expect(lancar(r, '2026-11')).rejects.toThrow('já foi lançada')
    await lancar(r, '2026-12')
    const ls = await lancs()
    expect(ls.map((l) => [l.competencia, l.valor, l.data, l.recorrenteId])).toEqual([
      ['2026-11', 151000, '2026-11-10', id],
      ['2026-12', 150000, '2026-12-10', id],
    ])
  })

  it('editar o lançamento mantém o vínculo; apagar volta a ficar pendente', async () => {
    const id = await salvarRecorrente(base())
    await lancar(await db.recorrentes.get(id), '2026-11')
    let [l] = await lancs()
    await salvarLancamento({ ...formDoLancamento(l), valor: 149000 }, l)
    ;[l] = await lancs()
    expect(l).toMatchObject({ recorrenteId: id, competencia: '2026-11', valor: 149000 })
    expect(contasDoMes('2026-11', await todas(), await lancs(), HOJE)[0].situacao).toBe('lancada')
    await apagarLancamento(l)
    expect(contasDoMes('2026-11', await todas(), await lancs(), HOJE)[0].situacao).toBe('atrasada')
  })

  it('pular e desfazer só afetam aquele mês', async () => {
    const id = await salvarRecorrente(base())
    await pularMes(id, '2026-11')
    await pularMes(id, '2026-11') // repetir não duplica
    expect((await db.recorrentes.get(id)).pulados).toEqual(['2026-11'])
    expect(contasDoMes('2026-12', await todas(), [], HOJE)[0].situacao).toBe('pendente')
    await pularMes(id, '2026-11', false)
    expect((await db.recorrentes.get(id)).pulados).toEqual([])
  })

  it('excluir a conta fixa não apaga o que já foi lançado', async () => {
    const id = await salvarRecorrente(base())
    await lancar(await db.recorrentes.get(id), '2026-11')
    await excluirRecorrente(id)
    expect(await db.lancamentos.count()).toBe(1)
    expect(contasDoMes('2026-11', await todas(), await lancs(), HOJE)).toEqual([])
  })

  it('não deixa excluir conta, cartão ou categoria usados por conta fixa', async () => {
    await salvarCartao({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
    const cartao = (await db.cartoes.toArray())[0]
    await salvarRecorrente(base({ contaId: b.conta('Carteira') }))
    await salvarRecorrente(base({ descricao: 'Spotify', contaId: null, cartaoId: cartao.id, categoriaId: b.cat('despesa', 'Assinaturas') }))
    await expect(excluirConta(b.conta('Carteira'))).rejects.toThrow('conta fixa')
    await expect(excluirCartao(cartao.id)).rejects.toThrow('conta fixa')
    await expect(excluirCategoria(b.cat('despesa', 'Moradia'))).rejects.toThrow('conta fixa')
  })

  it('entra no backup', async () => {
    const id = await salvarRecorrente(base())
    await pularMes(id, '2026-12')
    const bk = JSON.parse(JSON.stringify(await exportarBackup()))
    await bancoNovo()
    await restaurarBackup(bk)
    expect(await db.recorrentes.toArray()).toEqual([expect.objectContaining({ descricao: 'Aluguel', pulados: ['2026-12'] })])
    expect(id).toBeTruthy()
  })
})

describe('saldo previsto para o fim do mês', () => {
  it('soma saldo de hoje, agendados, contas fixas a lançar e faturas que vencem no mês', async () => {
    const S = b.conta('Santander')
    await salvarConta({ id: S, nome: 'Santander', saldoAtual: 100000 }, HOJE)
    await salvarCartao({ nome: 'A', diaFechamento: 3, diaVencimento: 10 })
    await salvarCartao({ nome: 'B', diaFechamento: 20, diaVencimento: 28 })
    const [A, B] = await db.cartoes.toArray()
    const compra = (cartaoId, data, valor) => salvarLancamento({ tipo: 'despesa', valor, categoriaId: b.cat('despesa', 'Compras'), contaId: null, cartaoId, data, parcelas: 1 })
    await compra(A.id, '2026-10-20', 30000) // fatura A de nov: venceu dia 10, não paga
    await compra(B.id, '2026-11-10', 12000) // fatura B de nov: vence dia 28
    await compra(B.id, '2026-11-21', 5000) // fatura B de dez: fora do mês
    await salvarLancamento({ tipo: 'despesa', valor: 20000, categoriaId: b.cat('despesa', 'Outros'), contaId: S, cartaoId: null, data: '2026-11-25', parcelas: 1 }) // agendado
    await salvarLancamento({ tipo: 'despesa', valor: 7000, categoriaId: b.cat('despesa', 'Outros'), contaId: S, cartaoId: null, data: '2026-12-01', parcelas: 1 }) // mês que vem

    const cat = (n, t = 'despesa') => b.cat(t, n)
    await salvarRecorrente(base({ descricao: 'Salário', tipo: 'receita', categoriaId: cat('Salário', 'receita'), valor: 500000, dia: 30 })) // +5000
    await salvarRecorrente(base({ descricao: 'Aluguel', valor: 150000, dia: 10 })) // atrasada: -1500
    const netflix = await salvarRecorrente(base({ descricao: 'Netflix', valor: 4590, dia: 15, categoriaId: cat('Assinaturas') }))
    await lancar(await db.recorrentes.get(netflix), '2026-11') // já lançada: está no saldo de hoje
    const academia = await salvarRecorrente(base({ descricao: 'Academia', valor: 9990, dia: 5 }))
    await pularMes(academia, '2026-11') // pulada: não conta
    await salvarRecorrente(base({ descricao: 'Seguro', valor: 20000, dia: 12, inicio: '2026-12' })) // começa em dezembro
    await salvarRecorrente(base({ descricao: 'Spotify', valor: 2190, dia: 5, contaId: null, cartaoId: B.id, categoriaId: cat('Assinaturas') })) // na fatura B de nov
    await salvarRecorrente(base({ descricao: 'Nuvem', valor: 1000, dia: 25, contaId: null, cartaoId: B.id, categoriaId: cat('Assinaturas') })) // fatura B de dez

    const p = saldoPrevisto({ mes: '2026-11', contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), recorrentes: await todas(), lancamentos: await lancs(), dia: HOJE })
    expect(p).toEqual({
      saldoHoje: 100000 - 4590,
      agendados: -20000,
      contasFixas: 500000 - 150000,
      faturas: 30000 + 12000 + 2190,
      previsto: (100000 - 4590 - 20000) + 350000 - 44190,
      fimMes: '2026-11-30',
      mesAtual: true,
    })
    expect(p.previsto).toBe(381220)
  })

  it('fatura paga (mesmo com pagamento agendado) não é descontada de novo', async () => {
    const S = b.conta('Santander')
    await salvarCartao({ nome: 'A', diaFechamento: 3, diaVencimento: 28 })
    const [A] = await db.cartoes.toArray()
    await salvarLancamento({ tipo: 'despesa', valor: 30000, categoriaId: b.cat('despesa', 'Compras'), contaId: null, cartaoId: A.id, data: '2026-11-01', parcelas: 1 })
    const { pagarFatura } = await import('../src/lib/lancamentos.js')
    await pagarFatura({ cartaoId: A.id, fatura: '2026-11', contaId: S, valor: 30000, data: '2026-11-27' }) // agendado para dia 27
    const p = saldoPrevisto({ mes: '2026-11', contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), recorrentes: [], lancamentos: await lancs(), dia: HOJE })
    expect(p).toMatchObject({ saldoHoje: 0, agendados: -30000, faturas: 0, previsto: -30000 })
  })
})
