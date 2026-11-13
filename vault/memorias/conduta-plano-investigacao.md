---
title: "conduta-plano-investigacao"
description: "\"Se não resolver, investigar outras causas\" é conduta — não é retorno condicional vago (2026-08-04)"
date: 2026-08-04
tags: [memoria, feedback]
aliases: ["conduta-plano-investigacao"]
---

# conduta-plano-investigacao

> "Se não resolver, investigar outras causas" é conduta — não é retorno condicional vago (2026-08-04)

Consulta de cefaleia atribuída a erro refrativo (2026-08-04): o médico disse *"vou passar o óculos; se resolver, perfeito — se não resolver, tem que investigar outras causas"* e a `conduta` saiu só com `Prescrição de óculos multifocais com orientações sobre o uso`. O plano diagnóstico do médico não entrou no prontuário.

**Why:** a única regra do prompt sobre condicionais era o **filtro de descarte** de retornos condicionais vagos (`retorno se piorar`, `retorno se não adaptar`). Sem um contraexemplo adjacente, o modelo classificou o plano de investigação como mais um condicional vago e o jogou fora. O filtro está certo; faltava a exceção ao lado dele.

**How to apply:** o discriminador é **rever a mesma coisa** (descarta) × **abrir linha diagnóstica nova** (mantém). Uma linha só, com prefixo `Orientado ` — que já é whitelist do `CONDUTA_VALIDA_RE` em `_sanitizeCondutaTratamento`, então a linha não é movida para `tratamento` (começar com "Investigar" quebraria isso). Frase canônica: `Orientado prosseguir investigação de outras causas se não houver melhora com a correção óptica`. Coexiste com `Retorno X meses`, não substitui. Espelhado em `skills/user/conduta-tratamento-oftalmologia/SKILL.md` com âncora `[SKILL-SYNC]` = `prosseguir investigação de outras causas`.

---

Related: [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Agente de medicamentos](../agentes/medicamentos-agent.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md)

Up: [Memórias](INDEX.md)
