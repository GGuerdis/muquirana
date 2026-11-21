// Faixa "versão nova": aparece quando o aparelho está rodando uma versão velha do app
import { useEffect, useState } from 'react'
import { versaoNova, atualizarApp } from '../lib/versao.js'

export function useVersaoNova() {
  const [nova, setNova] = useState(null)
  useEffect(() => {
    let vivo = true
    const ver = () => versaoNova().then((v) => { if (vivo) setNova(v) })
    ver()
    const t = setInterval(ver, 5 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [])
  return nova
}

export default function AvisoVersao({ nova, texto = 'Tem uma versão nova do Muquirana.' }) {
  const [atualizando, setAtualizando] = useState(false)
  if (!nova) return null
  return (
    <div className="aviso-navegador forte" role="alert">
      <strong>🔄 {texto}</strong>
      <span>Toque em atualizar (seus dados continuam aqui).</span>
      <div className="aviso-navegador-botoes">
        <button className="botao primario mini" disabled={atualizando} onClick={() => { setAtualizando(true); atualizarApp() }}>{atualizando ? 'Atualizando…' : 'Atualizar agora'}</button>
      </div>
    </div>
  )
}
