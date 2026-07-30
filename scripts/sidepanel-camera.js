/**
 * ============================================================================
 * SIDEPANEL — MÓDULO DE CÂMERA (Captura de Exames)
 * ============================================================================
 * Validação de refração, permissão de câmera, captura burst, OCR via Gemini,
 * exibição de resultados e aviso de refração suspeita.
 * Depende de: sidepanel-constants.js, sidepanel-injection.js (injectAll)
 */

// ============================================================================
// VALIDAÇÃO BINÁRIA — APENAS REPASSA O RESULTADO DO GeminiService
// ============================================================================
//
// v5.2 (REESCRITA): a validação clínica corretiva (negação de cilindro positivo,
// anulação de par CIL/EIXO incompleto, cross-check inter-olhos, etc.) agora
// vive em GeminiExamAgent._postProcessRefraction — determinístico e testável.
//
// Esta função é um passthrough fino: se o serviço sinalizou falha, propaga;
// caso contrário devolve os dados como estão.
function validateAndFixEyeSwap(data) {
  if (!data) return data;
  // Tratar strings residuais como null (defensivo — _postProcessRefraction já
  // emite null nesses casos, mas mantemos por segurança)
  if (data.refracao) {
    if (typeof data.refracao.od === 'string') data.refracao.od = null;
    if (typeof data.refracao.oe === 'string') data.refracao.oe = null;
  }
  // _captureFailed do serviço novo é o único sinal de bloqueio
  if (data._captureFailed) data._blockAutoInject = true;
  return data;
}

// ============================================================================
// PERMISSÃO DE CÂMERA
// ============================================================================

async function checkCameraPermission() {
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    if (result.state === 'granted') {
      cameraPermissionChecked = true;
      cameraStatusText.textContent = 'Clique para iniciar captura';
    } else if (result.state === 'denied') {
      cameraStatusText.textContent = 'Permissão negada. Clique no botão para tentar novamente.';
      cameraStatusText.style.color = '#dc2626';
    } else {
      cameraStatusText.textContent = 'Clique para liberar câmera';
    }
    result.onchange = () => {
      if (result.state === 'granted') {
        cameraPermissionChecked = true;
        cameraStatusText.textContent = 'Clique para iniciar captura';
      }
    };
  } catch (e) {
    console.log('[Camera] Não foi possível verificar permissão:', e);
    cameraStatusText.textContent = 'Clique para liberar câmera';
  }
}

function openCameraPermissionPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('camera-permission.html') });
}

// ============================================================================
// CAPTURA DE CÂMERA
// ============================================================================

async function startCameraCapture() {
  // Pausar reconhecimento de voz se gravação estiver ativa
  if (isRecording && typeof pauseSpeechRecognition === 'function') {
    pauseSpeechRecognition();
  }

  try {
    cameraStatusText.textContent = 'Iniciando câmera...';
    cameraOverlay.classList.remove('hidden');

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 4096, min: 1920 },
        height: { ideal: 2160, min: 1080 },
        advanced: [
          { focusMode: 'continuous' },
          { whiteBalanceMode: 'continuous' },
          { exposureMode: 'continuous' }
        ]
      }
    });

    // Foco automático e zoom leve
    try {
      const track = cameraStream.getVideoTracks()[0];
      const caps = track.getCapabilities();
      const constraints = { advanced: [] };

      if (caps.focusDistance) constraints.advanced.push({ focusMode: 'continuous' });
      if (caps.zoom) {
        const min = caps.zoom.min || 1;
        const max = caps.zoom.max || 1;
        let zoom = Math.min(max, min + (max - min) * 0.15);
        if (max >= 2.0) zoom = 2.0;
        else if (max >= 1.5) zoom = 1.5;
        constraints.advanced.push({ zoom });
      }
      if (constraints.advanced.length > 0) await track.applyConstraints(constraints);
    } catch (e) { /* foco/zoom não suportado */ }

    cameraVideo.srcObject = cameraStream;
    cameraOverlay.classList.add('hidden');

    startCameraBtn.classList.add('hidden');
    stopCameraBtn.classList.remove('hidden');
    if (manualCaptureBtn) manualCaptureBtn.classList.remove('hidden');

    cameraStatusText.textContent = 'Câmera pronta! Aponte para o exame e clique em "Capturar Agora"';
    cameraStatusText.style.color = '#16a34a';

  } catch (error) {
    console.error('[Camera] Erro:', error);
    let msg = 'Erro ao acessar câmera';
    if (error.name === 'NotAllowedError') msg = 'Permissão de câmera negada.';
    else if (error.name === 'NotFoundError') msg = 'Câmera não encontrada.';
    else msg = error.message;
    cameraStatusText.textContent = msg;
    cameraOverlay.classList.add('hidden');
  }
}

