// Formulários de conta, cartão e categoria (usados em Ajustes e Cartões)
import { useState } from 'react'
import Folha from './Folha.jsx'
import { Campo, CampoValor, Chips } from './Campos.jsx'
import { useDados } from '../dados.jsx'
import { saldoConta } from '../lib/calculos.js'
import { salvarCartao, excluirCartao, salvarConta, excluirConta, salvarCategoria, excluirCategoria } from '../lib/cadastros.js'

// Lógica comum: salvar/excluir com proteção contra toque duplo e exibição de erro
function useAcoes(aoFechar) {
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  async function executar(fn) {
    if (ocupado) return
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
