// Contas, cartões e categorias repetidos que aparecem ao entrar na conta:
// quem tocou em "Começar" no aparelho e depois entrou numa conta que já tinha dados
// fica com dois "Santander", duas "Mercado"... Aqui só os repetidos que NUNCA foram usados são apagados
// (nenhum lançamento, conta fixa, orçamento, regra ou cartão aponta para eles). Nada com dados é mexido.
import { db } from './db.js'
import { compararIds } from './ids.js'

const chaveNome = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function usados({ lancamentos = [], recorrentes = [], orcamentos = [], regras = [], cartoes = [] }) {
  const contas = new Set(), cartoesUsados = new Set(), categorias = new Set()
  for (const l of lancamentos) {
    if (l.contaId != null) contas.add(l.contaId)
    if (l.contaDestinoId != null) contas.add(l.contaDestinoId)
    if (l.cartaoId != null) cartoesUsados.add(l.cartaoId)
    if (l.categoriaId != null) categorias.add(l.categoriaId)
  }
  for (const r of recorrentes) {
    if (r.contaId != null) contas.add(r.contaId)
    if (r.cartaoId != null) cartoesUsados.add(r.cartaoId)
    if (r.categoriaId != null) categorias.add(r.categoriaId)
  }
  for (const o of orcamentos) if (o.categoriaId != null) categorias.add(o.categoriaId)
  for (const r of regras) if (r.categoriaId != null) categorias.add(r.categoriaId)
  for (const c of cartoes) if (c.contaPagamentoId != null) contas.add(c.contaPagamentoId)
  return { contas, cartoes: cartoesUsados, categorias }
}

// Em cada grupo de mesmo nome: fica o usado (ou, se nenhum for usado, o com saldo, e depois o de menor id);
// sai cada repetido que não é usado. A escolha é sempre a mesma em qualquer aparelho.
function sobras(lista, chave, usadosSet, preferir = () => 0) {
  const grupos = new Map()
  for (const x of lista) {
    const k = chave(x)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(x)
  }
  const apagar = []
  for (const g of grupos.values()) {
    if (g.length < 2) continue
    g.sort((a, b) => (usadosSet.has(b.id) - usadosSet.has(a.id)) || preferir(a, b) || compararIds(a.id, b.id))
    for (const x of g.slice(1)) if (!usadosSet.has(x.id)) apagar.push(x.id)
  }
  return apagar
}

export function acharRepetidos(dados) {
  const u = usados(dados)
  return {
    contas: sobras(dados.contas || [], (c) => chaveNome(c.nome), u.contas, (a, b) => (b.saldoInicial ? 1 : 0) - (a.saldoInicial ? 1 : 0)),
    cartoes: sobras(dados.cartoes || [], (c) => chaveNome(c.nome), u.cartoes),
    categorias: sobras(dados.categorias || [], (c) => `${c.tipo}:${chaveNome(c.nome)}`, u.categorias),
  }
}

// Apaga os repetidos sem uso. `dados` = as listas do espaço aberto (já filtradas). Retorna quantos saíram.
export async function juntarRepetidos(dados) {
  const r = acharRepetidos(dados)
  const total = r.contas.length + r.cartoes.length + r.categorias.length
  if (!total) return 0
  await db.transaction('rw', db.contas, db.cartoes, db.categorias, async () => {
    await db.contas.bulkDelete(r.contas)
    await db.cartoes.bulkDelete(r.cartoes)
    await db.categorias.bulkDelete(r.categorias)
  })
  return total
}
