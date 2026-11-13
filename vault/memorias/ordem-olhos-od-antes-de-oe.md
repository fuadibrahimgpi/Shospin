---
title: "ordem-olhos-od-antes-de-oe"
description: "Em qualquer descrição por olho, OD vem sempre antes de OE — ordem do prontuário, nunca a da fala"
date: 2026-09-04
tags: [memoria, feedback]
aliases: ["ordem-olhos-od-antes-de-oe"]
---

# ordem-olhos-od-antes-de-oe

> Em qualquer descrição por olho, OD vem sempre antes de OE — ordem do prontuário, nunca a da fala

Regra do médico (2026-09-04): em **qualquer** campo que descreva os olhos separadamente
(uma linha por olho), a linha do **OD vem primeiro** e a do **OE depois**. Vale mesmo
quando o achado é do OE e o olho esquerdo foi o assunto da consulta.

**Why:** a leitura do prontuário é sempre direito → esquerdo. O prompt só trazia exemplos
nessa ordem, sem regra explícita, e o modelo derivava para a ordem da FALA — na consulta
do pterígio OE ele escreveu `OE: ...\nOD: ...`.

**How to apply:** vale para `biomicroscopia` e `fundoscopia`. NÃO vale para `diagnostico`:
lá cada linha é um CID diferente, não o mesmo achado por olho, e reordenar embaralharia a
ordem de lançamento no SHOSP e a dedup ([cid-dedup-fronteira-de-paciente](cid-dedup-fronteira-de-paciente.md)). O runtime é
a autoridade: `_ordenaOlhosODPrimeiro` em `src/DecisionEngine.js` faz uma troca
condicional (só quando há exatamente uma linha OD, uma OE, adjacentes, com OE antes),
preservando header e linhas `AO:`. Testes `[ORD-1..6]` em `utils/integration-test.js`.
Relacionado: [skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md).

---

Related: [cid-dedup-fronteira-de-paciente](cid-dedup-fronteira-de-paciente.md) · [skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md)

Up: [Memórias](INDEX.md)
