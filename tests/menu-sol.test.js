// Navegação: sem barra de baixo; o sol flutuante (embaixo, à direita) abre o menu com todas as telas
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TELAS, AJUSTES, telaExiste } from '../src/lib/telas.js'
import { DESENHOS_CATEGORIA } from '../src/components/Icones.jsx'
import { ABAS_GESTO } from '../src/lib/gesto.js'

const ler = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const css = ler('estilos.css')

describe('telas do menu do sol', () => {
  it('cada tela tem id único, nome e um desenho que existe', () => {
    const ids = [...TELAS, AJUSTES].map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of [...TELAS, AJUSTES]) {
      expect(t.rotulo, t.id).toBeTruthy()
      expect(DESENHOS_CATEGORIA[t.desenho], t.id).toBeTruthy()
      expect(typeof t.tom, t.id).toBe('number')
    }
  })
  it('as telas do gesto de arrastar estão todas no menu', () => {
    for (const id of ABAS_GESTO) expect(telaExiste(id), id).toBe(true)
    expect(telaExiste('ajustes')).toBe(true)
    expect(telaExiste('xyz')).toBe(false)
  })
  it('a grade de 3 colunas fica sem buraco no fim (ou com no máximo um)', () => {
    expect(TELAS.length % 3 === 0 || TELAS.length % 3 === 2 || TELAS.length <= 4).toBe(true)
  })
  it('toda tela que o App desenha está no menu (nenhuma fica sem caminho)', () => {
    const ids = [...ler('App.jsx').matchAll(/aba === '(\w+)' &&/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(4)
    for (const id of ids) expect(telaExiste(id), id).toBe(true)
  })
  it('toda tela do menu é desenhada no App', () => {
    const app = ler('App.jsx')
    for (const t of [...TELAS, AJUSTES]) expect(app, t.id).toMatch(new RegExp(`aba === '${t.id}' &&`))
  })
})

describe('sem barra de baixo', () => {
  it('App usa o menu do sol e não tem mais a barra', () => {
    const app = ler('App.jsx')
    expect(app).toMatch(/<MenuSol aba=\{aba\} irPara=\{irPara\} novoLancamento=\{novoLancamento\} \/>/)
    expect(app).not.toMatch(/barra-nav|nav-item/)
    expect(css).not.toMatch(/\.barra-nav|\.nav-item|\.nav-indicador/)
  })
  it('cabeçalho das telas sem a engrenagem (Ajustes fica no menu)', () => {
    expect(ler('components/Pecas.jsx')).not.toMatch(/IconeEngrenagem/)
  })
  it('o sol fica embaixo, à direita, por cima de tudo', () => {
    const regra = css.match(/\.botao-sol \{([^}]*)\}/)?.[1] ?? ''
    expect(regra).toMatch(/position: fixed/)
    expect(regra).toMatch(/right: max\(16px, env\(safe-area-inset-right, 0px\)\)/)
    expect(regra).toMatch(/bottom: calc\(18px \+ env\(safe-area-inset-bottom\)\)/)
  })
  it('o menu nasce do sol (círculo a partir do centro dele) e o sol vira o fechar', () => {
    expect(css).toMatch(/\.menu-sol \{[^}]*clip-path: circle\(0 at var\(--sol-x/)
    expect(css).toMatch(/\.menu-sol\.aberto \{[^}]*clip-path: circle\(150% at var\(--sol-x/)
    expect(css).toMatch(/\.botao-sol\.aberto \.botao-sol-mais \{ rotate: 45deg; \}/)
  })
  it('segurar o sol abre direto o novo lançamento; tocar abre o menu', () => {
    const m = ler('components/MenuSol.jsx')
    expect(m).toMatch(/setTimeout\(\(\) => \{ segurou\.current = true; abrir\(false\); novoLancamento\(\) \}, SEGURAR_MS\)/)
    expect(m).toMatch(/onClick=\{\(\) => \{ if \(!segurou\.current\) abrir\(!aberto\) \}\}/)
  })
})

describe('o sol não atrapalha as janelas', () => {
  it('some quando uma folha (ex.: Novo lançamento) está aberta, para não cobrir o Salvar', () => {
    expect(css).toMatch(/body:has\(\.folha-fundo\) \.botao-sol \{ opacity: 0; scale: 0\.6; pointer-events: none; \}/)
  })
})
