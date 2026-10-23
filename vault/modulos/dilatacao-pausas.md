---
title: "Fila de dilatação (sala de espera)"
description: "Fila persistida de pausas multi-paciente para dilatação em chrome.storage.local."
date: 2026-10-22
tags: [modulo, projeto-shosp]
aliases: ["dilatacao-pausas"]
---

# Fila de dilatação (sala de espera)

**Módulo** · arquivo-fonte: `scripts/dilatacao-pausas.js`

Substitui a chave única `_shospDilatacaoPhase1` por uma fila `_shospDilatacaoPausas` em `chrome.storage.local`: cada pausa é um slot com a identidade do prontuário capturada na hora. Ver [Dilatação: fila multi-paciente](../memorias/dilatacao-contaminacao-fase2.md).

## Memórias relacionadas

- [cid-dedup-fronteira-de-paciente](../memorias/cid-dedup-fronteira-de-paciente.md): A fronteira de paciente do dedup de CID é o painel, não a URL — o SHOSP abre toda ficha na mesma URL
- [dilatacao-contaminacao-fase2](../memorias/dilatacao-contaminacao-fase2.md): Dilatação virou fila multi-paciente (v5.1.5, _shospDilatacaoPausas) — opt-in por slot; histórico da contaminação entre pacientes
- [log-2026-07-29-gatilho-dilatacao](../memorias/log-2026-07-29-gatilho-dilatacao.md): Dilatação não disparou em 2026-07-29 — plural "-arem lá fora" e "colírio" comido pelo ASR; ambos corrigidos
- [log-2026-07-29-ocr-verify-incoerente](../memorias/log-2026-07-29-ocr-verify-incoerente.md): 5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente
- [log-2026-07-31-pendencias](../memorias/log-2026-07-31-pendencias.md): Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta
- [log-2026-08-07-microfone-mudo](../memorias/log-2026-08-07-microfone-mudo.md): Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera
- [refracao-estatica-pos-dilatacao](../memorias/refracao-estatica-pos-dilatacao.md): Feature de captura pós-dilatação → Refração estática; implementada mas NÃO verificada (faltam IDs reais do bloco estática)
- [speech-log-truncado-120](../memorias/speech-log-truncado-120.md): O log "[Speech] Final:" mostra só os últimos 120 chars — não é o texto que os gatilhos veem

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Módulos](INDEX.md)
