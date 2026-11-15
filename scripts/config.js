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
      // Local primeiro; a chave antiga do sync é migrada na primeira leitura.
      const chaveSalva = await ShospGemini.lerChave(chrome.storage);
      if (chaveSalva) {
        apiKeyInput.value = chaveSalva;
        showStatus('✅ Chave API carregada do armazenamento.', 'success');
      } else {
        showStatus('ℹ️ Nenhuma chave configurada. Obtenha uma em aistudio.google.com/apikey e salve aqui.', 'error');
      }
    } catch (err) {
      console.error('[Config] Erro ao carregar chave:', err);
    }
  }

  // ── Salvar chave ──────────────────────────────────────────────────────
  async function saveApiKey(apiKey) {
    try {
      await ShospGemini.salvarChave(chrome.storage, apiKey);
      showStatus('✅ Chave API salva com sucesso! Ela fica guardada só neste navegador.', 'success');
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
      // Mesmo modelo e mesma forma de enviar a chave que o painel usa.
      const response = await fetch(ShospGemini.endpoint('v1'), {
        method: 'POST',
        headers: ShospGemini.cabecalhos(apiKey),
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
          if (errorData.includes('depleted') || errorData.includes('credits') || errorData.includes('billing')) {
            showStatus('❌ Créditos esgotados no Google AI Studio. Por favor, recarregue seus créditos pré-pagos ou use outra chave.', 'error');
          } else {
            showStatus('⚠️ Rate limit atingido, mas a chave parece válida. Aguarde e tente novamente.', 'success');
          }
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
