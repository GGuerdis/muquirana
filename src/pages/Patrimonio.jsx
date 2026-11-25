// Patrimônio: contas menos dívidas no cartão, hoje e no fim de cada mês do último ano
import { useMemo } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, Bloco, MarcaConta, MarcaCartao } from '../components/Pecas.jsx'
import { GraficoLinha } from '../components/Graficos.jsx'
import { formatar } from '../lib/dinheiro.js'
import { nomeMes } from '../lib/datas.js'
import { patrimonio, evolucaoPatrimonio } from '../lib/patrimonio.js'

export default function Patrimonio({ irPara }) {
  const { contas, cartoes, lancamentos } = useDados()
  const hoje = useMemo(() => patrimonio({ contas, cartoes, lancamentos }), [contas, cartoes, lancamentos])
  const evolucao = useMemo(() => evolucaoPatrimonio({ contas, cartoes, lancamentos }), [contas, cartoes, lancamentos])
  const ha12 = evolucao[0]
  const mudou = hoje.liquido - (ha12?.liquido ?? hoje.liquido)

  return (
    <div className="pagina">
      <CabecaPagina titulo="Patrimônio" irPara={irPara} />
      <section className="heroi">
        <div className="sol-canto" aria-hidden="true" />
        <span className="rotulo">Patrimônio hoje</span>
        <strong className="valor-grande">{formatar(hoje.liquido)}</strong>
        <span className="previsao">{mudou === 0 ? 'Igual a' : mudou > 0 ? `+ ${formatar(mudou)} desde` : `− ${formatar(-mudou)} desde`} o fim de {nomeMes(ha12.mes)}</span>
      </section>
      <div className="blocos">
        <Bloco rotulo="Nas contas" valor={formatar(hoje.nasContas)} tom={hoje.nasContas >= 0 ? 'entrada' : 'saida'} />
        <Bloco rotulo="Dívidas no cartão" valor={formatar(hoje.dividas)} tom={hoje.dividas ? 'saida' : undefined} extra="faturas e parcelas" />
      </div>

      <section className="painel">
        <h3>Patrimônio no fim de cada mês</h3>
        <GraficoLinha rotuloAcessivel="Patrimônio no fim de cada mês dos últimos 12 meses" series={[{ nome: 'Patrimônio', cor: 'var(--serie-1)' }]} formatar={formatar}
          pontos={evolucao.map((p) => ({ rotulo: nomeMes(p.mes, true), titulo: `fim de ${nomeMes(p.mes)}`, valores: [p.liquido] }))} />
      </section>

      <section className="painel">
        <h3>Contas</h3>
        {hoje.porConta.map(({ conta, saldo }) => (
          <div key={conta.id} className="linha-patrimonio">
            <span className="com-marca"><MarcaConta conta={conta} />{conta.nome}</span>
            <b className={saldo < 0 ? 'saida' : undefined}>{formatar(saldo)}</b>
          </div>
        ))}
      </section>

      {hoje.porCartao.length > 0 && (
        <section className="painel">
          <h3>Dívidas no cartão</h3>
          {hoje.porCartao.map(({ cartao, total, futuras }) => (
            <div key={cartao.id} className="linha-patrimonio">
              <span className="com-marca"><MarcaCartao />{cartao.nome}{futuras > 0 && <small>{formatar(futuras)} em parcelas futuras</small>}</span>
              <b className="saida">{formatar(total)}</b>
            </div>
          ))}
        </section>
      )}
      <p className="dica centro-pagina">Investimentos ainda não entram nesta conta.</p>
    </div>
  )
}
