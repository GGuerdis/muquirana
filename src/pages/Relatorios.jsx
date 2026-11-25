// Relatórios: resumo para o Imposto de Renda, o fluxo do dinheiro no mês e os totais por etiqueta
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, SeletorMes, ItemLancamento, MarcaConta, Bloco } from '../components/Pecas.jsx'
import { Abas, Chips } from '../components/Campos.jsx'
import { useLargura, TabelaDados } from '../components/Graficos.jsx'
import { formatar } from '../lib/dinheiro.js'
import { mesAtual, dataCurta } from '../lib/datas.js'
import { tomDaCategoria } from '../lib/cores.js'
import { resumoIR, fluxoDoMes, desenhoFluxo } from '../lib/relatorios.js'
import { resumoPorEtiqueta } from '../lib/etiquetas.js'
import { compararIds } from '../lib/ids.js'

const VISTAS = [{ valor: 'ir', rotulo: 'IR' }, { valor: 'fluxo', rotulo: 'Fluxo' }, { valor: 'etiquetas', rotulo: 'Etiquetas' }]

export default function Relatorios({ irPara }) {
  const [vista, setVista] = useState('ir')
  return (
    <div className="pagina">
      <CabecaPagina titulo="Relatórios" irPara={irPara} />
      <Abas opcoes={VISTAS} valor={vista} aoMudar={setVista} />
      {vista === 'ir' && <ImpostoDeRenda />}
      {vista === 'fluxo' && <Fluxo />}
      {vista === 'etiquetas' && <PorEtiqueta />}
    </div>
  )
}

// ---------- Imposto de Renda ----------
function ImpostoDeRenda() {
  const { lancamentos, contas, categorias } = useDados()
  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual - 1)
  const anos = [anoAtual - 2, anoAtual - 1, anoAtual].map((a) => ({ valor: a, rotulo: String(a) }))
  const r = useMemo(() => resumoIR(ano, { lancamentos, contas, categorias }), [ano, lancamentos, contas, categorias])

  const Grupo = ({ titulo, dados, dica }) => (
    <section className="painel">
      <div className="painel-titulo"><h3>{titulo}</h3><strong>{formatar(dados.total)}</strong></div>
      {dados.porDescricao.length === 0 ? <p className="vazio">Nada em {ano}.</p> : (
        <ul className="lista-ir">
          {dados.porDescricao.slice(0, 12).map((x) => (
            <li key={x.nome}><span>{x.nome}<small>{x.quantidade} {x.quantidade === 1 ? 'lançamento' : 'lançamentos'}</small></span><b>{formatar(x.total)}</b></li>
          ))}
          {dados.porDescricao.length > 12 && <li className="discreto">e mais {dados.porDescricao.length - 12}</li>}
        </ul>
      )}
      {dica && <p className="dica">{dica}</p>}
    </section>
  )

  return (
    <>
      <Chips opcoes={anos} valor={ano} aoMudar={setAno} />
      <p className="dica">Resumo do ano-calendário {ano} (declaração feita em {ano + 1}), a partir das categorias dos seus lançamentos. Ajuda a organizar; não substitui os informes de rendimentos.</p>
      <div className="blocos">
        <Bloco rotulo="Salário" valor={formatar(r.salario.total)} tom="entrada" extra={`${r.salario.quantidade} lançamentos`} />
        <Bloco rotulo="Rendimentos" valor={formatar(r.rendimentos.total)} tom="entrada" extra={`${r.rendimentos.quantidade} lançamentos`} />
      </div>
      <Grupo titulo="Saúde" dados={r.saude} dica="Consultas, exames, dentista, psicólogo e plano de saúde costumam entrar como despesa médica; farmácia, em geral, não. Guarde os recibos com CPF ou CNPJ de quem atendeu." />
      <Grupo titulo="Educação" dados={r.educacao} dica="Escola, faculdade e pós entram como despesa de instrução, com limite anual por pessoa; cursos livres e de idiomas, não." />
      <section className="painel">
        <h3>Saldo das contas (Bens e Direitos)</h3>
        <TabelaDados colunas={['Conta', `31/12/${ano - 1}`, `31/12/${ano}`]}
          linhas={r.saldos.map((s) => [<span key="c" className="com-marca"><MarcaConta conta={s.conta} />{s.conta.nome}</span>, formatar(s.fimAnoAnterior), formatar(s.fimAno)])} />
        <p className="dica">Confira com o informe de rendimentos de cada banco: ele é o número oficial.</p>
      </section>
    </>
  )
}

// ---------- Fluxo do mês (sankey) ----------
function Fluxo() {
  const { lancamentos, categorias } = useDados()
  const [mes, setMes] = useState(mesAtual())
  const fluxo = useMemo(() => fluxoDoMes(mes, lancamentos, categorias), [mes, lancamentos, categorias])
  return (
    <>
      <SeletorMes mes={mes} aoMudar={setMes} />
      <div className="blocos">
        <Bloco rotulo="Entrou" valor={formatar(fluxo.entrou)} tom="entrada" />
        <Bloco rotulo={fluxo.sobrou >= 0 ? 'Sobrou' : 'Faltou'} valor={formatar(Math.abs(fluxo.sobrou))} tom={fluxo.sobrou >= 0 ? 'entrada' : 'saida'} />
      </div>
      <section className="painel">
        <h3>De onde veio e para onde foi</h3>
        <DesenhoFluxo fluxo={fluxo} />
        <TabelaDados colunas={['', 'Categoria', 'Valor']} linhas={[
          ...fluxo.entradas.map((x) => ['Entrou', x.nome, formatar(x.valor)]),
          ...fluxo.saidas.map((x) => ['Saiu', x.nome, formatar(x.valor)]),
        ]} />
      </section>
    </>
  )
}

