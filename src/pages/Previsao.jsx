// Previsão: como fica o saldo de todas as contas nos próximos meses, com o dia mais apertado
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, Bloco } from '../components/Pecas.jsx'
import { Chips } from '../components/Campos.jsx'
import { GraficoLinha } from '../components/Graficos.jsx'
import { IconeAlerta, Ic } from '../components/Icones.jsx'
import { formatar } from '../lib/dinheiro.js'
import { dataCurta, nomeMes, mesDe, partes } from '../lib/datas.js'
import { previsaoSaldo, gastoMensalMedio } from '../lib/previsao.js'

const PERIODOS = [{ valor: 3, rotulo: '3 meses' }, { valor: 6, rotulo: '6 meses' }, { valor: 12, rotulo: '12 meses' }]
const ORIGEM = { agendado: 'agendado', fixa: 'conta fixa', renda: 'renda', fatura: 'fatura', media: 'média dos últimos 3 meses' }
const sinal = (v) => (v === 0 ? formatar(0) : `${v > 0 ? '+' : '−'} ${formatar(Math.abs(v))}`)

export default function Previsao({ irPara }) {
  const { contas, cartoes, fixasERenda, rendas, lancamentos } = useDados()
  const [meses, setMeses] = useState(6)
  // Com a renda cadastrada, a previsão também desconta o gasto médio do dia a dia
  // (sem isso, a linha só subiria: entra o salário e não sai nada além das contas conhecidas)
  const gastoMensal = useMemo(() => (rendas.length ? gastoMensalMedio(lancamentos) : 0), [rendas, lancamentos])
  const p = useMemo(() => previsaoSaldo({ contas, cartoes, recorrentes: fixasERenda, lancamentos, meses, gastoMensal }), [contas, cartoes, fixasERenda, lancamentos, meses, gastoMensal])

  const pontos = useMemo(() => p.dias.map((d, i) => {
    const [a, m, dia] = partes(d.data)
    // rótulo no dia 1 de cada mês; o mês de hoje só ganha rótulo se ainda faltam mais de 10 dias (senão encosta no próximo)
    const marca = dia === 1 || (i === 0 && new Date(a, m, 0).getDate() - dia > 10)
    return { rotulo: marca ? nomeMes(mesDe(d.data), true) : '', marca, titulo: dataCurta(d.data), valores: [d.saldo] }
  }), [p.dias])
  const destaque = p.dias.findIndex((d) => d.data === p.menor?.data)
  const fica = p.menor && p.menor.saldo < 0

  // próximos acontecimentos, agrupados por mês
  const porMes = useMemo(() => {
    const g = new Map()
    for (const e of p.eventos) {
      const m = mesDe(e.data)
      if (!g.has(m)) g.set(m, [])
      g.get(m).push(e)
    }
    return [...g.entries()]
  }, [p.eventos])

  return (
    <div className="pagina">
      <CabecaPagina titulo="Previsão" irPara={irPara} />
      <Chips opcoes={PERIODOS} valor={meses} aoMudar={setMeses} />

      <section className="heroi">
        <div className="sol-canto" aria-hidden="true" />
        <span className="rotulo">Saldo previsto em {dataCurta(p.fim)}</span>
        <strong className="valor-grande">{formatar(p.saldoFinal)}</strong>
        <span className="previsao">Hoje: <strong>{formatar(p.saldoHoje)}</strong></span>
      </section>

      {p.menor && (
        <div className="blocos">
          <Bloco rotulo="Dia mais apertado" valor={formatar(p.menor.saldo)} tom={fica ? 'saida' : undefined} extra={dataCurta(p.menor.data)} />
          <Bloco rotulo="Diferença até lá" valor={sinal(p.saldoFinal - p.saldoHoje)} tom={p.saldoFinal > p.saldoHoje ? 'entrada' : p.saldoFinal < p.saldoHoje ? 'saida' : undefined} extra={`em ${meses} meses`} />
        </div>
      )}
      {fica && (
        <p className="aviso-linha"><Ic i={IconeAlerta} className="atencao" /> O saldo fica negativo em {dataCurta(p.menor.data)}. Vale rever as contas desse período.</p>
      )}

      <section className="painel">
        <h3>Saldo de todas as contas, dia a dia</h3>
        <GraficoLinha rotuloAcessivel={`Saldo previsto de hoje até ${dataCurta(p.fim)}; mais apertado em ${p.menor ? dataCurta(p.menor.data) : '-'}`}
          series={[{ nome: 'Saldo', cor: 'var(--serie-1)' }]} formatar={formatar} pontos={pontos} destaque={destaque >= 0 ? destaque : null} />
        <div className="fim-dos-meses" data-sem-arrasto>
          {p.fimDosMeses.map((m) => (
            <span key={m.mes}><small>fim de {nomeMes(m.mes, true)}</small><b className={m.saldo < 0 ? 'saida' : undefined}>{formatar(m.saldo)}</b></span>
          ))}
        </div>
      </section>

      <section className="painel">
        <h3>O que vem por aí</h3>
        {porMes.length === 0 && <p className="vazio">Nada agendado, nenhuma conta fixa ou renda pendente e nenhuma fatura a pagar no período.</p>}
        {porMes.map(([m, itens]) => (
          <div key={m} className="dia-bloco">
            <div className="dia-topo"><span>{nomeMes(m)}</span></div>
            {itens.map((e, i) => (
              <div key={`${e.data}-${i}`} className="linha-previsao">
                <span className="linha-previsao-data">{dataCurta(e.data)}</span>
                <span className="linha-previsao-nome">{e.descricao}<small>{ORIGEM[e.origem]}</small></span>
                <strong className={e.valor > 0 ? 'entrada' : undefined}>{sinal(e.valor)}</strong>
              </div>
            ))}
          </div>
        ))}
        <p className="dica">{gastoMensal > 0
          ? `A previsão usa lançamentos com data futura, contas fixas, a renda, faturas e o gasto médio do dia a dia (${formatar(gastoMensal)} por mês, média dos últimos 3 meses, sem contas fixas e parcelas).`
          : 'A previsão usa o que já está no app: lançamentos com data futura, contas fixas e faturas. Gastos do dia a dia que você ainda não lançou não entram. Cadastre a renda para a previsão contar o salário e o gasto médio.'}</p>
      </section>
    </div>
  )
}
