// Texto seguro para gravar: sem caracteres de controle (ex.: o caractere nulo que às vezes vem do PDF do banco).
// O banco da nuvem recusa textos com o caractere nulo, e a recusa desfaz a importação inteira.
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001F\u007F-\u009F\uFFFD]/g
export const semControle = (t) => String(t ?? '').replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim()
export const temControle = (t) => typeof t === 'string' && new RegExp(CONTROLE.source).test(t)
