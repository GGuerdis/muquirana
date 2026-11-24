import { describe, it, expect, beforeEach } from 'vitest'
import { reconhecerInter, lerExtratoInter, limparDescricaoInter } from '../src/lib/inter.js'
import { juntarExtratos, reconhecerSantander } from '../src/lib/santander.js'
import { prepararImportacao, executarImportacao, conferirSaldo, podeDefinirSaldoInicial } from '../src/lib/importacao.js'
import { salvarLancamento } from '../src/lib/lancamentos.js'
import { saldoConta } from '../src/lib/calculos.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'
import { extratoInter } from './exemplos-inter.js'

const EU = 'FULANO DE TAL SOUZA'
const pix = (valor, nome = 'Fulano De Tal Souza Da') => ({ tipo: valor < 0 ? 'Pix enviado' : 'Pix recebido', detalhe: `${valor < 0 ? 'Pix enviado' : 'Pix recebido'}: ${nome}`, valor })
const compra = (valor, loja) => ({ tipo: 'Compra no debito', detalhe: `No estabelecimento ${loja} SAO PAULO BRA`, valor })

// Ano fictício: abre a conta em março, recebe de si mesmo, compra, aplica e resgata, paga fatura.
const DIAS_2023 = [
  { data: '2023-03-08', lancamentos: [pix(150000), pix(2500)] },
  { data: '2023-03-09', lancamentos: [{ tipo: 'Pix enviado', detalhe: 'Pix enviado |- Ciclana Exemplo', valor: -20000 }, compra(-4550, 'PADARIA EXEMPLO')] },
  { data: '2023-03-10', lancamentos: [{ tipo: 'Aplicacao Poupanca', detalhe: 'Aplicacao Poupanca - null', valor: -100000 }] },
  { data: '2023-03-22', lancamentos: [{ tipo: 'Resgate Poupanca', detalhe: 'Resgate Poupanca - null', valor: 50000 }, { tipo: 'Debito Tesouro Direto', detalhe: 'Debito Tesouro Direto - Compra Td 111', valor: -13002 }] },
  { data: '2023-04-04', lancamentos: [{ tipo: 'Pagamento efetuado', detalhe: 'Pagamento efetuado fatura cartao Inter', valor: -340 }, { tipo: 'Seguro', detalhe: 'Pagamento CARTAO_PROTEGIDO', valor: -340 }] },
  { data: '2023-05-03', lancamentos: [{ tipo: 'Salario recebido - Portabilidade', detalhe: '999 0000 000000 FULANO DE TAL SOUZA', valor: 250000 }, { tipo: 'Compra Meio De Transporte', detalhe: 'No estabelecimento ONIBUS EXEMPLO S.A*Descripti SAO PAUL', valor: -480 }] },
  { data: '2023-12-30', lancamentos: [pix(-5000), { tipo: 'Estorno', detalhe: 'Estorno no estabelecimento nao informado', valor: 4550 }] },
]
const ano2023 = (extra = {}) => lerExtratoInter(extratoInter({ dias: DIAS_2023, porPagina: 7, ...extra }))
const ano2024 = (saldoAntes) => lerExtratoInter(extratoInter({ inicio: '2024-01-01', fim: '2024-12-31', saldoAntes, dias: [
  { data: '2024-04-01', lancamentos: [pix(30000)] },
  { data: '2024-04-02', lancamentos: [compra(-1000, 'MERCADO EXEMPLO')] },
] }))

