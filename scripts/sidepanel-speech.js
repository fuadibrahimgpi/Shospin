/**
 * SIDEPANEL — Silêncio e Web Speech API
 * Parte de sidepanel-audio.js dividido por responsabilidade (conteúdo inalterado).
 * Carregado logo após sidepanel-audio.js (ver sidepanel.html). Depende de: sidepanel-constants.js
 */

// ============================================================================
// AUTO-STOP POR SILÊNCIO PROLONGADO
// ============================================================================

const SILENCE_MIN_SESSION_MS = 90_000;  // sessão deve ter pelo menos 90s
const SILENCE_MIN_WORDS      = 40;      // mínimo de palavras capturadas
// 3 min: o limite anterior (45s) encerrou consulta NO MEIO do exame — caso
// real 2026-07-03: tonometria/refração geraram 51s de silêncio e o auto-stop
// disparou antes de conduta/tratamento serem ditados. Fases silenciosas de
// exame duram 1–2 min; 3 min mantém a rede de segurança contra gravação
// esquecida sem cortar a consulta em andamento.
const SILENCE_THRESHOLD_MS   = 180_000; // 3 min sem fala dispara o aviso
const SILENCE_WARN_MS        = 5_000;   // 5s de aviso antes de parar

function _checkSilence() {
  if (!AppState.isRecording || AppState.stopCommandTimeout || AppState.dilatacaoDetectada || AppState.silencePendingStop) return;
  if (AppState.isSpeechPausedByCamera) return;

  if (Date.now() - AppState.sessionStartTime < SILENCE_MIN_SESSION_MS) return;

  const wordCount = AppState.recognizedText.trim() ? AppState.recognizedText.trim().split(/\s+/).length : 0;
  if (wordCount < SILENCE_MIN_WORDS) return;

  const silenceMs = Date.now() - AppState.lastSpeechTime;
  if (silenceMs < SILENCE_THRESHOLD_MS) return;

  dbg(`[Silence] ${Math.round(silenceMs / 1000)}s sem fala (${wordCount} palavras) — agendando encerramento`);
  statusText.textContent = 'Silêncio prolongado — encerrando em 5s (fale para cancelar)';
  statusText.style.color = '#16a34a';

  AppState.silencePendingStop = setTimeout(() => {
    AppState.silencePendingStop = null;
    if (AppState.isRecording && !AppState.stopCommandTimeout) {
      dbg('[Silence] Auto-stop por silêncio — encerrando consulta');
      StateManager.setHookFlag('consultaEncerradaDetectada', true);
      stopRecording();
    }
  }, SILENCE_WARN_MS);
}

