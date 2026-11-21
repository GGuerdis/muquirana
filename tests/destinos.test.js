// PIX com o seu nome: o extrato mensal diz para qual banco/conta foi (tabela "PIXs Enviados").
// Dados FICTÍCIOS.
import { describe, it, expect, beforeEach } from 'vitest'
import { lerConsolidado, lerParcial, juntarExtratos, lerEnviados, ligarDestinos } from '../src/lib/santander.js'
import { prepararImportacao, executarImportacao, problemaDoItem, novaConta, chaveDoDestino, conferirSaldo } from '../src/lib/importacao.js'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'
import { consolidado, parcial } from './exemplos-santander.js'

const EU = 'FULANO DE TAL SOUZA'
const CAIXA = { banco: '0104', agencia: '0999', conta: '0001234567890' }
const ISPB_INTER = '00416968'

// setembro/2025: 3 PIX para mim (Caixa, Inter, Caixa agendado no domingo e debitado na segunda) + 1 para outra pessoa
const SET = () => consolidado({
  mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 500000,
  lancamentos: [
    { data: '01/09', desc: 'PIX ENVIADO Fulano De Tal Souza da', valor: -3000 }, // pedido em agosto (está na tabela de agosto)
    { data: '02/09', desc: 'PIX ENVIADO Fulano De Tal Souza da', valor: -58000 },
    { data: '05/09', desc: 'PIX ENVIADO Fulano De Tal Souza da', valor: -10000 },
    { data: '08/09', desc: 'PIX ENVIADO Fulano De Tal Souza da', valor: -65200 },
    { data: '10/09', desc: 'PIX ENVIADO Ciclano Pereira', valor: -10000 },
    { data: '30/09', desc: 'PIX ENVIADO Fulano De Tal Souza da', valor: -2000 }, // sem linha na tabela
  ],
  enviados: [
    { data: '02/09', favorecido: EU, ...CAIXA, valor: 58000 },
    { data: '06/09', favorecido: EU, ...CAIXA, valor: 65200 }, // pedido no sábado, debitado na segunda 08/09
    { data: '05/09', favorecido: EU, ispb: ISPB_INTER, valor: 10000 },
    { data: '10/09', favorecido: 'CICLANO PEREIRA', ispb: '99999999', valor: 10000 }, // banco que o app não conhece
  ],
})

