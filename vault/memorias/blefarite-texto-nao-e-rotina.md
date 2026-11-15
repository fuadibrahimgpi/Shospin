---
title: "blefarite-texto-nao-e-rotina"
description: "O texto descritivo de blefarite na biomicroscopia só entra se a inflamação palpebral foi DESCRITA; tratamento (shampoo/compressa) não autoriza"
date: 2026-08-04
tags: [memoria, feedback]
aliases: ["blefarite-texto-nao-e-rotina"]
---

# blefarite-texto-nao-e-rotina

> O texto descritivo de blefarite na biomicroscopia só entra se a inflamação palpebral foi DESCRITA; tratamento (shampoo/compressa) não autoriza

O médico proibiu como rotina a frase "hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio com secreção espessa" — ela só vale "quando for descrito que tem uma inflamação na pálpebra".

**Why:** log 2026-08-04 — consulta de refração (troca de grau + presbiopia). O médico entregou "a receita do shampoo" e lubrificante e nunca falou da pálpebra no exame. O guard aceitava `shampoo` como evidência, `injectBlefarite` ficou de pé e o prontuário passou a AFIRMAR hiperemia, telangiectasias e secreção espessa em um exame que ninguém fez. **Tratamento não é exame** — a mesma classe de erro de [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md) (campo VAZIO > texto fabricado).

**How to apply:** a evidência de blefarite tem DOIS níveis em `_detectBlefariteEvidencia` (`src/DecisionEngine.js`):
- `qualquer` → mantém `injectBlefarite` (conduta + tratamento). Aceita manejo: shampoo, compressa+higiene, "glândulas de óleo da pálpebra".
- `exame` → única coisa que autoriza o TEXTO. Exige palavra-diagnóstico, descritor de bordo/margem, ou estrutura palpebral + SINAL observável (inflama/vermelh/irritad/crosta/caspa/descama/secre/espess/entupid…). `higiene`, `oleos` e `glandul` ficam FORA do nível de exame — são manejo/anatomia.

Viaja como `injectFlags.blefariteDescritaNoExame` → `workingData` (dois sites em `sidepanel-audio.js`) → `sidepanel-injection.js`, que suprime `BIOMICROSCOPIA_BLEFARITE`. Suprimido, o campo fica em branco e `_avisoBiomicroscopiaOrfa` emite aviso — sem isso volta o bug de [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) (biomicroscopia órfã silenciosa). A descrição leiga daquele log continua no nível de exame; é o teste que discrimina os dois níveis (`[BLEF-ROTINA-3]`).

O prompt (`gemini-interview-agent.js`) é a autoridade e também foi travado: os exemplos ensinavam a frase e o modelo podia escrevê-la direto em `dados.biomicroscopia`, contornando o gate.

**2ª decisão do mesmo dia (2026-08-04): "com secreção espessa" saiu do template.** O médico pediu para remover a frase da discussão de rotina da biomicroscopia. `BIOMICROSCOPIA_BLEFARITE` (`scripts/sidepanel-constants.js`) era o ÚNICO lugar do repo com esse sufixo — todos os exemplos do prompt e das skills já usavam a forma curta. Secreção espessa (meibum expressível) é achado à parte: no bloco padrão ela era afirmada em TODA blefarite injetada. O template agora termina em "disfunção de glândulas de meibômio;". Guard de regressão: `[BLEF-ROTINA-8]`. Nada nos guards de evidência nem nos gatilhos de voz mudou — falar "blefarite" durante a receita continua disparando `EXAME_BLEFARITE_COMMANDS` e injetando a forma curta ao vivo.

---

Related: [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md) · [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md) · [Biomicroscopia (skill)](../skills/biomicroscopia-oftalmologia.md) · [DecisionEngine (guards pós-LLM)](../agentes/decision-engine.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md) · [Agente de medicamentos](../agentes/medicamentos-agent.md) · [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md) · [log-2026-09-15-tobramicina-sem-colirio](log-2026-09-15-tobramicina-sem-colirio.md)

Up: [Memórias](INDEX.md)