function stopCameraCapture() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (captureInterval) { clearInterval(captureInterval); captureInterval = null; }
  if (captureTimeout) { clearTimeout(captureTimeout); captureTimeout = null; }

  startCameraBtn.classList.remove('hidden');
  stopCameraBtn.classList.add('hidden');
  cameraProgress.classList.add('hidden');
  processingOverlay.classList.add('hidden');
  if (manualCaptureBtn) manualCaptureBtn.classList.add('hidden');

  cameraStatusText.textContent = 'Clique para iniciar câmera';
  cameraStatusText.style.color = '';

  // Retomar reconhecimento de voz se foi pausado pela câmera
  if (isRecording && isSpeechPausedByCamera && typeof resumeSpeechRecognition === 'function') {
    resumeSpeechRecognition();
  }

  // A câmera parou: qualquer modo estática armado expira aqui (a próxima
  // captura volta a ser normal, a menos que o botão da retomada rearme).
  _captureMode = 'normal';
}

// ============================================================================
// CAPTURA PÓS-DILATAÇÃO (REFRAÇÃO ESTÁTICA)
// ============================================================================
//
// Abre a câmera em modo 'estatica': a PRÓXIMA captura é entendida como o grau
// dilatado e vai SOMENTE para o bloco Refração estática (sem injectAll, sem
// tocar dinâmica/receita/tono/paqui/CID). Acionada pelo botão da linha de
// retomada da sala de espera de dilatação.
function startCameraCaptureEstatica() {
  // Revela a seção de câmera sem passar pela auto-inicialização genérica do
  // switchMode (que zera _captureMode). Depois arma o modo estática.
  if (typeof currentMode !== 'undefined') currentMode = 'camera';
  audioModeBtn?.classList.remove('active');
  cameraModeBtn?.classList.add('active');
  audioSection?.classList.add('hidden');
  cameraSection?.classList.remove('hidden');

  if (!cameraStream) startCameraCapture();
  _captureMode = 'estatica';

  if (cameraStatusText) {
    cameraStatusText.textContent = 'Pós-dilatação: capture o ticket dilatado → Refração ESTÁTICA';
    cameraStatusText.style.color = '#7c3aed';
  }
}

// ============================================================================
// COMPRESSÃO DE IMAGEM
// ============================================================================

