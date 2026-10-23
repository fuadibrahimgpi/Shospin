---
title: "log-2026-08-03-cristalino-pseudofacia"
description: "Placeholder \"cristalino transparente\" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado"
date: 2026-08-03
tags: [memoria, project]
aliases: ["log-2026-08-03-cristalino-pseudofacia"]
---

# log-2026-08-03-cristalino-pseudofacia

> Placeholder "cristalino transparente" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado

Consulta de 2026-08-03: paciente operada de catarata AO há 1 ano, médico confirmou a lente boa,
e a biomicroscopia saiu com "cristalino transparente" — olho sem cristalino descrito como tendo um.

**Why:** o prompt obrigava TODA linha a terminar com "cristalino transparente" ("o sistema
substitui"), e a substituição dependia de um gatilho de voz que não disparou — quem falou foi a
PACIENTE, em 1ª pessoa ("eu fiz a cirurgia de catarata"), e `LIO_COMMANDS` só tinha a 3ª pessoa.
Não havia rede determinística: a derivação por diagnóstico só cobre catarata e a consulta nem
emitiu Z96.1 (a cirurgia estava em `antecedentes_oftalmologicos`).

**How to apply:** a lente agora é decisão do TEXTO do modelo (olho fácico → placeholder; olho
pseudofácico → "pseudofacia, LIO transparente e bem posicionada" escrito direto), e o runtime é só
rede de segurança: `parsePseudofaciaFromDados` (constants) + reconciliação em
`sidepanel-injection.js`, que **só liga a flag com o lado conhecido** — pseudofacia sem lado não
substitui nada, para não inventar cirurgia no olho são. `getBiomicroscopiaComLente` ganhou guard de
texto misto e lateralidade (`SessionFlags.lioLado`). Documentado como Caso 7d em
[skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md); mesma família dos Casos 7/7b/7c.

Pendente relacionado (não feito): o prompt não emite `Z96.1 - Presença de lente intra-ocular` no
diagnóstico de pseudofácico — seria o sinal mais limpo para a rede determinística.

---

Related: [skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md) · [opacidade-capsula-linguagem-leiga](opacidade-capsula-linguagem-leiga.md) · [presbiopia-veto-pseudofacia](presbiopia-veto-pseudofacia.md)

Up: [Memórias](INDEX.md)
