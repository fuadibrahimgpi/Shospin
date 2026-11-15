---
title: "antecedentes-negativa-fabricada"
description: "Nega diagnósticos e procedimentos oftalmológicos prévios\" era escrito por ausência de resposta — apagava glaucoma prévio relatado"
date: 2026-08-03
tags: [memoria, project]
aliases: ["antecedentes-negativa-fabricada"]
---

# antecedentes-negativa-fabricada

> Nega diagnósticos e procedimentos oftalmológicos prévios" era escrito por ausência de resposta — apagava glaucoma prévio relatado

Log 2026-08-03: paciente relatou glaucoma prévio e o prontuário saiu com
"Nega diagnósticos e procedimentos oftalmológicos prévios". O mesmo JSON tinha
HDA descrevendo consulta anterior com catarata diagnosticada e cirurgia indicada
— duas afirmações contraditórias no mesmo prontuário.

**Why:** a regra de "negativa implícita" do prompt (checklist de antecedentes em
primeira_consulta) manda usar a frase negativa sempre que o médico perguntou e
nenhuma resposta positiva foi capturada. Ela nasceu para conter alucinação em
`antecedentes_familiares`; aplicada a `antecedentes_oftalmologicos` com ASR ruim,
ela AFIRMA que o paciente negou o que ele de fato relatou. `null` diz "não
coletado"; a frase negativa é uma afirmação clínica falsa.

**How to apply:** duas camadas, ambas em vigor —
1. prompt (`src/gemini-interview-agent.js`, bloco "EXCEÇÃO OBRIGATÓRIA" no
   checklist): varrer a transcrição inteira atrás de história ocular prévia antes
   de escrever a negativa; resposta embolada → `null`, nunca a negativa.
2. rede determinística `DecisionEngine._guardAntecedentesNegativaFabricada`
   (Guard 8) — **estritamente subtrativa**: apaga a negativa e avisa, nunca
   escreve um antecedente (escrever recriaria a alucinação que a frase veio
   conter). Dispara por contradição nos campos redigidos pelo modelo OU por
   evidência estreita na transcrição. Termos soltos ("glaucoma", "catarata") NÃO
   contam — o médico os pronuncia ao perguntar. Nem "há N anos" ou "prévio"
   soltos nos campos: "Baixa de visão progressiva há 2 anos" é a HDA mais comum
   que existe e "sem tratamento prévio" é negativa — cada marca tem que apontar
   para um ENCONTRO/PROCEDIMENTO anterior. Testes DE-ANTEC-1..5.

Relacionado: [queixa-principal-sem-negativas](queixa-principal-sem-negativas.md), [log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md).

---

Related: [queixa-principal-sem-negativas](queixa-principal-sem-negativas.md) · [log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [achado-episodico-nao-e-diagnostico](achado-episodico-nao-e-diagnostico.md) · [comorbidade-negativa-fabricada](comorbidade-negativa-fabricada.md) · [conduta-normalidade-nao-e-conduta](conduta-normalidade-nao-e-conduta.md) · [exame-nomeado-por-deducao](exame-nomeado-por-deducao.md) · [lente-contato-e-antecedente](lente-contato-e-antecedente.md)

Up: [Memórias](INDEX.md)
