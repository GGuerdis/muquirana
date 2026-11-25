import { useCallback, useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, SeletorMes, ItemLancamento, BarrasCategorias, ResumoEntradasSaidas, Bloco, MarcaConta, MarcaCartao } from '../components/Pecas.jsx'
import { IconeOlho, IconeOlhoFechado, IconeEssencial, IconeTudo, IconeAjustar } from '../components/Icones.jsx'
import { formatar } from '../lib/dinheiro.js'
import { mesAtual, dataCurta, nomeMes, hoje } from '../lib/datas.js'
import { saldoConta, resumoMes } from '../lib/calculos.js'
import { faturasPendentes } from '../lib/fatura.js'
import { compararIds } from '../lib/ids.js'
import { saldoPrevisto } from '../lib/recorrentes.js'
import { salvarConfig } from '../lib/db.js'
import ContasDoMes from '../components/ContasDoMes.jsx'
import LembreteBackup from '../components/LembreteBackup.jsx'
import EscolherEssencial from '../components/EscolherEssencial.jsx'
import { blocosVisiveis } from '../lib/inicio.js'
import { OrcamentoDoMes, AlertasOrcamento } from '../components/Orcamento.jsx'
import { SeloSincronizacao } from '../components/Nuvem.jsx'
import { SeletorEspaco, ConvitesRecebidos } from '../components/Espacos.jsx'
import { rendaDoMes, aprenderRenda } from '../lib/renda.js'

const ROTULO_FATURA = { aberta: 'aberta', fechada: 'fechada', atrasada: 'atrasada', paga: 'paga' }
const OCULTO = 'R$ •••••'

