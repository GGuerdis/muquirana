// Escolher categoria, com a opção de criar uma nova ali mesmo (ex.: "Apartamento")
import { useState } from 'react'
import { useDados } from '../dados.jsx'
import { salvarCategoria } from '../lib/cadastros.js'

const NOVA = '__nova_categoria__'

/**
 * opcaoVazia: texto da opção "nenhuma" (valor '') — ex.: "Não, ficou guardado lá"
 * prefixo: texto antes do nome de cada categoria — ex.: "Sim, pagamento: "
 */
export default function SeletorCategoria({ tipo, valor, aoMudar, opcaoVazia = null, prefixo = '', rotulo = 'Categoria', className = 'seletor' }) {
  const { categorias, avisar } = useDados()
  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const lista = categorias.filter((c) => c.tipo === tipo)

  async function criar() {
    const n = nome.trim()
    if (!n || ocupado) return
    const existente = lista.find((c) => c.nome.trim().toLowerCase() === n.toLowerCase())
    setOcupado(true)
    try {
      const id = existente ? existente.id : await salvarCategoria({ nome: n, emoji: '🏷️', tipo })
      setCriando(false)
      setNome('')
      aoMudar(id)
    } catch (e) {
      avisar(e.message || 'Não foi possível criar a categoria.')
    } finally {
      setOcupado(false)
    }
  }

  if (criando) {
    return (
      <div className="nova-categoria">
        <input type="text" autoFocus value={nome} maxLength={30} placeholder="Nome da categoria (ex.: Apartamento)" aria-label="Nome da nova categoria"
          onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criar() }} />
        <button type="button" className="botao secundario mini" onClick={() => { setCriando(false); setNome('') }}>Cancelar</button>
        <button type="button" className="botao primario mini" disabled={!nome.trim() || ocupado} onClick={criar}>Criar</button>
      </div>
    )
  }

  return (
    <select className={className} aria-label={rotulo} value={valor ?? ''} onChange={(e) => (e.target.value === NOVA ? setCriando(true) : aoMudar(e.target.value || null))}>
      {opcaoVazia !== null && <option value="">{opcaoVazia}</option>}
      {opcaoVazia === null && valor == null && <option value="">Escolha…</option>}
      {lista.map((c) => <option key={c.id} value={c.id}>{prefixo}{c.emoji} {c.nome}</option>)}
      <option value={NOVA}>➕ Nova categoria…</option>
    </select>
  )
}
