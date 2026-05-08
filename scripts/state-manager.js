/**
 * STATE MANAGER v6 — API limpa sobre as variáveis de sessão
 * ============================================================================
 * Carregado APÓS sidepanel-constants.js (que define as let vars).
 * As let vars continuam sendo a fonte da verdade; StateManager é a fachada
 * de escrita autorizada. HOOK_STATE continua funcionando para leitura.
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

// Mapa canônico: nome externo → variável de sessão (let) definida em constants.js
// As chaves são os nomes usados em setHookFlag/getHookFlag.
const _FLAG_MAP = {
  examesNormaisInjetados:    () => examesNormaisInjetados,
  blefariteInjetada:         () => blefariteInjetada,
  receitaOlhoIrritadoInjetada: () => receitaOlhoIrritadoInjetada,
  catarataDetectada:         () => catarataDetectada,
  catarataGrau:              () => catarataGrau,
  lioDetectada:              () => lioDetectada,
  opacidadeCapsulaDetectada: () => opacidadeCapsulaDetectada,
  dilatacaoDetectada:        () => dilatacaoDetectada,
  fundoscopiaDetectada:      () => fundoscopiaDetectada,
};

// Setters separados porque JS não permite `eval` em strict mode sem wrapper.
// Cada setter recebe o novo valor e escreve na let var correta do escopo global.
const _FLAG_SETTERS = {
  examesNormaisInjetados:      v => { examesNormaisInjetados = v; },
  blefariteInjetada:           v => { blefariteInjetada = v; },
  receitaOlhoIrritadoInjetada: v => { receitaOlhoIrritadoInjetada = v; },
  catarataDetectada:           v => { catarataDetectada = v; },
  catarataGrau:                v => { catarataGrau = v; },
  lioDetectada:                v => { lioDetectada = v; },
  opacidadeCapsulaDetectada:   v => { opacidadeCapsulaDetectada = v; },
  dilatacaoDetectada:          v => { dilatacaoDetectada = v; },
  fundoscopiaDetectada:        v => { fundoscopiaDetectada = v; },
};

const StateManager = {
  /**
   * Zera todas as flags de detecção e variáveis de sessão para uma nova consulta.
   * Não toca em permissionChecked, mediaRecorder, streams ou dados já injetados.
   */
  resetSession() {
    // Flags de hooks
    examesNormaisInjetados    = false;
    blefariteInjetada         = false;
    receitaOlhoIrritadoInjetada = false;
    catarataDetectada         = false;
    catarataGrau              = null;
    lioDetectada              = false;
    opacidadeCapsulaDetectada = false;
    dilatacaoDetectada        = false;
    fundoscopiaDetectada      = false;

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

    // Contador de erros no-speech
    noSpeechCount = 0;
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
    const setter = _FLAG_SETTERS[name];
    if (!setter) throw new Error(`StateManager.setHookFlag: flag desconhecida '${name}'`);
    setter(value);
  },

  /**
   * Lê uma flag de detecção por nome.
   * @param {string} name — chave canônica
   * @returns {*}
   */
  getHookFlag(name) {
    const getter = _FLAG_MAP[name];
    if (!getter) throw new Error(`StateManager.getHookFlag: flag desconhecida '${name}'`);
    return getter();
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
