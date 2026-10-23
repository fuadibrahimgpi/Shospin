---
title: "log-2026-07-29-ocr-verify-incoerente"
description: "5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente"
date: 2026-07-29
tags: [memoria, project]
aliases: ["log-2026-07-29-ocr-verify-incoerente"]
---

# log-2026-07-29-ocr-verify-incoerente

> 5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente

Log 2026-07-29: a refração pós-dilatação nunca foi injetada. Causa — TODA captura
(5 de 5) retornou `_captureFailed`, que vira `_blockAutoInject` em
`sidepanel-camera.js`. O mecanismo de dilatação/fase 2 funcionou normalmente.

**A 2ª chamada (verify) é a leitura ruim, não a 1ª.** Conferindo `s + c/2` contra o
`S.E.` reportado, no OD: a 1ª leitura fechou a conta em **5 de 5**; a 2ª errou a
própria conta em **4 de 5** (erros de 0.50 a 6.50 D). A 2ª também perde o sinal
negativo do `se` de forma sistemática (reportou "4.50" para um OE que é −4.50, em
4 de 5 capturas) — apesar de o prompt pedir `"string_com_sinal_ou_null"`.

**Fix (`_compareRefractionAgainstVerify`, ramo da esfera):** se a 2ª leitura é
internamente incoerente (`|se − (s + c/2)| > 0.30`) E a 1ª fecha a conta, o mismatch
vira `soft` em vez de `hard` — o caller então degrada para aviso e injeta.
Escopo estreito de propósito: **não** vale quando há flip puro de sinal (a política
fail-safe de 2026-07-24 tem precedência) e **não** vale para o cilindro — em 18:27 a
1ª leitura era coerente E errada (c=−0.5 quando o real era −2.5), prova de que
coerência interna não é prova de acerto. Testes `[VMATH-1..4]` em
`utils/integration-test.js`.

**Why:** o pipeline tratava a leitura de verificação como testemunha de peso igual
mesmo quando ela se auto-refuta, então uma captura correta era bloqueada
indefinidamente e o médico não tinha como destravar.

**Risco residual aberto (efeito colateral do fix, NÃO corrigido):** `stopCameraCapture()`
zera `_captureMode='normal'` após toda captura, e o botão "📷 Refração estática" só é
renderizado dentro de um slot com `retomar` na fila. Depois de "Fase 2 concluída — pausa
retomada removida da fila", o slot some e o botão junto — então uma câmera aberta do zero
é obrigatoriamente `normal`, e só o banner "Refazer captura" rearma a estática. Antes do
fix, as capturas desse ticket falhavam e o bloqueio segurava; agora que passam, uma
recaptura em modo normal após a fase 2 injeta o grau DILATADO na refração dinâmica /
receita de óculos — a queixa original registrada em [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md).

**How to apply:** ao ver "Refaça a captura" repetido, comparar `s + c/2` com o `se`
de CADA leitura no log antes de suspeitar da foto ou do ticket — quem erra a conta é
quem está errado. Prompt do verify ainda perde o sinal do `se`: não corrigido, é a
próxima alavanca se o bloqueio voltar. Ver [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md) e
[log-2026-07-24-pendencias](log-2026-07-24-pendencias.md).

---

Related: [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md) · [log-2026-07-24-pendencias](log-2026-07-24-pendencias.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [ocr-3a-leitura-sem-segunda-chance](ocr-3a-leitura-sem-segunda-chance.md)

Up: [Memórias](INDEX.md)
