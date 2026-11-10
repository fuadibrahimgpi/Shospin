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

// Abre a página de liberação da câmera — ou traz para frente a que já está aberta
// (a câmera é aberta sozinha ao entrar no modo Câmera; sem isto, cada entrada com
// a permissão negada empilharia mais uma aba).
async function openCameraPermissionPage() {
  const url = chrome.runtime.getURL('camera-permission.html');
  try {
    const abertas = (await chrome.tabs.query({})).filter(t => t && (t.url || t.pendingUrl || '') === url);
    if (abertas.length) {
      await chrome.tabs.update(abertas[0].id, { active: true });
      if (abertas[0].windowId != null) await chrome.windows.update(abertas[0].windowId, { focused: true });
      return;
    }
  } catch (_e) { /* não deu para procurar — abre uma nova */ }
  chrome.tabs.create({ url });
}

// Já abrimos a página nesta sessão do painel? A abertura AUTOMÁTICA da câmera só
// leva o médico até ela uma vez; o clique em "Iniciar Câmera" sempre leva.
let _cameraPermissionPageOpened = false;

/** Pura: decide se a negativa da câmera deve abrir a página de liberação. */
function _deveAbrirPaginaPermissaoCamera(pedidoExplicito, jaAbriuNestaSessao) {
  return !!pedidoExplicito || !jaAbriuNestaSessao;
}

// ============================================================================
// CAPTURA DE CÂMERA
// ============================================================================

// Abertura em degraus: da configuração ideal (alta resolução, foco contínuo)
// até a câmera "como vier". Antes, `min: 1920x1080` fazia getUserMedia rejeitar
// com OverconstrainedError em qualquer webcam abaixo disso, e como a abertura
// automática ao escolher a aba Câmera é silenciosa, parecia que nada acontecia.
const CAMERA_CONSTRAINT_STEPS = [
  { video: {
      facingMode: 'environment',
      width: { ideal: 4096, min: 1920 },
      height: { ideal: 2160, min: 1080 },
      advanced: [
        { focusMode: 'continuous' },
        { whiteBalanceMode: 'continuous' },
        { exposureMode: 'continuous' }
      ]
  } },
  { video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 2160 } } },
  { video: true }
];

let _cameraStarting = false;

async function openCameraStreamWithFallback() {
  let lastError;
  for (const constraints of CAMERA_CONSTRAINT_STEPS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastError = e;
      // Permissão negada ou sem dispositivo: relaxar a resolução não resolve.
      if (e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'SecurityError') break;
      console.warn('[Camera] Configuração recusada, tentando a próxima:', e.name, e.message);
    }
  }
  throw lastError;
}

