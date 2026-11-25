// Renda: o salário (em partes) e outras rendas, aprendidos pelos extratos. O que veio no mês,
// o que ainda falta, a renda extra do ano e quanto sobrou da renda em cada mês.
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, IconeCategoria, MarcaConta } from '../components/Pecas.jsx'
import { Campo, CampoValor, Chips } from '../components/Campos.jsx'
import Folha from '../components/Folha.jsx'
import { IconeMais, IconeAlerta, IconeOk, Ic } from '../components/Icones.jsx'
import { formatar } from '../lib/dinheiro.js'
import { dataCurta, mesAtual, nomeMes, hoje as hojeTexto } from '../lib/datas.js'
import { salvarConfig } from '../lib/db.js'
import { aprenderRenda, recebimentosDaRenda, rendaDoMes, rendaMensal, mudancasDaRenda, sobrasPorMes, textoDia } from '../lib/renda.js'
import { confirmarRendas, salvarRenda, excluirRenda, atualizarValorRenda, manterValorRenda, naoEhRenda } from '../lib/rendaSalvar.js'

const chave = (p) => `${p.categoriaId}|${p.dia}`

export default function Renda({ irPara }) {
  const { rendas, lancamentos, categorias, categoriaPorId, contaPorId, config, podeEditar, avisar } = useDados()
  const dia = hojeTexto()
  const mes = mesAtual()
  const [editando, setEditando] = useState(null) // null | { renda } | { modelo }
  const [escolha, setEscolha] = useState({}) // sugestões marcadas/desmarcadas por você
  const [ocupado, setOcupado] = useState(false)

  const sugestoes = useMemo(() => aprenderRenda({ lancamentos, categorias, rendas, dia }), [lancamentos, categorias, rendas, dia])
  const rec = useMemo(() => recebimentosDaRenda(rendas, lancamentos), [rendas, lancamentos])
  const doMes = useMemo(() => rendaDoMes(mes, rendas, lancamentos, dia, rec), [mes, rendas, lancamentos, dia, rec])
  const mudancas = useMemo(() => mudancasDaRenda(rendas, rec), [rendas, rec])
  const sobras = useMemo(() => (rendas.length ? sobrasPorMes({ rendas, lancamentos, dia, rec }) : []), [rendas, lancamentos, dia, rec])
  const ano = mes.slice(0, 4)
  const extrasDoAno = rec.extras.filter((e) => e.competencia.startsWith(ano))
  const totalExtras = extrasDoAno.reduce((s, e) => s + e.valor, 0)
  const porMes = rendaMensal(rendas, mes)
  const dispensada = config.rendaSugestaoDispensada === mes
  const mostrarSugestao = podeEditar && sugestoes.length > 0 && !dispensada
  const marcada = (p) => escolha[chave(p)] ?? p.principal
  const comSobra = sobras.filter((s) => s.porcentagem != null)
  const mediaPct = comSobra.length ? Math.round(comSobra.reduce((s, x) => s + x.porcentagem, 0) / comSobra.length) : null

  async function agir(fn, aviso) {
    if (ocupado) return
    setOcupado(true)
    try { await fn(); if (aviso) avisar(aviso) } catch (e) { avisar(e.message || 'Algo deu errado.') } finally { setOcupado(false) }
  }
  const confirmar = () => {
    const escolhidas = sugestoes.filter(marcada)
    if (!escolhidas.length) return avisar('Marque pelo menos uma parte, ou toque em Agora não.')
    agir(() => confirmarRendas(escolhidas), escolhidas.length === 1 ? 'Renda confirmada.' : `Renda confirmada: ${escolhidas.length} partes.`)
  }

  return (
    <div className="pagina">
      <CabecaPagina titulo="Renda" irPara={irPara} acoes={podeEditar && <button className="botao-acao" onClick={() => setEditando({})}><IconeMais /> Outra renda</button>} />

      <section className="heroi">
        <div className="sol-canto" aria-hidden="true" />
        <span className="rotulo">Renda por mês</span>
        <strong className="valor-grande">{formatar(porMes)}</strong>
        {rendas.length > 0
          ? <span className="previsao">{nomeMes(mes)}: recebido <strong>{formatar(doMes.recebido)}</strong>{doMes.falta > 0 && <> · falta {formatar(doMes.falta)}</>}</span>
          : <span className="previsao">Ainda sem renda cadastrada</span>}
      </section>

      {mostrarSugestao && (
        <section className="painel renda-sugestao" aria-label="Renda encontrada nos extratos">
          <h3>{rendas.length ? 'Encontrei outra renda nos extratos' : 'Encontrei sua renda nos extratos'}</h3>
          <p className="dica">Pelas entradas dos últimos 6 meses. Confira os valores: dá para corrigir antes de confirmar.</p>
          {sugestoes.map((p) => (
            <div key={chave(p)} className="linha-assinatura">
              <input type="checkbox" className="renda-marca" checked={marcada(p)} onChange={(e) => setEscolha((x) => ({ ...x, [chave(p)]: e.target.checked }))} aria-label={`Usar ${p.descricao}`} />
              <div className="linha-assinatura-textos">
                <strong>{p.descricao}</strong>
                <small>{textoDia(p.dia)} · em {p.meses} dos últimos 6 meses · {contaPorId.get(p.contaId)?.nome ?? ''}</small>
                <div className="linha-assinatura-acoes"><button className="link" onClick={() => setEditando({ modelo: p })}>Corrigir</button></div>
              </div>
              <span className="linha-assinatura-valor">{formatar(p.valor)}<small>último: {dataCurta(p.ultimo.data)}</small></span>
            </div>
          ))}
          <div className="linha-botoes">
            <button className="botao secundario" onClick={() => salvarConfig('rendaSugestaoDispensada', mes)}>Agora não</button>
            <button className="botao primario cheio" disabled={ocupado} onClick={confirmar}>Confirmar</button>
          </div>
        </section>
      )}

      {podeEditar && mudancas.map((m) => (
        <section key={m.renda.id} className="painel renda-mudou" aria-label={`O valor de ${m.renda.descricao} mudou`}>
          <p className="com-icone"><Ic i={IconeAlerta} className="atencao" /> <span><strong>{m.renda.descricao}</strong> {m.subiu ? 'subiu' : 'baixou'} de {formatar(m.de)} para <strong>{formatar(m.para)}</strong> desde {nomeMes(m.desde)}. Atualizar a renda?</span></p>
          <div className="linha-botoes">
            <button className="botao secundario" disabled={ocupado} onClick={() => agir(() => manterValorRenda(m.renda.id, m.para), `${m.renda.descricao}: mantido em ${formatar(m.de)}.`)}>Manter {formatar(m.de)}</button>
            <button className="botao primario cheio" disabled={ocupado} onClick={() => agir(() => atualizarValorRenda(m.renda.id, m.para), `${m.renda.descricao}: agora ${formatar(m.para)}.`)}>Atualizar</button>
          </div>
        </section>
      ))}

      {rendas.length > 0 && (
        <section className="painel">
          <h3>{nomeMes(mes)}</h3>
          {doMes.partes.map((p) => (
            <div key={p.renda.id} className="linha-assinatura">
              <IconeCategoria categoria={categoriaPorId.get(p.renda.categoriaId)} />
              <div className="linha-assinatura-textos">
                <strong>{p.renda.descricao}</strong>
                <small className={p.situacao === 'atrasada' ? 'subiu' : undefined}>
                  {p.situacao === 'recebida' && <><Ic i={IconeOk} className="bom" /> recebida em {dataCurta(p.lancamento.data)}{p.recebido !== p.renda.valor ? ` · ${formatar(p.recebido)}` : ''}</>}
                  {p.situacao === 'aguardando' && <>esperada para {dataCurta(p.previsto)}</>}
                  {p.situacao === 'atrasada' && <>ainda não apareceu (era para {dataCurta(p.previsto)}): importe o extrato</>}
                  {p.situacao === 'pulada' && <>sem essa renda neste mês</>}
                </small>
                {podeEditar && <div className="linha-assinatura-acoes"><button className="link" onClick={() => setEditando({ renda: p.renda })}>Editar</button></div>}
              </div>
              <span className="linha-assinatura-valor">{formatar(p.renda.valor)}<small>{textoDia(p.renda.dia)}</small></span>
            </div>
          ))}
          {doMes.totalExtras > 0 && <p className="dica">Renda extra neste mês: {formatar(doMes.totalExtras)}.</p>}
        </section>
      )}

      {rendas.length > 0 && (
        <section className="painel">
          <div className="painel-titulo">
            <h3>Renda extra em {ano}</h3>
            <span className="discreto">{formatar(totalExtras)}</span>
          </div>
          {extrasDoAno.length === 0 && <p className="vazio">Nenhuma renda extra este ano.</p>}
          {extrasDoAno.map((e) => {
            const inteiro = e.valor === e.lancamento.valor
            return (
              <div key={`${e.lancamento.id}-${e.valor}`} className="linha-assinatura">
                <div className="linha-assinatura-textos">
                  <strong>{dataCurta(e.lancamento.data)} · {categoriaPorId.get(e.lancamento.categoriaId)?.nome ?? ''}</strong>
                  <small>{inteiro ? 'crédito a mais no mês' : `o que passou do normal num crédito de ${formatar(e.lancamento.valor)}`}</small>
                  {podeEditar && inteiro && <div className="linha-assinatura-acoes"><button className="link" disabled={ocupado} onClick={() => agir(() => naoEhRenda(e.lancamento.id, e.lancamento.categoriaId), 'Pronto: esse crédito agora é uma entrada comum.')}>Não é renda</button></div>}
                </div>
                <span className="linha-assinatura-valor">{formatar(e.valor)}</span>
              </div>
            )
          })}
          <p className="dica">13º, férias, participação nos lucros e valores fora do normal. Não entram na renda por mês.</p>
        </section>
      )}

      {sobras.length > 0 && (
        <section className="painel">
          <div className="painel-titulo">
            <h3>Quanto sobrou do que entrou</h3>
            {mediaPct != null && <span className="discreto">média {mediaPct}%</span>}
          </div>
          <ul className="barras">
            {sobras.map((s) => (
              <li key={s.mes} className="barra-linha">
                <div className="barra-corpo">
                  <div className="barra-topo">
                    <span>{nomeMes(s.mes)}</span>
                    <span className="barra-valor">{s.sobrou >= 0 ? formatar(s.sobrou) : `− ${formatar(-s.sobrou)}`} <small>{s.porcentagem != null ? `${s.porcentagem}%` : ''}</small></span>
                  </div>
                  <div className="barra-trilho"><div className={`barra ${s.sobrou < 0 ? 'orc-estourado' : ''}`} style={{ width: `${Math.min(100, Math.abs(s.porcentagem ?? 0))}%` }} /></div>
                </div>
              </li>
            ))}
          </ul>
          <p className="dica">Tudo o que entrou menos tudo o que saiu, com o salário contado no mês a que pertence.</p>
        </section>
      )}

      {!rendas.length && !mostrarSugestao && (
        <div className="painel vazio-grande">
          <p>{sugestoes.length ? 'Você deixou a sugestão para depois. Ela volta no mês que vem, ou cadastre agora.' : 'Ainda não deu para achar sua renda: importe alguns meses de extrato, ou cadastre à mão.'}</p>
          {podeEditar && <button className="botao primario" onClick={() => (sugestoes.length ? salvarConfig('rendaSugestaoDispensada', null) : setEditando({}))}>{sugestoes.length ? 'Ver a sugestão' : 'Cadastrar renda'}</button>}
        </div>
      )}

      <p className="dica">A renda não cria lançamentos: o dinheiro continua chegando pelo extrato. Ela serve para mostrar quanto ainda deve entrar no mês e para a previsão do saldo.</p>

      {editando && <FormRenda renda={editando.renda} modelo={editando.modelo} aoFechar={() => setEditando(null)} />}
    </div>
  )
}