const corDoNo = (n, lado) => {
  if (n.sobra) return 'var(--entrada)'
  if (n.saldo || n.outras) return 'var(--texto-3)'
  if (lado === 'esquerda') return 'var(--entrada)'
  return `hsl(${tomDaCategoria(n.nome)} 85% 62%)`
}
const curto = (t, n = 15) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

function DesenhoFluxo({ fluxo }) {
  const [ref, largura] = useLargura()
  const d = desenhoFluxo(fluxo)
  if (!d) return <p className="vazio" ref={ref}>Nenhuma entrada ou saída neste mês.</p>
  const rotulo = Math.min(112, largura * 0.32)
  const barra = 8
  const xE = rotulo, xC = largura / 2 - barra / 2, xD = largura - rotulo - barra
  const H = d.altura
  const fatia = (nos) => { let y = 0; return nos.map((n) => { const h = (n.valor / d.total) * H; const r = { y, h }; y += h; return r }) }
  const cE = fatia(d.esquerda), cD = fatia(d.direita)
  const fita = (x0, a0, b0, x1, a1, b1) => {
    const m = (x0 + x1) / 2
    return `M${x0},${a0} C${m},${a0} ${m},${a1} ${x1},${a1} L${x1},${b1} C${m},${b1} ${m},${b0} ${x0},${b0} Z`
  }
  return (
    <div className="grafico fluxo" ref={ref}>
      <svg width={largura} height={H + 8} role="img" aria-label={`Fluxo do mês: entrou ${formatar(fluxo.entrou)}, saiu ${formatar(fluxo.saiu)}`}>
        <defs>
          <linearGradient id="sol-fluxo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe66b" /><stop offset="0.45" stopColor="#ff9a3d" /><stop offset="0.8" stopColor="#ff3d8b" /><stop offset="1" stopColor="#b5179e" />
          </linearGradient>
        </defs>
        <g transform="translate(0,4)">
          {d.esquerda.map((n, i) => <path key={`fe${i}`} d={fita(xE + barra, n.y, n.y + n.h, xC, cE[i].y, cE[i].y + cE[i].h)} fill={corDoNo(n, 'esquerda')} opacity="0.3" />)}
          {d.direita.map((n, i) => <path key={`fd${i}`} d={fita(xC + barra, cD[i].y, cD[i].y + cD[i].h, xD, n.y, n.y + n.h)} fill={corDoNo(n, 'direita')} opacity="0.3" />)}
          <rect x={xC} y={0} width={barra} height={H} rx="3" fill="url(#sol-fluxo)" />
          {d.esquerda.map((n, i) => (
            <g key={`ne${i}`}>
              <rect x={xE} y={n.y} width={barra} height={n.h} rx="3" fill={corDoNo(n, 'esquerda')} />
              <text x={xE - 6} y={n.rotuloY - 2} textAnchor="end" className="fluxo-nome">{curto(n.nome)}</text>
              <text x={xE - 6} y={n.rotuloY + 11} textAnchor="end" className="fluxo-valor">{formatar(n.valor)}</text>
            </g>
          ))}
          {d.direita.map((n, i) => (
            <g key={`nd${i}`}>
              <rect x={xD} y={n.y} width={barra} height={n.h} rx="3" fill={corDoNo(n, 'direita')} />
              <text x={xD + barra + 6} y={n.rotuloY - 2} className="fluxo-nome">{curto(n.nome)}</text>
              <text x={xD + barra + 6} y={n.rotuloY + 11} className="fluxo-valor">{formatar(n.valor)}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

// ---------- Por etiqueta ----------
function PorEtiqueta() {
  const { lancamentos } = useDados()
  const lista = useMemo(() => resumoPorEtiqueta(lancamentos), [lancamentos])
  const porId = useMemo(() => new Map(lancamentos.map((l) => [l.id, l])), [lancamentos])
  const [aberta, setAberta] = useState(null)
  if (!lista.length) {
    return (
      <section className="painel vazio-grande">
        <p>Nenhuma etiqueta ainda.</p>
        <p className="dica">Ao lançar ou editar, escreva uma etiqueta (ex.: obra-apto, viagem-2026). Aqui aparece quanto foi gasto em cada uma, somando todas as categorias e meses.</p>
      </section>
    )
  }
  return (
    <section className="painel">
      <h3>Total por etiqueta</h3>
      {lista.map((e) => (
        <div key={e.etiqueta} className="linha-etiqueta">
          <button className="linha-etiqueta-topo" onClick={() => setAberta(aberta === e.etiqueta ? null : e.etiqueta)} aria-expanded={aberta === e.etiqueta}>
            <span><strong>#{e.etiqueta}</strong><small>{e.quantidade} {e.quantidade === 1 ? 'lançamento' : 'lançamentos'} · {dataCurta(e.de)} a {dataCurta(e.ate)}</small></span>
            <span className="linha-etiqueta-valores"><b className="saida">{formatar(e.saiu)}</b>{e.entrou > 0 && <small className="entrada">+ {formatar(e.entrou)}</small>}</span>
          </button>
          {aberta === e.etiqueta && (
            <div className="linha-etiqueta-itens">
              {e.ids.map((id) => porId.get(id)).filter(Boolean)
                .sort((a, b) => b.data.localeCompare(a.data) || compararIds(b.id, a.id))
                .map((l) => <ItemLancamento key={l.id} l={l} mostrarData />)}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
