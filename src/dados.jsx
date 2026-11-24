// Carrega tudo do banco local e mantém a tela atualizada quando algo muda.
// Mostra só o espaço aberto (Pessoal ou um espaço compartilhado).
import { createContext, useContext, useEffect, useMemo } from 'react'
import { useLiveQuery, useObservable } from 'dexie-react-hooks'
import { db, definirEspacoParaNovos } from './lib/db.js'
import { doEspaco, papelDe } from './lib/espacos.js'

const Dados = createContext(null)

export function ProvedorDados({ children, acoes }) {
  const contasT = useLiveQuery(() => db.contas.toArray(), [])
  const cartoesT = useLiveQuery(() => db.cartoes.toArray(), [])
  const categoriasT = useLiveQuery(() => db.categorias.toArray(), [])
  const lancamentosT = useLiveQuery(() => db.lancamentos.toArray(), [])
  const regrasT = useLiveQuery(() => db.regras.toArray(), [])
  const recorrentesT = useLiveQuery(() => db.recorrentes.toArray(), [])
  const orcamentosT = useLiveQuery(() => db.orcamentos.toArray(), [])
  const realms = useLiveQuery(() => db.realms.toArray(), [])
  const membros = useLiveQuery(() => db.members.toArray(), [])
  const config = useLiveQuery(async () => Object.fromEntries((await db.config.toArray()).map((c) => [c.chave, c.valor])), [])
  const usuario = useObservable(db.cloud.currentUser)

  // espaço aberto: o salvo neste aparelho, se ainda existir
  const espacoAtual = config && realms && realms.some((r) => r.realmId === config.espacoAtual) ? config.espacoAtual : null
  useEffect(() => { definirEspacoParaNovos(espacoAtual) }, [espacoAtual])

  const valor = useMemo(() => {
    const tabelas = [contasT, cartoesT, categoriasT, lancamentosT, regrasT, recorrentesT, orcamentosT]
    if (tabelas.some((t) => !t) || !config || !realms || !membros) return null
    const compartilhados = new Set(realms.map((r) => r.realmId))
    const filtra = (lista) => doEspaco(lista, espacoAtual, compartilhados)
    const [contas, cartoes, categorias, lancamentos, regras, recorrentes, orcamentos] = tabelas.map(filtra)
    const indice = (lista) => new Map(lista.map((x) => [x.id, x]))
    const meuId = usuario?.userId
    const espacos = realms.filter((r) => r.realmId !== 'rlm-public' && r.realmId !== meuId).map((r) => ({
      ...r,
      souDono: r.owner === meuId,
      membros: membros.filter((m) => m.realmId === r.realmId && m.email && m.userId !== r.owner),
    }))
    const espaco = espacos.find((e) => e.realmId === espacoAtual) || null
    const eu = espaco?.membros.find((m) => m.userId === meuId || (usuario?.email && (m.email || '').toLowerCase() === usuario.email.toLowerCase()))
    const papel = !espaco ? 'dono' : espaco.souDono ? 'dono' : papelDe(eu)
    return {
      contas, cartoes, categorias, lancamentos, config, regras, recorrentes, orcamentos,
      categoriaPorId: indice(categorias),
      contaPorId: indice(contas),
      cartaoPorId: indice(cartoes),
      espacos,
      espaco,
      espacoAtual,
      podeEditar: papel !== 'leitor',
      usuario,
      ...acoes,
    }
  }, [contasT, cartoesT, categoriasT, lancamentosT, regrasT, recorrentesT, orcamentosT, config, realms, membros, espacoAtual, usuario, acoes])

  if (!valor) return <div className="carregando">🪙</div>
  return <Dados.Provider value={valor}>{children}</Dados.Provider>
}

export const useDados = () => useContext(Dados)
