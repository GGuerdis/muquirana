import { describe, it, expect, beforeEach } from 'vitest'
import { db, exportarBackup, restaurarBackup } from '../src/lib/db.js'
import { lerOFX, decodificarArquivo } from '../src/lib/ofx.js'
import { prepararImportacao, executarImportacao, conferirSaldo, problemaDoItem } from '../src/lib/importacao.js'
import { salvarLancamento, formDoLancamento } from '../src/lib/lancamentos.js'
import { salvarCartao } from '../src/lib/cadastros.js'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { resumoFatura } from '../src/lib/fatura.js'
import { bancoNovo } from './ajuda.js'
import { OFX_SGML_CONTA, OFX_XML_CONTA, OFX_CARTAO, emWindows1252 } from './exemplos-ofx.js'

let b, cartao
beforeEach(async () => {
  b = await bancoNovo()
  await salvarCartao({ nome: 'Inter', limite: 0, diaFechamento: 3, diaVencimento: 10 })
  cartao = (await db.cartoes.toArray())[0]
})

const dados = async () => ({
  lancamentos: await db.lancamentos.toArray(),
  contas: await db.contas.toArray(),
  cartoes: await db.cartoes.toArray(),
  categorias: await db.categorias.toArray(),
})
const extratoSantander = () => lerOFX(decodificarArquivo(emWindows1252(OFX_SGML_CONTA)))
const preparar = async (extrato, destino, faturaCartao) => prepararImportacao({ extrato, destino, faturaCartao, dados: await dados() })
const comprar = (data, valor, extra = {}) => salvarLancamento({ tipo: 'despesa', valor, categoriaId: b.cat('despesa', 'Compras'), contaId: null, cartaoId: cartao.id, data, parcelas: 1, ...extra })