// ============================================================================
// WEB SPEECH API — RECONHECIMENTO EM TEMPO REAL
// ============================================================================

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    statusText.textContent = '⚠️ Navegador não suporta reconhecimento de voz';
    statusText.style.color = '#dc2626';
    console.error('[Speech] Web Speech API não disponível neste navegador.');
    return;
  }

  // recentTextBuffer e recentTextTimeout são globais (sidepanel-constants.js)
  // — declará-los localmente apagaria o buffer entre restarts do Speech API.

  try {
    AppState.speechRecognition = new SpeechRecognition();
    AppState.speechRecognition.continuous = true;
    AppState.speechRecognition.interimResults = true;
    AppState.speechRecognition.lang = 'pt-BR';

    AppState.speechRecognition.onstart = () => {
      AppState.isSpeechActive = true;
      dbg('[Speech] Reconhecimento de voz iniciado.');
    };

    AppState.speechRecognition.onresult = (event) => {
      // Fala detectada — resetar contador de no-speech e timestamp de silêncio
      AppState.noSpeechCount = 0;
      AppState.lastSpeechTime = Date.now();
      if (AppState.silencePendingStop) {
        clearTimeout(AppState.silencePendingStop);
        AppState.silencePendingStop = null;
        if (AppState.isRecording && !AppState.stopCommandTimeout) {
          statusText.textContent = 'Gravando...';
          statusText.style.color = '#ef4444';
        }
      }

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      AppState.recognizedText = (AppState.recognizedText + ' ' + finalTranscript).trim();

      // ── Normalizar texto para detecção (remove acentos, lowercase) ──
      const normalizedFinal = normalizeText(AppState.recognizedText);
      const normalizedCurrent = normalizeText(AppState.recognizedText + ' ' + interimTranscript);

      // ── Buffer de texto recente (últimas 500 chars) — protege contra restart do Speech API ──
      AppState.recentTextBuffer = normalizedCurrent.slice(-500);
      if (AppState.recentTextTimeout) clearTimeout(AppState.recentTextTimeout);
      AppState.recentTextTimeout = setTimeout(() => { AppState.recentTextBuffer = ''; }, 15000);

      // ── Execução dos hooks registrados ──
      // O runner itera por prioridade: flags → injects → stops.
      // Hooks 'inject' e 'stop' interrompem o loop após disparar.
      if (finalTranscript) {
        dbg('[Speech] Final:', normalizedFinal.slice(-120));
      }
      runHooks(normalizedFinal, normalizedCurrent, AppState.recentTextBuffer);

      // Mostrar status de exame em andamento em tempo real (só se nenhum stop agendado)
      if (!AppState.stopCommandTimeout && ClinicalTriggers.detectaExameEmAndamento(AppState.recentTextBuffer)) {
        statusText.textContent = 'Exame em andamento...';
        statusText.style.color = '#eab308';
      }

    }; // fim do speechRecognition.onresult

    AppState.speechRecognition.onerror = (event) => {
      AppState.isSpeechActive = false;
      if (event.error === 'no-speech') {
        AppState.noSpeechCount++;
        // Suprimir log após o 1º erro para não poluir o console
        if (AppState.noSpeechCount <= 1) {
          dbg('[Speech] Nenhuma fala detectada. Aguardando...');
        }
        // Backoff: após 5 erros consecutivos sem fala, pausar o reconhecimento.
        // Reinicia explicitamente após 3 s para não perder frases ditas durante a pausa
        // (sem o restart, o Speech fica parado até o próximo onend — que nunca chega).
        if (AppState.noSpeechCount >= 5) {
          dbg(`[Speech] ${AppState.noSpeechCount} erros no-speech consecutivos — pausando reconhecimento por 3s.`);
          AppState.isSpeechBackingOff = true; // Ativar trava de backoff
          try { AppState.speechRecognition.stop(); } catch (e) { /* ignorar */ }
          setTimeout(() => {
            AppState.isSpeechBackingOff = false; // Desativar trava de backoff
            AppState.noSpeechCount = 0; // reset para nova janela de tentativas
            // Reiniciar só se ainda estiver gravando, sem stop agendado e sem pausa por câmera
            if (AppState.isRecording && AppState.speechRecognition && !AppState.stopCommandTimeout && !AppState.isSpeechPausedByCamera && !AppState.isSpeechActive) {
              try {
                AppState.speechRecognition.start();
                AppState.isSpeechActive = true;
              } catch (e) { /* já ativo */ }
            }
          }, 3000);
          return;
        }
        // Reinicia imediatamente sem esperar onend
        try { AppState.speechRecognition.stop(); } catch (e) { /* ignorar */ }
      } else {
        console.error('[Speech] Erro:', event.error);
        const _errosMapeados = {
          'audio-capture': 'Microfone desconectado durante gravação',
          'network':       'Erro de rede no reconhecimento de voz',
          'not-allowed':   'Permissão de microfone revogada',
          'aborted':       'Reconhecimento de voz interrompido',
        };
        const _msg = _errosMapeados[event.error] || `Erro de voz: ${event.error}`;
        statusText.textContent = _msg;
        statusText.style.color = '#dc2626';

        // Auto-recuperação para erros de hardware/transientes (ex: interrupção por getUserMedia)
        // speechRecoveryTimer é cancellable — evita acúmulo de timers em erros repetidos.
        if (AppState.isRecording && !AppState.stopCommandTimeout && !AppState.isSpeechPausedByCamera) {
          clearTimeout(AppState.speechRecoveryTimer);
          AppState.speechRecoveryTimer = setTimeout(() => {
            AppState.speechRecoveryTimer = null;
            if (AppState.isRecording && AppState.speechRecognition && !AppState.stopCommandTimeout && !AppState.isSpeechPausedByCamera && !AppState.isSpeechActive) {
              try {
                AppState.speechRecognition.start();
                AppState.isSpeechActive = true;
                statusText.textContent = 'Gravando...';
                statusText.style.color = '#ef4444';
                statusText.style.fontWeight = 'bold';
              } catch (e) {
                console.warn('[Speech] Falha ao auto-recuperar:', e.message);
              }
            }
          }, 1500);
        }
      }
    };

    AppState.speechRecognition.onend = () => {
      AppState.isSpeechActive = false;
      dbg('[Speech] Reconhecimento de voz encerrado.');
      
      // Não reiniciar o speech se um comando de parada já foi agendado, se está pausado pela câmera ou em backoff.
      if (AppState.isRecording && AppState.speechRecognition && !AppState.stopCommandTimeout && !AppState.isSpeechPausedByCamera && !AppState.isSpeechBackingOff) {
        setTimeout(() => {
          if (AppState.isRecording && AppState.speechRecognition && !AppState.stopCommandTimeout && !AppState.isSpeechPausedByCamera && !AppState.isSpeechActive) {
            try {
              AppState.speechRecognition.start();
              AppState.isSpeechActive = true;
            } catch (e) {
              console.warn('[Speech] Erro ao tentar reiniciar no onend:', e.message);
            }
          }
        }, 300);
      }
    };

    AppState.speechRecognition.start();
  } catch (error) {
    console.error('[Speech] Erro ao iniciar:', error);
  }
}

