import { describe, it, expect } from 'vitest'
import { gerarAgenda, regraMensal, escaparTexto, dobrarLinha } from '../src/lib/agenda.js'

const recorrentes = [
  { id: 'r1', descricao: 'Aluguel, apto; centro', tipo: 'despesa', valor: 150000, dia: 10, contaId: 'c1', cartaoId: null, inicio: '2026-01', fim: null },
  { id: 'r2', descricao: 'Salário', tipo: 'receita', valor: 500000, dia: 31, contaId: 'c1', cartaoId: null, inicio: '2026-01', fim: '2027-06' },
  { id: 'r3', descricao: 'Curso que acabou', tipo: 'despesa', valor: 9900, dia: 5, contaId: 'c1', cartaoId: null, inicio: '2025-01', fim: '2025-12' },
  { id: 'r4', descricao: 'Spotify', tipo: 'despesa', valor: 2190, dia: 30, contaId: null, cartaoId: 'k1', inicio: '2027-02', fim: null },
]
const cartoes = [{ id: 'k1', nome: 'Inter', diaFechamento: 12, diaVencimento: 20 }]
const gerar = () => gerarAgenda({ recorrentes, cartoes, hoje: '2026-11-21', nomeConta: () => 'Santander', nomeCartao: () => 'Inter', agora: new Date('2026-11-21T03:00:00Z') })

describe('lembretes na agenda (.ics)', () => {
  it('estrutura válida: calendário, eventos, quebras de linha CRLF', () => {
    const { conteudo, eventos } = gerar()
    expect(eventos).toBe(4) // 3 contas fixas ativas + 1 cartão (o curso já acabou)
    expect(conteudo.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(conteudo.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(conteudo.split('\r\n').filter((l) => l === 'BEGIN:VEVENT').length).toBe(4)
    expect(conteudo.split('\r\n').filter((l) => l === 'END:VEVENT').length).toBe(4)
    expect(/[^\r]\n/.test(conteudo)).toBe(false) // nenhuma quebra só com \n
    expect(conteudo).not.toContain('Curso que acabou')
  })

  it('cada conta fixa repete todo mês no dia certo, começando no mês atual', () => {
    const { conteudo } = gerar()
    const bloco = conteudo.split('BEGIN:VEVENT').find((b) => b.includes('UID:fixa-r1@muquirana'))
    expect(bloco).toContain('DTSTART;VALUE=DATE:20261110')
    expect(bloco).toContain('DTEND;VALUE=DATE:20261111')
    expect(bloco).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=10')
    expect(bloco).toContain('SUMMARY:🧾 Aluguel\\, apto\\; centro (R$ 1.500\\,00)')
    expect(bloco).toContain('TRIGGER:-PT15H') // véspera às 9h
    expect(bloco).toContain('TRIGGER:PT9H') // no dia às 9h
  })

  it('conta fixa com fim: termina no último dia do mês final; que começa no futuro: começa lá', () => {
    const { conteudo } = gerar()
    expect(conteudo).toContain('UNTIL=20270630')
    const spotify = conteudo.split('BEGIN:VEVENT').find((b) => b.includes('UID:fixa-r4@muquirana'))
    expect(spotify).toContain('DTSTART;VALUE=DATE:20270228') // dia 30 em fevereiro: último dia
  })

  it('fatura do cartão: no dia do vencimento, com aviso 2 dias antes', () => {
    const { conteudo } = gerar()
    const bloco = conteudo.split('BEGIN:VEVENT').find((b) => b.includes('UID:fatura-k1@muquirana'))
    expect(bloco).toContain('DTSTART;VALUE=DATE:20261120')
    expect(bloco).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=20')
    expect(bloco).toContain('TRIGGER:-P1DT15H')
  })

  it('dias 29–31 caem no último dia dos meses mais curtos', () => {
    expect(regraMensal(10)).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=10')
    expect(regraMensal(28)).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=28')
    expect(regraMensal(29)).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1')
    expect(regraMensal(31, '20271231')).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20271231')
  })

  it('escapa caracteres especiais e dobra linhas longas em até 75 bytes (sem quebrar acentos)', () => {
    expect(escaparTexto('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const longa = `DESCRIPTION:${'Conta de energia elétrica ação '.repeat(6)}`
    const dobrada = dobrarLinha(longa)
    const partes = dobrada.split('\r\n')
    expect(partes.length).toBeGreaterThan(1)
    for (const p of partes) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    expect(partes.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    expect(partes.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(longa) // nada se perde
  })

  it('sem contas fixas nem cartões: nenhum evento', () => {
    expect(gerarAgenda({ recorrentes: [], cartoes: [], hoje: '2026-11-21' }).eventos).toBe(0)
  })
})
