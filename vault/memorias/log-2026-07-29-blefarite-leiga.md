---
title: "log-2026-07-29-blefarite-leiga"
description: "Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco"
date: 2026-07-29
tags: [memoria, project]
aliases: ["log-2026-07-29-blefarite-leiga"]
---

# log-2026-07-29-blefarite-leiga

> Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco

Log 2026-07-29 (2º log do dia): consulta INTEIRA de blefarite gravou no prontuário só `H522 - Astigmatismo OD`. Biomicroscopia em branco, sem H01.0.

Cadeia: o Gemini devolveu `injectBlefarite: true` + `biomicroscopia: null` (correto — o texto viria do TEMPLATE). O `_guardBlefariteLiteral` exigia a palavra literal e derrubou a flag. **Reverter a flag sem tocar em `biomicroscopia` cria um estado que o contrato do prompt não prevê: sem template E sem texto → campo silenciosamente vazio.** Esse é o defeito durável — independe da lista de gatilhos.

**Por que o guard errou: o médico não diz "blefarite" ao paciente.** Ele descreve em linguagem leiga — "os cílios", "as glândulas que produzem a parte lipídica, o óleo da pálpebra", "sua pele é muito oleosa", "bastante pontinho de inflamação", "volta só para higiene". Nenhum casa com regex literal. Vale para outros guards que dependem de vocabulário técnico na transcrição: **a transcrição é fala médico→paciente, não laudo.**

Correções (v5.3.7, tudo em `refactor/estrutura-fase-0-1`):
- `_guardBlefariteLiteral` ganhou critério **(e)** — conjunção `estrutura palpebral` (palpebr|cilio|meibom) **E** `sinal de blefarite` (inflama|oleos|glandul|higiene|secre|caspa|crosta|descama|vermelhid). Exige as duas pontas; "pálpebra" sozinha não passa. Critério (c) afrouxado: `compressa` + (higiene|palpebr|cilio), não mais a adjacência "higiene palpebral".
- `_avisoBiomicroscopiaOrfa()` em `buildDecision`, **depois** de `_reconcileInjectFlags` — ponto único que cobre TODOS os caminhos que derrubam a flag. Emite `decision.avisos[]` → banner âmbar persistente (`_showClinicalWarnings` em `sidepanel-audio.js`). Não fabrica achado, coerente com [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md) (campo VAZIO > texto fabricado). Exceções sem aviso: dilatação (exame é da fase 2) e hook de voz que já injetou template ao vivo.

**Armadilha do banner (quase entrou):** remover o `clinicalWarningBanner` no bloco `clearAudio` do `clearAll` parece o lugar óbvio, mas esse `clearAll` é o AUTOMÁTICO do `injectAll` — roda ~1,5 s depois da análise e apagaria o aviso antes de o médico ler. Avisos só podem morrer na fronteira de PACIENTE: limpeza manual (`options.discardDilatacao === true`) e `startRecording()`. Vale para qualquer banner persistente futuro.

Bug irmão no mesmo log — **CID relançado**: `handleSearchCid` consome o `diagnosticoField` termo a termo (`field.value = terms.slice(1)`); ao fim da cadeia o campo está VAZIO. A passada seguinte (OCR) montava a base de deduplicação a partir dele e relançou H52.2 no SHOSP. Corrigido com `_cidsLancadosNaSessao` (Set de chaves canônicas via novo `_cidKey`), zerado em `resetSession` e na limpeza manual. **Tradeoff deliberado:** zerar em `resetSession` pode deixar passar uma duplicata na ordem câmera→gravação, mas duplicata é visível e recuperável — dedup falso-positivo omitiria um CID legítimo em silêncio. Mesma classe do H52.9 de [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md).

⚠️ PENDENTE do usuário: (1) expandir `[DecisionEngine] Guards aplicados: Array(2)` no console — se a 2ª msg NÃO for "Blefarite removida do diagnóstico", o LLM está soltando H010 só no raciocínio e nunca no campo `diagnostico`, o que é problema de PROMPT e nenhuma mudança de guard resolve; (2) conferir o ticket TOPCON físico — OCR deu OD `+3.25 -2.75 x75` mas o médico disse "meio grau de astigmatismo só no direito" e "ganho muito discreto"; o `H52.3 Anisometropia` injetado deriva dessa leitura.

---

Related: [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md) · [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [OCR TOPCON (skill)](../skills/ocr-topcon-oftalmologia.md) · [achado-episodico-nao-e-diagnostico](achado-episodico-nao-e-diagnostico.md) · [blefarite-texto-nao-e-rotina](blefarite-texto-nao-e-rotina.md) · [conduta-normalidade-nao-e-conduta](conduta-normalidade-nao-e-conduta.md) · [fundoscopia-descritiva-nao-interpretativa](fundoscopia-descritiva-nao-interpretativa.md) · [lente-contato-e-antecedente](lente-contato-e-antecedente.md) · [log-2026-08-05-multifocal-e-fundoscopia](log-2026-08-05-multifocal-e-fundoscopia.md) · [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md) · [log-2026-09-15-tobramicina-sem-colirio](log-2026-09-15-tobramicina-sem-colirio.md) · [opacidade-capsula-linguagem-leiga](opacidade-capsula-linguagem-leiga.md)

Up: [Memórias](INDEX.md)
