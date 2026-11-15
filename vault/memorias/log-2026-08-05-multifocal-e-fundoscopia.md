---
title: "log-2026-08-05-multifocal-e-fundoscopia"
description: "Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de \"fundo\" — ambos corrigidos"
date: 2026-08-05
tags: [memoria, project]
aliases: ["log-2026-08-05-multifocal-e-fundoscopia"]
---

# log-2026-08-05-multifocal-e-fundoscopia

> Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de "fundo" — ambos corrigidos

Consulta de 2026-08-05 17:54 (refrativa pura) teve dois erros, ambos corrigidos:

1. **"Prescrição de óculos multifocais"** sem o médico ter dito multifocal. O 3º critério do prompt (longe+perto na mesma armação) foi lido como co-ocorrência de tokens: a evidência de "perto" era queixa sobre o óculos ANTIGO e um trecho de negativas embaralhado pelo ASR. Arrastou `H524 - Presbiopia` junto, porque `PADRAO_MULTIFOCAL` lê a conduta. Fix: critério (iii) no prompt + `_guardMultifocalSemEvidencia` em `src/DecisionEngine.js`, que roda ANTES de `_guardPresbiopiaObrigatoria`.

2. **Fundoscopia normal não injetada**: o gate `mencionouFundoNaFala` era `includes('fundo')` e o ASR devolveu "produção normal" no lugar de "escavação normal". Removido do ramo de `injectExamesNormais` (a flag já significa "todos os exames normais"); mantido no fallback de despedida. O MESMO gate existia no caminho ao vivo (hook `exames_normais` em `sidepanel-hooks.js`) e era pior lá — o hook marca `examesNormaisInjetados`, que faz o `injectAll` pular o bloco de exames depois. Agora quem decide é o escopo da frase, não a palavra "fundo".

**Why:** o padrão recorrente é o mesmo de [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md) e [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) — regra determinística escrita sobre uma palavra que o reconhecimento de voz não entrega.

**How to apply:** ao criar gate baseado em token literal da transcrição, perguntar antes se a palavra sobrevive ao ASR; e ao criar guard que lê a conduta como evidência, garantir que ele roda depois dos guards que corrigem a própria conduta.

Testes `[MULTI-1..4]`, `[FUNDO-4]`, `[FUNDO-5]` em `utils/integration-test.js`. `[PRES-27]` teve a fixture atualizada (conduta sozinha já não sustenta H524).

PENDENTE: nesta consulta o H524 sobrevive mesmo assim, via critério independente `hasOculosParaPerto` — a fala tinha "oculos diretamente confortavel para perto nao tava nao" (pergunta sobre o óculos VELHO, respondida com negativa). O médico ainda não decidiu se isso deve deixar de contar. Ver [presbiopia-veto-pseudofacia](presbiopia-veto-pseudofacia.md).

---

Related: [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md) · [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [presbiopia-veto-pseudofacia](presbiopia-veto-pseudofacia.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [log-2026-08-27-multifocal-apagado](log-2026-08-27-multifocal-apagado.md)

Up: [Memórias](INDEX.md)
