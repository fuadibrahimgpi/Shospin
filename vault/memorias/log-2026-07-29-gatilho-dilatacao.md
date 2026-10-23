---
title: "log-2026-07-29-gatilho-dilatacao"
description: "Dilatação não disparou em 2026-07-29 — plural \"-arem lá fora\" e \"colírio\" comido pelo ASR; ambos corrigidos"
date: 2026-07-29
tags: [memoria, project]
aliases: ["log-2026-07-29-gatilho-dilatacao"]
---

# log-2026-07-29-gatilho-dilatacao

> Dilatação não disparou em 2026-07-29 — plural "-arem lá fora" e "colírio" comido pelo ASR; ambos corrigidos

Consulta de criança com acompanhante (2026-07-29). A fala de envio para dilatação
não disparou nenhum gatilho — duas falhas independentes na mesma frase:

1. **"esperarem lá fora"** (infinitivo pessoal plural). A lista tinha o singular
   (`esperar la fora`), o presente (`espera la fora`) e o imperativo plural
   (`esperem la fora`), mas nenhuma forma em **-arem**. Corrigido: 12 entradas
   (esperarem/aguardarem/ficarem/sentarem × la/ali/aqui fora).
2. **"vou colher de fazer efeito para dilatar"** — o ASR comeu "colírio"
   ("vou colocar o colírio" → "vou colher"), derrubando o combo
   `['colirio','dilatar']`. Nada cobria "efeito para dilatar". Corrigido com as
   frases `efeito para dilatar` / `efeito e dilatar` (NÃO com combo
   `['efeito','dilatar']` — 'efeito' solto já foi removido dos combos por falso
   positivo com "fazer efeito" de qualquer medicação). `efeito e dilatar` foi
   testado e REJEITADO: casa narração retrospectiva ("fez efeito e dilatar foi
   rápido").

Nota: `detectaDilatacaoNaFala()` (fallback do `onstop`) usa `includes` puro — sem
checagem de negação nem de fronteira de palavra, ao contrário do `_hookMatches` do
runner. "não precisa dilatar" dispara nesse caminho. É pré-existente para TODAS as
entradas, não uma regressão — mas conta na hora de avaliar entrada nova.

Testes de regressão em `utils/hooks-test.js`: `[DIL-AREM-1/2]`, `[DIL-EFEITO-1/2]`,
`[DIL-LOG-2026-07-29]` (cauda real do log; verifica que dilatação vence o stop).

**Why:** a família "mandar esperar lá fora" é enumerada à mão por substring, então
cada conjugação nova é um buraco silencioso; e o ASR come palavras-âncora dos combos.

**How to apply:** ao ver dilatação que não dispara, testar a frase literal contra as
listas antes de suspeitar do runner. Não adicionar `para dilatar` solto nem combos com
palavras genéricas ('efeito', 'la fora', 'pingar') — o histórico do arquivo mostra
duas regressões por isso. Ver [speech-log-truncado-120](speech-log-truncado-120.md) e [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md).

---

Related: [speech-log-truncado-120](speech-log-truncado-120.md) · [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [conduta-normalidade-nao-e-conduta](conduta-normalidade-nao-e-conduta.md)

Up: [Memórias](INDEX.md)
