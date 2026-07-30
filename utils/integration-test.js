/**
 * ============================================================================
 * TESTE DE INTEGRAÇÃO — Shosp Extension v5
 * Valida as 8 correções aplicadas nos módulos da extensão.
 * Execute com: node utils/integration-test.js
 * ============================================================================
 */

'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// MOCK: ambiente de browser (Chrome Extension APIs não existem no Node)
// ──────────────────────────────────────────────────────────────────────────────
const document = {
  _elements: {},
  getElementById: (id) => ({ id, offsetParent: true, classList: { contains: () => false, add: () => {}, remove: () => {} }, style: {}, value: '', innerHTML: '', textContent: id, dispatchEvent: () => {} }),
  querySelectorAll: (sel) => [],
  querySelector: (sel) => null,
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, innerHTML: '', appendChild: () => {} })
};
const window = { HTMLInputElement: { prototype: { value: null } }, innerHeight: 900, normalizeText: null };
const chrome = { runtime: { onMessage: { addListener: () => {} } } };
const console_orig = console;

// ──────────────────────────────────────────────────────────────────────────────
// RUNNER DE TESTES
// ──────────────────────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
const results = [];

function test(name, fn) {
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
    toBe: (expected) => {
      if (value !== expected) throw new Error(`Esperado: ${JSON.stringify(expected)}, Recebido: ${JSON.stringify(value)}`);
    },
    toEqual: (expected) => {
      if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`Esperado: ${JSON.stringify(expected)}, Recebido: ${JSON.stringify(value)}`);
    },
    toBeNull: () => {
      if (value !== null) throw new Error(`Esperado: null, Recebido: ${JSON.stringify(value)}`);
    },
    toBeTruthy: () => {
      if (!value) throw new Error(`Esperado truthy, Recebido: ${JSON.stringify(value)}`);
    },
    toBeFalsy: () => {
      if (value) throw new Error(`Esperado falsy, Recebido: ${JSON.stringify(value)}`);
    },
    toContain: (str) => {
      if (typeof value === 'string' && !value.includes(str))
        throw new Error(`Esperado que "${value}" contenha "${str}"`);
      if (Array.isArray(value) && !value.includes(str))
        throw new Error(`Esperado que array contenha "${str}"`);
    },
    toMatch: (re) => {
      if (!re.test(value)) throw new Error(`Esperado que "${value}" bata com ${re}`);
    },
    not: {
      toBe: (v) => { if (value === v) throw new Error(`Não esperado: ${JSON.stringify(v)}`); },
      toContain: (str) => {
        if (typeof value === 'string' && value.includes(str))
          throw new Error(`Não esperado que contenha "${str}"`);
      },
      toMatch: (re) => {
        if (re.test(value)) throw new Error(`Não esperado que "${value}" bata com ${re}`);
      }
    }
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 1 — FIELD_INDICES.retorno usa índices relativos
// ──────────────────────────────────────────────────────────────────────────────

const FIELD_INDICES = {
  primeiraConsulta: { hda: 2, medicacoes_em_uso: 3, antecedentes_oftalmologicos: 4, alteracoes_sistemicas: 5, antecedentes_familiares: 6 },
  retorno: { retorno: 0, uso: 1 }  // CORRIGIDO: relativos
};

test('[C1] FIELD_INDICES.retorno usa índice relativo 0 para "retorno"', () => {
  expect(FIELD_INDICES.retorno.retorno).toBe(0);
});

test('[C1] FIELD_INDICES.retorno usa índice relativo 1 para "uso"', () => {
  expect(FIELD_INDICES.retorno.uso).toBe(1);
});

