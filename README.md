# Muquirana 🪙

Controle financeiro pessoal: cada tostão conta.

App web instalável no celular (PWA). Os dados ficam no aparelho (IndexedDB) e, com login, sincronizam na nuvem;
o app lembra de fazer backup de tempos em tempos.

**No celular, abra sempre pelo Chrome/Safari ou pelo ícone instalado.** O navegador de dentro do WhatsApp/Instagram
guarda os dados separado e pode apagá-los (o app avisa quando está aberto assim).

## Rodar no computador

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## O que o app faz

- Lançamento rápido de despesas, receitas e transferências
- Cartões com fatura (fechamento/vencimento), compras parceladas e pagamento de fatura (com data)
- Importação de extrato OFX (conta e cartão) e de PDF do Santander (vários meses de uma vez), sem duplicar, conferindo cada saldo impresso pelo banco
  - PIX com o seu nome vai para a conta certa (Inter, Caixa…) pela tabela "PIXs Enviados" do extrato, com opção de lançar como pagamento lá
  - pagamentos de fatura sem cartão cadastrado criam o cartão (nunca são ignorados); importação com saldo diferente do banco pede confirmação
  - contas que só têm o que veio de outro extrato aparecem como "saldo estimado"
- Categorização automática (regras prontas + aprende com você) e "Categorizar rápido": escolhe a categoria uma vez por loja/pessoa
- Importação só pergunta o que o app não tem como saber (contas/cartões novos) e lembra as respostas
- Contas fixas do mês para confirmar com um toque e saldo previsto para o fim do mês
- Orçamento mensal por categoria, com aviso aos 80% e ao estourar
- Histórico com gráficos por ano, mês e dia e comparação de meses e de anos
- Login por código no e-mail e sincronização entre aparelhos (Dexie Cloud), funcionando offline
- Espaços compartilhados (ex.: Casa) com convite por e-mail e permissão de editar ou só ver
- Lembretes na agenda do celular (.ics) para contas fixas e vencimento de faturas
- Dividir um lançamento em dois (ex.: pagamento que cobriu dois meses)
- Ao entrar na conta, junta contas/categorias iniciais repetidas que nunca foram usadas; o selo mostra o que ainda não foi para a nuvem
- Backup e restauração (inclusive direto na tela de boas-vindas), lembrete de backup, modo zoeira

## Testes

```bash
npm test
```

São 395 testes automáticos (`tests/`), entre eles:

- datas, centavos e parcelas (soma sempre exata); fatura em 30 mil datas aleatórias
- saldos, resumo do mês, pagamento de fatura, transferências, validação (nada inválido é gravado)
- leitura de OFX (SGML/XML, Windows-1252/UTF-8), importação sem duplicar, tudo-ou-nada
- migração do banco da versão 1 para a 2 sem perder dados
- categorização, contas fixas, saldo previsto, orçamento, histórico, agenda e espaços
- leitor de PDF do Santander com extratos fictícios (conferência de saldos, meses faltando, períodos repetidos)
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
