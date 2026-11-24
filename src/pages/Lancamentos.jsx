import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, SeletorMes, ItemLancamento, Bloco } from '../components/Pecas.jsx'
import { Chips } from '../components/Campos.jsx'
import { IconeEtiqueta, IconeImportar } from '../components/Icones.jsx'
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

export default function Lancamentos({ mes, setMes, irPara }) {
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

  const totais = useMemo(() => dias.flatMap(([, itens]) => itens).reduce((t, l) => ({ entrou: t.entrou + (l.tipo === 'receita' ? l.valor : 0), saiu: t.saiu + (l.tipo === 'despesa' ? l.valor : 0), nEntrou: t.nEntrou + (l.tipo === 'receita' ? 1 : 0), nSaiu: t.nSaiu + (l.tipo === 'despesa' ? 1 : 0), n: t.n + 1 }), { entrou: 0, saiu: 0, nEntrou: 0, nSaiu: 0, n: 0 }), [dias])
  const totalDia = (itens) => itens.reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : l.tipo === 'despesa' ? -l.valor : 0), 0)

  return (
    <div className="pagina">
      <CabecaPagina titulo="Lançamentos" irPara={irPara} acoes={<>
        <button className="botao-acao" onClick={() => setCategorizando(true)}><IconeEtiqueta /> Categorizar</button>
        <button className="botao-acao" onClick={() => setImportando(true)}><IconeImportar /> Importar</button>
      </>} />
      <SeletorMes mes={mes} aoMudar={setMes} />
      {totais.n > 0 && (
        <div className="blocos">
          <Bloco rotulo="Entrou" valor={formatar(totais.entrou)} tom="entrada" extra={`${totais.nEntrou} ${totais.nEntrou === 1 ? 'entrada' : 'entradas'}`} />
          <Bloco rotulo="Saiu" valor={formatar(totais.saiu)} tom="saida" extra={`${totais.nSaiu} ${totais.nSaiu === 1 ? 'saída' : 'saídas'}`} />
        </div>
      )}
      <input className="busca" type="search" placeholder="Buscar por descrição ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <Chips rolavel opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} />

      {dias.length === 0 && <div className="painel vazio-grande"><p>🪙</p><p>{busca ? 'Nada encontrado com essa busca.' : 'Nenhum lançamento neste mês.'}</p></div>}
      {dias.map(([data, itens]) => {
        const t = totalDia(itens)
        return (
          <section key={data} className="dia-grupo">
            <div className="dia-topo">
              <span>{rotuloDia(data)}</span>
              {t !== 0 && <span className={t > 0 ? 'entrada' : ''}>{t > 0 ? '+' : '−'} {formatar(Math.abs(t))}</span>}
            </div>
            <div className="painel dia">
              {itens.map((l) => <ItemLancamento key={l.id} l={l} />)}
            </div>
          </section>
        )
      })}
      {importando && <ImportarExtrato aoFechar={() => setImportando(false)} aoImportar={() => setCategorizando(true)} />}
      {categorizando && <CategorizarRapido aoFechar={() => setCategorizando(false)} />}
    </div>
  )
}
