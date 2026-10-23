---
title: "opacidade-capsula-linguagem-leiga"
description: "PCO dita em linguagem leiga (\"lente um pouquinho embaçada\") não virava opacidade de cápsula; e o guard de texto misto engolia a flag"
date: 2026-08-05
tags: [memoria, feedback]
aliases: ["opacidade-capsula-linguagem-leiga"]
---

# opacidade-capsula-linguagem-leiga

> PCO dita em linguagem leiga ("lente um pouquinho embaçada") não virava opacidade de cápsula; e o guard de texto misto engolia a flag

Regra do médico (2026-08-05): quando ele disser que a lente está **um pouco embaçada**, **com sujeira**, ou que **vai precisar de limpeza**, a biomicroscopia tem que sair com "pseudofacia, opacidade de cápsula posterior". Intensidade não importa — "um pouquinho embaçada, mas ainda não atrapalha" **é** PCO.

**Why:** a consulta é fala médico→paciente, não laudo — o jargão ("opacidade de cápsula", YAG) quase nunca é dito na frente do paciente. Mesma classe do [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md). No log de 2026-08-05 a biomicroscopia saiu "LIO transparente e bem posicionada" logo após o médico dizer que estava embaçada.

**How to apply:** duas falhas somadas, ambas corrigidas —
1. prompt (`src/gemini-interview-agent.js`, bloco do CRISTALINO) e skill `biomicroscopia-oftalmologia` ganharam o registro leigo + a separação queixa-de-visão (HDA) / histórico do paciente ("já fiz a limpeza") / lente limpa;
2. `getBiomicroscopiaComLente` devolvia o texto INTACTO quando a flag ligava mas não havia placeholder `cristalino transparente` (guard de texto misto de [log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md)). Agora `_upgradeParaOpacidadeCapsula` reescreve a linha que já afirma pseudofacia — não inventa cirurgia, porque essa linha já é de olho operado.

Gatilhos leigos em `OPACIDADE_CAPSULA_COMMANDS`: frases de limpeza só entram com o **marcador de futuro dentro da string** ("vai precisar fazer uma limpeza") — substantivo solto ("limpeza da lente") casa o passado do paciente e foi o falso positivo de 2026-06-18. Embaçamento/sujeira ficam ancorados na palavra "lente"/"capsula".

Limite conhecido: `lenteLimpaDetectada` continua sendo override definitivo da sessão — se o médico disser "a lente está limpa" e só depois notar o embaçamento, o gatilho não dispara (o LLM ainda pode acertar). Mantido de propósito, é o que segura o falso positivo histórico.

Testes: `[PCO-1..5]` e `[LENTE-9..12]` em `utils/hooks-test.js`.

---

Related: [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md)

Up: [Memórias](INDEX.md)
