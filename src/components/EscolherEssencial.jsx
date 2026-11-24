// Janela para marcar o que aparece no modo "Só o essencial" da tela Início.
// Cada chave salva na hora (sem botão de salvar); o saldo total aparece sempre.
import Folha from './Folha.jsx'
import { salvarConfig } from '../lib/db.js'
import { BLOCOS_INICIO, blocosEscolhidos, alternarBloco } from '../lib/inicio.js'

export default function EscolherEssencial({ guardado, aoFechar }) {
  const marcados = new Set(blocosEscolhidos(guardado))
  const mudar = (id, ligado) => salvarConfig('inicioEssencialBlocos', alternarBloco(guardado, id, ligado))

  return (
    <Folha titulo="Só o essencial" aoFechar={aoFechar} rodape={<button className="botao primario" onClick={aoFechar}>Pronto</button>}>
      <p className="discreto">Escolha o que aparece no Início quando o modo essencial está ligado. O saldo total aparece sempre.</p>
      <div className="lista-essencial">
        {BLOCOS_INICIO.map((b) => (
          <label key={b.id} className="alternar grande">
            <span>
              <strong>{b.nome}</strong>
              {b.dica && <small>{b.dica}</small>}
            </span>
            <input type="checkbox" role="switch" checked={marcados.has(b.id)} onChange={(e) => mudar(b.id, e.target.checked)} />
          </label>
        ))}
      </div>
    </Folha>
  )
}
