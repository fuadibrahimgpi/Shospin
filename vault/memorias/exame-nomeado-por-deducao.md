---
title: "exame-nomeado-por-deducao"
description: "nome de exame na conduta só pode vir da fala do médico; H400 não acompanha OCT/campo visual por padrão"
date: 2026-08-17
tags: [memoria, feedback]
aliases: ["exame-nomeado-por-deducao"]
---

# exame-nomeado-por-deducao

> nome de exame na conduta só pode vir da fala do médico; H400 não acompanha OCT/campo visual por padrão

O NOME de um exame solicitado na `conduta` só pode vir da fala do médico. Proibido deduzi-lo
do diagnóstico, do achado do exame ou dos exemplos do prompt. Exame anunciado sem nome
("vamos fazer um outro exame ali para medir") → `Solicitar exame complementar (não
especificado na consulta)`. Nenhum exame anunciado → nenhuma linha de exame.

**Why:** na consulta de 2026-08-17 (12:38) o médico disse só "o nervo tá um pouquinho fora do
padrão, nós vamos fazer um outro exame ali para fazer uma medida" e a conduta saiu com
`Solicitar OCT de nervo óptico` — "OCT" nunca foi dito. O nome foi copiado do par
`H400`↔(campo visual + OCT), que era exemplo canônico no prompt e nas skills. É o mesmo par
que em 2026-08-04 vazou para o texto da fundoscopia ([fundoscopia-descritiva-nao-interpretativa](fundoscopia-descritiva-nao-interpretativa.md)):
corrigiu-se lá e ele sobreviveu na conduta. Exemplo vence prosa nesses prompts — a regra tem
que ficar **junto do exemplo**, não só numa seção geral.

**How to apply:** regra de classe (nunca patch de um exame só) em
`src/gemini-interview-agent.js` — seção `- conduta`, bloco da fundoscopia e passo 1 do teste
obrigatório; skills `conduta-tratamento-oftalmologia` e `fundoscopia-oftalmologia` alinhadas.
Forma de saída espelha o colírio não identificado. Testes `[COND-EXAM-1..3]`.
Relacionado: [comorbidade-negativa-fabricada](comorbidade-negativa-fabricada.md), [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md),
[conduta-normalidade-nao-e-conduta](conduta-normalidade-nao-e-conduta.md).

---

Related: [fundoscopia-descritiva-nao-interpretativa](fundoscopia-descritiva-nao-interpretativa.md) · [comorbidade-negativa-fabricada](comorbidade-negativa-fabricada.md) · [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md) · [conduta-normalidade-nao-e-conduta](conduta-normalidade-nao-e-conduta.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Fundoscopia (skill)](../skills/fundoscopia-oftalmologia.md) · [log-2026-09-02-pseudofacia-fabricada](log-2026-09-02-pseudofacia-fabricada.md)

Up: [Memórias](INDEX.md)
