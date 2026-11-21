import { useMemo } from 'react'
import { useDados } from '../dados.jsx'
import { Mascote, SeletorMes, ItemLancamento, BarrasCategorias } from '../components/Pecas.jsx'
import { formatar } from '../lib/dinheiro.js'
import { mesAtual, dataCurta, nomeMes } from '../lib/datas.js'
import { saldoConta, resumoMes } from '../lib/calculos.js'
import { faturasPendentes } from '../lib/fatura.js'

const ROTULO_FATURA = { aberta: 'aberta', fechada: 'fechada', atrasada: '⚠️ atrasada', paga: 'paga' }
import { humorDoMes } from '../lib/zoeira.js'

export default function Inicio({ mes, setMes, irPara }) {
  const { contas, cartoes, lancamentos, zoeira } = useDados()

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
    for (const l of [...lancamentos].sort((a, b) => b.criadoEm - a.criadoEm || a.id - b.id)) {
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
        <div className="saudacao">
          <Mascote rosto={humor.rosto} />
          <p className="balao">{humor.mensagem}</p>
        </div>
        <div className="saldo-total">
          <span className="rotulo-claro">Saldo nas contas</span>
          <strong className={saldoTotal < 0 ? 'negativo' : ''}>{formatar(saldoTotal)}</strong>
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

      <SeletorMes mes={mes} aoMudar={setMes} />

      <section className="resumo-mes">
        <div><span className="rotulo">Entrou</span><strong className="entrada">{formatar(resumo.entrou)}</strong></div>
        <div><span className="rotulo">Saiu</span><strong className="saida">{formatar(resumo.saiu)}</strong></div>
        <div>
          <span className="rotulo">{resumo.resultado >= 0 ? 'Sobrou' : 'Faltou'}</span>
          <strong className={resumo.resultado >= 0 ? 'entrada' : 'saida'}>{formatar(Math.abs(resumo.resultado))}</strong>
        </div>
      </section>

      <section className="painel">
        <h3>Para onde foi o dinheiro em {nomeMes(mes)}</h3>
        <BarrasCategorias categorias={resumo.categorias} />
      </section>

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
