// Quem já usa o app (banco antigo, só no aparelho, ids numéricos) não pode perder nada ao atualizar
import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { db, migrarBancoAntigo, NOME_BANCO_ANTIGO, restaurarBackup } from '../src/lib/db.js'
import { saldoConta, resumoMes } from '../src/lib/calculos.js'
import { resumoFatura } from '../src/lib/fatura.js'
import { lerOFX } from '../src/lib/ofx.js'
import { prepararImportacao } from '../src/lib/importacao.js'
import { contasDoMes } from '../src/lib/recorrentes.js'
import { orcamentoDoMes } from '../src/lib/orcamento.js'
import { fotografia, fotografiaDe } from './ajuda.js'
import { OFX_CARTAO } from './exemplos-ofx.js'

const TABELAS = ['contas', 'cartoes', 'categorias', 'lancamentos', 'regras', 'recorrentes', 'orcamentos', 'config']

function bancoAntigo() {
  const antigo = new Dexie(NOME_BANCO_ANTIGO)
  antigo.version(1).stores({ contas: '++id, nome', cartoes: '++id, nome', categorias: '++id, tipo, nome', lancamentos: '++id, data, tipo, contaId, cartaoId, fatura, categoriaId, grupoParcelaId', config: 'chave' })
  antigo.version(2).stores({ lancamentos: '++id, data, tipo, contaId, cartaoId, fatura, categoriaId, grupoParcelaId, idExterno, recorrenteId', regras: '++id, &chave', recorrentes: '++id', orcamentos: 'categoriaId' })
  return antigo
}

// Dados como a versão 2 do app gravava (ids numéricos)
const DADOS_ANTIGOS = {
  contas: [
    { id: 1, nome: 'Santander', emoji: '🔴', saldoInicial: 250000 },
    { id: 2, nome: 'Inter', emoji: '🟠', saldoInicial: 80050 },
    { id: 3, nome: 'Carteira', emoji: '👛', saldoInicial: -1500 },
  ],
  categorias: [
    { id: 1, tipo: 'despesa', emoji: '🍔', nome: 'Alimentação' },
    { id: 2, tipo: 'despesa', emoji: '👕', nome: 'Compras' },
    { id: 3, tipo: 'despesa', emoji: '🏠', nome: 'Moradia' },
    { id: 14, tipo: 'receita', emoji: '💰', nome: 'Salário' },
  ],
  cartoes: [{ id: 1, nome: 'Inter', limite: 500000, diaFechamento: 3, diaVencimento: 10, contaPagamentoId: 2 }],
  recorrentes: [
    { id: 1, descricao: 'Aluguel', tipo: 'despesa', valor: 150000, dia: 10, categoriaId: 3, contaId: 1, cartaoId: null, inicio: '2026-11', fim: null, pulados: ['2026-12'] },
    { id: 2, descricao: 'Salário', tipo: 'receita', valor: 500000, dia: 5, categoriaId: 14, contaId: 2, cartaoId: null, inicio: '2026-10', fim: '2027-12', pulados: [] },
  ],
  lancamentos: [
    { id: 1, tipo: 'despesa', valor: 4590, descricao: 'Almoço', categoriaId: 1, contaId: 1, cartaoId: null, data: '2026-11-06', criadoEm: 100 },
    { id: 2, tipo: 'receita', valor: 500000, descricao: 'Salário', categoriaId: 14, contaId: 2, cartaoId: null, data: '2026-11-05', criadoEm: 101, recorrenteId: 2, competencia: '2026-11' },
    { id: 3, tipo: 'transferencia', valor: 20000, descricao: '', categoriaId: null, contaId: 1, contaDestinoId: 3, cartaoId: null, data: '2026-11-07', criadoEm: 102 },
    { id: 4, tipo: 'despesa', valor: 40000, descricao: 'Tênis', categoriaId: 2, contaId: null, cartaoId: 1, data: '2026-11-20', fatura: '2026-12', criadoEm: 103, grupoParcelaId: 'g-1', parcela: 1, totalParcelas: 3, valorTotal: 120000, dataCompra: '2026-11-20' },
    { id: 5, tipo: 'despesa', valor: 40000, descricao: 'Tênis', categoriaId: 2, contaId: null, cartaoId: 1, data: '2026-12-20', fatura: '2027-01', criadoEm: 103, grupoParcelaId: 'g-1', parcela: 2, totalParcelas: 3, valorTotal: 120000, dataCompra: '2026-11-20' },
    { id: 6, tipo: 'despesa', valor: 40000, descricao: 'Tênis', categoriaId: 2, contaId: null, cartaoId: 1, data: '2027-01-20', fatura: '2027-02', criadoEm: 103, grupoParcelaId: 'g-1', parcela: 3, totalParcelas: 3, valorTotal: 120000, dataCompra: '2026-11-20' },
    { id: 7, tipo: 'pagamentoFatura', valor: 40000, descricao: 'Pagamento de fatura', categoriaId: null, contaId: 2, cartaoId: 1, fatura: '2026-12', data: '2026-12-09', criadoEm: 104 },
    // vieram de extrato importado (o identificador inclui a conta/cartão de destino)
    { id: 8, tipo: 'despesa', valor: 8990, descricao: 'NETFLIX.COM', categoriaId: 2, contaId: null, cartaoId: 1, data: '2026-10-15', fatura: '2026-11', faturaFixa: true, idExterno: 'cartao:1:f:C1', criadoEm: 105 },
    { id: 9, tipo: 'despesa', valor: 3250, descricao: 'UBER *TRIP', categoriaId: 1, contaId: 2, cartaoId: null, data: '2026-11-03', idExterno: 'conta:2:f:INTER-A1', criadoEm: 106 },
  ],
  regras: [{ id: 1, chave: 'despesa:PADARIA ZE', padrao: 'PADARIA ZE', tipo: 'despesa', categoriaId: 1, usos: 3, atualizadoEm: 5 }],
  orcamentos: [{ categoriaId: 1, limite: 80000 }],
  config: [
    { chave: 'zoeira', valor: false },
    { chave: 'boasVindas', valor: true },
    { chave: 'ultimoBackup', valor: '2026-11-15' },
    { chave: 'ultimaOrigem', valor: 'cartao:1' },
  ],
}

