// Tela de importação de extrato: escolher arquivo(s) OFX ou PDF → conferir prévia → importar
import { useMemo, useRef, useState } from 'react'
import Folha from './Folha.jsx'
import { Chips } from './Campos.jsx'
import { useDados } from '../dados.jsx'
import { formatar } from '../lib/dinheiro.js'
import { dataCurta, nomeMes, somarMeses, mesDe } from '../lib/datas.js'
import { db, salvarConfig } from '../lib/db.js'
import { avisoDeOrcamento, textoAviso } from '../lib/orcamento.js'
import { decodificarArquivo, lerOFX, nomeDoBanco } from '../lib/ofx.js'
import {
  prepararImportacao, executarImportacao, problemaDoItem, resolverFatura, conferirSaldo, normalizar,
  podeDefinirSaldoInicial, identidade, NOVA_CONTA_INVESTIMENTOS, nomeDaNovaConta, ehContaNova,
  novoCartao, nomeDoNovoCartao, faturaDeCartaoNovo, diasEstimados,
} from '../lib/importacao.js'
import { faturaAtual, faturaDaCompra } from '../lib/fatura.js'
import { sugerirCategoria, aprenderComImportacao } from '../lib/categorizar.js'
import { extrairLinhasPdf } from '../lib/pdfTexto.js'
import { lerExtratoSantander, juntarExtratos } from '../lib/santander.js'
import AvisoNavegador from './AvisoNavegador.jsx'

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
const POR_PAGINA = 60

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

// "104/0999/0001234567890" → "Caixa (ag. 0999 · conta 0001234567890)" · "077" → "Inter"
function descreverDestino(chave) {
  const [banco, ag, conta] = String(chave).split('/')
  const nome = nomeDoBanco(banco) || (banco.startsWith('ISPB') ? banco : `banco ${banco}`)
  return ag && conta ? `${nome} (ag. ${ag} · conta ${conta})` : nome
}

