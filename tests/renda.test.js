// Renda automática: aprender o salário pelos extratos, separar extras, perceber aumento,
// mês honesto e previsão sem contar duas vezes. Dados FICTÍCIOS.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  aprenderRenda, recebimentosDaRenda, rendaDoMes, mudancasDaRenda, sobrasPorMes, sobraMedia, rendaMensal,
  competenciaDe, diaCentral, distanciaDia, rendaDaSugestao, textoDia,
} from '../src/lib/renda.js'
import { confirmarRendas, salvarRenda, atualizarValorRenda, manterValorRenda, naoEhRenda } from '../src/lib/rendaSalvar.js'
import { contasDoMes, salvarRecorrente } from '../src/lib/recorrentes.js'
import { previsaoSaldo, gastoMensalMedio } from '../src/lib/previsao.js'
import { excluirConta, excluirCategoria } from '../src/lib/cadastros.js'
import { porcentagemDaRenda } from '../src/components/Orcamento.jsx'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'

const ler = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const CATS = [{ id: 'sal', tipo: 'receita', nome: 'Salário' }, { id: 'out', tipo: 'receita', nome: 'Outros' }, { id: 'mer', tipo: 'despesa', nome: 'Mercado' }]
let n = 0
const credito = (data, valor, categoriaId = 'sal', extra = {}) => ({ id: `l${++n}`, tipo: 'receita', contaId: 'c1', categoriaId, valor, data, ...extra })
const gasto = (data, valor, categoriaId = 'mer') => ({ id: `g${++n}`, tipo: 'despesa', contaId: 'c1', categoriaId, valor, data })

// Salário em 2 partes (dia 15 e fim do mês), de maio a outubro; aumento em setembro; extra em agosto
function historico() {
  return [
    credito('2026-05-15', 300000), credito('2026-05-29', 350000),
    credito('2026-06-15', 300000), credito('2026-06-30', 350000),
    credito('2026-07-15', 300000), credito('2026-07-31', 350000),
    credito('2026-08-14', 300000), credito('2026-08-31', 900000), // fim de agosto: salário + férias
    credito('2026-09-15', 320000), credito('2026-09-30', 370000),
    credito('2026-10-15', 320000), credito('2026-10-29', 120000), credito('2026-10-30', 370000), // 29/10: 2º crédito = extra
    credito('2026-11-13', 320000),
    credito('2026-11-10', 3, 'sal'), // centavos: não é renda
  ]
}
const DIA = '2026-11-25'

describe('dias que dão a volta no mês', () => {
  it('dia típico e distância consideram que o 1º vem logo depois do 30/31', () => {
    expect(diaCentral([29, 30, 31, 30, 1])).toBeGreaterThanOrEqual(30)
    expect(diaCentral([14, 15, 15, 16])).toBe(15)
    expect(distanciaDia(30, 1)).toBe(2)
    expect(distanciaDia(15, 30)).toBe(15)
  })
  it('a parte do fim do mês que caiu no dia 1º é do mês anterior (e vice-versa)', () => {
    expect(competenciaDe('2026-12-01', 30)).toBe('2026-11')
    expect(competenciaDe('2026-11-30', 30)).toBe('2026-11')
    expect(competenciaDe('2026-01-02', 31)).toBe('2025-12')
    expect(competenciaDe('2026-10-30', 1)).toBe('2026-11') // adiantado
    expect(competenciaDe('2026-11-15', 15)).toBe('2026-11')
  })
  it('texto do dia', () => {
    expect(textoDia(15)).toBe('perto do dia 15')
    expect(textoDia(30)).toBe('no fim do mês')
  })
})

