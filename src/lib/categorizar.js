// Categorização automática: sugere a categoria pela descrição.
// 1º as regras que o app aprendeu com você; 2º regras prontas (UBER → Transporte etc.).
import { db } from './db.js'

export const normalizar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const limpar = (t) => ` ${normalizar(t).replace(/[^A-Z0-9]+/g, ' ').trim()} `

// Palavras que não identificam o estabelecimento
const RUIDO = new Set([
  'PIX', 'ENVIADO', 'ENVIADA', 'RECEBIDO', 'RECEBIDA', 'COMPRA', 'COMPRAS', 'CARTAO', 'DEBITO', 'CREDITO', 'DEB', 'CRED',
  'PAG', 'PAGTO', 'PGTO', 'PAGAMENTO', 'TRANSF', 'TRANSFERENCIA', 'TED', 'DOC', 'QR', 'CODE', 'BOLETO', 'APROVADA', 'AUT',
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'EM', 'NO', 'NA', 'A', 'O', 'E', 'COM', 'PARA', 'POR',
  'ELO', 'VISA', 'MASTERCARD', 'MASTER', 'LTDA', 'ME', 'EIRELI', 'SA', 'BR', 'PARC', 'PARCELA', 'INTERNACIONAL', 'NACIONAL', 'BRA', 'SAO', 'PAULO', 'RIO', 'JANEIRO',
])

// "Identidade" da descrição: até 3 palavras significativas, sem números.
// "PAG*PADARIADOZE 12/11" → "PADARIADOZE";  "UBER *TRIP" → "UBER TRIP"
export function chaveDescricao(descricao) {
  return limpar(descricao).trim().split(' ')
    .filter((p) => p.length >= 2 && !/\d/.test(p) && !RUIDO.has(p))
    .slice(0, 3)
    .join(' ')
}

// Regras prontas: [expressão, nome da categoria, tipo]. A ordem importa (a primeira que bater vence).
const PRONTAS = [
  // receitas
  [/ (SALARIO|PROVENTOS|FOLHA DE PAGAMENTO|VENCIMENTOS) /, 'Salário', 'receita'],
  [/ (RENDIMENTO|RENDIMENTOS|DIVIDENDO|DIVIDENDOS|JCP|RESGATE|REND PAGO) /, 'Rendimentos', 'receita'],
  [/ (ESTORNO|REEMBOLSO|DEVOLUCAO|CASHBACK) /, 'Reembolso', 'receita'],
  // despesas
  [/ (AMAZON PRIME|PRIME VIDEO|NETFLIX|SPOTIFY|DISNEY|HBO|GLOBOPLAY|YOUTUBE|DEEZER|PARAMOUNT|CRUNCHYROLL|APPLE COM|ICLOUD|GOOGLE ONE|XBOX|PLAYSTATION|CHATGPT|OPENAI|STAR PLUS) /, 'Assinaturas', 'despesa'],
  [/ (UBER|CABIFY|99APP|99POP|99TAXI|99 APP|99 POP|99 TAXI|POSTO|SHELL|IPIRANGA|PETROBRAS|ESTAPAR|SEM PARAR|CONECTCAR|VELOE|METRO|BILHETE UNICO|ESTACIONAMENTO|PEDAGIO) /, 'Transporte', 'despesa'],
  [/ (IFOOD|IFD|RAPPI|ZE DELIVERY|MCDONALDS|MC DONALDS|BURGER KING|SUBWAY|OUTBACK|PADARIA|RESTAURANTE|LANCHONETE|PIZZARIA|STARBUCKS|HABIBS|SPOLETO|CAFE|CAFETERIA|SORVETERIA|CHURRASCARIA|BOTECO) /, 'Alimentação', 'despesa'],
  // "MERCADO LIVRE" precisa ser testado antes de "MERCADO"
  [/ (MERCADO LIVRE|MERCADOLIVRE|MERCADOPAGO|SHOPEE|SHEIN|ALIEXPRESS|MAGALU|MAGAZINE|AMERICANAS|RENNER|RIACHUELO|ZARA|CENTAURO|NETSHOES|KABUM|AMAZON|CASAS BAHIA|LEROY MERLIN|DECATHLON) /, 'Compras', 'despesa'],
  [/ (SUPERMERCADO|SUPERMERCADOS|MERCADO|MERCEARIA|CARREFOUR|PAO DE ACUCAR|ASSAI|ATACADAO|SAMS CLUB|HORTIFRUTI|SACOLAO|OXXO|ATACAREJO) /, 'Mercado', 'despesa'],
  [/ (DROGASIL|DROGARIA|FARMACIA|RAIA|PACHECO|PAGUE MENOS|DROGAO|UNIMED|AMIL|SULAMERICA|HAPVIDA|LABORATORIO|CLINICA|HOSPITAL|ODONTO|DENTISTA) /, 'Saúde', 'despesa'],
  [/ (ENEL|CEMIG|COPEL|CPFL|ELEKTRO|SABESP|CEDAE|COPASA|COMGAS|NATURGY|VIVO|CLARO|TIM|CONDOMINIO|ENERGIA ELETRICA|AGUA E ESGOTO|INTERNET) /, 'Contas da casa', 'despesa'],
  [/ (CINEMA|CINEMARK|INGRESSO|INGRESSOS|SYMPLA|EVENTIM|TICKETMASTER|STEAM|BAR|SHOW|TEATRO) /, 'Lazer', 'despesa'],
  [/ (UDEMY|ALURA|ESCOLA|FACULDADE|UNIVERSIDADE|CURSO|LIVRARIA|COLEGIO) /, 'Educação', 'despesa'],
  [/ (IOF|TARIFA|ANUIDADE|IPVA|IPTU|DARF|MULTA|JUROS|ENCARGOS) /, 'Impostos e taxas', 'despesa'],
  [/ (ALUGUEL|IMOBILIARIA) /, 'Moradia', 'despesa'],
]

