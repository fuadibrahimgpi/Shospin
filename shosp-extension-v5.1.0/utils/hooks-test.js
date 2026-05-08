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

const constantsSrc = readSrc('scripts/sidepanel-constants.js');
const hooksSrc     = readSrc('scripts/sidepanel-hooks.js');
const runnerSrc    = readSrc('scripts/sidepanel-hook-runner.js');

// ──────────────────────────────────────────────────────────────────────────────
// CÓDIGO MOCK + BRIDGE (injetado antes dos módulos)
// Declara mocks com var para que sejam propriedades do contexto global do vm.
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_SRC = `
var _injectCounts = { exames: 0, blefarite: 0, olhoIrritado: 0, stop: 0 };

function injectExamesNormaisDirect()     { _injectCounts.exames++; }
function injectBlefariteDirect()          { _injectCounts.blefarite++; }
function injectReceitaOlhoIrritadoDirect(){ _injectCounts.olhoIrritado++; }
function stopRecording() { _injectCounts.stop++; isRecording = false; }

`;

// Bridge: exposta ao escopo do vm via var, acessa os let do constants.js
// Definida DEPOIS dos módulos para garantir que os lets já existem.
const BRIDGE_SRC = `
var _BRIDGE = {
  get stopCommandTimeout()  { return stopCommandTimeout; },
  set stopCommandTimeout(v) { stopCommandTimeout = v; },
  get isRecording()         { return isRecording; },
  set isRecording(v)        { isRecording = v; },
  get dilatacaoDetectada()  { return dilatacaoDetectada; },
  set dilatacaoDetectada(v) { dilatacaoDetectada = v; },
  get examesNormaisInjetados()  { return examesNormaisInjetados; },
  set examesNormaisInjetados(v) { examesNormaisInjetados = v; },
  get blefariteInjetada()  { return blefariteInjetada; },
  set blefariteInjetada(v) { blefariteInjetada = v; },
  get lastTriggerTime()    { return lastTriggerTime; },
  set lastTriggerTime(v)   { lastTriggerTime = v; },
  resetFlags() {
    examesNormaisInjetados = false;
    blefariteInjetada      = false;
    receitaOlhoIrritadoInjetada = false;
    catarataDetectada      = false;
    lioDetectada           = false;
    opacidadeCapsulaDetectada = false;
    dilatacaoDetectada     = false;
    fundoscopiaDetectada   = false;
    lastTriggerTime        = 0;
    isRecording            = true;
    recentTextBuffer       = '';
  },
  normalizeText: normalizeText,
  runHooks: runHooks,
};
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
const fullSrc = [MOCK_SRC, constantsSrc, hooksSrc, runnerSrc, BRIDGE_SRC].join('\n\n// ───────\n\n');
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

function speak(finalText, interimText = '') {
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

test('[STOP-3] "algo que eu possa ajudar" agenda stop', () => {
  speak('algo que eu possa ajudar');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-4] "até a próxima consulta" agenda stop', () => {
  speak('até a próxima consulta');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
});

test('[STOP-5] "qualquer dúvida me liga" agenda stop', () => {
  speak('qualquer dúvida me liga');
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
  const normCurrent = ctx._BRIDGE.normalizeText('pode ir na recepção');
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

test('[STOP-11] "ficou alguma dúvida" agenda stop', () => {
  speak('ficou alguma dúvida');
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
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
// TESTES DO HOOK DE DILATAÇÃO
// ──────────────────────────────────────────────────────────────────────────────

test('[DIL-1] "precisa dilatar" → dilatacaoDetectada=true e stop agendado', () => {
  speak('precisa dilatar');
  expect(ctx._BRIDGE.dilatacaoDetectada).toBe(true);
  expect(ctx._BRIDGE.stopCommandTimeout).not.toBe(null);
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
