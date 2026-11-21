// A personalidade do Muquirana. Com o "modo zoeira" desligado, as mensagens ficam sérias.
import { hoje } from './datas.js'

// Escolhe uma frase que muda por dia (e não a cada clique)
function sortear(lista, semente = '') {
  const s = hoje() + semente
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return lista[h % lista.length]
}

export const ROSTOS = {
  sumido: '🧐',
  semEntrada: '🤨',
  tranquilo: '😌',
  suando: '😰',
  chorando: '😭',
  comemorando: '🤑',
}

const FRASES = {
  sumido: [
    'Sumiu? A fatura não sumiu.',
    'Nenhum gasto lançado. Ou você virou monge, ou está me escondendo coisa.',
    'Bora lançar aí. Cada tostão conta!',
  ],
  semEntrada: [
    'Só saída por enquanto. Lança o salário quando cair, que eu fico mais calmo.',
    'Gastando e nada entrando? Cadê o salário nessa conta?',
  ],
  tranquilo: [
    'Tudo sob controle. Continue assim, muquirana.',
    'O cofrinho está em paz. Por enquanto.',
    'Gastando com responsabilidade. Estou orgulhoso.',
  ],
  suando: [
    'Calma lá... o dinheiro está acabando antes do mês.',
    'Estou suando frio. Segura esse cartão.',
    'Já foi mais de 80% do que entrou. Precisa mesmo?',
  ],
  chorando: [
    'Saiu mais do que entrou. Estou chorando abraçado ao cofrinho.',
    'No vermelho! O muquirana interior está de luto.',
    'Lá se foi a bufunfa. E levou junto a minha dignidade.',
  ],
  comemorando: [
    'Sobrou dinheiro! Cada tostão contou.',
    'Mês fechando no azul. Hoje tem pão com mortadela extra.',
    'Olha só, sobrou! O muquirana aprova.',
  ],
}

const FRASES_SERIAS = {
  sumido: 'Nenhum lançamento neste mês ainda.',
  semEntrada: 'Nenhuma receita lançada neste mês ainda.',
  tranquilo: 'Seus gastos estão dentro do que entrou.',
  suando: 'Você já gastou mais de 80% do que entrou no mês.',
  chorando: 'Os gastos do mês passaram das entradas.',
  comemorando: 'O mês está fechando com saldo positivo.',
}

export function humorDoMes(resumo, ehMesAtual, zoeira) {
  let humor
  if (resumo.entrou === 0 && resumo.saiu === 0) humor = 'sumido'
  else if (resumo.entrou === 0) humor = 'semEntrada'
  else if (resumo.saiu > resumo.entrou) humor = 'chorando'
  else if (resumo.saiu > resumo.entrou * 0.8) humor = 'suando'
  else if (!ehMesAtual || new Date().getDate() >= 25) humor = 'comemorando'
  else humor = 'tranquilo'
  const mensagem = zoeira ? sortear(FRASES[humor], humor) : FRASES_SERIAS[humor]
  return { humor, rosto: ROSTOS[humor], mensagem }
}

// Comentário depois de salvar um lançamento
export function comentarioAoSalvar(form, categoria, zoeira) {
  if (!zoeira) return 'Lançamento salvo.'
  const reais = form.valor / 100
  const cat = categoria?.nome || ''
  const aleatorio = (lista) => lista[Math.floor(Math.random() * lista.length)]

  if (form.tipo === 'receita') {
    return aleatorio(['Dinheiro entrando! Agora segura ele aí.', 'Opa, bufunfa nova! Não gasta tudo de uma vez.', 'Entrou! O muquirana sorriu.'])
  }
  if (form.tipo === 'transferencia') return 'Dinheiro trocando de bolso. Tudo certo.'
  if (form.parcelas > 1) {
    return aleatorio([`Parcelou em ${form.parcelas}x... o você do futuro mandou um abraço.`, `${form.parcelas} parcelas. Pelo menos é sem juros, né? NÉ?`])
  }
  if (/alimenta|delivery|ifood/i.test(cat) && reais >= 40) return 'iFood de novo? A cozinha está com saudade de você.'
  if (reais >= 500) return aleatorio(['Eita. Lá se vai a bufunfa.', 'Gasto grande registrado. Respira.', 'Meu coraçãozinho de muquirana até parou.'])
  if (reais <= 10) return aleatorio(['Gastinho de nada. Mas é de grão em grão...', 'Até o cafezinho entra na conta. Muito bem!'])
  return aleatorio(['Anotado. Cada tostão conta!', 'Registrado. Estou de olho.', 'Gasto lançado. O muquirana agradece a honestidade.'])
}
