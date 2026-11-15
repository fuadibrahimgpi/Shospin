---
title: "achado-episodico-nao-e-diagnostico"
description: "Hemorragia subconjuntival recorrente relatada pelo paciente virou CID atual e foi arrastada para a biomicroscopia pela regra de consistência"
date: 2026-08-14
tags: [memoria, feedback]
aliases: ["achado-episodico-nao-e-diagnostico"]
---

# achado-episodico-nao-e-diagnostico

> Hemorragia subconjuntival recorrente relatada pelo paciente virou CID atual e foi arrastada para a biomicroscopia pela regra de consistência

Achado de segmento anterior **episódico** (hemorragia subconjuntival, terçol, olho vermelho
que vai e vem, conjuntivite passada) que só o PACIENTE relatou não pode entrar em
`diagnostico` como atual. Rota correta: `antecedentes_oftalmologicos` (+ HDA se motivou a
consulta). Só há CID atual se o MÉDICO descreveu ter visto hoje (lâmpada de fenda:
"encosta o queixo", "pisca"; ou apontando o achado). Declaração de normalidade do médico
("o olho está ótimo") desempata contra o CID.

**Why:** em 2026-08-14 um paciente em uso de anticoagulante relatou hemorragias recorrentes
("de vez em quando eu tenho", "geralmente não percebo") e o médico só explicou a causa —
saiu `H113` no diagnóstico e a hemorragia **descrita na biomicroscopia como achado de hoje**.
A regra de consistência diagnóstico↔exame (de [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md))
funcionou certo sobre premissa errada: com o CID no diagnóstico, ela OBRIGA o exame a
refleti-lo. A regra de fonte existia, mas na seção da biomicroscopia — tarde demais, a
decisão real acontece antes, na seção `diagnostico`.

**How to apply:** a porta de saída fica na seção `diagnostico` do prompt
(`src/gemini-interview-agent.js`), não na biomicroscopia — a consistência NÃO deve ser
afrouxada (afrouxar recria o pterígio-OD-com-"AO olho calmo"). Nada de guard subtrativo no
DecisionEngine: apagar hemorragia real é pior que o bug (ver
[log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md)). Mesma família de
[queixa-principal-sem-negativas](queixa-principal-sem-negativas.md) e [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md): history≠exame.

---

Related: [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md) · [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [queixa-principal-sem-negativas](queixa-principal-sem-negativas.md) · [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [cid-pterigio-h110](cid-pterigio-h110.md)

Up: [Memórias](INDEX.md)
