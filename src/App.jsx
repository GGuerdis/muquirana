import { useCallback, useMemo, useRef, useState } from 'react'
import { ProvedorDados, useDados } from './dados.jsx'
import NovoLancamento from './components/NovoLancamento.jsx'
import Inicio from './pages/Inicio.jsx'
import Lancamentos from './pages/Lancamentos.jsx'
import Cartoes from './pages/Cartoes.jsx'
import Ajustes from './pages/Ajustes.jsx'
import BoasVindas from './pages/BoasVindas.jsx'
import { mesAtual } from './lib/datas.js'

const ABAS = [
  { id: 'inicio', rotulo: 'Início', icone: '🏠' },
  { id: 'lancamentos', rotulo: 'Lançamentos', icone: '📋' },
  { id: 'novo' },
  { id: 'cartoes', rotulo: 'Cartões', icone: '💳' },
  { id: 'ajustes', rotulo: 'Ajustes', icone: '⚙️' },
]

export default function App() {
  const [lancAberto, setLancAberto] = useState(null) // null | 'novo' | lançamento
  const [aviso, setAviso] = useState(null)
  const timer = useRef(null)

  const avisar = useCallback((texto) => {
    clearTimeout(timer.current)
    setAviso({ texto, chave: Date.now() })
    timer.current = setTimeout(() => setAviso(null), 3500)
  }, [])
  const abrirLancamento = useCallback((l) => setLancAberto(l || 'novo'), [])
  const acoes = useMemo(() => ({ avisar, abrirLancamento }), [avisar, abrirLancamento])

  return (
    <ProvedorDados acoes={acoes}>
      <Telas />
      {lancAberto && <NovoLancamento original={lancAberto === 'novo' ? null : lancAberto} aoFechar={() => setLancAberto(null)} />}
      {aviso && <div className="aviso" key={aviso.chave} role="status" onClick={() => setAviso(null)}>{aviso.texto}</div>}
    </ProvedorDados>
  )
}

function Telas() {
  const { config, abrirLancamento } = useDados()
  const [aba, setAba] = useState('inicio')
  const [mes, setMes] = useState(mesAtual())

  if (!config.boasVindas) return <BoasVindas />

  const irPara = (id) => { setAba(id); window.scrollTo(0, 0) }

  return (
    <>
      <main>
        {aba === 'inicio' && <Inicio mes={mes} setMes={setMes} irPara={irPara} />}
        {aba === 'lancamentos' && <Lancamentos mes={mes} setMes={setMes} />}
        {aba === 'cartoes' && <Cartoes />}
        {aba === 'ajustes' && <Ajustes />}
      </main>
      <nav className="barra-nav">
        {ABAS.map((a) =>
          a.id === 'novo' ? (
            <button key="novo" className="botao-novo" onClick={() => abrirLancamento()} aria-label="Novo lançamento">+</button>
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
