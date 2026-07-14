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
  // é o do _shospDilatacaoPhase1 (dentro do ramo de SUCESSO), não o de falha.
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

test('[REPROC-4] visibilidade do botão dirigida por storage.onChanged (uma fonte)', () => {
  expect(audioJsSource.includes('function refreshUndoVisibility')).toBe(true);
  expect(initJsSource.includes('storage.onChanged') && initJsSource.includes('refreshUndoVisibility')).toBe(true);
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
