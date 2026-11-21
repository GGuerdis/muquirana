// Extrai as linhas de texto de um PDF (com a posição de cada pedaço), usando o pdf.js.
// O pdf.js só é carregado quando você importa um PDF, para não pesar o app.
import { semControle } from './texto.js'

// Agrupa os pedaços de texto em linhas: mesma página e altura (com 3 pontos de tolerância,
// porque o banco às vezes desalinha valor e descrição em 1 ponto)
export function agruparEmLinhas(pedacos) {
  const linhas = []
  const porPagina = new Map()
  for (const p of pedacos) {
    if (!p.s || !semControle(p.s)) continue
    if (!porPagina.has(p.pagina)) porPagina.set(p.pagina, [])
    porPagina.get(p.pagina).push(p)
  }
  for (const pagina of [...porPagina.keys()].sort((a, b) => a - b)) {
    const itens = porPagina.get(pagina).sort((a, b) => b.y - a.y)
    let atual = null
    for (const it of itens) {
      if (!atual || Math.abs(atual.y - it.y) > 3) {
        atual = { pagina, y: it.y, itens: [] }
        linhas.push(atual)
      }
      atual.itens.push({ x: it.x, s: semControle(it.s) })
    }
  }
  for (const l of linhas) l.itens.sort((a, b) => a.x - b.x)
  return linhas
}

let pdfjsPromessa = null
async function carregarPdfjs() {
  if (!pdfjsPromessa) {
    pdfjsPromessa = (async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })()
  }
  return pdfjsPromessa
}

// No navegador: bytes do PDF → linhas
export async function extrairLinhasPdf(bytes, pdfjsInjetado = null) {
  const pdfjs = pdfjsInjetado || (await carregarPdfjs())
  const tarefa = pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false })
  const doc = await tarefa.promise
  const pedacos = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n)
      const { items } = await pagina.getTextContent()
      for (const it of items) pedacos.push({ pagina: n, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s: it.str })
    }
  } finally {
    await tarefa.destroy()
  }
  return agruparEmLinhas(pedacos)
}
