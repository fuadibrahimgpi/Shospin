/**
 * ============================================================================
 * DILATAÇÃO — FILA DE PAUSAS MULTI-PACIENTE ("sala de espera")
 * ============================================================================
 * A rotina real do consultório: o paciente sai para dilatar e OUTRAS consultas
 * acontecem enquanto o colírio faz efeito — inclusive outras dilatações. O
 * modelo antigo (chave única _shospDilatacaoPhase1) não comportava isso:
 *   1. uma injeção normal de paciente intercalado APAGAVA a pausa de quem
 *      estava esperando (ramo else do injectAll);
 *   2. uma segunda dilatação SOBRESCREVIA a fase 1 da primeira.
 *
 * Este módulo substitui a chave única por uma FILA persistida em
 * chrome.storage.local (_shospDilatacaoPausas): cada pausa é um slot
 * independente, com identidade do prontuário capturada na hora da pausa.
 *
 * Formato de cada slot:
 *   {
 *     id:        string  — identificador único da pausa
 *     ts:        number  — última atualização (TTL de 6h a partir daqui)
 *     motivo:    'dilatacao' | 'exame'
 *     transcript:string  — transcrição acumulada da(s) fase(s) anterior(es)
 *     audio:     object|null — payload de áudio injetado na fase 1 (re-injeção)
 *     tabUrl:    string|null — URL do prontuário aberto quando a pausa nasceu
 *     tabTitle:  string|null — título da aba (rótulo humano na lista)
 *     retomar:   boolean — o médico confirmou que ESTE paciente voltou; a
 *                próxima gravação é a fase 2 dele. No máximo UM slot armado.
 *   }
 *
 * Regras de consumo:
 *   - Gravação nova sem slot armado = paciente NOVO (nada é anexado/mesclado).
 *   - Slot armado (retomar=true) é consumido pela fase 2 e removido ao fim.
 *   - Pausas de OUTROS pacientes nunca são tocadas por consultas intercaladas.
 *   - motivo='exame' (pausa manual no meio do exame, mesmo paciente na sala)
 *     nasce ARMADO: a próxima gravação continua a mesma consulta.
 *
 * Migração: uma _shospDilatacaoPhase1 legada é convertida em slot na primeira
 * leitura e a chave antiga é removida.
 */

'use strict';

