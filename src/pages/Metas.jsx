// Metas: quanto já foi juntado/pago em cada meta (a categoria dela), quanto falta e o ritmo
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, IconeCategoria } from '../components/Pecas.jsx'
import { CampoValor, Campo } from '../components/Campos.jsx'
import Folha from '../components/Folha.jsx'
import { IconeMais, IconeAlerta, IconeOk, Ic } from '../components/Icones.jsx'
import { formatar } from '../lib/dinheiro.js'
import { nomeMes, mesAtual, somarMeses } from '../lib/datas.js'
import { progressoMeta, categoriasComMeta, salvarMeta, tirarMeta, validarMeta } from '../lib/metas.js'
import { sobraMedia } from '../lib/renda.js'

export default function Metas({ irPara }) {
  const { categorias, lancamentos, rendas, podeEditar } = useDados()
  const [editando, setEditando] = useState(null) // null | 'nova' | categoria
  const metas = useMemo(() => categoriasComMeta(categorias)
    .map((c) => ({ categoria: c, p: progressoMeta(c, lancamentos) }))
    .sort((a, b) => Number(a.p.concluida) - Number(b.p.concluida) || (a.p.prazo || '9999').localeCompare(b.p.prazo || '9999') || a.categoria.nome.localeCompare(b.categoria.nome)),
  [categorias, lancamentos])
  // Quanto costuma sobrar da renda por mês (sem contar o que já vai para as metas)
  const sobra = useMemo(() => (rendas.length ? sobraMedia({ rendas, lancamentos, fora: new Set(metas.map((m) => m.categoria.id)) }) : null), [rendas, lancamentos, metas])
  const total = metas.reduce((s, m) => ({ guardado: s.guardado + Math.min(m.p.guardado, m.p.alvo), alvo: s.alvo + m.p.alvo }), { guardado: 0, alvo: 0 })

  return (
    <div className="pagina">
      <CabecaPagina titulo="Metas" irPara={irPara} acoes={podeEditar && <button className="botao-acao" onClick={() => setEditando('nova')}><IconeMais /> Nova meta</button>} />

      {metas.length > 0 && (
        <section className="heroi">
          <div className="sol-canto" aria-hidden="true" />
          <span className="rotulo">Juntado nas metas</span>
          <strong className="valor-grande">{formatar(total.guardado)}</strong>
          <span className="previsao">de <strong>{formatar(total.alvo)}</strong> · {metas.length} {metas.length === 1 ? 'meta' : 'metas'}</span>
        </section>
      )}
      {sobra && metas.length > 0 && (
        <p className="dica metas-sobra">Pela sua renda, costuma sobrar <b>{sobra.sobra >= 0 ? formatar(sobra.sobra) : `− ${formatar(-sobra.sobra)}`}</b> por mês: renda de {formatar(sobra.renda)} menos {formatar(sobra.gastoMedio)} de gastos (média dos últimos 3 meses, sem as metas).</p>
      )}

      {metas.map(({ categoria: c, p }) => (
        <section key={c.id} className="painel meta">
          <div className="meta-topo">
            <IconeCategoria categoria={c} />
            <div className="meta-nome"><h3>{c.nome}</h3><small>{p.prazo ? `até ${nomeMes(p.prazo)}` : 'sem prazo'}</small></div>
            {podeEditar && <button className="link" onClick={() => setEditando(c)}>Editar</button>}
          </div>
          <div className="meta-barra" role="progressbar" aria-valuenow={p.porcentagem} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.porcentagem}% de ${c.nome}`}>
            <i style={{ width: `${Math.max(p.porcentagem, p.guardado ? 2 : 0)}%` }} />
          </div>
          <div className="meta-numeros">
            <span><b>{formatar(p.guardado)}</b> de {formatar(p.alvo)}</span>
            <span className="meta-pct">{p.porcentagem}%</span>
          </div>
          <p className="meta-texto">
            {p.concluida && <><Ic i={IconeOk} className="bom" /> Meta alcançada.</>}
            {!p.concluida && p.atrasada && <><Ic i={IconeAlerta} className="atencao" /> O prazo passou e faltam {formatar(p.falta)}.</>}
            {!p.concluida && !p.atrasada && p.prazo && <>Faltam {formatar(p.falta)}: <b>{formatar(p.porMesNecessario)} por mês</b> até {nomeMes(p.prazo)}.{sobra && (p.porMesNecessario <= sobra.sobra ? ' Cabe no que costuma sobrar.' : ' É mais do que costuma sobrar.')}</>}
            {!p.concluida && !p.prazo && <>Faltam {formatar(p.falta)}.</>}
            {!p.concluida && (p.ritmo > 0
              ? <> No ritmo dos últimos 3 meses ({formatar(p.ritmo)}/mês), chega em {nomeMes(p.chegaEm)}.</>
              : <> Nos últimos 3 meses não entrou nada nesta meta.</>)}
          </p>
        </section>
      ))}

      {metas.length === 0 && (
        <section className="painel vazio-grande">
          <p>Nenhuma meta ainda.</p>
          <p className="dica">Crie uma meta (ex.: Entrada do apartamento, R$ 50.000 até dez/2027). O app cria uma categoria com o nome dela: tudo que você lançar nessa categoria conta como juntado para a meta.</p>
          {podeEditar && <button className="botao primario" onClick={() => setEditando('nova')}>Criar a primeira meta</button>}
        </section>
      )}

      {editando && <FormMeta categoria={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
    </div>
  )
}

function FormMeta({ categoria, aoFechar }) {
  const { categorias, avisar } = useDados()
  const [nome, setNome] = useState(categoria?.nome ?? '')
  const [alvo, setAlvo] = useState(categoria?.meta?.alvo ?? 0)
  const [prazo, setPrazo] = useState(categoria?.meta?.prazo ?? '')
  const [usar, setUsar] = useState(categoria ? String(categoria.id) : 'nova') // 'nova' ou id de categoria existente
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const existentes = categorias.filter((c) => c.tipo === 'despesa' && !c.meta && c.id !== categoria?.id)
  const meses = Array.from({ length: 61 }, (_, i) => somarMeses(mesAtual(), i))

  const escolherCategoria = (v) => {
    setUsar(v)
    if (v !== 'nova' && !categoria) setNome(categorias.find((c) => String(c.id) === v)?.nome ?? nome)
  }
  async function salvar() {
    const problema = validarMeta({ nome, alvo, prazo })
    if (problema) return setErro(problema)
    setOcupado(true)
    try {
      const categoriaId = categoria ? categoria.id : usar === 'nova' ? null : categorias.find((c) => String(c.id) === usar)?.id
      await salvarMeta({ categoriaId, nome, alvo, prazo: prazo || null })
      avisar(categoria ? 'Meta atualizada.' : `Meta criada. Lance na categoria "${nome.trim()}" o que for juntando.`)
      aoFechar()
    } catch (e) {
      setErro(e.message)
      setOcupado(false)
    }
  }
  async function remover() {
    setOcupado(true)
    await tirarMeta(categoria.id)
    avisar('Meta removida. A categoria e os lançamentos continuam.')
    aoFechar()
  }

  return (
    <Folha titulo={categoria ? 'Editar meta' : 'Nova meta'} aoFechar={aoFechar} rodape={
      <div className="linha-botoes">
        {categoria && <button className="botao secundario" onClick={remover} disabled={ocupado}>Tirar meta</button>}
        <button className="botao primario cheio" onClick={salvar} disabled={ocupado}>Salvar</button>
      </div>
    }>
      {!categoria && existentes.length > 0 && (
        <Campo rotulo="Categoria da meta">
          <select value={usar} onChange={(e) => escolherCategoria(e.target.value)}>
            <option value="nova">Criar uma categoria com o nome da meta</option>
            {existentes.map((c) => <option key={c.id} value={String(c.id)}>Usar a categoria {c.nome}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="Nome da meta">
        <input type="text" value={nome} onChange={(e) => { setErro(''); setNome(e.target.value) }} placeholder="Ex.: Entrada do apartamento" maxLength={40} />
      </Campo>
      <CampoValor rotulo="Quanto quer juntar" valor={alvo} aoMudar={(v) => { setErro(''); setAlvo(v) }} />
      <Campo rotulo="Até quando (opcional)">
        <select value={prazo} onChange={(e) => setPrazo(e.target.value)}>
          <option value="">Sem prazo</option>
          {meses.map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}
        </select>
      </Campo>
      {erro && <p className="erro" role="alert">{erro}</p>}
    </Folha>
  )
}
