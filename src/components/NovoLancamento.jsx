// Formulário de lançamento rápido (novo ou edição)
import { useRef, useState } from 'react'
import Folha from './Folha.jsx'
import { Abas, CampoValor, Chips, Campo } from './Campos.jsx'
import { useDados } from '../dados.jsx'
import { hoje, ontem, dataCurta, dataValida, nomeMes, mesDe, somarMesesData } from '../lib/datas.js'
import { avisoDeOrcamento, textoAviso } from '../lib/orcamento.js'
import { formatar, dividirParcelas } from '../lib/dinheiro.js'
import { salvarLancamento, apagarLancamento, formDoLancamento, validarLancamento, MAX_PARCELAS, podeDividir, dividirLancamento } from '../lib/lancamentos.js'
import { faturaDaCompra } from '../lib/fatura.js'
import { sugerirCategoria, aprender } from '../lib/categorizar.js'
import { db, salvarConfig } from '../lib/db.js'
import { comentarioAoSalvar } from '../lib/zoeira.js'

const TIPOS = [
  { valor: 'despesa', rotulo: 'Despesa', tom: 'tom-saida' },
  { valor: 'receita', rotulo: 'Receita', tom: 'tom-entrada' },
  { valor: 'transferencia', rotulo: 'Transferência', tom: 'tom-neutro' },
]

function estadoInicial(original, dados, modelo) {
  if (original || modelo) {
    const f = original ? formDoLancamento(original) : modelo
    return {
      tipo: f.tipo,
      valor: f.valor,
      categoriaId: f.categoriaId,
      origem: f.cartaoId ? `cartao:${f.cartaoId}` : `conta:${f.contaId}`,
      contaDestinoId: f.contaDestinoId || null,
      data: f.data,
      descricao: f.descricao || '',
      parcelas: f.parcelas || 1,
    }
  }
  const ultima = dados.config.ultimaOrigem
  const existe = ultima && (ultima.startsWith('conta:') ? dados.contaPorId.has(ultima.slice(6)) : dados.cartaoPorId.has(ultima.slice(7)))
  return {
    tipo: 'despesa',
    valor: 0,
    categoriaId: null,
    origem: existe ? ultima : dados.contas[0] ? `conta:${dados.contas[0].id}` : null,
    contaDestinoId: null,
    data: hoje(),
    descricao: '',
    parcelas: 1,
  }
}

