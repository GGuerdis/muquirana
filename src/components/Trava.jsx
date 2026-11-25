// Trava com a digital: a tela de bloqueio, o controle em Ajustes e o "trancar de novo" ao voltar para o app
import { useEffect, useRef, useState } from 'react'
import { travaLigada, aparelhoTemTrava, ligarTrava, desligarTrava, desbloquear, BLOQUEAR_DEPOIS_MS } from '../lib/trava.js'
import { IconeCadeado, Ic } from './Icones.jsx'

const MENSAGEM_ERRO = {
  NotAllowedError: 'Não confirmou. Toque em desbloquear para tentar de novo.',
  InvalidStateError: 'Esta digital já está cadastrada no app.',
  NotSupportedError: 'Este navegador não aceita a digital para apps da web.',
  SecurityError: 'A trava só funciona no endereço oficial do app (https).',
}
// mensagens do navegador vêm em inglês: mostra sempre um texto nosso
export const textoErro = (e) => MENSAGEM_ERRO[e?.name] || 'Não foi possível confirmar. Toque em Desbloquear para tentar de novo.'

// Trancado ao abrir (se a trava estiver ligada) e de novo depois de 1 minuto fora do app
export function useTrava() {
  const [trancado, setTrancado] = useState(() => travaLigada())
  const saiuEm = useRef(null)
  useEffect(() => {
    const mudou = () => {
      if (document.visibilityState === 'hidden') saiuEm.current = Date.now()
      else if (saiuEm.current && Date.now() - saiuEm.current > BLOQUEAR_DEPOIS_MS && travaLigada()) setTrancado(true)
    }
    document.addEventListener('visibilitychange', mudou)
    return () => document.removeEventListener('visibilitychange', mudou)
  }, [])
  return [trancado, () => setTrancado(false)]
}

export function TelaTrava({ aoDesbloquear }) {
  const [erro, setErro] = useState('')
  const [tentando, setTentando] = useState(false)
  const pedindo = useRef(false) // um pedido de cada vez (o celular recusa dois ao mesmo tempo)
  const tentar = async () => {
    if (pedindo.current) return
    pedindo.current = true
    setTentando(true)
    setErro('')
    try {
      await desbloquear()
      aoDesbloquear()
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      pedindo.current = false
      setTentando(false)
    }
  }
  // já pede a digital ao abrir (alguns celulares exigem o toque no botão: aí fica o botão)
  useEffect(() => { tentar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="tela-trava">
      <div className="tela-trava-sol" aria-hidden="true" />
      <h1 className="titulo-pagina">Mukirana</h1>
      <p>O app está trancado.</p>
      <button className="botao primario" onClick={tentar} disabled={tentando}><Ic i={IconeCadeado} /> {tentando ? 'Confirmando…' : 'Desbloquear'}</button>
      {erro && <p className="tela-trava-erro" role="alert">{erro}</p>}
      <p className="dica">Se a digital do celular mudou e não abre mais: nas configurações do navegador, apague os dados deste site e entre de novo na sua conta. O que está na nuvem volta; o que só estava neste aparelho se perde.</p>
    </main>
  )
}

// Ajustes → Segurança
export function SecaoTrava({ avisar }) {
  const [ligada, setLigada] = useState(() => travaLigada())
  const [disponivel, setDisponivel] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { aparelhoTemTrava().then(setDisponivel) }, [])

  const trocar = async () => {
    setOcupado(true)
    try {
      if (ligada) { await desligarTrava(); setLigada(false); avisar('Trava desligada neste aparelho.') }
      else { await ligarTrava(); setLigada(true); avisar('Trava ligada: o app vai pedir a digital ao abrir.') }
    } catch (e) {
      avisar(textoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="painel">
      <h3>Trava com a digital</h3>
      <p className="dica">Ao abrir o app (e ao voltar depois de 1 minuto fora), ele pede a digital, o rosto ou o PIN do celular. Vale só para este aparelho. Antes de ligar, faça um backup.</p>
      {disponivel === false && !ligada && <p className="dica">Este aparelho ou navegador não oferece digital para apps da web. Instale o app pela tela inicial do celular e tente de novo.</p>}
      <button className={`botao cheio ${ligada ? 'secundario' : 'primario'}`} onClick={trocar} disabled={ocupado || (disponivel === false && !ligada)}>
        <Ic i={IconeCadeado} /> {ocupado ? 'Confirmando…' : ligada ? 'Desligar a trava' : 'Ligar a trava'}
      </button>
    </section>
  )
}