function stopSpeechRecognition() {
  if (AppState.speechRecognition) {
    try {
      AppState.speechRecognition.stop();
    } catch (e) { /* já parado */ }
    AppState.speechRecognition = null;
    AppState.isSpeechActive = false;
  }
}

function pauseSpeechRecognition() {
  if (!AppState.isRecording) return;
  // Apenas sinaliza que a câmera está ativa — NÃO para o Speech API.
  // A câmera usa apenas vídeo (sem audio:true no getUserMedia), portanto não
  // há conflito de microfone. Parar o reconhecimento durante a câmera causava
  // perda do texto da consulta e rejeição por "áudio muito curto" ao retomar.
  AppState.isSpeechPausedByCamera = true;
  dbg('[Speech] Câmera ativa — reconhecimento de voz continua (câmera é vídeo-only).');
}

function resumeSpeechRecognition() {
  if (!AppState.isRecording) {
    AppState.isSpeechPausedByCamera = false;
    return;
  }
  AppState.isSpeechPausedByCamera = false;
  dbg('[Speech] Reconhecimento retomado após fechar câmera.');

  if (AppState.speechRecognition && !AppState.isSpeechActive && !AppState.stopCommandTimeout) {
    try {
      AppState.speechRecognition.start();
      AppState.isSpeechActive = true;
      statusText.textContent = 'Gravando...';
      statusText.style.color = '#ef4444';
      statusText.style.fontWeight = 'bold';
    } catch (e) {
      console.warn('[Speech] Erro ao retomar reconhecimento:', e.message);
    }
  }
}

// detectTrigger e detectFlag foram movidos para sidepanel-hook-runner.js
// como lógica interna do runner. Para adicionar gatilhos, editar sidepanel-hooks.js.