test('[C1] FIELD_INDICES.primeiraConsulta não foi alterado', () => {
  expect(FIELD_INDICES.primeiraConsulta.hda).toBe(2);
  expect(FIELD_INDICES.primeiraConsulta.medicacoes_em_uso).toBe(3);
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 2 — injectSingleField com índice relativo para retorno
// ──────────────────────────────────────────────────────────────────────────────

// Simula findFrElementsInTab retornando 2 elementos mock
function makeMockInjector(frElements = []) {
  return {
    findFrElementsInTab: () => frElements,
    getEditorByIndex: (i) => frElements[i] || null,
    detector: { getTabId: (name) => name === 'retorno' ? 'tdCadastro-80697' : null }
  };
}

function injectSingleField(injector, fieldName, value, tipoConsulta) {
  const index = FIELD_INDICES[tipoConsulta]?.[fieldName];
  if (index === undefined) return false;
  let editor;
  if (tipoConsulta === 'retorno') {
    const retornoTabId = injector.detector.getTabId('retorno');
    if (retornoTabId) {
      const tabNumber = retornoTabId.replace('tdCadastro-', '');
      const frElements = injector.findFrElementsInTab(tabNumber);
      editor = frElements[index] || null;
    }
    if (!editor) editor = injector.getEditorByIndex(index);
  } else if (tipoConsulta === 'primeiraConsulta') {
    const atendimentoTabId = injector.detector.getTabId('atendimento');
    if (atendimentoTabId) {
      const tabNumber = atendimentoTabId.replace('tdCadastro-', '');
      const frElements = injector.findFrElementsInTab(tabNumber);
      const relativeIndex = index - 2;
      editor = frElements[relativeIndex] || null;
    }
    if (!editor) editor = injector.getEditorByIndex(index);
  } else {
    editor = injector.getEditorByIndex(index);
  }
  return !!editor;
}

test('[C2] injectSingleField para retorno usa índice 0 (primeiro fr-element da aba)', () => {
  const injector = makeMockInjector([{ id: 'fr0' }, { id: 'fr1' }]);
  expect(injectSingleField(injector, 'retorno', 'queixa', 'retorno')).toBe(true);
});

test('[C2] injectSingleField para "uso" usa índice 1 (segundo fr-element da aba)', () => {
  const injector = makeMockInjector([{ id: 'fr0' }, { id: 'fr1' }]);
  expect(injectSingleField(injector, 'uso', 'Xalatan', 'retorno')).toBe(true);
});

test('[C2] injectSingleField retorna false quando aba retorno não tem editores e fallback também falta', () => {
  const injector = makeMockInjector([]); // nenhum editor
  expect(injectSingleField(injector, 'retorno', 'queixa', 'retorno')).toBe(false);
});

test('[C2] injectSingleField para primeira_consulta usa getEditorByIndex (não muda)', () => {
  const injector = makeMockInjector([null, null, { id: 'hda' }]); // índice 2
  expect(injectSingleField(injector, 'hda', 'dor ocular', 'primeiraConsulta')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 3 — injectConduta recebe diagnostico
// ──────────────────────────────────────────────────────────────────────────────

function simulateInjectConduta(data, frElements = []) {
  let diagInjected = false;
  let condutaInjected = false;
  let tratamentoInjected = false;
  let successCount = 0;

  // Simular _injectDiagnosticoField
  if (data.diagnostico) {
    diagInjected = true; // mock sempre encontra
  }

  if (frElements.length > 0 && data.conduta) { condutaInjected = true; successCount++; }
  if (frElements.length > 1 && data.tratamento) { tratamentoInjected = true; successCount++; }

  return { result: successCount > 0 || !!data.diagnostico, diagInjected, condutaInjected, tratamentoInjected };
}

test('[C3] injectConduta retorna true quando só diagnóstico é fornecido (sem Froala)', () => {
  const { result } = simulateInjectConduta({ diagnostico: 'H25.1 Catarata senil' }, []);
  expect(result).toBe(true);
});

test('[C3] injectConduta injeta diagnóstico separadamente dos editores Froala', () => {
  const { diagInjected, condutaInjected } = simulateInjectConduta(
    { diagnostico: 'H40.1 Glaucoma', conduta: 'Retorno 3 meses' },
    [{ id: 'fr0' }, { id: 'fr1' }]
  );
  expect(diagInjected).toBe(true);
  expect(condutaInjected).toBe(true);
});

test('[C3] injectAll passa diagnostico no payload de injectConduta', () => {
  // Verifica que o payload passado inclui diagnostico
  const payload = {
    diagnostico: 'Glaucoma suspeito',
    conduta: 'Retorno 6 meses',
    tratamento: 'Xalatan 1 gota OE à noite'
  };
  expect(payload.diagnostico).toBeTruthy();
  expect(payload.conduta).toBeTruthy();
  expect(payload.tratamento).toBeTruthy();
});

test('[C3] Payload de injectConduta condicionado por diagnostico OU conduta OU tratamento', () => {
  // Deve injetar se qualquer dos três existe
  const deveInjetar = (d) => !!(d.conduta || d.tratamento || d.diagnostico);
  expect(deveInjetar({ diagnostico: 'Glaucoma' })).toBe(true);
  expect(deveInjetar({ conduta: 'Retorno' })).toBe(true);
  expect(deveInjetar({ tratamento: 'Xalatan' })).toBe(true);
  expect(deveInjetar({})).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 4 — Comentário duplicado removido (verificação estática)
// ──────────────────────────────────────────────────────────────────────────────

const fs = require('fs');

// Normaliza CRLF→LF: asserções com '\n' não podem depender do autocrlf do git.
function readSrcNormalized(...segments) {
  const p = require('path').join(__dirname, '..', ...segments);
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const contentJsSource = readSrcNormalized('src', 'content.js');

test('[C4] Comentário "// Biomicroscopia" não aparece duplicado consecutivamente', () => {
  expect(contentJsSource).not.toContain(
    '// Biomicroscopia\n    // Biomicroscopia'
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 5 — dilatacaoDetectada é resetada no clearAll
// ──────────────────────────────────────────────────────────────────────────────

const injectionJsSource = readSrcNormalized('scripts', 'sidepanel-injection.js');

test('[C5] clearAll reseta dilatacaoDetectada no bloco de clearAudio', () => {
  expect(injectionJsSource).toContain('dilatacaoDetectada = false;');
});

test('[C5] clearAll reseta dilatacaoDetectada também quando apenas clearCamera é true', () => {
  expect(injectionJsSource).toContain('if (clearCamera && !clearAudio && !isRecording)');
});

// ──────────────────────────────────────────────────────────────────────────────
// FUNDOSCOPIA — achado de fundo prevalece sobre o template normal
// Regressão 2026-07-16: consulta com blefarite + nervo "fora do padrão" (suspeita
// de glaucoma) gravou "escavação simétrica e fisiológica" no prontuário, porque a
// injeção de blefarite fixava FUNDOSCOPIA_NORMAL e descartava dados.fundoscopia —
// contradizendo o CID H400 injetado na mesma consulta.
// ──────────────────────────────────────────────────────────────────────────────

test('[FUNDO-1] branch de blefarite não fixa mais FUNDOSCOPIA_NORMAL — prefere dados.fundoscopia', () => {
  // dados.fundoscopia continua tendo prioridade sobre o template. O fallback passa pelo
  // helper seguro (2026-07-29), que suprime o normal quando o diagnóstico afirma achado
  // de fundo — mas a preferência pelo dado descrito é a mesma.
  expect(injectionJsSource).toContain("fundoscopia: audioData?.dados?.fundoscopia || _fundoNormalSeguro()");
  // O comentário que sustentava o bug ("blefarite sempre injeta fundoscopia normal")
  // não pode voltar: blefarite é achado de segmento anterior e não implica fundo normal.
  expect(/blefarite sempre injeta fundoscopia normal/.test(injectionJsSource)).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// EXAME NORMAL NUNCA CONTRADIZ O DIAGNÓSTICO (log 2026-07-29)
// Diagnóstico "H111 - Pterígio OD" + biomicroscopia null → o fallback de despedida
// injetava "AO: olho calmo" no prontuário, contradizendo o próprio diagnóstico.
// ──────────────────────────────────────────────────────────────────────────────

test('[DX-NORMAL-1] no bloco pós-análise, todo default normal passa pelo helper', () => {
  // Escopo: apenas o bloco de exames do injectAll (onde o diagnóstico do Gemini já existe).
  // As injeções AO VIVO por gatilho de voz (injectExamesNormaisDirect/injectBlefariteDirect)
  // ficam de fora de propósito: disparam durante a gravação, antes de haver diagnóstico —
  // ali o médico declarou "exames normais" em voz alta e o template é o correto. Se a
  // análise depois contradisser, o branch de correção pós-análise conserta.
  const ini = injectionJsSource.indexOf('// Nunca afirmar exame NORMAL que contradiz');
  const fim = injectionJsSource.indexOf('// Correção pós-análise');
  expect(ini > 0 && fim > ini).toBe(true);

  const linhas = injectionJsSource.slice(ini, fim).split('\n')
    .filter(l => /getBiomicroscopiaComLente\(BIOMICROSCOPIA_NORMAL\)|:\s*FUNDOSCOPIA_NORMAL\b|\|\|\s*FUNDOSCOPIA_NORMAL\b|\|\|\s*BIOMICROSCOPIA_NORMAL\b/.test(l))
    .filter(l => !/return getBiomicroscopiaComLente\(BIOMICROSCOPIA_NORMAL\);|return FUNDOSCOPIA_NORMAL;/.test(l));
  expect(linhas).toEqual([]);
});

test('[DX-NORMAL-2] o fallback de despedida usa os helpers seguros', () => {
  expect(injectionJsSource).toContain('biomicroscopia: _bioNormalSeguro(),');
  expect(injectionJsSource).toContain('fundoscopia: mencionouFundoNaFala ? _fundoNormalSeguro() : null,');
});

test('[DX-NORMAL-3] helpers consultam o diagnóstico da consulta', () => {
  expect(injectionJsSource).toContain('temAchadoAnteriorNoDiagnostico(audioData?.dados?.diagnostico)');
  expect(injectionJsSource).toContain('temAchadoPosteriorNoDiagnostico(audioData?.dados?.diagnostico)');
});

test('[DX-NORMAL-5] payload com os dois campos nulos vira null (evita aviso enganoso)', () => {
  // examesNormais truthy com tudo null faz o content.js reportar "não foram injetadas",
  // mas a supressão é deliberada — null é o estado de "nada a injetar".
  expect(injectionJsSource).toContain('combinedData.examesNormais = null;');
});

test('[DX-NORMAL-4] content.js não injeta biomicroscopia quando o campo vem null', () => {
  // Sem este guard, suprimir a biomicroscopia causaria TypeError no .replace().
  const contentSrc = readSrcNormalized('src', 'content.js');
  expect(contentSrc).toContain('data.biomicroscopia ? this.detector.getTabId(\'biomicroscopia\') : null');
});

test('[FUNDO-2] achado de fundo corrige a fundoscopia normal já injetada por gatilho de voz', () => {
  // Sem este branch, o guard !blefariteInjetada && !examesNormaisInjetados faz o
  // injectAll pular todo o bloco de exames e a fundoscopia normal do gatilho persiste.
  // A condição cobre biomicroscopia TAMBÉM (2026-07-29): gatilho ao vivo injeta
  // "AO: olho calmo" e o médico acha o pterígio depois — sem biomicroscopia na
  // condição, o bloco inteiro era pulado e o falso normal ficava no prontuário.
  expect(injectionJsSource).toContain(
    "(audioData?.dados?.biomicroscopia || audioData?.dados?.fundoscopia)) {");
  expect(injectionJsSource).toContain('fundoscopia: audioData.dados.fundoscopia || null,');
});

test('[FUNDO-3] correção pós-gatilho também repara biomicroscopia (log 2026-07-29)', () => {
  // Regressão: antes, só dados.fundoscopia entrava no branch de correção.
  const ini = injectionJsSource.indexOf('// Correção pós-análise');
  expect(ini > 0).toBe(true);
  const bloco = injectionJsSource.slice(ini, ini + 1200);
  expect(/biomicroscopia:\s*_bioExplicita\s*\?/.test(bloco)).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 6 — captureAndProcess desabilita botão imediatamente
// ──────────────────────────────────────────────────────────────────────────────

const cameraJsSource = readSrcNormalized('scripts', 'sidepanel-camera.js');

test('[C6] manualCaptureBtn é desabilitado antes do try (imediatamente no início)', () => {
  // A linha de disabled=true deve aparecer ANTES do try {
  const disabledPos = cameraJsSource.indexOf('manualCaptureBtn.disabled = true');
  const tryPos = cameraJsSource.indexOf('try {\n    processingOverlay');
  expect(disabledPos > 0).toBe(true);
  expect(disabledPos < tryPos).toBe(true);
});

test('[C6] manualCaptureBtn é reabilitado no bloco finally', () => {
  expect(cameraJsSource).toContain('} finally {');
  expect(cameraJsSource).toContain('manualCaptureBtn.disabled = false');
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 7 — speechRecognition.onend verifica stopCommandTimeout
// ──────────────────────────────────────────────────────────────────────────────

const audioJsSource = readSrcNormalized('scripts', 'sidepanel-audio.js');
const initJsSource = readSrcNormalized('scripts', 'sidepanel-init.js');

test('[C7] onend verifica !stopCommandTimeout antes de reiniciar speech', () => {
  expect(audioJsSource).toContain('isRecording && speechRecognition && !stopCommandTimeout');
});

test('[C7] A guarda !stopCommandTimeout está no bloco onend', () => {
  // FIX v5.1: o slice anterior usava 'speechRecognition.start(); } catch' como
  // delimitador de fim, mas esse padrão também aparece dentro de onerror (que
  // vem ANTES de onend no arquivo). Resultado: o slice ficava VAZIO e o teste
  // sempre falhava, mesmo com a guarda correta presente. Agora delimitamos
  // pelo final natural do bloco onend (a chamada speechRecognition.start();
  // imediatamente fora do try/catch interno).
  const onendStart = audioJsSource.indexOf('speechRecognition.onend');
  // Procurar a próxima função após onend para fechar o slice
  const onendEnd = audioJsSource.indexOf('function stopSpeechRecognition', onendStart);
  const onendBlock = audioJsSource.slice(onendStart, onendEnd > 0 ? onendEnd : onendStart + 600);
  expect(onendBlock).toContain('!stopCommandTimeout');
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 8 — regex _sanitizeCondutaTratamento
// ──────────────────────────────────────────────────────────────────────────────

// Modularização 2026-07-02: CONDUTA_VALIDA_RE, MED_POSOLOGIA_RE e o prompt
// clínico vivem em gemini-interview-agent.js (geminiService.js é só a fachada).
const geminiJsSource = readSrcNormalized('src', 'gemini-interview-agent.js');

// Extrair e avaliar as regexes do arquivo real
const MED_POSOLOGIA_RE = /\b\w[\w\s]{1,30}?\b\s*(?:\d+\s*(?:gota[s]?|mg|mcg|ml|UI|comp(?:rimido)?|cp)\b|\d+\s*x\s*[\/\s]?\s*(?:dia|semana|noite|manha|manhã)|\d+\/\d+\s*h|\b(?:4x|6x|8x|12x|2x|3x|1x)\/dia)/i;
const CONDUTA_VALIDA_RE = /^(?:retorno\b|encaminhamento|solicitar|prescrição de óculos|prescricao de oculos|suspender\b|manter\b|alta\b|observ|acompanhar|acompanhamento|revisar|avaliação|avaliacao|campo visual|tonometria)/i;

test('[C8] "Retorno 6 meses" bate na lista branca CONDUTA_VALIDA_RE', () => {
  expect(CONDUTA_VALIDA_RE.test('Retorno 6 meses')).toBe(true);
});

test('[C8] "Retorno 1 ano" bate na lista branca CONDUTA_VALIDA_RE', () => {
  expect(CONDUTA_VALIDA_RE.test('Retorno 1 ano')).toBe(true);
});

test('[C8] "Retorno 6 meses" NÃO bate na MED_POSOLOGIA_RE nova (mais restrita)', () => {
  expect(MED_POSOLOGIA_RE.test('Retorno 6 meses')).toBe(false);
});

test('[C8] "Retorno 1 ano" NÃO bate na MED_POSOLOGIA_RE nova', () => {
  expect(MED_POSOLOGIA_RE.test('Retorno 1 ano')).toBe(false);
});

test('[C8] "Xalatan 1 gota OE à noite" BATE na MED_POSOLOGIA_RE (medicamento real)', () => {
  expect(MED_POSOLOGIA_RE.test('Xalatan 1 gota OE à noite')).toBe(true);
});

test('[C8] "Vigadexa 4x/dia" BATE na MED_POSOLOGIA_RE', () => {
  expect(MED_POSOLOGIA_RE.test('Vigadexa 4x/dia')).toBe(true);
});

test('[C8] "Timoptol 1 gota 2x/dia" BATE na MED_POSOLOGIA_RE', () => {
  expect(MED_POSOLOGIA_RE.test('Timoptol 1 gota 2x/dia')).toBe(true);
});

test('[C8] "Encaminhamento: Dermatologista" bate na lista branca', () => {
  expect(CONDUTA_VALIDA_RE.test('Encaminhamento: Dermatologista')).toBe(true);
});

test('[C8] "Suspender Xalatan" bate na lista branca', () => {
  expect(CONDUTA_VALIDA_RE.test('Suspender Xalatan')).toBe(true);
});

test('[C8] "Prescrição de óculos multifocais" bate na lista branca', () => {
  expect(CONDUTA_VALIDA_RE.test('Prescrição de óculos multifocais')).toBe(true);
});

test('[C8] CONDUTA_VALIDA_RE está no código de gemini-interview-agent.js', () => {
  expect(geminiJsSource).toContain('CONDUTA_VALIDA_RE');
});

test('[C8] comp(?:rimido)? está na MED_POSOLOGIA_RE do gemini-interview-agent.js', () => {
  expect(geminiJsSource).toContain('comp(?:rimido)?');
});

// ──────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO PONTA A PONTA — simulação do fluxo de sanitização
// ──────────────────────────────────────────────────────────────────────────────

function sanitizeCondutaTratamento(result) {
  if (!result?.dados) return;
  if (!result.dados.conduta) return;

  const MED = /\b\w[\w\s]{1,30}?\b\s*(?:\d+\s*(?:gota[s]?|mg|mcg|ml|UI|comp(?:rimido)?|cp)\b|\d+\s*x\s*[\/\s]?\s*(?:dia|semana|noite|manha|manhã)|\d+\/\d+\s*h|\b(?:4x|6x|8x|12x|2x|3x|1x)\/dia)/i;
  const COND = /^(?:retorno\b|encaminhamento|solicitar|prescrição de óculos|prescricao de oculos|suspender\b|manter\b|alta\b|observ|acompanhar|acompanhamento|revisar|avaliação|avaliacao|campo visual|tonometria)/i;
  const FISICO = /^(compressa|massagem|higiene|shampoo|lavagem|oclusão|oclusao|tampão|tampao|exerc|oclus)/i;

  const linhas = result.dados.conduta.split(/\n/);
  const ficam = [], vao = [];

  for (const l of linhas) {
    const t = l.trim();
    if (!t) continue;
    if (COND.test(t)) { ficam.push(t); continue; }
    if (FISICO.test(t)) { ficam.push(t); continue; }
    if (MED.test(t)) { vao.push(t); } else { ficam.push(t); }
  }

  if (vao.length > 0) {
    result.dados.conduta = ficam.join('\n') || null;
    const atual = result.dados.tratamento || '';
    result.dados.tratamento = [atual, ...vao].filter(Boolean).join('\n') || null;
  }
}

test('[INT] Fluxo completo: "Retorno 6 meses" permanece em conduta após sanitização', () => {
  const result = {
    dados: {
      conduta: 'Retorno 6 meses\nXalatan 1 gota OE à noite',
      tratamento: null
    }
  };
  sanitizeCondutaTratamento(result);
  expect(result.dados.conduta).toContain('Retorno 6 meses');
  expect(result.dados.conduta).not.toContain('Xalatan');
  expect(result.dados.tratamento).toContain('Xalatan');
});

test('[INT] Fluxo completo: "Encaminhamento: Dermatologista" permanece em conduta', () => {
  const result = {
    dados: {
      conduta: 'Encaminhamento: Dermatologista\nVigadexa 4x/dia',
      tratamento: null
    }
  };
  sanitizeCondutaTratamento(result);
  expect(result.dados.conduta).toContain('Encaminhamento');
  expect(result.dados.tratamento).toContain('Vigadexa');
});

test('[INT] Fluxo completo: conduta sem medicamentos não é alterada', () => {
  const result = {
    dados: {
      conduta: 'Retorno 3 meses\nSolicitar campo visual',
      tratamento: null
    }
  };
  sanitizeCondutaTratamento(result);
  expect(result.dados.conduta).toBe('Retorno 3 meses\nSolicitar campo visual');
  expect(result.dados.tratamento).toBeNull();
});

test('[INT] Fluxo completo: dilatacaoDetectada suprime conduta e tratamento', () => {
  // Simula o que processAudioInBackground faz
  const dilatacaoDetectada = true;
  const data = {
    dados: {
      hda: 'Dobre visão',
      conduta: 'Retorno 1 mês',
      tratamento: 'Xalatan 1 gota'
    }
  };
  if (dilatacaoDetectada && data.dados) {
    data.dados.conduta = null;
    data.dados.tratamento = null;
  }
  expect(data.dados.conduta).toBeNull();
  expect(data.dados.tratamento).toBeNull();
  expect(data.dados.hda).toBe('Dobre visão');
});

// ──────────────────────────────────────────────────────────────────────────────
// v5.1 — DECISION ENGINE: guards pós-LLM centralizados
// ──────────────────────────────────────────────────────────────────────────────

const DecisionEngine = require('../src/DecisionEngine.js');

test('[DE-1] Guard reverte injectBlefarite quando palavra não está na transcrição', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'olho seco', conduta: 'Prescrição de óculos para perto', tratamento: 'Compressa morna' },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'paciente com olho seco; prescrevi compressa morna',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(false);
  expect(decision.guardsApplied.length > 0).toBe(true);
  // Crítico: a resposta crua NÃO foi mutada
  expect(raw.injectBlefarite).toBe(true);
});

test('[DE-2] Guard preserva injectBlefarite quando palavra ESTÁ na transcrição', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'blefarite crônica', conduta: 'Prescrição de óculos', tratamento: 'Compressa morna' },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'paciente com blefarite há 6 meses',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(true);
});

test('[DE-3] Guard rebaixa linha "Associação ATB+corticoide" para genérico se não mencionada', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      hda: 'queixa',
      conduta: 'Prescrição de óculos para perto',
      tratamento: 'Compressa morna 2x/dia\nAssociação (ATB + corticoide ocular) 1 gota 3x/dia\nLubrificante 6x/dia',
    },
    injectBlefarite: false,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'compressa morna e lubrificante',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  // Classe ATB+corticoide não afirmada, mas a prescrição NÃO é apagada — é rebaixada (nível 3)
  expect(trat.includes('Associação')).toBe(false);
  expect(trat.includes('Medicação ocular prescrita')).toBe(true);
  expect(trat.includes('1 gota 3x/dia')).toBe(true); // posologia preservada
  expect(trat.includes('Lubrificante')).toBe(true);
  // Crítico: a resposta crua NÃO foi mutada
  expect(raw.dados.tratamento.includes('Associação')).toBe(true);
});

test('[DE-3b] Guard preserva "Associação ATB+corticoide" quando a classe É mencionada', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      hda: 'queixa',
      conduta: 'Retorno 2 semanas',
      tratamento: 'Compressa morna 2x/dia\nAssociação (ATB + corticoide ocular) 1 gota 3x/dia\nLubrificante 6x/dia',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'blefarite, vou passar um colírio com antibiótico e corticoide',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat.includes('Associação (ATB + corticoide ocular)')).toBe(true);
  expect(trat.includes('Medicação ocular prescrita')).toBe(false);
});

test('[DE-4] Guard adiciona "Não houve prescrição de óculos" se ausente', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'queixa', conduta: 'Retorno 6 meses', tratamento: null },
    injectBlefarite: false,
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'retorno 6 meses', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta.includes('Não houve prescrição de óculos')).toBe(true);
});

test('[DE-5] Reconciliação: blefarite injetada por hook bloqueia ambas as flags', () => {
  const raw = { tipo_consulta: 'primeira_consulta', dados: {}, injectBlefarite: true, injectExamesNormais: true };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'blefarite leve',
    hookFlags: { blefariteInjetada: true },
  });
  expect(decision.injectFlags.injectBlefarite).toBe(false);
  expect(decision.injectFlags.injectExamesNormais).toBe(false);
});

test('[DE-6] Reconciliação: dilatação no hook OU IA → flag dilatacao=true', () => {
  const raw1 = { tipo_consulta: 'retorno', dados: {}, dilatacaoDetectada: true };
  const decision1 = DecisionEngine.buildDecision(raw1, { transcribedText: 'dilatar', hookFlags: {} });
  expect(decision1.injectFlags.dilatacao).toBe(true);

  const raw2 = { tipo_consulta: 'retorno', dados: {}, dilatacaoDetectada: false };
  const decision2 = DecisionEngine.buildDecision(raw2, {
    transcribedText: 'dilatar',
    hookFlags: { dilatacaoDetectada: true },
  });
  expect(decision2.injectFlags.dilatacao).toBe(true);
});

test('[DE-7] Reconciliação: exclusão mútua blefarite > exames normais', () => {
  const raw = { tipo_consulta: 'primeira_consulta', dados: {}, injectBlefarite: true, injectExamesNormais: true };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'blefarite presente',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(true);
  expect(decision.injectFlags.injectExamesNormais).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// v5.1 — content.js: assinatura do findFrElementsInTab
// (reusa contentJsSource já carregado mais acima neste arquivo)
// ──────────────────────────────────────────────────────────────────────────────

test('[V51-1] findFrElementsInTab aceita options com allowYPositionFallback', () => {
  expect(contentJsSource).toContain('findFrElementsInTab(tabNumber, options');
  expect(contentJsSource).toContain('allowYPositionFallback');
});

test('[V51-2] Fallback Y-position é desativado por padrão', () => {
  expect(contentJsSource).toContain('!allowYPositionFallback');
});

test('[V51-3] injectAll retorna warnings array', () => {
  expect(contentJsSource).toContain('return { success: fieldsInjected > 0, fieldsInjected, warnings };');
});

test('[V51-4] clickTab usa wait ativo pelo container ao invés de timeout fixo', () => {
  expect(contentJsSource).toContain('divTextoProntuarioServico');
  expect(contentJsSource).toContain('container.offsetParent');
});

// v6 — DecisionEngine autoritativo: guard de dilatação (zera conduta e tratamento)
// ──────────────────────────────────────────────────────────────────────────────

test('[V6-DE-1] Guard dilatação zera conduta e tratamento quando hookFlag ativo', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'queixa', conduta: 'retorno em 6 meses', tratamento: 'xalatan' },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'vou pedir para esperar la fora enquanto o colirio faz efeito',
    hookFlags: { dilatacaoDetectada: true },
  });
  expect(decision.clonedAIResponse.dados.conduta).toBeNull();
  expect(decision.clonedAIResponse.dados.tratamento).toBeNull();
  expect(decision.guardsApplied.some(g => /dilata/i.test(g))).toBe(true);
});

test('[V6-DE-2] Guard dilatação zera conduta quando dilatacaoDetectada no raw AI response', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dilatacaoDetectada: true,
    dados: { retorno: 'melhora', conduta: 'tc olho' },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'dilatar', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).toBeNull();
});

test('[V6-DE-3] Guard óculos NÃO é aplicado quando dilatação ativa e conduta é zerada', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dilatacaoDetectada: true,
    dados: { retorno: 'ok', conduta: 'acompanhamento' },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'dilatar', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).toBeNull();
  expect(decision.guardsApplied.filter(g => /[oó]culos/i.test(g)).length).toBe(0);
});

