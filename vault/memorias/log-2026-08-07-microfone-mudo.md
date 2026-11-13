---
title: "log-2026-08-07-microfone-mudo"
description: "Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera"
date: 2026-08-07
tags: [memoria, project]
aliases: ["log-2026-08-07-microfone-mudo"]
---

# log-2026-08-07-microfone-mudo

> Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera

Log 2026-08-07 19:14: 70s de consulta, `recognizedText` vazio, **nenhuma linha de erro**. Causa: a track de áudio do `persistentStream` fica **`muted`** (o SO reconfigura o grafo de dispositivos — abrir a câmera em 4K é gatilho comum no Windows) sem nunca virar `ended`. A checagem de reuso só testava `readyState === 'ended'`, então o mudo era carregado para a sessão seguinte.

Três agravantes, todos corrigidos:
1. `isSpeechActive` é otimista (setado ao CHAMAR `start()`, só limpo no `onend`). Com o Chrome matando a sessão sem `onend`, a flag prendia em `true` e todo caminho de recuperação — que testa `!isSpeechActive` — virava no-op silencioso. `resumeSpeechRecognition` logava "retomado" sem reiniciar nada.
2. O guard `!isSpeechPausedByCamera` nos caminhos de recuperação (`onend`, backoff, `onerror`) era herança de quando a câmera parava o STT. Como `pauseSpeechRecognition` só levanta uma flag (a câmera é vídeo-only), o guard prendia a consulta inteira sem STT. **Removido** — sobra só o early-return do aviso por silêncio em `_checkSilence`.
3. `[Audio] Nenhum som/fala detectado` mentia: `hasSpeech` vem de `recognizedText`, não de nível de áudio. Não existe VAD.

**Why:** falha sem log e sem aviso visual é a pior classe de bug aqui — o médico só descobre depois que o paciente saiu.

**How to apply:** o sinal confiável de mic morto é `track.muted`/`ended`, não silêncio (durante a câmera o silêncio é normal e avisar treina o médico a ignorar). Liveness do STT se testa chamando `start()`: `InvalidStateError` = vivo, sucesso = estava morto e voltou — ver `_probeSpeechAlive`. **PENDENTE:** confirmar em DevTools, com gravação ativa, que `speechRecognition.start()` de fato lança `InvalidStateError` no Chrome — toda a recuperação depende disso. Testes `[MIC-*]`/`[SPEECH-*]` em `utils/integration-test.js`. Relacionado: [speech-log-truncado-120](speech-log-truncado-120.md), [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md).

---

Related: [speech-log-truncado-120](speech-log-truncado-120.md) · [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md)

Up: [Memórias](INDEX.md)
