// Trocar de tela arrastando o dedo para o lado (na ordem da barra de baixo).
// Arrastar para a ESQUERDA vai para a próxima aba; para a DIREITA, volta.
// Ajustes fica fora do gesto: só abre pela engrenagem (e lá o gesto não troca de tela).

export const ABAS_GESTO = ['inicio', 'lancamentos', 'historico', 'cartoes']
// Ordem das telas só para o lado da animação ao trocar (Ajustes entra pela direita)
const ORDEM_TELAS = [...ABAS_GESTO, 'ajustes']

export const BORDA = 24 // perto da beirada é o gesto de "voltar" do celular: não mexe
export const MINIMO = 60 // distância mínima (px) para um arrasto lento contar
export const RAPIDO = 0.45 // px por ms: um "peteleco" rápido conta mesmo curto
export const TRAVA = 1.5 // o movimento tem de ser bem mais lateral do que vertical

// Elementos que já rolam ou arrastam para o lado (ou janelas abertas): ali o gesto não troca de tela
export const ARRASTO_IGNORADO = '.chips.rolavel, .contas-mini, .tabela-rolavel, .grafico, input, textarea, select, .folha-fundo, .folha, [data-sem-arrasto]'

export function ignorarAlvo(el) {
  return !!el?.closest?.(ARRASTO_IGNORADO)
}

// O arrasto já é claramente lateral? (para começar a mover a tela junto com o dedo)
export function ehLateral(dx, dy) {
  return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * TRAVA
}

// 1 = próxima aba, -1 = aba anterior, 0 = não troca
export function direcaoDoArrasto({ dx, dy, ms, inicioX, largura }) {
  if (inicioX < BORDA || inicioX > largura - BORDA) return 0
  if (!ehLateral(dx, dy)) return 0
  const longe = Math.abs(dx) >= Math.max(MINIMO, largura * 0.22)
  const rapido = Math.abs(dx) >= 40 && Math.abs(dx) / Math.max(ms, 1) >= RAPIDO
  if (!longe && !rapido) return 0
  return dx < 0 ? 1 : -1
}

// A aba vizinha na direção pedida, ou null (já está na ponta, ou a tela não faz parte da barra)
export function abaVizinha(atual, direcao) {
  const i = ABAS_GESTO.indexOf(atual)
  if (i < 0 || !direcao) return null
  return ABAS_GESTO[i + direcao] ?? null
}

// De que lado a tela nova entra (para a animação): 1 = vem da direita, -1 = vem da esquerda, 0 = sem animação
export function ladoDaEntrada(de, para) {
  const a = ORDEM_TELAS.indexOf(de)
  const b = ORDEM_TELAS.indexOf(para)
  if (a < 0 || b < 0 || a === b) return 0
  return b > a ? 1 : -1
}

// Onde fica o marcador da barra de baixo entre a tela atual (de) e a vizinha (para), com p de 0 a 1.
// de/para: centro do item na barra, ou null quando a tela não está na barra (ex.: Ajustes) — aí ele some/aparece.
export function posicaoIndicador(de, para, p) {
  const f = Math.min(1, Math.max(0, Number(p) || 0))
  if (de && para) return { x: de.x + (para.x - de.x) * f, y: de.y + (para.y - de.y) * f, opacidade: 1 }
  if (de) return { x: de.x, y: de.y, opacidade: 1 - f }
  if (para) return { x: para.x, y: para.y, opacidade: f }
  return { x: null, y: null, opacidade: 0 }
}
