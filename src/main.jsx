import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './estilos.css'

// Pede ao navegador para não apagar os dados do app quando faltar espaço
navigator.storage?.persist?.()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
