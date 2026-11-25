// Telas do app, na ordem em que aparecem no menu do sol (grade de 3 colunas).
// `desenho` é o ícone (losango HUD) e `tom` a cor dele. Ajustes fica numa linha à parte, no fim do menu.
export const TELAS = [
  { id: 'inicio', rotulo: 'Início', desenho: 'moradia', tom: 318 },
  { id: 'lancamentos', rotulo: 'Lançamentos', desenho: 'lista', tom: 200 },
  { id: 'cartoes', rotulo: 'Cartões', desenho: 'fatura', tom: 30 },
  { id: 'historico', rotulo: 'Histórico', desenho: 'historico', tom: 276 },
]

export const AJUSTES = { id: 'ajustes', rotulo: 'Ajustes', desenho: 'ajustes', tom: 250 }

export const telaExiste = (id) => id === AJUSTES.id || TELAS.some((t) => t.id === id)
