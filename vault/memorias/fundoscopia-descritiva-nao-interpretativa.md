---
title: "fundoscopia-descritiva-nao-interpretativa"
description: "Regra do médico (2026-08-04) — a descrição injetada da fundoscopia não diz \"sugestivo/suspeita de glaucoma\"; só o achado"
date: 2026-08-04
tags: [memoria, feedback]
aliases: ["fundoscopia-descritiva-nao-interpretativa"]
---

# fundoscopia-descritiva-nao-interpretativa

> Regra do médico (2026-08-04) — a descrição injetada da fundoscopia não diz "sugestivo/suspeita de glaucoma"; só o achado

A descrição da fundoscopia injetada no prontuário é **descritiva, nunca
interpretativa**: escreve `escavação aumentada (relação E/D ~0,7)`, nunca
`suspeita de glaucoma` / `sugestivo de glaucoma` / `escavação glaucomatosa`.
A suspeita pertence ao `diagnostico` (`H400`) e os exames à `conduta`.

**Why:** o laudo do exame descreve o que foi visto; a leitura diagnóstica é decisão
do médico e tem campo próprio. Os exemplos canônicos do prompt e da skill
`fundoscopia-oftalmologia` ensinavam a frase errada — o modelo estava obedecendo.

**How to apply:** a correção é de PROMPT + SKILL. O runtime apenas **avisa**
(`_avisoFundoscopiaInterpretativa` em `src/DecisionEngine.js`) e não recorta a
frase: em "escavação glaucomatosa (0,8)" o achado e a interpretação são a mesma
oração, e recortar apagaria o achado. Nenhum guard deste projeto edita prosa
clínica — o padrão é campo vazio ou aviso (ver [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md)).
Mover a suspeita para o diagnóstico ainda REFORÇA a rede determinística:
`temAchadoPosteriorNoDiagnostico()` é que suprime o template de fundo normal.

---

Related: [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [Fundoscopia (skill)](../skills/fundoscopia-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [exame-nomeado-por-deducao](exame-nomeado-por-deducao.md)

Up: [Memórias](INDEX.md)
