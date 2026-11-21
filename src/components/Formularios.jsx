// Formulários de conta, cartão e categoria (usados em Ajustes e Cartões)
import { useState } from 'react'
import Folha from './Folha.jsx'
import { Campo, CampoValor, Chips, Abas } from './Campos.jsx'
import { mesAtual, somarMeses, nomeMes } from '../lib/datas.js'
import { salvarRecorrente, excluirRecorrente } from '../lib/recorrentes.js'
import { useDados } from '../dados.jsx'
import { saldoConta } from '../lib/calculos.js'
import { salvarCartao, excluirCartao, salvarConta, excluirConta, salvarCategoria, excluirCategoria } from '../lib/cadastros.js'

// Lógica comum: salvar/excluir com proteção contra toque duplo e exibição de erro
function useAcoes(aoFechar) {
  const { podeEditar } = useDados()
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  async function executar(fn) {
    if (ocupado) return
    if (!podeEditar) return setErro('Neste espaço você só pode ver: peça a quem criou para liberar a edição.')
    setOcupado(true)
    setErro('')
    try {
      await fn()
      aoFechar()
    } catch (e) {
      setErro(e.message || 'Algo deu errado.')
      setConfirmando(false)
    } finally {
      setOcupado(false)
    }
  }
  return { erro, setErro, ocupado, confirmando, setConfirmando, executar }
}

function Rodape({ podeExcluir, acoes, aoSalvar, aoExcluir }) {
  const { erro, ocupado, confirmando, setConfirmando } = acoes
  return (
    <>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="linha-botoes">
        {podeExcluir && (
          <button className={`botao ${confirmando ? 'perigo' : 'secundario'}`} disabled={ocupado} onClick={() => (confirmando ? aoExcluir() : setConfirmando(true))}>
            {confirmando ? 'Confirmar exclusão?' : 'Excluir'}
          </button>
        )}
        <button className="botao primario cheio" disabled={ocupado} onClick={aoSalvar}>Salvar</button>
      </div>
    </>
  )
}

export function FormCartao({ cartao, aoFechar }) {
  const { contas, avisar } = useDados()
  const [f, setF] = useState(() => cartao || { nome: '', limite: 0, diaFechamento: '', diaVencimento: '', contaPagamentoId: contas[0]?.id ?? null })
  const acoes = useAcoes(aoFechar)

  const salvar = () => acoes.executar(async () => {
    const mudou = await salvarCartao(f)
    avisar(mudou > 0 ? `Cartão atualizado. ${mudou} lançamento(s) mudaram de fatura.` : cartao ? 'Cartão atualizado.' : 'Cartão cadastrado. Use com moderação!')
  })
  const excluir = () => acoes.executar(() => excluirCartao(cartao.id))

  return (
    <Folha titulo={cartao ? 'Editar cartão' : 'Novo cartão'} aoFechar={aoFechar} rodape={<Rodape podeExcluir={!!cartao} acoes={acoes} aoSalvar={salvar} aoExcluir={excluir} />}>
      <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Inter Gold" maxLength={40} /></Campo>
      <CampoValor rotulo="Limite (opcional)" valor={f.limite} aoMudar={(v) => setF({ ...f, limite: v })} />
      <div className="duas-colunas">
        <Campo rotulo="Dia do fechamento"><input type="number" inputMode="numeric" min="1" max="31" value={f.diaFechamento} onChange={(e) => setF({ ...f, diaFechamento: e.target.value })} /></Campo>
        <Campo rotulo="Dia do vencimento"><input type="number" inputMode="numeric" min="1" max="31" value={f.diaVencimento} onChange={(e) => setF({ ...f, diaVencimento: e.target.value })} /></Campo>
      </div>
      <p className="dica">
        Compras feitas no dia do fechamento ou depois vão para a fatura seguinte. Os dias aparecem no app do banco, na tela da fatura.
        {cartao && ' Se mudar os dias, as compras das faturas que ainda não fecharam são recalculadas.'}
      </p>
      <div className="bloco">
        <span className="rotulo">Conta que costuma pagar a fatura</span>
        <Chips rolavel opcoes={contas.map((c) => ({ valor: c.id, rotulo: c.nome, emoji: c.emoji }))} valor={f.contaPagamentoId} aoMudar={(v) => setF({ ...f, contaPagamentoId: v })} />
      </div>
    </Folha>
  )
}

