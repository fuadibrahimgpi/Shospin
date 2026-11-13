---
title: "log-2026-07-28-pendencias"
description: "Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt"
date: 2026-07-28
tags: [memoria, project]
aliases: ["log-2026-07-28-pendencias"]
---

# log-2026-07-28-pendencias

> Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt

Análise do log de 2026-07-28 (5 consultas + fase 2 pós-dilatação).

**Corrigido:**
- **Tratamento fabricado (grave):** na consulta de corpo estranho (T15.9, retorno), a IA
  *inferiu* "Pomada ocular antibiótica 4/4h por 3 dias" que o médico nunca ditou — a consulta
  encerrou pela válvula de escape do STOP sem conduta/tratamento. Fix: bloco "REGRA
  ANTI-INVENÇÃO DE TRATAMENTO" em `src/gemini-interview-agent.js` (campo tratamento) +
  espelhado em `skills/user/conduta-tratamento-oftalmologia/SKILL.md`. Proíbe: inferir
  prescrição a partir do diagnóstico/contexto; inventar posologia; preencher tratamento
  quando a consulta encerra sem prescrição (→ null). Ver [gemini-service-modularizado](gemini-service-modularizado.md).
- **Lateralidade de diagnóstico chutada:** catarata (H25.9) recebeu "OD" inferido na fase 1;
  fase 2 corrigiu para "AO" ("os dois estão com catarata"). Fix: regra de lateralidade do
  diagnóstico agora proíbe chutar OD/OE em diagnósticos bilaterais-capazes (catarata,
  glaucoma, refração, DMRI, retinopatia) — só o lado que o médico atribuiu; ambíguo →
  "(confirmar olho)".

**NÃO corrigido (gap conhecido, fora de escopo):**
- OCR leu tonometria OD 24 / OE 25 mmHg (PIO elevada, suspeita de glaucoma) na consulta de
  refração longa (4308 palavras) e nada na cadeia sinalizou. O OCR extrai, não diagnostica —
  não há alerta de PIO alta. Considerar feature futura.

**Funcionou bem:** anti-inversão de sinal do OCR (voto 2-de-3 forçou recaptura, v5.3.6);
fila de dilatação multi-paciente (fase 1→2 mesclou e removeu da fila); recusa de catarata em
antecedente familiar; válvula de escape do STOP.

---

Related: [gemini-service-modularizado](gemini-service-modularizado.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Agente de medicamentos](../agentes/medicamentos-agent.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [log-2026-07-31-pendencias](log-2026-07-31-pendencias.md)

Up: [Memórias](INDEX.md)