describe('tabela de PIX enviados no extrato mensal', () => {
  it('lê as duas partes (número do banco e ISPB) e não confunde com outras tabelas', () => {
    const e = lerConsolidado(SET())
    expect(e.conferencia.ok).toBe(true)
    expect(e.transacoes.length).toBe(6) // a tabela não vira lançamento
    expect(e.enviados).toMatchObject({ total: 4, ligados: 4 })
  })

  it('cada PIX ganha o destino certo, inclusive o agendado que saiu dias depois', () => {
    const t = lerConsolidado(SET()).transacoes.slice(1)
    expect(t[0].destino).toMatchObject({ banco: '104', agencia: '0999', conta: '0001234567890', favorecido: EU })
    expect(t[1].destino).toMatchObject({ banco: '077', ispb: ISPB_INTER, agencia: null, conta: null })
    expect(t[2].destino).toMatchObject({ banco: '104', dataPedido: '2025-09-06' })
    expect(t[3].destino).toMatchObject({ banco: null, ispb: '99999999' })
    expect(t[4].destino).toBeUndefined()
  })

  it('valor igual no mesmo período: cada linha da tabela é usada uma vez só', () => {
    const transacoes = [
      { posicao: 1, data: '2025-09-02', valor: -1000, descricao: 'PIX ENVIADO Fulano' },
      { posicao: 2, data: '2025-09-02', valor: -1000, descricao: 'PIX ENVIADO Fulano' },
      { posicao: 3, data: '2025-09-02', valor: -1000, descricao: 'COMPRA CARTAO' },
    ]
    const r = ligarDestinos(transacoes, [
      { data: '2025-09-02', banco: '104', valor: 1000 },
      { data: '2025-09-02', banco: '077', valor: 1000 },
      { data: '2025-09-02', banco: '260', valor: 1000 }, // sobra: não há outro PIX com esse valor
    ])
    expect(transacoes.map((x) => x.destino?.banco)).toEqual(['104', '077', undefined])
    expect(r.ligados).toBe(2)
    expect(r.soltos.map((x) => x.banco)).toEqual(['260'])
  })

  it('não liga a dinheiro que ENTROU com o mesmo valor', () => {
    const transacoes = [{ posicao: 1, data: '2025-09-02', valor: 1000, descricao: 'PIX RECEBIDO Fulano' }]
    ligarDestinos(transacoes, [{ data: '2025-09-02', banco: '104', valor: 1000 }])
    expect(transacoes[0].destino).toBeUndefined()
  })

  it('não liga a um débito ANTES do pedido nem mais de 5 dias depois', () => {
    const transacoes = [
      { posicao: 1, data: '2025-09-01', valor: -1000, descricao: 'PIX ENVIADO A' },
      { posicao: 2, data: '2025-09-12', valor: -1000, descricao: 'PIX ENVIADO B' },
    ]
    ligarDestinos(transacoes, [{ data: '2025-09-05', banco: '104', valor: 1000 }])
    expect(transacoes.every((x) => !x.destino)).toBe(true)
  })

  it('PIX pedido no fim do mês e debitado no começo do outro: liga ao juntar os extratos', () => {
    const ago = lerConsolidado(consolidado({
      mes: 'agosto', ano: 2025, dataAnterior: '31/07', dataFinal: '31/08', saldoAnterior: 499900,
      lancamentos: [{ data: '05/08', desc: 'PIX RECEBIDO', valor: 100 }],
      enviados: [{ data: '30/08', favorecido: EU, ...CAIXA, valor: 3000 }], // sábado: sai só na segunda, 01/09
    }))
    expect(ago.enviados).toMatchObject({ total: 1, ligados: 0 })
    expect(lerConsolidado(SET()).transacoes[0].destino).toBeUndefined() // sozinho, setembro não sabe
    const juntos = juntarExtratos([ago, lerConsolidado(SET())])
    expect(juntos.conferencia.ok).toBe(true)
    expect(juntos.transacoes.find((x) => x.data === '2025-09-01').destino).toMatchObject({ banco: '104', dataPedido: '2025-08-30' })
    expect(juntos.transacoes.find((x) => x.data === '2025-09-30').destino).toBeUndefined()
  })

  it('o destino passa pelo juntar, e o consolidado completa o parcial do mesmo período', () => {
    const par = parcial({
      inicio: '31/08/2025', fim: '05/09/2025', saldoInicial: 500000, // começa antes: o parcial entra primeiro no juntar
      lancamentos: [
        { data: '01/09/2025', tipo: 'Pix enviado', detalhe: 'Fulano De Tal Souza da', valor: -3000 },
        { data: '02/09/2025', tipo: 'Pix enviado', detalhe: 'Fulano De Tal Souza da', valor: -58000 },
        { data: '05/09/2025', tipo: 'Pix enviado', detalhe: 'Fulano De Tal Souza da', valor: -10000 },
      ],
    })
    const lidos = [lerParcial(par), lerConsolidado(SET())]
    const j = juntarExtratos(lidos)
    expect(j.conferencia.ok).toBe(true)
    expect(j.transacoes.length).toBe(6)
    expect(j.transacoes.filter((x) => x.destino?.banco === '104').length).toBe(2)
    expect(j.transacoes.find((x) => x.data === '2025-09-05').destino.banco).toBe('077')
  })

  it('sem a tabela no PDF, nada muda', () => {
    expect(lerEnviados([], () => null)).toEqual([])
    const e = lerConsolidado(consolidado({ mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 0, lancamentos: [{ data: '02/09', desc: 'PIX ENVIADO X', valor: -100 }] }))
    expect(e.transacoes[0].destino).toBeUndefined()
    expect(e.enviados.total).toBe(0)
  })

  it('chave da conta de destino', () => {
    expect(chaveDoDestino({ banco: '104', agencia: '0999', conta: '0001234567890' })).toBe('104/0999/0001234567890')
    expect(chaveDoDestino({ banco: '077', agencia: null, conta: null })).toBe('077')
    expect(chaveDoDestino({ banco: null, ispb: '99999999' })).toBe('ISPB 99999999')
    expect(chaveDoDestino(undefined)).toBeNull()
  })
})

