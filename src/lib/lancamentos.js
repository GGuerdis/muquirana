// Criar, editar e apagar lançamentos (inclusive compras parceladas) e pagar faturas.
// Toda gravação é validada aqui, mesmo que a tela já tenha validado antes.
import { db } from './db.js'
import { dividirParcelas, valorValido, formatar } from './dinheiro.js'
import { somarMeses, somarMesesData, dataValida } from './datas.js'
import { faturaDaCompra, resumoFatura } from './fatura.js'

export const MAX_PARCELAS = 48
const TIPOS = ['despesa', 'receita', 'transferencia']

const novoId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

// Retorna a mensagem de erro, ou null se estiver tudo certo.
// `refs`: { contas, cartoes, categorias } (listas)
export function validarLancamento(form, { contas, cartoes, categorias }) {
  const temConta = (id) => contas.some((c) => c.id === id)
  if (!TIPOS.includes(form.tipo)) return 'Tipo de lançamento inválido.'
  if (!valorValido(form.valor)) return 'Coloca o valor aí, muquirana.'
  if (!dataValida(form.data)) return 'Data inválida.'

  if (form.tipo !== 'transferencia') {
    const cat = categorias.find((c) => c.id === form.categoriaId)
    if (!cat) return 'Escolha uma categoria.'
    if (cat.tipo !== form.tipo) return 'Essa categoria não é deste tipo de lançamento.'
  }

  if (form.tipo === 'transferencia') {
    if (!temConta(form.contaId)) return 'Escolha de onde saiu o dinheiro.'
    if (!temConta(form.contaDestinoId)) return 'Escolha a conta de destino.'
    if (form.contaId === form.contaDestinoId) return 'Origem e destino são a mesma conta.'
    return null
  }

  if (form.tipo === 'despesa' && form.cartaoId != null) {
    if (form.contaId != null) return 'Escolha conta OU cartão, não os dois.'
    if (!cartoes.some((c) => c.id === form.cartaoId)) return 'Cartão não encontrado.'
    const n = form.parcelas ?? 1
    if (!Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) return `Parcelas devem ser de 1 a ${MAX_PARCELAS}.`
    if (form.valor < n) return 'Valor pequeno demais para tantas parcelas.'
    return null
  }

  if (form.cartaoId != null) return 'Receita não pode ser lançada no cartão de crédito.'
  if ((form.parcelas ?? 1) !== 1) return 'Só compras no cartão podem ser parceladas.'
  if (!temConta(form.contaId)) return form.tipo === 'receita' ? 'Escolha em que conta entrou.' : 'Escolha de onde saiu o dinheiro.'
  return null
}

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/

// Campos extras usados pela importação e pelas contas fixas
function validarExtras(form) {
  if (form.idExterno != null && (typeof form.idExterno !== 'string' || !form.idExterno || form.idExterno.length > 300)) return 'Identificador de importação inválido.'
  if (form.faturaFixa != null) {
    if (form.tipo !== 'despesa' || form.cartaoId == null) return 'Fatura fixa só vale para compra no cartão.'
    if ((form.parcelas ?? 1) !== 1) return 'Fatura fixa não vale para compra parcelada.'
    if (!MES_VALIDO.test(form.faturaFixa)) return 'Mês da fatura inválido.'
  }
  if (form.recorrenteId != null && !MES_VALIDO.test(form.competencia || '')) return 'Mês da conta fixa inválido.'
  return null
}

async function carregarRefs() {
  const [contas, cartoes, categorias] = await Promise.all([db.contas.toArray(), db.cartoes.toArray(), db.categorias.toArray()])
  return { contas, cartoes, categorias }
}

