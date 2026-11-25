// O saldo da conta importada precisa bater com o banco mesmo quando ainda não há cartões cadastrados,
// e salvar a conta marca a hora em que o saldo foi conferido. Dados FICTÍCIOS.
import { describe, it, expect, beforeEach } from 'vitest'
import { lerConsolidado, juntarExtratos } from '../src/lib/santander.js'
import { prepararImportacao, executarImportacao, conferirSaldo, novoCartao, diasEstimados } from '../src/lib/importacao.js'
import { saldoConta } from '../src/lib/calculos.js'
import { salvarConta, salvarCartao } from '../src/lib/cadastros.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'
import { consolidado } from './exemplos-santander.js'

const EU = 'FULANO DE TAL SOUZA'
const extrato = () => juntarExtratos([lerConsolidado(consolidado({
  mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 100000,
  lancamentos: [
    { data: '01/09', desc: 'DEBITO AUT. FAT.CARTAO MASTER CARD', desc2: 'FINAL 1234', valor: -80000 },
    { data: '05/09', desc: 'CREDITO DE SALARIO EMPRESA', valor: 500000 },
    { data: '08/09', desc: 'PIX ENVIADO Fulano De Tal Souza da', valor: -30000 },
    { data: '17/09', desc: 'PAGAMENTO CARTAO CREDITO BCE', valor: -45000 },
    { data: '20/09', desc: 'COMPRA CARTAO DEB MC 19/09 PADARIA', valor: -1590 },
  ],
}))])

describe('importar sem cartões cadastrados', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const dados = async () => ({ lancamentos: await db.lancamentos.toArray(), contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() })
  const destino = () => ({ tipo: 'conta', id: b.conta('Santander') })

  it('pagamentos de fatura NÃO são ignorados: o app cria o cartão e o saldo bate com o banco', async () => {
    const ex = extrato()
    const regras = { titular: EU, contaPixProprio: b.conta('Inter'), historico: true }
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras })
    const fat = itens.filter((i) => i.grupo === 'pagamentoCartao')
    expect(fat.map((i) => [i.acao, i.cartaoPagoId, i.faturaPaga])).toEqual([
      ['fatura', novoCartao('Santander'), '2025-09'], // débito automático: cartão do próprio banco
      ['fatura', novoCartao('Inter'), '2025-09'], // outro: o outro banco das suas contas
    ])
    expect(itens.every((i) => i.acao !== 'ignorar')).toBe(true)
    const conta = await db.contas.get(b.conta('Santander'))
    expect(conferirSaldo({ extrato: ex, destino: destino(), itens, lancamentos: [], conta, saldoInicial: ex.saldoInicial.valor }).diferenca).toBe(0)

    await executarImportacao({ itens, destino: destino(), saldoInicial: ex.saldoInicial.valor })
    const L = await db.lancamentos.toArray()
    expect(saldoConta(await db.contas.get(b.conta('Santander')), L, '2025-09-30')).toBe(ex.saldo.valor)
    const cartoes = await db.cartoes.toArray()
    expect(cartoes.map((c) => [c.nome, c.diaVencimento, c.diaFechamento])).toEqual([['Santander', 1, 24], ['Inter', 17, 10]])
    expect(L.filter((l) => l.tipo === 'pagamentoFatura').map((l) => cartoes.find((c) => c.id === l.cartaoId).nome)).toEqual(['Santander', 'Inter'])
    // importar de novo: não cria outro cartão nem repete pagamento
    const de_novo = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras })
    expect(de_novo.resumo.novos).toBe(0)
  })

  it('dá para escolher "não é fatura": vira gasto (e o saldo continua batendo)', async () => {
    const ex = extrato()
    const regras = { titular: EU, contaPixProprio: b.conta('Inter'), historico: true, cartaoPorPagamento: { 'PAGAMENTO CARTAO CREDITO BCE': null } }
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras })
    expect(itens.find((i) => /BCE/.test(i.descricao))).toMatchObject({ acao: 'lancar', tipo: 'despesa' })
    const conta = await db.contas.get(b.conta('Santander'))
    expect(conferirSaldo({ extrato: ex, destino: destino(), itens, lancamentos: [], conta, saldoInicial: ex.saldoInicial.valor }).diferenca).toBe(0)
  })

  it('com cartão cadastrado, continua usando o cartão existente', async () => {
    await salvarCartao({ nome: 'Santander', limite: 0, diaFechamento: 3, diaVencimento: 10, contaPagamentoId: b.conta('Santander') })
    const { itens } = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras: { titular: EU, historico: true } })
    const sant = (await db.cartoes.toArray())[0].id
    expect(itens.filter((i) => i.grupo === 'pagamentoCartao').every((i) => i.cartaoPagoId === sant)).toBe(true)
  })

  it('vários pagamentos do mesmo cartão novo: o cartão é criado uma vez só', async () => {
    const ex = juntarExtratos([lerConsolidado(consolidado({
      mes: 'setembro', ano: 2025, dataAnterior: '31/08', dataFinal: '30/09', saldoAnterior: 100000,
      lancamentos: [
        { data: '02/09', desc: 'PAGAMENTO CARTAO CREDITO BCE', valor: -10000 },
        { data: '17/09', desc: 'PAGAMENTO CARTAO CREDITO BCE', valor: -20000 },
        { data: '18/09', desc: 'PAGAMENTO CARTAO CREDITO BCE', valor: -30000 },
      ],
    }))])
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: { titular: EU, historico: true } })
    await executarImportacao({ itens, destino: destino() })
    const cartoes = await db.cartoes.toArray()
    expect(cartoes.length).toBe(1)
    expect((await db.lancamentos.toArray()).every((l) => l.cartaoId === cartoes[0].id)).toBe(true)
  })

  it('tudo ou nada: com erro, o cartão novo não fica criado', async () => {
    const { itens } = prepararImportacao({ extrato: extrato(), destino: destino(), dados: await dados(), regras: { titular: EU, contaPixProprio: b.conta('Inter'), historico: true } })
    const ruim = itens.map((i) => (/PADARIA/.test(i.descricao) ? { ...i, categoriaId: b.cat('receita', 'Salário') } : i))
    await expect(executarImportacao({ itens: ruim, destino: destino() })).rejects.toThrow('Linha')
    expect(await db.cartoes.count()).toBe(0)
    expect(await db.lancamentos.count()).toBe(0)
  })

  it('dias estimados: vence no dia mais comum dos pagamentos e fecha 7 dias antes', () => {
    expect(diasEstimados(['2025-01-17', '2025-02-17', '2025-03-18'])).toEqual({ diaVencimento: 17, diaFechamento: 10 })
    expect(diasEstimados(['2025-01-01', '2025-02-02', '2025-03-01'])).toEqual({ diaVencimento: 1, diaFechamento: 24 })
    expect(diasEstimados(['2025-01-05', '2025-02-20'])).toEqual({ diaVencimento: 5, diaFechamento: 28 }) // empate: o menor dia
    expect(diasEstimados(['2025-02-20', '2025-01-05'])).toEqual({ diaVencimento: 5, diaFechamento: 28 }) // em qualquer ordem
    expect(diasEstimados([])).toEqual({ diaVencimento: 10, diaFechamento: 3 })
  })
})

describe('saldo conferido', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })

  it('salvar a conta com o saldo marca a hora da conferência', async () => {
    await salvarConta({ id: b.conta('Inter'), nome: 'Inter', emoji: '🟠', saldoAtual: 12345 })
    expect((await db.contas.get(b.conta('Inter'))).saldoConferidoEm).toBeGreaterThan(0)
  })
})
