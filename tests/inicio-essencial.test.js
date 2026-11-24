import { describe, it, expect } from 'vitest'
import { BLOCOS_INICIO, PADRAO_ESSENCIAL, blocosEscolhidos, blocosVisiveis, alternarBloco } from '../src/lib/inicio.js'

const TODOS = BLOCOS_INICIO.map((b) => b.id)

describe('modo "Só o essencial" com blocos escolhidos', () => {
  it('sem escolha guardada, mostra o padrão (só "Para onde foi o dinheiro")', () => {
    expect(PADRAO_ESSENCIAL).toEqual(['categorias'])
    expect(blocosEscolhidos(undefined)).toEqual(['categorias'])
    expect(blocosEscolhidos(null)).toEqual(['categorias'])
    expect(blocosEscolhidos('contas')).toEqual(['categorias'])
  })
  it('lista vazia é uma escolha válida: só o saldo total', () => {
    expect(blocosEscolhidos([])).toEqual([])
    expect([...blocosVisiveis(true, [])]).toEqual([])
  })
  it('limpa blocos que não existem e repetidos, e segue a ordem da tela', () => {
    expect(blocosEscolhidos(['recentes', 'xyz', 'contas', 'contas'])).toEqual(['contas', 'recentes'])
  })
  it('modo normal mostra todos os blocos, seja qual for a escolha', () => {
    expect([...blocosVisiveis(false, ['contas'])]).toEqual(TODOS)
    expect([...blocosVisiveis(false, undefined)]).toEqual(TODOS)
  })
  it('modo essencial mostra só os escolhidos', () => {
    const v = blocosVisiveis(true, ['contas', 'categorias'])
    expect(v.has('contas')).toBe(true)
    expect(v.has('categorias')).toBe(true)
    expect(v.has('recentes')).toBe(false)
    expect(v.size).toBe(2)
  })
  it('liga e desliga blocos partindo do padrão', () => {
    let e = alternarBloco(undefined, 'contas', true)
    expect(e).toEqual(['contas', 'categorias'])
    e = alternarBloco(e, 'categorias', false)
    expect(e).toEqual(['contas'])
    e = alternarBloco(e, 'contas', false)
    expect(e).toEqual([])
  })
  it('ligar de novo não duplica; bloco inexistente não muda nada', () => {
    expect(alternarBloco(['contas'], 'contas', true)).toEqual(['contas'])
    expect(alternarBloco(['contas'], 'nada', true)).toEqual(['contas'])
  })
  it('todo bloco tem nome para a tela de escolha', () => {
    for (const b of BLOCOS_INICIO) expect(b.nome.length).toBeGreaterThan(3)
    expect(new Set(TODOS).size).toBe(TODOS.length)
  })
})
