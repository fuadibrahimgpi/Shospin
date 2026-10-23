---
title: "log-2026-08-05-ocr-bloqueios-e-blefarite"
description: "3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; \"informação na pálpebra\" é inflamação comida pelo ASR"
date: 2026-08-05
tags: [memoria, project]
aliases: ["log-2026-08-05-ocr-bloqueios-e-blefarite"]
---

# log-2026-08-05-ocr-bloqueios-e-blefarite

> 3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; "informação na pálpebra" é inflamação comida pelo ASR

Log de 2026-08-05, dois problemas, ambos corrigidos:

1. **OCR — 3 capturas do mesmo ticket, 3 bloqueios, nenhuma injeção.** A leitura
   ampliada do sinal já transcrevia C e A da linha MÉDIA ("prova de que está na
   linha certa") e essa prova era descartada. Agora `_rowWitnesses` valida a linha
   (magnitude ≈ esfera da 1ª) e usa C/A como voto: resgata o cilindro que só a 2ª
   não viu e desempata o eixo quando a 3ª chamada dedicada volta ilegível. O eixo
   só é **corrigido** (não bloqueado) quando 2ª + 3ª leitura E ≥2 das 3 medições
   do próprio olho apontam o mesmo valor contra a "média" da 1ª.
   A captura com sinal de esfera divergente (OE +0.25 vs "−") **segue bloqueada** —
   a política de sinal não muda. Ver [ocr-3a-leitura-sem-segunda-chance](ocr-3a-leitura-sem-segunda-chance.md).

2. **Blefarite suprimida por corrupção do ASR.** O médico descreveu
   "uma inflamaçãozinha na pálpebra"; o reconhecedor devolveu "informaçãozinha" e
   o gate `blefariteDescritaNoExame` não achou sinal inflamatório → biomicroscopia
   em branco. Regra nova: `informação/enformação` COLADA a pálpebra/bordo/cílios
   conta como inflamação descrita; solta, não. Ver [blefarite-texto-nao-e-rotina](blefarite-texto-nao-e-rotina.md)
   e [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md).

**Why:** os dois eram falhas de *critério*, não de leitura — a informação certa já
estava no pipeline e foi jogada fora.

**How to apply:** antes de endurecer um gate, verificar se a evidência que ele
exige já existe em outra chamada da mesma captura; e lembrar que a transcrição é
fala espontânea passada por ASR, não laudo — palavra ausente ≠ achado ausente.

---

Related: [ocr-3a-leitura-sem-segunda-chance](ocr-3a-leitura-sem-segunda-chance.md) · [blefarite-texto-nao-e-rotina](blefarite-texto-nao-e-rotina.md) · [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [log-2026-08-05-multifocal-e-fundoscopia](log-2026-08-05-multifocal-e-fundoscopia.md) · [ocr-criterios-bloqueio-v544](ocr-criterios-bloqueio-v544.md)

Up: [Memórias](INDEX.md)
