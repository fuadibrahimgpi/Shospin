---
title: "froala-model-desync-saving"
description: "Por que Atendimento/Conduta não salvavam e o fix da ponte Froala (mundo principal)"
date: 2026-06-26
tags: [memoria, project]
aliases: ["froala-model-desync-saving"]
---

# froala-model-desync-saving

> Por que Atendimento/Conduta não salvavam e o fix da ponte Froala (mundo principal)

Sintoma recorrente: áudio captura e injeta certo, mas Atendimento e Conduta (e às vezes Biomicroscopia) não eram salvos no fim da consulta; Fundoscopia quase nunca falhava.

Causa raiz diagnosticada (2026-06-26): a falha correlaciona com a ORDEM de injeção — o último campo Froala injetado sobrevive, os primeiros somem. `setFroalaValue` escrevia só `element.innerHTML` (DOM visível), NÃO o MODELO interno do Froala. Ao trocar de aba, o SHOSP re-renderiza o editor a partir do modelo (vazio para campos injetados) e descarta o texto. Edições manuais do médico sobrevivem porque atualizam o modelo — daí a injeção falhar onde o médico não falharia.

Fix aplicado (v5.1.3, ADITIVO + auto-verificável):
- `src/froala-bridge.js`: content script `world: "MAIN"` (registrado no manifest + injetado pelo background em nav SPA). Atualiza o modelo via API oficial: `instance.html.set()` + `undo.saveStep()` + `events.trigger('contentChanged')`. Comunicação por `window.postMessage`.
- `src/content.js`: `setFroalaValueSynced()` chama a ponte após a escrita no DOM; `pingBridge()` detecta ausência (fallback só-DOM sem latência); verificação final lê o modelo de volta e avisa se ficar vazio.

CAUSA RAIZ REAL CONFIRMADA via captura de rede (kapture, 2026-06-26). O ponte Froala/model-desync estava ERRADO (a ponte nem achava as instâncias — `FroalaEditor.INSTANCES`/jQuery não casavam; fix ficou inerte). O save é um autosave que faz POST do formulário inteiro para `prontuario/prontuarioProntuarioCadastroRepositorio.php?acao=cadastraProntuarioServico&prkServicoPrestado=<id>&tipo=3` ("Rascunho salvo as HH:MM"). DOIS mecanismos de campo Froala:
- `textoProntuario<tabNum>` (ex.: Fundoscopia 78727, Receitas 78735): SHOSP lê o conteúdo do editor no submit → injeção no `.fr-element` JÁ funciona. Por isso fundoscopia salva.
- `<textarea>` oculto `prontuario_resp_<servico>_<campo>` (Atendimento 78073, Retorno 80697, Conduta 89707): o Froala só sincroniza esse textarea na digitação REAL. A injeção escreve no `.fr-element` visível mas deixa o textarea VAZIO → POST manda vazio → não salva. Prova: no POST capturado, o `.fr-element` do Retorno tinha texto e `prontuario_resp_80697_271414` foi enviado vazio.

FIX REAL (v5.1.4, DOM-only, sem ponte): em `setFroalaValue` (src/content.js), após escrever no `.fr-element`, localizar o `<textarea class="editorFroala" id^="prontuario_resp_">` irmão (dentro do mesmo `.botaoTextoPadrao` / `.fr-box`.nextElementSibling) e gravar o mesmo HTML via native setter + input/change. Campos `textoProntuario<num>` não têm esse textarea → no-op (seguros). Verificação final deve ler o `.value` do textarea (fonte real do save), não o modelo. A ponte Froala (froala-bridge.js) ficou obsoleta.

Relacionado: [project_nested_duplicate](project_nested_duplicate.md) (editar só scripts da raiz).

---

Related: [project_nested_duplicate](project_nested_duplicate.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fundoscopia (skill)](../skills/fundoscopia-oftalmologia.md) · [Conduta e tratamento (skill)](../skills/conduta-tratamento-oftalmologia.md)

Up: [Memórias](INDEX.md)
