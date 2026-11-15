# Shosp Oftalmologia — Extensão Chrome (v5.1.4)

Extensão Chrome (Manifest V3, JavaScript puro, sem build) que automatiza o prontuário oftalmológico no SHOSP:

- **Transcrição da consulta por voz** e preenchimento dos campos do prontuário via Gemini.
- **OCR de ticket TOPCON** (refração) via câmera.
- **Gatilhos de voz** (dilatação, encerramento, CID, etc.) em `config/clinical-triggers.js`.

## Instalação
1. `chrome://extensions` → ativar *Modo do desenvolvedor* → *Carregar sem compactação* → escolher esta pasta.
2. Abrir as **Opções** da extensão e salvar a chave do Gemini (aistudio.google.com/apikey).
3. Após atualizar o código, clicar em *Recarregar* na extensão e recarregar a aba do SHOSP.

## Estrutura
| Pasta | Conteúdo |
|---|---|
| `src/` | service worker (`background.js`), content script, cliente Gemini (`ApiService.js`, `gemini-config.js`), agentes de entrevista e exame, `Logger.js` |
| `scripts/` | lógica do painel lateral (áudio, câmera, injeção, hooks, estado) |
| `config/` | gatilhos clínicos |
| `skills/user/` | prompts/regras clínicas (OCR, CID, conduta, transcrição) |
| `utils/` | testes de integração e de hooks |
| `scripts-dev/` | `check.js` (sintaxe) e `test.js` (roda todos os testes) |

## Desenvolvimento
```bash
npm run check   # sintaxe de todos os .js
npm test        # integração + hooks
```

## Segurança e privacidade
- A chave do Gemini fica em `chrome.storage.local` (não sincroniza com a conta Google) e é enviada no cabeçalho `x-goog-api-key`, nunca na URL.
- Logs de depuração ficam desligados por padrão (`Logger.enableDebug(true)` para ativar) para não expor dados de paciente no console.
- Modelo e endpoints do Gemini ficam em `src/gemini-config.js`.

Histórico de mudanças: `CHANGELOG-v5.1.md`. Revisão e plano de evolução: `PLANO-REVISAO-FABLE.md`.
