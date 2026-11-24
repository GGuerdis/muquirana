// Gráficos simples em SVG (barras agrupadas e linhas), com toque/hover mostrando os valores.
// Desenhados na largura real da tela (texto sempre legível no celular).
import { useEffect, useRef, useState } from 'react'

export function useLargura() {
  const ref = useRef(null)
  const [largura, setLargura] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // usa o elemento guardado: o gráfico pode sair da tela (troca de aba) antes do aviso de tamanho chegar
    const medir = () => { if (el.isConnected) setLargura(Math.max(240, Math.floor(el.getBoundingClientRect().width))) }
    medir()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])
  return [ref, largura]
}

// Escala "redonda" para o eixo: 0..max em 4 passos bonitos (aceita negativos)
function escala(min, max) {
  const lo = Math.min(0, min), hi = Math.max(0, max)
  const amplitude = hi - lo || 1
  const passoBruto = amplitude / 4
  const mag = 10 ** Math.floor(Math.log10(passoBruto))
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= passoBruto)
  const base = Math.floor(lo / passo) * passo
  const topo = Math.ceil(hi / passo) * passo
  const marcas = []
  for (let v = base; v <= topo + passo / 2; v += passo) marcas.push(Math.round(v))
  return { base, topo: topo === base ? base + passo : topo, marcas }
}

