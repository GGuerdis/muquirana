// Peças pequenas usadas em várias telas
import { useDados } from '../dados.jsx'
import { formatar } from '../lib/dinheiro.js'
import { nomeMes, somarMeses, mesAtual, dataCurta } from '../lib/datas.js'
import { tomDaCategoria, desenhoParaCategoria, corDaConta } from '../lib/cores.js'
import { DESENHOS_CATEGORIA, IconeEngrenagem, IconeVoltar, IconeCartao, Ic } from './Icones.jsx'

// Ícone da categoria: losango HUD na cor da categoria, com o desenho dela (sempre um desenho de traço, nunca emoji).
// `desenho` força um desenho (transferência, fatura...); sem categoria e sem desenho, fica neutro.
export function IconeCategoria({ categoria, desenho, pequeno = false }) {
  const tom = categoria ? tomDaCategoria(categoria.nome) : null
  const chave = desenho ?? desenhoParaCategoria(categoria) ?? 'outros'
  const traco = DESENHOS_CATEGORIA[chave] ?? DESENHOS_CATEGORIA.outros
  return (
    <span className={`icone-cat ${pequeno ? 'pequeno' : ''} ${tom == null ? 'neutro' : ''}`} style={tom == null ? undefined : { '--tom': tom }} aria-hidden="true">
      <svg viewBox="0 0 24 24">{traco}</svg>
    </span>
  )
}

// Bolinha na cor da conta (ao lado do nome, em blocos e botões)
export function MarcaConta({ conta }) {
  return <span className="marca-conta" style={{ '--cor-conta': corDaConta(conta) }} aria-hidden="true" />
}
// Marca de cartão de crédito (mesmo lugar da bolinha da conta)
export function MarcaCartao() {
  return <Ic i={IconeCartao} className="marca-cartao" />
}

// Cabeçalho igual em todas as telas: título à esquerda, engrenagem (ou voltar) à direita,
// e os botões de ação da tela numa fileira logo abaixo.
export function CabecaPagina({ titulo, irPara, voltar = false, acoes, extra }) {
  return (
    <>
      <header className="cabeca">
        <h1 className="titulo-pagina">{titulo}</h1>
        {extra && <span className="cabeca-extra">{extra}</span>}
        {irPara && (voltar
          ? <button className="botao-redondo" onClick={() => irPara('inicio')} aria-label="Voltar ao início"><IconeVoltar /></button>
          : <button className="botao-redondo" onClick={() => irPara('ajustes')} aria-label="Ajustes"><IconeEngrenagem /></button>)}
      </header>
      {acoes && <div className="acoes-pagina">{acoes}</div>}
    </>
  )
}

export function SeletorMes({ mes, aoMudar }) {
  return (
    <div className="seletor-mes">
      <button className="botao-icone" onClick={() => aoMudar(somarMeses(mes, -1))} aria-label="Mês anterior">‹</button>
      <button className="mes-nome" onClick={() => aoMudar(mesAtual())} title="Voltar para o mês atual">{nomeMes(mes)}</button>
      <button className="botao-icone" onClick={() => aoMudar(somarMeses(mes, 1))} aria-label="Próximo mês">›</button>
    </div>
  )
}

// Uma linha da lista de lançamentos
export function ItemLancamento({ l, mostrarData = false }) {
  const { categoriaPorId, contaPorId, cartaoPorId, abrirLancamento } = useDados()
  const cat = categoriaPorId.get(l.categoriaId)
  let icone = <IconeCategoria categoria={cat} />
  let titulo = l.descricao || cat?.nome || 'Sem descrição'
  let onde = ''
  let sinal = l.tipo === 'receita' ? '+' : '−'
  let classe = l.tipo === 'receita' ? 'entrada' : 'saida'

  if (l.tipo === 'transferencia') {
    icone = <IconeCategoria desenho="transferencia" />
    titulo = l.descricao || 'Transferência'
    onde = `${contaPorId.get(l.contaId)?.nome ?? '?'} → ${contaPorId.get(l.contaDestinoId)?.nome ?? '?'}`
    sinal = ''
    classe = 'neutro'
  } else if (l.tipo === 'pagamentoFatura') {
    icone = <IconeCategoria desenho="fatura" />
    titulo = `Fatura ${cartaoPorId.get(l.cartaoId)?.nome ?? ''}`
    onde = contaPorId.get(l.contaId)?.nome ?? ''
    classe = 'neutro'
  } else {
    onde = l.cartaoId ? `Cartão ${cartaoPorId.get(l.cartaoId)?.nome ?? ''}` : contaPorId.get(l.contaId)?.nome ?? ''
    if (l.descricao && cat) onde = `${cat.nome} · ${onde}`
  }
  if (l.totalParcelas) titulo += ` (${l.parcela}/${l.totalParcelas})`

  const clicavel = l.tipo !== 'pagamentoFatura'
  return (
    <button className="item-lanc" onClick={() => clicavel && abrirLancamento(l)} disabled={!clicavel}>
      {icone}
      <span className="item-textos">
        <span className="item-titulo">{titulo}</span>
        <span className="item-sub">{mostrarData ? `${dataCurta(l.data)} · ` : ''}{onde}</span>
      </span>
      <span className={`item-valor ${classe}`}>{sinal ? `${sinal} ` : ''}{formatar(l.valor)}</span>
    </button>
  )
}

