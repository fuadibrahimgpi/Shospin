---
title: "laudo-oct-modo-painel"
description: "Modo OCT do painel (2026-11-09) injeta o laudo da skill de OCT glaucoma no campo OCT da aba Glaucoma; rótulo/ID real do campo NUNCA conferido no DOM — PENDENTE"
date: 2026-11-09
tags: [memoria, project]
aliases: ["laudo-oct-modo-painel"]
---

# laudo-oct-modo-painel

> Modo OCT do painel (2026-11-09) injeta o laudo da skill de OCT glaucoma no campo OCT da aba Glaucoma; rótulo/ID real do campo NUNCA conferido no DOM — PENDENTE

Commits 85a49c6 e fc703ab (`perf/paralelizar-injecao`). Modo "OCT" no painel: `scripts/sidepanel-oct.js` (UI) + `src/gemini-oct-agent.js` (prompt e decisão) + `content.js` (`injectOctLaudo`, `dumpCamposGlaucoma`, `_escolherCampoOct`, `_campoOctPronto`). Testes: `utils/oct-test.js`.

- O prompt do agente é a autoridade em produção. A skill `laudo-oct-glaucoma-oftalmologia` do hub é só documentação. Uma mudança de regra precisa ir para o prompt.
- O campo é achado pelo RÓTULO (OCT/O.C.T./tomografia) dentro de `divTextoProntuarioServico78726` e precisa ser único. 0 ou 2+ candidatos → não injeta. Não há ID fixo.
- PENDENTE: o rótulo e o ID reais do campo OCT nunca foram lidos do DOM do SHOSP. Na primeira falha, peça a saída do botão "Diagnóstico do campo OCT" (console do painel, uma linha por campo) e fixe o ID a partir dela, como em [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md).
- A injeção automática fica retida em caso de olho ausente, olhos idênticos, várias datas, aparelhos diferentes, imagem cortada ou linguagem diagnóstica (E08). O rodapé "Confira…" e os ⚠️ ficam no painel, fora do prontuário. Um campo que já tem texto não é sobrescrito sem um clique.

**Why:** um ID inventado repetiria o erro do `#tdCadastro-cid` ([cid-busca-exige-secao-visivel](cid-busca-exige-secao-visivel.md)).
**How to apply:** antes de mexer na injeção do OCT, peça o dump. Não troque a busca por rótulo por um fallback de índice.

---

Related: [Agente de OCT](../agentes/gemini-oct-agent.md) · [Content script](../modulos/content-script.md)

Up: [Memórias](INDEX.md)