describe('aprender a renda', () => {
  it('acha o salário em 2 partes, com o valor novo depois do aumento, e marca o salário como principal', () => {
    const s = aprenderRenda({ lancamentos: historico(), categorias: CATS, dia: DIA })
    expect(s.map((p) => [p.descricao, p.dia, p.valor, p.principal])).toEqual([
      ['Salário · parte 1', 15, 320000, true],
      ['Salário · parte 2', 30, 370000, true],
    ])
    expect(s[0].meses).toBe(6)
    expect(s[0].desde).toBe('2026-05')
    expect(s[0].contaId).toBe('c1')
  })
  it('o último valor fora do normal (só 1 mês) não vira a renda: usa a mediana dos anteriores', () => {
    const L = [3, 4, 5, 6, 7, 8, 9, 10].map((m) => credito(`2026-${String(m).padStart(2, '0')}-05`, 300000))
    L.push(credito('2026-11-05', 200000)) // veio só um pedaço
    const [p] = aprenderRenda({ lancamentos: L, categorias: CATS, dia: DIA })
    expect(p.valor).toBe(300000)
  })
  it('aumento só nos 2 últimos meses (iguais): já vale o valor novo', () => {
    const L = ['05', '06', '07', '08', '09'].map((m) => credito(`2026-${m}-15`, 300000))
    L.push(credito('2026-10-15', 400000), credito('2026-11-13', 400000))
    expect(aprenderRenda({ lancamentos: L, categorias: CATS, dia: DIA })[0].valor).toBe(400000)
  })
  it('salário no dia 5 e outro no fim do mês são partes diferentes (não viram uma no dia 1º)', () => {
    const L = ['05', '06', '07', '08', '09', '10'].flatMap((m, i) => [credito(`2026-${m}-05`, 650000), credito(`2026-${m}-${['29', '30', '31', '31', '30', '30'][i]}`, 350000)])
    const s = aprenderRenda({ lancamentos: L, categorias: CATS, dia: DIA })
    expect(s.map((p) => [p.descricao, p.dia, p.valor])).toEqual([['Salário · parte 1', 5, 650000], ['Salário · parte 2', 30, 350000]])
    const rec = recebimentosDaRenda([{ id: 'a', ...rendaDaSugestao(s[0]) }, { id: 'b', ...rendaDaSugestao(s[1]) }], L)
    expect([...rec.porRenda.get('a').keys()]).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(rec.extras).toEqual([])
  })
  it('precisa aparecer em 3 dos últimos 6 meses e em algum dos 2 últimos', () => {
    expect(aprenderRenda({ lancamentos: [credito('2026-09-10', 100000), credito('2026-10-10', 100000)], categorias: CATS, dia: DIA })).toEqual([])
    const acabou = ['05', '06', '07', '08'].map((m) => credito(`2026-${m}-10`, 100000))
    expect(aprenderRenda({ lancamentos: acabou, categorias: CATS, dia: DIA })).toEqual([])
  })
  it('renda de outra categoria aparece desmarcada; uma parte já cadastrada não volta como sugestão', () => {
    const L = [...historico(), ...['06', '07', '08', '09', '10'].map((m) => credito(`2026-${m}-20`, 10000, 'out'))]
    const s = aprenderRenda({ lancamentos: L, categorias: CATS, dia: DIA })
    expect(s.find((p) => p.categoriaId === 'out')).toMatchObject({ descricao: 'Outros', dia: 20, principal: false })
    const jaTem = [{ id: 'r1', categoriaId: 'sal', dia: 15, renda: {} }]
    const s2 = aprenderRenda({ lancamentos: L, categorias: CATS, rendas: jaTem, dia: DIA })
    expect(s2.filter((p) => p.categoriaId === 'sal').map((p) => [p.descricao, p.dia])).toEqual([['Salário · parte 2', 30]])
  })
  it('créditos abaixo de R$ 50, transferências e despesas não contam', () => {
    const L = ['05', '06', '07', '08', '09', '10'].flatMap((m) => [credito(`2026-${m}-10`, 4000), { ...credito(`2026-${m}-12`, 900000), tipo: 'transferencia' }, gasto(`2026-${m}-11`, 900000)])
    expect(aprenderRenda({ lancamentos: L, categorias: CATS, dia: DIA })).toEqual([])
  })
})

// As duas partes confirmadas (como o app salva)
const partes = (valores = [320000, 370000]) => [
  { id: 'p1', ...rendaDaSugestao({ descricao: 'Salário · parte 1', dia: 15, valor: valores[0], categoriaId: 'sal', contaId: 'c1', desde: '2026-05' }) },
  { id: 'p2', ...rendaDaSugestao({ descricao: 'Salário · parte 2', dia: 30, valor: valores[1], categoriaId: 'sal', contaId: 'c1', desde: '2026-05' }) },
]

