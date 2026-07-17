/**
 * ============================================================================
 * SIDEPANEL — ESTADO GLOBAL, CONSTANTES E REFERÊNCIAS DOM
 * ============================================================================
 * Carregado após config/clinical-triggers.js (que define normalizeText e
 * todos os arrays de gatilhos de voz). Este arquivo define apenas:
 *   - Variáveis de estado da sessão (let) e o registro canônico
 *     SESSION_FLAG_DEFAULTS + armazenamento único SessionFlags
 *   - STATE BRIDGE (__shospState — getters de flags gerados do registro)
 *   - Textos-padrão clínicos (BIOMICROSCOPIA_NORMAL, etc.)
 *   - Função auxiliar getBiomicroscopiaComLente()
 *   - Referências DOM
 *
 * Os arrays STOP_COMMANDS, DILATACAO_COMMANDS, EXAMES_NORMAIS_COMMANDS,
 * EXAME_BLEFARITE_COMMANDS, CATARATA_COMMANDS, LIO_COMMANDS,
 * OPACIDADE_CAPSULA_COMMANDS e OLHO_IRRITADO_COMMANDS estão em:
 *   config/clinical-triggers.js
 *
 * normalizeText() também está em config/clinical-triggers.js.
 */

// ============================================================================
// ESTADO DA APLICAÇÃO
// ============================================================================

let currentMode = 'audio';
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let timerInterval = null;
let seconds = 0;
let permissionChecked = false;
let cameraPermissionChecked = false;

// Dados cumulativos
let audioData = null;
let cameraData = null;

// Controle de injeção duplicada
let audioDataInjected = false;
let cameraDataInjected = false;

// Confirmação pendente para refração suspeita (OD=OE)
let pendingRefractionConfirmation = false;

// Web Speech API
let speechRecognition = null;
let recognizedText = '';
let isModeSwitching = false;
let noSpeechCount = 0; // contador de erros no-speech consecutivos (backoff)
let isSpeechPausedByCamera = false;
let isSpeechActive = false;
let isSpeechBackingOff = false;
let speechRecoveryTimer = null;


// Stream de áudio persistente
let persistentStream = null;

// Estado da câmera
let cameraStream = null;
let captureInterval = null;
let captureTimeout = null;

// ============================================================================
// REGISTRO CANÔNICO DAS FLAGS DE SESSÃO (resetadas a cada gravação)
// ============================================================================
// Fonte única da verdade sobre QUAIS flags de detecção existem e seus valores
// iniciais. As camadas de acesso (SessionFlags, StateManager, HOOK_STATE,
// __shospState e o _BRIDGE dos testes) são GERADAS a partir destas chaves —
// para adicionar uma flag nova, basta registrá-la aqui.
//
// Notas por flag:
//   catarataGrau — "inicial" | "incipiente" | "moderada" | "avançada" | null
//   despedidaNaSessao — sticky: uma despedida/encerramento já foi DETECTADA
//     nesta sessão (mesmo que bloqueada pelo gate ou cancelada). Diferente de
//     consultaEncerradaDetectada, NÃO é limpa no cancelamento — persiste até o
//     resetSession. Usada para suprimir a dilatação depois que o médico já
//     sinalizou fim de consulta (evita hijack de consulta encerrada quando o
//     "vamos dilatar" se refere a outra pessoa).
//   fase2DilatacaoAtiva — havia uma pausa de dilatação persistida
//     (_shospDilatacaoPhase1) quando esta gravação começou — ou seja, esta
//     sessão é o RETORNO do paciente. Suprime o hook de dilatação por voz:
//     frases retrospectivas inevitáveis no retorno ("já dilatou", "pinguei o
//     colírio para dilatar a pupila") re-disparavam a pausa e a consulta nunca
//     fechava. Setada em startRecording() a partir do storage (exceto
//     motivo='exame'); os fallbacks pós-parada varrem só a cauda nesta fase.
const SESSION_FLAG_DEFAULTS = Object.freeze({
  examesNormaisInjetados: false,
  blefariteInjetada: false,
  receitaOlhoIrritadoInjetada: false,
  catarataDetectada: false,
  catarataGrau: null,
  lioDetectada: false,
  opacidadeCapsulaDetectada: false,
  lenteLimpaDetectada: false,
  dilatacaoDetectada: false,
  fundoscopiaDetectada: false,
  consultaEncerradaDetectada: false,
  despedidaNaSessao: false,
  fase2DilatacaoAtiva: false,
});

