// Tela de importação de extrato OFX: escolher arquivo → conferir prévia → importar
import { useMemo, useRef, useState } from 'react'
import Folha from './Folha.jsx'
import { Chips } from './Campos.jsx'
import { useDados } from '../dados.jsx'
import { formatar } from '../lib/dinheiro.js'
import { dataCurta, nomeMes, somarMeses } from '../lib/datas.js'
import { decodificarArquivo, lerOFX, nomeDoBanco } from '../lib/ofx.js'
import { prepararImportacao, executarImportacao, problemaDoItem, faturaParaPagamento, conferirSaldo, normalizar } from '../lib/importacao.js'
import { faturaAtual, faturaDaCompra } from '../lib/fatura.js'
import { sugerirCategoria, aprenderComImportacao } from '../lib/categorizar.js'

const ACOES_CONTA = [
  { valor: 'lancar', rotulo: 'Lançar' },
  { valor: 'transferencia', rotulo: 'Transferência entre minhas contas' },
  { valor: 'fatura', rotulo: 'Pagamento de fatura' },
  { valor: 'ignorar', rotulo: 'Ignorar' },
]
const ACOES_CARTAO = [
  { valor: 'lancar', rotulo: 'Lançar' },
  { valor: 'ignorar', rotulo: 'Ignorar' },
]

// Fatura mais provável de um extrato de cartão: a mais comum entre as compras à vista
function faturaProvavel(extrato, cartao) {
  const contagem = new Map()
  for (const t of extrato.transacoes) {
    if (t.valor >= 0) continue
    const f = faturaDaCompra(cartao, t.data)
    contagem.set(f, (contagem.get(f) || 0) + 1)
  }
  let melhor = null
  for (const [f, n] of contagem) if (!melhor || n > melhor[1] || (n === melhor[1] && f > melhor[0])) melhor = [f, n]
  return melhor ? melhor[0] : faturaAtual(cartao)
}

