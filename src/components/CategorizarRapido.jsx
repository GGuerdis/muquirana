// Categorizar rápido: as lojas/pessoas que mais aparecem, para escolher a categoria uma vez só.
// O app aplica em todos os lançamentos daquele grupo e aprende para as próximas importações.
import { useMemo, useState } from 'react'
import Folha from './Folha.jsx'
import SeletorCategoria from './SeletorCategoria.jsx'
import { useDados } from '../dados.jsx'
import { formatar } from '../lib/dinheiro.js'
import { gruposParaCategorizar, categorizarGrupo } from '../lib/categorizar.js'

const POR_PAGINA = 15

export default function CategorizarRapido({ aoFechar }) {
  const { lancamentos, categorias, categoriaPorId, avisar, podeEditar } = useDados()
  const [soOutros, setSoOutros] = useState(true)
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(POR_PAGINA)
  const [ocupado, setOcupado] = useState(null) // chave do grupo sendo salvo
  const grupos = useMemo(() => gruposParaCategorizar(lancamentos, categorias, { soOutros, busca }), [lancamentos, categorias, soOutros, busca])
  const totalOutros = useMemo(() => gruposParaCategorizar(lancamentos, categorias, { soOutros: true }).reduce((s, g) => s + g.n, 0), [lancamentos, categorias])

  async function escolher(g, categoriaId) {
    if (!categoriaId) return
    if (!podeEditar) return avisar('Neste espaço você só pode ver: peça a quem criou para liberar a edição.')
    setOcupado(`${g.tipo}:${g.chave}`)
    try {
      const n = await categorizarGrupo(g, categoriaId)
      avisar(`${n} lançamento(s) de "${g.exemplo}" agora em ${categoriaPorId.get(categoriaId)?.nome ?? 'nova categoria'}. Vou lembrar nas próximas importações.`)
    } catch (e) {
      avisar(e.message || 'Não foi possível mudar a categoria.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Folha titulo="Categorizar rápido" aoFechar={aoFechar} rodape={<button className="botao primario cheio" onClick={aoFechar}>Pronto</button>}>
      <p className="dica">Cada linha junta todos os lançamentos da mesma loja ou pessoa. Escolha a categoria uma vez: vale para todos e para as próximas importações.</p>
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={soOutros} className={`aba ${soOutros ? 'ativa' : ''}`} onClick={() => { setSoOutros(true); setLimite(POR_PAGINA) }}>Sem categoria ({totalOutros})</button>
        <button role="tab" aria-selected={!soOutros} className={`aba ${!soOutros ? 'ativa' : ''}`} onClick={() => { setSoOutros(false); setLimite(POR_PAGINA) }}>Todas as lojas</button>
      </div>
      <input className="busca" type="search" value={busca} placeholder="🔍 Buscar loja ou pessoa" aria-label="Buscar loja ou pessoa" onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA) }} />

      {grupos.length === 0 && <p className="vazio">{soOutros && !busca ? 'Tudo categorizado! 🎉' : 'Nada encontrado.'}</p>}
      <div className="lista-categorizar">
        {grupos.slice(0, limite).map((g) => {
          const k = `${g.tipo}:${g.chave}`
          const atual = categoriaPorId.get(g.categoriaId)
          return (
            <div key={k} className="item-categorizar">
              <div className="item-imp-topo">
                <span className="item-imp-desc">{g.exemplo}</span>
                <strong className={g.tipo === 'receita' ? 'entrada' : 'saida'}>{formatar(g.total)}</strong>
              </div>
              <span className="discreto">{g.n} {g.n === 1 ? 'vez' : 'vezes'} · {g.tipo === 'receita' ? 'entrada' : 'saída'} · hoje em {atual ? `${atual.emoji} ${atual.nome}` : 'sem categoria'}</span>
              {ocupado === k ? <span className="discreto">Salvando…</span> : (
                <SeletorCategoria tipo={g.tipo} valor={null} rotulo={`Categoria de ${g.exemplo}`} opcaoVazia="Escolha a categoria…" aoMudar={(id) => escolher(g, id)} />
              )}
            </div>
          )
        })}
        {grupos.length > limite && <button className="botao secundario cheio" onClick={() => setLimite((l) => l + POR_PAGINA)}>Mostrar mais ({grupos.length - limite})</button>}
      </div>
    </Folha>
  )
}
