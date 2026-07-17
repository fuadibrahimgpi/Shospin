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

// Limpeza manual descarta também a fase 1 de dilatação persistida (novo paciente)
clearBtn.addEventListener('click', () => clearAll({ clearAudio: true, clearCamera: true, discardDilatacao: true }));

// Desfazer dilatação: reprocessa a consulta como completa (gatilho por engano).
if (cancelDilatacaoBtn) cancelDilatacaoBtn.addEventListener('click', cancelarDilatacao);

// Retomar pós-dilatação: confirma o retorno do MESMO paciente e libera o uso do
// contexto da fase 1 na próxima gravação (por padrão, cada gravação é paciente novo).
if (retomarDilatacaoBtn) retomarDilatacaoBtn.addEventListener('click', confirmarRetomadaDilatacao);

// Visibilidade do botão dirigida por UMA fonte: a chave persistida _shospDilatacaoPhase1.
// storage.onChanged cobre todos os pontos de mutação (injeção de dilatação, undo,
// clearAll, conclusão da fase 2) sem toggles espalhados. Checa também no load.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes._shospDilatacaoPhase1) refreshUndoVisibility();
});
refreshUndoVisibility();

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