// Armazenamento ÚNICO das flags de sessão. Sealed: escrever numa chave fora do
// registro falha (em vez de criar propriedade nova silenciosamente).
// Todo acesso é explícito: SessionFlags.<flag> nos módulos, ou via
// StateManager.set/getHookFlag e HOOK_STATE (hooks).
const SessionFlags = Object.seal({ ...SESSION_FLAG_DEFAULTS });

// Cooldown unificado e debounce de parada
let lastTriggerTime = 0;
let stopCommandTimeout = null;
// Metadados do stop agendado: { hookId, cmd, endAnchored, onCancel }.
// Usado pelo runner para CANCELAR stops de frases curtas (endAnchored) caso
// a fala continue depois da despedida ("tá bom então... vamos medir a pressão").
let stopPendingInfo = null;
// Âncora do gate de captura (condicionante de encerramento): posição no texto
// normalizado até onde despedidas já foram BLOQUEADAS por falta de conduta/
// tratamento ditados. Só uma despedida dita APÓS esta posição pode encerrar
// a consulta — sem isso, a despedida antiga que ficou no transcript pararia
// a gravação no meio do ditado da prescrição. Ver _stopGateBlocks no runner.
let stopGateOffset = 0;
// Válvula de escape do gate: nº de despedidas DISTINTAS já bloqueadas por
// falta de conduta/tratamento nesta sessão. A partir da 2ª despedida distinta
// sem captura o gate LIBERA o encerramento — casos reais (2026-07-03/06/07)
// mostraram que despedida repetida sem captura indica marcador de conduta
// faltando (falso bloqueio), não conduta faltando. Ver _stopGateBlocks.
let stopGateBlockCount = 0;

// Auto-stop por silêncio prolongado (consultas que terminam sem despedida detectável)
let lastSpeechTime = 0;
let silenceCheckInterval = null;
let silencePendingStop = null;
let semFalaAvisoAtivo = false; // aviso "sem fala há Xs" ativo no status (mic morto)

// Buffer de texto recente — persiste entre restarts do Speech API
// (sem isso, o hook de stop perde o trigger se o Speech reiniciar no momento exato)
let recentTextBuffer = '';
let recentTextTimeout = null;

