// Etiquetas: marcas livres que juntam lançamentos de categorias diferentes (ex.: #obra-apto, #viagem-2026).
// Guardadas no lançamento como lista de textos curtos, sem "#", em minúsculas, com hífen no lugar de espaço.
export const MAX_ETIQUETAS = 5
const TAMANHO = 24

export function limparEtiqueta(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, TAMANHO)
}

// Aceita lista ou texto ("obra apto, #viagem") e devolve a lista limpa, sem repetidas
export function normalizarEtiquetas(entrada) {
  const partes = Array.isArray(entrada) ? entrada : String(entrada || '').split(/[,;#\n]+/)
  const vistas = new Set()
  for (const p of partes) {
    const e = limparEtiqueta(p)
    if (e && !vistas.has(e)) vistas.add(e)
    if (vistas.size >= MAX_ETIQUETAS) break
  }
  return [...vistas]
}

// Etiquetas já usadas, das mais usadas para as menos usadas (para sugerir no formulário)
export function etiquetasUsadas(lancamentos) {
  const n = new Map()
  for (const l of lancamentos) for (const e of l.etiquetas || []) n.set(e, (n.get(e) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([e]) => e)
}

// Total por etiqueta: quanto saiu e entrou, em quantos lançamentos, de quando a quando
export function resumoPorEtiqueta(lancamentos) {
  const g = new Map()
  for (const l of lancamentos) {
    for (const e of l.etiquetas || []) {
      if (!g.has(e)) g.set(e, { etiqueta: e, saiu: 0, entrou: 0, quantidade: 0, de: l.data, ate: l.data, ids: [] })
      const r = g.get(e)
      if (l.tipo === 'despesa') r.saiu += l.valor
      else if (l.tipo === 'receita') r.entrou += l.valor
      r.quantidade += 1
      if (l.data < r.de) r.de = l.data
      if (l.data > r.ate) r.ate = l.data
      r.ids.push(l.id)
    }
  }
  return [...g.values()].sort((a, b) => b.saiu - a.saiu || a.etiqueta.localeCompare(b.etiqueta))
}
