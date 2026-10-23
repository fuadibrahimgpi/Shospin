---
title: "fraseado-encerramento-consulta"
description: "Como o médico realmente encerra consultas — saudações de despedida e \"passar no balcão\"; não usa \"me liga\" nem perguntas abertas"
date: 2026-07-16
tags: [memoria, user]
aliases: ["fraseado-encerramento-consulta"]
---

# fraseado-encerramento-consulta

> Como o médico realmente encerra consultas — saudações de despedida e "passar no balcão"; não usa "me liga" nem perguntas abertas

O médico (usuário) encerra consultas com **saudações de despedida** ("bom dia", "boa tarde" — hook `stop_saudacao`, endAnchored + minSessionMs) e mandando o paciente ao **balcão** — usa tanto "passa/passar" quanto o imperativo formal **"passe no balcão"** (todas as conjugações precisam estar na lista). Ele **não usa** "me liga"/"pode ligar".

**Why:** em 2026-07-15 pediu revisão dos gatilhos de fim de consulta; as variantes "me liga" e perguntas abertas foram removidas de STOP_COMMANDS. Em 2026-07-16, "passe no balcão" não parou a gravação — além de o STT estar morto no fim da consulta (nenhuma despedida virou texto, nem "encerrar a consulta"), a variante "passe" nem existia na lista.

**How to apply:** ao adicionar/ajustar gatilhos de STOP, priorizar frases com destino físico (balcão, recepção) e saudações-despedida, cobrindo as conjugações (passa/passar/passe, pega/pegar, paga/pagar); não reintroduzir perguntas abertas nem variantes com "ligar". Se o médico relatar "disse o gatilho e não parou", verificar PRIMEIRO se há linhas `[HookRunner]` no log — ausência total = STT morto (aviso "⚠️ Sem fala há Xs" implementado em sidepanel-audio.js), não problema de lista. O gate aceita conduta refrativa E conduta de procedimento em consultório (excisão de calázio) como tratamento (checkCondutaTratamentoCaptados). Frases que são ditado de conduta ("retorno em um ano", "pode trocar os óculos") vivem em STOP_COMMANDS_ANCORADOS (endAnchored), nunca na lista forte.

---

Related: [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Gatilhos clínicos](../modulos/clinical-triggers.md) · [queixa-principal-sem-negativas](queixa-principal-sem-negativas.md)

Up: [Memórias](INDEX.md)
