import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './estilos.css'
import { conectarNuvem, migrarBancoAntigo } from './lib/db.js'
import { deveEntrarAoAbrir, entrar } from './lib/nuvem.js'
import { vigiarRecusasDaNuvem } from './lib/recusas.js'

// Pede ao navegador para não apagar os dados do app quando faltar espaço
navigator.storage?.persist?.()

async function iniciar() {
  // avisa se a nuvem recusar alguma alteração (senão os dados somem sem explicação)
  vigiarRecusasDaNuvem((recusas) => window.dispatchEvent(new CustomEvent('muquirana-recusa', { detail: recusas })))
  conectarNuvem()
  let migrou = null
  try {
    migrou = await migrarBancoAntigo() // traz os dados da versão anterior (só na primeira vez)
  } catch (e) {
    console.error('Falha ao migrar o banco antigo', e)
  }
  // só no desenvolvimento: ?demo carrega dados inventados para ver as telas
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) await (await import('./dev/demo.js')).carregarDemo()
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App migrou={migrou} />
    </StrictMode>,
  )
  if (deveEntrarAoAbrir()) entrar()
}

iniciar()
