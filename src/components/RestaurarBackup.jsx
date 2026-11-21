// Escolher um arquivo de backup e restaurar (usado em Ajustes e nas boas-vindas)
import { useRef, useState } from 'react'
import { restaurarBackup } from '../lib/db.js'

export default function RestaurarBackup({ rotulo = 'Restaurar', classe = 'botao secundario cheio', avisar, aoRestaurar }) {
  const arquivo = useRef(null)
  const [backup, setBackup] = useState(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function lerArquivo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErro('')
    try {
      const dados = JSON.parse(await f.text())
      if (dados?.app !== 'muquirana' || !dados.dados) throw new Error()
      setBackup(dados)
    } catch {
      setErro('Esse arquivo não parece ser um backup do Muquirana.')
    }
  }

  async function confirmar() {
    if (ocupado) return
    setOcupado(true)
    try {
      await restaurarBackup(backup)
      avisar?.('Backup restaurado.')
      setBackup(null)
      aoRestaurar?.()
    } catch (err) {
      setErro(err.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <button className={classe} onClick={() => arquivo.current?.click()}>{rotulo}</button>
      <input ref={arquivo} type="file" accept="application/json,.json" hidden onChange={lerArquivo} />
      {erro && <p className="erro" role="alert">{erro}</p>}
      {backup && (
        <div className="alerta">
          <p>
            Restaurar o backup de <strong>{new Date(backup.exportadoEm).toLocaleDateString('pt-BR')}</strong> ({backup.dados.lancamentos?.length ?? 0} lançamentos)?
            Tudo que está no app agora será <strong>substituído</strong>.
          </p>
          <div className="linha-botoes">
            <button className="botao secundario" onClick={() => setBackup(null)}>Cancelar</button>
            <button className="botao perigo cheio" disabled={ocupado} onClick={confirmar}>Substituir tudo</button>
          </div>
        </div>
      )}
    </>
  )
}
