---
title: "Gatilhos clínicos"
description: "Fonte autoritativa dos comandos de voz (STOP, DILATACAO, EXAMES_NORMAIS…) e de normalizeText()."
date: 2026-10-22
tags: [modulo, projeto-shosp]
aliases: ["clinical-triggers"]
---

# Gatilhos clínicos

**Módulo** · arquivo-fonte: `config/clinical-triggers.js`

Carregado ANTES de todos os módulos. Centraliza `normalizeText()` e todos os arrays de comandos de voz; não duplicar em `sidepanel-constants.js` nem em `geminiService.js`. Para novo gatilho, editar só este arquivo. Consumido pelos [Hooks de voz](../agentes/voice-hooks.md).

## Memórias relacionadas

- [fraseado-encerramento-consulta](../memorias/fraseado-encerramento-consulta.md): Como o médico realmente encerra consultas — saudações de despedida e "passar no balcão"; não usa "me liga" nem perguntas abertas
- [speech-log-truncado-120](../memorias/speech-log-truncado-120.md): O log "[Speech] Final:" mostra só os últimos 120 chars — não é o texto que os gatilhos veem

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Módulos](INDEX.md)