describe('créditos da renda e extras', () => {
  it('2º crédito da parte no mesmo mês é extra; mês "inchado" separa o normal do extra', () => {
    const rec = recebimentosDaRenda(partes(), historico())
    expect(rec.porRenda.get('p2').get('2026-10')).toMatchObject({ regular: 370000, extra: 0 })
    const ago = rec.porRenda.get('p2').get('2026-08')
    expect(ago.regular).toBe(350000) // o normal dos meses vizinhos, não o valor cadastrado hoje
    expect(ago.extra).toBe(900000 - 350000)
    expect(rec.extras.map((e) => [e.lancamento.data, e.valor])).toEqual([['2026-08-31', 550000], ['2026-10-29', 120000]])
  })
  it('salário do fim do mês que caiu no dia 1º conta no mês anterior; crédito bem pequeno perto da parte é ignorado', () => {
    const L = [credito('2026-12-01', 370000), credito('2026-11-15', 320000), credito('2026-11-17', 10000), credito('2026-12-15', 10000)]
    const rec = recebimentosDaRenda(partes(), L)
    expect(rec.porRenda.get('p2').get('2026-11')?.lancamento.data).toBe('2026-12-01')
    expect(rec.porRenda.get('p2').has('2026-12')).toBe(false)
    expect(rec.porRenda.get('p1').has('2026-12')).toBe(false) // R$ 100 não é o salário chegando
    expect(rec.extras).toEqual([])
  })
  it('créditos marcados como "não é renda" ficam de fora', () => {
    const L = historico()
    const extra = L.find((l) => l.data === '2026-10-29')
    const r = partes().map((p) => ({ ...p, renda: { ...p.renda, ignorados: [extra.id] } }))
    expect(recebimentosDaRenda(r, L).extras.map((e) => e.lancamento.data)).toEqual(['2026-08-31'])
  })
  it('crédito da categoria longe de qualquer parte é entrada comum (nem renda, nem extra)', () => {
    const rec = recebimentosDaRenda([partes()[0]], [credito('2026-11-15', 320000), credito('2026-11-30', 90000)])
    expect(rec.extras).toEqual([])
    expect([...rec.porRenda.get('p1').keys()]).toEqual(['2026-11'])
  })
})

describe('a renda no mês', () => {
  it('mês em andamento: recebido, quanto falta e o que ainda deve entrar', () => {
    const r = rendaDoMes('2026-11', partes(), historico(), DIA)
    expect(r).toMatchObject({ esperado: 690000, recebido: 320000, falta: 370000, ajuste: 0, totalExtras: 0 })
    expect(r.partes.map((p) => p.situacao)).toEqual(['recebida', 'aguardando'])
    expect(r.pendentes.map((p) => p.previsto)).toEqual(['2026-11-30'])
  })
  it('parte que passou do dia sem aparecer: atrasada (ainda deve entrar); num mês passado não falta mais nada', () => {
    const L = [credito('2026-11-15', 320000)]
    expect(rendaDoMes('2026-11', partes(), L, '2026-12-02').partes[1].situacao).toBe('atrasada')
    const out = rendaDoMes('2026-10', partes(), L, DIA)
    expect(out.falta).toBe(0)
    expect(out.pendentes).toEqual([])
  })
  it('ajuste pela competência: o salário que caiu em 01/12 soma em novembro e sai de dezembro', () => {
    const L = [credito('2026-11-15', 320000), credito('2026-12-01', 370000)]
    expect(rendaDoMes('2026-11', partes(), L, '2026-12-05').ajuste).toBe(370000)
    expect(rendaDoMes('2026-12', partes(), L, '2026-12-05').ajuste).toBe(-370000)
  })
  it('renda por mês só conta as partes que valem no mês', () => {
    const r = partes()
    r[1].inicio = '2026-12'
    expect(rendaMensal(r, '2026-11')).toBe(320000)
    expect(rendaMensal(r, '2026-12')).toBe(690000)
  })
})

