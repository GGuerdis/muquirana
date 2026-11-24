// Ícones de traço no lugar dos emoji, cor das contas, total do dia e outros detalhes visuais
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../src/lib/db.js'
import { corDaConta, CORES_CONTA, desenhoParaCategoria } from '../src/lib/cores.js'
import { DESENHOS_CATEGORIA, DESENHOS_ESCOLHA } from '../src/components/Icones.jsx'
import { salvarConta, salvarCategoria } from '../src/lib/cadastros.js'
import { totalDoDiaVisivel } from '../src/lib/lancamentos.js'
import { textoSincronizacao } from '../src/lib/nuvem.js'
import { bancoNovo } from './ajuda.js'

const SRC = new URL('../src/', import.meta.url)
const arquivos = (pasta) => readdirSync(pasta).flatMap((f) => { const p = join(pasta, f); return statSync(p).isDirectory() ? arquivos(p) : [p] })

describe('nenhum emoji na tela', () => {
  // Emoji mudam de desenho em cada celular e destoam dos ícones de traço. Só podem aparecer como dado
  // guardado (valor padrão do campo "emoji" de conta/categoria), no texto da agenda (.ics) e nos dados de exemplo.
  const PERMITIDOS = /(lib[\\/](db|agenda|cadastros|cores|espacos|importacao)\.js|dev[\\/]demo\.js|components[\\/]Formularios\.jsx|components[\\/]SeletorCategoria\.jsx)$/
  it('telas e componentes usam ícones de traço', () => {
    const achados = []
    for (const f of arquivos(SRC.pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
      if (!/\.(jsx?|css)$/.test(f) || PERMITIDOS.test(f)) continue
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (/\p{Extended_Pictographic}/u.test(l)) achados.push(`${f}:${i + 1}`) })
    }
    expect(achados).toEqual([])
  })
  it('nos arquivos permitidos, emoji só como valor guardado (nunca desenhado na tela)', () => {
    for (const nome of ['components/Formularios.jsx', 'components/SeletorCategoria.jsx']) {
      const linhas = readFileSync(new URL(nome, SRC), 'utf8').split('\n').filter((l) => /\p{Extended_Pictographic}/u.test(l))
      for (const l of linhas) expect(l, nome).toMatch(/emoji: /)
    }
  })
})

describe('cor da conta (bolinha)', () => {
  it('usa a cor escolhida por você', () => {
    expect(corDaConta({ nome: 'Santander', emoji: '🔴', cor: '#1c8ef0' })).toBe('#1c8ef0')
  })
  it('sem cor escolhida, usa a da bolinha que a conta tinha', () => {
    expect(corDaConta({ nome: 'Qualquer', emoji: '🟠' })).toBe('#ff7a00')
    expect(corDaConta({ nome: 'Qualquer', emoji: '🟢️' })).toBe('#1fbf62') // com seletor de variação
  })
  it('senão, a cor do banco pelo nome (sem ligar para acento e maiúsculas)', () => {
    expect(corDaConta({ nome: 'Caixa Econômica', emoji: '🏦' })).toBe('#1c60ab')
    expect(corDaConta({ nome: 'itaú', emoji: '🏦' })).toBe('#ec7000')
    expect(corDaConta({ nome: 'Inter', emoji: '🏦' })).toBe('#ff7a00')
    expect(corDaConta({ nome: 'Interior', emoji: '🏦' })).not.toBe('#ff7a00') // "Inter" só como palavra
    expect(corDaConta({ nome: 'Nuvem', emoji: '🏦' })).not.toBe('#8a2be2') // "Nu" (Nubank) só como palavra no começo
    expect(corDaConta({ nome: 'NU Conta' })).toBe('#8a2be2')
  })
  it('senão, uma cor estável pelo nome, sempre da paleta', () => {
    const a = corDaConta({ nome: 'Conta da vó' })
    expect(a).toBe(corDaConta({ nome: 'CONTA DA VÓ' }))
    expect(CORES_CONTA).toContain(a)
    expect(CORES_CONTA).toContain(corDaConta(null))
  })
})

