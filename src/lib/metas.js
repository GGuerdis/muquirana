// Metas: cada meta tem a sua categoria (ex.: "Entrada do apartamento"). O que você lança nessa categoria
// conta como dinheiro guardado/pago para a meta. A meta fica guardada na própria categoria (campo `meta`),
// então vai junto para a nuvem, para o backup e para os espaços compartilhados.
import { db } from './db.js'
import { valorValido } from './dinheiro.js'
import { semControle } from './texto.js'
import { hoje as hojeTexto, mesDe, somarMeses } from './datas.js'
import { salvarCategoria } from './cadastros.js'
import { normalizar } from './cores.js'

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/

export function validarMeta({ nome, alvo, prazo }) {
  if (!semControle(nome || '').trim()) return 'Dê um nome para a meta.'
  if (!valorValido(alvo)) return 'Quanto você quer juntar?'
  if (prazo != null && prazo !== '' && !MES_VALIDO.test(prazo)) return 'Mês do prazo inválido.'
  return null
}

/**
 * Cria ou edita uma meta. Sem `categoriaId`, cria a categoria com o nome da meta (ou usa uma de despesa
 * que já tenha exatamente esse nome). Com `categoriaId`, liga a meta a essa categoria.
 */
export async function salvarMeta({ categoriaId = null, nome, alvo, prazo = null }) {
  const erro = validarMeta({ nome, alvo, prazo })
  if (erro) throw new Error(erro)
  nome = semControle(nome).trim().slice(0, 40)
  const meta = { alvo, prazo: prazo || null }
  return db.transaction('rw', db.categorias, async () => {
    let id = categoriaId
    if (id == null) {
      const igual = (await db.categorias.toArray()).find((c) => c.tipo === 'despesa' && normalizar(c.nome) === normalizar(nome))
      id = igual ? igual.id : await salvarCategoria({ nome, desenho: 'meta', tipo: 'despesa' })
    }
    const cat = await db.categorias.get(id)
    if (!cat) throw new Error('Categoria não encontrada.')
    if (cat.tipo !== 'despesa') throw new Error('A meta precisa de uma categoria de despesa.')
    await db.categorias.update(id, { nome, meta: { ...meta, criadaEm: cat.meta?.criadaEm ?? hojeTexto() } })
    return id
  })
}

// Tira a meta (a categoria e os lançamentos continuam)
export async function tirarMeta(categoriaId) {
  await db.categorias.update(categoriaId, { meta: undefined })
}

const mesesEntre = (de, ate) => {
  const [a1, m1] = de.split('-').map(Number)
  const [a2, m2] = ate.split('-').map(Number)
  return (a2 - a1) * 12 + (m2 - m1)
}

/** Progresso de uma meta (categoria com `meta`) até hoje. */
export function progressoMeta(categoria, lancamentos, dia = hojeTexto()) {
  const { alvo, prazo } = categoria.meta
  const mesHoje = mesDe(dia)
  let guardado = 0
  const porMes = new Map()
  for (const l of lancamentos) {
    if (l.categoriaId !== categoria.id || l.tipo !== 'despesa' || l.data > dia) continue
    guardado += l.valor
    const m = mesDe(l.data)
    porMes.set(m, (porMes.get(m) || 0) + l.valor)
  }
  const falta = Math.max(alvo - guardado, 0)
  const porcentagem = Math.min(100, Math.floor((guardado * 100) / alvo))
  // ritmo: média dos 3 meses completos antes deste
  const ultimos = [1, 2, 3].map((i) => porMes.get(somarMeses(mesHoje, -i)) || 0)
  const ritmo = Math.round(ultimos.reduce((s, v) => s + v, 0) / 3)
  const mesesAtePrazo = prazo ? Math.max(1, mesesEntre(mesHoje, prazo) + 1) : null // conta o mês atual
  const porMesNecessario = prazo && falta > 0 ? Math.ceil(falta / mesesAtePrazo) : 0
  const chegaEm = falta === 0 ? null : ritmo > 0 ? somarMeses(mesHoje, Math.ceil(falta / ritmo)) : null
  const atrasada = !!prazo && falta > 0 && prazo < mesHoje
  return { alvo, prazo, guardado, falta, porcentagem, ritmo, porMesNecessario, mesesAtePrazo, chegaEm, concluida: falta === 0, atrasada }
}

export const categoriasComMeta = (categorias) => categorias.filter((c) => c.meta?.alvo > 0)