describe('ler o extrato em PDF do Inter', () => {
  it('reconhece o PDF do Inter (e não confunde com o Santander)', () => {
    const linhas = extratoInter({ dias: DIAS_2023 })
    expect(reconhecerInter(linhas)).toBe(true)
    expect(reconhecerSantander(linhas)).toBeNull()
    expect(reconhecerInter([{ pagina: 1, y: 800, itens: [{ x: 30, s: 'EXTRATO DE CONTA' }] }])).toBe(false)
  })

  it('lê todos os lançamentos, na ordem, conferindo cada saldo com o do banco', () => {
    const e = ano2023()
    expect(e.conferencia).toEqual({ ok: true, erros: [], saldosConferidos: 13 })
    expect(e).toMatchObject({ banco: '077', titular: EU, conta: '00019-123456789', inicio: '2023-01-01', fim: '2023-12-31', saldoInicial: 0 })
    expect(e.saldoFinal).toBe(DIAS_2023.flatMap((d) => d.lancamentos).reduce((s, x) => s + x.valor, 0))
    expect(e.transacoes.map((t) => [t.data, t.valor])).toEqual(DIAS_2023.flatMap((d) => d.lancamentos.map((x) => [d.data, x.valor])))
    expect(e.transacoes.map((t) => t.posicao)).toEqual(e.transacoes.map((_, i) => i + 1))
  })

  it('o saldo inicial vem do primeiro lançamento (conta que já tinha dinheiro)', () => {
    const e = lerExtratoInter(extratoInter({ saldoAntes: 98765, dias: DIAS_2023 }))
    expect(e.conferencia.ok).toBe(true)
    expect(e.saldoInicial).toBe(98765)
  })

  it('descrições limpas: loja na compra, nome no PIX, sem "null"', () => {
    const d = ano2023().transacoes.map((t) => t.descricao)
    expect(d).toEqual([
      'Pix recebido Fulano De Tal Souza Da', 'Pix recebido Fulano De Tal Souza Da',
      'Pix enviado Ciclana Exemplo', 'PADARIA EXEMPLO SAO PAULO',
      'Aplicacao Poupanca',
      'Resgate Poupanca', 'Debito Tesouro Direto Compra Td 111',
      'Pagamento efetuado fatura cartao Inter', 'Seguro CARTAO PROTEGIDO',
      'Salario recebido - Portabilidade', 'ONIBUS EXEMPLO S.A SAO PAUL',
      'Pix enviado Fulano De Tal Souza Da', 'Estorno no estabelecimento nao informado',
    ])
    expect(limparDescricaoInter('Pix enviado: "Cp :123-LOJA"')).toBe('Pix enviado Cp :123-LOJA')
    expect(limparDescricaoInter('sem formato')).toBe('sem formato')
  })

  it('recusa se um saldo não bate (lançamento ou saldo do dia)', () => {
    const a = ano2023({ estragar: { saldoLanc: 4 } })
    expect(a.conferencia.ok).toBe(false)
    expect(a.conferencia.erros[0]).toMatch(/09\/03\/2023.*saldo/)
    const b = ano2023({ estragar: { saldoDia: '2023-05-03' } })
    expect(b.conferencia.ok).toBe(false)
    expect(b.conferencia.erros.join(' ')).toMatch(/03\/05\/2023: saldo do dia/)
  })

  it('período sem nenhuma movimentação: lê vazio, sem inventar saldo', () => {
    const e = lerExtratoInter(extratoInter({ dias: [] }))
    expect(e.transacoes).toEqual([])
    expect(e.saldoInicial).toBeNull()
    expect(() => lerExtratoInter([{ pagina: 1, y: 1, itens: [{ x: 1, s: 'nada' }] }])).toThrow('período')
  })

  it('vários anos juntos: emendam pelo saldo e viram um extrato do Inter', () => {
    const a = ano2023()
    const j = juntarExtratos([ano2024(a.saldoFinal), a], { banco: '077' })
    expect(j.conferencia).toEqual({ ok: true, erros: [] })
    expect(j).toMatchObject({ origem: 'pdf-inter', banco: '077', inicio: '2023-01-01', fim: '2024-12-31', saldoInicial: { valor: 0, data: '2022-12-31' } })
    expect(j.saldo.valor).toBe(a.saldoFinal + 29000)
    expect(j.transacoes).toHaveLength(15)
    // ano que não emenda no saldo do anterior
    const torto = juntarExtratos([a, ano2024(a.saldoFinal + 1)], { banco: '077' })
    expect(torto.conferencia.ok).toBe(false)
    expect(torto.conferencia.erros[0]).toMatch(/começa com/)
    // ano faltando
    const buraco = juntarExtratos([a, lerExtratoInter(extratoInter({ inicio: '2025-01-01', fim: '2025-12-31', saldoAntes: a.saldoFinal, dias: [{ data: '2025-02-01', lancamentos: [pix(100)] }] }))], { banco: '077' })
    expect(buraco.conferencia.erros[0]).toMatch(/Falta extrato/)
  })
})

