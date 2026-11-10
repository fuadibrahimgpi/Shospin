---
title: "Agente de medicamentos"
description: "ESTACIONADO desde 2026-11-10 (fora do painel; só os testes o usam). Subagente planejado para o campo tratamento: roteamento, validação por léxico e hierarquia de nomeação."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["medicamentos-agent"]
---

# Agente de medicamentos

**Agente** · arquivo-fonte: `src/agents/medicamentos-agent.js`

> **Estado: estacionado (2026-11-10).** O painel não carrega este arquivo e nenhum código de produção o chama; só `utils/agents-test.js`. Em produção, medicamentos são tratados pelo [Léxico](../modulos/medicamentos-lexico.md) e pelos guards 2–2g do [DecisionEngine](decision-engine.md), cujo "modo sombra" usa só o léxico. Para religar: escrever `analisar()`, voltar a carregar o arquivo em `sidepanel.html` e rodar em sombra antes de deixá-lo escrever o campo.

Conduta → campo `tratamento`. O passo 1 é a parte DETERMINÍSTICA (roteamento, validação, formatação); a chamada ao modelo (`analisar`) entra atrás de flag, em modo sombra ao lado do [DecisionEngine](decision-engine.md), para medição antes da implantação plena.

Item do modelo: `{nome, nivel, status, posologia, olho, duracao, evidencia}`, com `nivel` em princípio/protocolo/classe/genérico e `status` em novo/mantido/suspenso.

`validar()` aplica, em ordem: (1) contrato — evidência literal; (2) léxico — remédio achado na evidência vira princípio ativo ("trometolou" → Cetorolaco); (3) nível — princípio sem sustentação é rebaixado a genérico, classe só vale com a classe dita, protocolo exige colírio dito.

Usa o [Léxico de medicamentos](../modulos/medicamentos-lexico.md) e segue o [Contrato dos subagentes](agent-contract.md). Testes em `utils/agents-test.js` sobre o corpus `utils/corpus/medicamentos.json`.

## Memórias relacionadas

- [blefarite-texto-nao-e-rotina](../memorias/blefarite-texto-nao-e-rotina.md): O texto descritivo de blefarite na biomicroscopia só entra se a inflamação palpebral foi DESCRITA; tratamento (shampoo/compressa) não autoriza
- [conduta-plano-investigacao](../memorias/conduta-plano-investigacao.md): "Se não resolver, investigar outras causas" é conduta — não é retorno condicional vago (2026-08-04)
- [log-2026-07-28-pendencias](../memorias/log-2026-07-28-pendencias.md): Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt
- [log-2026-07-29-exame-normal-vs-diagnostico](../memorias/log-2026-07-29-exame-normal-vs-diagnostico.md): Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou "AO olho calmo"); rede de segurança criada
- [log-2026-09-15-tobramicina-sem-colirio](../memorias/log-2026-09-15-tobramicina-sem-colirio.md): Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e "vou passar um tratamento" agora não acionam; guard remove a linha

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
