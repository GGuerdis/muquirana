// "Folha" que sobe de baixo da tela (bottom sheet), usada para formulários
import { useEffect } from 'react'

export default function Folha({ titulo, aoFechar, children, rodape }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', esc)
    document.body.classList.add('sem-rolagem')
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.classList.remove('sem-rolagem')
    }
  }, [aoFechar])

  return (
    <div className="folha-fundo" onClick={aoFechar}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="folha-topo">
          <h2>{titulo}</h2>
          <button className="botao-icone" onClick={aoFechar} aria-label="Fechar">✕</button>
        </div>
        <div className="folha-corpo">{children}</div>
        {rodape && <div className="folha-rodape">{rodape}</div>}
      </div>
    </div>
  )
}
