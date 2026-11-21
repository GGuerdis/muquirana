// Simulação: centenas de operações aleatórias (lançar, parcelar, transferir, pagar fatura, editar, apagar).
// Depois de CADA operação, confere regras que nunca podem ser quebradas.
import { describe, it, expect } from 'vitest'
import { db } from '../src/lib/db.js'
import { salvarLancamento, apagarLancamento, formDoLancamento, pagarFatura } from '../src/lib/lancamentos.js'
import { salvarCartao, salvarConta } from '../src/lib/cadastros.js'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { resumoFatura, limiteUsado } from '../src/lib/fatura.js'
import { mesDe } from '../src/lib/datas.js'
import { bancoNovo, aleatorio, pad } from './ajuda.js'

const FIM_DOS_TEMPOS = '2999-12-31'

async function conferirTudo(passo) {
  const [contas, cartoes, L] = await Promise.all([db.contas.toArray(), db.cartoes.toArray(), db.lancamentos.toArray()])
  const soma = (pred) => L.filter(pred).reduce((s, l) => s + l.valor, 0)
  const ctx = `passo ${passo}`

  // 1) Todo valor é inteiro positivo (centavos)
  for (const l of L) expect(Number.isSafeInteger(l.valor) && l.valor > 0, ctx).toBe(true)

  // 2) Soma dos saldos = saldos iniciais + receitas - despesas à vista - pagamentos de fatura (transferências se anulam)
  const totalContas = contas.reduce((s, c) => s + saldoConta(c, L, FIM_DOS_TEMPOS), 0)
  const esperado = contas.reduce((s, c) => s + c.saldoInicial, 0)
    + soma((l) => l.tipo === 'receita')
    - soma((l) => l.tipo === 'despesa' && !l.cartaoId)
    - soma((l) => l.tipo === 'pagamentoFatura')
  expect(totalContas, ctx).toBe(esperado)

  // 3) Cartões: limite usado = compras - pagamentos; soma das faturas = soma das compras
  for (const c of cartoes) {
    const compras = soma((l) => l.tipo === 'despesa' && l.cartaoId === c.id)
    const pagos = soma((l) => l.tipo === 'pagamentoFatura' && l.cartaoId === c.id)
    expect(limiteUsado(c, L), ctx).toBe(Math.max(compras - pagos, 0))
    const faturas = new Set(L.filter((l) => l.cartaoId === c.id).map((l) => l.fatura))
    let totalFaturas = 0
    for (const f of faturas) {
      const r = resumoFatura(c, f, L)
      totalFaturas += r.total
      expect(r.restante, ctx).toBe(Math.max(r.total - r.pago, 0))
    }
    expect(totalFaturas, ctx).toBe(compras)
  }

  // 4) Compras no cartão nunca têm conta; todo o resto aponta para uma conta que existe
  for (const l of L) {
    if (l.tipo === 'despesa' && l.cartaoId) expect(l.contaId, ctx).toBeNull()
    else expect(contas.some((c) => c.id === l.contaId), ctx).toBe(true)
    if (l.tipo === 'transferencia') expect(l.contaDestinoId !== l.contaId && contas.some((c) => c.id === l.contaDestinoId), ctx).toBe(true)
  }

  // 5) Parcelamentos: soma exata, parcelas 1..N sem buracos, faturas consecutivas e distintas
  const grupos = new Map()
  for (const l of L.filter((l) => l.grupoParcelaId)) {
    if (!grupos.has(l.grupoParcelaId)) grupos.set(l.grupoParcelaId, [])
    grupos.get(l.grupoParcelaId).push(l)
  }
  for (const ps of grupos.values()) {
    ps.sort((a, b) => a.parcela - b.parcela)
    expect(ps.map((p) => p.parcela), ctx).toEqual(ps.map((_, i) => i + 1))
    expect(ps.length, ctx).toBe(ps[0].totalParcelas)
    expect(ps.reduce((s, p) => s + p.valor, 0), ctx).toBe(ps[0].valorTotal)
    expect(new Set(ps.map((p) => p.fatura)).size, ctx).toBe(ps.length)
  }

  // 6) Resumos mensais: soma de todos os meses = total de receitas e despesas; categorias somam o "saiu"
  const meses = new Set(L.map((l) => mesDe(l.data)))
  let entrou = 0, saiu = 0
  for (const m of meses) {
    const r = resumoMes(m, L)
    entrou += r.entrou
    saiu += r.saiu
    expect(r.categorias.reduce((s, c) => s + c.valor, 0), ctx).toBe(r.saiu)
  }
  expect(entrou, ctx).toBe(soma((l) => l.tipo === 'receita'))
  expect(saiu, ctx).toBe(soma((l) => l.tipo === 'despesa'))
}

