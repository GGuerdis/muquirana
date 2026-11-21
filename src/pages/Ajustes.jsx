import { useRef, useState } from 'react'
import { useDados } from '../dados.jsx'
import { FormConta, FormCartao, FormCategoria } from '../components/Formularios.jsx'
import { Abas } from '../components/Campos.jsx'
import ImportarExtrato from '../components/ImportarExtrato.jsx'
import { apagarRegra, apagarTodasRegras } from '../lib/categorizar.js'
import { formatar } from '../lib/dinheiro.js'
import { saldoConta } from '../lib/calculos.js'
import { exportarBackup, restaurarBackup, salvarConfig } from '../lib/db.js'
import { hoje, dataCurta } from '../lib/datas.js'

export default function Ajustes() {
  const { contas, cartoes, categorias, lancamentos, regras, categoriaPorId, zoeira, config, avisar } = useDados()
  const [apagandoRegras, setApagandoRegras] = useState(false)
  const [editando, setEditando] = useState(null) // { tipo: 'conta'|'cartao'|'categoria', item }
  const [tipoCat, setTipoCat] = useState('despesa')
  const [restaurando, setRestaurando] = useState(null)
  const [importando, setImportando] = useState(false)
  const arquivo = useRef(null)

  async function exportar() {
    const backup = await exportarBackup()
    const nome = `muquirana-backup-${hoje()}.json`
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const file = new File([blob], nome, { type: 'application/json' })
    // No celular, abre o menu de compartilhar (salvar no Drive, mandar no WhatsApp etc.)
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Backup do Muquirana' })
      } catch (e) {
        if (e.name === 'AbortError') return
        baixar(blob, nome)
      }
    } else {
      baixar(blob, nome)
    }
    await salvarConfig('ultimoBackup', hoje())
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

  async function lerArquivo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const backup = JSON.parse(await f.text())
      if (backup?.app !== 'muquirana') throw new Error()
      setRestaurando(backup)
    } catch {
      avisar('Esse arquivo não parece ser um backup do Muquirana.')
    }
  }

  async function confirmarRestauracao() {
    try {
      await restaurarBackup(restaurando)
      avisar('Backup restaurado.')
    } catch (err) {
      avisar(err.message)
    }
    setRestaurando(null)
  }

  const fechar = () => setEditando(null)

  return (
    <div className="pagina">
      <h1 className="titulo-pagina">Ajustes</h1>

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
        <h3>Importar extrato do banco</h3>
        <p className="dica">Traga as movimentações do Santander, Inter ou outro banco a partir de um arquivo OFX, sem digitar.</p>
        <button className="botao secundario cheio" onClick={() => setImportando(true)}>⬇ Importar extrato (OFX)</button>
      </section>

      <section className="painel">
        <h3>Backup</h3>
        <p className="dica">
          Seus dados ficam só neste celular. Faça backup de vez em quando e guarde o arquivo no Drive ou no OneDrive.
          {config.ultimoBackup ? ` Último backup: ${dataCurta(config.ultimoBackup)}.` : ' Você ainda não fez nenhum backup.'}
        </p>
        <div className="linha-botoes">
          <button className="botao primario cheio" onClick={exportar}>Fazer backup</button>
          <button className="botao secundario cheio" onClick={() => arquivo.current?.click()}>Restaurar</button>
        </div>
        <input ref={arquivo} type="file" accept="application/json,.json" hidden onChange={lerArquivo} />
        {restaurando && (
          <div className="alerta">
            <p>
              Restaurar o backup de <strong>{new Date(restaurando.exportadoEm).toLocaleDateString('pt-BR')}</strong> ({restaurando.dados.lancamentos?.length ?? 0} lançamentos)?
              Tudo que está no app agora será <strong>substituído</strong>.
            </p>
            <div className="linha-botoes">
              <button className="botao secundario" onClick={() => setRestaurando(null)}>Cancelar</button>
              <button className="botao perigo cheio" onClick={confirmarRestauracao}>Substituir tudo</button>
            </div>
          </div>
        )}
      </section>

      <p className="rodape-app">Muquirana v0.1 · cada tostão conta 🪙</p>

      {importando && <ImportarExtrato aoFechar={() => setImportando(false)} />}
      {editando?.tipo === 'conta' && <FormConta conta={editando.item} aoFechar={fechar} />}
      {editando?.tipo === 'cartao' && <FormCartao cartao={editando.item} aoFechar={fechar} />}
      {editando?.tipo === 'categoria' && <FormCategoria categoria={editando.item} tipo={tipoCat} aoFechar={fechar} />}
    </div>
  )
}
