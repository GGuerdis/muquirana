// Conta, login e sincronização
import { useEffect, useRef, useState } from 'react'
import { useObservable } from 'dexie-react-hooks'
import Folha from './Folha.jsx'
import { db } from '../lib/db.js'
import { useDados } from '../dados.jsx'
import { dadosLocais, entrar, apagarAparelhoEEntrar, sair, sincronizarAgora, textoSincronizacao, traduzirAlerta, textosDaInteracao } from '../lib/nuvem.js'

export function useNuvem() {
  const usuario = useObservable(db.cloud.currentUser)
  const estado = useObservable(db.cloud.syncState)
  return { usuario, estado, logado: !!usuario?.isLoggedIn, status: textoSincronizacao(usuario, estado) }
}

// Janela do login (e-mail → código), mostrada quando o sistema de login pede algo
export function DialogoNuvem() {
  const ui = useObservable(db.cloud.userInteraction)
  const [valores, setValores] = useState({})
  const primeiro = useRef(null)
  useEffect(() => { setValores({}) }, [ui])
  if (!ui) return null
  const t = textosDaInteracao(ui)
  const campos = Object.entries(ui.fields || {})
  const enviar = (e) => {
    e?.preventDefault()
    const limpos = Object.fromEntries(campos.map(([nome]) => [nome, (valores[nome] || '').trim()]))
    ui.onSubmit(limpos)
  }
  return (
    <Folha titulo={t.titulo} aoFechar={() => ui.onCancel()} rodape={
      <div className="linha-botoes">
        {t.cancelar && <button className="botao secundario" onClick={() => ui.onCancel()}>{t.cancelar}</button>}
        <button className="botao primario cheio" onClick={enviar}>{t.enviar}</button>
      </div>
    }>
      <form onSubmit={enviar} className="bloco">
        {t.explicacao && <p className="dica">{t.explicacao}</p>}
        {ui.alerts?.map((a, i) => (
          <p key={i} className={a.type === 'error' ? 'erro' : 'dica'} role={a.type === 'error' ? 'alert' : undefined}>{traduzirAlerta(a)}</p>
        ))}
        {campos.map(([nome, campo], i) => (
          <label key={nome} className="campo">
            <span className="rotulo">{t.rotulos[nome] || campo.label || nome}</span>
            <input
              ref={i === 0 ? primeiro : undefined}
              autoFocus={i === 0}
              type={nome === 'email' ? 'email' : 'text'}
              inputMode={nome === 'email' ? 'email' : 'text'}
              autoComplete={nome === 'email' ? 'email' : nome === 'otp' ? 'one-time-code' : 'off'}
              autoCapitalize={nome === 'otp' ? 'characters' : 'off'}
              placeholder={nome === 'email' ? 'voce@exemplo.com' : campo.placeholder || ''}
              value={valores[nome] || ''}
              onChange={(e) => setValores((v) => ({ ...v, [nome]: e.target.value }))}
            />
          </label>
        ))}
        <button type="submit" hidden />
      </form>
    </Folha>
  )
}

// Antes de entrar: o que fazer com os dados que já estão neste aparelho?
function EscolhaDadosLocais({ locais, aoFechar }) {
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)
  return (
    <Folha titulo="Este aparelho já tem dados" aoFechar={aoFechar}>
      <p>
        Há <strong>{locais.lancamentos} lançamento(s)</strong>{locais.cartoes ? `, ${locais.cartoes} cartão(ões)` : ''}{locais.recorrentes ? ` e ${locais.recorrentes} conta(s) fixa(s)` : ''} neste aparelho que ainda não estão em nenhuma conta.
      </p>
      <button className="botao primario cheio" onClick={() => { aoFechar(); entrar() }}>Enviar para a minha conta</button>
      <p className="dica">Escolha esta se é a <strong>primeira vez</strong> que você entra, ou se esses dados ainda não estão na conta.</p>
      <button className={`botao ${confirmandoApagar ? 'perigo' : 'secundario'} cheio`} onClick={() => (confirmandoApagar ? apagarAparelhoEEntrar() : setConfirmandoApagar(true))}>
        {confirmandoApagar ? 'Confirmar: apagar deste aparelho' : 'Apagar deste aparelho e usar os da conta'}
      </button>
      <p className="dica">Escolha esta se a sua conta já tem esses dados (por exemplo, você já entrou pelo celular e este aparelho tem só uma cópia de backup). Assim nada fica duplicado.</p>
    </Folha>
  )
}

// Botão "Entrar" que pergunta antes, se houver dados locais
export function BotaoEntrar({ rotulo = 'Entrar na minha conta', classe = 'botao primario cheio' }) {
  const [locais, setLocais] = useState(null)
  async function clicar() {
    const l = await dadosLocais()
    if (l.tem) setLocais(l)
    else entrar()
  }
  return (
    <>
      <button className={classe} onClick={clicar}>{rotulo}</button>
      {locais && <EscolhaDadosLocais locais={locais} aoFechar={() => setLocais(null)} />}
    </>
  )
}

export function SeloSincronizacao() {
  const { status } = useNuvem()
  return <span className={`selo-sync selo-${status.tipo}`} title={status.texto}>{status.icone} <span>{status.texto}</span></span>
}

// Seção "Conta e sincronização" em Ajustes
export function PainelConta() {
  const { usuario, logado, status } = useNuvem()
  const { avisar } = useDados()
  const [saindo, setSaindo] = useState(false)
  const licenca = usuario?.license
  return (
    <section className="painel">
      <h3>Conta e sincronização</h3>
      <span className={`selo-sync selo-${status.tipo}`}>{status.icone} {status.texto}</span>
      {!logado && (
        <>
          <p className="dica">Entre com seu e-mail para usar o Muquirana em mais de um aparelho (celular e computador) com os dados sincronizados. Sem senha: você recebe um código por e-mail.</p>
          <BotaoEntrar />
        </>
      )}
      {logado && (
        <>
          <p className="discreto">Conectado como <strong>{usuario.email || usuario.name || usuario.userId}</strong></p>
          {licenca?.type === 'eval' && (
            <p className="dica">⏳ Conta em avaliação{licenca.evalDaysLeft != null ? `: ${licenca.evalDaysLeft} dia(s) restante(s)` : ''}. Depois disso a sincronização para até a conta ser liberada no painel do Dexie Cloud.</p>
          )}
          <div className="linha-botoes">
            <button className="botao secundario cheio" onClick={() => { sincronizarAgora(); avisar('Sincronizando…') }}>Sincronizar agora</button>
            <button className={`botao ${saindo ? 'perigo' : 'secundario'}`} onClick={async () => {
              if (!saindo) return setSaindo(true)
              setSaindo(false)
              await sair()
            }}>{saindo ? 'Confirmar saída' : 'Sair'}</button>
          </div>
          {saindo && <p className="dica">Ao sair, os dados da conta deixam de aparecer neste aparelho. Eles continuam na nuvem e voltam quando você entrar de novo.</p>}
        </>
      )}
    </section>
  )
}
