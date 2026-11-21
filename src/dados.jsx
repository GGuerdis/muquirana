// Carrega tudo do banco local e mantém a tela atualizada quando algo muda.
import { createContext, useContext, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db.js'

const Dados = createContext(null)

export function ProvedorDados({ children, acoes }) {
  const contas = useLiveQuery(() => db.contas.toArray(), [])
  const cartoes = useLiveQuery(() => db.cartoes.toArray(), [])
  const categorias = useLiveQuery(() => db.categorias.toArray(), [])
  const lancamentos = useLiveQuery(() => db.lancamentos.toArray(), [])
  const config = useLiveQuery(async () => Object.fromEntries((await db.config.toArray()).map((c) => [c.chave, c.valor])), [])

  const valor = useMemo(() => {
    if (!contas || !cartoes || !categorias || !lancamentos || !config) return null
    const indice = (lista) => new Map(lista.map((x) => [x.id, x]))
    return {
      contas, cartoes, categorias, lancamentos, config,
      zoeira: config.zoeira !== false,
      categoriaPorId: indice(categorias),
      contaPorId: indice(contas),
      cartaoPorId: indice(cartoes),
      ...acoes,
    }
  }, [contas, cartoes, categorias, lancamentos, config, acoes])

  if (!valor) return <div className="carregando">🪙</div>
  return <Dados.Provider value={valor}>{children}</Dados.Provider>
}

export const useDados = () => useContext(Dados)