async function startCameraCapture(origem) {
  // Já abrindo ou aberta: ignorar (a abertura automática ao trocar de aba e o
  // botão "Iniciar Câmera" podem disparar quase juntos).
  if (_cameraStarting || cameraStream) return;
  _cameraStarting = true;
  // O botão "Iniciar Câmera" chama com o evento de clique; a abertura automática
  // (trocar de modo, atalho) chama sem argumento.
  const pedidoExplicito = !!(origem && origem.type === 'click');

  // Pausar reconhecimento de voz se gravação estiver ativa
  if (isRecording && typeof pauseSpeechRecognition === 'function') {
    pauseSpeechRecognition();
  }

  try {
    cameraStatusText.textContent = 'Iniciando câmera...';
    cameraStatusText.style.color = '';
    cameraOverlay.classList.remove('hidden');

    cameraStream = await openCameraStreamWithFallback();

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
    // A moldura padroniza a apresentação do ticket; com o cabeçalho sempre do
    // mesmo lado, o OCR parte de uma orientação conhecida em vez de adivinhar.
    if (cameraFramingGuide) cameraFramingGuide.classList.remove('hidden');

    cameraStatusText.textContent = 'Câmera pronta! Deite o ticket na moldura, cabeçalho à direita, e clique em "Capturar Agora"';
    cameraStatusText.style.color = '#16a34a';

  } catch (error) {
    console.error('[Camera] Erro:', error);
    let msg = 'Erro ao acessar câmera';
    if (error.name === 'NotAllowedError') {
      // Mesmo caminho do microfone: levar o médico à página que libera. Antes o
      // painel só escrevia "negada" e a página de liberação ficava inalcançável.
      if (_deveAbrirPaginaPermissaoCamera(pedidoExplicito, _cameraPermissionPageOpened)) {
        _cameraPermissionPageOpened = true;
        msg = 'Permissão de câmera negada — abri a página para liberar.';
        Promise.resolve(openCameraPermissionPage()).catch(e => console.warn('[Camera] Não abriu a página de permissão:', e && e.message));
      } else {
        msg = 'Permissão de câmera negada. Clique em "Iniciar Câmera" para abrir a página de liberação.';
      }
    }
    else if (error.name === 'NotFoundError') msg = 'Câmera não encontrada.';
    else msg = error.message;
    cameraStatusText.textContent = msg;
    cameraStatusText.style.color = '#dc2626';
    cameraOverlay.classList.add('hidden');
    // Falhou: devolve o controle ao usuário e não deixa a voz pausada à toa.
    if (isRecording && isSpeechPausedByCamera && typeof resumeSpeechRecognition === 'function') {
      resumeSpeechRecognition();
    }
  } finally {
    _cameraStarting = false;
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
  if (cameraFramingGuide) cameraFramingGuide.classList.add('hidden');

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

/** Blob → base64 puro, SEM passar por canvas (zero perda de geração JPEG). */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// Prepara UMA captura em duas versões:
//   .api  → reduzida a maxDim, é o que vai no payload do Gemini (3 imagens
//           full-res estourariam o limite de inline data da API).
//   .full → o blob original em base64, intocado. Serve SOMENTE de fonte para o
//           recorte da REF.DATA no agente de OCR: recortar uma região pequena
//           da foto nativa preserva os dígitos que o downscale para 3840 e as
//           gerações de JPEG seguintes já tinham comido.
// Devolve também as dimensões, para o log distinguir "foto" de "preview".
async function prepareCaptureImage(blob, maxDim = 3840, quality = 0.98) {
  const full = await blobToBase64(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.width, srcH = img.height;
      let w = srcW, h = srcH;
      // Restringir pela maior dimensão (tickets TOPCON são portrait)
      const largest = Math.max(w, h);
      if (largest > maxDim) {
        const ratio = maxDim / largest;
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      // Sempre reencodar a versão do payload, mesmo quando as dimensões já
      // cabem: o JPEG nativo da câmera pode vir enorme, e são 3 imagens por
      // captura contra o limite de inline data da API. A geração extra de JPEG
      // não custa mais nada aqui — quem precisa de pixel fiel é o recorte, e o
      // recorte agora sai de `full`.
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const api = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      resolve({ api, full, srcW, srcH, outW: w, outH: h });
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

    // As capacidades de FOTO (imageWidth/imageHeight/fillLightMode) só existem em
    // getPhotoCapabilities(). track.getCapabilities() devolve MediaTrackCapabilities,
    // que tem width/height — ler `imageHeight` de lá dava SEMPRE undefined, então a
    // captura pedia 4032x3024 fixo; onde a câmera não suportava exatamente isso,
    // takePhoto rejeitava e caíamos silenciosamente no grabFrame, que entrega a
    // resolução do PREVIEW, não da foto.
    let photoCaps = null;
    try {
      photoCaps = await imageCapture.getPhotoCapabilities();
    } catch (e) {
      console.warn('[Camera] getPhotoCapabilities indisponível:', e.message);
    }
    const trackSettings = videoTrack.getSettings?.() || {};
    console.log(
      `[Camera] preview=${trackSettings.width || '?'}x${trackSettings.height || '?'} ` +
      `zoom=${trackSettings.zoom ?? 'n/a'} ` +
      `foto.max=${photoCaps?.imageWidth?.max || '?'}x${photoCaps?.imageHeight?.max || '?'}`
    );

    const NUM_CAPTURES = 3;
    const CAPTURE_DELAY = 200;  // +50ms entre capturas para estabilidade de foco
    const MAX_IMAGE_DIM = 3840; // teto do payload da API; o recorte usa a foto nativa
    const images = [];      // versões reduzidas → payload do Gemini
    const fullResImages = []; // fotos nativas → fonte do recorte da REF.DATA

    await new Promise(r => setTimeout(r, 1000)); // aguardar foco (era 800ms)
    updateProcessingStep(1);

    for (let i = 0; i < NUM_CAPTURES; i++) {
      let blob, via;
      try {
        const settings = {};
        if (photoCaps?.imageWidth?.max)  settings.imageWidth  = photoCaps.imageWidth.max;
        if (photoCaps?.imageHeight?.max) settings.imageHeight = photoCaps.imageHeight.max;
        if (photoCaps?.fillLightMode?.includes('auto')) settings.fillLightMode = 'auto';
        else if (photoCaps?.fillLightMode?.includes('flash')) settings.fillLightMode = 'flash';
        blob = await imageCapture.takePhoto(settings);
        via = 'takePhoto';
      } catch (e) {
        try {
          // Alguns drivers rejeitam QUALQUER photoSettings mas aceitam
          // takePhoto() puro — ainda é foto, e foto é melhor que preview.
          blob = await imageCapture.takePhoto();
          via = 'takePhoto(sem settings)';
        } catch (e2) {
          // Último recurso: frame do preview. Marcado no log porque explica
          // sozinho qualquer queda de legibilidade do ticket.
          const bmp = await imageCapture.grabFrame();
          const c = captureCanvas;
          c.width = bmp.width;
          c.height = bmp.height;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bmp, 0, 0);
          blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 1.0));
          via = `grabFrame(PREVIEW: ${e2.message})`;
        }
      }

      updateProcessingStep(2);
      const prepared = await prepareCaptureImage(blob, MAX_IMAGE_DIM);
      images.push(prepared.api);
      fullResImages.push(prepared.full);
      console.log(
        `[Camera] captura ${i + 1}/${NUM_CAPTURES} via=${via} ` +
        `nativa=${prepared.srcW}x${prepared.srcH} → payload=${prepared.outW}x${prepared.outH}`
      );

      if (i < NUM_CAPTURES - 1) await new Promise(r => setTimeout(r, CAPTURE_DELAY));
    }

    updateProcessingStep(3);

    // Enviar para Gemini (v5.2: single-call, sem TWO-PASS)
    updateProcessingStep(4);
    const examData = await window.GeminiService.extractExams(images, null, false, fullResImages);

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
      // Os avisos também valem aqui (v5.5.0): a captura falhou, mas "a foto tem
      // mais de um ticket" explica POR QUE ela falhou e muda o que o médico faz
      // na retentativa. Antes deste caminho chamar showExamWarnings, todo aviso
      // de uma captura reprovada morria no console. O motivo já está no banner
      // vermelho — não se repete na lista.
      showExamWarnings((validated._avisos || []).filter(a => a !== validated._reason));
      cameraStatusText.textContent = captureMode === 'estatica'
        ? 'Captura estática falhou — refaça (segue em modo Refração ESTÁTICA)'
        : 'Captura falhou — refaça';
      return;
    }

    // Caminho 1b (v5.4.0): a REFRAÇÃO foi bloqueada mas tono/paqui sobreviveram.
    // Antes isso caía no _captureFailed acima e o ticket inteiro era descartado
    // (log 2026-08-03 17:46: tono 15/17 e paqui 517/515, sem conflito nenhum
    // entre as leituras, perdidas por divergência no cilindro do OE). Agora o
    // que foi conferido é injetado e o médico vê por que a refração ficou fora.
    if (validated._refracaoBloqueada) {
      showRefractionBlockedMessage(
        validated._refracaoReason || 'Refração não pôde ser conferida.',
        captureMode
      );
    } else {
      document.getElementById('refractionBlockedBanner')?.remove();
    }

    // Avisos que não bloqueiam nada, mas incidem sobre valores que VÃO para o
    // prontuário (cilindro implícito pelo S.E., sinal não confirmado, etc.).
    showExamWarnings(validated._avisos);

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
  //
  // O `else` existe desde a v5.5.0: a seção só era REVELADA, nunca escondida, e
  // os campos guardam o valor da captura anterior. Uma foto sem TONO.DATA (ou
  // com a PIO descartada por estar fora da faixa) deixava a pressão do paciente
  // anterior na tela, com a aparência de ter sido lida agora. É o mesmo bug que
  // a refração já corrigiu na v5.4.0 — tono e paqui tinham ficado para trás.
  if (data.tonometria && (data.tonometria.od != null || data.tonometria.oe != null)) {
    tonometriaSection.classList.remove('hidden');
    document.getElementById('tonoOdField').value = data.tonometria.od != null ? data.tonometria.od : 'ERR';
    document.getElementById('tonoOeField').value = data.tonometria.oe != null ? data.tonometria.oe : 'ERR';
  } else {
    tonometriaSection.classList.add('hidden');
    document.getElementById('tonoOdField').value = '';
    document.getElementById('tonoOeField').value = '';
  }

  // Paquimetria
  if (data.paquimetria && (data.paquimetria.od != null || data.paquimetria.oe != null)) {
    paquimetriaSection.classList.remove('hidden');
    document.getElementById('paquiOdField').value = data.paquimetria.od != null ? data.paquimetria.od : 'ERR';
    document.getElementById('paquiOeField').value = data.paquimetria.oe != null ? data.paquimetria.oe : 'ERR';
  } else {
    paquimetriaSection.classList.add('hidden');
    document.getElementById('paquiOdField').value = '';
    document.getElementById('paquiOeField').value = '';
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
  } else {
    // Refração ausente ou bloqueada: esconder a seção e a opção de receita para
    // que valores de uma captura anterior não fiquem visíveis como se fossem
    // desta (v5.4.0 — antes, refracao nunca chegava aqui nula sem falha total).
    refracaoSection.classList.add('hidden');
    document.getElementById('receitaOculosOption')?.classList.add('hidden');
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

// v5.4.0 — Avisos da captura que NÃO bloqueiam a injeção.
//
// Até aqui nada no sidepanel renderizava _avisos/_validationWarnings: eles eram
// calculados e descartados, sobrando só no console. É onde mora a informação
// mais acionável da v5.4.0 — "o S.E. impresso implica C≈-1.00", "o sinal da
// esfera não foi confirmado" — sobre valores que FORAM para o prontuário.
const AVISOS_NAO_EXIBIDOS = [
  'Leituras independentes concordam com a 1ª.',
];

function showExamWarnings(avisos) {
  const existing = document.getElementById('examWarningsBanner');
  if (existing) existing.remove();

  const uteis = (avisos || []).filter(a =>
    a && !AVISOS_NAO_EXIBIDOS.includes(a) &&
    // o motivo do bloqueio já aparece, em destaque, no banner âmbar
    !a.startsWith('Refração NÃO injetada —')
  );
  if (uteis.length === 0) return;

  const banner = document.createElement('div');
  banner.id = 'examWarningsBanner';
  const box = document.createElement('div');
  box.setAttribute('style', 'background:#1e3a5f;border:1px solid #3b82f6;border-radius:8px;padding:10px 12px;margin:10px 0;color:#eff6ff');
  const titulo = document.createElement('div');
  titulo.setAttribute('style', 'font-weight:700;font-size:12px;margin-bottom:6px');
  titulo.textContent = uteis.length === 1 ? 'Confira este ponto' : 'Confira estes pontos';
  box.appendChild(titulo);
  const lista = document.createElement('ul');
  lista.setAttribute('style', 'margin:0;padding-left:16px;font-size:11px;line-height:1.5;opacity:0.95');
  uteis.forEach(a => {
    const li = document.createElement('li');
    li.textContent = a;   // textContent: os avisos carregam aspas e sinais
    lista.appendChild(li);
  });
  box.appendChild(lista);
  banner.appendChild(box);

  // Abaixo do banner de falha, quando os dois aparecem juntos. Sem incluir o
  // banner vermelho aqui, os avisos azuis são inseridos no mesmo ponto de
  // ancoragem que ele acabou de ocupar e acabam ACIMA de "Captura inválida" —
  // a lista de conferência aparecendo antes do motivo de a captura ter falhado.
  const anchor = document.getElementById('refractionBlockedBanner')
    || document.getElementById('refractionWarningBanner')
    || document.getElementById('examFieldsContainer');
  if (anchor?.parentNode) {
    anchor.parentNode.insertBefore(banner, anchor.nextSibling);
  } else {
    document.body.appendChild(banner);
  }
}

// v5.4.0 — Banner NÃO-fatal: a refração não passou na conferência, mas
// tonometria/paquimetria da mesma captura foram injetadas. Cor âmbar (e não
// vermelha) porque parte do trabalho foi aproveitada; o botão de refazer segue
// disponível para quem quiser o grau.
// Monta um banner de falha com botão de refazer, SEM innerHTML.
//
// `reason` carrega texto que veio do OCR — valores lidos do papel, mensagens
// montadas com o que o modelo transcreveu. showExamWarnings já usava
// textContent exatamente por isso; estes dois banners tinham ficado com
// innerHTML e interpolação direta. Conteúdo lido de uma imagem é dado, não
// marcação: escrever com textContent é o que garante que continue sendo dado.
function _buildFailureBanner({ id, titulo, reason, dica, cores, retryMode }) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = id;

  const box = document.createElement('div');
  box.setAttribute('style', `background:${cores.fundo};border:1px solid ${cores.borda};border-radius:8px;padding:12px 14px;margin:10px 0;color:${cores.texto}`);

  const tit = document.createElement('div');
  tit.setAttribute('style', 'font-weight:700;font-size:13px;margin-bottom:6px');
  tit.textContent = titulo;
  box.appendChild(tit);

  const motivo = document.createElement('div');
  motivo.setAttribute('style', 'font-size:12px;opacity:0.95;margin-bottom:8px');
  motivo.textContent = reason;
  box.appendChild(motivo);

  const ajuda = document.createElement('div');
  ajuda.setAttribute('style', 'font-size:11px;opacity:0.8;margin-bottom:10px');
  ajuda.textContent = dica;
  box.appendChild(ajuda);

  const btn = document.createElement('button');
  btn.setAttribute('style', 'width:100%;background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:8px;font-size:13px;font-weight:600;cursor:pointer');
  btn.textContent = 'Refazer captura';
  btn.addEventListener('click', () => {
    banner.remove();
    // Preservar o modo original: se a captura que falhou era estática
    // (pós-dilatação), a retentativa precisa rearmar a estática — senão volta ao
    // normal e o grau dilatado vaza para a receita/refração dinâmica via
    // injectAll.
    if (retryMode === 'estatica' && typeof startCameraCaptureEstatica === 'function') {
      startCameraCaptureEstatica();
    } else if (typeof startCameraCapture === 'function') {
      startCameraCapture();
    }
  });
  box.appendChild(btn);

  banner.appendChild(box);

  const container = document.getElementById('examFieldsContainer');
  if (container?.parentNode) {
    container.parentNode.insertBefore(banner, container.nextSibling);
  } else {
    document.body.appendChild(banner);
  }
  return banner;
}

function showRefractionBlockedMessage(reason, retryMode = 'normal') {
  _buildFailureBanner({
    id: 'refractionBlockedBanner',
    titulo: 'Refração não injetada',
    reason,
    dica: 'Tonometria e paquimetria desta captura foram injetadas normalmente. ' +
          'Refaça a foto se quiser o grau, ou digite a refração manualmente.',
    cores: { fundo: '#78350f', borda: '#d97706', texto: '#fffbeb' },
    retryMode
  });
}

function showCaptureFailedMessage(reason, retryMode = 'normal') {
  _buildFailureBanner({
    id: 'refractionWarningBanner',
    titulo: 'Captura inválida',
    reason,
    dica: 'Dicas: deite o ticket preenchendo a moldura, com o cabeçalho (data / ' +
          'REF.DATA) do lado marcado, evite reflexos no papel térmico e ' +
          'verifique se o ticket está plano.',
    cores: { fundo: '#7c2d12', borda: '#dc2626', texto: '#fef2f2' },
    retryMode
  });
}