async function criarBancoAntigo(dados) {
  const antigo = bancoAntigo()
  await antigo.open()
  for (const t of TABELAS) if (dados[t]?.length) await antigo.table(t).bulkAdd(dados[t])
  antigo.close()
}

// "Resultados" que o usuário vê: devem ser idênticos antes e depois
function resultados(d) {
  const saldos = Object.fromEntries(d.contas.map((c) => [c.nome, saldoConta(c, d.lancamentos, '2027-12-31')]))
  const faturas = Object.fromEntries(
    d.cartoes.flatMap((c) => ['2026-11', '2026-12', '2027-01', '2027-02'].map((f) => {
      const r = resumoFatura(c, f, d.lancamentos, '2026-11-20')
      return [`${c.nome} ${f}`, [r.total, r.pago, r.restante, r.status]]
    })),
  )
  const meses = Object.fromEntries(['2026-10', '2026-11', '2026-12', '2027-01'].map((m) => {
    const r = resumoMes(m, d.lancamentos)
    return [m, [r.entrou, r.saiu, r.categorias.length]]
  }))
  const fixasDez = contasDoMes('2026-12', d.recorrentes, d.lancamentos, '2026-11-20').map((x) => [x.recorrente.descricao, x.situacao])
  const fixasNov = contasDoMes('2026-11', d.recorrentes, d.lancamentos, '2026-11-20').map((x) => [x.recorrente.descricao, x.situacao])
  const orc = orcamentoDoMes('2026-11', d.orcamentos, d.lancamentos).itens.map((i) => [i.gasto, i.limite, i.situacao])
  return { saldos, faturas, meses, fixasDez, fixasNov, orc }
}

async function lerTudo() {
  const d = {}
  for (const t of TABELAS) d[t] = await db.table(t).toArray()
  return d
}

beforeEach(async () => {
  db.close()
  await db.delete()
  await Dexie.delete(NOME_BANCO_ANTIGO)
  try { localStorage.clear() } catch { /* sem localStorage no Node */ }
  await db.open()
})