export default function Inicio({ mes, setMes, irPara }) {
  const { contas, cartoes, lancamentos, recorrentes, rendas, fixasERenda, categorias, orcamentos, config } = useDados()
  const [verPrevisao, setVerPrevisao] = useState(false)
  const ocultar = config.ocultarValores === true
  // "Só o essencial": mostra só o saldo e os blocos que você marcou (escolha fica guardada)
  const essencial = config.inicioEssencial === true
  const ver = blocosVisiveis(essencial, config.inicioEssencialBlocos)
  const [escolhendo, setEscolhendo] = useState(false)
  const fecharEscolha = useCallback(() => setEscolhendo(false), [])
  const mostrar = (v) => (ocultar ? OCULTO : formatar(v))
  const previsao = useMemo(() => saldoPrevisto({ mes: mesAtual(), contas, cartoes, recorrentes: fixasERenda, lancamentos }), [contas, cartoes, fixasERenda, lancamentos])

  const saldos = useMemo(() => contas.map((c) => ({ ...c, saldo: saldoConta(c, lancamentos) })), [contas, lancamentos])
  const saldoTotal = saldos.reduce((s, c) => s + c.saldo, 0)
  const resumo = useMemo(() => resumoMes(mes, lancamentos), [mes, lancamentos])
  // Com a renda: o mês em andamento conta o salário que ainda vai entrar ("deve sobrar"),
  // e o salário que caiu no mês seguinte (ex.: dia 1º) conta no mês a que pertence.
  const renda = useMemo(() => (rendas.length && mes <= mesAtual() ? rendaDoMes(mes, rendas, lancamentos) : null), [mes, rendas, lancamentos])
  const fecho = useMemo(() => {
    if (!renda) return null
    const valor = resumo.entrou + renda.ajuste + renda.falta - resumo.saiu
    if (mes === mesAtual()) return { valor, previsto: renda.falta > 0, extra: renda.falta > 0 ? 'se não gastar mais' : 'no mês' }
    return renda.ajuste ? { valor, extra: 'com o salário do mês' } : null
  }, [renda, resumo, mes])
  // Sem renda cadastrada: se o app achou o salário nos extratos, convida a confirmar
  const achouRenda = useMemo(() => !rendas.length && config.rendaSugestaoDispensada !== mesAtual() && aprenderRenda({ lancamentos, categorias }).some((p) => p.principal), [rendas, lancamentos, categorias, config.rendaSugestaoDispensada])
  const faturas = useMemo(
    () => cartoes.flatMap((c) => faturasPendentes(c, lancamentos).map((r) => ({ cartao: c, ...r }))),
    [cartoes, lancamentos],
  )
  // A fatura em aberto que vence primeiro (vira um bloco ao lado do "sobrou")
  const proximaFatura = useMemo(() => faturas.filter((f) => f.status !== 'paga' && f.restante > 0).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0] || null, [faturas])
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
      <CabecaPagina titulo="Mukirana" irPara={irPara} />
      <div className="inicio-status">
        <SeloSincronizacao /><SeletorEspaco />
        <button className="link-essencial" onClick={() => salvarConfig('inicioEssencial', !essencial)} aria-pressed={essencial}>
          {essencial ? <><IconeTudo /> Mostrar tudo</> : <><IconeEssencial /> Só o essencial</>}
        </button>
      </div>

      <section className="heroi">
        <div className="sol-canto" aria-hidden="true" />
        <div className="saldo-linha">
          <span className="rotulo">Saldo nas contas</span>
          <button className="botao-olho" onClick={() => salvarConfig('ocultarValores', !ocultar)} aria-label={ocultar ? 'Mostrar valores' : 'Esconder valores'} aria-pressed={ocultar}>
            {ocultar ? <IconeOlhoFechado /> : <IconeOlho />}
          </button>
        </div>
        <strong className={`valor-grande ${ocultar ? 'oculto' : ''}`}>{mostrar(saldoTotal)}</strong>
        {ver.has('previsao') && <button className="previsao" onClick={() => setVerPrevisao((v) => !v)} aria-expanded={verPrevisao}>
          Previsto para {dataCurta(previsao.fimMes)}: <strong>{mostrar(previsao.previsto)}</strong> {verPrevisao ? '▴' : '▾'}
        </button>}
        {verPrevisao && ver.has('previsao') && !ocultar && (
          <div className="previsao-detalhe">
            <span>Saldo hoje <b>{formatar(previsao.saldoHoje)}</b></span>
            {previsao.agendados !== 0 && <span>Lançamentos agendados <b>{previsao.agendados > 0 ? '+' : '−'} {formatar(Math.abs(previsao.agendados))}</b></span>}
            {previsao.contasFixas !== 0 && <span>Contas fixas a lançar <b>{previsao.contasFixas > 0 ? '+' : '−'} {formatar(Math.abs(previsao.contasFixas))}</b></span>}
            {previsao.faturas !== 0 && <span>Faturas a pagar até {dataCurta(previsao.fimMes)} <b>− {formatar(previsao.faturas)}</b></span>}
          </div>
        )}
      </section>

      <ConvitesRecebidos />
      <AlertasOrcamento irPara={irPara} ocultar={ocultar} />
      {ver.has('backup') && <LembreteBackup />}

      {ver.has('resumo') && <>
        <SeletorMes mes={mes} aoMudar={setMes} />
        <ResumoEntradasSaidas entrou={resumo.entrou} saiu={resumo.saiu} fecho={fecho} extraEntrou={renda && renda.esperado > 0 ? `renda: ${Math.round((renda.recebido / renda.esperado) * 100)}% recebida` : undefined} aoTocar={(tipo) => irPara('lancamentos', { filtro: { tipo } })} quarto={proximaFatura && (
          <Bloco rotulo={`Fatura ${proximaFatura.cartao.nome}`} valor={mostrar(proximaFatura.restante)} extra={`vence ${dataCurta(proximaFatura.vencimento)}`} aoTocar={() => irPara('cartoes')} />
        )} />
        {renda && renda.pendentes.length > 0 && (
          <button className="renda-falta" onClick={() => irPara('renda')}>
            <span>Ainda deve entrar <strong>{mostrar(renda.falta)}</strong></span>
            <small>{renda.pendentes.map((p) => `${p.renda.descricao}, ${p.situacao === 'atrasada' ? `era para ${dataCurta(p.previsto)}` : `até ${dataCurta(p.previsto)}`}`).join(' · ')}</small>
          </button>
        )}
        {achouRenda && mes === mesAtual() && (
          <button className="renda-falta" onClick={() => irPara('renda')}>
            <span>O app encontrou seu salário nos extratos</span>
            <small>Confirme a renda para o mês mostrar quanto ainda deve entrar</small>
          </button>
        )}
      </>}

      {ver.has('contas') && <>
        <span className="rotulo-secao">Contas</span>
        <div className="blocos">
          {saldos.map((c) => (
            <Bloco key={c.id} marca={<MarcaConta conta={c} />} rotulo={c.nome} valor={mostrar(c.saldo)} aoTocar={() => irPara('lancamentos', { filtro: { contaId: c.id } })} />
          ))}
        </div>
      </>}
      {ver.has('orcamento') && orcamentos.length > 0 && <OrcamentoDoMes mes={mes} irPara={irPara} />}

      {ver.has('categorias') && <section className="painel">
        <div className="painel-titulo">
          <h3>Para onde foi o dinheiro{!ver.has('resumo') && <small className="titulo-mes"> · {nomeMes(mes)}</small>}</h3>
          {resumo.categorias.length > 0 && <button className="link" onClick={() => irPara('historico')}>Histórico</button>}
        </div>
        <BarrasCategorias categorias={resumo.categorias} limite={5} />
      </section>}

      {ver.has('contasFixas') && recorrentes.length > 0 && <ContasDoMes mes={mes} irPara={irPara} />}

      {ver.has('faturas') && faturas.length > 0 && (
        <section className="painel">
          <h3>Faturas</h3>
          {faturas.map((f) => (
            <button key={`${f.cartao.id}-${f.fatura}`} className="linha-fatura" onClick={() => irPara('cartoes')}>
              <span className="com-marca"><MarcaCartao /><span>{f.cartao.nome} · {nomeMes(f.fatura, true)}<small className={f.status === 'atrasada' ? 'saida' : undefined}>{ROTULO_FATURA[f.status]} · vence {dataCurta(f.vencimento)}</small></span></span>
              <strong className={f.status === 'paga' ? 'entrada' : undefined}>{f.status === 'paga' ? 'Paga' : formatar(f.restante)}</strong>
            </button>
          ))}
        </section>
      )}

      {ver.has('recentes') && <section className="painel">
        <div className="painel-titulo">
          <h3>Últimos lançamentos</h3>
          {recentes.length > 0 && <button className="link" onClick={() => irPara('lancamentos')}>Ver todos</button>}
        </div>
        {recentes.length ? recentes.map((l) => <ItemLancamento key={l.id} l={l} mostrarData />) : (
          <p className="vazio">Toque no sol para lançar seu primeiro gasto.</p>
        )}
      </section>}

      {!essencial && (!orcamentos.length || !recorrentes.length) && (
        <p className="configurar-mais">
          {!orcamentos.length && !recorrentes.length ? 'Orçamento e contas fixas' : !orcamentos.length ? 'Orçamento por categoria' : 'Contas fixas'}: <button className="link" onClick={() => irPara('ajustes')}>configurar</button>
        </p>
      )}
      {essencial && (
        <button className="botao-acao centro-pagina" onClick={() => setEscolhendo(true)}><IconeAjustar /> Escolher o que aparece</button>
      )}
      {escolhendo && <EscolherEssencial guardado={config.inicioEssencialBlocos} aoFechar={fecharEscolha} />}
    </div>
  )
}
