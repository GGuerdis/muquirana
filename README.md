# Muquirana 🪙

Controle financeiro pessoal: cada tostão conta.

App web instalável no celular (PWA). Os dados ficam guardados só no aparelho (IndexedDB);
use **Ajustes → Fazer backup** de vez em quando.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## Testes

```bash
npm test
```

São 92 testes automáticos das regras financeiras (`tests/`):

- datas, centavos e divisão de parcelas (soma sempre exata)
- fatura: em qual fatura cai cada compra, incluindo fevereiro, ano bissexto e virada de ano,
  mais 30 mil datas aleatórias
- saldos, resumo do mês, pagamento de fatura, transferências
- validação: nada inválido é gravado
- editar e apagar parcelas, backup (exportar e restaurar dá exatamente os mesmos dados)
- simulação com 900 operações aleatórias, conferindo depois de cada uma que os saldos
  fecham ao centavo

Rode os testes antes de publicar qualquer mudança.

## Gerar a versão para publicar

```bash
npm run build
```

O resultado fica em `dist/`, pronto para subir no GitHub Pages, Vercel ou Netlify.

## Onde fica cada coisa

- `src/lib/fatura.js`: regras de fechamento e vencimento de fatura
- `src/lib/lancamentos.js`: salvar, editar e apagar (inclusive parcelas)
- `src/lib/calculos.js`: saldos e resumo do mês
- `src/lib/zoeira.js`: as frases do Muquirana
- `src/lib/db.js`: banco local, categorias padrão e backup
- `src/pages/`: telas (Início, Lançamentos, Cartões, Ajustes, Boas-vindas)
- `public/icone.svg`: ícone (rode `npm run icons` depois de mudar)
