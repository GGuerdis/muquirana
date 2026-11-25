// Trocar de tela arrastando o dedo para o lado (Início → Lançamentos → Histórico → Cartões).
// Arrastar para a ESQUERDA vai para a próxima aba; para a DIREITA, volta.
// As outras telas (Ajustes e as do menu do sol) ficam fora do gesto: abrem só pelo menu.

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

// A aba vizinha na direção pedida, ou null (já está na ponta, ou a tela não faz parte do gesto)
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

