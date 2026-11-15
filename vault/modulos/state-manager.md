---
title: "StateManager e SessionFlags"
description: "Fachada de escrita das flags de sessão (SessionFlags)."
date: 2026-10-22
tags: [modulo, projeto-shosp]
aliases: ["state-manager"]
---

# StateManager e SessionFlags

**Módulo** · arquivo-fonte: `scripts/state-manager.js`

API sobre as variáveis de sessão: `resetSession()`, `getSnapshot()`, `setHookFlag()`, `getHookFlag()`, `markInjectionPerformed()`. Resultado das fases 0–1 da [Reestruturação por fases](../memorias/reestruturacao-fases.md).

## Memórias relacionadas

- [cid-dedup-fronteira-de-paciente](../memorias/cid-dedup-fronteira-de-paciente.md): A fronteira de paciente do dedup de CID é o painel, não a URL — o SHOSP abre toda ficha na mesma URL
- [dilatacao-contaminacao-fase2](../memorias/dilatacao-contaminacao-fase2.md): Dilatação virou fila multi-paciente (v5.1.5, _shospDilatacaoPausas) — opt-in por slot; histórico da contaminação entre pacientes
- [reestruturacao-fases](../memorias/reestruturacao-fases.md): Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Módulos](INDEX.md)
