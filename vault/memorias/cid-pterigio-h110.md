---
title: "cid-pterigio-h110"
description: "Sítios errados na tabela de CIDs do prompt (pterígio H111→H110 e mais três)"
date: 2026-08-27
tags: [memoria, project]
aliases: ["cid-pterigio-h110"]
---

# cid-pterigio-h110

> Sítios errados na tabela de CIDs do prompt (pterígio H111→H110 e mais três)

A tabela "CIDs OFTALMOLÓGICOS FREQUENTES" do prompt era uma lista escrita à mão e
nunca conferida — o modelo a reproduzia fielmente, sítio errado incluído. Revisada
inteira contra o subset em `skills/user/cid-oftalmologia/SKILL.md` (a autoridade)
em 2026-08-27. Quatro erros:

- **H111 → H110** pterígio (H11.1 é "degenerações e depósitos conjuntivais" — foi o
  que o médico viu na ficha). Estava também no mapa de dedup `_CLINICAL_TERM_TO_CID`
  em `scripts/sidepanel-injection.js`.
- **H430 → H431** hemorragia vítrea (H43.0 é prólapso do vítreo).
- **H340 → H341** oclusão da artéria central (H34.0 é a TRANSITÓRIA/amaurose fugaz).
- **H591 → H598** pós-procedimento (H59.1 não existe no subset).

**Why:** um código errado que EXISTE no subset é invisível — a busca dá `success`, o
SHOSP troca o rótulo do modelo pela descrição dele e o prontuário sai com outro
diagnóstico. Prompt e mapa de dedup erravam o mesmo código, então nada divergia.

**How to apply:** travado por `[CID-TABELA-1..4]` em `utils/integration-test.js`, que
compara a tabela do prompt contra o subset a cada rodada — qualquer código novo que
não exista em H00–H59 quebra o teste. Os `H111` que sobraram em comentários e em
`utils/hooks-test.js` são citações do log 2026-07-29 e testes de robustez
(o matcher casa por termo, não pelo código) — não corrigir.
Relacionado: [cid-shosp-sem-ponto](cid-shosp-sem-ponto.md), [achado-episodico-nao-e-diagnostico](achado-episodico-nao-e-diagnostico.md).

---

Related: [cid-shosp-sem-ponto](cid-shosp-sem-ponto.md) · [achado-episodico-nao-e-diagnostico](achado-episodico-nao-e-diagnostico.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md)

Up: [Memórias](INDEX.md)
