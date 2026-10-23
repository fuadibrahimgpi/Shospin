---
title: "Agente de exames (OCR Gemini)"
description: "Lê o ticket do autorefrator TOPCON por imagem: refração, tonometria, paquimetria, com validações e bloqueio por incerteza."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["gemini-exam-agent"]
---

# Agente de exames (OCR Gemini)

**Agente** · arquivo-fonte: `src/gemini-exam-agent.js`

Agente de Exames (OCR) do GeminiService. O ticket é SEMPRE fotografado deitado; a moldura do sidepanel é horizontal e a orientação virou a constante `PRE_ROTACAO_MOLDURA` ([Ticket é SEMPRE fotografado deitado](../memorias/ticket-sempre-deitado.md)).

Regras de interpretação na skill [OCR TOPCON](../skills/ocr-topcon-oftalmologia.md).

## Memórias relacionadas

- [cid-busca-exige-secao-visivel](../memorias/cid-busca-exige-secao-visivel.md): A busca de CID do SHOSP só executa com a seção C.I.D. VISÍVEL — oculta, o painel mostra o histórico e ele era lido como resultado
- [cid-shosp-sem-ponto](../memorias/cid-shosp-sem-ponto.md): O SHOSP grava e busca CID SEM ponto (H522, não H52.2) — vale para todos os códigos
- [gemini-service-modularizado](../memorias/gemini-service-modularizado.md): Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)
- [log-2026-07-21-pendencias](../memorias/log-2026-07-21-pendencias.md): Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)
- [log-2026-07-24-pendencias](../memorias/log-2026-07-24-pendencias.md): Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)
- [log-2026-07-27-pendencias](../memorias/log-2026-07-27-pendencias.md): Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)
- [log-2026-07-28-pendencias](../memorias/log-2026-07-28-pendencias.md): Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt
- [log-2026-07-29-ocr-verify-incoerente](../memorias/log-2026-07-29-ocr-verify-incoerente.md): 5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente
- [log-2026-07-31-pendencias](../memorias/log-2026-07-31-pendencias.md): Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta
- [log-2026-08-05-ocr-bloqueios-e-blefarite](../memorias/log-2026-08-05-ocr-bloqueios-e-blefarite.md): 3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; "informação na pálpebra" é inflamação comida pelo ASR
- [ocr-3a-leitura-sem-segunda-chance](../memorias/ocr-3a-leitura-sem-segunda-chance.md): _refDataBox é palpite do modelo; recorte válido-e-errado deixava a 3ª leitura ilegível e bloqueava refração em série
- [ocr-criterios-bloqueio-v544](../memorias/ocr-criterios-bloqueio-v544.md): v5.4.4 afrouxou 4 critérios de bloqueio do OCR; o piso de 0.50D agora libera flip de sinal não confirmado
- [ocr-ticket-deitado-90-graus](../memorias/ocr-ticket-deitado-90-graus.md): Ticket TOPCON fotografado deitado (90°) é a causa raiz das trocas de coluna do OCR — corrigido na v5.4.7
- [refracao-estatica-pos-dilatacao](../memorias/refracao-estatica-pos-dilatacao.md): Feature de captura pós-dilatação → Refração estática; implementada mas NÃO verificada (faltam IDs reais do bloco estática)
- [ticket-sempre-deitado](../memorias/ticket-sempre-deitado.md): Todas as fotos de ticket TOPCON da pasta da câmera estão deitadas; o médico apoia a tira na mesa e fotografa de cima — nunca de pé

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
