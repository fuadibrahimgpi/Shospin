---
title: Linha do tempo
date: 2026-10-22
tags: [historico]
---

# Linha do tempo

Commits do repositório e memórias de log, do mais recente ao mais antigo.

Up: [Histórico](INDEX.md) · Related: [Changelog v5.1](changelog-v5.1.md)


## 2026-10

- 2026-10-22 · commit: `b6bacef` feat(conduta/exames): catalogo unico de exames + rede deterministica para o OCT omitido

## 2026-09

- 2026-09-15 · memória: [log-2026-09-15-tobramicina-sem-colirio](../memorias/log-2026-09-15-tobramicina-sem-colirio.md): Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e "vou passar um tratamento" agora não acionam; guard remove a linha
- 2026-09-02 · memória: [log-2026-09-02-pseudofacia-fabricada](../memorias/log-2026-09-02-pseudofacia-fabricada.md): Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz

## 2026-08

- 2026-08-27 · memória: [log-2026-08-27-multifocal-apagado](../memorias/log-2026-08-27-multifocal-apagado.md): Guard exigia a palavra "multifocal" e apagou conduta correta descrita como "longe perto junto"; H524 sobreviveu
- 2026-08-07 · memória: [log-2026-08-07-microfone-mudo](../memorias/log-2026-08-07-microfone-mudo.md): Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera
- 2026-08-05 · memória: [log-2026-08-05-multifocal-e-fundoscopia](../memorias/log-2026-08-05-multifocal-e-fundoscopia.md): Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de "fundo" — ambos corrigidos
- 2026-08-05 · memória: [log-2026-08-05-ocr-bloqueios-e-blefarite](../memorias/log-2026-08-05-ocr-bloqueios-e-blefarite.md): 3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; "informação na pálpebra" é inflamação comida pelo ASR
- 2026-08-03 · memória: [log-2026-08-03-cristalino-pseudofacia](../memorias/log-2026-08-03-cristalino-pseudofacia.md): Placeholder "cristalino transparente" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado

## 2026-07

- 2026-07-31 · commit: `3b0360f` fix(cid): dedup de CID vazava entre pacientes — a URL nao e fronteira no SHOSP
- 2026-07-31 · memória: [log-2026-07-31-pendencias](../memorias/log-2026-07-31-pendencias.md): Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta
- 2026-07-30 · commit: `6910dfa` test(cid): fixture do CIDCLS-4 usa linhas H460/H461 (cenario real do H46)
- 2026-07-30 · commit: `35020f0` fix(cid/diagnostico): "ausente do subset" deixa de ser reportado como bug de matching
- 2026-07-30 · commit: `a3a0f69` fix(refracao-estatica/cid): IDs da estatica lidos da pagina + busca de CID exige secao visivel
- 2026-07-30 · commit: `56bcbf9` fix(cid): historico "Ultimos CIDs" lido como resultado da busca — matcher estrito
- 2026-07-30 · commit: `7c2e05d` fix(refracao-estatica/injecao): falha da estatica auto-dumpa o mapeamento + "Dados ja injetados" deixa de mentir
- 2026-07-29 · memória: [log-2026-07-29-blefarite-leiga](../memorias/log-2026-07-29-blefarite-leiga.md): Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco
- 2026-07-29 · memória: [log-2026-07-29-exame-normal-vs-diagnostico](../memorias/log-2026-07-29-exame-normal-vs-diagnostico.md): Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou "AO olho calmo"); rede de segurança criada
- 2026-07-29 · memória: [log-2026-07-29-gatilho-dilatacao](../memorias/log-2026-07-29-gatilho-dilatacao.md): Dilatação não disparou em 2026-07-29 — plural "-arem lá fora" e "colírio" comido pelo ASR; ambos corrigidos
- 2026-07-29 · memória: [log-2026-07-29-ocr-verify-incoerente](../memorias/log-2026-07-29-ocr-verify-incoerente.md): 5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente
- 2026-07-28 · commit: `fd07237` docs(skills): skills dedicadas de biomicroscopia e fundoscopia
- 2026-07-28 · memória: [log-2026-07-28-pendencias](../memorias/log-2026-07-28-pendencias.md): Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt
- 2026-07-28 · memória: [skills-exame-biomicro-fundo](../memorias/skills-exame-biomicro-fundo.md): Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade
- 2026-07-27 · memória: [log-2026-07-27-pendencias](../memorias/log-2026-07-27-pendencias.md): Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)
- 2026-07-24 · commit: `85e6d81` fix(ocr): sinal de esfera nunca auto-liberado por voto 2-de-3 + piso clínico ±0.25 (v5.3.6)
- 2026-07-24 · memória: [log-2026-07-24-pendencias](../memorias/log-2026-07-24-pendencias.md): Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)
- 2026-07-23 · commit: `6be5e18` fix(ocr/cid/injecao): pendencias 2026-07-21 + WIP refactor fase 0-1
- 2026-07-21 · memória: [log-2026-07-21-pendencias](../memorias/log-2026-07-21-pendencias.md): Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)
- 2026-07-17 · commit: `660062a` fix(gatilhos): refinamentos de STOP, multifocal e fundoscopia (revisao 2026-07-16)
- 2026-07-17 · commit: `f5f149d` fix(dilatacao): fase 2 vira opt-in por botao; restaura gatilho ao vivo
- 2026-07-15 · commit: `9affd40` fix(gatilhos): gate aceita conduta refrativa; STOP com balcao, sem perguntas abertas
- 2026-07-14 · commit: `189239e` refactor(estado): fase 1c — remove compatibilidade; _BRIDGE dos testes gerado
- 2026-07-14 · commit: `feafd9e` refactor(estado): fase 1b — call sites usam SessionFlags explicitamente
- 2026-07-14 · commit: `7046022` refactor(estado): fase 1a — flags de sessao em objeto unico SessionFlags
- 2026-07-14 · commit: `dc69ebf` chore(estrutura): fase 0 — remove alias deprecado extractExamsTwoPass
- 2026-07-14 · commit: `22774a2` Merge fix/selecao-aba-prontuario: correcoes de gatilhos, fase 2 dilatacao e undo
- 2026-07-14 · commit: `f31265f` docs(ocr): regra 8 — sinais de esfera e cilindro sao independentes
- 2026-07-14 · commit: `8be5605` fix(gatilhos): casos reais 06-07/07 — fase 2 dilatacao, undo e gate
- 2026-07-14 · memória: [reestruturacao-fases](../memorias/reestruturacao-fases.md): Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda
- 2026-07-06 · commit: `1814cb8` @ fix(biomicroscopia): descreve catarata quando gatilho de voz não dispara
- 2026-07-02 · memória: [gemini-service-modularizado](../memorias/gemini-service-modularizado.md): Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)

## 2026-06

- 2026-06-26 · commit: `293418a` fix(injecao): seleciona aba com prontuario aberto em vez de tabs[0] cega

## 2026-05

- 2026-05-11 · commit: `d00ac6b` fix(dilatacao): corrige falso positivo e injecao indevida durante dilatacao
- 2026-05-11 · commit: `3509d35` fix(hooks): corrige STOP nao disparando apos primeira consulta da sessao
- 2026-05-11 · commit: `b82a62d` fix(conduta): corrige prescricao de oculos, injectExamesNormais e guards
- 2026-05-08 · commit: `ca6ffa7` Initial commit