describe('importar: cada PIX com o seu nome vai para a conta certa', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const dados = async () => ({ lancamentos: await db.lancamentos.toArray(), contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() })
  const CHAVE_CAIXA = '104/0999/0001234567890'
  const extrato = () => juntarExtratos([lerConsolidado(SET())])
  const destino = () => ({ tipo: 'conta', id: b.conta('Santander') })

  it('Caixa (sem conta no app) → nova conta "Caixa"; Inter → Inter; sem destino → a regra geral', async () => {
    const { itens } = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras: { titular: EU, contaPixProprio: b.conta('Inter') } })
    expect(itens.map((i) => [i.grupo, i.acao, i.contaOutraId])).toEqual([
      ['pixProprio', 'transferencia', b.conta('Inter')], // sem destino no extrato: regra geral
      ['pixProprio', 'transferencia', novaConta('Caixa')],
      ['pixProprio', 'transferencia', b.conta('Inter')],
      ['pixProprio', 'transferencia', novaConta('Caixa')],
      [null, 'lancar', null], // PIX para outra pessoa: gasto
      ['pixProprio', 'transferencia', b.conta('Inter')], // sem destino no extrato: regra geral
    ])
    expect(itens[1].contaBancaria).toBe(CHAVE_CAIXA)
    expect(itens[2].contaBancaria).toBe('077')
    expect(itens[0].contaBancaria).toBeUndefined()
    expect(itens[5].contaBancaria).toBeUndefined()
  })

  it('se já existe uma conta com o nome do banco, usa ela', async () => {
    const caixa = await db.contas.add({ nome: 'Caixa Econômica', emoji: '🏦', saldoInicial: 0 })
    const { itens } = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras: { titular: EU } })
    expect(itens[1].contaOutraId).toBe(caixa)
  })

  it('cria a conta Caixa uma vez só e, com "pagamento", lança o gasto lá no mesmo dia', async () => {
    const moradia = b.cat('despesa', 'Moradia')
    const regras = { titular: EU, contaPixProprio: b.conta('Inter'), gastoPorPix: { [CHAVE_CAIXA]: moradia } }
    const ex = extrato()
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras })
    expect(itens[1]).toMatchObject({ gastoCategoriaId: moradia })
    expect(itens[2].gastoCategoriaId).toBeNull() // Inter: só transferência
    const conta = await db.contas.get(b.conta('Santander'))
    expect(conferirSaldo({ extrato: ex, destino: destino(), itens, lancamentos: [], conta, saldoInicial: ex.saldoInicial.valor }).diferenca).toBe(0)

    const n = await executarImportacao({ itens, destino: destino(), saldoInicial: ex.saldoInicial.valor })
    expect(n).toBe(6 + 2) // 6 linhas + 2 gastos na Caixa
    const contas = await db.contas.toArray()
    const caixas = contas.filter((c) => c.nome === 'Caixa')
    expect(caixas.length).toBe(1)
    const L = await db.lancamentos.toArray()
    const gastos = L.filter((l) => l.tipo === 'despesa' && l.contaId === caixas[0].id)
    expect(gastos.map((g) => [g.data, g.valor, g.categoriaId])).toEqual([['2025-09-02', 58000, moradia], ['2025-09-08', 65200, moradia]])
    // a Caixa recebe e paga: fica zerada; o Santander bate com o banco; o gasto aparece no mês
    expect(saldoConta(caixas[0], L, '2025-09-30')).toBe(0)
    expect(saldoConta(contas.find((c) => c.nome === 'Santander'), L, '2025-09-30')).toBe(ex.saldo.valor)
    expect(saldoConta(contas.find((c) => c.nome === 'Inter'), L, '2025-09-30')).toBe(3000 + 10000 + 2000)
    expect(resumoMes('2025-09', L).saiu).toBe(58000 + 65200 + 10000) // Caixa (pagamentos) + PIX para o Ciclano

    // de novo: nada duplica (nem a conta, nem os gastos)
    const de_novo = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras })
    expect(de_novo.resumo).toMatchObject({ novos: 0, importados: 6 })
    expect((await db.contas.toArray()).filter((c) => c.nome === 'Caixa').length).toBe(1)
  })

  it('dá para dizer que não é transferência (vira gasto) ou mandar para outra conta', async () => {
    const nao = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras: { titular: EU, contaPorPix: { [CHAVE_CAIXA]: null } } })
    expect(nao.itens[1]).toMatchObject({ acao: 'lancar', grupo: 'pixProprio' })
    const carteira = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras: { titular: EU, contaPorPix: { [CHAVE_CAIXA]: b.conta('Carteira') } } })
    expect(carteira.itens[1].contaOutraId).toBe(b.conta('Carteira'))
  })

  it('tudo ou nada: se uma linha falha, a conta Caixa não é criada e nenhum gasto fica', async () => {
    const regras = { titular: EU, contaPixProprio: b.conta('Inter'), gastoPorPix: { [CHAVE_CAIXA]: b.cat('despesa', 'Moradia') } }
    const { itens } = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras })
    const ruim = itens.map((i, k) => (k === 4 ? { ...i, categoriaId: b.cat('receita', 'Salário') } : i))
    await expect(executarImportacao({ itens: ruim, destino: destino() })).rejects.toThrow('Linha')
    expect(await db.lancamentos.count()).toBe(0)
    expect((await db.contas.toArray()).map((c) => c.nome)).toEqual(['Santander', 'Inter', 'Carteira'])
  })

  it('gasto na outra conta só vale para dinheiro que SAI daqui', () => {
    const item = { acao: 'transferencia', entrada: true, contaOutraId: 'x', gastoCategoriaId: 'cat', situacao: 'novo' }
    expect(problemaDoItem(item, { tipo: 'conta', id: 'y' })).toMatch('Só a transferência que sai')
    expect(problemaDoItem({ ...item, entrada: false }, { tipo: 'conta', id: 'y' })).toBeNull()
  })

  it('PIX para conta pelo número na descrição também aceita "pagamento"', async () => {
    const ex = { tipo: 'conta', transacoes: [{ posicao: 1, data: '2025-09-02', valor: -10000, descricao: 'PIX ENVIADO 077/0001/0000000123456789', chave: 'p:a' }] }
    const lazer = b.cat('despesa', 'Lazer')
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: { gastoPorPix: { '077/0001/0000000123456789': lazer } } })
    expect(itens[0]).toMatchObject({ acao: 'transferencia', contaOutraId: b.conta('Inter'), gastoCategoriaId: lazer })
    await executarImportacao({ itens, destino: destino() })
    const L = await db.lancamentos.toArray()
    expect(L.filter((l) => l.tipo === 'despesa' && l.contaId === b.conta('Inter')).map((l) => l.categoriaId)).toEqual([lazer])
  })
})
