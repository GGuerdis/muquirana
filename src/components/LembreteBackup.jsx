// Cartão no Início lembrando de fazer backup de tempos em tempos
import { useState } from 'react'
import { useDados } from '../dados.jsx'
import { hoje } from '../lib/datas.js'
import { lembreteBackup, fazerBackup, adiarBackup } from '../lib/backupArquivo.js'

export default function LembreteBackup() {
  const { config, lancamentos, usuario, espacoAtual, avisar, zoeira } = useDados()
  const [ocupado, setOcupado] = useState(false)
  if (espacoAtual) return null // o backup é do espaço Pessoal
  const l = lembreteBackup({ ultimoBackup: config.ultimoBackup, adiadoAte: config.backupAdiadoAte, hoje: hoje(), totalLancamentos: lancamentos.length, logado: !!usuario?.isLoggedIn })
  if (!l) return null

  async function fazer() {
    setOcupado(true)
    try {
      if (await fazerBackup()) avisar(zoeira ? 'Backup feito! Seus tostões estão seguros.' : 'Backup exportado.')
    } catch (e) {
      avisar(e.message || 'Não foi possível fazer o backup.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="painel lembrete-backup">
      <strong>💾 {l.nunca ? 'Você ainda não fez nenhum backup' : `Faz ${l.dias} dias desde o último backup`}</strong>
      <span className="dica">Guarde uma cópia do seu histórico (no Drive, no e-mail...). Se o celular sumir, você restaura em Ajustes.</span>
      <div className="linha-botoes">
        <button className="botao secundario" disabled={ocupado} onClick={() => adiarBackup()}>Lembrar depois</button>
        <button className="botao primario cheio" disabled={ocupado} onClick={fazer}>Fazer backup agora</button>
      </div>
    </section>
  )
}
