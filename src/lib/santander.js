// Leitor dos extratos em PDF do Santander (conta corrente).
// Entende dois formatos:
//  - "Extrato Consolidado Inteligente" (mensal, com resumo, tabela "Movimentação" e saldo do dia)
//  - "Extrato de Conta" (gerado no app para um período, com o saldo depois de cada lançamento)
// Trabalha sobre as LINHAS de texto do PDF (veja pdfTexto.js), então pode ser testado sem PDF.
// Toda leitura é conferida com os saldos impressos pelo próprio banco: se não fechar, o extrato é recusado.
import { dataValida } from './datas.js'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const pad = (n) => String(n).padStart(2, '0')
const fmt = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "2.985,56" → 298556 · "4,20-" → -420 · "-R$ 14,00" → -1400 · "R$ 1.759,53" → 175953
export function valorBR(texto) {
  if (texto == null) return null
  const t = String(texto).replace(/\s+/g, '').replace(/^R\$/, '')
  const m = t.match(/^(-?)(?:R\$)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(-?)$/)
  if (!m) return null
  const centavos = Number(m[2].replace(/\./g, '')) * 100 + Number(m[3])
  const negativo = m[1] === '-' || m[4] === '-'
  return negativo ? -centavos : centavos
}
const ehValor = (s) => valorBR(s) !== null

const textoDaLinha = (l) => l.itens.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()
const itensEntre = (l, x0, x1) => l.itens.filter((i) => i.x >= x0 && i.x < x1)

