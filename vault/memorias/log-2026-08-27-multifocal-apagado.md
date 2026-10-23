---
title: "log-2026-08-27-multifocal-apagado"
description: "Guard exigia a palavra \"multifocal\" e apagou conduta correta descrita como \"longe perto junto\"; H524 sobreviveu"
date: 2026-08-27
tags: [memoria, project]
aliases: ["log-2026-08-27-multifocal-apagado"]
---

# log-2026-08-27-multifocal-apagado

> Guard exigia a palavra "multifocal" e apagou conduta correta descrita como "longe perto junto"; H524 sobreviveu

Consulta de 2026-08-27 13:04: o médico descreveu o multifocal sem nomeá-lo ("tem grau de longe perto junto, aí eu vou fazer a receita"). O modelo acertou `Prescrição de óculos multifocais`, e `_guardMultifocalSemEvidencia` rebaixou para `Prescrição de óculos` — enquanto `_guardPresbiopiaObrigatoria` aceitava a MESMA evidência e mantinha o H524. Prontuário incoerente: presbiopia diagnosticada, tipo de lente apagado.

**Why:** a rede determinística ficou mais estreita que a regra que protege — prompt (2º critério) e SKILL sempre aceitaram "longe + perto na mesma armação". A causa estrutural foi haver **duas cópias** do regex do par longe+perto, uma em cada guard.

**How to apply:** guard novo que filtra uma regra do prompt tem de cobrir TODOS os critérios dela, não só o mais literal; e quando dois guards leem a mesma evidência clínica, o matcher tem de ser um só (agora `_hasParLongePertoAncorado`, com âncora por guard). O inverso deste bug é [log-2026-08-05-multifocal-e-fundoscopia](log-2026-08-05-multifocal-e-fundoscopia.md) — a adjacência exigida no par cobre os dois lados sem parser de negativas.

---

Related: [log-2026-08-05-multifocal-e-fundoscopia](log-2026-08-05-multifocal-e-fundoscopia.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [CID (skill)](../skills/cid-oftalmologia.md)

Up: [Memórias](INDEX.md)