describe('importar o PDF do Inter', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const dados = async () => ({ lancamentos: await db.lancamentos.toArray(), contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() })
  const destino = () => ({ tipo: 'conta', id: b.conta('Inter') })

  it('PIX com o seu nome, investimento, fatura e seguro: cada um no lugar certo', async () => {
    const ex = juntarExtratos([ano2023()], { banco: '077' })
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: { titular: EU, contaPixProprio: b.conta('Santander'), contaInvestimentos: b.conta('Carteira'), historico: true } })
    const por = (re) => itens.find((i) => re.test(i.descricao))
    expect(itens.filter((i) => i.grupo === 'pixProprio')).toHaveLength(3)
    expect(por(/Ciclana/)).toMatchObject({ acao: 'lancar', tipo: 'despesa' }) // PIX para outra pessoa: gasto
    expect(itens.filter((i) => i.grupo === 'investimento').map((i) => i.acao)).toEqual(['transferencia', 'transferencia', 'transferencia']) // poupança e Tesouro
    expect(por(/fatura cartao/)).toMatchObject({ grupo: 'pagamentoCartao' })
    expect(por(/Seguro/)).toMatchObject({ grupo: null, acao: 'lancar', tipo: 'despesa' }) // "Pagamento CARTAO_PROTEGIDO" não é fatura
    expect(por(/Salario/)).toMatchObject({ grupo: null, tipo: 'receita' }) // tem o seu nome, mas não é PIX
  })

  it('PIX com o seu nome de antes da outra conta começar no app não vira transferência (não mexe no saldo dela)', async () => {
    await salvarLancamento({ tipo: 'despesa', valor: 1000, categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Santander'), cartaoId: null, data: '2023-06-01', parcelas: 1 })
    const ex = juntarExtratos([ano2023()], { banco: '077' })
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: { titular: EU, contaPixProprio: b.conta('Santander'), historico: true } })
    const proprios = itens.filter((i) => i.grupo === 'pixProprio')
    expect(proprios.map((i) => [i.data, i.acao])).toEqual([['2023-03-08', 'lancar'], ['2023-03-08', 'lancar'], ['2023-12-30', 'transferencia']])
    expect(proprios[0].motivo).toMatch(/antes de Santander começar/)
    expect(proprios[0]).toMatchObject({ tipo: 'receita' })
  })

  it('não duplica o PIX que já veio do extrato do Santander, e o saldo do Inter fecha com o banco', async () => {
    const a = ano2023()
    const ex = juntarExtratos([a, ano2024(a.saldoFinal)], { banco: '077' })
    // já importado pelo lado do Santander: transferência Santander → Inter em 01/04/2024
    await salvarLancamento({ tipo: 'transferencia', valor: 30000, contaId: b.conta('Santander'), contaDestinoId: b.conta('Inter'), data: '2024-04-01', parcelas: 1 })
    await db.contas.update(b.conta('Inter'), { saldoInicial: -777 }) // saldo acertado "na mão" antes
    const regras = { titular: EU, contaPixProprio: b.conta('Santander'), contaInvestimentos: b.conta('Carteira'), historico: true }
    const { itens, resumo } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras })
    expect(resumo.duplicados).toBe(1)
    expect(itens.find((i) => i.situacao === 'duplicado')).toMatchObject({ data: '2024-04-01', valor: 30000 })
    const L = await db.lancamentos.toArray()
    expect(podeDefinirSaldoInicial({ extrato: ex, destino: destino(), lancamentos: L })).toBe(true)
    const conta = await db.contas.get(b.conta('Inter'))
    expect(conferirSaldo({ extrato: ex, destino: destino(), itens, lancamentos: L, conta, saldoInicial: ex.saldoInicial.valor }).diferenca).toBe(0)

    await executarImportacao({ itens, destino: destino(), saldoInicial: ex.saldoInicial.valor })
    const depois = await db.lancamentos.toArray()
    expect(saldoConta(await db.contas.get(b.conta('Inter')), depois, '2024-12-31')).toBe(ex.saldo.valor)
    // importar de novo não repete nada
    expect(prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras }).resumo.novos).toBe(0)
  })
})