// ============================================================================
// STATE BRIDGE v5.1 (introspecção / debug)
// ============================================================================
// Refatoração estrutural completa do estado fica para v6. Em v5.1 expomos um
// objeto-fachada SOMENTE LEITURA via getters que espelha as 30+ variáveis
// globais já definidas neste arquivo. Permite:
//   - inspecionar o estado por window.__shospState (DevTools)
//   - construir telemetria sem tocar nas variáveis individuais
//   - migração futura: o caller pode adotar __shospState e a substituição
//     interna por StateManager não quebra a API.
// As variáveis continuam sendo a fonte da verdade — este bridge não as
// substitui nem altera comportamento clínico.
const _stateBridge = {
  get currentMode()                  { return currentMode; },
  get isRecording()                  { return isRecording; },
  get permissionChecked()            { return permissionChecked; },
  get cameraPermissionChecked()      { return cameraPermissionChecked; },
  get audioData()                    { return audioData; },
  get cameraData()                   { return cameraData; },
  get audioDataInjected()            { return audioDataInjected; },
  get cameraDataInjected()           { return cameraDataInjected; },
  get pendingRefractionConfirmation(){ return pendingRefractionConfirmation; },
  get recognizedText()               { return recognizedText; },
  get noSpeechCount()                { return noSpeechCount; },
  get isSpeechPausedByCamera()       { return isSpeechPausedByCamera; },
  get isSpeechActive()               { return isSpeechActive; },
  get lastTriggerTime()              { return lastTriggerTime; },
  get hasStopScheduled()             { return stopCommandTimeout !== null; },
  get stopGateOffset()               { return stopGateOffset; },
  get stopGateBlockCount()           { return stopGateBlockCount; },
  get recentTextBufferLength()       { return recentTextBuffer.length; },
  // Snapshot serializável para logs (sem referências a timers ou DOM).
  // As flags são geradas de SESSION_FLAG_DEFAULTS (loop abaixo) — cobertura
  // garantida por construção e verificada pelos testes [FLAGS-*].
  snapshot() {
    const flags = {};
    for (const name of Object.keys(SESSION_FLAG_DEFAULTS)) flags[name] = this[name];
    return {
      currentMode, isRecording,
      hasAudioData: audioData !== null,
      hasCameraData: cameraData !== null,
      audioDataInjected, cameraDataInjected,
      isSpeechPausedByCamera, isSpeechActive,
      flags,
      hasStopScheduled: stopCommandTimeout !== null,
      recognizedTextLength: recognizedText.length,
    };
  },
};
// Getters das flags de sessão — gerados do registro canônico.
for (const _flagName of Object.keys(SESSION_FLAG_DEFAULTS)) {
  Object.defineProperty(_stateBridge, _flagName, {
    get: () => SessionFlags[_flagName],
    enumerable: true,
  });
}
window.__shospState = Object.freeze(_stateBridge);

// Arrays de gatilhos clínicos definidos em config/clinical-triggers.js
// normalizeText() também em config/clinical-triggers.js

// ============================================================================
// CONSTANTES — TEXTOS PADRÃO
// ============================================================================

const BIOMICROSCOPIA_NORMAL = 'AO: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente';
const FUNDOSCOPIA_NORMAL = 'FUNDOSCOPIA INDIRETA: AO retina aplicada, mácula em bom aspecto, sem alteração do padrão vascular, escavação simétrica e fisiológica';
const BIOMICROSCOPIA_BLEFARITE = 'AO: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio com secreção espessa; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente';

// Conduta e tratamento padrão para blefarite (auto-preenchidos quando injectBlefarite = true)
const BLEFARITE_CONDUTA_PADRAO = 'Compressa morna por 2 min antes da higiene palpebral — 2x/dia\nHigiene palpebral com shampoo infantil (espuma na base dos cílios, ~20x, enxaguar) — 3x/dia';
const BLEFARITE_TRATAMENTO_PADRAO = 'Associação (ATB + corticoide ocular) 1 gota 3x/dia após higiene palpebral\nLubrificante ocular 1 gota em cada olho ao longo do dia\nÔmega 3 (EPA+DHA) 1000 mg — 1 comprimido no almoço e 1 no jantar por 30 dias';

const LENTE_CATARATA = 'catarata';
const LENTE_LIO = 'pseudofacia, LIO transparente e bem posicionada';
const LENTE_OPACIDADE_CAPSULA = 'pseudofacia, opacidade de cápsula posterior';

const RECEITA_OLHO_IRRITADO = `USO OCULAR

1 - Carmelose Sódica 5ml/mg                                      1 frasco

Pingar uma gota em cada olho até 8 vezes por dia.

USO EXTERNO

1 - Compressas de água morna por DOIS minutos antes da massagem com xampu.

2 - Xampu infantil                                                           1 frasco

Fazer espuma na palma da mão. Massagear a base dos cílios com a espuma cerca de vinte vezes, cuidando para que o xampu não entre em contato com o olho. Enxaguar bem em seguida. Repetir o processo outra vez.

Realizar este procedimento 3 vezes ao dia.


USO ORAL

1 - Ômega 3 (EPA+DHA) 1000 mg                                     1 caixa

Tomar um comprimido no almoço e um no jantar por 30 dias.`;

