# Shosp Oftalmologia — Transcrição

Extensão do Chrome (Manifest V3) que preenche o prontuário oftalmológico no SHOSP a partir da consulta falada, da foto do ticket do autorrefrator TOPCON e do exame de OCT. A leitura é feita pelo Gemini; o que ele devolve passa por verificações escritas em código antes de chegar ao prontuário.

É JavaScript puro, sem etapa de build: o Chrome carrega os arquivos como estão.

## Instalar

1. Abra `chrome://extensions` e ligue o "Modo do desenvolvedor".
2. Clique em "Carregar sem compactação" e escolha a pasta deste repositório.
3. Abra as opções da extensão e cole a chave da API do Gemini (`config.html`).
4. Depois de qualquer alteração no código, clique em "Recarregar" na extensão e dê F5 na aba do SHOSP.

## Usar

O ícone da extensão abre o painel numa janela própria. O painel tem três modos:

| Modo | O que faz |
|---|---|
| Áudio | grava a consulta, transcreve e injeta anamnese, diagnóstico (CID), conduta, tratamento e exames |
| Câmera | fotografa o ticket TOPCON e injeta refração, tonometria e paquimetria |
| OCT | recebe imagem ou PDF do OCT de glaucoma e injeta o laudo no campo OCT da aba Glaucoma |

Atalhos de teclado:

| Atalho | Ação |
|---|---|
| Ctrl+Shift+M | iniciar ou parar a gravação |
| Ctrl+Shift+C | abrir a câmera ou capturar |
| Ctrl+Shift+V | injetar tudo |

Durante a gravação, frases do médico disparam ações sem clique: encerrar a consulta, pausar para dilatação, injetar exames normais, registrar catarata, lente intraocular, opacidade de cápsula. As frases estão em `config/clinical-triggers.js`.

## Como funciona

```
voz ──► gatilhos de voz ──► Gemini (entrevista) ──► DecisionEngine ──► injeção no SHOSP ──► recheck
foto do ticket ──► Gemini (OCR, com 2ª leitura e desempates) ──► bloqueio por olho ──► injeção
OCT ──► Gemini (laudo) ──► alertas ──► injeção no campo OCT
```

| Peça | Arquivo | Papel |
|---|---|---|
| Painel | `sidepanel.html`, `scripts/` | captura de voz e câmera, exibição, comando da injeção |
| Gatilhos de voz | `config/clinical-triggers.js`, `scripts/sidepanel-hooks.js`, `scripts/sidepanel-hook-runner.js` | reconhecem as frases do médico |
| Agente de entrevista | `src/gemini-interview-agent.js` | prompt da consulta e saneamento da resposta |
| Agente de exames | `src/gemini-exam-agent.js` | OCR do ticket, verificação e bloqueio por olho |
| Agente de OCT | `src/gemini-oct-agent.js` | laudo de OCT para glaucoma |
| DecisionEngine | `src/DecisionEngine.js` | guards: tiram da resposta o que a fala não sustenta |
| Léxico de medicamentos | `config/medicamentos-lexico.js` | princípio ativo, marcas e variantes de reconhecimento de voz |
| Recheck | `src/agents/recheck-agent.js` | compara o que foi enviado com o que ficou no prontuário |
| Content script | `src/content.js` | escreve nos campos do SHOSP e lança os CIDs |
| Background | `src/background.js` | abre o painel (um só) e repassa os atalhos |
| Fila de dilatação | `scripts/dilatacao-pausas.js` | guarda a consulta de quem está dilatando |
| Chamada ao Gemini | `src/ApiService.js` | repetição com espera crescente, limite de 30 pedidos por minuto e 200 por hora |
| Configuração do Gemini | `config/gemini.js` | modelo, endereço e chave num lugar só; a chave vai no cabeçalho e fica só neste navegador |

Três princípios seguram a segurança clínica:

- **Nada entra no prontuário sem lastro na fala.** Os guards só removem ou rebaixam; não inventam.
- **O verificador não falha aberto.** Se um guard quebra, ou a resposta vem em formato inesperado, o painel mostra os campos e não injeta sozinho.
- **O código é a autoridade.** As skills em `skills/user/` documentam as regras; quem manda é o prompt, os guards e os arquivos de `config/`. Ver `skills/user/README.md`.

O agente em `src/agents/medicamentos-agent.js` está estacionado: fica no repositório com seus testes, mas o painel não o carrega.

## Pastas

| Pasta | Conteúdo |
|---|---|
| `src/` | agentes, DecisionEngine, content script, background |
| `scripts/` | scripts do painel e das páginas de configuração e permissão |
| `config/` | gatilhos de voz, léxico de medicamentos, registro das mensagens, configuração do Gemini |
| `utils/` | testes |
| `scripts-dev/` | executores de `npm test` e `npm run check` |
| `skills/user/` | skills que documentam as regras clínicas |
| `vault/` | cofre do Obsidian: mapa do projeto, memórias e histórico |

As mensagens entre painel, aba do SHOSP, background e páginas de permissão estão registradas em `config/messages.js`.

## Testar

Requer Node 18 ou mais novo. Não há dependências a instalar.

```bash
npm run check
```

```bash
npm test
```

`npm run check` confere a sintaxe de todos os arquivos. `npm test` roda cinco suítes: integração, gatilhos de voz, agentes, readback e OCT.

Os testes rodam fora do Chrome, com navegador simulado. Eles não substituem a conferência na plataforma real: comportamento de tela, permissões e campos do SHOSP só se confirmam com a extensão recarregada e um prontuário aberto.

## Versão

A versão da extensão é a do `manifest.json` (hoje 5.1.5). Números como v5.4.x e v5.5.0 que aparecem em comentários são marcos internos do OCR, não versões da extensão. O histórico de correções está em `CHANGELOG-v5.1.md` e em `vault/historico/`.

## Para quem vai mexer no código

Leia `CLAUDE.md` antes: ele reúne as regras de trabalho deste repositório e as armadilhas já conhecidas.
