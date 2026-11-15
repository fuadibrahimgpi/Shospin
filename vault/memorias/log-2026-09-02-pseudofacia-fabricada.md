---
title: "log-2026-09-02-pseudofacia-fabricada"
description: "Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz"
date: 2026-09-02
tags: [memoria, project]
aliases: ["log-2026-09-02-pseudofacia-fabricada"]
---

# log-2026-09-02-pseudofacia-fabricada

> Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz

Consulta de 2026-09-02: o médico perguntou "já teve algum tratamento, cirurgia, acidente?" e a paciente respondeu "nos dois". A paciente DISSE que a cirurgia foi de PTERÍGIO (informado pelo médico; o token não aparece na transcrição disponível, que o console trunca em 120 chars — ver [speech-log-truncado-120](speech-log-truncado-120.md)). O modelo trocou o tipo por catarata, escreveu nos antecedentes "(confirmado como cirurgia de catarata pela presença de LIOs)" — dedução circular — e daí saíram `Z961 AO` no diagnóstico e "pseudofacia, LIO transparente e bem posicionada" na biomicroscopia.

**Dois erros, não um:** a pseudofacia fabricada também acionou o veto de [presbiopia-veto-pseudofacia](presbiopia-veto-pseudofacia.md) e apagou a `H524` legítima de uma paciente que usa multifocal.

`parsePseudofaciaFromDados` não falhou: leu fielmente um antecedente fabricado. A rede determinística precisa ser ANTERIOR a ele.

**Why:** o nome do procedimento vem da fala, nunca de dedução — mesma regra de [exame-nomeado-por-deducao](exame-nomeado-por-deducao.md).

**How to apply:** cirurgia de tipo não especificado — e cirurgia NOMEADA que não seja catarata (pterígio, glaucoma, retina, pálpebra, laser) — NÃO é evidência de pseudofacia — o olho segue fácico e a presbiopia continua valendo. Regra no prompt (`src/gemini-interview-agent.js`, lista "Como saber que o olho é pseudofácico" + veto de presbiopia) e guard `_guardPseudofaciaSemEvidencia` em `src/DecisionEngine.js`, que desfaz Z961/pseudofacia quando a fala não tem NENHUM token de lente/catarata/olho operado. "cirurgia"/"operou"/"operei" sozinhos NÃO contam como evidência: verbo sem objeto não distingue pterígio de catarata. Terceira camada: o hook `lio` agora veta quando a fala nomeia outra cirurgia (`cirurgiaNomeadaNaoCatarata` em config/clinical-triggers.js) — "operou o olho" está em LIO_COMMANDS e sozinho escreveria a lente. Testes LENTE-EV-1..11, PSEUDO-12, CASO8-10/11.

---

Related: [speech-log-truncado-120](speech-log-truncado-120.md) · [presbiopia-veto-pseudofacia](presbiopia-veto-pseudofacia.md) · [exame-nomeado-por-deducao](exame-nomeado-por-deducao.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md)

Up: [Memórias](INDEX.md)