// Barras horizontais de gastos por categoria (uma série só, valores escritos ao lado)
export function BarrasCategorias({ categorias, limite = 6 }) {
  const { categoriaPorId } = useDados()
  if (!categorias.length) return <p className="vazio">Nenhum gasto neste mês.</p>
  const topo = categorias.slice(0, limite)
  const resto = categorias.slice(limite).reduce((s, c) => s + c.valor, 0)
  const linhas = resto ? [...topo, { categoriaId: 'outros', valor: resto }] : topo
  const maior = linhas.reduce((m, c) => Math.max(m, c.valor), 0) || 1
  const total = categorias.reduce((s, c) => s + c.valor, 0)
  return (
    <ul className="barras">
      {linhas.map((c) => {
        const cat = c.categoriaId === 'outros' ? { nome: 'Demais categorias' } : categoriaPorId.get(c.categoriaId) || { nome: 'Sem categoria' }
        const pct = Math.round((c.valor / total) * 100)
        return (
          <li key={c.categoriaId} className="barra-linha" title={`${cat.nome}: ${formatar(c.valor)} (${pct}%)`}>
            <IconeCategoria categoria={c.categoriaId === 'outros' ? null : cat} desenho={c.categoriaId === 'outros' ? 'mais' : undefined} pequeno />
            <div className="barra-corpo">
              <div className="barra-topo">
                <span>{cat.nome}</span>
                <span className="barra-valor">{formatar(c.valor)} <small>{pct}%</small></span>
              </div>
              <div className="barra-trilho"><div className="barra" style={{ width: `${Math.max((c.valor / maior) * 100, 2)}%` }} /></div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Cartão "Entrou / Saiu" com a barra de proporção e o que sobrou (Início e Histórico)
// Um bloco do painel: título pequeno, número e uma linha opcional embaixo
export function Bloco({ rotulo, valor, extra, tom, marca, largo = false, titulo, aoTocar }) {
  const Tag = aoTocar ? 'button' : 'div'
  return (
    <Tag className={`bloco ${largo ? 'largo' : ''} ${aoTocar ? 'tocavel' : ''}`} title={titulo} onClick={aoTocar}>
      <span className="bloco-rot">{marca}{rotulo}</span>
      <strong className={tom || ''}>{valor}</strong>
      {extra && <small>{extra}</small>}
    </Tag>
  )
}

// Entrou, saiu e sobrou (ou faltou) em blocos. `quarto`: um bloco a mais ao lado do "sobrou"
export function ResumoEntradasSaidas({ entrou, saiu, rotulo = 'no mês', quarto, extraEntrou, extraSaiu, aoTocar }) {
  const resultado = entrou - saiu
  return (
    <div className="blocos" role="group" aria-label={`Entrou ${formatar(entrou)}, saiu ${formatar(saiu)}`}>
      <Bloco rotulo="Entrou" valor={formatar(entrou)} tom="entrada" extra={extraEntrou} aoTocar={aoTocar && (() => aoTocar('receita'))} />
      <Bloco rotulo="Saiu" valor={formatar(saiu)} tom="saida" extra={extraSaiu} aoTocar={aoTocar && (() => aoTocar('despesa'))} />
      <Bloco rotulo={resultado >= 0 ? 'Sobrou' : 'Faltou'} valor={formatar(Math.abs(resultado))} tom={resultado >= 0 ? '' : 'saida'} extra={rotulo} largo={!quarto} aoTocar={aoTocar && (() => aoTocar('todos'))} />
      {quarto}
    </div>
  )
}
