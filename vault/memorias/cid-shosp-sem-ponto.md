---
title: "cid-shosp-sem-ponto"
description: "O SHOSP grava e busca CID SEM ponto (H522, não H52.2) — vale para todos os códigos"
date: 2026-07-30
tags: [memoria, project]
aliases: ["cid-shosp-sem-ponto"]
---

# cid-shosp-sem-ponto

> O SHOSP grava e busca CID SEM ponto (H522, não H52.2) — vale para todos os códigos

O SHOSP usa os códigos de CID **sem ponto**. Informado pelo médico em 2026-07-30 ("tem que ser no formato sem ponto, isso vale para todos os CIDs") e visível nas linhas de resultado da própria plataforma: `H522ASTIGMATISMO.`, `H010BLEFARITE.`, `H524PRESBIOPIA.`

**Why:** até 2026-07-30 `handleSearchCid` (`scripts/sidepanel-injection.js`) fazia o INVERSO — convertia `H400` em `H40.0` antes de buscar, com o comentário "para compatibilidade com o autocomplete do SHOSP". Não quebrava porque o content script monta as variantes com a forma sem ponto primeiro (o ponto era adicionado no painel e removido no content script), mas o log mentia sobre o que fora buscado: o campo dizia `H521 - Miopia AO` e o log dizia `[SearchCid] termo="H52.1"`. Essa discrepância atrapalha o diagnóstico de qualquer falha de CID.

**How to apply:** o painel normaliza na origem (`termToSearch = termToSearch.replace(/\./g, '')`) e `_inferCidRefracao` (`src/gemini-exam-agent.js`) emite `H521 - Miopia`, igual ao agente de entrevista — antes o OCR emitia com ponto e a entrevista sem, dois formatos na mesma consulta. A variante COM ponto continua existindo no content script como rede de segurança, mas só roda depois que a sem ponto não retornou nada; nunca reordenar. Matching (`_pickCidRow`) e dedup (`_cidKeyFromText`) já eram insensíveis a ponto. Testes `[CIDDOT-1..5]`.

Não confundir com [cid-historico-como-resultado](cid-historico-como-resultado.md): o ponto nunca foi a causa das falhas de CID daquele log. `H52.9` falhou por não existir no subset do SHOSP (busca sem ponto inclusive) — ver [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md). Os CIDs que "funcionaram" naquele log (H521, H522, H524, H010) são exatamente os que estavam no painel "Últimos CIDs selecionados", então foram clicados de lá, não do resultado da busca.

---

Related: [cid-historico-como-resultado](cid-historico-como-resultado.md) · [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [cid-busca-exige-secao-visivel](cid-busca-exige-secao-visivel.md) · [cid-pterigio-h110](cid-pterigio-h110.md)

Up: [Memórias](INDEX.md)