// "R$ 12,3 mil" no eixo (curto), valores completos no tooltip
const compacto = (centavos) => {
  const r = centavos / 100
  const abs = Math.abs(r)
  if (abs >= 1e6) return `${(r / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (abs >= 1e3) return `${(r / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return r.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

// Barra com o topo arredondado (4px) e a base reta, presa na linha do zero
function caminhoBarra(x, y0, y1, w) {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0))
  if (y1 < y0) return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`
  return `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 - r} V${y0} Z`
}

export function Legenda({ series }) {
  if (series.length < 2) return null
  return (
    <div className="legenda">
      {series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}
    </div>
  )
}

function Tooltip({ ponto, series, formatar, x, largura }) {
  if (!ponto) return null
  const esquerda = Math.min(Math.max(x - 80, 0), largura - 160)
  return (
    <div className="tooltip-grafico" style={{ left: esquerda }}>
      <strong>{ponto.titulo ?? ponto.rotulo}</strong>
      {series.map((s, i) => ponto.valores[i] != null && (
        <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}: <b>{formatar(ponto.valores[i])}</b></span>
      ))}
    </div>
  )
}

const ALTURA = 170 // altura dos gráficos (menor, para sobrar tela para rolar e arrastar)
const M = { topo: 12, dir: 8, base: 26, esq: 48 }

/** pontos: [{ rotulo, titulo?, valores: [n|null, ...] }]  series: [{ nome, cor }] */
export function GraficoBarras({ pontos, series, formatar, rotuloAcessivel }) {
  const [ref, largura] = useLargura()
  const [ativo, setAtivo] = useState(null)
  const todos = pontos.flatMap((p) => p.valores.filter((v) => v != null))
  const { base, topo, marcas } = escala(Math.min(0, ...todos), Math.max(0, ...todos))
  const w = largura - M.esq - M.dir, h = ALTURA - M.topo - M.base
  const y = (v) => M.topo + h - ((v - base) / (topo - base)) * h
  const banda = w / Math.max(pontos.length, 1)
  const gap = 2
  const larguraBarra = Math.max(2, Math.min(28, (banda * 0.72 - gap * (series.length - 1)) / series.length))
  const grupo = larguraBarra * series.length + gap * (series.length - 1)
  const pularRotulo = Math.ceil(pontos.length / Math.max(1, Math.floor(w / 34)))
  return (
    <div className="grafico" ref={ref} onPointerLeave={() => setAtivo(null)}>
      <svg width={largura} height={ALTURA} role="img" aria-label={rotuloAcessivel}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.esq} x2={largura - M.dir} y1={y(m)} y2={y(m)} className={m === 0 ? 'eixo-zero' : 'grade'} />
            <text x={M.esq - 6} y={y(m) + 4} className="rotulo-eixo" textAnchor="end">{compacto(m)}</text>
          </g>
        ))}
        {pontos.map((p, i) => {
          const x0 = M.esq + i * banda + (banda - grupo) / 2
          return (
            <g key={p.rotulo + i}>
              {ativo === i && <rect x={M.esq + i * banda} y={M.topo} width={banda} height={h} className="faixa-ativa" />}
              {p.valores.map((v, s) => v != null && v !== 0 && (
                <path key={s} d={caminhoBarra(x0 + s * (larguraBarra + gap), y(0), y(v), larguraBarra)} fill={series[s].cor} />
              ))}
              {i % pularRotulo === 0 && <text x={M.esq + i * banda + banda / 2} y={ALTURA - 8} className="rotulo-eixo" textAnchor="middle">{p.rotulo}</text>}
              <rect x={M.esq + i * banda} y={0} width={banda} height={ALTURA} fill="transparent"
                onPointerEnter={() => setAtivo(i)} onPointerDown={() => setAtivo(i)} />
            </g>
          )
        })}
      </svg>
      <Tooltip ponto={ativo != null ? pontos[ativo] : null} series={series} formatar={formatar} x={M.esq + (ativo ?? 0) * banda + banda / 2} largura={largura} />
    </div>
  )
}

export function GraficoLinha({ pontos, series, formatar, rotuloAcessivel }) {
  const [ref, largura] = useLargura()
  const [ativo, setAtivo] = useState(null)
  const todos = pontos.flatMap((p) => p.valores.filter((v) => v != null))
  const { base, topo, marcas } = escala(todos.length ? Math.min(...todos) : 0, todos.length ? Math.max(...todos) : 0)
  const w = largura - M.esq - M.dir, h = ALTURA - M.topo - M.base
  const y = (v) => M.topo + h - ((v - base) / (topo - base)) * h
  const passo = pontos.length > 1 ? w / (pontos.length - 1) : 0
  const x = (i) => M.esq + (pontos.length > 1 ? i * passo : w / 2)
  const pularRotulo = Math.ceil(pontos.length / Math.max(1, Math.floor(w / 34)))
  const caminho = (s) => {
    let d = '', aberto = false
    pontos.forEach((p, i) => {
      const v = p.valores[s]
      if (v == null) { aberto = false; return }
      d += `${aberto ? 'L' : 'M'}${x(i)},${y(v)} `
      aberto = true
    })
    return d
  }
  const indice = (clientX, el) => {
    const r = el.getBoundingClientRect()
    return Math.max(0, Math.min(pontos.length - 1, Math.round((clientX - r.left - M.esq) / (passo || 1))))
  }
  return (
    <div className="grafico" ref={ref} onPointerLeave={() => setAtivo(null)}>
      <svg width={largura} height={ALTURA} role="img" aria-label={rotuloAcessivel}
        onPointerMove={(e) => setAtivo(indice(e.clientX, e.currentTarget))} onPointerDown={(e) => setAtivo(indice(e.clientX, e.currentTarget))}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.esq} x2={largura - M.dir} y1={y(m)} y2={y(m)} className={m === 0 ? 'eixo-zero' : 'grade'} />
            <text x={M.esq - 6} y={y(m) + 4} className="rotulo-eixo" textAnchor="end">{compacto(m)}</text>
          </g>
        ))}
        {pontos.map((p, i) => i % pularRotulo === 0 && (
          <text key={i} x={x(i)} y={ALTURA - 8} className="rotulo-eixo" textAnchor="middle">{p.rotulo}</text>
        ))}
        {ativo != null && <line x1={x(ativo)} x2={x(ativo)} y1={M.topo} y2={M.topo + h} className="mira" />}
        {series.map((s, si) => <path key={s.nome} d={caminho(si)} fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="linha-serie" style={{ color: s.cor }} />)}
        {ativo != null && series.map((s, si) => pontos[ativo].valores[si] != null && (
          <circle key={s.nome} cx={x(ativo)} cy={y(pontos[ativo].valores[si])} r="5" fill={s.cor} className="marcador" />
        ))}
      </svg>
      <Tooltip ponto={ativo != null ? pontos[ativo] : null} series={series} formatar={formatar} x={ativo != null ? x(ativo) : 0} largura={largura} />
    </div>
  )
}

// Tabela com os mesmos números do gráfico (acessível e útil para conferir)
export function TabelaDados({ colunas, linhas }) {
  return (
    <div className="tabela-rolavel">
      <table className="tabela-dados">
        <thead><tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l, i) => <tr key={i}>{l.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