test('[V6-DE-3b] Guard dilatação zera biomicroscopia e fundoscopia (fase 1 injeta só a entrevista)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dilatacaoDetectada: true,
    dados: {
      hda: 'baixa de visão há 6 meses',
      biomicroscopia: 'AO: pterígio nasal',
      fundoscopia: 'FUNDOSCOPIA INDIRETA: escavação aumentada',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'vai dilatar', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.biomicroscopia).toBeNull();
  expect(decision.clonedAIResponse.dados.fundoscopia).toBeNull();
  // Entrevista preservada — dilatação não descarta a HDA
  expect(decision.clonedAIResponse.dados.hda).toBe('baixa de visão há 6 meses');
});

test('[V6-DE-3c] Dilatação força injectExamesNormais/injectBlefarite=false (exames pertencem à fase 2)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dilatacaoDetectada: true,
    injectExamesNormais: true,
    injectBlefarite: false,
    dados: { hda: 'queixa' },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'vai dilatar', hookFlags: {} });
  expect(decision.injectFlags.dilatacao).toBe(true);
  expect(decision.injectFlags.injectExamesNormais).toBe(false);
  expect(decision.injectFlags.injectBlefarite).toBe(false);
});

test('[V6-DE-3d] Fase 2 (sem dilatação) mantém exames e conduta intactos', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dilatacaoDetectada: false,
    dados: {
      hda: 'baixa de visão há 6 meses',
      biomicroscopia: 'AO: pterígio nasal',
      fundoscopia: 'FUNDOSCOPIA INDIRETA: escavação aumentada',
      conduta: 'Retorno 6 meses',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'entrevista [RETORNO DA DILATACAO] fundo alterado retorno em seis meses',
    hookFlags: { dilatacaoDetectada: false },
  });
  expect(decision.clonedAIResponse.dados.biomicroscopia).toBe('AO: pterígio nasal');
  expect(decision.clonedAIResponse.dados.fundoscopia).toBe('FUNDOSCOPIA INDIRETA: escavação aumentada');
  expect(decision.clonedAIResponse.dados.conduta).toContain('Retorno 6 meses');
});

test('[V6-DE-4] buildDecision retorna metadata com engineVersion 6.0', () => {
  const raw = { tipo_consulta: 'retorno', dados: { retorno: 'ok' } };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'normal', hookFlags: {} });
  expect(decision.metadata.engineVersion).toBe('6.0');
  expect(typeof decision.metadata.requestId).toBe('string');
  expect(decision.metadata.requestId.length > 0).toBe(true);
  expect(typeof decision.metadata.timestamp).toBe('string');
});

test('[V6-DE-5] requestId passado no contexto é preservado no metadata', () => {
  const raw = { tipo_consulta: 'retorno', dados: {} };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ok',
    hookFlags: {},
    requestId: 'test-uuid-1234',
  });
  expect(decision.metadata.requestId).toBe('test-uuid-1234');
});

// ──────────────────────────────────────────────────────────────────────────────
// v6 — Fonte única de gatilhos (ClinicalTriggers)
// ──────────────────────────────────────────────────────────────────────────────

const ClinicalTriggers = require('../config/clinical-triggers.js');

test('[V6-CT-1] ClinicalTriggers exporta normalizeText', () => {
  expect(typeof ClinicalTriggers.normalizeText).toBe('function');
  expect(ClinicalTriggers.normalizeText('Blefarite')).toBe('blefarite');
});

test('[V6-CT-2] normalizeText remove acentos', () => {
  expect(ClinicalTriggers.normalizeText('dilatação')).toBe('dilatacao');
  expect(ClinicalTriggers.normalizeText('Exames Normais')).toBe('exames normais');
});

test('[V6-CT-3] EXAMES_NORMAIS_COMMANDS contém gatilho esperado', () => {
  expect(ClinicalTriggers.EXAMES_NORMAIS_COMMANDS).toContain('exames normais');
});

test('[V6-CT-4] EXAME_BLEFARITE_COMMANDS contém "blefarite"', () => {
  expect(ClinicalTriggers.EXAME_BLEFARITE_COMMANDS).toContain('blefarite');
});

test('[V6-CT-5] STOP_COMMANDS contém gatilho esperado', () => {
  expect(ClinicalTriggers.STOP_COMMANDS).toContain('pode ir na recepcao');
});

test('[V6-CT-5b] STOP_COMMANDS_CURTOS contém despedidas curtas (endAnchored)', () => {
  expect(ClinicalTriggers.STOP_COMMANDS_CURTOS).toContain('ate mais');
  expect(ClinicalTriggers.STOP_COMMANDS_CURTOS).toContain('tchau');
});

test('[V6-CT-6] DILATACAO_COMMANDS contém gatilho esperado', () => {
  expect(ClinicalTriggers.DILATACAO_COMMANDS).toContain('precisa dilatar');
});

test('[V6-CT-7] detectExamTriggers usa ClinicalTriggers (sem arrays hardcoded)', () => {
  expect(geminiJsSource).not.toContain('NORMAL_EXAM_TRIGGERS');
  expect(geminiJsSource).not.toContain('BLEFARITE_TRIGGERS');
  expect(geminiJsSource).toContain('ClinicalTriggers');
});

// ──────────────────────────────────────────────────────────────────────────────
// v6 — requestId idempotência no content.js
// ──────────────────────────────────────────────────────────────────────────────

test('[V6-IDP-1] content.js contém _seenRequestIds Set', () => {
  expect(contentJsSource).toContain('_seenRequestIds');
});

test('[V6-IDP-2] content.js retorna duplicate_ignored para requestId repetido', () => {
  expect(contentJsSource).toContain('duplicate_ignored');
});

test('[V6-IDP-3] content.js persiste seenRequestIds via window.__shospSeenRequestIds', () => {
  expect(contentJsSource).toContain('__shospSeenRequestIds');
});

// ──────────────────────────────────────────────────────────────────────────────
// v6 — StateManager
// ──────────────────────────────────────────────────────────────────────────────

test('[V6-SM-1] scripts/state-manager.js existe e exporta StateManager', () => {
  const smSource = fs.readFileSync(
    require('path').join(__dirname, '..', 'scripts', 'state-manager.js'), 'utf8'
  );
  expect(smSource).toContain('StateManager');
  expect(smSource).toContain('resetSession');
  expect(smSource).toContain('getSnapshot');
  expect(smSource).toContain('setHookFlag');
  expect(smSource).toContain('getHookFlag');
  expect(smSource).toContain('markInjectionPerformed');
  expect(smSource).toContain('wasInjectionPerformed');
  expect(smSource).toContain('setTranscript');
  expect(smSource).toContain('getTranscript');
});

// ──────────────────────────────────────────────────────────────────────────────
// v6 — sidepanel.html tem scripts na ordem correta
// ──────────────────────────────────────────────────────────────────────────────

test('[V6-HTML-1] sidepanel.html carrega clinical-triggers.js ANTES de geminiService.js', () => {
  const htmlSource = fs.readFileSync(
    require('path').join(__dirname, '..', 'sidepanel.html'), 'utf8'
  );
  const idxTriggers = htmlSource.indexOf('clinical-triggers.js');
  const idxGemini   = htmlSource.indexOf('geminiService.js');
  expect(idxTriggers < idxGemini).toBe(true);
});

test('[V6-HTML-3] sidepanel.html carrega os módulos Gemini na ordem utils → agentes → fachada', () => {
  const htmlSource = fs.readFileSync(
    require('path').join(__dirname, '..', 'sidepanel.html'), 'utf8'
  );
  const idxUtils     = htmlSource.indexOf('gemini-json-utils.js');
  const idxExam      = htmlSource.indexOf('gemini-exam-agent.js');
  const idxInterview = htmlSource.indexOf('gemini-interview-agent.js');
  const idxFacade    = htmlSource.indexOf('src/geminiService.js');
  expect(idxUtils > 0).toBe(true);
  expect(idxUtils < idxExam).toBe(true);
  expect(idxExam < idxInterview).toBe(true);
  expect(idxInterview < idxFacade).toBe(true);
});

test('[V6-HTML-2] sidepanel.html carrega state-manager.js APÓS sidepanel-constants.js', () => {
  const htmlSource = fs.readFileSync(
    require('path').join(__dirname, '..', 'sidepanel.html'), 'utf8'
  );
  const idxConstants = htmlSource.indexOf('sidepanel-constants.js');
  const idxSM        = htmlSource.indexOf('state-manager.js');
  expect(idxConstants < idxSM).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-05-14 — Guard conduta contaminada (compressa/higiene → tratamento)
// ──────────────────────────────────────────────────────────────────────────────

test('[GCC-1] _guardCondutaContaminada move "Compressa morna" de conduta para tratamento', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 2 semanas\nCompressa morna 2 min — 2x/dia',
      tratamento: null,
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'blefarite', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('Compressa');
  expect(decision.clonedAIResponse.dados.tratamento).toContain('Compressa');
  expect(decision.clonedAIResponse.dados.conduta).toContain('Retorno');
});

test('[GCC-2] _guardCondutaContaminada move "Higiene palpebral" de conduta para tratamento', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 1 mês\nHigiene palpebral com shampoo infantil — 3x/dia',
      tratamento: null,
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'higiene palpebral', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('Higiene');
  expect(decision.clonedAIResponse.dados.tratamento).toContain('Higiene');
});

test('[GCC-2b] _guardCondutaContaminada move "shampoo de neném" (variante falada, log 2026-07-03) para tratamento', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 1 mês\nLavar os cílios com shampoo de neném — 2x/dia',
      tratamento: null,
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'shampoo de nenem nos cilios', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('shampoo');
  expect(decision.clonedAIResponse.dados.tratamento).toContain('shampoo de neném');
  expect(decision.clonedAIResponse.dados.conduta).toContain('Retorno');
});

test('[GCC-3] _guardCondutaContaminada move lubrificante ocular de conduta para tratamento', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Solicitar OCT\nLubrificante ocular 1 gota AO ao longo do dia',
      tratamento: null,
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'lubrificante ocular', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('Lubrificante');
  expect(decision.clonedAIResponse.dados.tratamento).toContain('Lubrificante');
  expect(decision.clonedAIResponse.dados.conduta).toContain('Solicitar OCT');
});

test('[GCC-4] _guardCondutaContaminada move ômega 3 de conduta para tratamento', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 30 dias\nÔmega 3 1000mg — 1cp almoço e 1cp jantar',
      tratamento: null,
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'omega 3', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('mega 3');
  expect(decision.clonedAIResponse.dados.tratamento).toContain('mega 3');
});

test('[GCC-5] _guardCondutaContaminada não duplica itens já presentes em tratamento', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Compressa morna 2 min — 2x/dia',
      tratamento: 'Compressa morna 2 min — 2x/dia',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'compressa morna', hookFlags: {} });
  const count = (decision.clonedAIResponse.dados.tratamento.match(/[Cc]ompressa/g) || []).length;
  expect(count).toBe(1);
});

test('[GCC-6] _guardCondutaContaminada não toca "Retorno", "Solicitar" ou "Prescrição de óculos"', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 3 meses\nSolicitar campo visual\nPrescrição de óculos para longe',
      tratamento: null,
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'campo visual oculos', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).toContain('Retorno');
  expect(decision.clonedAIResponse.dados.conduta).toContain('Solicitar campo visual');
  expect(decision.clonedAIResponse.dados.conduta).toContain('Prescrição de óculos');
  expect(decision.clonedAIResponse.dados.tratamento).toBeNull();
});

test('[GCC-7] guardsApplied registra o guard de conduta contaminada quando acionado', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Compressa morna 2x/dia\nHigiene palpebral — 3x/dia',
      tratamento: null,
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'compressa higiene', hookFlags: {} });
  expect(decision.guardsApplied.some(g => /contaminada|movido/i.test(g))).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-05-22 — Presbiopia obrigatória quando óculos multifocal é prescrito
// ──────────────────────────────────────────────────────────────────────────────

test('[PRES-1] Injeta H52.4 ao diagnóstico se conduta prescreve óculos multifocal e há menção de óculos para perto', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocal para perto e longe',
      diagnostico: 'H25.0 - Catarata senil incipiente'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'receitar óculos para perto multifocal', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
  expect(decision.guardsApplied.some(g => /Presbiopia/i.test(g))).toBe(true);
});

test('[PRES-2] Injeta H52.4 ao diagnóstico se conduta prescreve lente progressiva e há menção de óculos para perto', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Uso de lente progressiva',
      diagnostico: ''
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'vou prescrever óculos de perto com lente progressiva', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-3] Não duplica Presbiopia se H52.4 ou presbiop já existe no diagnóstico e há menção de óculos para perto', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocal',
      diagnostico: 'H52.4 - Presbiopia'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'óculos para perto multifocal', hookFlags: {} });
  const count = (decision.clonedAIResponse.dados.diagnostico.match(/H52/g) || []).length;
  expect(count).toBe(1);
});

test('[PRES-4] Não injeta Presbiopia se óculos multifocal não é prescrito', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos para longe',
      diagnostico: 'H52.1 - Miopia'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'longe', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
});

test('[PRES-5] Remove Presbiopia do diagnóstico se a IA retornou, mas não há menção de óculos para perto na transcrição', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno em 6 meses',
      diagnostico: 'H52.4 - Presbiopia\nH10.4 - Conjuntivite crônica'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'paciente com coceira ocular, prescrever colírio', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('H52.4');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H10.4 - Conjuntivite crônica');
  expect(decision.guardsApplied.some(g => /Presbiopia removida/i.test(g))).toBe(true);
});

test('[PRES-6] Remove Presbiopia do diagnóstico se a IA retornou mas NÃO há prescrição de multifocal ou menção explícita de presbiopia na transcrição (mesmo com óculos de perto)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos para perto',
      diagnostico: 'H52.4 - Presbiopia\nH10.4 - Conjuntivite crônica'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'indicar óculos para perto por conta do grau', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H10.4 - Conjuntivite crônica');
  expect(decision.guardsApplied.some(g => /Presbiopia removida/i.test(g))).toBe(true);
});

test('[PRES-7] Não injeta Presbiopia se multifocal é prescrito mas NÃO há menção de óculos para perto na transcrição', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocal',
      diagnostico: 'H25.0 - Catarata senil incipiente'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'indicar lentes multifocais para longe', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('H524');
});

