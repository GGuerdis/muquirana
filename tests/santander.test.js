import { describe, it, expect, beforeEach } from 'vitest'
import { valorBR, limparDescricao, lerExtratoSantander, lerConsolidado, lerParcial, juntarExtratos, reconhecerSantander } from '../src/lib/santander.js'
import { agruparEmLinhas } from '../src/lib/pdfTexto.js'
import { prepararImportacao, executarImportacao, conferirSaldo, podeDefinirSaldoInicial, NOVA_CONTA_INVESTIMENTOS } from '../src/lib/importacao.js'
import { salvarCartao } from '../src/lib/cadastros.js'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { resumoFatura } from '../src/lib/fatura.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'
import { consolidado, parcial } from './exemplos-santander.js'

// --- extratos fictícios: setembro e outubro/2025 (consolidado) + 01 a 10/11/2025 (parcial) ---
const SET = () => consolidado({
  mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 100000,
  lancamentos: [
    { data: '01/09', desc: 'PIX RECEBIDO', desc2: 'JOAO DA SILVA', valor: 20000, saldo: false },
    { data: null, desc: 'COMPRA CARTAO DEB MC', desc2: '01/09 UBER UBER .TRIP HEL', valor: -2350 },
    { data: '05/09', desc: 'CREDITO DE SALARIO EMPRESA', valor: 500000 },
    { data: '06/09', desc: 'APLICACAO CDB/RDB', valor: -100000, saldo: false },
    { data: null, desc: 'PIX ENVIADO', desc2: 'Fulano De Tal Souza da', valor: -50000 },
    { data: '10/09', desc: 'DEBITO AUT. FAT.CARTAO MASTER CARD', desc2: 'FINAL 1234', valor: -80000, separarValor: true },
    { data: '15/09', desc: 'COMPRA CARTAO DEB MC', desc2: '14/09 PADARIA PAO BOM.Descri', valor: -1590 },
    { data: '20/09', desc: 'RESGATE CDB/RDB', valor: 30000 },
    { data: null, desc: 'REMUNERACAO APLICACAO AUTOMATICA', valor: 7 },
  ],
  comInvestimentos: true,
})
const OUT = () => consolidado({
  mes: 'outubro', ano: 2025, dataAnterior: '30/09', dataFinal: '31/10', saldoAnterior: 100000 + 20000 - 2350 + 500000 - 100000 - 50000 - 80000 - 1590 + 30000 + 7,
  lancamentos: [
    { data: '01/10', desc: 'PIX ENVIADO Tim S A', valor: -6860 },
    { data: '15/10', desc: 'CREDITO DE SALARIO EMPRESA', valor: 300000 },
    { data: '20/10', desc: 'PAGAMENTO CARTAO CREDITO BCE', valor: -45000 },
  ],
})
const saldoFimOut = 100000 + 20000 - 2350 + 500000 - 100000 - 50000 - 80000 - 1590 + 30000 + 7 - 6860 + 300000 - 45000
const NOV = () => parcial({
  inicio: '01/11/2025', fim: '10/11/2025', saldoInicial: saldoFimOut,
  lancamentos: [
    { data: '03/11/2025', tipo: 'Pix enviado', detalhe: 'Fulano De Tal Souza', valor: -5000 },
    { data: '03/11/2025', tipo: 'Compra cartao deb mc', detalhe: 'Mercado Bom Preco', valor: -12345 },
    { data: '04/11/2025', tipo: 'Compra cartao deb mc', detalhe: 'Emv Cmt.1', valor: -455 },
    { data: '04/11/2025', tipo: 'Compra cartao deb mc', detalhe: 'Emv Cmt.2', valor: -455 },
    { data: '10/11/2025', tipo: 'Remuneracao aplicacao automatica', valor: 3, inline: true },
  ],
})

