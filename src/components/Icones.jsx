// Ícones de traço (SVG), na cor do texto. Usados na barra de navegação e em botões.
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const IconeInicio = () => (
  <svg {...base}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></svg>
)
export const IconeLista = () => (
  <svg {...base}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>
)
export const IconeGrafico = () => (
  <svg {...base}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-6" /></svg>
)
export const IconeCartao = () => (
  <svg {...base}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h3" /></svg>
)
export const IconeEngrenagem = () => (
  <svg {...base}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
)
export const IconeOlho = () => (
  <svg {...base}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
)
export const IconeOlhoFechado = () => (
  <svg {...base}><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2" /><path d="m2 2 20 20" /></svg>
)
export const IconeEtiqueta = () => (
  <svg {...base}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>
)
export const IconeImportar = () => (
  <svg {...base}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
)

// Desenhos das categorias (dentro do losango HUD). Mesma grade 24x24, só traço.
export const DESENHOS_CATEGORIA = {
  alimentacao: <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M17 21V3c-2 1.5-3 4-3 7h3" /></>,
  mercado: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.3a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6" /></>,
  moradia: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>,
  contas: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
  transporte: <><path d="M5 16h14M6.5 16V11l2-4.5h7l2 4.5v5" /><path d="M4 11h16v5H4z" /><circle cx="7.5" cy="18" r="1.6" /><circle cx="16.5" cy="18" r="1.6" /></>,
  saude: <><path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 1 0-7.1 7.1L12 21l8.4-8.3a5 5 0 0 0 0-7.1z" /><path d="M7 12h2.5l1.5-2.5 2 5 1.5-2.5H17" /></>,
  lazer: <><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2z" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
  assinaturas: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="m10 8.5 4 2.5-4 2.5z" /><path d="M8 21h8" /></>,
  compras: <><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  educacao: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /><path d="M22 9v5" /></>,
  presentes: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8C10 4 7 5 8 7.5c.6 1 2.5.5 4 .5zM12 8c2-4 5-3 4-.5-.6 1-2.5.5-4 .5z" /></>,
  impostos: <><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  outros: <><path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  salario: <><rect x="2" y="6" width="20" height="13" rx="2" /><circle cx="12" cy="12.5" r="3" /><path d="M6 9.5v6M18 9.5v6" /></>,
  rendimentos: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  freela: <><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M2 19h20M9 9.5l-2 1.5 2 1.5M15 9.5l2 1.5-2 1.5" /></>,
  reembolso: <><path d="M4 9h11a5 5 0 0 1 0 10H8" /><path d="M8 5 4 9l4 4" /></>,
  transferencia: <><path d="M4 8h15M15 4l4 4-4 4" /><path d="M20 16H5M9 12l-4 4 4 4" /></>,
  fatura: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h3" /></>,
  mais: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
  // para as categorias que você cria (escolhidas no formulário)
  predio: <><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h3a1 1 0 0 1 1 1v10M3 21h18" /><path d="M8.5 8h3M8.5 12h3M8.5 16h3" /></>,
  viagem: <><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></>,
  pet: <><circle cx="6" cy="10" r="1.8" /><circle cx="10" cy="6" r="1.8" /><circle cx="14" cy="6" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M12 11.5c-2.8 0-5 3.6-5 6a2.5 2.5 0 0 0 3.6 2.2c.9-.4 1.9-.4 2.8 0A2.5 2.5 0 0 0 17 17.5c0-2.4-2.2-6-5-6z" /></>,
  academia: <><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></>,
  telefone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  roupa: <><path d="M9 3.5 4 6l1.5 4.5L7 10v10.5h10V10l1.5.5L20 6l-5-2.5a3 3 0 0 1-6 0z" /></>,
  beleza: <><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8.2 7.8 20 18M8.2 16.2 20 6" /></>, // tesoura (salão, barbearia)
  banco: <><path d="m3 9 9-5.5L21 9" /><path d="M5 9.5v8M9.7 9.5v8M14.3 9.5v8M19 9.5v8M3.5 20.5h17" /></>,
  // telas do menu do sol
  lista: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  historico: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-6" /></>,
  meta: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" /></>,
  previsao: <><path d="M3 16l5-5 4 3 7-8" /><path d="M15 6h4v4" /><path d="M3 21h18" strokeDasharray="2 3" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M2.5 12h3M18.5 12h3M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
}
// Desenhos que a pessoa pode escolher para uma categoria nova (na ordem do formulário)
export const DESENHOS_ESCOLHA = ['outros', 'alimentacao', 'mercado', 'moradia', 'predio', 'contas', 'transporte', 'viagem', 'saude', 'academia', 'beleza',
  'lazer', 'assinaturas', 'telefone', 'compras', 'roupa', 'educacao', 'presentes', 'pet', 'impostos', 'banco', 'salario', 'rendimentos', 'freela', 'reembolso']

