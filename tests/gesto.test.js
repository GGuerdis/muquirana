import { describe, it, expect } from 'vitest'
import { direcaoDoArrasto, abaVizinha, ladoDaEntrada, ehLateral, ignorarAlvo, ABAS_GESTO } from '../src/lib/gesto.js'

const L = 390
const arrasto = (dx, dy = 0, ms = 300, inicioX = 200) => direcaoDoArrasto({ dx, dy, ms, inicioX, largura: L })

describe('trocar de tela arrastando para o lado', () => {
  it('arrastar para a esquerda vai para a próxima; para a direita, volta', () => {
    expect(arrasto(-120)).toBe(1)
    expect(arrasto(120)).toBe(-1)
  })
  it('arrasto curto e lento não troca; peteleco rápido troca', () => {
    expect(arrasto(-50, 0, 400)).toBe(0)
    expect(arrasto(-50, 0, 80)).toBe(1)
    expect(arrasto(-30, 0, 20)).toBe(0) // curto demais mesmo rápido
  })
  it('movimento mais vertical que lateral (rolar a tela) não troca', () => {
    expect(arrasto(-120, 100)).toBe(0)
    expect(arrasto(-150, 60)).toBe(1)
    expect(ehLateral(8, 0)).toBe(false)
    expect(ehLateral(30, 10)).toBe(true)
  })
  it('começando na beirada (gesto de voltar do celular) não troca', () => {
    expect(arrasto(150, 0, 300, 10)).toBe(0)
    expect(arrasto(-150, 0, 300, L - 10)).toBe(0)
    expect(arrasto(150, 0, 300, 30)).toBe(-1)
  })
  it('segue a ordem da barra e para nas pontas', () => {
    expect(ABAS_GESTO).toEqual(['inicio', 'lancamentos', 'historico', 'cartoes', 'ajustes'])
    expect(abaVizinha('inicio', 1)).toBe('lancamentos')
    expect(abaVizinha('historico', -1)).toBe('lancamentos')
    expect(abaVizinha('inicio', -1)).toBeNull()
    expect(abaVizinha('cartoes', 1)).toBe('ajustes')
    expect(abaVizinha('ajustes', 1)).toBeNull()
    expect(abaVizinha('ajustes', -1)).toBe('cartoes')
    expect(abaVizinha('outra', 1)).toBeNull()
    expect(abaVizinha('inicio', 0)).toBeNull()
  })
  it('a tela nova entra pelo lado certo', () => {
    expect(ladoDaEntrada('inicio', 'cartoes')).toBe(1)
    expect(ladoDaEntrada('historico', 'inicio')).toBe(-1)
    expect(ladoDaEntrada('inicio', 'ajustes')).toBe(1)
    expect(ladoDaEntrada('ajustes', 'inicio')).toBe(-1)
    expect(ladoDaEntrada('inicio', 'outra')).toBe(0)
    expect(ladoDaEntrada('inicio', 'inicio')).toBe(0)
  })
  it('ignora arrasto em cima de filtros, gráfico, campos e janelas', () => {
    const el = (alvo) => ({ closest: (sel) => (sel.split(',').map((s) => s.trim()).includes(alvo) ? {} : null) })
    expect(ignorarAlvo(el('.chips.rolavel'))).toBe(true)
    expect(ignorarAlvo(el('.grafico'))).toBe(true)
    expect(ignorarAlvo(el('input'))).toBe(true)
    expect(ignorarAlvo(el('.folha-fundo'))).toBe(true)
    expect(ignorarAlvo(el('.painel'))).toBe(false)
    expect(ignorarAlvo(null)).toBe(false)
  })
})