describe('simulação de uso com conferência total', () => {
  it.each([1, 2, 3])('rodada %i: 300 operações aleatórias', async (semente) => {
    const b = await bancoNovo()
    const r = aleatorio(semente * 1000)
    await salvarCartao({ nome: 'Inter', limite: 500000, diaFechamento: 3, diaVencimento: 10 })
    await salvarCartao({ nome: 'Santander', limite: 300000, diaFechamento: 28, diaVencimento: 5 })
    await salvarCartao({ nome: 'Fim de mês', limite: 0, diaFechamento: 31, diaVencimento: 9 })
    for (const c of b.contas) await salvarConta({ id: c.id, nome: c.nome, saldoAtual: r.inteiro(-50000, 500000) }, '2026-01-01')
    const cartoes = await db.cartoes.toArray()
    const contas = b.contas.map((c) => c.id)
    const catsDespesa = b.categorias.filter((c) => c.tipo === 'despesa').map((c) => c.id)
    const catsReceita = b.categorias.filter((c) => c.tipo === 'receita').map((c) => c.id)
    const data = () => { const m = r.inteiro(1, 12); return `2026-${pad(m)}-${pad(r.inteiro(1, new Date(2026, m, 0).getDate()))}` }

    let rejeitadas = 0
    for (let passo = 0; passo < 300; passo++) {
      const op = r.inteiro(1, 100)
      try {
        if (op <= 30) {
          await salvarLancamento({ tipo: 'despesa', valor: r.inteiro(1, 200000), categoriaId: r.escolher(catsDespesa), contaId: r.escolher(contas), cartaoId: null, data: data(), parcelas: 1 })
        } else if (op <= 55) {
          const parcelas = r.inteiro(1, 12)
          await salvarLancamento({ tipo: 'despesa', valor: r.inteiro(parcelas, 500000), categoriaId: r.escolher(catsDespesa), contaId: null, cartaoId: r.escolher(cartoes).id, data: data(), parcelas })
        } else if (op <= 70) {
          await salvarLancamento({ tipo: 'receita', valor: r.inteiro(1, 800000), categoriaId: r.escolher(catsReceita), contaId: r.escolher(contas), cartaoId: null, data: data(), parcelas: 1 })
        } else if (op <= 78) {
          const [o, d] = [r.escolher(contas), r.escolher(contas)]
          await salvarLancamento({ tipo: 'transferencia', valor: r.inteiro(1, 100000), contaId: o, contaDestinoId: d, data: data(), parcelas: 1 })
        } else if (op <= 88) {
          const c = r.escolher(cartoes)
          const doCartao = (await db.lancamentos.toArray()).filter((l) => l.cartaoId === c.id && l.tipo === 'despesa')
          if (doCartao.length) {
            const f = r.escolher(doCartao).fatura
            const { restante } = resumoFatura(c, f, await db.lancamentos.toArray())
            const valor = r.prox() < 0.2 ? restante + r.inteiro(1, 1000) : r.inteiro(1, Math.max(restante, 1)) // às vezes tenta pagar a mais
            await pagarFatura({ cartaoId: c.id, fatura: f, contaId: r.escolher(contas), valor, data: data() })
          }
        } else if (op <= 94) {
          const editaveis = (await db.lancamentos.toArray()).filter((l) => l.tipo !== 'pagamentoFatura')
          if (editaveis.length) {
            const original = r.escolher(editaveis)
            const form = formDoLancamento(original)
            const novo = { ...form, valor: r.inteiro(form.parcelas || 1, 300000) }
            if (form.cartaoId) novo.parcelas = r.inteiro(1, 6)
            await salvarLancamento(novo, original)
          }
        } else {
          const todos = await db.lancamentos.toArray()
          if (todos.length) await apagarLancamento(r.escolher(todos))
        }
      } catch {
        rejeitadas++ // operações inválidas (ex.: transferir para a mesma conta, pagar a mais) devem ser recusadas sem estragar nada
      }
      await conferirTudo(passo)
    }
    expect(await db.lancamentos.count()).toBeGreaterThan(50)
    expect(rejeitadas).toBeGreaterThan(0)
  }, 60000)
})
