/**
 * STATE MANAGER v6 — API limpa sobre as variáveis de sessão
 * ============================================================================
 * Carregado APÓS sidepanel-constants.js (que define SessionFlags e as demais
 * variáveis de sessão). As flags vivem em SessionFlags; StateManager é a
 * fachada de escrita autorizada. HOOK_STATE continua funcionando para leitura.
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

// As flags vivem em SessionFlags (sidepanel-constants.js), geradas do registro
// canônico SESSION_FLAG_DEFAULTS. Este módulo valida o nome e delega — não há
// mais mapas de getters/setters por flag.

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
    Object.assign(SessionFlags, SESSION_FLAG_DEFAULTS);

    // Transcript e buffer de voz
    recognizedText   = '';
    recentTextBuffer = '';
    if (recentTextTimeout) { clearTimeout(recentTextTimeout); recentTextTimeout = null; }

    // Controles de injeção
    audioData          = null;
    cameraData         = null;
    audioDataInjected  = false;
    cameraDataInjected = false;

    // Confirmação de refração pendente
    pendingRefractionConfirmation = false;

    // Cooldown e debounce de parada
    lastTriggerTime = 0;
    if (stopCommandTimeout) { clearTimeout(stopCommandTimeout); stopCommandTimeout = null; }
    stopPendingInfo = null;
    stopGateOffset = 0;
    stopGateBlockCount = 0;

    // Contador de erros no-speech
    noSpeechCount = 0;
    isSpeechBackingOff = false;

    // Timer de auto-recuperação do Speech (pode ter ficado pendente da sessão anterior)
    if (speechRecoveryTimer) { clearTimeout(speechRecoveryTimer); speechRecoveryTimer = null; }

    // Auto-stop por silêncio — cancelar timers da sessão anterior
    lastSpeechTime = 0;
    if (silenceCheckInterval) { clearInterval(silenceCheckInterval); silenceCheckInterval = null; }
    if (silencePendingStop) { clearTimeout(silencePendingStop); silencePendingStop = null; }
  },

  /** Delega ao snapshot serializável do __shospState bridge. */
  getSnapshot() {
    return window.__shospState.snapshot();
  },

  /**
   * Escreve uma flag de detecção por nome.
   * @param {string} name  — chave canônica (ver SESSION_FLAG_DEFAULTS)
   * @param {*}      value — novo valor
   */
  setHookFlag(name, value) {
    if (!(name in SESSION_FLAG_DEFAULTS)) throw new Error(`StateManager.setHookFlag: flag desconhecida '${name}'`);
    SessionFlags[name] = value;
  },

  /**
   * Lê uma flag de detecção por nome.
   * @param {string} name — chave canônica
   * @returns {*}
   */
  getHookFlag(name) {
    if (!(name in SESSION_FLAG_DEFAULTS)) throw new Error(`StateManager.getHookFlag: flag desconhecida '${name}'`);
    return SessionFlags[name];
  },

  /**
   * Marca que uma injeção foi realizada nesta sessão.
   * @param {'audio'|'camera'} type
   */
  markInjectionPerformed(type) {
    if (type === 'audio')  { audioDataInjected  = true; return; }
    if (type === 'camera') { cameraDataInjected = true; return; }
    throw new Error(`StateManager.markInjectionPerformed: tipo inválido '${type}'`);
  },

  /**
   * @param {'audio'|'camera'} type
   * @returns {boolean}
   */
  wasInjectionPerformed(type) {
    if (type === 'audio')  return audioDataInjected;
    if (type === 'camera') return cameraDataInjected;
    throw new Error(`StateManager.wasInjectionPerformed: tipo inválido '${type}'`);
  },

  /** Armazena o texto reconhecido pela Web Speech API. */
  setTranscript(text) {
    recognizedText = typeof text === 'string' ? text : '';
  },

  /** @returns {string} */
  getTranscript() {
    return recognizedText;
  },
};

// UMD-style export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateManager;
}
if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
}