describe('aumento', () => {
  const antigas = () => partes([300000, 350000])
  it('2 meses seguidos com o mesmo valor novo: pergunta se atualiza', () => {
    const rec = recebimentosDaRenda(antigas(), historico())
    const m = mudancasDaRenda(antigas(), rec)
    expect(m.map((x) => [x.renda.id, x.de, x.para, x.desde, x.subiu])).toEqual([
      ['p1', 300000, 320000, '2026-10', true],
      ['p2', 350000, 370000, '2026-09', true],
    ])
  })
  it('1 mês diferente não basta; depois de "manter" esse valor, não pergunta de novo', () => {
    const L = [credito('2026-09-15', 300000), credito('2026-10-15', 300000), credito('2026-11-15', 318000)]
    expect(mudancasDaRenda(antigas(), recebimentosDaRenda(antigas(), L))).toEqual([])
    // meses que não são seguidos não contam
    expect(mudancasDaRenda(antigas(), recebimentosDaRenda(antigas(), [credito('2026-08-15', 320000), credito('2026-10-15', 320000)]))).toEqual([])
    // o penúltimo mês ainda no valor cadastrado (menos de 3% de diferença): só 1 mês mudou
    expect(mudancasDaRenda(antigas(), recebimentosDaRenda(antigas(), [credito('2026-10-15', 306000), credito('2026-11-15', 312000)]))).toEqual([])
    const L2 = [credito('2026-10-15', 320000), credito('2026-11-13', 320000)]
    const r = antigas()
    r[0].renda.recusado = 320000
    expect(mudancasDaRenda(r, recebimentosDaRenda(r, L2))).toEqual([])
  })
})

describe('quanto sobra', () => {
  it('sobra de cada mês completo, com o salário no mês certo, e a porcentagem', () => {
    const L = [credito('2026-10-15', 200000), credito('2026-11-01', 200000), gasto('2026-10-10', 100000), credito('2026-11-15', 200000), gasto('2026-11-05', 300000)]
    const r = partes([200000, 200000])
    const s = sobrasPorMes({ rendas: r, lancamentos: L, meses: 2, dia: '2026-12-10' })
    expect(s).toEqual([
      { mes: '2026-10', entrou: 400000, saiu: 100000, sobrou: 300000, porcentagem: 75 },
      { mes: '2026-11', entrou: 200000, saiu: 300000, sobrou: -100000, porcentagem: -50 },
    ])
  })
  it('sobra média: renda − gasto médio dos 3 últimos meses (sem as categorias das metas)', () => {
    const L = [gasto('2026-08-05', 300000), gasto('2026-09-05', 300000), gasto('2026-10-05', 300000), gasto('2026-10-06', 60000, 'meta1'), gasto('2026-11-05', 999999)]
    expect(sobraMedia({ rendas: partes(), lancamentos: L, dia: DIA })).toEqual({ renda: 690000, gastoMedio: 320000, sobra: 370000 })
    expect(sobraMedia({ rendas: partes(), lancamentos: L, dia: DIA, fora: new Set(['meta1']) }).sobra).toBe(390000)
    expect(sobraMedia({ rendas: [], lancamentos: L, dia: DIA })).toBeNull()
  })
  it('porcentagem da renda no orçamento', () => {
    expect(porcentagemDaRenda(69000, 690000)).toBe('10%')
    expect(porcentagemDaRenda(2000, 690000)).toBe('0,3%')
  })
})

describe('previsão e contas fixas sem contar duas vezes', () => {
  const contas = [{ id: 'c1', nome: 'Banco', saldoInicial: 0 }]
  it('parte recebida pelo extrato conta como lançada; a que falta entra uma vez, no dia dela', () => {
    const L = historico()
    const lista = contasDoMes('2026-11', partes(), L, DIA)
    expect(lista.map((x) => [x.recorrente.id, x.situacao])).toEqual([['p1', 'lancada'], ['p2', 'pendente']])
    const p = previsaoSaldo({ contas, cartoes: [], recorrentes: partes(), lancamentos: L, meses: 2, dia: DIA })
    const renda = p.eventos.filter((e) => e.origem === 'renda')
    expect(renda.map((e) => [e.data, e.valor])).toEqual([['2026-11-30', 370000], ['2026-12-15', 320000], ['2026-12-30', 370000]])
  })
  it('quando o salário de novembro cai em 01/12, novembro fica lançado e dezembro continua esperando o dele', () => {
    const L = [...historico(), credito('2026-12-01', 370000)]
    const p = previsaoSaldo({ contas, cartoes: [], recorrentes: partes(), lancamentos: L, meses: 2, dia: DIA })
    expect(p.eventos.filter((e) => e.origem === 'renda').map((e) => e.data)).toEqual(['2026-12-15', '2026-12-30'])
    expect(p.eventos.filter((e) => e.origem === 'agendado').map((e) => e.data)).toEqual(['2026-12-01'])
  })
})

