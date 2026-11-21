// Contas, cartões e categorias: salvar e excluir com segurança.
import { db } from './db.js'
import { somarMeses } from './datas.js'
import { faturaDaCompra, faturaAtual, diaValido } from './fatura.js'
import { saldoConta } from './calculos.js'

// ---------- Cartões ----------
// Ao mudar os dias de fechamento/vencimento, as compras das faturas que ainda não fecharam
// são recolocadas na fatura certa. Faturas já fechadas ficam como estão (como no banco).
// Retorna quantos lançamentos mudaram de fatura.
export async function salvarCartao(dados, hoje) {
  const cartao = {
    ...dados,
    nome: (dados.nome || '').trim(),
    limite: Math.max(0, Math.round(dados.limite || 0)),
    diaFechamento: Number(dados.diaFechamento),
    diaVencimento: Number(dados.diaVencimento),
  }
  if (!cartao.nome) throw new Error('Dê um nome para o cartão.')
  if (!diaValido(cartao.diaFechamento) || !diaValido(cartao.diaVencimento)) throw new Error('Os dias de fechamento e vencimento devem ser de 1 a 31.')
  if (cartao.diaFechamento === cartao.diaVencimento) throw new Error('Fechamento e vencimento não podem ser no mesmo dia.')

  return db.transaction('rw', db.cartoes, db.lancamentos, async () => {
    if (cartao.id == null) {
      delete cartao.id
      await db.cartoes.add(cartao)
      return 0
    }
    const anterior = await db.cartoes.get(cartao.id)
    if (!anterior) throw new Error('Cartão não encontrado.')
    await db.cartoes.put(cartao)
    if (anterior.diaFechamento === cartao.diaFechamento && anterior.diaVencimento === cartao.diaVencimento) return 0

    const aberta = faturaAtual(anterior, hoje) // primeira fatura ainda não fechada (pela regra antiga)
    const despesas = await db.lancamentos.where('cartaoId').equals(cartao.id).filter((l) => l.tipo === 'despesa').toArray()
    // Parcelamentos com alguma parcela em fatura já fechada não são mexidos, para não duplicar parcela num mês
    const gruposTravados = new Set(despesas.filter((l) => l.grupoParcelaId && l.fatura < aberta).map((l) => l.grupoParcelaId))
    let mudou = 0
    for (const l of despesas) {
      if (l.fatura < aberta || gruposTravados.has(l.grupoParcelaId)) continue
      const nova = l.grupoParcelaId ? somarMeses(faturaDaCompra(cartao, l.dataCompra), l.parcela - 1) : faturaDaCompra(cartao, l.data)
      if (nova !== l.fatura) {
        await db.lancamentos.update(l.id, { fatura: nova })
        mudou++
      }
    }
    return mudou
  })
}

export async function excluirCartao(id) {
  return db.transaction('rw', db.cartoes, db.lancamentos, async () => {
    if ((await db.lancamentos.where('cartaoId').equals(id).count()) > 0) throw new Error('Este cartão tem lançamentos. Apague-os antes de excluir o cartão.')
    await db.cartoes.delete(id)
  })
}

// ---------- Contas ----------
// O usuário informa o saldo ATUAL; o saldo inicial é ajustado para bater com ele.
export async function salvarConta({ id, nome, emoji, saldoAtual }, hoje) {
  nome = (nome || '').trim()
  if (!nome) throw new Error('Dê um nome para a conta.')
  if (!Number.isSafeInteger(saldoAtual)) throw new Error('Saldo inválido.')
  return db.transaction('rw', db.contas, db.lancamentos, async () => {
    if (id == null) return db.contas.add({ nome, emoji: emoji || '🏦', saldoInicial: saldoAtual })
    const conta = await db.contas.get(id)
    if (!conta) throw new Error('Conta não encontrada.')
    const movimento = saldoConta(conta, await db.lancamentos.toArray(), hoje) - (conta.saldoInicial || 0)
    await db.contas.update(id, { nome, emoji: emoji || '🏦', saldoInicial: saldoAtual - movimento })
    return id
  })
}

export async function excluirConta(id) {
  return db.transaction('rw', db.contas, db.cartoes, db.lancamentos, async () => {
    const usada = await db.lancamentos.filter((l) => l.contaId === id || l.contaDestinoId === id).count()
    if (usada > 0) throw new Error('Esta conta tem lançamentos. Apague-os antes de excluir a conta.')
    if ((await db.cartoes.filter((c) => c.contaPagamentoId === id).count()) > 0) throw new Error('Esta conta paga a fatura de um cartão. Troque a conta no cartão antes.')
    await db.contas.delete(id)
  })
}

// ---------- Categorias ----------
export async function salvarCategoria({ id, nome, emoji, tipo }) {
  nome = (nome || '').trim()
  if (!nome) throw new Error('Dê um nome para a categoria.')
  if (!['despesa', 'receita'].includes(tipo)) throw new Error('Tipo de categoria inválido.')
  const dados = { nome, emoji: emoji || '📦', tipo }
  if (id == null) return db.categorias.add(dados)
  await db.categorias.update(id, dados)
  return id
}

export async function excluirCategoria(id) {
  return db.transaction('rw', db.categorias, db.lancamentos, async () => {
    if ((await db.lancamentos.where('categoriaId').equals(id).count()) > 0) throw new Error('Esta categoria já foi usada em lançamentos. Renomeie em vez de excluir.')
    await db.categorias.delete(id)
  })
}
