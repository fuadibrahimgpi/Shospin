/**
 * ============================================================================
 * SIDEPANEL — MÓDULO DE ÁUDIO (Entrevista)
 * ============================================================================
 * Permissão de microfone, gravação, Web Speech API, processamento Gemini,
 * detecção de gatilhos de voz, timer e exibição de resultados.
 * Depende de: sidepanel-constants.js
 *
 * v4.1 — Correções:
 *   - Race condition speech/mediaRecorder corrigida (v4.0.1)
 *   - Detecção de gatilhos agora usa normalizeText() (remove acentos)
 *   - Ordem de prioridade: blefarite > exames normais (evita conflito)
 *   - Flags passivas (catarata/LIO/cápsula) verificadas ANTES dos gatilhos
 *     de injeção, para que a lente dinâmica já esteja correta
 */

// ============================================================================
// PERMISSÃO DE MICROFONE
// ============================================================================

async function checkMicrophonePermission() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    if (result.state === 'granted') {
      AppState.permissionChecked = true;
      statusText.textContent = 'Clique para iniciar o ditado';
    } else if (result.state === 'denied') {
      statusText.textContent = 'Permissão de microfone necessária';
      statusText.style.color = '#dc2626';
    }
    result.onchange = () => {
      if (result.state === 'granted') {
        AppState.permissionChecked = true;
        statusText.textContent = 'Clique para iniciar o ditado';
      }
    };
  } catch (e) {
    dbg('[Mic] Não foi possível verificar permissão:', e);
  }
}

function openPermissionPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
}

// ============================================================================
// GRAVAÇÃO
// ============================================================================

const TOGGLE_DEBOUNCE_MS = 1000;

