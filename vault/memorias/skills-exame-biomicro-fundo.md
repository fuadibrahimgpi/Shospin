---
title: "skills-exame-biomicro-fundo"
description: "Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade"
date: 2026-07-28
tags: [memoria, project]
aliases: ["skills-exame-biomicro-fundo"]
---

# skills-exame-biomicro-fundo

> Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade

Criadas em 2026-07-28 duas sub-skills dedicadas, modeladas na `conduta-tratamento-oftalmologia`:
`skills/user/biomicroscopia-oftalmologia/SKILL.md` (segmento anterior) e
`skills/user/fundoscopia-oftalmologia/SKILL.md` (segmento posterior).

Lógica comum (simétrica entre as duas): **normal nos dois olhos** → campo `null` + `injectExamesNormais=true` (template `AO`); **achado em um olho** → olho afetado detalhado + contralateral normal (`olho calmo` na biomicro, `fundo sem alterações` na fundo) + `injectExamesNormais=false`. `AO` proibido em achado unilateral por natureza; glaucoma NÃO está nessa lista (costuma ser bilateral). `escavação simétrica` só na forma `AO`.

**Autoridade = runtime, não a skill.** A cópia que executa em produção é o prompt do Gemini em `src/gemini-interview-agent.js` (biomicro ~L816, fundo ~L856); as skills são espelho legível. Ao mudar uma regra, editar o prompt E a skill juntos. Ver [gemini-service-modularizado](gemini-service-modularizado.md).

A `transcricao-consulta-oftalmologia` **delega** para essas duas skills (não duplica mais as seções grandes) — mesmo padrão da delegação de conduta/tratamento. A tabela de histórico de erros da transcricao foi preservada.

---

Related: [gemini-service-modularizado](gemini-service-modularizado.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md) · [log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md) · [ordem-olhos-od-antes-de-oe](ordem-olhos-od-antes-de-oe.md)

Up: [Memórias](INDEX.md)
