import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, exportarBackup, restaurarBackup, definirEspacoParaNovos, criarDadosIniciais } from '../src/lib/db.js'
import { criarEspaco, abrirEspaco, doEspaco, convidar, removerMembro, mudarPapel, excluirEspaco, papelDe, renomearEspaco } from '../src/lib/espacos.js'
import { salvarLancamento } from '../src/lib/lancamentos.js'
import { salvarCartao, salvarConta } from '../src/lib/cadastros.js'
import { aprender } from '../src/lib/categorizar.js'
import { bancoNovo } from './ajuda.js'

let b
beforeEach(async () => { definirEspacoParaNovos(null); b = await bancoNovo() })
afterEach(() => definirEspacoParaNovos(null))

const compartilhados = async () => new Set((await db.realms.toArray()).map((r) => r.realmId))
const daCasa = async (tabela, realmId) => (await db.table(tabela).toArray()).filter((x) => x.realmId === realmId)
const doPessoal = async (tabela) => doEspaco(await db.table(tabela).toArray(), null, await compartilhados())

describe('espaços compartilhados', () => {
  it('criar espaço: já vem com categorias e uma conta, separado do Pessoal', async () => {
    const casa = await criarEspaco('Casa')
    expect((await db.realms.get(casa)).name).toBe('Casa')
    expect((await daCasa('contas', casa)).map((c) => c.nome)).toEqual(['Conta da casa'])
    expect((await daCasa('categorias', casa)).length).toBe(19)
    // o Pessoal continua igual
    expect((await doPessoal('contas')).map((c) => c.nome)).toEqual(['Santander', 'Inter', 'Carteira'])
    expect((await doPessoal('categorias')).length).toBe(19)
    expect((await db.config.get('espacoAtual')).valor).toBe(casa)
  })

  it('com um espaço aberto, tudo que é criado vai para ele (lançamento, cartão, conta, regra)', async () => {
    const casa = await criarEspaco('Casa')
    const conta = (await daCasa('contas', casa))[0]
    const cat = (await daCasa('categorias', casa)).find((c) => c.nome === 'Mercado')
    await salvarLancamento({ tipo: 'despesa', valor: 35000, categoriaId: cat.id, contaId: conta.id, cartaoId: null, data: '2026-11-20', parcelas: 1, descricao: 'Mercado do mês' })
    await salvarCartao({ nome: 'Cartão da casa', diaFechamento: 3, diaVencimento: 10 })
    await salvarConta({ nome: 'Poupança da casa', saldoAtual: 100000 })
    await aprender('Feira do bairro', 'despesa', cat.id)
    for (const t of ['lancamentos', 'cartoes', 'contas', 'regras']) {
      const novos = (await db.table(t).toArray()).filter((x) => /Mercado do mês|Cartão da casa|Poupança da casa|FEIRA/.test(x.descricao || x.nome || x.padrao))
      expect(novos.length, t).toBe(1)
      expect(novos[0].realmId, t).toBe(casa)
    }
    // de volta ao Pessoal: o que for criado não vai para a Casa
    await abrirEspaco(null)
    await salvarLancamento({ tipo: 'despesa', valor: 100, categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-20', parcelas: 1, descricao: 'pessoal' })
    expect((await compartilhados()).has((await db.lancamentos.toArray()).find((l) => l.descricao === 'pessoal').realmId)).toBe(false)
  })

  it('a tela só enxerga o espaço aberto', async () => {
    const casa = await criarEspaco('Casa')
    const ids = await compartilhados()
    const todas = await db.contas.toArray()
    expect(doEspaco(todas, casa, ids).map((c) => c.nome)).toEqual(['Conta da casa'])
    expect(doEspaco(todas, null, ids).map((c) => c.nome)).toEqual(['Santander', 'Inter', 'Carteira'])
  })

  it('cada espaço aprende categorias separado', async () => {
    await aprender('Padaria do Zé', 'despesa', b.cat('despesa', 'Alimentação'))
    const casa = await criarEspaco('Casa')
    const lazerCasa = (await daCasa('categorias', casa)).find((c) => c.nome === 'Lazer')
    await aprender('Padaria do Zé', 'despesa', lazerCasa.id)
    const regras = await db.regras.toArray()
    expect(regras.length).toBe(2)
    expect(regras.find((r) => r.realmId !== casa).categoriaId).toBe(b.cat('despesa', 'Alimentação')) // a do Pessoal não mudou
  })

  it('backup leva só o Pessoal; restaurar troca só o Pessoal e não mexe na Casa', async () => {
    const casa = await criarEspaco('Casa')
    const contaCasa = (await daCasa('contas', casa))[0]
    const catCasa = (await daCasa('categorias', casa))[0]
    await salvarLancamento({ tipo: 'despesa', valor: 999, categoriaId: catCasa.id, contaId: contaCasa.id, cartaoId: null, data: '2026-11-20', parcelas: 1, descricao: 'da casa' })
    await abrirEspaco(null)
    await salvarLancamento({ tipo: 'despesa', valor: 111, categoriaId: b.cat('despesa', 'Outros'), contaId: b.conta('Inter'), cartaoId: null, data: '2026-11-20', parcelas: 1, descricao: 'meu' })
    const bk = JSON.parse(JSON.stringify(await exportarBackup()))
    expect(bk.dados.lancamentos.map((l) => l.descricao)).toEqual(['meu'])
    expect(bk.dados.contas.length).toBe(3)

    // mesmo com a Casa aberta, restaurar vai para o Pessoal
    await abrirEspaco(casa)
    await restaurarBackup(bk)
    expect((await daCasa('lancamentos', casa)).map((l) => l.descricao)).toEqual(['da casa'])
    expect((await doPessoal('lancamentos')).map((l) => l.descricao)).toEqual(['meu'])
    expect((await doPessoal('contas')).length).toBe(3)
    expect((await daCasa('contas', casa)).length).toBe(1)
  })

  it('dados iniciais do Pessoal não são criados dentro de um espaço aberto', async () => {
    const casa = await criarEspaco('Casa')
    db.close(); await db.delete(); await db.open() // aparelho novo, com o espaço Casa aberto na memória
    definirEspacoParaNovos(casa)
    await criarDadosIniciais()
    expect((await db.contas.toArray()).every((c) => c.realmId !== casa)).toBe(true)
  })

  it('convites: e-mail válido, sem repetir, com permissão; mudar e remover', async () => {
    const casa = await criarEspaco('Casa')
    await expect(convidar(casa, { email: 'não é email' })).rejects.toThrow('E-mail')
    await expect(convidar(casa, { email: 'ana@exemplo.com', papel: 'chefe' })).rejects.toThrow('Permissão')
    const id = await convidar(casa, { email: ' Ana@Exemplo.com ', papel: 'leitor' })
    await expect(convidar(casa, { email: 'ana@exemplo.com' })).rejects.toThrow('já foi convidada')
    const m = await db.members.get(id)
    expect(m).toMatchObject({ realmId: casa, email: 'ana@exemplo.com', invite: true, roles: ['leitor'] })
    expect(papelDe(m)).toBe('leitor')
    await mudarPapel(id, 'editor')
    expect(papelDe(await db.members.get(id))).toBe('editor')
    await removerMembro(id)
    expect(await db.members.count()).toBe(0)
  })

  it('renomear e excluir o espaço (apaga só o que é dele) e volta para o Pessoal', async () => {
    const casa = await criarEspaco('Casa')
    await renomearEspaco(casa, 'Apê')
    expect((await db.realms.get(casa)).name).toBe('Apê')
    await expect(renomearEspaco(casa, '  ')).rejects.toThrow('nome')
    await convidar(casa, { email: 'ana@exemplo.com' })
    await excluirEspaco(casa)
    expect(await db.realms.count()).toBe(0)
    expect(await db.members.count()).toBe(0)
    expect((await db.contas.toArray()).map((c) => c.nome)).toEqual(['Santander', 'Inter', 'Carteira'])
    expect((await db.categorias.toArray()).length).toBe(19)
    expect((await db.config.get('espacoAtual')).valor).toBeNull()
  })

  it('espaço precisa de nome', async () => {
    await expect(criarEspaco('   ')).rejects.toThrow('nome')
    expect(await db.realms.count()).toBe(0)
  })
})
