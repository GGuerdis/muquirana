import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/lib/db.js'
import { chaveDescricao, sugerirCategoria, aprender, aprenderComImportacao, apagarRegra } from '../src/lib/categorizar.js'
import { prepararImportacao, executarImportacao } from '../src/lib/importacao.js'
import { lerOFX } from '../src/lib/ofx.js'
import { salvarCategoria, excluirCategoria } from '../src/lib/cadastros.js'
import { bancoNovo } from './ajuda.js'
import { OFX_XML_CONTA } from './exemplos-ofx.js'

let b
beforeEach(async () => { b = await bancoNovo() })
const regras = () => db.regras.toArray()
const categorias = () => db.categorias.toArray()
const sugerir = async (desc, tipo = 'despesa') => sugerirCategoria(desc, tipo, await regras(), await categorias())

describe('identidade da descrição', () => {
  it.each([
    ['PAG*PADARIADOZE 12/11', 'PADARIADOZE'],
    ['UBER *TRIP', 'UBER TRIP'],
    ['PIX ENVIADO FULANO & CIA', 'FULANO CIA'],
    ['COMPRA CARTÃO DÉBITO PADARIA SÃO JOÃO', 'PADARIA JOAO'],
    ['IFOOD *RESTAURANTE ABC LTDA', 'IFOOD RESTAURANTE ABC'],
    ['Almoço', 'ALMOCO'],
    ['12345 / 99', ''],
    ['', ''],
  ])('%s → %s', (desc, chave) => {
    expect(chaveDescricao(desc)).toBe(chave)
  })
})

describe('regras prontas', () => {
  it.each([
    ['UBER *TRIP HELP.UBER.COM', 'Transporte'],
    ['99APP *CORRIDA', 'Transporte'],
    ['POSTO IPIRANGA', 'Transporte'],
    ['IFOOD *RESTAURANTE', 'Alimentação'],
    ['PADARIA SÃO JOÃO', 'Alimentação'],
    ['NETFLIX.COM', 'Assinaturas'],
    ['AMAZON PRIME BR', 'Assinaturas'],
    ['AMAZON MARKETPLACE', 'Compras'],
    ['MERCADO LIVRE', 'Compras'],
    ['SUPERMERCADO EXTRA', 'Mercado'],
    ['MERCADO DO BAIRRO', 'Mercado'],
    ['DROGASIL 123', 'Saúde'],
    ['ENEL DISTRIBUICAO', 'Contas da casa'],
    ['IOF COMPRA INTERNACIONAL', 'Impostos e taxas'],
    ['TOP SP TARIF.', 'Transporte'],
    ['AUTOPASS S.A.', 'Transporte'],
    ['Emv Cmt.000001', 'Transporte'],
    ['HIROTA FOOD LOJA', 'Mercado'],
    ['SUP BAIRRO', 'Mercado'],
    ['DL .GOOGLE Clash of', 'Lazer'],
    ['PAGAMENTO DE BOLETO OUTROS BANCOS CONSTRUTORA EXEMPLO EMPR IMOB', 'Moradia'],
    ['PIX ENVIADO ESCOLA EXEMPLO EDUCACIONAL LTDA', 'Educação'],
    ['PIX ENVIADO Loja Exemplo Supplements', 'Saúde'],
    ['CASA DO CHURRASCO', 'Alimentação'],
    ['LOJA DO ACAI', 'Alimentação'],
  ])('%s → %s', async (desc, nome) => {
    expect(await sugerir(desc)).toBe(b.cat('despesa', nome))
  })

  it('receitas', async () => {
    expect(await sugerir('SALÁRIO EMPRESA X', 'receita')).toBe(b.cat('receita', 'Salário'))
    expect(await sugerir('ESTORNO COMPRA', 'receita')).toBe(b.cat('receita', 'Reembolso'))
    expect(await sugerir('RENDIMENTO POUPANCA', 'receita')).toBe(b.cat('receita', 'Rendimentos'))
    expect(await sugerir('REMUNERACAO APLICACAO AUTOMATICA', 'receita')).toBe(b.cat('receita', 'Rendimentos'))
    expect(await sugerir('RESGATE CDB/RDB', 'receita')).toBeNull() // resgate não é rendimento (é o seu dinheiro voltando)
  })

  it('não sugere nada quando não reconhece, nem para o tipo errado', async () => {
    expect(await sugerir('PIX ENVIADO FULANO')).toBeNull()
    expect(await sugerir('SALARIO', 'despesa')).toBeNull()
    expect(await sugerir('UBER', 'receita')).toBeNull()
    expect(await sugerir('UBER', 'transferencia')).toBeNull()
    expect(await sugerir('')).toBeNull()
  })

  it('palavra solta não confunde: "BARBEARIA" não é Lazer (bar), "TIMAO" não é conta de celular', async () => {
    expect(await sugerir('BARBEARIA DO ZE')).toBeNull()
    expect(await sugerir('LOJA TIMAO')).toBeNull()
  })

  it('se a categoria foi renomeada ou não existe, não sugere uma inexistente', async () => {
    await db.categorias.update(b.cat('despesa', 'Transporte'), { nome: 'Locomoção' })
    expect(await sugerir('UBER *TRIP')).toBeNull()
  })
})

