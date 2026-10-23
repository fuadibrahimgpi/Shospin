---
title: "ticket-sempre-deitado"
description: "Todas as fotos de ticket TOPCON da pasta da câmera estão deitadas; o médico apoia a tira na mesa e fotografa de cima — nunca de pé"
date: 2026-08-06
tags: [memoria, project]
aliases: ["ticket-sempre-deitado"]
---

# ticket-sempre-deitado

> Todas as fotos de ticket TOPCON da pasta da câmera estão deitadas; o médico apoia a tira na mesa e fotografa de cima — nunca de pé

As 14 fotos mais recentes de `~/OneDrive/Imagens/Imagens da Câmera` (abril a agosto de 2026) mostram o ticket TOPCON **sempre deitado** sobre a mesa, fotografado de cima. Cinco foram conferidas à vista, uma a uma: todas deitadas. Nenhuma foto tem o ticket de pé.

Mais: o cabeçalho (NAME / data / REF.DATA) fica **à DIREITA** na foto — girar a imagem **270°** é o que deixa o ticket legível. Isso foi verificado gerando as versões giradas e lendo-as, não estimado.

Detalhe frequente: o ticket de TONO/PACH costuma estar grampeado **a 180° do ticket de refração** na mesma foto (ver 2026-08-06 08:57 e 2026-05-21 09:41) — os dois exames, com horários diferentes, em orientações opostas.

**AVG do TOPCON não é a média do que está impresso:** leituras entre parênteses são excluídas da conta. Linhas reais: `R 13 (14)(14) → AVG 13` (média seria 14) e `L ERR (16)(18) → AVG 19` (nem média, nem um dos valores). Qualquer conferência do AVG contra a faixa [min,max] das medições reprova capturas boas — por isso a checagem compara com a medição impressa mais próxima, com folga de 3 mmHg (só pega erro de dígito).

**Why:** esse fato decidiu duas escolhas de projeto na revisão de OCR de 2026-08-06 (v5.5.0), e nenhuma delas se justifica sem ele:

1. **A moldura de enquadramento do sidepanel é HORIZONTAL, não vertical.** De pé, o comprimento do ticket fica limitado pela altura do quadro e os dígitos perdem ~40% de resolução linear — exatamente o que `_cropAndZoom` e o recorte da foto nativa existem para compensar. Deitado, a tira usa a largura inteira. A moldura padroniza o **lado do cabeçalho** (marcado à DIREITA, que é o hábito já existente), não a orientação da tira — assim a conformidade não exige mudar de hábito e `PRE_ROTACAO_MOLDURA = 270` acerta já na 1ª chamada.

2. **Um detector local de "deitado vs em pé" foi escrito, medido e descartado.** Errou 2 das 5 fotos conferidas à vista. O controle que parecia validá-lo (girar 90° inverte a resposta em 14/14) era vacuoso: a métrica era uma razão entre os dois eixos, que inverte por construção. Pior: seu único modo de erro perigoso — girar uma foto que já estava boa — só passaria a acontecer quando a moldura começasse a funcionar. Não se calibra um detector na distribuição que se está tentando eliminar. Quem endireita segue sendo o modelo ([ocr-ticket-deitado-90-graus](ocr-ticket-deitado-90-graus.md)).

**How to apply:** antes de propor qualquer heurística de orientação, lembrar que a distribuição real é degenerada (100% deitado) — não há exemplos negativos na pasta para validar nada, e sintetizá-los por rotação só testa antissimetria. Se a moldura mudar de lado, `PRE_ROTACAO_MOLDURA` em `src/gemini-exam-agent.js` muda junto (o teste ORIENT-2 guarda esse acoplamento).

---

Related: [ocr-ticket-deitado-90-graus](ocr-ticket-deitado-90-graus.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md)

Up: [Memórias](INDEX.md)
