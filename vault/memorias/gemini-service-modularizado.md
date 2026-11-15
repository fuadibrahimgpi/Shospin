---
title: "gemini-service-modularizado"
description: "Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)"
date: 2026-07-02
tags: [memoria, project]
aliases: ["gemini-service-modularizado"]
---

# gemini-service-modularizado

> Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)

Em 2026-07-02 o `src/geminiService.js` (2.324 linhas) foi dividido: `src/gemini-json-utils.js` (parse/repair de JSON), `src/gemini-exam-agent.js` (OCR TOPCON), `src/gemini-interview-agent.js` (análise de consulta, contém `_buildConsultationPrompt` com TODAS as regras clínicas de conduta/óculos) e `src/geminiService.js` reduzido à fachada `window.GeminiService`.

**Why:** os SKILL.md em `skills/user/` e o histórico de erros ainda citam `src/geminiService.js` como o lugar de corrigir o prompt — essas referências são históricas.

**How to apply:** correções de regras clínicas do prompt vão em `src/gemini-interview-agent.js` (espelhadas no SKILL.md correspondente; os testes `[SKILL-SYNC]` em `utils/integration-test.js` verificam âncoras nos dois). Ver [project_nested_duplicate](project_nested_duplicate.md) — a pasta aninhada agora também está no .gitignore.

---

Related: [project_nested_duplicate](project_nested_duplicate.md) · [GeminiService (fachada)](../agentes/gemini-service.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [log-2026-07-28-pendencias](log-2026-07-28-pendencias.md) · [reestruturacao-fases](reestruturacao-fases.md) · [skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md)

Up: [Memórias](INDEX.md)
