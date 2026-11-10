---
title: "lubrificante-registro-padrao"
description: "'lubrificante(s)' dito pelo médico vira 'Carmelose sódica ou hialuronato de sódio' no tratamento (decisão 2026-11-05); marca/princípio dito vence"
date: 2026-11-05
tags: [memoria, project]
aliases: ["lubrificante-registro-padrao"]
---

# lubrificante-registro-padrao

> "lubrificante(s)" dito pelo médico vira "Carmelose sódica ou hialuronato de sódio" no tratamento (decisão 2026-11-05); marca/princípio dito vence

Pedido do médico (2026-11-05): toda vez que ele disser "lubrificantes" na conduta, o prontuário registra **"Carmelose sódica ou hialuronato de sódio"** (uma linha só, com o "ou" literal — os dois genéricos equivalentes; é protocolo declarado dele, não inferência).

Implementação: Guard 2f (`_guardLubrificanteGenerico`) no `DecisionEngine`, depois de `_guardCondutaContaminada`; entrada `lubrificante_padrao` no léxico (`LUBRIFICANTE_PADRAO`, cópia sincronizada por teste `[LUB-2]`); prompt (`gemini-interview-agent.js`) e skills conduta-tratamento + transcricao atualizados (âncora `[SKILL-SYNC]`).

**Why:** o médico prescreve esses dois genéricos; "Lubrificante ocular" era vago demais para o prontuário.

**How to apply:**
- Só RENOMEIA linha que o modelo já escreveu; nunca cria prescrição (anti-invenção continua mandando no *se*). Ver [conduta-plano-investigacao](conduta-plano-investigacao.md) para a linha entre nomear e inventar.
- Marca dita (Systane…) → `Lubrificante ocular (Systane)`; princípio dito (hialuronato/carmelose) → registrado como dito. Ambos vencem o padrão (decisões de 2026-10-30).
- "Lágrima artificial" sem a palavra "lubrificante" NÃO dispara.
- Posologia da linha é preservada.
- `medicacoes_em_uso` (histórico) não é tocado — só `tratamento`.

---

Related: [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Léxico de medicamentos](../modulos/medicamentos-lexico.md) · [DecisionEngine](../agentes/decision-engine.md)

Up: [Memórias](INDEX.md)
