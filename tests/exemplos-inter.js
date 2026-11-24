// Extratos FICTÍCIOS do Banco Inter, montados como as linhas que o pdf.js extrai do PDF real
// (mesmas colunas e cabeçalhos). Nenhum dado real.

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const brl = (c) => {
  const [i, d] = (Math.abs(c) / 100).toFixed(2).split('.')
  return `${c < 0 ? '-' : ''}R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`
}
const l = (pagina, y, ...itens) => ({ pagina, y, itens: itens.map(([x, s]) => ({ x, s })) })
const porExtenso = (data) => { const [a, m, d] = data.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}` }

/**
 * dias: [{ data: 'AAAA-MM-DD', lancamentos: [{ tipo: 'Pix enviado', detalhe: 'Pix enviado: Fulano', valor }] }]
 * saldoAntes: saldo antes do primeiro lançamento. `estragar`: { saldoDia: 'AAAA-MM-DD' } ou { saldoLanc: n } para testar a conferência.
 * Quebra a página a cada `porPagina` linhas (como o PDF real, o cabeçalho do dia pode ficar no fim da página).
 */
export function extratoInter({ inicio = '2023-01-01', fim = '2023-12-31', saldoAntes = 0, dias = [], titular = 'FULANO DE TAL SOUZA', conta = '12345678-9', porPagina = 12, estragar = {} }) {
  const dt = (d) => d.split('-').reverse().join('/')
  const cab = [
    l(1, 796, [457, 'Solicitado em:'], [500, '24/11/2026 - 12h37']),
    l(1, 759, [39, titular]),
    l(1, 743, [39, 'CPF/CNPJ:'], [81, '000.000.000-00'], [137, ','], [141, 'Instituição:'], [178, 'Banco Inter'], [220, ','], [224, 'Agência:'], [255, '0001-9'], [280, ','], [284, 'Conta:'], [307, conta]),
    l(1, 728, [39, 'Período:'], [69, `${dt(inicio)} a ${dt(fim)}`]),
    l(1, 699, [39, 'Saldo total'], [120, 'Saldo disponível:'], [201, 'Saldo bloqueado:']),
    l(1, 689, [39, 'R$ 35,96'], [120, 'R$ 35,96'], [201, 'R$ 0,00']),
    l(1, 639, [435, 'Valor'], [479, 'Saldo por transação']),
  ]
  const out = [...cab]
  let pagina = 1, y = 637, n = 0, saldo = saldoAntes, k = 0
  const prox = () => { n++; y -= 25; if (n % porPagina === 0) { out.push(l(pagina, 53, [38, 'Fale com a gente'])); pagina++; y = 793 } }
  for (const dia of dias) {
    const fimDoDia = dia.lancamentos.reduce((s, x) => s + x.valor, saldo)
    const saldoDia = estragar.saldoDia === dia.data ? fimDoDia + 100 : fimDoDia
    out.push(l(pagina, y, [42, porExtenso(dia.data)], [118, 'Saldo do dia:'], [162, brl(saldoDia)]))
    prox()
    for (const x of dia.lancamentos) {
      saldo += x.valor
      k++
      const impresso = estragar.saldoLanc === k ? saldo + 1 : saldo
      const partes = String(x.detalhe).split('|') // "|" = o PDF quebrou o texto em dois pedaços na mesma linha
      if (x.semFormato) out.push(l(pagina, y, [44, x.tipo], [417, brl(x.valor)], [512, brl(impresso)])) // linha sem "Tipo: detalhe"
      else out.push(l(pagina, y, [44, `${x.tipo}: "${partes[0]}${partes[1] ? "" : "\""}`], ...(partes[1] ? [[160, `${partes[1]}"`]] : []), [417, brl(x.valor)], [512, brl(impresso)]))
      prox()
    }
  }
  out.push(l(pagina, 41, [38, 'SAC:'], [57, '0800 000 0000']))
  return out
}
