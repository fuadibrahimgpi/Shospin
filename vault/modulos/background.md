---
title: "Background (service worker)"
description: "Abre o painel, garante que exista um só, repassa os atalhos de teclado e reinjeta o content script nas navegações do SHOSP."
date: 2026-11-10
tags: [modulo, projeto-shosp]
aliases: ["background"]
---

# Background (service worker)

**Módulo** · arquivo-fonte: `src/background.js`

Três tarefas:

1. **Abrir o painel**, numa janela própria, ao clicar no ícone.
2. **Repassar os atalhos de teclado** ao painel (gravar, capturar, injetar). Se o painel estiver fechado, abre e espera o sinal `panelReady` antes de enviar.
3. **Reinjetar o [Content script](content-script.md)** quando o SHOSP troca de rota. O SHOSP é uma página única: a navegação muda a URL sem recarregar.

## O worker dorme

O Chrome encerra o service worker depois de alguns segundos ocioso, e toda variável volta ao valor inicial. Até 2026-11-10 o background guardava a janela do painel só numa variável e lia "variável nula" como "painel fechado": um clique ou atalho abria um segundo painel, e os dois recebiam o comando de gravar.

Agora a variável é só cache. `_findPanelWindowId` confere o cache e, se ele não servir, procura a aba do painel entre as abas abertas antes de criar outra. A criação passa por um ponto único (`_createPanelWindow`), com trava contra dois cliques seguidos.

Regra que fica: nada que precise sobreviver ao sono do worker pode morar numa variável dele.

Testes `[PAINEL-1]` a `[PAINEL-6]` em `utils/integration-test.js`. O defeito foi achado por leitura do código e nunca reproduzido ao vivo.

---

Related: [Mensagens entre as peças](mensagens.md) · [Análise de estrutura 2026-11-10](../analise-estrutura-2026-11-10.md)

Up: [Módulos](INDEX.md)
