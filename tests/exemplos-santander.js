// Extratos FICTÍCIOS do Santander, montados como as linhas que o pdf.js extrai dos PDFs reais
// (mesmas colunas e cabeçalhos). Nenhum dado real.

const brl = (c) => {
  const neg = c < 0
  const [i, d] = (Math.abs(c) / 100).toFixed(2).split('.')
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`
}
const mov = (c) => (c < 0 ? `${brl(c)}-` : brl(c))
const l = (pagina, y, ...itens) => ({ pagina, y, itens: itens.map(([x, s]) => ({ x, s })) })

/**
 * Consolidado mensal. `linhas` = [{ data:'dd/mm' | null, desc, desc2?, valor, saldo? , separarValor? }]
 * saldoAnterior/saldoFinal em centavos; mes = 'outubro', ano = 2025; dataAnterior 'dd/mm', dataFinal 'dd/mm'
 */
export function consolidado({ mes, ano, dataAnterior, dataFinal, saldoAnterior, lancamentos, titular = 'FULANO DE TAL SOUZA', conta = '02.000000-1', comInvestimentos = false, saldoFinalResumo = null, semSaldoFinal = false, enviados = [] }) {
  const creditos = lancamentos.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0)
  const debitos = -lancamentos.filter((x) => x.valor < 0).reduce((s, x) => s + x.valor, 0)
  const saldoFinal = saldoFinalResumo ?? saldoAnterior + creditos - debitos
  const out = [
    l(1, 815, [421, 'EXTRATO CONSOLIDADO INTELIGENTE']),
    l(1, 806, [513, `${mes}/${ano}`]),
    l(1, 32, [34, 'Extrato_PF_A4_Inteligente - 25/5/2023']),
    l(1, 20, [529, 'Pagina: 1/3']),
    l(2, 815, [421, 'EXTRATO CONSOLIDADO INTELIGENTE']),
    l(2, 806, [513, `${mes}/${ano}`]),
    l(2, 495, [62, `Resumo - ${mes}/${ano}`]),
    l(2, 473, [34, 'Nome']),
    l(2, 463, [34, titular]),
    l(2, 449, [34, 'Agência'], [130, 'Conta Corrente']),
    l(2, 440, [34, '1234'], [130, conta]),
    l(2, 420, [34, '(=)'], [54, `Saldo de Conta Corrente em ${dataAnterior}`], [383, mov(saldoAnterior)]),
    l(2, 409, [54, '(+)'], [74, 'Total de Créditos'], [383, brl(creditos)]),
    l(2, 398, [54, '(-)'], [74, 'Total de Débitos'], [383, brl(debitos)]),
    l(2, 387, [34, '(=)'], [54, `Saldo de Conta Corrente em ${dataFinal}`], [383, mov(saldoFinal)]),
    l(2, 262, [71, 'Conta Corrente']),
    l(2, 237, [34, 'Movimentação']),
    l(2, 215, [34, 'Data'], [65, 'Descrição'], [298, 'Nº Documento'], [409, 'Movimento (R$)'], [508, 'Saldo (R$)']),
    l(2, 204, [65, `SALDO EM ${dataAnterior}`], [526, mov(saldoAnterior)]),
  ]
  let y = 195, pagina = 2, corrente = saldoAnterior
  for (const x of lancamentos) {
    corrente += x.valor
    if (y < 80) { // quebra de página, com cabeçalho repetido
      out.push(l(pagina, 32, [34, 'Extrato_PF_A4_Inteligente - 25/5/2023']), l(pagina, 20, [529, `Pagina: ${pagina}/3`]))
      pagina++
      y = 776
      out.push(l(pagina, 815, [421, 'EXTRATO CONSOLIDADO INTELIGENTE']), l(pagina, 806, [513, `${mes}/${ano}`]))
      out.push(l(pagina, y, [34, 'Data'], [65, 'Descrição'], [298, 'Nº Documento'], [409, 'Movimento (R$)'], [508, 'Saldo (R$)']))
      y -= 10
    }
    const saldo = x.saldo === false ? [] : [[513, mov(x.saldoImpresso ?? corrente)]]
    if (x.separarValor) {
      out.push(l(pagina, y, ...(x.data ? [[34, x.data]] : []), [65, x.desc]))
      y -= 6 // o banco às vezes põe o valor alguns pontos abaixo
      out.push(l(pagina, y, [309, '123456'], [437, mov(x.valor)], ...saldo))
    } else {
      out.push(l(pagina, y, ...(x.data ? [[34, x.data]] : []), [65, x.desc], [309, '123456'], [437, mov(x.valor)], ...saldo))
    }
    y -= 9
    if (x.desc2) { out.push(l(pagina, y, [65, x.desc2])); y -= 9 }
  }
  if (!semSaldoFinal) out.push(l(pagina, y, [65, `SALDO EM ${dataFinal}`], [513, mov(saldoFinal)]))
  out.push(l(pagina, y - 30, [34, 'Se você não tem Limite da Conta e a sua conta ficou com saldo devedor...']))
  // outras seções que NÃO podem ser importadas
  out.push(l(pagina, y - 60, [34, 'Saldos por Período']))
  out.push(l(pagina, y - 70, [34, '14'], [101, '0,00'], [529, '0,00']))
  out.push(l(pagina + 1, 643, [71, 'Compras com Cartão de Débito']))
  out.push(l(pagina + 1, 620, [34, 'Data'], [131, 'Número do Cartão'], [215, 'Estabelecimento'], [511, 'Valor (R$)']))
  out.push(l(pagina + 1, 609, [34, '30/09'], [156, '1111.2222'], [215, 'COMPRA QUE NAO ENTRA'], [528, '999,99']))
  if (comInvestimentos) {
    out.push(l(pagina + 1, 296, [34, 'Renda Fixa']))
    out.push(l(pagina + 1, 199, [34, 'Movimentação']))
    out.push(l(pagina + 1, 189, [34, 'Data'], [91, 'Descrição'], [237, 'Valor Principal (R$)'], [330, 'Valor Bruto (R$)']))
    out.push(l(pagina + 1, 178, [34, '30/09'], [91, 'SALDO ANTERIOR¹'], [278, '457,56'], [360, '494,75'], [449, '7,43'], [521, '487,32']))
  }
  if (enviados.length) {
    // tabela "PIXs Enviados" (no fim do extrato): uma parte com o número do banco e outra com o ISPB
    const pg = pagina + 2
    let y2 = 500
    out.push(l(pg, 530, [71, 'Comprovantes de Pagamento']))
    out.push(l(pg, 520, [34, 'Transferências entre Contas, DOCs, TEDs e PIXs Enviados']))
    for (const parte of ['banco', 'ispb']) {
      const linhas = enviados.filter((e) => (e.ispb ? 'ispb' : 'banco') === parte)
      if (!linhas.length) continue
      out.push(l(pg, y2, [34, 'Data'], [54, 'Canal'], [129, 'Tipo'], [200, 'Favorecido'], parte === 'banco' ? [351, 'Banco'] : [352, 'ISPB*'], [376, 'Agência'], [459, 'Conta'], [513, 'Valor (R$)']))
      y2 -= 11
      for (const e of linhas) {
        out.push(l(pg, y2, [34, `${e.data} INTERNET BANKING`], [129, e.tipo || 'PIX'], [200, e.favorecido], parte === 'banco' ? [355, e.banco] : [341, e.ispb], [384, e.agencia || '0000'], [428, e.conta || '0000000000000'], [523, brl(e.valor)]))
        y2 -= 11
      }
    }
    // linha com o mesmo formato, mas que não é PIX/TED (não pode dar destino a nenhum lançamento)
    out.push(l(pg, y2, [34, '30/09 AGENCIA'], [129, 'DEPOSITO'], [200, 'QUALQUER'], [355, '0033'], [384, '1234'], [428, '0000000000001'], [523, '20,00']))
    y2 -= 11
    // outra tabela logo depois (limite da conta): não é transferência
    out.push(l(pg, y2 - 20, [57, '2.000,00'], [105, '14/05/26'], [151, '14'], [199, '14/03/2026 a 13/04/2026'], [358, '10'], [400, '0'], [529, '0,00']))
  }
  return out
}

/**
 * Extrato de período (gerado no app): do mais NOVO para o mais antigo, saldo após cada lançamento.
 * lancamentos em ordem cronológica: [{ data:'dd/mm/aaaa', tipo:'Pix enviado', detalhe:'Fulano', valor }]
 */
export function parcial({ inicio, fim, saldoInicial, lancamentos, titular = 'Fulano', conta = '02.000000.1' }) {
  const entradas = lancamentos.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0)
  const saidas = -lancamentos.filter((x) => x.valor < 0).reduce((s, x) => s + x.valor, 0)
  const saldoFinal = saldoInicial + entradas - saidas
  const out = [
    l(1, 782, [395, 'EXTRATO'], [472, 'DE CONTA']),
    l(1, 748, [40, 'Agência:'], [82, '1234'], [112, 'Conta:'], [143, conta]),
    l(1, 732, [40, 'Período:'], [79, `${inicio} a ${fim}`]),
    l(1, 716, [40, 'Titular:'], [75, titular]),
    l(1, 664, [48, 'Saldo inicial'], [177, 'Entradas'], [306, 'Saídas'], [434, 'Saldo final']),
    l(1, 646, [48, `R$ ${brl(saldoInicial)}`], [177, `R$ ${brl(entradas)}`], [306, `R$ ${brl(saidas)}`], [434, 'R$'], [447, brl(saldoFinal)]),
    l(1, 598, [40, 'DETALHE DOS'], [110, 'MOVIMENTOS']),
    l(1, 578, [40, 'Data'], [112, 'Descrição'], [429, 'Valor'], [512, 'Saldo']),
  ]
  // saldo depois de cada lançamento (cronológico)
  let s = saldoInicial
  const comSaldo = lancamentos.map((x) => { s += x.valor; return { ...x, saldo: s } })
  let y = 550, pagina = 1
  for (const x of [...comSaldo].reverse()) {
    if (y < 80) { out.push(l(pagina, 20, [544, `${pagina}/2`])); pagina++; y = 760; out.push(l(pagina, 802, [40, 'DETALHE DOS'], [110, 'MOVIMENTOS']), l(pagina, 782, [40, 'Data'], [112, 'Descrição'], [429, 'Valor'], [512, 'Saldo'])) }
    const valor = x.valor < 0 ? `-R$ ${brl(-x.valor)}` : `R$ ${brl(x.valor)}`
    if (x.inline) {
      out.push(l(pagina, y, [40, x.data], [112, x.tipo], [428, valor], [509, `R$ ${brl(x.saldo)}`]))
      y -= 20
    } else {
      out.push(l(pagina, y, [112, x.tipo]))
      out.push(l(pagina, y - 9, [40, x.data], [426, valor], [504, `R$ ${brl(x.saldo)}`]))
      if (x.detalhe) out.push(l(pagina, y - 18, [112, x.detalhe]))
      y -= 38
    }
  }
  return out
}
