// Alertas de orçamento no topo do Início: categorias do mês com 80% ou mais do limite
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { alertasDoOrcamento, textoAlerta } from '../src/lib/orcamento.js'
import { formatar } from '../src/lib/dinheiro.js'

const orc = [{ id: 'o1', categoriaId: 'mercado', limite: 100000 }, { id: 'o2', categoriaId: 'lazer', limite: 20000 }, { id: 'o3', categoriaId: 'roupa', limite: 50000 }]
const gasto = (categoriaId, valor, data = '2026-11-10') => ({ id: `${categoriaId}-${valor}-${data}`, tipo: 'despesa', categoriaId, valor, data })

describe('quais categorias entram no alerta', () => {
  it('80% ou mais entra; abaixo disso não; estouradas vêm primeiro', () => {
    const l = [gasto('mercado', 80000), gasto('lazer', 25000), gasto('roupa', 39999)]
    const a = alertasDoOrcamento('2026-11', orc, l)
    expect(a.map((i) => [i.categoriaId, i.situacao])).toEqual([['lazer', 'estourado'], ['mercado', 'alerta']])
  })
  it('só conta o mês pedido e só despesas', () => {
    const l = [gasto('mercado', 90000, '2026-10-30'), { ...gasto('mercado', 90000), tipo: 'receita' }]
    expect(alertasDoOrcamento('2026-11', orc, l)).toEqual([])
  })
  it('sem orçamento, sem alerta', () => {
    expect(alertasDoOrcamento('2026-11', [], [gasto('mercado', 999999)])).toEqual([])
  })
})

describe('texto do alerta', () => {
  it('mostra quanto passou ou quanto resta', () => {
    expect(textoAlerta({ situacao: 'estourado', gasto: 25000, limite: 20000, porcentagem: 125 })).toBe(`passou ${formatar(5000)} do limite`)
    expect(textoAlerta({ situacao: 'alerta', gasto: 80000, limite: 100000, restante: 20000, porcentagem: 80 })).toBe(`80% usado · restam ${formatar(20000)}`)
  })
  it('com os valores escondidos, só a porcentagem', () => {
    expect(textoAlerta({ situacao: 'estourado', gasto: 25000, limite: 20000, porcentagem: 125 }, true)).toBe('passou do limite (125%)')
    expect(textoAlerta({ situacao: 'alerta', restante: 20000, porcentagem: 80 }, true)).toBe('80% usado')
  })
})

describe('na tela', () => {
  const ler = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
  it('o Início mostra o alerta logo depois do saldo, mesmo no "Só o essencial"', () => {
    expect(ler('pages/Inicio.jsx')).toMatch(/<ConvitesRecebidos \/>\n\s*<AlertasOrcamento irPara=\{irPara\} ocultar=\{ocultar\} \/>/)
  })
  it('tocar no alerta abre Lançamentos só daquela categoria', () => {
    expect(ler('components/Orcamento.jsx')).toMatch(/irPara\('lancamentos', \{ filtro: \{ categoriaId: i\.categoriaId \} \}\)/)
    expect(ler('pages/Lancamentos.jsx')).toMatch(/\.filter\(\(l\) => categoriaFiltro == null \|\| l\.categoriaId === categoriaFiltro\)/)
  })
})
