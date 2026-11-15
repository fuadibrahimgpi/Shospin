# Revisão do projeto Shospin (v5.1.4) e plano de reescrita

Data: 2026-11-15. Revisão do projeto inteiro (extensão Chrome MV3, cerca de 18 mil linhas).

## 1. Estado atual

- `npm run check`: 22/22 arquivos sem erro de sintaxe.
- `npm test`: 152/152 testes passaram. Os testes de integração e de hooks também passaram.
- Não encontrei bugs que quebrem o funcionamento. Os pontos abaixo são riscos e dívidas.

## 2. Achados (por prioridade)

### Alta
1. **Chave da API Gemini em `chrome.storage.sync`** (`src/ApiService.js:170,182`, `scripts/config.js:14,29`). O `sync` replica a chave para a conta Google. Deve ir para `chrome.storage.local`.
2. **Chave na URL** (`?key=` em `src/ApiService.js:246` e `scripts/config.js:50`). A chave pode vazar em logs e erros. Deve ir no cabeçalho `x-goog-api-key`.
3. **Dados de paciente em logs.** São 66 `console.log` em `src/` e `scripts/`. É preciso garantir que nenhum registre nome, transcrição ou exame. O `Logger` já existe, então todos devem passar por ele com o modo debug desligado por padrão.
4. **`innerHTML` com texto variável** (`scripts/sidepanel-injection.js:166,209,926`). O texto vem da fala ou da IA (termo do CID, mensagens). Trocar por `textContent`.

### Média
5. **Permissões amplas no `manifest.json`.** O `tabs` e o `*.shosp.com.br/*` duplicam o `sistema.shosp.com.br`. Rever se o `tabs` é realmente necessário.
6. **`ApiService.js` é carregado só pelo `sidepanel.html`.** Existe uma segunda via de chamada ao Gemini (`geminiService.js`, agentes e `config.js`). Há duas implementações de chamada, com endpoint e modelo (`gemini-2.5-flash`) repetidos em 3 lugares. Unificar em um único cliente com modelo configurável.
7. **Arquivos grandes demais:** `content.js` (1601 linhas), `gemini-exam-agent.js` (1332), `sidepanel-audio.js` (1024), `sidepanel-injection.js` (997), `clinical-triggers.js` (949). Dividir por responsabilidade.
8. **Estado global.** `sidepanel-constants.js` ainda concentra variáveis globais. O `state-manager.js` existe, mas a migração está incompleta.
9. **Prompts clínicos dentro de código JS** (`gemini-interview-agent.js` com 940 linhas). Mover para arquivos próprios, versionados e testáveis.

### Baixa
10. **`README.md` desatualizado.** Diz "Refatoração TypeScript" e cita `src/core/StateManager`, que não existe. O código é JavaScript puro.
11. **Versão repetida à mão** em `manifest.json`, `package.json` e comentários. Gerar a partir de uma única fonte.
12. **Sem lint nem formatador.** Adicionar ESLint e Prettier no `npm run check`.
13. **`setTimeout` espalhados** (37 usos em injeção e content). Trocar esperas fixas por espera de condição (elemento presente).

## 3. Plano de reescrita (executar pelo Fable, em etapas pequenas)

Regra geral: cada etapa em um commit próprio, com `npm run check` e `npm test` verdes antes de seguir. Não mudar a lógica clínica (gatilhos, regras de OCR, prompts) sem teste de regressão.

| Etapa | O que fazer | Risco |
|---|---|---|
| 1. Segurança | Chave para `storage.local`, cabeçalho `x-goog-api-key`, migração automática da chave antiga, `textContent` no lugar de `innerHTML`, logs só via `Logger` | Baixo |
| 2. Cliente Gemini único | Um módulo para todas as chamadas, modelo e endpoint em um só lugar, retry e timeout | Médio |
| 3. Permissões | Reduzir o `manifest.json` ao mínimo e testar no SHOSP real | Médio |
| 4. Estado | Terminar a migração para o `state-manager` e remover globais | Médio |
| 5. Divisão de arquivos | Quebrar `content.js`, `gemini-exam-agent.js`, `sidepanel-audio.js`, `sidepanel-injection.js` | Alto: exige os testes atuais como rede de segurança |
| 6. Prompts | Extrair para arquivos separados, com teste de que o texto final não mudou | Médio |
| 7. Esperas | Trocar `setTimeout` fixos por espera por elemento | Alto: afeta o salvamento no SHOSP |
| 8. Qualidade | ESLint, Prettier, versão única, README e CHANGELOG atualizados | Baixo |

Ordem recomendada: 1, 8, 2, 3, 4, 6, 5, 7. As etapas 5 e 7 por último, porque são as que mais podem quebrar a injeção no prontuário.

## 4. Pendências já conhecidas do histórico

- Lubrificante em retorno (pendente numa sessão anterior).
- Recarregar a extensão no Chrome depois de cada atualização.

## 5. Antes de começar a reescrita

- Testar no SHOSP real após as etapas 3, 5 e 7. Os testes automáticos não cobrem o site de verdade.
- Manter a branch `perf/paralelizar-injecao` sincronizada, para não perder alterações.

## 6. Andamento da reescrita

**Feito (testes 152/152 e sintaxe OK):**
- Etapa 1 (segurança): chave em `storage.local` com migração automática da chave antiga, cabeçalho `x-goog-api-key`, `innerHTML` trocado por `textContent`, banner da câmera com texto escapado, logs de depuração desligados por padrão.
- Etapa 2 (parcial): modelo e endpoints do Gemini centralizados em `src/gemini-config.js`.
- Etapa 3 (parcial): removida a permissão de host duplicada. A permissão `tabs` foi mantida porque o código lê a URL das abas.
- Etapa 8 (parcial): README reescrito.

**Não feito (precisa de teste no SHOSP real, por isso ficou para depois):**
- Dividir arquivos grandes, trocar esperas fixas (`setTimeout`), terminar a migração do estado, extrair prompts, ESLint/Prettier e versão única.

**Etapa 8 concluída (qualidade):** ESLint configurado (`npm run lint`: 0 erros, 135 avisos de variáveis não usadas), conferência de versão entre `manifest.json` e `package.json` no `npm run check`. Prettier não foi adotado porque reformataria todos os arquivos de uma vez e esconderia mudanças reais.

**Etapa 4 (estado), parcial e segura:** todas as escritas diretas nas 13 flags de gatilho em `sidepanel-audio.js` e `sidepanel-injection.js` agora passam por `StateManager.setHookFlag` (os hooks já escreviam via `HOOK_STATE`). O `StateManager` é o único ponto de escrita dessas flags. Variáveis de gravação/câmera/Speech (cerca de 400 usos, ligadas a timers e streams) ficaram como estão: migrá-las exige teste real de microfone e câmera.

**Etapa 6 (prompts) concluída:** os prompts saíram do código dos agentes para `src/prompts/consultation-prompt.js` (consulta + base de medicamentos) e `src/prompts/exam-prompts.js` (4 prompts de OCR). Conferi que o texto gerado é byte a byte idêntico ao anterior (6 variações da consulta e os 4 prompts de OCR). `gemini-interview-agent.js` caiu de 940 para 267 linhas e `gemini-exam-agent.js` de 1332 para 1012.