async function compressImageBlob(blob, maxDim = 3840, quality = 0.98) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      // Restringir pela maior dimensão (tickets TOPCON são portrait)
      // 2048px mantém dígitos legíveis sem ultrapassar o limite da API Gemini
      const largest = Math.max(w, h);
      if (largest > maxDim) {
        const ratio = maxDim / largest;
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

// ============================================================================
// TIMER DE PROCESSAMENTO
// ============================================================================

let _processingTimerInterval = null;
let _processingTimerSeconds = 0;

function startProcessingTimer() {
  _processingTimerSeconds = 0;
  const el = document.getElementById('processingTimer');
  if (el) el.textContent = '0s';
  if (_processingTimerInterval) clearInterval(_processingTimerInterval);
  _processingTimerInterval = setInterval(() => {
    _processingTimerSeconds++;
    if (el) el.textContent = _processingTimerSeconds + 's';
  }, 1000);
}

function stopProcessingTimer() {
  if (_processingTimerInterval) {
    clearInterval(_processingTimerInterval);
    _processingTimerInterval = null;
  }
}

// ============================================================================
// INDICADOR DE PROGRESSO
// ============================================================================

const PROCESSING_STEPS = [
  { icon: '\u{1F50D}', text: 'Focando câmera...', pct: 5 },
  { icon: '\u{1F4F8}', text: 'Capturando imagens...', pct: 15 },
  { icon: '\u{1F5DC}\uFE0F', text: 'Comprimindo imagens...', pct: 25 },
  { icon: '\u{1F524}', text: 'Transcrevendo ticket...', pct: 45 },
  { icon: '\u{1F9E0}', text: 'Extraindo dados...', pct: 70 },
  { icon: '\u2705', text: 'Validando resultados...', pct: 90 },
  { icon: '\u{1F4CA}', text: 'Concluído!', pct: 100 }
];

function updateProcessingStep(idx) {
  const step = PROCESSING_STEPS[idx];
  if (!step) return;
  const iconEl = document.getElementById('processingIcon');
  const textEl = document.getElementById('processingStepText');
  const fillEl = document.getElementById('processingStepsFill');
  const labelEl = document.getElementById('processingStepLabel');
  if (iconEl) iconEl.textContent = step.icon;
  if (textEl) textEl.textContent = step.text;
  if (fillEl) fillEl.style.width = step.pct + '%';
  if (labelEl) labelEl.textContent = `Etapa ${idx + 1} de ${PROCESSING_STEPS.length}`;
}

// ============================================================================
// CAPTURA E PROCESSAMENTO (BURST + OCR)
// ============================================================================

async function captureAndProcess() {
  if (!cameraStream) return;
  if (!processingOverlay.classList.contains('hidden')) return; // evitar chamadas simultâneas

  // Desabilitar botão imediatamente para evitar duplo clique no frame
  // entre o início da função e a remoção da classe 'hidden' do overlay
  if (manualCaptureBtn) manualCaptureBtn.disabled = true;

  // Snapshot do modo ANTES de qualquer stopCameraCapture() (que zera o global).
  const captureMode = _captureMode;

  try {
    processingOverlay.classList.remove('hidden');
    startProcessingTimer();
    updateProcessingStep(0);

    const videoTrack = cameraStream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    const capabilities = imageCapture.track.getCapabilities();

    const NUM_CAPTURES = 3;
    const CAPTURE_DELAY = 200;  // +50ms entre capturas para estabilidade de foco
    const MAX_IMAGE_DIM = 3840; // resolução altíssima para dígitos de ticket térmico legíveis (300dpi eq)
    const images = [];

    await new Promise(r => setTimeout(r, 1000)); // aguardar foco (era 800ms)
    updateProcessingStep(1);

    for (let i = 0; i < NUM_CAPTURES; i++) {
      let blob;
      try {
        const settings = {
          // Ticket TOPCON é portrait: maior dimensão = altura
          imageHeight: Math.min(capabilities.imageHeight?.max || 4032, 4032),
          imageWidth:  Math.min(capabilities.imageWidth?.max  || 3024, 3024)
        };
        if (capabilities.fillLightMode?.includes('auto')) settings.fillLightMode = 'auto';
        else if (capabilities.fillLightMode?.includes('flash')) settings.fillLightMode = 'flash';
        blob = await imageCapture.takePhoto(settings);
      } catch (e) {
        // Fallback: grabFrame em resolução máxima disponível
        const bmp = await imageCapture.grabFrame();
        const c = captureCanvas;
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, 0, 0);
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 1.0));
      }

      updateProcessingStep(2);
      images.push(await compressImageBlob(blob, MAX_IMAGE_DIM));

      if (i < NUM_CAPTURES - 1) await new Promise(r => setTimeout(r, CAPTURE_DELAY));
    }

    updateProcessingStep(3);

    // Enviar para Gemini (v5.2: single-call, sem TWO-PASS)
    updateProcessingStep(4);
    const examData = await window.GeminiService.extractExams(images);

    updateProcessingStep(5);

    // Passthrough de validação (defensivo)
    const validated = validateAndFixEyeSwap(examData);

    updateProcessingStep(6);

    // Desligar câmera após processamento
    stopProcessingTimer();
    stopCameraCapture();
    processingOverlay.classList.add('hidden');

    // Caminho 1: captura falhou (duplicação detectada, valores absurdos, erro de API)
    //            → mostrar mensagem "Refazer captura" e parar.
    // IMPORTANTE: stopCameraCapture() acima já zerou _captureMode para 'normal'.
    // Passamos o modo do snapshot para que o "Refazer captura" REARME a estática —
    // sem isso, uma captura estática que falha na verificação (rotina: ~1 em 3
    // neste log) faria a retentativa cair no injectAll normal e empurrar o grau
    // dilatado para a receita de óculos / refração dinâmica.
    if (validated._captureFailed) {
      showCaptureFailedMessage(validated._reason || 'Captura inválida. Refaça a foto.', captureMode);
      cameraStatusText.textContent = captureMode === 'estatica'
        ? 'Captura estática falhou — refaça (segue em modo Refração ESTÁTICA)'
        : 'Captura falhou — refaça';
      return;
    }

    // Caminho 2b: captura pós-dilatação → injeta SOMENTE a refração estática.
    // Não passa por injectAll (nada de dinâmica/receita/tono/paqui/CID) e não
    // deixa cameraData armado, para que um injectAll posterior não empurre este
    // grau dilatado para a refração dinâmica.
    if (captureMode === 'estatica') {
      displayCameraResults(validated); // mostra os valores capturados p/ conferência
      document.getElementById('receitaOculosOption')?.classList.add('hidden');
      const refr = validated.refracao;
      let ok = false;
      if (refr && (refr.od || refr.oe)) {
        try { ok = await injectRefracaoEstaticaDirect(refr); }
        catch (e) { console.error('[Camera] Erro na injeção da refração estática:', e); }
      }
      cameraData = null;
      cameraDataInjected = false;
      cameraStatusText.textContent = ok
        ? 'Refração estática (pós-dilatação) injetada!'
        : 'Refração estática não injetada — confira os campos e o mapeamento.';
      cameraStatusText.style.color = ok ? '#16a34a' : '#dc2626';
      return;
    }

    // Caminho 2: captura OK → mostrar dados e auto-injetar
    displayCameraResults(validated);
    cameraStatusText.textContent = 'Processamento concluído!';

    if (cameraData) {
      try { await injectAll(); } catch (e) { console.error('[Camera] Erro na auto-injeção:', e); }
    }

  } catch (error) {
    console.error('[Camera] Erro ao processar:', error);
    cameraStatusText.textContent = 'Erro: ' + error.message;
    stopProcessingTimer();
    processingOverlay.classList.add('hidden');
  } finally {
    // Reabilitar botão sempre, independente de sucesso ou erro
    if (manualCaptureBtn) manualCaptureBtn.disabled = false;
  }
}

