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

// Qual desenho fixo a categoria que vem com o app tem; null = categoria criada por você
export function desenhoDaCategoria(nome) {
  return DESENHOS[normalizar(nome)] ?? null
}

// Palavras no nome de uma categoria sua → desenho parecido (quando você ainda não escolheu um)
const PALAVRAS = [
  [/APART|CONDOMIN|PREDIO|OBRA|IMOVE/, 'predio'], [/CASA|ALUGUEL/, 'moradia'], [/VIAGE|HOTEL|PASSAGE|FERIAS/, 'viagem'],
  [/PET|CACHORR|GATO|VETERIN|RACAO/, 'pet'], [/ACADEMIA|ESPORT|GINAS|CROSSFIT|PILATES/, 'academia'], [/BELEZA|CABELO|SALAO|BARBE|COSMET/, 'beleza'],
  [/CELULAR|TELEFON|INTERNET|PLANO/, 'telefone'], [/ROUPA|VESTU|CALCAD/, 'roupa'], [/COMIDA|RESTAUR|LANCHE|DELIVERY/, 'alimentacao'],
  [/CARRO|MOTO|COMBUST|GASOLINA|UBER/, 'transporte'], [/FARMAC|REMEDIO|MEDIC|DENTIS|PLANO DE SAUDE/, 'saude'], [/CURSO|ESCOLA|FACULD|LIVRO/, 'educacao'],
  [/INVEST|POUPANCA|RENDA/, 'rendimentos'], [/BANCO|TARIFA|JUROS/, 'banco'], [/IMPOSTO|TAXA|IPVA|IPTU/, 'impostos'],
]
// Desenho a mostrar para qualquer categoria: o escolhido por você, o fixo do app, um parecido pelo nome ou o genérico
export function desenhoParaCategoria(categoria) {
  if (!categoria) return null
  if (categoria.desenho) return categoria.desenho
  const fixo = desenhoDaCategoria(categoria.nome)
  if (fixo) return fixo
  const n = normalizar(categoria.nome)
  return PALAVRAS.find(([re]) => re.test(n))?.[1] ?? 'outros'
}

// ---------- Cor das contas (bolinha ao lado do nome) ----------
export const CORES_CONTA = ['#ec1c24', '#ff7a00', '#f5c400', '#1fbf62', '#1c8ef0', '#1c4fa0', '#8a2be2', '#e0359a', '#00b8b0', '#8a8f98']
const COR_DO_EMOJI = { '🔴': '#ec1c24', '🟠': '#ff7a00', '🟡': '#f5c400', '🟢': '#1fbf62', '🔵': '#1c8ef0', '🟣': '#8a2be2', '🟤': '#9a5b2e', '⚪': '#d9d9e3', '⚫': '#8a8f98' }
const COR_DO_BANCO = [
  [/SANTANDER/, '#ec1c24'], [/\bINTER\b/, '#ff7a00'], [/CAIXA|\bCEF\b/, '#1c60ab'], [/NUBANK|^NU\b/, '#8a2be2'], [/ITAU/, '#ec7000'],
  [/BRADESCO/, '#cc092f'], [/BANCO DO BRASIL|^BB\b/, '#f5c400'], [/PICPAY/, '#21c25e'], [/MERCADO PAGO/, '#00b1ea'], [/\bC6\b/, '#8a8f98'],
  [/INVEST|POUPANCA|CORRETORA|\bXP\b|\bRICO\b|\bBTG\b/, '#00b8b0'], [/CARTEIRA|DINHEIRO/, '#1fbf62'],
]
// Cor da conta: a escolhida por você; senão a da bolinha que ela tinha; senão a do banco pelo nome; senão uma estável pelo nome
export function corDaConta(conta) {
  if (!conta) return CORES_CONTA[CORES_CONTA.length - 1]
  if (conta.cor) return conta.cor
  const e = (conta.emoji || '').replace(/\uFE0F/g, '').trim()
  if (COR_DO_EMOJI[e]) return COR_DO_EMOJI[e]
  const n = normalizar(conta.nome)
  const banco = COR_DO_BANCO.find(([re]) => re.test(n))
  if (banco) return banco[1]
  // espalha bem os nomes parecidos entre as cores (o cinza do fim fica de fora)
  let h = 2166136261
  for (const ch of n) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return CORES_CONTA[h % (CORES_CONTA.length - 1)]
}
