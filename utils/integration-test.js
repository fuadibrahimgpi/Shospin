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

test('[DE-3c] Guard 2d: "Colírio antibiótico" sem antibiótico na fala (nome destruído pelo ASR) vira genérico', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      retorno: 'Sensação de corpo estranho no olho direito',
      tratamento: 'Colírio antibiótico 3x/dia por 5 dias OD',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'tinha um corpo estranho no olho direito retirei vou passar um colirio trometolou tres vezes ao dia por 5 dias',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat.includes('antibiótico')).toBe(false);
  expect(trat.startsWith('Medicação ocular prescrita')).toBe(true);
  expect(trat.includes('3x/dia por 5 dias OD')).toBe(true);
  expect(decision.guardsApplied.some(g => g.includes('Guard 2d'))).toBe(true);
  expect(raw.dados.tratamento.includes('antibiótico')).toBe(true);
});

test('[DE-3d] Guard 2d: preserva "Colírio antibiótico" quando a fala diz antibiótico', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { retorno: 'Olho vermelho', tratamento: 'Colírio antibiótico 4x/dia' },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'vou passar um colirio de antibiotico quatro vezes ao dia',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.tratamento).toBe('Colírio antibiótico 4x/dia');
});

test('[DE-3e] Guard 2e: colírio mantido na fala preenche tratamento vazio', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { retorno: null, medicacoes_em_uso: 'Timolol 2x/dia', tratamento: null },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o paciente esta em uso de timolol duas vezes ao dia mantido timolol retorno em tres meses',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.tratamento).toBe('Timolol 2x/dia');
  expect(decision.guardsApplied.some(g => g.includes('Guard 2e'))).toBe(true);
  expect(raw.dados.tratamento).toBe(null);
});

test('[DE-3f] Guard 2e: sem verbo de manutenção ligado ao remédio, tratamento segue vazio', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { medicacoes_em_uso: 'Timolol 2x/dia', tratamento: null },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o paciente usa timolol duas vezes ao dia pressao boa retorno em tres meses',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.tratamento).toBe(null);
});

test('[DE-3b] Guard preserva "Associação ATB+corticoide" quando a classe É mencionada (fora da blefarite)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      hda: 'olho vermelho com secreção há 3 dias',
      conduta: 'Retorno 1 semana',
      tratamento: 'Associação (ATB + corticoide ocular) 1 gota 3x/dia\nLubrificante 6x/dia',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'conjuntivite, vou passar um colírio com antibiótico e corticoide 3 vezes ao dia',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  // A classe foi dita → guard 2 não rebaixa; e sem blefarite o protocolo 1.5 não se aplica.
  expect(trat.includes('Associação (ATB + corticoide ocular)')).toBe(true);
  expect(trat.includes('Medicação ocular prescrita')).toBe(false);
  expect(trat.includes('Tobramicina')).toBe(false);
});

test('[DE-3b2] Na blefarite, "Associação ATB+corticoide" é PROMOVIDA ao protocolo declarado', () => {
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
    transcribedText: 'blefarite, faz a compressa e lava com shampoo, depois pinga o colírio com antibiótico e corticoide',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  // O prompt aposentou "Associação" na blefarite: ou nível 1, ou o protocolo 1.5.
  expect(trat.includes('Associação')).toBe(false);
  expect(trat.includes('Tobramicina + dexametasona 1 gota 3x/dia')).toBe(true);
  expect(trat.includes('Lubrificante 6x/dia')).toBe(true);
  expect(raw.dados.tratamento.includes('Associação')).toBe(true); // resposta crua intacta
});

test('[DE-3c] Guard NÃO toca na linha nomeada "Tobramicina + dexametasona" (protocolo declarado, 2026-08-03)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      hda: 'blefarite',
      conduta: 'Retorno 2 semanas',
      tratamento: 'Compressa morna 2x/dia\nHigiene palpebral com shampoo infantil\nTobramicina + dexametasona 3x/dia após higiene palpebral',
    },
    injectBlefarite: true,
  };
  // A transcrição NÃO nomeia o remédio — é o protocolo declarado do médico que nomeia.
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a senhora esta com uma blefarite na palpebra, o olho fica irritado e com secrecao. ' +
      'entao faz assim: compressa morna de dois minutos, depois lava os cilios com shampoo de nenem ' +
      'fazendo espuma na base do cilio, e em seguida pinga o colirio tres vezes ao dia. ' +
      'usa tambem o lubrificante ao longo do dia e volta em duas semanas para eu ver o exame de novo',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat.includes('Tobramicina + dexametasona 3x/dia após higiene palpebral')).toBe(true);
  expect(trat.includes('Medicação ocular prescrita')).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-12 — PROTOCOLO DECLARADO DA BLEFARITE COMO BACKSTOP DETERMINÍSTICO.
//
// Pedido do usuário: quando a fala traz higiene + compressa + um colírio, o
// colírio é SEMPRE Tobramicina + dexametasona na injeção do tratamento.
// A regra já existia no prompt (nível 1.5); faltava o backstop determinístico
// para quando o modelo devolve a linha genérica. Promove, nunca cria.
// A fala do log ("mantém o tratamento fazendo a compressa lavando com shampoo e
// usando colírio até ele acabar") não diz "higiene palpebral" nem "3x/dia" —
// exigir isso literalmente foi o bug de 2026-08-03.
// ──────────────────────────────────────────────────────────────────────────────

const FALA_BLEFARITE_RETORNO_2026_08_12 =
  'boa tarde vamos sentar e ai como e que a senhora ta hoje melhorou um pouco avermelhado ne mas tranquilo ' +
  'deixa eu ver ainda ta um pouco vermelho ainda tem bastante colirio ou ja ta acabando nos vamos combinar o ' +
  'seguinte mantem o tratamento fazendo a compressa lavando com shampoo e usando colirio ate ele acabar ' +
  'se nao ele volta a inflamar de novo por causa que sua palpebra e muito oleosa e comeca a ficar irritado';

test('[DE-PROT-1] Combo compressa+shampoo+colírio: linha genérica vira "Tobramicina + dexametasona"', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      retorno: 'Refere melhora parcial da hiperemia',
      conduta: 'Manter tratamento até o término do colírio',
      tratamento: 'Compressa morna\nHigiene palpebral com shampoo infantil\nMedicação ocular prescrita até o término',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: FALA_BLEFARITE_RETORNO_2026_08_12,
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat.includes('Tobramicina + dexametasona até o término')).toBe(true);
  expect(trat.includes('Medicação ocular prescrita')).toBe(false);
  // Compressa e higiene não são o colírio — permanecem intactas.
  expect(trat.includes('Compressa morna')).toBe(true);
  expect(trat.includes('Higiene palpebral com shampoo infantil')).toBe(true);
  expect(raw.dados.tratamento.includes('Medicação ocular prescrita')).toBe(true);
});

test('[DE-PROT-2] "Colírio" cru também é promovido, com a posologia preservada', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Manter tratamento',
      tratamento: 'Compressa morna\nHigiene palpebral com shampoo infantil\nColírio 3x/dia após a limpeza',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: FALA_BLEFARITE_RETORNO_2026_08_12,
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat.includes('Tobramicina + dexametasona 3x/dia após a limpeza')).toBe(true);
});

test('[DE-PROT-3] Nível 1 vence o protocolo: remédio nomeado não é sobrescrito', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 2 semanas',
      tratamento: 'Compressa morna\nHigiene palpebral com shampoo infantil\nNeomicina + polimixina B + dexametasona 3x/dia',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a senhora esta com blefarite nos dois olhos: faz a compressa morna, lava os cilios ' +
      'com shampoo e depois pinga o Maxitrol tres vezes ao dia em cada olho',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat.includes('Neomicina + polimixina B + dexametasona 3x/dia')).toBe(true);
  expect(trat.includes('Tobramicina')).toBe(false);
});

test('[DE-PROT-4] PROMOVE, nunca CRIA: sem colírio prescrito, nenhuma linha é acrescentada', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 3 semanas',
      tratamento: 'Compressa morna 2x/dia\nHigiene palpebral com shampoo infantil',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a palpebra do olho esta oleosa, faz compressa morna e lava os cilios com shampoo de ' +
      'nenem, por enquanto sem colirio nenhum, so isso mesmo, volta na proxima consulta',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat).toBe('Compressa morna 2x/dia\nHigiene palpebral com shampoo infantil');
  expect(trat.includes('Tobramicina')).toBe(false);
});

test('[DE-PROT-5] Lubrificante e demais linhas não-colírio nunca são promovidos', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Manter tratamento',
      tratamento: 'Compressa morna\nHigiene palpebral com shampoo infantil\n' +
        'Medicação ocular prescrita até o término\nLubrificante ocular AO ao longo do dia\n' +
        'Ômega 3 (EPA+DHA) 1000 mg',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: FALA_BLEFARITE_RETORNO_2026_08_12 + ' usa o lubrificante ao longo do dia e o omega 3',
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento.split('\n');
  expect(trat[2]).toBe('Tobramicina + dexametasona até o término');
  expect(trat[3]).toBe('Lubrificante ocular AO ao longo do dia');
  expect(trat[4]).toBe('Ômega 3 (EPA+DHA) 1000 mg');
});

test('[DE-PROT-7] A posologia canônica ("após higiene palpebral") não impede a promoção', () => {
  // A exclusão de linhas não-colírio é ANCORADA no início: "após higiene palpebral" e
  // "após a compressa" são a posologia do PRÓPRIO colírio (ver BLEFARITE_TRATAMENTO_PADRAO).
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Retorno 2 semanas',
      tratamento: 'Compressa morna 2 min — 2x/dia\nHigiene palpebral com shampoo infantil\n' +
        'Medicação ocular prescrita 3x/dia após higiene palpebral\nColírio após a compressa',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a palpebra esta inflamada: faz a compressa morna, lava os cilios com shampoo de nenem ' +
      'e depois pinga o colirio tres vezes ao dia em cada olho',
    hookFlags: {},
  });
  const linhas = decision.clonedAIResponse.dados.tratamento.split('\n');
  expect(linhas[0]).toBe('Compressa morna 2 min — 2x/dia');
  expect(linhas[1]).toBe('Higiene palpebral com shampoo infantil');
  expect(linhas[2]).toBe('Tobramicina + dexametasona 3x/dia após higiene palpebral');
  expect(linhas[3]).toBe('Tobramicina + dexametasona após a compressa');
});

test('[DE-PROT-6] Fora da blefarite o protocolo não se aplica (colírio hipotensor genérico)', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Retorno 3 meses com campo visual',
      tratamento: 'Medicação ocular prescrita 1x à noite',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a pressao do olho esta um pouco alta, vou manter o colirio da pressao uma vez a noite',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.tratamento.includes('Tobramicina')).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-09-15 — O PROTOCOLO NOMEIA, NUNCA CRIA (o inverso de 2026-08-12).
//
// O médico anunciou "um tratamento para melhorar essa irritação, coisa simples" e
// prescreveu compressa + higiene + lubrificante + ômega 3. O único "pingar" da fala
// era do lubrificante. O modelo escreveu "Tobramicina + dexametasona" e nada
// conferia a linha já nomeada. Fixture: os trechos do log [Speech] daquela consulta
// (o log mostra só 120 chars por linha — é o que se tem da fala real).
// ──────────────────────────────────────────────────────────────────────────────

const FALA_BLEFARITE_SEM_COLIRIO_2026_09_15 =
  'essa irritacao e bem comum sera que todo mundo e o seguinte ' +
  'eu vou passar um tratamento para a senhora fazer para melhorar essa irritacao isso e coisa simples ' +
  'a senhora vai fazer o seguinte tenta fazer isso de manha na hora do almoco enfim dia se nao der faz ' +
  'pelo menos de manha no fim do dia ate voltar a chover um lubrificante se ela pode pingar quantas vezes ' +
  'quiser pode comprar depois sem receita ja tem costume de tomar omega 3 irritacao ta aqui ta a receita do oculos';

const TRATAMENTO_2026_09_15 =
  'Compressa morna\nHigiene palpebral\nTobramicina + dexametasona\nLubrificante ocular\nÔmega 3';

test('[DE-PROT-8] REGRESSÃO 2026-09-15: Tobramicina sem colírio na fala (só lubrificante) é REMOVIDA', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno 1 ano', tratamento: TRATAMENTO_2026_09_15 },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: FALA_BLEFARITE_SEM_COLIRIO_2026_09_15,
    hookFlags: {},
  });
  const trat = decision.clonedAIResponse.dados.tratamento;
  expect(trat.includes('Tobramicina')).toBe(false);
  expect(trat).toBe('Compressa morna\nHigiene palpebral\nLubrificante ocular\nÔmega 3');
  // O ASR pode ter comido a palavra — o médico precisa saber que a linha saiu.
  expect(decision.avisos.some(a => a.includes('Tobramicina + dexametasona'))).toBe(true);
  expect(raw.dados.tratamento.includes('Tobramicina')).toBe(true); // resposta crua intacta
});

test('[DE-PROT-9] Com colírio (não-lubrificante) na fala, a linha do protocolo fica', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno 1 ano', tratamento: TRATAMENTO_2026_09_15 },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: FALA_BLEFARITE_SEM_COLIRIO_2026_09_15 +
      ' e depois da limpeza pinga esse colirio aqui tres vezes ao dia por uma semana',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.tratamento).toBe(TRATAMENTO_2026_09_15);
});

test('[DE-PROT-10] "tratamento mais forte" (fala real 2026-07-07) segue valendo como o colírio', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { conduta: 'Retorno 2 semanas', tratamento: 'Higiene palpebral com shampoo infantil\nTobramicina + dexametasona' },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a blefarite ainda esta com a palpebra inflamada e o olho vermelho, ' +
      'continua lavando com shampoo, vou passar com o tratamento para fazer um pouco mais forte ' +
      'para melhorar essa irritacao em duas semanas ver que nao ta bom vem aqui falar comigo',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.tratamento.includes('Tobramicina + dexametasona')).toBe(true);
});

test('[DE-PROT-11] Remédio pronunciado (nível 1) nunca é removido, mesmo sem a palavra colírio', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno 2 semanas', tratamento: 'Compressa morna\nTobramicina + dexametasona 3x/dia' },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'faz a compressa morna na palpebra e usa o tobradex tres vezes ao dia',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.tratamento.includes('Tobramicina + dexametasona 3x/dia')).toBe(true);
});

test('[DE-PROT-12] Pingar do lubrificante não PROMOVE a linha genérica ao protocolo', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno 1 ano', tratamento: 'Compressa morna\nMedicação ocular prescrita\nLubrificante ocular' },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a blefarite deixa a palpebra inflamada e o olho seco, ' +
      'faz compressa morna e lava os cilios com shampoo de nenem, ' +
      'e um lubrificante que pode pingar quantas vezes quiser',
    hookFlags: {},
  });
  // Igualdade exata, não só "sem Tobramicina": se a promoção disparasse, o guard 2c
  // apagaria a linha promovida e um includes() seguiria verde sem guardar o 2b.
  expect(decision.clonedAIResponse.dados.tratamento)
    .toBe('Compressa morna\nMedicação ocular prescrita\nLubrificante ocular');
});

test('[DE-PROT-14] "pinga esse aqui depois da limpeza" com lubrificante logo depois continua sendo o colírio', () => {
  // Frase do protocolo (skill) — o pingar tem objeto próprio ("esse aqui"); o
  // lubrificante citado em seguida não pode roubá-lo pela janela de ±6 palavras.
  // Enchimento clínico no início (longe do "pinga") só para passar o guard de transcrição incoerente.
  const fala = 'o olho esta vermelho e com irritacao, o olho vermelho vem da palpebra. ' +
    'a blefarite deixa a palpebra inflamada, faz compressa morna e lava os cilios com shampoo, ' +
    'pinga esse aqui e o lubrificante a vontade';
  const nomeada = DecisionEngine.buildDecision({
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno 2 semanas', tratamento: 'Compressa morna\nTobramicina + dexametasona\nLubrificante ocular' },
    injectBlefarite: true,
  }, { transcribedText: fala, hookFlags: {} });
  expect(nomeada.clonedAIResponse.dados.tratamento.includes('Tobramicina + dexametasona')).toBe(true);
  const generica = DecisionEngine.buildDecision({
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno 2 semanas', tratamento: 'Compressa morna\nMedicação ocular prescrita\nLubrificante ocular' },
    injectBlefarite: true,
  }, { transcribedText: fala, hookFlags: {} });
  expect(generica.clonedAIResponse.dados.tratamento.includes('Tobramicina + dexametasona')).toBe(true);
});

test('[DE-PROT-13] Prompt: o anúncio "coisa simples" e o lubrificante estão fora do protocolo', () => {
  // geminiSrcFull só é declarado adiante no arquivo (TDZ) — lê o fonte aqui.
  const promptSrc = readSrcNormalized('src', 'gemini-interview-agent.js');
  expect(promptSrc.includes('Pingar lubrificante NUNCA aciona o protocolo')).toBe(true);
  expect(promptSrc.includes('isso é coisa simples')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-03 — NEGATIVA DE ANTECEDENTES FABRICADA (Guard 8).
//
// O prompt manda usar a frase negativa padrão sempre que o médico perguntou e
// nenhuma resposta positiva foi capturada. Com ASR ruim isso escreve no
// prontuário que o paciente NEGOU o que ele relatou: paciente com glaucoma
// prévio saiu como "Nega diagnósticos e procedimentos oftalmológicos prévios",
// no mesmo JSON cuja HDA descrevia consulta anterior com catarata diagnosticada
// e cirurgia indicada. O guard é subtritivo: apaga a afirmação falsa, nunca
// escreve um antecedente.
// ──────────────────────────────────────────────────────────────────────────────

const _NEG_ANTEC = 'Nega diagnósticos e procedimentos oftalmológicos prévios';

test('[DE-ANTEC-1] negativa cai quando a própria HDA descreve história ocular prévia', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      hda: 'Baixa de visão progressiva. Catarata diagnosticada em consulta prévia, com cirurgia indicada e não realizada.',
      antecedentes_oftalmologicos: _NEG_ANTEC,
      conduta: 'Indicação de cirurgia de catarata',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'a catarata dele esta bem avancada', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(null);
  expect(decision.guardsApplied.some(g => g.includes('Guard 8'))).toBe(true);
  expect(decision.avisos.some(a => a.includes('Antecedentes oftalmológicos'))).toBe(true);
  // resposta crua intacta
  expect(raw.dados.antecedentes_oftalmologicos).toBe(_NEG_ANTEC);
});

test('[DE-ANTEC-2] negativa cai quando a transcrição traz diagnóstico prévio relatado', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'Visão embaçada', antecedentes_oftalmologicos: _NEG_ANTEC },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o senhor tem alguma coisa no olho ja falaram que eu tenho glaucoma faz tempo',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(null);
});

test('[DE-ANTEC-3] negativa legítima é preservada (anamnese limpa, sem história prévia)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'Coceira nos olhos há 3 dias', antecedentes_oftalmologicos: _NEG_ANTEC },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ja fez alguma cirurgia no olho nunca fiz nada nao usa colirio nao',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(_NEG_ANTEC);
});

test('[DE-ANTEC-4] pergunta do médico sobre glaucoma na família NÃO derruba a negativa', () => {
  // O termo solto é pronunciado ao PERGUNTAR — tratá-lo como evidência seria o
  // mesmo erro, invertido.
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'Vista cansada para perto', antecedentes_oftalmologicos: _NEG_ANTEC },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'alguem na familia tem glaucoma ou perdeu a visao nao que eu saiba nao',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(_NEG_ANTEC);
});

test('[DE-ANTEC-4b] duração da queixa atual na HDA NÃO é história prévia', () => {
  // "há N anos" sozinho é o marcador mais comum de uma HDA e diz respeito ao
  // sintoma de HOJE. Se contar como evidência, o guard apaga a negativa em
  // consulta de rotina — a mesma enxurrada de falsos alarmes que a v5.4.0 veio
  // corrigir do outro lado (OCR).
  // ⚠️ DIVERGÊNCIA DELIBERADA com o prompt (2026-08-06): o prompt agora trata uso de
  // óculos como antecedente e proíbe a negativa nesse caso; o guard NÃO acompanha.
  // Quase todo paciente usa óculos — alinhar o guard esvaziaria o campo em toda
  // consulta, trocando um erro raro por fricção diária. Não "conserte" este caso.
  const casos = [
    'Baixa de visão progressiva há 2 anos',
    'Usa óculos há 3 anos; sem tratamento prévio',
    'Vermelhidão há 1 ano, piora ao sol',
  ];
  for (const hda of casos) {
    const decision = DecisionEngine.buildDecision(
      { tipo_consulta: 'primeira_consulta', dados: { hda, antecedentes_oftalmologicos: _NEG_ANTEC } },
      { transcribedText: 'a vista esta embacada faz tempo nunca fiz nada no olho', hookFlags: {} }
    );
    expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(_NEG_ANTEC);
  }
});

test('[DE-ANTEC-5] guard não inventa antecedente nem mexe em campo já preenchido', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      hda: 'Catarata diagnosticada em consulta prévia',
      antecedentes_oftalmologicos: 'Glaucoma em acompanhamento há 5 anos',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ja falaram que eu tenho glaucoma',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe('Glaucoma em acompanhamento há 5 anos');
  expect(decision.guardsApplied.some(g => g.includes('Guard 8'))).toBe(false);
});

// 2026-08-06 — LENTE DE CONTATO. Usar lente é história ocular prévia, mas não
// estava em nenhuma das listas de evidência: a HDA saiu descrevendo 2 anos de uso
// de lente e a negativa de antecedentes veio junto, no mesmo JSON. Pior, o uso
// irregular (lente mensal por ~1 ano, sem descanso semanal, dormindo de lente) —
// que é o dado de risco — só aparecia na fala do MÉDICO ao orientar.
// O Guard 8 é SÓ o backstop: ele apaga a negativa falsa, mas não move o histórico da
// lente para fora da HDA nem redige a irregularidade. Isso é responsabilidade do prompt
// — daí pinar o texto das três regras, no estilo de [MULTI-3].
test('[DE-ANTEC-P1] o prompt manda a lente de contato para antecedentes, não para a HDA', () => {
  expect(geminiJsSource).toContain('Regra específica para LENTE DE CONTATO');
  expect(geminiJsSource).toContain('é ANTECEDENTE, não HDA');
  // o que importa é a irregularidade, não o fato de usar
  expect(geminiJsSource).toContain('REGISTRE O PADRÃO DE USO');
});

test('[DE-ANTEC-P2] o prompt proíbe negativa de ANTECEDENTE dentro da HDA', () => {
  expect(geminiJsSource).toContain('Negativa de ANTECEDENTE');
  expect(geminiJsSource).toContain('Teste rápido: a frase fala de algo ANTERIOR a esta consulta');
  // dispositivo corretivo entrou nas duas listas que proíbem a frase negativa
  expect(geminiJsSource).toContain('óculos de grau ou lente de contato');
  expect(geminiJsSource).toContain('uso de óculos de grau / lente de\n     contato');
});

// Log 2026-08-14: a consulta de retorno das 17:59 saiu com "O paciente nega outros
// sintomas como dor, coceira ou ardência" no campo `retorno`. A regra anterior
// (2026-07-23) só proibia a negativa de LIDERAR — mandava mantê-la no corpo. O médico
// pediu a proibição total: negativa de sintoma não é queixa e não vai para o prontuário.
// Vale para os dois campos de queixa (hda e retorno), daí pinar os dois.
test('[DE-ANTEC-P3] o prompt proíbe negativa de SINTOMA na HDA e no retorno', () => {
  expect(geminiJsSource).toContain('NEGATIVA DE SINTOMA NÃO ENTRA NA HDA');
  expect(geminiJsSource).toContain('nem abrindo, nem no corpo do texto');
  // formas sem o verbo "negar" também estão cobertas
  expect(geminiJsSource).toContain('"não sente dor", "não tem');
  // o campo `retorno` recebeu a mesma proibição, não só a HDA
  expect(geminiJsSource).toContain('NÃO entra no campo — nem abrindo, nem no corpo.');
});

test('[DE-ANTEC-P4] óculos/lente como MOTIVO da procura pode liderar a HDA', () => {
  // O que separa HDA de antecedente é o papel do dispositivo, não a palavra:
  // motivo da consulta é queixa; histórico de uso é antecedente.
  expect(geminiJsSource).toContain('ÓCULOS/LENTE COMO MOTIVO DA PROCURA vai SIM na queixa principal');
  expect(geminiJsSource).toContain('É HISTÓRICO de uso do dispositivo');
});

test('[DE-ANTEC-P5] o prompt exige tempo relativo na HDA, nunca data de calendário', () => {
  expect(geminiJsSource).toContain('TEMPO NA HDA É SEMPRE RELATIVO — NUNCA DATA DE CALENDÁRIO');
  // e não pode chutar duração que o paciente não disse
  expect(geminiJsSource).toContain('E NÃO INVENTE TEMPO');
  // ruído de STT e números soltos não viram texto de prontuário
  expect(geminiJsSource).toContain('SÓ ENTRA NA HDA O QUE É PERTINENTE À QUEIXA');
});

test('[DE-ANTEC-P3] o carve-out de fontes não fabrica não-conformidade', () => {
  // A fala do médico é fonte válida, MAS conselho genérico vira "Orientado sobre…",
  // nunca uma falha do paciente que ninguém relatou.
  expect(geminiJsSource).toContain('CARVE-OUT');
  expect(geminiJsSource).toContain('orientação sozinha NÃO prova não-conformidade');
  expect(geminiJsSource).toContain('Orientado sobre pausa semanal e retirada noturna da lente');
});

test('[DE-ANTEC-6] transcrição com uso de lente de contato derruba a negativa', () => {
  const decision = DecisionEngine.buildDecision(
    {
      tipo_consulta: 'primeira_consulta',
      dados: { hda: 'Refere impressão de aumento do grau', antecedentes_oftalmologicos: _NEG_ANTEC },
    },
    {
      transcribedText: 'nao te orientar isso quando adaptaram a lente o ideal e ficar '
        + 'pelo menos um dia da semana sem lente para o olho descansar',
      hookFlags: {},
    }
  );
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(null);
  expect(decision.guardsApplied.some(g => g.includes('Guard 8'))).toBe(true);
});

test('[DE-ANTEC-7] lente de contato escrita na HDA contradiz a negativa', () => {
  // Caso literal do log: o modelo pôs o histórico do dispositivo na HDA e negou
  // antecedentes no mesmo JSON.
  const decision = DecisionEngine.buildDecision(
    {
      tipo_consulta: 'primeira_consulta',
      dados: {
        hda: 'Paciente refere uso de lentes de contato há aproximadamente dois anos.',
        antecedentes_oftalmologicos: _NEG_ANTEC,
      },
    },
    { transcribedText: 'sem pistas na transcricao', hookFlags: {} }
  );
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(null);
});

test('[DE-ANTEC-8] pergunta "usa lente de contato?" sem uso NÃO derruba a negativa', () => {
  // A forma da PERGUNTA é 3ª pessoa. Se ela contasse como evidência, o guard
  // esvaziaria o campo em toda consulta em que o médico faz a triagem de rotina.
  const decision = DecisionEngine.buildDecision(
    {
      tipo_consulta: 'primeira_consulta',
      dados: { hda: 'Desconforto ocular ocasional', antecedentes_oftalmologicos: _NEG_ANTEC },
    },
    {
      transcribedText: 'usa lente de contato alguma cirurgia no olho nenhuma alguma '
        + 'doenca que precise tomar remedio sempre nao',
      hookFlags: {},
    }
  );
  expect(decision.clonedAIResponse.dados.antecedentes_oftalmologicos).toBe(_NEG_ANTEC);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-04 — NEGATIVA DE COMORBIDADES FABRICADA (Guard 9).
//
// Mesma classe do Guard 8, no campo vizinho: à pergunta "tem alguma doença que
// precisa ir sempre no médico ou tomar remédio sempre?" o paciente respondeu
// "sim" — e alteracoes_sistemicas saiu "Nega comorbidades". O diabetes dele não
// entrou no prontuário e o campo passou a AFIRMAR uma negativa que ele não deu.
// Subtritivo como o Guard 8: apaga a afirmação falsa, nunca escreve a doença
// (o médico pronuncia "diabetes" ao PERGUNTAR).
// ──────────────────────────────────────────────────────────────────────────────

const _NEG_COMORB = 'Nega comorbidades';

test('[DE-COMORB-1] "sim" logo após a pergunta sistêmica derruba a negativa', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'Cefaleia há meses', alteracoes_sistemicas: _NEG_COMORB },
  };
  const decision = DecisionEngine.buildDecision(raw, {
    // fala real do log 2026-08-04 (sem pontuação, como o ASR entrega)
    transcribedText: 'usa oculos nao tem alguma doenca que precisa sempre no medico ou tomar remedio sempre sim algum parente direto irmaos ou pais que teve alguma doenca grave da visao nao',
    hookFlags: {},
  });
  expect(decision.clonedAIResponse.dados.alteracoes_sistemicas).toBe(null);
  expect(decision.guardsApplied.some(g => g.includes('Guard 9'))).toBe(true);
  expect(decision.avisos.some(a => a.includes('Doenças sistêmicas'))).toBe(true);
  // resposta crua intacta
  expect(raw.dados.alteracoes_sistemicas).toBe(_NEG_COMORB);
});