describe('importar extrato de conta', () => {
  it('prévia: receita, despesa, pagamento de fatura reconhecido e duplicado de lançamento manual', async () => {
    const santander = b.conta('Santander')
    await comprar('2026-10-20', 150000) // fatura de novembro (vence 10/nov)
    await salvarLancamento({ tipo: 'despesa', valor: 4590, categoriaId: b.cat('despesa', 'Alimentação'), contaId: santander, cartaoId: null, data: '2026-11-07', parcelas: 1 })

    const { itens, resumo } = await preparar(extratoSantander(), { tipo: 'conta', id: santander })
    expect(resumo).toEqual({ total: 4, novos: 3, importados: 0, duplicados: 1, creditos: 0 })
    const [salario, padaria, fatura, pix] = itens
    expect(salario).toMatchObject({ entrada: true, tipo: 'receita', acao: 'lancar', valor: 500000, categoriaId: b.cat('receita', 'Outros') })
    expect(padaria).toMatchObject({ situacao: 'duplicado', acao: 'ignorar' })
    expect(fatura).toMatchObject({ acao: 'fatura', cartaoPagoId: cartao.id, faturaPaga: '2026-11', valor: 150000 })
    expect(pix).toMatchObject({ acao: 'lancar', tipo: 'despesa', valor: 20000, categoriaId: b.cat('despesa', 'Outros') })
  })

  it('importa, confere o saldo com o banco e não duplica ao importar de novo', async () => {
    const santander = b.conta('Santander')
    await comprar('2026-10-20', 150000)
    const extrato = extratoSantander()
    const { itens } = await preparar(extrato, { tipo: 'conta', id: santander })
    const conta = await db.contas.get(santander)
    // saldo inicial 0 + 5000 - 45,90 - 1500 - 200 = 3254,10, exatamente o saldo do extrato
    expect(conferirSaldo({ extrato, destino: { tipo: 'conta', id: santander }, itens, lancamentos: await db.lancamentos.toArray(), conta }))
      .toEqual({ data: '2026-11-20', noExtrato: 325410, noApp: 325410, diferenca: 0 })

    expect(await executarImportacao({ itens, destino: { tipo: 'conta', id: santander } })).toBe(4)
    const L = await db.lancamentos.toArray()
    expect(saldoConta(conta, L, '2026-11-20')).toBe(325410)
    expect(resumoFatura(cartao, '2026-11', L).status).toBe('paga')
    expect(L.filter((l) => l.idExterno).length).toBe(4)
    expect(resumoMes('2026-11', L)).toMatchObject({ entrou: 500000, saiu: 4590 + 20000 }) // pagamento de fatura não é gasto

    // De novo o mesmo arquivo: tudo já importado
    const segunda = await preparar(extrato, { tipo: 'conta', id: santander })
    expect(segunda.resumo).toMatchObject({ novos: 0, importados: 4 })
    expect(await executarImportacao({ itens: segunda.itens, destino: { tipo: 'conta', id: santander } })).toBe(0)
    expect(await db.lancamentos.count()).toBe(L.length)
  })

  it('o mesmo arquivo importado em outra conta é tratado como outro extrato', async () => {
    const { itens } = await preparar(extratoSantander(), { tipo: 'conta', id: b.conta('Santander') })
    await executarImportacao({ itens: itens.map((i) => (i.acao === 'fatura' ? { ...i, acao: 'ignorar' } : i)), destino: { tipo: 'conta', id: b.conta('Santander') } })
    const outra = await preparar(extratoSantander(), { tipo: 'conta', id: b.conta('Inter') })
    expect(outra.resumo.importados).toBe(0)
  })

  it('toque duplo em importar não duplica nada', async () => {
    const destino = { tipo: 'conta', id: b.conta('Inter') }
    const ex = lerOFX(OFX_XML_CONTA)
    const { itens } = await preparar(ex, destino)
    const [a, c] = await Promise.allSettled([executarImportacao({ itens, destino }), executarImportacao({ itens, destino })])
    expect([a.status, c.status].sort()).toEqual(['fulfilled', 'rejected'])
    expect(await db.lancamentos.count()).toBe(3)
  })

  it('duas linhas iguais no extrato (mesmo valor e dia) viram dois lançamentos', async () => {
    const destino = { tipo: 'conta', id: b.conta('Inter') }
    const { itens } = await preparar(lerOFX(OFX_XML_CONTA), destino)
    expect(itens.filter((i) => i.valor === 3250 && i.situacao === 'novo').length).toBe(2)
    await executarImportacao({ itens, destino })
    expect((await db.lancamentos.toArray()).filter((l) => l.valor === 3250).length).toBe(2)
  })

  it('cada lançamento manual só "casa" com uma linha do extrato', async () => {
    const inter = b.conta('Inter')
    await salvarLancamento({ tipo: 'despesa', valor: 3250, categoriaId: b.cat('despesa', 'Transporte'), contaId: inter, cartaoId: null, data: '2026-11-03', parcelas: 1 })
    const { resumo } = await preparar(lerOFX(OFX_XML_CONTA), { tipo: 'conta', id: inter })
    expect(resumo).toMatchObject({ duplicados: 1, novos: 2 })
  })

  it('transferência entre minhas contas: sai de uma, entra na outra, não conta como gasto', async () => {
    const santander = b.conta('Santander'), inter = b.conta('Inter')
    const { itens } = await preparar(extratoSantander(), { tipo: 'conta', id: santander })
    const ajustados = itens.map((i) => (i.valor === 20000 ? { ...i, acao: 'transferencia', contaOutraId: inter } : i.acao === 'fatura' ? { ...i, acao: 'ignorar' } : i))
    await executarImportacao({ itens: ajustados, destino: { tipo: 'conta', id: santander } })
    const L = await db.lancamentos.toArray()
    expect(saldoConta(await db.contas.get(inter), L, '2026-11-20')).toBe(20000)
    expect(resumoMes('2026-11', L).saiu).toBe(4590)
  })

  it('tudo ou nada: se uma linha estiver errada, nenhuma é gravada', async () => {
    const destino = { tipo: 'conta', id: b.conta('Santander') }
    const { itens } = await preparar(extratoSantander(), destino)
    const ruins = itens.map((i) => (i.valor === 20000 ? { ...i, acao: 'transferencia', contaOutraId: null } : i))
    expect(problemaDoItem(ruins[3], destino)).toMatch(/outra conta/)
    await expect(executarImportacao({ itens: ruins, destino })).rejects.toThrow('Linha 4')
    // erro só descoberto na gravação (fatura já quitada por fora): também desfaz tudo
    const pagaPorFora = itens.map((i) => (i.posicao === 3 ? { ...i, acao: 'fatura', cartaoPagoId: cartao.id, faturaPaga: '2026-11' } : i))
    expect(problemaDoItem(pagaPorFora[2], destino)).toBeNull() // a prévia não vê problema; só o banco descobre
    await expect(executarImportacao({ itens: pagaPorFora, destino })).rejects.toThrow('Linha 3')
    expect(await db.lancamentos.count()).toBe(0)
  })

  it('pagamento de fatura sem fatura em aberto vem marcado para ignorar, com aviso', async () => {
    const { itens } = await preparar(extratoSantander(), { tipo: 'conta', id: b.conta('Santander') })
    expect(itens[2]).toMatchObject({ acao: 'ignorar', motivo: expect.stringContaining('não há fatura') })
  })
})

