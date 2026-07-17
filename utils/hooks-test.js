/**
 * ============================================================================
 * TESTE DOS HOOKS DE FINAL DE CONSULTA (stop + dilatação)
 * Execute com: node utils/hooks-test.js
 *
 * Estratégia: concatena todos os módulos em um único vm.runInContext para que
 * as variáveis `let` do constants.js (stopCommandTimeout, isRecording, etc.)
 * fiquem no mesmo escopo léxico que os hooks. Um objeto _BRIDGE expõe essas
 * variáveis ao código de teste externo.
 * ============================================================================
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ──────────────────────────────────────────────────────────────────────────────
// FONTES DOS MÓDULOS
// ──────────────────────────────────────────────────────────────────────────────

function readSrc(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const triggersSrc     = readSrc('config/clinical-triggers.js');
const constantsSrc    = readSrc('scripts/sidepanel-constants.js');
const stateManagerSrc = readSrc('scripts/state-manager.js');
const hooksSrc        = readSrc('scripts/sidepanel-hooks.js');
const runnerSrc       = readSrc('scripts/sidepanel-hook-runner.js');

// ──────────────────────────────────────────────────────────────────────────────
// CÓDIGO MOCK + BRIDGE (injetado antes dos módulos)
// Declara mocks com var para que sejam propriedades do contexto global do vm.
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_SRC = `
var _injectCounts = { exames: 0, blefarite: 0, olhoIrritado: 0, stop: 0 };

// sessionStartTime vive em sidepanel-audio.js (não carregado nos testes).
// Default: sessão "antiga" (10 min), para que hooks com minSessionMs fiquem
// liberados — testes específicos simulam sessão recém-iniciada via _BRIDGE.
var sessionStartTime = Date.now() - 600000;

function injectExamesNormaisDirect()     { _injectCounts.exames++; }
function injectBlefariteDirect()          { _injectCounts.blefarite++; }
function injectReceitaOlhoIrritadoDirect(){ _injectCounts.olhoIrritado++; }
function stopRecording() { _injectCounts.stop++; isRecording = false; }

`;

// Bridge: exposta ao escopo do vm via var. As flags de sessão delegam a
// SessionFlags (acessores GERADOS do registro canônico — flag nova entra
// automaticamente); as demais variáveis (lets de constants.js e mocks)
// continuam com acessores manuais.
// Definida DEPOIS dos módulos para garantir que os bindings já existem.
const BRIDGE_SRC = `
var _BRIDGE = {
  get stopCommandTimeout()  { return stopCommandTimeout; },
  set stopCommandTimeout(v) { stopCommandTimeout = v; },
  get isRecording()         { return isRecording; },
  set isRecording(v)        { isRecording = v; },
  get lastTriggerTime()    { return lastTriggerTime; },
  set lastTriggerTime(v)   { lastTriggerTime = v; },
  get sessionStartTime()   { return sessionStartTime; },
  set sessionStartTime(v)  { sessionStartTime = v; },
  get stopGateOffset()     { return stopGateOffset; },
  set stopGateOffset(v)    { stopGateOffset = v; },
  get stopGateBlockCount()  { return stopGateBlockCount; },
  set stopGateBlockCount(v) { stopGateBlockCount = v; },
  resetFlags() {
    stopPendingInfo        = null;
    stopGateOffset         = 0;
    stopGateBlockCount     = 0;
    Object.assign(SessionFlags, SESSION_FLAG_DEFAULTS);
    lastTriggerTime        = 0;
    isRecording            = true;
    recentTextBuffer       = '';
    sessionStartTime       = Date.now() - 600000;
  },
  SESSION_FLAG_DEFAULTS: SESSION_FLAG_DEFAULTS,
  SessionFlags: SessionFlags,
  StateManager: StateManager,
  HOOK_STATE: HOOK_STATE,
  shospState: window.__shospState,
  getBiomicroscopiaComLente: getBiomicroscopiaComLente,
  parseCatarataFromDiagnostico: parseCatarataFromDiagnostico,
  BIOMICROSCOPIA_NORMAL: BIOMICROSCOPIA_NORMAL,
  BIOMICROSCOPIA_BLEFARITE: BIOMICROSCOPIA_BLEFARITE,
  normalizeText: normalizeText,
  runHooks: runHooks,
};
// Acessores das flags de sessão — gerados do registro canônico.
for (const _flagName of Object.keys(SESSION_FLAG_DEFAULTS)) {
  Object.defineProperty(_BRIDGE, _flagName, {
    get: () => SessionFlags[_flagName],
    set: (v) => { SessionFlags[_flagName] = v; },
    enumerable: true,
  });
}
`;

// ──────────────────────────────────────────────────────────────────────────────
// CONTEXTO DO VM
// ──────────────────────────────────────────────────────────────────────────────

let _timeoutCallbackQueue = [];

const ctx = vm.createContext({
  console,
  document: {
    getElementById: (id) => ({
      id, offsetParent: true,
      classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
      style: {}, value: '', innerHTML: '', textContent: id,
      dispatchEvent: () => {},
      addEventListener: () => {},
    }),
    querySelectorAll: () => [],
    querySelector:    () => null,
    createElement:    () => ({
      style: {}, classList: { add: () => {}, remove: () => {} },
      innerHTML: '', appendChild: () => {}
    }),
  },
  window: { HTMLInputElement: { prototype: { value: null } }, innerHeight: 900 },
  chrome: { runtime: { onMessage: { addListener: () => {} } } },
  setTimeout:   (fn, _d) => { const id = Symbol('t'); _timeoutCallbackQueue.push({ id, fn }); return id; },
  clearTimeout: (id)     => { _timeoutCallbackQueue = _timeoutCallbackQueue.filter(t => t.id !== id); },
});

// Rodar tudo em um único script para compartilhar escopo léxico
const fullSrc = [MOCK_SRC, triggersSrc, constantsSrc, stateManagerSrc, hooksSrc, runnerSrc, BRIDGE_SRC].join('\n\n// ───────\n\n');
vm.runInContext(fullSrc, ctx);

// ──────────────────────────────────────────────────────────────────────────────
// RUNNER DE TESTES
// ──────────────────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
const results = [];

function resetState() {
  ctx._BRIDGE.resetFlags();
  ctx._BRIDGE.stopCommandTimeout = null;
  ctx._injectCounts = { exames: 0, blefarite: 0, olhoIrritado: 0, stop: 0 };
  _timeoutCallbackQueue = [];
  // Sincronizar setTimeout no ctx (pode ter sido sobrescrito)
  ctx.setTimeout   = (fn, _d) => { const id = Symbol('t'); _timeoutCallbackQueue.push({ id, fn }); return id; };
  ctx.clearTimeout = (id)     => { _timeoutCallbackQueue = _timeoutCallbackQueue.filter(t => t.id !== id); };
}

function flushTimeouts() {
  const q = [..._timeoutCallbackQueue];
  _timeoutCallbackQueue = [];
  q.forEach(t => t.fn());
}

// Preâmbulo que satisfaz o gate de captura (conduta + tratamento já ditados).
// Os testes de stop pré-existentes validam os GATILHOS de despedida, não o
// gate — por isso speak() o inclui por padrão. Os testes [GATE-*] usam
// speakSemCaptura() para exercitar o bloqueio do encerramento.
const GATE_PREAMBLE = 'a conduta e o tratamento ja foram combinados';

function speak(finalText, interimText = '') {
  return speakSemCaptura(GATE_PREAMBLE + ' ' + finalText, interimText);
}

function speakSemCaptura(finalText, interimText = '') {
  const normFinal   = ctx._BRIDGE.normalizeText(finalText);
  const normCurrent = ctx._BRIDGE.normalizeText(finalText + ' ' + interimText);
  const buf = normCurrent.slice(-300);
  return ctx._BRIDGE.runHooks(normFinal, normCurrent, buf);
}

function test(name, fn) {
  resetState();
  try {
    fn();
    results.push({ status: 'PASS', name });
    passCount++;
  } catch (e) {
    results.push({ status: 'FAIL', name, error: e.message });
    failCount++;
  }
}

function expect(value) {
  return {
    toBe:       (e) => { if (value !== e)  throw new Error(`Esperado: ${JSON.stringify(e)}, Recebido: ${JSON.stringify(value)}`); },
    toBeTruthy: ()  => { if (!value)        throw new Error(`Esperado truthy, Recebido: ${JSON.stringify(value)}`); },
    toBeFalsy:  ()  => { if (value)         throw new Error(`Esperado falsy, Recebido: ${JSON.stringify(value)}`); },
    not: {
      toBe:       (e) => { if (value === e) throw new Error(`Não esperado: ${JSON.stringify(e)}`); },
      toBeTruthy: ()  => { if (value)       throw new Error(`Esperado falsy, Recebido: ${JSON.stringify(value)}`); },
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DOS HOOKS DE STOP (final de consulta)
// ──────────────────────────────────────────────────────────────────────────────

test('[STOP-1] "pode ir na recepção" agenda stop', () => {
  speak('pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-2] "pode ir na recepção" → após timeout, chama stopRecording', () => {
  speak('pode ir na recepção');
  flushTimeouts();
  expect(ctx._injectCounts.stop).toBe(1);
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[STOP-3] "algo mais que eu possa ajudar" agenda stop', () => {
  speak('algo mais que eu possa ajudar');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-4] "até a próxima consulta" agenda stop', () => {
  speak('até a próxima consulta');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-5] "pode passar no balcão" agenda stop', () => {
  speak('pode passar no balcão');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-6] "pode pegar na recepção" agenda stop', () => {
  speak('pode pegar na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-7] "pode fazer os óculos" agenda stop', () => {
  speak('pode fazer os óculos');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-8] stop via interim text (multiSource) — normalizedFinal vazio', () => {
  const normCurrent = ctx._BRIDGE.normalizeText(GATE_PREAMBLE + ' pode ir na recepção');
  ctx._BRIDGE.runHooks('', normCurrent, normCurrent.slice(-300));
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-9] texto clínico sem despedida NÃO agenda stop', () => {
  speak('pressão ocular está normal');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[STOP-10] stop não cria segunda entrada na fila de timeouts', () => {
  speak('pode ir na recepção');
  const countAfterFirst = _timeoutCallbackQueue.length;
  speak('pode ir na recepção');
  expect(_timeoutCallbackQueue.length).toBe(countAfterFirst);
});

test('[STOP-11] "passe no balcão" agenda stop (caso real 2026-07-16)', () => {
  speak('a receita está pronta passe no balcão');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-12] "paga lá no balcão" agenda stop', () => {
  speak('está tudo certo paga lá no balcão');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-13] "ajudar" sem "mais" NÃO agenda stop (removidas na revisão 2026-07-16)', () => {
  speak('algo que eu possa ajudar na sua adaptação é explicar como usar a lente');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// STOP ANCORADO — frases de conduta só encerram quando são a ÚLTIMA coisa dita
// (revisão 2026-07-16: na lista forte elas paravam a gravação NO MEIO da
// consulta, porque o próprio texto satisfaz o gate de captura)
// ──────────────────────────────────────────────────────────────────────────────

test('[ANC-1] "pode trocar os óculos" no MEIO da fala NÃO agenda stop', () => {
  speak('pode trocar os óculos se quiser mas antes deixa eu medir a sua pressão');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[ANC-2] "pode trocar os óculos" no FIM da fala agenda stop e encerra', () => {
  speak('está tudo certo pode trocar os óculos');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[ANC-3] stop ancorado é CANCELADO se a fala continuar após a frase', () => {
  speak('está tudo certo pode trocar os óculos');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  speak('está tudo certo pode trocar os óculos porque o grau mudou e eu vou medir de novo');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  expect(ctx._BRIDGE.consultaEncerradaDetectada).toBe(false);
});

test('[ANC-4] "retorno em seis meses" ditado no meio da conduta NÃO para a gravação', () => {
  speak('a conduta é retorno em seis meses e vou passar um lubrificante para usar duas vezes ao dia');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[ANC-5] "declaração de comparecimento" no fim da fala agenda stop', () => {
  speak('vou deixar pronta a sua declaração de comparecimento');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// GATE — conduta de PROCEDIMENTO em consultório satisfaz conduta E tratamento
// (caso real 2026-07-16: excisão de calázio "vou resolver isso aqui" não tinha
// marcador; a despedida seria bloqueada com "falta ditar CONDUTA e TRATAMENTO")
// ──────────────────────────────────────────────────────────────────────────────

test('[GATE-PROC-1] "vou resolver isso aqui" satisfaz conduta E tratamento no gate', () => {
  const r = ctx.ClinicalTriggers.checkCondutaTratamentoCaptados(
    'esse carocinho é um cisto eu vou resolver isso aqui no consultório mesmo'
  );
  expect(r.conduta).toBe(true);
  expect(r.tratamento).toBe(true);
  expect(r.ok).toBe(true);
});

test('[GATE-PROC-2] consulta de calázio resolvida em consultório + balcão → stop sem bloqueio', () => {
  speakSemCaptura(
    'esse carocinho e um cisto eu vou resolver isso aqui agora prontinho resolvido o seu problema pode passar no balcao'
  );
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[STOP-11] "ficou alguma dúvida" NÃO agenda stop (pergunta aberta removida 2026-07-15)', () => {
  // Perguntas abertas sem ação/destino aparecem no meio da explicação e
  // cortariam a gravação antes do fim real da consulta.
  speak('ficou alguma dúvida');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[STOP-12] "tudo bom então" agenda stop', () => {
  speak('tudo bom então');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-13] "obrigado pela consulta" agenda stop', () => {
  speak('obrigado pela consulta');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-14] "retorno em três meses" agenda stop', () => {
  speak('retorno em três meses');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-15] "volta aqui se não melhorar" agenda stop', () => {
  speak('volta aqui se não melhorar');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DAS DESPEDIDAS CURTAS (endAnchored + cancelamento)
// ──────────────────────────────────────────────────────────────────────────────

test('[STOP-CURTO-1] "tchau" no fim da fala agenda stop', () => {
  speak('então é isso tchau');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-CURTO-2] "ta bom entao" NO MEIO da fala NÃO agenda stop (endAnchored)', () => {
  speak('tá bom então vamos medir a pressão agora');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[STOP-CURTO-3] stop curto é CANCELADO se a fala continua depois da despedida', () => {
  speak('tá bom então');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  // próximo evento de fala: a frase deixou de estar no fim
  speak('tá bom então vamos medir a pressão do olho');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  flushTimeouts();
  expect(ctx._injectCounts.stop).toBe(0);
  expect(ctx._BRIDGE.isRecording).toBe(true);
});

test('[STOP-CURTO-4] após cancelamento, novo stop pode disparar (flag desfeita pelo onCancel)', () => {
  speak('tá bom então');
  speak('tá bom então vamos medir a pressão do olho'); // cancela
  speak('pode ir na recepção'); // stop forte
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[STOP-CURTO-5] stop curto confirmado por silêncio chama stopRecording', () => {
  speak('então é isso até logo');
  flushTimeouts();
  expect(ctx._injectCounts.stop).toBe(1);
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

// Despedida em cadeia — caso real 2026-07-17: "ta bom entao ate daqui a
// pouquinho obrigada" cancelava o stop e nada re-disparava; precisou do
// "consulta encerrada" forçado. Continuação de despedida deve PRORROGAR.

test('[STOP-CURTO-6] cadeia de despedida PRORROGA o stop em vez de cancelar (caso real 2026-07-17)', () => {
  speak('tá bom então');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  speak('tá bom então até daqui a pouquinho obrigada');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null); // prorrogado, não cancelado
  flushTimeouts();
  expect(ctx._injectCounts.stop).toBe(1);
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[STOP-CURTO-7] cadeia de despedida seguida de conteúdo clínico CANCELA', () => {
  speak('tá bom então');
  speak('tá bom então até daqui a pouquinho obrigada'); // prorroga
  speak('tá bom então até daqui a pouquinho obrigada deixa eu ver a pressão'); // cancela
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  expect(ctx._BRIDGE.HOOK_STATE.consultaEncerradaDetectada).toBe(false); // onCancel desfez
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(true);
});

test('[STOP-CURTO-8] continuação clínica direta ainda CANCELA (sem regressão do STOP-CURTO-3)', () => {
  speak('tá bom então');
  speak('tá bom então agora vamos conferir o grau no aparelho');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[STOP-ANCORADO-CADEIA-1] "declaração de comparecimento" + conteúdo não-despedida CANCELA', () => {
  speak('ela pode pegar a declaração de comparecimento');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  speak('ela pode pegar a declaração de comparecimento para alguma atividade física');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[STOP-SAUDACAO-CADEIA-1] "bom dia" seguido de "tchau tchau" mantém o stop agendado', () => {
  speak('tá certo obrigada bom dia');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  speak('tá certo obrigada bom dia tchau tchau');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DAS SAUDAÇÕES-DESPEDIDA ("bom dia" no fim — endAnchored + minSessionMs)
// Regressão do log real 2026-06-12: "tá ok, bom dia" não encerrou a consulta.
// ──────────────────────────────────────────────────────────────────────────────

test('[STOP-SAUDACAO-1] "bom dia" no fim da fala (sessão antiga) agenda stop', () => {
  speak('a receita está pronta qualquer coisa volta aqui bom dia');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[STOP-SAUDACAO-2] frase real do log: "...tá ok bom dia" agenda stop', () => {
  speak('tem que vir antes para trocar para fazer um monte de flocao ta ok bom dia');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-SAUDACAO-3] "bom dia" no INÍCIO da sessão NÃO agenda stop (minSessionMs)', () => {
  ctx._BRIDGE.sessionStartTime = Date.now(); // sessão recém-iniciada
  speak('bom dia');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[STOP-SAUDACAO-4] "bom dia" no MEIO da fala NÃO agenda stop (endAnchored)', () => {
  speak('bom dia tudo bem pode sentar vamos começar o exame');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[STOP-SAUDACAO-5] stop por "boa tarde" é CANCELADO se a fala continua', () => {
  speak('então é isso boa tarde');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  speak('então é isso boa tarde ah espera deixa eu ver mais uma coisa aqui');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  flushTimeouts();
  expect(ctx._injectCounts.stop).toBe(0);
  expect(ctx._BRIDGE.isRecording).toBe(true);
});

test('[STOP-SAUDACAO-6] "boa noite" no fim da fala agenda stop', () => {
  speak('pode fazer o tratamento direitinho boa noite');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE NEGAÇÃO COM MÚLTIPLAS OCORRÊNCIAS
// ──────────────────────────────────────────────────────────────────────────────

test('[NEG-MULTI-1] ocorrência afirmativa após negada dispara ("nao precisa dilatar ... precisa dilatar")', () => {
  speak('não precisa dilatar por enquanto vamos avaliar primeiro ok agora precisa dilatar sim');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DO HOOK DE DILATAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

test('[DIL-1] "precisa dilatar" → dilatacaoDetectada=true e stop agendado', () => {
  speak('precisa dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-ENCERR-1] despedida detectada SUPRIME dilatação subsequente (guard de encerramento)', () => {
  // Log 2026-07-08: consulta já encerrada + "esperar o colírio fazer efeito para
  // ELE (filho) dilatar" sequestrava a consulta completa como pausa de dilatação.
  // 1) despedida sem captura → gate bloqueia (não agenda stop), mas marca despedidaNaSessao
  speakSemCaptura('pode ir na recepção');
  expect(ctx._BRIDGE.HOOK_STATE.despedidaNaSessao).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  // 2) gatilho de dilatação depois do encerramento NÃO deve marcar dilatação
  speakSemCaptura('vamos esperar o colirio fazer efeito para ele dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
});

test('[DIL-ENCERR-2] sem despedida, a MESMA frase de dilatação dispara normalmente (sem regressão)', () => {
  speakSemCaptura('vamos esperar o colirio fazer efeito para ele dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-ENCERR-3] despedida endAnchored ("até mais") NÃO trava despedidaNaSessao', () => {
  // 2026-07-17: "bom dia"/"até mais" (endAnchored, canceláveis) marcavam
  // despedidaNaSessao já no match; se a fala continuava e o stop era cancelado,
  // a flag ficava presa e suprimia em silêncio uma dilatação legítima depois.
  // Agora só despedida FORTE/não-cancelável é sticky de imediato.
  speak('ok então até mais');
  expect(ctx._BRIDGE.HOOK_STATE.despedidaNaSessao).toBe(false);
  // A fala continua com uma dilatação real → deve disparar (cancela o stop curto).
  speak('vou dilatar a pupila');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-2] "pode esperar lá fora" → dilatacaoDetectada=true', () => {
  speak('pode esperar lá fora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-3] "vou pedir para esperar lá fora" → stop agendado', () => {
  speak('vou pedir para esperar lá fora');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-4] dilatação NÃO é bloqueada por lastTriggerTime recente (cooldown=0 intencional)', () => {
  // FIX v5.1: o teste original esperava bloqueio por cooldown < 3s, mas o hook
  // 'dilatacao' em sidepanel-hooks.js usa cooldown: 0 deliberadamente — o guard
  // contra duplo disparo é feito por stopCommandTimeout (já agendado), não por
  // cooldown temporal. Asserção atualizada para refletir esse comportamento
  // clínico intencional: dilatação deve disparar mesmo logo após outro inject,
  // porque o médico pode dizer "exames normais ... vou pedir para esperar lá
  // fora" em sequência rápida.
  ctx._BRIDGE.lastTriggerTime = Date.now();
  ctx._BRIDGE.stopCommandTimeout = null; // garantir estado limpo
  speak('pode esperar lá fora');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-5] dilatação dispara independente do tempo desde último trigger', () => {
  ctx._BRIDGE.lastTriggerTime = Date.now() - 4000;
  ctx._BRIDGE.stopCommandTimeout = null;
  speak('pode esperar lá fora');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-6] "colirio para dilatar" → dilatacaoDetectada=true', () => {
  speak('colírio para dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE INTERAÇÃO INJECT + STOP
// ──────────────────────────────────────────────────────────────────────────────

test('[MIX-1] exames normais + stop na mesma fala → inject E stop acionados', () => {
  speak('seus exames estão normais, pode ir na recepção');
  expect(ctx._injectCounts.exames).toBe(1);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[MIX-2] inject de exames, depois fala com stop → stop dispara no segundo evento', () => {
  speak('seus exames estão normais');
  expect(ctx._injectCounts.exames).toBe(1);
  speak('seus exames estão normais, pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE DILATAÇÃO — FRASES SEM PREFIXO "VOU" E COMBOS (regressão do log real)
// ──────────────────────────────────────────────────────────────────────────────

test('[DIL-STOP-1] "pode ir la fora para pingar o colirio vai dilatar" → dilatacaoDetectada e stop', () => {
  speak('pode ir la fora para pingar o colirio vai dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-STOP-2] "colirio esperar um pouco para fazer efeito" → dilatacaoDetectada e stop', () => {
  speak('colirio esperar um pouco para fazer efeito');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-STOP-3] frase completa do log real dispara dilatacaoDetectada', () => {
  speak('colirio esperar um pouco para fazer efeito colirio pode ir la fora para pingar o colirio vai dilatar e pingar o colirio');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-STOP-4] "pingar o curriculo para dilatar" (mistranscrição) → dilatacaoDetectada=true', () => {
  speak('pingar o curriculo para dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DAS NOVAS VARIANTES ("fazer a dilatação", "vai precisar dilatar", etc.)
// ──────────────────────────────────────────────────────────────────────────────

test('[DIL-NEW-1] "vou fazer a dilatação" → dilatacaoDetectada=true', () => {
  speak('vou fazer a dilatação');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-2] "vamos fazer dilatação" → dilatacaoDetectada=true', () => {
  speak('vamos fazer dilatação');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-3] "precisa fazer a dilatação" → dilatacaoDetectada=true', () => {
  speak('precisa fazer a dilatação');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-4] "vai precisar dilatar" → dilatacaoDetectada=true', () => {
  speak('vai precisar dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-5] "você vai precisar dilatar" → dilatacaoDetectada=true', () => {
  speak('você vai precisar dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-6] REGRESSÃO: "já dilatou" (fala do RETORNO) NÃO dispara pausa', () => {
  // 'ja dilatou' foi removido de DILATACAO_COMMANDS: é a frase típica do
  // retorno da dilatação e re-disparava a pausa na fase 2.
  speak('já dilatou pode examinar o fundo');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[DIL-NEW-7] "precisa de dilatação" → dilatacaoDetectada=true', () => {
  speak('precisa de dilatação para ver o fundo');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-8] "dilatação dos olhos" → dilatacaoDetectada=true', () => {
  speak('dilatação dos olhos é necessária');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-9] combo "fazer"+"dilatacao" → dilatacaoDetectada=true', () => {
  speak('a gente vai ter que fazer a dilatação completa dos dois olhos');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-10] combo "pupila"+"dilata" → dilatacaoDetectada=true', () => {
  speak('vou dilatar a pupila agora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-NEW-11] combo "tropicamida"+"pingar" → dilatacaoDetectada=true', () => {
  speak('vou pingar a tropicamida para dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-STT-1] "de lata e passa no aparelho" (STT: dilata→de lata) → dilatacaoDetectada=true', () => {
  // Regressão do log 2026-06-09: STT misreconheceu "dilata" como "de lata"
  speak('ta bom que e esse produto certinho a gente vai ver como vai organizar de lata e passa no aparelho depois pode la ta bem');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[DIL-STT-1b] "relata" + "aparelho" NÃO dispara dilatação (fronteira de palavra no combo)', () => {
  // Regressão: o combo ['lata','aparelho'] casava "lata" DENTRO de "relata",
  // parando a gravação no meio da anamnese ("paciente relata que usa aparelho").
  speak('o paciente relata que usa aparelho de pressão em casa');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[DIL-STT-2] "lata" + "aparelho" sem contexto cirúrgico NÃO dispara se em posições distantes do buffer', () => {
  // "lata" no início e "aparelho" distante — não devem co-ocorrer no recentTextBuffer (300 chars)
  // quando o contexto real é diferente. Este teste usa speak() com buffer de 300 chars,
  // então texto longo garante que só o tail importa.
  const longText = 'a'.repeat(400) + ' lata ';
  const norm = ctx._BRIDGE.normalizeText(longText);
  const buf = norm.slice(-300);
  const result = ctx._BRIDGE.runHooks('', norm, buf);
  // "aparelho" não está no texto → não deve disparar
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES FASE 2 DE DILATAÇÃO + FALSOS POSITIVOS RETROSPECTIVOS (2026-07-09)
// ──────────────────────────────────────────────────────────────────────────────

test('[DIL-FASE2-1] fase2: comando FRESCO na cauda ("vou dilatar" no fim) AINDA pausa', () => {
  // Contrato novo (2026-07-17): fase2 não suprime mais o hook por completo —
  // só restringe o match à cauda. Um "vou dilatar" dito agora, no fim da fala,
  // é uma pausa real (paciente diferente, ou nova dilatação do mesmo) e dispara.
  ctx._BRIDGE.StateManager.setHookFlag('fase2DilatacaoAtiva', true);
  speak('vou dilatar agora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-FASE2-1b] fase2: narração retrospectiva LONGE da cauda NÃO pausa', () => {
  // "vou dilatar" enterrado no meio do transcript acumulado, com >300 chars até
  // o fim (fora do recentTextBuffer) — narração do retorno, não nova pausa.
  ctx._BRIDGE.StateManager.setHookFlag('fase2DilatacaoAtiva', true);
  const normFinal = ctx._BRIDGE.normalizeText('ja dilatou vou dilatar ' + 'a'.repeat(400) + ' otimo pupila reagente');
  const buf = normFinal.slice(-300);
  ctx._BRIDGE.runHooks(normFinal, normFinal, buf);
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
});

test('[DIL-FASE2-LIMIT] LIMITAÇÃO CONHECIDA: narração retrospectiva NA CAUDA ainda pausa em fase2', () => {
  // O tail-scan restaura o disparo ao vivo de um comando FRESCO (o bug do
  // paciente diferente, 2026-07-17), mas NÃO distingue narração retrospectiva
  // de comando novo quando a frase é dita AGORA, no fim da fala: ao vivo, a
  // narração do retorno também está na cauda no momento em que é falada.
  // Ex.: no retorno da dilatação do MESMO paciente, "já pinguei o colírio para
  // dilatar" dispara uma pausa falsa. Recuperação: botão "Desfazer dilatação"
  // (cancelarDilatacao). Fix definitivo = fase2 explícita por botão, não
  // adivinhada por "próxima gravação em 6h". Este teste documenta o
  // comportamento atual — se ele mudar (ex.: heurística de tempo verbal ou
  // fase2 opt-in), reavaliar a asserção.
  ctx._BRIDGE.StateManager.setHookFlag('fase2DilatacaoAtiva', true);
  speakSemCaptura('deixa eu ver o fundo ja pinguei o colirio para dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-FASE2-2] sem fase2, "vou dilatar" continua pausando normalmente', () => {
  speak('vou dilatar agora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-FASE2-3] REGRESSÃO: "pupila dilatada" (achado de exame) NÃO dispara pausa', () => {
  // Combo ['pupila','dilata'] removido: "dilata" casava "dilatadA" por prefixo,
  // e "pupila dilatada" é achado do retorno/midríase, não anúncio de pausa.
  speak('pupila dilatada e reagente vamos olhar o fundo');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
});

test('[DIL-FASE2-4] "vou dilatar a pupila" continua disparando (combo pupila+dilatar)', () => {
  speak('vou dilatar a pupila agora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-RETRO-1] REGRESSÃO: "coloquei o colírio direitinho" (adesão do paciente) NÃO pausa', () => {
  speak('coloquei o colírio direitinho todo dia igual o senhor falou');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
});

test('[DIL-RETRO-2] REGRESSÃO: "pingou o colírio hoje de manhã" (relato do paciente) NÃO pausa', () => {
  speak('minha esposa pingou o colírio em mim hoje de manhã');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
});

test('[DIL-RETRO-3] "já dilatei" (médico pós-aplicação, fase 1) continua disparando', () => {
  speak('pronto já dilatei pode aguardar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE VARIANTES PLURAIS / ACOMPANHANTE (criança em consulta)
// ──────────────────────────────────────────────────────────────────────────────

test('[DIL-PLURAL-1] "esperem lá fora" (imperativo plural) dispara dilatação', () => {
  speak('vou pingar o colírio nele esperem lá fora uns vinte minutos');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-PLURAL-2] "aguardem aqui fora" dispara dilatação', () => {
  speak('aguardem aqui fora que eu já chamo vocês');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[DIL-PLURAL-3] "leva ele lá fora" (instrução ao acompanhante) dispara dilatação', () => {
  speak('a senhora leva ele lá fora enquanto o colírio age');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTE DO FALLBACK detectaDilatacaoNaFala — combos restritos à cauda
// ──────────────────────────────────────────────────────────────────────────────

test('[DIL-TAIL-1] combos distantes no transcript inteiro NÃO disparam o fallback', () => {
  // "colirio" no início (prescrição) e "dilatar" longe, com >500 chars entre
  // eles e do fim — antes o fallback varria o texto inteiro e marcava consulta
  // COMPLETA como pausa de dilatação, zerando conduta/tratamento.
  const texto = 'vou passar um colirio lubrificante para o senhor usar '
    + 'x'.repeat(600)
    + ' o musculo dilatar e uma coisa natural do olho '
    + 'y'.repeat(600)
    + ' retorno em um ano tratamento lubrificante';
  const detected = ctx.ClinicalTriggers.detectaDilatacaoNaFala(texto);
  expect(detected).toBe(false);
});

test('[DIL-TAIL-2] combo na CAUDA continua disparando o fallback', () => {
  const texto = 'x'.repeat(600) + ' vou pingar o colirio para dilatar a pupila';
  const detected = ctx.ClinicalTriggers.detectaDilatacaoNaFala(texto);
  expect(detected).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE EXAME EM ANDAMENTO (detectaExameEmAndamento)
// ──────────────────────────────────────────────────────────────────────────────

test('[EXAM-PROGRESS-1] "olha para baixo encosta o queixo" detectado como exame em andamento', () => {
  const detected = ctx.ClinicalTriggers.detectaExameEmAndamento('olha para baixo encosta o queixo');
  expect(detected).toBe(true);
});

test('[EXAM-PROGRESS-2] "consegue ver melhor assim ou assim" detectado como exame em andamento', () => {
  const detected = ctx.ClinicalTriggers.detectaExameEmAndamento('consegue ver melhor assim ou assim');
  expect(detected).toBe(true);
});

test('[EXAM-PROGRESS-3] "um ou dois primeira ou segunda fica mais claro" detectado como exame em andamento', () => {
  const detected = ctx.ClinicalTriggers.detectaExameEmAndamento('um ou dois primeira ou segunda fica mais claro');
  expect(detected).toBe(true);
});

test('[NO-AUTO-1] frases de exame em andamento NÃO disparam stop nem inject no hook runner', () => {
  speak('olha para baixo encosta o queixo fecha o outro');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  expect(ctx._injectCounts.exames).toBe(0);
  expect(ctx._injectCounts.blefarite).toBe(0);
});

test('[NO-AUTO-2] "consegue ver melhor assim ou assim" não dispara stop no hook runner', () => {
  speak('consegue ver melhor assim ou assim');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DO FALLBACK detectaEncerramentoNaFala (onstop pós-parada manual)
// ──────────────────────────────────────────────────────────────────────────────

test('[STOP-FALLBACK-1] frase forte em qualquer posição → encerramento detectado', () => {
  const t = 'qualquer dúvida me procura e a gente conversa sobre o resultado dos exames depois';
  expect(ctx.ClinicalTriggers.detectaEncerramentoNaFala(t)).toBe(true);
});

test('[STOP-FALLBACK-2] despedida curta no FIM do texto → encerramento detectado', () => {
  const t = 'então é isso a receita está pronta tchau';
  expect(ctx.ClinicalTriggers.detectaEncerramentoNaFala(t)).toBe(true);
});

test('[STOP-FALLBACK-3] despedida curta no MEIO do texto → NÃO detecta encerramento', () => {
  const t = 'falei tchau para ela no telefone e depois continuamos conversando sobre a cirurgia de catarata marcada';
  expect(ctx.ClinicalTriggers.detectaEncerramentoNaFala(t)).toBe(false);
});

test('[STOP-FALLBACK-4] saudação-despedida no FIM do texto → encerramento detectado', () => {
  const t = 'tem que vir antes para trocar para fazer um monte de flocao ta ok bom dia';
  expect(ctx.ClinicalTriggers.detectaEncerramentoNaFala(t)).toBe(true);
});

test('[STOP-FALLBACK-5] saudação de abertura no INÍCIO do texto → NÃO detecta encerramento', () => {
  const t = 'bom dia tudo bem pode sentar me conta o que está sentindo no olho direito ultimamente';
  expect(ctx.ClinicalTriggers.detectaEncerramentoNaFala(t)).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE REGRESSÃO — gatilhos antigos continuam funcionando
// ──────────────────────────────────────────────────────────────────────────────

test('[REGRESSION-STOP-1] "pode ir na recepção" ainda agenda stop (regressão)', () => {
  speak('pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[REGRESSION-STOP-2] "qualquer dúvida me procura" ainda agenda stop (regressão)', () => {
  speak('qualquer dúvida me procura');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[REGRESSION-STOP-3] "retorno em seis meses" ainda agenda stop (regressão)', () => {
  speak('retorno em seis meses');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[REGRESSION-DIL-1] "precisa dilatar" continua parando a gravação (regressão)', () => {
  speak('precisa dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[REGRESSION-DIL-2] "vou pingar o colirio" sozinho NÃO detecta dilatação (removido para evitar falso positivo)', () => {
  // Removido de DILATACAO_COMMANDS — "pingar o colirio" é genérico demais
  // (prescrição de blefarite/lubrificante). Só dispara combinado com "dilatar".
  speak('vou pingar o colírio');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(false);
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE NEGAÇÃO — frases negativas NÃO devem disparar hooks
// ──────────────────────────────────────────────────────────────────────────────

test('[NEG-1] "exames nao estao normais" NÃO dispara inject exames', () => {
  speak('seus exames nao estao normais');
  expect(ctx._injectCounts.exames).toBe(0);
});

test('[NEG-2] "exames não estão normais" (com acento) NÃO dispara inject', () => {
  speak('seus exames não estão normais');
  expect(ctx._injectCounts.exames).toBe(0);
});

test('[NEG-3] "nao tem catarata" NÃO seta flag catarataDetectada', () => {
  speak('nao tem catarata');
  expect(ctx._BRIDGE.examesNormaisInjetados).toBe(false);
  expect(ctx._injectCounts.exames).toBe(0);
});

test('[NEG-4] "sem blefarite" NÃO dispara inject blefarite', () => {
  speak('sem blefarite');
  expect(ctx._injectCounts.blefarite).toBe(0);
});

test('[NEG-5] frase positiva após negativa ainda dispara (negação não contamina)', () => {
  speak('nao tem blefarite seus exames estao normais');
  // "exames estao normais" deve disparar mesmo havendo negação antes de outro comando
  expect(ctx._injectCounts.exames).toBe(1);
});

test('[NEG-6] "exames estao normais" (sem negação) continua disparando inject (regressão)', () => {
  speak('seus exames estao normais');
  expect(ctx._injectCounts.exames).toBe(1);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE NEGAÇÃO COM CLÁUSULA "sem queixas" — janela de negação não deve
// bloquear comandos de exame normal que seguem uma cláusula "sem X" não-negadora
// ──────────────────────────────────────────────────────────────────────────────

test('[NEG-SEM-1] "sem queixas biomicroscopia sem alteracoes" → DEVE injetar exames', () => {
  speak('sem queixas biomicroscopia sem alterações');
  expect(ctx._injectCounts.exames).toBe(1);
});

test('[NEG-SEM-2] "sem queixas fundoscopia sem alteracoes" → DEVE injetar exames', () => {
  speak('sem queixas fundoscopia sem alterações');
  expect(ctx._injectCounts.exames).toBe(1);
});

test('[NEG-SEM-3] "paciente sem queixas fundo de olho normal" → DEVE injetar exames', () => {
  speak('paciente sem queixas fundo de olho normal');
  expect(ctx._injectCounts.exames).toBe(1);
});

test('[NEG-SEM-4] "sem queixas exames normais" → DEVE injetar exames', () => {
  speak('sem queixas exames normais');
  expect(ctx._injectCounts.exames).toBe(1);
});

test('[NEG-SEM-5] "sem blefarite" ainda NÃO dispara inject blefarite (guard preservado)', () => {
  speak('sem blefarite');
  expect(ctx._injectCounts.blefarite).toBe(0);
});

test('[NEG-SEM-6] "sem nenhuma blefarite" NÃO dispara inject blefarite (amplificador)', () => {
  speak('sem nenhuma blefarite');
  expect(ctx._injectCounts.blefarite).toBe(0);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE NORMALIZAÇÃO "pra" → "para" (PT-BR falado)
// ──────────────────────────────────────────────────────────────────────────────

test('[PRA-1] "vou pedir pra esperar la fora" → dilatacaoDetectada=true', () => {
  speak('vou pedir pra esperar la fora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[PRA-2] "vou pedir pra aguardar la fora" → dilatacaoDetectada=true', () => {
  speak('vou pedir pra aguardar la fora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[PRA-3] "vai pra fora esperar" → dilatacaoDetectada=true', () => {
  speak('vai pra fora esperar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[PRA-4] "pode ir pra fora aguardar" → dilatacaoDetectada=true', () => {
  speak('pode ir pra fora aguardar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[PRA-5] "colírio pra dilatar" → combo detectado via recentTextBuffer', () => {
  speak('vou colocar o colírio pra dilatar o olho');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES VARIANTES "vai la fora"
// ──────────────────────────────────────────────────────────────────────────────

test('[VAI-1] "vai la fora esperar" → dilatacaoDetectada=true', () => {
  speak('vai la fora esperar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[VAI-2] "vai la fora aguardar" → dilatacaoDetectada=true', () => {
  speak('vai la fora aguardar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

test('[VAI-3] "vai ali fora esperar" → dilatacaoDetectada=true', () => {
  speak('vai ali fora esperar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DE DETECÇÃO DE RUÍDO (DecisionEngine._guardTranscricaoIncoerente)
// ──────────────────────────────────────────────────────────────────────────────

const DecisionEngine = require('../src/DecisionEngine.js');

const NOISY_FIXTURE = 'entao toma essa moca ela nao e possivel familia merda talvez mata das vistas renovacao araguacu odela a perna trem que atinge';

function noiseTest(name, fn) {
  try {
    fn();
    results.push({ status: 'PASS', name });
    passCount++;
  } catch (e) {
    results.push({ status: 'FAIL', name, error: e.message });
    failCount++;
  }
}

noiseTest('[NOISE-1] transcrição ruidosa → noiseDetected=true e revisao_manual=true', () => {
  const raw = { tipo_consulta: 'retorno', dados: { diagnostico: 'Boa visão', conduta: 'Manter', tratamento: null } };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: NOISY_FIXTURE });
  expect(decision.clonedAIResponse.noiseDetected).toBe(true);
  expect(decision.clonedAIResponse.revisao_manual).toBe(true);
});

noiseTest('[NOISE-2] transcrição ruidosa → injectExamesNormais e injectBlefarite devem ser false', () => {
  const raw = { tipo_consulta: 'retorno', injectExamesNormais: true, injectBlefarite: true, dados: { diagnostico: 'x', conduta: 'y', tratamento: null } };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: NOISY_FIXTURE });
  // Com noiseDetected=true, campos críticos são nulados — injectExamesNormais permanece conforme
  // o LLM retornou (a reconciliação não bloqueia por noise, a camada de áudio bloqueia a injeção).
  // O que garantimos aqui é que diagnostico foi nulado pelo guard.
  expect(decision.clonedAIResponse.dados.diagnostico).toBe(null);
});

noiseTest('[NOISE-3] transcrição ruidosa → campos críticos nulados pelo DecisionEngine', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      diagnostico: 'Catarata bilateral',
      conduta: 'Cirurgia',
      tratamento: 'Colírio X',
      antecedentes_familiares: 'Pai com glaucoma',
      antecedentes_oftalmologicos: 'Cirurgia prévia',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: NOISY_FIXTURE });
  const d = decision.clonedAIResponse.dados;
  expect(d.diagnostico).toBe(null);
  expect(d.conduta).toBe(null);
  expect(d.tratamento).toBe(null);
  expect(d.antecedentes_familiares).toBe(null);
  expect(d.antecedentes_oftalmologicos).toBe(null);
});

noiseTest('[NOISE-4] _guardOculosNaConduta NÃO adiciona texto quando noiseDetected=true', () => {
  const raw = {
    tipo_consulta: 'retorno',
    noiseDetected: true,
    revisao_manual: true,
    dados: { conduta: 'Manter acompanhamento', tratamento: null },
  };
  // Usar transcrição legítima para que o guard de ruído não seja ativado pelo texto —
  // os flags já vêm setados na entrada (simula caso onde IA retornou invalida mas dados != null).
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'pressao ocular esta normal olho retina' });
  const conduta = decision.clonedAIResponse.dados && decision.clonedAIResponse.dados.conduta;
  if (conduta !== null) {
    expect(conduta.includes('Não houve prescrição de óculos')).toBe(false);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// LENTE DINÂMICA NA BIOMICROSCOPIA — getBiomicroscopiaComLente()
// Prioridade: opacidade cápsula > LIO > catarata > padrão.
// Caso 7 (regressão): paciente pseudofácico não pode receber "catarata".
// ──────────────────────────────────────────────────────────────────────────────

test('[LENTE-1] só catarata → lente vira "catarata"', () => {
  ctx._BRIDGE.catarataDetectada = true;
  const out = ctx._BRIDGE.getBiomicroscopiaComLente(ctx._BRIDGE.BIOMICROSCOPIA_NORMAL);
  expect(out.includes('catarata')).toBe(true);
});

test('[LENTE-2] só LIO → lente vira LIO (sem "catarata")', () => {
  ctx._BRIDGE.lioDetectada = true;
  const out = ctx._BRIDGE.getBiomicroscopiaComLente(ctx._BRIDGE.BIOMICROSCOPIA_NORMAL);
  expect(out.includes('cristalino transparente')).toBe(false);
  expect(out.includes('catarata')).toBe(false);
});

test('[LENTE-3] CASO 7: catarata + LIO juntas → LIO vence (NUNCA "catarata")', () => {
  ctx._BRIDGE.catarataDetectada = true;
  ctx._BRIDGE.lioDetectada = true;
  const out = ctx._BRIDGE.getBiomicroscopiaComLente(ctx._BRIDGE.BIOMICROSCOPIA_NORMAL);
  expect(out.includes('catarata')).toBe(false);
});

test('[LENTE-4] opacidade de cápsula tem prioridade máxima (acima de LIO)', () => {
  ctx._BRIDGE.opacidadeCapsulaDetectada = true;
  ctx._BRIDGE.lioDetectada = true;
  ctx._BRIDGE.catarataDetectada = true;
  const out = ctx._BRIDGE.getBiomicroscopiaComLente(ctx._BRIDGE.BIOMICROSCOPIA_NORMAL);
  expect(out.includes('catarata')).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// CATARATA DERIVADA DO DIAGNÓSTICO — parseCatarataFromDiagnostico()
// Regressão (log 2026-07-06): gatilho de voz CATARATA_COMMANDS não disparou (fala
// embaralhada), Gemini diagnosticou "H250 - Catarata senil incipiente AO", mas a
// biomicroscopia saiu com "cristalino transparente" contradizendo o diagnóstico.
// ──────────────────────────────────────────────────────────────────────────────

test('[CAT-DX-1] H250 senil incipiente → detected + grau incipiente', () => {
  const r = ctx._BRIDGE.parseCatarataFromDiagnostico('H250 - Catarata senil incipiente AO');
  expect(r.detected).toBe(true);
  expect(r.grau).toBe('incipiente');
});

test('[CAT-DX-2] regressão: H250 + blefarite sem gatilho de voz → lente vira "catarata incipiente"', () => {
  // Reproduz o caso real: diagnóstico com catarata, gatilho de voz não disparou.
  const dx = 'H250 - Catarata senil incipiente AO\nH529 - Transtorno de refração não especificado\nH010 - Blefarite bilateral';
  const r = ctx._BRIDGE.parseCatarataFromDiagnostico(dx);
  expect(r.detected).toBe(true);
  ctx._BRIDGE.catarataDetectada = true;
  ctx._BRIDGE.catarataGrau = r.grau;
  const out = ctx._BRIDGE.getBiomicroscopiaComLente(ctx._BRIDGE.BIOMICROSCOPIA_BLEFARITE);
  expect(out.includes('catarata incipiente')).toBe(true);
  expect(out.includes('cristalino transparente')).toBe(false);
});

test('[CAT-DX-3] palavra "catarata" em texto puro → detected', () => {
  const r = ctx._BRIDGE.parseCatarataFromDiagnostico('Catarata bilateral');
  expect(r.detected).toBe(true);
});

test('[CAT-DX-4] catarata secundária / H264 (pseudofácico) → NÃO detected', () => {
  expect(ctx._BRIDGE.parseCatarataFromDiagnostico('H264 - Catarata secundária').detected).toBe(false);
  expect(ctx._BRIDGE.parseCatarataFromDiagnostico('Opacidade de cápsula posterior').detected).toBe(false);
});

test('[CAT-DX-5] diagnóstico sem catarata → NÃO detected', () => {
  const r = ctx._BRIDGE.parseCatarataFromDiagnostico('H409 - Glaucoma\nH521 - Miopia');
  expect(r.detected).toBe(false);
  expect(r.grau).toBe(null);
});

test('[CAT-DX-6] diagnóstico nulo/vazio → NÃO detected (sem crash)', () => {
  expect(ctx._BRIDGE.parseCatarataFromDiagnostico(null).detected).toBe(false);
  expect(ctx._BRIDGE.parseCatarataFromDiagnostico('').detected).toBe(false);
});

test('[CAT-DX-7] regressão (2026-07-17): menção histórica "pós-cirurgia de catarata" → NÃO detected', () => {
  // Caso real: paciente pseudofácica (facectomia por catarata traumática), gatilho de
  // voz de LIO não disparou (STT quebrou "catarata" em "catara ta"). O Gemini gerou
  // "Ambliopia OD (pós-cirurgia de catarata traumática)" e a derivação por diagnóstico
  // marcava catarata ativa — biomicroscopia saía com "catarata" em olho já operado.
  const dx = 'H010 - Blefarite bilateral\nH521 - Miopia AO\nH530 - Ambliopia OD (pós-cirurgia de catarata traumática)';
  expect(ctx._BRIDGE.parseCatarataFromDiagnostico(dx).detected).toBe(false);
  expect(ctx._BRIDGE.parseCatarataFromDiagnostico('Pseudofacia OD (operado de catarata)').detected).toBe(false);
  expect(ctx._BRIDGE.parseCatarataFromDiagnostico('Facectomia prévia OE').detected).toBe(false);
});

test('[CAT-DX-8] catarata ativa + menção cirúrgica na mesma linha → ainda detected', () => {
  // A remoção do contexto histórico não pode engolir um diagnóstico real de catarata:
  // "indicada cirurgia de catarata" convive com a catarata ativa do olho fácico.
  const r = ctx._BRIDGE.parseCatarataFromDiagnostico('H250 - Catarata senil AO — indicada cirurgia de catarata');
  expect(r.detected).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// CASO 8 (regressão): "cirurgiada de catarata" marcava catarata presente.
// Causa: matching por substring sem fronteira de palavra — 'e catarata' casava
// dentro de "cirurgiada d[e catarata]". Regra: cirurgia JÁ REALIZADA seta LIO
// (que prevalece sobre catarata); explicação de cirurgia futura/planejada NÃO
// seta LIO — nesse caso a catarata do paciente fácico prevalece.
// ──────────────────────────────────────────────────────────────────────────────

test('[CASO8-1] "cirurgiada de catarata" NÃO seta catarata e seta LIO', () => {
  speak('ela adotou desculpa ela e cirurgiada de catarata em quanto tempo');
  expect(ctx._BRIDGE.catarataDetectada).toBe(false);
  expect(ctx._BRIDGE.lioDetectada).toBe(true);
});

test('[CASO8-2] "cirurgia de catarata" (menção histórica) NÃO seta catarata', () => {
  speak('alem da cirurgia de catarata e da limpeza ela ja teve algum outro tratamento');
  expect(ctx._BRIDGE.catarataDetectada).toBe(false);
});

test('[CASO8-3] diagnóstico real "tem catarata" ainda seta a flag', () => {
  speak('o senhor tem catarata no olho direito');
  expect(ctx._BRIDGE.catarataDetectada).toBe(true);
});

test('[CASO8-4] "isso e catarata" (fronteira de palavra legítima) ainda seta a flag', () => {
  speak('isso que embaca a vista e catarata mesmo');
  expect(ctx._BRIDGE.catarataDetectada).toBe(true);
});

test('[CASO8-5] "colocou duas lentes" seta LIO', () => {
  speak('catarata correcao colocou duas lentes pelo fato dela ser ruim de nascenca');
  expect(ctx._BRIDGE.lioDetectada).toBe(true);
});

test('[CASO8-6] "as lentes estao limpas" (plural) seta lente limpa + LIO', () => {
  speak('agora ta resolvido isso as lentes estao limpas');
  expect(ctx._BRIDGE.lenteLimpaDetectada).toBe(true);
  expect(ctx._BRIDGE.lioDetectada).toBe(true);
});

test('[CASO8-7] explicação de cirurgia FUTURA não seta LIO — catarata prevalece', () => {
  speak('o senhor tem catarata na cirurgia a gente tira a catarata e coloca a lente nova');
  expect(ctx._BRIDGE.catarataDetectada).toBe(true);
  expect(ctx._BRIDGE.lioDetectada).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// COBERTURA DAS CAMADAS DE ESTADO — SESSION_FLAG_DEFAULTS é a fonte da verdade
// Estes testes falham se uma flag nova for adicionada ao registro canônico sem
// ser registrada em StateManager / HOOK_STATE / __shospState (e vice-versa).
// ──────────────────────────────────────────────────────────────────────────────

const ALL_FLAGS = Object.keys(ctx._BRIDGE.SESSION_FLAG_DEFAULTS);

test('[FLAGS-1] StateManager cobre todas as flags do registro canônico (get+set sem throw)', () => {
  for (const name of ALL_FLAGS) {
    ctx._BRIDGE.StateManager.setHookFlag(name, true);
    expect(ctx._BRIDGE.StateManager.getHookFlag(name)).toBe(true);
  }
});

test('[FLAGS-2] HOOK_STATE cobre todas as flags do registro canônico', () => {
  for (const name of ALL_FLAGS) {
    if (!(name in ctx._BRIDGE.HOOK_STATE)) {
      throw new Error(`HOOK_STATE não cobre a flag '${name}'`);
    }
  }
});

test('[FLAGS-3] __shospState.snapshot().flags cobre todas as flags (nenhuma undefined)', () => {
  const flags = ctx._BRIDGE.shospState.snapshot().flags;
  for (const name of ALL_FLAGS) {
    if (!(name in flags) || flags[name] === undefined) {
      throw new Error(`snapshot().flags não cobre a flag '${name}'`);
    }
  }
});

test('[FLAGS-4] resetSession devolve TODAS as flags ao valor default', () => {
  // Suja todas as flags com valores não-default
  for (const name of ALL_FLAGS) {
    ctx._BRIDGE.StateManager.setHookFlag(name, name === 'catarataGrau' ? 'moderada' : true);
  }
  ctx._BRIDGE.StateManager.resetSession();
  for (const name of ALL_FLAGS) {
    const expected = ctx._BRIDGE.SESSION_FLAG_DEFAULTS[name];
    const actual = ctx._BRIDGE.StateManager.getHookFlag(name);
    if (actual !== expected) {
      throw new Error(`Flag '${name}' não resetada: esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
    }
  }
});

test('[FLAGS-5] REGRESSÃO: lenteLimpaDetectada da consulta anterior não bloqueia opacidade de cápsula na seguinte', () => {
  // Consulta 1: médico confirma lente limpa
  ctx._BRIDGE.lenteLimpaDetectada = true;
  // Nova consulta
  ctx._BRIDGE.StateManager.resetSession();
  ctx._BRIDGE.isRecording = true;
  // Consulta 2: médico dita opacidade de cápsula — o hook DEVE disparar
  speak('vejo opacidade de cápsula posterior');
  expect(ctx._BRIDGE.opacidadeCapsulaDetectada).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// TESTES DO GATE DE CAPTURA — condicionante conduta+tratamento no encerramento
// (usam speakSemCaptura: transcrição SEM o preâmbulo que satisfaz o gate)
// ──────────────────────────────────────────────────────────────────────────────

test('[GATE-1] despedida SEM conduta nem tratamento NÃO agenda stop — gravação continua', () => {
  speakSemCaptura('pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  expect(ctx._BRIDGE.isRecording).toBe(true);
});

test('[GATE-2] despedida com conduta mas SEM tratamento NÃO agenda stop', () => {
  speakSemCaptura('a conduta é retorno daqui a seis meses pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
});

test('[GATE-3] despedida com conduta E tratamento agenda stop normalmente', () => {
  speakSemCaptura('vou prescrever lubrificante uma gota três vezes ao dia retorno daqui a seis meses pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[GATE-4] após bloqueio, completar a captura NÃO encerra sozinho — exige NOVA despedida', () => {
  // 1) despedida sem tratamento → bloqueada (âncora avança)
  speakSemCaptura('a conduta é retorno daqui a seis meses pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  // 2) médico dita o tratamento — a despedida ANTIGA não pode reativar o stop
  //    (sem a âncora, a gravação pararia aqui, no meio do ditado da prescrição)
  speakSemCaptura('a conduta é retorno daqui a seis meses pode ir na recepção o tratamento é lubrificante uma gota três vezes ao dia');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  // 3) NOVA despedida após a captura completa → agora encerra
  speakSemCaptura('a conduta é retorno daqui a seis meses pode ir na recepção o tratamento é lubrificante uma gota três vezes ao dia pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[GATE-5] negativa explícita ("não precisa de tratamento") conta como tratamento captado', () => {
  speakSemCaptura('não precisa de tratamento por enquanto retorno daqui a seis meses pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[GATE-6] dilatação NÃO passa pelo gate — pausa mesmo sem conduta/tratamento', () => {
  speakSemCaptura('vou precisar dilatar espera lá fora');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[GATE-7] stop curto ("tchau") também passa pelo gate', () => {
  speakSemCaptura('então é isso tchau');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  speakSemCaptura('vou te encaminhar para o especialista o tratamento é lubrificante uma gota em cada olho tchau');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[GATE-8] checkCondutaTratamentoCaptados reporta o que falta', () => {
  const r1 = ctx.ClinicalTriggers.checkCondutaTratamentoCaptados('paciente veio para consulta de rotina');
  expect(r1.ok).toBe(false);
  expect(r1.conduta).toBe(false);
  expect(r1.tratamento).toBe(false);
  const r2 = ctx.ClinicalTriggers.checkCondutaTratamentoCaptados('vou te encaminhar para o glaucoma');
  expect(r2.conduta).toBe(true);
  expect(r2.tratamento).toBe(false);
  const r3 = ctx.ClinicalTriggers.checkCondutaTratamentoCaptados('retorno em um ano e usar lubrificante uma gota três vezes ao dia');
  expect(r3.ok).toBe(true);
});

test('[GATE-9] resetSession zera a âncora do gate (stopGateOffset)', () => {
  speakSemCaptura('pode ir na recepção'); // bloqueado — âncora avança
  expect(ctx._BRIDGE.stopGateOffset).not.toBe(0);
  ctx._BRIDGE.StateManager.resetSession();
  expect(ctx._BRIDGE.stopGateOffset).toBe(0);
});

// Caso real 2026-07-03: médico ditou conduta com fraseado natural (ajuste de
// óculos, ótica, consulta com dermatologista, "pode voltar aqui") e o gate
// bloqueou o encerramento com "falta ditar CONDUTA" — injeção automática não
// ocorreu, exigindo stop manual. Os marcadores abaixo cobrem essas formas.

test('[GATE-10] frases reais do log 2026-07-03 são reconhecidas como CONDUTA', () => {
  const casos = [
    'bom agora ajustar o oculos',
    'pede para otica retificar sem problema nenhum',
    'seria interessante fazer uma consulta com dermatologista',
    'tres quatro dias nao tiver bom pode voltar aqui que deve ter algum problema no oculos',
    'para o multifocal os extremos sao ruins',
    'ele ta com 1,75 para perto eu vou aumentar so um pouquinho o grau de perto',
  ];
  for (const frase of casos) {
    if (!ctx.ClinicalTriggers.detectaCondutaNaFala(frase)) {
      throw new Error(`Conduta NÃO detectada em: "${frase}"`);
    }
  }
});

test('[GATE-11] "otica" NÃO casa dentro de "antibiotica" (fronteira de palavra)', () => {
  expect(ctx.ClinicalTriggers.detectaCondutaNaFala('vou passar uma pomada antibiotica para voce')).toBe(false);
});

test('[GATE-12] REGRESSÃO log 2026-07-03: conduta natural + tratamento + "tchau" no fim → stop agenda', () => {
  // Resumo fiel da consulta real que ficou bloqueada
  speakSemCaptura(
    'pede para otica retificar o multifocal seria interessante fazer uma consulta com dermatologista ' +
    'faz dois minutos de compressa morna com shampoo de nenem e toma omega 3 dois por dia por um mes ' +
    'nao tiver bom pode voltar aqui ai tem mais bom dia tchau tchau'
  );
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

// Caso real 2026-07-06: conduta ditada como "vai ter que ir para um tipo de
// fogao" (STT corrompeu bifocal/multifocal) e "so se voce quiser trocar"
// (troca de óculos com substantivo implícito). O gate bloqueou "alguma
// pergunta alguma duvida" e "boa tarde" com "falta ditar CONDUTA", exigindo
// "encerrar consulta" forçado — mesmo com a conduta completa na fala.

test('[GATE-17] frases reais do log 2026-07-06 são reconhecidas como CONDUTA', () => {
  const casos = [
    'nao vai ser o suficiente ele vai ter que ir para um tipo de fogao',
    'nao da para ficar de boa so se voce quiser trocar ne',
    'ele vai tocar novos ou so se precisar vai trocar',
  ];
  for (const frase of casos) {
    if (!ctx.ClinicalTriggers.detectaCondutaNaFala(frase)) {
      throw new Error(`Conduta NÃO detectada em: "${frase}"`);
    }
  }
});

test('[GATE-18] REGRESSÃO log 2026-07-06: multifocal corrompido + lubrificante + despedida → stop agenda', () => {
  // Resumo da consulta real que ficou bloqueada. A despedida original era
  // "alguma pergunta alguma duvida" — removida de STOP_COMMANDS em 2026-07-15
  // (pergunta aberta, dispara no meio da explicação); trocada por despedida
  // com destino físico, o fraseado atual do médico.
  speakSemCaptura(
    'vai chegar uma hora que nao vai dar o de perto so ele vai ter que ir para um tipo de fogao ' +
    'nao da para ficar de boa so se voce quiser trocar ne ' +
    'e o lubrificante usa sem do o resto ta tudo em paz pode passar no balcao'
  );
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[GATE-13] "encerrar consulta" IGNORA o gate — para mesmo sem conduta/tratamento', () => {
  speakSemCaptura('pode encerrar a consulta');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[GATE-14] válvula de escape após bloqueio: despedida bloqueada + "encerrar consulta" → para', () => {
  speakSemCaptura('pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null); // bloqueado pelo gate
  speakSemCaptura('pode ir na recepção encerrar consulta');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null); // forçado
});

test('[GATE-15] "shampoo de nenem" conta como tratamento captado (log 2026-07-03)', () => {
  expect(ctx.ClinicalTriggers.detectaTratamentoNaFala('faz a limpeza com shampoo de nenem nos cilios')).toBe(true);
});

test('[GATE-16] "parar a gravação" também está no fallback pós-stop manual', () => {
  expect(ctx.ClinicalTriggers.detectaEncerramentoNaFala('pode parar a gravação por favor')).toBe(true);
});

// Caso real 2026-07-07: conduta ditada como "vem aqui falar comigo" (retorno
// condicional) e "o oculos nao precisamos mexer" (manutenção) — o gate
// bloqueou "boa viagem" e "boa tarde" com "falta ditar CONDUTA"; o médico
// ainda disse "consulta encerrado" e "fim da consulta" (não mapeados) antes
// de conseguir parar com "encerrar consulta".

test('[GATE-19] frases reais do log 2026-07-07 são reconhecidas como CONDUTA', () => {
  const casos = [
    'se daqui uns 15 dias voce ve que nao ta legal passa aqui para falar comigo',
    'em duas semanas ver que nao ta bom vem aqui falar comigo',
    'o oculos nao precisamos mexer',
    'enquanto a visao tiver boa para que que vai mexer',
    'provavelmente demora uns bons anos ate precisar mexer',
  ];
  for (const frase of casos) {
    if (!ctx.ClinicalTriggers.detectaCondutaNaFala(frase)) {
      throw new Error(`Conduta NÃO detectada em: "${frase}"`);
    }
  }
});

test('[GATE-20] REGRESSÃO log 2026-07-07: "vem aqui falar comigo" + tratamento + "boa viagem" → stop agenda', () => {
  speakSemCaptura(
    'vou passar com o tratamento para fazer um pouco mais forte para melhorar essa irritacao ' +
    'em duas semanas ver que nao ta bom vem aqui falar comigo conversa tranquilo boa viagem'
  );
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[GATE-21] declarações de fim ("consulta encerrada", "fim da consulta") ignoram o gate', () => {
  const frases = ['consulta encerrado', 'consulta finalizada', 'fim da consulta'];
  for (const frase of frases) {
    if (!ctx.ClinicalTriggers.detectaEncerramentoNaFala(`deixa eu sair daqui ja ${frase}`)) {
      throw new Error(`Encerramento NÃO detectado em: "${frase}"`);
    }
  }
  speakSemCaptura('deixa eu sair daqui ja fim da consulta');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null); // stop_forcado, sem gate
});

test('[GATE-22] válvula de escape: 2ª despedida DISTINTA sem captura LIBERA o encerramento', () => {
  // 1ª despedida sem conduta/tratamento → bloqueada (aviso + contador)
  speakSemCaptura('pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  expect(ctx._BRIDGE.stopGateBlockCount).toBe(1);
  // 2ª despedida distinta, ainda sem captura → válvula libera o stop
  speakSemCaptura('pode ir na recepção tudo de bom até a próxima consulta');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[GATE-23] válvula NÃO dispara com a MESMA despedida antiga no transcript (âncora preservada)', () => {
  // 1ª despedida bloqueada
  speakSemCaptura('a conduta é retorno daqui a seis meses pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  // transcript cresce SEM nova despedida — a antiga não reativa nem conta de novo
  speakSemCaptura('a conduta é retorno daqui a seis meses pode ir na recepção o tratamento é lubrificante uma gota três vezes ao dia');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  expect(ctx._BRIDGE.stopGateBlockCount).toBe(1);
});

test('[GATE-24] resetSession zera o contador da válvula (stopGateBlockCount)', () => {
  speakSemCaptura('pode ir na recepção');
  expect(ctx._BRIDGE.stopGateBlockCount).toBe(1);
  ctx._BRIDGE.StateManager.resetSession();
  expect(ctx._BRIDGE.stopGateBlockCount).toBe(0);
});

// Caso real 2026-07-15: consulta de refração PURA (correção de grau do óculos
// multifocal + pedido de lente de prova) — tratamento legitimamente inexistente
// (Gemini registrou tratamento: null). O gate bloqueou "alguma pergunta alguma
// duvida" com "falta ditar TRATAMENTO" e o médico teve que forçar com
// "encerrar consulta". Conduta refrativa agora satisfaz o requisito de
// tratamento no gate.

test('[GATE-25] frases reais do log 2026-07-15 são reconhecidas como CONDUTA REFRATIVA', () => {
  const casos = [
    'bom eu vou corrigir aqui o grau do oculos',
    'ai eu vou pedir uma lente de prova',
    'outra alternativa seria a gente ir para alem de multifocal',
  ];
  for (const frase of casos) {
    if (!ctx.ClinicalTriggers.detectaCondutaRefrativaNaFala(frase)) {
      throw new Error(`Conduta refrativa NÃO detectada em: "${frase}"`);
    }
  }
});

test('[GATE-26] conduta refrativa satisfaz o requisito de TRATAMENTO no gate', () => {
  const r = ctx.ClinicalTriggers.checkCondutaTratamentoCaptados(
    'eu vou corrigir aqui o grau do oculos e vou pedir uma lente de prova'
  );
  expect(r.conduta).toBe(true);
  expect(r.tratamento).toBe(true);
  expect(r.ok).toBe(true);
});

test('[GATE-27] REGRESSÃO log 2026-07-15: refração pura SEM tratamento + despedida → stop agenda', () => {
  speakSemCaptura(
    'de fato deu uma aumentadinha bem pouquinho eu vou corrigir aqui o grau do oculos ' +
    'ai eu vou pedir uma lente de prova ai pelo menos ela tira essa duvida em relacao a lente ' +
    'aqui ta a receita do oculos pode passar no balcao'
  );
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
  flushTimeouts();
  expect(ctx._BRIDGE.isRecording).toBe(false);
});

test('[GATE-28] conduta NÃO-refrativa sem tratamento continua bloqueada (gate preservado)', () => {
  speakSemCaptura('vou te encaminhar para o especialista de retina pode ir na recepção');
  expect(ctx._BRIDGE.stopCommandTimeout).toBe(null);
  expect(ctx._BRIDGE.isRecording).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// RELATÓRIO
// ──────────────────────────────────────────────────────────────────────────────

console.log('\n');
console.log('═══════════════════════════════════════════════════');
console.log('  SHOSP EXTENSION v5 — HOOKS DE FINAL DE CONSULTA');
console.log('═══════════════════════════════════════════════════');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon}  ${r.name}`);
  if (r.error) console.log(`      └─ ${r.error}`);
}
console.log('───────────────────────────────────────────────────');
console.log(`  Total: ${results.length}  |  ✅ ${passCount} passaram  |  ❌ ${failCount} falharam`);
console.log('═══════════════════════════════════════════════════\n');

process.exit(failCount > 0 ? 1 : 0);