export function somarDias(data, n) {
  const [a, m, d] = data.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

// Limpa a descrição: "COMPRA CARTAO DEB MC 18/03 AUTOPASS S.A." → "AUTOPASS S.A." (o que importa é a loja)
export function limparDescricao(d) {
  return d
    .replace(/^compra cartao deb mc\s+(\d{2}\/\d{2}\s+)?/i, '')
    .replace(/(?<=\.)Descr(i(p(t(i(o(n)?)?)?)?)?)?$/i, '') // resto de texto que o banco deixa no fim do nome da loja
    .replace(/\s+/g, ' ')
    .trim()
}

export function reconhecerSantander(linhas) {
  const tudo = linhas.slice(0, 80).map(textoDaLinha).join('\n')
  if (/EXTRATO CONSOLIDADO INTELIGENTE/i.test(tudo) && /Movimento \(R\$\)/i.test(linhas.map(textoDaLinha).join('\n'))) return 'consolidado'
  if (/EXTRATO\s+DE CONTA/i.test(tudo) && /Per[ií]odo:/i.test(tudo)) return 'parcial'
  return null
}

const normalizarConta = (agencia, conta) => `${String(agencia).replace(/\D/g, '')}-${String(conta).replace(/\D/g, '')}`

// ---------- Formato 1: Extrato Consolidado Inteligente ----------
export function lerConsolidado(linhas) {
  const erros = []
  const textos = linhas.map(textoDaLinha)

  // mês de referência
  let ano = null, mes = null
  for (const t of textos) {
    const m = t.match(new RegExp(`(?:^|\\s)(${MESES.join('|')})\\/(\\d{4})(?:\\s|$)`, 'i'))
    if (m) { mes = MESES.indexOf(m[1].toLowerCase()) + 1; ano = Number(m[2]); break }
  }
  if (!ano) throw new Error('Não encontrei o mês do extrato.')
  const anoDe = (m) => (m > mes ? ano - 1 : ano)
  const dataDe = (ddmm) => { const [d, m] = ddmm.split('/').map(Number); return `${anoDe(m)}-${pad(m)}-${pad(d)}` }

  // titular e conta
  let titular = null, conta = null
  textos.forEach((t, i) => {
    if (!titular && t === 'Nome' && textos[i + 1]) titular = textos[i + 1]
    if (!conta && /^Agência\s+Conta Corrente$/i.test(t) && textos[i + 1]) {
      const m = textos[i + 1].match(/^(\d+)\s+([\d.\-]+)$/)
      if (m) conta = normalizarConta(m[1], m[2])
    }
  })

  // resumo: saldo anterior, saldo final, totais
  const saldosResumo = []
  let totalCreditos = null, totalDebitos = null
  for (const l of linhas) {
    const t = textoDaLinha(l)
    const valores = l.itens.filter((i) => ehValor(i.s))
    const ultimo = valores.length ? valorBR(valores[valores.length - 1].s) : null
    const m = t.match(/Saldo de Conta Corrente em (\d{2}\/\d{2})/i)
    if (m && ultimo !== null && saldosResumo.length < 2) saldosResumo.push({ data: dataDe(m[1]), valor: ultimo })
    if (/^\(\+\)\s*Total de Créditos/i.test(t) && totalCreditos === null) totalCreditos = ultimo
    if (/^\(-\)\s*Total de Débitos/i.test(t) && totalDebitos === null) totalDebitos = ultimo
  }
  if (saldosResumo.length < 2) throw new Error('Não encontrei o resumo de saldos do extrato.')
  const [saldoAnterior, saldoFinal] = saldosResumo

  // tabela "Movimentação" da conta corrente
  const transacoes = []
  const marcos = []
  let dentro = false, terminou = false, ultimaData = null, atual = null, pendente = null
  for (const l of linhas) {
    if (terminou) break
    const t = textoDaLinha(l)
    if (/Data\s+Descrição\s+Nº Documento\s+Movimento \(R\$\)/i.test(t)) { dentro = true; continue }
    if (!dentro) continue
    if (/^Se você não tem Limite|^Saldos por Período/i.test(t)) { terminou = true; break }

    const dataTok = l.itens.find((i) => i.x < 60 && /^\d{2}\/\d{2}$/.test(i.s))
    const desc = itensEntre(l, 60, 290).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()
    const mov = itensEntre(l, 400, 480).find((i) => ehValor(i.s))
    const saldo = l.itens.find((i) => i.x >= 480 && ehValor(i.s))
    if (dataTok) ultimaData = dataDe(dataTok.s)

    if (/^SALDO EM \d{2}\/\d{2}/i.test(desc)) {
      const d = desc.match(/(\d{2}\/\d{2})/)[1]
      if (saldo) marcos.push({ data: dataDe(d), valor: valorBR(saldo.s) })
      atual = null
      if (transacoes.length && dataDe(d) === saldoFinal.data) terminou = true
      continue
    }
    if (mov) {
      const descricao = desc || pendente?.descricao || ''
      if (!ultimaData) erros.push(`Lançamento sem data: "${descricao}"`)
      atual = { data: ultimaData, valor: valorBR(mov.s), partes: [descricao], saldo: saldo ? valorBR(saldo.s) : null }
      transacoes.push(atual)
      pendente = null
      continue
    }
    if (dataTok && desc && !mov) { pendente = { descricao: desc }; continue } // valor veio na linha de baixo
    if (desc && atual) atual.partes.push(desc) // descrição continua na linha de baixo
  }
  if (!dentro) throw new Error('Não encontrei a tabela de movimentação da conta corrente.')

  const lista = transacoes.map((x, i) => ({ posicao: i + 1, data: x.data, valor: x.valor, descricao: limparDescricao(x.partes.filter(Boolean).join(' ')), saldoImpresso: x.saldo }))

  // ---------- conferência ----------
  const nome = `${MESES[mes - 1]}/${ano}`
  if (marcos.length && marcos[0].valor !== saldoAnterior.valor) erros.push(`Saldo de abertura da tabela (${fmt(marcos[0].valor)}) diferente do resumo (${fmt(saldoAnterior.valor)}).`)
  let corrente = saldoAnterior.valor
  let conferidos = 0
  for (const x of lista) {
    if (!dataValida(x.data || '')) { erros.push(`Data inválida em "${x.descricao}".`); continue }
    corrente += x.valor
    if (x.saldoImpresso !== null) {
      conferidos++
      if (x.saldoImpresso !== corrente) erros.push(`Em ${x.data.split('-').reverse().join('/')} ("${x.descricao}"): o banco mostra saldo ${fmt(x.saldoImpresso)}, a leitura deu ${fmt(corrente)}.`)
    }
  }
  if (corrente !== saldoFinal.valor) erros.push(`Saldo final lido ${fmt(corrente)} diferente do saldo do banco ${fmt(saldoFinal.valor)}.`)
  const creditos = lista.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0)
  const debitos = -lista.filter((x) => x.valor < 0).reduce((s, x) => s + x.valor, 0)
  if (totalCreditos !== null && creditos !== totalCreditos) erros.push(`Total de créditos lido ${fmt(creditos)} diferente do banco ${fmt(totalCreditos)}.`)
  if (totalDebitos !== null && debitos !== totalDebitos) erros.push(`Total de débitos lido ${fmt(debitos)} diferente do banco ${fmt(totalDebitos)}.`)

  return {
    formato: 'consolidado',
    nome,
    conta,
    titular,
    inicio: somarDias(saldoAnterior.data, 1),
    fim: saldoFinal.data,
    saldoInicial: saldoAnterior.valor,
    saldoFinal: saldoFinal.valor,
    transacoes: lista,
    conferencia: { ok: erros.length === 0, erros, saldosConferidos: conferidos },
  }
}

