import { useState } from 'react'
import { useDados } from '../dados.jsx'
import { FormConta, FormCartao, FormCategoria, FormRecorrente } from '../components/Formularios.jsx'
import { Abas } from '../components/Campos.jsx'
import ImportarExtrato from '../components/ImportarExtrato.jsx'
import CategorizarRapido from '../components/CategorizarRapido.jsx'
import { apagarRegra, apagarTodasRegras } from '../lib/categorizar.js'
import { formatar } from '../lib/dinheiro.js'
import { saldoConta } from '../lib/calculos.js'
import { salvarConfig } from '../lib/db.js'
import { fazerBackup } from '../lib/backupArquivo.js'
import RestaurarBackup from '../components/RestaurarBackup.jsx'
import { PainelConta } from '../components/Nuvem.jsx'
import { PainelEspaco } from '../components/Espacos.jsx'
import { gerarAgenda } from '../lib/agenda.js'
import { FormOrcamento } from '../components/Orcamento.jsx'
import { hoje, dataCurta } from '../lib/datas.js'

export default function Ajustes() {
  const { contas, cartoes, categorias, lancamentos, regras, recorrentes, orcamentos, categoriaPorId, contaPorId, cartaoPorId, zoeira, config, avisar } = useDados()
  const [apagandoRegras, setApagandoRegras] = useState(false)
  const [editando, setEditando] = useState(null) // { tipo: 'conta'|'cartao'|'categoria', item }
  const [tipoCat, setTipoCat] = useState('despesa')
  const [importando, setImportando] = useState(false)
  const [categorizando, setCategorizando] = useState(false)

  async function exportar() {
    if (!(await fazerBackup())) return
    avisar(zoeira ? 'Backup feito! Seus tostões estão seguros.' : 'Backup exportado.')
  }

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function exportarAgenda() {
    const { conteudo, eventos } = gerarAgenda({
      recorrentes, cartoes, hoje: hoje(),
      nomeConta: (id) => contaPorId.get(id)?.nome ?? '', nomeCartao: (id) => cartaoPorId.get(id)?.nome ?? '',
    })
    if (!eventos) return avisar('Cadastre contas fixas ou cartões para gerar os lembretes.')
    const nome = 'muquirana-lembretes.ics'
    const blob = new Blob([conteudo], { type: 'text/calendar' })
    const file = new File([blob], nome, { type: 'text/calendar' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Lembretes do Muquirana' }) } catch (e) { if (e.name !== 'AbortError') baixar(blob, nome) }
    } else baixar(blob, nome)
    avisar(`${eventos} lembrete(s) gerado(s). Abra o arquivo com a sua agenda.`)
  }

  const fechar = () => setEditando(null)

  return (
    <div className="pagina">
      <h1 className="titulo-pagina">Ajustes</h1>

      <PainelConta />
      <PainelEspaco />

      <section className="painel">
        <label className="alternar grande">
          <span>
            <strong>Modo zoeira</strong>
            <small>O Muquirana comenta seus gastos. Desligue se for mostrar o app para alguém sério.</small>
          </span>
          <input type="checkbox" role="switch" checked={zoeira} onChange={(e) => salvarConfig('zoeira', e.target.checked)} />
        </label>
      </section>

      <section className="painel">
        <div className="painel-titulo">
          <h3>Contas</h3>
          <button className="link" onClick={() => setEditando({ tipo: 'conta' })}>+ Nova</button>
        </div>
        {contas.map((c) => (
          <button key={c.id} className="linha-ajuste" onClick={() => setEditando({ tipo: 'conta', item: c })}>
            <span>{c.emoji} {c.nome}</span>
            <span className="discreto">{formatar(saldoConta(c, lancamentos))} ›</span>
          </button>
        ))}
      </section>

      <section className="painel">
        <div className="painel-titulo">
          <h3>Cartões de crédito</h3>
          <button className="link" onClick={() => setEditando({ tipo: 'cartao' })}>+ Novo</button>
        </div>
        {cartoes.length === 0 && <p className="vazio">Nenhum cartão ainda.</p>}
        {cartoes.map((c) => (
          <button key={c.id} className="linha-ajuste" onClick={() => setEditando({ tipo: 'cartao', item: c })}>
            <span>💳 {c.nome}</span>
            <span className="discreto">fecha {c.diaFechamento} · vence {c.diaVencimento} ›</span>
          </button>
        ))}
      </section>

      <section className="painel">
        <div className="painel-titulo">
          <h3>Contas fixas</h3>
          <button className="link" onClick={() => setEditando({ tipo: 'recorrente' })}>+ Nova</button>
        </div>
        {recorrentes.length === 0 && <p className="vazio">Nenhuma conta fixa ainda.</p>}
        {[...recorrentes].sort((a, b) => a.dia - b.dia).map((r) => (
          <button key={r.id} className="linha-ajuste" onClick={() => setEditando({ tipo: 'recorrente', item: r })}>
            <span className="quebra">{categoriaPorId.get(r.categoriaId)?.emoji || '📦'} {r.descricao}<small> · dia {r.dia} · {r.cartaoId != null ? `💳 ${cartaoPorId.get(r.cartaoId)?.nome ?? ''}` : contaPorId.get(r.contaId)?.nome ?? ''}{r.fim ? ` · até ${r.fim.split('-').reverse().join('/')}` : ''}</small></span>
            <span className={r.tipo === 'receita' ? 'entrada' : 'discreto'}>{r.tipo === 'receita' ? '+' : ''}{formatar(r.valor)} ›</span>
          </button>
        ))}
      </section>

      <section className="painel">
        <h3>Orçamento mensal</h3>
        <p className="dica">Quanto você quer gastar por mês em cada categoria. Toque para definir.</p>
        {categorias.filter((c) => c.tipo === 'despesa').map((c) => {
          const o = orcamentos.find((x) => x.categoriaId === c.id)
          return (
            <button key={c.id} className="linha-ajuste" onClick={() => setEditando({ tipo: 'orcamento', item: c })}>
              <span>{c.emoji} {c.nome}</span>
              <span className={o ? '' : 'discreto'}>{o ? formatar(o.limite) : 'sem limite'} ›</span>
            </button>
          )
        })}
      </section>

      <section className="painel">
        <div className="painel-titulo">
          <h3>Categorias</h3>
          <button className="link" onClick={() => setEditando({ tipo: 'categoria' })}>+ Nova</button>
        </div>
        <Abas opcoes={[{ valor: 'despesa', rotulo: 'Despesas' }, { valor: 'receita', rotulo: 'Receitas' }]} valor={tipoCat} aoMudar={setTipoCat} />
        <div className="lista-categorias">
          {categorias.filter((c) => c.tipo === tipoCat).map((c) => (
            <button key={c.id} className="chip" onClick={() => setEditando({ tipo: 'categoria', item: c })}>
              <span className="chip-emoji">{c.emoji}</span>{c.nome}
            </button>
          ))}
        </div>
      </section>

      <section className="painel">
        <div className="painel-titulo">
          <h3>Categorias aprendidas</h3>
          {regras.length > 0 && (
            <button className={apagandoRegras ? 'link perigo' : 'link'} onClick={async () => {
              if (!apagandoRegras) return setApagandoRegras(true)
              await apagarTodasRegras(); setApagandoRegras(false); avisar('Regras apagadas.')
            }}>{apagandoRegras ? 'Confirmar?' : 'Apagar todas'}</button>
          )}
        </div>
        <p className="dica">Quando você escolhe a categoria de uma descrição, o app aprende e sugere sozinho da próxima vez. Lojas conhecidas (Uber, iFood, Netflix…) já vêm reconhecidas.</p>
        {regras.length === 0 && <p className="vazio">Nada aprendido ainda.</p>}
        {[...regras].sort((a, b) => a.padrao.localeCompare(b.padrao)).map((r) => {
          const cat = categoriaPorId.get(r.categoriaId)
          return (
            <div key={r.id} className="linha-pagamento">
              <span className="quebra"><strong>{r.padrao}</strong> → {cat ? `${cat.emoji} ${cat.nome}` : 'categoria apagada'}</span>
              <button className="link" aria-label={`Apagar regra ${r.padrao}`} onClick={() => apagarRegra(r.id)}>Apagar</button>
            </div>
          )
        })}
      </section>

      <section className="painel">
        <h3>Lembretes na agenda</h3>
        <p className="dica">
          Gera um arquivo para a agenda do celular com as suas contas fixas e o vencimento das faturas, todo mês, com aviso na véspera
          (e dois dias antes das faturas). Nada vai para a internet. No iPhone, abra o arquivo e toque em "Adicionar tudo". No Android,
          abra com o Google Agenda (ou importe em calendar.google.com → Configurações → Importar). Se mudar as contas fixas, gere de novo.
        </p>
        <button className="botao secundario cheio" onClick={exportarAgenda}>📅 Gerar lembretes para a agenda</button>
      </section>

      <section className="painel">
        <h3>Importar extrato do banco</h3>
        <p className="dica">Traga as movimentações do Santander, Inter ou outro banco a partir de um arquivo OFX, sem digitar.</p>
        <button className="botao secundario cheio" onClick={() => setImportando(true)}>⬇ Importar extrato (OFX)</button>
      </section>

      <section className="painel">
        <h3>Backup</h3>
        <p className="dica">
          Um arquivo com todos os seus dados, para guardar no Drive ou no OneDrive. Mesmo com a conta na nuvem, vale ter uma cópia de vez em quando.
          {config.ultimoBackup ? ` Último backup: ${dataCurta(config.ultimoBackup)}.` : ' Você ainda não fez nenhum backup.'}
        </p>
        <div className="linha-botoes">
          <button className="botao primario cheio" onClick={exportar}>Fazer backup</button>
          <RestaurarBackup avisar={avisar} />
        </div>
      </section>

      <p className="rodape-app">Muquirana v0.2 · cada tostão conta 🪙</p>

      {importando && <ImportarExtrato aoFechar={() => setImportando(false)} aoImportar={() => setCategorizando(true)} />}
      {categorizando && <CategorizarRapido aoFechar={() => setCategorizando(false)} />}
      {editando?.tipo === 'orcamento' && <FormOrcamento categoria={editando.item} aoFechar={fechar} />}
      {editando?.tipo === 'recorrente' && <FormRecorrente recorrente={editando.item} aoFechar={fechar} />}
      {editando?.tipo === 'conta' && <FormConta conta={editando.item} aoFechar={fechar} />}
      {editando?.tipo === 'cartao' && <FormCartao cartao={editando.item} aoFechar={fechar} />}
      {editando?.tipo === 'categoria' && <FormCategoria categoria={editando.item} tipo={tipoCat} aoFechar={fechar} />}
    </div>
  )
}
