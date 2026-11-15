# CHANGELOG — v5.1.5

## Correções de segurança clínica (2026-07-21, a partir do log de 4 consultas)

### Presbiopia (H52.4) era removida do diagnóstico em 3 de 3 consultas

`_guardPresbiopiaObrigatoria` (`src/DecisionEngine.js`) falhava por **duas**
razões independentes, ambas exigindo correção:

1. **Plural.** O padrão era `/multifocal/`, mas a frase canônica que o prompt
   manda emitir é *"Prescrição de óculos **multifocais**"* — e `multifocais`
   não contém `multifocal`. O guard nunca reconhecia a própria conduta do
   sistema. Os testes PRES-1..8 passavam porque usavam o singular: drift
   entre teste e produção. Agora `/multifoca(?:l|is)|bifoca(?:l|is)|progressiv/`,
   com o teste `[PRES-13]` travando a sincronia prompt↔guard.
2. **Evidência de "perto" lexical demais.** Exigia o token `oculos` a ≤6
   palavras de `perto`. Na fala real o médico explica o multifocal sem repetir
   "óculos" (*"tem grau de longe perto junto"*). A evidência agora aceita
   também a dupla longe+perto e o vocabulário de leitura (óculos de farmácia,
   para ler). Menção explícita de "presbiopia" passou a bastar sozinha.

O AND foi preservado: "óculos para perto" isolado continua insuficiente
(`PRES-6`), e multifocal declarado só para longe também (`PRES-7`).

### Fase 2 pós-dilatação laudava exames que não foram descritos

Novo `_guardExamesNormaisFase2` (Guard 7). Na consulta das 13:39 a fase 2 teve
37 palavras, nenhuma sobre fundo de olho, e `injectExamesNormais` saiu `true`:
o LLM se apoiou em *"o resto tá tudo em paz com olho"*, dito **antes** da
dilatação. A dilatação existe justamente para ver o fundo.

O guard varre **apenas** o trecho após o marcador `[RETORNO DA DILATACAO]`. Se
a fase 2 não descreve os exames, derruba `injectExamesNormais` e a
`fundoscopia`. Perder uma biomicroscopia legítima da fase 1 (o médico redigita)
é preferível a fabricar fundoscopia. Testes `[F2-1]`..`[F2-4]`.


Fila de pausas de dilatação multi-paciente ("sala de espera"). Atende a rotina
real do consultório: o paciente sai para dilatar e OUTRAS consultas acontecem
enquanto o colírio faz efeito — inclusive outras dilatações. A extensão nunca
fica em stand-by esperando o retorno.

## Versão

- `manifest.json` e `package.json`: `5.1.4` → **5.1.5**.

## Nova lógica — fila `_shospDilatacaoPausas` (`scripts/dilatacao-pausas.js`, novo)

- Cada pausa de dilatação (ou de exame) vira um **slot independente** na fila
  persistida em `chrome.storage.local` (TTL 6h por slot), com a identidade do
  prontuário aberto (URL/título da aba) capturada na hora da pausa.
- O painel renderiza a **sala de espera** (`renderDilatacaoPausas`): uma linha
  por paciente pausado, com rótulo (tipo + hora + nome da aba), botão
  **Retomar** próprio e **✕** para descartar. Slot armado vira linha verde com
  **Desarmar**.
- Retomada é **exclusiva** (armar um slot desarma os demais) e **opt-in**
  (sem clique, toda gravação é paciente novo — preserva o fix de 2026-07-17).
- Migração automática: a chave legada `_shospDilatacaoPhase1` é convertida em
  slot na primeira leitura e removida.

## Defeitos corrigidos (modelo antigo de chave única)

1. **Injeção intercalada apagava a pausa de quem esperava** — o ramo `else`
   pós-sucesso do `injectAll` removia `_shospDilatacaoPhase1`
   incondicionalmente; a consulta completa de um paciente atendido no meio da
   espera destruía a fase 1 do paciente dilatando (o botão "retomar" sumia).
   Agora o consumo remove **só o slot armado**, e apenas quando a injeção de
   ÁUDIO da fase 2 acontece (injeção só de câmera no meio da fase 2 preserva).
2. **Segunda dilatação sobrescrevia a primeira** — com um único slot, dois
   pacientes dilatando ao mesmo tempo perdiam a fase 1 do primeiro. Agora cada
   pausa nasce em slot próprio; a fila comporta N pacientes.

## Mudanças de comportamento

- **Limpar** manual agora apenas DESARMA retomadas pendentes; as pausas dos
  demais pacientes ficam na fila (descarte individual pelo ✕). Antes apagava a
  única pausa persistida.
- Pausa com `motivo='exame'` (parada manual no meio do exame — paciente segue
  na sala) nasce **armada**: a gravação seguinte continua a mesma consulta sem
  clique extra. Dilatação continua exigindo o clique em Retomar.
- Sanidade anti-contaminação: se o prontuário aberto na injeção da fase 2
  difere do prontuário onde a pausa nasceu, um aviso é logado no console.
- "Não era dilatação — reprocessar" age sobre a pausa MAIS RECENTE da fila.

## Testes

- 10 testes novos em `utils/integration-test.js`: `[DILQ-SRC-1..3]`
  (âncoras de código dos fixes) e `[DILQ-1..7]` (comportamentais, com
  `chrome.storage` mockado: coexistência de slots, exclusividade da retomada,
  remoção seletiva, migração da chave legada, TTL, desarme sem perda, pausa de
  exame armada). Runner ganhou suporte a testes assíncronos (`testAsync`).

---

# CHANGELOG — v5.1.2

Patch de segurança clínica. Sem mudanças em runtime JS, sem alterações em
prompts de outras skills, sem toque em gatilhos de voz ou lógica de captura.

## Versão

- `manifest.json`: `5.1.1` → **5.1.2**.
- `package.json`: alinhado em **5.1.2**.
- Marcadores de topo de `dist/background.js` e `dist/content.js`: alinhados
  em **5.1.2** (estavam em 5.1.0 por omissão no patch anterior).

## Skill OCR TOPCON — Anti-alucinação de cilindro (`skills/user/ocr-topcon-oftalmologia/SKILL.md`)

Adicionada seção **"Regra CYL — leitura da coluna de cilindro do ticket TOPCON"**,
posicionada antes das regras campo-a-campo de refração para que o Gemini a leia
antes de interpretar qualquer número.

Regras introduzidas (7 itens):

1. Registrar cilindro **somente** quando houver número com sinal explícito na
   coluna C.
2. Traço, hífen, espaço, `− − −`, `...`, `0.00` → cilindro ausente (esférico
   puro); nunca assumir `−0,25` por padrão.
3. Cilindro ausente implica eixo vazio — sem inventar `90°` ou `180°`.
4. Dúvida entre `−0,25` e traço → retornar `"indeterminado"` com flag
   `cyl_incerto: true`; não chutar.
5. Sanity-check com S.E. impresso pelo próprio TOPCON: se S.E. bate com esfera
   pura, descartar qualquer cilindro lido — é alucinação.
6. Coerência entre as 3 medidas consecutivas: 2 sem cilindro + 1 com `−0,25`
   → divergente marcada como `cyl_incerto: true`.
7. Preferir subdiagnosticar cilindro a superdiagnosticar — astigmatismo
   fantasma gera prescrição errada.

**Motivação:** casos clínicos onde o Gemini alucinou `−0,25` / eixo `90°` em
tickets com coluna CYL em branco, gerando risco de prescrição incorreta.

---

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