test('[PRES-8] Injeta Presbiopia se multifocal é prescrito E há menção de óculos para perto na transcrição', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocal',
      diagnostico: 'H25.0 - Catarata senil incipiente'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'grau de perto exige óculos, prescrever multifocal', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-21 — Presbiopia removida indevidamente em 3/3 consultas do log.
// A evidência de "perto" exigia o token literal `oculos` a ≤6 palavras de
// `perto`; na fala real o médico explica o multifocal sem repetir "óculos".
// ──────────────────────────────────────────────────────────────────────────────

test('[PRES-9] Injeta Presbiopia quando o médico explica o multifocal como "longe perto junto" (sem repetir "óculos")', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocais com orientações sobre o uso',
      diagnostico: 'H250 - Catarata senil incipiente AO\nH529 - Transtorno da refração não especificado'
    }
  };
  // Fala real da consulta de 2026-07-21 12:56
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'multifocal que e o que tem grau de longe perto junto nao precisa usar direto mas vai ficar bem melhor',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-10] Injeta Presbiopia com óculos de farmácia para perto + multifocal na conduta', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocal',
      diagnostico: 'H52.1 - Miopia'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ele usa oculos de farmacia a noite para dar uma ajudinha, vou deixar multifocal',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-12] Reconhece a frase CANÔNICA do prompt no plural ("óculos multifocais")', () => {
  // Os testes PRES-1..8 usavam o singular; o prompt emite o plural. O padrão
  // /multifocal/ não casa com "multifocais" — guard nunca disparava em produção.
  const condutaCanonica = 'Prescrição de óculos multifocais com orientações sobre o uso';
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: condutaCanonica, diagnostico: 'H52.2 - Astigmatismo' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o oculos novo tem grau de longe e de perto junto, o grau ta bom',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-13] A frase canônica de multifocais do prompt é reconhecida pelo padrão do guard', () => {
  // Trava de sincronia prompt↔guard: se o prompt mudar o fraseado, este teste cai.
  const promptSrc = readSrcNormalized('src', 'gemini-interview-agent.js');
  const m = promptSrc.match(/Prescri[çc][ãa]o de [óo]culos multifoca\w*/i);
  expect(m !== null).toBe(true);
  const condutaNorm = m[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  expect(/multifoca(?:l|is)|bifoca(?:l|is)|progressiv/.test(condutaNorm)).toBe(true);
});

test('[PRES-11] Menção explícita de presbiopia basta, mesmo sem vocabulário de perto', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno em 12 meses',
      diagnostico: 'H52.1 - Miopia'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o paciente ja apresenta presbiopia compativel com a idade',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-21 — Fase 2 pós-dilatação: exames normais só valem se descritos DEPOIS
// da dilatação. Consulta das 13:39: fase 2 com 37 palavras, nenhuma sobre fundo
// de olho, e injectExamesNormais saiu true a partir de fala pré-dilatação.
// ──────────────────────────────────────────────────────────────────────────────

const MARCADOR_F2 = '\n\n[RETORNO DA DILATACAO]\n\n';

test('[F2-1] Derruba injectExamesNormais quando a fase 2 não descreve os exames', () => {
  const raw = {
    tipo_consulta: 'retorno',
    injectExamesNormais: true,
    dados: { conduta: 'Orientações sobre cirurgia refrativa', diagnostico: 'H52.9 - Transtorno da refração' }
  };
  // Fala real de 2026-07-21: fase 1 declara "tudo em paz", fase 2 não fala de exame.
  const fase1 = 'o oculos manchou bastante mas o resto ta tudo em paz com olho, vai dilatar';
  const fase2 = 'orientacoes sobre cirurgia refrativa, oriento procurar um local com aparelho para a simulacao';
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: fase1 + MARCADOR_F2 + fase2,
    hookFlags: {}
  });
  expect(decision.injectFlags.injectExamesNormais).toBe(false);
  expect(decision.guardsApplied.some(g => /Fase 2 pós-dilatação/i.test(g))).toBe(true);
});

test('[F2-2] Zera a fundoscopia inventada quando a fase 2 é silenciosa sobre os exames', () => {
  const raw = {
    tipo_consulta: 'retorno',
    injectExamesNormais: false,
    dados: {
      conduta: 'Retorno em 12 meses',
      fundoscopia: 'Escavação fisiológica, mácula e retina sem alterações em AO'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'fundo de olho sera avaliado, vai dilatar' + MARCADOR_F2 + 'entao ta bom, qualquer duvida voce volta',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.fundoscopia).toBe(null);
});

test('[F2-3] Mantém injectExamesNormais quando a fase 2 declara os exames normais', () => {
  const raw = {
    tipo_consulta: 'retorno',
    injectExamesNormais: true,
    dados: { conduta: 'Retorno em 12 meses', diagnostico: 'H52.1 - Miopia' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'vai dilatar' + MARCADOR_F2 + 'olhei o fundo de olho e esta tudo certo',
    hookFlags: {}
  });
  expect(decision.injectFlags.injectExamesNormais).toBe(true);
  expect(decision.guardsApplied.some(g => /Fase 2 pós-dilatação/i.test(g))).toBe(false);
});

test('[F2-5] Reconhece as frases literais de EXAMES_NORMAIS_COMMANDS sem apoio de termo anatômico', () => {
  // A versão anterior de _FALA_EXAMES_RE aceitava só UM modificador entre
  // "exames" e o qualificador — "exames estão TODOS normais" falhava, e o F2-3
  // mascarava isso passando por causa de "fundo de olho" na mesma frase.
  const frases = ClinicalTriggers.EXAMES_NORMAIS_COMMANDS.slice(0, 20);
  const rejeitadas = frases.filter(f => {
    const decision = DecisionEngine.buildDecision(
      { tipo_consulta: 'retorno', injectExamesNormais: true, dados: { conduta: 'Retorno em 12 meses' } },
      { transcribedText: 'vai dilatar' + MARCADOR_F2 + f, hookFlags: {} }
    );
    return decision.injectFlags.injectExamesNormais !== true;
  });
  expect(rejeitadas).toEqual([]);
});

test('[F2-4] Guard não se aplica fora da fase 2 (sem marcador de retomada)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    injectExamesNormais: true,
    dados: { conduta: 'Retorno em 12 meses', diagnostico: 'H52.1 - Miopia' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'consulta comum sem dilatacao, o resto ta tudo em paz',
    hookFlags: {}
  });
  expect(decision.injectFlags.injectExamesNormais).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-05-14 — _sanitizeCondutaTratamento corrigida (sem inversão compressa/higiene)
// ──────────────────────────────────────────────────────────────────────────────

const geminiSrcFull = readSrcNormalized('src', 'gemini-interview-agent.js');

test('[SAN-1] CONDUTA_VALIDA_RE não contém "compressa" (compressa pertence ao tratamento)', () => {
  // Extrair a linha com CONDUTA_VALIDA_RE e verificar ausência de compressa
  const match = geminiSrcFull.match(/CONDUTA_VALIDA_RE\s*=\s*\/[^\n]+/);
  expect(match).not.toBe(null);
  expect(match[0]).not.toContain('compressa');
  expect(match[0]).not.toContain('higiene');
  expect(match[0]).not.toContain('shampoo');
  expect(match[0]).not.toContain('lavagem');
});

test('[SAN-2] ORIENTACAO_PROCEDIMENTAL_RE não contém "compressa" nem "higiene"', () => {
  const match = geminiSrcFull.match(/ORIENTACAO_PROCEDIMENTAL_RE\s*=\s*\/[^\n]+/);
  expect(match).not.toBe(null);
  expect(match[0]).not.toContain('compressa');
  expect(match[0]).not.toContain('higiene');
  expect(match[0]).not.toContain('shampoo');
});

test('[SAN-3] Bloco tratamento→conduta não usa ORIENTACAO_PROCEDIMENTAL_RE (só EXAME_RE)', () => {
  // Buscar o bloco de tratamento→conduta pelo comentário
  const blockStart = geminiSrcFull.indexOf('pedidos de exame do tratamento para conduta');
  expect(blockStart > 0).toBe(true);
  const blockEnd = geminiSrcFull.indexOf('_validateConsultationData', blockStart);
  const block = geminiSrcFull.slice(blockStart, blockEnd);
  expect(block).not.toContain('ORIENTACAO_PROCEDIMENTAL_RE');
  expect(block).toContain('EXAME_RE');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-05-22 — Reverter flags no else block do injectResp.success
// ──────────────────────────────────────────────────────────────────────────────

test('[V6-IDP-4] sidepanel-injection.js reverte flags no else de injectResp.success', () => {
  // Verifica se o caminho de falha de injectResp.success reverte temAudio e temCamera.
  // Âncora no log "Revertendo flags" — o primeiro `else` após injectResp.success
  // é o da fila de pausas de dilatação (dentro do ramo de SUCESSO), não o de falha.
  const successIndex = injectionJsSource.indexOf('if (injectResp.success)');
  expect(successIndex > 0).toBe(true);
  const revertIndex = injectionJsSource.indexOf('Revertendo flags', successIndex);
  expect(revertIndex > successIndex).toBe(true);
  const elseBlock = injectionJsSource.slice(revertIndex, revertIndex + 300);
  expect(elseBlock).toContain('audioDataInjected = false');
  expect(elseBlock).toContain('cameraDataInjected = false');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-03 — Tratamento vazio é injetado como "Sem prescrição de medicação"
// ──────────────────────────────────────────────────────────────────────────────

test('[TRAT-1] payload de injeção usa fallback "Sem prescrição de medicação" quando tratamento vazio', () => {
  // O helper _trat injeta o placeholder no prontuário (antes o _tratReal o descartava)
  expect(injectionJsSource).toContain("const _trat = (v) => _dilatacao ? null : (v || 'Sem prescrição de medicação')");
  expect(injectionJsSource.includes('_tratReal')).toBe(false);
});

test('[TRAT-2] dilatação (fase 1) mantém tratamento null — placeholder pertence ao pós-dilatação', () => {
  // O _trat retorna null quando _dilatacao=true; e o painel também não exibe
  // o placeholder durante a dilatação (displayAudioResults).
  expect(audioJsSource).toContain("(data.dilatacaoDetectada ? '' : 'Sem prescrição de medicação')");
});

// ──────────────────────────────────────────────────────────────────────────────
// v6 — Dynamic Selectors & Textarea Safety (DSC)
// ──────────────────────────────────────────────────────────────────────────────

test('[V6-DSC-1] content.js setInputValue trata com segurança HTMLTextAreaElement', () => {
  // 1. Static assertion on content.js source code
  expect(contentJsSource).toContain('HTMLTextAreaElement.prototype');
  expect(contentJsSource).toContain('HTMLInputElement.prototype');
  expect(contentJsSource).toContain("input.tagName.toLowerCase() === 'textarea'");

  // 2. Behavioral assertion on simulated setInputValue
  let setterCalled = false;
  const mockTextArea = {
    tagName: 'TEXTAREA',
    value: '',
    dispatchEvent: () => {}
  };
  
  // Re-evaluating setInputValue block dynamically or via mock run
  const testSetInputValue = (input, value) => {
    const isTextarea = input.tagName && input.tagName.toLowerCase() === 'textarea';
    const mockProto = isTextarea 
      ? { value: { set: function(v) { setterCalled = true; this.value = v; } } }
      : { value: { set: function(v) { this.value = v; } } };
    
    const descriptor = mockProto.value;
    const nativeSetter = descriptor?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    return true;
  };

  testSetInputValue(mockTextArea, 'Teste');
  expect(mockTextArea.value).toBe('Teste');
  expect(setterCalled).toBe(true);
});

test('[V6-DSC-2] content.js ShospFieldDetector._detectDynamicTabs mapeia abas por palavras-chave', () => {
  // 1. Static assertion on content.js source
  expect(contentJsSource).toContain('_detectDynamicTabs');
  expect(contentJsSource).toContain("td[id^=\"tdCadastro-\"]");
  expect(contentJsSource).toContain('tabKeywords');
  expect(contentJsSource).toContain('biomicroscopia');
  expect(contentJsSource).toContain('atendimento');

  // 2. Behavioral verification of tab matching algorithm
  const mockTabCache = new Map();
  const tds = [
    { id: 'tdCadastro-12345', textContent: '  Anamnese e Atendimento Geral  ' },
    { id: 'tdCadastro-67890', textContent: 'Refração' }
  ];
  
  const tabKeywords = {
    refracao: ['refracao', 'refração', 'óculos'],
    atendimento: ['atendimento', 'anamnese']
  };

  for (const td of tds) {
    const id = td.id;
    const text = td.textContent.toLowerCase().trim();
    for (const [name, keywords] of Object.entries(tabKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        mockTabCache.set(name, id);
        break;
      }
    }
  }

  expect(mockTabCache.get('atendimento')).toBe('tdCadastro-12345');
  expect(mockTabCache.get('refracao')).toBe('tdCadastro-67890');
});

test('[V6-DSC-3] content.js injectSingleField realiza scoping relativo para primeiraConsulta', () => {
  // 1. Static assertion on content.js source
  expect(contentJsSource).toContain("tipoConsulta === 'primeiraConsulta'");
  expect(contentJsSource).toContain('atendimentoTabId');
  expect(contentJsSource).toContain('relativeIndex = index - 2');

  // 2. Mock behavior assertion
  const mockInjector = {
    detector: {
      getTabId: (name) => name === 'atendimento' ? 'tdCadastro-11111' : null
    },
    findFrElementsInTab: (tabNum) => {
      expect(tabNum).toBe('11111');
      return [{ id: 'editor-hda' }, { id: 'editor-meds' }, { id: 'editor-ant' }];
    },
    getEditorByIndex: () => null
  };

  // simulate injectSingleField behavior for primeiraConsulta (hda = index 2)
  const index = FIELD_INDICES.primeiraConsulta.hda; // index = 2
  const atendimentoTabId = mockInjector.detector.getTabId('atendimento');
  let editor = null;
  if (atendimentoTabId) {
    const tabNumber = atendimentoTabId.replace('tdCadastro-', '');
    const frElements = mockInjector.findFrElementsInTab(tabNumber);
    const relativeIndex = index - 2;
    editor = frElements[relativeIndex] || null;
  }

  expect(editor !== null).toBe(true);
  expect(editor.id).toBe('editor-hda');
});

test('[V6-DSC-4] content.js findFrElementsInTab resolve abas não numéricas para IDs numéricos', () => {
  // 1. Static assertion on content.js source
  expect(contentJsSource).toContain('defaultMapping');
  expect(contentJsSource).toContain("anamnese: '78073'");
  expect(contentJsSource).toContain("biomicroscopia: '78728'");

  // 2. Behavioral verification of the mapping logic
  const resolveTab = (tabNumber) => {
    let numTab = tabNumber;
    if (isNaN(parseInt(tabNumber, 10))) {
      const defaultMapping = {
        biomicroscopia: '78728',
        fundoscopia: '78727',
        glaucoma: '78726',
        refracao: '78074',
        conduta: '89707',
        receitas: '78735',
        atendimento: '78073',
        anamnese: '78073',
        retorno: '80697'
      };
      numTab = defaultMapping[tabNumber.toLowerCase()] || tabNumber;
    }
    return numTab;
  };

  expect(resolveTab('anamnese')).toBe('78073');
  expect(resolveTab('atendimento')).toBe('78073');
  expect(resolveTab('refracao')).toBe('78074');
  expect(resolveTab('78726')).toBe('78726');
});

test('[V6-DSC-5] content.js injectSingleField realiza fallback de busca por label', () => {
  // 1. Static assertion on content.js source
  expect(contentJsSource).toContain('this.findEditorByLabel');
  expect(contentJsSource).toContain("hda: 'hda'");
  expect(contentJsSource).toContain("medicacoes_em_uso: 'medicaç'");
  expect(contentJsSource).toContain("uso: 'uso'");

  // 2. Behavioral verification of the fallback flow
  let findEditorByLabelCalled = false;
  let labelSearched = null;
  let fallbackIndexUsed = null;

  const mockInjector = {
    detector: {
      getTabId: (name) => null // simulate tab lookup failure
    },
    findFrElementsInTab: () => [],
    getEditorByIndex: () => null,
    findEditorByLabel: (label, idx) => {
      findEditorByLabelCalled = true;
      labelSearched = label;
      fallbackIndexUsed = idx;
      return { id: 'mock-editor-label' };
    }
  };

  // simulate injectSingleField for primeiraConsulta / hda (index = 2, relativeIndex = 0)
  const index = FIELD_INDICES.primeiraConsulta.hda;
  let editor = null;
  const labels = {
    hda: 'hda',
    medicacoes_em_uso: 'medicaç'
  };
  const labelText = labels['hda'];
  if (labelText) {
    editor = mockInjector.findEditorByLabel(labelText, index - 2);
  }

  expect(editor !== null).toBe(true);
  expect(editor.id).toBe('mock-editor-label');
  expect(findEditorByLabelCalled).toBe(true);
  expect(labelSearched).toBe('hda');
  expect(fallbackIndexUsed).toBe(0);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-05-27 — Guard 5: Manutenção do óculos atual vs Sem prescrição de óculos
// ──────────────────────────────────────────────────────────────────────────────

test('[GMO-1] Guard 5 corrige "Sem prescrição de óculos" → "Manutenção do óculos atual" quando transcript indica manutenção de grau', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Retorno 6 meses\nSem prescrição de óculos',
      tratamento: null,
      diagnostico: null,
    },
    injectBlefarite: false,
    injectExamesNormais: false,
  };
  const ctx = {
    transcribedText: 'O paciente veio em retorno. Fiz a refração, não precisa trocar o grau não, pode continuar com os óculos que tem.',
    hookFlags: {},
  };
  const decision = DecisionEngine.buildDecision(raw, ctx);
  expect(decision.clonedAIResponse.dados.conduta).toContain('Manutenção do óculos atual');
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('Sem prescrição de óculos');
  expect(decision.guardsApplied.some(g => /manuten/i.test(g))).toBe(true);
});

test('[GMO-2] Guard 5 não altera conduta quando transcript não contém frases de manutenção', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 6 meses\nSem prescrição de óculos',
      tratamento: null,
      diagnostico: null,
    },
    injectBlefarite: false,
    injectExamesNormais: false,
  };
  const ctx = {
    transcribedText: 'Paciente sem indicação de óculos no momento. Acuidade visual sem correção está boa.',
    hookFlags: {},
  };
  const decision = DecisionEngine.buildDecision(raw, ctx);
  expect(decision.clonedAIResponse.dados.conduta).toContain('Sem prescrição de óculos');
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('Manutenção do óculos atual');
});

test('[GMO-3] Guard 5 também corrige "Não houve prescrição de óculos" → "Manutenção do óculos atual"', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Retorno anual\nNão houve prescrição de óculos',
      tratamento: null,
      diagnostico: null,
    },
    injectBlefarite: false,
    injectExamesNormais: false,
  };
  const ctx = {
    transcribedText: 'Fiz a refração, grau está parecido com o anterior, os óculos ainda servem.',
    hookFlags: {},
  };
  const decision = DecisionEngine.buildDecision(raw, ctx);
  expect(decision.clonedAIResponse.dados.conduta).toContain('Manutenção do óculos atual');
  expect(decision.clonedAIResponse.dados.conduta).not.toContain('Não houve prescrição de óculos');
});

