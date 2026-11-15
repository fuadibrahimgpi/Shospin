---
title: "log-2026-07-21-pendencias"
description: "Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)"
date: 2026-07-21
tags: [memoria, project]
aliases: ["log-2026-07-21-pendencias"]
---

# log-2026-07-21-pendencias

> Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)

Análise do log de 2026-07-21 (4 pacientes, 12:27→13:54). Dois itens já
corrigidos em `refactor/estrutura-fase-0-1`: guard de presbiopia e
`_guardExamesNormaisFase2`. **Pendentes**, em ordem de prioridade acordada:

1. **`prontuarioOpen` sempre `false`** — TRATADO 2026-07-23 em
   `refactor/estrutura-fase-0-1`. Causa: `checkPage` usava só o seletor estrito
   `td[id^="tdCadastro-"]` (exige `<td>` com esse prefixo); o SHOSP trocou a
   tag/id e a ficha ABERTA passou a ser lida como fechada → 8/8 no fallback (~5s
   de retries+reinjeção + escolha cega de `tabs[0]`). Fix: `_isProntuarioOpen(doc)`
   (`src/content.js`) — OR de 3 marcadores; os dois primeiros
   (`[id*="prontuario_resp"]`, `[id*="divTextoProntuarioServico"]`) são os ALVOS
   REAIS da injeção, então "presente" ⇒ "injeção é possível". Superset do seletor
   antigo → não regride (sem falso-negativo). **Pendente de validação runtime pelo
   usuário**: o único risco novo é falso-positivo com 2+ abas SHOSP se
   `[id*="tdCadastro"]` vazar na agenda — rodar o one-liner de console na ficha e
   na agenda; se vazar, remover essa 3ª linha. Correção da nota antiga: a
   reinjeção de `content.js` NÃO zera o Set (`content.js:1191` guarda por
   URL/existência) — aquele parêntese estava errado.
2. **Eixo da refração nunca é verificado** — TRATADO 2026-07-23 em
   `refactor/estrutura-fase-0-1` (v5.3.5). Discordância de eixo era `soft` e a
   math-consistency `S+C/2≈SE` não testa eixo → soft+math-ok nunca bloqueava.
   Fix: `_tiebreakAxis` (3ª chamada focada na 3ª coluna A da MÉDIA) em
   `src/gemini-exam-agent.js`, espelhando sinal/cilindro. Diferença: confirmar a
   2ª OU inconclusivo FORÇA `severity='hard'` (eixo não tem corroboração
   matemática que o resgate → "não confirmei" = "não injeta"). Testes AXIS-1..7.
   **AINDA pendente (sub-item)**: em 12:50 a 2ª leitura trocou OD↔OE — ancoragem
   de lateralidade no prompt de verificação (`_getRefractionVerifyPrompt`). Não
   mexido: é separado e especulativo, precisa de mais casos para confirmar.
3. **CID H16.2 rejeitado pelo SHOSP** — VISIBILIDADE TRATADA 2026-07-23; causa
   raiz é limite de dados do SHOSP (não corrigível por código). O `searchCid`
   (`src/content.js`) já é resiliente: tenta `H162`, `H16.2` e a categoria de 3
   chars `category = term.match(/^([A-Z]\d{2})/)` = `"H16"`. Se as três dão zero
   linhas, o SHOSP não tem a categoria H16 — não é bug de busca nem CID inválido
   (H16.2 = Ceratoconjuntivite, código correto), então NÃO remover do prompt.
   Fix de visibilidade em `scripts/sidepanel-injection.js`: antes a falha só dava
   um toast fugaz e o CID sumia; agora acumula em `handleSearchCid._failed` e
   `_surfaceFailedCids()` mostra um aviso PERSISTENTE no fim da cadeia ("adicione
   manualmente: ..."). Timers de hide centralizados em `_armHideSuccess` (slot
   único) p/ o aviso não sumir em 3s. Testes CIDFAIL-1..5.
4. **H52.9 duplicado com H52.0/1/2** — TRATADO 2026-07-23 em
   `refactor/estrutura-fase-0-1`. `_dropUnspecifiedRefraction` só vê um campo por
   vez; os específicos do OCR vêm em rodada de injeção separada. Fix: guard no
   content script (`src/content.js`, handler `searchCid`, ~linha 1506) pula H52.9
   quando o Set `__shospInjectedCids` já tem um H52.0–H52.4 deste paciente — o Set
   é a única visão cumulativa cross-round. **Cobre só a ordem OCR→áudio** (a
   comum); H52.9 injetado ANTES dos específicos não é retirado (exigiria remover
   linha já clicada no SHOSP). Depende do Set sobreviver entre injeções: o reset
   em `content.js:1191` é guardado por URL/existência, então re-injeção NÃO zera o
   Set (contradiz o parêntese do item 1 — verificar aquele parêntese na prática).

Raiz comum de (1) e da contaminação entre pacientes: o código usa
`location.href` como identidade do paciente, mas o SPA do SHOSP mantém a URL
constante — ver [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md).

---

Related: [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [cid-shosp-sem-ponto](cid-shosp-sem-ponto.md) · [log-2026-07-24-pendencias](log-2026-07-24-pendencias.md) · [log-2026-07-27-pendencias](log-2026-07-27-pendencias.md) · [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md)

Up: [Memórias](INDEX.md)
