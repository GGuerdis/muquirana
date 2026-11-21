// Utilitários dos testes
import { db } from '../src/lib/db.js'

// Apaga e recria o banco (com contas e categorias padrão)
export async function bancoNovo() {
  db.close()
  await db.delete()
  await db.open()
  const contas = await db.contas.toArray()
  const categorias = await db.categorias.toArray()
  const conta = (nome) => contas.find((c) => c.nome === nome).id
  const cat = (tipo, nome) => categorias.find((c) => c.tipo === tipo && c.nome === nome).id
  return { contas, categorias, conta, cat }
}

// Gerador de números aleatórios com semente (os testes dão sempre o mesmo resultado)
export function aleatorio(semente = 42) {
  let s = semente >>> 0
  const prox = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const inteiro = (min, max) => min + Math.floor(prox() * (max - min + 1))
  const escolher = (lista) => lista[inteiro(0, lista.length - 1)]
  return { prox, inteiro, escolher }
}

export const pad = (n) => String(n).padStart(2, '0')
