---
title: "cid-dedup-fronteira-de-paciente"
description: "A fronteira de paciente do dedup de CID é o painel, não a URL — o SHOSP abre toda ficha na mesma URL"
date: 2026-07-31
tags: [memoria, project]
aliases: ["cid-dedup-fronteira-de-paciente"]
---

# cid-dedup-fronteira-de-paciente

> A fronteira de paciente do dedup de CID é o painel, não a URL — o SHOSP abre toda ficha na mesma URL

O dedup de CID tem duas camadas e elas tinham fronteiras opostas:

- **Painel** (`_cidsLancadosNaSessao`, sidepanel-constants.js): zera em `StateManager.resetSession()`, ou seja **a cada gravação nova** — que é a definição de "paciente novo" já documentada em `dilatacao-pausas.js` ("Gravação nova sem slot armado = paciente NOVO").
- **Content script** (`window.__shospInjectedCids`): zerava só quando `location.href` mudava. O SHOSP abre toda ficha em `https://sistema.shosp.com.br/`, sem path nem hash — o reset nunca disparava e o Set acumulava do 1º paciente do dia em diante, suprimindo CIDs legítimos dos seguintes com `{success:true, skipped:true}`.

Fix (2026-07-31): o painel virou a autoridade e espelha seu Set via a ação `setInjectedCids` (sobrescreve, não mescla) no **início de cada cadeia** e em **todas as abas do SHOSP** — as chamadas recursivas passam `{_continuation:true}` e não re-sincronizam, senão apagariam o que o content script registrou na própria cadeia. O Set vive por aba: sincronizar só a aba escolhida deixaria as outras com o Set do paciente anterior, reproduzindo o bug quando `selectShospTab` escolhesse outra numa cadeia seguinte. `skipped` deixou de ser exibido como "C.I.D. lançado". A fase 1 da dilatação persiste `cids` no slot da fila e a fase 2 os restaura, porque `resetSession()` já zerou a memória do painel. Testes `[CIDPAC-1..8]`.

**Why:** eram duas fontes de verdade sem dono definido. Uma zerava demais (relançaria CIDs do mesmo paciente), a outra nunca zerava (perdia CIDs do paciente seguinte) — e uma mascarava a outra.

**How to apply:** nada no SHOSP identifica paciente (nem URL, nem DOM — ver [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md)). Qualquer estado "por paciente" tem que pendurar na semântica do painel, nunca em algo da página. E `contentLogger` escreve no console da PÁGINA: falha de CID não se diagnostica só pelo console do painel. Ver [log-2026-07-31-pendencias](log-2026-07-31-pendencias.md).

---

Related: [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md) · [log-2026-07-31-pendencias](log-2026-07-31-pendencias.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md) · [StateManager e SessionFlags](../modulos/state-manager.md) · [ordem-olhos-od-antes-de-oe](ordem-olhos-od-antes-de-oe.md)

Up: [Memórias](INDEX.md)
