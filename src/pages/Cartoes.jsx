import { useMemo, useRef, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, ItemLancamento, MarcaCartao, MarcaConta } from '../components/Pecas.jsx'
import { IconeMais, IconeCartao, IconeCadeado, IconeOk, IconeAlerta, IconeRecibo, IconeCalendario, Ic } from '../components/Icones.jsx'
import { FormCartao } from '../components/Formularios.jsx'
import { CampoValor, Chips } from '../components/Campos.jsx'
import Folha from '../components/Folha.jsx'
import { formatar } from '../lib/dinheiro.js'
import { nomeMes, somarMeses, dataCurta, hoje, ontem, dataValida } from '../lib/datas.js'
import { resumoFatura, faturasPendentes, limiteUsado } from '../lib/fatura.js'
import { pagarFatura, apagarLancamento } from '../lib/lancamentos.js'

const STATUS = {
  aberta: { rotulo: 'Aberta', icone: <span className="ponto-status" aria-hidden="true" /> },
  fechada: { rotulo: 'Fechada', icone: <Ic i={IconeCadeado} /> },
  paga: { rotulo: 'Paga', icone: <Ic i={IconeOk} /> },
  atrasada: { rotulo: 'Atrasada', icone: <Ic i={IconeAlerta} /> },
}

export default function Cartoes({ irPara }) {
  const { cartoes, lancamentos, cartaoPorId, avisar } = useDados()
  const [idSel, setIdSel] = useState(null)
  const [fatura, setFatura] = useState(null)
  const [editando, setEditando] = useState(null) // null | 'novo' | cartao
  const [pagando, setPagando] = useState(false)
  const [desfazendo, setDesfazendo] = useState(null)

  const cartao = cartaoPorId.get(idSel) || cartoes[0]
  // Abre na fatura mais antiga que ainda falta pagar; se não houver, na fatura aberta
  const faturaPadrao = useMemo(() => (cartao ? faturasPendentes(cartao, lancamentos)[0].fatura : null), [cartao, lancamentos])
  const faturaSel = fatura || faturaPadrao
  const resumo = useMemo(() => (cartao ? resumoFatura(cartao, faturaSel, lancamentos) : null), [cartao, faturaSel, lancamentos])

  if (!cartoes.length) {
    return (
      <div className="pagina">
        <CabecaPagina titulo="Cartões" irPara={irPara} />
        <div className="painel vazio-grande">
          <p className="vazio-icone"><IconeCartao /></p>
          <p>Nenhum cartão cadastrado.</p>
          <button className="botao primario" onClick={() => setEditando('novo')}>Cadastrar cartão</button>
        </div>
        {editando && <FormCartao aoFechar={() => setEditando(null)} />}
      </div>
    )
  }

  const usado = limiteUsado(cartao, lancamentos)
  const pctUsado = cartao.limite ? Math.min(100, (usado / cartao.limite) * 100) : 0
  const st = STATUS[resumo.status]

  async function desfazer(p) {
    if (desfazendo !== p.id) return setDesfazendo(p.id)
    await apagarLancamento(p)
    setDesfazendo(null)
    avisar('Pagamento desfeito. O valor voltou para a conta.')
  }

  return (
    <div className="pagina">
      <CabecaPagina titulo="Cartões" irPara={irPara} acoes={
        <button className="botao-acao" onClick={() => setEditando('novo')}><IconeMais /> Novo cartão</button>
      } />

      {cartoes.length > 1 && (
        <Chips rolavel opcoes={cartoes.map((c) => ({ valor: c.id, rotulo: c.nome, marca: <MarcaCartao /> }))} valor={cartao.id} aoMudar={(id) => { setIdSel(id); setFatura(null) }} />
      )}

      <section className="heroi cartao-credito">
        <div className="sol-canto" aria-hidden="true" />
        <div className="painel-titulo">
          <strong className="com-marca"><MarcaCartao />{cartao.nome}</strong>
          <button className="link" onClick={() => setEditando(cartao)}>Editar</button>
        </div>
        {cartao.limite > 0 && (
          <>
            <div className="limite-trilho" title={`${Math.round(pctUsado)}% do limite usado`}><div className="limite-barra" style={{ width: `${pctUsado}%` }} /></div>
            <div className="limite-textos">
              <span>Usado {formatar(usado)}</span>
              <span>{usado > cartao.limite ? `Estourou ${formatar(usado - cartao.limite)}` : `Disponível ${formatar(cartao.limite - usado)}`}</span>
            </div>
          </>
        )}
        <small>Fecha dia {cartao.diaFechamento} · vence dia {cartao.diaVencimento}</small>
      </section>

      <div className="seletor-mes">
        <button className="botao-icone" onClick={() => setFatura(somarMeses(faturaSel, -1))} aria-label="Fatura anterior">‹</button>
        <button className="mes-nome" onClick={() => setFatura(null)}>Fatura de {nomeMes(faturaSel)}</button>
        <button className="botao-icone" onClick={() => setFatura(somarMeses(faturaSel, 1))} aria-label="Próxima fatura">›</button>
      </div>

      <section className="painel fatura">
        <div className="fatura-topo">
          <span className={`status status-${resumo.status}`}>{st.icone}{st.rotulo}</span>
          <span className="discreto">fecha {dataCurta(resumo.fechamento)} · vence {dataCurta(resumo.vencimento)}</span>
        </div>
        <strong className="fatura-total">{formatar(resumo.total)}</strong>
        {resumo.pago > 0 && <p className="discreto">Pago {formatar(resumo.pago)}{resumo.restante > 0 ? ` · falta ${formatar(resumo.restante)}` : ''}</p>}
        {resumo.restante > 0 && <button className="botao primario cheio" onClick={() => setPagando(true)}>Pagar fatura</button>}
      </section>

      {resumo.pagamentos.length > 0 && (
        <section className="painel">
          <h3>Pagamentos</h3>
          {resumo.pagamentos.map((p) => (
            <div key={p.id} className="linha-pagamento">
              <span className="com-marca"><Ic i={IconeRecibo} />{dataCurta(p.data)} · {formatar(p.valor)}</span>
              <button className={desfazendo === p.id ? 'link perigo' : 'link'} onClick={() => desfazer(p)}>
                {desfazendo === p.id ? 'Confirmar?' : 'Desfazer'}
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="painel">
        <h3>Compras nesta fatura</h3>
        {resumo.itens.length ? resumo.itens.map((l) => <ItemLancamento key={l.id} l={l} mostrarData />) : <p className="vazio">Nenhuma compra nesta fatura.</p>}
      </section>

      {editando && <FormCartao cartao={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
      {pagando && <PagarFatura cartao={cartao} resumo={resumo} aoFechar={() => setPagando(false)} />}
    </div>
  )
}

function PagarFatura({ cartao, resumo, aoFechar }) {
  const { contas, contaPorId, avisar } = useDados()
  const [valor, setValor] = useState(resumo.restante)
  const [contaId, setContaId] = useState(contaPorId.has(cartao.contaPagamentoId) ? cartao.contaPagamentoId : contas[0]?.id ?? null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [data, setData] = useState(hoje())
  const travado = useRef(false)

  async function salvar() {
    if (travado.current) return
    if (!valor) return setErro('Informe o valor pago.')
    if (valor > resumo.restante) return setErro(`O valor passa do que falta pagar (${formatar(resumo.restante)}).`)
    if (!contaPorId.has(contaId)) return setErro('Escolha a conta que pagou.')
    if (!dataValida(data)) return setErro('Escolha a data do pagamento.')
    travado.current = true
    setOcupado(true)
    try {
      await pagarFatura({ cartaoId: cartao.id, fatura: resumo.fatura, contaId, valor, data })
      avisar('Pagamento registrado.')
      aoFechar()
    } catch (e) {
      setErro(e.message)
      travado.current = false
      setOcupado(false)
    }
  }

  return (
    <Folha titulo={`Pagar fatura de ${nomeMes(resumo.fatura)}`} aoFechar={aoFechar} rodape={
      <>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button className="botao primario cheio" disabled={ocupado} onClick={salvar}>Confirmar pagamento</button>
      </>
    }>
      <CampoValor grande rotulo={`Valor pago (falta ${formatar(resumo.restante)})`} valor={valor} aoMudar={(v) => { setErro(''); setValor(v) }} />
      <div className="bloco">
        <span className="rotulo">Pago com a conta</span>
        <Chips rolavel opcoes={contas.map((c) => ({ valor: c.id, rotulo: c.nome, marca: <MarcaConta conta={c} /> }))} valor={contaId} aoMudar={setContaId} />
      </div>
      <div className="bloco">
        <span className="rotulo">Data do pagamento</span>
        <div className="chips">
          <button type="button" className={`chip ${data === hoje() ? 'ativo' : ''}`} onClick={() => setData(hoje())}>Hoje</button>
          <button type="button" className={`chip ${data === ontem() ? 'ativo' : ''}`} onClick={() => setData(ontem())}>Ontem</button>
          <label className={`chip chip-data ${data !== hoje() && data !== ontem() ? 'ativo' : ''}`}>
            <Ic i={IconeCalendario} /> {data !== hoje() && data !== ontem() ? dataCurta(data) : 'Outra'}
            <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Escolher data do pagamento" />
          </label>
        </div>
        {data > hoje() && <span className="dica">Pagamento agendado: só sai do saldo nesse dia.</span>}
      </div>
      <p className="dica">O valor sai do saldo da conta escolhida. Ele não conta de novo como gasto, porque as compras já foram lançadas.</p>
    </Folha>
  )
}
