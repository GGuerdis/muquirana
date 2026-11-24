// Blocos da tela Início e o modo "Só o essencial", em que você escolhe quais aparecem.
// O saldo total aparece sempre; os outros blocos podem ser ligados ou desligados.

export const BLOCOS_INICIO = [
  { id: 'previsao', nome: 'Previsão do fim do mês' },
  { id: 'contas', nome: 'Saldo de cada conta' },
  { id: 'resumo', nome: 'Entrou × saiu do mês', dica: 'Com o seletor de mês' },
  { id: 'orcamento', nome: 'Orçamento' },
  { id: 'categorias', nome: 'Para onde foi o dinheiro' },
  { id: 'contasFixas', nome: 'Contas fixas do mês' },
  { id: 'faturas', nome: 'Faturas dos cartões' },
  { id: 'recentes', nome: 'Últimos lançamentos' },
  { id: 'backup', nome: 'Lembrete de backup' },
]

const IDS = new Set(BLOCOS_INICIO.map((b) => b.id))

// O que o modo essencial mostra se você ainda não escolheu nada
export const PADRAO_ESSENCIAL = ['categorias']

// A escolha guardada, limpa: só blocos que existem, sem repetir, na ordem da tela.
// Se nunca foi escolhido (ou veio algo estranho), usa o padrão.
export function blocosEscolhidos(guardado) {
  if (!Array.isArray(guardado)) return [...PADRAO_ESSENCIAL]
  const marcados = new Set(guardado.filter((id) => IDS.has(id)))
  return BLOCOS_INICIO.map((b) => b.id).filter((id) => marcados.has(id))
}

// Quais blocos aparecem agora: todos no modo normal; no essencial, só os escolhidos
export function blocosVisiveis(essencial, guardado) {
  return new Set(essencial ? blocosEscolhidos(guardado) : BLOCOS_INICIO.map((b) => b.id))
}

// Liga ou desliga um bloco na escolha (devolve uma lista nova, já limpa)
export function alternarBloco(guardado, id, ligado) {
  const atual = new Set(blocosEscolhidos(guardado))
  if (!IDS.has(id)) return [...atual]
  if (ligado) atual.add(id)
  else atual.delete(id)
  return blocosEscolhidos([...atual])
}