async function toggleRecording() {
  const now = Date.now();
  if (now - AppState._lastToggleTime < TOGGLE_DEBOUNCE_MS) {
    dbg('[Audio] toggleRecording ignorado — debounce ativo');
    return;
  }
  AppState._lastToggleTime = now;

  if (AppState.isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    // Reutilizar stream existente ou criar novo
    if (!AppState.persistentStream || AppState.persistentStream.getTracks()[0].readyState === 'ended') {
      AppState.persistentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    AppState.permissionChecked = true;

    AppState.mediaRecorder = new MediaRecorder(AppState.persistentStream);
    AppState.audioChunks = [];

    // Resetar todo o estado de sessão via StateManager (flags, transcript, buffers, timers)
    StateManager.resetSession();

    // Proteção: cancelar stopCommandTimeout residual de sessão anterior
    // (pode sobreviver ao resetSession se foi agendado entre o reset e o start)
    if (AppState.stopCommandTimeout) {
      clearTimeout(AppState.stopCommandTimeout);
      AppState.stopCommandTimeout = null;
      dbg('[Audio] stopCommandTimeout residual cancelado ao iniciar nova sessão');
    }
    AppState.stopPendingInfo = null;
    AppState.stopGateOffset = 0;
    AppState.stopGateBlockCount = 0;

    // Fase 2 de dilatação: se há pausa persistida, esta gravação é o RETORNO
    // do paciente. Suprimir o hook de dilatação por voz nesta sessão — frases
    // retrospectivas do retorno ("já dilatou", "pinguei o colírio para dilatar
    // a pupila") re-disparavam a pausa e a consulta nunca fechava.
    // motivo='exame' (pausa manual no meio do exame, sem dilatação) NÃO
    // suprime: a dilatação ainda pode ser anunciada na sessão retomada.
    try {
      const _store = await new Promise(resolve =>
        chrome.storage.local.get('_shospDilatacaoPhase1', d => resolve(d._shospDilatacaoPhase1 || null))
      );
      if (_store && Date.now() - (_store.ts || 0) <= 6 * 60 * 60 * 1000 && _store.motivo !== 'exame') {
        StateManager.setHookFlag('fase2DilatacaoAtiva', true);
        dbg('[Audio] Fase 2 de dilatação — gatilho de dilatação por voz suprimido nesta sessão.');
      }
    } catch (_e) { /* storage indisponível — segue sem supressão */ }

    // Timestamp de início — usado para calcular duração mínima da sessão
    AppState.sessionStartTime = Date.now();
    AppState.lastSpeechTime = Date.now();
    if (AppState.silenceCheckInterval) clearInterval(AppState.silenceCheckInterval);
    AppState.silenceCheckInterval = setInterval(_checkSilence, 10_000);

    // Limpar explicitamente os campos de diagnóstico no DOM que foram poupados na consulta anterior
    if (diagnosticoField) diagnosticoField.value = '';
    if (diagnosticoRetornoField) diagnosticoRetornoField.value = '';

    AppState.mediaRecorder.ondataavailable = (event) => {
      AppState.audioChunks.push(event.data);
    };

    AppState.mediaRecorder.onstop = async () => {
      // Se é troca de modo, não processar
      if (AppState.isModeSwitching) {
        AppState.isModeSwitching = false;
        return;
      }

      // ── Guard de sessão mínima (anti-sessão-vazia) ──
      // Se a sessão durou menos de 3 segundos E não há texto reconhecido nem buffer,
      // descartar silenciosamente — evita enviar sessões acidentais ao Gemini.
      const MIN_SESSION_MS = 3000;
      const sessionElapsed = Date.now() - AppState.sessionStartTime;
      if (sessionElapsed < MIN_SESSION_MS && !AppState.recognizedText.trim() && !(AppState.recentTextBuffer && AppState.recentTextBuffer.trim())) {
        console.warn(`[Audio] Sessão muito curta (${Math.round(sessionElapsed / 1000)}s) sem texto — descartando.`);
        stopSpeechRecognition();
        statusText.textContent = 'Sessão descartada (muito curta)';
        statusText.style.color = '#eab308';
        statusText.style.fontWeight = 'normal';
        setTimeout(() => {
          statusText.textContent = 'Clique para iniciar o ditado';
          statusText.style.color = '';
        }, 3000);
        return;
      }

      // ── Solicitar parada imediata do Speech para forçar a finalização do buffer ──
      if (AppState.speechRecognition) {
        try {
          dbg('[Audio] Parando Speech Recognition no onstop para forçar flush de interim results...');
          AppState.speechRecognition.stop();
        } catch (e) {
          console.warn('[Audio] Erro ao parar Speech Recognition no onstop:', e);
        }
      }

      // ── Espera inteligente por resultados finais do Speech API ──
      const textBefore = AppState.recognizedText;
      const hasSpeech = (textBefore && textBefore.trim().length > 0) || (AppState.recentTextBuffer && AppState.recentTextBuffer.trim().length > 0);

      if (hasSpeech) {
        let waitedMs = 0;
        const POLL_INTERVAL = 100;
        const MAX_WAIT = 1500;

        while (waitedMs < MAX_WAIT) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL));
          waitedMs += POLL_INTERVAL;
          if (AppState.recognizedText !== textBefore) {
            dbg(`[Audio] Speech finalizado após ${waitedMs}ms.`);
            break;
          }
        }
      } else {
        dbg('[Audio] Nenhum som/fala detectado na sessão, pulando espera.');
      }

      // Parar de vez e limpar
      stopSpeechRecognition();

      const capturedText = AppState.recognizedText;
      if (capturedText && capturedText.trim().length > 0) {
        const words = capturedText.trim().split(/\s+/).length;
        dbg(`[Audio] Texto capturado para processamento (${words} palavras):`, capturedText.substring(0, 120) + (capturedText.length > 120 ? '…' : ''));
      } else {
        console.warn('[Audio] ⚠️ recognizedText está VAZIO ao parar — Speech API não produziu resultados finais nesta sessão.');
      }

      // Fallbacks de segurança: se o médico parou manualmente ANTES do Speech API
      // produzir resultado final, os hooks de dilatação/stop não terão disparado.
      // Só executam se o hook runner ainda não detectou (evita dupla detecção).
      const _finalNorm = normalizeText(capturedText);
      const _textToScan = _finalNorm || normalizeText(AppState.recentTextBuffer);

      if (!StateManager.getHookFlag('dilatacaoDetectada')) {
        // Na fase 2 (retorno da dilatação), narrações retrospectivas espalhadas
        // pela sessão não contam — só um comando na CAUDA (dito logo antes da
        // parada manual) indica uma NOVA pausa real de dilatação.
        const _dilScan = AppState.fase2DilatacaoAtiva ? _textToScan.slice(-300) : _textToScan;
        if (ClinicalTriggers.detectaDilatacaoNaFala(_dilScan)) {
          StateManager.setHookFlag('dilatacaoDetectada', true);
          dbg('[Audio] Dilatação detectada no fallback onstop');
        }
      }

      // Fallback de encerramento: despedida dita mas finalizada só após a parada
      // manual. Seta a flag para que o guard de "exame em andamento" não bloqueie
      // o processamento e o fallback de exames normais da injeção funcione.
      if (!StateManager.getHookFlag('consultaEncerradaDetectada') &&
          !StateManager.getHookFlag('dilatacaoDetectada')) {
        if (ClinicalTriggers.detectaEncerramentoNaFala(_textToScan)) {
          StateManager.setHookFlag('consultaEncerradaDetectada', true);
          dbg('[Audio] Encerramento de consulta detectado no fallback onstop');
        }
      }

      const audioBlob = new Blob(AppState.audioChunks, { type: 'audio/webm' });
      await processAudioInBackground(audioBlob, capturedText);
    };

    AppState.mediaRecorder.start();
    AppState.isRecording = true;

    startSpeechRecognition();

    recordBtn.classList.add('recording');
    statusText.textContent = 'Gravando...';
    statusText.style.color = '#ef4444';
    statusText.style.fontWeight = 'bold';
    timerText.classList.remove('hidden');
    startTimer();
    hideResults();

  } catch (error) {
    console.error('[Audio] Erro ao iniciar gravação:', error);
    if (error.name === 'NotAllowedError') {
      statusText.textContent = 'Abrindo página de permissão...';
      statusText.style.color = '#dc2626';
      openPermissionPage();
    } else if (error.name === 'NotFoundError') {
      statusText.textContent = 'Microfone não encontrado. Verifique a conexão.';
      statusText.style.color = '#dc2626';
    } else {
      statusText.textContent = 'Erro: ' + error.message;
      statusText.style.color = '#dc2626';
    }
  }
}

