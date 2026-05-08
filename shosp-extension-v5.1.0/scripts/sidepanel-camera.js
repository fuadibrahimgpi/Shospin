/**
 * ============================================================================
 * SIDEPANEL — MÓDULO DE CÂMERA (Captura de Exames)
 * ============================================================================
 * Validação de refração, permissão de câmera, captura burst, OCR via Gemini,
 * exibição de resultados e aviso de refração suspeita.
 * Depende de: sidepanel-constants.js, sidepanel-injection.js (injectAll)
 */

// ============================================================================
// VALIDAÇÃO CLÍNICA — OD/OE
// ============================================================================

function validateAndFixEyeSwap(data) {
  if (!data) return data;

  let hasSuspiciousData = false;
  const warnings = [];

  // --- Sanitização de domínio ---
  if (data.refracao) {
    ['od', 'oe'].forEach(olho => {
      const d = data.refracao[olho];
      if (!d || typeof d !== 'object') return;

      // Cilindro positivo → TOPCON usa sempre convenção negativa.
      // Positivo = sinal de menos perdido na leitura; negamos o valor (não descartamos).
      if (d.cil !== null && d.cil !== undefined) {
        const cilNum = parseFloat(d.cil);
        if (!isNaN(cilNum) && cilNum > 0) {
          warnings.push(`${olho.toUpperCase()}: CIL positivo convertido para negativo (${cilNum} → ${-cilNum})`);
          d.cil = -cilNum;
        }
      }

      // Par CIL/EIXO incompleto
      const temCil = d.cil !== null && d.cil !== undefined;
      const temEixo = d.eixo !== null && d.eixo !== undefined;
      if (temCil && !temEixo) {
        warnings.push(`${olho.toUpperCase()}: CIL sem EIXO — par anulado`);
        d.cil = null;
        hasSuspiciousData = true;
      } else if (!temCil && temEixo) {
        warnings.push(`${olho.toUpperCase()}: EIXO sem CIL — par anulado`);
        d.eixo = null;
        hasSuspiciousData = true;
      }

      // Eixo fora de 1–180 (TOPCON nunca imprime eixo=0 ou negativo)
      if (d.eixo != null) {
        const eixo = parseInt(d.eixo);
        if (isNaN(eixo) || eixo < 1 || eixo > 180) {
          warnings.push(`${olho.toUpperCase()}: Eixo ${d.eixo} inválido — CIL e EIXO anulados`);
          d.eixo = null;
          d.cil  = null; // CIL sem eixo válido é injetável mas clinicamente incorreto
          hasSuspiciousData = true;
        } else {
          d.eixo = eixo; // manter como número; parseRefEixo em content.js faz o arredondamento
        }
      }
    });
  }

  // --- Validação de Equivalente Esférico (S.E.) ---
  if (data.refracao) {
    ['od', 'oe'].forEach(olho => {
      const d = data.refracao[olho];
      if (!d || typeof d !== 'object') return;
      if (d.se == null || d.esf == null) return;

      const esf = d.esf === 'plano' ? 0 : parseFloat(d.esf);
      const cil = d.cil != null ? parseFloat(d.cil) : 0;
      const seReportado = parseFloat(d.se);
      if (isNaN(esf) || isNaN(seReportado)) return;

      const seCalculado = esf + (cil / 2);
      const diff = Math.abs(seReportado - seCalculado);

      if (diff > 0.51) {
        // SE inconsistente com ESF+CIL → descartar SE (campo derivado, mais sujeito a alucinação).
        // NUNCA nulificar CIL/EIXO por causa de SE — ESF/CIL são medições primárias do TOPCON.
        // Em SINGLE-PASS, o SE é frequentemente inventado com sinal trocado ou valor absurdo.
        warnings.push(`${olho.toUpperCase()}: SE ${seReportado} inconsistente com ESF+CIL (calc=${seCalculado.toFixed(2)}) — SE descartado`);
        d.se = null;
      }
    });
  }

  // --- Validação de refração: valores absurdos, idênticos, próximos ---
  if (data.refracao) {
    // Tratar strings como null
    if (typeof data.refracao.od === 'string') data.refracao.od = null;
    if (typeof data.refracao.oe === 'string') data.refracao.oe = null;

    const od = data.refracao.od;
    const oe = data.refracao.oe;

    // Sanity check: valores absurdos
    const checkAbsurd = (eye, name) => {
      if (!eye || typeof eye !== 'object') return false;
      const cil = eye.cil ? parseFloat(eye.cil) : 0;
      const esf = eye.esf === 'plano' ? 0 : parseFloat(eye.esf);
      if (Math.abs(cil) > 7.00 || Math.abs(esf) > 20.00) {
        warnings.push(`${name} DESCARTADO: Valores absurdos detectados`);
        return true;
      }
      return false;
    };

    if (checkAbsurd(od, 'OD')) { data.refracao.od = null; hasSuspiciousData = true; }
    if (checkAbsurd(oe, 'OE')) { data.refracao.oe = null; hasSuspiciousData = true; }

    // Comparação OD vs OE (se ambos ainda existem)
    if (data.refracao.od && data.refracao.oe &&
        typeof data.refracao.od === 'object' && typeof data.refracao.oe === 'object') {

      const odR = data.refracao.od;
      const oeR = data.refracao.oe;
      const areIdentical = odR.esf === oeR.esf && odR.cil === oeR.cil && odR.eixo === oeR.eixo;
      const isSimple = !odR.cil && !oeR.cil;

      if (areIdentical && !isSimple) {
        // Verificar linhas brutas do OCR
        if (data.debug_leitura?.linha_od_texto && data.debug_leitura?.linha_oe_texto) {
          const norm = (t) => (t || '').replace(/<[RL]>/gi, '').replace(/\b(OD|OE|R|L|RE|LE|RIGHT|LEFT)\b/gi, '').replace(/[\s.\-:]+/g, '').toLowerCase();
          if (norm(data.debug_leitura.linha_od_texto) === norm(data.debug_leitura.linha_oe_texto)) {
            warnings.push('OD e OE com texto raw idêntico — provável cópia da IA');
            data._blockAutoInject = true;
          } else {
            warnings.push('OD e OE idênticos, mas linhas brutas distintas — astigmatismo simétrico confirmado');
          }
        } else {
          const geminiSinalizou = data.refracao.oe?._copiaOD === true || data._aviso_inversao === true;
          if (geminiSinalizou) {
            warnings.push('Gemini sinalizou incerteza na leitura. Injeção bloqueada.');
          } else {
            warnings.push('OD e OE idênticos — sem linhas brutas para confirmar');
          }
          data._blockAutoInject = true;
        }
        hasSuspiciousData = true;
      }

      // Nível 2: valores muito parecidos
      if (!areIdentical && odR.cil && oeR.cil && odR.eixo && oeR.eixo) {
        const diffEsf = (odR.esf && oeR.esf)
          ? Math.abs((odR.esf === 'plano' ? 0 : parseFloat(odR.esf)) - (oeR.esf === 'plano' ? 0 : parseFloat(oeR.esf)))
          : 99;
        const diffCil = Math.abs(parseFloat(odR.cil) - parseFloat(oeR.cil));
        const diffEixo = Math.abs(parseInt(odR.eixo) - parseInt(oeR.eixo));
        if (diffEsf <= 0.25 && diffCil <= 0.25 && diffEixo <= 15) {
          warnings.push('OD e OE com refrações muito parecidas — verifique astigmatismo simétrico');
        }
      }
    }
  }

  if (hasSuspiciousData) {
    data._validationWarnings = warnings;
    data._hasSuspiciousData = true;
  }

  // --- Validação de paquimetria: faixa clínica 420–650 µm ---
  if (data.paquimetria) {
    ['od', 'oe'].forEach(olho => {
      const val = data.paquimetria[olho];
      if (val != null) {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (!isNaN(num) && (num < 420 || num > 650)) {
          warnings.push(`${olho.toUpperCase()}: Paquimetria ${num}µm fora da faixa válida (420–650) — descartada`);
          data.paquimetria[olho] = null;
          data._hasSuspiciousData = true;
        }
      }
    });
  }

  if (data._hasSuspiciousData) {
    data._validationWarnings = warnings;
  }

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
}

