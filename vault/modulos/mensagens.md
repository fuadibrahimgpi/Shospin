---
title: "Mensagens entre as peças"
description: "Registro único de quem fala com quem (painel, aba do SHOSP, background, páginas de permissão) e do formato de resposta."
date: 2026-11-10
tags: [modulo, projeto-shosp]
aliases: ["messages"]
---

# Mensagens entre as peças

**Módulo** · arquivo-fonte: `config/messages.js`

A extensão tem quatro peças que conversam por mensagem. Até 2026-11-10 os nomes das ações eram texto solto, as respostas usavam três grafias e havia três handlers que ninguém chamava. O arquivo é o registro; ele não roda dentro da extensão, quem o faz valer são os testes `[MSG-1]` a `[MSG-8]`.

| Canal | Quem envia | Quem trata |
|---|---|---|
| painel → aba do SHOSP | `scripts/` (via `sendToTab`) | [Content script](content-script.md) |
| background → painel (atalhos) | [Background](background.md) | `scripts/sidepanel-init.js` |
| painel → background | `scripts/sidepanel-init.js` | [Background](background.md) |
| páginas de permissão → painel | [Páginas de permissão](paginas-permissao.md) | `scripts/sidepanel-init.js` |

Formato da resposta, um só:

- sucesso: `{ success: true, ...dados }`
- falha: `{ success: false, error?: texto }`

Exceções mantidas de propósito: `checkPage` responde `{ isShospPage, prontuarioOpen }`, porque é sondagem; `injectAll` com pedido repetido responde `{ status: 'duplicate_ignored' }`.

## O transporte painel → aba

`sendToTab` (em `scripts/sidepanel-injection.js`) devolve uma de três formas: a resposta da aba, `'CONTEXT_INVALIDATED'` (extensão recarregada, pedir F5) ou `null` (sem resposta).

Desde 2026-11-10 há limite de tempo por ação: 5 s para sondagem, 180 s para a injeção completa, 60 s para o resto. Antes, uma aba que recebia a mensagem e não respondia pendurava a injeção para sempre. Depois do limite, a injeção completa não reenvia: parte dos campos pode já ter sido escrita.

## Para criar uma ação nova

Registrar em `config/messages.js`, escrever o envio e o handler, rodar `npm test`. Os testes falham se faltar qualquer um dos três.

---

Related: [Content script](content-script.md) · [Background](background.md) · [Análise de estrutura 2026-11-10](../analise-estrutura-2026-11-10.md)

Up: [Módulos](INDEX.md)
