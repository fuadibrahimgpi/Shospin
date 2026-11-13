---
title: "nested-duplicate-folder"
description: "A pasta aninhada shosp-extension-v5.1.0/ é uma cópia stale — editar apenas os scripts da raiz"
date: 2026-05-28
tags: [memoria, project]
aliases: ["project_nested_duplicate"]
---

# nested-duplicate-folder

> A pasta aninhada shosp-extension-v5.1.0/ é uma cópia stale — editar apenas os scripts da raiz

A extensão ativa é a da **raiz** do projeto (`manifest.json` + `sidepanel.html` na raiz carregam `scripts/...`). Existe uma pasta aninhada `shosp-extension-v5.1.0/` que é uma cópia completa duplicada (manifest, sidepanel e scripts próprios), porém **desatualizada/corrompida** (ex: comentário com `\` em vez de `//` em `sidepanel-injection.js`).

**Why:** Confirmado em 2026-05-28 ao implementar o fallback de despedida no `injectAll`. O usuário decidiu deixar a pasta aninhada como está (backup/stale), não sincronizar.

**How to apply:** Ao editar código da extensão, alterar apenas os arquivos da raiz. Não sincronizar mudanças para `shosp-extension-v5.1.0/` a menos que o usuário peça explicitamente.

---

Related: [froala-model-desync-saving](froala-model-desync-saving.md) · [gemini-service-modularizado](gemini-service-modularizado.md) · [reestruturacao-fases](reestruturacao-fases.md)

Up: [Memórias](INDEX.md)
