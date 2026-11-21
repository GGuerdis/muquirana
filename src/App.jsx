import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProvedorDados, useDados } from './dados.jsx'
import NovoLancamento from './components/NovoLancamento.jsx'
import Inicio from './pages/Inicio.jsx'
import Lancamentos from './pages/Lancamentos.jsx'
import Cartoes from './pages/Cartoes.jsx'
import Ajustes from './pages/Ajustes.jsx'
import Historico from './pages/Historico.jsx'
import BoasVindas from './pages/BoasVindas.jsx'
import AvisoNavegador from './components/AvisoNavegador.jsx'
import AvisoRecusa from './components/AvisoRecusa.jsx'
import AvisoVersao, { useVersaoNova } from './components/AvisoVersao.jsx'
import { mesAtual } from './lib/datas.js'
import { DialogoNuvem, useNuvem } from './components/Nuvem.jsx'
import { salvarConfig } from './lib/db.js'
import { juntarRepetidos } from './lib/repetidos.js'
import { IconeInicio, IconeLista, IconeGrafico, IconeCartao } from './components/Icones.jsx'

const ABAS = [
  { id: 'inicio', rotulo: 'Início', icone: <IconeInicio /> },
  { id: 'lancamentos', rotulo: 'Lançamentos', icone: <IconeLista /> },
  { id: 'novo' },
  { id: 'historico', rotulo: 'Histórico', icone: <IconeGrafico /> },
  { id: 'cartoes', rotulo: 'Cartões', icone: <IconeCartao /> },
]

export default function App({ migrou = null }) {
  const [lancAberto, setLancAberto] = useState(null) // null | 'novo' | lançamento | { modelo }
  const [aviso, setAviso] = useState(null)
  const timer = useRef(null)

  const avisar = useCallback((texto) => {
    clearTimeout(timer.current)
    setAviso({ texto, chave: Date.now() })
    timer.current = setTimeout(() => setAviso(null), Math.max(3500, texto.length * 70)) // texto longo fica mais tempo
  }, [])
  const abrirLancamento = useCallback((l) => setLancAberto(l || 'novo'), [])
  const abrirModelo = useCallback((modelo) => setLancAberto({ modelo }), [])
  const acoes = useMemo(() => ({ avisar, abrirLancamento, abrirModelo }), [avisar, abrirLancamento, abrirModelo])
  useEffect(() => {
    if (migrou?.lancamentos) avisar(`Atualização concluída: seus ${migrou.lancamentos} lançamento(s) foram trazidos para a versão nova.`)
  }, [migrou, avisar])

  return (
    <ProvedorDados acoes={acoes}>
      <Telas />
      {lancAberto && (
        <NovoLancamento
          key={lancAberto === 'novo' ? 'novo' : lancAberto.modelo ? `m-${lancAberto.modelo.recorrenteId}-${lancAberto.modelo.competencia}` : `l-${lancAberto.id}`}
          original={lancAberto === 'novo' || lancAberto.modelo ? null : lancAberto}
          modelo={lancAberto.modelo || null}
          aoFechar={() => setLancAberto(null)}
        />
      )}
      <DialogoNuvem />
      {aviso && <div className="aviso" key={aviso.chave} role="status" onClick={() => setAviso(null)}>{aviso.texto}</div>}
    </ProvedorDados>
  )
}

// Fundo Synthwave: estrelas (à noite), sol listrado e chão quadriculado (completo só no Início)
function Cenario({ completo = false }) {
  return (
    <>
      <div className={`cenario ${completo ? 'completo' : ''}`} aria-hidden="true">
        <div className="estrelas" />
        <div className="chao" />
      </div>
      {/* o sol fica preso ao topo da página (rola junto), para não brilhar atrás dos cartões lá embaixo */}
      {completo && <div className="sol" aria-hidden="true" />}
    </>
  )
}

function Telas() {
  const dados = useDados()
  const { config, contas, abrirLancamento, podeEditar, avisar, espacoAtual } = dados
  const { logado, estado } = useNuvem()
  const versaoNova = useVersaoNova()
  // Logo depois de entrar na conta (3 minutos), a cada sincronização: apaga contas/cartões/categorias repetidos
  // que nunca foram usados (acontece quando o aparelho já tinha os dados iniciais e a conta também).
  // Só nessa janela, para nunca mexer numa conta que a pessoa criou de propósito depois.
  const entrouEm = useRef(null)
  const limpando = useRef(false)
  const estavaLogado = useRef(logado)
  useEffect(() => {
    if (logado && !estavaLogado.current) entrouEm.current = Date.now()
    estavaLogado.current = logado
  }, [logado])
  useEffect(() => {
    if (!entrouEm.current || Date.now() - entrouEm.current > 3 * 60 * 1000) return
    if (limpando.current || !logado || estado?.phase !== 'in-sync' || espacoAtual || !podeEditar) return
    limpando.current = true
    juntarRepetidos(dados)
      .then((n) => { if (n) avisar(`Juntei ${n} conta(s)/categoria(s) repetida(s) que vieram ao entrar na conta.`) })
      .catch((e) => console.error('Falha ao juntar repetidos', e))
      .finally(() => { limpando.current = false })
  }, [logado, estado?.phase, espacoAtual, podeEditar, dados, avisar])
  // Entrou numa conta que já tem dados (ex.: celular novo): pula as boas-vindas
  useEffect(() => {
    if (!config.boasVindas && logado && contas.length > 0) salvarConfig('boasVindas', true)
  }, [config.boasVindas, logado, contas.length])
  const [aba, setAba] = useState(() => (import.meta.env.DEV && new URLSearchParams(location.search).get('aba')) || 'inicio')
  const [mes, setMes] = useState(mesAtual())

  if (!config.boasVindas) return <><Cenario completo /><BoasVindas /></>

  const irPara = (id) => { setAba(id); window.scrollTo(0, 0) }

  return (
    <>
      <Cenario completo={aba === 'inicio'} />
      <main>
        <AvisoNavegador />
        <AvisoVersao nova={versaoNova} />
        <AvisoRecusa />
        {aba === 'inicio' && <Inicio mes={mes} setMes={setMes} irPara={irPara} />}
        {aba === 'lancamentos' && <Lancamentos mes={mes} setMes={setMes} irPara={irPara} />}
        {aba === 'historico' && <Historico irPara={irPara} />}
        {aba === 'cartoes' && <Cartoes irPara={irPara} />}
        {aba === 'ajustes' && <Ajustes irPara={irPara} />}
      </main>
      <nav className="barra-nav">
        {ABAS.map((a) =>
          a.id === 'novo' ? (
            <button key="novo" className="botao-novo" onClick={() => (podeEditar ? abrirLancamento() : avisar('Neste espaço você só pode ver: peça a quem criou para liberar a edição.'))} aria-label="Novo lançamento">+</button>
          ) : (
            <button key={a.id} className={`nav-item ${aba === a.id ? 'ativo' : ''}`} onClick={() => irPara(a.id)} aria-current={aba === a.id ? 'page' : undefined}>
              <span className="nav-icone">{a.icone}</span>
              <span>{a.rotulo}</span>
            </button>
          ),
        )}
      </nav>
    </>
  )
}
