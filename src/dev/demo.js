// SÓ NO AMBIENTE DE DESENVOLVIMENTO (npm run dev): carrega dados INVENTADOS para ver as telas.
// Abra http://localhost:5173/muquirana/?demo (e &aba=historico, &aba=lancamentos...). Nunca entra no app publicado.
import { db, criarDadosIniciais, salvarConfig } from '../lib/db.js'
import { salvarLancamento } from '../lib/lancamentos.js'
import { salvarCartao, salvarConta } from '../lib/cadastros.js'

export async function carregarDemo() {
  if ((await db.lancamentos.count()) > 0) return
  await criarDadosIniciais()
  await salvarConfig('boasVindas', true)
  const contas = await db.contas.toArray()
  const cats = await db.categorias.toArray()
  const c = (n) => contas.find((x) => x.nome === n).id
  const k = (t, n) => cats.find((x) => x.tipo === t && x.nome === n).id
  await salvarConta({ id: c('Santander'), nome: 'Santander', emoji: '🔴', saldoAtual: 0 })
  await salvarCartao({ nome: 'Inter', limite: 500000, diaFechamento: 10, diaVencimento: 17, contaPagamentoId: c('Santander') })
  const hoje = new Date()
  const d = (mesesAtras, dia) => new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, dia, 12).toISOString().slice(0, 10)
  const gastos = [['Mercado', 'Pão de Açúcar', 28500], ['Alimentação', 'iFood', 6490], ['Transporte', 'Uber', 2390], ['Alimentação', 'Padaria', 1590], ['Lazer', 'Cinema', 8550],
    ['Contas da casa', 'Enel', 21300], ['Assinaturas', 'Spotify', 2190], ['Saúde', 'Drogasil', 4720], ['Transporte', 'Posto Shell', 22000], ['Compras', 'Amazon', 13990],
    ['Alimentação', 'Almoço', 4290], ['Mercado', 'Hortifruti', 5890]]
  for (let mes = 5; mes >= 0; mes--) {
    await salvarLancamento({ tipo: 'receita', valor: 650000, categoriaId: k('receita', 'Salário'), contaId: c('Santander'), cartaoId: null, data: d(mes, 5), parcelas: 1, descricao: 'Salário' })
    await salvarLancamento({ tipo: 'despesa', valor: 180000, categoriaId: k('despesa', 'Moradia'), contaId: c('Santander'), cartaoId: null, data: d(mes, 10), parcelas: 1, descricao: 'Aluguel' })
    for (let i = 0; i < gastos.length; i++) {
      const [cat, desc, v] = gastos[i]
      const dia = 1 + ((i * 7 + mes * 3) % (mes === 0 ? Math.max(1, hoje.getDate() - 1) : 27))
      await salvarLancamento({ tipo: 'despesa', valor: Math.round(v * (0.8 + ((i + mes) % 5) / 10)), categoriaId: k('despesa', cat), contaId: c('Santander'), cartaoId: null, data: d(mes, dia), parcelas: 1, descricao: desc })
    }
    await salvarLancamento({ tipo: 'transferencia', valor: 50000, contaId: c('Santander'), contaDestinoId: c('Inter'), cartaoId: null, data: d(mes, 12), parcelas: 1, descricao: 'PIX para o Inter' })
  }
}
