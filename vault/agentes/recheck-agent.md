---
title: "Recheck de fidelidade"
description: "Compara o que o painel enviou com o que ficou no prontuário; só relata. Não carregava no painel até 2026-11-10."
date: 2026-11-10
tags: [agente, projeto-shosp]
aliases: ["recheck-agent"]
---

# Recheck de fidelidade

**Agente** · arquivo-fonte: `src/agents/recheck-agent.js`

Responde a uma pergunta só: o que o painel ENVIOU ao SHOSP ficou de fato no campo que o SHOSP salva? Um lado é o pacote enviado (`montarEnviado`); o outro é o readback que o [Content script](../modulos/content-script.md) devolve depois da injeção. `conferirFidelidade` compara por contenção, linha a linha: o campo pode já ter texto, então cada linha enviada precisa aparecer no que foi lido.

Não usa IA, não altera o prontuário. O resultado sai no console do painel: `[Recheck] N linha(s) conferida(s), N divergência(s)`.

## Não rodava no painel até 2026-11-10

Este arquivo e `src/agents/medicamentos-agent.js` declaravam `const _Contrato` no topo. Os scripts do painel dividem um escopo só, então o segundo arquivo falhava ao carregar, `RecheckAgent` ficava indefinido e a rotina que o chama (`_recheckInjecao`, em `scripts/sidepanel-injection.js`) desistia em silêncio. Os testes não viam, porque em Node cada arquivo tem escopo próprio.

O conflito sumiu quando o [Agente de medicamentos](medicamentos-agent.md) foi estacionado. Desde então:

- `_recheckInjecao` avisa quando o agente falta, em vez de calar;
- uma falha do recheck não derruba a injeção já feita;
- o teste `[ESCOPO-1]` barra nome de topo repetido entre os scripts do painel, e `[ESCOPO-3]` carrega os agentes juntos, na ordem do painel.

Consequência prática: as divergências que ele mostrar ainda não têm histórico de uso real. Podem ser diferenças verdadeiras ou alarme de uma conferência nunca calibrada ao vivo.

Testes em `utils/readback-e2e-test.js` e `[RECHECK-VIVO]` em `utils/integration-test.js`.

## Memórias relacionadas

- [froala-model-desync-saving](../memorias/froala-model-desync-saving.md): o defeito de salvamento que motivou conferir o que fica no prontuário

---

Related: [Contrato dos subagentes](agent-contract.md) · [Análise de estrutura 2026-11-10](../analise-estrutura-2026-11-10.md) · [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
