---
title: "Páginas de permissão"
description: "Páginas que liberam microfone e câmera quando o navegador nega; avisam o painel ao conceder."
date: 2026-11-10
tags: [modulo, projeto-shosp]
aliases: ["permission-page"]
---

# Páginas de permissão

**Módulo** · arquivo-fonte: `scripts/permission-page.js` · páginas: `permission.html` (microfone) e `camera-permission.html` (câmera)

O painel abre estas páginas quando o navegador nega o dispositivo, por exemplo em instalação nova ou permissão revogada. A permissão vale para a extensão inteira, então concedê-la aqui libera o painel.

O núcleo comum pede a permissão, mostra o resultado em linguagem simples (liberado, negado com o caminho para permitir, sem dispositivo, em uso por outro programa), avisa o painel e fecha a aba. `scripts/permission.js` e `scripts/camera-permission.js` são uma chamada cada.

Diferenças entre as duas:

- **Microfone:** o dispositivo é solto na hora.
- **Câmera:** mostra uma prévia; a câmera apaga ao fechar a página ou quando a janela perde o foco.

## Decisões que não são óbvias

- **Ao receber a liberação da câmera, o painel não abre a câmera sozinho.** A prévia ainda está ligada, e duas aberturas ao mesmo tempo podem deixar a captura do painel na resolução baixa da prévia, que o OCR do ticket não aguenta. É precaução, não foi medido.
- **A abertura automática da câmera leva à página uma vez por sessão do painel.** O clique em "Iniciar Câmera" leva sempre. Página já aberta é trazida para frente, não duplicada.

## Histórico

Até 2026-11-10 os dois HTML apontavam para scripts que nunca existiram: o botão "Liberar" não fazia nada e o painel esperava para sempre. A página da câmera, além disso, não era aberta por nada. O teste `[PERM-1]` agora falha se qualquer HTML da extensão apontar para arquivo inexistente.

Nada disto foi conferido no Chrome real.

---

Related: [Mensagens entre as peças](mensagens.md) · [Análise de estrutura 2026-11-10](../analise-estrutura-2026-11-10.md)

Up: [Módulos](INDEX.md)
