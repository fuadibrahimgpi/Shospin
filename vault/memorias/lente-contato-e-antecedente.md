---
title: "lente-contato-e-antecedente"
description: "Uso de lente de contato é antecedente ocular (não HDA) e o que importa é a irregularidade, quase sempre revelada pela fala do médico ao orientar"
date: 2026-08-06
tags: [memoria, feedback]
aliases: ["lente-contato-e-antecedente"]
---

# lente-contato-e-antecedente

> Uso de lente de contato é antecedente ocular (não HDA) e o que importa é a irregularidade, quase sempre revelada pela fala do médico ao orientar

Log 2026-08-06: a HDA saiu com "Paciente refere uso de lentes de contato há
aproximadamente dois anos… Nega problemas ou alterações oculares prévias além do uso de
lentes de contato." Dois defeitos num campo só — e o uso irregular (lente mensal usada por
até ~1 ano, sem dia de descanso, dormindo de lente) se perdeu.

**Why:** usar lente é história ocular prévia, igual a usar óculos — pertence a
`antecedentes_oftalmologicos`. E o dado com valor clínico não é *usar*, é a
**irregularidade** (ceratite, hipóxia corneana, neovascularização). Esse dado quase sempre
vem da fala do MÉDICO ao orientar ("o ideal é ficar um dia da semana sem lente"), e a
`REGRA DE FONTES` mandava descartar fala do médico na anamnese — mesma lição de
[log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md): a transcrição é médico→paciente, não laudo.

**How to apply:** a permissão de manter negativas na HDA vale só para negativa de
SINTOMA; negativa de ANTECEDENTE nunca vai na HDA. Teste: *fala de algo anterior à
consulta que não é sintoma? → não é HDA.*
⚠️ **Refinamento do próprio médico (2026-08-06):** o que separa os campos é o PAPEL do
dispositivo, não a palavra. Óculos/lente como MOTIVO DA PROCURA ("vim trocar o óculos",
"acho que o grau da lente aumentou") vai SIM na queixa principal e pode liderar; só o
HISTÓRICO de uso (desde quando, regularidade, higiene) é que é antecedente. Corrigido em `src/gemini-interview-agent.js`
(carve-out de fontes, regra de lente ao lado da de óculos, as duas listas do Guard 8) e no
Guard 8 de `src/DecisionEngine.js`. **Limite do carve-out:** conselho genérico do médico
NÃO prova não-conformidade (ele orienta o paciente certinho também) — só afirme o hábito
quando ele reage ao que o paciente relatou; senão registre "Orientado sobre…", nunca a
falha. **Óculos ficou fora do guard de propósito** — quase
todo paciente usa óculos e o guard esvaziaria o campo em toda consulta; e a 3ª pessoa
("o senhor usa lente?") é a forma da PERGUNTA, não evidência de uso.
Ver [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md) — mesma classe de erro, gatilho novo.

---

Related: [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [tempo-relativo-na-hda](tempo-relativo-na-hda.md)

Up: [Memórias](INDEX.md)