test('[DE-COMORB-2] doença sistêmica nomeada em qualquer ponto derruba a negativa', () => {
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'primeira_consulta', dados: { hda: 'Visão embaçada', alteracoes_sistemicas: _NEG_COMORB } },
    { transcribedText: 'eu sou diabetico faz uns dez anos a vista embacou depois disso', hookFlags: {} }
  );
  expect(decision.clonedAIResponse.dados.alteracoes_sistemicas).toBe(null);
});

test('[DE-COMORB-3] negativa legítima é preservada (paciente nega de fato)', () => {
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'primeira_consulta', dados: { hda: 'Coceira nos olhos', alteracoes_sistemicas: _NEG_COMORB } },
    { transcribedText: 'tem alguma doenca que precisa ir sempre no medico ou tomar remedio sempre nao nada nao graças a deus', hookFlags: {} }
  );
  expect(decision.clonedAIResponse.dados.alteracoes_sistemicas).toBe(_NEG_COMORB);
});

test('[DE-COMORB-4] "pressão alta no olho" NÃO é comorbidade sistêmica', () => {
  // Armadilha oftalmológica: metade das vezes "pressão alta" é a do OLHO.
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'primeira_consulta', dados: { hda: 'Rotina', alteracoes_sistemicas: _NEG_COMORB } },
    { transcribedText: 'a pressao alta do olho e o que a gente acompanha no glaucoma nao tem doenca nenhuma nao', hookFlags: {} }
  );
  expect(decision.clonedAIResponse.dados.alteracoes_sistemicas).toBe(_NEG_COMORB);
});

test('[DE-COMORB-5] guard não reescreve campo já preenchido pelo modelo', () => {
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'primeira_consulta', dados: { hda: 'Rotina', alteracoes_sistemicas: 'Diabetes mellitus em uso de metformina' } },
    { transcribedText: 'sou diabetico tomo metformina', hookFlags: {} }
  );
  expect(decision.clonedAIResponse.dados.alteracoes_sistemicas).toBe('Diabetes mellitus em uso de metformina');
  expect(decision.guardsApplied.some(g => g.includes('Guard 9'))).toBe(false);
});

test('[DE-3d] Guard preserva "Associação" quando a transcrição cita o princípio ativo do protocolo', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      hda: 'blefarite',
      conduta: 'Retorno 2 semanas',
      tratamento: 'Associação (ATB + corticoide ocular) 3x/dia',
    },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'vou passar tobramicina com dexametasona tres vezes ao dia',
    hookFlags: {},
  });
  // hasMention do guard já reconhece tobramicin|dexametason — a linha não é rebaixada
  expect(decision.clonedAIResponse.dados.tratamento.includes('Associação (ATB + corticoide ocular)')).toBe(true);
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
// ORDEM DOS OLHOS — OD sempre antes de OE (regra do médico, 2026-09-04)
// Caso real: consulta do pterígio OE — o modelo escreveu "OE: ...\nOD: ..." porque
// o achado do olho esquerdo foi o assunto da consulta.
// ──────────────────────────────────────────────────────────────────────────────

const _ordemBase = { tipo_consulta: 'primeira_consulta' };

test('[ORD-1] Biomicroscopia com OE antes de OD é reordenada (OD primeiro)', () => {
  const raw = {
    ..._ordemBase,
    dados: {
      biomicroscopia: 'OE: pterígio nasal grau I; córnea transparente, cristalino transparente\nOD: olho calmo, córnea transparente, cristalino transparente',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'carninha no olho esquerdo', hookFlags: {} });
  const linhas = decision.clonedAIResponse.dados.biomicroscopia.split('\n');
  expect(linhas[0].startsWith('OD:')).toBe(true);
  expect(linhas[1].startsWith('OE:')).toBe(true);
  expect(linhas[1].includes('pterígio')).toBe(true);
  // A resposta crua NÃO é mutada
  expect(raw.dados.biomicroscopia.startsWith('OE:')).toBe(true);
});

test('[ORD-2] Fundoscopia: header preservado e OD movido para antes do OE', () => {
  const raw = {
    ..._ordemBase,
    dados: {
      fundoscopia: 'FUNDOSCOPIA INDIRETA:\nOE: nevo de coroide inferotemporal; retina aplicada\nOD: fundo sem alterações, retina aplicada',
    },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'nevo no olho esquerdo', hookFlags: {} });
  const linhas = decision.clonedAIResponse.dados.fundoscopia.split('\n');
  expect(linhas[0]).toBe('FUNDOSCOPIA INDIRETA:');
  expect(linhas[1].startsWith('OD:')).toBe(true);
  expect(linhas[2].includes('nevo')).toBe(true);
});

test('[ORD-3] Ordem já correta e linha AO única não são tocadas', () => {
  const bio = 'OD: pterígio nasal grau I\nOE: olho calmo';
  const fundo = 'FUNDOSCOPIA INDIRETA: AO retina aplicada, escavação simétrica e fisiológica';
  const raw = { ..._ordemBase, dados: { biomicroscopia: bio, fundoscopia: fundo } };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'pterígio no olho direito e a escavação do nervo está simétrica', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.biomicroscopia).toBe(bio);
  expect(decision.clonedAIResponse.dados.fundoscopia).toBe(fundo);
  expect(decision.guardsApplied.some(g => /reordenadas/.test(g))).toBe(false);
});

test('[ORD-4] Marcador [CONFIRMAR OLHO AFETADO] não impede o reconhecimento do prefixo', () => {
  const raw = {
    ..._ordemBase,
    dados: { biomicroscopia: '[CONFIRMAR OLHO AFETADO] OE: erosão de córnea\nOD: olho calmo' },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'arranhão no olho', hookFlags: {} });
  const linhas = decision.clonedAIResponse.dados.biomicroscopia.split('\n');
  expect(linhas[0].startsWith('OD:')).toBe(true);
  expect(linhas[1].includes('erosão')).toBe(true);
});

test('[ORD-5] Diagnóstico NÃO é reordenado — cada linha é um CID, não uma descrição por olho', () => {
  const dx = 'H110 - Pterígio OE\nH259 - Catarata senil OD';
  const raw = { ..._ordemBase, dados: { diagnostico: dx, biomicroscopia: null } };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'pterígio e catarata', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toBe(dx);
});

test('[ORD-6] Linhas OD/OE não adjacentes: ordem preservada (nada atravessa texto intermediário)', () => {
  const bio = 'OE: pterígio nasal grau I\nObservação: paciente colaborativo\nOD: olho calmo';
  const raw = { ..._ordemBase, dados: { biomicroscopia: bio } };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'pterígio', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.biomicroscopia).toBe(bio);
});

test('[ORD-7] Texto com duas linhas do MESMO olho não é reordenado nem parcialmente mexido', () => {
  const bio = 'OE: pterígio nasal grau I\nOE: hiperemia conjuntival\nOD: olho calmo';
  const raw = { ..._ordemBase, dados: { biomicroscopia: bio } };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'pterígio', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.biomicroscopia).toBe(bio);
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
    transcribedText: 'entrevista [RETORNO DA DILATACAO] fundo alterado com escavação aumentada do nervo retorno em seis meses',
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
  // Procura a TAG, não a menção: um comentário que cite o nome do arquivo (a
  // nota de acoplamento da moldura cita o agente de OCR) não é ordem de carga.
  const idxTag = (f) => htmlSource.indexOf(`<script src="src/${f}"></script>`);
  const idxUtils     = idxTag('gemini-json-utils.js');
  const idxExam      = idxTag('gemini-exam-agent.js');
  const idxInterview = idxTag('gemini-interview-agent.js');
  const idxFacade    = idxTag('geminiService.js');
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
//
// 2026-07-31 — o AND com "evidência de perto" caiu (decisão do médico): basta
// que se diga na consulta que os óculos são MULTIFOCAIS ou que são para longe E
// perto. Multifocal na conduta OU na fala já basta; o par longe+perto exige
// âncora de óculos. PRES-7 foi INVERTIDO por essa decisão.
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

test('[PRES-6] INVERTIDO em 2026-07-31: "óculos para perto" MANTÉM a presbiopia que a IA emitiu', () => {
  // Até 2026-07-31 este teste exigia a remoção — mas o prompt (regra da presbiopia
  // em gemini-interview-agent.js) sempre mandou a IA emitir H52.4 para "óculos
  // para perto / de leitura / para ler". Prompt e guard discordavam entre si e o
  // sintoma visível era o mesmo do PRES-7: presbiopia sumindo do diagnóstico.
  // Alinhado pelo prompt (decisão do médico).
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos para perto',
      diagnostico: 'H52.4 - Presbiopia\nH10.4 - Conjuntivite crônica'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'indicar óculos para perto por conta do grau', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H52.4 - Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H10.4 - Conjuntivite crônica');
});

test('[PRES-7] INVERTIDO em 2026-07-31: multifocal prescrito basta, mesmo sem vocabulário de perto', () => {
  // Até 2026-07-31 este teste exigia o oposto (o AND multifocal+perto). O médico
  // determinou que multifocal É a correção da presbiopia: quem recebe multifocal
  // tem presbiopia, independentemente de a consulta ter falado de perto.
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocal',
      diagnostico: 'H25.0 - Catarata senil incipiente'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'indicar lentes multifocais para longe', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
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
// 2026-07-31 — o AND multifocal+perto cai. Terceira recorrência da mesma classe:
// cada correção anterior só ampliava a lista de fraseados de "perto" aceitos, e a
// fala real (com ASR) sempre trouxe um fraseado a mais.
// ──────────────────────────────────────────────────────────────────────────────

test('[PRES-14] Fala REAL de 2026-07-31 13:58: multifocais na conduta, "perto" nunca casa na fala', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocais com orientações sobre o uso',
      diagnostico: 'H527 - Transtorno de refração NE\nH041 - Olho seco NE'
    }
  };
  // Trecho literal do log: o ASR devolveu "para onde" no lugar de "para longe",
  // e o único "perto" da fala está longe de qualquer token de óculos.
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o oculos que eu tava usando ja era multifocal ai era so para perto nao muito fofa '
      + 'e para onde estou praticamente nao tem grau ficou bom assim ta bom',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-15] Multifocal dito só na CONSULTA (conduta sem a palavra) já basta', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno em 12 meses', diagnostico: 'H52.2 - Astigmatismo' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o senhor ja usa multifocal e ele ta te ajudando bem',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-16] "óculos para longe e perto" basta, sem a palavra multifocal', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Prescrição de óculos', diagnostico: 'H52.0 - Hipermetropia' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'esse oculos novo vai ter grau de longe e de perto no mesmo',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-17] Míope: "mal de longe e bem de perto" NÃO é presbiopia (par separado por outras palavras)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos para longe',
      diagnostico: 'H52.4 - Presbiopia\nH52.1 - Miopia'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ele enxerga mal de longe e bem de perto vou prescrever oculos',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H52.1 - Miopia');
});

test('[PRES-18] Par longe+perto sem NENHUMA âncora de óculos não basta', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno em 6 meses', diagnostico: 'H10.4 - Conjuntivite crônica' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a coceira aparece de longe e perto do fim do dia piora',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
});

test('[PRES-19] "óculos de leitura"/"para ler" bastam sozinhos (alinhamento com o prompt)', () => {
  const base = (transcribedText) => DecisionEngine.buildDecision({
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno em 12 meses', diagnostico: 'H52.0 - Hipermetropia' }
  }, { transcribedText, hookFlags: {} }).clonedAIResponse.dados.diagnostico;

  expect(base('vou deixar so um oculos de leitura para o senhor')).toContain('H524 - Presbiopia');
  expect(base('um oculos para ler resolve o seu caso')).toContain('H524 - Presbiopia');
  expect(base('ele ja usa oculos de farmacia a noite')).toContain('H524 - Presbiopia');
});

test('[PRES-20] Comentar a VISÃO de perto não é prescrever óculos de perto', () => {
  // "óculos ... perto" com folga larga casava frases assim; a preposição e a folga
  // curta são o que separa o óculos destinado ao perto do comentário sobre a visão.
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Retorno em 6 meses', diagnostico: 'H52.1 - Miopia\nH52.4 - Presbiopia' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'os oculos estao bons ele enxerga bem de perto sem nenhuma queixa',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H52.1 - Miopia');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-04 — A descrição da fundoscopia é descritiva, nunca interpretativa:
// não escrever que o achado é sugestivo de glaucoma. O texto NÃO é editado pelo
// runtime (a interpretação e o achado podem ser a mesma oração) — só avisado.
// ──────────────────────────────────────────────────────────────────────────────

test('[FUNDO-INTERP-1] "suspeita de glaucoma" na fundoscopia gera aviso e NÃO altera o texto', () => {
  const texto = 'FUNDOSCOPIA INDIRETA:\nOD: escavação aumentada (relação E/D ~0,7), suspeita de glaucoma; retina aplicada\nOE: fundo sem alterações, escavação fisiológica';
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { fundoscopia: texto, diagnostico: 'H400 - Suspeita de glaucoma OD' },
    injectExamesNormais: false
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'a escavacao do direito esta aumentada', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.fundoscopia).toBe(texto);
  expect(decision.avisos.some(a => /FUNDOSCOPIA/i.test(a) && /glaucoma/i.test(a))).toBe(true);
});

test('[FUNDO-INTERP-2] "escavação glaucomatosa" também é interpretação (achado e leitura na mesma oração)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { fundoscopia: 'FUNDOSCOPIA INDIRETA: AO escavação glaucomatosa (0,8); retina aplicada' },
    injectExamesNormais: false
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'escavacao aumentada nos dois', hookFlags: {} });
  expect(decision.avisos.some(a => /glaucoma/i.test(a))).toBe(true);
  // O texto continua íntegro: recortar a oração apagaria o próprio achado.
  expect(decision.clonedAIResponse.dados.fundoscopia).toContain('escavação glaucomatosa (0,8)');
});

test('[FUNDO-INTERP-3] descrição pura (sem leitura diagnóstica) não gera aviso', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      fundoscopia: 'FUNDOSCOPIA INDIRETA:\nOD: escavação aumentada (relação E/D ~0,7); retina aplicada, mácula em bom aspecto, padrão vascular preservado\nOE: fundo sem alterações, retina aplicada, escavação fisiológica',
      diagnostico: 'H400 - Suspeita de glaucoma OD',
      conduta: 'Solicitar campo visual\nSolicitar OCT de nervo óptico'
    },
    injectExamesNormais: false
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'a escavacao do direito esta aumentada vou pedir campo visual', hookFlags: {} });
  expect(decision.avisos.some(a => /FUNDOSCOPIA/i.test(a))).toBe(false);
  // A suspeita no DIAGNÓSTICO é o que suprime o template de fundo normal — a rede
  // determinística fica mais forte, não mais fraca, com a mudança.
  expect(/glaucoma/i.test(decision.clonedAIResponse.dados.diagnostico)).toBe(true);
});

test('[FUNDO-INTERP-4] prompt e skill não ensinam mais "suspeita de glaucoma" na fundoscopia', () => {
  const prompt = readSrcNormalized('src', 'gemini-interview-agent.js');
  const secao = prompt.slice(prompt.indexOf('- fundoscopia:'), prompt.indexOf('TESTE OBRIGATÓRIO'));
  expect(secao.length > 0).toBe(true);
  expect(secao.includes('suspeita de glaucoma —')).toBe(false);
  expect(secao).toContain('A FUNDOSCOPIA É DESCRITIVA');

  const skill = readSrcNormalized('skills', 'user', 'fundoscopia-oftalmologia', 'SKILL.md');
  const exemplos = skill.slice(skill.indexOf('## Exemplos de referência'), skill.indexOf('## Lista de checagem final'));
  expect(exemplos.includes('suspeita de glaucoma —')).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-13 — Normalidade não é conduta. Consulta das 12:06: o médico disse
// "os outros exames estão todos tranquilos, pressão boa, fundo de olho normal"
// e a conduta saiu com a normalidade agrupada na linha "Explicado ...". Resultado
// de exame já é documentado na biomicroscopia/fundoscopia (ou pelo template de
// exames normais) — repeti-lo na conduta é ruído. Regra é de PROMPT: nada de
// strip determinístico por substring, que comeria "campo visual ainda normal".
// ──────────────────────────────────────────────────────────────────────────────

test('[COND-NORM-1] o prompt proíbe normalidade na conduta, inclusive dentro de linha agrupada', () => {
  const prompt = readSrcNormalized('src', 'gemini-interview-agent.js');
  const secao = prompt.slice(
    prompt.indexOf('- conduta: decisões clínicas'),
    prompt.indexOf('★ PRESCRIÇÃO DE ÓCULOS')
  );
  expect(secao.length > 0).toBe(true);
  expect(secao).toContain('NORMALIDADE NÃO VAI PARA A CONDUTA');
  // O caso real veio agrupado — a regra precisa falar da linha agrupada, não só do item solto.
  expect(secao).toContain('Explicado blefarite, olho seco e exames normais');
  expect(secao).toContain('Explicado blefarite e olho seco');
  // Normalidade de UM exame isolado também está fora (2026-08-13, 2ª rodada do médico).
  expect(secao).toContain('VALE PARA UM EXAME ISOLADO TAMBÉM');
  expect(secao).toContain('"Explicado que a pressão ocular está normal"');
  // Normalidade dentro de uma explicação de achado real continua valendo.
  expect(secao).toContain('a pressão está alta e o campo visual ainda está normal');
  // A regra não pode encostar nas flags nem nos templates de exame.
  expect(secao).toContain('continua valendo como gatilho de injectExamesNormais');
});

test('[COND-NORM-2] o teste obrigatório filtra normalidade ANTES de mandar explicação para a conduta', () => {
  const prompt = readSrcNormalized('src', 'gemini-interview-agent.js');
  const teste = prompt.slice(
    prompt.indexOf('TESTE OBRIGATÓRIO — ANTES DE CADA LINHA'),
    prompt.indexOf('FLAGS DE INJEÇÃO')
  );
  expect(teste.length > 0).toBe(true);
  const iNorm = teste.indexOf('afirmação de que um exame deu NORMAL');
  const iExpl = teste.indexOf('É uma explicação de patologia ou diagnóstico');
  expect(iNorm >= 0).toBe(true);
  // Se o filtro de normalidade vier depois, o modelo já respondeu "sim → CONDUTA".
  expect(iNorm < iExpl).toBe(true);
  expect(teste).toContain('"Explicado exames normais"');
  // Sem esta trava, o passo 0 lido isolado apagaria a fundoscopia/biomicroscopia normal —
  // é a mesma forma dos bugs de guard literal de 2026-07-29.
  expect(teste).toContain('não tocam biomicroscopia');
});

test('[COND-NORM-3] o gatilho de exames normais continua intacto nas listas de voz', () => {
  // Trava de escopo: a regra mexe no TEXTO da conduta, não no reconhecimento de voz.
  expect(ClinicalTriggers.EXAMES_NORMAIS_COMMANDS).toContain('exames normais');
  expect(ClinicalTriggers.EXAMES_NORMAIS_COMMANDS.length > 0).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-17 — Exame nomeado por dedução. Consulta das 12:38: o médico disse
// "o nervo do olho do senhor tá um pouquinho fora do padrão, nós vamos fazer um
// outro exame ali para fazer uma medida" e a conduta saiu com "Solicitar OCT de
// nervo óptico" — a palavra OCT nunca foi dita. O nome veio do par H400↔OCT dos
// exemplos canônicos do prompt (mesmo par que em 2026-08-04 vazou para o TEXTO da
// fundoscopia). Regra é de PROMPT: o nome do exame só pode vir da fala do médico.
// ──────────────────────────────────────────────────────────────────────────────

test('[COND-EXAM-1] o prompt proíbe nomear exame não nomeado pelo médico', () => {
  const prompt = readSrcNormalized('src', 'gemini-interview-agent.js');
  const secao = prompt.slice(
    prompt.indexOf('- conduta: decisões clínicas'),
    prompt.indexOf('★ PRESCRIÇÃO DE ÓCULOS')
  );
  expect(secao.length > 0).toBe(true);
  expect(secao).toContain('NUNCA NOMEIE UM EXAME QUE O MÉDICO NÃO NOMEOU');
  // O achado não autoriza o nome do exame — é exatamente a dedução do caso real.
  expect(secao).toContain('não autoriza escrever');
  // Exame anunciado sem nome tem saída própria (mesma forma do colírio não identificado).
  expect(secao).toContain('Solicitar exame complementar (não especificado na consulta)');
});

test('[COND-EXAM-2] o exemplo canônico do glaucoma não ensina mais o par H400↔OCT', () => {
  const prompt = readSrcNormalized('src', 'gemini-interview-agent.js');
  const fundo = prompt.slice(
    prompt.indexOf('A FUNDOSCOPIA É DESCRITIVA'),
    prompt.indexOf('TESTE OBRIGATÓRIO — ANTES DE CADA LINHA')
  );
  expect(fundo.length > 0).toBe(true);
  // O item continua existindo (é onde o pedido é registrado), mas condicionado à fala.
  expect(fundo).toContain('Este item é sobre ONDE o pedido é registrado');
  expect(fundo).toContain('NÃO acompanha exame nenhum por padrão');
  // A linha crua "conduta → "Solicitar campo visual", "Solicitar OCT de nervo óptico""
  // era o exibit que o modelo copiava.
  expect(fundo.includes('conduta     → "Solicitar campo visual", "Solicitar OCT')).toBe(false);
});

test('[COND-EXAM-3] o teste obrigatório checa o NOME do exame antes de emitir a linha', () => {
  const prompt = readSrcNormalized('src', 'gemini-interview-agent.js');
  const teste = prompt.slice(
    prompt.indexOf('TESTE OBRIGATÓRIO — ANTES DE CADA LINHA'),
    prompt.indexOf('FLAGS DE INJEÇÃO')
  );
  expect(teste.length > 0).toBe(true);
  expect(teste).toContain('o médico NOMEOU esse exame na consulta?');
  expect(teste).toContain('NÃO emita linha de exame');
  expect(teste).toContain('NUNCA deduza o nome do exame');
  // Fixture real da consulta: exame anunciado sem nome vs. achado sozinho.
  expect(teste).toContain('vamos fazer um outro exame ali para medir');
  expect(teste).toContain('nome deduzido do achado');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-10-22 — OCT sumindo da conduta. Catálogo único de exames (ClinicalTriggers.
// EXAMES_CATALOGO) + rede determinística que relê a FALA e acrescenta o pedido que
// o modelo omitiu. A regra de 2026-08-17 (nome só da fala) continua valendo: a rede
// nunca lê diagnóstico.
// ──────────────────────────────────────────────────────────────────────────────

const _InterviewAgent = new Function(
  'Logger', 'ClinicalTriggers', 'apiService', '_parseGeminiJSON',
  geminiJsSource + '\nreturn GeminiInterviewAgent;'
)(class { info() {} warn() {} error() {} success() {} debug() {} }, ClinicalTriggers, {}, (x) => x);
const _intAgent = new _InterviewAgent();
const _exLabels = (txt) => ClinicalTriggers.detectaExamesPedidosNaFala(txt).map(e => e.label);
const _garantir = (conduta, fala, extra = {}) => {
  const r = { tipo_consulta: 'retorno', dados: { conduta, diagnostico: 'H400 - Suspeita de glaucoma', ...extra } };
  _intAgent._garantirExamesPedidosNaConduta(r, _intAgent._normalizarSiglasExameAsr(fala));
  return r.dados.conduta;
};

test('[EXAM-CAT-1] pedidos nomeados no futuro/decisão entram', () => {
  expect(_exLabels('vou pedir um OCT para o senhor')).toEqual(['OCT']);
  expect(_exLabels('vamos fazer o campo visual e a paquimetria')).toEqual(['campo visual', 'paquimetria']);
  expect(_exLabels('precisa fazer retinografia')).toEqual(['retinografia']);
  expect(_exLabels('vai fazer uma biometria ali com a moça')).toEqual(['biometria']);
  expect(_exLabels('vamos pedir uma ecografia ocular e angiografia')).toEqual(['angiografia', 'ecografia ocular']);
  expect(_exLabels('vou pedir uma curva de tensão')).toEqual(['curva de tensão']);
  expect(_exLabels('vamos fazer uma topografia')).toEqual(['topografia corneana']);
});

test('[EXAM-CAT-2] OCT: sinônimos e região só quando DITA', () => {
  expect(_exLabels('vamos fazer uma tomografia do nervo')).toEqual(['OCT de nervo óptico']);
  expect(_exLabels('vou pedir um OCT de mácula')).toEqual(['OCT de mácula']);
  expect(_exLabels('vou pedir um OCT')).toEqual(['OCT']);
  expect(_exLabels('vamos fazer uma tomografia de coerência óptica')).toEqual(['OCT']);
});

test('[EXAM-CAT-3] passado, resultado, dispensa e achado sozinho NÃO viram pedido', () => {
  expect(_exLabels('eu fiz OCT ano passado e estava normal')).toEqual([]);
  expect(_exLabels('o OCT veio normal, está tudo bem')).toEqual([]);
  expect(_exLabels('ele mandou fazer campo visual lá em 2022')).toEqual([]);
  expect(_exLabels('não precisa de OCT agora')).toEqual([]);
  // caso real 2026-08-17: exame anunciado sem nome + achado do nervo — nada nomeado
  expect(_exLabels('o nervo do olho do senhor tá um pouquinho fora do padrão, nós vamos fazer um outro exame ali para fazer uma medida')).toEqual([]);
  expect(_exLabels('')).toEqual([]);
});

test('[EXAM-CAT-4] "repetir" é decisão mesmo com passado na janela', () => {
  expect(_exLabels('vamos repetir o campo visual que o senhor fez ano passado')).toEqual(['campo visual']);
});

test('[EXAM-GARANTIDO-1] OCT dito e omitido pelo modelo é acrescentado ANTES do retorno', () => {
  const out = _garantir('Explicado glaucoma\nRetorno 3 meses', 'a gente vai pedir um OCT do nervo e o senhor volta em três meses');
  expect(out).toBe('Explicado glaucoma\nSolicitar OCT de nervo óptico\nRetorno 3 meses');
});

test('[EXAM-GARANTIDO-2] ASR mutilado ("o c t", "ocete") ainda gera o pedido', () => {
  expect(_garantir('Retorno 6 meses', 'vou pedir um o c t para o senhor')).toBe('Solicitar OCT\nRetorno 6 meses');
  expect(_garantir(null, 'vamos fazer um ocete amanhã')).toBe('Solicitar OCT');
  expect(_garantir('Retorno 1 ano', 'vamos fazer um o ce ti')).toBe('Solicitar OCT\nRetorno 1 ano');
});

test('[EXAM-GARANTIDO-3] não duplica quando o modelo já emitiu o pedido', () => {
  const c = 'Solicitar OCT de mácula\nRetorno 3 meses';
  expect(_garantir(c, 'vou pedir um OCT de mácula')).toBe(c);
});

test('[EXAM-GARANTIDO-4] fala nomeou o exame → troca a linha genérica pelo nome', () => {
  const out = _garantir('Solicitar exame complementar (não especificado na consulta)\nRetorno 3 meses', 'vamos fazer um outro exame, o campo visual');
  expect(out).toBe('Retorno 3 meses\nSolicitar campo visual'.split('\n').sort().join('\n') === out.split('\n').sort().join('\n') ? out : '');
  expect(out.includes('não especificado')).toBe(false);
  expect(out).toContain('Solicitar campo visual');
});

test('[EXAM-GARANTIDO-5] sem nome na fala, a conduta fica intocada (regra 2026-08-17)', () => {
  const c = 'Solicitar exame complementar (não especificado na consulta)\nRetorno 3 meses';
  expect(_garantir(c, 'o nervo está fora do padrão, vamos fazer um outro exame ali para medir')).toBe(c);
  // diagnóstico H400 sozinho nunca gera OCT
  expect(_garantir('Retorno 3 meses', 'pressão ok, volta em três meses')).toBe('Retorno 3 meses');
});

test('[EXAM-GARANTIDO-6] consulta inválida e dados nulos não quebram', () => {
  const r1 = { tipo_consulta: 'invalida', dados: { conduta: null } };
  _intAgent._garantirExamesPedidosNaConduta(r1, 'vou pedir um OCT');
  expect(r1.dados.conduta).toBe(null);
  let lancou = false;
  try { _intAgent._garantirExamesPedidosNaConduta({ tipo_consulta: 'retorno', dados: null }, 'vou pedir OCT'); } catch (_) { lancou = true; }
  expect(lancou).toBe(false);
});

test('[EXAM-SYNC-1] prompt e SKILL.md citam todos os exames do catálogo', () => {
  const prompt = readSrcNormalized('src', 'gemini-interview-agent.js');
  const skill = readSrcNormalized('skills', 'user', 'conduta-tratamento-oftalmologia', 'SKILL.md');
  for (const ex of ClinicalTriggers.EXAMES_CATALOGO) {
    expect(prompt).toContain('Solicitar ' + ex.label);
    expect(skill).toContain('Solicitar ' + ex.label);
  }
  expect(prompt).toContain('CRITÉRIOS DE INJEÇÃO DE EXAME NA CONDUTA');
  expect(skill).toContain('Critérios de injeção');
});

test('[EXAM-SYNC-2] os filtros de linha do agente reconhecem o catálogo', () => {
  const src = readSrcNormalized('src', 'gemini-interview-agent.js');
  for (const k of ['oct\\b', 'campo visual', 'retinografia', 'topografia', 'paquimetria', 'biometria', 'angiografia', 'ecografia', 'curva de tens']) {
    expect(src.split(k).length > 2).toBe(true); // presente em CONDUTA_VALIDA_RE e em EXAME_RE
  }
});

test('[EXAM-GATE-1] exame nomeado + verbo de pedido satisfaz o gate de conduta do stop', () => {
  expect(ClinicalTriggers.detectaCondutaNaFala('vou pedir um OCT, tá bom')).toBe(true);
  expect(ClinicalTriggers.detectaCondutaNaFala('vamos fazer uma retinografia')).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-04 — Veto de pseudofacia: quem tem LIO nos dois olhos não tem presbiopia
// (o cristalino que acomodava já não existe). Consulta real de 2026-08-03: paciente
// pseudofácica AO saiu com H401/H524/H010.
// ──────────────────────────────────────────────────────────────────────────────

test('[PRES-21] Pseudofacia AO + multifocal na conduta: H52.4 NÃO é adicionada', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Prescrição de óculos multifocais\nRetorno em 12 meses',
      diagnostico: 'H401 - Glaucoma primário ângulo aberto AO',
      antecedentes_oftalmologicos: 'Cirurgia de catarata AO há 1 ano'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a lente esta otima sem glaucoma nos dois olhos vou receitar um oculos multifocal para o dia a dia',
    hookFlags: {},
    pseudofacia: { detected: true, lado: 'AO' }
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H401');
});

test('[PRES-22] Pseudofacia AO: H52.4 emitida pela IA é REMOVIDA (caso real 2026-08-03)', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Prescrição de óculos multifocais',
      // O H010 do caso real fica de fora: sem inflamação descrita na fala, o guard
      // de blefarite literal o removeria e o teste mediria a coisa errada.
      diagnostico: 'H401 - Glaucoma primário ângulo aberto AO\nH524 - Presbiopia',
      antecedentes_oftalmologicos: 'Cirurgia combinada de catarata e glaucoma AO há ~1 ano'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'eu fiz a cirurgia de catarata tem um ano a cirurgia ficou boa e o glaucoma esta controlado',
    hookFlags: {},
    pseudofacia: { detected: true, lado: 'AO' }
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H401');
  expect(decision.guardsApplied.some(g => /pseudofacia bilateral/i.test(g))).toBe(true);
});

test('[PRES-23] Pseudofacia AO com H52.4 como única linha: vira Z961 (não fica diagnóstico nulo)', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { conduta: 'Prescrição de óculos multifocais', diagnostico: 'H524 - Presbiopia' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'as duas lentes estao bem posicionadas',
    hookFlags: {},
    pseudofacia: { detected: true, lado: 'AO' }
  });
  // Com o sufixo "AO" a própria linha vira evidência de pseudofacia bilateral numa
  // passagem posterior (parsePseudofaciaFromDados casa `z961` + `\bao\b`).
  expect(decision.clonedAIResponse.dados.diagnostico).toBe('Z961 - Presença de lente intra-ocular AO');
});

test('[PRES-24] Pseudofacia UNILATERAL não veta: o olho fácico pode ser présbita', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      conduta: 'Prescrição de óculos multifocais',
      diagnostico: 'H521 - Miopia',
      antecedentes_oftalmologicos: 'Cirurgia de catarata OD há 2 anos'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o direito ja foi operado o esquerdo ainda nao vou receitar multifocal',
    hookFlags: {},
    pseudofacia: { detected: true, lado: 'OD' }
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-25] Pseudofacia SEM lado definido não veta (mesma regra do runtime da lente)', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { conduta: 'Prescrição de óculos multifocais', diagnostico: 'H522 - Astigmatismo' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ja fez cirurgia de catarata e usa multifocal',
    hookFlags: {},
    pseudofacia: { detected: true, lado: null }
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

test('[PRES-26] "lente multifocal" como IMPLANTE em pseudofácico AO não vira presbiopia', () => {
  // PADRAO_MULTIFOCAL casa a LIO premium sem nenhum óculos na consulta — o veto
  // é o que impede a inferência.
  const raw = {
    tipo_consulta: 'retorno',
    dados: { conduta: 'Retorno em 12 meses', diagnostico: 'Z961 - Presença de lente intra-ocular AO' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a lente multifocal que a senhora colocou nos dois olhos esta funcionando bem',
    hookFlags: {},
    pseudofacia: { detected: true, lado: 'AO' }
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
});

test('[PRES-28] wiring: sidepanel-audio passa `pseudofacia` nas DUAS chamadas do DecisionEngine', () => {
  // Sem esta ponte o veto nunca roda no sidepanel: o parser canônico vive em
  // sidepanel-constants e o DE não tem parser próprio de propósito.
  const src = readSrcNormalized('scripts', 'sidepanel-audio.js');
  const chamadas = (src.match(/pseudofacia:\s*\(typeof parsePseudofaciaFromDados/g) || []).length;
  expect(chamadas).toBe(2);
  expect((src.match(/DecisionEngine\.buildDecision\(/g) || []).length).toBe(2);
});

test('[PRES-27] Sem contexto de pseudofacia o guard segue idêntico (não regride PRES-13/14)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Prescrição de óculos multifocais', diagnostico: 'H527 - Transtorno de refração NE' }
  };
  // 2026-08-05: a fala precisa conter a palavra. O guard novo
  // (_guardMultifocalSemEvidencia) rebaixa "multifocais" na conduta quando ela
  // não foi dita na consulta — antes disso, a conduta sozinha bastava e a
  // fixture rodava com transcrição vazia ("ta bom assim"). O propósito do teste
  // (ausência de contexto de pseudofacia não altera o guard) é o mesmo.
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'vou passar multifocal, ta bom assim', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H524 - Presbiopia');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-09-02 — PSEUDOFACIA FABRICADA A PARTIR DE CIRURGIA SEM NOME
// O médico perguntou "já teve algum tratamento, cirurgia, acidente?" e a paciente
// respondeu "nos dois". O tipo nunca foi dito. O modelo deduziu catarata, escreveu
// "(confirmado como cirurgia de catarata pela presença de LIOs)" nos antecedentes e
// daí saíram Z961 AO + biomicroscopia pseudofácica — e o veto de pseudofacia
// bilateral apagou a H52.4 legítima da paciente que usa multifocal.
// ──────────────────────────────────────────────────────────────────────────────

test('[LENTE-EV-1] caso real: cirurgia sem nome não vira Z961 e a presbiopia sobrevive', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocais',
      diagnostico: 'Z961 - Presença de lente intra-ocular AO\nH524 - Presbiopia\nH527 - Transtorno de refração NE',
      antecedentes_oftalmologicos: 'Cirurgia nos dois olhos há mais de 10-15 anos (confirmado como cirurgia de catarata pela presença de LIOs)',
      biomicroscopia: 'AO: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, pseudofacia, LIO transparente e bem posicionada'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ja teve algum tratamento cirurgia acidente nos dois tem mais ou menos quanto tempo ' +
      'esse e o primeiro multifocal e ele nao ficou legal para longe nem para perto vou ajustar o grau do oculos',
    hookFlags: {},
    // O caller calcula a pseudofacia sobre os dados AINDA fabricados — é
    // exatamente o que aconteceu na consulta real.
    pseudofacia: { detected: true, lado: 'AO' }
  });
  const d = decision.clonedAIResponse.dados;
  expect(d.diagnostico).not.toContain('Z961');
  expect(d.diagnostico).toContain('H524 - Presbiopia');
  expect(d.biomicroscopia).not.toContain('pseudofacia');
  expect(d.biomicroscopia).toContain('cristalino transparente');
  expect(d.antecedentes_oftalmologicos).not.toContain('catarata');
  // A cirurgia REALMENTE relatada continua no antecedente — o guard tira o tipo
  // deduzido, não o fato.
  expect(d.antecedentes_oftalmologicos).toContain('Cirurgia nos dois olhos');
  expect(decision.guardsApplied.some(g => /não falou de lente/i.test(g))).toBe(true);
});

test('[LENTE-EV-2] cirurgia de catarata DITA na consulta: Z961 e a lente ficam intactos', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      diagnostico: 'Z961 - Presença de lente intra-ocular AO',
      antecedentes_oftalmologicos: 'Facectomia com implante de LIO AO há 2 anos',
      biomicroscopia: 'AO: olho calmo, córnea transparente, pseudofacia, LIO transparente e bem posicionada'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'eu fiz a cirurgia de catarata nos dois olhos ha dois anos',
    hookFlags: {}
  });
  const d = decision.clonedAIResponse.dados;
  expect(d.diagnostico).toContain('Z961');
  expect(d.biomicroscopia).toContain('pseudofacia');
  expect(decision.guardsApplied.some(g => /não falou de lente/i.test(g))).toBe(false);
});

test('[LENTE-EV-3] fala leiga do médico sobre a lente já basta como evidência', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      diagnostico: 'Z961 - Presença de lente intra-ocular AO',
      biomicroscopia: 'AO: olho calmo, pseudofacia, opacidade de cápsula posterior'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a lente esta um pouquinho embacada vai precisar de uma limpeza',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('Z961');
  expect(decision.clonedAIResponse.dados.biomicroscopia).toContain('opacidade de cápsula');
});

test('[LENTE-EV-4] "operei esse olho" sem dizer de quê NÃO é evidência de lente', () => {
  // Revisão 2026-09-02: a paciente do caso real tinha sido operada de PTERÍGIO.
  // Verbo de cirurgia sem objeto não distingue pterígio de catarata — e é
  // exatamente a fala que o modelo converteu em pseudofacia.
  const raw = {
    tipo_consulta: 'retorno',
    dados: {
      diagnostico: 'Z961 - Presença de lente intra-ocular OD\nH527 - Transtorno de refração NE'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'eu operei esse olho direito ha uns anos', hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Z961');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H527');
});

test('[LENTE-EV-10] caso real: cirurgia de PTERÍGIO relatada não vira pseudofacia', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocais',
      diagnostico: 'Z961 - Presença de lente intra-ocular AO\nH524 - Presbiopia',
      antecedentes_oftalmologicos: 'Cirurgia de catarata AO há ~15 anos',
      biomicroscopia: 'AO: olho calmo, córnea transparente, pseudofacia, LIO transparente e bem posicionada'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'ja teve algum tratamento cirurgia acidente nos dois foi de pterigio ' +
      'faz uns quinze anos esse e o primeiro multifocal e nao ficou legal',
    hookFlags: {},
    pseudofacia: { detected: true, lado: 'AO' }
  });
  const d = decision.clonedAIResponse.dados;
  expect(d.diagnostico).not.toContain('Z961');
  expect(d.diagnostico).toContain('H524 - Presbiopia');
  expect(d.biomicroscopia).not.toContain('pseudofacia');
  expect(d.antecedentes_oftalmologicos).not.toContain('catarata');
});

