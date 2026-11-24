// Marcador da barra de baixo: uma pílula que desliza até o item da tela atual.
// Durante o arrasto lateral ela acompanha o dedo (useArrastoTelas chama indicadorEntre).
import { useLayoutEffect, useRef } from 'react'
import { posicaoIndicador } from '../lib/gesto.js'

const TRANSICAO = 'transform 0.34s cubic-bezier(0.2, 0.9, 0.3, 1.12), opacity 0.22s ease'

// centro do ícone do item da barra (relativo à barra); null se a tela não está na barra (ex.: Ajustes)
function centroDoItem(nav, aba) {
  const icone = nav?.querySelector(`[data-aba="${aba}"] .nav-icone`)
  if (!icone) return null
  const n = nav.getBoundingClientRect()
  const r = icone.getBoundingClientRect()
  return { x: r.left + r.width / 2 - n.left, y: r.top + r.height / 2 - n.top }
}

// p de 0 (na tela atual) a 1 (na vizinha)
export function indicadorEntre(nav, de, para, p, animar = false) {
  const el = nav?.querySelector('.nav-indicador')
  if (!el) return
  const pos = posicaoIndicador(centroDoItem(nav, de), para ? centroDoItem(nav, para) : null, p)
  el.style.transition = animar ? TRANSICAO : 'none'
  el.style.opacity = String(pos.opacidade)
  if (pos.x != null) el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`
}

// acende o item já ao soltar o dedo (sem esperar a tela nova montar)
export function marcarItemAtivo(nav, aba) {
  nav?.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba))
}

export function useIndicadorNav(navRef, aba) {
  const primeira = useRef(true)
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    indicadorEntre(nav, aba, null, 0, !primeira.current)
    primeira.current = false
    const recalcular = () => indicadorEntre(nav, aba, null, 0, false)
    window.addEventListener('resize', recalcular)
    // fontes/ícones podem terminar de carregar depois: confere a posição de novo
    const t = setTimeout(recalcular, 400)
    return () => { window.removeEventListener('resize', recalcular); clearTimeout(t) }
  }, [navRef, aba])
}
