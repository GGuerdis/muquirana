// Todo valor é guardado em CENTAVOS (número inteiro) para evitar erros de arredondamento.
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatar = (centavos) => fmt.format((centavos || 0) / 100)

// Maior valor aceito: R$ 999.999.999,99
export const VALOR_MAXIMO = 99_999_999_999

export const valorValido = (v) => Number.isSafeInteger(v) && v > 0 && v <= VALOR_MAXIMO

// Divide um total em N parcelas inteiras; a diferença de centavos fica na 1ª parcela.
// A soma das parcelas é sempre exatamente igual ao total.
export function dividirParcelas(total, n) {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(n) || n < 1) throw new Error('Parcelamento inválido')
  const base = Math.floor(total / n)
  const resto = total - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base))
}