// ---------- Formato 2: Extrato de Conta (período) ----------
export function lerParcial(linhas) {
  const erros = []
  const textos = linhas.map(textoDaLinha)
  const tudo = textos.join('\n')

  const p = tudo.match(/Per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i)
  if (!p) throw new Error('Não encontrei o período do extrato.')
  const inicio = `${p[3]}-${p[2]}-${p[1]}`, fim = `${p[6]}-${p[5]}-${p[4]}`
  const ag = tudo.match(/Agência:\s*(\d+)/i), ct = tudo.match(/Conta:\s*([\d.\-]+)/i)
  const conta = ag && ct ? normalizarConta(ag[1], ct[1]) : null
  const tit = tudo.match(/Titular:\s*([^\n]+)/i)

  // resumo: Saldo inicial | Entradas | Saídas | Saldo final (valores na linha de baixo)
  const iResumo = textos.findIndex((t) => /Saldo inicial/i.test(t) && /Saldo final/i.test(t))
  const valoresResumo = iResumo >= 0 ? [...(textos[iResumo + 1] || '').matchAll(/(-?)R\$\s*([\d.]+,\d{2})/g)].map((m) => valorBR(`${m[1]}${m[2]}`)) : []
  if (valoresResumo.length < 4) throw new Error('Não encontrei o resumo de saldos do extrato.')
  const [saldoInicial, entradas, saidas, saldoFinal] = valoresResumo

  // posição contínua entre páginas, para ligar descrição e lançamento
  const pos = (l) => l.pagina * 10000 - l.y
  const linhasLanc = []
  const linhasTexto = []
  for (const l of linhas) {
    const t = textoDaLinha(l)
    const dataTok = l.itens.find((i) => i.x < 80 && /^\d{2}\/\d{2}\/\d{4}$/.test(i.s))
    if (dataTok) {
      const valorTxt = itensEntre(l, 380, 490).map((i) => i.s).join(' ')
      const saldoTxt = l.itens.filter((i) => i.x >= 490).map((i) => i.s).join(' ')
      const inline = itensEntre(l, 100, 380).map((i) => i.s).join(' ').trim()
      const [, d, m, a] = dataTok.s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      linhasLanc.push({ p: pos(l), data: `${a}-${m}-${d}`, valor: valorBR(valorTxt), saldo: valorBR(saldoTxt), inline, acima: [], abaixo: [] })
      continue
    }
    if (/DETALHE DOS|Descrição.*Valor.*Saldo|^EXTRATO|Saldo inicial|Per[ií]odo:|Agência:|Titular:/i.test(t)) continue
    const txt = itensEntre(l, 100, 400).map((i) => i.s).join(' ').trim()
    if (txt && l.itens.every((i) => i.x >= 100)) linhasTexto.push({ p: pos(l), txt })
  }
  for (const tl of linhasTexto) {
    let melhor = null
    for (const ll of linhasLanc) if (!melhor || Math.abs(ll.p - tl.p) < Math.abs(melhor.p - tl.p)) melhor = ll
    if (melhor) (tl.p < melhor.p ? melhor.acima : melhor.abaixo).push(tl)
  }
  const doc = linhasLanc.map((ll) => ({
    data: ll.data,
    valor: ll.valor,
    saldoImpresso: ll.saldo,
    descricao: limparDescricao([...ll.acima.sort((a, b) => a.p - b.p).map((x) => x.txt), ll.inline, ...ll.abaixo.sort((a, b) => a.p - b.p).map((x) => x.txt)].filter(Boolean).join(' ')),
  }))
  // o extrato vem do mais novo para o mais antigo
  const lista = [...doc].reverse().map((x, i) => ({ posicao: i + 1, ...x }))

  let corrente = saldoInicial
  let conferidos = 0
  for (const x of lista) {
    if (x.valor === null) { erros.push(`Valor ilegível em ${x.data} ("${x.descricao}").`); continue }
    corrente += x.valor
    if (x.saldoImpresso !== null) {
      conferidos++
      if (x.saldoImpresso !== corrente) erros.push(`Em ${x.data.split('-').reverse().join('/')} ("${x.descricao}"): o banco mostra saldo ${fmt(x.saldoImpresso)}, a leitura deu ${fmt(corrente)}.`)
    }
    if (x.data < inicio || x.data > fim) erros.push(`Lançamento fora do período: ${x.data}.`)
  }
  if (corrente !== saldoFinal) erros.push(`Saldo final lido ${fmt(corrente)} diferente do saldo do banco ${fmt(saldoFinal)}.`)
  const ent = lista.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0)
  const sai = -lista.filter((x) => x.valor < 0).reduce((s, x) => s + x.valor, 0)
  if (ent !== entradas) erros.push(`Entradas lidas ${fmt(ent)} diferentes do banco ${fmt(entradas)}.`)
  if (sai !== Math.abs(saidas)) erros.push(`Saídas lidas ${fmt(sai)} diferentes do banco ${fmt(Math.abs(saidas))}.`)

  return {
    formato: 'parcial',
    nome: `${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`,
    conta,
    titular: tit ? tit[1].trim() : null,
    inicio,
    fim,
    saldoInicial,
    saldoFinal,
    transacoes: lista,
    conferencia: { ok: erros.length === 0, erros, saldosConferidos: conferidos },
  }
}