export function FormConta({ conta, aoFechar }) {
  const { lancamentos, avisar } = useDados()
  const [f, setF] = useState(() => ({ nome: conta?.nome || '', emoji: conta?.emoji || '🏦', saldo: conta ? saldoConta(conta, lancamentos) : 0 }))
  const acoes = useAcoes(aoFechar)

  const salvar = () => acoes.executar(async () => {
    await salvarConta({ id: conta?.id, nome: f.nome, emoji: f.emoji, saldoAtual: f.saldo })
    avisar(conta ? 'Conta atualizada.' : 'Conta criada.')
  })
  const excluir = () => acoes.executar(() => excluirConta(conta.id))

  return (
    <Folha titulo={conta ? 'Editar conta' : 'Nova conta'} aoFechar={aoFechar} rodape={<Rodape podeExcluir={!!conta} acoes={acoes} aoSalvar={salvar} aoExcluir={excluir} />}>
      <div className="duas-colunas estreita">
        <Campo rotulo="Ícone"><input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} maxLength={4} className="centro" /></Campo>
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Nubank, Poupança" maxLength={40} /></Campo>
      </div>
      <CampoValor rotulo="Saldo atual" valor={Math.abs(f.saldo)} aoMudar={(v) => setF({ ...f, saldo: f.saldo < 0 ? -v : v })} />
      <label className="alternar">
        <input type="checkbox" checked={f.saldo < 0} onChange={(e) => setF({ ...f, saldo: e.target.checked ? -Math.abs(f.saldo) : Math.abs(f.saldo) })} />
        Saldo negativo (no cheque especial)
      </label>
      <p className="dica">Confira o saldo no app do banco e coloque aqui. Se mudar depois, é só corrigir: o app ajusta sozinho.</p>
    </Folha>
  )
}

export function FormCategoria({ categoria, tipo, aoFechar }) {
  const { avisar } = useDados()
  const [f, setF] = useState(() => categoria || { nome: '', emoji: '📦', tipo })
  const acoes = useAcoes(aoFechar)

  const salvar = () => acoes.executar(async () => {
    await salvarCategoria(f)
    avisar('Categoria salva.')
  })
  const excluir = () => acoes.executar(() => excluirCategoria(categoria.id))

  return (
    <Folha titulo={categoria ? 'Editar categoria' : `Nova categoria de ${f.tipo}`} aoFechar={aoFechar} rodape={<Rodape podeExcluir={!!categoria} acoes={acoes} aoSalvar={salvar} aoExcluir={excluir} />}>
      <div className="duas-colunas estreita">
        <Campo rotulo="Ícone"><input value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} maxLength={4} className="centro" /></Campo>
        <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Academia" maxLength={30} /></Campo>
      </div>
    </Folha>
  )
}