// ============================================================================
// CONSTANTES — CÂMERA
// ============================================================================

const MAX_TIME = 15000;

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Retorna biomicroscopia com lente dinâmica baseada nas flags de detecção.
 * Prioridade: opacidade cápsula > LIO > catarata > padrão (cristalino transparente)
 */
function getBiomicroscopiaComLente(baseText) {
  if (SessionFlags.opacidadeCapsulaDetectada) return baseText.replaceAll('cristalino transparente', LENTE_OPACIDADE_CAPSULA);
  // LIO tem prioridade sobre catarata: pseudofacia confirmada significa que o cristalino
  // natural já foi removido — não pode haver catarata nesse olho. Se ambas as flags
  // dispararam, a menção de catarata é histórica ("antes da cirurgia tinha catarata") e a
  // LIO (LIO_COMMANDS já não cobre cirurgia futura) é o achado definitivo. Ver Caso 7.
  if (SessionFlags.lioDetectada) return baseText.replaceAll('cristalino transparente', LENTE_LIO);
  if (SessionFlags.catarataDetectada) {
    const lente = SessionFlags.catarataGrau ? `catarata ${SessionFlags.catarataGrau}` : LENTE_CATARATA;
    return baseText.replaceAll('cristalino transparente', lente);
  }
  return baseText;
}

/**
 * Deriva presença e grau de catarata a partir do texto do diagnóstico do LLM.
 *
 * O cristalino dinâmico (getBiomicroscopiaComLente) depende da flag catarataDetectada,
 * ligada APENAS pelos gatilhos de voz (CATARATA_COMMANDS). Quando o reconhecimento de
 * voz embaralha a fala do médico ("catarata" não é transcrito de forma limpa), o gatilho
 * não dispara, mas o Gemini ainda diagnostica catarata e injeta o CID H25.x — e a
 * biomicroscopia sairia com "cristalino transparente", contradizendo o diagnóstico.
 * sidepanel-injection.js usa esta função para reconciliar a flag pelo próprio diagnóstico.
 *
 * Função PURA (sem efeitos colaterais) para ser testável. Retorna { detected, grau }.
 *
 * NÃO considera catarata secundária / opacidade de cápsula posterior (H26.4): esse achado
 * é de olho pseudofácico e tem lente própria (LENTE_OPACIDADE_CAPSULA), não "catarata".
 *
 * NÃO considera menção HISTÓRICA de catarata já operada — ex.: "Ambliopia OD
 * (pós-cirurgia de catarata traumática)". Os trechos de contexto cirúrgico são
 * removidos antes da detecção; um diagnóstico real de catarata sobrevive por CID
 * (H25.x / H26.0–3) ou pela palavra fora do contexto cirúrgico ("Catarata senil AO").
 */
function parseCatarataFromDiagnostico(diagnostico) {
  const vazio = { detected: false, grau: null };
  if (!diagnostico) return vazio;

  const norm = diagnostico.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Remove menções históricas (cirurgia já realizada) para que a palavra "catarata"
  // dentro delas não conte como achado ativo. CIDs não aparecem nesses trechos,
  // então a detecção por H25/H26 não é afetada.
  const semHistorico = norm
    .replace(/cirurgia\s+de\s+catarata/g, ' ')
    .replace(/operad[ao]s?\s+de\s+catarata/g, ' ')
    .replace(/facectomia/g, ' ');

  // Exclui catarata secundária / opacidade de cápsula posterior (olho pseudofácico).
  const secundaria =
    /catarata\s+secundaria/.test(semHistorico) ||
    /\bh26\.?4\b/.test(semHistorico) ||
    /capsula\s+posterior/.test(semHistorico);
  if (secundaria) return vazio;

  // Catarata "real" (olho fácico): CID H25.x (senil) ou H26.0–3 (outras cataratas),
  // ou a palavra "catarata" em texto puro.
  const detected =
    /\bh25\.?\d/.test(semHistorico) ||
    /\bh26\.?[0-3]\b/.test(semHistorico) ||
    /\bcatarata\b/.test(semHistorico);
  if (!detected) return vazio;

  let grau = null;
  if (/incipiente/.test(semHistorico)) grau = 'incipiente';
  else if (/inicial/.test(semHistorico)) grau = 'inicial';
  else if (/moderada/.test(semHistorico)) grau = 'moderada';
  else if (/avancad[ao]|madura/.test(semHistorico)) grau = 'avançada';

  return { detected: true, grau };
}

