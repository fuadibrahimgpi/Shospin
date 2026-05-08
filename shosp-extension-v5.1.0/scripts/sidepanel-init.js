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

clearBtn.addEventListener('click', clearAll);

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
