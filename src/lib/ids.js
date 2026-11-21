// Compara identificadores (números das versões antigas ou textos da versão com nuvem)
export const compararIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
