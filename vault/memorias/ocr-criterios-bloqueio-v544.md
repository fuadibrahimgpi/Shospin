---
title: "ocr-criterios-bloqueio-v544"
description: "v5.4.4 afrouxou 4 critérios de bloqueio do OCR; o piso de 0.50D agora libera flip de sinal não confirmado"
date: 2026-08-06
tags: [memoria, project]
aliases: ["ocr-criterios-bloqueio-v544"]
---

# ocr-criterios-bloqueio-v544

> v5.4.4 afrouxou 4 critérios de bloqueio do OCR; o piso de 0.50D agora libera flip de sinal não confirmado

Censo do log 2026-08-05: 6 de 11 capturas bloqueadas — 3 por sinal de esfera de ±0.25D, 2 por cilindro discordante, 1 porque as DUAS leituras ampliadas discordavam entre si e o bloqueio saiu pela voz do recorte dissidente. v5.4.4 (`src/gemini-exam-agent.js`) corrigiu: (1) conferência e bloqueio POR OLHO; (2) as duas leituras ampliadas contam, discordância entre elas é inconclusão; (3) flip de sinal abaixo do piso clínico de 0.50D não bloqueia — a neutralidade é CALCULADA rodando `_inferCidRefracao` nos dois cenários; (4) desempate de cilindro cai nas testemunhas de linha validada, exigindo unanimidade.

**Why:** o item (3) é decisão clínica, não refactor — uma esfera de ±0.25 com sinal que NENHUMA leitura confirmou passa a ir para o prontuário com aviso. Foi apresentada ao médico para veto; a justificativa é que abaixo de 0.50D `_inferCidRefracao` não codifica H520/H521, então o veto custava cilindro, eixo, tono e paqui conferidos.

**v5.4.5 (mesmo dia, log 19:40):** o afrouxamento vazou. Uma dimensão resolvida (esfera liberada pelo piso) ESCONDIA as seguintes — o comparador devolve uma por vez — e o OD injetou cilindro -0.50 contra -1.50 de duas outras leituras. Corrigido com `skipDims` no `_compareEye` + laço por dimensão. Junto: a validação de linha aceitava ±0.25D, que é um passo dióptrico inteiro, então a célula vizinha (o cilindro) passava por esfera; folga caiu para 0.13D.

**v5.4.6 (log 2026-08-06):** o cross-check S+C/2≈S.E. do pós-processamento também reprovava os DOIS olhos — e, por rodar antes da conferência, a refração zerada desligava `refracaoViva`: a captura terminava sem 2ª chamada e sem leitura ampliada para ninguém. Agora é `_failEye`. Junto: `_signsUsable` passou a exigir linha validada, porque o recorte devolve sinal legível da célula errada com muita frequência (a magnitude do cilindro) e vencia o ticket inteiro, que tinha lido certo — captura correta saía com avisos espúrios.

**Pendente (não é critério de bloqueio):** a 1ª leitura é instável no mesmo ticket — 3 fotos, 3 esferas diferentes para o OD (+1.25, +1.25, +2.50), com `_refDataBox` variando de uma tira achatada `[222,16,454,109]` a `[180,140,420,380]`. É problema de localização/prompt da 1ª chamada, e é o que de fato custa refoto ao médico.

**How to apply:** ao rever bloqueio de OCR, começar pelo censo do log (qual regra disparou, quantas vezes, e se a evidência para liberar já estava na captura). Nunca liberar contra uma testemunha de linha validada — ver [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md) e a assimetria que a v5.4.0 removeu.

---

Related: [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [ocr-ticket-deitado-90-graus](ocr-ticket-deitado-90-graus.md)

Up: [Memórias](INDEX.md)
