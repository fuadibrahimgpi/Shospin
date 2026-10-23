---
title: "dilatacao-contaminacao-fase2"
description: "Dilatação virou fila multi-paciente (v5.1.5, _shospDilatacaoPausas) — opt-in por slot; histórico da contaminação entre pacientes"
date: 2026-07-20
tags: [memoria, project]
aliases: ["dilatacao-contaminacao-fase2"]
---

# dilatacao-contaminacao-fase2

> Dilatação virou fila multi-paciente (v5.1.5, _shospDilatacaoPausas) — opt-in por slot; histórico da contaminação entre pacientes

Rotina real: o paciente sai para dilatar e OUTRAS consultas acontecem no meio — inclusive outras dilatações. Restrição estrutural: o SHOSP é SPA **sem paciente na URL nem id no DOM** (`tdCadastro-*` são seções do form), então não dá para amarrar uma pausa ao paciente automaticamente — a vinculação é sempre decisão explícita do médico (botão), e tabUrl/tabTitle capturados são só rótulo/aviso melhor-esforço (fallback do rótulo: tipo + hora da pausa).

**Evolução em 3 etapas:**
1. Modelo original: chave única `_shospDilatacaoPhase1`, "próxima gravação = mesmo paciente" → contaminava o paciente intercalado (caso 2026-07-17, dois irmãos).
2. 2026-07-17: fase 2 virou opt-in por botão retomar; default = paciente novo. Mas restavam 2 defeitos do slot único: (a) injeção de paciente intercalado APAGAVA a pausa de quem esperava (remove incondicional no else pós-sucesso do injectAll); (b) segunda dilatação SOBRESCREVIA a fase 1 da primeira.
3. **2026-07-20 (v5.1.5): fila multi-paciente `_shospDilatacaoPausas`** (`scripts/dilatacao-pausas.js`, TTL 6h/slot, migração automática da chave legada). Sala de espera no painel (`renderDilatacaoPausas`): uma linha por paciente com botão Retomar próprio, Desarmar e ✕. Retomada exclusiva (1 slot armado no máx.) e opt-in. Consumo do slot só com retomada armada E injeção de ÁUDIO da fase 2 (OCR no meio da fase 2 não consome). Limpar manual só DESARMA (não apaga pausas). Pausa `motivo='exame'` nasce ARMADA (mesmo paciente segue na sala). Testes `[DILQ-SRC-1..3]` e `[DILQ-1..7]` em integration-test.js (runner ganhou `testAsync`).

Limitação conhecida que permanece: em fase 2 armada, narração retrospectiva na CAUDA ("já pinguei o colírio para dilatar") ainda dispara pausa falsa — recuperação pelo botão "Não era dilatação" (age na pausa mais recente). Teste `[DIL-FASE2-LIMIT]`. Ver [reestruturacao-fases](reestruturacao-fases.md).

---

Related: [reestruturacao-fases](reestruturacao-fases.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [StateManager e SessionFlags](../modulos/state-manager.md) · [cid-dedup-fronteira-de-paciente](cid-dedup-fronteira-de-paciente.md) · [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md) · [log-2026-07-29-gatilho-dilatacao](log-2026-07-29-gatilho-dilatacao.md) · [log-2026-08-07-microfone-mudo](log-2026-08-07-microfone-mudo.md) · [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md)

Up: [Memórias](INDEX.md)
