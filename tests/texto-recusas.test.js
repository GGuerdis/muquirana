import { describe, it, expect } from 'vitest'
import { semControle, temControle } from '../src/lib/texto.js'
import { extrairRecusas } from '../src/lib/recusas.js'
import { limparDescricao } from '../src/lib/santander.js'
import { agruparEmLinhas } from '../src/lib/pdfTexto.js'
import { registrosParaImportar, salvarLancamento } from '../src/lib/lancamentos.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'

describe('texto sem caracteres de controle (a nuvem recusa o caractere nulo)', () => {
  it('troca controle por espaço e junta espaços', () => {
    expect(semControle('00\u000010')).toBe('00 10')
    expect(semControle('  LOJA\u0007 \tX\n ')).toBe('LOJA X')
    expect(semControle('Açaí ç ã é')).toBe('Açaí ç ã é') // acentos ficam
    expect(semControle(null)).toBe('')
    expect(temControle('a\u0000b')).toBe(true)
    expect(temControle('abc')).toBe(false)
  })
  it('compra no débito com nome ilegível vira "Compra no débito …"', () => {
    expect(limparDescricao('Compra cartao deb mc 06/11 00\u000010')).toBe('Compra no débito 00 10')
    expect(limparDescricao('COMPRA CARTAO DEB MC 18/03 AUTOPASS S.A.')).toBe('AUTOPASS S.A.')
    expect(limparDescricao('PIX ENVIADO 123')).toBe('PIX ENVIADO 123')
  })
  it('linhas do PDF já saem limpas', () => {
    const [l] = agruparEmLinhas([{ pagina: 1, x: 10, y: 100, s: '06/11 00\u000010' }, { pagina: 1, x: 50, y: 100, s: '\u0000' }])
    expect(l.itens.map((i) => i.s)).toEqual(['06/11 00 10'])
  })
  it('nenhum lançamento é gravado com caractere de controle', () => {
    const refs = { contas: [{ id: 'c' }], cartoes: [], categorias: [{ id: 'k', tipo: 'despesa' }] }
    const [r] = registrosParaImportar({ tipo: 'despesa', valor: 100, descricao: 'X\u0000Y', categoriaId: 'k', contaId: 'c', cartaoId: null, data: '2026-11-06', parcelas: 1 }, refs)
    expect(r.descricao).toBe('X Y')
  })
})

describe('lançamento digitado também é limpo', () => {
  it('salvarLancamento tira caracteres de controle da descrição', async () => {
    const b = await bancoNovo()
    await salvarLancamento({ tipo: 'despesa', valor: 100, descricao: 'Pão\u0000de queijo', categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Santander'), cartaoId: null, data: '2026-11-06', parcelas: 1 })
    expect((await db.lancamentos.toArray())[0].descricao).toBe('Pão de queijo')
  })
})

describe('recusas da nuvem', () => {
  it('lê o motivo das recusas na resposta da sincronização', () => {
    expect(extrairRecusas(JSON.stringify({ rejections: [{ reason: 'unsupported Unicode escape sequence', table: 'lancamentos' }] })))
      .toEqual([{ motivo: 'unsupported Unicode escape sequence', tabela: 'lancamentos' }])
    expect(extrairRecusas(JSON.stringify({ changes: [] }))).toEqual([])
    expect(extrairRecusas('não é json com rejections')).toEqual([])
    expect(extrairRecusas(JSON.stringify({ rejections: [] }))).toEqual([])
    // mensagem do WebSocket: as recusas vêm dentro da mensagem
    expect(extrairRecusas(JSON.stringify({ type: 'changes', data: { rejections: [{ reason: 'x' }] } }))).toEqual([{ motivo: 'x', tabela: null }])
  })
})
