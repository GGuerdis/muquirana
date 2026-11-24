// Liga o gesto de arrastar para o lado para trocar de tela.
// Enquanto o dedo arrasta, a tela acompanha um pouco (só se houver tela vizinha); ao soltar, troca ou volta ao lugar.
import { useEffect, useRef } from 'react'
import { direcaoDoArrasto, abaVizinha, ehLateral, ignorarAlvo, BORDA } from '../lib/gesto.js'

export function useArrastoTelas({ aba, irPara, alvoRef, ativo }) {
  const abaRef = useRef(aba)
  const irRef = useRef(irPara)
  abaRef.current = aba
  irRef.current = irPara

  useEffect(() => {
    if (!ativo) return
    let ini = null
    let lateral = false
    const tela = () => alvoRef.current
    const voltarAoLugar = (animar) => {
      const m = tela()
      if (!m) return
      m.style.transition = animar ? 'transform 0.2s ease, opacity 0.2s ease' : ''
      m.style.transform = ''
      m.style.opacity = ''
    }
    const comeca = (e) => {
      ini = null
      if (e.touches.length !== 1 || ignorarAlvo(e.target) || document.querySelector('.folha-fundo')) return
      const t = e.touches[0]
      if (t.clientX < BORDA || t.clientX > window.innerWidth - BORDA) return
      ini = { x: t.clientX, y: t.clientY, t: performance.now() }
      lateral = false
    }
    const move = (e) => {
      if (!ini) return
      const t = e.touches[0]
      const dx = t.clientX - ini.x
      const dy = t.clientY - ini.y
      if (!lateral) {
        if (Math.abs(dy) > 12 && !ehLateral(dx, dy)) { ini = null; return } // está rolando a tela
        lateral = ehLateral(dx, dy)
      }
      if (lateral && abaVizinha(abaRef.current, dx < 0 ? 1 : -1)) {
        const m = tela()
        if (!m) return
        m.style.transition = 'none'
        m.style.transform = `translateX(${dx * 0.35}px)`
        m.style.opacity = String(1 - Math.min(Math.abs(dx) / 900, 0.25))
      }
    }
    const fim = (e) => {
      if (!ini) return
      const t = e.changedTouches[0]
      const dir = direcaoDoArrasto({ dx: t.clientX - ini.x, dy: t.clientY - ini.y, ms: performance.now() - ini.t, inicioX: ini.x, largura: window.innerWidth })
      const proxima = abaVizinha(abaRef.current, dir)
      ini = null
      if (proxima) { voltarAoLugar(false); irRef.current(proxima) } else voltarAoLugar(true)
    }
    const cancela = () => { ini = null; voltarAoLugar(true) }

    document.addEventListener('touchstart', comeca, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', fim, { passive: true })
    document.addEventListener('touchcancel', cancela, { passive: true })
    return () => {
      document.removeEventListener('touchstart', comeca)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', fim)
      document.removeEventListener('touchcancel', cancela)
    }
  }, [ativo, alvoRef])
}
