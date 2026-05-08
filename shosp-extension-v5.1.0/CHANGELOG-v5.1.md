# CHANGELOG — v5.1.0

Update conservador. Sem rewrite, sem build step novo, sem TypeScript, sem
mudanças em prompts médicos. Comportamento clínico de runtime preservado.

## Versionamento
- `manifest.json`: `version` 5.0.0 → **5.1.0**.
- Marcadores de versão alinhados em `dist/background.js` e `dist/content.js`.
- `package.json` criado com `version: 5.1.0` e scripts `test` / `check`.

## Limpeza
- Movido `scripts/sidepanel-hook-runner (1).js` (duplicata órfã não carregada
  por `sidepanel.html`) para `_archive/sidepanel-hook-runner.v4.2.archived.js`.
- Movido `dist/geminiInterviewAgent.js` (standalone leftover não carregado;
  o conteúdo já está consolidado em `dist/geminiService.js`) para
  `_archive/geminiInterviewAgent.standalone.archived.js`.
- Cabeçalho de `dist/geminiService.js` atualizado para refletir consolidação.
- Pasta `_archive/` documentada em `_archive/README.md`.

## Tooling e testes
- `package.json` com `npm run check` (syntax check via `node --check` em
  todo JS de `dist/`, `scripts/`, `utils/`, `scripts-dev/`) e `npm test`
  (roda `utils/integration-test.js` e `utils/hooks-test.js` em sequência).
- `scripts-dev/check.js` e `scripts-dev/test.js` adicionados (apenas Node
  built-ins, sem dependências externas).
- Corrigidas duas asserções frágeis de teste, **sem alterar comportamento clínico**:
  - `[C7]` (integration-test): o slice de delimitação procurava
    `'speechRecognition.start(); } catch'` e pegava acidentalmente o bloco do
    `onerror` (mesma string aparece antes), resultando em slice vazio. Agora
    delimita pelo início da próxima função (`function stopSpeechRecognition`).
  - `[DIL-4]` / `[DIL-5]` (hooks-test): esperavam cooldown > 0 no hook de
    dilatação, mas o hook usa `cooldown: 0` deliberadamente (guard contra
    duplo disparo é feito por `stopCommandTimeout`, não por janela temporal).
    Asserções atualizadas para refletir a decisão clínica intencional.

### Resultado dos testes
- `npm run check`: **18/18 arquivos OK**.
- `npm test`:
  - `integration`: **45/45 PASS** (era 33/34 antes).
  - `hooks`:       **23/23 PASS** (era 22/23 antes).

## Confiabilidade da injeção
- `dist/content.js: clickTab()` — substitui `setTimeout(800ms)` cego por
  *espera ativa* pelo container `divTextoProntuarioServico<num>` da aba,
  com teto em `TAB_LOAD_DELAY` (mantém piso histórico em caso de seletor
  não casar). Reduz latência em máquinas rápidas e dá margem em lentas.
- `dist/content.js: findFrElementsInTab()` — fallback "todos `.fr-box`
  visíveis ordenados por Y" agora é **opt-in** via
  `options.allowYPositionFallback`. Comportamento padrão: retornar lista
  vazia e logar erro explícito quando o container específico da aba não é
  encontrado. Os 5 call-sites internos não pedem o fallback, então **nunca
  mais escrevem em editor de outra aba por engano**. Logs de erro elevados
  permitem identificar regressões.
- `dist/content.js: injectAll()` agora retorna
  `{ success, fieldsInjected, warnings: string[] }`. Cada campo que falha
  silenciosamente (Froala não encontrado, conduta inalcançável, etc.) gera
  uma entrada em `warnings`.
- `scripts/sidepanel-injection.js` — exibe banner de aviso amarelo (8s) no
  popup quando `warnings.length > 0`. Não bloqueia o fluxo de sucesso, mas
  surfaceia para o médico ver no momento.

## DecisionEngine (novo, conservador)
- Novo módulo `dist/DecisionEngine.js` (~150 LoC, sem dependências externas).
- API `DecisionEngine.buildDecision(rawAIResponse, context)` retorna:
  - `clonedAIResponse` — cópia rasa com guards aplicados (entrada **NÃO**
    é mutada);
  - `injectFlags` — `{ injectExamesNormais, injectBlefarite, dilatacao }`
    já reconciliados com hooks de voz (mutual-exclusion aplicada);
  - `guardsApplied: string[]` — log auditável.
- Guards portados sem alteração semântica do que já existia em
  `dist/geminiService.js: analyzeConsultation()` e
  `scripts/sidepanel-audio.js: processAudioInBackground()`:
  1. Reverte `injectBlefarite` se `/blefarite|meibomite/` ausente da fala.
  2. Remove linha "Associação ATB+corticoide" se palavras-chave ausentes.
  3. Adiciona "Não houve prescrição de óculos" se a conduta não menciona.
- **Conservador**: `sidepanel-audio.js` chama o engine **observacionalmente**
  (apenas para logging) — o pipeline de mutação existente continua sendo a
  fonte da verdade. Migração completa para o caminho imutável fica para v6.
- 7 testes novos em `utils/integration-test.js` (`[DE-1]` a `[DE-7]`).

## StateBridge mínimo (`window.__shospState`)
- `scripts/sidepanel-constants.js` agora expõe `window.__shospState`
  (objeto frozen, somente getters) que reflete as 30+ variáveis globais
  existentes. Disponível em DevTools para inspeção; método `snapshot()`
  produz JSON serializável sem referências a timers/DOM.
- **Sem alteração das variáveis subjacentes** — refactor real para
  `StateManager` fica para v6.

## Itens deferidos (não feitos por opção conservadora)
- TypeScript / build pipeline — não introduzido.
- Migração para `chrome.sidePanel` API — fora do escopo.
- Reescrita de prompts ou de `geminiService.js` — não tocada.
- Centralização final do estado em `StateManager` — apenas bridge de
  introspecção em v5.1; refactor pleno é para v6.
- Single-source-of-truth para listas de gatilhos (regex em
  `geminiInterviewAgent` vs. strings em `sidepanel-constants.js`) —
  duplicação preservada conscientemente; consolidação é para v6.
- Fila de mensagens com `requestId` e idempotência — fora do escopo.
- SKILL.md em `skills/user/` carregadas em runtime — não aplicado;
  prompts continuam embutidos em JS (decisão conservadora).
