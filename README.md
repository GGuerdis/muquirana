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

## O que o app faz

- Lançamento rápido de despesas, receitas e transferências
- Cartões com fatura (fechamento/vencimento), compras parceladas e pagamento de fatura (com data)
- Importação de extrato OFX (conta e cartão), sem duplicar, com conferência do saldo do banco
- Categorização automática (regras prontas + aprende com você)
- Contas fixas do mês para confirmar com um toque e saldo previsto para o fim do mês
- Orçamento mensal por categoria, com aviso aos 80% e ao estourar
- Backup e restauração (inclusive direto na tela de boas-vindas), modo zoeira

## Testes

```bash
npm test
```

São 225 testes automáticos (`tests/`), entre eles:

- datas, centavos e parcelas (soma sempre exata); fatura em 30 mil datas aleatórias
- saldos, resumo do mês, pagamento de fatura, transferências, validação (nada inválido é gravado)
- leitura de OFX (SGML/XML, Windows-1252/UTF-8), importação sem duplicar, tudo-ou-nada
- migração do banco da versão 1 para a 2 sem perder dados
- categorização, contas fixas, saldo previsto e orçamento
- simulação com 900 operações aleatórias conferindo que os saldos fecham ao centavo

A publicação no GitHub Pages só acontece se todos os testes passarem.

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
- `src/lib/ofx.js` e `src/lib/importacao.js`: leitura de extrato e importação
- `src/lib/categorizar.js`: sugestão de categoria
- `src/lib/recorrentes.js`: contas fixas e saldo previsto
- `src/lib/orcamento.js`: orçamento por categoria
- `src/pages/`: telas (Início, Lançamentos, Cartões, Ajustes, Boas-vindas)
- `public/icone.svg`: ícone (rode `npm run icons` depois de mudar)
