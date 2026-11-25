// Histórico das importações de extrato e "desfazer importação".
// Cada importação nova marca tudo que criou ou mudou com o mesmo `lote` (ver executarImportacao):
//  - lançamentos criados: campo `lote`;
//  - lançamentos de outra conta que viraram transferência: `antesDaImportacao` (como eram antes);
//  - contas e cartões criados: `loteImportacao`;
//  - saldo inicial trocado: `saldoInicialAntes` na conta.
// Importações feitas antes disso aparecem no histórico, mas não dá para desfazer (não guardavam o lote).
import { db } from './db.js'

const quandoDoLote = (lote) => Number(/^imp-(\d+)-/.exec(lote || '')?.[1]) || null
const origemDoId = (idExterno) => /^(conta|cartao):([^:]+):/.exec(idExterno || '')

export function listarImportacoes(lancamentos, { contas = [], cartoes = [] } = {}) {
  const nomeDe = (tipo, id) => (tipo === 'conta' ? contas : cartoes).find((x) => String(x.id) === id)?.nome ?? (tipo === 'conta' ? 'Conta' : 'Cartão')
  const lotes = new Map()
  const antigas = new Map() // sem lote: agrupa por conta/cartão de destino
  const convertidos = new Map() // lote → quantos lançamentos de outra conta ele mudou
  for (const l of lancamentos) {
    if (l.antesDaImportacao?.lote) convertidos.set(l.antesDaImportacao.lote, (convertidos.get(l.antesDaImportacao.lote) || 0) + 1)
    const o = origemDoId(l.idExterno)
    if (!o && !l.lote) continue
    const chave = l.lote || `${o[1]}:${o[2]}`
    const mapa = l.lote ? lotes : antigas
    if (!mapa.has(chave)) mapa.set(chave, { itens: [], origem: o })
    const g = mapa.get(chave)
    g.itens.push(l)
    if (!g.origem && o) g.origem = o
  }
  const resumo = (chave, g, podeDesfazer) => {
    const datas = g.itens.map((l) => l.data).sort()
    return {
      lote: podeDesfazer ? chave : null,
      quando: podeDesfazer ? quandoDoLote(chave) : Math.max(...g.itens.map((l) => l.criadoEm || 0)) || null,
      destino: g.origem ? nomeDe(g.origem[1], g.origem[2]) : 'Importação',
      quantidade: g.itens.length,
      convertidos: podeDesfazer ? convertidos.get(chave) || 0 : 0,
      de: datas[0],
      ate: datas[datas.length - 1],
      podeDesfazer,
    }
  }
  const novas = [...lotes].map(([k, g]) => resumo(k, g, true)).sort((a, b) => (b.quando || 0) - (a.quando || 0))
  const velhas = [...antigas].map(([k, g]) => resumo(k, g, false)).sort((a, b) => (b.quando || 0) - (a.quando || 0))
  return [...novas, ...velhas]
}

/** Desfaz uma importação: apaga o que ela criou e devolve o que ela mudou. Retorna quantos lançamentos saíram. */
export async function desfazerImportacao(lote) {
  if (!quandoDoLote(lote)) throw new Error('Importação não encontrada.')
  return db.transaction('rw', db.lancamentos, db.contas, db.cartoes, async () => {
    const todos = await db.lancamentos.toArray()
    const criados = todos.filter((l) => l.lote === lote)
    const mudados = todos.filter((l) => l.antesDaImportacao?.lote === lote)
    if (!criados.length && !mudados.length) throw new Error('Essa importação já foi desfeita.')
    // uma importação depois desta mexeu em lançamentos dela: desfazer nesta ordem bagunçaria os dados
    const ids = new Set(criados.map((l) => l.id))
    const depois = criados.find((l) => l.antesDaImportacao && l.antesDaImportacao.lote !== lote)
    if (depois) throw new Error('Uma importação feita depois desta mudou alguns destes lançamentos. Desfaça a mais nova primeiro.')

    await db.lancamentos.bulkDelete([...ids])
    for (const l of mudados) {
      const { lote: _lote, ...antes } = l.antesDaImportacao
      await db.lancamentos.update(l.id, { ...antes, antesDaImportacao: undefined })
    }
    // contas e cartões que ela criou: saem se não sobrou nada ligado a eles
    const restantes = todos.filter((l) => !ids.has(l.id))
    for (const c of await db.contas.toArray()) {
      if (c.saldoInicialAntes?.lote === lote) await db.contas.update(c.id, { saldoInicial: c.saldoInicialAntes.valor, saldoInicialAntes: undefined })
      if (c.loteImportacao === lote && !restantes.some((l) => l.contaId === c.id || l.contaDestinoId === c.id)) await db.contas.delete(c.id)
    }
    for (const k of await db.cartoes.toArray()) {
      if (k.loteImportacao === lote && !restantes.some((l) => l.cartaoId === k.id)) await db.cartoes.delete(k.id)
    }
    return criados.length
  })
}
