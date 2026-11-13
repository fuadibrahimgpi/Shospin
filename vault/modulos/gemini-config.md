---
title: "Configuração do Gemini"
description: "Modelo, endereço e chave do Gemini num arquivo só: chave no cabeçalho, guardada só no navegador."
date: 2026-11-10
tags: [modulo, projeto-shosp]
aliases: ["gemini-config"]
---

# Configuração do Gemini

**Módulo** · arquivo-fonte: `config/gemini.js` · usado por `src/ApiService.js` e `scripts/config.js`

Três coisas que estavam espalhadas, agora num lugar:

- **Modelo.** `MODELO` é a única ocorrência do nome do modelo no código. Antes estava escrito em três lugares; trocar de modelo exigia lembrar dos três.
- **Chave no cabeçalho.** A chave vai em `x-goog-api-key`, a forma dos exemplos REST da documentação do Gemini (conferida em 2026-11-10). Antes ia na URL (`?key=`), onde aparece em logs de rede.
- **Chave só no navegador.** Fica em `chrome.storage.local`. Antes ficava em `chrome.storage.sync`, que o Chrome replica na conta Google.

## Migração da chave antiga

`lerChave` olha primeiro o armazenamento local. Se estiver vazio, busca a chave antiga no sync, copia para o local, **relê para conferir** e só então apaga do sync. Se qualquer passo falhar, a chave continua onde estava e segue valendo: o médico nunca fica sem chave por causa da migração.

Consequência: em outro computador com a mesma conta Google, a chave precisa ser digitada de novo uma vez.

## O que não foi conferido

A troca da URL pelo cabeçalho foi testada com rede simulada, não contra o Gemini de verdade. O botão "Testar" da página de opções usa o mesmo caminho do painel, então serve de conferência ao vivo.

Testes `[GEMINI-1]` a `[GEMINI-6]` em `utils/integration-test.js`.

---

Related: [Análise de estrutura 2026-11-10](../analise-estrutura-2026-11-10.md) · [Agente de entrevista](../agentes/gemini-interview-agent.md) · [Agente de exames](../agentes/gemini-exam-agent.md) · [Agente de OCT](../agentes/gemini-oct-agent.md)

Up: [Módulos](INDEX.md)
