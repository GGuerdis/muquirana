import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { SeletorMes, ItemLancamento } from '../components/Pecas.jsx'
import { Chips } from '../components/Campos.jsx'
import ImportarExtrato from '../components/ImportarExtrato.jsx'
import CategorizarRapido from '../components/CategorizarRapido.jsx'
import { formatar } from '../lib/dinheiro.js'
import { mesDe, rotuloDia } from '../lib/datas.js'
import { compararIds } from '../lib/ids.js'

const FILTROS = [
  { valor: 'todos', rotulo: 'Tudo' },
  { valor: 'despesa', rotulo: 'Despesas' },
  { valor: 'receita', rotulo: 'Receitas' },
  { valor: 'outros', rotulo: 'Transferências' },
]

const normalizar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Lancamentos({ mes, setMes }) {
  const { lancamentos, categoriaPorId } = useDados()
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [importando, setImportando] = useState(false)
  const [categorizando, setCategorizando] = useState(false)

  const dias = useMemo(() => {
    const termo = normalizar(busca)
    const lista = lancamentos
      .filter((l) => mesDe(l.data) === mes)
      .filter((l) => filtro === 'todos' || (filtro === 'outros' ? ['transferencia', 'pagamentoFatura'].includes(l.tipo) : l.tipo === filtro))
      .filter((l) => !termo || normalizar(`${l.descricao || ""} ${categoriaPorId.get(l.categoriaId)?.nome || ""}`).includes(termo))
      .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0) || compararIds(b.id, a.id))
    const grupos = new Map()
    for (const l of lista) {
      if (!grupos.has(l.data)) grupos.set(l.data, [])
      grupos.get(l.data).push(l)
    }
    return [...grupos.entries()]
  }, [lancamentos, mes, filtro, busca, categoriaPorId])

  const totalDia = (itens) => itens.reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : l.tipo === 'despesa' ? -l.valor : 0), 0)

  return (
    <div className="pagina">
      <div className="painel-titulo">
        <h1 className="titulo-pagina">Lançamentos</h1>
        <span className="acoes-titulo">
          <button className="link" onClick={() => setCategorizando(true)}>🏷️ Categorizar</button>
          <button className="link" onClick={() => setImportando(true)}>⬇ Importar</button>
        </span>
      </div>
      <SeletorMes mes={mes} aoMudar={setMes} />
      <input className="busca" type="search" placeholder="🔍 Buscar por descrição ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <Chips rolavel opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} />

      {dias.length === 0 && <p className="vazio">Nada por aqui neste mês.</p>}
      {dias.map(([data, itens]) => {
        const t = totalDia(itens)
        return (
          <section key={data} className="painel dia">
            <div className="dia-topo">
              <span>{rotuloDia(data)}</span>
              {t !== 0 && <span className={t > 0 ? 'entrada' : 'saida'}>{t > 0 ? '+' : '−'} {formatar(Math.abs(t))}</span>}
            </div>
            {itens.map((l) => <ItemLancamento key={l.id} l={l} />)}
          </section>
        )
      })}
      {importando && <ImportarExtrato aoFechar={() => setImportando(false)} aoImportar={() => setCategorizando(true)} />}
      {categorizando && <CategorizarRapido aoFechar={() => setCategorizando(false)} />}
    </div>
  )
}
