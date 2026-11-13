---
title: "Biomicroscopia (skill)"
description: "Descreve o campo biomicroscopia (segmento anterior / lâmpada de fenda) em consultas oftalmológicas a partir de transcrições"
date: 2026-10-22
tags: [skill, projeto-shosp]
aliases: ["biomicroscopia-oftalmologia"]
---

# Biomicroscopia (skill)

**Skill** · arquivo-fonte: `skills/user/biomicroscopia-oftalmologia/SKILL.md`

Skill do projeto (fonte de verdade das regras clínicas deste domínio), em `skills/user/biomicroscopia-oftalmologia/SKILL.md` (267 linhas).

> Descreve o campo biomicroscopia (segmento anterior / lâmpada de fenda) em consultas oftalmológicas a partir de transcrições. Use quando o médico examina e descreve ao paciente qualquer achado de segmento anterior — pterígio, pinguécula, conjuntivite, úlcera ou ceratite, leucoma, nevo conjuntival, hemorragia subconjuntival, blefarite — ou quando o exame está normal e é preciso decidir entre injetar o template dos dois olhos (injectExamesNormais) e escrever achado por olho. Também use para resolver lateralidade (OD/OE/AO), evitar bilateralizar achado unilateral por natureza (trauma, corpo estranho, abrasão), tratar paciente pseudofácico (LIO) e a lente dinâmica (catarata/LIO/opacidade de cápsula).


## Memórias relacionadas

- [achado-episodico-nao-e-diagnostico](../memorias/achado-episodico-nao-e-diagnostico.md): Hemorragia subconjuntival recorrente relatada pelo paciente virou CID atual e foi arrastada para a biomicroscopia pela regra de consistência
- [antecedentes-negativa-fabricada](../memorias/antecedentes-negativa-fabricada.md): Nega diagnósticos e procedimentos oftalmológicos prévios" era escrito por ausência de resposta — apagava glaucoma prévio relatado
- [blefarite-texto-nao-e-rotina](../memorias/blefarite-texto-nao-e-rotina.md): O texto descritivo de blefarite na biomicroscopia só entra se a inflamação palpebral foi DESCRITA; tratamento (shampoo/compressa) não autoriza
- [cid-historico-como-resultado](../memorias/cid-historico-como-resultado.md): Instabilidade da injeção de CID: o painel do SHOSP mistura 'Últimos CIDs selecionados' com os resultados; matcher permissivo clicava o vizinho e respondia success
- [cid-pterigio-h110](../memorias/cid-pterigio-h110.md): Sítios errados na tabela de CIDs do prompt (pterígio H111→H110 e mais três)
- [log-2026-07-28-pendencias](../memorias/log-2026-07-28-pendencias.md): Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt
- [log-2026-07-29-blefarite-leiga](../memorias/log-2026-07-29-blefarite-leiga.md): Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco
- [log-2026-07-29-exame-normal-vs-diagnostico](../memorias/log-2026-07-29-exame-normal-vs-diagnostico.md): Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou "AO olho calmo"); rede de segurança criada
- [log-2026-08-03-cristalino-pseudofacia](../memorias/log-2026-08-03-cristalino-pseudofacia.md): Placeholder "cristalino transparente" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado
- [log-2026-09-02-pseudofacia-fabricada](../memorias/log-2026-09-02-pseudofacia-fabricada.md): Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz
- [opacidade-capsula-linguagem-leiga](../memorias/opacidade-capsula-linguagem-leiga.md): PCO dita em linguagem leiga ("lente um pouquinho embaçada") não virava opacidade de cápsula; e o guard de texto misto engolia a flag
- [ordem-olhos-od-antes-de-oe](../memorias/ordem-olhos-od-antes-de-oe.md): Em qualquer descrição por olho, OD vem sempre antes de OE — ordem do prontuário, nunca a da fala
- [presbiopia-veto-pseudofacia](../memorias/presbiopia-veto-pseudofacia.md): Decisão do médico (2026-08-04) — paciente com LIO nos dois olhos não pode receber H52.4; veto só vale para pseudofacia BILATERAL
- [skills-exame-biomicro-fundo](../memorias/skills-exame-biomicro-fundo.md): Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Skills](INDEX.md)