export function lerExtratoSantander(linhas) {
  const formato = reconhecerSantander(linhas)
  if (formato === 'consolidado') return lerConsolidado(linhas)
  if (formato === 'parcial') return lerParcial(linhas)
  throw new Error('Este PDF não parece ser um extrato de conta do Santander.')
}

/**
 * Junta vários extratos (de qualquer formato) num só, conferindo:
 *  - que são da mesma conta;
 *  - que um mês emenda no outro (saldo final de um = saldo inicial do próximo; sem dias faltando);
 *  - que períodos repetidos (ex.: parcial e consolidado do mesmo mês) têm os mesmos lançamentos.
 * Lançamentos repetidos entre arquivos entram uma vez só.
 * Cada lançamento ganha uma "chave" estável (data + valor + ordem), igual em qualquer formato,
 * para a importação não duplicar nada, nem se o mesmo período for importado de novo.
 */
export function juntarExtratos(lidos) {
  const erros = []
  const contas = [...new Set(lidos.map((e) => e.conta).filter(Boolean))]
  if (contas.length > 1) erros.push('Os PDFs são de contas diferentes. Importe uma conta de cada vez.')
  for (const e of lidos) for (const er of e.conferencia.erros) erros.push(`${e.nome}: ${er}`)

  const ordenados = [...lidos].sort((a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim))
  const chaveDe = (lista) => {
    const n = new Map()
    return lista.map((x) => {
      const base = `${x.data}:${x.valor}`
      const k = (n.get(base) || 0) + 1
      n.set(base, k)
      return { ...x, chave: `p:${base}:${k}` }
    })
  }

  const final = new Map() // chave → transação
  let anterior = null
  for (const e of ordenados) {
    const comChave = chaveDe(e.transacoes)
    if (anterior) {
      if (e.inicio > somarDias(anterior.fim, 1)) erros.push(`Falta extrato entre ${anterior.fim.split('-').reverse().join('/')} e ${e.inicio.split('-').reverse().join('/')}.`)
      if (e.inicio === somarDias(anterior.fim, 1) && e.saldoInicial !== anterior.saldoFinal) {
        erros.push(`${e.nome}: começa com ${fmt(e.saldoInicial)}, mas ${anterior.nome} terminou com ${fmt(anterior.saldoFinal)}.`)
      }
      if (e.inicio <= anterior.fim) {
        // períodos repetidos: os lançamentos do trecho em comum precisam ser os mesmos
        const fimComum = e.fim < anterior.fim ? e.fim : anterior.fim
        const deste = comChave.filter((x) => x.data <= fimComum).map((x) => x.chave).sort()
        const jaTem = [...final.values()].filter((x) => x.data >= e.inicio && x.data <= fimComum).map((x) => x.chave).sort()
        if (JSON.stringify(deste) !== JSON.stringify(jaTem)) erros.push(`${e.nome} e ${anterior.nome} têm lançamentos diferentes no período em comum.`)
      }
    }
    for (const x of comChave) if (!final.has(x.chave)) final.set(x.chave, x)
    if (!anterior || e.fim > anterior.fim) anterior = e
  }

  const transacoes = [...final.values()]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((x, i) => ({ posicao: i + 1, fitid: null, chave: x.chave, data: x.data, valor: x.valor, descricao: x.descricao }))
  const primeiro = ordenados[0], ultimo = anterior
  return {
    tipo: 'conta',
    origem: 'pdf-santander',
    banco: '033',
    conta: contas[0] || null,
    titular: lidos.map((e) => e.titular).filter(Boolean).sort((a, b) => b.length - a.length)[0] || null,
    inicio: primeiro?.inicio ?? null,
    fim: ultimo?.fim ?? null,
    saldoInicial: primeiro ? { valor: primeiro.saldoInicial, data: somarDias(primeiro.inicio, -1) } : null,
    saldo: ultimo ? { valor: ultimo.saldoFinal, data: ultimo.fim } : null,
    transacoes,
    problemas: [],
    arquivos: ordenados.map((e) => ({ nome: e.nome, formato: e.formato, inicio: e.inicio, fim: e.fim, lancamentos: e.transacoes.length, saldosConferidos: e.conferencia.saldosConferidos, ok: e.conferencia.ok })),
    conferencia: { ok: erros.length === 0, erros },
  }
}
