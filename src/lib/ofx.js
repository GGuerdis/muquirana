// Leitor de extratos OFX (o formato padrão que os bancos exportam).
// Funciona com OFX 1.x (SGML, tags sem fechamento) e 2.x (XML).
// Tudo roda no aparelho: o arquivo não é enviado para lugar nenhum.
import { dataValida } from './datas.js'

// Bancos brasileiros às vezes salvam em Windows-1252 (acentos) e às vezes em UTF-8.
// Tenta UTF-8 estrito; se não for UTF-8 válido, lê como Windows-1252.
export function decodificarArquivo(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

// Valor em centavos (com sinal). O padrão OFX não usa separador de milhar:
// o único separador ("." ou ",") é o decimal. Retorna null se não der para ler com segurança.
export function valorOfx(texto) {
  let t = String(texto ?? '').trim().replace(/\s/g, '')
  if (!t) return null
  let sinal = 1
  if (t[0] === '-') { sinal = -1; t = t.slice(1) } else if (t[0] === '+') t = t.slice(1)
  const partes = t.split(/[.,]/)
  if (partes.length > 2) return null
  const [inteiro, frac = ''] = partes
  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(frac) || (inteiro === '' && frac === '')) return null
  if (/[1-9]/.test(frac.slice(2))) return null // mais de 2 casas decimais com valor: não arredonda escondido
  const centavos = Number(inteiro || '0') * 100 + Number((frac + '00').slice(0, 2))
  if (!Number.isSafeInteger(centavos)) return null
  return centavos === 0 ? 0 : sinal * centavos
}

// "20261120120000[-3:BRT]" → "2026-11-20"
export function dataOfx(texto) {
  const m = String(texto ?? '').trim().match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const data = `${m[1]}-${m[2]}-${m[3]}`
  return dataValida(data) ? data : null
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' }
const limparTexto = (t) => (t ?? '').replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (e) => ENTIDADES[e]).replace(/\s+/g, ' ').trim()

// Valor de uma tag "folha": <TAG>valor  (com ou sem </TAG>)
function tag(bloco, nome) {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))
  return m ? limparTexto(m[1]) : null
}

function bloco(texto, nome) {
  const m = texto.match(new RegExp(`<${nome}>([\\s\\S]*?)(</${nome}>|$)`, 'i'))
  return m ? m[1] : ''
}

export function lerOFX(texto) {
  if (typeof texto !== 'string' || !/<OFX>/i.test(texto)) throw new Error('Este arquivo não parece ser um extrato OFX.')

  const ehCartao = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(texto)
  const lista = bloco(texto, 'BANKTRANLIST')
  const pedacos = (lista || texto).split(/<STMTTRN>/i).slice(1).map((p) => p.split(/<\/STMTTRN>/i)[0])

  const transacoes = []
  const problemas = []
  pedacos.forEach((p, i) => {
    const data = dataOfx(tag(p, 'DTPOSTED'))
    const valor = valorOfx(tag(p, 'TRNAMT'))
    const nome = tag(p, 'NAME') || ''
    const memo = tag(p, 'MEMO') || ''
    const descricao = [nome, memo].filter((x, j, arr) => x && arr.indexOf(x) === j).join(' - ') || tag(p, 'TRNTYPE') || 'Sem descrição'
    if (!data || valor === null) {
      problemas.push({ posicao: i + 1, descricao, motivo: !data ? 'data ilegível' : 'valor ilegível' })
      return
    }
    if (valor === 0) {
      problemas.push({ posicao: i + 1, descricao, motivo: 'valor zero' })
      return
    }
    transacoes.push({
      posicao: i + 1,
      fitid: tag(p, 'FITID') || null,
      tipoOfx: (tag(p, 'TRNTYPE') || '').toUpperCase(),
      data,
      valor, // centavos com sinal: negativo = saiu, positivo = entrou
      descricao: descricao.slice(0, 120),
    })
  })

  const saldoBloco = bloco(texto, 'LEDGERBAL')
  const saldoValor = saldoBloco ? valorOfx(tag(saldoBloco, 'BALAMT')) : null
  const saldoData = saldoBloco ? dataOfx(tag(saldoBloco, 'DTASOF')) : null

  return {
    tipo: ehCartao ? 'cartao' : 'conta',
    banco: tag(texto, 'BANKID') || tag(texto, 'ORG') || null,
    conta: tag(texto, 'ACCTID'),
    inicio: dataOfx(tag(lista, 'DTSTART')),
    fim: dataOfx(tag(lista, 'DTEND')),
    saldo: saldoValor !== null && saldoData ? { valor: saldoValor, data: saldoData } : null,
    transacoes,
    problemas,
  }
}

// Códigos de banco mais comuns, para sugerir a conta certa
const BANCOS = { '033': 'Santander', '077': 'Inter', '260': 'Nubank', '341': 'Itaú', '237': 'Bradesco', '001': 'Banco do Brasil', '104': 'Caixa', '336': 'C6', '212': 'Original' }
export function nomeDoBanco(codigo) {
  if (!codigo) return null
  const limpo = String(codigo).replace(/\D/g, '').padStart(3, '0').slice(-3)
  return BANCOS[limpo] || null
}