const ehPdf = (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf'

export default function ImportarExtrato({ aoFechar }) {
  const dados = useDados()
  const { contas, cartoes, categorias, lancamentos, regras, orcamentos, config, categoriaPorId, contaPorId, cartaoPorId, avisar, zoeira, podeEditar, usuario } = dados
  const arquivo = useRef(null)
  const [extrato, setExtrato] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [lendo, setLendo] = useState(null) // { atual, total }
  const [destino, setDestino] = useState(null) // 'conta:id' | 'cartao:id'
  const [faturaCartao, setFaturaCartao] = useState(null)
  const [ajustes, setAjustes] = useState({}) // posicao → mudanças feitas na prévia
  const [regrasImp, setRegrasImp] = useState({}) // regras desta importação
  const [usarSaldoInicial, setUsarSaldoInicial] = useState(true)
  const [aceitarDiferenca, setAceitarDiferenca] = useState(false) // importar mesmo com o saldo diferente do banco
  const [filtro, setFiltro] = useState('atencao')
  const [limite, setLimite] = useState(POR_PAGINA)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const [tipoDestino, idTexto] = (destino || ':').split(':')
  const dest = destino ? { tipo: tipoDestino, id: idTexto } : null

  function regrasPadrao(ex, destinoTexto) {
    const destId = destinoTexto?.split(':')[1]
    const contaInvest = contas.find((c) => /invest/i.test(c.nome))
    const inter = contas.find((c) => normalizar(c.nome).includes('INTER') && c.id !== destId)
    return {
      contaInvestimentos: contaInvest ? contaInvest.id : NOVA_CONTA_INVESTIMENTOS,
      contaPixProprio: inter ? inter.id : null,
      titular: ex.titular || config.titular || null,
      cartaoPorPagamento: {},
      // o que você escolheu nas importações anteriores para cada conta de destino (neste aparelho)
      contaPorPix: { ...(config.destinosPix?.conta || {}) },
      gastoPorPix: { ...(config.destinosPix?.gasto || {}) },
      historico: ex.origem === 'pdf-santander',
    }
  }

  async function lerArquivos(e) {
    const lista = [...(e.target.files || [])]
    e.target.value = ''
    if (!lista.length) return
    setErro('')
    try {
      if (lista.some((f) => f.size > 15 * 1024 * 1024)) throw new Error('Arquivo grande demais (máximo 15 MB cada).')
      let ex
      if (lista.every(ehPdf)) {
        const lidos = []
        for (let i = 0; i < lista.length; i++) {
          setLendo({ atual: i + 1, total: lista.length })
          const linhas = await extrairLinhasPdf(new Uint8Array(await lista[i].arrayBuffer()))
          try {
            lidos.push(lerExtratoSantander(linhas))
          } catch (err) {
            throw new Error(`${lista[i].name}: ${err.message}`)
          }
        }
        ex = juntarExtratos(lidos)
      } else if (lista.length === 1 && !ehPdf(lista[0])) {
        ex = lerOFX(decodificarArquivo(await lista[0].arrayBuffer()))
      } else {
        throw new Error('Escolha um arquivo OFX, ou um ou mais PDFs do mesmo banco (não misture os dois).')
      }
      if (!ex.transacoes.length) throw new Error('O arquivo não tem nenhuma movimentação que dê para importar.')
      setExtrato(ex)
      setNomeArquivo(lista.length === 1 ? lista[0].name : `${lista.length} arquivos`)
      setAjustes({})
      setFiltro('atencao')
      setLimite(POR_PAGINA)
      // Sugere o destino: cartão se for fatura; senão a conta do mesmo banco
      const banco = normalizar(nomeDoBanco(ex.banco) || '')
      let d
      if (ex.tipo === 'cartao' && cartoes.length) {
        const c = cartoes.find((x) => banco && normalizar(x.nome).includes(banco)) || cartoes[0]
        d = `cartao:${c.id}`
        setFaturaCartao(faturaProvavel(ex, c))
      } else {
        const c = contas.find((x) => banco && normalizar(x.nome).includes(banco)) || contas[0]
        d = c ? `conta:${c.id}` : null
      }
      setDestino(d)
      setRegrasImp(regrasPadrao(ex, d))
    } catch (err) {
      setErro(err.message || 'Não foi possível ler o arquivo.')
    } finally {
      setLendo(null)
    }
  }

  function mudarDestino(v) {
    setDestino(v)
    setAjustes({})
    setRegrasImp(regrasPadrao(extrato, v))
    if (v.startsWith('cartao:')) setFaturaCartao(faturaProvavel(extrato, cartaoPorId.get(v.slice(7))))
  }

  const sugerir = useMemo(() => (desc, tipo) => sugerirCategoria(desc, tipo, regras, categorias), [regras, categorias])
  const previa = useMemo(() => {
    if (!extrato || !dest) return null
    return prepararImportacao({ extrato, destino: dest, faturaCartao, dados: { lancamentos, contas, cartoes, categorias }, sugerir, regras: regrasImp })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrato, destino, faturaCartao, lancamentos, contas, cartoes, categorias, sugerir, regrasImp])

  const itens = useMemo(() => (previa ? previa.itens.map((i) => ({ ...i, ...ajustes[i.posicao] })) : []), [previa, ajustes])

  function mudarItem(item, mudancas, aplicarParecidas = false) {
    setErro('')
    const alvos = aplicarParecidas ? itens.filter((i) => i.situacao !== 'importado' && identidade(i.descricao) === identidade(item.descricao) && i.entrada === item.entrada) : [item]
    setAjustes((a) => {
      const novo = { ...a }
      for (const alvo of alvos) {
        let m = { ...mudancas }
        // Pagamento de fatura: recalcula qual fatura está sendo paga
        if ((m.acao ?? alvo.acao) === 'fatura' && nomeDoNovoCartao(m.cartaoPagoId ?? alvo.cartaoPagoId)) {
          m = { ...m, ...faturaDeCartaoNovo({ ...alvo, ...m }, m.cartaoPagoId ?? alvo.cartaoPagoId) }
        } else if ((m.acao ?? alvo.acao) === 'fatura') {
          const cartao = cartaoPorId.get(m.cartaoPagoId ?? alvo.cartaoPagoId) || cartoes[0]
          m = cartao ? { ...m, ...resolverFatura({ ...alvo, ...m }, cartao, lancamentos, regrasImp.historico), acao: 'fatura' } : { ...m, cartaoPagoId: null, faturaPaga: null }
        }
        novo[alvo.posicao] = { ...novo[alvo.posicao], ...m }
      }
      return novo
    })
  }

  const parecidas = (item) => itens.filter((i) => i.posicao !== item.posicao && i.situacao !== 'importado' && i.entrada === item.entrada && identidade(i.descricao) === identidade(item.descricao)).length

  const naoImportados = itens.filter((i) => i.situacao !== 'importado')
  const precisaAtencao = (i) => i.situacao === 'duplicado' || i.grupo || (i.acao === 'ignorar' && i.situacao === 'novo') || !!problemaDoItem(i, dest) || ajustes[i.posicao]
  const listados = filtro === 'atencao' ? naoImportados.filter(precisaAtencao) : naoImportados
  const aGravar = itens.filter((i) => i.acao !== 'ignorar' && i.situacao !== 'importado')

  const saldoInicialPossivel = extrato && dest && extrato.saldoInicial && podeDefinirSaldoInicial({ extrato, destino: dest, lancamentos })
  const saldoInicialNovo = saldoInicialPossivel && usarSaldoInicial ? extrato.saldoInicial.valor : null
  const conferencia = previa && dest ? conferirSaldo({ extrato, destino: dest, itens, lancamentos, conta: contaPorId.get(dest.id), saldoInicial: saldoInicialNovo }) : null
  const bloqueado = extrato?.conferencia && !extrato.conferencia.ok
  // saldo final diferente do banco: só importa se a pessoa confirmar que é isso mesmo
  const saldoDiferente = !!conferencia && conferencia.diferenca !== 0 && !bloqueado
  const travadoPorSaldo = saldoDiferente && !aceitarDiferenca

  // grupos especiais (para o painel de regras)
  const grupos = useMemo(() => {
    const g = { investimento: 0, pixProprio: 0, pagamentoCartao: new Map(), pixConta: new Map() }
    for (const i of previa?.itens || []) {
      if (i.situacao !== 'novo') continue
      if (i.grupo === 'investimento') g.investimento++
      if (i.grupo === 'pixProprio' && !i.contaBancaria) g.pixProprio++
      if (i.grupo === 'pixConta' || (i.grupo === 'pixProprio' && i.contaBancaria)) {
        const atual = g.pixConta.get(i.contaBancaria) || { n: 0, total: 0, saidas: 0, contaId: i.contaOutraId, proprio: i.grupo === 'pixProprio' }
        g.pixConta.set(i.contaBancaria, { ...atual, n: atual.n + 1, total: atual.total + i.valor, saidas: atual.saidas + (i.entrada ? 0 : 1) })
      }
      if (i.grupo === 'pagamentoCartao') {
        const atual = g.pagamentoCartao.get(i.identidade) || { n: 0, datas: [], cartaoId: i.acao === 'fatura' ? i.cartaoPagoId : null }
        g.pagamentoCartao.set(i.identidade, { ...atual, n: atual.n + 1, datas: [...atual.datas, i.data] })
      }
    }
    return g
  }, [previa])

  async function importar() {
    if (ocupado || !dest || bloqueado) return
    if (travadoPorSaldo) return setErro('O saldo não vai bater com o banco. Confira as linhas ou confirme que quer importar assim.')
    if (!podeEditar) return setErro('Neste espaço você só pode ver: peça a quem criou para liberar a edição.')
    if (!aGravar.length) return setErro('Nada selecionado para importar.')
    setOcupado(true)
    try {
      const n = await executarImportacao({
        itens, destino: dest, faturaCartao: dest.tipo === 'cartao' ? faturaCartao : null,
        saldoInicial: saldoInicialNovo,
        nomeContaInvestimentos: `Investimentos ${contaPorId.get(dest.id)?.nome ?? ''}`.trim(),
      })
      await aprenderComImportacao(aGravar)
      const conta = Object.fromEntries(Object.entries(regrasImp.contaPorPix || {}).filter(([, v]) => v === null || (v && !ehContaNova(v))))
      if (Object.keys(conta).length || Object.keys(regrasImp.gastoPorPix || {}).length) {
        await salvarConfig('destinosPix', { conta: { ...(config.destinosPix?.conta || {}), ...conta }, gasto: { ...(config.destinosPix?.gasto || {}), ...(regrasImp.gastoPorPix || {}) } })
      }
      if (extrato.titular && (!config.titular || extrato.titular.length > config.titular.length)) await salvarConfig('titular', extrato.titular)
      let mensagem = zoeira ? `${n} lançamento(s) importado(s). Menos digitação, mais tempo para economizar!` : `${n} lançamento(s) importado(s).`
      if (usuario?.isLoggedIn) mensagem += ' Espere o topo mostrar ☁️ Sincronizado antes de fechar o app.'
      if (orcamentos.length) {
        const aviso = avisoDeOrcamento({ meses: [...new Set(aGravar.map((i) => mesDe(i.dataLancamento)))].slice(-3), orcamentos, antes: lancamentos, depois: await db.lancamentos.toArray() })
        if (aviso) mensagem += ' ' + textoAviso(aviso, categoriaPorId.get(aviso.categoriaId)?.nome || '', zoeira)
      }
      avisar(mensagem)
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
  const outrasContas = contas.filter((c) => c.id !== dest?.id)
  // nomes para "Novo cartão": bancos das suas contas que ainda não têm cartão
  const nomesCartaoNovo = (atual) => [...new Set([
    ...(nomeDoNovoCartao(atual) ? [nomeDoNovoCartao(atual)] : []),
    ...contas.filter((c) => !/invest|carteira/i.test(c.nome) && !cartoes.some((k) => normalizar(k.nome) === normalizar(c.nome))).map((c) => c.nome),
  ])]

  return (
    <Folha
      titulo="Importar extrato"
      aoFechar={aoFechar}
      rodape={
        <>
          {erro && <p className="erro" role="alert">{erro}</p>}
          {extrato && (
            <button className="botao primario cheio" disabled={ocupado || !aGravar.length || bloqueado || travadoPorSaldo} onClick={importar}>
              {ocupado ? 'Importando…' : bloqueado ? 'Conferência falhou: nada será importado' : travadoPorSaldo ? 'O saldo não bate com o banco' : aGravar.length ? `Importar ${aGravar.length} lançamento(s)` : 'Nada para importar'}
            </button>
          )}
        </>
      }
    >
      <input ref={arquivo} type="file" multiple accept=".ofx,.OFX,.pdf,.PDF,application/pdf,application/x-ofx,application/ofx,text/plain" hidden onChange={lerArquivos} />

      <AvisoNavegador forte />
      {lendo && <p className="conferencia">⏳ Lendo PDF {lendo.atual} de {lendo.total}…</p>}

      {!extrato && !lendo && (
        <div className="bloco">
          <p>Escolha o extrato exportado do banco:</p>
          <ul className="dica lista-simples">
            <li><strong>PDF do Santander</strong> (extrato mensal ou de período): pode escolher vários de uma vez, por exemplo todos os meses desde 2024.</li>
            <li><strong>OFX</strong> de qualquer banco.</li>
          </ul>
          <p className="dica">O arquivo é lido só neste aparelho. Antes de gravar, o app confere tudo com os saldos do banco e mostra uma prévia.</p>
          <button className="botao primario cheio" onClick={() => arquivo.current?.click()}>Escolher arquivo(s)</button>
        </div>
      )}

      {extrato && !lendo && (
        <>
          <div className="painel">
            <div className="painel-titulo">
              <strong className="quebra">📄 {nomeArquivo}</strong>
              <button className="link" onClick={() => arquivo.current?.click()}>Trocar</button>
            </div>
            <span className="discreto">
              {extrato.transacoes.length} movimentações
              {extrato.inicio && extrato.fim ? ` · ${dataCurta(extrato.inicio)}/${extrato.inicio.slice(2, 4)} a ${dataCurta(extrato.fim)}/${extrato.fim.slice(2, 4)}` : ''}
              {nomeDoBanco(extrato.banco) ? ` · ${nomeDoBanco(extrato.banco)}` : ''}
            </span>
            {extrato.problemas?.length > 0 && (
              <span className="dica">⚠️ {extrato.problemas.length} linha(s) não puderam ser lidas e ficaram de fora: {extrato.problemas.map((p) => `${p.descricao} (${p.motivo})`).join('; ')}</span>
            )}
          </div>

          {extrato.conferencia && (
            <div className={`conferencia ${extrato.conferencia.ok ? 'ok' : 'diferente'}`}>
              {extrato.conferencia.ok ? (
                <>
                  <strong>✅ {extrato.arquivos.length} extrato(s) conferido(s) com o banco</strong>
                  <span>{extrato.arquivos.reduce((s, a) => s + a.saldosConferidos, 0)} saldos impressos pelo banco batem com a leitura, e os meses emendam sem faltar nada.</span>
                </>
              ) : (
                <>
                  <strong>⚠️ A leitura não bateu com o banco. Nada será importado.</strong>
                  {extrato.conferencia.erros.slice(0, 8).map((e, i) => <span key={i} className="dica">• {e}</span>)}
                  {extrato.conferencia.erros.length > 8 && <span className="dica">… e mais {extrato.conferencia.erros.length - 8}.</span>}
                </>
              )}
            </div>
          )}

          <div className="bloco">
            <span className="rotulo">Importar para</span>
            <Chips rolavel valor={destino} aoMudar={mudarDestino} opcoes={[
              ...contas.map((c) => ({ valor: `conta:${c.id}`, rotulo: c.nome, emoji: c.emoji })),
              ...(extrato.origem === 'pdf-santander' ? [] : cartoes.map((c) => ({ valor: `cartao:${c.id}`, rotulo: c.nome, emoji: '💳' }))),
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

          {saldoInicialPossivel && (
            <label className="alternar painel">
              <input type="checkbox" checked={usarSaldoInicial} onChange={(e) => setUsarSaldoInicial(e.target.checked)} />
              <span>Usar {formatar(extrato.saldoInicial.valor)} (saldo em {extrato.saldoInicial.data.split('-').reverse().join('/')}) como saldo inicial de {contaPorId.get(dest.id)?.nome}. Assim o saldo do app fica igual ao do banco.</span>
            </label>
          )}

          {dest?.tipo === 'conta' && (grupos.investimento > 0 || grupos.pixProprio > 0 || grupos.pagamentoCartao.size > 0 || grupos.pixConta.size > 0) && (
            <div className="painel regras-imp">
              <h3>Linhas que não são gasto nem receita</h3>
              {grupos.investimento > 0 && (
                <label className="campo">
                  <span className="rotulo">{grupos.investimento} aplicação(ões)/resgate(s) de investimento: transferir para</span>
                  <select className="seletor" value={regrasImp.contaInvestimentos ?? ''} onChange={(e) => { setRegrasImp((r) => ({ ...r, contaInvestimentos: e.target.value || null })); setAjustes({}) }}>
                    {!contas.some((c) => /invest/i.test(c.nome)) && <option value={NOVA_CONTA_INVESTIMENTOS}>📈 Nova conta "Investimentos {contaPorId.get(dest.id)?.nome}"</option>}
                    {outrasContas.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                    <option value="">Não: lançar como gasto/receita</option>
                  </select>
                </label>
              )}
              {grupos.pixProprio > 0 && (
                <label className="campo">
                  <span className="rotulo">{grupos.pixProprio} PIX/transferência(s) com o seu nome: transferir para</span>
                  <select className="seletor" value={regrasImp.contaPixProprio ?? ''} onChange={(e) => { setRegrasImp((r) => ({ ...r, contaPixProprio: e.target.value || null })); setAjustes({}) }}>
                    {outrasContas.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                    <option value="">Não: lançar como gasto/receita</option>
                  </select>
                </label>
              )}
              {[...grupos.pixConta.entries()].map(([chave, g]) => {
                const escolhida = regrasImp.contaPorPix?.[chave] !== undefined ? (regrasImp.contaPorPix[chave] ?? '') : (g.contaId ?? '')
                const nomeNova = nomeDaNovaConta(escolhida)
                const gasto = regrasImp.gastoPorPix?.[chave] ?? ''
                return (
                  <div key={chave} className="regra-destino">
                    <label className="campo">
                      <span className="rotulo">
                        {g.proprio
                          ? `${g.n} PIX com o seu nome para ${descreverDestino(chave)} (${formatar(g.total)}): transferir para`
                          : `${g.n} PIX com a conta ${descreverDestino(chave)}: é sua? Transferir para`}
                      </span>
                      <select className="seletor" value={escolhida} onChange={(e) => { setRegrasImp((r) => ({ ...r, contaPorPix: { ...r.contaPorPix, [chave]: e.target.value || null } })); setAjustes({}) }}>
                        {nomeNova && <option value={escolhida}>🏦 Nova conta "{nomeNova}"</option>}
                        {outrasContas.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                        <option value="">{g.proprio ? 'Não: lançar como gasto' : 'Não é minha: lançar como gasto/receita'}</option>
                      </select>
                    </label>
                    {escolhida && g.saidas > 0 && (
                      <label className="campo">
                        <span className="rotulo">Lá, esse dinheiro foi usado para pagar alguma coisa?</span>
                        <select className="seletor" value={gasto} onChange={(e) => { setRegrasImp((r) => ({ ...r, gastoPorPix: { ...r.gastoPorPix, [chave]: e.target.value || null } })); setAjustes({}) }}>
                          <option value="">Não, ficou guardado lá (só transferência)</option>
                          {categoriasDo('despesa').map((c) => <option key={c.id} value={c.id}>Sim, pagamento: {c.emoji} {c.nome}</option>)}
                        </select>
                        {gasto && <span className="dica">Cada PIX entra como transferência e, no mesmo dia, como gasto em {categoriaPorId.get(gasto)?.nome} saindo de {nomeNova || contaPorId.get(escolhida)?.nome}. Assim o gasto aparece nos relatórios e o saldo de lá não fica inflado.</span>}
                      </label>
                    )}
                  </div>
                )
              })}
              {[...grupos.pagamentoCartao.entries()].map(([ident, g]) => {
                const valor = regrasImp.cartaoPorPagamento?.[ident] !== undefined ? (regrasImp.cartaoPorPagamento[ident] ?? '') : (g.cartaoId ?? '')
                const nomeNovo = nomeDoNovoCartao(valor)
                const dias = nomeNovo ? diasEstimados(g.datas) : null
                return (
                  <label key={ident} className="campo">
                    <span className="rotulo">{g.n} pagamento(s) "{ident}": fatura do cartão</span>
                    <select className="seletor" value={valor} onChange={(e) => { setRegrasImp((r) => ({ ...r, cartaoPorPagamento: { ...r.cartaoPorPagamento, [ident]: e.target.value || null } })); setAjustes({}) }}>
                      {cartoes.map((c) => <option key={c.id} value={c.id}>💳 {c.nome}</option>)}
                      {nomesCartaoNovo(valor).map((n) => <option key={n} value={novoCartao(n)}>🆕 Novo cartão "{n}"</option>)}
                      <option value="">Não é fatura de cartão: lançar como gasto</option>
                    </select>
                    {nomeNovo && <span className="dica">O cartão "{nomeNovo}" será criado com vencimento no dia {dias.diaVencimento} e fechamento no dia {dias.diaFechamento} (estimados pelos pagamentos). Confira depois em Cartões.</span>}
                  </label>
                )
              })}
              {grupos.pagamentoCartao.size > 0 && regrasImp.historico && (
                <p className="dica">Pagamentos de fatura saem do saldo da conta e não contam como gasto. As compras de cada fatura entram quando você importar as faturas do cartão.</p>
              )}
            </div>
          )}

          {previa && (
            <div className="resumo-importacao">
              <span>🆕 {previa.resumo.novos} novas</span>
              {previa.resumo.duplicados > 0 && <span>👯 {previa.resumo.duplicados} parecem já lançadas</span>}
              {previa.resumo.importados > 0 && <span>✅ {previa.resumo.importados} já importadas</span>}
              {previa.resumo.creditos > 0 && <span>↩️ {previa.resumo.creditos} créditos no cartão</span>}
            </div>
          )}

          {conferencia && !bloqueado && (
            <div className={`conferencia ${conferencia.diferenca === 0 ? 'ok' : 'diferente'}`}>
              <strong>{conferencia.diferenca === 0 ? '✅ O saldo vai bater com o banco' : '⚠️ O saldo não vai bater com o banco'}</strong>
              <span>Banco em {conferencia.data.split('-').reverse().join('/')}: {formatar(conferencia.noExtrato)} · App: {formatar(conferencia.noApp)}</span>
              {conferencia.diferenca !== 0 && <span className="dica">Diferença de {formatar(Math.abs(conferencia.diferenca))}. Confira as linhas ignoradas, lançamentos manuais ou o saldo inicial da conta.</span>}
              {saldoDiferente && (
                <label className="alternar">
                  <input type="checkbox" checked={aceitarDiferenca} onChange={(e) => setAceitarDiferenca(e.target.checked)} />
                  <span>Importar mesmo assim (o saldo do app vai ficar diferente do banco)</span>
                </label>
              )}
            </div>
          )}

          <div className="abas" role="tablist">
            <button role="tab" aria-selected={filtro === 'atencao'} className={`aba ${filtro === 'atencao' ? 'ativa' : ''}`} onClick={() => { setFiltro('atencao'); setLimite(POR_PAGINA) }}>
              Para conferir ({naoImportados.filter(precisaAtencao).length})
            </button>
            <button role="tab" aria-selected={filtro === 'todas'} className={`aba ${filtro === 'todas' ? 'ativa' : ''}`} onClick={() => { setFiltro('todas'); setLimite(POR_PAGINA) }}>
              Todas ({naoImportados.length})
            </button>
          </div>
          {filtro === 'atencao' && listados.length === 0 && <p className="vazio">Nada precisa de atenção. Veja "Todas" para revisar as categorias.</p>}

          <div className="lista-importacao">
            {listados.slice(0, limite).map((i) => {
              const problema = problemaDoItem(i, dest)
              const nParecidas = ajustes[i.posicao] ? parecidas(i) : 0
              return (
                <div key={i.posicao} className={`item-importacao ${i.acao === 'ignorar' ? 'ignorado' : ''}`}>
                  <div className="item-imp-topo">
                    <span className="item-imp-desc">{i.descricao}</span>
                    <strong className={i.entrada ? 'entrada' : 'saida'}>{i.entrada ? '+' : '−'} {formatar(i.valor)}</strong>
                  </div>
                  <span className="discreto">
                    {i.data.split('-').reverse().join('/')}
                    {i.parcela ? ` · parcela ${i.parcela.parcela}/${i.parcela.total}` : ''}
                    {i.motivo ? ` · ${i.motivo}` : ''}
                  </span>
                  <div className="item-imp-controles">
                    <select className="seletor" aria-label="O que fazer" value={i.acao} onChange={(e) => mudarItem(i, { acao: e.target.value })}>
                      {(dest?.tipo === 'cartao' ? ACOES_CARTAO : ACOES_CONTA)
                        .filter((a) => !(a.valor === 'fatura' && (i.entrada || (!cartoes.length && !nomeDoNovoCartao(i.cartaoPagoId)))))
                        .map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
                    </select>
                    {i.acao === 'lancar' && (
                      <select className="seletor" aria-label="Categoria" value={i.categoriaId ?? ''} onChange={(e) => mudarItem(i, { categoriaId: e.target.value || null, categoriaEscolhida: true })}>
                        {categoriasDo(i.tipo).map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                      </select>
                    )}
                    {i.acao === 'transferencia' && (
                      <select className="seletor" aria-label={i.entrada ? 'Veio da conta' : 'Foi para a conta'} value={i.contaOutraId ?? ''} onChange={(e) => mudarItem(i, { contaOutraId: e.target.value || null })}>
                        <option value="">{i.entrada ? 'Veio de qual conta?' : 'Foi para qual conta?'}</option>
                        {i.contaOutraId === NOVA_CONTA_INVESTIMENTOS && <option value={NOVA_CONTA_INVESTIMENTOS}>📈 Nova conta de investimentos</option>}
                        {nomeDaNovaConta(i.contaOutraId) && <option value={i.contaOutraId}>🏦 Nova conta "{nomeDaNovaConta(i.contaOutraId)}"</option>}
                        {outrasContas.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
                      </select>
                    )}
                    {i.acao === 'fatura' && (
                      <select className="seletor" aria-label="Cartão" value={i.cartaoPagoId ?? ''} onChange={(e) => mudarItem(i, { cartaoPagoId: e.target.value || null })}>
                        {cartoes.map((c) => <option key={c.id} value={c.id}>💳 {c.nome}</option>)}
                        {nomesCartaoNovo(i.cartaoPagoId).map((n) => <option key={n} value={novoCartao(n)}>🆕 Novo cartão "{n}"</option>)}
                      </select>
                    )}
                  </div>
                  {i.acao === 'transferencia' && i.gastoCategoriaId && !i.entrada && <span className="dica">E lança como gasto em {categoriaPorId.get(i.gastoCategoriaId)?.nome} na outra conta.</span>}
                  {i.acao === 'fatura' && i.faturaPaga && <span className="dica">Quita a fatura de {nomeMes(i.faturaPaga)}{i.faturaSemCompras ? ' (compras ainda não importadas)' : ''}</span>}
                  {nParecidas > 0 && (
                    <button className="link" onClick={() => mudarItem(i, Object.fromEntries(Object.entries(ajustes[i.posicao]).filter(([k]) => ['acao', 'categoriaId', 'categoriaEscolhida', 'contaOutraId', 'cartaoPagoId'].includes(k))), true)}>
                      Aplicar o mesmo às outras {nParecidas} parecida(s)
                    </button>
                  )}
                  {problema && <span className="erro pequeno">{problema}</span>}
                </div>
              )
            })}
            {listados.length > limite && (
              <button className="botao secundario cheio" onClick={() => setLimite((l) => l + POR_PAGINA * 2)}>Mostrar mais ({listados.length - limite} restantes)</button>
            )}
            {previa && previa.resumo.importados > 0 && <p className="discreto centro">{previa.resumo.importados} linha(s) já importadas antes não aparecem aqui.</p>}
          </div>
        </>
      )}
    </Folha>
  )
}
