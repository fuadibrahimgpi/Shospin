---
title: "Conduta e tratamento (skill)"
description: "Extrai, normaliza e valida o campo conduta em consultas oftalmológicas"
date: 2026-10-22
tags: [skill, projeto-shosp]
aliases: ["conduta-tratamento-oftalmologia"]
---

# Conduta e tratamento (skill)

**Skill** · arquivo-fonte: `skills/user/conduta-tratamento-oftalmologia/SKILL.md`

Skill do projeto (fonte de verdade das regras clínicas deste domínio), em `skills/user/conduta-tratamento-oftalmologia/SKILL.md` (805 linhas).

> Extrai, normaliza e valida o campo conduta em consultas oftalmológicas. Use quando o usuário apresentar transcrição de consulta, resumo clínico ou saída estruturada e precisar separar conduta de tratamento, registrar retornos, encaminhamentos, prescrição de óculos, solicitação de exames, orientações verbais, suspensão de medicação e descartar logística operacional. Também use para evitar expressões proibidas como atualização de grau e para marcar revisão manual quando a conduta estiver ambígua.


## Memórias relacionadas

- [blefarite-texto-nao-e-rotina](../memorias/blefarite-texto-nao-e-rotina.md): O texto descritivo de blefarite na biomicroscopia só entra se a inflamação palpebral foi DESCRITA; tratamento (shampoo/compressa) não autoriza
- [comorbidade-negativa-fabricada](../memorias/comorbidade-negativa-fabricada.md): Resposta 'sim' à pergunta sistêmica virou 'Nega comorbidades' e o diabetes do paciente sumiu do prontuário (2026-08-04)
- [conduta-normalidade-nao-e-conduta](../memorias/conduta-normalidade-nao-e-conduta.md): Explicado exames normais" e afins não entram na conduta — nem como cláusula dentro de linha "Explicado ..." agrupada
- [conduta-plano-investigacao](../memorias/conduta-plano-investigacao.md): "Se não resolver, investigar outras causas" é conduta — não é retorno condicional vago (2026-08-04)
- [exame-nomeado-por-deducao](../memorias/exame-nomeado-por-deducao.md): nome de exame na conduta só pode vir da fala do médico; H400 não acompanha OCT/campo visual por padrão
- [fraseado-encerramento-consulta](../memorias/fraseado-encerramento-consulta.md): Como o médico realmente encerra consultas — saudações de despedida e "passar no balcão"; não usa "me liga" nem perguntas abertas
- [froala-model-desync-saving](../memorias/froala-model-desync-saving.md): Por que Atendimento/Conduta não salvavam e o fix da ponte Froala (mundo principal)
- [gemini-service-modularizado](../memorias/gemini-service-modularizado.md): Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)
- [lente-contato-e-antecedente](../memorias/lente-contato-e-antecedente.md): Uso de lente de contato é antecedente ocular (não HDA) e o que importa é a irregularidade, quase sempre revelada pela fala do médico ao orientar
- [log-2026-07-28-pendencias](../memorias/log-2026-07-28-pendencias.md): Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt
- [log-2026-07-29-exame-normal-vs-diagnostico](../memorias/log-2026-07-29-exame-normal-vs-diagnostico.md): Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou "AO olho calmo"); rede de segurança criada
- [log-2026-07-29-gatilho-dilatacao](../memorias/log-2026-07-29-gatilho-dilatacao.md): Dilatação não disparou em 2026-07-29 — plural "-arem lá fora" e "colírio" comido pelo ASR; ambos corrigidos
- [log-2026-08-05-multifocal-e-fundoscopia](../memorias/log-2026-08-05-multifocal-e-fundoscopia.md): Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de "fundo" — ambos corrigidos
- [log-2026-08-27-multifocal-apagado](../memorias/log-2026-08-27-multifocal-apagado.md): Guard exigia a palavra "multifocal" e apagou conduta correta descrita como "longe perto junto"; H524 sobreviveu
- [log-2026-09-15-tobramicina-sem-colirio](../memorias/log-2026-09-15-tobramicina-sem-colirio.md): Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e "vou passar um tratamento" agora não acionam; guard remove a linha
- [skills-exame-biomicro-fundo](../memorias/skills-exame-biomicro-fundo.md): Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Skills](INDEX.md)
