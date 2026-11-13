---
title: "cid-busca-exige-secao-visivel"
description: "A busca de CID do SHOSP só executa com a seção C.I.D. VISÍVEL — oculta, o painel mostra o histórico e ele era lido como resultado"
date: 2026-08-04
tags: [memoria, project]
aliases: ["cid-busca-exige-secao-visivel"]
---

# cid-busca-exige-secao-visivel

> A busca de CID do SHOSP só executa com a seção C.I.D. VISÍVEL — oculta, o painel mostra o histórico e ele era lido como resultado

`buscaCidProntuario()` só executa a consulta quando a seção C.I.D. está **visível**. Com ela oculta, a chamada retorna sem buscar e `#divResultadoBuscaPadraoCid` continua exibindo "Últimos CIDs selecionados" — as 6 linhas do histórico. Medido diretamente na plataforma em 2026-07-30.

**Why:** essa é a causa raiz única de praticamente todas as falhas de CID registradas. A extensão lia as 6 linhas do histórico como se fossem o resultado da busca, então **só entravam códigos que já estavam no histórico recente**; qualquer outro falhava com "SHOSP retornou resultados mas nenhum correspondeu — Descartadas: H010BLEFARITE | H524PRESBIOPIA | ...". Explica de uma vez: o H52.9 do log 2026-07-30, o H16.2 "rejeitado" de 2026-07-21 (o código EXISTE: `H162 CERATOCONJUNTIVITE`), o fallback do H40.0 e o padrão de "só funciona o que já usei". O comentário antigo em `searchCid` dizia "quando este handler roda, a seção C.I.D. já está montada" — montada é verdade, e ainda assim insuficiente: montada ≠ visível.

**How to apply:** `case 'searchCid'` (`src/content.js`) testa `input.offsetParent === null` e abre a seção antes de buscar; se mesmo assim não ficar visível, falha explicitamente em vez de ler o histórico. Testes `[CIDVIS-1..2]`.

⚠️ **2026-07-31 — o clique de recuperação era em `#tdCadastro-cid`, um ID INVENTADO.** As abas reais da ficha são `tdCadastro-<número>` (78073 Atendimento, 78074 Refração…), então o `if` inteiro era no-op e a recuperação nunca podia ter rodado. Só não aparecia porque a 1ª rodada de CIDs de cada consulta pega a seção ainda visível; a 2ª (depois de o `injectAll` navegar pelas abas) falhava sempre — foi o H527 do log das 13:58. Agora `_findCidTabCandidates(doc)` acha o item pelo RÓTULO (igualdade de `"c.i.d." → "cid"`; nunca prefixo, senão "CIDADE" casaria e o clique navegaria a ficha), espera a visibilidade por poll e, na falha, dumpa o menu uma linha por item. **Não verificado na plataforma** — a confirmação é a linha `[searchCid] Seção C.I.D. ativada via …` no console da PÁGINA; se vier `DUMP menu:`, colar o dump e fixar o ID verdadeiro. Testes `[CIDTAB-1..5]`. Ao diagnosticar qualquer falha de CID, a primeira pergunta é "a seção estava visível?" — o sintoma de que NÃO estava é a lista de descartadas ser sempre as mesmas 6 linhas entre falhas diferentes (ver [cid-historico-como-resultado](cid-historico-como-resultado.md)).

⚠️ **2026-08-04 — o clique de recuperação FUNCIONA; o prazo é que era curto.** Prova no log do dia: numa cadeia de dois CIDs o `H010` falhou com "seção não ficou visível" e o `H524`, buscado **1,8 s depois na mesma página e sem clique novo**, passou. Ou seja: `_findCidTabCandidates` acha o item, o clique abre a seção, e ela termina de montar **depois** do teto de `TAB_LOAD_DELAY*2` (1,6 s). Duas correções: (1) `CID_SECTION_WAIT_MS = 5000` para o 1º candidato (os demais seguem em 1,6 s); (2) a falha agora devolve `code: 'CID_SECTION_HIDDEN'` e o painel **reagenda o termo uma vez no FIM da cadeia** (`handleSearchCid._requeued`) em vez de descartá-lo — foi assim que a presbiopia (H52.4) sumiu do prontuário naquele dia. Testes `[CIDTAB-6]`, `[CIDRQ-1..4]`. Nunca casar a prosa em português da mensagem entre content.js e o painel: o contrato é o `code`.

**Subset verificado na plataforma (busca real, 2026-07-30):** `H520 HIPERMETROPIA` existe · `H527 TRANSTORNO NAO ESPECIFICADO` existe · `H529` retorna **zero linhas** (não existe, nem na CID-10: H52 vai de .0 a .7) · `H162 CERATOCONJUNTIVITE` existe. Por isso o "refração não especificada" passou de H529 para **H527** no prompt e nas retificações de redundância (o H529 legado continua sendo descartado). Ver [cid-shosp-sem-ponto](cid-shosp-sem-ponto.md).

---

Related: [cid-historico-como-resultado](cid-historico-como-resultado.md) · [cid-shosp-sem-ponto](cid-shosp-sem-ponto.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [log-2026-07-31-pendencias](log-2026-07-31-pendencias.md)

Up: [Memórias](INDEX.md)
