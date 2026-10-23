---
title: "ocr-ticket-deitado-90-graus"
description: "Ticket TOPCON fotografado deitado (90°) é a causa raiz das trocas de coluna do OCR — corrigido na v5.4.7"
date: 2026-08-06
tags: [memoria, project]
aliases: ["ocr-ticket-deitado-90-graus"]
---

# ocr-ticket-deitado-90-graus

> Ticket TOPCON fotografado deitado (90°) é a causa raiz das trocas de coluna do OCR — corrigido na v5.4.7

A foto de 2026-08-06 09:03 (enviada pelo médico) mostra a tira do TOPCON deitada a 90° sobre a mesa. O pipeline só sabia endireitar 180° (`_ticketInvertido`), então 90°/270° passavam direto. Lendo de lado, a coluna do CILINDRO cai onde a leitura espera a ESFERA: em 2 das 3 capturas do mesmo ticket o OD saiu `+1.25` (o cilindro) em vez de `+2.50`, cada uma com um S.E. diferente — e coerência interna suficiente para parecer certa. v5.4.7: a 1ª chamada devolve `_ticketRotacao` (0/90/180/270), o sistema gira (fotos nativas do recorte inclusive) e relê uma vez.

**v5.4.8:** deitado, o ticket admite 90° OU 270° e de fora não dá para saber qual — as duas apresentações acontecem. Errado o sentido, a imagem sai de cabeça para baixo e o modelo pede mais 180°: `90 + 180 = 270`, a outra apresentação. São até duas correções, girando sempre a partir do original pelo acumulado, e o pedido que fecha a volta (90 depois 270 = foto original) é recusado. Regra isolada em `_proximoAlvoRotacao` para ter teste de verdade.

**Why:** trocas de coluna vinham sendo tratadas como problema de critério de bloqueio; os critérios só encareciam a refoto. A geometria da foto é que estava errada — o ticket é uma tira longa e sai deitado naturalmente sobre a mesa.

**How to apply:** ao investigar leitura errada do OCR, pedir a FOTO antes de mexer em veto. Se os valores errados forem valores REAIS do ticket em outra coluna/linha, é geometria ou localização (`_refDataBox`), não critério. Ver [ocr-criterios-bloqueio-v544](ocr-criterios-bloqueio-v544.md).

**Observação não confirmada:** neste ticket o S.E. impresso é arredondado a passo de 0.25 (`+2.00` para um valor exato de `+1.875`). Se isso valer para todos os aparelhos da clínica, "S.E. que não é múltiplo de 0.25" vira detector determinístico de S.E. FABRICADO (a captura 11:42 devolveu `+0.62` = exatamente s+c/2 calculado). Falta confirmar com o médico antes de virar regra.

---

Related: [ocr-criterios-bloqueio-v544](ocr-criterios-bloqueio-v544.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [ticket-sempre-deitado](ticket-sempre-deitado.md)

Up: [Memórias](INDEX.md)
