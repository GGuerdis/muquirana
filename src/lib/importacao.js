// Importação de extrato (OFX ou PDF): monta a prévia (com detecção de duplicados) e grava tudo de uma vez.
import { db } from './db.js'
import { registrosParaImportar, pagarFatura } from './lancamentos.js'
import { faturaDaCompra, faturasPendentes } from './fatura.js'
import { somarMesesData, mesDe } from './datas.js'
import { saldoConta } from './calculos.js'
import { nomeDoBanco } from './ofx.js'
import { semControle } from './texto.js'

export const normalizar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

export const NOVA_CONTA_INVESTIMENTOS = '__nova_investimentos__'
// Conta que ainda não existe e é criada junto com a importação (ex.: "Caixa" para PIX que você fez para a sua conta na Caixa)
const PREFIXO_NOVA_CONTA = '__nova_conta__:'
export const novaConta = (nome) => `${PREFIXO_NOVA_CONTA}${nome}`
export const nomeDaNovaConta = (id) => (typeof id === 'string' && id.startsWith(PREFIXO_NOVA_CONTA) ? id.slice(PREFIXO_NOVA_CONTA.length) : null)
export const ehContaNova = (id) => id === NOVA_CONTA_INVESTIMENTOS || nomeDaNovaConta(id) !== null

// Cartão que ainda não existe e é criado junto com a importação (para ligar os pagamentos de fatura)
const PREFIXO_NOVO_CARTAO = '__novo_cartao__:'
export const novoCartao = (nome) => `${PREFIXO_NOVO_CARTAO}${nome}`
export const nomeDoNovoCartao = (id) => (typeof id === 'string' && id.startsWith(PREFIXO_NOVO_CARTAO) ? id.slice(PREFIXO_NOVO_CARTAO.length) : null)

// Dias de um cartão criado na importação, estimados pelos pagamentos: vence no dia em que mais se pagou,
// e fecha 7 dias antes (o comum no Brasil). A pessoa confere depois em Cartões.
export function diasEstimados(datas) {
  const conta = new Map()
  for (const d of datas) { const dia = Number(d.slice(8, 10)); conta.set(dia, (conta.get(dia) || 0) + 1) }
  let venc = 10, max = 0
  for (const [dia, n] of conta) if (n > max || (n === max && dia < venc)) { venc = dia; max = n }

  let fech = venc - 7
  if (fech < 1) fech += 30
  return { diaVencimento: venc, diaFechamento: fech }
}

// Nome sugerido para o cartão de uma linha de pagamento de fatura, quando ainda não há cartão
function nomeSugeridoDoCartao(desc, extrato, contas, destinoId) {
  const bancoDoExtrato = nomeDoBanco(extrato.banco)
  if (/DEBITO AUT|FAT\.?\s*CARTAO/.test(desc) && bancoDoExtrato) return bancoDoExtrato // débito automático: cartão do próprio banco
  const bancos = contas.filter((c) => c.id !== destinoId).map((c) => c.nome).filter((n) => BANCOS_CONHECIDOS.has(normalizar(n)) && normalizar(n) !== normalizar(bancoDoExtrato || ''))
  return bancos[0] || bancoDoExtrato || 'Cartão'
}
const BANCOS_CONHECIDOS = new Set(['SANTANDER', 'INTER', 'NUBANK', 'ITAU', 'BRADESCO', 'BANCO DO BRASIL', 'CAIXA', 'C6', 'ORIGINAL', 'PICPAY', 'MERCADO PAGO', 'BTG'])

// Chave de uma conta de destino vinda do extrato: "banco/agência/conta", ou só o banco quando o extrato não mostra a conta
export const chaveDoDestino = (d) => (d?.banco ? (d.agencia && d.conta ? `${d.banco}/${d.agencia}/${d.conta}` : d.banco) : d?.ispb ? `ISPB ${d.ispb}` : null)

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

