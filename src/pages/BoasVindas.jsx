// Primeiro uso: informar saldos e cadastrar os cartões
import { useState } from 'react'
import { useDados } from '../dados.jsx'
import { Mascote } from '../components/Pecas.jsx'
import { CampoValor, Campo } from '../components/Campos.jsx'
import { db, salvarConfig, criarDadosIniciais } from '../lib/db.js'
import { BotaoEntrar } from '../components/Nuvem.jsx'
import { ConvitesRecebidos } from '../components/Espacos.jsx'
import { salvarConta, salvarCartao } from '../lib/cadastros.js'
import { diaValido } from '../lib/fatura.js'
import RestaurarBackup from '../components/RestaurarBackup.jsx'

const CARTOES_SUGERIDOS = ['Santander', 'Inter']

export default function BoasVindas() {
  const { contas } = useDados()
  const [passo, setPasso] = useState(0)
  const [saldos, setSaldos] = useState({}) // id da conta → saldo informado
  const [cartoes, setCartoes] = useState(() =>
    CARTOES_SUGERIDOS.map((nome) => ({ nome, ativo: false, limite: 0, diaFechamento: '', diaVencimento: '' })),
  )
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const mudarCartao = (i, campo, v) => setCartoes((lista) => lista.map((c, j) => (j === i ? { ...c, [campo]: v } : c)))

  async function concluir() {
    if (ocupado) return
    for (const c of cartoes.filter((c) => c.ativo)) {
      const f = Number(c.diaFechamento), v = Number(c.diaVencimento)
      if (!diaValido(f) || !diaValido(v)) return setErro(`Preencha os dias de fechamento e vencimento do cartão ${c.nome} (de 1 a 31).`)
      if (f === v) return setErro(`No cartão ${c.nome}, fechamento e vencimento não podem ser no mesmo dia.`)
    }
    setOcupado(true)
    try {
      // Tudo numa transação: ou salva tudo, ou nada
      await db.transaction('rw', db.contas, db.cartoes, db.lancamentos, db.config, async () => {
        for (const c of contas) await salvarConta({ id: c.id, nome: c.nome, emoji: c.emoji, saldoAtual: saldos[c.id] || 0 })
        for (const c of cartoes.filter((c) => c.ativo)) {
          const conta = contas.find((x) => x.nome === c.nome) || contas[0]
          await salvarCartao({ nome: c.nome, limite: c.limite, diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento, contaPagamentoId: conta?.id ?? null })
        }
        await salvarConfig('boasVindas', true)
      })
    } catch (e) {
      setErro(e.message || 'Não foi possível salvar.')
      setOcupado(false)
    }
  }

  return (
    <div className="boas-vindas">
      {passo === 0 && (
        <div className="bv-passo centro">
          <Mascote rosto="🤑" tamanho={120} />
          <h1>Prazer, eu sou o Muquirana.</h1>
          <p>Vou cuidar de cada tostão seu. Prometo zoar só um pouquinho quando você gastar demais.</p>
          <p className="discreto">Seus dados ficam no aparelho. Se quiser, entre com sua conta para sincronizar entre celular e computador.</p>
          <button className="botao primario cheio" disabled={ocupado} onClick={async () => { setOcupado(true); await criarDadosIniciais(); setOcupado(false); setPasso(1) }}>Bora começar</button>
          <ConvitesRecebidos />
          <div className="restaurar-bv">
            <span className="discreto">Já usa o Muquirana?</span>
            <BotaoEntrar rotulo="Entrar na minha conta" classe="link" />
            <RestaurarBackup rotulo="Restaurar um backup" classe="link" />
          </div>
        </div>
      )}

      {passo === 1 && (
        <div className="bv-passo">
          <h2>Quanto tem em cada conta hoje?</h2>
          <p className="discreto">Abra o app do banco e confira. Se não souber agora, deixe zerado e ajuste depois.</p>
          {contas.map((c) => (
            <CampoValor key={c.id} rotulo={`${c.emoji} ${c.nome}`} valor={saldos[c.id] ?? 0} aoMudar={(v) => setSaldos({ ...saldos, [c.id]: v })} />
          ))}
          <div className="linha-botoes">
            <button className="botao secundario" onClick={() => setPasso(0)}>Voltar</button>
            <button className="botao primario cheio" onClick={() => setPasso(2)}>Próximo</button>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="bv-passo">
          <h2>E os cartões de crédito?</h2>
          <p className="discreto">Os dias de fechamento e vencimento aparecem no app do banco, na tela da fatura.</p>
          {cartoes.map((c, i) => (
            <div key={c.nome} className={`painel ${c.ativo ? '' : 'apagado'}`}>
              <label className="alternar">
                <input type="checkbox" checked={c.ativo} onChange={(e) => mudarCartao(i, 'ativo', e.target.checked)} />
                Tenho cartão do <strong>{c.nome}</strong>
              </label>
              {c.ativo && (
                <>
                  <div className="duas-colunas">
                    <Campo rotulo="Fecha dia"><input type="number" inputMode="numeric" min="1" max="31" value={c.diaFechamento} onChange={(e) => mudarCartao(i, 'diaFechamento', e.target.value)} /></Campo>
                    <Campo rotulo="Vence dia"><input type="number" inputMode="numeric" min="1" max="31" value={c.diaVencimento} onChange={(e) => mudarCartao(i, 'diaVencimento', e.target.value)} /></Campo>
                  </div>
                  <CampoValor rotulo="Limite (opcional)" valor={c.limite} aoMudar={(v) => mudarCartao(i, 'limite', v)} />
                </>
              )}
            </div>
          ))}
          <p className="discreto">Tem outros cartões? Dá para cadastrar depois em Ajustes.</p>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <div className="linha-botoes">
            <button className="botao secundario" onClick={() => setPasso(1)}>Voltar</button>
            <button className="botao primario cheio" disabled={ocupado} onClick={concluir}>Concluir</button>
          </div>
        </div>
      )}
    </div>
  )
}
