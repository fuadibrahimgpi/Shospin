/**
 * ============================================================================
 * SIDEPANEL — ESTADO GLOBAL, CONSTANTES E REFERÊNCIAS DOM
 * ============================================================================
 * Carregado após config/clinical-triggers.js (que define normalizeText e
 * todos os arrays de gatilhos de voz). Este arquivo define apenas:
 *   - Variáveis de estado da sessão (let)
 *   - STATE BRIDGE v5.1 (__shospState)
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

// Stream de áudio persistente
let persistentStream = null;

// Estado da câmera
let cameraStream = null;
let captureInterval = null;
let captureTimeout = null;

// Flags de detecção de gatilhos (resetadas a cada gravação)
let examesNormaisInjetados = false;
let blefariteInjetada = false;
let receitaOlhoIrritadoInjetada = false;
let catarataDetectada = false;
let catarataGrau = null; // "inicial" | "incipiente" | "moderada" | "avançada" | null
let lioDetectada = false;
let opacidadeCapsulaDetectada = false;
let dilatacaoDetectada = false;
let fundoscopiaDetectada = false;
let consultaEncerradaDetectada = false;

// Cooldown unificado e debounce de parada
let lastTriggerTime = 0;
let stopCommandTimeout = null;

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
window.__shospState = Object.freeze({
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
  get examesNormaisInjetados()       { return examesNormaisInjetados; },
  get blefariteInjetada()            { return blefariteInjetada; },
  get receitaOlhoIrritadoInjetada()  { return receitaOlhoIrritadoInjetada; },
  get catarataDetectada()            { return catarataDetectada; },
  get catarataGrau()                 { return catarataGrau; },
  get lioDetectada()                 { return lioDetectada; },
  get opacidadeCapsulaDetectada()    { return opacidadeCapsulaDetectada; },
  get dilatacaoDetectada()           { return dilatacaoDetectada; },
  get fundoscopiaDetectada()         { return fundoscopiaDetectada; },
  get lastTriggerTime()              { return lastTriggerTime; },
  get hasStopScheduled()             { return stopCommandTimeout !== null; },
  get recentTextBufferLength()       { return recentTextBuffer.length; },
  // Snapshot serializável para logs (sem referências a timers ou DOM)
  snapshot() {
    return {
      currentMode, isRecording,
      hasAudioData: audioData !== null,
      hasCameraData: cameraData !== null,
      audioDataInjected, cameraDataInjected,
      flags: {
        examesNormaisInjetados, blefariteInjetada, receitaOlhoIrritadoInjetada,
        catarataDetectada, catarataGrau, lioDetectada,
        opacidadeCapsulaDetectada, dilatacaoDetectada, fundoscopiaDetectada,
      },
      hasStopScheduled: stopCommandTimeout !== null,
      recognizedTextLength: recognizedText.length,
    };
  },
});

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
  if (opacidadeCapsulaDetectada) return baseText.replace('cristalino transparente', LENTE_OPACIDADE_CAPSULA);
  if (lioDetectada) return baseText.replace('cristalino transparente', LENTE_LIO);
  if (catarataDetectada) {
    const lente = catarataGrau ? `catarata ${catarataGrau}` : LENTE_CATARATA;
    return baseText.replace('cristalino transparente', lente);
  }
  return baseText;
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
