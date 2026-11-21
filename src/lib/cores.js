// Cor e desenho de cada categoria (ícone em losango, estilo HUD).
// Categorias conhecidas têm cor e desenho fixos; as criadas por você ganham uma cor estável
// a partir do nome (sempre a mesma em qualquer aparelho) e mostram o próprio emoji.
const FIXAS = {
  'ALIMENTACAO': 17, 'MERCADO': 157, 'MORADIA': 206, 'CONTAS DA CASA': 45, 'TRANSPORTE': 233, 'SAUDE': 343,
  'LAZER': 277, 'ASSINATURAS': 255, 'COMPRAS': 318, 'EDUCACAO': 190, 'PRESENTES': 331, 'IMPOSTOS E TAXAS': 29,
  'OUTROS': 276, 'SALARIO': 185, 'FREELA / EXTRA': 170, 'RENDIMENTOS': 142, 'REEMBOLSO': 200, 'PRESENTE': 331,
}

// Nome da categoria (sem acento, maiúsculo) → desenho do ícone
const DESENHOS = {
  'ALIMENTACAO': 'alimentacao', 'MERCADO': 'mercado', 'MORADIA': 'moradia', 'CONTAS DA CASA': 'contas', 'CONTAS': 'contas',
  'TRANSPORTE': 'transporte', 'SAUDE': 'saude', 'LAZER': 'lazer', 'ASSINATURAS': 'assinaturas', 'COMPRAS': 'compras',
  'EDUCACAO': 'educacao', 'PRESENTES': 'presentes', 'PRESENTE': 'presentes', 'IMPOSTOS E TAXAS': 'impostos', 'IMPOSTOS': 'impostos',
  'OUTROS': 'outros', 'SALARIO': 'salario', 'FREELA / EXTRA': 'freela', 'RENDIMENTOS': 'rendimentos', 'REEMBOLSO': 'reembolso',
}

export const normalizar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

export function tomDaCategoria(nome) {
  const n = normalizar(nome)
  if (n in FIXAS) return FIXAS[n]
  let h = 0
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}

// Qual desenho usar para a categoria; null = categoria sua (mostra o emoji dela)
export function desenhoDaCategoria(nome) {
  return DESENHOS[normalizar(nome)] ?? null
}