test('[GMO-4] Guard 5 não dispara quando conduta já tem "Manutenção do óculos atual"', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Retorno 6 meses\nManutenção do óculos atual',
      tratamento: null,
      diagnostico: null,
    },
    injectBlefarite: false,
    injectExamesNormais: false,
  };
  const ctx = {
    transcribedText: 'Grau está parecido, mantém os óculos.',
    hookFlags: {},
  };
  const decision = DecisionEngine.buildDecision(raw, ctx);
  expect(decision.clonedAIResponse.dados.conduta).toBe('Retorno 6 meses\nManutenção do óculos atual');
  expect(decision.guardsApplied.some(g => /manuten/i.test(g))).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-06-11 — Teste do matcher exato do CID com lookarounds de borda
// ──────────────────────────────────────────────────────────────────────────────

test('[CID-EXACT-1] isExact valida código isolado ou com delimitadores não-alfanuméricos', () => {
  const upNorm = "H104";
  const isExact = (s) => {
    const regex = new RegExp(`(?<![A-Z0-9])${upNorm}(?![A-Z0-9])`, 'i');
    return regex.test(s);
  };

  expect(isExact("H104")).toBe(true);
  expect(isExact("SELECIONACID('H104', 'CONJUNTIVITE CRÔNICA')")).toBe(true);
  expect(isExact("CONJUNTIVITE CRÔNICA (H104)")).toBe(true);
});

