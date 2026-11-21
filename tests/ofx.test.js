import { describe, it, expect } from 'vitest'
import { lerOFX, decodificarArquivo, valorOfx, dataOfx, nomeDoBanco } from '../src/lib/ofx.js'
import { detectarParcela } from '../src/lib/importacao.js'
import { OFX_SGML_CONTA, OFX_XML_CONTA, OFX_CARTAO, emWindows1252 } from './exemplos-ofx.js'

describe('valores e datas do OFX', () => {
  it.each([
    ['-45.90', -4590], ['45,9', 4590], ['1500', 150000], ['-0.5', -50], ['.50', 50], ['+120.00', 12000],
    ['10.500', 1050], ['-1500,00', -150000], [' 7.00 ', 700], ['0.00', 0],
    ['1.234,56', null], ['12.345', null], ['abc', null], ['', null], [null, null], ['--5', null], ['1e5', null], ['-', null],
  ])('valorOfx(%j) = %j', (entrada, esperado) => {
    expect(valorOfx(entrada)).toBe(esperado)
  })

  it.each([
    ['20261120120000[-3:BRT]', '2026-11-20'], ['20261120', '2026-11-20'], ['20280229', '2028-02-29'],
    ['20261131', null], ['20270229', null], ['2026-11-20', null], ['', null], [undefined, null],
  ])('dataOfx(%j) = %j', (entrada, esperado) => {
    expect(dataOfx(entrada)).toBe(esperado)
  })

  it('reconhece códigos de banco', () => {
    expect(nomeDoBanco('033')).toBe('Santander')
    expect(nomeDoBanco('33')).toBe('Santander')
    expect(nomeDoBanco('0077')).toBe('Inter')
    expect(nomeDoBanco('999')).toBeNull()
    expect(nomeDoBanco(null)).toBeNull()
  })
})

describe('leitura de arquivos', () => {
  it('OFX antigo (SGML) em Windows-1252, com acentos, vírgula decimal e linha com data inválida', () => {
    const ex = lerOFX(decodificarArquivo(emWindows1252(OFX_SGML_CONTA)))
    expect(ex.tipo).toBe('conta')
    expect(ex.banco).toBe('033')
    expect(ex.inicio).toBe('2026-11-01')
    expect(ex.fim).toBe('2026-11-20')
    expect(ex.saldo).toEqual({ valor: 325410, data: '2026-11-20' })
    expect(ex.transacoes.map((t) => [t.fitid, t.data, t.valor])).toEqual([
      ['20261105001', '2026-11-05', 500000],
      ['20261106001', '2026-11-06', -4590],
      ['20261110001', '2026-11-10', -150000],
      ['20261112001', '2026-11-12', -20000],
    ])
    expect(ex.transacoes[0].descricao).toBe('SALÁRIO EMPRESA X')
    expect(ex.transacoes[1].descricao).toBe('COMPRA CARTÃO DÉBITO PADARIA SÃO JOÃO')
    expect(ex.transacoes[3].descricao).toBe('PIX ENVIADO FULANO & CIA')
    expect(ex.problemas).toEqual([{ posicao: 5, descricao: 'DATA QUEBRADA', motivo: 'data ilegível' }])
  })

  it('o mesmo arquivo em UTF-8 dá o mesmo resultado', () => {
    const a = lerOFX(decodificarArquivo(emWindows1252(OFX_SGML_CONTA)))
    const b = lerOFX(decodificarArquivo(new TextEncoder().encode(OFX_SGML_CONTA)))
    expect(b).toEqual(a)
  })

  it('OFX novo (XML), junta NAME e MEMO sem repetir e ignora valor zero', () => {
    const ex = lerOFX(decodificarArquivo(new TextEncoder().encode(OFX_XML_CONTA)))
    expect(ex.banco).toBe('077')
    expect(ex.transacoes.map((t) => [t.fitid, t.valor, t.descricao])).toEqual([
      ['INTER-A1', -3250, 'UBER *TRIP'],
      ['INTER-A2', -3250, 'UBER *TRIP'],
      ['INTER-A3', 12000, 'PIX RECEBIDO - Reembolso jantar'],
    ])
    expect(ex.problemas.map((p) => p.motivo)).toEqual(['valor zero'])
    expect(ex.saldo).toEqual({ valor: 105500, data: '2026-11-20' })
  })

  it('fatura de cartão é reconhecida como cartão', () => {
    const ex = lerOFX(OFX_CARTAO)
    expect(ex.tipo).toBe('cartao')
    expect(ex.transacoes.length).toBe(5)
    expect(ex.transacoes.filter((t) => !t.fitid).length).toBe(2)
  })

  it('arquivo que não é OFX', () => {
    expect(() => lerOFX('nome;valor\nx;1')).toThrow('OFX')
    expect(() => lerOFX(null)).toThrow()
  })

  it('arquivo com marca BOM do UTF-8', () => {
    const comBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(OFX_XML_CONTA)])
    expect(lerOFX(decodificarArquivo(comBom)).transacoes.length).toBe(3)
  })
})

describe('parcelas na descrição', () => {
  it.each([
    ['MAGAZINE LOJA PARC 04/10', { parcela: 4, total: 10 }],
    ['LOJA PARCELA 3 DE 12', { parcela: 3, total: 12 }],
    ['Loja parc.2/6', { parcela: 2, total: 6 }],
    ['AMAZON 02/06', { parcela: 2, total: 6 }],
    ['COMPRA 12/11 PADARIA', null], // parece data, parcela maior que o total
    ['LOJA 01/01', null],
    ['NETFLIX.COM', null],
    ['LOJA PARC 11/10', null],
  ])('%s', (desc, esperado) => {
    expect(detectarParcela(desc)).toEqual(esperado)
  })
})
