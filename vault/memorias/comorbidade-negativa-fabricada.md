---
title: "comorbidade-negativa-fabricada"
description: "Resposta 'sim' à pergunta sistêmica virou 'Nega comorbidades' e o diabetes do paciente sumiu do prontuário (2026-08-04)"
date: 2026-08-04
tags: [memoria, feedback]
aliases: ["comorbidade-negativa-fabricada"]
---

# comorbidade-negativa-fabricada

> Resposta 'sim' à pergunta sistêmica virou 'Nega comorbidades' e o diabetes do paciente sumiu do prontuário (2026-08-04)

Consulta de 2026-08-04: à pergunta do médico *"tem alguma doença que precisa ir sempre no médico ou tomar remédio sempre?"* o paciente respondeu **"sim"** — e `alteracoes_sistemicas` saiu `"Nega comorbidades"`. O diabetes dele não entrou na injeção.

**Why:** o checklist de **negativa implícita** do prompt foi escrito para a pergunta **sem resposta** ("ausência de resposta positiva = negação implícita") e não tinha exceção para resposta afirmativa. É a mesma classe de [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md), no campo vizinho: o campo passa a **afirmar** uma negativa que o paciente não deu. Segunda causa, mais insidiosa: a tabela de "afirmativas ambíguas sem nome de doença" (`Relata comorbidade sistêmica não especificada`, `Usa medicação sistêmica (doença não especificada)`) existia **só na SKILL.md da transcrição** — o prompt do Gemini nunca a recebeu, e nenhum teste `[SKILL-SYNC]` cobria a skill de entrevista (só a de conduta). Divergência skill↔prompt que ninguém via.

**How to apply:** afirmativa **proíbe** `"Nega comorbidades"`, sem exceção — nomeou a doença → registra (varrer a transcrição INTEIRA: o paciente solta "eu sou diabético" fora do bloco de anamnese); afirmou sem nomear → a frase da tabela, nunca a negativa. Rede determinística: `DecisionEngine._guardComorbidadesNegativaFabricada` (Guard 9), **estritamente subtrativa** como o Guard 8 — nula o campo e avisa, nunca escreve "Diabetes mellitus" a partir do token `diabetes` (o médico pronuncia a palavra ao **perguntar**; escrever a partir dela recriaria o bug de antecedentes familiares invertido). Cuidado com `"pressão alta"`: metade das vezes é a do **olho** — o guard tem lookahead pra isso. Testes `[DE-COMORB-1..5]`. `medicacoes_em_uso` recebeu o mesmo tratamento e precisou de um TERCEIRO valor (`"Refere uso de colírio (não identificado na consulta)"`): a regra antiga proibia null E a nova proibia a negativa após "sim" — sem a terceira frase o modelo ficava sem saída legal. **Toda vez que uma negativa padrão for proibida em algum contexto, verificar se sobrou opção válida.** Ao mexer em regra de anamnese, mirrorar prompt **e** `skills/user/transcricao-consulta-oftalmologia/SKILL.md` e adicionar âncora em `SKILL_PROMPT_ANCHORS_ENTREVISTA`.

---

Related: [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [exame-nomeado-por-deducao](exame-nomeado-por-deducao.md)

Up: [Memórias](INDEX.md)
