---
title: "log-2026-09-15-tobramicina-sem-colirio"
description: "Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e \"vou passar um tratamento\" agora não acionam; guard remove a linha"
date: 2026-09-15
tags: [memoria, project]
aliases: ["log-2026-09-15-tobramicina-sem-colirio"]
---

# log-2026-09-15-tobramicina-sem-colirio

> Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e "vou passar um tratamento" agora não acionam; guard remove a linha

Log 2026-09-15 (consulta 12:01): "vou passar um tratamento para melhorar essa irritação, isso é coisa simples" + compressa + lubrificante ("pode pingar quantas vezes quiser") + ômega 3 → o Gemini escreveu `Tobramicina + dexametasona` citando o protocolo. Nenhum colírio além do lubrificante foi prescrito.

Correção: prompt/skill dizem "O lubrificante NÃO é o colírio da blefarite" (âncora SKILL-SYNC) e que o anúncio do tratamento não é colírio; detector único `_falaTemColirioDaBlefarite` em DecisionEngine usado pela promoção (2b) e pelo novo `_guardColirioBlefariteSemPrescricao` (2c), que REMOVE a linha do protocolo (com aviso) quando a fala não pronuncia o remédio nem tem colírio não-lubrificante / intenção "mais forte"/"desinflamar". O objeto logo após "pingar" decide antes da janela de ±6 palavras ("pinga esse aqui" + lubrificante depois = colírio). Testes [DE-PROT-8..14].

**Why:** o protocolo (nível 1.5) só pode NOMEAR um colírio já prescrito; a rede de 2026-08-12 só promovia genéricos e ninguém conferia a linha já nomeada. Remover em vez de rebaixar porque "Medicação ocular prescrita" ainda afirma prescrição inexistente.
**How to apply:** ao mexer no protocolo, manter "mais forte"/"desinflamar" (falas reais confirmadas pelo médico em 2026-07-07 e 2026-08-03) como gatilho. PENDENTE: H010 "Blefarite bilateral" da mesma consulta foi lançado no SHOSP — conferir se compressa/higiene foi realmente dita (log [Speech] truncado, ver [speech-log-truncado-120](speech-log-truncado-120.md)).

Relacionado: [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md), [blefarite-texto-nao-e-rotina](blefarite-texto-nao-e-rotina.md).

---

Related: [speech-log-truncado-120](speech-log-truncado-120.md) · [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [blefarite-texto-nao-e-rotina](blefarite-texto-nao-e-rotina.md) · [Agente de medicamentos](../agentes/medicamentos-agent.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md)

Up: [Memórias](INDEX.md)
