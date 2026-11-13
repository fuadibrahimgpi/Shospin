---
title: "queixa-principal-sem-negativas"
description: "Negativa de SINTOMA não entra na HDA nem no campo retorno — nem abrindo, nem no corpo"
date: 2026-08-14
tags: [memoria, feedback]
aliases: ["queixa-principal-sem-negativas"]
---

# queixa-principal-sem-negativas

> Negativa de SINTOMA não entra na HDA nem no campo retorno — nem abrindo, nem no corpo

A queixa (`hda` e `retorno`) registra APENAS o sintoma POSITIVO que motivou a consulta.
Negativa de sintoma ("nega dor, coceira ou ardência", "nega dificuldade para perto",
"não sente ardência", "sem coceira") **não é escrita** — nem abrindo o campo, nem no
corpo do texto.

**Why:** 2026-07-23 o usuário pediu só que a negativa não LIDERASSE, e a regra escrita
mandava mantê-la no corpo ("DEVE ser mantida"). Em 2026-08-14 ele foi além: negativa de
sintoma não é necessária no prontuário. A versão anterior desta memória dizia o oposto —
esta a substitui.

**How to apply:** codificado em `src/gemini-interview-agent.js` (campos `hda` e `retorno`)
e espelhado em `skills/user/transcricao-consulta-oftalmologia/SKILL.md`; teste
`[DE-ANTEC-P3]` em `utils/integration-test.js` pina o texto. Nenhum guard do
`DecisionEngine` lê o texto da HDA, então a negativa era documentação humana apenas — não
alimentava a lógica do H52.4 (essa lê a transcrição). A proibição de negativa de
ANTECEDENTE na HDA é regra separada e continua valendo (vai no campo próprio). Ligado a
[fraseado-encerramento-consulta](fraseado-encerramento-consulta.md).

---

Related: [fraseado-encerramento-consulta](fraseado-encerramento-consulta.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [achado-episodico-nao-e-diagnostico](achado-episodico-nao-e-diagnostico.md) · [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md)

Up: [Memórias](INDEX.md)