describe('valores em reais', () => {
  it.each([
    ['2.985,56', 298556], ['4,20-', -420], ['-R$ 14,00', -1400], ['R$ 1.759,53', 175953], ['R$1.000,00', 100000],
    ['0,01', 1], ['1.234.567,89', 123456789], ['12,3', null], ['abc', null], ['1,234', null], ['', null],
  ])('%s → %s', (t, v) => expect(valorBR(t)).toBe(v))

  it('limpa a descrição de compra no débito', () => {
    expect(limparDescricao('COMPRA CARTAO DEB MC 18/03 AUTOPASS S.A.Descri')).toBe('AUTOPASS S.A.')
    expect(limparDescricao('Compra cartao deb mc Academia Exemplo .')).toBe('Academia Exemplo .')
    expect(limparDescricao('PIX ENVIADO Tim S A')).toBe('PIX ENVIADO Tim S A')
    expect(limparDescricao('TOP SP TARIF.Descripti')).toBe('TOP SP TARIF.')
  })
})

describe('extrato consolidado (mensal)', () => {
  it('lê a tabela da conta corrente: data herdada, descrição em 2 linhas, valor em linha separada', () => {
    const e = lerExtratoSantander(SET())
    expect(e.formato).toBe('consolidado')
    expect(e.conferencia).toMatchObject({ ok: true, erros: [] })
    expect(e).toMatchObject({ inicio: '2025-09-01', fim: '2025-09-30', saldoInicial: 100000, titular: 'FULANO DE TAL SOUZA', conta: '1234-020000001' })
    expect(e.transacoes.map((t) => [t.data, t.valor, t.descricao])).toEqual([
      ['2025-09-01', 20000, 'PIX RECEBIDO JOAO DA SILVA'],
      ['2025-09-01', -2350, 'UBER UBER .TRIP HEL'],
      ['2025-09-05', 500000, 'CREDITO DE SALARIO EMPRESA'],
      ['2025-09-06', -100000, 'APLICACAO CDB/RDB'],
      ['2025-09-06', -50000, 'PIX ENVIADO Fulano De Tal Souza da'],
      ['2025-09-10', -80000, 'DEBITO AUT. FAT.CARTAO MASTER CARD FINAL 1234'],
      ['2025-09-15', -1590, 'PADARIA PAO BOM.'],
      ['2025-09-20', 30000, 'RESGATE CDB/RDB'],
      ['2025-09-20', 7, 'REMUNERACAO APLICACAO AUTOMATICA'],
    ])
  })

  it('ignora a lista "Compras com Cartão de Débito" e as tabelas de investimento', () => {
    const e = lerConsolidado(SET())
    expect(e.transacoes.some((t) => /NAO ENTRA/.test(t.descricao) || t.valor === -99999 || t.valor === 99999)).toBe(false)
    expect(e.transacoes.length).toBe(9)
  })

  it('cabeçalho repetido em nova página não vira lançamento', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({ data: `${String(1 + (i % 28)).padStart(2, '0')}/09`, desc: `COMPRA ${i}`, valor: -(100 + i) }))
      .sort((a, b) => a.data.localeCompare(b.data))
    const e = lerConsolidado(consolidado({ mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 0, lancamentos: muitos }))
    expect(e.conferencia.ok).toBe(true)
    expect(e.transacoes.length).toBe(30)
  })

  it('sem a linha final "SALDO EM", a leitura para no fim da tabela (nada de outras seções na descrição)', () => {
    const e = lerConsolidado(consolidado({ mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 0, lancamentos: [{ data: '02/09', desc: 'COMPRA X', valor: -100 }], semSaldoFinal: true }))
    expect(e.transacoes.map((t) => t.descricao)).toEqual(['COMPRA X'])
    expect(e.conferencia.ok).toBe(true)
  })

  it('extrato de janeiro: "SALDO EM 31/12" é do ano anterior', () => {
    const e = lerConsolidado(consolidado({ mes: 'janeiro', ano: 2026, dataAnterior: '31/12', dataFinal: '31/01', saldoAnterior: 5000, lancamentos: [{ data: '05/01', desc: 'PIX RECEBIDO', valor: 1000 }] }))
    expect(e).toMatchObject({ inicio: '2026-01-01', fim: '2026-01-31' })
    expect(e.transacoes[0].data).toBe('2026-01-05')
  })

  it('recusa leitura que não bate com o saldo impresso pelo banco', () => {
    const linhas = SET()
    // "erro de leitura": um valor trocado (o saldo impresso continua o do banco)
    const alvo = linhas.find((l) => l.itens.some((i) => i.s === '23,50-'))
    alvo.itens.find((i) => i.s === '23,50-').s = '25,30-'
    const e = lerConsolidado(linhas)
    expect(e.conferencia.ok).toBe(false)
    expect(e.conferencia.erros.join(' ')).toMatch(/o banco mostra saldo/)
  })

  it('recusa quando uma linha some (total de débitos não bate)', () => {
    const linhas = SET().filter((l) => !l.itens.some((i) => i.s === '15,90-'))
    expect(lerConsolidado(linhas).conferencia.ok).toBe(false)
  })

  it('recusa quando o saldo final do resumo não bate', () => {
    const e = lerConsolidado(consolidado({ mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 0, lancamentos: [{ data: '02/09', desc: 'X', valor: 100 }], saldoFinalResumo: 999 }))
    expect(e.conferencia.ok).toBe(false)
  })
})

