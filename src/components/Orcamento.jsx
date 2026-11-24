// Orçamento por categoria: barras no Início e formulário em Ajustes
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import Folha from './Folha.jsx'
import { IconeCategoria } from './Pecas.jsx'
import { CampoValor } from './Campos.jsx'
import { formatar } from '../lib/dinheiro.js'
import { nomeMes } from '../lib/datas.js'
import { orcamentoDoMes, definirOrcamento } from '../lib/orcamento.js'

// Situação sempre com ícone + texto (nunca só cor)
function textoSituacao(i) {
  if (i.situacao === 'estourado') return { icone: '🚨', texto: `passou ${formatar(i.gasto - i.limite)}` }
  if (i.situacao === 'alerta') return { icone: '⚠️', texto: `${i.porcentagem}% · restam ${formatar(i.restante)}` }
  return { icone: '', texto: `restam ${formatar(i.restante)}` }
}

export function OrcamentoDoMes({ mes, irPara }) {
  const { orcamentos, lancamentos, categoriaPorId } = useDados()
  const dados = useMemo(() => orcamentoDoMes(mes, orcamentos, lancamentos), [mes, orcamentos, lancamentos])

  if (!orcamentos.length) {
    return (
      <section className="painel">
        <h3>Orçamento</h3>
        <p className="dica">Defina quanto quer gastar por mês em cada categoria (ex.: Alimentação até R$ 800). O Mukirana avisa quando chegar perto.</p>
        <button className="link" onClick={() => irPara('ajustes')}>+ Definir orçamento</button>
      </section>
    )
  }

  return (
    <section className="painel">
      <div className="painel-titulo">
        <h3>Orçamento de {nomeMes(mes)}</h3>
        <span className="discreto">{formatar(dados.gastoTotal)} de {formatar(dados.limiteTotal)}</span>
      </div>
      <ul className="barras">
        {dados.itens.map((i) => {
          const cat = categoriaPorId.get(i.categoriaId)
          const s = textoSituacao(i)
          const largura = Math.min(100, (i.gasto / i.limite) * 100)
          return (
            <li key={i.categoriaId} className="barra-linha">
              <div className="barra-topo">
                <span className="com-icone"><IconeCategoria categoria={cat} pequeno />{cat?.nome}</span>
                <span className="barra-valor">{formatar(i.gasto)} <small>de {formatar(i.limite)}</small></span>
              </div>
              <div className="barra-trilho"><div className={`barra orc-${i.situacao}`} style={{ width: `${Math.max(largura, i.gasto ? 2 : 0)}%` }} /></div>
              <span className={`orc-texto orc-texto-${i.situacao}`}>{s.icone} {s.texto}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function FormOrcamento({ categoria, aoFechar }) {
  const { orcamentos, avisar } = useDados()
  const atual = orcamentos.find((o) => o.categoriaId === categoria.id)
  const [limite, setLimite] = useState(atual?.limite || 0)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function salvar(valor) {
    if (ocupado) return
    setOcupado(true)
    try {
      await definirOrcamento(categoria.id, valor)
      avisar(valor ? `Orçamento de ${categoria.nome}: ${formatar(valor)} por mês.` : `Orçamento de ${categoria.nome} removido.`)
      aoFechar()
    } catch (e) {
      setErro(e.message)
      setOcupado(false)
    }
  }

  return (
    <Folha titulo={`Orçamento: ${categoria.emoji} ${categoria.nome}`} aoFechar={aoFechar} rodape={
      <>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <div className="linha-botoes">
          {atual && <button className="botao secundario" disabled={ocupado} onClick={() => salvar(0)}>Remover limite</button>}
          <button className="botao primario cheio" disabled={ocupado} onClick={() => (limite ? salvar(limite) : setErro('Informe o limite ou toque em Remover.'))}>Salvar</button>
        </div>
      </>
    }>
      <CampoValor grande rotulo="Limite por mês" valor={limite} aoMudar={(v) => { setErro(''); setLimite(v) }} />
      <p className="dica">Vale para todos os meses. Você recebe um aviso ao passar de 80% e outro se estourar. Compras parceladas contam no mês de cada parcela.</p>
    </Folha>
  )
}