// ============================================================================
// EXIBIÇÃO DE RESULTADOS
// ============================================================================

function displayCameraResults(data) {
  cameraData = data;
  processingOverlay.classList.add('hidden');
  examFieldsContainer.classList.remove('hidden');

  // Tonometria
  if (data.tonometria && (data.tonometria.od != null || data.tonometria.oe != null)) {
    tonometriaSection.classList.remove('hidden');
    document.getElementById('tonoOdField').value = data.tonometria.od != null ? data.tonometria.od : 'ERR';
    document.getElementById('tonoOeField').value = data.tonometria.oe != null ? data.tonometria.oe : 'ERR';
  }

  // Paquimetria
  if (data.paquimetria && (data.paquimetria.od != null || data.paquimetria.oe != null)) {
    paquimetriaSection.classList.remove('hidden');
    document.getElementById('paquiOdField').value = data.paquimetria.od != null ? data.paquimetria.od : 'ERR';
    document.getElementById('paquiOeField').value = data.paquimetria.oe != null ? data.paquimetria.oe : 'ERR';
  }

  // Refração
  if (data.refracao) {
    refracaoSection.classList.remove('hidden');

    if (data.refracao.od != null) {
      document.getElementById('refOdEsf').value = formatEsf(data.refracao.od.esf);
      document.getElementById('refOdCil').value = formatCil(data.refracao.od.cil);
      document.getElementById('refOdEixo').value = data.refracao.od.eixo != null ? data.refracao.od.eixo + '°' : '';
    } else {
      document.getElementById('refOdEsf').value = 'ILEGÍVEL';
      document.getElementById('refOdCil').value = '';
      document.getElementById('refOdEixo').value = '';
    }

    if (data.refracao.oe != null) {
      document.getElementById('refOeEsf').value = formatEsf(data.refracao.oe.esf);
      document.getElementById('refOeCil').value = formatCil(data.refracao.oe.cil);
      document.getElementById('refOeEixo').value = data.refracao.oe.eixo != null ? data.refracao.oe.eixo + '°' : '';
    } else {
      document.getElementById('refOeEsf').value = 'ILEGÍVEL';
      document.getElementById('refOeCil').value = '';
      document.getElementById('refOeEixo').value = '';
    }

    document.getElementById('receitaOculosOption').classList.remove('hidden');
  }

  updateDataSummary();
}