describe('extrato de período (app)', () => {
  it('lê do mais novo para o mais antigo, liga a descrição de cima e de baixo e confere linha a linha', () => {
    const e = lerExtratoSantander(NOV())
    expect(e.formato).toBe('parcial')
    expect(e.conferencia).toMatchObject({ ok: true })
    expect(e.conferencia.saldosConferidos).toBe(5)
    expect(e.transacoes.map((t) => [t.data, t.valor, t.descricao])).toEqual([
      ['2025-11-03', -5000, 'Pix enviado Fulano De Tal Souza'],
      ['2025-11-03', -12345, 'Mercado Bom Preco'],
      ['2025-11-04', -455, 'Emv Cmt.1'],
      ['2025-11-04', -455, 'Emv Cmt.2'],
      ['2025-11-10', 3, 'Remuneracao aplicacao automatica'],
    ])
    expect(e).toMatchObject({ inicio: '2025-11-01', fim: '2025-11-10', saldoInicial: saldoFimOut, conta: '1234-020000001' })
  })

  it('várias páginas', () => {
    const lancs = Array.from({ length: 25 }, (_, i) => ({ data: `${String(1 + Math.floor(i / 3)).padStart(2, '0')}/11/2025`, tipo: 'Compra cartao deb mc', detalhe: `Loja ${i}`, valor: -(1000 + i) }))
    const e = lerParcial(parcial({ inicio: '01/11/2025', fim: '30/11/2025', saldoInicial: 100000, lancamentos: lancs }))
    expect(e.conferencia.ok).toBe(true)
    expect(e.transacoes.map((t) => t.descricao)).toEqual(lancs.map((x) => x.detalhe))
  })

  it('recusa saldo de linha que não bate', () => {
    const linhas = NOV()
    const alvo = linhas.find((l) => l.itens.some((i) => i.s === '-R$ 123,45'))
    alvo.itens.find((i) => i.s === '-R$ 123,45').s = '-R$ 123,54'
    expect(lerParcial(linhas).conferencia.ok).toBe(false)
  })

  it('PDF de outro banco ou outro documento é recusado', () => {
    expect(reconhecerSantander([{ pagina: 1, y: 800, itens: [{ x: 10, s: 'FATURA DO CARTÃO' }] }])).toBeNull()
    expect(() => lerExtratoSantander([{ pagina: 1, y: 800, itens: [{ x: 10, s: 'Qualquer coisa' }] }])).toThrow('Santander')
  })
})