// "Identidade" de uma linha, sem números (para agrupar linhas parecidas: "PAGAMENTO CARTAO CREDITO BCE")
export const identidade = (descricao) => normalizar(descricao).replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim()

const PARECE_PAGAMENTO_FATURA = /(PAGTO|PGTO|PAGAMENTO|PAG)\.?\s*(DE\s*)?(FATURA|CART)|FATURA\s*(DO\s*|DE\s*)?CART|CARTAO\s*(DE\s*)?CREDITO|FAT\.?\s*CARTAO|DEBITO AUT\.?\s*FAT/
const PARECE_INVESTIMENTO = /\b(APLICACAO|APLIC|RESGATE|RESG)\.?\s+(EM\s+)?(CDB|RDB|LCI|LCA|LC|TESOURO|FUNDO|FUNDOS|POUPANCA|COE|DEBENTURE)/

// Nome do titular para reconhecer PIX/TED para ele mesmo: as 3 primeiras palavras do nome, em ordem,
// aceitando "da/de/do" entre elas (o banco corta o nome no fim: "Fulano De Tal Souza da")
const LIGACOES_NOME = ['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']
export function chaveDoTitular(titular) {
  const palavras = normalizar(titular).replace(/[^A-Z ]/g, ' ').split(/\s+/).filter((p) => p.length >= 2 && !LIGACOES_NOME.includes(p))
  if (palavras.length < 2) return null
  const entre = `(?:\\s+(?:${LIGACOES_NOME.join('|')}))*\\s+`
  return new RegExp(`(?:^|\\s)${palavras.slice(0, 3).join(entre)}(?:\\s|$)`)
}
const soLetrasENumeros = (t) => t.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

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
 * @param extrato resultado de lerOFX ou juntarExtratos (PDF)
 * @param destino { tipo: 'conta' | 'cartao', id }
 * @param faturaCartao mês da fatura ('AAAA-MM') quando o destino é cartão
 * @param dados { lancamentos, contas, cartoes, categorias }
 * @param sugerir (descricao, tipo) => categoriaId | null
 * @param regras regras desta importação (para linhas que não são gasto/receita comuns):
 *   { contaInvestimentos: id | NOVA_CONTA_INVESTIMENTOS | null,
 *     contaPixProprio: id | null, titular: texto | null,
 *     cartaoPorPagamento: { [identidade]: cartaoId | novoCartao(nome) | null (null = não é fatura: lançar como gasto) },
 *     contaPorPix: { 'banco/agência/conta' | 'banco': contaId | novaConta(nome) | null } (PIX para uma conta pelo número,
 *       ou PIX com o seu nome cujo destino o extrato mostra),
 *     gastoPorPix: { mesma chave: categoriaId } → depois da transferência, o dinheiro é usado lá para pagar algo:
 *       entra também um gasto nessa conta, com essa categoria (para contas cujo extrato você não importa),
 *     historico: true → pagamento de fatura entra mesmo sem as compras no app }
 */