// ============================================================================
// REFERÊNCIAS DOM
// ============================================================================

// Seletor de modo
const audioModeBtn = document.getElementById('audioModeBtn');
const cameraModeBtn = document.getElementById('cameraModeBtn');
const audioSection = document.getElementById('audioSection');
const cameraSection = document.getElementById('cameraSection');

// Áudio
const recordBtn = document.getElementById('recordBtn');
const statusText = document.getElementById('statusText');
const timerText = document.getElementById('timerText');
const processingIndicator = document.getElementById('processingIndicator');
const processingStatus = document.getElementById('processingStatus');
const consultationType = document.getElementById('consultationType');
const audioFieldsContainer = document.getElementById('audioFieldsContainer');
const primeiraConsultaFields = document.getElementById('primeiraConsultaFields');
const retornoFields = document.getElementById('retornoFields');

// Câmera
const cameraVideo = document.getElementById('cameraVideo');
const cameraOverlay = document.getElementById('cameraOverlay');
const processingOverlay = document.getElementById('processingOverlay');
const captureCanvas = document.getElementById('captureCanvas');
const cameraStatusText = document.getElementById('cameraStatusText');
const cameraProgress = document.getElementById('cameraProgress');
const progressFill = document.getElementById('progressFill');
const attemptCount = document.getElementById('attemptCount');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const examFieldsContainer = document.getElementById('examFieldsContainer');
const manualCaptureBtn = document.getElementById('manualCaptureBtn');

// Comum
const dataSummary = document.getElementById('dataSummary');
const audioBadge = document.getElementById('audioBadge');
const cameraBadge = document.getElementById('cameraBadge');
const actionButtons = document.getElementById('actionButtons');
const injectAllBtn = document.getElementById('injectAllBtn');
const clearBtn = document.getElementById('clearBtn');
const cancelDilatacaoBtn = document.getElementById('cancelDilatacaoBtn');
const retomarDilatacaoBtn = document.getElementById('retomarDilatacaoBtn');
const successMessage = document.getElementById('successMessage');
const btnSearchCid = document.getElementById('btnSearchCid');
const btnSearchCidRetorno = document.getElementById('btnSearchCidRetorno');

// Campos de áudio — primeira consulta
const hdaField = document.getElementById('hdaField');
const medicacoesField = document.getElementById('medicacoesField');
const antecedentesOftField = document.getElementById('antecedentesOftField');
const doencasSistemicasField = document.getElementById('doencasSistemicasField');
const antecedentesFamField = document.getElementById('antecedentesFamField');
const diagnosticoField = document.getElementById('diagnosticoField');
const condutaField = document.getElementById('condutaField');
const medicamentosPrescritosField = document.getElementById('medicamentosPrescritosField');

// Campos de áudio — retorno
const retornoField = document.getElementById('retornoField');
const medicacoesRetornoField = document.getElementById('medicacoesRetornoField');
const diagnosticoRetornoField = document.getElementById('diagnosticoRetornoField');
const condutaRetornoField = document.getElementById('condutaRetornoField');
const medicamentosPrescritosRetornoField = document.getElementById('medicamentosPrescritosRetornoField');

// Campos de exames
const tonometriaSection = document.getElementById('tonometriaSection');
const paquimetriaSection = document.getElementById('paquimetriaSection');
const refracaoSection = document.getElementById('refracaoSection');
