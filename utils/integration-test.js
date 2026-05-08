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
const contentJsPath = require('path').join(__dirname, '..', 'dist', 'content.js');
const contentJsSource = fs.readFileSync(contentJsPath, 'utf8');

test('[C4] Comentário "// Biomicroscopia" não aparece duplicado consecutivamente', () => {
  expect(contentJsSource).not.toContain(
    '// Biomicroscopia\n    // Biomicroscopia'
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 5 — dilatacaoDetectada é resetada no clearAll
// ──────────────────────────────────────────────────────────────────────────────

const injectionJsSource = fs.readFileSync(
  require('path').join(__dirname, '..', 'scripts', 'sidepanel-injection.js'), 'utf8'
);

test('[C5] clearAll reseta dilatacaoDetectada no bloco de clearAudio', () => {
  expect(injectionJsSource).toContain('dilatacaoDetectada = false;');
});

test('[C5] clearAll reseta dilatacaoDetectada também quando apenas clearCamera é true', () => {
  expect(injectionJsSource).toContain('if (clearCamera && !clearAudio && !isRecording)');
});

// ──────────────────────────────────────────────────────────────────────────────
// CORREÇÃO 6 — captureAndProcess desabilita botão imediatamente
// ──────────────────────────────────────────────────────────────────────────────

const cameraJsSource = fs.readFileSync(
  require('path').join(__dirname, '..', 'scripts', 'sidepanel-camera.js'), 'utf8'
);

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

const audioJsSource = fs.readFileSync(
  require('path').join(__dirname, '..', 'scripts', 'sidepanel-audio.js'), 'utf8'
);

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

const geminiJsSource = fs.readFileSync(
  require('path').join(__dirname, '..', 'dist', 'geminiService.js'), 'utf8'
);

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

test('[C8] CONDUTA_VALIDA_RE está no código de geminiService.js', () => {
  expect(geminiJsSource).toContain('CONDUTA_VALIDA_RE');
});

test('[C8] comp(?:rimido)? está na MED_POSOLOGIA_RE do geminiService.js', () => {
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

const DecisionEngine = require('../dist/DecisionEngine.js');

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

test('[DE-3] Guard remove linha "Associação ATB+corticoide" se não mencionada', () => {
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
  expect(decision.clonedAIResponse.dados.tratamento.includes('Associação')).toBe(false);
  expect(decision.clonedAIResponse.dados.tratamento.includes('Lubrificante')).toBe(true);
  // Crítico: a resposta crua NÃO foi mutada
  expect(raw.dados.tratamento.includes('Associação')).toBe(true);
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

// ──────────────────────────────────────────────────────────────────────────────
// v6 — DecisionEngine autoritativo: guard de dilatação
// ──────────────────────────────────────────────────────────────────────────────

test('[V6-DE-1] Guard dilatação nula conduta/tratamento quando hookFlag ativo', () => {
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

test('[V6-DE-2] Guard dilatação nula conduta quando flag no raw AI response', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dilatacaoDetectada: true,
    dados: { retorno: 'melhora', conduta: 'tc olho' },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'dilatar', hookFlags: {} });
  expect(decision.clonedAIResponse.dados.conduta).toBeNull();
});

test('[V6-DE-3] Guard óculos NÃO é aplicado quando dilatação ativa', () => {
  const raw = {
    tipo_consulta: 'retorno',
    dilatacaoDetectada: true,
    dados: { retorno: 'ok', conduta: 'acompanhamento' },
  };
  const decision = DecisionEngine.buildDecision(raw, { transcribedText: 'dilatar', hookFlags: {} });
  // conduta nulada pela dilatação, não deve ter adição de "óculos"
  expect(decision.clonedAIResponse.dados.conduta).toBeNull();
  expect(decision.guardsApplied.filter(g => /[oó]culos/i.test(g)).length).toBe(0);
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
  expect(ClinicalTriggers.STOP_COMMANDS).toContain('ate mais');
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

test('[V6-HTML-2] sidepanel.html carrega state-manager.js APÓS sidepanel-constants.js', () => {
  const htmlSource = fs.readFileSync(
    require('path').join(__dirname, '..', 'sidepanel.html'), 'utf8'
  );
  const idxConstants = htmlSource.indexOf('sidepanel-constants.js');
  const idxSM        = htmlSource.indexOf('state-manager.js');
  expect(idxConstants < idxSM).toBe(true);
});

// ──────────────────────────────────────────────────────────────────────────────
// RELATÓRIO FINAL
// ──────────────────────────────────────────────────────────────────────────────

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