export default function ImportarExtrato({ aoFechar }) {
  const dados = useDados()
  const { contas, cartoes, categorias, lancamentos, regras, contaPorId, cartaoPorId, avisar, zoeira } = dados
  const arquivo = useRef(null)
  const [extrato, setExtrato] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [destino, setDestino] = useState(null) // 'conta:1' | 'cartao:2'
  const [faturaCartao, setFaturaCartao] = useState(null)
  const [ajustes, setAjustes] = useState({}) // posicao → mudanças feitas na prévia
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const [tipoDestino, idTexto] = (destino || ':').split(':')
  const dest = destino ? { tipo: tipoDestino, id: Number(idTexto) } : null

  async function lerArquivo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErro('')
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 10 MB).')
      const ex = lerOFX(decodificarArquivo(await f.arrayBuffer()))
      if (!ex.transacoes.length) throw new Error('O arquivo não tem nenhuma movimentação que dê para importar.')
      setExtrato(ex)
      setNomeArquivo(f.name)
      setAjustes({})
      // Sugere o destino: cartão se for fatura; senão a conta do mesmo banco
      const banco = normalizar(nomeDoBanco(ex.banco) || '')
      if (ex.tipo === 'cartao' && cartoes.length) {
        const c = cartoes.find((x) => banco && normalizar(x.nome).includes(banco)) || cartoes[0]
        setDestino(`cartao:${c.id}`)
        setFaturaCartao(faturaProvavel(ex, c))
      } else {
        const c = contas.find((x) => banco && normalizar(x.nome).includes(banco)) || contas[0]
        setDestino(c ? `conta:${c.id}` : null)
      }
    } catch (err) {
      setErro(err.message || 'Não foi possível ler o arquivo.')
    }
  }

  function mudarDestino(v) {
    setDestino(v)
    setAjustes({})
    if (v.startsWith('cartao:')) setFaturaCartao(faturaProvavel(extrato, cartaoPorId.get(Number(v.slice(7)))))
  }

  const sugerir = useMemo(() => (desc, tipo) => sugerirCategoria(desc, tipo, regras, categorias), [regras, categorias])
  const previa = useMemo(() => {
    if (!extrato || !dest) return null
    return prepararImportacao({ extrato, destino: dest, faturaCartao, dados: { lancamentos, contas, cartoes, categorias }, sugerir })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrato, destino, faturaCartao, lancamentos, contas, cartoes, categorias, sugerir])

  const itens = useMemo(() => (previa ? previa.itens.map((i) => ({ ...i, ...ajustes[i.posicao] })) : []), [previa, ajustes])
  const mudarItem = (item, mudancas) => {
    setErro('')
    const novo = { ...item, ...mudancas }
    // Pagamento de fatura: recalcula qual fatura está sendo paga
    if (novo.acao === 'fatura') {
      const cartao = cartaoPorId.get(novo.cartaoPagoId) || cartoes[0]
      novo.cartaoPagoId = cartao?.id ?? null
      novo.faturaPaga = cartao ? faturaParaPagamento(cartao, novo.data, novo.valor, lancamentos) : null
    }
    setAjustes((a) => ({ ...a, [item.posicao]: { ...a[item.posicao], ...mudancas, cartaoPagoId: novo.cartaoPagoId, faturaPaga: novo.faturaPaga } }))
  }

  const visiveis = itens.filter((i) => i.situacao !== 'importado')
  const aGravar = itens.filter((i) => i.acao !== 'ignorar' && i.situacao !== 'importado')
  const conferencia = previa && dest ? conferirSaldo({ extrato, destino: dest, itens, lancamentos, conta: contaPorId.get(dest.id) }) : null

  async function importar() {
    if (ocupado || !dest) return
    if (!aGravar.length) return setErro('Nada selecionado para importar.')
    setOcupado(true)
    try {
      const n = await executarImportacao({ itens, destino: dest, faturaCartao: dest.tipo === 'cartao' ? faturaCartao : null })
      await aprenderComImportacao(aGravar, previa.itens)
      avisar(zoeira ? `${n} lançamento(s) importado(s). Menos digitação, mais tempo para economizar!` : `${n} lançamento(s) importado(s).`)
      aoFechar()
    } catch (e) {
      setErro(e.message)
      setOcupado(false)
    }
  }

  const categoriasDo = (tipo) => categorias.filter((c) => c.tipo === tipo)
  const opcoesFatura = dest?.tipo === 'cartao' && cartaoPorId.get(dest.id)
    ? Array.from({ length: 15 }, (_, i) => somarMeses(faturaAtual(cartaoPorId.get(dest.id)), i - 12)).reverse()
    : []

  return (
    <Folha
      titulo="Importar extrato"
      aoFechar={aoFechar}
      rodape={
        <>
          {erro && <p className="erro" role="alert">{erro}</p>}
          {extrato && (
            <button className="botao primario cheio" disabled={ocupado || !aGravar.length} onClick={importar}>
              {aGravar.length ? `Importar ${aGravar.length} lançamento(s)` : 'Nada para importar'}
            </button>
          )}
        </>
      }
    >
      <input ref={arquivo} type="file" accept=".ofx,.OFX,application/x-ofx,application/ofx,text/plain" hidden onChange={lerArquivo} />

      {!extrato && (
        <div className="bloco">
          <p>Exporte o extrato no app ou site do banco no formato <strong>OFX</strong> e escolha o arquivo aqui.</p>
          <p className="dica">O arquivo é lido só neste aparelho. Antes de gravar, você confere tudo numa prévia.</p>
          <button className="botao primario cheio" onClick={() => arquivo.current?.click()}>Escolher arquivo OFX</button>
        </div>
      )}

      {extrato && (
        <>
          <div className="painel">
            <div className="painel-titulo">
              <strong className="quebra">📄 {nomeArquivo}</strong>
              <button className="link" onClick={() => arquivo.current?.click()}>Trocar</button>
            </div>
            <span className="discreto">
              {extrato.transacoes.length} movimentações
              {extrato.inicio && extrato.fim ? ` · ${dataCurta(extrato.inicio)} a ${dataCurta(extrato.fim)}` : ''}
              {nomeDoBanco(extrato.banco) ? ` · ${nomeDoBanco(extrato.banco)}` : ''}
            </span>
            {extrato.problemas.length > 0 && (
              <span className="dica">⚠️ {extrato.problemas.length} linha(s) não puderam ser lidas e ficaram de fora: {extrato.problemas.map((p) => `${p.descricao} (${p.motivo})`).join('; ')}</span>
            )}
          </div>

          <div className="bloco">
            <span className="rotulo">Importar para</span>
            <Chips rolavel valor={destino} aoMudar={mudarDestino} opcoes={[
              ...contas.map((c) => ({ valor: `conta:${c.id}`, rotulo: c.nome, emoji: c.emoji })),
              ...cartoes.map((c) => ({ valor: `cartao:${c.id}`, rotulo: c.nome, emoji: '💳' })),
            ]} />
            {extrato.tipo === 'cartao' && dest?.tipo === 'conta' && <span className="dica">⚠️ Este arquivo parece ser de cartão de crédito.</span>}
            {extrato.tipo === 'conta' && dest?.tipo === 'cartao' && <span className="dica">⚠️ Este arquivo parece ser de conta, não de cartão.</span>}
          </div>

          {dest?.tipo === 'cartao' && (
            <label className="campo">
              <span className="rotulo">Este extrato é da fatura de</span>
              <select className="seletor" value={faturaCartao || ''} onChange={(e) => { setFaturaCartao(e.target.value); setAjustes({}) }}>
                {opcoesFatura.map((f) => <option key={f} value={f}>{nomeMes(f)}</option>)}
              </select>
              <span className="dica">Todas as compras do arquivo entram nessa fatura, como no banco.</span>
            </label>
          )}

          {previa && (
            <div className="resumo-importacao">
              <span>🆕 {previa.resumo.novos} novas</span>
              {previa.resumo.duplicados > 0 && <span>👯 {previa.resumo.duplicados} parecem já lançadas</span>}
              {previa.resumo.importados > 0 && <span>✅ {previa.resumo.importados} já importadas</span>}
              {previa.resumo.creditos > 0 && <span>↩️ {previa.resumo.creditos} créditos no cartão</span>}
            </div>
          )}

          {conferencia && (
            <div className={`conferencia ${conferencia.diferenca === 0 ? 'ok' : 'diferente'}`}>
              <strong>{conferencia.diferenca === 0 ? '✅ O saldo vai bater com o banco' : '⚠️ O saldo não vai bater com o banco'}</strong>
              <span>Banco em {dataCurta(conferencia.data)}: {formatar(conferencia.noExtrato)} · App: {formatar(conferencia.noApp)}</span>
              {conferencia.diferenca !== 0 && <span className="dica">Diferença de {formatar(Math.abs(conferencia.diferenca))}. Confira as linhas ignoradas, lançamentos manuais ou o saldo inicial da conta (em Ajustes).</span>}
            </div>
          )}

          <div className="lista-importacao">
            {visiveis.map((i) => {
              const problema = problemaDoItem(i, dest)
              return (
                <div key={i.posicao} className={`item-importacao ${i.acao === 'ignorar' ? 'ignorado' : ''}`}>
                  <div className="item-imp-topo">
                    <span className="item-imp-desc">{i.descricao}</span>
                    <strong className={i.entrada ? 'entrada' : 'saida'}>{i.entrada ? '+' : '−'} {formatar(i.valor)}</strong>
                  </div>
                  <span className="discreto">
                    {dataCurta(i.data)}
                    {i.parcela ? ` · parcela ${i.parcela.parcela}/${i.parcela.total}` : ''}
                    {i.motivo ? ` · ${i.motivo}` : ''}
                  </span>
                  <div className="item-imp-controles">
                    <select className="seletor" aria-label="O que fazer" value={i.acao} onChange={(e) => mudarItem(i, { acao: e.target.value })}>
                      {(dest?.tipo === 'cartao' ? ACOES_CARTAO : ACOES_CONTA)
                        .filter((a) => !(a.valor === 'fatura' && (i.entrada || !cartoes.length)))
                        .map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
                    </select>
                    {i.acao === 'lancar' && (
                      <select className="seletor" aria-label="Categoria" value={i.categoriaId ?? ''} onChange={(e) => mudarItem(i, { categoriaId: Number(e.target.value), categoriaEscolhida: true })}>
                        {categoriasDo(i.tipo).map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                      </select>
                    )}
                    {i.acao === 'transferencia' && (
                      <select className="seletor" aria-label={i.entrada ? 'Veio da conta' : 'Foi para a conta'} value={i.contaOutraId ?? ''} onChange={(e) => mudarItem(i, { contaOutraId: Number(e.target.value) })}>
                        <option value="">{i.entrada ? 'Veio de qual conta?' : 'Foi para qual conta?'}</option>
                        {contas.filter((c) => c.id !== dest?.id).map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                      </select>
                    )}
                    {i.acao === 'fatura' && (
                      <select className="seletor" aria-label="Cartão" value={i.cartaoPagoId ?? ''} onChange={(e) => mudarItem(i, { cartaoPagoId: Number(e.target.value) })}>
                        {cartoes.map((c) => <option key={c.id} value={c.id}>💳 {c.nome}</option>)}
                      </select>
                    )}
                  </div>
                  {i.acao === 'fatura' && i.faturaPaga && <span className="dica">Quita a fatura de {nomeMes(i.faturaPaga)}</span>}
                  {problema && <span className="erro pequeno">{problema}</span>}
                </div>
              )
            })}
            {previa && previa.resumo.importados > 0 && <p className="discreto centro">{previa.resumo.importados} linha(s) já importadas antes não aparecem aqui.</p>}
          </div>
        </>
      )}
    </Folha>
  )
}