// ---------- Conta fixa (recorrente) ----------
export function FormRecorrente({ recorrente, aoFechar }) {
  const { contas, cartoes, categorias, avisar } = useDados()
  const atual = mesAtual()
  const [f, setF] = useState(() => recorrente
    ? { ...recorrente, origem: recorrente.cartaoId != null ? `cartao:${recorrente.cartaoId}` : `conta:${recorrente.contaId}` }
    : { tipo: 'despesa', descricao: '', valor: 0, dia: '', categoriaId: null, origem: contas[0] ? `conta:${contas[0].id}` : null, inicio: atual, fim: null })
  const acoes = useAcoes(aoFechar)
  const mudar = (campo, v) => { acoes.setErro(''); setF((x) => ({ ...x, [campo]: v })) }

  const meses = Array.from({ length: 37 }, (_, i) => somarMeses(atual, i - 12))
  const cats = categorias.filter((c) => c.tipo === f.tipo)
  const origens = [
    ...contas.map((c) => ({ valor: `conta:${c.id}`, rotulo: c.nome, emoji: c.emoji })),
    ...(f.tipo === 'despesa' ? cartoes.map((c) => ({ valor: `cartao:${c.id}`, rotulo: c.nome, emoji: '💳' })) : []),
  ]

  const salvar = () => acoes.executar(async () => {
    const [t, id] = (f.origem || ':').split(':')
    await salvarRecorrente({
      id: recorrente?.id, descricao: f.descricao, tipo: f.tipo, valor: f.valor, dia: Number(f.dia), categoriaId: f.categoriaId,
      contaId: t === 'conta' ? id : null, cartaoId: t === 'cartao' ? id : null,
      inicio: f.inicio, fim: f.fim || null, pulados: recorrente?.pulados,
    })
    avisar(recorrente ? 'Conta fixa atualizada.' : 'Conta fixa cadastrada. Ela vai aparecer no Início todo mês.')
  })
  const excluir = () => acoes.executar(async () => {
    await excluirRecorrente(recorrente.id)
    avisar('Conta fixa excluída. O que já foi lançado continua lá.')
  })

  return (
    <Folha titulo={recorrente ? 'Editar conta fixa' : 'Nova conta fixa'} aoFechar={aoFechar} rodape={<Rodape podeExcluir={!!recorrente} acoes={acoes} aoSalvar={salvar} aoExcluir={excluir} />}>
      <Abas opcoes={[{ valor: 'despesa', rotulo: 'Despesa', tom: 'tom-saida' }, { valor: 'receita', rotulo: 'Receita', tom: 'tom-entrada' }]} valor={f.tipo}
        aoMudar={(tipo) => setF((x) => ({ ...x, tipo, categoriaId: tipo === x.tipo ? x.categoriaId : null, origem: tipo === 'receita' && x.origem?.startsWith('cartao:') ? (contas[0] ? `conta:${contas[0].id}` : null) : x.origem }))} />
      <Campo rotulo="Nome"><input value={f.descricao} onChange={(e) => mudar('descricao', e.target.value)} placeholder={f.tipo === 'despesa' ? 'Ex.: Aluguel, Netflix, Luz' : 'Ex.: Salário'} maxLength={60} /></Campo>
      <CampoValor rotulo="Valor (se varia, use o valor médio: você ajusta ao lançar)" valor={f.valor} aoMudar={(v) => mudar('valor', v)} />
      <Campo rotulo="Dia do vencimento"><input type="number" inputMode="numeric" min="1" max="31" value={f.dia} onChange={(e) => mudar('dia', e.target.value)} /></Campo>
      <label className="campo">
        <span className="rotulo">Categoria</span>
        <select className="seletor" value={f.categoriaId ?? ''} onChange={(e) => mudar('categoriaId', e.target.value || null)}>
          <option value="">Escolha…</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
        </select>
      </label>
      <div className="bloco">
        <span className="rotulo">{f.tipo === 'receita' ? 'Entra em' : 'Paga com'}</span>
        <Chips rolavel opcoes={origens} valor={f.origem} aoMudar={(v) => mudar('origem', v)} />
      </div>
      <div className="duas-colunas">
        <label className="campo">
          <span className="rotulo">A partir de</span>
          <select className="seletor" value={f.inicio} onChange={(e) => mudar('inicio', e.target.value)}>
            {meses.map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}
          </select>
        </label>
        <label className="campo">
          <span className="rotulo">Até</span>
          <select className="seletor" value={f.fim || ''} onChange={(e) => mudar('fim', e.target.value || null)}>
            <option value="">Sem fim</option>
            {meses.filter((m) => m >= f.inicio).map((m) => <option key={m} value={m}>{nomeMes(m)}</option>)}
          </select>
        </label>
      </div>
      <p className="dica">Todo mês ela aparece no Início para você confirmar com um toque. Nada é lançado sozinho.</p>
    </Folha>
  )
}
