---
title: "ocr-3a-leitura-sem-segunda-chance"
description: "_refDataBox é palpite do modelo; recorte válido-e-errado deixava a 3ª leitura ilegível e bloqueava refração em série"
date: 2026-08-03
tags: [memoria, project]
aliases: ["ocr-3a-leitura-sem-segunda-chance"]
---

# ocr-3a-leitura-sem-segunda-chance

> _refDataBox é palpite do modelo; recorte válido-e-errado deixava a 3ª leitura ilegível e bloqueava refração em série

Log 2026-08-03 20:14: duas capturas seguidas do MESMO ticket bloquearam a
refração (tono/paqui preservadas). Em ambas a leitura ampliada do sinal
(3ª chamada) voltou `sinal:null` — uma delas com `magnitude:"0.77"`, que é o
EIXO do OE, prova de que o recorte levou o olhar para outra célula.

**Why:** `_refDataBox` vem da 1ª chamada como palpite, não medição — a mesma
folha rendeu `[170,170,460,380]` e depois `[170,100,520,450]`. Caixa **inválida**
já caía para o ticket inteiro (`_buildFocusedParts` → null); caixa
**válida-e-errada** não tinha recurso, e sem a 3ª leitura a disputa de sinal
1ª-vs-2ª nunca desempata → recaptura infinita.

**How to apply:** v5.4.1 em `src/gemini-exam-agent.js` — (a) ampliada ilegível nos
dois olhos repete UMA vez no ticket inteiro (`_signsUsable`); (b) o log traz as
métricas do recorte (`origem/recorte/saída/escala`), que separam "caixa no lugar
errado" de "resolução insuficiente" — **conferir isso no próximo log ruim, ainda
não foi medido em captura real**; (c) `_describeSignMisread` diz no log por que a
leitura não valeu (eixo/cilindro/sinal ausente). Testes FOCUS-3..5, SIGN-10.

Não inverter a política de "1ª leitura é a âncora": o verify ter devolvido
valores idênticos nas duas capturas é evidência fraca — duas fotos da mesma folha
devem concordar mesmo.

Relacionado: [log-2026-07-29-ocr-verify-incoerente](log-2026-07-29-ocr-verify-incoerente.md), [log-2026-07-24-pendencias](log-2026-07-24-pendencias.md).

---

Related: [log-2026-07-29-ocr-verify-incoerente](log-2026-07-29-ocr-verify-incoerente.md) · [log-2026-07-24-pendencias](log-2026-07-24-pendencias.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md)

Up: [Memórias](INDEX.md)
