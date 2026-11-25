// Telas do app, na ordem em que aparecem no menu do sol (grade de 3 colunas).
// `desenho` é o ícone (losango HUD) e `tom` a cor dele. Ajustes fica numa linha à parte, no fim do menu.
export const TELAS = [
  { id: 'inicio', rotulo: 'Início', desenho: 'moradia', tom: 318 },
  { id: 'lancamentos', rotulo: 'Lançamentos', desenho: 'lista', tom: 200 },
  { id: 'cartoes', rotulo: 'Cartões', desenho: 'fatura', tom: 30 },
  { id: 'historico', rotulo: 'Histórico', desenho: 'historico', tom: 276 },
  { id: 'previsao', rotulo: 'Previsão', desenho: 'previsao', tom: 185, novo: true },
  { id: 'metas', rotulo: 'Metas', desenho: 'meta', tom: 160, novo: true },
  { id: 'assinaturas', rotulo: 'Assinaturas', desenho: 'assinaturas', tom: 255, novo: true },
  { id: 'patrimonio', rotulo: 'Patrimônio', desenho: 'banco', tom: 45, novo: true },
  { id: 'relatorios', rotulo: 'Relatórios', desenho: 'impostos', tom: 343, novo: true },
]

export const AJUSTES = { id: 'ajustes', rotulo: 'Ajustes', desenho: 'ajustes', tom: 250 }

export const telaExiste = (id) => id === AJUSTES.id || TELAS.some((t) => t.id === id)
