// Importação de extrato: monta a prévia (com detecção de duplicados) e grava tudo de uma vez.
import { db } from './db.js'
import { salvarLancamento, pagarFatura } from './lancamentos.js'
import { faturaDaCompra, faturasPendentes } from './fatura.js'
import { somarMesesData } from './datas.js'
import { saldoConta } from './calculos.js'

export const normalizar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

const diasEntre = (a, b) => {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.abs(Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000
}

// Parcela na descrição de fatura de cartão: "LOJA PARC 03/10", "LOJA 03/10", "PARCELA 3 DE 10"
export function detectarParcela(descricao) {
  const d = normalizar(descricao)
  const m = d.match(/PARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})/) || d.match(/(?:^|\s)(\d{2})\/(\d{2})(?:\s|$)/)
  if (!m) return null
  const parcela = Number(m[1]), total = Number(m[2])
  return parcela >= 1 && total >= 2 && parcela <= total && total <= 48 ? { parcela, total } : null
}

const PARECE_PAGAMENTO_FATURA = /(PAGTO|PGTO|PAGAMENTO|PAG)\.?\s*(DE\s*)?(FATURA|CART)|FATURA\s*(DO\s*|DE\s*)?CART|CARTAO\s*(DE\s*)?CREDITO/

// Qual fatura um pagamento de `valor` em `data` está quitando? A pendente com vencimento mais perto da data
// e que ainda comporta o valor. Retorna null se nenhuma servir.
export function faturaParaPagamento(cartao, data, valor, lancamentos) {
  const opcoes = faturasPendentes(cartao, lancamentos, data).filter((f) => f.restante >= valor)
  if (!opcoes.length) return null
  opcoes.sort((a, b) => diasEntre(a.vencimento, data) - diasEntre(b.vencimento, data))
  return opcoes[0].fatura
}

// Lançamentos já existentes que podem ser "o mesmo" que uma linha do extrato
function candidatosConta(contaId, lancamentos) {
  const saidas = []
  const entradas = []
  for (const l of lancamentos) {
    if (l.tipo === 'despesa' && l.contaId === contaId && !l.cartaoId) saidas.push(l)
    else if (l.tipo === 'pagamentoFatura' && l.contaId === contaId) saidas.push(l)
    else if (l.tipo === 'transferencia' && l.contaId === contaId) saidas.push(l)
    else if (l.tipo === 'transferencia' && l.contaDestinoId === contaId) entradas.push(l)
    else if (l.tipo === 'receita' && l.contaId === contaId) entradas.push(l)
  }
  return { saidas, entradas }
}

/**
 * Monta a prévia da importação. Nada é gravado aqui.
 * @param extrato resultado de lerOFX
 * @param destino { tipo: 'conta' | 'cartao', id }
 * @param faturaCartao mês da fatura ('AAAA-MM') quando o destino é cartão
 * @param dados { lancamentos, contas, cartoes, categorias }
 * @param sugerir (descricao, tipo) => categoriaId | null
 */
