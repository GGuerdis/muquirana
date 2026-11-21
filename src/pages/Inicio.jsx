import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { Mascote, SeletorMes, ItemLancamento, BarrasCategorias } from '../components/Pecas.jsx'
import { formatar } from '../lib/dinheiro.js'
import { mesAtual, dataCurta, nomeMes } from '../lib/datas.js'
import { saldoConta, resumoMes } from '../lib/calculos.js'
import { faturasPendentes } from '../lib/fatura.js'
import { humorDoMes } from '../lib/zoeira.js'
import { compararIds } from '../lib/ids.js'
import { saldoPrevisto } from '../lib/recorrentes.js'
import ContasDoMes from '../components/ContasDoMes.jsx'
import { OrcamentoDoMes } from '../components/Orcamento.jsx'
import { SeloSincronizacao } from '../components/Nuvem.jsx'
import { SeletorEspaco, ConvitesRecebidos } from '../components/Espacos.jsx'

const ROTULO_FATURA = { aberta: 'aberta', fechada: 'fechada', atrasada: '⚠️ atrasada', paga: 'paga' }

export default function Inicio({ mes, setMes, irPara }) {
  const { contas, cartoes, lancamentos, recorrentes, zoeira } = useDados()
  const [verPrevisao, setVerPrevisao] = useState(false)
  const previsao = useMemo(() => saldoPrevisto({ mes: mesAtual(), contas, cartoes, recorrentes, lancamentos }), [contas, cartoes, recorrentes, lancamentos])

  const saldos = useMemo(() => contas.map((c) => ({ ...c, saldo: saldoConta(c, lancamentos) })), [contas, lancamentos])
  const saldoTotal = saldos.reduce((s, c) => s + c.saldo, 0)
  const resumo = useMemo(() => resumoMes(mes, lancamentos), [mes, lancamentos])
  const humor = humorDoMes(resumo, mes === mesAtual(), zoeira)
  const faturas = useMemo(
    () => cartoes.flatMap((c) => faturasPendentes(c, lancamentos).map((r) => ({ cartao: c, ...r }))),
    [cartoes, lancamentos],
  )
  // Os 5 lançamentos mais recentes; uma compra parcelada aparece uma vez só (pela 1ª parcela)
  const recentes = useMemo(() => {
    const vistos = new Set()
    const lista = []
    for (const l of [...lancamentos].sort((a, b) => b.criadoEm - a.criadoEm || compararIds(a.id, b.id))) {
      if (l.grupoParcelaId) {
        if (vistos.has(l.grupoParcelaId)) continue
        vistos.add(l.grupoParcelaId)
      }
      lista.push(l)
      if (lista.length === 5) break
    }
    return lista
  }, [lancamentos])

  return (
    <div className="pagina">
      <section className="cartao-topo">
        <div className="topo-linha"><SeloSincronizacao /><SeletorEspaco /></div>
        <button className="botao-engrenagem" onClick={() => irPara('ajustes')} aria-label="Ajustes">⚙️</button>
        <div className="saudacao">
          <Mascote rosto={humor.rosto} />
          <p className="balao">{humor.mensagem}</p>
        </div>
        <div className="saldo-total">
          <span className="rotulo-claro">Saldo nas contas</span>
          <strong className={saldoTotal < 0 ? 'negativo' : ''}>{formatar(saldoTotal)}</strong>
          <button className="previsao" onClick={() => setVerPrevisao((v) => !v)} aria-expanded={verPrevisao}>
            Previsto para {dataCurta(previsao.fimMes)}: <strong className={previsao.previsto < 0 ? 'negativo' : ''}>{formatar(previsao.previsto)}</strong> {verPrevisao ? '▴' : '▾'}
          </button>
          {verPrevisao && (
            <div className="previsao-detalhe">
              <span>Saldo hoje <b>{formatar(previsao.saldoHoje)}</b></span>
              {previsao.agendados !== 0 && <span>Lançamentos agendados <b>{previsao.agendados > 0 ? '+' : '−'} {formatar(Math.abs(previsao.agendados))}</b></span>}
              {previsao.contasFixas !== 0 && <span>Contas fixas a lançar <b>{previsao.contasFixas > 0 ? '+' : '−'} {formatar(Math.abs(previsao.contasFixas))}</b></span>}
              {previsao.faturas !== 0 && <span>Faturas a pagar até {dataCurta(previsao.fimMes)} <b>− {formatar(previsao.faturas)}</b></span>}
            </div>
          )}
        </div>
        <div className="contas-mini">
          {saldos.map((c) => (
            <div key={c.id} className="conta-mini">
              <span>{c.emoji} {c.nome}</span>
              <strong className={c.saldo < 0 ? 'negativo' : ''}>{formatar(c.saldo)}</strong>
            </div>
          ))}
        </div>
      </section>

      <ConvitesRecebidos />

      <SeletorMes mes={mes} aoMudar={setMes} />

      <section className="resumo-mes">
        <div><span className="rotulo">Entrou</span><strong className="entrada">{formatar(resumo.entrou)}</strong></div>
        <div><span className="rotulo">Saiu</span><strong className="saida">{formatar(resumo.saiu)}</strong></div>
        <div>
          <span className="rotulo">{resumo.resultado >= 0 ? 'Sobrou' : 'Faltou'}</span>
          <strong className={resumo.resultado >= 0 ? 'entrada' : 'saida'}>{formatar(Math.abs(resumo.resultado))}</strong>
        </div>
      </section>

      <OrcamentoDoMes mes={mes} irPara={irPara} />

      <section className="painel">
        <h3>Para onde foi o dinheiro em {nomeMes(mes)}</h3>
        <BarrasCategorias categorias={resumo.categorias} />
      </section>

      <ContasDoMes mes={mes} irPara={irPara} />

      {faturas.length > 0 && (
        <section className="painel">
          <h3>Faturas</h3>
          {faturas.map((f) => (
            <button key={`${f.cartao.id}-${f.fatura}`} className="linha-fatura" onClick={() => irPara('cartoes')}>
              <span>💳 {f.cartao.nome} · {nomeMes(f.fatura, true)}<small>{ROTULO_FATURA[f.status]} · vence {dataCurta(f.vencimento)}</small></span>
              <strong>{f.status === 'paga' ? 'Paga ✅' : formatar(f.restante)}</strong>
            </button>
          ))}
        </section>
      )}

      <section className="painel">
        <div className="painel-titulo">
          <h3>Últimos lançamentos</h3>
          {recentes.length > 0 && <button className="link" onClick={() => irPara('lancamentos')}>Ver todos</button>}
        </div>
        {recentes.length ? recentes.map((l) => <ItemLancamento key={l.id} l={l} mostrarData />) : (
          <p className="vazio">Toque no <strong>+</strong> para lançar seu primeiro gasto.</p>
        )}
      </section>
    </div>
  )
}