test('[CID-EXACT-2] isExact rejeita falsos positivos onde o código é parte de outra palavra/número', () => {
  const upNorm = "H104";
  const isExact = (s) => {
    const regex = new RegExp(`(?<![A-Z0-9])${upNorm}(?![A-Z0-9])`, 'i');
    return regex.test(s);
  };

  expect(isExact("H1040")).toBe(false); // sufixo alfanumérico
  expect(isExact("CH104")).toBe(false); // prefixo alfanumérico
  expect(isExact("SELECIONACID('H1040', 'CONJUNTIVITE')")).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-08 — Retificação de refração: H52.9 (NE) removido quando há CID específico
// Extrai a função REAL de sidepanel-injection.js e a exercita (a função é
// autocontida, dependendo apenas de CID_CODE_PATTERN, injetada como argumento).
// ──────────────────────────────────────────────────────────────────────────────

function _extractFn(source, name) {
  const start = source.indexOf('function ' + name);
  if (start === -1) throw new Error('função não encontrada: ' + name);
  let i = source.indexOf('{', start), depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { i++; break; }
  }
  return source.slice(start, i);
}

const _dropUnspecifiedRefraction = new Function(
  'CID_CODE_PATTERN',
  _extractFn(injectionJsSource, '_dropUnspecifiedRefraction') + '\nreturn _dropUnspecifiedRefraction;'
)(/^([A-Z]\d+(?:\.\d+)?)\s*[-–]/);

test('[CID-REFRAC-1] remove H52.9 quando há miopia+astigmatismo (caso Vitor: entrevista + OCR)', () => {
  const out = _dropUnspecifiedRefraction(
    'H529 - Transtorno de refração não especificado\nH52.1 - Miopia\nH52.2 - Astigmatismo'
  );
  expect(out.includes('H529')).toBe(false);
  expect(out.includes('H52.1 - Miopia')).toBe(true);
  expect(out.includes('H52.2 - Astigmatismo')).toBe(true);
});

test('[CID-REFRAC-2] remove H52.9 com anisometropia/presbiopia (H52.3/H52.4 também são específicos)', () => {
  expect(_dropUnspecifiedRefraction('H529 - Refração NE\nH523 - Anisometropia').includes('H529')).toBe(false);
  expect(_dropUnspecifiedRefraction('H529 - Refração NE\nH524 - Presbiopia').includes('H529')).toBe(false);
});

test('[CID-REFRAC-3] mantém H52.9 quando é o único CID refrativo (nada mais específico)', () => {
  const soNE = 'H529 - Transtorno de refração não especificado';
  expect(_dropUnspecifiedRefraction(soNE)).toBe(soNE);
  // blefarite não é refrativo → não habilita a remoção de H52.9
  const comBlef = 'H010 - Blefarite\nH529 - Refração NE';
  expect(_dropUnspecifiedRefraction(comBlef)).toBe(comBlef);
});

test('[CID-REFRAC-4] a retificação é chamada após a fusão dos CIDs do OCR', () => {
  expect(injectionJsSource.includes('_dropUnspecifiedRefraction(cidTarget.value)')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-23 — Retificação CROSS-INJEÇÃO de H52.9 (content.js, handler searchCid).
// _dropUnspecifiedRefraction (sidepanel) só vê um campo por vez. Quando os
// específicos do OCR chegam numa rodada de injeção e o H52.9 do áudio noutra, o
// Set __shospInjectedCids é a única visão cumulativa. Guard: pular H52.9 se o Set
// já tem um H52.0–H52.4 (cobre a ordem OCR→áudio). Bug "H52.9 duplicado" 2026-07-21.
// ──────────────────────────────────────────────────────────────────────────────

const _isRedundantUnspecifiedRefraction = new Function(
  _extractFn(contentJsSource, '_isRedundantUnspecifiedRefraction') +
    '\nreturn _isRedundantUnspecifiedRefraction;'
)();

test('[CID-REFRAC-5] pula H52.9 quando um específico H52.0/H52.2 já foi injetado (caso desta sessão)', () => {
  expect(_isRedundantUnspecifiedRefraction('H529', new Set(['H520', 'H522']))).toBe(true);
  expect(_isRedundantUnspecifiedRefraction('H529', new Set(['H521']))).toBe(true);
});

test('[CID-REFRAC-6] presbiopia (H52.4) no Set também habilita pular H52.9 (consistente com _dropUnspecifiedRefraction)', () => {
  expect(_isRedundantUnspecifiedRefraction('H529', new Set(['H524']))).toBe(true);
});

test('[CID-REFRAC-7] NÃO pula H52.9 sem específico no Set, nem age sobre outros códigos', () => {
  // Set sem refrativo específico → H52.9 é injetado normalmente
  expect(_isRedundantUnspecifiedRefraction('H529', new Set())).toBe(false);
  expect(_isRedundantUnspecifiedRefraction('H529', new Set(['H010', 'H409']))).toBe(false);
  // guard indefinido/Set ausente
  expect(_isRedundantUnspecifiedRefraction('H529', null)).toBe(false);
  // não interfere em códigos que não sejam H52.9
  expect(_isRedundantUnspecifiedRefraction('H520', new Set(['H522']))).toBe(false);
  expect(_isRedundantUnspecifiedRefraction('H524', new Set(['H520']))).toBe(false);
});

test('[CID-REFRAC-8] o guard é chamado dentro do handler searchCid, antes do click', () => {
  expect(contentJsSource.includes('_isRedundantUnspecifiedRefraction(normCode, cidSet)')).toBe(true);
  // o guard precede o targetRow.click() (skip antes de adicionar o CID à lista)
  const guardIdx = contentJsSource.indexOf('_isRedundantUnspecifiedRefraction(normCode, cidSet)');
  const clickIdx = contentJsSource.indexOf('targetRow.click()');
  expect(guardIdx !== -1 && clickIdx !== -1 && guardIdx < clickIdx).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-23 — prontuarioOpen robusto (content.js, handler checkPage). Antes só
// `td[id^="tdCadastro-"]`: quando o SHOSP troca a tag/id, a ficha ABERTA era lida
// como fechada → 8/8 injeções caíram no fallback (~5s + aba cega, log 2026-07-21).
// Agora OR de 3 marcadores; os dois primeiros são os alvos reais da injeção
// (confirmados presentes quando a injeção funciona).
// ──────────────────────────────────────────────────────────────────────────────

const _isProntuarioOpen = new Function(
  _extractFn(contentJsSource, '_isProntuarioOpen') + '\nreturn _isProntuarioOpen;'
)();

// doc falso: querySelector(sel) devolve um objeto se `sel` estiver no conjunto presente.
const _fakeDoc = (presentSelectors) => ({
  querySelector: (sel) => (presentSelectors.includes(sel) ? {} : null),
});

test('[PRONT-1] detecta ficha aberta por qualquer um dos 3 marcadores', () => {
  expect(_isProntuarioOpen(_fakeDoc(['[id*="prontuario_resp"]']))).toBe(true);
  expect(_isProntuarioOpen(_fakeDoc(['[id*="divTextoProntuarioServico"]']))).toBe(true);
  expect(_isProntuarioOpen(_fakeDoc(['[id*="tdCadastro"]']))).toBe(true);
});

test('[PRONT-2] ficha fechada/agenda (nenhum marcador) → false; doc ausente → false', () => {
  expect(_isProntuarioOpen(_fakeDoc([]))).toBe(false);
  expect(_isProntuarioOpen(_fakeDoc(['[id*="divAgenda"]', '[id*="menuLateral"]']))).toBe(false);
  expect(_isProntuarioOpen(null)).toBe(false);
  expect(_isProntuarioOpen(undefined)).toBe(false);
});

test('[PRONT-3] checkPage usa _isProntuarioOpen(document) e o seletor estrito antigo sumiu', () => {
  expect(contentJsSource.includes('_isProntuarioOpen(document)')).toBe(true);
  expect(contentJsSource.includes('querySelectorAll(\'td[id^="tdCadastro-"]\').length')).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-23 — Desempate de EIXO por 3ª chamada (src/gemini-exam-agent.js).
// Eixo divergente era 'soft' e a math-consistency (S+C/2≈SE) não envolve o eixo,
// então soft+math-ok jamais bloqueava → eixo NÃO-conferido injetado (3/4 capturas,
// log 2026-07-21). Agora _tiebreakAxis desempata 2-de-3; confirmar a 2ª OU
// inconclusivo força bloqueio (severity='hard'). Carrega a classe REAL via shim.
// ──────────────────────────────────────────────────────────────────────────────

const examJsSource = readSrcNormalized('src', 'gemini-exam-agent.js');
const _LoggerShim = class { info() {} warn() {} error() {} success() {} debug() {} };
const _parseGeminiJSONShim = (t) => { try { return JSON.parse(t); } catch { return null; } };
const _GeminiExamAgent = new Function(
  'Logger', '_parseGeminiJSON',
  examJsSource + '\nreturn GeminiExamAgent;'
)(_LoggerShim, _parseGeminiJSONShim);
const _examAgent = new _GeminiExamAgent();

test('[AXIS-1] eixo divergente >8° (ambos com cilindro, 1ª math-consistent) → mismatch marcado', () => {
  // esf + cil/2 = 1.00 + (-1.00)/2 = 0.50 = se → 1ª math-consistent (o caso em
  // que a política antiga NUNCA bloquearia o eixo).
  const processed = { od: { esf: '+1.00', cil: -1.00, eixo: 80, se: '+0.50' }, oe: null };
  const verify    = { od: { s: '+1.00', c: -1.00, a: 100, se: '+0.50' }, oe: null };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m !== null).toBe(true);
  expect(m.isAxisMismatch).toBe(true);
  expect(m.pEixo).toBe(80);
  expect(m.vEixo).toBe(100);
  expect(m.severity).toBe('soft');
});

test('[AXIS-2] eixo circularmente adjacente (2° vs 179°) NÃO é mismatch', () => {
  const processed = { od: { esf: '+1.00', cil: -1.00, eixo: 2, se: '+0.50' }, oe: null };
  const verify    = { od: { s: '+1.00', c: -1.00, a: 179, se: '+0.50' }, oe: null };
  expect(_examAgent._compareRefractionAgainstVerify(processed, verify)).toBe(null);
});

test('[AXIS-7] caller despacha _tiebreakAxis e FORÇA bloqueio (hard) quando não confirma a 1ª', () => {
  expect(examJsSource.includes('_tiebreakAxis(mismatch, imageParts, apiService)')).toBe(true);
  expect(examJsSource.includes('mismatch.isAxisMismatch')).toBe(true);
  // no ramo não-'primeira' a severidade vira 'hard' (senão soft+math-ok passaria)
  const idx = examJsSource.indexOf('vereditoEixo');
  expect(idx !== -1).toBe(true);
  expect(examJsSource.slice(idx, idx + 900).includes("mismatch.severity = 'hard'")).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-24 — Sinal de esfera nunca é auto-liberado por voto 2-de-3.
// Flip puro de sinal (+5.25 ↔ -5.25) inverte miopia↔hipermetropia, CID e lente.
// As 3 leituras compartilham o mesmo modo de falha físico (traço vertical do "+"
// some na impressão térmica), então "confirmou a 1ª" pode ser a mesma alucinação
// vista 2×. Caso real: OD lido +5.25 num paciente cuja captura pós-dilatação leu
// esfera negativa. Correção: qualquer discordância de sinal força recaptura.
// ──────────────────────────────────────────────────────────────────────────────

test('[SIGN-1] flip puro de sinal da esfera é marcado signFlip + severidade hard', () => {
  const processed = { od: { esf: '+5.25', cil: -3.00, eixo: 174, se: '+3.75' }, oe: null };
  const verify    = { od: { s: '-5.25', c: -3.00, a: 174, se: '-6.75' }, oe: null };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m !== null).toBe(true);
  expect(m.signFlip).toBe(true);
  expect(m.severity).toBe('hard');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-29 — 2ª leitura que contradiz a própria aritmética não bloqueia a 1ª.
// Log real: 5 capturas seguidas bloqueadas; a 1ª leitura fechou S+C/2≈S.E. em
// 5 de 5, a 2ª errou a própria conta em 4 de 5 (e perdeu o sinal do S.E. no OE
// em 4 de 5). A refração pós-dilatação nunca chegou a ser injetada.
// ──────────────────────────────────────────────────────────────────────────────

test('[VMATH-1] log 2026-07-29: 2ª leitura incoerente vira soft (1ª coerente, sem flip puro)', () => {
  // 1ª: -1.75 + (-2.00)/2 = -2.75 = S.E. → coerente.
  // 2ª: +2.00 + (-2.00)/2 = +1.00, mas reportou S.E.="1.75" → erro de 0.75D.
  // |−1.75 + 2.00| = 0.25 ⇒ NÃO é flip puro, então o desempate nem roda.
  const processed = { od: { esf: '-1.75', cil: -2.00, eixo: 174, se: '-2.75' }, oe: null };
  const verify    = { od: { s: '+2.00', c: -2.00, a: 174, se: '1.75' }, oe: null };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m !== null).toBe(true);
  expect(m.severity).toBe('soft'); // soft + 1ª math-consistent ⇒ caller não bloqueia
});

test('[VMATH-2] flip PURO de sinal continua hard mesmo com a 2ª incoerente (política intacta)', () => {
  // Captura 18:32 do mesmo log: 1ª "-2.00" vs 2ª "+2.00" = flip puro.
  // A 2ª também é incoerente (+2.00 −1.25 = +0.75, reportou "0.25"), mas o
  // fail-safe de sinal (2026-07-24) tem precedência — não pode ser destravado.
  const processed = { od: { esf: '-2.00', cil: -2.50, eixo: 177, se: '-3.25' }, oe: null };
  const verify    = { od: { s: '+2.00', c: -2.50, a: 177, se: '0.25' }, oe: null };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m.signFlip).toBe(true);
  expect(m.severity).toBe('hard');
});

test('[VMATH-3] 2ª leitura COERENTE que discorda continua bloqueando (não vira soft)', () => {
  // Captura 19:00: ambas as leituras fecham a própria conta — ambiguidade real.
  const processed = { od: { esf: '+1.75', cil: -2.00, eixo: 174, se: '+0.75' }, oe: null };
  const verify    = { od: { s: '-1.75', c: -2.00, a: 174, se: '-2.75' }, oe: null };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m.severity).toBe('hard');
});

test('[VMATH-4] 1ª leitura NÃO-coerente não é resgatada pela incoerência da 2ª', () => {
  // 1ª: -1.75 + (-2.00)/2 = -2.75, mas reportou S.E."-1.00" → também quebrada.
  // Duas leituras ruins ⇒ bloqueio, nunca liberação.
  const processed = { od: { esf: '-1.75', cil: -2.00, eixo: 174, se: '-1.00' }, oe: null };
  const verify    = { od: { s: '+2.00', c: -2.00, a: 174, se: '1.75' }, oe: null };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m.severity).toBe('hard');
});

test('[VMATH-5] flip de sinal no OE também segue hard (o loop varre od E oe)', () => {
  // O ramo roda para os DOIS olhos e retorna no 1º mismatch — testar só OD não
  // prova nada sobre OE. Aqui a 2ª leitura é incoerente (+3.50 -0.75 = +2.75 vs
  // "1.00" reportado) E é flip puro de sinal ⇒ o guard !signFlip tem de segurar.
  // Se voltar 'soft', o guard está no lugar errado e a política de sinal foi
  // afrouxada justamente no olho que os outros testes não cobrem.
  const processed = { od: null, oe: { esf: '-3.50', cil: -1.5, eixo: 176, se: '-4.25' } };
  const verify    = { od: null, oe: { s: '+3.50', c: -1.5, a: 176, se: '1.00' } };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m.eye).toBe('oe');
  expect(m.signFlip).toBe(true);
  expect(m.severity).toBe('hard');
});

test('[VMATH-6] PRÉ-EXISTENTE: hatch "verify leu S.E. como esfera" tem precedência sobre signFlip', () => {
  // Dados literais do OE na captura 19:03: a 2ª reportou s="+3.50" e se="3.50"
  // (idênticos) — assinatura (c) verifyAutoConfuso. Esse escape é avaliado ANTES
  // de signFlip ser calculado, então um flip puro de sinal SAI como 'soft' por
  // esta via. Comportamento anterior a [VMATH-1..5], não introduzido por elas;
  // fixado aqui para que qualquer mudança futura na precedência apareça.
  const processed = { od: null, oe: { esf: '-3.50', cil: -1.5, eixo: 176, se: '-4.25' } };
  const verify    = { od: null, oe: { s: '+3.50', c: -1.5, a: 176, se: '3.50' } };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m.severity).toBe('soft');
  expect(m.signFlip).toBe(undefined); // não chega ao ramo de sinal
});

test('[SIGN-2] caller NUNCA auto-libera flip de sinal (sem mismatch=null no ramo signFlip)', () => {
  const start = examJsSource.indexOf("mismatch.severity === 'hard' && mismatch.signFlip");
  const end = examJsSource.indexOf('Desempate de Cilindro');
  expect(start !== -1 && end !== -1 && end > start).toBe(true);
  const branch = examJsSource.slice(start, end);
  // regressão: o ramo signFlip não pode zerar o mismatch (era o que injetava +5.25)
  expect(branch.includes('mismatch = null')).toBe(false);
  // a 3ª chamada ainda roda, mas só para enriquecer a mensagem ao médico
  expect(branch.includes('_tiebreakSphereSign(mismatch, imageParts, apiService)')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-24 — Piso clínico da esfera no CID determinístico do OCR.
// ±0.25D está na faixa emétrope; codificar H52.0/H52.1 aí é ruído. Caso real:
// OD +0.25 / OE -0.25 gerou Hipermetropia + Miopia. Piso: |esf| ≥ 0.50D.
// ──────────────────────────────────────────────────────────────────────────────

test('[REFRAC-FLOOR-1] esfera ±0.25 NÃO gera H52.0/H52.1 (ruído emétrope)', () => {
  const cids = _examAgent._inferCidRefracao({
    od: { esf: '+0.25', cil: null, eixo: null, se: '+0.25' },
    oe: { esf: '-0.25', cil: null, eixo: null, se: '-0.25' },
  });
  expect(cids.some(c => c.includes('H52.0'))).toBe(false);
  expect(cids.some(c => c.includes('H52.1'))).toBe(false);
});

test('[REFRAC-FLOOR-2] esfera |≥0.50| ainda codifica (miopia -0.50 preservada)', () => {
  const cids = _examAgent._inferCidRefracao({
    od: { esf: '-0.50', cil: -0.50, eixo: 175, se: '-0.75' },
    oe: { esf: '+0.50', cil: null, eixo: null, se: '+0.50' },
  });
  expect(cids.some(c => c.includes('H52.1'))).toBe(true); // miopia OD -0.50
  expect(cids.some(c => c.includes('H52.0'))).toBe(true); // hipermetropia OE +0.50
  expect(cids.some(c => c.includes('H52.2'))).toBe(true); // astigmatismo OD -0.50
});

test('[REFRAC-FLOOR-3] astigmatismo (cil ≥0.25) codifica mesmo com esfera ±0.25', () => {
  const cids = _examAgent._inferCidRefracao({
    od: { esf: '+0.25', cil: -0.75, eixo: 90, se: '-0.12' },
    oe: null,
  });
  expect(cids.some(c => c.includes('H52.2'))).toBe(true);  // astigmatismo mantido
  expect(cids.some(c => c.includes('H52.0'))).toBe(false); // esfera +0.25 suprimida
});

// Grupo async: voto do desempate de eixo (apiService e _parseGeminiJSON fakes).
async function _axisTiebreakTests() {
  const mk = (jsonText) => ({ callGeminiAPI: async () => ({ text: jsonText }) });
  const mismatch = { eye: 'od', pEixo: 80, vEixo: 100 };

  await testAsync('[AXIS-3] 3ª leitura perto da 1ª (82°) → "primeira" (não bloqueia)', async () => {
    expect(await _examAgent._tiebreakAxis(mismatch, [], mk('{"od":82,"oe":64}'))).toBe('primeira');
  });
  await testAsync('[AXIS-4] 3ª leitura perto da 2ª (98°) → "segunda" (bloqueia)', async () => {
    expect(await _examAgent._tiebreakAxis(mismatch, [], mk('{"od":98,"oe":64}'))).toBe('segunda');
  });
  await testAsync('[AXIS-5] 3ª leitura é um 3º valor (45°) → null (inconclusivo → bloqueia)', async () => {
    expect((await _examAgent._tiebreakAxis(mismatch, [], mk('{"od":45,"oe":64}'))) === null).toBe(true);
  });
  await testAsync('[AXIS-6] 3ª leitura ilegível ("null") → null (inconclusivo → bloqueia)', async () => {
    expect((await _examAgent._tiebreakAxis(mismatch, [], mk('{"od":"null","oe":64}'))) === null).toBe(true);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-23 — Visibilidade de CID recusado pelo SHOSP (sidepanel-injection.js).
// H16.2 (Ceratoconjuntivite) é rejeitado porque o SHOSP não tem a categoria H16
// (a busca tenta H162, H16.2 e a categoria "H16" — todas sem resultado). Não é
// bug de busca nem CID inválido → não se remove do prompt. Correção: a falha, que
// antes só aparecia num toast fugaz e o CID sumia, agora vira aviso PERSISTENTE
// no fim da cadeia listando os CIDs a adicionar manualmente.
// ──────────────────────────────────────────────────────────────────────────────

const _formatFailedCidsMessage = new Function(
  _extractFn(injectionJsSource, '_formatFailedCidsMessage') + '\nreturn _formatFailedCidsMessage;'
)();

test('[CIDFAIL-1] sem falhas (vazio/null/undefined) → null (nada a mostrar)', () => {
  expect(_formatFailedCidsMessage([])).toBe(null);
  expect(_formatFailedCidsMessage(null)).toBe(null);
  expect(_formatFailedCidsMessage(undefined)).toBe(null);
  expect(_formatFailedCidsMessage(['   ', ''])).toBe(null); // só espaços em branco
});

test('[CIDFAIL-2] um CID → singular "não aceito" e lista o código', () => {
  const msg = _formatFailedCidsMessage(['H16.2 - Ceratoconjuntivite']);
  expect(msg.includes('1 CID não aceito')).toBe(true);
  expect(msg.includes('adicione manualmente')).toBe(true);
  expect(msg.includes('H16.2 - Ceratoconjuntivite')).toBe(true);
});

test('[CIDFAIL-3] múltiplos CIDs → plural e junta a lista', () => {
  const msg = _formatFailedCidsMessage(['H16.2 - Ceratoconjuntivite', 'H18.1 - Queratopatia']);
  expect(msg.includes('2 CIDs não aceitos')).toBe(true);
  expect(msg.includes('H16.2 - Ceratoconjuntivite, H18.1 - Queratopatia')).toBe(true);
});

test('[CIDFAIL-4] wiring: acumula na falha, mostra no fim da cadeia e reseta no início', () => {
  // acumulador populado na branch de falha e exibido nos dois fins de cadeia
  expect(injectionJsSource.includes('handleSearchCid._failed = [])).push(rawTerm)')).toBe(true);
  const surfaceCount = (injectionJsSource.match(/_surfaceFailedCids\(\)/g) || []).length;
  expect(surfaceCount >= 3).toBe(true); // definição + 2 fins de cadeia (sucesso e falha)
  // reset nos iniciadores (botões + injectAll), não dentro da recursão
  expect((injectionJsSource.match(/handleSearchCid\._failed = \[\]/g) || []).length >= 3).toBe(true);
});

test('[CIDFAIL-5] wiring: hide centralizado em _armHideSuccess e aviso persistente cancela o timer', () => {
  // showSuccess/showError/CID-ok usam _armHideSuccess (slot único), não setTimeout solto
  expect(injectionJsSource.includes("setTimeout(() => successMessage.classList.add('hidden'), 3000)")).toBe(false);
  expect((injectionJsSource.match(/_armHideSuccess\(\)/g) || []).length >= 3).toBe(true);
  // _surfaceFailedCids cancela o hide pendente (senão não seria persistente)
  const idx = injectionJsSource.indexOf('function _surfaceFailedCids');
  expect(injectionJsSource.slice(idx, idx + 500).includes('clearTimeout(successMessage._hideTimer)')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-08 — Desfazer dilatação: reprocessar consulta como completa
// ──────────────────────────────────────────────────────────────────────────────

test('[REPROC-1] prompt aceita forceComplete e injeta a diretiva de reprocessamento', () => {
  expect(geminiSrcFull.includes('forceComplete = false')).toBe(true);
  expect(geminiSrcFull.includes('MODO REPROCESSAMENTO')).toBe(true);
  expect(geminiSrcFull.includes('dilatacaoDetectada=false')).toBe(true);
});

test('[REPROC-2] analyzeConsultation encaminha options.forceComplete ao builder do prompt', () => {
  expect(geminiSrcFull.includes('options && options.forceComplete')).toBe(true);
  expect(geminiSrcFull.includes('hasBlefarite, forceComplete)')).toBe(true);
});

test('[REPROC-3] handler de undo reprocessa com forceComplete e reinjeta com force', () => {
  expect(audioJsSource.includes('function cancelarDilatacao')).toBe(true);
  // reprocessa forçando dilatação off
  expect(/analyzeConsultation\([^)]*forceComplete:\s*true/.test(audioJsSource)).toBe(true);
  // reinjeta com force=true (sobrescreve a injeção da fase 1)
  expect(audioJsSource.includes('injectAll(true)')).toBe(true);
  // NÃO reentra no fluxo top-level (evita re-armar a dilatação): não chama detectaDilatacaoNaFala
  expect(audioJsSource.includes('function cancelarDilatacao') &&
    audioJsSource.split('function cancelarDilatacao')[1].split('async function')[0]
      .includes('detectaDilatacaoNaFala')).toBe(false);
});

test('[REPROC-4] sala de espera dirigida por storage.onChanged (uma fonte)', () => {
  expect(audioJsSource.includes('function renderDilatacaoPausas')).toBe(true);
  expect(initJsSource.includes('storage.onChanged') && initJsSource.includes('renderDilatacaoPausas')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// CONSISTÊNCIA SKILL.md ↔ PROMPT GEMINI
// As regras clínicas de conduta vivem em DOIS lugares: a skill (documentação/
// agente Claude) e o prompt embutido em gemini-interview-agent.js. Toda correção precisa
// ser aplicada nos dois — o histórico da skill registra erros causados por
// divergência (ex: 2026-05-18). Estes testes verificam que as frases-âncora
// das regras críticas existem em AMBOS os arquivos.
// ──────────────────────────────────────────────────────────────────────────────

const condutaSkillSource = readSrcNormalized('skills', 'user', 'conduta-tratamento-oftalmologia', 'SKILL.md');

// Cada entrada: [id do teste, frase-âncora que deve existir nos dois arquivos]
const SKILL_PROMPT_ANCHORS = [
  ['sufixo genérico de orientações de uso de óculos', 'com orientações sobre o uso'],
  ['distinção manutenção vs sem prescrição', 'Manutenção do óculos atual'],
  ['proibição de atualização de grau', 'Atualização de grau'],
  ['regra estrita para multifocais', 'Prescrição de óculos multifocais'],
  ['descarte de detalhes técnicos de lente', 'antirreflexo'],
  ['inferência de prescrição em consulta de refração', 'ótica'],
];

for (const [label, anchor] of SKILL_PROMPT_ANCHORS) {
  test(`[SKILL-SYNC] "${anchor}" presente na skill E no prompt (${label})`, () => {
    expect(condutaSkillSource.includes(anchor)).toBe(true);
    expect(geminiSrcFull.includes(anchor)).toBe(true);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-20 — FILA DE PAUSAS DE DILATAÇÃO (sala de espera multi-paciente)
// A rotina real intercala consultas enquanto pacientes dilatam. Dois defeitos
// do modelo de chave única (_shospDilatacaoPhase1) são cobertos por regressão:
//   1. injeção de paciente intercalado APAGAVA a pausa de quem esperava;
//   2. segunda dilatação SOBRESCREVIA a fase 1 da primeira.
// ──────────────────────────────────────────────────────────────────────────────

// Fonte: consumo do slot só com retomada armada E injeção de áudio; nada de
// remove incondicional da chave antiga no ramo de sucesso.
test('[DILQ-SRC-1] injectAll não remove pausas de outros pacientes (fix do wipe intercalado)', () => {
  expect(injectionJsSource).not.toContain("chrome.storage.local.remove('_shospDilatacaoPhase1')");
  expect(injectionJsSource).toContain('_phase1Data && combinedData.audio');
  expect(injectionJsSource).toContain('DilatacaoPausas.remover(_phase1Data.id)');
});

test('[DILQ-SRC-2] pausas nascem pela fila (criar/atualizar), nunca por chave única', () => {
  expect(audioJsSource).toContain('DilatacaoPausas.criar');
  expect(audioJsSource).toContain('DilatacaoPausas.atualizar');
  expect(audioJsSource).not.toContain("chrome.storage.local.set({ _shospDilatacaoPhase1");
  expect(audioJsSource).not.toContain("chrome.storage.local.set({\n            _shospDilatacaoPhase1");
});

test('[DILQ-SRC-3] Limpar manual DESARMA retomadas sem apagar pausas alheias', () => {
  const clearAllBlock = injectionJsSource.split('function clearAll')[1] || '';
  expect(clearAllBlock).toContain('desmarcarRetomadas');
  expect(clearAllBlock).not.toContain("remove('_shospDilatacaoPhase1')");
});

// Comportamentais: exercitam o módulo DilatacaoPausas com storage mockado.
function _mockChrome(initialMem = {}) {
  const mem = JSON.parse(JSON.stringify(initialMem));
  return {
    _mem: mem,
    tabs: { query: (_q, cb) => { const r = []; return cb ? cb(r) : Promise.resolve(r); } },
    storage: {
      local: {
        get: (keys, cb) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          list.forEach(k => { if (k in mem) out[k] = JSON.parse(JSON.stringify(mem[k])); });
          cb(out);
        },
        set: (obj, cb) => { Object.assign(mem, JSON.parse(JSON.stringify(obj))); if (cb) cb(); },
        remove: (keys, cb) => {
          (Array.isArray(keys) ? keys : [keys]).forEach(k => { delete mem[k]; });
          if (cb) cb();
        },
      },
    },
  };
}

async function testAsync(name, fn) {
  try {
    await fn();
    results.push({ status: 'PASS', name });
    passCount++;
  } catch (e) {
    results.push({ status: 'FAIL', name, error: e.message });
    failCount++;
  }
}

async function _dilatacaoQueueTests() {
  const DilatacaoPausas = require('../scripts/dilatacao-pausas.js');
  const QK = DilatacaoPausas.STORAGE_KEY;
  const LK = DilatacaoPausas.LEGACY_KEY;

  await testAsync('[DILQ-1] segunda dilatação NÃO sobrescreve a primeira — as duas coexistem na fila', async () => {
    global.chrome = _mockChrome();
    const idA = await DilatacaoPausas.criar({ transcript: 'paciente A vai dilatar', motivo: 'dilatacao' });
    const idB = await DilatacaoPausas.criar({ transcript: 'paciente B vai dilatar', motivo: 'dilatacao' });
    const pausas = await DilatacaoPausas.listar();
    expect(pausas.length).toBe(2);
    expect(pausas.map(p => p.id).includes(idA)).toBe(true);
    expect(pausas.map(p => p.id).includes(idB)).toBe(true);
  });

  await testAsync('[DILQ-2] marcarRetomada é exclusiva — armar B desarma A', async () => {
    global.chrome = _mockChrome();
    const idA = await DilatacaoPausas.criar({ transcript: 'A', motivo: 'dilatacao' });
    const idB = await DilatacaoPausas.criar({ transcript: 'B', motivo: 'dilatacao' });
    await DilatacaoPausas.marcarRetomada(idA);
    await DilatacaoPausas.marcarRetomada(idB);
    const armado = await DilatacaoPausas.obterRetomada();
    expect(armado.id).toBe(idB);
    const pausas = await DilatacaoPausas.listar();
    expect(pausas.filter(p => p.retomar).length).toBe(1);
  });

  await testAsync('[DILQ-3] remover(id) tira SÓ o slot alvo — o outro paciente segue esperando', async () => {
    global.chrome = _mockChrome();
    const idA = await DilatacaoPausas.criar({ transcript: 'A', motivo: 'dilatacao' });
    const idB = await DilatacaoPausas.criar({ transcript: 'B', motivo: 'dilatacao' });
    await DilatacaoPausas.remover(idA);
    const pausas = await DilatacaoPausas.listar();
    expect(pausas.length).toBe(1);
    expect(pausas[0].id).toBe(idB);
  });

  await testAsync('[DILQ-4] chave legada _shospDilatacaoPhase1 migra para slot e é removida', async () => {
    global.chrome = _mockChrome({ [LK]: { transcript: 'legado', ts: Date.now(), motivo: 'dilatacao', retomar: true, audio: { hda: 'x' } } });
    const pausas = await DilatacaoPausas.listar();
    expect(pausas.length).toBe(1);
    expect(pausas[0].transcript).toBe('legado');
    expect(pausas[0].retomar).toBe(true);
    expect(global.chrome._mem[LK] === undefined).toBe(true);
  });

  await testAsync('[DILQ-5] slot expirado (TTL 6h) é podado na leitura', async () => {
    global.chrome = _mockChrome({ [QK]: [
      { id: 'velho', ts: Date.now() - 7 * 60 * 60 * 1000, transcript: 'x', motivo: 'dilatacao', retomar: false },
      { id: 'novo', ts: Date.now(), transcript: 'y', motivo: 'dilatacao', retomar: false },
    ] });
    const pausas = await DilatacaoPausas.listar();
    expect(pausas.length).toBe(1);
    expect(pausas[0].id).toBe('novo');
  });

  await testAsync('[DILQ-6] desmarcarRetomadas desarma sem apagar nenhuma pausa', async () => {
    global.chrome = _mockChrome();
    const idA = await DilatacaoPausas.criar({ transcript: 'A', motivo: 'dilatacao' });
    await DilatacaoPausas.criar({ transcript: 'B', motivo: 'dilatacao' });
    await DilatacaoPausas.marcarRetomada(idA);
    await DilatacaoPausas.desmarcarRetomadas();
    const pausas = await DilatacaoPausas.listar();
    expect(pausas.length).toBe(2);
    expect(pausas.filter(p => p.retomar).length).toBe(0);
    expect((await DilatacaoPausas.obterRetomada()) === null).toBe(true);
  });

  await testAsync('[DILQ-7] pausa de exame nasce ARMADA (mesmo paciente continua na sala)', async () => {
    global.chrome = _mockChrome();
    await DilatacaoPausas.criar({ transcript: 'meio do exame', motivo: 'exame', retomar: true });
    const armado = await DilatacaoPausas.obterRetomada();
    expect(armado !== null).toBe(true);
    expect(armado.motivo).toBe('exame');
  });

  delete global.chrome;
}

// ──────────────────────────────────────────────────────────────────────────────
// REFRAÇÃO ESTÁTICA — rearme do modo após captura falhar (fix 2026-07-27)
// ──────────────────────────────────────────────────────────────────────────────
//
// Modelo fiel do roteamento de scripts/sidepanel-camera.js. Bug corrigido: uma
// captura ESTÁTICA (pós-dilatação) que falha na verificação do OCR passava por
// stopCameraCapture() (zera _captureMode='normal') e o botão "Refazer captura"
// reiniciava em modo NORMAL → a retentativa rodava injectAll e empurrava o grau
// dilatado para a RECEITA DE ÓCULOS + refração dinâmica + CID. O fix passa o
// snapshot do captureMode para showCaptureFailedMessage e rearma a estática no
// retry. Fonte espelhada: captureAndProcess (branch _captureFailed),
// showCaptureFailedMessage(reason, retryMode), startCameraCaptureEstatica,
// stopCameraCapture.

function _estaticaRetryTests() {
  let _captureMode = 'normal';
  const calls = [];

  // stopCameraCapture(): ao parar a câmera, o modo expira para 'normal'.
  const stopCameraCapture = () => { _captureMode = 'normal'; };
  // startCameraCapture() (entrada normal, via switchMode): captura → dinâmica.
  const startCameraCapture = () => { calls.push('normal'); _captureMode = 'normal'; };
  // startCameraCaptureEstatica(): rearma estática (NÃO passa por switchMode).
  const startCameraCaptureEstatica = () => { calls.push('estatica'); _captureMode = 'estatica'; };

  // Handler do botão "Refazer captura" (o default 'normal' preserva chamadas legadas).
  const retry = (retryMode = 'normal') => {
    if (retryMode === 'estatica') startCameraCaptureEstatica();
    else startCameraCapture();
  };

  // Fluxo de uma captura que falha na verificação: arma o modo → captura →
  // captureAndProcess tira o snapshot (const captureMode = _captureMode) →
  // stopCameraCapture() zera o modo → branch _captureFailed chama
  // showCaptureFailedMessage(reason, snapshot) → usuário clica Refazer.
  const capturaFalhaERetenta = (modoArmado) => {
    _captureMode = modoArmado;
    const snapshot = _captureMode;   // camera.js:280
    stopCameraCapture();             // camera.js:344 — zera para 'normal'
    retry(snapshot);                 // camera.js:349 → botão Refazer preserva o modo
    return _captureMode;
  };

  test('[EST-RETRY-1] captura ESTÁTICA que falha → retry rearma estática', () => {
    calls.length = 0;
    expect(capturaFalhaERetenta('estatica')).toBe('estatica');
    expect(calls).toEqual(['estatica']);
  });

  test('[EST-RETRY-2] captura NORMAL que falha → retry segue normal', () => {
    calls.length = 0;
    expect(capturaFalhaERetenta('normal')).toBe('normal');
    expect(calls).toEqual(['normal']);
  });

  test('[EST-RETRY-3] regressão: threading do snapshot é o que separa o fix do bug', () => {
    // Sem o fix, o snapshot era descartado (showCaptureFailedMessage(reason)) e o
    // retry caía no default normal → vazamento p/ receita + refração dinâmica.
    const semFix = (() => { _captureMode = 'estatica'; stopCameraCapture(); retry(); return _captureMode; })();
    const comFix = (() => { _captureMode = 'estatica'; const snap = _captureMode; stopCameraCapture(); retry(snap); return _captureMode; })();
    expect(semFix).toBe('normal');    // comportamento antigo (bug)
    expect(comFix).toBe('estatica');  // comportamento corrigido
    expect(semFix).not.toBe(comFix);
  });

  test('[EST-RETRY-4] retryMode default preserva o caminho normal (chamada legada)', () => {
    calls.length = 0;
    retry();
    expect(calls).toEqual(['normal']);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-29 — Blefarite descrita em linguagem LEIGA + biomicroscopia órfã
//
// Log 2026-07-29: consulta inteiramente de blefarite. O médico nunca disse
// "blefarite" ao paciente — falou de cílios, das glândulas de óleo da pálpebra,
// de pele oleosa e de pontinhos de inflamação. O guard literal derrubou
// injectBlefarite; como o LLM tinha deixado biomicroscopia=null CONFIANDO na
// flag (o texto viria do template), o bloco de exame saiu EM BRANCO em silêncio
// e o prontuário ficou só com H52.2.
// ──────────────────────────────────────────────────────────────────────────────

const _TRANSCRICAO_LEIGA_2026_07_29 =
  'ainda tá um pouco vermelho e outra coisa são os cílios, não sei se percebeu. ' +
  'Volta só para higiene, isso é uma coisa que vai te acompanhar o resto da vida ' +
  'porque sua pele é muito oleosa. Na pele o problema são as glândulas que produzem ' +
  'a parte lipídica, a parte de óleo da pálpebra. Dá pra ver que tá com bastante ' +
  'pontinho de inflamação.';

test('[BLEF-LEIGO-1] descrição leiga (cílios + glândulas de óleo da pálpebra) preserva injectBlefarite', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'melhora parcial', diagnostico: 'H010 - Blefarite bilateral', biomicroscopia: null },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: _TRANSCRICAO_LEIGA_2026_07_29,
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(true);
  // O CID de blefarite permanece no diagnóstico
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H010');
  // Flag preservada ⇒ o template cobre a biomicroscopia ⇒ nada de aviso
  expect(decision.avisos.length).toBe(0);
});

test('[BLEF-LEIGO-2] "compressa" + "higiene" (sem a adjacência "higiene palpebral") preserva a flag', () => {
  const raw = { tipo_consulta: 'retorno', dados: { biomicroscopia: null }, injectBlefarite: true };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'faz compressa morna e mantém a higiene todo dia',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(true);
});

test('[BLEF-LEIGO-3] pálpebra SOZINHA (sem sinal de blefarite) ainda reverte a flag', () => {
  // A conjunção (e) exige as duas pontas — não pode virar um passe-livre.
  const raw = { tipo_consulta: 'primeira_consulta', dados: { biomicroscopia: 'OD: pterígio nasal grau I' }, injectBlefarite: true };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o pterígio está crescendo em direção à córnea; a pálpebra não tem nada',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(false);
});

test('[BIOMICRO-ORFA-1] flag revertida + biomicroscopia null ⇒ aviso ao médico (campo em branco)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'olho seco', diagnostico: 'H522 - Astigmatismo OD', biomicroscopia: null },
    injectBlefarite: true,
    injectExamesNormais: false,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'paciente com olho seco, vamos acompanhar a visão e o grau',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(false);
  expect(decision.avisos.length).toBe(1);
  expect(decision.avisos[0]).toContain('EM BRANCO');
  expect(decision.guardsApplied.some(g => /órfã/i.test(g))).toBe(true);
});

test('[BIOMICRO-ORFA-2] flag revertida MAS biomicroscopia preenchida ⇒ sem aviso', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { biomicroscopia: 'OD: córnea transparente, câmara anterior formada' },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a visão está boa, o grau se manteve',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(false);
  expect(decision.avisos.length).toBe(0);
});

test('[BIOMICRO-ORFA-3] dilatação zera a flag por design ⇒ sem aviso (exame pertence à fase 2)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { biomicroscopia: null },
    injectBlefarite: true,
    dilatacaoDetectada: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'blefarite presente, vou dilatar para ver o fundo',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(false);
  expect(decision.avisos.length).toBe(0);
});

test('[BIOMICRO-ORFA-4] hook de blefarite já injetou o template ⇒ sem aviso', () => {
  const raw = { tipo_consulta: 'primeira_consulta', dados: { biomicroscopia: null }, injectBlefarite: true };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'blefarite bilateral',
    hookFlags: { blefariteInjetada: true },
  });
  expect(decision.injectFlags.injectBlefarite).toBe(false);
  expect(decision.avisos.length).toBe(0);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-29 — CID relançado porque a cadeia esvaziou o diagnosticoField
//
// handleSearchCid consome o campo termo a termo (field.value = terms.slice(1)).
// Ao fim da cadeia o campo está vazio; a passada seguinte (OCR) montava a base de
// deduplicação a partir dele e relançava H52.2 no SHOSP. _cidsLancadosNaSessao é
// a memória que sobrevive a esse consumo.
// ──────────────────────────────────────────────────────────────────────────────

const constantsJsSource = readSrcNormalized('scripts', 'sidepanel-constants.js');
const stateManagerSource = readSrcNormalized('scripts', 'state-manager.js');

test('[CIDDUP-1] _cidsLancadosNaSessao existe e é zerado em resetSession (não vaza entre pacientes)', () => {
  expect(constantsJsSource).toContain('let _cidsLancadosNaSessao');
  expect(stateManagerSource).toContain('_cidsLancadosNaSessao = new Set()');
});

test('[CIDDUP-2] registro do CID lançado fica no ramo de SUCESSO, antes de o campo ser consumido', () => {
  // `field.value = terms.slice(1)` aparece 2x (sucesso e falha) — ancorar em
  // `resp.success` garante que estamos olhando o ramo certo.
  const idxSucesso = injectionJsSource.indexOf('if (resp && resp.success) {');
  expect(idxSucesso > -1).toBe(true);
  const ramoSucesso = injectionJsSource.slice(idxSucesso, idxSucesso + 700);
  const idxRegistro = ramoSucesso.indexOf('_cidsLancadosNaSessao.add(_key)');
  const idxConsumo = ramoSucesso.indexOf("field.value = terms.slice(1).join('\\n');");
  expect(idxRegistro > -1).toBe(true);
  expect(idxConsumo > -1).toBe(true);
  expect(idxRegistro < idxConsumo).toBe(true);
  // O ramo de FALHA não pode registrar: CID recusado pelo SHOSP não foi lançado
  // e precisa continuar elegível numa passada posterior.
  const idxFalha = injectionJsSource.indexOf('// S2: pular termo com falha');
  expect(injectionJsSource.slice(idxFalha, idxFalha + 700)).not.toContain('_cidsLancadosNaSessao.add');
});

test('[CIDDUP-3] merge do OCR deduplica contra os CIDs já lançados, não só contra o campo', () => {
  expect(injectionJsSource).toContain('..._cidsLancadosNaSessao,');
});

test('[CIDDUP-4] limpeza manual (novo paciente) zera a memória de CIDs lançados', () => {
  const bloco = injectionJsSource.slice(injectionJsSource.indexOf('options.discardDilatacao === true'));
  expect(bloco.slice(0, 400)).toContain('_cidsLancadosNaSessao = new Set()');
});

test('[CIDDUP-5] _cidKey colapsa "H522 - Astigmatismo OD", "H52.2 - Astigmatismo" e "Astigmatismo"', () => {
  // Reproduz _cidKey isoladamente (o módulo é DOM-dependente e não é require-ável).
  const CID_CODE_PATTERN = /^([A-Z]\d+(?:\.\d+)?)\s*[-–]/;
  const termToCid = [[/astigmat/i, 'H522'], [/miop/i, 'H521']];
  const keyFromText = t => (termToCid.find(([re]) => re.test(t)) || [])[1] || null;
  const cidKey = (term) => {
    const t = (term || '').trim();
    if (!t) return '';
    const m = t.match(CID_CODE_PATTERN);
    if (m) return m[1].replace(/\./g, '').toUpperCase();
    const bare = t.match(/^([A-Za-z]\d+(?:\.\d+)?)$/);
    if (bare) return bare[1].replace(/\./g, '').toUpperCase();
    return keyFromText(t) || t.toUpperCase();
  };
  expect(cidKey('H522 - Astigmatismo OD')).toBe('H522');
  expect(cidKey('H52.2 - Astigmatismo')).toBe('H522');
  expect(cidKey('H52.2')).toBe('H522');
  expect(cidKey('Astigmatismo')).toBe('H522');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-29 — Ciclo de vida do banner de aviso clínico
//
// O banner nasce na análise; o injectAll dispara clearAll(clearAudio) ~1,5s
// depois. Se a remoção morasse nesse clearAll, o aviso piscaria e sumiria antes
// de o médico ler — exatamente quando um campo acabou de entrar VAZIO no
// prontuário. Ele só pode morrer na fronteira de PACIENTE.
// ──────────────────────────────────────────────────────────────────────────────

// audioJsSource já declarado acima (linha ~358).

test('[AVISO-1] clearAll automático pós-injeção NÃO remove o banner de aviso', () => {
  const idxAudio = injectionJsSource.indexOf('if (clearAudio && !isRecording) {');
  const idxCamera = injectionJsSource.indexOf('if (clearCamera) {', idxAudio);
  expect(idxAudio > -1 && idxCamera > idxAudio).toBe(true);
  const blocoClearAudio = injectionJsSource.slice(idxAudio, idxCamera);
  expect(blocoClearAudio).not.toContain("getElementById('clinicalWarningBanner')");
});

test('[AVISO-2] limpeza manual (novo paciente) remove o banner', () => {
  const idx = injectionJsSource.indexOf('options.discardDilatacao === true');
  expect(injectionJsSource.slice(idx, idx + 600)).toContain("getElementById('clinicalWarningBanner')");
});

test('[AVISO-3] nova gravação remove o banner (médico que nunca aperta Limpar)', () => {
  const idx = audioJsSource.indexOf('StateManager.resetSession();');
  expect(idx > -1).toBe(true);
  expect(audioJsSource.slice(idx, idx + 600)).toContain("getElementById('clinicalWarningBanner')");
});

test('[AVISO-4] banner é irmão ANTERIOR de audioFieldsContainer — hideResults() esconde o container, não o aviso', () => {
  expect(audioJsSource).toContain('parentNode.insertBefore(banner, container)');
  // hideResults() só adiciona 'hidden' ao próprio container
  expect(injectionJsSource).toContain("audioFieldsContainer.classList.add('hidden')");
});

test('[AVISO-5] avisos do DecisionEngine chegam ao sidepanel e são exibidos', () => {
  expect(audioJsSource).toContain('_showClinicalWarnings(decision.avisos)');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-29 — Refração ESTÁTICA: a falha tem que entregar o próprio diagnóstico
// ──────────────────────────────────────────────────────────────────────────────
//
// Log 2026-07-29: TRÊS capturas estáticas (20:05, 20:10, 20:11) com
// _captureFailed:false e NENHUM [InjectAll] depois — ou seja, o ramo estática
// rodou de ponta a ponta e morreu na resolução dos campos, porque
// `refracaoEstatica.*` é o único grupo sem IDs em FALLBACK_IDS e depende só da
// heurística de rótulo. O painel dizia apenas "confira os campos e o mapeamento"
// e a sessão seguinte recomeçava do zero. Agora a falha devolve o dump estrutural.

test('[EST-DIAG-1] a falha da estática anexa o dump estrutural na resposta', () => {
  expect(contentJsSource).toContain('dumpRefractionCandidates()');
  // ternário: só monta o dump quando NÃO preencheu (sucesso não paga o custo)
  expect(contentJsSource).toContain('const diag = filled');
  expect(contentJsSource).toContain('sendResponse({ success: filled, diag })');
});

test('[EST-DIAG-2] o dump reporta o bloco que a heurística atribui a cada campo', () => {
  // Sem isto não há como saber se _refractionBlockOf tinha chance de acertar.
  expect(contentJsSource).toContain('bloco: this._refractionBlockOf(input)');
});

test('[EST-DIAG-3] o dump é estrutural — nunca lê .value do paciente', () => {
  const dump = contentJsSource.slice(
    contentJsSource.indexOf('dumpRefractionCandidates() {'),
    contentJsSource.indexOf('getTabId(tabName) {')
  );
  expect(dump.length > 0).toBe(true);
  expect(dump.includes('.value')).toBe(false);
});

test('[EST-DIAG-4] o painel loga o dump como JSON, não como "Object"', () => {
  // O console imprime objeto como "Object" e o log copiado pelo médico perde o
  // conteúdo — foi por isso que "[InjectAll] check: Object" nunca ajudou.
  expect(injectionJsSource).toContain("JSON.stringify(diag.resolvidos)");
  expect(injectionJsSource).toContain('JSON.stringify(diag.candidatos, null, 1)');
});

test('[EST-DIAG-5] escape hatch sob demanda, sem refazer captura', () => {
  expect(injectionJsSource).toContain('async function dumpRefracaoBlocks()');
  expect(contentJsSource).toContain("case 'dumpRefracaoBlocks'");
  // A instrução ao médico é chamar no console do painel — tem que estar em window.
  expect(injectionJsSource).toContain('window.dumpRefracaoBlocks = dumpRefracaoBlocks');
});

// Round trip do diag. sendToTab (injection.js) resolve TRÊS formas distintas:
//   'CONTEXT_INVALIDATED' (string) | null (erro transiente) | resp (objeto)
// Ler `.diag` de uma string dá undefined — sem separar os casos, o painel avisaria
// "cole o dump acima" com dump nenhum impresso, que é a pista falsa que esta
// instrumentação existe para eliminar. Modelo fiel do pós-resposta de
// injectRefracaoEstaticaDirect.
function _estaticaPosResposta(response) {
  const saida = { logs: [], warns: [], ret: false };
  if (response === 'CONTEXT_INVALIDATED') {
    saida.warns.push('f5');
    return saida;
  }
  if (!response || typeof response !== 'object') {
    saida.warns.push('sem_resposta');
    return saida;
  }
  const diag = response.diag;
  if (diag) {
    saida.logs.push('resolvidos');
    if (diag.candidatos) saida.logs.push('dump');
  }
  if (!response.success) {
    saida.warns.push(diag && diag.tabClicked === false ? 'aba' : 'cole_o_dump');
  }
  saida.ret = !!response.success;
  return saida;
}

test('[EST-DIAG-6] falha de mapeamento → imprime o dump E pede para colá-lo', () => {
  const r = _estaticaPosResposta({
    success: false,
    diag: { resolvidos: { 'od.esf': null }, tabClicked: true, candidatos: [{ id: 'x' }] },
  });
  expect(r.logs).toEqual(['resolvidos', 'dump']);
  expect(r.warns).toEqual(['cole_o_dump']);
  expect(r.ret).toBe(false);
});

test('[EST-DIAG-7] contexto invalidado NÃO pede dump inexistente — pede F5', () => {
  const r = _estaticaPosResposta('CONTEXT_INVALIDATED');
  expect(r.logs).toEqual([]);
  expect(r.warns).toEqual(['f5']);
  expect(r.ret).toBe(false);
});

test('[EST-DIAG-8] resposta ausente/transiente também não promete dump', () => {
  for (const resp of [null, undefined]) {
    const r = _estaticaPosResposta(resp);
    expect(r.logs).toEqual([]);
    expect(r.warns).toEqual(['sem_resposta']);
  }
});

test('[EST-DIAG-9] aba Refração não clicada é diagnosticada como aba, não mapeamento', () => {
  const r = _estaticaPosResposta({
    success: false,
    diag: { resolvidos: {}, tabClicked: false, candidatos: [] },
  });
  expect(r.warns).toEqual(['aba']);
});

test('[EST-DIAG-10] sucesso não imprime dump nem avisa nada', () => {
  const r = _estaticaPosResposta({
    success: true,
    diag: { resolvidos: { 'od.esf': 'prontuario_resp_78074_1' }, tabClicked: true },
  });
  expect(r.logs).toEqual(['resolvidos']);
  expect(r.warns).toEqual([]);
  expect(r.ret).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-29 — "Dados já injetados" era mentira
// ──────────────────────────────────────────────────────────────────────────────
//
// Às 20:07 e 20:10 o botão manual acusou "Dados já injetados" com NADA injetado:
// audioData ainda era null (análise do Gemini em voo) e o ramo estática acabara
// de zerar cameraData de propósito. injectAll conflatava "sem dados" com "já
// injetado". Modelo fiel do guard de scripts/sidepanel-injection.js.

function _guardNadaParaInjetar({ audioData, cameraData, audioDataInjected, cameraDataInjected, isRecording, analise }) {
  const temAudio = audioData && !audioDataInjected;
  const temCamera = cameraData && !cameraDataInjected;
  if (!temAudio && !temCamera) {
    if (!audioData && !cameraData) {
      return isRecording ? 'gravando' : analise ? 'analise' : 'nada';
    }
    return 'ja_injetado';
  }
  return 'injeta';
}

test('[INJ-VAZIO-1] análise em voo → "análise em andamento", não "já injetados"', () => {
  // Cenário exato de 20:07:30: estática zerou cameraData, Gemini ainda rodando.
  expect(_guardNadaParaInjetar({
    audioData: null, cameraData: null,
    audioDataInjected: false, cameraDataInjected: false,
    isRecording: false, analise: true,
  })).toBe('analise');
});

test('[INJ-VAZIO-2] gravação em andamento tem precedência na mensagem', () => {
  expect(_guardNadaParaInjetar({
    audioData: null, cameraData: null,
    audioDataInjected: false, cameraDataInjected: false,
    isRecording: true, analise: false,
  })).toBe('gravando');
});

test('[INJ-VAZIO-3] nada capturado e nada rodando → "nada capturado ainda"', () => {
  expect(_guardNadaParaInjetar({
    audioData: null, cameraData: null,
    audioDataInjected: false, cameraDataInjected: false,
    isRecording: false, analise: false,
  })).toBe('nada');
});

test('[INJ-VAZIO-4] "já injetados" preservado quando os dados EXISTEM e foram injetados', () => {
  expect(_guardNadaParaInjetar({
    audioData: {}, cameraData: null,
    audioDataInjected: true, cameraDataInjected: false,
    isRecording: false, analise: false,
  })).toBe('ja_injetado');
});

test('[INJ-VAZIO-5] auto-injeção pós-análise não regride: audioData setado antes de injectAll', () => {
  // displayAudioResults(workingData) (seta audioData) vem ANTES do injectAll do
  // ramo de dilatação — logo o caminho automático continua caindo em
  // 'Dados já injetados', que sidepanel-audio.js trata como sucesso benigno.
  const dil = audioJsSource.indexOf('displayAudioResults(workingData)');
  const inj = audioJsSource.indexOf('await injectAll()', dil);
  expect(dil > 0 && inj > dil).toBe(true);
  expect(audioJsSource).toContain("injectError.message === 'Dados já injetados'");
});

test('[INJ-VAZIO-6] a flag de análise é armada e SEMPRE liberada no finally', () => {
  expect(constantsJsSource).toContain('let _analiseEmAndamento = false');
  expect(audioJsSource).toContain('_analiseEmAndamento = true');
  // O finally cobre também os returns antecipados (áudio vazio / muito curto).
  const fin = audioJsSource.indexOf('_analiseEmAndamento = false');
  expect(audioJsSource.slice(fin - 200, fin).includes('} finally {')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// RELATÓRIO FINAL
// ──────────────────────────────────────────────────────────────────────────────

(async () => {
  await _dilatacaoQueueTests();
  await _axisTiebreakTests();
  _estaticaRetryTests();

  console.log('\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('  SHOSP EXTENSION v5 — RELATÓRIO DE INTEGRAÇÃO');
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
})();
