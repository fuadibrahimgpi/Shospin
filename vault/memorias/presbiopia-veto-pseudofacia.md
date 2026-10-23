---
title: "presbiopia-veto-pseudofacia"
description: "Decisão do médico (2026-08-04) — paciente com LIO nos dois olhos não pode receber H52.4; veto só vale para pseudofacia BILATERAL"
date: 2026-08-04
tags: [memoria, project]
aliases: ["presbiopia-veto-pseudofacia"]
---

# presbiopia-veto-pseudofacia

> Decisão do médico (2026-08-04) — paciente com LIO nos dois olhos não pode receber H52.4; veto só vale para pseudofacia BILATERAL

Em 2026-08-04 o médico determinou: **paciente com lente intraocular não tem
presbiopia**. Presbiopia é perda da acomodação do cristalino; no olho pseudofácico
o cristalino não existe e a adição de perto corrige a ausência de acomodação da LIO.
Motivador: a consulta de 2026-08-03 (pseudofácica AO) saiu com H401/**H524**/H010.

Escopo escolhido — **só pseudofacia bilateral veta**:
- `lado === 'AO'` → remove/não adiciona H52.4 (se H52.4 era a única linha, vira
  `Z961 - Presença de lente intra-ocular`);
- unilateral (`OD`/`OE`) → H52.4 mantida (o olho fácico pode ser présbita);
- `detected` sem lado → mantém, pela mesma regra do runtime da lente
  ([log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md)).

**Why:** apagar presbiopia legítima já é a falha mais recorrente deste guard (3
recorrências: 2026-07-21, 2026-07-31); um veto largo seria a quarta. A lateralidade
vem de `parsePseudofaciaFromDados()`, o único parser do assunto.

**How to apply:** o veto é REGENTE — roda ANTES dos critérios de inclusão do
`_guardPresbiopiaObrigatoria`, porque `hasMultifocal` sozinho liga
`canHavePresbiopia` e tornaria o ramo de remoção inalcançável. De quebra cobre
"lente multifocal" como IMPLANTE (LIO premium), que casava o padrão de multifocal
sem nenhum óculos na consulta. Prompt e guard foram alterados juntos — quando os
dois discordam, o sintoma visível é presbiopia sumindo/aparecendo sem explicação
([log-2026-07-31-pendencias](log-2026-07-31-pendencias.md)).

---

Related: [log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md) · [log-2026-07-31-pendencias](log-2026-07-31-pendencias.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [log-2026-08-05-multifocal-e-fundoscopia](log-2026-08-05-multifocal-e-fundoscopia.md) · [log-2026-09-02-pseudofacia-fabricada](log-2026-09-02-pseudofacia-fabricada.md)

Up: [Memórias](INDEX.md)
