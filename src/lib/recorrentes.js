// Contas fixas (recorrentes): aluguel, assinaturas, salário, luz...
// O app mostra as do mês e você confirma cada uma com um toque (podendo ajustar o valor).
import { db } from './db.js'
import { valorValido } from './dinheiro.js'
import { dataNoMes, hoje as hojeTexto, mesDe } from './datas.js'
import { diaValido, faturaDaCompra, faturasPendentes, vencimentoDaFatura } from './fatura.js'
import { saldoConta } from './calculos.js'

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/

export function validarRecorrente(r, { contas, cartoes, categorias }) {
  if (!(r.descricao || '').trim()) return 'Dê um nome para a conta fixa.'
  if (!['despesa', 'receita'].includes(r.tipo)) return 'Tipo inválido.'
  if (!valorValido(r.valor)) return 'Informe o valor.'
  if (!diaValido(r.dia)) return 'O dia deve ser de 1 a 31.'
  const cat = categorias.find((c) => c.id === r.categoriaId)
  if (!cat || cat.tipo !== r.tipo) return 'Escolha a categoria.'
  const temConta = r.contaId != null, temCartao = r.cartaoId != null
  if (temConta === temCartao) return 'Escolha uma conta ou um cartão.'
  if (temCartao && r.tipo !== 'despesa') return 'Receita não pode ser no cartão.'
  if (temConta && !contas.some((c) => c.id === r.contaId)) return 'Conta não encontrada.'
  if (temCartao && !cartoes.some((c) => c.id === r.cartaoId)) return 'Cartão não encontrado.'
  if (!MES_VALIDO.test(r.inicio || '')) return 'Mês de início inválido.'
  if (r.fim != null && (!MES_VALIDO.test(r.fim) || r.fim < r.inicio)) return 'O mês final deve ser depois do início.'
  return null
}

export async function salvarRecorrente(dados) {
  const r = {
    descricao: (dados.descricao || '').trim().slice(0, 60),
    tipo: dados.tipo,
    valor: dados.valor,
    dia: Number(dados.dia),
    categoriaId: dados.categoriaId,
    contaId: dados.contaId ?? null,
    cartaoId: dados.cartaoId ?? null,
    inicio: dados.inicio,
    fim: dados.fim || null,
    pulados: Array.isArray(dados.pulados) ? dados.pulados : [],
  }
  return db.transaction('rw', db.recorrentes, db.contas, db.cartoes, db.categorias, async () => {
    const [contas, cartoes, categorias] = await Promise.all([db.contas.toArray(), db.cartoes.toArray(), db.categorias.toArray()])
    const erro = validarRecorrente(r, { contas, cartoes, categorias })
    if (erro) throw new Error(erro)
    if (dados.id == null) return db.recorrentes.add(r)
    if (!(await db.recorrentes.get(dados.id))) throw new Error('Conta fixa não encontrada.')
    await db.recorrentes.put({ ...r, id: dados.id })
    return dados.id
  })
}

export const excluirRecorrente = (id) => db.recorrentes.delete(id)

export async function pularMes(id, mes, pular = true) {
  if (!MES_VALIDO.test(mes)) throw new Error('Mês inválido.')
  return db.transaction('rw', db.recorrentes, async () => {
    const r = await db.recorrentes.get(id)
    if (!r) throw new Error('Conta fixa não encontrada.')
    const pulados = new Set(r.pulados || [])
    if (pular) pulados.add(mes)
    else pulados.delete(mes)
    await db.recorrentes.update(id, { pulados: [...pulados].sort() })
  })
}

const ativaNoMes = (r, mes) => r.inicio <= mes && (!r.fim || mes <= r.fim)

// Situação das contas fixas num mês: lancada | pulada | atrasada | pendente
export function contasDoMes(mes, recorrentes, lancamentos, dia = hojeTexto()) {
  return recorrentes
    .filter((r) => ativaNoMes(r, mes))
    .map((r) => {
      const vencimento = dataNoMes(mes, r.dia)
      const lancamento = lancamentos.find((l) => l.recorrenteId === r.id && l.competencia === mes) || null
      let situacao = 'pendente'
      if (lancamento) situacao = 'lancada'
      else if ((r.pulados || []).includes(mes)) situacao = 'pulada'
      else if (vencimento < dia) situacao = 'atrasada'
      return { recorrente: r, mes, vencimento, lancamento, situacao }
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.recorrente.id - b.recorrente.id)
}

// Dados para abrir o formulário de lançamento já preenchido
export function modeloDoMes(r, mes) {
  return {
    tipo: r.tipo,
    valor: r.valor,
    descricao: r.descricao,
    categoriaId: r.categoriaId,
    contaId: r.contaId ?? null,
    cartaoId: r.cartaoId ?? null,
    contaDestinoId: null,
    data: dataNoMes(mes, r.dia),
    parcelas: 1,
    recorrenteId: r.id,
    competencia: mes,
  }
}

/**
 * Quanto você terá nas contas no fim do mês `mes` (normalmente o atual):
 * saldo de hoje + lançamentos já agendados até o fim do mês
 * ± contas fixas que ainda não foram lançadas (nem puladas)
 * − faturas de cartão que vencem até o fim do mês e ainda não foram pagas.
 */
export function saldoPrevisto({ mes, contas, cartoes, recorrentes, lancamentos, dia = hojeTexto() }) {
  const fimMes = dataNoMes(mes, 31)
  const saldoHoje = contas.reduce((s, c) => s + saldoConta(c, lancamentos, dia), 0)
  const saldoFimComAgendados = contas.reduce((s, c) => s + saldoConta(c, lancamentos, fimMes), 0)
  const agendados = saldoFimComAgendados - saldoHoje

  const pendentes = contasDoMes(mes, recorrentes, lancamentos, dia).filter((x) => x.situacao === 'pendente' || x.situacao === 'atrasada')
  let contasFixas = 0
  const fixasNoCartao = new Map() // cartaoId → [{ fatura, valor }]
  for (const p of pendentes) {
    const r = p.recorrente
    if (r.contaId != null) contasFixas += r.tipo === 'receita' ? r.valor : -r.valor
    else if (r.cartaoId != null) {
      const lista = fixasNoCartao.get(r.cartaoId) || []
      lista.push({ data: p.vencimento, valor: r.valor })
      fixasNoCartao.set(r.cartaoId, lista)
    }
  }

  let faturas = 0
  for (const c of cartoes) {
    for (const f of faturasPendentes(c, lancamentos, dia)) {
      // inclui as atrasadas (vencimento antes deste mês) e as que vencem até o fim do mês
      if (f.vencimento <= fimMes) faturas += f.restante
    }
    for (const x of fixasNoCartao.get(c.id) || []) {
      const venc = vencimentoDaFatura(c, faturaDaCompra(c, x.data))
      if (venc <= fimMes) faturas += x.valor
    }
  }

  return {
    saldoHoje,
    agendados,
    contasFixas,
    faturas,
    previsto: saldoFimComAgendados + contasFixas - faturas,
    fimMes,
    mesAtual: mesDe(dia) === mes,
  }
}