const DilatacaoPausas = (() => {
  const STORAGE_KEY = '_shospDilatacaoPausas';
  const LEGACY_KEY = '_shospDilatacaoPhase1';
  const TTL_MS = 6 * 60 * 60 * 1000; // 6h — mesma validade do modelo antigo

  function _novoId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `pausa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function _storageGet(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(keys, d => resolve(d || {}));
      } catch (_e) { resolve({}); }
    });
  }

  function _storageSet(obj) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (_e) { resolve(); }
    });
  }

  /**
   * Carrega a fila: migra a chave legada (se existir), descarta slots
   * expirados/corrompidos e persiste de volta quando algo mudou.
   * @returns {Promise<Array>} slots ativos, mais antigo primeiro
   */
  async function _load() {
    const data = await _storageGet([STORAGE_KEY, LEGACY_KEY]);
    let pausas = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    let mudou = false;

    // Migração da chave única antiga → slot da fila
    const legado = data[LEGACY_KEY];
    if (legado && legado.transcript) {
      pausas.push({
        id: _novoId(),
        ts: legado.ts || Date.now(),
        motivo: legado.motivo || 'dilatacao',
        transcript: legado.transcript,
        audio: legado.audio || null,
        tabUrl: null,
        tabTitle: null,
        retomar: legado.retomar === true,
      });
      mudou = true;
      console.log('[DilatacaoPausas] Pausa legada (_shospDilatacaoPhase1) migrada para a fila.');
    }
    if (legado !== undefined) {
      try { chrome.storage.local.remove(LEGACY_KEY); } catch (_e) { /* não-fatal */ }
    }

    const agora = Date.now();
    const ativos = pausas.filter(p => p && p.transcript && agora - (p.ts || 0) <= TTL_MS);
    if (ativos.length !== pausas.length) mudou = true;

    ativos.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (mudou) await _storageSet({ [STORAGE_KEY]: ativos });
    return ativos;
  }

  async function _save(pausas) {
    await _storageSet({ [STORAGE_KEY]: pausas });
  }

  /** Identidade do prontuário aberto no momento (melhor esforço, nunca lança). */
  async function capturarAbaAtual() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.shosp.com.br/*' });
      if (!tabs.length) return { tabUrl: null, tabTitle: null };
      const t = tabs.find(x => x.active)
        || tabs.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      return { tabUrl: t.url || null, tabTitle: t.title || null };
    } catch (_e) {
      return { tabUrl: null, tabTitle: null };
    }
  }

  /** @returns {Promise<Array>} todos os slots ativos (mais antigo primeiro). */
  async function listar() {
    return _load();
  }

  /** @returns {Promise<object|null>} o slot armado (retomar=true), se houver. */
  async function obterRetomada() {
    const pausas = await _load();
    return pausas.find(p => p.retomar === true) || null;
  }

  /** @returns {Promise<object|null>} o slot mais recente, se houver. */
  async function obterMaisRecente() {
    const pausas = await _load();
    return pausas.length ? pausas[pausas.length - 1] : null;
  }

  /**
   * Cria um novo slot na fila (não toca nos demais).
   * @returns {Promise<string>} id do slot criado
   */
  async function criar({ transcript, audio = null, motivo = 'dilatacao', tabUrl = null, tabTitle = null, retomar = false }) {
    const pausas = await _load();
    const slot = {
      id: _novoId(),
      ts: Date.now(),
      motivo,
      transcript,
      audio,
      tabUrl,
      tabTitle,
      retomar: retomar === true,
    };
    // No máximo um slot armado por vez
    if (slot.retomar) pausas.forEach(p => { p.retomar = false; });
    pausas.push(slot);
    await _save(pausas);
    return slot.id;
  }

  /** Aplica um patch parcial a um slot. Retorna o slot atualizado ou null. */
  async function atualizar(id, patch) {
    const pausas = await _load();
    const slot = pausas.find(p => p.id === id);
    if (!slot) return null;
    if (patch.retomar === true) pausas.forEach(p => { if (p.id !== id) p.retomar = false; });
    Object.assign(slot, patch);
    await _save(pausas);
    return slot;
  }

  /** Remove um slot da fila (os demais permanecem intactos). */
  async function remover(id) {
    const pausas = await _load();
    const restantes = pausas.filter(p => p.id !== id);
    if (restantes.length !== pausas.length) await _save(restantes);
  }

  /** Arma a retomada de UM slot (desarma os demais). Retorna o slot ou null. */
  async function marcarRetomada(id) {
    return atualizar(id, { retomar: true });
  }

  /** Desarma qualquer retomada pendente (ex.: botão Limpar — paciente novo). */
  async function desmarcarRetomadas() {
    const pausas = await _load();
    let mudou = false;
    pausas.forEach(p => { if (p.retomar) { p.retomar = false; mudou = true; } });
    if (mudou) await _save(pausas);
  }

  /** Rótulo humano do slot para a lista do painel. */
  function rotulo(slot) {
    const hora = new Date(slot.ts || Date.now())
      .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let nome = (slot.tabTitle || '').trim();
    // Títulos do SHOSP costumam trazer sufixos do sistema — ficar com o começo
    if (nome) {
      nome = nome.split(/\s*[|\-–]\s*/)[0].trim();
      if (nome.length > 34) nome = nome.slice(0, 33) + '…';
    }
    const tipo = slot.motivo === 'exame' ? 'Pausa de exame' : 'Dilatação';
    return nome ? `${tipo} ${hora} — ${nome}` : `${tipo} ${hora}`;
  }

  return {
    STORAGE_KEY,
    LEGACY_KEY,
    listar,
    obterRetomada,
    obterMaisRecente,
    criar,
    atualizar,
    remover,
    marcarRetomada,
    desmarcarRetomadas,
    capturarAbaAtual,
    rotulo,
  };
})();

// UMD-style export (padrão dos demais módulos)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DilatacaoPausas;
}
if (typeof window !== 'undefined') {
  window.DilatacaoPausas = DilatacaoPausas;
}