describe('importar fatura de cartão', () => {
  const destino = () => ({ tipo: 'cartao', id: cartao.id })

  it('compras vão para a fatura escolhida; créditos ficam de fora; parcela antiga ganha a data certa', async () => {
    const { itens, resumo } = await preparar(lerOFX(OFX_CARTAO), destino(), '2026-11')
    expect(resumo).toEqual({ total: 5, novos: 4, importados: 0, duplicados: 0, creditos: 1 })
    const parcela = itens.find((i) => i.parcela)
    expect(parcela).toMatchObject({ parcela: { parcela: 4, total: 10 }, data: '2026-07-20', dataLancamento: '2026-10-20' })
    expect(itens.find((i) => i.entrada)).toMatchObject({ situacao: 'credito', acao: 'ignorar' })
    // as duas linhas iguais sem FITID recebem identificadores diferentes
    const cafes = itens.filter((i) => i.descricao === 'CAFE SEM ID')
    expect(cafes[0].idExterno).not.toBe(cafes[1].idExterno)

    expect(await executarImportacao({ itens, destino: destino(), faturaCartao: '2026-11' })).toBe(4)
    const L = await db.lancamentos.toArray()
    expect(L.every((l) => l.fatura === '2026-11' && l.faturaFixa === true && l.cartaoId === cartao.id && l.contaId === null)).toBe(true)
    expect(resumoFatura(cartao, '2026-11', L).total).toBe(8990 + 30000 + 1500 + 1500)

    const de_novo = await preparar(lerOFX(OFX_CARTAO), destino(), '2026-11')
    expect(de_novo.resumo).toMatchObject({ novos: 0, importados: 4 })
  })

  it('parcela que já existe como compra parcelada manual é reconhecida', async () => {
    await comprar('2026-07-20', 300000, { parcelas: 10, descricao: 'Magazine' }) // 4ª parcela cai na fatura de novembro
    const { itens } = await preparar(lerOFX(OFX_CARTAO), destino(), '2026-11')
    expect(itens.find((i) => i.parcela)).toMatchObject({ situacao: 'duplicado', acao: 'ignorar' })
  })

  it('mudar os dias do cartão não tira compras importadas da fatura do banco', async () => {
    const { itens } = await preparar(lerOFX(OFX_CARTAO), destino(), '2026-12')
    await executarImportacao({ itens, destino: destino(), faturaCartao: '2026-12' })
    await salvarCartao({ ...cartao, diaFechamento: 25, diaVencimento: 5 }, '2026-11-20')
    expect((await db.lancamentos.toArray()).every((l) => l.fatura === '2026-12')).toBe(true)
  })

  it('editar a descrição mantém fatura e identificador; mudar a data recalcula a fatura mas mantém o identificador', async () => {
    const { itens } = await preparar(lerOFX(OFX_CARTAO), destino(), '2026-11')
    await executarImportacao({ itens, destino: destino(), faturaCartao: '2026-11' })
    let netflix = (await db.lancamentos.toArray()).find((l) => l.descricao === 'NETFLIX.COM')
    await salvarLancamento({ ...formDoLancamento(netflix), descricao: 'Netflix' }, netflix)
    netflix = (await db.lancamentos.toArray()).find((l) => l.descricao === 'Netflix')
    expect(netflix).toMatchObject({ fatura: '2026-11', faturaFixa: true, idExterno: `cartao:${cartao.id}:f:C1` })
    await salvarLancamento({ ...formDoLancamento(netflix), data: '2026-11-25' }, netflix)
    netflix = (await db.lancamentos.toArray()).find((l) => l.descricao === 'Netflix')
    expect(netflix.fatura).toBe('2026-12')
    expect(netflix.faturaFixa).toBeUndefined()
    expect(netflix.idExterno).toBe(`cartao:${cartao.id}:f:C1`)
    // reimportar continua sem duplicar
    expect((await preparar(lerOFX(OFX_CARTAO), destino(), '2026-11')).resumo.novos).toBe(0)
  })

  it('não grava fatura fixa inválida', async () => {
    await expect(comprar('2026-11-01', 100, { faturaFixa: '2026-13' })).rejects.toThrow('fatura')
    await expect(comprar('2026-11-01', 100, { faturaFixa: '2026-11', parcelas: 2 })).rejects.toThrow('parcelada')
    expect(await db.lancamentos.count()).toBe(0)
  })
})

describe('backup com as tabelas novas', () => {
  it('backup de antes da Fase 2 (sem as tabelas novas) ainda restaura', async () => {
    await salvarLancamento({ tipo: 'receita', valor: 100, categoriaId: b.cat('receita', 'Salário'), contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-01', parcelas: 1 })
    const atual = await exportarBackup()
    expect(Object.keys(atual.dados)).toEqual(expect.arrayContaining(['regras', 'recorrentes', 'orcamentos']))
    const antigo = { ...atual, versao: 1, dados: { ...atual.dados } }
    delete antigo.dados.regras
    delete antigo.dados.recorrentes
    delete antigo.dados.orcamentos
    await restaurarBackup(JSON.parse(JSON.stringify(antigo)))
    expect(await db.lancamentos.count()).toBe(1)
    expect(await db.regras.count()).toBe(0)
  })
})
