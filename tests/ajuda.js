// Utilitários dos testes
import { db, criarDadosIniciais } from '../src/lib/db.js'

// Apaga e recria o banco (com contas e categorias padrão)
export async function bancoNovo() {
  db.close()
  await db.delete()
  await db.open()
  await criarDadosIniciais()
  const contas = await db.contas.toArray()
  const categorias = await db.categorias.toArray()
  const conta = (nome) => contas.find((c) => c.nome === nome).id
  const cat = (tipo, nome) => categorias.find((c) => c.tipo === tipo && c.nome === nome).id
  return { contas, categorias, conta, cat }
}

// Gerador de números aleatórios com semente (os testes dão sempre o mesmo resultado)
export function aleatorio(semente = 42) {
  let s = semente >>> 0
  const prox = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const inteiro = (min, max) => min + Math.floor(prox() * (max - min + 1))
  const escolher = (lista) => lista[inteiro(0, lista.length - 1)]
  return { prox, inteiro, escolher }
}

export const pad = (n) => String(n).padStart(2, '0')

// "Fotografia" legível dos dados, sem depender dos identificadores internos:
// cada ligação vira o nome do registro ligado. Serve para comparar antes/depois de migração e backup.
export async function fotografia() {
  const tabelas = {}
  for (const t of ['contas', 'cartoes', 'categorias', 'lancamentos', 'regras', 'recorrentes', 'orcamentos']) tabelas[t] = await db.table(t).toArray()
  return fotografiaDe(tabelas)
}

export function fotografiaDe({ contas = [], cartoes = [], categorias = [], lancamentos = [], regras = [], recorrentes = [], orcamentos = [] }) {
  const nome = (lista, id) => (id == null ? null : lista.find((x) => x.id === id)?.nome ?? 'QUEBRADO')
  const cat = (id) => { const c = categorias.find((x) => x.id === id); return id == null ? null : c ? `${c.tipo}:${c.nome}` : 'QUEBRADO' }
  const rec = (id) => (id == null ? null : recorrentes.find((x) => x.id === id)?.descricao ?? 'QUEBRADO')
  // dentro do texto o id vira texto ("2"); no banco antigo ele é número (2)
  const nomeTexto = (lista, id) => lista.find((x) => String(x.id) === id)?.nome ?? 'QUEBRADO'
  const idExt = (s) => (s ? s.replace(/^(conta|cartao):([^:]+):/, (_, t, id) => `${t}:${t === 'conta' ? nomeTexto(contas, id) : nomeTexto(cartoes, id)}:`) : null)
  const ordenar = (lista) => lista.map((x) => JSON.stringify(x)).sort()
  return {
    contas: ordenar(contas.map((c) => [c.nome, c.emoji, c.saldoInicial])),
    cartoes: ordenar(cartoes.map((c) => [c.nome, c.limite, c.diaFechamento, c.diaVencimento, nome(contas, c.contaPagamentoId)])),
    categorias: ordenar(categorias.map((c) => [c.tipo, c.emoji, c.nome])),
    lancamentos: ordenar(lancamentos.map((l) => [
      l.tipo, l.valor, l.data, l.descricao, nome(contas, l.contaId), nome(contas, l.contaDestinoId), nome(cartoes, l.cartaoId), cat(l.categoriaId),
      l.fatura ?? null, l.faturaFixa ?? null, l.grupoParcelaId ?? null, l.parcela ?? null, l.totalParcelas ?? null, l.valorTotal ?? null, l.dataCompra ?? null,
      idExt(l.idExterno), rec(l.recorrenteId), l.competencia ?? null, l.criadoEm ?? null,
    ])),
    regras: ordenar(regras.map((r) => [r.chave, r.padrao, r.tipo, cat(r.categoriaId), r.usos])),
    recorrentes: ordenar(recorrentes.map((r) => [r.descricao, r.tipo, r.valor, r.dia, cat(r.categoriaId), nome(contas, r.contaId), nome(cartoes, r.cartaoId), r.inicio, r.fim, r.pulados])),
    orcamentos: ordenar(orcamentos.map((o) => [cat(o.categoriaId), o.limite])),
  }
}
