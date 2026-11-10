---
title: Módulos
date: 2026-11-10
tags: [indice, modulos]
---

# Módulos

Módulos de apoio: gatilhos, léxico, content script, background, mensagens, páginas de permissão, fila de dilatação, estado.

Up: [Cofre](../INDEX.md)

- [Background (service worker)](background.md): Abre o painel, garante que exista um só, repassa atalhos e reinjeta o content script.
- [Mensagens entre as peças](mensagens.md): Registro único de quem fala com quem, formato de resposta e limite de tempo do transporte.
- [Páginas de permissão](paginas-permissao.md): Liberam microfone e câmera quando o navegador nega; avisam o painel.
- [Content script (injeção no SHOSP)](content-script.md): Injeta dados nos campos do prontuário; trata Froala, CID e abas.
- [Fila de dilatação (sala de espera)](dilatacao-pausas.md): Fila persistida de pausas multi-paciente para dilatação em chrome.storage.local.
- [Gatilhos clínicos](clinical-triggers.md): Fonte autoritativa dos comandos de voz (STOP, DILATACAO, EXAMES_NORMAIS…) e de normalizeText().
- [Léxico de medicamentos](medicamentos-lexico.md): Léxico de oftalmo-medicamentos com variantes de ASR, usado pelos guards do DecisionEngine e pelo auto-feedback.
- [StateManager e SessionFlags](state-manager.md): Fachada de escrita das flags de sessão (SessionFlags).