const porNome = (categorias, nome, tipo) => categorias.find((c) => c.tipo === tipo && normalizar(c.nome) === normalizar(nome))?.id ?? null

// Retorna o id da categoria sugerida, ou null.
export function sugerirCategoria(descricao, tipo, regras = [], categorias = []) {
  if (!descricao || (tipo !== 'despesa' && tipo !== 'receita')) return null
  const existe = (id) => categorias.some((c) => c.id === id && c.tipo === tipo)
  const chave = chaveDescricao(descricao)
  const texto = limpar(descricao)
  const minhas = regras.filter((r) => r.tipo === tipo && existe(r.categoriaId))

  // 1) regra aprendida com a mesma "identidade"
  const exata = chave && minhas.find((r) => r.padrao === chave)
  if (exata) return exata.categoriaId
  // 2) regra aprendida contida na descrição (a mais específica vence)
  const contida = minhas
    .filter((r) => r.padrao.length >= 4 && texto.includes(` ${r.padrao} `))
    .sort((a, b) => b.padrao.length - a.padrao.length)[0]
  if (contida) return contida.categoriaId
  // 3) regras prontas
  for (const [expressao, nome, t] of PRONTAS) {
    if (t === tipo && expressao.test(texto)) return porNome(categorias, nome, tipo)
  }
  return null
}

// Guarda (ou atualiza) o que você ensinou: "esta descrição é desta categoria"
export async function aprender(descricao, tipo, categoriaId) {
  const padrao = chaveDescricao(descricao)
  if (padrao.length < 3 || !categoriaId || (tipo !== 'despesa' && tipo !== 'receita')) return false
  const chave = `${tipo}:${padrao}`
  await db.transaction('rw', db.regras, db.categorias, async () => {
    const cat = await db.categorias.get(categoriaId)
    if (!cat || cat.tipo !== tipo) return
    const atual = await db.regras.where('chave').equals(chave).first()
    if (atual) await db.regras.update(atual.id, { categoriaId, usos: (atual.usos || 0) + 1, atualizadoEm: Date.now() })
    else await db.regras.add({ chave, padrao, tipo, categoriaId, usos: 1, atualizadoEm: Date.now() })
  })
  return true
}

// Depois de importar: aprende com as linhas em que você mudou a categoria sugerida
export async function aprenderComImportacao(itensGravados) {
  for (const i of itensGravados) {
    if (i.acao === 'lancar' && i.categoriaEscolhida) await aprender(i.descricao, i.tipo, i.categoriaId)
  }
}

export const apagarRegra = (id) => db.regras.delete(id)
export const apagarTodasRegras = () => db.regras.clear()
