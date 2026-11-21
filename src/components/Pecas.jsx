// Peças pequenas usadas em várias telas
import { useDados } from '../dados.jsx'
import { formatar } from '../lib/dinheiro.js'
import { nomeMes, somarMeses, mesAtual, dataCurta } from '../lib/datas.js'
import { tomDaCategoria, desenhoDaCategoria } from '../lib/cores.js'
import { DESENHOS_CATEGORIA, IconeEngrenagem, IconeVoltar } from './Icones.jsx'

// Mascote provisório: o rosto muda conforme o humor. Depois trocamos pela arte definitiva.
export function Mascote({ rosto, tamanho = 64 }) {
  return (
    <div className="mascote" style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.55 }} aria-hidden="true">
      <span>{rosto}</span>
    </div>
  )
}

// Ícone da categoria: losango HUD na cor da categoria, com o desenho dela (ou o emoji, se for categoria sua).
// `desenho` força um desenho (transferência, fatura...); sem categoria e sem desenho, fica neutro.
export function IconeCategoria({ categoria, emoji, desenho, pequeno = false }) {
  const tom = categoria ? tomDaCategoria(categoria.nome) : null
  const chave = desenho ?? (categoria ? desenhoDaCategoria(categoria.nome) : null)
  const traco = chave && DESENHOS_CATEGORIA[chave]
  return (
    <span className={`icone-cat ${pequeno ? 'pequeno' : ''} ${tom == null ? 'neutro' : ''}`} style={tom == null ? undefined : { '--tom': tom }} aria-hidden="true">
      {traco
        ? <svg viewBox="0 0 24 24">{traco}</svg>
        : <span className="icone-cat-emoji">{emoji ?? categoria?.emoji ?? '📦'}</span>}
    </span>
  )
}

// Cabeçalho igual em todas as telas: título à esquerda, engrenagem (ou voltar) à direita,
// e os botões de ação da tela numa fileira logo abaixo.
export function CabecaPagina({ titulo, irPara, voltar = false, acoes }) {
  return (
    <>
      <header className="cabeca">
        <h1 className="titulo-pagina">{titulo}</h1>
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
    onde = l.cartaoId ? `💳 ${cartaoPorId.get(l.cartaoId)?.nome ?? ''}` : contaPorId.get(l.contaId)?.nome ?? ''
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
        const cat = c.categoriaId === 'outros' ? { emoji: '➕', nome: 'Demais categorias' } : categoriaPorId.get(c.categoriaId) || { emoji: '📦', nome: 'Sem categoria' }
        const pct = Math.round((c.valor / total) * 100)
        return (
          <li key={c.categoriaId} className="barra-linha" title={`${cat.nome}: ${formatar(c.valor)} (${pct}%)`}>
            <IconeCategoria categoria={c.categoriaId === 'outros' ? null : cat} desenho={c.categoriaId === 'outros' ? 'mais' : undefined} emoji={cat.emoji} pequeno />
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
export function ResumoEntradasSaidas({ entrou, saiu, rotulo = 'no mês' }) {
  const total = entrou + saiu || 1
  const resultado = entrou - saiu
  return (
    <section className="painel cartao-mes">
      <div className="linha-resumo">
        <div>
          <span className="rotulo"><i className="ponto" style={{ background: 'var(--entrada)' }} />Entrou</span>
          <strong className="entrada">{formatar(entrou)}</strong>
        </div>
        <div>
          <span className="rotulo"><i className="ponto" style={{ background: 'var(--saida)' }} />Saiu</span>
          <strong>{formatar(saiu)}</strong>
        </div>
      </div>
      <div className="proporcao" role="img" aria-label={`Entrou ${formatar(entrou)}, saiu ${formatar(saiu)}`}>
        {entrou > 0 && <span style={{ width: `${(entrou / total) * 100}%`, background: 'var(--entrada)' }} />}
        {saiu > 0 && <span style={{ width: `${(saiu / total) * 100}%`, background: 'var(--saida)' }} />}
      </div>
      <div className="sobrou">
        <span>{resultado >= 0 ? `Sobrou ${rotulo}` : `Faltou ${rotulo}`}</span>
        <strong className={resultado >= 0 ? 'entrada' : 'saida'}>{formatar(Math.abs(resultado))}</strong>
      </div>
    </section>
  )
}
