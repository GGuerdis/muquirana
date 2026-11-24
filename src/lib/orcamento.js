// Orçamento: limite mensal de gasto por categoria (vale para todos os meses).
import { db } from './db.js'
import { valorValido, formatar } from './dinheiro.js'
import { resumoMes } from './calculos.js'
import { compararIds } from './ids.js'

// Define o limite; limite 0/null remove o orçamento da categoria
export async function definirOrcamento(categoriaId, limite) {
  return db.transaction('rw', db.orcamentos, db.categorias, async () => {
    const cat = await db.categorias.get(categoriaId ?? -1)
    if (!cat) throw new Error('Categoria não encontrada.')
    if (cat.tipo !== 'despesa') throw new Error('Orçamento só vale para categorias de despesa.')
    const atuais = await db.orcamentos.where('categoriaId').equals(categoriaId).toArray()
    if (!limite) return db.orcamentos.bulkDelete(atuais.map((o) => o.id))
    if (!valorValido(limite)) throw new Error('Limite inválido.')
    if (atuais.length) {
      await db.orcamentos.update(atuais[0].id, { limite })
      if (atuais.length > 1) await db.orcamentos.bulkDelete(atuais.slice(1).map((o) => o.id)) // duplicado vindo de outro aparelho
    } else {
      await db.orcamentos.add({ categoriaId, limite })
    }
  })
}

// ok: abaixo de 80% · alerta: de 80% até o limite · estourado: passou do limite
// (conta com inteiros, sem arredondamento: 80% exato já é alerta)
export function situacao(gasto, limite) {
  if (gasto > limite) return 'estourado'
  if (gasto * 100 >= limite * 80) return 'alerta'
  return 'ok'
}

export function orcamentoDoMes(mes, orcamentos, lancamentos) {
  const gastos = new Map(resumoMes(mes, lancamentos).categorias.map((c) => [c.categoriaId, c.valor]))
  // um orçamento por categoria (se dois aparelhos criaram ao mesmo tempo, vale o primeiro)
  const unicos = [...new Map([...orcamentos].reverse().map((o) => [o.categoriaId, o])).values()]
  const itens = unicos.map((o) => {
    const gasto = gastos.get(o.categoriaId) || 0
    return {
      categoriaId: o.categoriaId,
      limite: o.limite,
      gasto,
      restante: o.limite - gasto, // negativo = quanto passou
      porcentagem: Math.floor((gasto * 100) / o.limite),
      situacao: situacao(gasto, o.limite),
    }
  }).sort((a, b) => b.gasto * a.limite - a.gasto * b.limite || compararIds(a.categoriaId, b.categoriaId)) // maior % primeiro, sem arredondar
  const limiteTotal = itens.reduce((s, i) => s + i.limite, 0)
  const gastoTotal = itens.reduce((s, i) => s + i.gasto, 0)
  return { itens, limiteTotal, gastoTotal }
}

const GRAVIDADE = { ok: 0, alerta: 1, estourado: 2 }

/**
 * Depois de salvar um lançamento: alguma categoria mudou de faixa para pior?
 * Compara o antes e o depois nos meses informados. Retorna o aviso mais grave ou null.
 */
export function avisoDeOrcamento({ meses, orcamentos, antes, depois }) {
  let pior = null
  for (const mes of new Set(meses)) {
    const a = new Map(orcamentoDoMes(mes, orcamentos, antes).itens.map((i) => [i.categoriaId, i]))
    for (const d of orcamentoDoMes(mes, orcamentos, depois).itens) {
      const s0 = a.get(d.categoriaId)?.situacao || 'ok'
      if (GRAVIDADE[d.situacao] > GRAVIDADE[s0] && (!pior || GRAVIDADE[d.situacao] > GRAVIDADE[pior.situacao])) pior = { ...d, mes }
    }
  }
  return pior
}

export function textoAviso(aviso, nomeCategoria, zoeira) {
  if (!aviso) return null
  if (aviso.situacao === 'estourado') {
    const passou = formatar(aviso.gasto - aviso.limite)
    return zoeira
      ? `😭 Estourou o orçamento de ${nomeCategoria} em ${passou}. O mukirana interior está de luto.`
      : `Orçamento de ${nomeCategoria} ultrapassado em ${passou}.`
  }
  return zoeira
    ? `😰 Calma: já foi ${aviso.porcentagem}% do orçamento de ${nomeCategoria}. Restam ${formatar(aviso.restante)}.`
    : `Você já usou ${aviso.porcentagem}% do orçamento de ${nomeCategoria}. Restam ${formatar(aviso.restante)}.`
}