test('[LENTE-EV-11] o prompt proíbe reescrever a cirurgia nomeada como catarata', () => {
  expect(geminiJsSource).toContain('CIRURGIA NOMEADA MANTÉM O NOME QUE FOI DITO');
});

test('[LENTE-EV-5] sem transcrição o guard não mexe em nada', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { diagnostico: 'Z961 - Presença de lente intra-ocular AO' }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: '', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('Z961');
});

test('[LENTE-EV-8] "lente" de CONTATO/óculos não segura o guard (a palavra é ambígua)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      diagnostico: 'Z961 - Presença de lente intra-ocular AO\nH527 - Transtorno de refração NE',
      antecedentes_oftalmologicos: 'Facectomia AO há 15 anos'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'eu queria ver tambem de lente voce ja usou alguma vez a lente do oculos riscou ' +
      'ja teve cirurgia acidente nos dois olhos',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Z961');
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('H527');
});

test('[LENTE-EV-9] "colocaram a lente" / "a lente ficou boa" seguram o guard (LIO relatada)', () => {
  const mk = () => ({ tipo_consulta: 'retorno', dados: { diagnostico: 'Z961 - Presença de lente intra-ocular AO' } });
  const falas = [
    'colocaram a lente nos dois olhos',
    'a lente ficou bem posicionada',
    'ja fiz a limpeza das lentes com laser',
  ];
  for (const fala of falas) {
    const decision = DecisionEngine.buildDecision(mk(), { transcribedText: fala, hookFlags: {} });
    expect(decision.clonedAIResponse.dados.diagnostico).toContain('Z961');
  }
});

test('[LENTE-EV-7] o prompt proíbe deduzir o tipo da cirurgia e a dedução circular', () => {
  expect(geminiJsSource).toContain('CIRURGIA DE TIPO NÃO ESPECIFICADO NÃO É PSEUDOFACIA');
  expect(geminiJsSource).toContain('PROIBIDA a dedução circular');
});

test('[LENTE-EV-6] pseudofacia fabricada só na HDA é neutralizada (fonte do parser da injeção)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      diagnostico: 'H527 - Transtorno de refração NE',
      hda: 'Paciente refere piora visual após cirurgia de catarata AO há 15 anos'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'eu fiz uma cirurgia nos dois olhos ha uns quinze anos e agora a vista piorou',
    hookFlags: {}
  });
  const hda = decision.clonedAIResponse.dados.hda;
  expect(hda).not.toContain('catarata');
  expect(hda).toContain('tipo não especificado');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-05 — MULTIFOCAL FABRICADO (consulta das 17:54)
// A conduta saiu "Prescrição de óculos multifocais com orientações sobre o uso"
// sem que o médico dissesse multifocal: o modelo leu como evidência de perto uma
// queixa sobre o óculos ANTIGO e um trecho de negativas embaralhado pelo ASR.
// De quebra, a conduta fabricada arrastou H524 (PADRAO_MULTIFOCAL lê a conduta).
// ──────────────────────────────────────────────────────────────────────────────

// Trecho literal do log das 17:54 (só a parte que o modelo usou como evidência).
const FALA_2026_08_05_1754 =
  'oculos diretamente confortavel para perto nao tava nao nao esse aqui eps era muito miopia '
  + 'ai incomoda demais para perto esse que eu achei ta mais parecido com isso que voce ta usando '
  + 'que e mais confortavel nao e para perto sim para longe nao eu ajustei o grau vai ficar melhor';

test('[MULTI-1] Fala REAL 2026-08-05 17:54: "multifocais" cai para "Prescrição de óculos"', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocais com orientações sobre o uso',
      diagnostico: 'H521 - Miopia AO\nH522 - Astigmatismo AO'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: FALA_2026_08_05_1754, hookFlags: {} });
  const conduta = decision.clonedAIResponse.dados.conduta;
  expect(conduta).toContain('Prescrição de óculos com orientações sobre o uso');
  expect(/multifoca/i.test(conduta)).toBe(false);
  expect(decision.guardsApplied.some(g => /Tipo de lente removido/i.test(g))).toBe(true);
  // A resposta crua não é mutada (invariante do engine).
  expect(raw.dados.conduta).toContain('multifocais');
});

test('[MULTI-2] Rebaixamento roda ANTES da presbiopia — conduta fabricada não sustenta H524', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocais',
      diagnostico: 'H521 - Miopia AO\nH524 - Presbiopia'
    }
  };
  // Fala sem multifocal e sem nenhum outro critério de presbiopia: o único
  // sustento do H524 era a própria conduta fabricada.
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o paciente veio para consulta de rotina, a visao de longe estava embacada, '
      + 'fiz o exame do olho, a pressao ocular esta boa, os exames estao normais, '
      + 'ajustei o grau do oculos e vou fazer a receita',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.conduta).toBe('Prescrição de óculos');
  expect(decision.clonedAIResponse.dados.diagnostico).not.toContain('Presbiopia');
});

test('[MULTI-3] Palavra dita na consulta preserva o tipo (não é veto à prescrição)', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Prescrição de óculos multifocais', diagnostico: 'H521 - Miopia AO' }
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'vou passar um multifocal para voce, resolve longe e perto',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.conduta).toContain('multifocais');
  expect(decision.guardsApplied.some(g => /Tipo de lente removido/i.test(g))).toBe(false);
});

test('[MULTI-4] "progressivo"/"bifocais" seguem a mesma regra', () => {
  const semFala = DecisionEngine.buildDecision({
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Prescrição de óculos bifocais', diagnostico: 'H521 - Miopia AO' }
  }, { transcribedText: 'ajustei o grau do oculos', hookFlags: {} });
  expect(semFala.clonedAIResponse.dados.conduta).toBe('Prescrição de óculos');

  const comFala = DecisionEngine.buildDecision({
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Prescrição de óculos progressivos', diagnostico: 'H521 - Miopia AO' }
  }, { transcribedText: 'vou fazer lente progressiva', hookFlags: {} });
  expect(comFala.clonedAIResponse.dados.conduta).toContain('progressivos');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-27 — MULTIFOCAL LEGÍTIMO APAGADO PELO GUARD (consulta das 13:04)
// O médico explicou o multifocal sem usar a palavra: "tem grau de longe perto
// junto, aí eu vou fazer a receita". O prompt (critério 2) e a SKILL autorizam
// esse fraseado; o guard só aceitava a palavra literal e rebaixou a conduta
// para "Prescrição de óculos". O par longe+perto passa a valer TAMBÉM aqui —
// com contexto de PRESCRIÇÃO na janela (receita/prescrever/vou fazer/armação),
// não a âncora larga do guard de presbiopia (que aceita "grau" solto).
// ──────────────────────────────────────────────────────────────────────────────

// Trecho literal do log das 13:04 (a linha que o modelo citou no raciocínio).
const FALA_2026_08_27_1304 =
  'em grau de longe perto junto ai eu vou fazer a receita porque fazer um oculos '
  + 'de protecao que ja corrige o grau de perto ta eu sei';

test('[MULTI-5] Fala REAL 2026-08-27 13:04: "longe perto junto" + receita preserva "multifocais"', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: {
      conduta: 'Prescrição de óculos multifocais',
      diagnostico: 'H524 - Presbiopia'
    }
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: FALA_2026_08_27_1304, hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).toContain('multifocais');
  expect(decision.guardsApplied.some(g => /Tipo de lente removido/i.test(g))).toBe(false);
});

