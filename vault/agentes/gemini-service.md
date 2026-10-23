---
title: "GeminiService (fachada)"
description: "Fachada window.GeminiService que expõe os agentes de exames e de entrevista."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["gemini-service"]
---

# GeminiService (fachada)

**Agente** · arquivo-fonte: `src/geminiService.js`

Arquivo de ~26 linhas: só expõe `window.GeminiService` delegando para o [Agente de exames](gemini-exam-agent.md) e o [Agente de entrevista](gemini-interview-agent.md). A implementação mora em `gemini-json-utils.js`, `gemini-exam-agent.js` e `gemini-interview-agent.js`.

## Memórias relacionadas

- [gemini-service-modularizado](../memorias/gemini-service-modularizado.md): Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