// ============================================================================
// FORMATAÇÃO (local ao sidepanel — exibição, não injeção)
// ============================================================================

function formatEsf(value) {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return value;
  return num >= 0 ? `+${num.toFixed(2)}` : num.toFixed(2);
}

function formatCil(value) {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return value;
  if (num === 0) return '';
  return num.toFixed(2);
}

// ============================================================================
// MENSAGEM DE FALHA DE CAPTURA
// ============================================================================
//
// v5.2 (REESCRITA): banner com 3 botões (Confirmar / Inverter / Limpar) foi
// removido. Quando a captura falha (duplicação, dados absurdos, alucinação
// detectada), mostramos apenas um aviso claro e um botão "Refazer captura".
// Sem opções de "swap" ou "limpar OE" — a única ação confiável é nova foto.

function showCaptureFailedMessage(reason, retryMode = 'normal') {
  const existing = document.getElementById('refractionWarningBanner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'refractionWarningBanner';
  banner.innerHTML = `
    <div style="background:#7c2d12;border:1px solid #dc2626;border-radius:8px;padding:12px 14px;margin:10px 0;color:#fef2f2">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">Captura inválida</div>
      <div style="font-size:12px;opacity:0.95;margin-bottom:8px">${reason}</div>
      <div style="font-size:11px;opacity:0.75;margin-bottom:10px">
        Dicas: aproxime a câmera até o ticket ocupar ~70% do enquadramento,
        evite reflexos no papel térmico e verifique se o ticket está plano.
      </div>
      <button id="retryCaptureBtn" style="width:100%;background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:8px;font-size:13px;font-weight:600;cursor:pointer">
        Refazer captura
      </button>
    </div>`;

  const container = document.getElementById('examFieldsContainer');
  if (container?.parentNode) {
    container.parentNode.insertBefore(banner, container.nextSibling);
  } else {
    document.body.appendChild(banner);
  }

  document.getElementById('retryCaptureBtn').addEventListener('click', () => {
    banner.remove();
    // Reativar fluxo de câmera para nova captura, PRESERVANDO o modo original.
    // Se a captura que falhou era estática (pós-dilatação), a retentativa precisa
    // rearmar a estática — senão volta ao normal e o grau dilatado vaza para a
    // receita/refração dinâmica via injectAll.
    if (retryMode === 'estatica' && typeof startCameraCaptureEstatica === 'function') {
      startCameraCaptureEstatica();
    } else if (typeof startCameraCapture === 'function') {
      startCameraCapture();
    }
  });
}
