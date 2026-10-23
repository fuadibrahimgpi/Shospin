---
title: "log-2026-07-24-pendencias"
description: "Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)"
date: 2026-07-24
tags: [memoria, project]
aliases: ["log-2026-07-24-pendencias"]
---

# log-2026-07-24-pendencias

> Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)

Análise do log de 2026-07-24 (4 consultas). Achados e status:

1. **OCR finalizou sinal da esfera invertido (CRÍTICO — CORRIGIDO v5.3.6)** — na
   consulta com dilatação, OD foi lido `+5.25 -3.00 x174` (hipermetropia) por voto
   2-de-3, mas a captura pós-dilatação do mesmo paciente leu esfera negativa
   (miopia). O desempate de sinal (v5.3.4) tratava as 3 leituras como
   independentes, mas elas compartilham o mesmo modo de falha físico (o traço
   vertical do "+" some na impressão térmica) → "confirmou a 1ª" pode ser a mesma
   alucinação 2×. **Fix** em `src/gemini-exam-agent.js` (ramo `mismatch.signFlip`):
   flip de sinal NUNCA é auto-liberado — vira sempre `_captureFailed` (força
   recaptura), como o eixo já faz; a 3ª chamada roda só p/ enriquecer a mensagem.
   `_captureFailed` bloqueia a injeção via `_blockAutoInject` (sidepanel-camera.js)
   e zera `cid_refracao` → o CID errado (H52.0) não entra. Testes SIGN-1, SIGN-2.
   Miopia↔hipermetropia é o flip de OCR de maior consequência (inverte CID e lente).

2. **H04.1 "Olho seco" rejeitado pelo SHOSP — NÃO é bug (by design)** — mesmo caso
   do H16.2 em [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md): o SHOSP tem uma lista CURADA de CIDs
   e H04.1 (código correto p/ olho seco) simplesmente não está nela. A busca já
   tenta `H041`, `H04.1` e a categoria `H04` — todas zero linhas → cai na branch de
   falha (`sidepanel-injection.js:230`), acumula em `handleSearchCid._failed` e
   `_surfaceFailedCids()` mostra aviso persistente "adicione manualmente". **Não
   forçar match por palavra-chave** ("seco"/"olho") — arriscaria injetar um CID
   ERRADO silenciosamente, exatamente o que o design evita. Extensão nada a fazer;
   só extensão da lista do SHOSP (server-side) resolveria.

3. **AutoCID-OCR gerava H52.0/H52.1 p/ ±0.25 — CORRIGIDO (v5.3.6)** — piso clínico
   em `_inferCidRefracao` (`src/gemini-exam-agent.js`): esfera só codifica ametropia
   a partir de `|esf| >= 0.50`. ±0.25D é faixa emétrope → não gera hipermetropia/
   miopia no caminho determinístico do OCR (sem contexto de sintomas). Astigmatismo
   (`cil >= 0.25`) e o caminho de entrevista permanecem inalterados. Testes
   REFRAC-FLOOR-1..3.

Item observado mas NÃO acionado (deliberado):
- **Presbiopia H52.4 inferida mas não injetada** (consulta 1): a IA raciocinou
  H52.2+H52.4/multifocais mas só H52.2 entrou; `[DecisionEngine] Guards Array(1)`
  = `_guardPresbiopiaObrigatoria` removeu porque `canHavePresbiopia` (multifocal +
  evidência de perto, OU menção de presbiopia) não foi satisfeito. **Provável
  comportamento correto** (refração ínfima -0.50, médico disse que grau não muda).
  NÃO mexido: o guard é fortemente tunado (testes PRES-6/7, fix do log 2026-07-21)
  e não tenho a transcrição completa + conduta exata da consulta 1 p/ provar que a
  remoção foi errada. Mudar especulativamente regrediria um fix deliberado.

---

Related: [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [cid-search-hadrows-dead-branch](cid-search-hadrows-dead-branch.md) · [log-2026-07-29-ocr-verify-incoerente](log-2026-07-29-ocr-verify-incoerente.md) · [ocr-3a-leitura-sem-segunda-chance](ocr-3a-leitura-sem-segunda-chance.md)

Up: [Memórias](INDEX.md)
