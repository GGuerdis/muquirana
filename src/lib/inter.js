// Leitor do extrato em PDF da conta do Banco Inter (gerado no app, para um período).
// Cada dia tem um cabeçalho ("8 de Março de 2023  Saldo do dia: R$ 1.432,68") e, embaixo, uma linha por lançamento:
//   Pix enviado: "Pix enviado: Fulano"        -R$ 200,00      R$ 1.232,68   (valor e saldo depois do lançamento)
// Trabalha sobre as LINHAS de texto do PDF (veja pdfTexto.js), então pode ser testado sem PDF.
// Toda leitura é conferida com os saldos impressos pelo banco (por lançamento e do dia): se não fechar, é recusada.
import { valorBR, BANCO_POR_ISPB } from './santander.js'
import { semControle } from './texto.js'

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const pad = (n) => String(n).padStart(2, '0')
const fmt = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
const textoDaLinha = (l) => l.itens.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()
const VALOR = /^-?R\$\s*-?[\d.]+,\d{2}$/
const COLUNA_VALOR = 380 // à esquerda: descrição; daqui para a direita: valor e saldo

export function reconhecerInter(linhas) {
  const topo = linhas.slice(0, 40).map(textoDaLinha).join('\n')
  return /Institui[çc][ãa]o:\s*Banco Inter/i.test(topo) && /Saldo por transa[çc][ãa]o/i.test(linhas.map(textoDaLinha).join('\n'))
}

// "8 de Março de 2023" → "2023-03-08"
function dataPorExtenso(t) {
  const m = semAcento(t).match(/^(\d{1,2}) de ([A-Za-z]+) de (\d{4})\b/)
  if (!m) return null
  const mes = MESES.indexOf(m[2].toLowerCase())
  return mes < 0 ? null : `${m[3]}-${pad(mes + 1)}-${pad(Number(m[1]))}`
}

