import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './estilos.css'
import { conectarNuvem, migrarBancoAntigo } from './lib/db.js'
import { deveEntrarAoAbrir, entrar } from './lib/nuvem.js'

// Pede ao navegador para não apagar os dados do app quando faltar espaço
navigator.storage?.persist?.()

async function iniciar() {
  conectarNuvem()
  let migrou = null
  try {
    migrou = await migrarBancoAntigo() // traz os dados da versão anterior (só na primeira vez)
  } catch (e) {
    console.error('Falha ao migrar o banco antigo', e)
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App migrou={migrou} />
    </StrictMode>,
  )
  if (deveEntrarAoAbrir()) entrar()
}

iniciar()
