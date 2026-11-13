---
title: Cofre Shosp Extension
description: Mapa do projeto da extensão Chrome de prontuário oftalmológico (SHOSP) — agentes, skills, módulos, memórias e histórico.
date: 2026-11-10
tags: [indice, projeto-shosp]
---

# Cofre Shosp Extension

Extensão Chrome MV3 (v5.1.5) que automatiza o prontuário oftalmológico no SHOSP: transcrição de voz da consulta, OCR de ticket TOPCON e laudo de OCT de glaucoma via Gemini, com guards determinísticos contra alucinação clínica. Este cofre liga os agentes, as skills, os módulos, as memórias de trabalho e o histórico do que já foi feito.

## Por onde começar

- [Agentes](agentes/INDEX.md): quem faz o quê — entrevista, exames, OCT, DecisionEngine, recheck, auto-feedback de medicações, contrato dos subagentes, hooks de voz
- [Skills](skills/INDEX.md): as 10 skills que documentam as regras clínicas (CID, conduta, OCR, gatilhos…)
- [Módulos](modulos/INDEX.md): gatilhos clínicos, léxico de medicamentos, content script, background, mensagens, páginas de permissão, fila de dilatação, estado
- [Memórias](memorias/INDEX.md): 53 notas de aprendizado e pendências, por tipo
- [Histórico](historico/INDEX.md): linha do tempo de commits e logs, changelog v5.1
- [Análise de estrutura e correções (2026-11-10)](analise-estrutura-2026-11-10.md): os 15 achados da análise do projeto inteiro e o que foi feito de cada um
- [Revisão da estrutura do agente e das skills (2026-11-07)](revisao-estrutura-agente-2026-11-07.md): quem manda, a skill ou o código, e a cobertura dos testes de sincronia

## Como o fluxo se encaixa

1. A voz passa pelos [Hooks de voz](agentes/voice-hooks.md), com listas de [Gatilhos clínicos](modulos/clinical-triggers.md).
2. A transcrição vai ao [Agente de entrevista](agentes/gemini-interview-agent.md). As [skills](skills/INDEX.md) documentam essas regras; a autoridade é o código.
3. A resposta passa pelo [DecisionEngine](agentes/decision-engine.md): os guards tiram o que a fala não sustenta. Se a verificação fica incompleta, o painel mostra os campos e não injeta sozinho.
4. O [Content script](modulos/content-script.md) injeta no SHOSP; a [Fila de dilatação](modulos/dilatacao-pausas.md) trata pacientes em espera.
5. O [Recheck de fidelidade](agentes/recheck-agent.md) compara o que foi enviado com o que ficou no prontuário.

Em paralelo:

- Fotos do ticket vão ao [Agente de exames](agentes/gemini-exam-agent.md).
- Imagem ou PDF de OCT vai ao [Agente de OCT](agentes/gemini-oct-agent.md).
- Palavras de remédio que o léxico não conhece vão ao [Auto-feedback de medicações](agentes/medicamentos-feedback.md).

As peças conversam por mensagem; o registro de quem fala com quem está em [Mensagens entre as peças](modulos/mensagens.md).

O [Agente de medicamentos](agentes/medicamentos-agent.md), desenhado para o campo tratamento sob o [Contrato dos subagentes](agentes/agent-contract.md), está estacionado: fica no repositório com seus testes, fora do painel.

## Convenções do cofre

- Links relativos em markdown (funcionam no Obsidian, no GitHub e no VS Code).
- Fonte de verdade do código: o repositório. As regras de trabalho estão no `CLAUDE.md` da raiz.
- As memórias aqui são uma cópia sincronizada em 2026-11-10 e podem ficar defasadas.
- O teste `[VAULT-1]` falha se um agente, um arquivo de `config/` ou uma skill ficar sem página neste cofre.
- Abra a pasta `vault/` no Obsidian ("Open folder as vault").
