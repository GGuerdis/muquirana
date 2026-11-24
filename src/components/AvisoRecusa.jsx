// Faixa de aviso quando a nuvem recusa alterações (elas são desfeitas no aparelho)
import { useEffect, useState } from 'react'
import { IconeAlerta, Ic } from './Icones.jsx'

export default function AvisoRecusa() {
  const [recusas, setRecusas] = useState(null)
  useEffect(() => {
    const ouvir = (e) => setRecusas(e.detail)
    window.addEventListener('muquirana-recusa', ouvir)
    return () => window.removeEventListener('muquirana-recusa', ouvir)
  }, [])
  if (!recusas?.length) return null
  return (
    <div className="aviso-navegador forte" role="alert">
      <strong><Ic i={IconeAlerta} className="atencao" /> A nuvem recusou {recusas.length} alteração(ões), e elas foram desfeitas neste aparelho</strong>
      <span>Motivo: {recusas[0].motivo}{recusas[0].tabela ? ` (${recusas[0].tabela})` : ''}</span>
      <span className="dica">Tire um print desta mensagem e mande para quem cuida do app.</span>
      <div className="aviso-navegador-botoes"><button className="botao secundario mini" onClick={() => setRecusas(null)}>Fechar</button></div>
    </div>
  )
}
