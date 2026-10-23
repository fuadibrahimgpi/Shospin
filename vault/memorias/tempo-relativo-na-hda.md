---
title: "tempo-relativo-na-hda"
description: "Tempo na HDA é sempre duração relativa (\"há ~X meses\"), nunca data de calendário; e só entra o que é pertinente à queixa"
date: 2026-08-06
tags: [memoria, feedback]
aliases: ["tempo-relativo-na-hda"]
---

# tempo-relativo-na-hda

> Tempo na HDA é sempre duração relativa ("há ~X meses"), nunca data de calendário; e só entra o que é pertinente à queixa

Instrução do médico (2026-08-06): "Não coloque data que não seja pertinente na HDA.
Quando for colocar, coloque sempre em referência a tantos dias ou tantos meses. Não há
data específica."

**Why:** o gatilho foi uma HDA que trazia "mencionando valores de 'dois e dois dois e
meio' e '25 de junho'" — ruído de ASR e uma data de calendário copiados crus para o
prontuário. Prontuário registra evolução, não agenda: "há ~2 meses" é clinicamente
utilizável; "25 de junho" não diz nada sem a data de referência.

**How to apply:** na HDA, escreva "há ~X dias/semanas/meses/anos". Nunca dia/mês
("25 de junho", "12/03", "desde março"). **Não invente tempo** — converter data em
duração exige saber a data de hoje; se não der, omita o tempo (omitir é seguro, chutar
não). E só entra na HDA o que é pertinente à queixa: números soltos, valores de grau
lidos em voz alta e conversa administrativa não viram texto de prontuário — refração tem
campo próprio. Em `antecedentes_oftalmologicos` vale a mesma preferência pelo relativo,
mas um ANO relatado pelo paciente pode ficar ("cirurgia em 2018").
Regras em `src/gemini-interview-agent.js` (campo HDA), testes `[DE-ANTEC-P5]`.
Ver [lente-contato-e-antecedente](lente-contato-e-antecedente.md).

---

Related: [lente-contato-e-antecedente](lente-contato-e-antecedente.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md)

Up: [Memórias](INDEX.md)
