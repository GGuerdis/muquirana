// Histórico: evolução do saldo, entradas e saídas por ano / mês / dia, e comparações entre meses e anos
import { useMemo, useState } from 'react'
import { useDados } from '../dados.jsx'
import { Abas, Chips } from '../components/Campos.jsx'
import { CabecaPagina, ResumoEntradasSaidas, MarcaConta, IconeCategoria } from '../components/Pecas.jsx'
import { IconeGrafico } from '../components/Icones.jsx'
import { GraficoBarras, GraficoLinha, Legenda, TabelaDados } from '../components/Graficos.jsx'
import { formatar } from '../lib/dinheiro.js'
import { hoje as hojeTexto, mesAtual, nomeMes, somarMeses } from '../lib/datas.js'
import { movimentos, saldoInicialDe, serie, compararMeses, compararAnos, periodosDisponiveis, gastosPorCategoria } from '../lib/historico.js'

// entrou em ciano e saiu em magenta (como no Início); comparações: A ciano, B magenta
const COR = { saldo: 'var(--serie-1)', entradas: 'var(--serie-1)', saidas: 'var(--serie-2)', a: 'var(--serie-1)', b: 'var(--serie-2)' }
const TODAS = '__todas__'
// Como ver o histórico: uma fileira só (antes eram duas: Evolução/Comparar e Anual/Mês/Dia)
const VISTAS = [{ valor: 'ano', rotulo: 'Anos' }, { valor: 'mes', rotulo: 'Meses' }, { valor: 'dia', rotulo: 'Dias' }, { valor: 'comparar', rotulo: 'Comparar' }]
const SEM_CATEGORIA = '__sem__'
// Nas comparações, o mês sempre com o ano ("outubro 2026"), para não confundir
const mesComAno = (m, curto = false) => { const n = nomeMes(m, curto); return /\d/.test(n) ? n : `${n} ${curto ? m.slice(2, 4) : m.slice(0, 4)}` }

function Variacao({ valor, inverso = false }) {
  if (valor == null) return <span className="discreto">—</span>
  const subiu = valor > 0
  const bom = inverso ? !subiu : subiu
  return <span className={`variacao ${valor === 0 ? '' : bom ? 'boa' : 'ruim'}`}>{subiu ? '▲' : valor < 0 ? '▼' : '='} {Math.abs(valor).toLocaleString('pt-BR')}%</span>
}

