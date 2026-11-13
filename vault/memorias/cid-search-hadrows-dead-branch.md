---
title: "cid-search-hadrows-dead-branch"
description: "searchCid: ramo 'hadRows' era morto → msg de falha de CID não distinguia gap-do-subset de bug-de-matching; corrigido com sawAnyRows"
date: 2026-07-27
tags: [memoria, project]
aliases: ["cid-search-hadrows-dead-branch"]
---

# cid-search-hadrows-dead-branch

> searchCid: ramo 'hadRows' era morto → msg de falha de CID não distinguia gap-do-subset de bug-de-matching; corrigido com sawAnyRows

Log 2026-07-27 ~18:16: injeção do CID **H40.0 "Suspeita de glaucoma"** falhou
(`Nenhum resultado para o CID: H40.0`); os demais (H25.0, H01.0, H52.4, H52.0,
H52.2) entraram. Normalização H400→H40.0 está OK (não é bug de formato).

**Achado de código (corrigido):** em `src/content.js`, no handler `searchCid`, a
variável `rows` só era atribuída dentro de `if (picked) { rows = currentRows; break }`,
então ao chegar em `if (!targetRow)` ela era SEMPRE `[]` → `hadRows` sempre falso →
a mensagem "Nenhum resultado compatível com a categoria" era **inalcançável**. Toda
falha de CID emitia o mesmo "Nenhum resultado para o CID: X", misturando dois cenários
distintos: (a) SHOSP não indexa o código (gap do subset → exige entrada manual) vs
(b) SHOSP retornou linhas mas `tryPickFromRows` rejeitou todas (bug de matching).
Fix: flags `sawAnyRows`/`rejectedRows` no loop de variantes; a mensagem de falha
(tanto `contentLogger` na aba SHOSP quanto `resp.error` que aparece no console do
sidepanel via [sidepanel-injection.js:233]) agora distingue os dois e lista as variantes
tentadas + linhas descartadas. `contentLogger.info/debug` = console.log direto, SEM
level-gating, então as linhas por-variante SEMPRE aparecem na aba SHOSP.

**PENDENTE — decidir o fallback do H40.0.** Bloqueado até reproduzir e ler qual ramo
dispara. Se for gap real do subset (sawAnyRows=false), o fallback por descrição deve
casar no token DISTINTIVO ("suspeita"), NUNCA no token da doença ("glaucoma") sozinho —
"glaucoma" casaria H40.1 POAG e códigos confirmados, e a transcrição é explícita de que
a paciente NÃO tem diagnóstico ("suspeita... não passou remédio"). Sem linha preservando
"suspeita" → falhar para `_surfaceFailedCids()` (entrada manual). NUNCA mapa código→código
estático. Ver [log-2026-07-27-pendencias](log-2026-07-27-pendencias.md) e o gap por-design [log-2026-07-24-pendencias](log-2026-07-24-pendencias.md).

---

Related: [log-2026-07-27-pendencias](log-2026-07-27-pendencias.md) · [log-2026-07-24-pendencias](log-2026-07-24-pendencias.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [cid-historico-como-resultado](cid-historico-como-resultado.md)

Up: [Memórias](INDEX.md)