describe('juntar vários extratos', () => {
  it('meses que emendam viram um histórico só, com saldo inicial e final', () => {
    const j = juntarExtratos([lerConsolidado(OUT()), lerParcial(NOV()), lerConsolidado(SET())]) // fora de ordem de propósito
    expect(j.conferencia).toEqual({ ok: true, erros: [] })
    expect(j).toMatchObject({ inicio: '2025-09-01', fim: '2025-11-10', saldoInicial: { valor: 100000, data: '2025-08-31' }, saldo: { valor: saldoFimOut - 5000 - 12345 - 910 + 3, data: '2025-11-10' } })
    expect(j.transacoes.length).toBe(9 + 3 + 5) // os dois R$ 4,55 do mesmo dia entram os dois
    expect(j.transacoes.map((t) => t.data)).toEqual([...j.transacoes.map((t) => t.data)].sort())
    expect(j.titular).toBe('FULANO DE TAL SOUZA')
  })

  it('aponta mês faltando', () => {
    const j = juntarExtratos([lerConsolidado(SET()), lerParcial(NOV())])
    expect(j.conferencia.ok).toBe(false)
    expect(j.conferencia.erros.join(' ')).toMatch(/Falta extrato entre 30\/09\/2025 e 01\/11\/2025/)
  })

  it('aponta saldo que não emenda', () => {
    const outErrado = consolidado({ mes: 'outubro', ano: 2025, dataAnterior: '30/09', dataFinal: '31/10', saldoAnterior: 1, lancamentos: [] })
    const j = juntarExtratos([lerConsolidado(SET()), lerConsolidado(outErrado)])
    expect(j.conferencia.erros.join(' ')).toMatch(/começa com/)
  })

  it('mesmo período em dois formatos: lançamentos entram uma vez só', () => {
    const novConsolidado = consolidado({
      mes: 'novembro', ano: 2025, dataAnterior: '31/10', dataFinal: '30/11', saldoAnterior: saldoFimOut,
      lancamentos: [
        { data: '03/11', desc: 'PIX ENVIADO', desc2: 'Fulano De Tal Souza da', valor: -5000 },
        { data: null, desc: 'COMPRA CARTAO DEB MC', desc2: '03/11 MERCADO BOM PRECO', valor: -12345 },
        { data: '04/11', desc: 'COMPRA CARTAO DEB MC', desc2: '04/11 EMV CMT.1', valor: -455 },
        { data: null, desc: 'COMPRA CARTAO DEB MC', desc2: '04/11 EMV CMT.2', valor: -455 },
        { data: '10/11', desc: 'REMUNERACAO APLICACAO AUTOMATICA', valor: 3 },
        { data: '20/11', desc: 'PIX RECEBIDO', valor: 1000 },
      ],
    })
    const j = juntarExtratos([lerParcial(NOV()), lerConsolidado(novConsolidado)])
    expect(j.conferencia.ok).toBe(true)
    expect(j.transacoes.length).toBe(6)
  })

  it('mesmo período com lançamentos diferentes é recusado', () => {
    const novDiferente = consolidado({ mes: 'novembro', ano: 2025, dataAnterior: '31/10', dataFinal: '30/11', saldoAnterior: saldoFimOut, lancamentos: [{ data: '03/11', desc: 'OUTRA', valor: -7777 }] })
    const j = juntarExtratos([lerParcial(NOV()), lerConsolidado(novDiferente)])
    expect(j.conferencia.erros.join(' ')).toMatch(/diferentes no período em comum/)
  })

  it('contas diferentes são recusadas', () => {
    const outraConta = consolidado({ mes: 'outubro', ano: 2025, dataAnterior: '30/09', dataFinal: '31/10', saldoAnterior: saldoFimOut + 6860 - 300000 + 45000, lancamentos: OUT().length ? [] : [], conta: '09.999999-9' })
    const j = juntarExtratos([lerConsolidado(SET()), lerConsolidado(outraConta)])
    expect(j.conferencia.erros.join(' ')).toMatch(/contas diferentes/)
  })

  it('a chave de cada lançamento é a mesma em qualquer formato (para não duplicar)', () => {
    const a = juntarExtratos([lerParcial(NOV())]).transacoes.map((t) => t.chave)
    const novConsolidado = consolidado({
      mes: 'novembro', ano: 2025, dataAnterior: '31/10', dataFinal: '30/11', saldoAnterior: saldoFimOut,
      lancamentos: [
        { data: '03/11', desc: 'PIX ENVIADO', valor: -5000 },
        { data: null, desc: 'COMPRA', valor: -12345 },
        { data: '04/11', desc: 'X', valor: -455 },
        { data: null, desc: 'Y', valor: -455 },
        { data: '10/11', desc: 'REMUNERACAO', valor: 3 },
      ],
    })
    const b = juntarExtratos([lerConsolidado(novConsolidado)]).transacoes.map((t) => t.chave)
    expect(b).toEqual(a)
  })
})