describe('aprendendo com você', () => {
  it('aprende, sugere e a regra aprendida vence a pronta', async () => {
    const lazer = b.cat('despesa', 'Lazer')
    expect(await aprender('UBER *TRIP', 'despesa', lazer)).toBe(true) // você diz que Uber é Lazer
    expect(await sugerir('UBER *TRIP 15/11')).toBe(lazer)
    expect(await sugerir('UBER *EATS')).toBe(b.cat('despesa', 'Transporte')) // outra identidade: vale a regra pronta
  })

  it('regra curta (3 letras) também funciona', async () => {
    await aprender('Zen', 'despesa', b.cat('despesa', 'Lazer'))
    expect(await sugerir('ZEN 12/11')).toBe(b.cat('despesa', 'Lazer'))
  })

  it('palavra de receita numa despesa não atrapalha a regra de despesa', async () => {
    expect(await sugerir('ESTORNO DE TARIFA')).toBe(b.cat('despesa', 'Impostos e taxas'))
    expect(await sugerir('ESTORNO DE TARIFA', 'receita')).toBe(b.cat('receita', 'Reembolso'))
  })

  it('regra contida na descrição: a mais específica vence', async () => {
    await aprender('PADARIADOZE', 'despesa', b.cat('despesa', 'Alimentação'))
    await aprender('PADARIADOZE FILIAL', 'despesa', b.cat('despesa', 'Presentes'))
    expect(await sugerir('PAG*PADARIADOZE 12/11 CENTRO')).toBe(b.cat('despesa', 'Alimentação'))
    expect(await sugerir('COMPRA PADARIADOZE FILIAL NORTE')).toBe(b.cat('despesa', 'Presentes'))
  })

  it('reensinar troca a categoria, sem criar regra duplicada; despesa e receita não se misturam', async () => {
    await aprender('FULANO', 'despesa', b.cat('despesa', 'Presentes'))
    await aprender('FULANO', 'despesa', b.cat('despesa', 'Lazer'))
    await aprender('FULANO', 'receita', b.cat('receita', 'Reembolso'))
    const rs = await regras()
    expect(rs.length).toBe(2)
    expect(await sugerir('PIX ENVIADO FULANO')).toBe(b.cat('despesa', 'Lazer'))
    expect(await sugerir('PIX RECEBIDO FULANO', 'receita')).toBe(b.cat('receita', 'Reembolso'))
    expect(rs.find((r) => r.tipo === 'despesa').usos).toBe(2)
  })

  it('não aprende o que não dá para identificar nem categoria do tipo errado', async () => {
    expect(await aprender('12/11', 'despesa', b.cat('despesa', 'Lazer'))).toBe(false)
    expect(await aprender('AB', 'despesa', b.cat('despesa', 'Lazer'))).toBe(false)
    await aprender('LOJA XPTO', 'despesa', b.cat('receita', 'Salário')) // categoria de receita numa despesa
    await aprender('LOJA XPTO', 'transferencia', b.cat('despesa', 'Lazer'))
    expect(await db.regras.count()).toBe(0)
  })

  it('apagar regra volta a usar a pronta; apagar categoria apaga as regras dela', async () => {
    await aprender('UBER TRIP', 'despesa', b.cat('despesa', 'Lazer'))
    const [r] = await regras()
    await apagarRegra(r.id)
    expect(await sugerir('UBER *TRIP')).toBe(b.cat('despesa', 'Transporte'))
    const nova = await salvarCategoria({ nome: 'Academia', tipo: 'despesa' })
    await aprender('SMART FIT', 'despesa', nova)
    await excluirCategoria(nova)
    expect(await db.regras.count()).toBe(0)
  })
})

describe('categorização na importação', () => {
  it('sugere pela regra pronta e aprende quando você troca a categoria', async () => {
    const destino = { tipo: 'conta', id: b.conta('Inter') }
    const dados = async () => ({ lancamentos: await db.lancamentos.toArray(), contas: await db.contas.toArray(), cartoes: await db.cartoes.toArray(), categorias: await categorias() })
    const sug = async () => { const rs = await regras(), cs = await categorias(); return (d, t) => sugerirCategoria(d, t, rs, cs) }
    const { itens } = prepararImportacao({ extrato: lerOFX(OFX_XML_CONTA), destino, dados: await dados(), sugerir: await sug() })
    expect(itens[0].categoriaId).toBe(b.cat('despesa', 'Transporte')) // UBER
    expect(itens[2].categoriaId).toBe(b.cat('receita', 'Reembolso')) // "PIX RECEBIDO - Reembolso jantar" tem a palavra reembolso

    // você troca para Presente
    const ajustados = itens.map((i) => (i.posicao === 3 ? { ...i, categoriaId: b.cat('receita', 'Presente'), categoriaEscolhida: true } : i))
    await executarImportacao({ itens: ajustados, destino })
    await aprenderComImportacao(ajustados.filter((i) => i.acao !== 'ignorar'))
    expect((await regras()).map((r) => r.padrao)).toEqual(['REEMBOLSO JANTAR'])
    // da próxima vez, o que você ensinou vence a regra pronta
    expect(sugerirCategoria('PIX RECEBIDO - Reembolso jantar', 'receita', await regras(), await categorias())).toBe(b.cat('receita', 'Presente'))
    // linhas em que você não mexeu não viram regra
    expect((await regras()).some((r) => r.padrao.includes('UBER'))).toBe(false)
  })
})
