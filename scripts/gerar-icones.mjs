// Gera os ícones PNG do app a partir de public/icone.svg
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/icone.svg', import.meta.url))
// Versão "maskable": sem cantos arredondados, para o Android recortar no formato que quiser
const svgMaskable = Buffer.from(svg.toString().replace('rx="112"', 'rx="0"'))

const saida = (nome) => new URL(`../public/${nome}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

await sharp(svg).resize(192, 192).png().toFile(saida('icone-192.png'))
await sharp(svg).resize(512, 512).png().toFile(saida('icone-512.png'))
await sharp(svgMaskable).resize(512, 512).png().toFile(saida('icone-maskable-512.png'))
await sharp(svgMaskable).resize(180, 180).png().toFile(saida('apple-touch-icon.png'))
console.log('Ícones gerados em public/')
