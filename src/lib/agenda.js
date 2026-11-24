// Lembretes na agenda do celular: gera um arquivo .ics (padrão iCalendar, RFC 5545)
// com as contas fixas e os vencimentos das faturas, repetindo todo mês e com aviso antes.
// Nenhum servidor: o arquivo é gerado no aparelho e aberto pela agenda.
import { formatar } from './dinheiro.js'

const pad = (n) => String(n).padStart(2, '0')

// Escapa texto conforme o padrão (\ ; , e quebras de linha)
export const escaparTexto = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Linhas longas são "dobradas" em pedaços de até 75 bytes (o padrão exige), sem quebrar acentos
export function dobrarLinha(linha) {
  const bytes = new TextEncoder()
  if (bytes.encode(linha).length <= 75) return linha
  const partes = []
  let atual = ''
  for (const ch of linha) {
    const limite = partes.length === 0 ? 75 : 74 // as continuações começam com um espaço
    if (bytes.encode(atual + ch).length > limite) { partes.push(atual); atual = ch } else atual += ch
  }
  partes.push(atual)
  return partes.map((p, i) => (i === 0 ? p : ` ${p}`)).join('\r\n')
}

// Repetição mensal no dia escolhido; dias 29–31 caem no último dia nos meses mais curtos
export function regraMensal(dia, ate = null) {
  const porDia = dia <= 28 ? `BYMONTHDAY=${dia}` : `BYMONTHDAY=${Array.from({ length: dia - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`
  return `RRULE:FREQ=MONTHLY;${porDia}${ate ? `;UNTIL=${ate}` : ''}`
}

const dataIcs = (iso) => iso.replace(/-/g, '')
function primeiraOcorrencia(mesInicio, dia) {
  const [a, m] = mesInicio.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  return `${mesInicio}-${pad(Math.min(dia, ultimo))}`
}
function fimDoMes(mes) {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${pad(new Date(a, m, 0).getDate())}`
}

function evento({ uid, titulo, descricao, inicio, regra, avisos, carimbo }) {
  const fimDia = (() => { const [a, m, d] = inicio.split('-').map(Number); const dt = new Date(Date.UTC(a, m - 1, d + 1)); return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` })()
  const linhas = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${carimbo}`,
    `DTSTART;VALUE=DATE:${dataIcs(inicio)}`,
    `DTEND;VALUE=DATE:${fimDia}`,
    regra,
    `SUMMARY:${escaparTexto(titulo)}`,
    `DESCRIPTION:${escaparTexto(descricao)}`,
    'TRANSP:TRANSPARENT',
  ]
  for (const a of avisos) {
    linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escaparTexto(titulo)}`, `TRIGGER:${a}`, 'END:VALARM')
  }
  linhas.push('END:VEVENT')
  return linhas
}

/**
 * Gera o conteúdo do arquivo .ics.
 * @param recorrentes contas fixas; cartoes; nomes: { conta(id), cartao(id) }; agora: Date (para DTSTAMP)
 */
export function gerarAgenda({ recorrentes, cartoes, nomeConta = () => '', nomeCartao = () => '', hoje, agora = new Date() }) {
  const carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const mesHoje = hoje.slice(0, 7)
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mukirana//Lembretes//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mukirana']
  let eventos = 0
  for (const r of recorrentes) {
    if (r.fim && r.fim < mesHoje) continue // já acabou
    const mesInicio = r.inicio > mesHoje ? r.inicio : mesHoje
    const onde = r.cartaoId != null ? `cartão ${nomeCartao(r.cartaoId)}` : nomeConta(r.contaId)
    const ate = r.fim ? dataIcs(fimDoMes(r.fim)) : null
    linhas.push(...evento({
      uid: `fixa-${r.id}@muquirana`,
      titulo: `${r.tipo === 'receita' ? '💰' : '🧾'} ${r.descricao} (${formatar(r.valor).replace(/\s/g, ' ')})`,
      descricao: `${r.tipo === 'receita' ? 'Entrada' : 'Conta fixa'} no Mukirana: ${r.descricao}, ${formatar(r.valor).replace(/\s/g, ' ')}${onde ? ` · ${onde}` : ''}. Lembre de confirmar no app.`,
      inicio: primeiraOcorrencia(mesInicio, r.dia),
      regra: regraMensal(r.dia, ate),
      avisos: r.tipo === 'receita' ? ['PT9H'] : ['-PT15H', 'PT9H'], // despesa: na véspera e no dia, às 9h (o evento começa à meia-noite)
      carimbo,
    }))
    eventos++
  }
  for (const c of cartoes) {
    linhas.push(...evento({
      uid: `fatura-${c.id}@muquirana`,
      titulo: `💳 Vence a fatura do ${nomeCartao(c.id) || c.nome}`,
      descricao: `Fatura do cartão ${c.nome} vence hoje (fecha dia ${c.diaFechamento}). Confira o valor no Mukirana.`,
      inicio: primeiraOcorrencia(mesHoje, c.diaVencimento),
      regra: regraMensal(c.diaVencimento),
      avisos: ['-P1DT15H', 'PT9H'], // dois dias antes e no dia, às 9h
      carimbo,
    }))
    eventos++
  }
  linhas.push('END:VCALENDAR')
  return { conteudo: linhas.map(dobrarLinha).join('\r\n') + '\r\n', eventos }
}
