// Contas fixas do mês, para confirmar com um toque
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { formatar } from '../lib/dinheiro.js'
import { dataCurta, nomeMes } from '../lib/datas.js'
import { contasDoMes, modeloDoMes, pularMes } from '../lib/recorrentes.js'

const SITUACAO = {
  pendente: { rotulo: 'a lançar', classe: '' },
  atrasada: { rotulo: '⚠️ venceu', classe: 'saida' },
  lancada: { rotulo: '✅ lançada', classe: 'entrada' },
  pulada: { rotulo: 'pulada este mês', classe: 'discreto' },
}

export default function ContasDoMes({ mes, irPara }) {
  const { recorrentes, lancamentos, categoriaPorId, contaPorId, cartaoPorId, abrirModelo, avisar } = useDados()
  const lista = useMemo(() => contasDoMes(mes, recorrentes, lancamentos), [mes, recorrentes, lancamentos])
  const [ocupado, setOcupado] = useState(false)

  if (!recorrentes.length) {
    return (
      <section className="painel">
        <h3>Contas fixas</h3>
        <p className="dica">Cadastre aluguel, assinaturas, salário e outras contas que se repetem. Elas aparecem aqui todo mês para você confirmar com um toque.</p>
        <button className="link" onClick={() => irPara('ajustes')}>+ Cadastrar contas fixas</button>
      </section>
    )
  }
  if (!lista.length) return null

  const faltam = lista.filter((x) => x.situacao === 'pendente' || x.situacao === 'atrasada')
  const totalFalta = faltam.reduce((s, x) => s + (x.recorrente.tipo === 'despesa' ? x.recorrente.valor : 0), 0)

  async function pular(x, pular) {
    if (ocupado) return
    setOcupado(true)
    try {
      await pularMes(x.recorrente.id, mes, pular)
      if (pular) avisar(`${x.recorrente.descricao}: pulada em ${nomeMes(mes)}.`)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section className="painel">
      <div className="painel-titulo">
        <h3>Contas fixas de {nomeMes(mes)}</h3>
        {totalFalta > 0 && <span className="discreto">faltam {formatar(totalFalta)}</span>}
      </div>
      {lista.map((x) => {
        const r = x.recorrente
        const cat = categoriaPorId.get(r.categoriaId)
        const onde = r.cartaoId ? `💳 ${cartaoPorId.get(r.cartaoId)?.nome ?? ''}` : contaPorId.get(r.contaId)?.nome ?? ''
        const s = SITUACAO[x.situacao]
        const valor = x.lancamento ? x.lancamento.valor : r.valor
        return (
          <div key={r.id} className="linha-fixa">
            <span className="item-emoji">{cat?.emoji || '📦'}</span>
            <span className="item-textos">
              <span className="item-titulo">{r.descricao}</span>
              <span className="item-sub">vence {dataCurta(x.vencimento)} · {onde} · <span className={s.classe}>{s.rotulo}</span></span>
            </span>
            <span className="fixa-direita">
              <strong className={r.tipo === 'receita' ? 'entrada' : ''}>{r.tipo === 'receita' ? '+' : ''}{formatar(valor)}</strong>
              {(x.situacao === 'pendente' || x.situacao === 'atrasada') && (
                <span className="fixa-botoes">
                  <button className="link" onClick={() => pular(x, true)} disabled={ocupado}>Pular</button>
                  <button className="botao primario mini" onClick={() => abrirModelo(modeloDoMes(r, mes))}>Lançar</button>
                </span>
              )}
              {x.situacao === 'pulada' && <button className="link" onClick={() => pular(x, false)} disabled={ocupado}>Desfazer</button>}
            </span>
          </div>
        )
      })}
    </section>
  )
}
