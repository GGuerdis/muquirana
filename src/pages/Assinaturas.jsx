// Assinaturas: cobranças que se repetem todo mês, achadas no histórico, com aviso quando o preço sobe
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { CabecaPagina, IconeCategoria } from '../components/Pecas.jsx'
import { FormRecorrente } from '../components/Formularios.jsx'
import { IconeAlerta, Ic } from '../components/Icones.jsx'
import { formatar } from '../lib/dinheiro.js'
import { dataCurta, mesAtual } from '../lib/datas.js'
import { acharAssinaturas, modeloContaFixa } from '../lib/assinaturas.js'
import { salvarConfig } from '../lib/db.js'

export default function Assinaturas({ irPara }) {
  const { lancamentos, recorrentes, categoriaPorId, contaPorId, cartaoPorId, config, podeEditar } = useDados()
  const [cadastrando, setCadastrando] = useState(null)
  const ignoradas = useMemo(() => new Set(config.assinaturasIgnoradas || []), [config.assinaturasIgnoradas])
  const todas = useMemo(() => acharAssinaturas(lancamentos, { recorrentes }), [lancamentos, recorrentes])
  const visiveis = todas.filter((a) => !ignoradas.has(a.chave))
  const sugestoes = visiveis.filter((a) => !a.ehContaFixa)
  const jaFixas = visiveis.filter((a) => a.ehContaFixa)
  const subiram = visiveis.filter((a) => a.subiu)
  const porMes = visiveis.reduce((s, a) => s + a.valor, 0)

  const ignorar = (chave) => salvarConfig('assinaturasIgnoradas', [...ignoradas, chave])
  const voltarIgnoradas = () => salvarConfig('assinaturasIgnoradas', [])
  const origem = (a) => (a.cartaoId != null ? `Cartão ${cartaoPorId.get(a.cartaoId)?.nome ?? ''}` : contaPorId.get(a.contaId)?.nome ?? '')

  const Linha = ({ a, acoes }) => (
    <div className="linha-assinatura">
      <IconeCategoria categoria={categoriaPorId.get(a.categoriaId)} />
      <div className="linha-assinatura-textos">
        <strong>{a.descricao}</strong>
        <small>todo dia {a.dia} · {a.meses} meses seguidos · {origem(a)}</small>
        {a.subiu && <small className="subiu"><Ic i={IconeAlerta} className="atencao" /> subiu de {formatar(a.valorAnterior)} em {dataCurta(a.ultimaData)}</small>}
        {acoes}
      </div>
      <span className="linha-assinatura-valor">{formatar(a.valor)}<small>{formatar(a.porAno)}/ano</small></span>
    </div>
  )

  return (
    <div className="pagina">
      <CabecaPagina titulo="Assinaturas" irPara={irPara} />

      <section className="heroi">
        <div className="sol-canto" aria-hidden="true" />
        <span className="rotulo">Cobranças que se repetem, por mês</span>
        <strong className="valor-grande">{formatar(porMes)}</strong>
        <span className="previsao">{formatar(porMes * 12)} por ano · {visiveis.length} {visiveis.length === 1 ? 'cobrança' : 'cobranças'}</span>
      </section>

      {subiram.length > 0 && (
        <p className="aviso-linha"><Ic i={IconeAlerta} className="atencao" />
          {subiram.length === 1 ? `${subiram[0].descricao} ficou mais cara: de ${formatar(subiram[0].valorAnterior)} para ${formatar(subiram[0].valor)}.` : `${subiram.length} cobranças ficaram mais caras. Veja abaixo.`}
        </p>
      )}

      {sugestoes.length > 0 && (
        <section className="painel">
          <h3>Achadas no seu histórico</h3>
          <p className="dica">Virar conta fixa faz ela aparecer todo mês no Início e entrar na Previsão.</p>
          {sugestoes.map((a) => (
            <Linha key={a.chave} a={a} acoes={podeEditar && (
              <span className="linha-assinatura-acoes">
                <button className="link" onClick={() => setCadastrando(a)}>Virar conta fixa</button>
                <button className="link discreto" onClick={() => ignorar(a.chave)}>Não é assinatura</button>
              </span>
            )} />
          ))}
        </section>
      )}

      {jaFixas.length > 0 && (
        <section className="painel">
          <h3>Já são contas fixas</h3>
          {jaFixas.map((a) => <Linha key={a.chave} a={a} />)}
        </section>
      )}

      {visiveis.length === 0 && (
        <section className="painel vazio-grande">
          <p>Nenhuma cobrança repetida encontrada nos últimos 6 meses.</p>
          <p className="dica">Uma cobrança entra aqui quando aparece uma vez por mês, com valor parecido, em pelo menos 3 meses.</p>
        </section>
      )}
      {ignoradas.size > 0 && <button className="link centro-pagina" onClick={voltarIgnoradas}>Mostrar de novo as {ignoradas.size} que você tirou</button>}

      {cadastrando && <FormRecorrente modelo={modeloContaFixa(cadastrando, mesAtual())} aoFechar={() => setCadastrando(null)} />}
    </div>
  )
}
