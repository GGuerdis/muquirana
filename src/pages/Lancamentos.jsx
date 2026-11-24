import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, SeletorMes, ItemLancamento, Bloco, MarcaConta } from '../components/Pecas.jsx'
import { Chips } from '../components/Campos.jsx'
import { IconeEtiqueta, IconeImportar, IconeMoeda } from '../components/Icones.jsx'
import ImportarExtrato from '../components/ImportarExtrato.jsx'
import CategorizarRapido from '../components/CategorizarRapido.jsx'
import { formatar } from '../lib/dinheiro.js'
import { mesDe, rotuloDia } from '../lib/datas.js'
import { compararIds } from '../lib/ids.js'
import { totalDoDiaVisivel } from '../lib/lancamentos.js'

const FILTROS = [
  { valor: 'todos', rotulo: 'Tudo' },
  { valor: 'despesa', rotulo: 'Despesas' },
  { valor: 'receita', rotulo: 'Receitas' },
  { valor: 'outros', rotulo: 'Transferências' },
]

const normalizar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Lancamentos({ mes, setMes, irPara, filtroInicial }) {
  const { lancamentos, categoriaPorId, contaPorId } = useDados()
  const [filtro, setFiltro] = useState(filtroInicial?.tipo || 'todos')
  // Só uma conta (veio de um toque no bloco da conta no Início)
  const [contaFiltro, setContaFiltro] = useState(filtroInicial?.contaId ?? null)
  const contaDoFiltro = contaFiltro != null ? contaPorId.get(contaFiltro) : null
  const [busca, setBusca] = useState('')
  const [importando, setImportando] = useState(false)
  const [categorizando, setCategorizando] = useState(false)

  // Lançamentos do mês (e da conta/busca, se houver). Os blocos de Entrou/Saiu somam isso,
  // sem o filtro de tipo: com "Despesas" ligado, o "Entrou" continua mostrando o mês de verdade.
  const doMes = useMemo(() => {
    const termo = normalizar(busca)
    return lancamentos
      .filter((l) => mesDe(l.data) === mes)
      .filter((l) => contaFiltro == null || l.contaId === contaFiltro || l.contaDestinoId === contaFiltro)
      .filter((l) => !termo || normalizar(`${l.descricao || ''} ${categoriaPorId.get(l.categoriaId)?.nome || ''}`).includes(termo))
  }, [lancamentos, mes, busca, categoriaPorId, contaFiltro])

  const dias = useMemo(() => {
    const lista = doMes
      .filter((l) => filtro === 'todos' || (filtro === 'outros' ? ['transferencia', 'pagamentoFatura'].includes(l.tipo) : l.tipo === filtro))
      .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0) || compararIds(b.id, a.id))
    const grupos = new Map()
    for (const l of lista) {
      if (!grupos.has(l.data)) grupos.set(l.data, [])
      grupos.get(l.data).push(l)
    }
    return [...grupos.entries()]
  }, [doMes, filtro])

  const totais = useMemo(() => doMes.reduce((t, l) => ({ entrou: t.entrou + (l.tipo === 'receita' ? l.valor : 0), saiu: t.saiu + (l.tipo === 'despesa' ? l.valor : 0), nEntrou: t.nEntrou + (l.tipo === 'receita' ? 1 : 0), nSaiu: t.nSaiu + (l.tipo === 'despesa' ? 1 : 0), n: t.n + 1 }), { entrou: 0, saiu: 0, nEntrou: 0, nSaiu: 0, n: 0 }), [doMes])

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
      {contaDoFiltro && (
        <button className="filtro-ativo" onClick={() => setContaFiltro(null)} aria-label={`Tirar filtro da conta ${contaDoFiltro.nome}`}>
          Só <MarcaConta conta={contaDoFiltro} /> {contaDoFiltro.nome} <span aria-hidden="true">✕</span>
        </button>
      )}

      {dias.length === 0 && <div className="painel vazio-grande"><p className="vazio-icone"><IconeMoeda /></p><p>{busca ? 'Nada encontrado com essa busca.' : 'Nenhum lançamento neste mês.'}</p></div>}
      {dias.length > 0 && (
        <section className="painel lista-mes">
          {dias.map(([data, itens]) => {
            const t = totalDoDiaVisivel(itens)
            return (
              <div key={data} className="dia-bloco">
                <div className="dia-topo">
                  <span>{rotuloDia(data)}</span>
                  {t !== 0 && <span className={t > 0 ? 'entrada' : ''}>{t > 0 ? '+' : '−'} {formatar(Math.abs(t))}</span>}
                </div>
                {itens.map((l) => <ItemLancamento key={l.id} l={l} />)}
              </div>
            )
          })}
        </section>
      )}
      {importando && <ImportarExtrato aoFechar={() => setImportando(false)} aoImportar={() => setCategorizando(true)} />}
      {categorizando && <CategorizarRapido aoFechar={() => setCategorizando(false)} />}
    </div>
  )
}