export function prepararImportacao({ extrato, destino, faturaCartao = null, dados, sugerir = () => null }) {
  const { lancamentos, cartoes, categorias } = dados
  const outros = (tipo) => categorias.find((c) => c.tipo === tipo && normalizar(c.nome) === 'OUTROS')?.id ?? categorias.find((c) => c.tipo === tipo)?.id ?? null
  const existentesIds = new Set(lancamentos.filter((l) => l.idExterno).map((l) => l.idExterno))
  const usados = new Set()
  const ordinal = new Map()
  const cartaoDestino = destino.tipo === 'cartao' ? cartoes.find((c) => c.id === destino.id) : null
  const { saidas, entradas } = destino.tipo === 'conta' ? candidatosConta(destino.id, lancamentos) : { saidas: [], entradas: [] }
  const comprasCartao = cartaoDestino ? lancamentos.filter((l) => l.tipo === 'despesa' && l.cartaoId === cartaoDestino.id) : []

  const itens = extrato.transacoes.map((t) => {
    const entrada = t.valor > 0
    const valor = Math.abs(t.valor)
    // Identificador estável: o FITID do banco; sem ele, data+valor+descrição (+ordem, para linhas idênticas)
    let chave
    if (t.fitid) chave = `f:${t.fitid}`
    else {
      const base = `s:${t.data}:${t.valor}:${normalizar(t.descricao)}`
      const n = (ordinal.get(base) || 0) + 1
      ordinal.set(base, n)
      chave = `${base}:${n}`
    }
    const idExterno = `${destino.tipo}:${destino.id}:${chave}`
    const tipo = entrada ? 'receita' : 'despesa'
    const item = {
      posicao: t.posicao,
      data: t.data,
      dataLancamento: t.data,
      valor,
      entrada,
      descricao: t.descricao,
      idExterno,
      situacao: 'novo',
      motivo: '',
      acao: 'lancar',
      tipo,
      categoriaId: sugerir(t.descricao, tipo) ?? outros(tipo),
      contaOutraId: null,
      cartaoPagoId: null,
      faturaPaga: null,
      parcela: null,
      duplicadoDe: null,
    }

    if (existentesIds.has(idExterno)) {
      return { ...item, situacao: 'importado', acao: 'ignorar', motivo: 'Já importado antes' }
    }

    if (cartaoDestino) {
      if (entrada) return { ...item, situacao: 'credito', acao: 'ignorar', motivo: 'Pagamento ou estorno no cartão: não entra como gasto' }
      const parcela = detectarParcela(t.descricao)
      item.parcela = parcela
      // Parcela antiga com a data da compra original: leva a data para o mês da parcela
      if (parcela && parcela.parcela > 1 && faturaCartao && faturaDaCompra(cartaoDestino, t.data) < faturaCartao) {
        item.dataLancamento = somarMesesData(t.data, parcela.parcela - 1)
      }
      const dup = comprasCartao
        .filter((l) => !usados.has(l.id) && l.valor === valor && (l.fatura === faturaCartao || diasEntre(l.data, item.dataLancamento) <= 2))
        .sort((a, b) => diasEntre(a.data, item.dataLancamento) - diasEntre(b.data, item.dataLancamento))[0]
      if (dup) {
        usados.add(dup.id)
        return { ...item, situacao: 'duplicado', acao: 'ignorar', duplicadoDe: dup.id, motivo: 'Parece que já foi lançado' }
      }
      return item
    }

    // Conta: procura um lançamento manual igual (mesmo valor e direção, até 2 dias de diferença)
    const dup = (entrada ? entradas : saidas)
      .filter((l) => !usados.has(l.id) && l.valor === valor && diasEntre(l.data, t.data) <= 2)
      .sort((a, b) => diasEntre(a.data, t.data) - diasEntre(b.data, t.data))[0]
    if (dup) {
      usados.add(dup.id)
      return { ...item, situacao: 'duplicado', acao: 'ignorar', duplicadoDe: dup.id, motivo: 'Parece que já foi lançado' }
    }

    if (!entrada && cartoes.length && PARECE_PAGAMENTO_FATURA.test(normalizar(t.descricao))) {
      const desc = normalizar(t.descricao)
      const cartao = cartoes.find((c) => desc.includes(normalizar(c.nome))) || cartoes.find((c) => c.contaPagamentoId === destino.id) || cartoes[0]
      const fatura = faturaParaPagamento(cartao, t.data, valor, lancamentos)
      if (fatura) return { ...item, acao: 'fatura', cartaoPagoId: cartao.id, faturaPaga: fatura, motivo: 'Parece pagamento de fatura' }
      return { ...item, acao: 'ignorar', cartaoPagoId: cartao.id, motivo: 'Parece pagamento de fatura, mas não há fatura em aberto com esse valor no app' }
    }
    return item
  })

  const conta = (s) => itens.filter((i) => i.situacao === s).length
  return {
    itens,
    resumo: {
      total: itens.length,
      novos: conta('novo'),
      importados: conta('importado'),
      duplicados: conta('duplicado'),
      creditos: conta('credito'),
    },
  }
}