describe('previsão com o gasto do dia a dia', () => {
  const contas = [{ id: 'c1', nome: 'Banco', saldoInicial: 1000000 }]
  it('gasto médio: 3 últimos meses completos, sem contas fixas lançadas nem parcelas', () => {
    const L = [gasto('2026-08-05', 300000), gasto('2026-09-05', 200000), gasto('2026-10-05', 100000), gasto('2026-11-05', 999999), gasto('2026-07-05', 999999),
      { ...gasto('2026-10-06', 50000), recorrenteId: 'x' }, { ...gasto('2026-10-07', 70000), grupoParcelaId: 'p' }]
    expect(gastoMensalMedio(L, DIA)).toBe(200000)
    expect(gastoMensalMedio([], DIA)).toBe(0)
  })
  it('sai um pouco por dia a partir de amanhã; um mês inteiro tira o gasto do mês', () => {
    const p = previsaoSaldo({ contas, cartoes: [], recorrentes: [], lancamentos: [], meses: 2, dia: '2026-11-30', gastoMensal: 310000 })
    expect(p.dias[0].saldo).toBe(1000000) // hoje não muda
    expect(p.fimDosMeses).toEqual([{ mes: '2026-11', saldo: 1000000 }, { mes: '2026-12', saldo: 1000000 - 310000 }])
    expect(p.eventos).toEqual([{ data: '2026-12-31', valor: -310000, descricao: 'Gastos do dia a dia', origem: 'media' }])
    expect(p.menor).toEqual({ data: '2026-12-31', saldo: 690000 })
  })
  it('sem gasto médio, nada muda (e a tela só usa a média quando há renda)', () => {
    const p = previsaoSaldo({ contas, cartoes: [], recorrentes: [], lancamentos: [], meses: 2, dia: '2026-11-30' })
    expect(p.saldoFinal).toBe(1000000)
    expect(p.eventos).toEqual([])
    expect(ler('pages/Previsao.jsx')).toMatch(/const gastoMensal = useMemo\(\(\) => \(rendas\.length \? gastoMensalMedio\(lancamentos\) : 0\)/)
  })
})

describe('gravar a renda', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const sugestao = () => ({ descricao: 'Salário · parte 1', dia: 15, valor: 320000, categoriaId: b.cat('receita', 'Salário'), contaId: b.contas[0].id, desde: '2026-05', meses: 6, principal: true, ultimo: {} })

  it('confirmar salva como conta fixa de receita marcada como renda (só os campos dela)', async () => {
    const [id] = await confirmarRendas([sugestao()])
    const r = await db.recorrentes.get(id)
    expect(r).toMatchObject({ descricao: 'Salário · parte 1', tipo: 'receita', valor: 320000, dia: 15, inicio: '2026-05', cartaoId: null, renda: { aprendida: true, ignorados: [] } })
    expect(r.meses).toBeUndefined()
    expect(r.principal).toBeUndefined()
  })
  it('editar mantém a marca de renda; outra renda à mão começa no mês atual; renda é sempre receita', async () => {
    const [id] = await confirmarRendas([sugestao()])
    await salvarRenda({ id, descricao: 'Salário (adiantamento)', valor: 330000, dia: 14, categoriaId: b.cat('receita', 'Salário'), contaId: b.contas[0].id })
    expect(await db.recorrentes.get(id)).toMatchObject({ descricao: 'Salário (adiantamento)', valor: 330000, dia: 14, inicio: '2026-05', renda: { aprendida: true } })
    const outra = await salvarRenda({ descricao: 'Aluguel recebido', valor: 90000, dia: 5, categoriaId: b.cat('receita', 'Outros'), contaId: b.contas[0].id })
    expect((await db.recorrentes.get(outra)).renda).toEqual({ aprendida: false, ignorados: [] })
    await expect(salvarRecorrente({ descricao: 'X', tipo: 'despesa', valor: 100, dia: 1, categoriaId: b.cat('despesa', 'Mercado'), contaId: b.contas[0].id, inicio: '2026-11', renda: {} })).rejects.toThrow(/receita/)
    await expect(salvarRenda({ id: 'nao-existe', descricao: 'X', valor: 1, dia: 1 })).rejects.toThrow(/não encontrada/)
  })
  it('atualizar o valor, ou manter e lembrar o valor recusado', async () => {
    const [id] = await confirmarRendas([sugestao()])
    await manterValorRenda(id, 340000)
    expect((await db.recorrentes.get(id)).renda.recusado).toBe(340000)
    await atualizarValorRenda(id, 340000)
    const r = await db.recorrentes.get(id)
    expect(r.valor).toBe(340000)
    expect('recusado' in r.renda).toBe(false)
    await salvarRecorrente({ ...r, renda: { ...r.renda, recusado: 'x', lixo: 1, ignorados: ['a', null] } })
    expect((await db.recorrentes.get(id)).renda).toEqual({ aprendida: true, ignorados: ['a'] })
  })
  it('"não é renda" vale para todas as partes da categoria', async () => {
    const ids = await confirmarRendas([sugestao(), { ...sugestao(), descricao: 'Salário · parte 2', dia: 30 }])
    expect(await naoEhRenda('lanc-x', b.cat('receita', 'Salário'))).toBe(2)
    for (const id of ids) expect((await db.recorrentes.get(id)).renda.ignorados).toEqual(['lanc-x'])
  })
  it('conta e categoria usadas na renda não podem ser apagadas antes', async () => {
    await confirmarRendas([sugestao()])
    await expect(excluirConta(b.contas[0].id)).rejects.toThrow(/renda/)
    await expect(excluirCategoria(b.cat('receita', 'Salário'))).rejects.toThrow(/renda/)
  })
})

