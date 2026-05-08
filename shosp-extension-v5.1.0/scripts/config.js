/**
 * CONFIG PAGE v5.0 — Gerenciamento da chave API
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('configForm');
  const apiKeyInput = document.getElementById('apiKey');
  const testBtn = document.getElementById('testBtn');
  const statusMessage = document.getElementById('statusMessage');

  // ── Carregar chave salva ──────────────────────────────────────────────
  async function loadSavedKey() {
    try {
      const result = await chrome.storage.sync.get(['geminiApiKey']);
      if (result.geminiApiKey) {
        apiKeyInput.value = result.geminiApiKey;
        showStatus('✅ Chave API carregada do armazenamento.', 'success');
      }
    } catch (err) {
      console.error('[Config] Erro ao carregar chave:', err);
    }
  }

  // ── Salvar chave ──────────────────────────────────────────────────────
  async function saveApiKey(apiKey) {
    try {
      await chrome.storage.sync.set({ geminiApiKey: apiKey });
      showStatus('✅ Chave API salva com sucesso!', 'success');
      return true;
    } catch (err) {
      console.error('[Config] Erro ao salvar chave:', err);
      showStatus('❌ Erro ao salvar a chave. Tente novamente.', 'error');
      return false;
    }
  }

  // ── Testar chave ──────────────────────────────────────────────────────
  async function testApiKey(apiKey) {
    if (!apiKey) {
      showStatus('⚠️ Insira uma chave API antes de testar.', 'error');
      return;
    }

    showStatus('🔄 Testando chave API...', 'success');
    testBtn.disabled = true;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responda apenas: OK' }] }],
          generationConfig: { maxOutputTokens: 10 }
        })
      });

      if (response.ok) {
        showStatus('✅ Chave API válida! Conexão com Gemini funcionando.', 'success');
      } else {
        const errorData = await response.text();
        if (response.status === 400) {
          showStatus('❌ Chave API inválida. Verifique se copiou corretamente.', 'error');
        } else if (response.status === 403) {
          showStatus('❌ Chave API sem permissão. Verifique as configurações no Google AI Studio.', 'error');
        } else if (response.status === 429) {
          showStatus('⚠️ Rate limit atingido, mas a chave parece válida. Aguarde e tente novamente.', 'success');
        } else {
          showStatus(`❌ Erro ${response.status}: ${errorData.substring(0, 100)}`, 'error');
        }
      }
    } catch (err) {
      showStatus(`❌ Erro de conexão: ${err.message}`, 'error');
    } finally {
      testBtn.disabled = false;
    }
  }

  // ── Exibir status ─────────────────────────────────────────────────────
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
  }

  // ── Event listeners ───────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('⚠️ Por favor, insira uma chave API.', 'error');
      return;
    }

    if (!apiKey.startsWith('AIza')) {
      showStatus('⚠️ Chave API parece inválida. Chaves do Google geralmente começam com "AIza".', 'error');
      return;
    }

    await saveApiKey(apiKey);
  });

  testBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    testApiKey(apiKey);
  });

  // ── Inicializar ───────────────────────────────────────────────────────
  loadSavedKey();
});