// 'Pix enviado: "Pix enviado: Fulano"' → 'Pix enviado Fulano' · 'Compra no debito: "No estabelecimento LOJA X SAO PAULO BRA"' → 'LOJA X SAO PAULO'
export function limparDescricaoInter(bruta) {
  const t = semControle(bruta).replace(/\s+/g, ' ').trim()
  const m = t.match(/^([^:"]+):\s*"?(.*?)"?\s*$/)
  if (!m) return t.replace(/\s*Transa[çc][ãa]o sem descri[çc][ãa]o$/i, '').trim() || t // linha sem o formato "Tipo: detalhe"
  const tipo = m[1].trim()
  let d = m[2].trim()
  const escapado = tipo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  d = d.replace(new RegExp(`^${escapado}\\s*[:\\-]?\\s*`, 'i'), '') // o banco repete o tipo no detalhe
  d = d.replace(/^-\s*/, '').replace(/\s*-\s*null$/i, '').replace(/^null$/i, '').trim()
  if (/^compra/i.test(tipo)) {
    d = d.replace(/^-\s*/, '').replace(/^no estabelecimento\s+/i, '').replace(/\*Descr\w*/i, '').replace(/\s+bra$/i, '').replace(/\s+/g, ' ').trim()
    return d || tipo
  }
  if (/^salario/i.test(tipo)) return tipo // o detalhe é só o número da conta de origem e o seu nome
  d = d.replace(/^Cp\s*:\s*\d{8}-/i, '') // "Cp :ISPB-Nome": o banco da outra ponta vai em `destino`
  if (/^seguro$/i.test(tipo)) d = d.replace(/^pagamento\s+/i, '').replace(/_/g, ' ') // "Pagamento CARTAO_PROTEGIDO" não é fatura
  return d ? `${tipo} ${d}` : tipo
}

export function lerExtratoInter(linhas) {
  const erros = []
  const textos = linhas.map(textoDaLinha)
  const tudo = textos.join('\n')
  const p = tudo.match(/Per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/i)
  if (!p) throw new Error('Não encontrei o período do extrato.')
  const inicio = `${p[3]}-${p[2]}-${p[1]}`, fim = `${p[6]}-${p[5]}-${p[4]}`
  const ag = tudo.match(/Ag[êe]ncia:\s*([\d-]+)/i), ct = tudo.match(/Conta:\s*([\d.-]+)/i)
  const conta = ag && ct ? `${ag[1].replace(/\D/g, '')}-${ct[1].replace(/\D/g, '')}` : null
  const iCpf = textos.findIndex((t) => /CPF\/CNPJ:/i.test(t))
  const titular = iCpf > 0 && /^[A-Za-zÀ-ÿ' ]+$/.test(textos[iCpf - 1]) ? textos[iCpf - 1] : null

  const doc = []
  let dia = null
  const diasComSaldo = []
  for (const l of linhas) {
    const t = textoDaLinha(l)
    const data = dataPorExtenso(t)
    if (data && /Saldo do dia/i.test(t)) {
      const s = l.itens.map((i) => i.s).filter((s) => VALOR.test(s.trim()))
      dia = { data, saldo: s.length ? valorBR(s.at(-1)) : null }
      diasComSaldo.push(dia)
      continue
    }
    const esquerda = l.itens.filter((i) => i.x < COLUNA_VALOR)
    const valores = l.itens.filter((i) => i.x >= COLUNA_VALOR && VALOR.test(i.s.trim()))
    const desc = esquerda.map((i) => i.s).join(' ').trim()
    // lançamento: começa na margem e tem valor e saldo à direita (quase sempre "Tipo: \"detalhe\"", mas nem sempre)
    if (!desc || esquerda[0]?.x > 80 || (valores.length < 2 && !/^[^:"]+:\s*"/.test(desc))) continue
    if (!dia) { erros.push(`Lançamento antes de qualquer data: "${desc}".`); continue }
    if (valores.length < 2) { erros.push(`Valor ilegível em ${dia.data} ("${desc}").`); continue }
    // PIX: "Cp :90400888-Nome" diz o banco da outra ponta (código ISPB)
    const ispb = /^Pix/i.test(desc) ? desc.match(/Cp\s*:\s*(\d{8})-/)?.[1] : null
    const destino = ispb ? { banco: BANCO_POR_ISPB[ispb] ?? null, ispb } : null
    doc.push({ data: dia.data, valor: valorBR(valores[0].s), saldoImpresso: valorBR(valores.at(-1).s), descricao: limparDescricaoInter(desc), dia, ...(destino ? { destino } : {}) })
  }

  // saldo antes do primeiro lançamento = saldo dele menos o valor
  const saldoInicial = doc.length ? doc[0].saldoImpresso - doc[0].valor : null
  let corrente = saldoInicial
  let conferidos = 0
  const lista = doc.map((x, i) => ({ posicao: i + 1, data: x.data, valor: x.valor, saldoImpresso: x.saldoImpresso, descricao: x.descricao, ...(x.destino ? { destino: x.destino } : {}) }))
  for (const [i, x] of lista.entries()) {
    const quando = x.data.split('-').reverse().join('/')
    if (x.valor === null || x.saldoImpresso === null) { erros.push(`Valor ilegível em ${quando} ("${x.descricao}").`); continue }
    corrente += x.valor
    conferidos++
    if (x.saldoImpresso !== corrente) erros.push(`Em ${quando} ("${x.descricao}"): o banco mostra saldo ${fmt(x.saldoImpresso)}, a leitura deu ${fmt(corrente)}.`)
    if (x.data < inicio || x.data > fim) erros.push(`Lançamento fora do período: ${quando}.`)
    if (i > 0 && x.data < lista[i - 1].data) erros.push(`Lançamentos fora de ordem em ${quando}.`)
  }
  // saldo do dia = saldo depois do último lançamento daquele dia
  for (const d of diasComSaldo) {
    const doDia = doc.filter((x) => x.dia === d)
    if (!doDia.length) continue
    if (d.saldo === null) { erros.push(`Saldo do dia ilegível em ${d.data.split('-').reverse().join('/')}.`); continue }
    if (d.saldo !== doDia.at(-1).saldoImpresso) erros.push(`Em ${d.data.split('-').reverse().join('/')}: saldo do dia ${fmt(d.saldo)} não bate com os lançamentos (${fmt(doDia.at(-1).saldoImpresso)}).`)
  }
  if (diasComSaldo.some((d) => !doc.some((x) => x.dia === d))) erros.push('Há dia no extrato sem nenhum lançamento lido.')

  return {
    formato: 'inter',
    banco: '077',
    nome: `${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`,
    conta,
    titular,
    inicio,
    fim,
    saldoInicial,
    saldoFinal: doc.length ? corrente : null,
    transacoes: lista,
    conferencia: { ok: erros.length === 0, erros, saldosConferidos: conferidos },
  }
}