// `form`: { tipo, valor, descricao, categoriaId, contaId, contaDestinoId, cartaoId, data, parcelas,
//           idExterno?, faturaFixa?, recorrenteId?, competencia? }
// Ao editar, o lançamento original (e todas as parcelas dele) é substituído, tudo numa transação só:
// se algo falhar, nada é alterado.
export async function salvarLancamento(form, original = null) {
  return db.transaction('rw', db.lancamentos, db.cartoes, db.contas, db.categorias, async () => {
    const refs = await carregarRefs()
    const erro = validarLancamento(form, refs) || validarExtras(form)
    if (erro) throw new Error(erro)

    // Ao editar, mantém a "identidade" do original: de onde foi importado e de qual conta fixa veio
    const idExterno = form.idExterno ?? original?.idExterno ?? null
    const recorrenteId = form.recorrenteId ?? original?.recorrenteId ?? null
    const competencia = form.competencia ?? original?.competencia ?? null
    if (idExterno) {
      const repetido = await db.lancamentos.where('idExterno').equals(idExterno).filter((l) => !original || !mesmoLancamento(l, original)).count()
      if (repetido) throw new Error('Este lançamento já foi importado antes.')
    }
    const n = form.parcelas ?? 1
    let faturaFixa = form.faturaFixa ?? null
    // Compra importada mantém a fatura que veio do banco, se o cartão e a data não mudaram
    if (!faturaFixa && original?.faturaFixa && form.cartaoId === original.cartaoId && form.data === original.data && n === 1) faturaFixa = original.fatura

    if (original) await apagarLancamento(original)
    const base = {
      tipo: form.tipo,
      descricao: (form.descricao || '').trim().slice(0, 80),
      categoriaId: form.tipo === 'transferencia' ? null : form.categoriaId,
      data: form.data,
      criadoEm: original?.criadoEm || Date.now(),
      ...(recorrenteId != null ? { recorrenteId, competencia } : {}),
    }
    const comId = (r) => (idExterno ? { ...r, idExterno } : r)

    if (form.tipo === 'transferencia') {
      return db.lancamentos.add(comId({ ...base, valor: form.valor, contaId: form.contaId, contaDestinoId: form.contaDestinoId, cartaoId: null }))
    }
    if (form.tipo === 'despesa' && form.cartaoId != null) {
      const cartao = refs.cartoes.find((c) => c.id === form.cartaoId)
      if (faturaFixa) {
        return db.lancamentos.add(comId({ ...base, valor: form.valor, cartaoId: cartao.id, contaId: null, fatura: faturaFixa, faturaFixa: true }))
      }
      const valores = dividirParcelas(form.valor, n)
      const fatura1 = faturaDaCompra(cartao, form.data)
      const grupo = n > 1 ? novoId() : null
      const registros = valores.map((valor, i) => {
        const r = {
          ...base,
          valor,
          cartaoId: cartao.id,
          contaId: null,
          data: somarMesesData(form.data, i),
          fatura: somarMeses(fatura1, i),
          ...(grupo ? { grupoParcelaId: grupo, parcela: i + 1, totalParcelas: n, valorTotal: form.valor, dataCompra: form.data } : {}),
        }
        return i === 0 ? comId(r) : r // o identificador de importação fica só na 1ª parcela
      })
      return db.lancamentos.bulkAdd(registros)
    }
    return db.lancamentos.add(comId({ ...base, valor: form.valor, contaId: form.contaId, cartaoId: null }))
  })
}

const mesmoLancamento = (l, original) => (original.grupoParcelaId ? l.grupoParcelaId === original.grupoParcelaId : l.id === original.id)

export async function apagarLancamento(lanc) {
  if (lanc.grupoParcelaId) {
    await db.lancamentos.where('grupoParcelaId').equals(lanc.grupoParcelaId).delete()
  } else {
    await db.lancamentos.delete(lanc.id)
  }
}

// Para editar uma compra parcelada, o formulário mostra a compra inteira (valor total, data da compra)
// Só os campos do formulário: o resto (id, fatura, identificador de importação) é cuidado pelo salvarLancamento.
export function formDoLancamento(l) {
  const form = {
    tipo: l.tipo,
    valor: l.valor,
    descricao: l.descricao || '',
    categoriaId: l.categoriaId ?? null,
    contaId: l.contaId ?? null,
    contaDestinoId: l.contaDestinoId ?? null,
    cartaoId: l.cartaoId ?? null,
    data: l.data,
    parcelas: 1,
  }
  if (l.grupoParcelaId) return { ...form, valor: l.valorTotal, data: l.dataCompra, parcelas: l.totalParcelas }
  return form
}

// Paga (total ou parcialmente) uma fatura. Não aceita pagar mais do que falta.
export async function pagarFatura({ cartaoId, fatura, contaId, valor, data, idExterno = null }) {
  return db.transaction('rw', db.lancamentos, db.cartoes, db.contas, async () => {
    const cartao = await db.cartoes.get(cartaoId ?? -1)
    if (!cartao) throw new Error('Cartão não encontrado.')
    if (!(await db.contas.get(contaId ?? -1))) throw new Error('Escolha a conta que pagou.')
    if (!valorValido(valor)) throw new Error('Informe o valor pago.')
    if (!dataValida(data)) throw new Error('Data inválida.')
    if (!MES_VALIDO.test(fatura || '')) throw new Error('Fatura inválida.')
    if (idExterno && (await db.lancamentos.where('idExterno').equals(idExterno).count())) throw new Error('Este pagamento já foi importado antes.')
    const doCartao = await db.lancamentos.where('cartaoId').equals(cartaoId).toArray()
    const { restante } = resumoFatura(cartao, fatura, doCartao)
    if (valor > restante) throw new Error(`O valor passa do que falta pagar (${formatar(restante)}).`)
    return db.lancamentos.add({
      tipo: 'pagamentoFatura', cartaoId, fatura, contaId, valor, data,
      descricao: 'Pagamento de fatura', categoriaId: null, criadoEm: Date.now(),
      ...(idExterno ? { idExterno } : {}),
    })
  })
}
