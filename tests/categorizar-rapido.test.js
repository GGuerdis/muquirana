import { describe, it, expect, beforeEach } from 'vitest'
import { gruposParaCategorizar, categorizarGrupo, chaveDescricao, sugerirCategoria } from '../src/lib/categorizar.js'
import { salvarLancamento } from '../src/lib/lancamentos.js'
import { db } from '../src/lib/db.js'
import { bancoNovo } from './ajuda.js'

describe('categorizar rápido por loja', () => {
  let b
  beforeEach(async () => { b = await bancoNovo() })
  const lanca = (descricao, valor, cat = 'Outros', tipo = 'despesa', data = '2026-01-10') =>
    salvarLancamento({ tipo, valor, categoriaId: b.cat(tipo, cat), contaId: b.conta('Santander'), cartaoId: null, data, parcelas: 1, descricao })

  it('junta pela loja/pessoa, do mais frequente para o menos, e só os que estão em Outros', async () => {
    await lanca('PIX ENVIADO Ciclano Pereira', 1000)
    await lanca('PIX ENVIADO Ciclano Pereira', 2000)
    await lanca('PIX ENVIADO Ciclano Pereira', 3000)
    await lanca('PIX ENVIADO Beltrana Souza', 500)
    await lanca('UBER TRIP', 900, 'Transporte')
    await lanca('PIX RECEBIDO Ciclano Pereira', 7000, 'Outros', 'receita')
    const L = await db.lancamentos.toArray(), C = await db.categorias.toArray()
    const g = gruposParaCategorizar(L, C)
    expect(g.map((x) => [x.tipo, x.chave, x.n, x.total])).toEqual([
      ['despesa', 'CICLANO PEREIRA', 3, 6000],
      ['receita', 'CICLANO PEREIRA', 1, 7000], // entrada e saída da mesma pessoa ficam separadas; empate: maior valor primeiro
      ['despesa', 'BELTRANA SOUZA', 1, 500],
    ])
    expect(gruposParaCategorizar(L, C, { soOutros: false }).map((x) => x.chave)).toContain('UBER TRIP')
    expect(gruposParaCategorizar(L, C, { soOutros: false, busca: 'uber' }).map((x) => x.chave)).toEqual(['UBER TRIP'])
  })

  it('escolher a categoria muda todos do grupo e o app aprende para a próxima importação', async () => {
    await lanca('PAGAMENTO DE BOLETO OUTROS BANCOS PLANO EXEMPLO EMPR IMOB L', 140000, 'Moradia', 'despesa', '2026-01-10')
    await lanca('PAGAMENTO DE BOLETO OUTROS BANCOS PLANO EXEMPLO EMPR IMOB L', 141000, 'Moradia', 'despesa', '2026-02-10')
    await lanca('PAGAMENTO DE BOLETO OUTROS BANCOS CONDOMINIO XYZ', 50000, 'Contas da casa')
    const apto = await db.categorias.add({ nome: 'Apartamento', emoji: '🏷️', tipo: 'despesa' })
    const [g] = gruposParaCategorizar(await db.lancamentos.toArray(), await db.categorias.toArray(), { soOutros: false, busca: 'exemplo' })
    expect(g.chave).toBe('PLANO EXEMPLO EMPR') // "OUTROS BANCOS" não é a empresa
    expect(await categorizarGrupo(g, apto)).toBe(2)
    const L = await db.lancamentos.toArray()
    expect(L.filter((l) => l.categoriaId === apto).length).toBe(2)
    expect(L.find((l) => /CONDOMINIO/.test(l.descricao)).categoriaId).toBe(b.cat('despesa', 'Contas da casa')) // outro boleto não muda
    const sug = sugerirCategoria('PAGAMENTO DE BOLETO OUTROS BANCOS PLANO EXEMPLO EMPR IMOB L', 'despesa', await db.regras.toArray(), await db.categorias.toArray())
    expect(sug).toBe(apto)
  })

  it('categoria do tipo errado é recusada', async () => {
    await lanca('PIX ENVIADO Ciclano Pereira', 1000)
    const [g] = gruposParaCategorizar(await db.lancamentos.toArray(), await db.categorias.toArray())
    await expect(categorizarGrupo(g, b.cat('receita', 'Salário'))).rejects.toThrow('Categoria inválida')
  })

  it('boletos de empresas diferentes não se misturam', () => {
    expect(chaveDescricao('PAGAMENTO DE BOLETO OUTROS BANCOS EMPRESA UM')).toBe('EMPRESA UM')
    expect(chaveDescricao('PAGAMENTO DE BOLETO OUTROS BANCOS EMPRESA DOIS')).toBe('EMPRESA DOIS')
  })

  it('transferências e pagamentos de fatura não entram', () => {
    const L = [
      { id: 1, tipo: 'transferencia', descricao: 'PIX ENVIADO Fulano', valor: 1 },
      { id: 2, tipo: 'pagamentoFatura', descricao: 'Pagamento de fatura', valor: 1 },
    ]
    expect(gruposParaCategorizar(L, [])).toEqual([])
  })
})
