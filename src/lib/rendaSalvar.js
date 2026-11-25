// Gravar a renda (cada parte é uma conta fixa de receita com o campo `renda`; ver renda.js)
import { db } from './db.js'
import { salvarRecorrente, excluirRecorrente } from './recorrentes.js'
import { rendaDaSugestao } from './renda.js'
import { mesAtual } from './datas.js'

// Confirma as partes sugeridas (as que você deixou marcadas)
export async function confirmarRendas(sugestoes) {
  const ids = []
  for (const p of sugestoes) ids.push(await salvarRecorrente(rendaDaSugestao(p)))
  return ids
}

// Cria ou edita uma parte da renda (ou outra renda, como aluguel): sempre receita, sempre numa conta
export async function salvarRenda(dados) {
  const atual = dados.id != null ? await db.recorrentes.get(dados.id) : null
  if (dados.id != null && !atual?.renda) throw new Error('Renda não encontrada.')
  return salvarRecorrente({
    id: dados.id,
    descricao: dados.descricao,
    tipo: 'receita',
    valor: dados.valor,
    dia: dados.dia,
    categoriaId: dados.categoriaId,
    contaId: dados.contaId,
    cartaoId: null,
    inicio: atual?.inicio || dados.inicio || mesAtual(),
    fim: dados.fim ?? atual?.fim ?? null,
    pulados: atual?.pulados,
    renda: atual?.renda || { aprendida: false, ignorados: [] },
  })
}

export const excluirRenda = (id) => excluirRecorrente(id)

// O valor mudou (aumento ou redução): atualizar, ou manter o atual e não perguntar de novo por esse valor
export async function atualizarValorRenda(id, valor) {
  const r = await db.recorrentes.get(id)
  if (!r?.renda) throw new Error('Renda não encontrada.')
  return salvarRecorrente({ ...r, valor, renda: { ...r.renda, recusado: undefined } })
}
export async function manterValorRenda(id, valorNovo) {
  const r = await db.recorrentes.get(id)
  if (!r?.renda) throw new Error('Renda não encontrada.')
  return salvarRecorrente({ ...r, renda: { ...r.renda, recusado: valorNovo } })
}

// "Não é renda extra": o crédito passa a ser uma entrada comum (vale para todas as partes da categoria)
export async function naoEhRenda(lancamentoId, categoriaId) {
  return db.transaction('rw', db.recorrentes, async () => {
    const partes = (await db.recorrentes.toArray()).filter((r) => r.renda && r.categoriaId === categoriaId)
    for (const r of partes) {
      const ignorados = [...new Set([...(r.renda.ignorados || []), lancamentoId])]
      await db.recorrentes.update(r.id, { renda: { ...r.renda, ignorados } })
    }
    return partes.length
  })
}