// Editar uma parte da renda, corrigir uma sugestão antes de confirmar, ou cadastrar outra renda (ex.: aluguel)
function FormRenda({ renda, modelo, aoFechar }) {
  const { contas, categorias, avisar } = useDados()
  const base = renda || modelo || {}
  const [f, setF] = useState({ descricao: base.descricao || '', valor: base.valor || 0, dia: base.dia || '', categoriaId: base.categoriaId ?? null, contaId: base.contaId ?? contas[0]?.id ?? null })
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const mudar = (campo, v) => { setErro(''); setF((x) => ({ ...x, [campo]: v })) }
  const cats = categorias.filter((c) => c.tipo === 'receita')

  async function executar(fn, aviso) {
    if (ocupado) return
    setOcupado(true)
    try { await fn(); avisar(aviso); aoFechar() } catch (e) { setErro(e.message || 'Algo deu errado.'); setConfirmando(false) } finally { setOcupado(false) }
  }
  const salvar = () => executar(async () => {
    if (modelo && !renda) await confirmarRendas([{ ...modelo, ...f, dia: Number(f.dia) }])
    else await salvarRenda({ id: renda?.id, ...f, dia: Number(f.dia) })
  }, renda ? 'Renda atualizada.' : modelo ? 'Renda confirmada.' : 'Renda cadastrada.')
  const excluir = () => executar(() => excluirRenda(renda.id), 'Renda excluída. Os lançamentos continuam lá.')

  return (
    <Folha titulo={renda ? 'Editar renda' : modelo ? 'Corrigir renda' : 'Outra renda'} aoFechar={aoFechar} rodape={
      <>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="linha-botoes">
          {renda && <button className={`botao ${confirmando ? 'perigo' : 'secundario'}`} disabled={ocupado} onClick={() => (confirmando ? excluir() : setConfirmando(true))}>{confirmando ? 'Confirmar exclusão?' : 'Excluir'}</button>}
          <button className="botao primario cheio" disabled={ocupado} onClick={salvar}>Salvar</button>
        </div>
      </>
    }>
      <Campo rotulo="Nome"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} placeholder="Ex.: Salário, Aluguel recebido" maxLength={60} /></Campo>
      <CampoValor rotulo="Quanto cai na conta (líquido)" valor={f.valor} aoMudar={(v) => mudar('valor', v)} />
      <Campo rotulo="Dia em que costuma cair"><input type="number" inputMode="numeric" min="1" max="31" value={f.dia} onChange={(e) => mudar('dia', e.target.value)} /></Campo>
      <label className="campo">
        <span className="rotulo">Categoria</span>
        <select className="seletor" value={f.categoriaId ?? ''} onChange={(e) => mudar('categoriaId', e.target.value || null)}>
          <option value="">Escolha…</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <div className="bloco">
        <span className="rotulo">Entra em</span>
        <Chips rolavel opcoes={contas.map((c) => ({ valor: c.id, rotulo: c.nome, marca: <MarcaConta conta={c} /> }))} valor={f.contaId} aoMudar={(v) => mudar('contaId', v)} />
      </div>
      <p className="dica">Quando um crédito dessa categoria cair perto desse dia, o app marca a renda como recebida. Nada é lançado sozinho.</p>
    </Folha>
  )
}
