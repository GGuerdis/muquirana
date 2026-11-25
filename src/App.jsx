import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProvedorDados, useDados } from './dados.jsx'
import NovoLancamento from './components/NovoLancamento.jsx'
import Inicio from './pages/Inicio.jsx'
import Lancamentos from './pages/Lancamentos.jsx'
import Cartoes from './pages/Cartoes.jsx'
import Ajustes from './pages/Ajustes.jsx'
import Historico from './pages/Historico.jsx'
import Previsao from './pages/Previsao.jsx'
import Assinaturas from './pages/Assinaturas.jsx'
import Relatorios from './pages/Relatorios.jsx'
import Metas from './pages/Metas.jsx'
import Patrimonio from './pages/Patrimonio.jsx'
import Renda from './pages/Renda.jsx'
import BoasVindas from './pages/BoasVindas.jsx'
import AvisoNavegador from './components/AvisoNavegador.jsx'
import AvisoRecusa from './components/AvisoRecusa.jsx'
import AvisoVersao, { useVersaoNova } from './components/AvisoVersao.jsx'
import { mesAtual } from './lib/datas.js'
import { DialogoNuvem, useNuvem } from './components/Nuvem.jsx'
import { salvarConfig } from './lib/db.js'
import { juntarRepetidos } from './lib/repetidos.js'
import MenuSol from './components/MenuSol.jsx'
import { TelaTrava, useTrava } from './components/Trava.jsx'
import { useArrastoTelas } from './components/useArrastoTelas.js'
import { ladoDaEntrada } from './lib/gesto.js'
import { telaExiste } from './lib/telas.js'

export default function App({ migrou = null }) {
  const [lancAberto, setLancAberto] = useState(null) // null | 'novo' | lançamento | { modelo }
  const [trancado, destrancar] = useTrava()
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
      {trancado ? <><Cenario /><TelaTrava aoDesbloquear={destrancar} /></> : <Telas />}
      {lancAberto && !trancado && (
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

// Fundo: só o degradê do céu, parado. O sol fica no cartão do saldo.
function Cenario() {
  return <div className="cenario" aria-hidden="true" />
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
  const [aba, setAba] = useState(() => { const pedida = import.meta.env.DEV && new URLSearchParams(location.search).get('aba'); return pedida && telaExiste(pedida) ? pedida : 'inicio' })
  const [mes, setMes] = useState(mesAtual())
  // De que lado a tela nova entra (anima a troca); arrastar o dedo para o lado também troca de tela
  const [entrada, setEntrada] = useState({ lado: 0, deslizou: false })
  // Filtro pedido ao abrir Lançamentos (ex.: tocou no bloco "Saiu" ou numa conta no Início)
  const [filtroLanc, setFiltroLanc] = useState(null)
  const mainRef = useRef(null)
  const irPara = (id, extra = {}) => {
    setEntrada({ lado: ladoDaEntrada(aba, id), deslizou: !!extra.deslizou })
    setFiltroLanc(extra.filtro || null)
    setAba(id)
    window.scrollTo(0, 0)
  }
  useArrastoTelas({ aba, irPara, alvoRef: mainRef, ativo: !!config.boasVindas })
  const novoLancamento = () => (podeEditar ? abrirLancamento() : avisar('Neste espaço você só pode ver: peça a quem criou para liberar a edição.'))

  if (!config.boasVindas) return <><Cenario /><BoasVindas /></>

  return (
    <>
      <Cenario />
      <main ref={mainRef}>
        <AvisoNavegador />
        <AvisoVersao nova={versaoNova} />
        <AvisoRecusa />
        <div key={aba} className={[entrada.lado > 0 ? 'entra-direita' : entrada.lado < 0 ? 'entra-esquerda' : '', entrada.lado && entrada.deslizou ? 'apos-gesto' : ''].join(' ').trim() || undefined}>
          {aba === 'inicio' && <Inicio mes={mes} setMes={setMes} irPara={irPara} />}
          {aba === 'lancamentos' && <Lancamentos mes={mes} setMes={setMes} irPara={irPara} filtroInicial={filtroLanc} />}
          {aba === 'historico' && <Historico irPara={irPara} />}
          {aba === 'cartoes' && <Cartoes irPara={irPara} />}
          {aba === 'renda' && <Renda irPara={irPara} />}
          {aba === 'previsao' && <Previsao irPara={irPara} />}
          {aba === 'assinaturas' && <Assinaturas irPara={irPara} />}
          {aba === 'relatorios' && <Relatorios irPara={irPara} />}
          {aba === 'metas' && <Metas irPara={irPara} />}
          {aba === 'patrimonio' && <Patrimonio irPara={irPara} />}
          {aba === 'ajustes' && <Ajustes irPara={irPara} />}
        </div>
      </main>
      <MenuSol aba={aba} irPara={irPara} novoLancamento={novoLancamento} />
    </>
  )
}
