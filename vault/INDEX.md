---
title: Cofre Shosp Extension
description: Mapa do projeto da extensão Chrome de prontuário oftalmológico (SHOSP) — agentes, skills, memórias e histórico.
date: 2026-10-22
tags: [indice, projeto-shosp]
---

# Cofre Shosp Extension

Extensão Chrome MV3 (v5.1.5) que automatiza o prontuário oftalmológico no SHOSP: transcrição de voz da consulta e OCR de ticket TOPCON via Gemini, com guards determinísticos contra alucinação clínica. Este cofre liga os agentes, as skills, as memórias de trabalho e o histórico do que já foi feito.

## Por onde começar

- [Agentes](agentes/INDEX.md): quem faz o quê — entrevista, exames, DecisionEngine, contrato dos subagentes, hooks de voz
- [Skills](skills/INDEX.md): as 9 skills com as regras clínicas (CID, conduta, OCR, gatilhos…)
- [Módulos](modulos/INDEX.md): gatilhos clínicos, léxico de medicamentos, content script, fila de dilatação, estado
- [Memórias](memorias/INDEX.md): 50 notas de aprendizado e pendências, por tipo
- [Histórico](historico/INDEX.md): linha do tempo de commits e logs, changelog v5.1

## Como o fluxo se encaixa

1. A voz passa pelos [Hooks de voz](agentes/voice-hooks.md), com listas de [Gatilhos clínicos](modulos/clinical-triggers.md).
2. A transcrição vai ao [Agente de entrevista](agentes/gemini-interview-agent.md) (regras espelhadas nas [skills](skills/INDEX.md)); o [Agente de medicamentos](agentes/medicamentos-agent.md) cuida do campo tratamento sob o [Contrato dos subagentes](agentes/agent-contract.md).
3. A resposta passa pelo [DecisionEngine](agentes/decision-engine.md) (guards).
4. Fotos do ticket vão ao [Agente de exames](agentes/gemini-exam-agent.md).
5. O [Content script](modulos/content-script.md) injeta no SHOSP; a [Fila de dilatação](modulos/dilatacao-pausas.md) trata pacientes em espera.

## Convenções do cofre

- Links relativos em markdown (funcionam no Obsidian, no GitHub e no VS Code).
- Fonte de verdade do código: o repositório. As memórias aqui são uma cópia de 2026-10-22 e podem ficar defasadas.
- Abra a pasta `vault/` no Obsidian ("Open folder as vault").