export const IconeVoltar = () => (
  <svg {...base}><path d="M15 5l-7 7 7 7" /></svg>
)
export const IconeMais = () => (
  <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
)
// "Só o essencial" (linhas encolhendo) e "Mostrar tudo" (linhas cheias)
export const IconeEssencial = () => (
  <svg {...base}><path d="M4 7h16M4 12h10M4 17h5" /></svg>
)
export const IconeTudo = () => (
  <svg {...base}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
)
// Ajustar / escolher (controles deslizantes)
export const IconeAjustar = () => (
  <svg {...base}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
)
export const IconeNuvem = () => (
  <svg {...base}><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z" /></svg>
)
export const IconeArquivo = () => (
  <svg {...base}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
)

// ---------- Ícones de aviso e de apoio (no lugar dos emoji: mesmo traço em qualquer celular) ----------
export const IconeAlerta = () => (
  <svg {...base}><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4.5M12 17h.01" /></svg>
)
export const IconeOk = () => (
  <svg {...base}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16.5 9.5" /></svg>
)
export const IconeAtualizar = () => (
  <svg {...base}><path d="M20 11a8 8 0 0 0-14.7-4.4L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.7 4.4L20 16" /><path d="M20 20v-4h-4" /></svg>
)
export const IconeRelogio = () => (
  <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const IconeCelular = () => (
  <svg {...base}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
)
export const IconeSemInternet = () => (
  <svg {...base}><path d="M7 18h10a4 4 0 0 0 2.2-.7M20.6 14.5A4 4 0 0 0 17.6 10 6 6 0 0 0 9 6.2M6.4 8.4A4.5 4.5 0 0 0 7 18" /><path d="m3 3 18 18" /></svg>
)
export const IconeSalvar = () => (
  <svg {...base}><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" /><path d="M8 3v5h7V3M8 21v-6h8v6" /></svg>
)
export const IconeCalendario = () => (
  <svg {...base}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
)
export const IconeTesoura = () => (
  <svg {...base}><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8.2 7.8 20 18M8.2 16.2 20 6" /></svg>
)
export const IconeBusca = () => (
  <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>
)
export const IconePessoa = () => (
  <svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>
)
export const IconeEnvelope = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>
)
export const IconeCadeado = () => (
  <svg {...base}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
)
export const IconeRecibo = () => (
  <svg {...base}><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
)
export const IconeBanco = () => (
  <svg {...base}><path d="m3 9 9-5.5L21 9" /><path d="M5 9.5v8M9.7 9.5v8M14.3 9.5v8M19 9.5v8M3.5 20.5h17" /></svg>
)
export const IconeMoeda = () => (
  <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.2 0 3 5.6 1.5 5.6 4.4 0 1.3-1.2 2.2-2.8 2.2-1.3 0-2.4-.6-2.9-1.7M12 6v1.6M12 16.4V18" /></svg>
)

// Ícone pequeno no meio do texto (do tamanho da letra)
export function Ic({ i: Icone, className = '' }) {
  return <span className={`ic ${className}`} aria-hidden="true"><Icone /></span>
}
