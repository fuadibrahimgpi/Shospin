---
title: "reestruturacao-fases"
description: "Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda"
date: 2026-07-14
tags: [memoria, project]
aliases: ["reestruturacao-fases"]
---

# reestruturacao-fases

> Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda

Reestruturação estrutural da extensão (Caminho B, aprovado 2026-07-14):

- **Feito** no branch `refactor/estrutura-fase-0-1` (aguarda validação manual no Shosp antes de mergear em main):
  - Fase −1: fixes de gatilhos pendentes commitados e mergeados em main (8be5605, f31265f).
  - Fase 0: `dist/` e a pasta aninhada movidos para `G:\Meu Drive\IAs\_backups\shosp-extension\`; worktree antiga removida; alias `extractExamsTwoPass` removido.
  - Fase 1: flags de sessão unificadas no objeto `SessionFlags` (sealed) gerado de `SESSION_FLAG_DEFAULTS` em `scripts/sidepanel-constants.js`. HOOK_STATE, StateManager, `__shospState` e o `_BRIDGE` do hooks-test são GERADOS do registro — flag nova = 1 linha no registro. Referência solta a flag agora é ReferenceError.
- **Pendente sob demanda** (executar quando uma mudança esbarrar nelas, nesta ordem): Fase 2 — reorganizar pastas por contexto de execução (background/content/sidepanel/shared/tools/test); Fase 3 — módulos ES no sidepanel (mata o vm-concat dos testes); Fase 4 — dividir content.js (manifest aceita múltiplos js), extrair prompts dos agentes Gemini, dividir sidepanel-audio.js.
- Ritual por fase: `npm run check && npm run test:hooks && npm run test:integration` + validação manual no Shosp antes de paciente real. Pausar sync do Google Drive em operações git grandes.

Relacionado: [project_nested_duplicate](project_nested_duplicate.md) (resolvido — pasta movida para _backups), [gemini-service-modularizado](gemini-service-modularizado.md).

---

Related: [project_nested_duplicate](project_nested_duplicate.md) · [gemini-service-modularizado](gemini-service-modularizado.md) · [StateManager e SessionFlags](../modulos/state-manager.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md) · [log-2026-07-27-pendencias](log-2026-07-27-pendencias.md)

Up: [Memórias](INDEX.md)
