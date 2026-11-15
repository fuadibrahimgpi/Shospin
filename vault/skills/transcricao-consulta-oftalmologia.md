---
title: "Transcrição da consulta (skill)"
description: ">"
date: 2026-10-22
tags: [skill, projeto-shosp]
aliases: ["transcricao-consulta-oftalmologia"]
---

# Transcrição da consulta (skill)

**Skill** · arquivo-fonte: `skills/user/transcricao-consulta-oftalmologia/SKILL.md`

Skill do projeto (fonte de verdade das regras clínicas deste domínio), em `skills/user/transcricao-consulta-oftalmologia/SKILL.md` (731 linhas).

> >


## Memórias relacionadas

- [achado-episodico-nao-e-diagnostico](../memorias/achado-episodico-nao-e-diagnostico.md): Hemorragia subconjuntival recorrente relatada pelo paciente virou CID atual e foi arrastada para a biomicroscopia pela regra de consistência
- [antecedentes-negativa-fabricada](../memorias/antecedentes-negativa-fabricada.md): Nega diagnósticos e procedimentos oftalmológicos prévios" era escrito por ausência de resposta — apagava glaucoma prévio relatado
- [cid-search-hadrows-dead-branch](../memorias/cid-search-hadrows-dead-branch.md): searchCid: ramo 'hadRows' era morto → msg de falha de CID não distinguia gap-do-subset de bug-de-matching; corrigido com sawAnyRows
- [comorbidade-negativa-fabricada](../memorias/comorbidade-negativa-fabricada.md): Resposta 'sim' à pergunta sistêmica virou 'Nega comorbidades' e o diabetes do paciente sumiu do prontuário (2026-08-04)
- [exame-nomeado-por-deducao](../memorias/exame-nomeado-por-deducao.md): nome de exame na conduta só pode vir da fala do médico; H400 não acompanha OCT/campo visual por padrão
- [lente-contato-e-antecedente](../memorias/lente-contato-e-antecedente.md): Uso de lente de contato é antecedente ocular (não HDA) e o que importa é a irregularidade, quase sempre revelada pela fala do médico ao orientar
- [log-2026-07-27-pendencias](../memorias/log-2026-07-27-pendencias.md): Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)
- [log-2026-08-03-cristalino-pseudofacia](../memorias/log-2026-08-03-cristalino-pseudofacia.md): Placeholder "cristalino transparente" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado
- [log-2026-08-05-multifocal-e-fundoscopia](../memorias/log-2026-08-05-multifocal-e-fundoscopia.md): Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de "fundo" — ambos corrigidos
- [log-2026-08-05-ocr-bloqueios-e-blefarite](../memorias/log-2026-08-05-ocr-bloqueios-e-blefarite.md): 3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; "informação na pálpebra" é inflamação comida pelo ASR
- [opacidade-capsula-linguagem-leiga](../memorias/opacidade-capsula-linguagem-leiga.md): PCO dita em linguagem leiga ("lente um pouquinho embaçada") não virava opacidade de cápsula; e o guard de texto misto engolia a flag
- [queixa-principal-sem-negativas](../memorias/queixa-principal-sem-negativas.md): Negativa de SINTOMA não entra na HDA nem no campo retorno — nem abrindo, nem no corpo
- [skills-exame-biomicro-fundo](../memorias/skills-exame-biomicro-fundo.md): Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade
- [tempo-relativo-na-hda](../memorias/tempo-relativo-na-hda.md): Tempo na HDA é sempre duração relativa ("há ~X meses"), nunca data de calendário; e só entra o que é pertinente à queixa

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Skills](INDEX.md)
