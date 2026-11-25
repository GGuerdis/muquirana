// Assinaturas e cobranças que se repetem: o app procura no histórico gastos com a mesma "identidade"
// de descrição (ex.: NETFLIX), uma vez por mês, com valor parecido, em vários meses seguidos.
// Os que ainda não são conta fixa viram sugestão ("virar conta fixa?"); se o preço subiu, avisa.
import { chaveDescricao } from './categorizar.js'
import { mesDe, somarMeses, hoje as hojeTexto, partes } from './datas.js'

const MESES_OLHADOS = 6 // olha os últimos 6 meses
const MINIMO_MESES = 3 // precisa aparecer em pelo menos 3 deles
const VARIACAO = 0.25 // valores até 25% diferentes da mediana ainda são "o mesmo"

const mediana = (xs) => {
  const v = [...xs].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2)
}

/**
 * Cobranças recorrentes achadas no histórico.
 * Retorna [{ chave, descricao, valor, valorAnterior, subiu, dia, meses, ultimaData, categoriaId, contaId, cartaoId, porAno, ehContaFixa }]
 */
export function acharAssinaturas(lancamentos, { recorrentes = [], dia = hojeTexto() } = {}) {
  const mesHoje = mesDe(dia)
  const desde = somarMeses(mesHoje, -(MESES_OLHADOS - 1))
  const grupos = new Map()
  for (const l of lancamentos) {
    if (l.tipo !== 'despesa' || l.grupoParcelaId || l.data > dia) continue
    const m = mesDe(l.data)
    if (m < desde) continue
    const chave = chaveDescricao(l.descricao)
    if (!chave) continue
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(l)
  }

  const fixasPorChave = new Map(recorrentes.filter((r) => r.tipo === 'despesa').map((r) => [chaveDescricao(r.descricao), r]))
  const achadas = []
  for (const [chave, itens] of grupos) {
    const porMes = new Map()
    for (const l of itens) {
      const m = mesDe(l.data)
      if (!porMes.has(m)) porMes.set(m, [])
      porMes.get(m).push(l)
    }
    if (porMes.size < MINIMO_MESES) continue
    // uma cobrança por mês (compras frequentes, como mercado e padaria, ficam de fora)
    if ([...porMes.values()].some((x) => x.length > 1)) continue
    // ainda ativa: cobrou neste mês ou no anterior
    const meses = [...porMes.keys()].sort()
    if (meses[meses.length - 1] < somarMeses(mesHoje, -1)) continue
    const ordenados = itens.sort((a, b) => a.data.localeCompare(b.data))
    const valores = ordenados.map((l) => l.valor)
    const med = mediana(valores)
    if (valores.some((v) => Math.abs(v - med) > med * VARIACAO)) continue
    const ultimo = ordenados[ordenados.length - 1]
    const anterior = [...ordenados].reverse().find((l) => l.valor !== ultimo.valor)
    const subiu = !!anterior && ultimo.valor > anterior.valor && ordenados.indexOf(anterior) === ordenados.length - 2
    const fixa = !!(fixasPorChave.get(chave) || ordenados.some((l) => l.recorrenteId))
    achadas.push({
      chave,
      descricao: ultimo.descricao,
      valor: ultimo.valor,
      valorAnterior: subiu ? anterior.valor : null,
      subiu,
      dia: mediana(ordenados.map((l) => partes(l.data)[2])),
      meses: porMes.size,
      ultimaData: ultimo.data,
      categoriaId: ultimo.categoriaId ?? null,
      contaId: ultimo.cartaoId ? null : ultimo.contaId ?? null,
      cartaoId: ultimo.cartaoId ?? null,
      porAno: ultimo.valor * 12,
      ehContaFixa: fixa,
    })
  }
  // as que subiram primeiro, depois as mais caras
  return achadas.sort((a, b) => Number(b.subiu) - Number(a.subiu) || b.valor - a.valor || a.chave.localeCompare(b.chave))
}

// Dados para cadastrar a assinatura como conta fixa (o formulário abre preenchido)
export function modeloContaFixa(a, mes) {
  return {
    tipo: 'despesa',
    descricao: (a.descricao || a.chave).slice(0, 60),
    valor: a.valor,
    dia: Math.min(Math.max(a.dia, 1), 31),
    categoriaId: a.categoriaId,
    origem: a.cartaoId != null ? `cartao:${a.cartaoId}` : a.contaId != null ? `conta:${a.contaId}` : null,
    inicio: mes,
    fim: null,
  }
}
