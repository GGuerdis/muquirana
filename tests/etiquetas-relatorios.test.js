// Etiquetas e Relatórios (Imposto de Renda e fluxo do mês). Dados FICTÍCIOS.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizarEtiquetas, limparEtiqueta, etiquetasUsadas, resumoPorEtiqueta, MAX_ETIQUETAS } from '../src/lib/etiquetas.js'
import { resumoIR, fluxoDoMes, desenhoFluxo } from '../src/lib/relatorios.js'
import { salvarLancamento, formDoLancamento } from '../src/lib/lancamentos.js'
import { salvarCartao } from '../src/lib/cadastros.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'

describe('etiquetas: texto limpo', () => {
  it('sem #, minúsculas, hífen no lugar de espaço, sem símbolos', () => {
    expect(limparEtiqueta('#Obra Apto')).toBe('obra-apto')
    expect(limparEtiqueta('  Viagem 2026!! ')).toBe('viagem-2026')
    expect(limparEtiqueta('São João')).toBe('são-joão')
    expect(limparEtiqueta('---')).toBe('')
  })
  it('lista ou texto separado por vírgula/#; sem repetidas; no máximo 5', () => {
    expect(normalizarEtiquetas('obra apto, #viagem;OBRA-APTO')).toEqual(['obra-apto', 'viagem'])
    expect(normalizarEtiquetas(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toHaveLength(MAX_ETIQUETAS)
    expect(normalizarEtiquetas(null)).toEqual([])
  })
  it('as mais usadas primeiro', () => {
    expect(etiquetasUsadas([{ etiquetas: ['b'] }, { etiquetas: ['a', 'b'] }, {}])).toEqual(['b', 'a'])
  })
  it('total por etiqueta soma saídas e entradas de categorias e meses diferentes', () => {
    const r = resumoPorEtiqueta([
      { id: 1, tipo: 'despesa', valor: 1000, data: '2026-03-01', etiquetas: ['obra'] },
      { id: 2, tipo: 'despesa', valor: 500, data: '2026-05-10', etiquetas: ['obra', 'casa'] },
      { id: 3, tipo: 'receita', valor: 200, data: '2026-04-01', etiquetas: ['obra'] },
      { id: 4, tipo: 'transferencia', valor: 9999, data: '2026-04-02', etiquetas: ['obra'] },
    ])
    expect(r[0]).toEqual({ etiqueta: 'obra', saiu: 1500, entrou: 200, quantidade: 4, de: '2026-03-01', ate: '2026-05-10', ids: [1, 2, 3, 4] })
    expect(r[1].etiqueta).toBe('casa')
  })
})

describe('etiquetas gravadas no lançamento', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const base = () => ({ tipo: 'despesa', valor: 1000, categoriaId: b.cat('despesa', 'Alimentação'), contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-10', parcelas: 1 })
  it('salva limpas, edita, e some quando fica sem nenhuma', async () => {
    const id = await salvarLancamento({ ...base(), etiquetas: ['#Obra Apto', 'obra-apto'] })
    let l = await db.lancamentos.get(id)
    expect(l.etiquetas).toEqual(['obra-apto'])
    expect(formDoLancamento(l).etiquetas).toEqual(['obra-apto'])
    await salvarLancamento({ ...formDoLancamento(l), etiquetas: ['viagem'] }, l)
    l = await db.lancamentos.get(id)
    expect(l.etiquetas).toEqual(['viagem'])
    await salvarLancamento({ ...formDoLancamento(l), etiquetas: [] }, l)
    expect((await db.lancamentos.get(id)).etiquetas).toBeUndefined()
  })
  it('compra parcelada: todas as parcelas levam a etiqueta', async () => {
    await salvarCartao({ nome: 'Inter', diaFechamento: 3, diaVencimento: 10 })
    const cartaoId = (await db.cartoes.toArray())[0].id
    await salvarLancamento({ ...base(), contaId: null, cartaoId, parcelas: 3, valor: 3000, etiquetas: ['obra'] })
    const L = await db.lancamentos.toArray()
    expect(L).toHaveLength(3)
    expect(L.every((l) => l.etiquetas?.[0] === 'obra')).toBe(true)
  })
  it('editar um lançamento importado não perde o lote (o desfazer continua achando)', async () => {
    const id = await salvarLancamento({ ...base(), idExterno: 'conta:x:p:1' })
    await db.lancamentos.update(id, { lote: 'imp-1764000000000-abcd' })
    const l = await db.lancamentos.get(id)
    await salvarLancamento({ ...formDoLancamento(l), descricao: 'outra' }, l)
    expect((await db.lancamentos.get(id)).lote).toBe('imp-1764000000000-abcd')
  })
})

describe('Imposto de Renda', () => {
  const categorias = [
    { id: 's', nome: 'Saúde', tipo: 'despesa' }, { id: 'e', nome: 'Educação', tipo: 'despesa' }, { id: 'm', nome: 'Mercado', tipo: 'despesa' },
    { id: 'r', nome: 'Rendimentos', tipo: 'receita' }, { id: 'sal', nome: 'Salário', tipo: 'receita' },
  ]
  const contas = [{ id: 'a', nome: 'Santander', saldoInicial: 100000 }]
  const L = [
    { tipo: 'despesa', categoriaId: 's', valor: 30000, data: '2025-03-01', descricao: 'Clínica X', contaId: 'a' },
    { tipo: 'despesa', categoriaId: 's', valor: 20000, data: '2025-04-01', descricao: 'Clínica X', contaId: 'a' },
    { tipo: 'despesa', categoriaId: 's', valor: 5000, data: '2024-12-31', descricao: 'Clínica X', contaId: 'a' }, // outro ano
    { tipo: 'despesa', categoriaId: 'e', valor: 90000, data: '2025-02-10', descricao: 'Escola', contaId: 'a' },
    { tipo: 'despesa', categoriaId: 'm', valor: 7000, data: '2025-02-11', descricao: 'Mercado', contaId: 'a' },
    { tipo: 'receita', categoriaId: 'sal', valor: 500000, data: '2025-01-05', contaId: 'a' },
    { tipo: 'receita', categoriaId: 'r', valor: 1234, data: '2025-06-30', contaId: 'a' },
  ]
  it('soma saúde, educação, salário e rendimentos só do ano escolhido', () => {
    const r = resumoIR(2025, { lancamentos: L, contas, categorias })
    expect(r.saude.total).toBe(50000)
    expect(r.saude.porDescricao).toEqual([{ nome: 'Clínica X', total: 50000, quantidade: 2 }])
    expect(r.educacao.total).toBe(90000)
    expect(r.salario.total).toBe(500000)
    expect(r.rendimentos.total).toBe(1234)
  })
  it('saldo de cada conta em 31/12 do ano anterior e do ano', () => {
    const r = resumoIR(2025, { lancamentos: L, contas, categorias })
    expect(r.saldos[0]).toMatchObject({ fimAnoAnterior: 95000, fimAno: 95000 - 50000 - 90000 - 7000 + 500000 + 1234 })
  })
})

describe('fluxo do mês', () => {
  const categorias = [{ id: 'sal', nome: 'Salário' }, { id: 'f', nome: 'Freela' }, ...['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({ id: n, nome: n }))]
  const L = [
    { tipo: 'receita', categoriaId: 'sal', valor: 500000, data: '2026-11-05' },
    { tipo: 'receita', categoriaId: 'f', valor: 100000, data: '2026-11-15' },
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => ({ tipo: 'despesa', categoriaId: n, valor: 60000 - i * 5000, data: '2026-11-10' })),
    { tipo: 'transferencia', valor: 999999, data: '2026-11-10' },
    { tipo: 'despesa', categoriaId: 'A', valor: 1, data: '2026-10-31' },
  ]
  it('entradas e saídas por categoria; as menores juntam em "Outras"', () => {
    const f = fluxoDoMes('2026-11', L, categorias)
    expect(f.entradas.map((x) => [x.nome, x.valor])).toEqual([['Salário', 500000], ['Freela', 100000]])
    expect(f.saidas.map((x) => [x.nome, x.valor])).toEqual([['A', 60000], ['B', 55000], ['C', 50000], ['D', 45000], ['Outras (2)', 75000]])
    expect(f).toMatchObject({ entrou: 600000, saiu: 285000, sobrou: 315000 })
  })
  it('desenho: os dois lados somam o mesmo total ("Sobrou" ou "Do saldo")', () => {
    const d = desenhoFluxo(fluxoDoMes('2026-11', L, categorias), { altura: 300, espaco: 0 })
    expect(d.direita.at(-1)).toMatchObject({ nome: 'Sobrou', valor: 315000 })
    const soma = (lado) => lado.reduce((s, n) => s + n.valor, 0)
    expect(soma(d.esquerda)).toBe(soma(d.direita))
    const faltou = desenhoFluxo({ entradas: [{ nome: 'Salário', valor: 100 }], saidas: [{ nome: 'A', valor: 300 }], entrou: 100, saiu: 300, sobrou: -200 })
    expect(faltou.esquerda.at(-1)).toMatchObject({ nome: 'Do saldo', valor: 200 })
    expect(desenhoFluxo({ entradas: [], saidas: [], entrou: 0, saiu: 0, sobrou: 0 })).toBeNull()
  })
})

describe('na tela', () => {
  const ler = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
  it('busca de Lançamentos acha por #etiqueta', () => {
    expect(ler('pages/Lancamentos.jsx')).toMatch(/\(l\.etiquetas \|\| \[\]\)\.map\(\(e\) => `#\$\{e\}`\)/)
  })
  it('o formulário de lançamento tem o campo de etiquetas e envia as etiquetas', () => {
    const f = ler('components/NovoLancamento.jsx')
    expect(f).toMatch(/<CampoEtiquetas valor=\{f\.etiquetas\}/)
    expect(f).toMatch(/etiquetas: f\.etiquetas,/)
  })
})

describe('rótulos do fluxo não se sobrepõem', () => {
  it('nós pequenos em sequência ficam com pelo menos 26 px entre os rótulos, dentro do desenho', async () => {
    const { posicionarRotulos } = await import('../src/lib/relatorios.js')
    const nos = [{ y: 0, h: 200 }, { y: 208, h: 3 }, { y: 219, h: 3 }, { y: 230, h: 3 }, { y: 241, h: 3 }]
    const r = posicionarRotulos(nos, 260)
    for (let i = 1; i < r.length; i++) expect(r[i].rotuloY - r[i - 1].rotuloY).toBeGreaterThanOrEqual(26)
    expect(r.at(-1).rotuloY).toBeLessThanOrEqual(252)
    expect(r[0].rotuloY).toBeGreaterThanOrEqual(8)
  })
  it('nós pequenos no topo empurram os rótulos para baixo', async () => {
    const { posicionarRotulos } = await import('../src/lib/relatorios.js')
    const r = posicionarRotulos([{ y: 0, h: 2 }, { y: 10, h: 2 }, { y: 20, h: 200 }], 260)
    expect(r[1].rotuloY - r[0].rotuloY).toBeGreaterThanOrEqual(26)
    expect(r[2].rotuloY - r[1].rotuloY).toBeGreaterThanOrEqual(26)
    for (const n of r) expect(n.rotuloY).toBeGreaterThanOrEqual(8) // nenhum rótulo sai por cima do desenho
  })
})