export default function Historico({ irPara }) {
  const { contas, lancamentos, categoriaPorId } = useDados()
  const hoje = hojeTexto()
  // conta padrão: a que tem mais movimentações
  const contaPadrao = useMemo(() => {
    const n = new Map()
    for (const l of lancamentos) if (l.contaId) n.set(l.contaId, (n.get(l.contaId) || 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? TODAS
  }, [lancamentos])
  const [contaSel, setContaSel] = useState(null)
  const conta = contaSel ?? contaPadrao
  const [modo, setModo] = useState('evolucao')
  const [gran, setGran] = useState('mes')
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)))
  const [mes, setMes] = useState(mesAtual())
  const [tabela, setTabela] = useState(false)
  const [compara, setCompara] = useState('anos')
  const [mesA, setMesA] = useState(somarMeses(mesAtual(), -1))
  const [mesB, setMesB] = useState(mesAtual())
  const [anoA, setAnoA] = useState(Number(hoje.slice(0, 4)) - 1)
  const [anoB, setAnoB] = useState(Number(hoje.slice(0, 4)))
  const [medidaAnos, setMedidaAnos] = useState('saidas')
  const [catSel, setCatSel] = useState(null)

  const contaId = conta === TODAS ? null : conta
  const movs = useMemo(() => movimentos(lancamentos, contaId), [lancamentos, contaId])
  const saldoIni = saldoInicialDe(contas, contaId)
  const disp = useMemo(() => periodosDisponiveis(movs, hoje), [movs, hoje])
  const dados = useMemo(() => serie({ granularidade: gran, ano, mes, movs, saldoInicial: saldoIni, hoje }), [gran, ano, mes, movs, saldoIni, hoje])
  const totais = dados.reduce((s, p) => ({ entradas: s.entradas + p.entradas, saidas: s.saidas + p.saidas }), { entradas: 0, saidas: 0 })
  const cmpMeses = useMemo(() => compararMeses(movs, mesA, mesB, hoje), [movs, mesA, mesB, hoje])
  const cmpAnos = useMemo(() => compararAnos(movs, anoA, anoB, hoje), [movs, anoA, anoB, hoje])
  // Gastos de uma categoria ao longo dos meses (ou anos)
  const porCategoria = useMemo(() => gastosPorCategoria(lancamentos, { granularidade: gran === 'ano' ? 'ano' : 'mes', ano, hoje }), [lancamentos, gran, ano, hoje])
  const catsTop = porCategoria.categorias.slice(0, 8)
  const catAtual = catsTop.some((x) => (x.categoriaId ?? SEM_CATEGORIA) === catSel) ? catSel : (catsTop[0] ? (catsTop[0].categoriaId ?? SEM_CATEGORIA) : null)
  const nomeCat = (id) => (id == null || id === SEM_CATEGORIA ? 'Sem categoria' : categoriaPorId.get(id)?.nome || 'Categoria apagada')
  const serieCat = catAtual == null ? [] : porCategoria.serieDe(catAtual === SEM_CATEGORIA ? null : catAtual)
  const totalCat = serieCat.reduce((s, p) => s + (p.valor || 0), 0)
  const periodosCat = serieCat.filter((p) => p.valor != null).length || 1

  const nomeConta = contaId ? contas.find((c) => c.id === contaId)?.nome : 'todas as contas'
  const tituloPeriodo = gran === 'ano' ? 'por ano' : gran === 'mes' ? `em ${ano}` : `em ${nomeMes(mes)}${mes.slice(0, 4) === hoje.slice(0, 4) ? ` de ${mes.slice(0, 4)}` : ''}`
  const rotuloPeriodo = (p) => (gran === 'ano' ? p.rotulo : gran === 'mes' ? nomeMes(p.chave) : p.chave.split('-').reverse().join('/'))

  if (!lancamentos.length) {
    return (
      <div className="pagina">
        <CabecaPagina titulo="Histórico" irPara={irPara} />
        <div className="painel vazio-grande"><p className="vazio-icone"><IconeGrafico /></p><p>Ainda não há lançamentos. Importe seus extratos em Lançamentos → Importar extrato para ver todo o seu histórico aqui.</p></div>
      </div>
    )
  }

  return (
    <div className="pagina">
      <CabecaPagina titulo="Histórico" irPara={irPara} />

      <Chips rolavel valor={conta} aoMudar={setContaSel} opcoes={[
        ...contas.map((c) => ({ valor: c.id, rotulo: c.nome, marca: <MarcaConta conta={c} /> })),
        { valor: TODAS, rotulo: 'Todas' },
      ]} />

      <Abas opcoes={VISTAS} valor={modo === 'comparar' ? 'comparar' : gran} aoMudar={(v) => { if (v === 'comparar') setModo('comparar'); else { setModo('evolucao'); setGran(v) } }} />

      {modo === 'evolucao' && (
        <>
          {gran === 'mes' && (
            <div className="seletor-mes">
              <button className="botao-icone" aria-label="Ano anterior" onClick={() => setAno(ano - 1)} disabled={ano <= disp.anos[0]}>‹</button>
              <span className="mes-nome">{ano}</span>
              <button className="botao-icone" aria-label="Próximo ano" onClick={() => setAno(ano + 1)} disabled={ano >= disp.anos[disp.anos.length - 1]}>›</button>
            </div>
          )}
          {gran === 'dia' && (
            <div className="seletor-mes">
              <button className="botao-icone" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))} disabled={mes <= disp.meses[0]}>‹</button>
              <span className="mes-nome">{nomeMes(mes)}</span>
              <button className="botao-icone" aria-label="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))} disabled={mes >= disp.meses[disp.meses.length - 1]}>›</button>
            </div>
          )}

          <ResumoEntradasSaidas entrou={totais.entradas} saiu={totais.saidas} rotulo={gran === 'ano' ? 'no período' : gran === 'mes' ? `em ${ano}` : 'no mês'} />

          <section className="painel">
            <h3>{contaId ? `Saldo da conta ${nomeConta}` : 'Saldo de todas as contas'} {gran === 'ano' ? 'no fim de cada ano' : gran === 'mes' ? `no fim de cada mês de ${ano}` : `no fim de cada dia`}</h3>
            <GraficoLinha
              rotuloAcessivel={`Saldo ${tituloPeriodo}`}
              series={[{ nome: 'Saldo', cor: COR.saldo }]}
              formatar={formatar}
              pontos={dados.map((p) => ({ rotulo: p.rotulo, titulo: rotuloPeriodo(p), valores: [p.saldoFim] }))}
            />
          </section>

          <section className="painel">
            <h3>Entradas e saídas {tituloPeriodo}</h3>
            <Legenda series={[{ nome: 'Entradas', cor: COR.entradas }, { nome: 'Saídas', cor: COR.saidas }]} />
            <GraficoBarras
              rotuloAcessivel={`Entradas e saídas ${tituloPeriodo}`}
              series={[{ nome: 'Entradas', cor: COR.entradas }, { nome: 'Saídas', cor: COR.saidas }]}
              formatar={formatar}
              pontos={dados.map((p) => ({ rotulo: p.rotulo, titulo: rotuloPeriodo(p), valores: [p.entradas, p.saidas] }))}
            />
            <button className="link" onClick={() => setTabela((t) => !t)}>{tabela ? 'Esconder tabela' : 'Ver em tabela'}</button>
            {tabela && (
              <TabelaDados
                colunas={[gran === 'ano' ? 'Ano' : gran === 'mes' ? 'Mês' : 'Dia', 'Entrou', 'Saiu', 'Resultado', 'Saldo no fim']}
                linhas={dados.filter((p) => p.saldoFim != null).map((p) => [rotuloPeriodo(p), formatar(p.entradas), formatar(p.saidas), formatar(p.resultado), formatar(p.saldoFim)])}
              />
            )}
          </section>
          {gran !== 'dia' && catsTop.length > 0 && (
            <section className="painel">
              <h3>Gastos por categoria {gran === 'ano' ? 'por ano' : `em ${ano}`}</h3>
              <Chips rolavel valor={catAtual} aoMudar={setCatSel} opcoes={catsTop.map((x) => ({ valor: x.categoriaId ?? SEM_CATEGORIA, rotulo: nomeCat(x.categoriaId) }))} />
              <GraficoBarras
                rotuloAcessivel={`Gastos com ${nomeCat(catAtual)} ${gran === 'ano' ? 'por ano' : `por mês em ${ano}`}`}
                series={[{ nome: nomeCat(catAtual), cor: COR.saidas }]}
                formatar={formatar}
                pontos={serieCat.map((p) => ({ rotulo: p.rotulo, titulo: gran === 'ano' ? p.rotulo : nomeMes(p.chave), valores: [p.valor] }))}
              />
              <p className="dica">{nomeCat(catAtual)}: {formatar(totalCat)} {gran === 'ano' ? 'no total' : `em ${ano}`} · média de {formatar(Math.round(totalCat / periodosCat))} por {gran === 'ano' ? 'ano' : 'mês'}. Inclui compras no cartão.</p>
            </section>
          )}
          <p className="dica">Visão do dinheiro que entrou e saiu {contaId ? `da conta ${nomeConta} (inclui transferências e pagamentos de fatura)` : 'das suas contas (transferências entre as suas contas não contam)'}. Toque no gráfico para ver os valores.</p>
        </>
      )}

      {modo === 'comparar' && (
        <>
          <Abas pequenas opcoes={[{ valor: 'anos', rotulo: 'Anos' }, { valor: 'meses', rotulo: 'Meses' }]} valor={compara} aoMudar={setCompara} />

          {compara === 'anos' && (
            <>
              <div className="duas-colunas">
                <label className="campo"><span className="rotulo">Ano A</span>
                  <select className="seletor" value={anoA} onChange={(e) => setAnoA(Number(e.target.value))}>{disp.anos.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                </label>
                <label className="campo"><span className="rotulo">Ano B</span>
                  <select className="seletor" value={anoB} onChange={(e) => setAnoB(Number(e.target.value))}>{disp.anos.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                </label>
              </div>
              <section className="painel comparacao">
                <h3>{anoA} x {anoB}{cmpAnos.mesesComparados < 12 ? ` (jan a ${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][cmpAnos.mesesComparados - 1]}, mesmos meses)` : ''}</h3>
                <div className="linha-comparacao"><span>Saiu</span><span>{formatar(cmpAnos.ateAgoraA.saidas)}</span><span>{formatar(cmpAnos.ateAgoraB.saidas)}</span><Variacao valor={cmpAnos.variacaoSaidas} inverso /></div>
                <div className="linha-comparacao"><span>Entrou</span><span>{formatar(cmpAnos.ateAgoraA.entradas)}</span><span>{formatar(cmpAnos.ateAgoraB.entradas)}</span><Variacao valor={cmpAnos.variacaoEntradas} /></div>
                <div className="linha-comparacao cabeca"><span /><span>{anoA}</span><span>{anoB}</span><span>variação</span></div>
              </section>
              <section className="painel">
                <div className="painel-titulo">
                  <h3>Mês a mês</h3>
                </div>
                <Abas pequenas opcoes={[{ valor: 'saidas', rotulo: 'Saídas' }, { valor: 'entradas', rotulo: 'Entradas' }, { valor: 'resultado', rotulo: 'Sobrou' }]} valor={medidaAnos} aoMudar={setMedidaAnos} />
                <Legenda series={[{ nome: String(anoA), cor: COR.a }, { nome: String(anoB), cor: COR.b }]} />
                <GraficoBarras
                  rotuloAcessivel={`${medidaAnos} por mês, ${anoA} contra ${anoB}`}
                  series={[{ nome: String(anoA), cor: COR.a }, { nome: String(anoB), cor: COR.b }]}
                  formatar={formatar}
                  pontos={cmpAnos.meses.map((m, i) => ({
                    rotulo: m.rotulo,
                    valores: [m.a[medidaAnos], `${anoB}-${String(i + 1).padStart(2, '0')}` > hoje.slice(0, 7) ? null : m.b[medidaAnos]],
                  }))}
                />
                <button className="link" onClick={() => setTabela((t) => !t)}>{tabela ? 'Esconder tabela' : 'Ver em tabela'}</button>
                {tabela && (
                  <TabelaDados colunas={['Mês', String(anoA), String(anoB)]} linhas={cmpAnos.meses.map((m) => [m.rotulo, formatar(m.a[medidaAnos]), formatar(m.b[medidaAnos])])} />
                )}
              </section>
            </>
          )}

          {compara === 'meses' && (
            <>
              <div className="duas-colunas">
                <label className="campo"><span className="rotulo">Mês A</span>
                  <select className="seletor" value={mesA} onChange={(e) => setMesA(e.target.value)}>{[...disp.meses].reverse().map((m) => <option key={m} value={m}>{mesComAno(m)}</option>)}</select>
                </label>
                <label className="campo"><span className="rotulo">Mês B</span>
                  <select className="seletor" value={mesB} onChange={(e) => setMesB(e.target.value)}>{[...disp.meses].reverse().map((m) => <option key={m} value={m}>{mesComAno(m)}</option>)}</select>
                </label>
              </div>
              <section className="painel comparacao">
                <div className="linha-comparacao cabeca"><span /><span>{mesComAno(mesA, true)}</span><span>{mesComAno(mesB, true)}</span><span>variação</span></div>
                <div className="linha-comparacao"><span>Saiu</span><span>{formatar(cmpMeses.a.saidas)}</span><span>{formatar(cmpMeses.b.saidas)}</span><Variacao valor={cmpMeses.variacaoSaidas} inverso /></div>
                <div className="linha-comparacao"><span>Entrou</span><span>{formatar(cmpMeses.a.entradas)}</span><span>{formatar(cmpMeses.b.entradas)}</span><Variacao valor={cmpMeses.variacaoEntradas} /></div>
                <div className="linha-comparacao"><span>Sobrou</span><span>{formatar(cmpMeses.a.resultado)}</span><span>{formatar(cmpMeses.b.resultado)}</span><span /></div>
              </section>
              <section className="painel">
                <h3>Ritmo de gastos ao longo do mês</h3>
                <Legenda series={[{ nome: mesComAno(mesA), cor: COR.a }, { nome: mesComAno(mesB), cor: COR.b }]} />
                <GraficoLinha
                  rotuloAcessivel={`Saídas acumuladas por dia, ${mesComAno(mesA)} contra ${mesComAno(mesB)}`}
                  series={[{ nome: mesComAno(mesA), cor: COR.a }, { nome: mesComAno(mesB), cor: COR.b }]}
                  formatar={formatar}
                  pontos={Array.from({ length: 31 }, (_, i) => ({ rotulo: String(i + 1), titulo: `Até o dia ${i + 1}`, valores: [cmpMeses.acumuladoA[i] ?? null, cmpMeses.acumuladoB[i] ?? null] }))}
                />
                <p className="dica">Quanto já tinha saído até cada dia do mês.</p>
              </section>
              <section className="painel">
                <h3>Gastos por categoria</h3>
                <Legenda series={[{ nome: mesComAno(mesA), cor: COR.a }, { nome: mesComAno(mesB), cor: COR.b }]} />
                {cmpMeses.categorias.length === 0 && <p className="vazio">Sem gastos nesses meses.</p>}
                <ul className="barras">
                  {cmpMeses.categorias.slice(0, 10).map((c) => {
                    const cat = categoriaPorId.get(c.categoriaId) || { nome: 'Sem categoria' }
                    const max = Math.max(...cmpMeses.categorias.map((x) => Math.max(x.a, x.b)), 1)
                    return (
                      <li key={c.categoriaId ?? 'sem'} className="barra-linha">
                        <div className="barra-corpo">
                          <div className="barra-topo"><span className="com-icone"><IconeCategoria categoria={cat} pequeno />{cat.nome}</span><span className="barra-valor">{formatar(c.a)} → {formatar(c.b)}</span></div>
                          <div className="barra-trilho dupla"><div className="barra" style={{ width: `${(c.a / max) * 100}%`, background: COR.a }} /></div>
                          <div className="barra-trilho dupla"><div className="barra" style={{ width: `${(c.b / max) * 100}%`, background: COR.b }} /></div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
