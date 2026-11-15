---
title: "log-2026-07-29-exame-normal-vs-diagnostico"
description: "Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou \"AO olho calmo\"); rede de segurança criada"
date: 2026-07-29
tags: [memoria, project]
aliases: ["log-2026-07-29-exame-normal-vs-diagnostico"]
---

# log-2026-07-29-exame-normal-vs-diagnostico

> Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou "AO olho calmo"); rede de segurança criada

Log 2026-07-29: consulta de retorno com `H111 - Pterígio OD` no diagnóstico saiu com `dados.biomicroscopia: null`, e o **fallback de despedida** do `injectAll` injetou `AO: olho calmo, córnea transparente...` — o prontuário afirmou exame normal logo abaixo do diagnóstico de pterígio. **Pior que campo vazio: é um exame normal falso afirmado.**

Causa dupla: (1) o Gemini atribuiu o pterígio à fala do paciente e aplicou a regra de fonte (2026-06-18), deixando o campo null — mas aceitou o mesmo achado como `diagnostico`, saída internamente inconsistente; (2) o fallback só era barrado por `_temTratamentoAtivo` (tratamento OU encaminhamento) e a consulta tinha só receita de óculos.

Correção: regra de consistência diagnóstico↔exame no prompt (**sem tocar** na regra de fonte, que é load-bearing) + predicados determinísticos `temAchadoAnteriorNoDiagnostico()` / `temAchadoPosteriorNoDiagnostico()` em `scripts/sidepanel-constants.js`, aplicados a TODOS os defaults do bloco pós-análise (eram 4 pontos de `BIOMICROSCOPIA_NORMAL`, não 1). Casam por TERMO **e** faixa de CID — o modelo emitiu H111 para pterígio (CID-10 real é H11.0), então o termo não pode depender do código certo.

**Política confirmada: campo VAZIO > texto fabricado.** A rede suprime o template normal; NÃO compõe "OD: pterígio; OE: olho calmo" — compor inventaria detalhe ("nasal", "grau I") que o médico não ditou. Mesma política do `_guardExamesNormaisFase2`.

Exceção deliberada: `injectExamesNormaisDirect`/`injectBlefariteDirect` (gatilho de voz ao vivo) seguem usando o template — disparam antes de existir diagnóstico. O branch de correção pós-análise é quem conserta se a análise contradisser; ele passou a cobrir **biomicroscopia** também (antes só `dados.fundoscopia` entrava, então "exames normais" cedo + pterígio depois deixava o falso normal no prontuário — mais provável que o caminho da despedida). Ver [skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md).

Armadilha evitada no filtro de "resolvido": ele é **estreito de propósito** (só `resolvid[ao]`). "cicatrizado"/"prévio" descrevem achados ATIVOS ("Leucoma aderente (cicatrizado)" — leucoma É cicatriz); filtrar essas linhas desarmaria o guard no caso que ele existe para pegar.

⚠️ PENDENTE de verificação pelo usuário: conferir o prontuário desse paciente (pterígio OD) — o "AO: olho calmo" provavelmente está gravado lá e precisa ser corrigido à mão.

---

Related: [skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Agente de medicamentos](../agentes/medicamentos-agent.md) · [achado-episodico-nao-e-diagnostico](achado-episodico-nao-e-diagnostico.md) · [blefarite-texto-nao-e-rotina](blefarite-texto-nao-e-rotina.md) · [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md)

Up: [Memórias](INDEX.md)
