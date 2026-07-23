/**
 * ============================================================================
 * SIDEPANEL — MÓDULO DE INICIALIZAÇÃO
 * ============================================================================
 * Event listeners, switchMode, verificação de permissões e mensagens.
 * Carregado POR ÚLTIMO — depende de todos os outros módulos.
 */

// ============================================================================
// VERIFICAÇÕES INICIAIS
// ============================================================================

checkMicrophonePermission();
checkCameraPermission();

// ============================================================================
// EVENT LISTENERS
// ============================================================================

audioModeBtn.addEventListener('click', () => switchMode('audio'));
cameraModeBtn.addEventListener('click', () => switchMode('camera'));
recordBtn.addEventListener('click', toggleRecording);
startCameraBtn.addEventListener('click', startCameraCapture);
stopCameraBtn.addEventListener('click', stopCameraCapture);

if (manualCaptureBtn) {
  manualCaptureBtn.addEventListener('click', captureAndProcess);
}

injectAllBtn.addEventListener('click', async () => {
  try { await injectAll(); } catch (e) { console.log('[UI] Erro na injeção manual:', e.message); }
});

// Limpeza manual (novo paciente) DESARMA retomadas pendentes; as pausas dos
// pacientes em dilatação permanecem na sala de espera (descarte pelo ✕).
clearBtn.addEventListener('click', () => clearAll({ clearAudio: true, clearCamera: true, discardDilatacao: true }));

// Desfazer dilatação: reprocessa a consulta como completa (gatilho por engano).
// Age sobre a pausa mais recente da fila.
if (cancelDilatacaoBtn) cancelDilatacaoBtn.addEventListener('click', cancelarDilatacao);

// Sala de espera de dilatação dirigida por UMA fonte: a fila persistida
// _shospDilatacaoPausas (os botões "retomar"/"✕" de cada linha são criados por
// renderDilatacaoPausas). storage.onChanged cobre todos os pontos de mutação
// (nova pausa, retomada armada/desarmada, consumo da fase 2, descarte) sem
// toggles espalhados. Renderiza também no load — inclusive a migração da
// chave legada _shospDilatacaoPhase1, convertida em slot na primeira leitura.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[DilatacaoPausas.STORAGE_KEY] || changes[DilatacaoPausas.LEGACY_KEY])) {
    renderDilatacaoPausas();
  }
});
renderDilatacaoPausas();

// ============================================================================
// SELETOR DE MODO
// ============================================================================

function switchMode(mode) {
  currentMode = mode;

  audioModeBtn.classList.toggle('active', mode === 'audio');
  cameraModeBtn.classList.toggle('active', mode === 'camera');

  audioSection.classList.toggle('hidden', mode !== 'audio');
  cameraSection.classList.toggle('hidden', mode !== 'camera');

  // Áudio e câmera funcionam independentemente — não parar dispositivos ao trocar de modo
  if (mode === 'camera') {
    setTimeout(() => {
      if (!cameraStream) startCameraCapture();
    }, 100);
  }
}

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'permissionGranted':
      permissionChecked = true;
      statusText.textContent = 'Microfone liberado! Clique para iniciar';
      statusText.style.color = '#16a34a';
      setTimeout(() => {
        statusText.textContent = 'Clique para iniciar o ditado';
        statusText.style.color = '';
      }, 3000);
      sendResponse({ ok: true });
      break;

    // Atalhos de teclado roteados pelo background
    case 'toggleRecording':
      toggleRecording();
      sendResponse({ ok: true });
      break;

    case 'captureExam':
      switchMode('camera');
      setTimeout(() => {
        if (cameraStream) captureAndProcess();
        else startCameraCapture();
      }, 200);
      sendResponse({ ok: true });
      break;

    case 'injectAllFromKeyboard':
      injectAll()
        .then(() => sendResponse({ ok: true }))
        .catch(e => { console.log('[Keyboard] Erro na injeção:', e.message); sendResponse({ ok: false }); });
      return true; // canal assíncrono — não fechar antes da Promise resolver
  }
});

// ============================================================================
// HANDSHAKE COM O BACKGROUND
// ============================================================================
// Avisa o background que os listeners acima já estão registrados. Se o painel
// foi aberto por um atalho de teclado, o background reenvia a ação pendente
// ao receber este sinal (em vez de esperar um timeout fixo).
chrome.runtime.sendMessage({ action: 'panelReady' }).catch(() => {
  /* background inativo — sem ação pendente para receber */
});
