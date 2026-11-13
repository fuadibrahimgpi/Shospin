---
title: "log-2026-07-31-pendencias"
description: "Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta"
date: 2026-07-31
tags: [memoria, project]
aliases: ["log-2026-07-31-pendencias"]
---

# log-2026-07-31-pendencias

> Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta

Sessão de 2026-07-31 com 4 fichas na mesma aba do SHOSP (uma delas com dilatação, retomada ~35min depois). A refração estática pós-dilatação injetou certo — o problema estava nos CIDs.

**1. Dedup de CID vazava entre pacientes (CORRIGIDO em 2026-07-31).** Duas camadas de dedup com fronteiras opostas: o painel (`_cidsLancadosNaSessao`) zera a cada gravação nova via `StateManager.resetSession()`; o content script (`window.__shospInjectedCids`) só zerava quando `location.href` mudava — e o SHOSP nunca muda de URL. Do 2º paciente em diante, todo código repetido (H520/H522) era descartado com `{success:true, skipped:true}` e o painel ainda mostrava "C.I.D. lançado". Fix: o painel virou a autoridade e espelha o set via `setInjectedCids` no início de cada cadeia; `skipped` deixou de ser reportado como lançado. Ver [cid-dedup-fronteira-de-paciente](cid-dedup-fronteira-de-paciente.md).

**Why:** o log do painel não mostra os avisos do content script (`contentLogger` escreve no console da PÁGINA) — a falha era invisível dos dois lados.

**How to apply:** ao investigar CID que "sumiu", abrir o console da página do SHOSP, não só o do painel.

**2. Presbiopia apagada por guard (RESOLVIDO em 2026-07-31, à tarde).** Duas ocorrências no mesmo dia (12:59 e 13:58): conduta com "óculos multifocais" e ainda assim H524 fora do campo, porque `_guardPresbiopiaObrigatoria` exigia `hasMultifocal && hasEvidenciaPerto` e nenhum fraseado de "perto" casava com a fala real (às 13:58 o ASR devolveu "para onde" no lugar de "para longe"). Terceira recorrência da mesma classe — cada correção anterior só ampliava a lista de fraseados aceitos. **Decisão do médico: o AND cai.** Basta multifocal/bifocal/progressivo na conduta OU na fala, ou os óculos descritos como para longe E perto (par colado + âncora de óculos/lente/grau, senão todo míope viraria presbiópico). Também alinhado ao prompt: "óculos para perto / de leitura / para ler" passam a bastar sozinhos — o prompt sempre mandou a IA emitir H52.4 nesses fraseados e o guard apagava em seguida (contradição interna, mesmo sintoma). Testes `[PRES-14..20]`; `[PRES-6]` e `[PRES-7]` foram invertidos. Consequência: com H524 no campo, `_dropUnspecifiedRefraction` passa a remover o H527 — é a saída certa, mas muda o que aparece no diagnóstico.

**2b. H527 falhou por seção C.I.D. oculta na 2ª rodada de CIDs (CORRIGIDO, não verificado na plataforma).** Às 13:58 o H520/H522 do OCR entrou às 13:53 e o H527 da rodada de áudio falhou com "seção C.I.D. não ficou visível": entre as rodadas o `injectAll` navegou pelas abas de exame, e o caminho de recuperação clicava num ID inexistente. Ver [cid-busca-exige-secao-visivel](cid-busca-exige-secao-visivel.md).

**3. PIO 24 mmHg injetada sem sinalização (PENDENTE, 3ª recorrência).** Não existe limiar de PIO em lugar nenhum; o único check é faixa 5–40 em `_postProcessRefraction`. Ver [log-2026-07-28-pendencias](log-2026-07-28-pendencias.md).

**4. Refração estática não gera CID, e o CID pré-dilatação nunca é revisado (PENDENTE).** `sidepanel-camera.js` desvia o caminho pós-dilatação de `injectAll` ("nada de dinâmica/receita/tono/paqui/CID"). Efeito real: `H523 - Anisometropia` foi lançado da leitura sem cicloplegia (diferença de S.E. 1,75D) e a refração definitiva deu exatamente 1,50D — abaixo do limiar `> 1.50`. O CID provisório ficou na ficha. Ver [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md).

**5. Captura descartada por S.E. incoerente (decisão em aberto).** Às 12:57 a 1ª captura morreu com `_captureFailed` (S.E. lido -0.25 vs S+C/2 -0.88) mesmo com as 3 medições unânimes em S e C; a 2ª leu os mesmos valores e passou. O comentário em `gemini-exam-agent.js` rejeita de propósito recalcular o S.E. ("o modelo às vezes alucina o S.E. junto") — e a própria sessão dá razão a ele (às 11:38 o verify devolveu S.E. "0.50" quando o correto era 0.00). Fica como custo de uma recaptura, não como bug.

---

Related: [cid-dedup-fronteira-de-paciente](cid-dedup-fronteira-de-paciente.md) · [cid-busca-exige-secao-visivel](cid-busca-exige-secao-visivel.md) · [log-2026-07-28-pendencias](log-2026-07-28-pendencias.md) · [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md) · [presbiopia-veto-pseudofacia](presbiopia-veto-pseudofacia.md)

Up: [Memórias](INDEX.md)
