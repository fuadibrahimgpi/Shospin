---
title: "cid-historico-como-resultado"
description: "Instabilidade da injeção de CID: o painel do SHOSP mistura 'Últimos CIDs selecionados' com os resultados; matcher permissivo clicava o vizinho e respondia success"
date: 2026-07-30
tags: [memoria, project]
aliases: ["cid-historico-como-resultado"]
---

# cid-historico-como-resultado

> Instabilidade da injeção de CID: o painel do SHOSP mistura 'Últimos CIDs selecionados' com os resultados; matcher permissivo clicava o vizinho e respondia success

Causa raiz da injeção de CID instável (log 2026-07-30, corrigido no mesmo dia em
`refactor/estrutura-fase-0-1`).

**A prova:** as duas falhas do dia (`H04.1` às 12:03 e `T15.0` às 12:24, 20 min
de intervalo) descartaram a MESMA lista de 6 linhas — `H010 BLEFARITE | H524
PRESBIOPIA | H522 ASTIGMATISMO | H521 MIOPIA | H251 CATARATA SENIL NUCLEAR |
H110 PTERIGIO`. Duas buscas distintas não retornam resultados idênticos: aquilo
eram os **"Últimos CIDs selecionados"**. Quando o "Descartadas:" de falhas
diferentes repete a mesma lista, é histórico, não resultado.

Duas falhas somadas: `waitForRows` aceitava o 1º contêiner não-vazio sem checar
se o código pedido estava lá; e `pickRow`/`tryPickFromRows` tinham 4 caminhos
que aceitavam código DIFERENTE do pedido (prefixo onclick, prefixo texto,
qualquer linha da categoria de 3 chars, `rows.length === 1`). Resultado por
faixa: código no histórico → acertava por sorte; mesma categoria de um do
histórico → **clicava outro código e respondia success** (H52.0 e H52.9 viravam
H52.4 Presbiopia); categoria ausente → falhava. Os três sintomas que o médico
relatou ("às vezes dá certo, às vezes injeta alguns e não todos") saem daí.

O clique errado ainda envenenava `__shospInjectedCids`: gravado `H524`, um
H52.4 legítimo depois era pulado como "já injetado".

**Princípio que ficou:** num prontuário, CID faltando é melhor que CID errado —
sem match exato, falhar e mandar para `_surfaceFailedCids()`. Correção detalhada
na skill `cid-oftalmologia` (seção "Instabilidade 2026-07-30"), testes
`CIDPICK-1..10`. Ver [cid-search-hadrows-dead-branch](cid-search-hadrows-dead-branch.md) — o `sawAnyRows` daquele
fix é o que tornou esta prova legível no log.

**PENDENTE:** `H52.9` provavelmente não existe na CID-10 (H52 vai de .0 a .7;
o "não especificado" é `H52.7`). Suspeita de que só "funcionava" por este mesmo
fallback. Verificar o prontuário das 13:06 do log 2026-07-30 antes de trocar.

---

Related: [cid-search-hadrows-dead-branch](cid-search-hadrows-dead-branch.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [cid-busca-exige-secao-visivel](cid-busca-exige-secao-visivel.md) · [cid-shosp-sem-ponto](cid-shosp-sem-ponto.md)

Up: [Memórias](INDEX.md)