export default function NovoLancamento({ original, modelo = null, aoFechar }) {
  const dados = useDados()
  const { contas, cartoes, categorias, regras, orcamentos, lancamentos, categoriaPorId, cartaoPorId, avisar, zoeira, podeEditar } = dados
  const [f, setF] = useState(() => estadoInicial(original, dados, modelo))
  const [erro, setErro] = useState('')
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)
  const [divisao, setDivisao] = useState(null) // { valor, data } da outra parte
  const [ocupado, setOcupado] = useState(false)
  const salvando = useRef(false)
  const mudar = (campo) => (v) => { setErro(''); setF((x) => ({ ...x, [campo]: v })) }
  // Categoria escolhida por você não é trocada pela sugestão automática
  const [categoriaManual, setCategoriaManual] = useState(!!original || !!modelo)
  const escolherCategoria = (id) => { setCategoriaManual(true); mudar('categoriaId')(id) }
  const mudarDescricao = (texto) => {
    setErro('')
    setF((x) => {
      const nova = { ...x, descricao: texto }
      if (!categoriaManual && x.tipo !== 'transferencia') {
        const sugestao = sugerirCategoria(texto, x.tipo, regras, categorias)
        if (sugestao) nova.categoriaId = sugestao
      }
      return nova
    })
  }

  const [tipoOrigem, idOrigemTexto] = (f.origem || ':').split(':')
  const idOrigem = idOrigemTexto || null
  const ehCartao = f.tipo === 'despesa' && tipoOrigem === 'cartao'
  const cartao = ehCartao ? cartaoPorId.get(idOrigem) : null

  const trocarTipo = (tipo) => {
    setErro('')
    if (tipo !== f.tipo) setCategoriaManual(false)
    setF((x) => {
      const nova = { ...x, tipo, categoriaId: tipo === x.tipo ? x.categoriaId : null }
      if (tipo !== x.tipo && tipo !== 'transferencia' && x.descricao) nova.categoriaId = sugerirCategoria(x.descricao, tipo, regras, categorias)
      // cartão de crédito só vale para despesa
      if (tipo !== 'despesa' && x.origem?.startsWith('cartao:')) nova.origem = contas[0] ? `conta:${contas[0].id}` : null
      return nova
    })
  }

  const cats = categorias.filter((c) => c.tipo === f.tipo)
  const opcoesOrigem = [
    ...contas.map((c) => ({ valor: `conta:${c.id}`, rotulo: c.nome, emoji: c.emoji })),
    ...(f.tipo === 'despesa' ? cartoes.map((c) => ({ valor: `cartao:${c.id}`, rotulo: c.nome, emoji: '💳' })) : []),
  ]

  async function salvar() {
    if (salvando.current) return // evita salvar duas vezes com toque duplo
    if (!podeEditar) return setErro('Neste espaço você só pode ver: peça a quem criou para liberar a edição.')
    const form = {
      tipo: f.tipo,
      valor: f.valor,
      descricao: f.descricao,
      categoriaId: f.tipo === 'transferencia' ? null : f.categoriaId,
      data: f.data,
      contaId: tipoOrigem === 'conta' ? idOrigem : null,
      cartaoId: ehCartao ? idOrigem : null,
      contaDestinoId: f.tipo === 'transferencia' ? f.contaDestinoId : null,
      parcelas: ehCartao ? f.parcelas : 1,
      // conta fixa: liga o lançamento à conta fixa e ao mês
      ...(modelo ? { recorrenteId: modelo.recorrenteId, competencia: modelo.competencia } : {}),
    }
    const problema = validarLancamento(form, { contas, cartoes, categorias })
    if (problema) return setErro(problema)
    salvando.current = true
    setOcupado(true)
    try {
      await salvarLancamento(form, original)
      if (!original) salvarConfig('ultimaOrigem', f.origem)
      if (form.tipo !== 'transferencia' && form.descricao) aprender(form.descricao, form.tipo, form.categoriaId).catch(() => {})
      let mensagem = original ? 'Lançamento atualizado.' : comentarioAoSalvar(form, categoriaPorId.get(f.categoriaId), zoeira)
      // Passou de 80% ou estourou o orçamento da categoria? O aviso do orçamento tem prioridade
      if (form.tipo === 'despesa' && orcamentos.length) {
        const meses = Array.from({ length: form.parcelas || 1 }, (_, i) => mesDe(somarMesesData(form.data, i)))
        const aviso = avisoDeOrcamento({ meses, orcamentos, antes: lancamentos, depois: await db.lancamentos.toArray() })
        if (aviso) mensagem = textoAviso(aviso, categoriaPorId.get(aviso.categoriaId)?.nome || '', zoeira)
      }
      avisar(mensagem)
      aoFechar()
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.')
      salvando.current = false
      setOcupado(false)
    }
  }

  async function apagar() {
    if (!podeEditar) return setErro('Neste espaço você só pode ver: peça a quem criou para liberar a edição.')
    if (!confirmandoApagar) return setConfirmandoApagar(true)
    if (salvando.current) return
    salvando.current = true
    setOcupado(true)
    try {
      await apagarLancamento(original)
      avisar(zoeira ? 'Apagado. Como se nunca tivesse acontecido.' : 'Lançamento apagado.')
      aoFechar()
    } catch (e) {
      setErro(e.message || 'Não foi possível apagar.')
      salvando.current = false
      setOcupado(false)
    }
  }

  async function dividir() {
    if (!podeEditar) return setErro('Neste espaço você só pode ver: peça a quem criou para liberar a edição.')
    if (salvando.current) return
    salvando.current = true
    setOcupado(true)
    try {
      await dividirLancamento(original.id, divisao)
      avisar(`Dividido: ${formatar(original.valor - divisao.valor)} em ${dataCurta(original.data)} e ${formatar(divisao.valor)} em ${dataCurta(divisao.data)}.`)
      aoFechar()
    } catch (e) {
      setErro(e.message || 'Não foi possível dividir.')
      salvando.current = false
      setOcupado(false)
    }
  }

  const tituloBase = { despesa: 'despesa', receita: 'receita', transferencia: 'transferência' }[f.tipo]
  const valorParcela = ehCartao && f.parcelas > 1 ? dividirParcelas(f.valor, f.parcelas)[1] : 0
  const faturaPrevista = cartao && dataValida(f.data) ? faturaDaCompra(cartao, f.data) : null
  const outraData = f.data !== hoje() && f.data !== ontem()

  return (
    <Folha
      titulo={original ? `Editar ${tituloBase}` : modelo ? `Lançar: ${modelo.descricao}` : 'Novo lançamento'}
      aoFechar={aoFechar}
      rodape={
        <>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <div className="linha-botoes">
            {original && (
              <button className={`botao ${confirmandoApagar ? "perigo" : "secundario"}`} disabled={ocupado} onClick={apagar}>
                {confirmandoApagar ? (original.grupoParcelaId ? `Apagar as ${original.totalParcelas} parcelas?` : 'Confirmar?') : 'Apagar'}
              </button>
            )}
            <button className="botao primario cheio" disabled={ocupado} onClick={salvar}>Salvar</button>
          </div>
        </>
      }
    >
      <Abas opcoes={TIPOS} valor={f.tipo} aoMudar={trocarTipo} />

      <CampoValor
        grande
        autoFocus={!original}
        valor={f.valor}
        aoMudar={mudar('valor')}
        rotulo={ehCartao && f.parcelas > 1 ? 'Valor total da compra' : 'Valor'}
        tom={f.tipo === 'receita' ? 'tom-entrada' : f.tipo === 'despesa' ? 'tom-saida' : ''}
      />

      {f.tipo !== 'transferencia' && (
        <div className="bloco">
          <span className="rotulo">Categoria</span>
          <div className="grade-categorias">
            {cats.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`categoria ${f.categoriaId === c.id ? 'ativa' : ''}`}
                onClick={() => escolherCategoria(c.id)}
                aria-pressed={f.categoriaId === c.id}
              >
                <span className="categoria-emoji">{c.emoji}</span>
                <span className="categoria-nome">{c.nome}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bloco">
        <span className="rotulo">{f.tipo === 'receita' ? 'Entrou em' : f.tipo === 'transferencia' ? 'Saiu de' : 'Pagou com'}</span>
        <Chips rolavel opcoes={f.tipo === 'transferencia' ? opcoesOrigem.filter((o) => o.valor.startsWith('conta:')) : opcoesOrigem} valor={f.origem} aoMudar={mudar('origem')} />
      </div>

      {f.tipo === 'transferencia' && (
        <div className="bloco">
          <span className="rotulo">Foi para</span>
          <Chips rolavel opcoes={contas.filter((c) => `conta:${c.id}` !== f.origem).map((c) => ({ valor: c.id, rotulo: c.nome, emoji: c.emoji }))} valor={f.contaDestinoId} aoMudar={mudar('contaDestinoId')} />
        </div>
      )}

      {ehCartao && (
        <div className="bloco">
          <span className="rotulo">Parcelas</span>
          <div className="parcelas">
            <button type="button" className="botao-icone" aria-label="Menos parcelas" onClick={() => mudar('parcelas')(Math.max(1, f.parcelas - 1))}>−</button>
            <strong>{f.parcelas === 1 ? 'À vista' : `${f.parcelas}x`}</strong>
            <button type="button" className="botao-icone" aria-label="Mais parcelas" onClick={() => mudar('parcelas')(Math.min(MAX_PARCELAS, f.parcelas + 1))}>+</button>
            {f.parcelas > 1 && f.valor > 0 && <span className="discreto">de {formatar(valorParcela)}</span>}
          </div>
          {faturaPrevista && <span className="dica">{f.parcelas > 1 ? '1ª parcela na' : 'Vai para a'} fatura de {nomeMes(faturaPrevista)}</span>}
        </div>
      )}

      <div className="bloco">
        <span className="rotulo">{ehCartao ? 'Data da compra' : 'Data'}</span>
        <div className="chips">
          <button type="button" className={`chip ${f.data === hoje() ? 'ativo' : ''}`} onClick={() => mudar('data')(hoje())}>Hoje</button>
          <button type="button" className={`chip ${f.data === ontem() ? 'ativo' : ''}`} onClick={() => mudar('data')(ontem())}>Ontem</button>
          <label className={`chip chip-data ${outraData ? 'ativo' : ''}`}>
            📅 {outraData ? dataCurta(f.data) : 'Outra'}
            <input type="date" value={f.data} onChange={(e) => e.target.value && mudar('data')(e.target.value)} aria-label="Escolher data" />
          </label>
        </div>
      </div>

      <Campo rotulo="Descrição (opcional)">
        <input type="text" value={f.descricao} placeholder={f.tipo === 'despesa' ? 'Ex.: almoço, Uber, farmácia' : ''} onChange={(e) => mudarDescricao(e.target.value)} maxLength={80} />
      </Campo>

      {original && podeDividir(original) && (
        divisao ? (
          <div className="painel dividir">
            <strong>✂️ Dividir em dois lançamentos</strong>
            <span className="dica">Ex.: um pagamento que cobriu dois meses. Este fica com o resto; a outra parte vai para a data que você escolher.</span>
            <CampoValor rotulo="Valor da outra parte" valor={divisao.valor} aoMudar={(v) => setDivisao((d) => ({ ...d, valor: v }))} />
            <Campo rotulo="Data da outra parte">
              <input type="date" value={divisao.data} onChange={(e) => setDivisao((d) => ({ ...d, data: e.target.value }))} />
            </Campo>
            {divisao.valor > 0 && divisao.valor < original.valor && (
              <span className="discreto">Fica {formatar(original.valor - divisao.valor)} em {dataCurta(original.data)} e {formatar(divisao.valor)} em {dataValida(divisao.data) ? dataCurta(divisao.data) : '…'}.</span>
            )}
            <div className="linha-botoes">
              <button className="botao secundario" disabled={ocupado} onClick={() => setDivisao(null)}>Cancelar</button>
              <button className="botao primario cheio" disabled={ocupado} onClick={dividir}>Dividir</button>
            </div>
          </div>
        ) : (
          <button type="button" className="link" onClick={() => setDivisao({ valor: Math.floor(original.valor / 2), data: somarMesesData(original.data, -1) })}>✂️ Dividir em dois lançamentos (ex.: pagou dois meses juntos)</button>
        )
      )}
    </Folha>
  )
}