// Confere se o item está pronto para gravar. Retorna a mensagem de erro ou null.
export function problemaDoItem(item, destino) {
  if (item.acao === 'ignorar' || item.situacao === 'importado') return null
  if (destino.tipo === 'cartao' && item.acao !== 'lancar') return 'No cartão, a linha só pode ser lançada ou ignorada.'
  if (item.acao === 'lancar' && !item.categoriaId) return 'Escolha a categoria.'
  if (item.acao === 'transferencia' && (!item.contaOutraId || item.contaOutraId === destino.id)) return 'Escolha a outra conta da transferência.'
  if (item.acao === 'fatura') {
    if (item.entrada) return 'Entrada de dinheiro não pode ser pagamento de fatura.'
    if (!item.cartaoPagoId) return 'Escolha o cartão.'
    if (!item.faturaPaga) return 'Não há fatura em aberto que comporte esse valor neste cartão.'
  }
  return null
}

const itensParaGravar = (itens) => itens.filter((i) => i.acao !== 'ignorar' && i.situacao !== 'importado')

/**
 * Grava a importação: tudo ou nada. Se qualquer linha falhar, nenhuma é gravada.
 * Retorna quantos lançamentos foram criados.
 */
export async function executarImportacao({ itens, destino, faturaCartao = null }) {
  const gravar = itensParaGravar(itens)
  for (const i of gravar) {
    const p = problemaDoItem(i, destino)
    if (p) throw new Error(`Linha ${i.posicao} (${i.descricao}): ${p}`)
  }
  return db.transaction('rw', db.lancamentos, db.contas, db.cartoes, db.categorias, async () => {
    let criados = 0
    for (const i of gravar) {
      try {
        if (destino.tipo === 'cartao') {
          await salvarLancamento({ tipo: 'despesa', valor: i.valor, descricao: i.descricao, categoriaId: i.categoriaId, contaId: null, cartaoId: destino.id, data: i.dataLancamento, parcelas: 1, faturaFixa: faturaCartao, idExterno: i.idExterno })
        } else if (i.acao === 'lancar') {
          await salvarLancamento({ tipo: i.entrada ? 'receita' : 'despesa', valor: i.valor, descricao: i.descricao, categoriaId: i.categoriaId, contaId: destino.id, cartaoId: null, data: i.data, parcelas: 1, idExterno: i.idExterno })
        } else if (i.acao === 'transferencia') {
          const [origem, destinoT] = i.entrada ? [i.contaOutraId, destino.id] : [destino.id, i.contaOutraId]
          await salvarLancamento({ tipo: 'transferencia', valor: i.valor, descricao: i.descricao, contaId: origem, contaDestinoId: destinoT, cartaoId: null, data: i.data, parcelas: 1, idExterno: i.idExterno })
        } else if (i.acao === 'fatura') {
          await pagarFatura({ cartaoId: i.cartaoPagoId, fatura: i.faturaPaga, contaId: destino.id, valor: i.valor, data: i.data, idExterno: i.idExterno })
        }
        criados++
      } catch (e) {
        throw new Error(`Linha ${i.posicao} (${i.descricao}): ${e.message}`)
      }
    }
    return criados
  })
}

// Conferência com o saldo informado no extrato: como ficará o saldo da conta no app na data do extrato
export function conferirSaldo({ extrato, destino, itens, lancamentos, conta }) {
  if (destino.tipo !== 'conta' || !extrato.saldo || !conta) return null
  const simulados = itensParaGravar(itens).map((i) => {
    if (i.acao === 'transferencia') return i.entrada ? { tipo: 'transferencia', contaId: -1, contaDestinoId: conta.id, valor: i.valor, data: i.data } : { tipo: 'transferencia', contaId: conta.id, contaDestinoId: -1, valor: i.valor, data: i.data }
    if (i.acao === 'fatura') return { tipo: 'pagamentoFatura', contaId: conta.id, valor: i.valor, data: i.data }
    return { tipo: i.entrada ? 'receita' : 'despesa', contaId: conta.id, cartaoId: null, valor: i.valor, data: i.data }
  })
  const noApp = saldoConta(conta, [...lancamentos, ...simulados], extrato.saldo.data)
  return { data: extrato.saldo.data, noExtrato: extrato.saldo.valor, noApp, diferenca: noApp - extrato.saldo.valor }
}
