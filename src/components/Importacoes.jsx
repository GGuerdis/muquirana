// Ajustes → Dados e backup: as importações feitas, com "desfazer" (confirmação na própria tela)
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { dataCurta } from '../lib/datas.js'
import { listarImportacoes, desfazerImportacao } from '../lib/importacoes.js'

const MOSTRAR = 6
const quando = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'data desconhecida')

export default function Importacoes() {
  const { lancamentos, contas, cartoes, avisar, podeEditar } = useDados()
  const lista = useMemo(() => listarImportacoes(lancamentos, { contas, cartoes }), [lancamentos, contas, cartoes])
  const [confirmando, setConfirmando] = useState(null)
  const [todas, setTodas] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  async function desfazer(imp) {
    setOcupado(true)
    try {
      const n = await desfazerImportacao(imp.lote)
      avisar(`Importação desfeita: ${n} lançamento(s) de ${imp.destino} saíram.`)
      setConfirmando(null)
    } catch (e) {
      avisar(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!lista.length) return null
  const visiveis = todas ? lista : lista.slice(0, MOSTRAR)
  return (
    <section className="painel">
      <h3>Importações feitas</h3>
      <p className="dica">Importou o arquivo errado? Desfaça a importação: o que ela trouxe sai e o que ela mudou volta como era.</p>
      {visiveis.map((imp, i) => (
        <div key={imp.lote ?? `antiga-${i}`} className="linha-importacao">
          <div className="linha-importacao-textos">
            <strong>{imp.destino} · {imp.quantidade} lançamento(s)</strong>
            <small>importado em {quando(imp.quando)} · de {dataCurta(imp.de)} a {dataCurta(imp.ate)}{imp.convertidos ? ` · mudou ${imp.convertidos} de outra conta` : ''}</small>
            {!imp.podeDesfazer && <small>Feita antes desta versão: não dá para desfazer por aqui.</small>}
          </div>
          {imp.podeDesfazer && podeEditar && confirmando !== imp.lote && (
            <button className="link perigo" onClick={() => setConfirmando(imp.lote)}>Desfazer</button>
          )}
          {confirmando === imp.lote && (
            <div className="confirmar-desfazer" role="alert">
              <p>Tirar os {imp.quantidade} lançamento(s) desta importação de {imp.destino}? Não dá para voltar atrás (só importando o arquivo de novo).</p>
              <div className="linha-botoes">
                <button className="botao perigo" disabled={ocupado} onClick={() => desfazer(imp)}>{ocupado ? 'Desfazendo…' : 'Desfazer importação'}</button>
                <button className="botao secundario" disabled={ocupado} onClick={() => setConfirmando(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {lista.length > MOSTRAR && <button className="link" onClick={() => setTodas((v) => !v)}>{todas ? 'Mostrar menos' : `Ver todas (${lista.length})`}</button>}
    </section>
  )
}
