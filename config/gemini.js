/**
 * GEMINI — modelo, endereço e chave num lugar só
 * ============================================================================
 * Até 2026-11-10:
 *   - o nome do modelo estava escrito em três lugares (dois em ApiService.js, um
 *     em scripts/config.js). Trocar de modelo exigia lembrar dos três;
 *   - a chave ia na URL (`?key=...`), onde aparece em logs de rede e no histórico
 *     de requisições das ferramentas do navegador;
 *   - a chave ficava em chrome.storage.sync, que o Chrome replica na conta Google.
 *
 * Agora:
 *   - MODELO é a única ocorrência do nome do modelo no código (teste [GEMINI-1]);
 *   - a chave vai no cabeçalho `x-goog-api-key`, que é a forma dos exemplos REST
 *     da documentação do Gemini (conferido em 2026-11-10);
 *   - a chave fica em chrome.storage.local (só neste navegador). A chave antiga
 *     é trazida do sync na primeira leitura e só é apagada de lá depois de a
 *     cópia local ser lida de volta e conferida.
 *
 * Carregado ANTES de src/ApiService.js (sidepanel.html) e de scripts/config.js
 * (config.html). As funções de chave recebem `chrome.storage` por parâmetro para
 * os testes rodarem em Node.
 */
'use strict';

const ShospGemini = (() => {
  const MODELO = 'gemini-2.5-flash';
  const BASE = 'https://generativelanguage.googleapis.com';
  const CABECALHO_CHAVE = 'x-goog-api-key';
  const CHAVE_STORAGE = 'geminiApiKey';

  /** @param {'v1'|'v1beta'} versao */
  function endpoint(versao) {
    return `${BASE}/${versao || 'v1'}/models/${MODELO}:generateContent`;
  }

  /** Cabeçalhos da requisição. A chave vai AQUI, nunca na URL. */
  function cabecalhos(apiKey) {
    return { 'Content-Type': 'application/json', [CABECALHO_CHAVE]: String(apiKey || '') };
  }

  /**
   * Lê a chave. Ordem: armazenamento local; se vazio, o sync antigo (migração).
   * Na migração a chave só sai do sync depois de a cópia local ser relida e
   * conferida — uma falha no meio nunca deixa o médico sem chave.
   * @returns {Promise<string|null>}
   */
  async function lerChave(storage) {
    const local = await storage.local.get([CHAVE_STORAGE]);
    if (local && local[CHAVE_STORAGE]) return local[CHAVE_STORAGE];

    let antiga = null;
    try {
      const sync = await storage.sync.get([CHAVE_STORAGE]);
      antiga = (sync && sync[CHAVE_STORAGE]) || null;
    } catch (_e) { /* sync indisponível — não há o que migrar */ }
    if (!antiga) return null;

    try {
      await storage.local.set({ [CHAVE_STORAGE]: antiga });
      const conferida = await storage.local.get([CHAVE_STORAGE]);
      if (conferida && conferida[CHAVE_STORAGE] === antiga) {
        try { await storage.sync.remove(CHAVE_STORAGE); } catch (_e) { /* fica no sync; a local já vale */ }
      }
    } catch (_e) {
      // Não gravou localmente: a chave continua no sync e segue valendo nesta sessão.
    }
    return antiga;
  }

  /** Grava a chave só neste navegador e tira a cópia antiga do sync. */
  async function salvarChave(storage, apiKey) {
    await storage.local.set({ [CHAVE_STORAGE]: apiKey });
    try { await storage.sync.remove(CHAVE_STORAGE); } catch (_e) { /* sem sync, nada a limpar */ }
    return true;
  }

  return { MODELO, BASE, CABECALHO_CHAVE, CHAVE_STORAGE, endpoint, cabecalhos, lerChave, salvarChave };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShospGemini;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ShospGemini = ShospGemini;
}