describe('migração do banco antigo para o banco com nuvem', () => {
  it('traz tudo, com todas as ligações, e os resultados ficam idênticos', async () => {
    await criarBancoAntigo(DADOS_ANTIGOS)
    const esperado = fotografiaDe(DADOS_ANTIGOS)
    expect(await migrarBancoAntigo()).toEqual({ lancamentos: 9 })

    const depois = await fotografia()
    expect(depois).toEqual(esperado)
    expect(JSON.stringify(depois)).not.toContain('QUEBRADO')
    const novo = await lerTudo()
    expect(resultados(novo)).toEqual(resultados(DADOS_ANTIGOS))
    // ids novos são textos (formato sincronizável)
    expect(novo.lancamentos.every((l) => typeof l.id === 'string')).toBe(true)
    expect(novo.orcamentos.every((o) => typeof o.id === 'string' && typeof o.categoriaId === 'string')).toBe(true)
    // preferências e "última conta usada" (apontando para o cartão novo)
    const cfg = Object.fromEntries(novo.config.map((c) => [c.chave, c.valor]))
    expect(cfg).toMatchObject({ zoeira: false, boasVindas: true, ultimoBackup: '2026-11-15', ultimaOrigem: `cartao:${novo.cartoes[0].id}` })
  })

  it('confere os números esperados (não só "igual ao antes")', async () => {
    await criarBancoAntigo(DADOS_ANTIGOS)
    await migrarBancoAntigo()
    const r = resultados(await lerTudo())
    expect(r.saldos).toEqual({ Santander: 250000 - 4590 - 20000, Inter: 80050 + 500000 - 40000 - 3250, Carteira: -1500 + 20000 })
    expect(r.faturas['Inter 2026-12']).toEqual([40000, 40000, 0, 'paga'])
    expect(r.faturas['Inter 2026-11']).toEqual([8990, 0, 8990, 'atrasada'])
    expect(r.fixasNov).toEqual([['Salário', 'lancada'], ['Aluguel', 'atrasada']])
    expect(r.fixasDez).toEqual([['Salário', 'pendente'], ['Aluguel', 'pulada']])
    expect(r.orc).toEqual([[4590 + 3250, 80000, 'ok']])
  })

  it('reimportar o mesmo extrato depois da migração não duplica', async () => {
    await criarBancoAntigo(DADOS_ANTIGOS)
    await migrarBancoAntigo()
    const novo = await lerTudo()
    const { resumo } = prepararImportacao({ extrato: lerOFX(OFX_CARTAO), destino: { tipo: 'cartao', id: novo.cartoes[0].id }, faturaCartao: '2026-11', dados: novo })
    expect(resumo.importados).toBe(1) // a linha C1 (Netflix) é reconhecida como já importada
  })

  it('só migra uma vez e não apaga o banco antigo', async () => {
    await criarBancoAntigo(DADOS_ANTIGOS)
    await migrarBancoAntigo()
    expect(await migrarBancoAntigo()).toBeNull()
    expect(await db.lancamentos.count()).toBe(9)
    expect(await Dexie.exists(NOME_BANCO_ANTIGO)).toBe(true)
    const antigo = bancoAntigo()
    await antigo.open()
    expect(await antigo.lancamentos.count()).toBe(9)
    antigo.close()
  })

  it('depois de apagar o banco novo (ex.: "apagar deste aparelho e usar os da conta"), não migra de novo', async () => {
    await criarBancoAntigo(DADOS_ANTIGOS)
    await migrarBancoAntigo()
    db.close()
    await db.delete() // some tudo, inclusive as preferências deste aparelho
    await db.open()
    expect(await migrarBancoAntigo()).toBeNull()
    expect(await db.lancamentos.count()).toBe(0)
  })

  it('backup não carrega dono/espaço de outra conta para dentro da sua', async () => {
    const comNuvem = JSON.parse(JSON.stringify(DADOS_ANTIGOS))
    for (const l of comNuvem.lancamentos) Object.assign(l, { owner: 'outra-pessoa', realmId: 'rlm-de-outra-pessoa', $ts: 123 })
    comNuvem.contas[0].realmId = 'rlm-de-outra-pessoa'
    await restaurarBackup({ app: 'muquirana', versao: 3, exportadoEm: 'x', dados: comNuvem })
    const todos = [...(await db.lancamentos.toArray()), ...(await db.contas.toArray())]
    expect(todos.some((x) => x.owner === 'outra-pessoa' || x.realmId === 'rlm-de-outra-pessoa' || x.$ts === 123)).toBe(false)
  })

  it('banco antigo de quem só abriu o app (nem passou das boas-vindas) não é migrado', async () => {
    await criarBancoAntigo({
      contas: DADOS_ANTIGOS.contas,
      categorias: DADOS_ANTIGOS.categorias,
      config: [{ chave: 'zoeira', valor: true }, { chave: 'boasVindas', valor: false }],
    })
    expect(await migrarBancoAntigo()).toBeNull()
    expect(await db.contas.count()).toBe(0)
  })

  it('sem banco antigo: nada a fazer', async () => {
    expect(await migrarBancoAntigo()).toBeNull()
    expect(await db.contas.count()).toBe(0)
  })

  it('se o banco novo já tem dados (ex.: já entrou na conta), não mistura', async () => {
    await criarBancoAntigo(DADOS_ANTIGOS)
    await db.contas.add({ nome: 'Da nuvem', emoji: '☁️', saldoInicial: 0 })
    expect(await migrarBancoAntigo()).toBeNull()
    expect((await db.contas.toArray()).map((c) => c.nome)).toEqual(['Da nuvem'])
  })

  it('backup da versão antiga (ids numéricos) restaura igual à migração', async () => {
    const backupAntigo = { app: 'muquirana', versao: 2, exportadoEm: '2026-11-20T00:00:00Z', dados: JSON.parse(JSON.stringify(DADOS_ANTIGOS)) }
    await restaurarBackup(backupAntigo)
    expect(await fotografia()).toEqual(fotografiaDe(DADOS_ANTIGOS))
    expect(resultados(await lerTudo())).toEqual(resultados(DADOS_ANTIGOS))
  })

  it('ligação para registro que não existe vira vazio (não aponta para o lugar errado)', async () => {
    const quebrado = JSON.parse(JSON.stringify(DADOS_ANTIGOS))
    quebrado.lancamentos.push({ id: 10, tipo: 'despesa', valor: 100, descricao: 'órfão', categoriaId: 999, contaId: 1, cartaoId: null, data: '2026-11-01', recorrenteId: 77, competencia: '2026-11', criadoEm: 200 })
    await restaurarBackup({ app: 'muquirana', versao: 2, exportadoEm: 'x', dados: quebrado })
    const orfao = (await db.lancamentos.toArray()).find((l) => l.descricao === 'órfão')
    expect(orfao.categoriaId).toBeNull()
    expect(orfao.recorrenteId).toBeNull()
    expect(typeof orfao.contaId).toBe('string')
  })
})