/**
 * stopRecording NÃO chama stopSpeechRecognition().
 * O speech é parado dentro do mediaRecorder.onstop, DEPOIS de capturar o texto.
 */
function stopRecording(keepStreamOpen = true) {
  AppState.isRecording = false;
  if (AppState.silenceCheckInterval) { clearInterval(AppState.silenceCheckInterval); AppState.silenceCheckInterval = null; }
  if (AppState.silencePendingStop) { clearTimeout(AppState.silencePendingStop); AppState.silencePendingStop = null; }

  if (AppState.mediaRecorder && AppState.mediaRecorder.state !== 'inactive') {
    AppState.mediaRecorder.stop();
    if (!keepStreamOpen) {
      AppState.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      AppState.persistentStream = null;
    }
  }

  recordBtn.classList.remove('recording');
  statusText.textContent = 'Processando...';
  statusText.style.color = '#3b82f6';
  statusText.style.fontWeight = 'normal';
  stopTimer();
}

function stopRecordingCompletely() {
  AppState.isRecording = false;
  if (AppState.silenceCheckInterval) { clearInterval(AppState.silenceCheckInterval); AppState.silenceCheckInterval = null; }
  if (AppState.silencePendingStop) { clearTimeout(AppState.silencePendingStop); AppState.silencePendingStop = null; }
  stopSpeechRecognition();
  if (AppState.mediaRecorder && AppState.mediaRecorder.state !== 'inactive') {
    AppState.mediaRecorder.stop();
    AppState.mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  if (AppState.persistentStream) {
    AppState.persistentStream.getTracks().forEach(track => track.stop());
    AppState.persistentStream = null;
  }
}
