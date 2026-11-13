---
title: "Agente de medicamentos"
description: "Em modo sombra desde 2026-11-11 (carregado no painel, só mede; não escreve no prontuário). Valida os itens de medicação do modelo — roteamento, léxico, hierarquia de nomeação — e compara com o campo tratamento."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["medicamentos-agent"]
---

# Agente de medicamentos

**Agente** · arquivo-fonte: `src/agents/medicamentos-agent.js`

> **Estado: modo sombra (2026-11-11).** O painel carrega este arquivo, mas só o [DecisionEngine](decision-engine.md) o usa, no passo `_sombraItensMedicamentos`, e só para medir: valida os itens e compara com o `tratamento`. Ele **não escreve** no prontuário. Quem escreve medicamentos continua sendo o texto do modelo, o [Léxico](../modulos/medicamentos-lexico.md) e os guards 2–2g. Não há `analisar()`: o agente não fala com o modelo; os itens vêm na mesma chamada da consulta, no campo `medicacoes_itens`.
>
> **Como religar de verdade** (só depois de medir em consultas reais): usar o texto de `formatar()` onde os itens concordam, mantendo os guards como rede.

Conduta → campo `tratamento`. A parte DETERMINÍSTICA é roteamento, validação, formatação e comparação com o `tratamento` (`conferirComTratamento`, por nome). O arquivo roda dentro de uma função e só exporta `MedicamentosAgent`: em 2026-11-10 um `const` de topo repetido entre ele e o [Recheck](recheck-agent.md) derrubou o recheck por meses.

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