describe('linhas do PDF', () => {
  it('junta pedaços da mesma linha (com até 3 pontos de diferença) e separa linhas próximas', () => {
    const linhas = agruparEmLinhas([
      { pagina: 1, x: 34, y: 636, s: '10/10' }, { pagina: 1, x: 65, y: 636, s: 'COMPRA' }, { pagina: 1, x: 437, y: 635, s: '11,92-' },
      { pagina: 1, x: 65, y: 626, s: '10/10 Uber' }, { pagina: 1, x: 10, y: 600, s: '   ' },
      { pagina: 2, x: 34, y: 636, s: 'outra página' },
    ])
    expect(linhas.map((l) => [l.pagina, l.itens.map((i) => i.s)])).toEqual([[1, ['10/10', 'COMPRA', '11,92-']], [1, ['10/10 Uber']], [2, ['outra página']]])
  })
})

describe('importar o histórico (com as regras)', () => {
  let b, cartaoSant, cartaoInter
  beforeEach(async () => {
    b = await bancoNovo()
    await salvarCartao({ nome: 'Santander', limite: 0, diaFechamento: 3, diaVencimento: 10, contaPagamentoId: b.conta('Santander') })
    await salvarCartao({ nome: 'Inter', limite: 0, diaFechamento: 12, diaVencimento: 20, contaPagamentoId: b.conta('Santander') })
    ;[cartaoSant, cartaoInter] = await db.cartoes.toArray()
  })
  const dados = async () => ({ lancamentos: await db.lancamentos.toArray(), contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() })
  const historico = () => juntarExtratos([lerConsolidado(SET()), lerConsolidado(OUT()), lerParcial(NOV())])

  it('investimento, PIX para você e faturas são reconhecidos; o saldo do app fica igual ao do banco', async () => {
    const extrato = historico()
    const destino = { tipo: 'conta', id: b.conta('Santander') }
    const regras = { contaInvestimentos: NOVA_CONTA_INVESTIMENTOS, contaPixProprio: b.conta('Inter'), titular: extrato.titular, cartaoPorPagamento: { 'PAGAMENTO CARTAO CREDITO BCE': cartaoInter.id }, historico: true }
    const { itens } = prepararImportacao({ extrato, destino, dados: await dados(), regras })
    const porDesc = (re) => itens.filter((i) => re.test(i.descricao))
    expect(porDesc(/APLICACAO CDB|RESGATE CDB/).every((i) => i.acao === 'transferencia' && i.contaOutraId === NOVA_CONTA_INVESTIMENTOS)).toBe(true)
    expect(porDesc(/Fulano De Tal Souza/i).every((i) => i.acao === 'transferencia' && i.contaOutraId === b.conta('Inter'))).toBe(true)
    expect(porDesc(/FAT\.CARTAO/)[0]).toMatchObject({ acao: 'fatura', cartaoPagoId: cartaoSant.id, faturaPaga: '2025-09', faturaSemCompras: true })
    expect(porDesc(/BCE/)[0]).toMatchObject({ acao: 'fatura', cartaoPagoId: cartaoInter.id, faturaPaga: '2025-10' })
    expect(porDesc(/JOAO DA SILVA/)[0]).toMatchObject({ acao: 'lancar', tipo: 'receita' }) // PIX de outra pessoa continua receita

    expect(podeDefinirSaldoInicial({ extrato, destino, lancamentos: [] })).toBe(true)
    const conta = await db.contas.get(b.conta('Santander'))
    expect(conferirSaldo({ extrato, destino, itens, lancamentos: [], conta, saldoInicial: extrato.saldoInicial.valor }).diferenca).toBe(0)

    const n = await executarImportacao({ itens, destino, saldoInicial: extrato.saldoInicial.valor, nomeContaInvestimentos: 'Investimentos Santander' })
    expect(n).toBe(17)
    const L = await db.lancamentos.toArray()
    const contas = await db.contas.toArray()
    const invest = contas.find((c) => c.nome === 'Investimentos Santander')
    expect(invest).toBeTruthy()
    const santander = contas.find((c) => c.nome === 'Santander')
    expect(santander.saldoInicial).toBe(100000)
    expect(saldoConta(santander, L, '2025-11-10')).toBe(extrato.saldo.valor)
    expect(saldoConta(invest, L, '2025-11-10')).toBe(100000 - 30000)
    expect(saldoConta(contas.find((c) => c.nome === 'Inter'), L, '2025-11-10')).toBe(50000 + 5000)
    // aplicações, PIX para você e faturas não contam como gasto
    expect(resumoMes('2025-09', L)).toMatchObject({ entrou: 20000 + 500000 + 7, saiu: 2350 + 1590 })
    // fatura paga "sem compras" ainda (as compras chegam com a fatura do cartão)
    expect(resumoFatura(cartaoSant, '2025-09', L, '2025-11-10')).toMatchObject({ total: 0, pago: 80000 })

    // importar o mesmo histórico de novo não duplica nada
    const de_novo = prepararImportacao({ extrato: historico(), destino, dados: await dados(), regras })
    expect(de_novo.resumo).toMatchObject({ novos: 0, importados: 17 })
  })

  it('sem regras: aplicações viram gasto/receita e PIX para você vira gasto (escolha do usuário)', async () => {
    const extrato = historico()
    const { itens } = prepararImportacao({ extrato, destino: { tipo: 'conta', id: b.conta('Santander') }, dados: await dados(), regras: { titular: extrato.titular } })
    expect(itens.find((i) => /APLICACAO CDB/.test(i.descricao))).toMatchObject({ acao: 'lancar', grupo: 'investimento' })
    expect(itens.find((i) => /Fulano De Tal Souza/i.test(i.descricao))).toMatchObject({ acao: 'lancar', grupo: 'pixProprio' })
  })

  it('PIX para uma conta pelo número (ex.: 077 = Inter) vira transferência; dá para dizer que não é sua', async () => {
    const extrato = { tipo: 'conta', transacoes: [
      { posicao: 1, data: '2025-09-02', valor: -10000, descricao: 'PIX ENVIADO 077/0001/0000000123456789', chave: 'p:a' },
      { posicao: 2, data: '2025-09-03', valor: 5000, descricao: 'PIX RECEBIDO 077/0001/0000000123456789', chave: 'p:b' },
      { posicao: 3, data: '2025-09-04', valor: -2000, descricao: 'PIX ENVIADO 341/4321/0000000999999', chave: 'p:c' },
    ] }
    const destino = { tipo: 'conta', id: b.conta('Santander') }
    const sim = prepararImportacao({ extrato, destino, dados: await dados() })
    expect(sim.itens.map((i) => [i.grupo, i.acao, i.contaOutraId])).toEqual([
      ['pixConta', 'transferencia', b.conta('Inter')],
      ['pixConta', 'transferencia', b.conta('Inter')],
      ['pixConta', 'lancar', null], // Itaú: não há conta Itaú no app
    ])
    const nao = prepararImportacao({ extrato, destino, dados: await dados(), regras: { contaPorPix: { '077/0001/0000000123456789': null } } })
    expect(nao.itens[0].acao).toBe('lancar')
  })

  it('não define saldo inicial se a conta já tem lançamentos mais antigos', async () => {
    await db.lancamentos.add({ tipo: 'despesa', valor: 100, categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Santander'), cartaoId: null, data: '2025-01-01', criadoEm: 1 })
    expect(podeDefinirSaldoInicial({ extrato: historico(), destino: { tipo: 'conta', id: b.conta('Santander') }, lancamentos: await db.lancamentos.toArray() })).toBe(false)
  })

  it('tudo ou nada também no lote grande: um erro não deixa nada gravado (nem a conta nova, nem o saldo inicial)', async () => {
    const extrato = historico()
    const destino = { tipo: 'conta', id: b.conta('Santander') }
    const { itens } = prepararImportacao({ extrato, destino, dados: await dados(), regras: { contaInvestimentos: NOVA_CONTA_INVESTIMENTOS, historico: true, titular: extrato.titular, contaPixProprio: b.conta('Inter') } })
    const ruim = itens.map((i, k) => (k === itens.length - 1 ? { ...i, categoriaId: b.cat('despesa', 'Outros') } : i)) // receita com categoria de despesa
    await expect(executarImportacao({ itens: ruim, destino, saldoInicial: 100000 })).rejects.toThrow('Linha')
    expect(await db.lancamentos.count()).toBe(0)
    expect((await db.contas.toArray()).length).toBe(3)
    expect((await db.contas.get(b.conta('Santander'))).saldoInicial).toBe(0)
  })
})