describe('ícone de categoria criada por você', () => {
  it('usa o desenho escolhido', () => {
    expect(desenhoParaCategoria({ nome: 'Apartamento', desenho: 'viagem' })).toBe('viagem')
  })
  it('categoria do app usa o desenho fixo', () => {
    expect(desenhoParaCategoria({ nome: 'Mercado' })).toBe('mercado')
  })
  it('sem escolha, tenta um parecido pelo nome; senão o genérico', () => {
    expect(desenhoParaCategoria({ nome: 'Apartamento' })).toBe('predio')
    expect(desenhoParaCategoria({ nome: 'Pet shop' })).toBe('pet')
    expect(desenhoParaCategoria({ nome: 'Viagens' })).toBe('viagem')
    expect(desenhoParaCategoria({ nome: 'Xyz' })).toBe('outros')
    expect(desenhoParaCategoria(null)).toBeNull()
  })
  it('todo desenho que dá para escolher (ou adivinhar) existe', () => {
    for (const d of DESENHOS_ESCOLHA) expect(DESENHOS_CATEGORIA[d], d).toBeTruthy()
    for (const n of ['Apartamento', 'Pet', 'Viagem', 'Academia', 'Beleza', 'Celular', 'Roupas', 'Banco', 'Investimentos']) {
      expect(DESENHOS_CATEGORIA[desenhoParaCategoria({ nome: n })], n).toBeTruthy()
    }
  })
})

describe('guardar cor e ícone', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  it('a conta guarda a cor escolhida e não perde a bolinha antiga ao editar sem trocar', async () => {
    const id = b.conta('Santander')
    const antes = await db.contas.get(id)
    await salvarConta({ id, nome: 'Santander', emoji: antes.emoji, saldoAtual: 1000 }, '2026-11-20')
    expect((await db.contas.get(id)).emoji).toBe(antes.emoji)
    expect((await db.contas.get(id)).cor).toBeUndefined()
    await salvarConta({ id, nome: 'Santander', emoji: undefined, cor: '#1c8ef0', saldoAtual: 1000 }, '2026-11-20')
    const c = await db.contas.get(id)
    expect(c.cor).toBe('#1c8ef0')
    expect(c.emoji).toBe(antes.emoji) // sem emoji no formulário, mantém o que tinha
    const nova = await salvarConta({ nome: 'Poupança', cor: '#00b8b0', saldoAtual: 0 })
    expect((await db.contas.get(nova)).cor).toBe('#00b8b0')
  })
  it('a categoria guarda o desenho escolhido', async () => {
    const id = await salvarCategoria({ nome: 'Apartamento', desenho: 'predio', tipo: 'despesa' })
    expect((await db.categorias.get(id)).desenho).toBe('predio')
    await salvarCategoria({ id, nome: 'Apartamento', desenho: 'moradia', tipo: 'despesa' })
    expect((await db.categorias.get(id)).desenho).toBe('moradia')
  })
})

describe('total do dia em Lançamentos', () => {
  const d = (valor) => ({ tipo: 'despesa', valor })
  it('com um lançamento só, não repete o valor ao lado da data', () => {
    expect(totalDoDiaVisivel([d(1749)])).toBe(0)
  })
  it('com dois ou mais, mostra o saldo do dia (transferência não conta)', () => {
    expect(totalDoDiaVisivel([d(1000), { tipo: 'receita', valor: 5000 }, { tipo: 'transferencia', valor: 9999 }])).toBe(4000)
  })
})

describe('selo da sincronização usa ícones de traço', () => {
  it('todo estado tem um ícone conhecido', () => {
    const conhecidos = ['celular', 'nuvem', 'alerta', 'sem-internet', 'atualizar']
    const logado = { isLoggedIn: true, license: {} }
    const estados = [[null, undefined], [logado, undefined], [logado, { status: 'connected', phase: 'in-sync' }], [logado, { status: 'offline' }],
      [logado, { status: 'error' }], [logado, { status: 'connecting' }], [logado, { license: 'expired' }]]
    for (const [u, e] of estados) expect(conhecidos, JSON.stringify(e)).toContain(textoSincronizacao(u, e).icone)
    expect(textoSincronizacao(logado, { status: 'connected', phase: 'in-sync' }, 3).icone).toBe('atualizar')
  })
})

describe('estilo', () => {
  const css = readFileSync(new URL('estilos.css', SRC), 'utf8')
  it('links têm cor própria (laranja), diferente do magenta de "saiu"', () => {
    expect(css).toMatch(/\.link \{ color: var\(--link\); \}/)
    expect(css).toMatch(/--link: #a3400a/)
    expect(css).toMatch(/--link: #ffb35c/)
  })
  it('nomes da barra de baixo sem caixa-alta e em tamanho legível', () => {
    const regra = [...css.matchAll(/\.nav-item \{([^}]*)\}/g)].pop()[1]
    expect(regra).toMatch(/text-transform: none/)
    expect(Number(regra.match(/font-size: ([\d.]+)rem/)[1])).toBeGreaterThanOrEqual(0.7)
  })
})
