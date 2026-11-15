---
title: "Agente de entrevista (Gemini)"
description: "Analisa a transcrição da consulta e devolve JSON (HDA, diagnóstico, conduta, tratamento…); contém o prompt clínico completo."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["gemini-interview-agent"]
---

# Agente de entrevista (Gemini)

**Agente** · arquivo-fonte: `src/gemini-interview-agent.js`

Contém o prompt clínico (`_buildConsultationPrompt`). As regras de conduta/tratamento DEVEM espelhar a skill [Conduta e tratamento](../skills/conduta-tratamento-oftalmologia.md); testes `[SKILL-SYNC]` em `utils/integration-test.js` verificam as âncoras.

Extraído de `geminiService.js` na modularização de 2026-07-02 (ver [geminiService modularizado](../memorias/gemini-service-modularizado.md)). Depende de Logger, apiService e `_parseGeminiJSON`. A saída passa pelo [DecisionEngine](decision-engine.md).

## Memórias relacionadas

- [achado-episodico-nao-e-diagnostico](../memorias/achado-episodico-nao-e-diagnostico.md): Hemorragia subconjuntival recorrente relatada pelo paciente virou CID atual e foi arrastada para a biomicroscopia pela regra de consistência
- [antecedentes-negativa-fabricada](../memorias/antecedentes-negativa-fabricada.md): Nega diagnósticos e procedimentos oftalmológicos prévios" era escrito por ausência de resposta — apagava glaucoma prévio relatado
- [cid-busca-exige-secao-visivel](../memorias/cid-busca-exige-secao-visivel.md): A busca de CID do SHOSP só executa com a seção C.I.D. VISÍVEL — oculta, o painel mostra o histórico e ele era lido como resultado
- [cid-pterigio-h110](../memorias/cid-pterigio-h110.md): Sítios errados na tabela de CIDs do prompt (pterígio H111→H110 e mais três)
- [cid-search-hadrows-dead-branch](../memorias/cid-search-hadrows-dead-branch.md): searchCid: ramo 'hadRows' era morto → msg de falha de CID não distinguia gap-do-subset de bug-de-matching; corrigido com sawAnyRows
- [comorbidade-negativa-fabricada](../memorias/comorbidade-negativa-fabricada.md): Resposta 'sim' à pergunta sistêmica virou 'Nega comorbidades' e o diabetes do paciente sumiu do prontuário (2026-08-04)
- [conduta-plano-investigacao](../memorias/conduta-plano-investigacao.md): "Se não resolver, investigar outras causas" é conduta — não é retorno condicional vago (2026-08-04)
- [digitalizacao-fichas-ferramenta](../memorias/digitalizacao-fichas-ferramenta.md): Ferramenta separada (fora do repo shosp) que renomeia fichas escaneadas para NOME_CPF.pdf via Google Cloud Vision; local, decisões não especificadas e pendências
- [exame-nomeado-por-deducao](../memorias/exame-nomeado-por-deducao.md): nome de exame na conduta só pode vir da fala do médico; H400 não acompanha OCT/campo visual por padrão
- [fundoscopia-descritiva-nao-interpretativa](../memorias/fundoscopia-descritiva-nao-interpretativa.md): Regra do médico (2026-08-04) — a descrição injetada da fundoscopia não diz "sugestivo/suspeita de glaucoma"; só o achado
- [gemini-service-modularizado](../memorias/gemini-service-modularizado.md): Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)
- [lente-contato-e-antecedente](../memorias/lente-contato-e-antecedente.md): Uso de lente de contato é antecedente ocular (não HDA) e o que importa é a irregularidade, quase sempre revelada pela fala do médico ao orientar
- [log-2026-07-27-pendencias](../memorias/log-2026-07-27-pendencias.md): Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)
- [log-2026-08-03-cristalino-pseudofacia](../memorias/log-2026-08-03-cristalino-pseudofacia.md): Placeholder "cristalino transparente" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado
- [log-2026-08-05-ocr-bloqueios-e-blefarite](../memorias/log-2026-08-05-ocr-bloqueios-e-blefarite.md): 3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; "informação na pálpebra" é inflamação comida pelo ASR
- [log-2026-08-27-multifocal-apagado](../memorias/log-2026-08-27-multifocal-apagado.md): Guard exigia a palavra "multifocal" e apagou conduta correta descrita como "longe perto junto"; H524 sobreviveu
- [log-2026-09-02-pseudofacia-fabricada](../memorias/log-2026-09-02-pseudofacia-fabricada.md): Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz
- [ocr-criterios-bloqueio-v544](../memorias/ocr-criterios-bloqueio-v544.md): v5.4.4 afrouxou 4 critérios de bloqueio do OCR; o piso de 0.50D agora libera flip de sinal não confirmado
- [opacidade-capsula-linguagem-leiga](../memorias/opacidade-capsula-linguagem-leiga.md): PCO dita em linguagem leiga ("lente um pouquinho embaçada") não virava opacidade de cápsula; e o guard de texto misto engolia a flag
- [ordem-olhos-od-antes-de-oe](../memorias/ordem-olhos-od-antes-de-oe.md): Em qualquer descrição por olho, OD vem sempre antes de OE — ordem do prontuário, nunca a da fala
- [presbiopia-veto-pseudofacia](../memorias/presbiopia-veto-pseudofacia.md): Decisão do médico (2026-08-04) — paciente com LIO nos dois olhos não pode receber H52.4; veto só vale para pseudofacia BILATERAL
- [queixa-principal-sem-negativas](../memorias/queixa-principal-sem-negativas.md): Negativa de SINTOMA não entra na HDA nem no campo retorno — nem abrindo, nem no corpo
- [reestruturacao-fases](../memorias/reestruturacao-fases.md): Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda
- [skills-exame-biomicro-fundo](../memorias/skills-exame-biomicro-fundo.md): Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade
- [tempo-relativo-na-hda](../memorias/tempo-relativo-na-hda.md): Tempo na HDA é sempre duração relativa ("há ~X meses"), nunca data de calendário; e só entra o que é pertinente à queixa

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
