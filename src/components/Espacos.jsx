// Espaços compartilhados: trocar de espaço, convites, membros
import { useState } from 'react'
import { useObservable } from 'dexie-react-hooks'
import Folha from './Folha.jsx'
import { Campo, Chips } from './Campos.jsx'
import { useDados } from '../dados.jsx'
import { db } from '../lib/db.js'
import { abrirEspaco, criarEspaco, convidar, removerMembro, mudarPapel, excluirEspaco, sairDoEspaco, renomearEspaco, PAPEIS, papelDe } from '../lib/espacos.js'
import { BotaoEntrar } from './Nuvem.jsx'
import { IconePessoa, IconeInicio, IconeEnvelope, Ic } from './Icones.jsx'

const nomeDoEspaco = (e) => (e ? e.name : 'Pessoal')

// Botão no topo do Início: mostra o espaço aberto e troca
export function SeletorEspaco() {
  const { espacos, espaco, usuario } = useDados()
  const [aberto, setAberto] = useState(false)
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const logado = !!usuario?.isLoggedIn
  if (!logado && !espacos.length) return null

  async function criar() {
    setErro('')
    try {
      await criarEspaco(nome)
      setCriando(false); setAberto(false); setNome('')
    } catch (e) { setErro(e.message) }
  }

  return (
    <>
      <button className="seletor-espaco" onClick={() => setAberto(true)}>{nomeDoEspaco(espaco)} ▾</button>
      {aberto && (
        <Folha titulo="Espaços" aoFechar={() => { setAberto(false); setCriando(false) }}>
          <p className="dica">Cada espaço tem as próprias contas, cartões, categorias e lançamentos. O Pessoal é só seu; os outros você divide com quem convidar.</p>
          <div className="lista-espacos">
            <button className={`linha-ajuste ${!espaco ? 'ativa' : ''}`} onClick={async () => { await abrirEspaco(null); setAberto(false) }}>
              <span className="com-marca"><Ic i={IconePessoa} />Pessoal</span><span className="discreto">{!espaco ? 'aberto' : ''}</span>
            </button>
            {espacos.map((e) => (
              <button key={e.realmId} className={`linha-ajuste ${espaco?.realmId === e.realmId ? 'ativa' : ''}`} onClick={async () => { await abrirEspaco(e.realmId); setAberto(false) }}>
                <span className="com-marca"><Ic i={IconeInicio} /><span>{e.name}<small> · {e.souDono ? 'criado por você' : 'compartilhado com você'} · {e.membros.length + 1} pessoa(s)</small></span></span>
                <span className="discreto">{espaco?.realmId === e.realmId ? 'aberto' : ''}</span>
              </button>
            ))}
          </div>
          {!logado && <><p className="dica">Entre na sua conta para criar espaços compartilhados.</p><BotaoEntrar /></>}
          {logado && !criando && <button className="botao secundario cheio" onClick={() => setCriando(true)}>+ Criar espaço compartilhado</button>}
          {logado && criando && (
            <div className="bloco">
              <Campo rotulo="Nome do espaço"><input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Casa, Viagem 2027" maxLength={40} /></Campo>
              <p className="dica">O espaço já vem com as categorias e uma conta "Conta da casa". Depois é só convidar as pessoas em Ajustes.</p>
              {erro && <p className="erro">{erro}</p>}
              <button className="botao primario cheio" onClick={criar}>Criar e abrir</button>
            </div>
          )}
        </Folha>
      )}
    </>
  )
}

// Convites recebidos (aparece no Início)
export function ConvitesRecebidos() {
  const convites = useObservable(db.cloud.invites) || []
  const { avisar } = useDados()
  const pendentes = convites.filter((c) => !c.accepted && !c.rejected)
  if (!pendentes.length) return null
  return (
    <section className="painel convite">
      <h3 className="com-marca"><Ic i={IconeEnvelope} />Convite para espaço compartilhado</h3>
      {pendentes.map((c) => (
        <div key={c.id} className="bloco">
          <p><strong>{c.invitedBy?.name || c.invitedBy?.email || 'Alguém'}</strong> te convidou para o espaço <strong>{c.realm?.name || 'compartilhado'}</strong> ({PAPEIS[papelDe(c)]}).</p>
          <div className="linha-botoes">
            <button className="botao secundario" onClick={async () => { await c.reject(); avisar('Convite recusado.') }}>Recusar</button>
            <button className="botao primario cheio" onClick={async () => { await c.accept(); avisar('Convite aceito! Troque de espaço no topo do Início.') }}>Aceitar</button>
          </div>
        </div>
      ))}
    </section>
  )
}