describe('na tela', () => {
  it('a renda fica fora da lista de contas fixas, mas entra na previsão (Início e Previsão)', () => {
    const d = ler('dados.jsx')
    expect(d).toMatch(/const recorrentes = todasFixas\.filter\(\(r\) => !r\.renda\)/)
    expect(d).toMatch(/const rendas = todasFixas\.filter\(\(r\) => r\.renda\)/)
    expect(ler('pages/Inicio.jsx')).toMatch(/saldoPrevisto\(\{ mes: mesAtual\(\), contas, cartoes, recorrentes: fixasERenda, lancamentos \}\)/)
    expect(ler('pages/Previsao.jsx')).toMatch(/previsaoSaldo\(\{ contas, cartoes, recorrentes: fixasERenda, lancamentos, meses, gastoMensal \}\)/)
  })
  it('o Início do mês em andamento conta o que ainda deve entrar ("Deve sobrar")', () => {
    const i = ler('pages/Inicio.jsx')
    expect(i).toMatch(/const valor = resumo\.entrou \+ renda\.ajuste \+ renda\.falta - resumo\.saiu/)
    expect(i).toMatch(/fecho=\{fecho\}/)
    expect(ler('components/Pecas.jsx')).toMatch(/fecho\?\.previsto \? \['Deve sobrar', 'Deve faltar'\]/)
  })
})

describe('listas de barras', () => {
  it('toda linha de barra (barra-linha + barra-topo) tem o miolo em barra-corpo, senão o texto fica espremido ao lado da barra', () => {
    for (const p of ['components/Orcamento.jsx', 'pages/Historico.jsx', 'pages/Renda.jsx']) {
      const s = ler(p)
      const linhas = [...s.matchAll(/className="barra-linha"[^>]*>\s*<div className="([\w-]+)"/g)].map((m) => m[1])
      expect(linhas.length, p).toBeGreaterThan(0)
      for (const c of linhas) expect(c, p).toBe('barra-corpo')
    }
  })
})
