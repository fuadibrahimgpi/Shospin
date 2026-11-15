/**
 * STATE MANAGER v6 — API limpa sobre as variáveis de sessão
 * ============================================================================
 * Carregado APÓS sidepanel-constants.js (que define AppState, a fonte única
 * do estado). StateManager é a fachada de escrita autorizada das flags. HOOK_STATE continua funcionando para leitura.
 *
 * API pública:
 *   resetSession()                  — zera flags + transcripts para nova consulta
 *   getSnapshot()                   — delega a __shospState.snapshot()
 *   setHookFlag(name, value)        — escreve em uma flag de detecção por nome
 *   getHookFlag(name)               — lê uma flag de detecção por nome
 *   markInjectionPerformed(type)    — 'audio' | 'camera'
 *   wasInjectionPerformed(type)     — boolean
 *   setTranscript(text)             — armazena texto reconhecido
 *   getTranscript()                 — retorna texto reconhecido
 */

'use strict';

// As flags de detecção vivem em AppState (constants.js); os nomes válidos são
// exatamente as chaves de SESSION_FLAG_DEFAULTS. Nome desconhecido lança erro.
function _assertFlag(method, name) {
  if (!Object.prototype.hasOwnProperty.call(SESSION_FLAG_DEFAULTS, name)) {
    throw new Error(`StateManager.${method}: flag desconhecida '${name}'`);
  }
}

const StateManager = {
  /**
   * Zera todas as flags de detecção e variáveis de sessão para uma nova consulta.
   * Não toca em permissionChecked, mediaRecorder, streams ou dados já injetados.
   */
  resetSession() {
    // Flags de hooks — dirigido por SESSION_FLAG_DEFAULTS (sidepanel-constants.js).
    // CRÍTICO: consultaEncerradaDetectada precisa voltar a false para permitir
    // STOP nas consultas seguintes; lenteLimpaDetectada precisa voltar a false
    // para não bloquear o hook de opacidade de cápsula no próximo paciente.
    // Falha alto se uma flag nova no registro canônico não tiver setter aqui.
    for (const [name, defaultValue] of Object.entries(SESSION_FLAG_DEFAULTS)) {
      AppState[name] = defaultValue;
    }

    // Transcript e buffer de voz
    AppState.recognizedText   = '';
    AppState.recentTextBuffer = '';
    if (AppState.recentTextTimeout) { clearTimeout(AppState.recentTextTimeout); AppState.recentTextTimeout = null; }

    // Controles de injeção
    AppState.audioData          = null;
    AppState.cameraData         = null;
    AppState.audioDataInjected  = false;
    AppState.cameraDataInjected = false;

    // Confirmação de refração pendente
    AppState.pendingRefractionConfirmation = false;

    // Cooldown e debounce de parada
    AppState.lastTriggerTime = 0;
    if (AppState.stopCommandTimeout) { clearTimeout(AppState.stopCommandTimeout); AppState.stopCommandTimeout = null; }
    AppState.stopPendingInfo = null;
    AppState.stopGateOffset = 0;
    AppState.stopGateBlockCount = 0;

    // Contador de erros no-speech
    AppState.noSpeechCount = 0;
    AppState.isSpeechBackingOff = false;

    // Timer de auto-recuperação do Speech (pode ter ficado pendente da sessão anterior)
    if (AppState.speechRecoveryTimer) { clearTimeout(AppState.speechRecoveryTimer); AppState.speechRecoveryTimer = null; }

    // Auto-stop por silêncio — cancelar timers da sessão anterior
    AppState.lastSpeechTime = 0;
    if (AppState.silenceCheckInterval) { clearInterval(AppState.silenceCheckInterval); AppState.silenceCheckInterval = null; }
    if (AppState.silencePendingStop) { clearTimeout(AppState.silencePendingStop); AppState.silencePendingStop = null; }
  },

  /** Delega ao snapshot serializável do __shospState bridge. */
  getSnapshot() {
    return window.__shospState.snapshot();
  },

  /**
   * Escreve uma flag de detecção por nome.
   * @param {string} name  — chave canônica (ver _FLAG_MAP)
   * @param {*}      value — novo valor
   */
  setHookFlag(name, value) {
    _assertFlag('setHookFlag', name);
    AppState[name] = value;
  },

  /**
   * Lê uma flag de detecção por nome.
   * @param {string} name — chave canônica
   * @returns {*}
   */
  getHookFlag(name) {
    _assertFlag('getHookFlag', name);
    return AppState[name];
  },

  /**
   * Marca que uma injeção foi realizada nesta sessão.
   * @param {'audio'|'camera'} type
   */
  markInjectionPerformed(type) {
    if (type === 'audio')  { AppState.audioDataInjected  = true; return; }
    if (type === 'camera') { AppState.cameraDataInjected = true; return; }
    throw new Error(`StateManager.markInjectionPerformed: tipo inválido '${type}'`);
  },

  /**
   * @param {'audio'|'camera'} type
   * @returns {boolean}
   */
  wasInjectionPerformed(type) {
    if (type === 'audio')  return AppState.audioDataInjected;
    if (type === 'camera') return AppState.cameraDataInjected;
    throw new Error(`StateManager.wasInjectionPerformed: tipo inválido '${type}'`);
  },

  /** Armazena o texto reconhecido pela Web Speech API. */
  setTranscript(text) {
    AppState.recognizedText = typeof text === 'string' ? text : '';
  },

  /** @returns {string} */
  getTranscript() {
    return AppState.recognizedText;
  },
};

// UMD-style export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateManager;
}
if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
}
