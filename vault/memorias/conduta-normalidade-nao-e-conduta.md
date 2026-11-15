---
title: "conduta-normalidade-nao-e-conduta"
description: "Explicado exames normais\" e afins não entram na conduta — nem como cláusula dentro de linha \"Explicado ...\" agrupada"
date: 2026-08-13
tags: [memoria, feedback]
aliases: ["conduta-normalidade-nao-e-conduta"]
---

# conduta-normalidade-nao-e-conduta

> Explicado exames normais" e afins não entram na conduta — nem como cláusula dentro de linha "Explicado ..." agrupada

Afirmação de normalidade ou tranquilização ("Explicado exames normais", "pressão boa",
"fundo de olho normal", "sem alterações") NÃO entra na conduta. Coisas óbvias não fazem
sentido de estar na conduta. Vale para UM exame isolado também — "Explicado que a pressão
ocular está normal" sai igual (o médico reforçou isso na 2ª rodada, mesma data).

**Why:** o resultado normal já é documentado na biomicroscopia/fundoscopia ou pelo template
de exames normais — repeti-lo na conduta é ruído. Consulta de 2026-08-13 12:06: o médico
fechou com "os outros exames estão todos tranquilos, pressão boa, fundo de olho normal" e
a normalidade entrou de carona na linha agrupada `Explicado blefarite, olho seco e exames
normais`.

**How to apply:** a regra é de PROMPT (`src/gemini-interview-agent.js`, ★ "NORMALIDADE NÃO
VAI PARA A CONDUTA" + passo 0 do teste obrigatório), nunca um strip determinístico por
substring — ver [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) e [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md).
Proibir a linha literal não basta: a regra de agrupamento faz a normalidade virar cláusula
no meio da linha, e é preciso descartar só a cláusula. Escopo é **normalidade**, não
"obviedade" em geral. Normalidade dentro de explicação de achado real continua ("pressão
alta e campo visual ainda normal"). `injectExamesNormais` e
[log-2026-07-29-gatilho-dilatacao](log-2026-07-29-gatilho-dilatacao.md)-style gatilhos de voz ficam intactos. Testes
`[COND-NORM-1..3]`.

---

Related: [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md) · [log-2026-07-29-gatilho-dilatacao](log-2026-07-29-gatilho-dilatacao.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fundoscopia (skill)](../skills/fundoscopia-oftalmologia.md) · [Hooks de voz (VoiceHookAgent)](../agentes/voice-hooks.md) · [exame-nomeado-por-deducao](exame-nomeado-por-deducao.md)

Up: [Memórias](INDEX.md)
