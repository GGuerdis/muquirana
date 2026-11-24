import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, Mascote, SeletorMes, ItemLancamento, BarrasCategorias, ResumoEntradasSaidas } from '../components/Pecas.jsx'
import { IconeOlho, IconeOlhoFechado, IconeEssencial, IconeTudo } from '../components/Icones.jsx'
import { formatar } from '../lib/dinheiro.js'
import { mesAtual, dataCurta, nomeMes, hoje } from '../lib/datas.js'
import { saldoConta, resumoMes, contasEstimadas } from '../lib/calculos.js'
import { faturasPendentes } from '../lib/fatura.js'
import { humorDoMes } from '../lib/zoeira.js'
import { compararIds } from '../lib/ids.js'
import { saldoPrevisto } from '../lib/recorrentes.js'
import { salvarConfig } from '../lib/db.js'
import ContasDoMes from '../components/ContasDoMes.jsx'
import LembreteBackup from '../components/LembreteBackup.jsx'
import { OrcamentoDoMes } from '../components/Orcamento.jsx'
import { SeloSincronizacao } from '../components/Nuvem.jsx'
import { SeletorEspaco, ConvitesRecebidos } from '../components/Espacos.jsx'

const ROTULO_FATURA = { aberta: 'aberta', fechada: 'fechada', atrasada: '⚠️ atrasada', paga: 'paga' }
const OCULTO = 'R$ •••••'

export default function Inicio({ mes, setMes, irPara }) {
  const { contas, cartoes, lancamentos, recorrentes, zoeira, config } = useDados()
  const [verPrevisao, setVerPrevisao] = useState(false)
  const ocultar = config.ocultarValores === true
  // "Só o essencial": deixa só o saldo e o "Para onde foi o dinheiro" (fica guardado nos ajustes)
  const essencial = config.inicioEssencial === true
  const mostrar = (v) => (ocultar ? OCULTO : formatar(v))
  const previsao = useMemo(() => saldoPrevisto({ mes: mesAtual(), contas, cartoes, recorrentes, lancamentos }), [contas, cartoes, recorrentes, lancamentos])

  const saldos = useMemo(() => contas.map((c) => ({ ...c, saldo: saldoConta(c, lancamentos) })), [contas, lancamentos])
  const saldoTotal = saldos.reduce((s, c) => s + c.saldo, 0)
  const estimadas = useMemo(() => contasEstimadas(contas, lancamentos), [contas, lancamentos])
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
    const dia = hoje()
    for (const l of [...lancamentos].filter((x) => x.data <= dia).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm - a.criadoEm || compararIds(a.id, b.id))) {
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
      <CabecaPagina titulo="Muquirana" irPara={irPara} extra={
        <button className="botao-acao" onClick={() => salvarConfig('inicioEssencial', !essencial)} aria-pressed={essencial}>
          {essencial ? <><IconeTudo /> Mostrar tudo</> : <><IconeEssencial /> Só o essencial</>}
        </button>
      } />
      {!essencial && <div className="inicio-cabeca">
        <Mascote rosto={humor.rosto} tamanho={52} />
        <div className="textos">
          <span className="ola"><SeloSincronizacao /><SeletorEspaco /></span>
          <span className="frase">{humor.mensagem}</span>
        </div>
      </div>}

      <section className="cartao-topo">
        <div className="saldo-total">
          <div className="saldo-linha">
            <span className="rotulo-claro">Saldo nas contas</span>
            <button className="botao-olho" onClick={() => salvarConfig('ocultarValores', !ocultar)} aria-label={ocultar ? 'Mostrar valores' : 'Esconder valores'} aria-pressed={ocultar}>
              {ocultar ? <IconeOlhoFechado /> : <IconeOlho />}
            </button>
          </div>
          <strong className={`valor-grande ${ocultar ? 'oculto' : ''}`}>{mostrar(saldoTotal)}</strong>
          {!essencial && <button className="previsao" onClick={() => setVerPrevisao((v) => !v)} aria-expanded={verPrevisao}>
            Previsto para {dataCurta(previsao.fimMes)}: <strong>{mostrar(previsao.previsto)}</strong> {verPrevisao ? '▴' : '▾'}
          </button>}
          {verPrevisao && !essencial && !ocultar && (
            <div className="previsao-detalhe">
              <span>Saldo hoje <b>{formatar(previsao.saldoHoje)}</b></span>
              {previsao.agendados !== 0 && <span>Lançamentos agendados <b>{previsao.agendados > 0 ? '+' : '−'} {formatar(Math.abs(previsao.agendados))}</b></span>}
              {previsao.contasFixas !== 0 && <span>Contas fixas a lançar <b>{previsao.contasFixas > 0 ? '+' : '−'} {formatar(Math.abs(previsao.contasFixas))}</b></span>}
              {previsao.faturas !== 0 && <span>Faturas a pagar até {dataCurta(previsao.fimMes)} <b>− {formatar(previsao.faturas)}</b></span>}
            </div>
          )}
        </div>
        {!essencial && <div className="contas-mini">
          {saldos.map((c) => (
            <div key={c.id} className={`conta-mini ${estimadas.has(c.id) ? 'estimada' : ''}`}>
              <span>{c.emoji} {c.nome}</span>
              <strong>{estimadas.has(c.id) && !ocultar ? '≈ ' : ''}{mostrar(c.saldo)}</strong>
            </div>
          ))}
        </div>}
        {!essencial && estimadas.size > 0 && (
          <p className="nota-estimada">
            ≈ Estimado em {saldos.filter((c) => estimadas.has(c.id)).map((c) => c.nome).join(', ')}: só tem o que veio do extrato de outra conta. Importe o extrato dela ou informe o saldo real em Ajustes.
          </p>
        )}
      </section>

      <ConvitesRecebidos />
      {!essencial && <>
        <LembreteBackup />
        <SeletorMes mes={mes} aoMudar={setMes} />
        <ResumoEntradasSaidas entrou={resumo.entrou} saiu={resumo.saiu} />
        <OrcamentoDoMes mes={mes} irPara={irPara} />
      </>}

      <section className="painel">
        <div className="painel-titulo">
          <h3>Para onde foi o dinheiro{essencial && <small className="titulo-mes"> · {nomeMes(mes)}</small>}</h3>
          {resumo.categorias.length > 0 && <button className="link" onClick={() => irPara('historico')}>Histórico</button>}
        </div>
        <BarrasCategorias categorias={resumo.categorias} limite={5} />
      </section>

      {!essencial && <ContasDoMes mes={mes} irPara={irPara} />}

      {!essencial && faturas.length > 0 && (
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

      {!essencial && <section className="painel">
        <div className="painel-titulo">
          <h3>Últimos lançamentos</h3>
          {recentes.length > 0 && <button className="link" onClick={() => irPara('lancamentos')}>Ver todos</button>}
        </div>
        {recentes.length ? recentes.map((l) => <ItemLancamento key={l.id} l={l} mostrarData />) : (
          <p className="vazio">Toque no <strong>+</strong> para lançar seu primeiro gasto.</p>
        )}
      </section>}
    </div>
  )
}