// ============================================================================
// COMPRESSÃO DE IMAGEM
// ============================================================================

async function compressImageBlob(blob, maxDim = 2048, quality = 0.88) {
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

  try {
    processingOverlay.classList.remove('hidden');
    startProcessingTimer();
    updateProcessingStep(0);

    const videoTrack = cameraStream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(videoTrack);
    const capabilities = imageCapture.track.getCapabilities();

    const NUM_CAPTURES = 3;
    const CAPTURE_DELAY = 200;  // +50ms entre capturas para estabilidade de foco
    const MAX_IMAGE_DIM = 2048; // resolução alta para dígitos de ticket térmico legíveis
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

    // Enviar para Gemini
    const examData = await window.GeminiService.extractExamsTwoPass(images, (phase) => {
      if (phase === 'pass2') updateProcessingStep(4);
    });

    updateProcessingStep(5);

    // Validar
    const validated = validateAndFixEyeSwap(examData);

    if (examData._aviso_inversao === true) {
      validated._blockAutoInject = true;
      validated._validationWarnings = validated._validationWarnings || [];
      validated._validationWarnings.push('A IA sinalizou possível inversão OD/OE — verifique com o ticket físico.');
    }

    updateProcessingStep(6);
    displayCameraResults(validated);
    cameraStatusText.textContent = 'Processamento concluído!';

    // Desligar câmera após processamento
    stopProcessingTimer();
    stopCameraCapture();
    processingOverlay.classList.add('hidden');

    // Auto-injeção: câmera injeta SOMENTE seus próprios dados.
    // Nunca inclui audioData — o áudio tem seu próprio ciclo (termina com stopRecording).
    // Misturar os dois causaria clearAll no audioData durante gravação ativa.
    if (validated._blockAutoInject) {
      // Injeção SUSPENSA — o banner gerencia (botões Confirmar / Inverter / Limpar).
      // NÃO chamar injectAll() aqui: causaria dupla injeção quando o usuário confirmasse.
      showRefractionSuspectWarning(validated._validationWarnings || [], validated);
    } else if (cameraData) {
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
// AVISO DE REFRAÇÃO SUSPEITA
// ============================================================================

function showRefractionSuspectWarning(warnings, data) {
  const existing = document.getElementById('refractionWarningBanner');
  if (existing) existing.remove();

  pendingRefractionConfirmation = true;

  const warningLines = (warnings || []).map(w => `<li style="margin:2px 0">${w}</li>`).join('');

  let rawLinesHtml = '';
  if (data.debug_leitura) {
    rawLinesHtml = `
      <div style="margin-top:8px;padding:6px 8px;background:#1a1a1a;border-radius:4px;font-family:monospace;font-size:11px;color:#e2e8f0">
        <div><span style="color:#94a3b8">OD lido: </span>${data.debug_leitura.linha_od_texto || '—'}</div>
        <div><span style="color:#94a3b8">OE lido: </span>${data.debug_leitura.linha_oe_texto || '—'}</div>
      </div>`;
  }

  let inversaoHtml = '';
  if (data._raciocinio_inversao) {
    inversaoHtml = `
      <div style="margin-top:8px;padding:6px 8px;background:#1c1917;border-radius:4px;font-size:11px;color:#d4d4d4">
        <div style="color:#94a3b8;margin-bottom:2px">Como a IA identificou OD/OE:</div>
        <div style="font-style:italic">${data._raciocinio_inversao}</div>
      </div>`;
  }

  const banner = document.createElement('div');
  banner.id = 'refractionWarningBanner';
  banner.innerHTML = `
    <div style="background:#7c2d12;border:1px solid #dc2626;border-radius:8px;padding:12px 14px;margin:10px 0;color:#fef2f2">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">Refração suspeita — injeção pausada</div>
      <ul style="margin:0;padding-left:16px;font-size:11px;opacity:0.9">${warningLines}</ul>
      ${rawLinesHtml}
      ${inversaoHtml}
      <div style="margin-top:8px;font-size:11px;opacity:0.8">Compare os valores acima com o ticket físico antes de decidir.</div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <button id="confirmRefractionBtn" style="flex:1;min-width:90px;background:#166534;color:#fff;border:none;border-radius:6px;padding:7px 6px;font-size:12px;font-weight:600;cursor:pointer">Corretos — injetar</button>
        <button id="swapRefractionBtn" style="flex:1;min-width:90px;background:#92400e;color:#fff;border:none;border-radius:6px;padding:7px 6px;font-size:12px;font-weight:600;cursor:pointer">Inverter OD↔OE e injetar</button>
        <button id="clearRefractionBtn" style="flex:1;min-width:90px;background:#7f1d1d;color:#fff;border:none;border-radius:6px;padding:7px 6px;font-size:12px;font-weight:600;cursor:pointer">Limpar refração e injetar</button>
      </div>
    </div>`;

  const container = document.getElementById('examFieldsContainer');
  if (container?.parentNode) {
    container.parentNode.insertBefore(banner, container.nextSibling);
  } else {
    document.body.appendChild(banner);
  }

  document.getElementById('confirmRefractionBtn').addEventListener('click', async () => {
    pendingRefractionConfirmation = false;
    banner.remove();
    try { await injectAll(); } catch (e) { console.error('[Refraction] Erro:', e); }
  });

  document.getElementById('swapRefractionBtn').addEventListener('click', async () => {
    pendingRefractionConfirmation = false;
    banner.remove();
    // Troca OD↔OE nos dados e nos campos do sidepanel
    if (cameraData?.refracao) {
      const tmp = cameraData.refracao.od;
      cameraData.refracao.od = cameraData.refracao.oe;
      cameraData.refracao.oe = tmp;
      // Atualizar campos visuais
      document.getElementById('refOdEsf').value = formatEsf(cameraData.refracao.od?.esf);
      document.getElementById('refOdCil').value = formatCil(cameraData.refracao.od?.cil);
      document.getElementById('refOdEixo').value = cameraData.refracao.od?.eixo != null ? cameraData.refracao.od.eixo + '°' : '';
      document.getElementById('refOeEsf').value = formatEsf(cameraData.refracao.oe?.esf);
      document.getElementById('refOeCil').value = formatCil(cameraData.refracao.oe?.cil);
      document.getElementById('refOeEixo').value = cameraData.refracao.oe?.eixo != null ? cameraData.refracao.oe.eixo + '°' : '';
    }
    try { await injectAll(); } catch (e) { console.error('[Refraction] Erro inverso:', e); }
  });

  document.getElementById('clearRefractionBtn').addEventListener('click', async () => {
    pendingRefractionConfirmation = false;
    banner.remove();
    ['refOdEsf', 'refOdCil', 'refOdEixo', 'refOeEsf', 'refOeCil', 'refOeEixo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    if (cameraData?.refracao) { cameraData.refracao.od = null; cameraData.refracao.oe = null; }
    if (cameraData) cameraData.injectReceita = false;
    try { await injectAll(); } catch (e) { console.error('[Refraction] Erro:', e); }
  });
}