// Seção em Ajustes: pessoas do espaço aberto
export function PainelEspaco() {
  const { espaco, usuario, avisar } = useDados()
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState('editor')
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(null)
  const [nome, setNome] = useState(null)
  if (!espaco) return null
  const dono = espaco.souDono

  async function enviarConvite() {
    setErro('')
    try {
      await convidar(espaco.realmId, { email, papel })
      setEmail('')
      avisar('Convite enviado. A pessoa recebe um e-mail e aceita ao entrar no Mukirana.')
    } catch (e) { setErro(e.message) }
  }
  async function confirmar(acao, fn) {
    if (confirmando !== acao) return setConfirmando(acao)
    setConfirmando(null)
    try { await fn() } catch (e) { setErro(e.message) }
  }

  return (
    <section className="painel">
      <div className="painel-titulo">
        <h3>Espaço "{espaco.name}"</h3>
        {dono && nome === null && <button className="link" onClick={() => setNome(espaco.name)}>Renomear</button>}
      </div>
      {nome !== null && (
        <div className="linha-botoes">
          <input className="seletor" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} />
          <button className="botao primario" onClick={async () => { await renomearEspaco(espaco.realmId, nome); setNome(null) }}>Salvar</button>
        </div>
      )}
      <p className="dica">{dono ? 'Você criou este espaço.' : 'Este espaço foi compartilhado com você.'} Quem participa vê e mexe (conforme a permissão) em tudo deste espaço. O seu espaço Pessoal continua só seu.</p>

      <span className="rotulo">Pessoas</span>
      <div className="linha-pagamento"><span className="com-marca"><Ic i={IconePessoa} />{dono ? `${usuario?.email || 'Você'} (você)` : 'Quem criou'}</span><span className="discreto">dono</span></div>
      {espaco.membros.map((m) => (
        <div key={m.id} className="linha-pagamento">
          <span className="quebra"><Ic i={IconePessoa} /> {m.name && m.name !== m.email ? `${m.name} · ` : ''}{m.email}{m.accepted ? '' : m.rejected ? ' · recusou' : ' · convite pendente'}</span>
          {dono ? (
            <span className="fixa-botoes">
              <select className="seletor mini" value={papelDe(m)} onChange={(e) => mudarPapel(m.id, e.target.value)} aria-label="Permissão">
                {Object.entries(PAPEIS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
              <button className={confirmando === m.id ? 'link perigo' : 'link'} onClick={() => confirmar(m.id, () => removerMembro(m.id))}>{confirmando === m.id ? 'Confirmar?' : 'Remover'}</button>
            </span>
          ) : <span className="discreto">{PAPEIS[papelDe(m)]}</span>}
        </div>
      ))}

      {dono && (
        <div className="bloco">
          <span className="rotulo">Convidar alguém</span>
          <input className="seletor" type="email" inputMode="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Chips valor={papel} aoMudar={setPapel} opcoes={Object.entries(PAPEIS).map(([v, r]) => ({ valor: v, rotulo: r }))} />
          {erro && <p className="erro">{erro}</p>}
          <button className="botao primario cheio" onClick={enviarConvite}>Enviar convite</button>
          <p className="dica">No plano grátis, até 3 pessoas usam a sincronização sem limite de tempo.</p>
        </div>
      )}
      {!dono && erro && <p className="erro">{erro}</p>}

      {dono ? (
        <button className={`botao ${confirmando === 'excluir' ? 'perigo' : 'secundario'} cheio`} onClick={() => confirmar('excluir', async () => { await excluirEspaco(espaco.realmId); avisar('Espaço excluído.') })}>
          {confirmando === 'excluir' ? 'Confirmar: apagar o espaço e tudo dele, para todos' : 'Excluir este espaço'}
        </button>
      ) : (
        <button className={`botao ${confirmando === 'sair' ? 'perigo' : 'secundario'} cheio`} onClick={() => confirmar('sair', async () => { await sairDoEspaco(espaco.realmId, usuario?.email); avisar('Você saiu do espaço.') })}>
          {confirmando === 'sair' ? 'Confirmar saída' : 'Sair deste espaço'}
        </button>
      )}
    </section>
  )
}