describe('Inter: casos achados nos extratos reais (com dados inventados)', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const dados = async () => ({ lancamentos: await db.lancamentos.toArray(), contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await db.categorias.toArray() })
  const destino = () => ({ tipo: 'conta', id: b.conta('Inter') })
  const regras = () => ({ titular: EU, contaPixProprio: b.conta('Santander'), historico: true })
  const ler = (dias) => juntarExtratos([lerExtratoInter(extratoInter({ inicio: '2024-01-01', fim: '2024-12-31', dias }))], { banco: '077' })
  const doSantander = (valor) => ({ tipo: 'Pix recebido', detalhe: `Cp :90400888-FULANO DE TAL SOUZA`, valor })

  it('lê linhas sem o formato "Tipo: detalhe" (o saldo continua batendo)', () => {
    const e = lerExtratoInter(extratoInter({ inicio: '2024-01-01', fim: '2024-12-31', dias: [
      { data: '2024-10-03', lancamentos: [{ tipo: 'Resgate Poupanca Transacao sem descricao', semFormato: true, valor: 7871 }, { tipo: 'Pagamento efetuado', detalhe: 'Pagamento fatura cartao Inter', valor: -7000 }] },
      { data: '2024-10-04', lancamentos: [{ tipo: 'Est. Pgto Fatura Em Atraso', semFormato: true, valor: 500 }] },
    ] }))
    expect(e.conferencia.ok).toBe(true)
    expect(e.transacoes.map((t) => t.descricao)).toEqual(['Resgate Poupanca', 'Pagamento efetuado Pagamento fatura cartao Inter', 'Est. Pgto Fatura Em Atraso'])
  })

  it('PIX mostra o banco da outra ponta ("Cp :ISPB-Nome"): Santander vira transferência; outro banco, conta daquele banco', async () => {
    const ex = ler([{ data: '2024-05-02', lancamentos: [doSantander(10000), { tipo: 'Pix enviado', detalhe: 'Cp :60701190-Fulano De Tal Souza', valor: -4000 }, { tipo: 'Pix enviado', detalhe: 'Cp :60701190-Loja Exemplo', valor: -1000 }] }])
    expect(ex.transacoes.map((t) => [t.descricao, t.destino?.banco])).toEqual([['Pix recebido FULANO DE TAL SOUZA', '033'], ['Pix enviado Fulano De Tal Souza', '341'], ['Pix enviado Loja Exemplo', '341']])
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: regras() })
    expect(itens.map((i) => [i.acao, i.contaOutraId])).toEqual([['transferencia', b.conta('Santander')], ['transferencia', '__nova_conta__:Itaú'], ['lancar', null]])
    // escolhendo "não é transferência" para o Itaú
    const r2 = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: { ...regras(), contaPorPix: { 341: null } } })
    expect(r2.itens[1]).toMatchObject({ acao: 'lancar', tipo: 'despesa' })
  })

  it('PIX do fim de semana: no Inter na sexta, no Santander na segunda → é o mesmo, não duplica', async () => {
    await salvarLancamento({ tipo: 'transferencia', valor: 40000, contaId: b.conta('Santander'), contaDestinoId: b.conta('Inter'), data: '2024-04-01', parcelas: 1 })
    const { itens } = prepararImportacao({ extrato: ler([{ data: '2024-03-29', lancamentos: [doSantander(40000)] }]), destino: destino(), dados: await dados(), regras: regras() })
    expect(itens[0]).toMatchObject({ situacao: 'duplicado', acao: 'ignorar' })
    // gasto comum (não transferência) com 3 dias de diferença continua sendo outro lançamento
    await salvarLancamento({ tipo: 'despesa', valor: 777, categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Inter'), cartaoId: null, data: '2024-06-04', parcelas: 1 })
    const r2 = prepararImportacao({ extrato: ler([{ data: '2024-06-01', lancamentos: [compra(-777, 'LOJA')] }]), destino: destino(), dados: await dados(), regras: regras() })
    expect(r2.itens[0].situacao).toBe('novo')
  })

  it('o PIX já estava no Santander como gasto: vira a transferência (sem criar outra) e os dois saldos ficam certos', async () => {
    const santander = b.conta('Santander')
    await salvarLancamento({ tipo: 'despesa', valor: 5000, descricao: 'PIX ENVIADO Ciclano Outro', categoriaId: b.cat('despesa', 'Outros'), contaId: santander, cartaoId: null, data: '2024-11-23', parcelas: 1 }) // o de outra pessoa vem primeiro (mesmo valor e dia)
    await salvarLancamento({ tipo: 'despesa', valor: 5000, descricao: 'PIX ENVIADO Fulano De Tal Souza', categoriaId: b.cat('despesa', 'Outros'), contaId: santander, cartaoId: null, data: '2024-11-23', parcelas: 1 })
    const antes = await db.lancamentos.toArray()
    const saldoSantander = saldoConta(await db.contas.get(santander), antes, '2024-12-31')
    const ex = ler([{ data: '2024-11-23', lancamentos: [doSantander(5000)] }])
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: regras() })
    const proprio = antes.find((l) => /Fulano/.test(l.descricao))
    expect(itens[0]).toMatchObject({ acao: 'transferencia', contaOutraId: santander, converterId: proprio.id }) // nunca o PIX para outra pessoa
    expect(itens[0].motivo).toMatch(/Já estava em Santander como gasto/)

    await executarImportacao({ itens, destino: destino(), saldoInicial: ex.saldoInicial.valor })
    const depois = await db.lancamentos.toArray()
    expect(depois).toHaveLength(antes.length) // nada novo: o gasto virou a transferência
    expect(depois.find((l) => l.id === proprio.id)).toMatchObject({ tipo: 'transferencia', contaId: santander, contaDestinoId: b.conta('Inter'), categoriaId: null })
    expect(saldoConta(await db.contas.get(santander), depois, '2024-12-31')).toBe(saldoSantander)
    expect(saldoConta(await db.contas.get(b.conta('Inter')), depois, '2024-12-31')).toBe(ex.saldo.valor)
    expect(prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: regras() }).resumo.novos).toBe(0)
  })

  it('se na prévia a linha deixa de ser transferência com aquela conta, não mexe no lançamento de lá', async () => {
    const santander = b.conta('Santander')
    await salvarLancamento({ tipo: 'despesa', valor: 5000, descricao: 'PIX ENVIADO Fulano De Tal Souza', categoriaId: b.cat('despesa', 'Outros'), contaId: santander, cartaoId: null, data: '2024-11-23', parcelas: 1 })
    const ex = ler([{ data: '2024-11-23', lancamentos: [doSantander(5000)] }])
    const { itens } = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: regras() })
    await executarImportacao({ itens: [{ ...itens[0], acao: 'lancar' }], destino: destino() })
    const L = await db.lancamentos.toArray()
    expect(L.map((l) => [l.tipo, l.contaId === santander ? 'Santander' : 'Inter']).sort()).toEqual([['despesa', 'Santander'], ['receita', 'Inter']])
    // ou continua transferência, mas com outra conta
    await db.lancamentos.clear()
    await salvarLancamento({ tipo: 'despesa', valor: 5000, descricao: 'PIX ENVIADO Fulano De Tal Souza', categoriaId: b.cat('despesa', 'Outros'), contaId: santander, cartaoId: null, data: '2024-11-23', parcelas: 1 })
    const r2 = prepararImportacao({ extrato: ex, destino: destino(), dados: await dados(), regras: regras() })
    await executarImportacao({ itens: [{ ...r2.itens[0], contaOutraId: b.conta('Carteira') }], destino: destino() })
    const L2 = await db.lancamentos.toArray()
    expect(L2.filter((l) => l.contaId === santander).map((l) => l.tipo)).toEqual(['despesa'])
    expect(L2.filter((l) => l.tipo === 'transferencia').map((l) => l.contaId === b.conta('Carteira'))).toEqual([true])
  })
})
