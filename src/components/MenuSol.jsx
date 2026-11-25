// O sol flutuante (embaixo, à direita) no lugar da barra de baixo.
// Tocar abre o menu com todas as telas (ele nasce do sol e cobre a tela); segurar abre direto o Novo lançamento.
import { useCallback, useEffect, useRef, useState } from 'react'
import { TELAS, AJUSTES } from '../lib/telas.js'
import { IconeCategoria } from './Pecas.jsx'

const SEGURAR_MS = 500

export default function MenuSol({ aba, irPara, novoLancamento }) {
  const [aberto, setAberto] = useState(false)
  const [origem, setOrigem] = useState(null)
  const solRef = useRef(null)
  const menuRef = useRef(null)
  const segurar = useRef(null)
  const segurou = useRef(false)

  const abrir = useCallback((sim) => {
    const s = solRef.current?.getBoundingClientRect()
    if (s) setOrigem({ x: s.left + s.width / 2, y: s.top + s.height / 2 })
    setAberto(sim)
  }, [])

  // menu aberto: a página de trás não rola; Esc fecha
  useEffect(() => {
    if (!aberto) return
    document.body.classList.add('sem-rolagem')
    const tecla = (e) => { if (e.key === 'Escape') { abrir(false); solRef.current?.focus() } }
    document.addEventListener('keydown', tecla)
    return () => { document.body.classList.remove('sem-rolagem'); document.removeEventListener('keydown', tecla) }
  }, [aberto, abrir])
  useEffect(() => { if (menuRef.current) menuRef.current.inert = !aberto }, [aberto])

  const comecaToque = () => {
    segurou.current = false
    clearTimeout(segurar.current)
    segurar.current = setTimeout(() => { segurou.current = true; abrir(false); novoLancamento() }, SEGURAR_MS)
  }
  const soltou = () => clearTimeout(segurar.current)
  const ir = (id) => { abrir(false); if (id !== aba) irPara(id) }

  const estiloOrigem = origem ? { '--sol-x': `${origem.x}px`, '--sol-y': `${origem.y}px` } : undefined
  return (
    <>
      <nav ref={menuRef} className={`menu-sol ${aberto ? 'aberto' : ''}`} style={estiloOrigem} aria-label="Telas" data-sem-arrasto>
        <div className="menu-sol-corpo">
          <h2 className="menu-sol-titulo anima" style={{ '--i': 0 }}>Mukirana</h2>
          <button className="menu-sol-novo anima" style={{ '--i': 1 }} onClick={() => { abrir(false); novoLancamento() }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Novo lançamento
          </button>
          <div className="menu-sol-grupo anima" style={{ '--i': 2 }}>
            <span className="rotulo-secao">Telas</span>
            <div className="menu-sol-grade">
              {TELAS.map((t) => (
                <button key={t.id} className="menu-sol-item" onClick={() => ir(t.id)} aria-current={aba === t.id ? 'page' : undefined}>
                  <IconeCategoria desenho={t.desenho} tom={t.tom} />
                  <span>{t.rotulo}</span>
                  {t.novo && <span className="menu-sol-novidade">novo</span>}
                </button>
              ))}
            </div>
          </div>
          <button className="menu-sol-ajustes anima" style={{ '--i': 3 }} onClick={() => ir(AJUSTES.id)} aria-current={aba === AJUSTES.id ? 'page' : undefined}>
            <IconeCategoria desenho={AJUSTES.desenho} tom={AJUSTES.tom} />
            <span>Ajustes<small>Contas, cartões, categorias, nuvem e backup</small></span>
          </button>
        </div>
      </nav>
      <button
        ref={solRef}
        className={`botao-sol ${aberto ? 'aberto' : ''}`}
        aria-expanded={aberto}
        aria-label={aberto ? 'Fechar o menu' : 'Abrir o menu (segure para um novo lançamento)'}
        onPointerDown={comecaToque}
        onPointerUp={soltou}
        onPointerLeave={soltou}
        onPointerCancel={soltou}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (!segurou.current) abrir(!aberto) }}
      >
        <span className="botao-sol-mais" aria-hidden="true">+</span>
      </button>
    </>
  )
}
