// Campos reutilizáveis
import { formatar } from '../lib/dinheiro.js'

// Campo de valor estilo "maquininha": digitar 1234 vira R$ 12,34
export function CampoValor({ valor, aoMudar, grande = false, rotulo = 'Valor', autoFocus = false, tom }) {
  return (
    <label className={`campo-valor ${grande ? 'grande' : ''} ${tom || ''}`}>
      <span className="rotulo">{rotulo}</span>
      <input
        inputMode="numeric"
        autoFocus={autoFocus}
        value={formatar(valor)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 11)
          aoMudar(Number(digitos || 0))
        }}
        onFocus={(e) => requestAnimationFrame(() => e.target.setSelectionRange(e.target.value.length, e.target.value.length))}
      />
    </label>
  )
}

export function Chips({ opcoes, valor, aoMudar, rolavel = false }) {
  return (
    <div className={`chips ${rolavel ? 'rolavel' : ''}`}>
      {opcoes.map((o) => (
        <button
          type="button"
          key={String(o.valor)}
          className={`chip ${valor === o.valor ? 'ativo' : ''}`}
          onClick={() => aoMudar(o.valor)}
          aria-pressed={valor === o.valor}
        >
          {o.marca}
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export function Abas({ opcoes, valor, aoMudar, pequenas = false }) {
  return (
    <div className={`abas ${pequenas ? 'pequenas' : ''}`} role="tablist">
      {opcoes.map((o) => (
        <button
          type="button"
          role="tab"
          key={o.valor}
          aria-selected={valor === o.valor}
          className={`aba ${valor === o.valor ? 'ativa' : ''} ${o.tom || ''}`}
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

export function Campo({ rotulo, children, dica }) {
  return (
    <label className="campo">
      <span className="rotulo">{rotulo}</span>
      {children}
      {dica && <span className="dica">{dica}</span>}
    </label>
  )
}
