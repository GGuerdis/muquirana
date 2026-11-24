// Liga o gesto de arrastar para o lado para trocar de tela, com movimento fluido:
// - a tela acompanha o dedo 1:1 (nas pontas, sem tela vizinha, ela "estica" pouco, como elástico);
// - ao soltar, a tela atual desliza para fora e a nova entra pelo outro lado;
// - se desistir, ela volta ao lugar com um leve quique;
// - enquanto o arrasto é lateral, a rolagem vertical fica travada (a tela não treme).
import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { direcaoDoArrasto, abaVizinha, ehLateral, ignorarAlvo, BORDA } from '../lib/gesto.js'

const SAIDA_MS = 170
const elastico = (dx) => Math.sign(dx) * Math.pow(Math.abs(dx), 0.72)

export function useArrastoTelas({ aba, irPara, alvoRef, ativo }) {
  const abaRef = useRef(aba)
  const irRef = useRef(irPara)
  abaRef.current = aba
  irRef.current = irPara

  useEffect(() => {
    if (!ativo) return
    let ini = null
    let lateral = false
    let dxAtual = 0
    let quadro = 0
    let animando = false
    const tela = () => alvoRef.current
    const largura = () => window.innerWidth || 390

    const pintar = () => {
      quadro = 0
      const m = tela()
      if (!m) return
      m.style.transform = `translate3d(${dxAtual}px, 0, 0)`
      m.style.opacity = String(1 - Math.min(Math.abs(dxAtual) / (largura() * 1.8), 0.3))
    }
    const limpar = (m) => {
      m.style.transition = ''
      m.style.transform = ''
      m.style.opacity = ''
      m.style.willChange = ''
    }
    const voltarAoLugar = () => {
      const m = tela()
      if (!m) return
      if (!dxAtual) return limpar(m)
      m.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.15), opacity 0.32s ease'
      m.style.transform = 'translate3d(0, 0, 0)'
      m.style.opacity = '1'
      setTimeout(() => { if (!ini) limpar(m) }, 340)
    }

    const comeca = (e) => {
      ini = null
      if (animando || e.touches.length !== 1 || ignorarAlvo(e.target) || document.querySelector('.folha-fundo')) return
      const t = e.touches[0]
      if (t.clientX < BORDA || t.clientX > largura() - BORDA) return
      ini = { x: t.clientX, y: t.clientY, t: performance.now() }
      lateral = false
      dxAtual = 0
    }
    const move = (e) => {
      if (!ini) return
      const t = e.touches[0]
      const dx = t.clientX - ini.x
      const dy = t.clientY - ini.y
      if (!lateral) {
        if (Math.abs(dy) > 12 && !ehLateral(dx, dy)) { ini = null; return } // está rolando a tela
        if (!ehLateral(dx, dy)) return
        lateral = true
        const m = tela()
        if (m) { m.style.transition = 'none'; m.style.willChange = 'transform, opacity' }
      }
      if (e.cancelable) e.preventDefault() // trava a rolagem vertical durante o arrasto lateral
      dxAtual = abaVizinha(abaRef.current, dx < 0 ? 1 : -1) ? dx : elastico(dx)
      if (!quadro) quadro = requestAnimationFrame(pintar)
    }
    const fim = (e) => {
      if (!ini) return
      const t = e.changedTouches[0]
      const dir = lateral ? direcaoDoArrasto({ dx: t.clientX - ini.x, dy: t.clientY - ini.y, ms: performance.now() - ini.t, inicioX: ini.x, largura: largura() }) : 0
      const proxima = abaVizinha(abaRef.current, dir)
      ini = null
      if (quadro) { cancelAnimationFrame(quadro); quadro = 0 }
      const m = tela()
      if (!proxima || !m) { voltarAoLugar(); return }
      // sai deslizando para o lado do gesto e a próxima tela entra pelo outro lado
      animando = true
      m.style.transition = `transform ${SAIDA_MS}ms cubic-bezier(0.4, 0, 1, 1), opacity ${SAIDA_MS}ms ease-in`
      m.style.transform = `translate3d(${dir > 0 ? -largura() : largura()}px, 0, 0)`
      m.style.opacity = '0'
      setTimeout(() => {
        // troca a tela já (síncrono) e só depois devolve o lugar: assim a tela antiga não pisca de volta
        flushSync(() => irRef.current(proxima, { deslizou: true }))
        limpar(m)
        animando = false
      }, SAIDA_MS)
    }
    const cancela = () => { ini = null; voltarAoLugar() }

    document.addEventListener('touchstart', comeca, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', fim, { passive: true })
    document.addEventListener('touchcancel', cancela, { passive: true })
    return () => {
      document.removeEventListener('touchstart', comeca)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', fim)
      document.removeEventListener('touchcancel', cancela)
      if (quadro) cancelAnimationFrame(quadro)
    }
  }, [ativo, alvoRef])
}
