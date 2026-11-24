// Aviso quando o app foi aberto dentro do WhatsApp/Instagram/etc.: ali os dados podem sumir.
import { useState } from 'react'
import { navegadorAtual, linkParaChrome } from '../lib/navegador.js'

export default function AvisoNavegador({ forte = false }) {
  const [nav] = useState(() => navegadorAtual())
  const [copiado, setCopiado] = useState(false)
  if (!nav) return null
  const onde = nav.app ? `pelo navegador do ${nav.app}` : 'pelo navegador de dentro de outro app'
  const endereco = location.origin + location.pathname

  async function copiar() {
    try { await navigator.clipboard.writeText(endereco); setCopiado(true) } catch { setCopiado(false) }
  }

  return (
    <div className={`aviso-navegador ${forte ? 'forte' : ''}`} role="alert">
      <strong>⚠️ Você abriu o Mukirana {onde}</strong>
      <span>Aqui os seus dados podem sumir quando você fechar ou trocar de tela. {nav.android ? 'Abra no Chrome' : 'Abra no Safari'} e, de preferência, instale o app na tela inicial.</span>
      <div className="aviso-navegador-botoes">
        {nav.android && <a className="botao primario mini" href={linkParaChrome(endereco)}>Abrir no Chrome</a>}
        <button className="botao secundario mini" onClick={copiar}>{copiado ? 'Link copiado ✓' : 'Copiar o link'}</button>
      </div>
    </div>
  )
}