export function prepararImportacao({ extrato, destino, faturaCartao = null, dados, sugerir = () => null, regras = {} }) {
  const { lancamentos, cartoes, categorias, contas = [] } = dados
  const outros = (tipo) => categorias.find((c) => c.tipo === tipo && normalizar(c.nome) === 'OUTROS')?.id ?? categorias.find((c) => c.tipo === tipo)?.id ?? null
  const existentesIds = new Set(lancamentos.filter((l) => l.idExterno).map((l) => l.idExterno))
  const usados = new Set()
  const ordinal = new Map()
  const cartaoDestino = destino.tipo === 'cartao' ? cartoes.find((c) => c.id === destino.id) : null
  const { saidas, entradas } = destino.tipo === 'conta' ? candidatosConta(destino.id, lancamentos) : { saidas: [], entradas: [] }
  const comprasCartao = cartaoDestino ? lancamentos.filter((l) => l.tipo === 'despesa' && l.cartaoId === cartaoDestino.id) : []
  const nomeTitular = chaveDoTitular(regras.titular)

  const itens = extrato.transacoes.map((t) => {
    const entrada = t.valor > 0
    const valor = Math.abs(t.valor)
    // Identificador estável: o FITID do banco (OFX); a chave do leitor de PDF (data+valor+ordem);
    // ou, sem nenhum dos dois, data+valor+descrição (+ordem, para linhas idênticas)
    let chave
    if (t.fitid) chave = `f:${t.fitid}`
    else if (t.chave) chave = t.chave
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
      descricao: semControle(t.descricao), // nada de caractere de controle (a nuvem recusa)
      idExterno,
      situacao: 'novo',
      motivo: '',
      grupo: null,
      acao: 'lancar',
      tipo,
      categoriaId: sugerir(t.descricao, tipo) ?? outros(tipo),
      contaOutraId: null,
      cartaoPagoId: null,
      faturaPaga: null,
      faturaSemCompras: false,
      parcela: null,
      duplicadoDe: null,
      gastoCategoriaId: null,
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

    const desc = normalizar(t.descricao)

    // Aplicação/resgate de investimento: transferência com a conta de investimentos
    if (PARECE_INVESTIMENTO.test(desc)) {
      item.grupo = 'investimento'
      if (regras.contaInvestimentos) return { ...item, acao: 'transferencia', contaOutraId: regras.contaInvestimentos, motivo: entrada ? 'Resgate de investimento' : 'Aplicação em investimento' }
      return item
    }

    // PIX/TED para você mesmo (com o seu nome): transferência entre suas contas
    if (nomeTitular && nomeTitular.test(soLetrasENumeros(desc)) && /\b(PIX|TED|DOC|TRANSF)/.test(desc)) {
      item.grupo = 'pixProprio'
      const chaveConta = chaveDoDestino(t.destino)
      if (chaveConta && !entrada) {
        // o extrato diz para qual banco/conta foi
        item.contaBancaria = chaveConta
        item.bancoDestino = t.destino.banco ?? null
        const escolhida = regras.contaPorPix?.[chaveConta]
        const banco = nomeDoBanco(t.destino.banco)
        let sugerida
        if (escolhida !== undefined) sugerida = escolhida
        else {
          const mesmoNome = banco ? contas.find((c) => c.id !== destino.id && normalizar(c.nome).includes(normalizar(banco))) : null
          if (mesmoNome) sugerida = mesmoNome.id
          else if (banco && t.destino.banco !== extrato.banco) sugerida = novaConta(banco)
          else sugerida = regras.contaPixProprio ?? null
        }
        if (sugerida && sugerida !== destino.id) {
          const gasto = regras.gastoPorPix?.[chaveConta] ?? null
          return { ...item, acao: 'transferencia', contaOutraId: sugerida, gastoCategoriaId: gasto, motivo: `Transferência para você mesmo${banco ? ` (${banco})` : ''}${gasto ? ', usada lá para pagar algo' : ''}` }
        }
        return item
      }
      if (regras.contaPixProprio && regras.contaPixProprio !== destino.id) {
        return { ...item, acao: 'transferencia', contaOutraId: regras.contaPixProprio, motivo: 'Transferência para você mesmo' }
      }
      return item
    }

    // PIX para/de uma conta identificada pelo número (banco/agência/conta), ex.: "PIX ENVIADO 077/0001/0000000123456789"
    const contaPix = desc.match(/\b(\d{3})\/(\d{4})\/(\d{5,})\b/)
    if (contaPix && /\bPIX\b/.test(desc)) {
      const chaveConta = `${contaPix[1]}/${contaPix[2]}/${contaPix[3]}`
      item.grupo = 'pixConta'
      item.contaBancaria = chaveConta
      const escolhida = regras.contaPorPix?.[chaveConta]
      const banco = nomeDoBanco(contaPix[1])
      const sugerida = escolhida !== undefined ? escolhida : (banco ? contas.find((c) => c.id !== destino.id && normalizar(c.nome).includes(normalizar(banco)))?.id ?? null : null)
      if (sugerida && sugerida !== destino.id) {
        const gasto = !entrada ? regras.gastoPorPix?.[chaveConta] ?? null : null
        return { ...item, acao: 'transferencia', contaOutraId: sugerida, gastoCategoriaId: gasto, motivo: `Transferência ${entrada ? 'da' : 'para a'} conta ${chaveConta}${gasto ? ', usada lá para pagar algo' : ''}` }
      }
      return item
    }

    // Pagamento de fatura de cartão
    if (!entrada && PARECE_PAGAMENTO_FATURA.test(desc)) {
      const ident = identidade(t.descricao)
      item.grupo = 'pagamentoCartao'
      item.identidade = ident
      const escolhido = regras.cartaoPorPagamento?.[ident]
      if (escolhido === null) return { ...item, motivo: 'Você escolheu lançar como gasto' }
      if (nomeDoNovoCartao(escolhido)) return { ...item, ...faturaDeCartaoNovo(item, escolhido) }
      const cartao = cartoes.find((c) => c.id === escolhido)
        || cartoes.find((c) => desc.includes(normalizar(c.nome)))
        || cartoes.find((c) => c.contaPagamentoId === destino.id)
        || cartoes[0]
      // Sem nenhum cartão cadastrado: cria o cartão junto (nunca ignorar o pagamento, senão o saldo da conta fica errado)
      if (!cartao) return { ...item, ...faturaDeCartaoNovo(item, novoCartao(nomeSugeridoDoCartao(desc, extrato, contas, destino.id))) }
      return { ...item, ...resolverFatura(item, cartao, lancamentos, regras.historico) }
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

// Pagamento de fatura de um cartão que será criado agora: ainda não tem compras no app
export function faturaDeCartaoNovo(item, token) {
  return { acao: 'fatura', cartaoPagoId: token, faturaPaga: mesDe(item.data), faturaSemCompras: true, motivo: `Pagamento de fatura (cartão novo "${nomeDoNovoCartao(token)}")` }
}

// Decide qual fatura um pagamento quita (e se é "sem compras", no histórico)
export function resolverFatura(item, cartao, lancamentos, historico = false) {
  const fatura = faturaParaPagamento(cartao, item.data, item.valor, lancamentos)
  if (fatura) return { acao: 'fatura', cartaoPagoId: cartao.id, faturaPaga: fatura, faturaSemCompras: false, motivo: 'Pagamento de fatura' }
  if (historico) return { acao: 'fatura', cartaoPagoId: cartao.id, faturaPaga: mesDe(item.data), faturaSemCompras: true, motivo: 'Pagamento de fatura (as compras entram quando a fatura do cartão for importada)' }
  return { acao: 'ignorar', cartaoPagoId: cartao.id, faturaPaga: null, faturaSemCompras: false, motivo: 'Parece pagamento de fatura, mas não há fatura em aberto com esse valor no app' }
}

// Confere se o item está pronto para gravar. Retorna a mensagem de erro ou null.
export function problemaDoItem(item, destino) {
  if (item.acao === 'ignorar' || item.situacao === 'importado') return null
  if (destino.tipo === 'cartao' && item.acao !== 'lancar') return 'No cartão, a linha só pode ser lançada ou ignorada.'
  if (item.acao === 'lancar' && !item.categoriaId) return 'Escolha a categoria.'
  if (item.acao === 'transferencia' && (!item.contaOutraId || item.contaOutraId === destino.id)) return 'Escolha a outra conta da transferência.'
  if (item.acao === 'transferencia' && item.gastoCategoriaId && item.entrada) return 'Só a transferência que sai daqui pode virar pagamento na outra conta.'
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
 * - saldoInicial (opcional): novo saldo inicial da conta de destino (histórico desde o começo)
 * - Se alguma linha usa a "nova conta de investimentos", ela é criada junto.
 * Retorna quantos lançamentos foram criados.
 */
export async function executarImportacao({ itens, destino, faturaCartao = null, saldoInicial = null, nomeContaInvestimentos = 'Investimentos' }) {
  const gravar = itensParaGravar(itens)
  for (const i of gravar) {
    const p = problemaDoItem(i, destino)
    if (p) throw new Error(`Linha ${i.posicao} (${i.descricao}): ${p}`)
  }
  if (saldoInicial != null && (destino.tipo !== 'conta' || !Number.isSafeInteger(saldoInicial))) throw new Error('Saldo inicial inválido.')

  return db.transaction('rw', db.lancamentos, db.contas, db.cartoes, db.categorias, async () => {
    // contas novas pedidas na importação (investimentos, ou a conta de outro banco, ex.: "Caixa")
    const criadas = new Map()
    for (const i of gravar) {
      if (i.acao !== 'transferencia' || !ehContaNova(i.contaOutraId) || criadas.has(i.contaOutraId)) continue
      const nova = i.contaOutraId === NOVA_CONTA_INVESTIMENTOS
        ? { nome: nomeContaInvestimentos, emoji: '📈', saldoInicial: 0 }
        : { nome: nomeDaNovaConta(i.contaOutraId).trim().slice(0, 40) || 'Outra conta', emoji: '🏦', saldoInicial: 0 }
      criadas.set(i.contaOutraId, await db.contas.add(nova))
    }
    const outra = (id) => (criadas.has(id) ? criadas.get(id) : id)
    // cartões novos pedidos na importação (dias estimados pelos pagamentos)
    const cartoesCriados = new Map()
    for (const i of gravar) {
      if (i.acao !== 'fatura' || !nomeDoNovoCartao(i.cartaoPagoId) || cartoesCriados.has(i.cartaoPagoId)) continue
      const datas = gravar.filter((x) => x.acao === 'fatura' && x.cartaoPagoId === i.cartaoPagoId).map((x) => x.data)
      const nome = nomeDoNovoCartao(i.cartaoPagoId).trim().slice(0, 40) || 'Cartão'
      cartoesCriados.set(i.cartaoPagoId, await db.cartoes.add({ nome, limite: 0, ...diasEstimados(datas), contaPagamentoId: destino.id, criadoNaImportacao: true }))
    }
    const cartaoReal = (id) => (cartoesCriados.has(id) ? cartoesCriados.get(id) : id)
    if (saldoInicial != null) await db.contas.update(destino.id, { saldoInicial })

    const [contas, cartoes, categorias] = await Promise.all([db.contas.toArray(), db.cartoes.toArray(), db.categorias.toArray()])
    const refs = { contas, cartoes, categorias }

    // não importar duas vezes (ex.: toque duplo): confere os identificadores no banco
    const idGasto = (i) => `${i.idExterno}:gasto`
    const comGasto = (i) => i.acao === 'transferencia' && !i.entrada && !!i.gastoCategoriaId
    const ids = [...gravar.map((i) => i.idExterno), ...gravar.filter(comGasto).map(idGasto)]
    const jaExistem = new Set((await db.lancamentos.where('idExterno').anyOf(ids).toArray()).map((l) => l.idExterno))
    if (jaExistem.size) throw new Error('Parte destes lançamentos já foi importada. Abra a importação de novo para ver o que falta.')
    if (new Set(ids).size !== ids.length) throw new Error('Há linhas repetidas na importação.')

    const registros = []
    const pagamentos = []
    for (const i of gravar) {
      try {
        if (i.acao === 'fatura') { pagamentos.push(i); continue }
        let form
        if (destino.tipo === 'cartao') {
          form = { tipo: 'despesa', valor: i.valor, descricao: i.descricao, categoriaId: i.categoriaId, contaId: null, cartaoId: destino.id, data: i.dataLancamento, parcelas: 1, faturaFixa: faturaCartao, idExterno: i.idExterno }
        } else if (i.acao === 'lancar') {
          form = { tipo: i.entrada ? 'receita' : 'despesa', valor: i.valor, descricao: i.descricao, categoriaId: i.categoriaId, contaId: destino.id, cartaoId: null, data: i.data, parcelas: 1, idExterno: i.idExterno }
        } else if (i.acao === 'transferencia') {
          const [origem, destinoT] = i.entrada ? [outra(i.contaOutraId), destino.id] : [destino.id, outra(i.contaOutraId)]
          form = { tipo: 'transferencia', valor: i.valor, descricao: i.descricao, contaId: origem, contaDestinoId: destinoT, cartaoId: null, data: i.data, parcelas: 1, idExterno: i.idExterno }
        }
        registros.push(...registrosParaImportar(form, refs))
        if (comGasto(i)) {
          // o dinheiro foi usado lá para pagar algo: o gasto sai da outra conta, no mesmo dia
          registros.push(...registrosParaImportar({ tipo: 'despesa', valor: i.valor, descricao: i.descricao, categoriaId: i.gastoCategoriaId, contaId: outra(i.contaOutraId), cartaoId: null, data: i.data, parcelas: 1, idExterno: idGasto(i) }, refs))
        }
      } catch (e) {
        throw new Error(`Linha ${i.posicao} (${i.descricao}): ${e.message}`)
      }
    }
    if (registros.length) await db.lancamentos.bulkAdd(registros)
    for (const i of pagamentos) {
      try {
        await pagarFatura({ cartaoId: cartaoReal(i.cartaoPagoId), fatura: i.faturaPaga, contaId: destino.id, valor: i.valor, data: i.data, idExterno: i.idExterno, permitirSemCompras: i.faturaSemCompras })
      } catch (e) {
        throw new Error(`Linha ${i.posicao} (${i.descricao}): ${e.message}`)
      }
    }
    return registros.length + pagamentos.length
  })
}

// Conferência com o saldo informado no extrato: como ficará o saldo da conta no app na data do extrato
export function conferirSaldo({ extrato, destino, itens, lancamentos, conta, saldoInicial = null }) {
  if (destino.tipo !== 'conta' || !extrato.saldo || !conta) return null
  const contaSimulada = saldoInicial != null ? { ...conta, saldoInicial } : conta
  const simulados = itensParaGravar(itens).map((i) => {
    if (i.acao === 'transferencia') return i.entrada ? { tipo: 'transferencia', contaId: '__outra__', contaDestinoId: conta.id, valor: i.valor, data: i.data } : { tipo: 'transferencia', contaId: conta.id, contaDestinoId: '__outra__', valor: i.valor, data: i.data }
    if (i.acao === 'fatura') return { tipo: 'pagamentoFatura', contaId: conta.id, valor: i.valor, data: i.data }
    return { tipo: i.entrada ? 'receita' : 'despesa', contaId: conta.id, cartaoId: null, valor: i.valor, data: i.data }
  })
  const noApp = saldoConta(contaSimulada, [...lancamentos, ...simulados], extrato.saldo.data)
  return { data: extrato.saldo.data, noExtrato: extrato.saldo.valor, noApp, diferenca: noApp - extrato.saldo.valor }
}

// Pode usar o saldo do extrato mais antigo como saldo inicial da conta?
// Só se a conta não tem nenhum lançamento antes do começo do extrato.
export function podeDefinirSaldoInicial({ extrato, destino, lancamentos }) {
  if (destino.tipo !== 'conta' || !extrato.saldoInicial || !extrato.inicio) return false
  return !lancamentos.some((l) => (l.contaId === destino.id || l.contaDestinoId === destino.id) && l.data < extrato.inicio)
}
