---
title: "Hooks de voz (VoiceHookAgent)"
description: "Runner que percorre os hooks de voz por prioridade: flag, inject ou stop."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["voice-hooks"]
---

# Hooks de voz (VoiceHookAgent)

**Agente** · arquivo-fonte: `scripts/sidepanel-hook-runner.js`

`sidepanel-hook-runner.js` itera `VOICE_HOOKS` por prioridade sobre o texto normalizado. Hooks `flag` nunca interrompem o loop; `inject` interrompem após executar; `stop` param a gravação. Stateless — o estado vem de `HOOK_STATE`. Listas de comandos vêm dos [Gatilhos clínicos](../modulos/clinical-triggers.md); regras na skill [Gatilhos e injeção](../skills/gatilhos-injecao-oftalmologia.md). Testes: `utils/hooks-test.js`.

## Memórias relacionadas

- [cid-pterigio-h110](../memorias/cid-pterigio-h110.md): Sítios errados na tabela de CIDs do prompt (pterígio H111→H110 e mais três)
- [conduta-normalidade-nao-e-conduta](../memorias/conduta-normalidade-nao-e-conduta.md): Explicado exames normais" e afins não entram na conduta — nem como cláusula dentro de linha "Explicado ..." agrupada
- [fraseado-encerramento-consulta](../memorias/fraseado-encerramento-consulta.md): Como o médico realmente encerra consultas — saudações de despedida e "passar no balcão"; não usa "me liga" nem perguntas abertas
- [log-2026-07-29-gatilho-dilatacao](../memorias/log-2026-07-29-gatilho-dilatacao.md): Dilatação não disparou em 2026-07-29 — plural "-arem lá fora" e "colírio" comido pelo ASR; ambos corrigidos
- [log-2026-08-03-cristalino-pseudofacia](../memorias/log-2026-08-03-cristalino-pseudofacia.md): Placeholder "cristalino transparente" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado
- [log-2026-08-05-multifocal-e-fundoscopia](../memorias/log-2026-08-05-multifocal-e-fundoscopia.md): Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de "fundo" — ambos corrigidos
- [log-2026-08-07-microfone-mudo](../memorias/log-2026-08-07-microfone-mudo.md): Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera
- [log-2026-09-02-pseudofacia-fabricada](../memorias/log-2026-09-02-pseudofacia-fabricada.md): Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz
- [log-2026-09-15-tobramicina-sem-colirio](../memorias/log-2026-09-15-tobramicina-sem-colirio.md): Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e "vou passar um tratamento" agora não acionam; guard remove a linha
- [opacidade-capsula-linguagem-leiga](../memorias/opacidade-capsula-linguagem-leiga.md): PCO dita em linguagem leiga ("lente um pouquinho embaçada") não virava opacidade de cápsula; e o guard de texto misto engolia a flag
- [reestruturacao-fases](../memorias/reestruturacao-fases.md): Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda
- [speech-log-truncado-120](../memorias/speech-log-truncado-120.md): O log "[Speech] Final:" mostra só os últimos 120 chars — não é o texto que os gatilhos veem
- [tempo-relativo-na-hda](../memorias/tempo-relativo-na-hda.md): Tempo na HDA é sempre duração relativa ("há ~X meses"), nunca data de calendário; e só entra o que é pertinente à queixa

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
