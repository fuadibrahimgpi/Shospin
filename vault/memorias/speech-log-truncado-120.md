---
title: "speech-log-truncado-120"
description: "O log \"[Speech] Final:\" mostra só os últimos 120 chars — não é o texto que os gatilhos veem"
date: 2026-07-29
tags: [memoria, project]
aliases: ["speech-log-truncado-120"]
---

# speech-log-truncado-120

> O log "[Speech] Final:" mostra só os últimos 120 chars — não é o texto que os gatilhos veem

`sidepanel-audio.js` loga `console.log('[Speech] Final:', normalizedFinal.slice(-120))`.
O casamento de gatilhos (`runHooks`) roda sobre o `recognizedText` COMPLETO — o corte
de 120 chars é só exibição. Por isso as linhas do console parecem uma janela deslizante
que corta palavras no início ("...arem la fora" = "esperarem la fora").

**Why:** ao analisar o log de 2026-07-29 quase concluí que o gatilho de dilatação
falhou por causa de texto truncado. Não era: o texto inteiro chegou aos hooks, e a
falha era de cobertura das listas. O inverso também vale — não dá para afirmar que
uma frase NÃO estava no transcript só porque não apareceu no log.

**How to apply:** ao depurar gatilho por log de console, tratar cada linha `[Speech]
Final:` como a CAUDA do texto acumulado, nunca como a fala daquele evento. O fragmento
cortado no início ainda é informativo: a palavra termina onde o fragmento começa
(ex.: "arem la fora" prova que o verbo termina em "-arem"). Ausência de linhas
`[Hook]`/`[HookRunner]` só prova que nada casou se o console não estava filtrado —
confirmar antes de concluir que o runner quebrou. Ver [log-2026-07-29-gatilho-dilatacao](log-2026-07-29-gatilho-dilatacao.md).

---

Related: [log-2026-07-29-gatilho-dilatacao](log-2026-07-29-gatilho-dilatacao.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Gatilhos clínicos](../modulos/clinical-triggers.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md) · [log-2026-08-07-microfone-mudo](log-2026-08-07-microfone-mudo.md) · [log-2026-09-02-pseudofacia-fabricada](log-2026-09-02-pseudofacia-fabricada.md) · [log-2026-09-15-tobramicina-sem-colirio](log-2026-09-15-tobramicina-sem-colirio.md) · [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md)

Up: [Memórias](INDEX.md)