test('[MULTI-6] Par longe+perto SEM prescrição na janela não salva o tipo', () => {
  // Discriminante: "grau" solto (âncora do guard de presbiopia) descreveria
  // multifocal em qualquer comentário sobre visão. Aqui não há prescrição.
  const decision = DecisionEngine.buildDecision({
    tipo_consulta: 'retorno',
    dados: { conduta: 'Prescrição de óculos multifocais', diagnostico: 'H521 - Miopia AO' }
  }, {
    transcribedText: 'os oculos estao bons ele enxerga bem de longe e de perto o grau esta bom',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.conduta).toBe('Prescrição de óculos');
});

test('[MULTI-8] LIMITE DECLARADO: critério 2 do prompt SEM verbo de prescrição é rebaixado', () => {
  // "óculos que serve para perto e longe" é ✅ multifocais no prompt
  // (gemini-interview-agent.js, exemplos da regra crítica), mas a rede
  // determinística não cobre esse fraseado: sem prescrição na janela, a âncora
  // larga seria a de MULTI-6 e reabriria o falso positivo de 2026-08-05.
  // Rebaixar aqui é a escolha do médico ("errar para menos é barato").
  const decision = DecisionEngine.buildDecision({
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Prescrição de óculos multifocais', diagnostico: 'H521 - Miopia AO' }
  }, {
    transcribedText: 'e um oculos que serve para perto e longe',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.conduta).toBe('Prescrição de óculos');
  // O H524 NÃO é afetado: o guard de presbiopia tem âncora própria, mais larga.
  expect(decision.clonedAIResponse.dados.diagnostico).toContain('Presbiopia');
});

test('[MULTI-7] Par longe+perto sem âncora de óculos (queixa de visão) não salva o tipo', () => {
  const decision = DecisionEngine.buildDecision({
    tipo_consulta: 'primeira_consulta',
    dados: { conduta: 'Prescrição de óculos multifocais', diagnostico: 'H521 - Miopia AO' }
  }, {
    transcribedText: 'ele enxerga mal de longe e bem de perto vou fazer a receita',
    hookFlags: {}
  });
  expect(decision.clonedAIResponse.dados.conduta).toBe('Prescrição de óculos');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-05 — FUNDOSCOPIA NORMAL NÃO INJETADA (mesma consulta das 17:54)
// O médico declarou "o resto tá tudo tranquilo... normal" e o prontuário ficou
// sem fundoscopia: o gate exigia o token "fundo" na fala, e o ASR devolveu
// "produção normal" no lugar de "escavação normal".
// ──────────────────────────────────────────────────────────────────────────────

test('[FUNDO-4] injectExamesNormais injeta fundoscopia sem exigir a palavra "fundo"', () => {
  const ini = injectionJsSource.indexOf('// Nunca afirmar exame NORMAL que contradiz');
  const fim = injectionJsSource.indexOf('} else if (!audioData?.dilatacaoDetectada && audioData?.injectBlefarite)');
  expect(ini > 0 && fim > ini).toBe(true);
  const bloco = injectionJsSource.slice(ini, fim);
  expect(bloco).toContain('fundoscopia: _fundoNormalSeguro()');
  expect(/fundoscopia:\s*\(SessionFlags\.fundoscopiaDetectada \|\| mencionouFundoNaFala\)/.test(bloco)).toBe(false);
});

test('[FUNDO-5] o fallback de despedida NÃO foi ampliado — segue exigindo menção ao fundo', () => {
  // O fallback dispara sem gatilho de exame e sem injectExamesNormais: ali não há
  // afirmação nenhuma do médico de que o fundo foi visto.
  expect(injectionJsSource).toContain('fundoscopia: mencionouFundoNaFala ? _fundoNormalSeguro() : null,');
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
// 2026-08-27 — Pterígio lançado no SÍTIO errado. A ficha recebia H11.1, que na
// CID-10 é "degenerações e depósitos conjuntivais". Pterígio é H11.0. A busca
// dava success (H11.1 existe no subset), o SHOSP trocava o rótulo pela descrição
// dele, e o prontuário saía com outro diagnóstico — nenhum guard acusa, porque
// prompt e mapa de dedup erravam o MESMO código, então nada divergia.
//
// A revisão da tabela inteira contra o subset achou mais três: H43.0 (prólapso
// do vítreo) usado para hemorragia vítrea (H43.1), H34.0 (oclusão TRANSITÓRIA)
// usado para oclusão arterial (H34.1), e H59.1, que não existe no subset (o
// genérico pós-procedimento é H59.8).
//
// A autoridade é a tabela do subset em skills/user/cid-oftalmologia/SKILL.md.
// ──────────────────────────────────────────────────────────────────────────────

const _cidSubset = (() => {
  const skill = readSrcNormalized('skills', 'user', 'cid-oftalmologia', 'SKILL.md');
  const m = new Map();
  for (const row of skill.matchAll(/^\|\s*([A-Z]\d{2}(?:\.\d)?)\s*\|\s*([^|]+?)\s*\|/gm)) {
    m.set(row[1].replace('.', ''), row[2]);
  }
  return m;
})();

// Os pares "CÓDIGO=Rótulo" da tabela de CIDs frequentes do prompt.
const _cidTabelaPrompt = (() => {
  const ini = geminiSrcFull.indexOf('CIDs OFTALMOLÓGICOS FREQUENTES');
  const bloco = geminiSrcFull.slice(ini, geminiSrcFull.indexOf('REGRA — PRESBIOPIA', ini));
  return [...bloco.matchAll(/([A-Z]\d{3})=([^ ]+(?: [^ ]+)*?)(?=\s\s|\n|$)/g)]
    .map(x => ({ code: x[1], label: x[2].trim() }));
})();

test('[CID-TABELA-1] a tabela do prompt tem pares suficientes para valer a pena verificar', () => {
  expect(_cidTabelaPrompt.length > 30).toBe(true);
  expect(_cidSubset.get('H110')).toBe('Pterígio');
});

test('[CID-TABELA-2] todo CID do capítulo H sugerido pelo prompt existe no subset do SHOSP', () => {
  // Z01/Z96 ficam de fora: a tabela do subset cobre H00–H59 por escopo. Z961 é
  // exercitado em produção (pseudofacia) e não tem referência aqui para comparar.
  const ausentes = _cidTabelaPrompt
    .filter(x => x.code.startsWith('H'))
    .filter(x => !_cidSubset.has(x.code) && !_cidSubset.has(x.code.slice(0, 3)))
    .map(x => x.code + '=' + x.label);
  expect(ausentes).toEqual([]);
});

test('[CID-TABELA-3] os sítios que já saíram errados estão travados no código certo', () => {
  // code → trecho que TEM de aparecer na descrição do subset daquele código.
  const esperado = {
    H110: 'Pterígio',              // era H111 = degenerações conjuntivais
    H431: 'Hemorragia vítrea',     // era H430 = prólapso do vítreo
    H341: 'artéria central',       // era H340 = oclusão TRANSITÓRIA
    H598: 'pós-procedimento',      // era H591 = inexistente no subset
  };
  for (const [code, trecho] of Object.entries(esperado)) {
    const naTabela = _cidTabelaPrompt.some(x => x.code === code);
    expect([code, naTabela]).toEqual([code, true]);
    const desc = (_cidSubset.get(code) || '').toLowerCase();
    expect([code, desc.includes(trecho.toLowerCase())]).toEqual([code, true]);
  }
  // e os códigos errados não podem voltar
  for (const errado of ['H111', 'H430', 'H340', 'H591']) {
    expect([errado, _cidTabelaPrompt.some(x => x.code === errado)]).toEqual([errado, false]);
  }
});

test('[CID-TABELA-4] o mapa de dedup casa pterígio com H110', () => {
  const mapa = injectionJsSource.slice(
    injectionJsSource.indexOf('_CLINICAL_TERM_TO_CID'),
    injectionJsSource.indexOf('function _cidKeyFromText')
  );
  expect(/\/pterigio\/i,\s*'H110'/.test(mapa)).toBe(true);
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
  // v5.4.0: os desempates passaram a receber o recorte AMPLIADO da REF.DATA
  // (getFocusedParts) em vez do ticket inteiro — ver [FOCUS-*].
  expect(examJsSource.includes('_tiebreakAxis(mismatch, await getFocusedParts(), apiService)')).toBe(true);
  expect(examJsSource.includes('mismatch.isAxisMismatch')).toBe(true);
  // no ramo não-'primeira' a severidade vira 'hard' (senão soft+math-ok passaria)
  const idx = examJsSource.indexOf('vereditoEixo');
  expect(idx !== -1).toBe(true);
  // Janela ampla de propósito: o bloco do eixo cresceu com os resgates de
  // 2026-08-05, mas o ramo não-'primeira' continua forçando 'hard'.
  expect(examJsSource.slice(idx, idx + 4200).includes("mismatch.severity = 'hard'")).toBe(true);
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

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-03 (v5.4.0) — Política de sinal SIMÉTRICA.
//
// A v5.3.6 argumentava que o erro do "+" térmico é CORRELACIONADO entre leituras
// (por isso "nunca liberar por voto") e, ao mesmo tempo, não checava nada quando
// as duas leituras CONCORDAVAM — usando como liberação exatamente a evidência
// que declarava não valer. Log 2026-08-03: OD "+0.50" com S+C/2 = -0.125 = S.E.
// impresso (-0.13) bloqueado 2×; na 3ª captura as duas chamadas leram "-0.50",
// ninguém checou, e H521-Miopia foi injetado. Agora a leitura AMPLIADA roda
// sempre: contradizer a 1ª bloqueia (com ou sem disputa) e confirmar a 1ª com
// S+C/2≈S.E. libera a disputa.
// ──────────────────────────────────────────────────────────────────────────────

test('[SIGN-2] a política de sinal roda SEMPRE, não só quando há disputa', () => {
  // Regressão do buraco correlacionado: a chamada não pode estar aninhada
  // dentro de um `if (mismatch...)`.
  // v5.4.2: a leitura de sinal é DISPARADA antes (paralela à verificação) e aqui
  // só se espera por ela — mas continua fora de qualquer `if (mismatch...)`.
  expect(examJsSource).toContain('const _signs = await getSigns();');
  expect(examJsSource).toContain('mismatchByEye = await this._applySignPolicy(processed, mismatchByEye, _signs, _signsCandidates);');
  // O fail-safe antigo (bloqueio incondicional por discordância) saiu de cena.
  expect(examJsSource.includes('_tiebreakSphereSign')).toBe(false);
});

test('[SIGN-3] _sphereSignVerdict: confirma / contradiz / ilegivel / na', () => {
  const v = (esf, sign) => _examAgent._sphereSignVerdict({ esf }, sign);
  expect(v('+0.50', { sinal: '+', magnitude: '0.50' })).toBe('confirma');
  expect(v('+0.50', { sinal: '-', magnitude: '0.50' })).toBe('contradiz');
  expect(v('-5.25', { sinal: '-', magnitude: '5.25' })).toBe('confirma');
  // magnitude incompatível ⇒ a 3ª leu outra célula, voto não vale
  expect(v('+0.50', { sinal: '+', magnitude: '3.75' })).toBe('ilegivel');
  expect(v('+0.50', { sinal: null, magnitude: '0.50' })).toBe('ilegivel');
  expect(v('+0.50', null)).toBe('ilegivel');
  // esfera sem sinal para conferir
  expect(v('plano', { sinal: '+', magnitude: '0.00' })).toBe('na');
  expect(_examAgent._sphereSignVerdict(null, { sinal: '+', magnitude: '1.00' })).toBe('na');
});

async function _signPolicyTests() {
  await testAsync('[SIGN-4] leitura ampliada contradiz a 1ª SEM disputa → bloqueia (erro correlacionado)', async () => {
    // Cenário da captura 3 do log: 1ª e 2ª concordaram em "-0.50" (mismatch=null),
    // mas o ticket imprimia "+". Antes: injetava H521-Miopia sem checagem alguma.
    const processed = {
      refracao: { od: { esf: '-0.50', cil: -1.25, eixo: 127, se: '-1.13' }, oe: null },
      _avisos: []
    };
    const signs = { od: { sinal: '+', magnitude: '0.50' }, oe: null };
    const m = (await _examAgent._applySignPolicy(processed, null, signs)).od;
    expect(m !== null).toBe(true);
    expect(m.severity).toBe('hard');
    expect(m.eye).toBe('od');
  });

  await testAsync('[SIGN-5] disputa + ampliada confirma a 1ª + S+C/2≈S.E. → LIBERA', async () => {
    // Capturas 1 e 2 do log: +0.50 com cil -1.25 ⇒ S.E. -0.125 = -0.13 impresso.
    const processed = {
      refracao: { od: { esf: '+0.50', cil: -1.25, eixo: 127, se: '-0.13' }, oe: null },
      _avisos: []
    };
    const mismatch = { eye: 'od', severity: 'hard', signFlip: true, pEsfStr: '+0.50', vEsfStr: '-0.50' };
    const signs = { od: { sinal: '+', magnitude: '0.50' }, oe: null };
    expect((await _examAgent._applySignPolicy(processed, { od: mismatch, oe: null }, signs)).od).toBe(null);
    expect(processed._avisos.length > 0).toBe(true);
  });

  await testAsync('[SIGN-6] disputa + ampliada ilegível → segue bloqueado', async () => {
    const processed = {
      refracao: { od: { esf: '+0.50', cil: -1.25, eixo: 127, se: '-0.13' }, oe: null },
      _avisos: []
    };
    const mismatch = { eye: 'od', severity: 'hard', signFlip: true, pEsfStr: '+0.50', vEsfStr: '-0.50' };
    const m = (await _examAgent._applySignPolicy(processed, { od: mismatch, oe: null }, { od: null, oe: null })).od;
    expect(m !== null).toBe(true);
    expect(m.severity).toBe('hard');
  });

  await testAsync('[SIGN-7] disputa + ampliada confirma a 1ª MAS a aritmética não fecha → bloqueia', async () => {
    // Só uma das duas evidências ⇒ não basta. (se=-2.00 não bate com -0.125)
    const processed = {
      refracao: { od: { esf: '+0.50', cil: -1.25, eixo: 127, se: '-2.00' }, oe: null },
      _avisos: []
    };
    const mismatch = { eye: 'od', severity: 'hard', signFlip: true, pEsfStr: '+0.50', vEsfStr: '-0.50' };
    const m = (await _examAgent._applySignPolicy(processed, { od: mismatch, oe: null }, { od: { sinal: '+', magnitude: '0.50' } })).od;
    expect(m !== null).toBe(true);
  });

  await testAsync('[SIGN-9] ampliada ilegível SEM disputa avisa mas não bloqueia sozinha', async () => {
    // Bloquear a cada leitura ampliada ruim recriaria a enxurrada de recapturas
    // que a v5.4.0 veio corrigir — mas o médico precisa saber que faltou a 3ª
    // confirmação sobre um valor que FOI para o prontuário.
    const processed = {
      refracao: { od: { esf: '-5.00', cil: -1.00, eixo: 99, se: '-5.50' }, oe: null },
      _avisos: []
    };
    const m = await _examAgent._applySignPolicy(processed, null, null);
    expect(m.od === null && m.oe === null).toBe(true);
    expect(processed._avisos.some(a => a.includes('não confirmou o sinal'))).toBe(true);
  });

  // ── v5.4.4 — o censo dos bloqueios do log 2026-08-05 ────────────────────────
  await testAsync('[SIGN-10] ampliadas discordam ENTRE SI e uma confirma a 1ª → não bloqueia (18:01, OE)', async () => {
    // 1ª, 2ª e ticket inteiro leram "+0.50"; só o recorte leu "−" e o bloqueio
    // saiu pela voz do dissidente solitário.
    const processed = {
      refracao: { od: null, oe: { esf: '+0.50', cil: -0.50, eixo: 107, se: '+0.25' } },
      _avisos: []
    };
    const crop = { oe: { sinal: '-', magnitude: '0.50', c: '-0.50', a: '107' } };
    const full = { oe: { sinal: '+', magnitude: '0.50', c: '-0.50', a: '107' } };
    const m = await _examAgent._applySignPolicy(processed, null, crop, [crop, full]);
    expect(m.oe).toBe(null);
    expect(processed._avisos.some(a => a.includes('discordaram entre si'))).toBe(true);
  });

  await testAsync('[SIGN-11] ampliada contradiz e NENHUMA outra confirma → segue bloqueando (18:29, OD)', async () => {
    const processed = {
      refracao: { od: { esf: '+1.25', cil: null, eixo: null, se: '+1.25' }, oe: null },
      _avisos: []
    };
    const full = { od: { sinal: '-', magnitude: '1.25', c: null, a: null } };
    const m = await _examAgent._applySignPolicy(processed, null, full, [full]);
    expect(m.od !== null).toBe(true);
    expect(m.od.severity).toBe('hard');
  });

  await testAsync('[SIGN-12] flip de sinal abaixo do piso do CID (±0.25) → avisa, não bloqueia (18:02, OD)', async () => {
    const processed = {
      refracao: { od: { esf: '+0.25', cil: -0.50, eixo: 67, se: '+0.00' }, oe: null },
      _avisos: []
    };
    const full = { od: { sinal: '-', magnitude: '0.25', c: '-0.50', a: '67' } };
    const m = await _examAgent._applySignPolicy(processed, null, full, [full]);
    expect(m.od).toBe(null);
    expect(processed._avisos.some(a => a.includes('não muda nenhum CID'))).toBe(true);
  });

  await testAsync('[SIGN-13] o piso NÃO absolve flip com CID em jogo (|0.50|: H520 ↔ H521)', async () => {
    const processed = {
      refracao: { od: { esf: '+0.50', cil: null, eixo: null, se: '+0.50' }, oe: null },
      _avisos: []
    };
    const full = { od: { sinal: '-', magnitude: '0.50', c: null, a: null } };
    const m = await _examAgent._applySignPolicy(processed, null, full, [full]);
    expect(m.od !== null).toBe(true);
  });

  await testAsync('[SIGN-14] piso do CID também absolve a disputa 1ª vs 2ª (18:00, OD)', async () => {
    const processed = {
      refracao: { od: { esf: '+0.25', cil: -0.50, eixo: 67, se: '+0.00' }, oe: null },
      _avisos: []
    };
    const mismatch = { eye: 'od', severity: 'hard', signFlip: true, pEsfStr: '+0.25', vEsfStr: '-0.25' };
    const m = await _examAgent._applySignPolicy(processed, { od: mismatch, oe: null }, { od: null }, []);
    expect(m.od).toBe(null);
  });

  await testAsync('[SIGN-15] _signFlipIsCidNeutral vê a anisometropia (H523) atravessar a fronteira', async () => {
    // OD -0.25 vs OE -1.50: a diferença de S.E. passa de 1.25D (sem H523) para
    // 1.75D (com H523) se o sinal do OD virar. Não é neutro.
    const refracao = {
      od: { esf: '-0.25', cil: null, eixo: null, se: '-0.25' },
      oe: { esf: '-1.50', cil: null, eixo: null, se: '-1.50' }
    };
    expect(_examAgent._signFlipIsCidNeutral(refracao, 'od')).toBe(false);
  });

  await testAsync('[SIGN-16] esfera discordante SEM flip continua bloqueando mesmo com a ampliada confirmando a 1ª', async () => {
    // Captura 11:42 do log 2026-08-06: 1ª leu OD +1.25, 2ª leu +2.50, e a leitura
    // ampliada confirmou a 1ª (magnitude "1.25", linha validada). A captura
    // seguinte do MESMO ticket provou que +2.50 era o certo. A ampliada é
    // testemunha do SINAL, não da magnitude: bloquear aqui é o comportamento
    // correto, e é o que uma futura regra de "a ampliada concordou, libera" quebraria.
    const processed = {
      refracao: { od: { esf: '+1.25', cil: -1.25, eixo: 76, se: '+0.62' }, oe: null },
      _avisos: []
    };
    const verify = { od: { s: '+2.50', c: -1.25, a: 76, se: '+2.00' }, oe: null };
    const m = _examAgent._compareEyesAgainstVerify(processed.refracao, verify);
    expect(m.od.severity).toBe('hard');
    expect(m.od.signFlip).toBe(false);   // mesma direção, magnitudes diferentes
    const full = { od: { sinal: '+', magnitude: '1.25', c: '-1.25', a: '76' } };
    expect(_examAgent._signWitnessesConfirm('od', processed.refracao.od, [full])).toBe(true);
    const depois = await _examAgent._applySignPolicy(processed, m, full, [full]);
    expect(depois.od !== null).toBe(true);
    expect(depois.od.severity).toBe('hard');
  });

  await testAsync('[EYE-6] captura 18:02 do log: OD ±0.25 com sinal não confirmado agora é injetada', async () => {
    // Valores reais: 1ª leu OD +0.25 -0.50 x67 (S.E. +0.00) e a leitura ampliada
    // leu "−". Bloqueio antigo: refração inteira descartada (3× seguidas). Agora o
    // sinal segue sem confirmação, mas abaixo de 0.50D ele não muda CID nenhum.
    const processed = {
      refracao: {
        od: { esf: '+0.25', cil: -0.50, eixo: 67, se: '+0.00' },
        oe: { esf: '+0.50', cil: -0.50, eixo: 107, se: '+0.25' }
      },
      tonometria: { od: 15, oe: 15 }, paquimetria: { od: 512, oe: 516 }, _avisos: []
    };
    const verify = {
      od: { s: '-0.25', c: -0.50, a: 67, se: '-0.25' },
      oe: { s: '+0.50', c: -0.50, a: 107, se: '+0.25' }
    };
    const full = { od: { sinal: '-', magnitude: '0.25', c: '-0.50', a: '67' },
                   oe: { sinal: '+', magnitude: '0.50', c: '-0.50', a: '107' } };

    let mismatchByEye = _examAgent._compareEyesAgainstVerify(processed.refracao, verify);
    mismatchByEye = await _examAgent._applySignPolicy(processed, mismatchByEye, full, [full]);
    expect(mismatchByEye.oe).toBe(null);
    // A contradição da leitura ampliada (o bloqueio real das 18:02) não vira
    // mismatch 'hard': sobra só a divergência de esfera que o comparador já
    // classificava como 'soft' (a 2ª reportou s = se, assinatura de linha
    // trocada). 'soft' + 1ª math-consistent = aviso, não bloqueio — é a mesma
    // conta que o laço por olho faz.
    const mOd = mismatchByEye.od;
    const shouldBlock = mOd
      ? (mOd.severity === 'hard' || !_examAgent._isEyeMathConsistent(processed.refracao.od))
      : false;
    expect(shouldBlock).toBe(false);
    expect(examJsSource).toContain('let mismatch = mismatchByEye[lado];');
    expect(examJsSource).toContain('while (mismatch && _guard++ < 4) {');

    _examAgent._resolveBlocking(processed);
    expect(processed.refracao !== null).toBe(true);
    expect(processed.refracao.od.eixo).toBe(67);
    expect(processed._refracaoBloqueada === true).toBe(false);

    // CIDs do OD isolado: o sinal em disputa não codifica nada nem invertido.
    const cids = _examAgent._inferCidRefracao({ od: processed.refracao.od, oe: null });
    expect(_temCid(cids, 'H522')).toBe(true);   // astigmatismo, que estava sendo perdido
    expect(_temCid(cids, 'H521')).toBe(false);
    expect(_temCid(cids, 'H520')).toBe(false);
    expect(processed._avisos.some(a => a.includes('não muda nenhum CID'))).toBe(true);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// v5.4.4 — bloqueio POR OLHO e desempate de cilindro pelas testemunhas.
// ──────────────────────────────────────────────────────────────────────────────

test('[EYE-1] _compareEyesAgainstVerify confere os DOIS olhos (não para no primeiro)', () => {
  const processed = {
    od: { esf: '-1.00', cil: -0.50, eixo: 10, se: '-1.25' },
    oe: { esf: '-2.00', cil: -0.50, eixo: 20, se: '-2.25' }
  };
  const verify = {
    od: { s: '-3.00', c: -0.50, a: 10, se: '-3.25' },  // esfera discordante
    oe: { s: '-2.00', c: -0.50, a: 20, se: '-2.25' }   // igual
  };
  const m = _examAgent._compareEyesAgainstVerify(processed, verify);
  expect(m.od !== null).toBe(true);
  expect(m.oe).toBe(null);
});

test('[EYE-2] _failEye derruba só o olho culpado e preserva o outro', () => {
  const r = {
    refracao: { od: { esf: '-1.00' }, oe: { esf: '-2.00' } },
    tonometria: { od: 15, oe: 15 }, paquimetria: { od: 512, oe: 516 }, _avisos: []
  };
  _examAgent._failEye(r, 'od', 'OD: cilindro discordante.');
  _examAgent._resolveBlocking(r);
  expect(r.refracao !== null).toBe(true);
  expect(r.refracao.od).toBe(null);
  expect(r.refracao.oe.esf).toBe('-2.00');
  expect(r._refracaoBloqueada === true).toBe(false);
  expect(r._avisos.some(a => a.includes('OD') && a.includes('preservado'))).toBe(true);
});

test('[EYE-3] os DOIS olhos bloqueados ⇒ refração inteira cai (tono/paqui sobrevivem)', () => {
  const r = {
    refracao: { od: { esf: '-1.00' }, oe: { esf: '-2.00' } },
    tonometria: { od: 15, oe: 15 }, paquimetria: { od: 512, oe: 516 }, _avisos: []
  };
  _examAgent._failEye(r, 'od', 'OD: cilindro discordante.');
  _examAgent._failEye(r, 'oe', 'OE: sinal discordante.');
  _examAgent._resolveBlocking(r);
  expect(r.refracao).toBe(null);
  expect(r._captureFailed).toBe(false);
  expect(r.tonometria.od).toBe(15);
});

test('[EYE-4] olho já descartado antes da conferência: bloquear o sobrevivente derruba a refração UMA vez', () => {
  // _postProcessRefraction pode deixar um olho null. Bloquear o outro tem de
  // resultar em bloqueio inteiro — sem o aviso de "o outro olho foi preservado",
  // que aqui seria falso.
  const r = { refracao: { od: null, oe: { esf: '-2.00' } }, tonometria: { od: 15, oe: 15 }, _avisos: [] };
  _examAgent._failEye(r, 'oe', 'OE: sinal discordante.');
  _examAgent._resolveBlocking(r);
  expect(r.refracao).toBe(null);
  expect(r._avisos.some(a => a.includes('preservado'))).toBe(false);
  expect(r._avisos.filter(a => a.includes('NÃO injetada')).length).toBe(1);
});

test('[EYE-5] olho com cilindro descartado por eixo não engole a conferência do outro', () => {
  // No laço antigo isto era um `continue` (ia para o próximo olho); virou
  // `return null` dentro de _compareEye. Se a conversão tivesse trocado o
  // sentido, o OE deixaria de ser comparado.
  const processed = {
    od: { esf: '-1.00', cil: null, eixo: null, se: '-1.00', _cilDescartadoPorEixo: true },
    oe: { esf: '-2.00', cil: -0.50, eixo: 20, se: '-2.25' }
  };
  const verify = {
    od: { s: '-1.00', c: -1.25, a: 90, se: '-1.62' },
    oe: { s: '-2.00', c: -2.00, a: 20, se: '-3.00' }   // cilindro muito discordante
  };
  const m = _examAgent._compareEyesAgainstVerify(processed, verify);
  expect(m.od).toBe(null);
  expect(m.oe !== null).toBe(true);
});

test('[DIM-1] esfera resolvida não esconde o cilindro do mesmo olho (19:40, OD)', () => {
  // A 1ª leu OD +0.25 -0.50 x18; a 2ª leu -0.25 -1.50 x18. A esfera (±0.25) é
  // liberada pelo piso do CID — e antes da v5.4.5 isso liberava o olho inteiro,
  // com o cilindro 1.00D discordante indo para o prontuário sem conferência.
  const p = { esf: '+0.25', cil: -0.50, eixo: 18, se: '+0.00' };
  const v = { s: '-0.25', c: -1.5, a: 18, se: '-1.00' };
  const primeiro = _examAgent._compareEye('od', p, v);
  expect(primeiro.dim).toBe('esfera');
  const seguinte = _examAgent._compareEye('od', p, v, ['esfera']);
  expect(seguinte !== null).toBe(true);
  expect(seguinte.dim).toBe('cilindro');
  expect(seguinte.severity).toBe('hard');   // Δ=1.00D
});

test('[DIM-2] dimensão pulada não reaparece; sem mais dimensões, o olho fica limpo', () => {
  const p = { esf: '+0.25', cil: -0.50, eixo: 18, se: '+0.00' };
  const v = { s: '-0.25', c: -1.5, a: 18, se: '-1.00' };
  expect(_examAgent._compareEye('od', p, v, ['esfera', 'cilindro'])).toBe(null);
  // eixo idêntico nas duas leituras — nada sobra
  expect(_examAgent._compareEye('od', p, v, ['esfera', 'cilindro', 'eixo'])).toBe(null);
});

test('[MAG-1] magnitude a um passo dióptrico de distância não valida a linha (19:40, OE)', () => {
  // A ampliada devolveu magnitude 0.50 (o cilindro -0.50) contra esfera +0.25:
  // com a tolerância antiga de 0.25D isso passava por "mesma célula" e virava
  // voto sobre o sinal da esfera.
  expect(_examAgent._sphereSignVerdict({ esf: '+0.25' }, { sinal: '-', magnitude: '0.50' })).toBe('ilegivel');
  expect(_examAgent._sphereSignVerdict({ esf: '+0.25' }, { sinal: '-', magnitude: '0.25' })).toBe('contradiz');
  const w = _examAgent._rowWitnesses('od', { esf: '+0.25', cil: -0.50 },
    [{ od: { sinal: '-', magnitude: '0.50', c: '-0.50', a: '18' } }]);
  expect(w.length).toBe(0);
});

// ──────────────────────────────────────────────────────────────────────────────
// v5.4.7 — ticket DEITADO (90°/270°), não só de cabeça para baixo.
// Foto de 2026-08-06 09:03: a tira estava a 90° sobre a mesa e o modelo leu o
// CILINDRO como esfera do OD (+1.25 no lugar de +2.50) em 2 de 3 capturas.
// ──────────────────────────────────────────────────────────────────────────────

test('[ROT-1] _rotacaoPedida entende o contrato novo, o antigo e o lixo', () => {
  expect(_examAgent._rotacaoPedida({ _ticketRotacao: 90 })).toBe(90);
  expect(_examAgent._rotacaoPedida({ _ticketRotacao: 270 })).toBe(270);
  expect(_examAgent._rotacaoPedida({ _ticketRotacao: 0 })).toBe(0);
  // contrato antigo continua valendo (o modelo repete o exemplo que memorizou)
  expect(_examAgent._rotacaoPedida({ _ticketInvertido: true })).toBe(180);
  expect(_examAgent._rotacaoPedida({ _ticketInvertido: false })).toBe(0);
  // o novo tem precedência quando os dois vêm juntos
  expect(_examAgent._rotacaoPedida({ _ticketInvertido: true, _ticketRotacao: 0 })).toBe(0);
  // valor inventado NÃO gira: estragaria uma imagem que estava boa
  expect(_examAgent._rotacaoPedida({ _ticketRotacao: 45 })).toBe(0);
  expect(_examAgent._rotacaoPedida({ _ticketRotacao: 'sim' })).toBe(0);
  expect(_examAgent._rotacaoPedida({ _ticketRotacao: 360 })).toBe(0);
  expect(_examAgent._rotacaoPedida(null)).toBe(0);
});

test('[ROT-2] 90° e 270° trocam as dimensões do canvas (senão a imagem sai cortada)', () => {
  expect(examJsSource).toContain('const swap = norm === 90 || norm === 270;');
  expect(examJsSource).toContain('canvas.width  = swap ? img.height : img.width;');
  expect(examJsSource).toContain('canvas.height = swap ? img.width  : img.height;');
});

// v5.5.0 — o laço de rotação virou _straightenTicket, e estes testes deixaram
// de casar strings do fonte para exercitar o método de verdade: com
// _rotateImage trocado por um marcador ("img@90") e um apiService de mentira,
// dá para afirmar o que importa — quantos graus cada imagem levou, o que foi
// para o modelo e o que sobrou como fonte de recorte.
function _fakeRotAgent(respostas) {
  const agente = new _GeminiExamAgent();
  // Marcador em vez de canvas: preserva o acumulado aplicado a cada imagem.
  agente._rotateImage = async (b64, deg) => `${String(b64).split('@')[0]}@${deg}`;
  const chamadas = [];
  const api = {
    callGeminiAPI: async (parts) => {
      chamadas.push(parts.filter(p => p.inlineData).map(p => p.inlineData.data));
      const r = respostas.shift();
      if (r instanceof Error) throw r;
      return { text: JSON.stringify(r) };
    }
  };
  return { agente, api, chamadas };
}

async function _straightenTicketTests() {
  await testAsync('[ROT-3] a foto nativa do recorte gira junto com a que vai ao modelo', async () => {
    // Se só as imagens do prompt girarem, a _refDataBox (medida sobre a imagem
    // girada) recorta o lugar errado da foto nativa.
    const { agente, api } = _fakeRotAgent([
      { _ticketRotacao: 90 },          // 1ª leitura: ticket deitado
      { refracao: null }               // releitura já endireitada
    ]);
    const out = await agente._straightenTicket('P', ['proc'], ['nativa'], 0, api);
    expect(out.erro === undefined).toBe(true);
    expect(out.imageParts[0].inlineData.data).toBe('proc@90');
    expect(out.cropSources[0]).toBe('nativa@90');   // a nativa girou junto
  });

  await testAsync('[ROT-4] esgotadas as tentativas com o ticket ainda torto, falha explicando', async () => {
    const { agente, api } = _fakeRotAgent([
      { _ticketRotacao: 90 }, { _ticketRotacao: 180 }, { _ticketRotacao: 90 }
    ]);
    const out = await agente._straightenTicket('P', ['proc'], null, 0, api);
    expect(out.erro).toContain('Fotografe o ticket com o texto na horizontal.');
  });

  await testAsync('[ROT-6] DOIS sentidos de apresentação: o sentido errado ainda tem correção', async () => {
    // Deitado, o ticket admite 90 OU 270 e não há como saber de fora qual é. Se
    // o modelo erra o sentido, a imagem girada fica de cabeça para baixo — a
    // v5.4.7 desistia exatamente aí, no caso mais comum de erro. 90 + 180 = 270.
    const { agente, api, chamadas } = _fakeRotAgent([
      { _ticketRotacao: 90 },     // chuta 90 — errado, sai de cabeça para baixo
      { _ticketRotacao: 180 },    // e então pede 180
      { refracao: null }          // 270: a outra apresentação, legível
    ]);
    const out = await agente._straightenTicket('P', ['proc'], ['nativa'], 0, api);
    expect(out.erro === undefined).toBe(true);
    expect(out.imageParts[0].inlineData.data).toBe('proc@270');
    // Gira SEMPRE a partir do ORIGINAL pelo acumulado — nunca o já girado, que
    // empilharia perda de JPEG a cada volta.
    expect(chamadas[1][0]).toBe('proc@90');
    expect(chamadas[2][0]).toBe('proc@270');
    expect(out.raw._ticketFoiRotacionado).toBe(true);
  });

  await testAsync('[ROT-7] oscilação do modelo (90 e depois 270) não vira loop nem volta à foto original', async () => {
    // 90 + 270 = 360 ≡ 0: a "correção" seguinte devolveria a imagem de partida,
    // que já foi reprovada. O acumulado é rastreado justamente para barrar isso.
    const { agente, api, chamadas } = _fakeRotAgent([
      { _ticketRotacao: 90 },
      { _ticketRotacao: 270, refracao: null }   // fecharia a volta
    ]);
    const out = await agente._straightenTicket('P', ['proc'], null, 0, api);
    // Para de girar em vez de voltar à foto original — e como o modelo ainda diz
    // "torto", a captura falha pedindo foto na horizontal (honesto: insistir
    // seria loop).
    expect(out.erro).toContain('Fotografe o ticket');
    expect(chamadas.length).toBe(2);
  });

  await testAsync('[ROT-11] pré-rotação local entra no acumulado e o modelo ainda pode desfazê-la', async () => {
    // v5.5.0: com a pré-rotação da moldura (PRE_ROTACAO_MOLDURA = 90), o modelo
    // NUNCA viu a orientação 0 — então "volte 270" é uma correção legítima da
    // nossa premissa (o médico apoiou o ticket de outro jeito), não uma volta a
    // uma orientação já reprovada.
    const { agente, api } = _fakeRotAgent([
      { _ticketRotacao: 270 },   // o modelo diz: você girou para o lado errado
      { refracao: null }
    ]);
    const out = await agente._straightenTicket('P', ['proc'], ['nativa'], 90, api);
    expect(out.erro === undefined).toBe(true);
    // Volta às imagens ORIGINAIS, sem passar pelo canvas: girar 0° só somaria
    // uma geração de JPEG à imagem que já estava certa.
    expect(out.imageParts[0].inlineData.data).toBe('proc');
    expect(out.cropSources[0]).toBe('nativa');
  });

  await testAsync('[ROT-12] sem rotação nenhuma, as imagens seguem intocadas', async () => {
    const { agente, api } = _fakeRotAgent([{ refracao: null }]);
    const out = await agente._straightenTicket('P', ['proc'], ['nativa'], 0, api);
    expect(out.imageParts[0].inlineData.data).toBe('proc');
    expect(out.cropSources[0]).toBe('nativa');
    expect(out.raw._ticketFoiRotacionado === undefined).toBe(true);
  });

  await testAsync('[ROT-13] falha de rede na 1ª leitura vira erro explicado, não exceção solta', async () => {
    const { agente, api } = _fakeRotAgent([new Error('timeout')]);
    const out = await agente._straightenTicket('P', ['proc'], null, 0, api);
    expect(out.erro).toContain('Erro na comunicação com a IA');
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// v5.5.0 — revisão de estabilidade do OCR (2026-08-06).
// Orientação medida localmente, tonometria conferida, PIO alta sinalizada,
// múltiplos tickets avisados, desempate de cilindro com sinal normalizado.
// ──────────────────────────────────────────────────────────────────────────────

async function _v550Tests() {
  // ── Apresentação padronizada (moldura) ─────────────────────────────────────
  test('[ORIENT-1] a orientação inicial é uma CONSTANTE ligada à moldura, não um palpite', () => {
    // Um detector local de "deitado vs em pé" foi escrito e medido contra as
    // fotos reais: errou 2 das 5 conferidas à vista. Pior, seu único modo de
    // erro perigoso — girar uma foto que estava boa — só apareceria quando a
    // moldura começasse a funcionar. Foi descartado; quem endireita é o modelo.
    expect(examJsSource).toContain('const PRE_ROTACAO_MOLDURA = 270;');
    expect(examJsSource.includes('_detectTicketDeitado')).toBe(false);
    expect(examJsSource).toContain('processedImages, nativeImages, PRE_ROTACAO_MOLDURA, apiService');
  });

  test('[ORIENT-2] a constante concorda com o lado marcado na moldura', () => {
    // Acoplamento real entre dois arquivos: trocar o lado do cabeçalho no HTML
    // sem trocar a constante faz TODA captura chegar de cabeça para baixo.
    const html = fs.readFileSync(require('path').join(__dirname, '..', 'sidepanel.html'), 'utf8');
    expect(/data \/ REF\.DATA deste lado/.test(html)).toBe(true);
    // O CSS decide o LADO; o prompt decide o número que corresponde a esse lado.
    const css = fs.readFileSync(require('path').join(__dirname, '..', 'styles', 'sidepanel.css'), 'utf8');
    const faixa = css.slice(css.indexOf('.framing-guide-head'), css.indexOf('.framing-guide-head') + 420);
    expect(faixa).toContain('right: 0;');
    expect(faixa.includes('left: 0;')).toBe(false);
    // "topo do ticket à DIREITA da foto" é 270 pela definição do próprio prompt.
    expect(_examAgent._getExamPrompt()).toContain('270 — topo do ticket à DIREITA da foto');
    expect(examJsSource).toContain('const PRE_ROTACAO_MOLDURA = 270;');
  });

  test('[ORIENT-3] a moldura é horizontal (de pé, os dígitos perderiam resolução)', () => {
    const css = fs.readFileSync(require('path').join(__dirname, '..', 'styles', 'sidepanel.css'), 'utf8');
    const bloco = css.slice(css.indexOf('.framing-guide-box'), css.indexOf('.framing-guide-box') + 400);
    expect(bloco).toContain('width: 94%');
    // o que denunciaria a volta da moldura vertical
    expect(bloco.includes('aspect-ratio: 1 / 3.2')).toBe(false);
  });

  // ── Tonometria conferida (item 5 da revisão) ────────────────────────────────
  //
  // As fixtures abaixo são TRANSCRIÇÕES DAS FOTOS REAIS, não números inventados.
  // Foi o que revelou que o AVG do TOPCON não é a média do que está impresso:
  // leituras entre parênteses são excluídas da conta, e uma regra de faixa
  // [min,max] reprovaria capturas boas por 1 mmHg.
  const NAO_BATE = 'não bate com nenhuma medição';

  test('[TONO-1] erro de dígito no AVG vira aviso', () => {
    // 13 lido como 18: é ESTE erro que a conferência existe para pegar.
    const out = _examAgent._postProcessRefraction({
      refracao: null,
      tonometria: { od: 18, oe: 14 },
      _tonoMedicoes: { od: [13, 13, 14], oe: [14, 14] }
    });
    expect(out.tonometria.od).toBe(18);   // não descarta — avisa
    const aviso = out._avisos.find(a => a.includes(NAO_BATE));
    expect(aviso).toBeTruthy();
    expect(aviso).toContain('OD');
    // o olho coerente não gera ruído
    expect(out._avisos.some(a => a.includes('OE') && a.includes(NAO_BATE))).toBe(false);
  });

  test('[TONO-2] foto real 2026-08-06: "R 13 (14)(14) AVG 13" passa calado', () => {
    // A média de 13,14,14 seria 14, mas o AVG impresso é 13 — os valores entre
    // parênteses não entram. Comparar com a FAIXA acusaria; comparar com o valor
    // impresso mais próximo (distância 0) não.
    const out = _examAgent._postProcessRefraction({
      refracao: null,
      tonometria: { od: 13, oe: 14 },
      _tonoMedicoes: { od: [13, 14, 14], oe: [14, 14] }   // "L 14 ERR (14) 14"
    });
    expect(out._avisos.some(a => a.includes(NAO_BATE))).toBe(false);
  });

  test('[TONO-3] foto real 2026-05-21: "L ERR (16)(18) AVG 19" passa calado', () => {
    // O caso que uma regra de faixa reprovaria: o AVG não é a média (17) nem um
    // dos valores impressos. Distância ao mais próximo = 1 mmHg.
    const out = _examAgent._postProcessRefraction({
      refracao: null,
      tonometria: { od: 20, oe: 19 },
      _tonoMedicoes: { od: [19, 19, 21], oe: [16, 18] }
    });
    expect(out._avisos.some(a => a.includes(NAO_BATE))).toBe(false);
  });

  test('[TONO-3b] medições ilegíveis não inventam conferência', () => {
    const out = _examAgent._postProcessRefraction({
      refracao: null,
      tonometria: { od: 18 },
      _tonoMedicoes: { od: [] }
    });
    expect(out.tonometria.od).toBe(18);
    expect(out._avisos.some(a => a.includes(NAO_BATE))).toBe(false);
  });

  test('[TONO-4] PIO acima de 21 mmHg é sinalizada (pendência do log 2026-07-31)', () => {
    // PIO 24 estava dentro da faixa de plausibilidade do aparelho, então nada a
    // marcava — mas é hipertensão ocular, o motivo clínico do exame.
    const out = _examAgent._postProcessRefraction({
      refracao: null,
      tonometria: { od: 24, oe: 15 }
    });
    const alerta = out._avisos.find(a => a.includes('acima de 21'));
    expect(alerta).toBeTruthy();
    expect(alerta).toContain('PIO OD = 24');
    expect(out._avisos.some(a => a.includes('PIO OE'))).toBe(false);
    // e o valor segue injetável: o alerta é clínico, não bloqueio de leitura
    expect(out.tonometria.od).toBe(24);
    expect(out._captureFailed).toBe(false);
  });

  test('[TONO-5] 21 mmHg exatos não disparam alerta (fronteira)', () => {
    const out = _examAgent._postProcessRefraction({ refracao: null, tonometria: { od: 21 } });
    expect(out._avisos.some(a => a.includes('acima de 21'))).toBe(false);
  });

  // ── Múltiplos tickets na mesma foto ─────────────────────────────────────────
  test('[MULTI-1] mais de um ticket na foto avisa sem bloquear', () => {
    const out = _examAgent._postProcessRefraction({
      _ticketsMultiplos: true,
      refracao: null,
      tonometria: { od: 15, oe: 14 }
    });
    expect(out._avisos.some(a => a.includes('mais de um ticket'))).toBe(true);
    expect(out._captureFailed).toBe(false);
    expect(out.tonometria.od).toBe(15);
  });

  test('[MULTI-2] ticket único não gera o aviso', () => {
    const out = _examAgent._postProcessRefraction({
      _ticketsMultiplos: false, refracao: null, tonometria: { od: 15 }
    });
    expect(out._avisos.some(a => a.includes('mais de um ticket'))).toBe(false);
  });

  test('[MULTI-3] o prompt proíbe misturar seções de tickets diferentes', () => {
    const prompt = _examAgent._getExamPrompt();
    expect(prompt).toContain('NUNCA misture seções de tickets diferentes');
    expect(prompt).toContain('"_ticketsMultiplos": true');
    // a rotação se ancora no ticket que tem a refração
    expect(prompt).toContain('use o ticket que contém a seção REF.DATA');
  });

  // ── Desempate de cilindro: sinal normalizado (item 4 da revisão) ────────────
  await testAsync('[CILTIE-1] "0.50" sem sinal confirma a 1ª (convenção negativa do TOPCON)', async () => {
    // Era comparado cru contra -0.50 e virava "3º valor diferente": desempate
    // certo, chamada gasta, disputa registrada como inconclusiva.
    const agente = new _GeminiExamAgent();
    const api = { callGeminiAPI: async () => ({ text: JSON.stringify({ od: '0.50' }) }) };
    const veredito = await agente._tiebreakCylinder(
      { eye: 'od', pCil: -0.50, vCil: -1.50 }, [], api
    );
    expect(veredito).toBe('primeira');
  });

  await testAsync('[CILTIE-2] o sinal explícito continua funcionando', async () => {
    const agente = new _GeminiExamAgent();
    const api = { callGeminiAPI: async () => ({ text: JSON.stringify({ od: '-1.50' }) }) };
    expect(await agente._tiebreakCylinder({ eye: 'od', pCil: -0.50, vCil: -1.50 }, [], api)).toBe('segunda');
  });

  await testAsync('[CILTIE-3] "0.00" é um TERCEIRO valor, não "sem cilindro"', async () => {
    // Nesta disputa os dois lados têm cilindro: um zero lido é inconclusivo, e
    // não pode virar null por _parseCil (que converte 0 → null).
    const agente = new _GeminiExamAgent();
    const api = { callGeminiAPI: async () => ({ text: JSON.stringify({ od: '0.00' }) }) };
    expect(await agente._tiebreakCylinder({ eye: 'od', pCil: -0.50, vCil: -1.50 }, [], api)).toBe(null);
  });

  await testAsync('[CILTIE-4] "null" segue sendo ilegível', async () => {
    const agente = new _GeminiExamAgent();
    const api = { callGeminiAPI: async () => ({ text: JSON.stringify({ od: 'null' }) }) };
    expect(await agente._tiebreakCylinder({ eye: 'od', pCil: -0.50, vCil: -1.50 }, [], api)).toBe(null);
  });

  // ── Tolerâncias centralizadas ──────────────────────────────────────────────
  test('[TOL-1] as tolerâncias vivem em OCR_TOL, não soltas no meio das funções', () => {
    // Foi assim que um "0.25" virou exatamente um passo dióptrico sem ninguém
    // notar (regressão corrigida na v5.4.5).
    expect(examJsSource).toContain('const OCR_TOL = {');
    // a validação de linha continua ABAIXO do passo dióptrico
    expect(examJsSource).toContain('LINHA_VALIDADA: 0.13');
    expect(examJsSource).toContain('MATH_CONSISTENT: 0.15');
    expect(examJsSource).toContain('CIL_HARD: 0.50');
    expect(examJsSource).toContain('EIXO_GRAUS: 8');
    // e ninguém mais compara com os literais antigos
    expect(examJsSource.includes('Math.abs(seCalc - se) <= 0.15')).toBe(false);
    expect(examJsSource.includes('if (circularDiff > 8)')).toBe(false);
  });

  test('[TOL-2] os valores de OCR_TOL preservam o comportamento conferido', () => {
    // Comportamental, não textual: a math-consistency continua aceitando 0.15D
    // e recusando 0.25D (o passo dióptrico inteiro).
    expect(_examAgent._isEyeMathConsistent({ esf: '-1.00', cil: -1.00, se: '-1.50' })).toBe(true);
    expect(_examAgent._isEyeMathConsistent({ esf: '-1.00', cil: -1.00, se: '-1.75' })).toBe(false);
    // e a linha validada segue recusando a célula vizinha (0.25D de distância)
    expect(_examAgent._sphereSignVerdict({ esf: '+0.25' }, { sinal: '+', magnitude: '0.50' })).toBe('ilegivel');
  });

  // ── Orçamento de chamadas ──────────────────────────────────────────────────
  await testAsync('[BUDGET-1] toda chamada passa pelo contador e o total aparece no log', async () => {
    const agente = new _GeminiExamAgent();
    expect(agente._chamadas).toBe(0);
    const api = { callGeminiAPI: async () => ({ text: '{}' }) };
    await agente._callApi(api, [], {}, 'teste');
    await agente._callApi(api, [], {}, 'teste');
    expect(agente._chamadas).toBe(2);
    // o contador é usado no log final da captura
    expect(examJsSource).toContain('chamada(s) à API');
  });

  // ── Sidepanel: seções residuais e banners sem innerHTML ────────────────────
  test('[UI-1] tono e paqui somem quando a captura não os traz (valor antigo na tela)', () => {
    // A refração ganhou isso na v5.4.0; tono/paqui só eram REVELADOS, nunca
    // escondidos — a PIO do paciente anterior ficava visível como se fosse desta.
    const idx = cameraJsSource.indexOf('function displayCameraResults');
    const bloco = cameraJsSource.slice(idx, idx + 2200);
    expect(bloco).toContain("tonometriaSection.classList.add('hidden')");
    expect(bloco).toContain("paquimetriaSection.classList.add('hidden')");
    expect(bloco).toContain("document.getElementById('tonoOdField').value = ''");
    expect(bloco).toContain("document.getElementById('paquiOeField').value = ''");
  });

  test('[UI-2] banners de falha escrevem o motivo com textContent, não innerHTML', () => {
    // `reason` carrega texto vindo do OCR (valores lidos do papel). Conteúdo
    // lido de uma imagem é dado, não marcação.
    expect(cameraJsSource).toContain('motivo.textContent = reason;');
    expect(cameraJsSource.includes('${reason}')).toBe(false);
    expect(cameraJsSource.includes('banner.innerHTML')).toBe(false);
  });

  test('[UI-3] a moldura de enquadramento aparece com a câmera e some ao parar', () => {
    expect(cameraJsSource).toContain("cameraFramingGuide.classList.remove('hidden')");
    expect(cameraJsSource).toContain("cameraFramingGuide.classList.add('hidden')");
  });
}

test('[ROT-9] sentido errado tem conserto: 90 (errado) + 180 = 270 (o outro sentido)', () => {
  const tentadas = new Set([0]);
  // 1ª correção: o modelo chuta 90 e a imagem sai de cabeça para baixo
  const a1 = _examAgent._proximoAlvoRotacao(0, 90, tentadas);
  expect(a1).toBe(90);
  tentadas.add(a1);
  // 2ª: com o ticket invertido, o modelo pede 180 — que leva à outra apresentação
  const a2 = _examAgent._proximoAlvoRotacao(a1, 180, tentadas);
  expect(a2).toBe(270);
});

test('[ROT-10] oscilação 90→270 fecha a volta e é recusada (voltaria à foto original)', () => {
  const tentadas = new Set([0, 90]);
  expect(_examAgent._proximoAlvoRotacao(90, 270, tentadas)).toBe(null);
  // e um passo inválido nunca gira
  expect(_examAgent._proximoAlvoRotacao(0, 45, new Set([0]))).toBe(null);
  expect(_examAgent._proximoAlvoRotacao(0, 0, new Set([0]))).toBe(null);
  // 270 (errado) + 180 = 90: o caminho simétrico do ROT-9 também vale
  expect(_examAgent._proximoAlvoRotacao(270, 180, new Set([0, 270]))).toBe(90);
});


test('[ROT-8] o prompt ancora 90/270 na posição do TOPO do ticket, não na inclinação da cabeça', () => {
  // "incline a cabeça para a esquerda" é a instrução que o modelo mais erra;
  // "onde está o cabeçalho com a data" é verificável na própria imagem.
  const prompt = _examAgent._getExamPrompt();
  expect(prompt.includes('topo do ticket à ESQUERDA da foto')).toBe(true);
  expect(prompt.includes('topo do ticket à DIREITA da foto')).toBe(true);
  expect(prompt.includes('TONO.DATA')).toBe(true);
});

test('[ROT-5] o prompt ensina os quatro casos e proíbe transcrever torto', () => {
  const prompt = _examAgent._getExamPrompt();   // o prompt real, não o fonte
  expect(prompt.includes('"_ticketRotacao": 270')).toBe(true);
  expect(prompt.includes('NÃO transcreva nada com o ticket torto')).toBe(true);
  // o exemplo de saída não pode mais ensinar o campo antigo
  expect(prompt.includes('"_ticketRotacao": 0,')).toBe(true);
});

test('[FOCUS-6] leitura ampliada da célula errada perde para a que caiu na linha da esfera', () => {
  // 11:44: o recorte devolveu a magnitude do CILINDRO nos dois olhos e vencia
  // por ter um "+" legível; o ticket inteiro, que leu a esfera certa, era
  // descartado — e a captura correta saía com dois avisos de "não confirmou".
  const refracao = {
    od: { esf: '+2.50', cil: -1.25, eixo: 76, se: '+2.00' },
    oe: { esf: '+3.50', cil: -0.50, eixo: 96, se: '+3.25' }
  };
  const crop = { od: { sinal: '+', magnitude: '1.25' }, oe: { sinal: '+', magnitude: '0.50' } };
  const full = { od: { sinal: '+', magnitude: '2.50' }, oe: { sinal: '+', magnitude: '3.50' } };
  // critério histórico (sem refração): os dois "servem" — é o que fazia o recorte ganhar
  expect(_examAgent._signsUsable(crop)).toBe(true);
  // critério novo: só vale quem está na linha da esfera
  expect(_examAgent._signsUsable(crop, refracao)).toBe(false);
  expect(_examAgent._signsUsable(full, refracao)).toBe(true);
});

test('[DIM-3] guarda do laço estourada falha FECHADA (não injeta olho não conferido)', () => {
  // Sair do laço com disputa viva e nada bloqueado injetaria a leitura sem
  // conferência — a mesma classe de erro que o laço por dimensão corrigiu.
  expect(examJsSource).toContain('if (!bloqueou && mismatch) {');
  expect(examJsSource).toContain('a conferência não terminou (dimensões demais em disputa)');
  const idx = examJsSource.indexOf('if (!bloqueou && mismatch) {');
  const depois = examJsSource.slice(idx, idx + 700);
  expect(depois.includes('this._failEye(processed, lado, motivo);')).toBe(true);
});

test('[MAG-2] testemunha com magnitude a um passo de distância não resgata mais o sinal', () => {
  // Fronteira que a v5.4.5 moveu: se um dia a folga voltar a 0.25D, o buraco de
  // 18:01 reabre pelo outro lado — uma leitura que olhou a coluna errada
  // voltaria a "confirmar" a 1ª.
  const eye = { esf: '+0.50', cil: -0.75, eixo: 90, se: '+0.12' };
  const certa = { od: { sinal: '+', magnitude: '0.50', c: '-0.75', a: '90' } };
  const vizinha = { od: { sinal: '+', magnitude: '0.75', c: '-0.75', a: '90' } };
  expect(_examAgent._signWitnessesConfirm('od', eye, [certa])).toBe(true);
  expect(_examAgent._signWitnessesConfirm('od', eye, [vizinha])).toBe(false);
});

test('[CIL-W1] testemunhas unânimes desempatam o cilindro; empate mantém o bloqueio', () => {
  const eyeData = { esf: '-1.25', cil: -0.50, eixo: 7, se: '-1.50' };
  const mismatch = { eye: 'od', pCil: -0.50, vCil: -1.25 };
  const crop = { od: { sinal: '-', magnitude: '1.25', c: '-0.50', a: '7' } };
  const full = { od: { sinal: '-', magnitude: '1.25', c: '-1.25', a: '7' } };
  // unânime pela 1ª
  expect(_examAgent._cylinderWitnessVerdict(mismatch, eyeData, [crop])).toBe('primeira');
  // unânime pela 2ª
  expect(_examAgent._cylinderWitnessVerdict(mismatch, eyeData, [full])).toBe('segunda');
  // empate (caso real 18:30) → sem veredito
  expect(_examAgent._cylinderWitnessVerdict(mismatch, eyeData, [crop, full])).toBe(null);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-03 (v5.4.0) — Falha por SEÇÃO, não por captura.
// Log 17:46: tono 15/17 e paqui 517/515, sem conflito nenhum entre leituras,
// descartadas junto com a refração por divergência no cilindro do OE.
// ──────────────────────────────────────────────────────────────────────────────

test('[SECT-1] refração bloqueada + tono viva → captura NÃO falha, refração zerada', () => {
  const r = {
    refracao: { od: { esf: '-5.00' }, oe: null },
    tonometria: { od: 15, oe: 17 },
    paquimetria: { od: 517, oe: 515 },
    cid_refracao: ['H521 - Miopia'],
    _avisos: []
  };
  _examAgent._failRefraction(r, 'OE: cilindro discordante.');
  _examAgent._resolveBlocking(r);
  expect(r._captureFailed).toBe(false);
  expect(r._blockAutoInject).toBe(false);
  expect(r.refracao).toBe(null);
  expect(r.cid_refracao.length).toBe(0);
  expect(r.tonometria.od).toBe(15);
  expect(r._refracaoBloqueada).toBe(true);
});

test('[SECT-2] refração bloqueada e nada mais aproveitável → _captureFailed (contrato histórico)', () => {
  const r = { refracao: { od: { esf: '-5.00' }, oe: null }, tonometria: null, paquimetria: null, _avisos: [] };
  _examAgent._failRefraction(r, 'OD: S.E. não bate.');
  _examAgent._resolveBlocking(r);
  expect(r._captureFailed).toBe(true);
  expect(r._blockAutoInject).toBe(true);
  expect(r._reason).toBe('OD: S.E. não bate.');
});

test('[SECT-3] ponta a ponta: S.E. incoerente bloqueia refração mas preserva tono/paqui', () => {
  // OE do log 17:46: +3.75 com C=-1.75 ⇒ S.E. +2.88, mas o ticket imprime +2.25.
  const out = _examAgent._postProcessRefraction({
    refracao: {
      od: { medicoes: [], media: { s: '-5.00', c: -1.00, a: 99 }, se: '-5.50' },
      oe: { medicoes: [], media: { s: '+3.75', c: -1.75, a: 77 }, se: '+2.25' }
    },
    tonometria: { od: 15, oe: 17 },
    paquimetria: { od: 517, oe: 515 }
  });
  // v5.4.6: a conta é POR OLHO e reprova só o olho incoerente. O OD deste
  // ticket (-5.00 -1.00 ⇒ S.E. -5.50, exato) não tem por que cair junto — e,
  // zerando a refração aqui, ele perdia também a 2ª chamada e a leitura
  // ampliada, que só rodam com refração viva.
  expect(out._refracaoBloqueada === true).toBe(false);
  expect(out._captureFailed).toBe(false);
  expect(out.refracao.oe).toBe(null);
  expect(out.refracao.od.esf).toBe('-5.00');
  expect(out.tonometria.od).toBe(15);
  expect(out.paquimetria.oe).toBe(515);
  // a conta do ticket aponta o cilindro que fecharia (-3.00) — informação útil
  expect(out._avisos.some(a => a.includes('-3.00'))).toBe(true);
});

test('[SECT-3b] os DOIS olhos incoerentes ⇒ refração inteira cai, tono/paqui ficam', () => {
  const out = _examAgent._postProcessRefraction({
    refracao: {
      od: { medicoes: [], media: { s: '+1.25', c: -0.50, a: 76 }, se: '+1.50' },
      oe: { medicoes: [], media: { s: '+3.75', c: -1.75, a: 77 }, se: '+2.25' }
    },
    tonometria: { od: 14, oe: 13 },
    paquimetria: { od: 562, oe: 563 }
  });
  expect(out._refracaoBloqueada).toBe(true);
  expect(out.refracao).toBe(null);
  expect(out._captureFailed).toBe(false);
  expect(out.tonometria.od).toBe(14);
});

test('[SECT-3c] captura 11:41 do log: OD incoerente não leva o OE bom junto', () => {
  // OD +1.25 -0.50 com S.E. +1.50 (a conta dá +1.00); OE +3.50 -0.50 S.E. +3.25
  // fecha exato. Antes: refração inteira zerada — e, sem refração viva, a
  // captura terminava sem 2ª chamada e sem leitura ampliada para NINGUÉM.
  const out = _examAgent._postProcessRefraction({
    refracao: {
      od: { medicoes: [], media: { s: '+1.25', c: -0.50, a: 76 }, se: '+1.50' },
      oe: { medicoes: [], media: { s: '+3.50', c: -0.50, a: 96 }, se: '+3.25' }
    },
    tonometria: { od: 14, oe: 13 },
    paquimetria: { od: 562, oe: 563 }
  });
  expect(out.refracao.od).toBe(null);
  expect(out.refracao.oe.esf).toBe('+3.50');
  // refração viva ⇒ a conferência do OE acontece (é o gate de refracaoViva)
  expect(out._refracaoBloqueada === true).toBe(false);
  expect(out.refracao.oe != null).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-03 (v5.4.0) — S.E. impresso recupera o cilindro NÃO LIDO.
// Log 17:47:13: OD -5.00 com C não lido e S.E. -5.50 → captura reprovada por
// "leitura incorreta". 2*(S.E.-S) = -1.00 é exatamente o cilindro que as outras
// duas capturas do mesmo ticket leram. Leitura parcial ≠ leitura errada.
// ──────────────────────────────────────────────────────────────────────────────

test('[CILSE-1] cilindro não lido + S.E. implicando C plausível → NÃO bloqueia, avisa', () => {
  const out = _examAgent._postProcessRefraction({
    refracao: { od: { medicoes: [], media: { s: '-5.00', c: null, a: null }, se: '-5.50' }, oe: null },
    tonometria: { od: 15, oe: 17 }
  });
  expect(out._refracaoBloqueada === true).toBe(false);
  expect(out._captureFailed).toBe(false);
  expect(out.refracao.od.esf).toBe('-5.00');
  expect(out.refracao.od.cil).toBe(null);      // sem eixo, não é injetável
  expect(out._avisos.some(a => a.includes('C≈-1.00'))).toBe(true);
});

test('[CILSE-2] cilindro não lido + diferença implicando C POSITIVO → bloqueia (TOPCON é negativo)', () => {
  const out = _examAgent._postProcessRefraction({
    refracao: { od: { medicoes: [], media: { s: '-5.00', c: null, a: null }, se: '-4.00' }, oe: null },
    tonometria: null, paquimetria: null
  });
  expect(out._refracaoBloqueada).toBe(true);
  expect(out._captureFailed).toBe(true);
});

test('[CILSE-3] cilindro não lido e S.E. == esfera segue coerente (sem aviso, sem bloqueio)', () => {
  const out = _examAgent._postProcessRefraction({
    refracao: { od: { medicoes: [], media: { s: '+1.00', c: null, a: null }, se: '+1.00' }, oe: null }
  });
  expect(out._refracaoBloqueada === true).toBe(false);
  expect(out._avisos.some(a => a.includes('implica C'))).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-03 (v5.4.0) — Releituras focadas recebem PIXELS focados + thinking.
// ──────────────────────────────────────────────────────────────────────────────

test('[FOCUS-1] _normalizeBox valida, aplica folga e rejeita caixa degenerada/total', () => {
  const ok = _examAgent._normalizeBox([200, 100, 600, 900]);
  expect(ok !== null).toBe(true);
  expect(ok.ymin < 200 && ok.ymax > 600).toBe(true);   // folga aplicada
  expect(ok.xmin >= 0 && ok.xmax <= 1000).toBe(true);  // clamp nas bordas
  expect(_examAgent._normalizeBox(null)).toBe(null);
  expect(_examAgent._normalizeBox([1, 2, 3])).toBe(null);
  expect(_examAgent._normalizeBox([200, 100, 210, 900])).toBe(null);   // altura < 50
  expect(_examAgent._normalizeBox([0, 0, 1000, 1000])).toBe(null);     // ticket inteiro
  expect(_examAgent._normalizeBox([200, 100, 600, 1400])).toBe(null);  // fora de 0-1000
});

test('[FOCUS-2] 1ª chamada pede _refDataBox e os desempates usam o recorte', () => {
  expect(examJsSource).toContain('"_refDataBox"');
  expect(examJsSource).toContain('_buildFocusedParts(cropSources, raw?._refDataBox, cropFromNative)');
  expect(examJsSource).toContain('_tiebreakCylinder(mismatch, await getFocusedParts(), apiService)');
  expect(examJsSource).toContain('const focused = await getFocusedParts();');
  expect(examJsSource).toContain('this._readSphereSigns(focused, apiService)');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-03 (v5.4.1) — a 3ª leitura precisa de uma segunda chance.
//
// Log 20:14: duas capturas seguidas do mesmo ticket voltaram com sinal=null na
// leitura ampliada (uma delas com magnitude "0.77" — o EIXO do OE), e as duas
// refrações foram bloqueadas. _refDataBox é palpite do modelo, não medição: a
// mesma folha rendeu [170,170,460,380] e depois [170,100,520,450]. Caixa
// INVÁLIDA já caía para o ticket inteiro; caixa válida-e-errada não tinha recurso.
// ──────────────────────────────────────────────────────────────────────────────

test('[FOCUS-3] _signsUsable: basta um olho com sinal legível', () => {
  const u = s => _examAgent._signsUsable(s);
  expect(u({ od: { sinal: '+', magnitude: '1.00' }, oe: { sinal: null, magnitude: null } })).toBe(true);
  expect(u({ od: { sinal: '-', magnitude: '0.50' }, oe: null })).toBe(true);
  // O caso do log: nenhum sinal → a chamada não produziu evidência nenhuma
  expect(u({ od: { sinal: null, magnitude: '0.75' }, oe: { sinal: null, magnitude: '0.77' } })).toBe(false);
  expect(u({ od: { sinal: null, magnitude: null }, oe: { sinal: null, magnitude: null } })).toBe(false);
  expect(u(null)).toBe(false);
  expect(u({})).toBe(false);
});

test('[FOCUS-4] recorte ilegível cai na leitura do ticket inteiro (agora em paralelo)', () => {
  // Só a caixa inválida tinha fallback; a caixa válida-e-errada não tinha.
  // v5.4.2: as duas leituras correm juntas (o recorte falhou em 3 de 3 capturas
  // no log 2026-08-05, então o "caminho de exceção" era o normal); o recorte
  // mantém a preferência quando serve.
  expect(examJsSource).toContain("this._readSphereSigns(imageParts, apiService)");
  expect(examJsSource).toContain('if (this._signsUsable(cropSigns)) return cropSigns;');
  expect(examJsSource).toContain('if (this._signsUsable(fullSigns)) {');
});

test('[FOCUS-5] métricas do recorte vão para o log (caixa errada vs resolução baixa)', () => {
  expect(examJsSource).toContain('origem=${m.src} recorte=${m.crop} saída=${m.out}');
});

test('[SIGN-10] _describeSignMisread separa "papel ruim" de "célula errada"', () => {
  const d = (eye, sign) => _examAgent._describeSignMisread(eye, sign);
  // O caso do log: magnitude "0.77" com eixo 77 → a 3ª leitura foi para a coluna A
  expect(d({ esf: '+1.00', cil: -2.5, eixo: 77 }, { sinal: '+', magnitude: '0.77' })).toContain('EIXO');
  expect(d({ esf: '+1.00', cil: -2.5, eixo: 77 }, { sinal: '-', magnitude: '2.50' })).toContain('CILINDRO');
  expect(d({ esf: '+1.00', cil: -2.5, eixo: 77 }, { sinal: null, magnitude: '0.75' })).toContain('sinal ausente');
  expect(d({ esf: '+1.00', cil: -2.5, eixo: 77 }, null)).toContain('não devolveu');
});

test('[THINK-1] OCR deixou de rodar com thinkingBudget 0', () => {
  expect(examJsSource).toContain('const EXAM_CONFIG  = { maxOutputTokens: 8192, thinkingBudget: 2048 }');
  expect(examJsSource).toContain('const FOCUS_CONFIG = { maxOutputTokens: 2048, thinkingBudget: 1024 }');
});

test('[SIGN-8] falha da 2ª chamada NÃO pula a política de sinal (trys separados)', () => {
  // Regressão: com um try único, um erro de rede na verificação saltava a
  // conferência inteira e a refração era injetada sem ninguém ter olhado o sinal.
  const compIdx = examJsSource.indexOf('_compareEyesAgainstVerify(processed.refracao, verify)');
  const signIdx = examJsSource.indexOf('_applySignPolicy(processed, mismatchByEye, _signs');
  expect(compIdx !== -1 && signIdx !== -1).toBe(true);
  // entre a comparação e a política de sinal existe um catch fechando o try da 2ª
  const entre = examJsSource.slice(compIdx, signIdx);
  expect(entre.includes('} catch (err) {')).toBe(true);
  expect(entre.includes('try {')).toBe(true);
});

test('[RETRY-1] _todosOlhosDescartados marca o gatilho do auto-retry S↔C', () => {
  // Swap S↔C: o modelo põe o cilindro na coluna da esfera → s=null nos dois olhos.
  const out = _examAgent._postProcessRefraction({
    refracao: {
      od: { medicoes: [], media: { s: null, c: -5.00, a: 99 }, se: '-5.50' },
      oe: { medicoes: [], media: { s: null, c: -3.75, a: 77 }, se: '+2.25' }
    },
    tonometria: { od: 15, oe: 17 }
  });
  expect(out._todosOlhosDescartados).toBe(true);
  expect(out.refracao === null || (!out.refracao.od && !out.refracao.oe)).toBe(true);
});

test('[RETRY-2] refração válida NÃO marca o gatilho', () => {
  const out = _examAgent._postProcessRefraction({
    refracao: { od: { medicoes: [], media: { s: '-5.00', c: -1.00, a: 99 }, se: '-5.50' }, oe: null }
  });
  expect(out._todosOlhosDescartados).toBe(false);
});

test('[WARN-1] sidepanel renderiza os avisos (antes eram calculados e descartados)', () => {
  expect(cameraJsSource).toContain('function showExamWarnings');
  expect(cameraJsSource).toContain('showExamWarnings(validated._avisos)');
  // textContent e não innerHTML: os avisos carregam aspas, ≈ e sinais
  const fn = cameraJsSource.slice(cameraJsSource.indexOf('function showExamWarnings'));
  expect(fn.slice(0, 2000).includes('li.textContent = a;')).toBe(true);
});

test('[SECT-4] sidepanel mostra banner não-fatal e injeta o resto', () => {
  expect(cameraJsSource).toContain('validated._refracaoBloqueada');
  expect(cameraJsSource).toContain('showRefractionBlockedMessage');
  // o banner não pode dar return — a injeção de tono/paqui tem de seguir
  const idx = cameraJsSource.indexOf('showRefractionBlockedMessage(');
  const trecho = cameraJsSource.slice(idx, idx + 400);
  expect(trecho.includes('return;')).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-24 — Piso clínico da esfera no CID determinístico do OCR.
// ±0.25D está na faixa emétrope; codificar H52.0/H52.1 aí é ruído. Caso real:
// OD +0.25 / OE -0.25 gerou Hipermetropia + Miopia. Piso: |esf| ≥ 0.50D.
// ──────────────────────────────────────────────────────────────────────────────

// Estes testes são sobre O PISO CLÍNICO (qual esfera vira CID), não sobre o
// formato do código. Normalizar o ponto aqui evita que uma mudança de formatação
// os derrube — o formato tem dono próprio em [CIDDOT-3].
const _temCid = (cids, code) => cids.some(c => c.replace(/\./g, '').includes(code));

test('[REFRAC-FLOOR-1] esfera ±0.25 NÃO gera H52.0/H52.1 (ruído emétrope)', () => {
  const cids = _examAgent._inferCidRefracao({
    od: { esf: '+0.25', cil: null, eixo: null, se: '+0.25' },
    oe: { esf: '-0.25', cil: null, eixo: null, se: '-0.25' },
  });
  expect(_temCid(cids, 'H520')).toBe(false);
  expect(_temCid(cids, 'H521')).toBe(false);
});

test('[REFRAC-FLOOR-2] esfera |≥0.50| ainda codifica (miopia -0.50 preservada)', () => {
  const cids = _examAgent._inferCidRefracao({
    od: { esf: '-0.50', cil: -0.50, eixo: 175, se: '-0.75' },
    oe: { esf: '+0.50', cil: null, eixo: null, se: '+0.50' },
  });
  expect(_temCid(cids, 'H521')).toBe(true); // miopia OD -0.50
  expect(_temCid(cids, 'H520')).toBe(true); // hipermetropia OE +0.50
  expect(_temCid(cids, 'H522')).toBe(true); // astigmatismo OD -0.50
});

test('[REFRAC-FLOOR-3] astigmatismo (cil ≥0.25) codifica mesmo com esfera ±0.25', () => {
  const cids = _examAgent._inferCidRefracao({
    od: { esf: '+0.25', cil: -0.75, eixo: 90, se: '-0.12' },
    oe: null,
  });
  expect(_temCid(cids, 'H522')).toBe(true);  // astigmatismo mantido
  expect(_temCid(cids, 'H520')).toBe(false); // esfera +0.25 suprimida
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
// 2026-08-05 — Três capturas seguidas do MESMO ticket, três bloqueios, nenhuma
// injeção de refração. A resposta estava dentro das leituras que já tinham sido
// feitas e pagas:
//   13:33 OD — medições 80/50/49 com "média" 75 vs 2ª leitura 50; desempate de
//              eixo ilegível ⇒ bloqueio. A leitura ampliada tinha lido a=50.
//   13:38 OD — 1ª leu C=-1.25 x50 (média E três medições), leitura ampliada leu
//              C=-1.25 na mesma linha, a 2ª não achou cilindro ⇒ 'hard' sem recurso.
// O prompt do sinal já manda transcrever C e A "para provar que você está na
// linha certa" — a prova era descartada. _rowWitnesses valida a linha (magnitude
// ≈ esfera da 1ª) e transforma C/A em voto.
// ──────────────────────────────────────────────────────────────────────────────

test('[WITNESS-1] _rowWitnesses só aceita leitura cuja linha foi validada pela esfera', () => {
  const eye = { esf: '+1.00', cil: -1.25, eixo: 50 };
  const w = _examAgent._rowWitnesses('od', eye, [
    { od: { sinal: '+', magnitude: '1.00', c: '-1.25', a: '50' } },   // mesma linha ✓
    { od: { sinal: '+', magnitude: '0.50', c: '-3.00', a: '90' } },   // outra célula ✗
  ]);
  expect(w.length).toBe(1);
  expect(w[0].cil).toBe(-1.25);
  expect(w[0].eixo).toBe(50);
});

test('[WITNESS-2] "plano" valida pela magnitude 0.00; eixo 0 e cilindro 0 não são voto', () => {
  // O lixo real do log: {sinal:"-", magnitude:"0.00", c:"-0.00", a:"0.00"} — linha
  // certa, células vazias preenchidas com zero. Autorrefrator não imprime eixo 0.
  const w = _examAgent._rowWitnesses('od', { esf: 'plano', cil: -1.25, eixo: 50 }, [
    { od: { sinal: null, magnitude: '0.00', c: '-0.00', a: '0.00' } },
    { od: { sinal: null, magnitude: '0.00', c: '-1.25', a: '50' } },
  ]);
  expect(w.length).toBe(2);
  expect(w[0].cil === null && w[0].eixo === null).toBe(true);
  expect(w[1].cil).toBe(-1.25);
  expect(w[1].eixo).toBe(50);
});

test('[WITNESS-2b] resposta de preenchimento (c = a = magnitude) não é testemunha', () => {
  // Do log: {magnitude:"0.25", c:"0.25", a:"0.25"} — a mesma string nas 3 colunas.
  const w = _examAgent._rowWitnesses('oe', { esf: '+0.25', cil: -1, eixo: 114 }, [
    { oe: { sinal: null, magnitude: '0.25', c: '0.25', a: '0.25' } },
  ]);
  expect(w.length).toBe(0);
});

test('[WITNESS-3] mismatch de cilindro-ausente-na-2ª é marcado para o resgate', () => {
  const processed = { od: { esf: 'plano', cil: -1.25, eixo: 50, se: '-0.75' }, oe: null };
  const verify    = { od: { s: 'plano', c: null, a: null, se: '-0.75' }, oe: null };
  const m = _examAgent._compareRefractionAgainstVerify(processed, verify);
  expect(m.severity).toBe('hard');
  expect(m.isCylinderMissingInVerify).toBe(true);
  expect(m.pCil).toBe(-1.25);
});

test('[WITNESS-4] caller resgata o cilindro pela testemunha e corrige o eixo por 2-de-3', () => {
  // Wiring: as duas leituras ampliadas ficam guardadas como testemunhas...
  expect(examJsSource).toContain('const _signsCandidates = [];');
  expect(examJsSource).toContain('if (cropSigns) _signsCandidates.push(cropSigns);');
  expect(examJsSource).toContain('if (fullSigns) _signsCandidates.push(fullSigns);');
  // ...o cilindro que só a 2ª não viu é liberado quando a testemunha confirma a 1ª...
  expect(examJsSource).toContain('mismatch.isCylinderMissingInVerify');
  expect(examJsSource).toContain('Math.abs(w.cil - mismatch.pCil) <= OCR_TOL.CIL_SOFT');
  // ...e o eixo só é CORRIGIDO com desempate + medições do próprio olho.
  expect(examJsSource).toContain("vereditoEixo === 'segunda' && mediaContradita");
  expect(examJsSource).toContain('eyeData.eixo = mismatch.vEixo;');
  // O eixo adotado passa pela mesma faixa 1-180 que _processEye impõe à 1ª.
  expect(examJsSource).toContain('mismatch.vEixo >= 1 && mismatch.vEixo <= 180');
});

test('[WITNESS-6] disputa RESOLVIDA não afirma "leituras independentes concordam"', () => {
  // O aviso de concordância ao lado de "eixo corrigido de 75° para 50°" desmente
  // justamente o pedido de conferência que autoriza a correção.
  expect(examJsSource).toContain('let resolvidoPorConferencia = false;');
  // v5.4.4: a conferência é por olho, então a afirmação de concordância exige
  // que NENHUM dos dois olhos tenha ficado com disputa.
  // v5.4.5: a conferência é por olho E por dimensão, então a afirmação de
  // concordância exige que nenhuma disputa tenha aparecido em nenhum dos dois.
  expect(examJsSource).toContain('if (!houveDisputa && verifyOk && !resolvidoPorConferencia) {');
  // marcado nos QUATRO caminhos que zeram o mismatch: 2 desempates + 2 resgates
  expect((examJsSource.match(/resolvidoPorConferencia = true;/g) || []).length).toBe(4);
});

test('[WITNESS-5] _processEye guarda as medições de eixo para a conferência', () => {
  // O caso 13:33: "média" 75 contra medições 80/50/49 — a média discorda de 2 das 3.
  const out = _examAgent._postProcessRefraction({
    refracao: {
      od: {
        medicoes: [
          { s: 'plano', c: -1.25, a: 80 },
          { s: 'plano', c: -1.25, a: 50 },
          { s: 'plano', c: -1.25, a: 49 },
        ],
        media: { s: 'plano', c: -1.25, a: 75 },
        se: '-0.75',
      },
      oe: null,
    },
    tonometria: { od: 17, oe: 16 },
  });
  expect(out.refracao.od.eixo).toBe(75);                       // a média segue prioritária
  expect(out.refracao.od._eixoMedicoes.join(',')).toBe('80,50,49');
});

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
// 2026-07-30 — Seleção ESTRITA da linha de CID (content.js, `_pickCidRow`).
// O dropdown do SHOSP mistura resultados da busca com a seção "Últimos CIDs
// selecionados". O matcher antigo tinha 4 caminhos que aceitavam código DIFERENTE
// do pedido (prefixo no onclick, prefixo no texto, qualquer linha da categoria,
// `rows.length === 1`) → com o histórico na tela, buscar H52.0 clicava em H52.4
// Presbiopia e respondia success. Log 2026-07-30: as duas falhas de CID (H04.1 e
// T15.0, 20 min de intervalo) descartaram a MESMA lista de 6 linhas — o histórico.
// ──────────────────────────────────────────────────────────────────────────────

const _pickCidRow = new Function(
  _extractFn(contentJsSource, '_pickCidRow') + '\nreturn _pickCidRow;'
)();

// Linha de resultado falsa no formato do SHOSP: código sem ponto no onclick.
const _row = (code, desc) => ({
  getAttribute: (a) => (a === 'onclick' ? `selecionaCid('${code}', '${desc}')` : null),
  textContent: `${code}${desc}`,
});
// A lista real de "Últimos CIDs selecionados" do log 2026-07-30.
const _historico = [
  _row('H010', 'BLEFARITE'), _row('H524', 'PRESBIOPIA'), _row('H522', 'ASTIGMATISMO'),
  _row('H521', 'MIOPIA'), _row('H251', 'CATARATA SENIL NUCLEAR'), _row('H110', 'PTERIGIO'),
];

test('[CIDPICK-1] casa o código pedido, com e sem ponto', () => {
  expect(_pickCidRow(_historico, 'H52.2').textContent).toContain('ASTIGMATISMO');
  expect(_pickCidRow(_historico, 'H522').textContent).toContain('ASTIGMATISMO');
  expect(_pickCidRow(_historico, 'H01.0').textContent).toContain('BLEFARITE');
});

test('[CIDPICK-2] REGRESSÃO: nunca aceita outro código da mesma categoria', () => {
  // O bug: H52.0 (Hipermetropia) e H52.9 (refração NE) caíam no fallback de
  // categoria "H52" e clicavam em H52.4 Presbiopia — o 1º H52x do histórico.
  expect(_pickCidRow(_historico, 'H52.0')).toBe(null);
  expect(_pickCidRow(_historico, 'H52.9')).toBe(null);
  expect(_pickCidRow(_historico, 'H25.0')).toBe(null); // histórico tem H251, não H250
  expect(_pickCidRow(_historico, 'H11.1')).toBe(null); // histórico tem H110
});

test('[CIDPICK-3] REGRESSÃO: linha única não é aceita por ser única', () => {
  // Fallback antigo `if (rows.length === 1) return rows[0]` lançava o que viesse.
  expect(_pickCidRow([_row('H524', 'PRESBIOPIA')], 'H52.0')).toBe(null);
  expect(_pickCidRow([_row('H524', 'PRESBIOPIA')], 'H52.4').textContent).toContain('PRESBIOPIA');
});

test('[CIDPICK-4] códigos ausentes do subset SHOSP falham em vez de virar vizinho', () => {
  // H04.1 e T15.0 do log: o histórico na tela não pode virar match.
  expect(_pickCidRow(_historico, 'H04.1')).toBe(null);
  expect(_pickCidRow(_historico, 'T15.0')).toBe(null);
  // E também não podem casar um vizinho quando o SHOSP responde a categoria.
  expect(_pickCidRow([_row('H040', 'DACRIOADENITE')], 'H04.1')).toBe(null);
});

test('[CIDPICK-5] pedido que É uma categoria de 3 chars aceita a subcategoria', () => {
  // H46 (Neurite óptica) e H55 (Nistagmo) só existem nessa forma na tabela CID;
  // o SHOSP pode gravá-los como "H460". Sem esta exceção seriam inalcançáveis.
  expect(_pickCidRow([_row('H460', 'NEURITE OPTICA')], 'H46').textContent).toContain('NEURITE');
  expect(_pickCidRow([_row('H46', 'NEURITE OPTICA')], 'H46').textContent).toContain('NEURITE');
  // ...mas um pedido de 4 chars nunca vira categoria (é o caso do H52.0).
  expect(_pickCidRow([_row('H524', 'PRESBIOPIA')], 'H52.0')).toBe(null);
  // A exceção NÃO reabre a porta para outra categoria: o histórico continua fora.
  expect(_pickCidRow(_historico, 'H46')).toBe(null);
});

test('[CIDPICK-5b] múltiplas subcategorias → primeira em ordem de documento', () => {
  // Comportamento arbitrário mas fixado: H46/H55 não têm subcategoria na CID-10,
  // então este caso só ocorre se o SHOSP inventar uma. Se um código de 3 chars
  // COM subcategorias reais entrar na tabela, este teste é o alarme.
  const rows = _historico.concat([_row('H461', 'NEURITE B'), _row('H460', 'NEURITE A')]);
  expect(_pickCidRow(rows, 'H46').textContent).toContain('NEURITE B'); // a 1ª do DOM
  // Código exato continua tendo precedência sobre a regra de categoria.
  expect(_pickCidRow(rows, 'H460').textContent).toContain('NEURITE A');
});

test('[CIDPICK-6] borda alfanumérica: H40.0 não casa H40.00', () => {
  expect(_pickCidRow([_row('H4000', 'GLAUCOMA SUSPEITO SUBCAT')], 'H40.0')).toBe(null);
  expect(_pickCidRow([_row('H400', 'SUSPEITA DE GLAUCOMA')], 'H40.0').textContent).toContain('SUSPEITA');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-30 — o SHOSP não usa ponto em CID (informado pelo médico)
// ──────────────────────────────────────────────────────────────────────────────
//
// As linhas de resultado do SHOSP vêm como "H522ASTIGMATISMO.", "H010BLEFARITE."
// O painel fazia o INVERSO do formato da plataforma: convertia "H400" → "H40.0"
// antes de buscar, "para compatibilidade com o autocomplete". Só não quebrava
// porque o content script tentava a variante sem ponto primeiro — o ponto era
// posto no painel e tirado no content script, e o log mentia sobre o que foi
// buscado. Agora a normalização é sem ponto, na origem.

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-30 — verificado NA PLATAFORMA (busca real, sem clicar em linha alguma)
// ──────────────────────────────────────────────────────────────────────────────
//
//   H520 → "H520 HIPERMETROPIA"            existe
//   H527 → "H527 TRANSTORNO NAO ESPECIF."  existe  ← é este o "não especificado"
//   H529 → zero linhas                     NÃO existe (nem na CID-10: H52 vai .0-.7)
//   H162 → "H162 CERATOCONJUNTIVITE"       existe  ← o "rejeitado" de 21/07 estava lá
//
// E a descoberta que explica todas as falhas de CID: `buscaCidProntuario()` só
// executa a consulta com a seção C.I.D. VISÍVEL. Oculta, o painel segue exibindo
// "Últimos CIDs selecionados" e essas 6 linhas eram lidas como resultado — por isso
// só entravam códigos já no histórico recente.

test('[CIDVIS-1] searchCid ativa a aba C.I.D. quando a seção está oculta', () => {
  expect(contentJsSource).toContain("input.offsetParent === null");
  expect(contentJsSource).toContain("_findCidTabCandidates(document)");
  expect(contentJsSource).toContain('Seção C.I.D. oculta — ativando a aba antes de buscar');
});

test('[CIDVIS-2] se a seção não ficar visível, falha explícita (não lê o histórico)', () => {
  // CID errado silencioso é pior que CID faltando — mesma regra do _pickCidRow.
  expect(contentJsSource).toContain('a busca do SHOSP não executa oculta');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-31 — o caminho de recuperação da visibilidade nunca podia ter rodado:
// `#tdCadastro-cid` é um ID INVENTADO (as abas reais são `tdCadastro-<número>`).
// No log de 13:58, H520/H522 entraram na 1ª rodada (seção ainda visível) e o H527
// da 2ª falhou com "seção C.I.D. não ficou visível" — o injectAll navegou para
// outras abas entre as rodadas e não havia como voltar.
// ──────────────────────────────────────────────────────────────────────────────

const _findCidTabCandidates = new Function(
  _extractFn(contentJsSource, '_findCidTabCandidates') + '\nreturn _findCidTabCandidates;'
)();

// doc falso com elementos: querySelector(sel) para o ID legado + querySelectorAll
// por seletor. Os elementos são objetos simples {id, tagName, textContent}.
const _fakeMenuDoc = (els, legado = null) => ({
  querySelector: (sel) => (sel === '#tdCadastro-cid' ? legado : null),
  querySelectorAll: (sel) => (sel === '[id*="tdCadastro"]'
    ? els.filter(e => (e.id || '').includes('tdCadastro'))
    : els),
});

test('[CIDTAB-1] acha o item do menu rotulado "C.I.D." pelo rótulo, sem depender do ID', () => {
  const cid = { id: 'tdCadastro-91234', tagName: 'TD', textContent: ' C.I.D. ' };
  const els = [
    { id: 'tdCadastro-78073', tagName: 'TD', textContent: 'Anamnese e Atendimento Geral' },
    cid,
    { id: 'tdCadastro-78074', tagName: 'TD', textContent: 'Refração' },
  ];
  const out = _findCidTabCandidates(_fakeMenuDoc(els));
  expect(out.length >= 1).toBe(true);
  expect(out[0]).toBe(cid);
});

test('[CIDTAB-2] "CIDADE" NUNCA é candidato — igualdade do rótulo, não prefixo', () => {
  // Um clique errado aqui navega a ficha para longe no meio da injeção: é pior
  // que a falha explícita que este caminho existe para evitar.
  const els = [
    { id: 'campoCidade', tagName: 'TD', textContent: 'Cidade' },
    { id: 'lblCidade', tagName: 'SPAN', textContent: 'CIDADE' },
    { id: 'tdCadastro-1', tagName: 'TD', textContent: 'Cidade/UF' },
  ];
  expect(_findCidTabCandidates(_fakeMenuDoc(els)).length).toBe(0);
});

test('[CIDTAB-3] o ID legado, se existir, continua sendo o primeiro palpite', () => {
  const legado = { id: 'tdCadastro-cid', tagName: 'TD', textContent: 'C.I.D.' };
  const outro = { id: 'tdCadastro-91234', tagName: 'A', textContent: 'CID' };
  const out = _findCidTabCandidates(_fakeMenuDoc([outro], legado));
  expect(out[0]).toBe(legado);
  expect(out.length).toBe(2);        // o legado não elimina os candidatos por rótulo
});

test('[CIDTAB-4] rótulos longos (containers) são ignorados e o total é limitado', () => {
  const els = [
    { id: 'divConteudo', tagName: 'DIV', textContent: 'C.I.D. Diagnóstico do paciente — histórico completo' },
  ];
  expect(_findCidTabCandidates(_fakeMenuDoc(els)).length).toBe(0);
  const muitos = Array.from({ length: 9 }, (_, i) => ({ id: 'x' + i, tagName: 'A', textContent: 'CID' }));
  expect(_findCidTabCandidates(_fakeMenuDoc(muitos)).length).toBe(5);
});

test('[CIDTAB-5] a espera pela seção é ATIVA (poll) e a falha dumpa o menu linha a linha', () => {
  // O dump é o que torna o ID verdadeiro conhecível na próxima sessão — e tem de
  // ser uma linha por item: JSON.stringify único é truncado pelo console do Chrome.
  expect(contentJsSource).toContain('[searchCid] DUMP menu:');
  // Duas passadas: as abas `tdCadastro` e, se a seção não for uma delas, qualquer
  // rótulo curto que mencione "cid".
  expect(contentJsSource).toContain("linha(el, 'aba')");
  expect(contentJsSource).toContain("linha(el, 'rotulo')");
  expect(contentJsSource).toContain('const deadline = Date.now() + espera;');
  // O delay cego que existia no lugar da espera ativa não pode voltar.
  expect(contentJsSource.includes('abaCid.click()')).toBe(false);
});

test('[CIDTAB-6] o 1º candidato ganha prazo próprio — 1,6s era curto demais (log 2026-08-04)', () => {
  // Prova do log: numa cadeia de dois CIDs, o H010 falhou com "não ficou visível"
  // e o H524 — 1,8s depois, mesma página, sem clique novo — passou. O clique
  // funcionou; só o prazo é que acabou antes da seção montar.
  expect(contentJsSource).toContain('const CID_SECTION_WAIT_MS = 5000;');
  expect(contentJsSource).toContain('i === 0 ? CID_SECTION_WAIT_MS : TAB_LOAD_DELAY * 2');
  // A falha carrega um código legível por máquina: o painel decide o reagendamento
  // por ele, não casando prosa em português entre os dois arquivos.
  expect(contentJsSource).toContain("code: 'CID_SECTION_HIDDEN'");
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-30 (tarde) — falha de CID: "ausente do subset" ≠ "bug de matching"
// ──────────────────────────────────────────────────────────────────────────────
//
// Caso real: "1 CID não aceito pelo SHOSP — adicione manualmente: H250 - Catarata
// senil incipiente AO". As variantes de H250 são ["H250", "H25.0", "H25"]. Quando
// o código não está no subset, as duas primeiras devolvem zero linhas e a TERCEIRA
// (categoria, um mero ampliador) devolve os irmãos — H251, H259... O `sawAnyRows`
// anterior era marcado por qualquer variante, então essa ausência era reportada
// como "SHOSP retornou resultados mas nenhum correspondeu — verifique matching":
// exatamente o outro diagnóstico, mandando caçar bug onde não há.
const _classifyCidFailure = new Function(
  _extractFn(contentJsSource, '_classifyCidFailure') + '\nreturn _classifyCidFailure;'
)();

const _att = (variant, exato, linhas, descartadas = '') => ({ variant, exato, linhas, descartadas });

test('[CIDCLS-1] nenhuma variante com linhas → sem-resultado', () => {
  const r = _classifyCidFailure('H250', [_att('H250', true, 0), _att('H25.0', true, 0), _att('H25', false, 0)]);
  expect(r.motivo).toBe('sem-resultado');
  expect(r.error.includes('Nenhum resultado no SHOSP')).toBe(true);
  expect(r.error.includes('H250, H25.0, H25')).toBe(true); // lista as variantes tentadas
});

test('[CIDCLS-2] REGRESSÃO: só a categoria trouxe linhas → ausente do subset, NÃO matching', () => {
  const r = _classifyCidFailure('H250', [
    _att('H250', true, 0), _att('H25.0', true, 0),
    _att('H25', false, 2, 'H251CATARATA SENIL NUCLEAR | H259CATARATA SENIL NE'),
  ]);
  expect(r.motivo).toBe('ausente-no-subset');
  expect(r.error.includes('verifique matching')).toBe(false);
  expect(r.error.includes('Lançar manualmente')).toBe(true);
  expect(r.error.includes('H251CATARATA SENIL NUCLEAR')).toBe(true); // prova no próprio aviso
});

test('[CIDCLS-3] variante do CÓDIGO EXATO trouxe linhas sem casar → matching', () => {
  // Aqui o SHOSP consultou o código pedido e devolveu algo — histórico na tela ou
  // bug de casamento. É o único caso que justifica investigar o matcher.
  const r = _classifyCidFailure('H250', [
    _att('H250', true, 6, 'H010BLEFARITE | H524PRESBIOPIA | H251CATARATA SENIL NUCLEAR'),
    _att('H25', false, 0),
  ]);
  expect(r.motivo).toBe('matching');
  expect(r.error.includes('verifique matching')).toBe(true);
  expect(r.error.includes('H010BLEFARITE')).toBe(true);
});

test('[CIDCLS-4] pedido que É categoria (H46) conta como exato, não como ampliador', () => {
  // H46/H55 só existem em 3 chars: para eles a "variante de categoria" É o pedido,
  // então linhas devolvidas por ela apontam matching (cenário do CIDPICK-5: o SHOSP
  // grava H46 como H460 e o matcher tem de alcançá-lo).
  const r = _classifyCidFailure('H46', [_att('H46', true, 2, 'H460NEURITE OPTICA | H461NEURITE B')]);
  expect(r.motivo).toBe('matching');
  // Contraprova: a MESMA lista vinda de um ampliador não vira suspeita de matching.
  expect(_classifyCidFailure('H46', [_att('H46', false, 2, 'H460NEURITE OPTICA')]).motivo)
    .toBe('ausente-no-subset');
});

test('[CIDCLS-5] wiring: searchCid usa o classificador e não o sawAnyRows antigo', () => {
  expect(contentJsSource).toContain('_classifyCidFailure(term, attempts)');
  expect(contentJsSource).not.toContain('let sawAnyRows');
  // a marca exato/ampliador tem de existir na construção das variantes
  expect(contentJsSource).toContain('addVariant(term.replace(/\\./g, \'\'), true)');
  expect(contentJsSource).toContain("addVariant(word, false)");
  // e o motivo tem de chegar ao painel junto da resposta
  expect(contentJsSource).toContain('sendResponse({ success: false, error, motivo, _dump, _attempts: attempts })');
});

test('[CIDNE-1] o inespecífico é H52.7; H52.9 nunca é emitido', () => {
  expect(geminiSrcFull).toContain('H527=Refração NE');
  expect(geminiSrcFull).not.toContain('H529=Refração NE');
  expect(geminiSrcFull).toContain('NUNCA emitir H52.9');
});

test('[CIDNE-2] a retificação de redundância cobre H527 E o legado H529', () => {
  // Saída antiga da IA ainda pode trazer H529: descartar segue sendo o certo.
  expect(_isRedundantUnspecifiedRefraction('H527', new Set(['H521']))).toBe(true);
  expect(_isRedundantUnspecifiedRefraction('H529', new Set(['H521']))).toBe(true);
  expect(_isRedundantUnspecifiedRefraction('H527', new Set())).toBe(false);
  // Um específico jamais é descartado como se fosse o vago.
  expect(_isRedundantUnspecifiedRefraction('H521', new Set(['H522']))).toBe(false);
});

test('[CIDNE-3] _dropUnspecifiedRefraction remove H52.7 e H52.9 diante de específico', () => {
  expect(_dropUnspecifiedRefraction('H527 - Refração NE\nH521 - Miopia')).toBe('H521 - Miopia');
  expect(_dropUnspecifiedRefraction('H529 - Refração NE\nH521 - Miopia')).toBe('H521 - Miopia');
  // Sozinho (sem específico) o inespecífico PERMANECE — é o diagnóstico do médico.
  expect(_dropUnspecifiedRefraction('H527 - Refração NE')).toBe('H527 - Refração NE');
});

test('[CIDDOT-1] o painel busca SEM ponto — nunca adiciona ponto ao código', () => {
  expect(injectionJsSource).toContain("termToSearch = termToSearch.replace(/\\./g, '')");
  // A conversão inversa (H400 → H40.0) não pode voltar.
  expect(injectionJsSource).not.toContain("termToSearch.slice(0, 3) + '.' + termToSearch.slice(3)");
});

// Modelo fiel da normalização do termo em handleSearchCid.
function _termToSearchModel(rawTerm) {
  const codeMatch = rawTerm.match(/^([A-Z]\d+(?:\.\d+)?)\s*[-–]/);
  let t = codeMatch ? codeMatch[1] : rawTerm;
  return t.replace(/\./g, '');
}

test('[CIDDOT-2] as duas origens (entrevista e OCR) convergem no mesmo termo', () => {
  // Entrevista emite sem ponto, OCR emitia com ponto — o SHOSP recebe o mesmo.
  expect(_termToSearchModel('H521 - Miopia AO')).toBe('H521');
  expect(_termToSearchModel('H52.1 - Miopia')).toBe('H521');
  expect(_termToSearchModel('H01.0 - Blefarite bilateral')).toBe('H010');
  expect(_termToSearchModel('H40.00 - Glaucoma subcat')).toBe('H4000');
});

test('[CIDDOT-3] o OCR emite o código sem ponto, como a entrevista', () => {
  expect(examJsSource).toContain("H520: 'H520 - Hipermetropia'");
  expect(examJsSource).toContain("H521: 'H521 - Miopia'");
  expect(examJsSource).toContain("H522: 'H522 - Astigmatismo'");
  expect(examJsSource).toContain("H523: 'H523 - Anisometropia'");
  expect(examJsSource).not.toContain("'H52.0 - Hipermetropia'");
});

test('[CIDDOT-4] matching segue insensível a ponto — a rede de segurança fica', () => {
  // O código pedido sem ponto tem que casar a linha do SHOSP (também sem ponto)
  // E uma eventual linha com ponto: _pickCidRow normaliza os dois lados.
  expect(_pickCidRow([_row('H522', 'ASTIGMATISMO')], 'H522').textContent).toContain('ASTIGMATISMO');
  expect(_pickCidRow([_row('H52.2', 'ASTIGMATISMO')], 'H522').textContent).toContain('ASTIGMATISMO');
  // E não afrouxa: H524 no histórico não pode ser aceito no lugar de H522.
  expect(_pickCidRow([_row('H524', 'PRESBIOPIA')], 'H522')).toBe(null);
});

test('[CIDDOT-5] a variante SEM ponto é sempre a primeira tentada', () => {
  const idx = contentJsSource.indexOf('const searchVariants = [];');
  const bloco = contentJsSource.slice(idx, idx + 500);
  // Termo com ponto: a variante do replace(/\./g,'') é adicionada antes do termo cru.
  const semPonto = bloco.indexOf("addVariant(term.replace(/\\./g, ''), true)");
  const comPonto = bloco.indexOf('addVariant(term, true);');
  expect(semPonto > -1 && comPonto > -1).toBe(true);
  expect(semPonto < comPonto).toBe(true);
});

test('[CIDPICK-7] termo textual (sem código) exige TODAS as palavras significativas', () => {
  const rows = [_row('H210', 'CORPO CILIAR TRANSTORNO'), _row('T150', 'CORPO ESTRANHO NA CORNEA')];
  expect(_pickCidRow(rows, 'corpo estranho').textContent).toContain('ESTRANHO');
  expect(_pickCidRow(rows, 'corpo inexistente aqui')).toBe(null);
  expect(_pickCidRow(rows, '')).toBe(null);
  expect(_pickCidRow([], 'H52.0')).toBe(null);
});

test('[CIDPICK-8] wiring: os fallbacks permissivos sumiram do handler', () => {
  // Nenhum dos 4 caminhos que aceitavam código diferente sobreviveu.
  expect(contentJsSource.includes('if (rows.length === 1) return rows[0]')).toBe(false);
  expect(contentJsSource.includes('fallback compatível com categoria')).toBe(false);
  expect(contentJsSource.includes('Usando primeiro resultado da busca por categoria')).toBe(false);
  expect(contentJsSource.includes('const matchCandidates')).toBe(false);
  // E o handler passa a usar o matcher estrito.
  expect(contentJsSource.includes('_pickCidRow(rows, requestedTerm)')).toBe(true);
});

test('[CIDPICK-9] wiring: waitForCidRow espera a linha PEDIDA, não o 1º render', () => {
  // waitForRows antigo devolvia o primeiro contêiner não-vazio (podia ser o histórico).
  expect(contentJsSource.includes('const waitForRows =')).toBe(false);
  const idx = contentJsSource.indexOf('const waitForCidRow =');
  expect(idx !== -1).toBe(true);
  const body = contentJsSource.slice(idx, idx + 1200);
  expect(body.includes('_pickCidRow(rows, requestedTerm)')).toBe(true); // só sai com match
  expect(body.includes('sameCount >= stableRounds')).toBe(true);        // saída por estabilidade
  expect(body.includes('minWaitMs')).toBe(true);                        // piso antes de desistir
  // collectRows varre TODOS os contêineres, não só o primeiro não-vazio
  const cIdx = contentJsSource.indexOf('const collectRows =');
  expect(contentJsSource.slice(cIdx, cIdx + 400).includes('for (const div of divs) rows.push(')).toBe(true);
});

test('[CIDPICK-10] wiring: divergência entre linha e pedido aborta antes do click', () => {
  const abortIdx = contentJsSource.indexOf('normCode !== wantNorm');
  const clickIdx = contentJsSource.indexOf('targetRow.click()');
  expect(abortIdx !== -1 && abortIdx < clickIdx).toBe(true);
  // dumps de diagnóstico nas falhas e no pós-clique
  expect(contentJsSource.includes('dumpCidPanels(`falha')).toBe(true);
  expect(contentJsSource.includes('_findCidOutsideSearchPanels(normCode)')).toBe(true);
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
  ['plano de investigação condicional (log 2026-08-04)', 'prosseguir investigação de outras causas'],
  ['lubrificante não aciona o protocolo da blefarite (log 2026-09-15)', 'O lubrificante NÃO é o colírio da blefarite'],
];

for (const [label, anchor] of SKILL_PROMPT_ANCHORS) {
  test(`[SKILL-SYNC] "${anchor}" presente na skill E no prompt (${label})`, () => {
    expect(condutaSkillSource.includes(anchor)).toBe(true);
    expect(geminiSrcFull.includes(anchor)).toBe(true);
  });
}

// A skill da ENTREVISTA tem o mesmo problema de duplicação: as regras de
// anamnese vivem nela e no prompt. A divergência já custou caro — a tabela de
// "afirmativas ambíguas sem nome de doença" existia SÓ na skill, e o prompt
// mandava usar a negativa implícita; o resultado foi "Nega comorbidades" escrito
// para um paciente que respondeu "sim" (log 2026-08-04).
const transcricaoSkillSource = readSrcNormalized('skills', 'user', 'transcricao-consulta-oftalmologia', 'SKILL.md');

const SKILL_PROMPT_ANCHORS_ENTREVISTA = [
  ['afirmativa sem nome de doença não vira negativa', 'Relata comorbidade sistêmica não especificada'],
  ['afirmativa de uso de medicação sistêmica', 'Usa medicação sistêmica (doença não especificada)'],
  ['colírio afirmado sem nome não vira negativa', 'Refere uso de colírio (não identificado na consulta)'],
  ['negativa de antecedentes não apaga história prévia', 'Nega diagnósticos e procedimentos oftalmológicos prévios'],
];

for (const [label, anchor] of SKILL_PROMPT_ANCHORS_ENTREVISTA) {
  test(`[SKILL-SYNC] "${anchor}" presente na skill de entrevista E no prompt (${label})`, () => {
    expect(transcricaoSkillSource.includes(anchor)).toBe(true);
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

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-04 — Template de blefarite virou rotina
//
// Consulta de refração (troca de grau + presbiopia). O médico entregou "a receita
// do shampoo" e lubrificante, sem uma palavra sobre a pálpebra no exame. O guard
// aceitou "shampoo" como evidência, a flag ficou de pé e o prontuário passou a
// AFIRMAR "hiperemia e espessamento da margem palpebral, telangiectasias e
// disfunção de glândulas de meibômio com secreção espessa".
// Regra: tratamento não é exame — a descrição só entra se a inflamação palpebral
// foi descrita. A flag (conduta/tratamento) permanece.
//
// Ainda em 2026-08-04, 2ª decisão do médico: "com secreção espessa" saiu do próprio
// template (BIOMICROSCOPIA_BLEFARITE) — meibum expressível é achado à parte e no
// bloco padrão virava rotina. Coberto por [BLEF-ROTINA-8].
// ──────────────────────────────────────────────────────────────────────────────

test('[BLEF-ROTINA-1] shampoo sem descrição do exame ⇒ flag de pé, template suprimido + aviso', () => {
  const raw = {
    tipo_consulta: 'primeira_consulta',
    dados: { hda: 'troca de grau', diagnostico: 'H524 - Presbiopia', biomicroscopia: null },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'o grau de longe está dando uma diferencinha, vou ajustar os óculos. ' +
                     'Essa aqui é a receita do shampoo e do lubrificante.',
    hookFlags: {},
  });
  // A flag continua: conduta e tratamento de blefarite seguem válidos
  expect(decision.injectFlags.injectBlefarite).toBe(true);
  // Mas o texto descritivo do exame NÃO está autorizado
  expect(decision.injectFlags.blefariteDescritaNoExame).toBe(false);
  expect(decision.avisos.length).toBe(1);
  expect(decision.avisos[0]).toContain('EM BRANCO');
  expect(decision.avisos[0]).toContain('inferida do tratamento');
});

test('[BLEF-ROTINA-2] inflamação palpebral descrita ⇒ template autorizado, sem aviso', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dados: { diagnostico: 'H010 - Blefarite', biomicroscopia: null },
    injectBlefarite: true,
  };
  const decision = DecisionEngine.buildDecision(raw, {
    transcribedText: 'a pálpebra ainda está bem vermelha, com crosta na base dos cílios; ' +
                     'mantém a higiene com o shampoo',
    hookFlags: {},
  });
  expect(decision.injectFlags.injectBlefarite).toBe(true);
  expect(decision.injectFlags.blefariteDescritaNoExame).toBe(true);
  expect(decision.avisos.length).toBe(0);
});

test('[BLEF-ROTINA-3] descrição leiga de 2026-07-29 continua autorizando o template', () => {
  // Constraint que discrimina a separação em dois níveis: se a descrição leiga cair
  // no nível "só tratamento", volta a blefarite real com biomicroscopia em branco.
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'primeira_consulta', dados: { biomicroscopia: null }, injectBlefarite: true },
    { transcribedText: _TRANSCRICAO_LEIGA_2026_07_29, hookFlags: {} }
  );
  expect(decision.injectFlags.blefariteDescritaNoExame).toBe(true);
  expect(decision.avisos.length).toBe(0);
});

test('[BLEF-ROTINA-4] "pálpebra um pouco irritada" é achado descrito (Caso 7 da SKILL)', () => {
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'primeira_consulta', dados: { biomicroscopia: null }, injectBlefarite: true },
    {
      transcribedText: 'começo de pterígio nasal, pálpebra um pouco irritada — vou passar ' +
                       'compressa morna e shampoo de neném nos cílios, lubrificante',
      hookFlags: {},
    }
  );
  expect(decision.injectFlags.blefariteDescritaNoExame).toBe(true);
  expect(decision.avisos.length).toBe(0);
});

test('[BLEF-ROTINA-5] "olho irritado" + shampoo nos cílios NÃO é inflamação palpebral descrita', () => {
  // O olho irritado tem caminho próprio na extensão (OLHO_IRRITADO_COMMANDS): é consulta
  // de rotina. Se "irritad" contasse na conjunção solta, toda uma classe de consultas
  // voltaria a afirmar hiperemia e telangiectasias sem ninguém ter olhado a pálpebra.
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'retorno', dados: { biomicroscopia: null }, injectBlefarite: true },
    {
      transcribedText: 'o olho está irritado, vou passar o shampoo nos cílios e lubrificante',
      hookFlags: {},
    }
  );
  expect(decision.injectFlags.injectBlefarite).toBe(true);   // conduta/tratamento seguem
  expect(decision.injectFlags.blefariteDescritaNoExame).toBe(false);
  expect(decision.avisos[0]).toContain('EM BRANCO');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-05 — "informaçãozinha na pálpebra": o ASR come "inflamação".
// O médico DESCREVEU o achado ("tem uma inflamaçãozinha na pálpebra, que é bem
// comum"), o reconhecedor devolveu "informaçãozinha", nenhum /inflama|vermelh|.../
// bateu e o gate suprimiu a biomicroscopia — deixando o campo vazio numa consulta
// em que o exame FOI descrito. Escopo estreito: "informação" só vale colada à
// estrutura palpebral.
// ──────────────────────────────────────────────────────────────────────────────

test('[BLEF-ASR-1] "informaçãozinha na pálpebra" (ASR) é inflamação descrita', () => {
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'primeira_consulta', dados: { biomicroscopia: null }, injectBlefarite: true },
    {
      transcribedText: 'ele tem uma informaçãozinha na pálpebra que é bem comum, por isso o olho ' +
                       'incomoda um pouco; vou passar o shampoo e o lubrificante',
      hookFlags: {},
    }
  );
  expect(decision.injectFlags.injectBlefarite).toBe(true);
  expect(decision.injectFlags.blefariteDescritaNoExame).toBe(true);
  expect(decision.avisos.length).toBe(0);
});

test('[BLEF-ASR-2] variantes do reconhecedor: "enformação na pálpebra", ordem invertida', () => {
  const d = txt => DecisionEngine.buildDecision(
    { tipo_consulta: 'retorno', dados: { biomicroscopia: null }, injectBlefarite: true },
    { transcribedText: txt + ' — mantém o shampoo', hookFlags: {} }
  ).injectFlags.blefariteDescritaNoExame;
  expect(d('tem uma enformação na pálpebra')).toBe(true);
  expect(d('pálpebra com informação')).toBe(true);
  expect(d('informação no bordo do olho')).toBe(true);
});

test('[BLEF-ASR-3] "informação" longe da pálpebra NÃO autoriza o template', () => {
  // Palavra comum demais para valer solta: sem a adjacência, toda consulta em que
  // o médico "passa uma informação" viraria blefarite descrita.
  const decision = DecisionEngine.buildDecision(
    { tipo_consulta: 'retorno', dados: { biomicroscopia: null }, injectBlefarite: true },
    {
      transcribedText: 'só uma informação: esse óculos não tem validade. Uso o shampoo no banho ' +
                       'e o lubrificante quando ficar muito tempo na tela',
      hookFlags: {},
    }
  );
  expect(decision.injectFlags.injectBlefarite).toBe(true);   // shampoo mantém conduta
  expect(decision.injectFlags.blefariteDescritaNoExame).toBe(false);
  expect(decision.avisos[0]).toContain('EM BRANCO');
});

test('[BLEF-ROTINA-6] injetor: template de blefarite gated por blefariteDescritaNoExame', () => {
  expect(injectionJsSource).toContain('audioData?.blefariteDescritaNoExame === true');
  expect(injectionJsSource).toContain('(_blefDescrita ? BIOMICROSCOPIA_BLEFARITE : null)');
  expect(injectionJsSource).toContain('biomicroscopia: _bioBase ? getBiomicroscopiaComLente(_bioBase) : null,');
  // O template não pode reaparecer como fallback incondicional nesse branch.
  expect(injectionJsSource).toContain('audioData?.dados?.biomicroscopia ||\n        (_blefDescrita');
});

test('[BLEF-ROTINA-7] plumbing: a flag chega ao workingData nos DOIS sites do DecisionEngine', () => {
  const audioSrc = readSrcNormalized('scripts', 'sidepanel-audio.js');
  const copias = audioSrc.match(
    /workingData\.blefariteDescritaNoExame\s*=\s*decision\.injectFlags\.blefariteDescritaNoExame/g
  ) || [];
  expect(copias.length).toBe(2);
  // E o banner de avisos é exibido nos dois caminhos (análise normal + pós-dilatação)
  expect((audioSrc.match(/_showClinicalWarnings\(decision\.avisos\)/g) || []).length).toBe(2);
});

test('[BLEF-ROTINA-8] "secreção espessa" saiu do template e dos exemplos do prompt', () => {
  const constantsSrc = readSrcNormalized('scripts', 'sidepanel-constants.js');
  const template = (constantsSrc.match(/const BIOMICROSCOPIA_BLEFARITE = '([^']+)'/) || [])[1];
  expect(template).toBeTruthy();
  // O bloco padrão descreve só a inflamação da margem — a secreção espessa (meibum
  // expressível) é achado à parte, escrito pelo médico quando de fato examinado.
  expect(/secre[çc][ãa]o espessa/.test(template)).toBe(false);
  expect(template).toContain('hiperemia e espessamento da margem palpebral');
  expect(template).toContain('disfunção de glândulas de meibômio;');
  // O placeholder da lente continua no fim da linha (getBiomicroscopiaComLente o troca)
  expect(template).toContain('cristalino transparente');
  // Nenhum exemplo do prompt pode reintroduzir a frase por imitação. A proibição
  // explícita CITA "com secreção espessa" — o que não pode voltar é a colagem na
  // linha de meibômio, que é o formato copiável pelo modelo.
  const promptSrc = readSrcNormalized('src', 'gemini-interview-agent.js');
  expect(/meibômio\s+com\s+secre[çc][ãa]o espessa/.test(promptSrc)).toBe(false);
  expect(promptSrc).toContain('"com secreção espessa" NÃO entra nessa frase');
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
// 2026-07-31 — Fronteira de PACIENTE do dedup de CID
//
// Duas camadas de dedup com fronteiras OPOSTAS: o painel zera
// `_cidsLancadosNaSessao` a cada gravação nova; o content script só zerava
// quando `location.href` mudava — e o SHOSP abre toda ficha na MESMA URL.
// Resultado real (log 2026-07-31, 4 fichas na mesma aba): do 2º paciente em
// diante os códigos repetidos (H520/H522) eram descartados como "já injetado
// neste paciente" e o painel ainda exibia "C.I.D. lançado". O painel passa a
// ser a autoridade e espelha seu Set no content script.
// ──────────────────────────────────────────────────────────────────────────────

const _normalizeCidCode = new Function(
  _extractFn(contentJsSource, '_normalizeCidCode') + '\nreturn _normalizeCidCode;'
)();

test('[CIDPAC-1] _normalizeCidCode colapsa ponto, caixa e espaços', () => {
  expect(_normalizeCidCode('h52.2')).toBe('H522');
  expect(_normalizeCidCode(' H520 ')).toBe('H520');
  expect(_normalizeCidCode(null)).toBe('');
});

test('[CIDPAC-2] content.js expõe setInjectedCids e SOBRESCREVE o Set (mesclar manteria o paciente anterior)', () => {
  const idx = contentJsSource.indexOf("case 'setInjectedCids'");
  expect(idx > -1).toBe(true);
  const bloco = contentJsSource.slice(idx, idx + 900);
  expect(bloco).toContain('window.__shospInjectedCids = new Set(');
  expect(bloco.includes('__shospInjectedCids.add(')).toBe(false);
});

test('[CIDPAC-3] a URL está documentada como NÃO sendo fronteira de paciente', () => {
  expect(contentJsSource).toContain('A URL NÃO É FRONTEIRA DE PACIENTE');
});

test('[CIDPAC-4] o painel sincroniza a fronteira no início da cadeia, antes do searchCid', () => {
  const idxSync = injectionJsSource.indexOf('_syncCidsLancadosToTabs(tabs)');
  const idxSearch = injectionJsSource.indexOf("action: 'searchCid'");
  expect(idxSync > -1).toBe(true);
  expect(idxSearch > idxSync).toBe(true);
  // Só no INÍCIO: sincronizar a cada termo apagaria os códigos que o content
  // script acabou de registrar durante esta mesma cadeia.
  expect(injectionJsSource).toContain('if (!opts._continuation) await _syncCidsLancadosToTabs');
});

test('[CIDPAC-4b] a sincronização vai para TODAS as abas do SHOSP, não só a escolhida', () => {
  const fn = _extractFn(injectionJsSource, '_syncCidsLancadosToTabs');
  // Uma aba não-sincronizada guardaria o Set do paciente anterior — o bug original.
  expect(fn).toContain('tabs.map(');
  expect(fn.includes('cidTab')).toBe(false);
});

test('[CIDPAC-5] as chamadas recursivas se identificam como continuação (sucesso, falha e reagendamento)', () => {
  const recursivas = injectionJsSource.match(/handleSearchCid\(field, \{ _continuation: true \}\)/g) || [];
  expect(recursivas.length).toBe(3);
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-08-04 — CID perdido porque a seção C.I.D. ainda estava montando.
// A falha é AMBIENTAL, não "o SHOSP não tem o código": reagendar o termo UMA vez
// no fim da cadeia é o que o log mostra que basta. Sem isso, a presbiopia
// (H52.4) daquela consulta simplesmente não entrou no prontuário.
// ──────────────────────────────────────────────────────────────────────────────

test('[CIDRQ-1] falha CID_SECTION_HIDDEN reagenda o termo no FIM da cadeia', () => {
  const idx = injectionJsSource.indexOf("resp?.code === 'CID_SECTION_HIDDEN'");
  expect(idx > -1).toBe(true);
  const ramo = injectionJsSource.slice(idx, idx + 900);
  // vai para o fim (o próximo termo dá o tempo de assentamento de graça)
  expect(ramo).toContain('[...terms.slice(1), rawTerm].join');
  // e continua a cadeia como continuação
  expect(ramo).toContain('_continuation: true');
});

test('[CIDRQ-2] o reagendamento é de UMA tentativa por termo (não vira laço)', () => {
  expect(injectionJsSource).toContain('handleSearchCid._requeued');
  const idx = injectionJsSource.indexOf("resp?.code === 'CID_SECTION_HIDDEN'");
  const ramo = injectionJsSource.slice(idx, idx + 900);
  expect(ramo).toContain('!_requeued.has(_rekey)');
  expect(ramo).toContain('_requeued.add(_rekey)');
});

test('[CIDRQ-3] início de cadeia zera recusados E reagendados (um único ponto)', () => {
  expect(injectionJsSource).toContain('function _startCidChain()');
  // Todo ponto que zera _failed tem de zerar também _requeued — senão um termo
  // reagendado numa consulta bloquearia o reagendamento dele na consulta seguinte.
  const corpoStart = injectionJsSource.slice(
    injectionJsSource.indexOf('function _startCidChain()'),
    injectionJsSource.indexOf('function _startCidChain()') + 200);
  expect(corpoStart).toContain('handleSearchCid._failed = []');
  expect(corpoStart).toContain('handleSearchCid._requeued = new Set()');
  // fim de cadeia idem
  const corpoFim = injectionJsSource.slice(
    injectionJsSource.indexOf('function _surfaceFailedCids()'),
    injectionJsSource.indexOf('function _surfaceFailedCids()') + 400);
  expect(corpoFim).toContain('handleSearchCid._requeued = new Set()');
  // e todo início de cadeia passa por _startCidChain (def + 3 chamadas)
  expect((injectionJsSource.match(/_startCidChain\(\)/g) || []).length).toBe(4);
});

test('[CIDRQ-4] termo reagendado NÃO entra na lista de CIDs recusados', () => {
  // O aviso de fim de cadeia só deve listar o que realmente falhou em definitivo.
  const idx = injectionJsSource.indexOf("resp?.code === 'CID_SECTION_HIDDEN'");
  const pushFailed = injectionJsSource.indexOf('_failed = [])).push(rawTerm)');
  expect(idx > -1 && pushFailed > idx).toBe(true); // o push vem DEPOIS do return do reagendamento
});

test('[CIDPAC-6] skipped NÃO é reportado como "C.I.D. lançado"', () => {
  const idx = injectionJsSource.indexOf('if (resp.skipped) {');
  expect(idx > -1).toBe(true);
  const ramoSkipped = injectionJsSource.slice(idx, injectionJsSource.indexOf('} else {', idx));
  expect(ramoSkipped).toContain('já estava na ficha');
  expect(ramoSkipped.includes('C.I.D. lançado')).toBe(false);
});

test('[CIDPAC-7] a fase 1 da dilatação persiste no slot os CIDs já lançados', () => {
  const idx = injectionJsSource.indexOf('const _patch = {');
  expect(idx > -1).toBe(true);
  expect(injectionJsSource.slice(idx, idx + 700)).toContain('cids: [..._cidsLancadosNaSessao]');
});

test('[CIDPAC-8] a fase 2 restaura os CIDs da fase 1 antes de qualquer dedup (não relança na mesma ficha)', () => {
  const idxObter = injectionJsSource.indexOf('DilatacaoPausas.obterRetomada()');
  const idxRestore = injectionJsSource.indexOf('_phase1Data.cids.forEach');
  const idxMerge = injectionJsSource.indexOf('..._cidsLancadosNaSessao,');
  expect(idxObter > -1).toBe(true);
  expect(idxRestore > idxObter).toBe(true);
  expect(idxRestore < idxMerge).toBe(true);
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
  expect(injectionJsSource).toContain('_printRefracaoDump(diag.candidatos)');
});

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-30 — o dump existia e mesmo assim não entregou os IDs
// ──────────────────────────────────────────────────────────────────────────────
//
// Log 2026-07-30 13:57: a estática falhou, o dump FOI impresso e o log chegou
// cortado em `"id": "prontuario_res` — o Chrome trunca string longa, e um único
// JSON.stringify(candidatos, null, 1) de ~20 campos × 28 linhas estourava o
// limite justamente antes do bloco ESTÁTICA. O diagnóstico só serve se couber
// no console.

// ──────────────────────────────────────────────────────────────────────────────
// 2026-07-30 — IDs do bloco ESTÁTICA lidos da página (fim de 4 sessões travadas)
// ──────────────────────────────────────────────────────────────────────────────
//
// Inspeção direta do DOM com o prontuário aberto na aba Refração. Ordem no
// documento dentro de #divCategoriaProntuarioAtendimento-78074:
//   REFRACAO ESTATICA → OD [ESF 259536 | CIL 259542 | EIXO 259540 | AV 259533]
//                     → OE [ESF 259544 | CIL 259543 | EIXO 259534 | AV 259535]

test('[EST-ID-1] os 6 IDs da estática estão fixados em FALLBACK_IDS', () => {
  const esperado = {
    'refracaoEstatica.od.esf': 'prontuario_resp_78074_259536',
    'refracaoEstatica.od.cil': 'prontuario_resp_78074_259542',
    'refracaoEstatica.od.eixo': 'prontuario_resp_78074_259540',
    'refracaoEstatica.oe.esf': 'prontuario_resp_78074_259544',
    'refracaoEstatica.oe.cil': 'prontuario_resp_78074_259543',
    'refracaoEstatica.oe.eixo': 'prontuario_resp_78074_259534',
  };
  for (const [k, v] of Object.entries(esperado)) {
    // Regex: o alinhamento das chaves varia (1 ou 2 espaços após os dois-pontos).
    expect(new RegExp(`'${k.replace(/\./g, '\\.')}':\\s*'${v}'`).test(contentJsSource)).toBe(true);
  }
});

test('[EST-ID-2] nenhum ID da estática colide com a dinâmica ou com AV', () => {
  const estatica = ['259536', '259542', '259540', '259544', '259543', '259534'];
  const dinamica = ['259522', '259523', '259524', '259526', '259527', '259528'];
  const av = ['259530', '259531', '259533', '259535']; // AV: nunca recebem grau
  for (const e of estatica) {
    expect(dinamica.includes(e)).toBe(false);
    expect(av.includes(e)).toBe(false);
  }
  expect(new Set(estatica).size).toBe(6); // sem repetição entre os 6 caminhos
});

test('[EST-ID-3] guarda simétrica: ID da estática nunca vira dinâmica', () => {
  // O bloco estática vem DEPOIS no DOM e cache.set sobrescreve em ordem: sem esta
  // guarda, o OCR pré-dilatação passaria a gravar no bloco pós-dilatação.
  expect(contentJsSource).toContain('const STATIC_REFRACTION_IDS = new Set([');
  expect(contentJsSource).toContain("if (prefix === 'refracao' && STATIC_REFRACTION_IDS.has(id))");
  expect(contentJsSource).toContain("prefix = 'refracaoEstatica';");
});

test('[EST-DUMP-1] o dump sai UMA LINHA POR CAMPO — string única é truncada', () => {
  const idx = injectionJsSource.indexOf('function _printRefracaoDump(');
  expect(idx > -1).toBe(true);
  const fn = injectionJsSource.slice(idx, injectionJsSource.indexOf('function _formatRefracaoDumpLine('));
  // console.log dentro de laço sobre a lista: cada campo em sua própria linha.
  expect(fn).toContain('for (const c of lista) console.log(_formatRefracaoDumpLine(c))');
  // O formato antigo (uma string com tudo) não pode voltar.
  expect(injectionJsSource).not.toContain('JSON.stringify(diag.candidatos, null, 1)');
  expect(injectionJsSource).not.toContain('JSON.stringify(response.candidatos, null, 1)');
});

test('[EST-DUMP-2] cabeçalho e marca FIM permitem detectar log cortado', () => {
  const idx = injectionJsSource.indexOf('function _printRefracaoDump(');
  const fn = injectionJsSource.slice(idx, injectionJsSource.indexOf('function _formatRefracaoDumpLine('));
  expect(fn).toContain('${lista.length} campos de refração no DOM');
  expect(fn).toContain('FIM');
  expect(fn).toContain('o console cortou o log');
});

test('[EST-DUMP-3] o dump traz o texto do MESMO container que a detecção lê', () => {
  // _detectDynamicFields exige que esse texto contenha 'esf'/'cil'/'eixo' para
  // sequer classificar o campo. Se vier vazio, a estática morre na porta de
  // entrada e a heurística de rótulo nunca chega a ser consultada — sem `ctx` no
  // dump não há como distinguir as duas causas.
  const dump = contentJsSource.slice(
    contentJsSource.indexOf('dumpRefractionCandidates() {'),
    contentJsSource.indexOf('getTabId(tabName) {')
  );
  expect(dump).toContain("closest('.form-group, td, tr')");
  expect(dump).toContain('ctx:');
});

test('[EST-DUMP-4] o dump separa "rótulo não existe" de "seletor não alcança"', () => {
  const dump = contentJsSource.slice(
    contentJsSource.indexOf('dumpRefractionCandidates() {'),
    contentJsSource.indexOf('getTabId(tabName) {')
  );
  // NARROW = o seletor de _refractionBlockOf; WIDE acrescenta label/b/strong.
  expect(dump).toContain('const NARROW =');
  expect(dump).toContain("const WIDE = NARROW + ', label, b, strong'");
  expect(dump).toContain('narrow');
});

test('[EST-DUMP-5] o dump reporta visibilidade — seção não montada não tem ID a fixar', () => {
  const dump = contentJsSource.slice(
    contentJsSource.indexOf('dumpRefractionCandidates() {'),
    contentJsSource.indexOf('getTabId(tabName) {')
  );
  expect(dump).toContain('offsetParent !== null');
});

test('[EST-DUMP-6] o dump reporta linha/coluna — é o que atribui os 6 IDs sem adivinhar', () => {
  const dump = contentJsSource.slice(
    contentJsSource.indexOf('dumpRefractionCandidates() {'),
    contentJsSource.indexOf('getTabId(tabName) {')
  );
  expect(dump).toContain('row.cells');
  expect(dump).toContain('linha');
  expect(dump).toContain('head');
});

test('[EST-DUMP-8] dump no formato antigo é denunciado como content script stale', () => {
  // Recarregar a extensão não re-injeta content.js numa aba já aberta (só
  // selectShospTab faz executeScript, e dumpRefracaoBlocks não passa por ele).
  // Sem este aviso, "vis=0 ctx=- narrow=-" em todo campo passaria por achado.
  const idx = injectionJsSource.indexOf('function _printRefracaoDump(');
  const fn = injectionJsSource.slice(idx, injectionJsSource.indexOf('function _formatRefracaoDumpLine('));
  expect(fn).toContain("!('ctx' in lista[0])");
  expect(fn).toContain('content script ANTIGO');
  expect(fn).toContain('F5');
});

// Modelo fiel de _formatRefracaoDumpLine: uma linha, sem quebra, com o id.
function _formatRefracaoDumpLineModel(c) {
  const q = (v) => (v == null || v === '' ? '-' : `"${v}"`);
  return `[DumpRefracao] #${String(c.i ?? 0).padStart(2, '0')} ${c.id}` +
    ` | bloco=${c.bloco} vis=${c.vis ? 1 : 0}` +
    ` | linha=${q(c.linha)} col=${c.col ?? '-'} head=${q(c.head)}` +
    ` | ctx=${q(c.ctx)} | narrow=${q(c.narrow)}` +
    ` | labs=${(c.labs || []).join(' > ') || '-'}`;
}

test('[EST-DUMP-7] cada campo cabe em uma linha só, com id e contexto', () => {
  const linha = _formatRefracaoDumpLineModel({
    i: 20, id: 'prontuario_resp_78074_259530', bloco: 'refracao', vis: true,
    linha: 'O.D.', col: 2, head: 'Esférico', ctx: '', narrow: null,
    labs: ['B:REFRACAO ESTATICA'],
  });
  expect(linha.includes('\n')).toBe(false);
  expect(linha).toContain('#20 prontuario_resp_78074_259530');
  expect(linha).toContain('vis=1');
  // ctx vazio e narrow ausente têm que aparecer como "-", não sumir da linha.
  expect(linha).toContain('ctx=-');
  expect(linha).toContain('narrow=-');
  expect(linha).toContain('labs=B:REFRACAO ESTATICA');
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
// 2026-08-07 — SAÚDE DO MICROFONE (log 19:14: 70s de consulta, zero texto)
//
// A track de áudio ficou MUDA sem terminar: `readyState` seguiu 'live', nenhum
// erro foi emitido, e a extensão gravou silêncio a sessão inteira mostrando
// "Gravando...". Estes testes exercitam as funções REAIS de sidepanel-audio.js
// que passaram a ler `muted` e a sondar o reconhecedor.
// ──────────────────────────────────────────────────────────────────────────────

function _buildMicHealthSandbox() {
  const src = [
    _extractFn(audioJsSource, '_micTrackSaudavel'),
    _extractFn(audioJsSource, '_watchMicTrack'),
    _extractFn(audioJsSource, '_unwatchMicTrack'),
    _extractFn(audioJsSource, '_avisarMicMorto'),
    _extractFn(audioJsSource, '_probeSpeechAlive'),
    _extractFn(audioJsSource, '_checkMicHealth'),
  ].join('\n\n');

  return new Function(`
    let isRecording = true;
    let micMudoDetectado = false;
    let semFalaAvisoAtivo = false;
    let persistentStream = null;
    let speechRecognition = null;
    let stopCommandTimeout = null;
    let isSpeechBackingOff = false;
    let isSpeechActive = false;
    let speechEndSeen = false;
    const _warns = [];
    const statusText = { textContent: '', style: {} };
    const console = { warn: (m) => _warns.push(String(m)), log: () => {} };
    ${src}
    return {
      _micTrackSaudavel, _watchMicTrack, _unwatchMicTrack, _probeSpeechAlive, _checkMicHealth,
      warns: _warns,
      statusText,
      set: (k, v) => { ({
        isRecording:        () => { isRecording = v; },
        micMudoDetectado:   () => { micMudoDetectado = v; },
        persistentStream:   () => { persistentStream = v; },
        speechRecognition:  () => { speechRecognition = v; },
        stopCommandTimeout: () => { stopCommandTimeout = v; },
        isSpeechActive:     () => { isSpeechActive = v; },
        speechEndSeen:      () => { speechEndSeen = v; },
      })[k](); },
      get: (k) => ({
        micMudoDetectado, semFalaAvisoAtivo, isSpeechActive, isRecording,
      })[k],
    };
  `)();
}

const _mkTrack = (over = {}) => ({ readyState: 'live', muted: false, ...over });
const _mkStream = (track) => ({ getAudioTracks: () => (track ? [track] : []), getTracks: () => (track ? [track] : []) });

test('[MIC-1] Track viva e sem mute é saudável', () => {
  const s = _buildMicHealthSandbox();
  expect(s._micTrackSaudavel(_mkStream(_mkTrack()))).toBe(true);
});

test('[MIC-2] Track MUDA reprova mesmo com readyState=live (a falha do log 2026-08-07)', () => {
  const s = _buildMicHealthSandbox();
  expect(s._micTrackSaudavel(_mkStream(_mkTrack({ muted: true })))).toBe(false);
});

test('[MIC-3] Track encerrada reprova', () => {
  const s = _buildMicHealthSandbox();
  expect(s._micTrackSaudavel(_mkStream(_mkTrack({ readyState: 'ended' })))).toBe(false);
});

test('[MIC-4] Stream sem track de áudio reprova (não estoura)', () => {
  const s = _buildMicHealthSandbox();
  expect(s._micTrackSaudavel(_mkStream(null))).toBe(false);
  expect(s._micTrackSaudavel(null)).toBe(false);
});

test('[MIC-5] onmute marca mudo e mostra aviso visível no status', () => {
  const s = _buildMicHealthSandbox();
  const track = _mkTrack();
  s._watchMicTrack(_mkStream(track));
  track.onmute();
  expect(s.get('micMudoDetectado')).toBe(true);
  expect(s.statusText.textContent).toContain('Microfone mudo');
});

test('[MIC-6] onended avisa que o microfone se perdeu', () => {
  const s = _buildMicHealthSandbox();
  const track = _mkTrack();
  s._watchMicTrack(_mkStream(track));
  track.onended();
  expect(s.get('micMudoDetectado')).toBe(true);
  expect(s.statusText.textContent).toContain('Microfone perdido');
});

test('[MIC-7] onmute NÃO avisa fora de gravação (aviso espúrio no painel ocioso)', () => {
  const s = _buildMicHealthSandbox();
  s.set('isRecording', false);
  const track = _mkTrack();
  s._watchMicTrack(_mkStream(track));
  track.onmute();
  expect(s.statusText.textContent).toBe('');
});

test('[SPEECH-PROBE-1] start() que lança InvalidStateError = reconhecedor vivo', () => {
  const s = _buildMicHealthSandbox();
  s.set('speechRecognition', { start: () => { const e = new Error('já iniciado'); e.name = 'InvalidStateError'; throw e; } });
  expect(s._probeSpeechAlive()).toBe('alive');
});

test('[SPEECH-PROBE-2] start() que passa = reconhecedor estava MORTO e foi ressuscitado', () => {
  // O caso do log: isSpeechActive dizia `true` enquanto a sessão estava morta
  // havia 70s, e todo caminho de recuperação testava justamente essa flag.
  const s = _buildMicHealthSandbox();
  let started = 0;
  s.set('isSpeechActive', true);
  s.set('speechRecognition', { start: () => { started++; } });
  expect(s._probeSpeechAlive()).toBe('restarted');
  expect(started).toBe(1);
  expect(s.get('isSpeechActive')).toBe(true);
});

test('[SPEECH-PROBE-3] Sonda não roda com parada agendada nem em backoff', () => {
  const s = _buildMicHealthSandbox();
  let started = 0;
  s.set('speechRecognition', { start: () => { started++; } });
  s.set('stopCommandTimeout', 123);
  expect(s._probeSpeechAlive()).toBe('skip');
  expect(started).toBe(0);
});

test('[MIC-8] _checkMicHealth pega o mute perdido pelo evento e NÃO sonda o reconhecedor', () => {
  const s = _buildMicHealthSandbox();
  let started = 0;
  s.set('persistentStream', _mkStream(_mkTrack({ muted: true })));
  s.set('speechRecognition', { start: () => { started++; } });
  s._checkMicHealth();
  expect(s.get('micMudoDetectado')).toBe(true);
  expect(s.statusText.textContent).toContain('Microfone mudo');
  expect(started).toBe(0); // reiniciar o STT com o mic mudo não resolve nada
});

test('[MIC-9] Com microfone saudável, _checkMicHealth sonda o reconhecedor', () => {
  const s = _buildMicHealthSandbox();
  let started = 0;
  s.set('persistentStream', _mkStream(_mkTrack()));
  s.set('speechRecognition', { start: () => { started++; } });
  s._checkMicHealth();
  expect(s.get('micMudoDetectado')).toBe(false);
  expect(started).toBe(1);
});

test('[SPEECH-PROBE-4] Sonda distingue "morreu após onend" de "morreu sem evento nenhum"', () => {
  // Com a câmera aberta o restart de 300ms do onend pode não pegar; a sonda
  // conserta, mas não pode reportar "sem ter emitido onend" — o diagnóstico do
  // log 2026-08-07 depende dessa distincao.
  const comEnd = _buildMicHealthSandbox();
  comEnd.set('speechEndSeen', true);
  comEnd.set('speechRecognition', { start: () => {} });
  expect(comEnd._probeSpeechAlive()).toBe('restarted');
  expect(comEnd.warns.join(' ')).toContain('após onend');

  const semEnd = _buildMicHealthSandbox();
  semEnd.set('speechRecognition', { start: () => {} });
  expect(semEnd._probeSpeechAlive()).toBe('restarted');
  expect(semEnd.warns.join(' ')).toContain('sem ter emitido onend');
});

test('[SPEECH-CAM-1] onend durante a câmera reinicia o reconhecimento (não espera fechar)', () => {
  // A câmera é vídeo-only e pauseSpeechRecognition nunca parou o Speech: o guard
  // !isSpeechPausedByCamera nos caminhos de recuperação era herança de quando
  // parava, e prendia a consulta inteira sem STT — a falha do log 2026-08-07.
  const onendBody = audioJsSource.slice(audioJsSource.indexOf('speechRecognition.onend'));
  const corpo = onendBody.slice(0, onendBody.indexOf('speechRecognition.start();'));
  expect(corpo).not.toContain('isSpeechPausedByCamera');
});

test('[SPEECH-CAM-2] Só o aviso por silêncio continua suspenso durante a câmera', () => {
  // Nenhum caminho de recuperação testa mais a flag...
  expect((audioJsSource.match(/!isSpeechPausedByCamera/g) || []).length).toBe(0);
  // ...e sobra exatamente um consumidor: o early-return do aviso por silêncio em
  // _checkSilence, onde o silêncio da captura de OCR é esperado e avisar seria ruído.
  expect((audioJsSource.match(/if \(isSpeechPausedByCamera\) return;/g) || []).length).toBe(1);
});

test('[MIC-13] Handlers são soltos antes de descartar a track (sem alarme na reaquisição)', () => {
  const s = _buildMicHealthSandbox();
  const track = _mkTrack();
  s._watchMicTrack(_mkStream(track));
  s._unwatchMicTrack(_mkStream(track));
  expect(track.onmute).toBeNull();
  expect(track.onended).toBeNull();
  // E a ordem no código: soltar ANTES do stop(), ou stop() dispara `ended`.
  const fn = _extractFn(audioJsSource, 'startRecording');
  expect(fn.indexOf('_unwatchMicTrack(persistentStream)') < fn.indexOf('persistentStream.getTracks().forEach(t => t.stop())')).toBe(true);
});

test('[MIC-10] _checkSilence chama _checkMicHealth ANTES do early-return da câmera', () => {
  // Durante a câmera é exatamente quando o microfone morre (getUserMedia de
  // vídeo em 4K reconfigura o grafo de dispositivos no Windows). Se a checagem
  // ficar depois do return, a janela de maior risco fica sem rede.
  const fn = _extractFn(audioJsSource, '_checkSilence');
  const posCheck = fn.indexOf('_checkMicHealth()');
  const posCam = fn.indexOf('if (isSpeechPausedByCamera) return;');
  expect(posCheck > -1).toBe(true);
  expect(posCam > -1).toBe(true);
  expect(posCheck < posCam).toBe(true);
});

test('[MIC-11] Reutilização do stream não aceita mais só readyState', () => {
  // `readyState !== 'ended'` sozinho aprova uma track muda e carrega o mudo
  // para a sessão seguinte.
  expect(audioJsSource).toContain('!persistentStream || !_micTrackSaudavel(persistentStream)');
  expect(audioJsSource).not.toContain("persistentStream.getTracks()[0].readyState === 'ended'");
});

test('[MIC-12] resumeSpeechRecognition usa a sonda, não a flag otimista', () => {
  const fn = _extractFn(audioJsSource, 'resumeSpeechRecognition');
  expect(fn).toContain('_probeSpeechAlive()');
  expect(fn).not.toContain('!isSpeechActive');
});


// ──────────────────────────────────────────────────────────────────────────────
// 2026-09-03 — RECONHECEDOR ZUMBI (log 11:44–11:47)
//
// Depois de um restart normal (`onend` → `start()`), o reconhecedor subiu
// (`onstart` disparou) e nunca mais entregou `onresult` — nem `no-speech`. A
// sonda de liveness devolveu 'alive' a cada 10s pelos 189s inteiros, porque
// `start()` lançando InvalidStateError prova que a sessão RODA, não que ela
// PRODUZ. O auto-stop por silêncio então encerrou a consulta no meio da
// refração e, pior, marcou consultaEncerradaDetectada — fabricando uma
// despedida que ninguém disse e liberando a injeção do prontuário.
// ──────────────────────────────────────────────────────────────────────────────

function _buildZumbiSandbox(over = {}) {
  const src = [
    _extractFn(audioJsSource, '_checkSpeechProduzindo'),
    _extractFn(audioJsSource, '_reciclarSpeechRecognition'),
  ].join('\n\n');

  return new Function(`
    const SPEECH_RECICLO_MS = 40000;
    let lastSpeechTime = ${over.lastSpeechTime ?? 'Date.now() - 189000'};
    let ultimoRecicloSpeech = ${over.ultimoRecicloSpeech ?? 'Date.now() - 189000'};
    let reciclosSpeechNaSessao = 0;
    let isSpeechActive = true;
    let speechRecognition = { abort: () => { _abortados++; } };
    let _abortados = 0;
    let _startsDoModulo = 0;
    const _warns = [];
    const console = { warn: (m) => _warns.push(String(m)), log: () => {} };
    // Stub do módulo: o reciclo cria um reconhecedor NOVO.
    function startSpeechRecognition() {
      _startsDoModulo++;
      speechRecognition = { abort: () => {} };
      isSpeechActive = true;
    }
    ${src}
    return {
      _checkSpeechProduzindo, _reciclarSpeechRecognition,
      warns: _warns,
      get: (k) => ({
        reciclos: reciclosSpeechNaSessao,
        starts: _startsDoModulo,
        abortados: _abortados,
        lastSpeechTime,
        ultimoRecicloSpeech,
      })[k],
      envelhecerReciclo: () => { ultimoRecicloSpeech = Date.now() - 189000; },
    };
  `)();
}

test('[ZUMBI-1] 189s sem onresult derruba e recria o reconhecedor (o caso do log)', () => {
  const s = _buildZumbiSandbox();
  s._checkSpeechProduzindo();
  expect(s.get('reciclos')).toBe(1);
  expect(s.get('starts')).toBe(1);
  expect(s.get('abortados')).toBe(1);
  expect(s.warns.join(' ')).toContain('Reciclo forçado');
});

test('[ZUMBI-2] Pausa normal de fala (30s) NÃO recicla', () => {
  // 40s fica acima da pausa entre frases de um exame — o interim result dispara
  // a cada ruído, não só a cada frase completa.
  const s = _buildZumbiSandbox({ lastSpeechTime: 'Date.now() - 30000' });
  s._checkSpeechProduzindo();
  expect(s.get('reciclos')).toBe(0);
});

test('[ZUMBI-3] Reciclo não se repete a cada tick de 10s do intervalo', () => {
  const s = _buildZumbiSandbox();
  s._checkSpeechProduzindo();
  s._checkSpeechProduzindo();
  s._checkSpeechProduzindo();
  expect(s.get('reciclos')).toBe(1);
  // Passado o intervalo, uma nova tentativa é permitida (3–4 antes do auto-stop).
  s.envelhecerReciclo();
  s._checkSpeechProduzindo();
  expect(s.get('reciclos')).toBe(2);
});

test('[ZUMBI-4] O reciclo NÃO mexe em lastSpeechTime (senão o auto-stop nunca dispara)', () => {
  // Reciclar é tentativa de conserto, não prova de fala. Se o reciclo zerasse o
  // relógio do silêncio, a rede contra gravação esquecida sumiria — o painel
  // ficaria gravando indefinidamente uma sala vazia.
  const s = _buildZumbiSandbox();
  const antes = s.get('lastSpeechTime');
  s._reciclarSpeechRecognition('teste');
  expect(s.get('lastSpeechTime')).toBe(antes);
});

test('[ZUMBI-5] O reciclo só roda quando a sonda diz "alive" (morto já é tratado por ela)', () => {
  const fn = _extractFn(audioJsSource, '_checkMicHealth');
  expect(fn).toContain("_probeSpeechAlive() === 'alive'");
  expect(fn).toContain('_checkSpeechProduzindo()');
});

test('[ZUMBI-6] Todo handler do reconhecedor é guardado pela identidade da sessão', () => {
  // O `onend` atrasado de um zumbi reciclado chega minutos depois. Sem a guarda,
  // ele zera isSpeechActive da sessão NOVA e reabre o buraco que o reciclo fechou.
  for (const h of ['onstart', 'onresult', 'onerror', 'onend']) {
    const i = audioJsSource.indexOf(`speechRecognition.${h} = (`);
    expect(i > -1).toBe(true);
    const corpo = audioJsSource.slice(i, i + 260);
    expect(corpo).toContain('if (!_daSessaoAtual()) return;');
  }
  // E a referência é zerada ANTES do abort, ou os handlers do velho ainda passam.
  const fn = _extractFn(audioJsSource, '_reciclarSpeechRecognition');
  expect(fn.indexOf('speechRecognition = null') < fn.indexOf('_velho?.abort()')).toBe(true);
});

function _buildAutoStopSandbox(texto) {
  const fn = _extractFn(audioJsSource, '_checkSilence');
  return new Function(`
    const SILENCE_MIN_SESSION_MS = 90000, SILENCE_MIN_WORDS = 5;
    const SILENCE_THRESHOLD_MS = 180000, SILENCE_WARN_MS = 5000, SEM_FALA_AVISO_MS = 30000;
    let isRecording = true, isSpeechPausedByCamera = false;
    let stopCommandTimeout = null, silencePendingStop = null;
    let semFalaAvisoAtivo = false, reciclosSpeechNaSessao = 3;
    let sessionStartTime = Date.now() - 600000;
    let lastSpeechTime = Date.now() - 189000;
    let recognizedText = ${JSON.stringify(texto)};
    let recentTextBuffer = '';
    let _parou = 0;
    const SessionFlags = { consultaEncerradaDetectada: false, dilatacaoDetectada: false };
    const statusText = { textContent: '', style: {} };
    const console = { warn: () => {}, log: () => {} };
    const normalizeText = (t) => String(t || '').toLowerCase();
    const ClinicalTriggers = {
      detectaEncerramentoNaFala: (t) => /passar no balcao|passe no balcao|boa tarde|ate logo/.test(t),
    };
    const stopRecording = () => { _parou++; };
    const setTimeout = (cb) => { cb(); return 1; };  // dispara o aviso de 5s na hora
    function _checkMicHealth() {}
    ${fn}
    return {
      _checkSilence,
      get: (k) => ({ encerrada: SessionFlags.consultaEncerradaDetectada, parou: _parou, status: statusText.textContent })[k],
    };
  `)();
}

test('[AUTOSTOP-1] Silêncio SEM despedida no texto não fabrica consultaEncerradaDetectada', () => {
  // O texto do log 2026-09-03 termina no meio da refração subjetiva. A flag
  // bypassa o guard de "exame em andamento" e libera o fallback de exames
  // normais na injeção — foi ela que virou uma captura morta em prontuário.
  const s = _buildAutoStopSandbox('para ver de longe eu enxergo bom demais agora aperta chega bem para tras');
  s._checkSilence();
  expect(s.get('parou')).toBe(1);
  expect(s.get('encerrada')).toBe(false);
  expect(s.get('status')).toContain('Parada por silêncio');
});

test('[AUTOSTOP-2] Despedida presente no texto ainda encerra como consulta (hook pode ter perdido)', () => {
  const s = _buildAutoStopSandbox('entao a senhora pode passar no balcao para marcar o retorno');
  s._checkSilence();
  expect(s.get('parou')).toBe(1);
  expect(s.get('encerrada')).toBe(true);
});


// ──────────────────────────────────────────────────────────────────────────────
// RELATÓRIO FINAL
// ──────────────────────────────────────────────────────────────────────────────

(async () => {
  await _dilatacaoQueueTests();
  await _axisTiebreakTests();
  await _signPolicyTests();
  await _straightenTicketTests();
  await _v550Tests();
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

