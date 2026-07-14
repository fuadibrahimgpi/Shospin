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
      permissionChecked = true;
      statusText.textContent = 'Clique para iniciar o ditado';
    } else if (result.state === 'denied') {
      statusText.textContent = 'Permissão de microfone necessária';
      statusText.style.color = '#dc2626';
    }
    result.onchange = () => {
      if (result.state === 'granted') {
        permissionChecked = true;
        statusText.textContent = 'Clique para iniciar o ditado';
      }
    };
  } catch (e) {
    console.log('[Mic] Não foi possível verificar permissão:', e);
  }
}

function openPermissionPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
}

// ============================================================================
// GRAVAÇÃO
// ============================================================================

let _lastToggleTime = 0;
const TOGGLE_DEBOUNCE_MS = 1000;
let sessionStartTime = 0;

async function toggleRecording() {
  const now = Date.now();
  if (now - _lastToggleTime < TOGGLE_DEBOUNCE_MS) {
    console.log('[Audio] toggleRecording ignorado — debounce ativo');
    return;
  }
  _lastToggleTime = now;

  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    // Reutilizar stream existente ou criar novo
    if (!persistentStream || persistentStream.getTracks()[0].readyState === 'ended') {
      persistentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    permissionChecked = true;

    mediaRecorder = new MediaRecorder(persistentStream);
    audioChunks = [];

    // Resetar todo o estado de sessão via StateManager (flags, transcript, buffers, timers)
    StateManager.resetSession();

    // Proteção: cancelar stopCommandTimeout residual de sessão anterior
    // (pode sobreviver ao resetSession se foi agendado entre o reset e o start)
    if (stopCommandTimeout) {
      clearTimeout(stopCommandTimeout);
      stopCommandTimeout = null;
      console.log('[Audio] stopCommandTimeout residual cancelado ao iniciar nova sessão');
    }
    stopPendingInfo = null;
    stopGateOffset = 0;
    stopGateBlockCount = 0;

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
        console.log('[Audio] Fase 2 de dilatação — gatilho de dilatação por voz suprimido nesta sessão.');
      }
    } catch (_e) { /* storage indisponível — segue sem supressão */ }

    // Timestamp de início — usado para calcular duração mínima da sessão
    sessionStartTime = Date.now();
    lastSpeechTime = Date.now();
    if (silenceCheckInterval) clearInterval(silenceCheckInterval);
    silenceCheckInterval = setInterval(_checkSilence, 10_000);

    // Limpar explicitamente os campos de diagnóstico no DOM que foram poupados na consulta anterior
    if (diagnosticoField) diagnosticoField.value = '';
    if (diagnosticoRetornoField) diagnosticoRetornoField.value = '';

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      // Se é troca de modo, não processar
      if (isModeSwitching) {
        isModeSwitching = false;
        return;
      }

      // ── Guard de sessão mínima (anti-sessão-vazia) ──
      // Se a sessão durou menos de 3 segundos E não há texto reconhecido nem buffer,
      // descartar silenciosamente — evita enviar sessões acidentais ao Gemini.
      const MIN_SESSION_MS = 3000;
      const sessionElapsed = Date.now() - sessionStartTime;
      if (sessionElapsed < MIN_SESSION_MS && !recognizedText.trim() && !(recentTextBuffer && recentTextBuffer.trim())) {
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
      if (speechRecognition) {
        try {
          console.log('[Audio] Parando Speech Recognition no onstop para forçar flush de interim results...');
          speechRecognition.stop();
        } catch (e) {
          console.warn('[Audio] Erro ao parar Speech Recognition no onstop:', e);
        }
      }

      // ── Espera inteligente por resultados finais do Speech API ──
      const textBefore = recognizedText;
      const hasSpeech = (textBefore && textBefore.trim().length > 0) || (recentTextBuffer && recentTextBuffer.trim().length > 0);

      if (hasSpeech) {
        let waitedMs = 0;
        const POLL_INTERVAL = 100;
        const MAX_WAIT = 1500;

        while (waitedMs < MAX_WAIT) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL));
          waitedMs += POLL_INTERVAL;
          if (recognizedText !== textBefore) {
            console.log(`[Audio] Speech finalizado após ${waitedMs}ms.`);
            break;
          }
        }
      } else {
        console.log('[Audio] Nenhum som/fala detectado na sessão, pulando espera.');
      }

      // Parar de vez e limpar
      stopSpeechRecognition();

      const capturedText = recognizedText;
      if (capturedText && capturedText.trim().length > 0) {
        const words = capturedText.trim().split(/\s+/).length;
        console.log(`[Audio] Texto capturado para processamento (${words} palavras):`, capturedText.substring(0, 120) + (capturedText.length > 120 ? '…' : ''));
      } else {
        console.warn('[Audio] ⚠️ recognizedText está VAZIO ao parar — Speech API não produziu resultados finais nesta sessão.');
      }

      // Fallbacks de segurança: se o médico parou manualmente ANTES do Speech API
      // produzir resultado final, os hooks de dilatação/stop não terão disparado.
      // Só executam se o hook runner ainda não detectou (evita dupla detecção).
      const _finalNorm = normalizeText(capturedText);
      const _textToScan = _finalNorm || normalizeText(recentTextBuffer);

      if (!StateManager.getHookFlag('dilatacaoDetectada')) {
        // Na fase 2 (retorno da dilatação), narrações retrospectivas espalhadas
        // pela sessão não contam — só um comando na CAUDA (dito logo antes da
        // parada manual) indica uma NOVA pausa real de dilatação.
        const _dilScan = fase2DilatacaoAtiva ? _textToScan.slice(-300) : _textToScan;
        if (ClinicalTriggers.detectaDilatacaoNaFala(_dilScan)) {
          StateManager.setHookFlag('dilatacaoDetectada', true);
          console.log('[Audio] Dilatação detectada no fallback onstop');
        }
      }

      // Fallback de encerramento: despedida dita mas finalizada só após a parada
      // manual. Seta a flag para que o guard de "exame em andamento" não bloqueie
      // o processamento e o fallback de exames normais da injeção funcione.
      if (!StateManager.getHookFlag('consultaEncerradaDetectada') &&
          !StateManager.getHookFlag('dilatacaoDetectada')) {
        if (ClinicalTriggers.detectaEncerramentoNaFala(_textToScan)) {
          StateManager.setHookFlag('consultaEncerradaDetectada', true);
          console.log('[Audio] Encerramento de consulta detectado no fallback onstop');
        }
      }

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await processAudioInBackground(audioBlob, capturedText);
    };

    mediaRecorder.start();
    isRecording = true;

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
  isRecording = false;
  if (silenceCheckInterval) { clearInterval(silenceCheckInterval); silenceCheckInterval = null; }
  if (silencePendingStop) { clearTimeout(silencePendingStop); silencePendingStop = null; }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    if (!keepStreamOpen) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      persistentStream = null;
    }
  }

  recordBtn.classList.remove('recording');
  statusText.textContent = 'Processando...';
  statusText.style.color = '#3b82f6';
  statusText.style.fontWeight = 'normal';
  stopTimer();
}

function stopRecordingCompletely() {
  isRecording = false;
  if (silenceCheckInterval) { clearInterval(silenceCheckInterval); silenceCheckInterval = null; }
  if (silencePendingStop) { clearTimeout(silencePendingStop); silencePendingStop = null; }
  stopSpeechRecognition();
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  if (persistentStream) {
    persistentStream.getTracks().forEach(track => track.stop());
    persistentStream = null;
  }
}

// ============================================================================
// PROCESSAMENTO — GEMINI
// ============================================================================

/**
 * Retorna true se o objeto `dados` contém pelo menos um campo clínico preenchido.
 * Usado para distinguir "comando puro de dilatação" (nenhum dado) de "consulta
 * com dilatação ao final" (tem HDA, antecedentes, etc. e também há dilatação).
 *
 * Frases de negação padrão (ex: "Nega uso de medicações oculares") são fillers
 * gerados pelo AI para qualquer consulta e NÃO contam como dado clínico real.
 */
function _temDadosClinicos(dados) {
  if (!dados) return false;
  // hda, retorno e diagnostico são sempre dados substantivos quando presentes
  if (dados.hda || dados.retorno || dados.diagnostico) return true;
  // Para os campos de negação/antecedentes, ignorar frases padrão "Nega ..."
  const campos = [
    dados.medicacoes_em_uso,
    dados.antecedentes_oftalmologicos,
    dados.alteracoes_sistemicas,
    dados.antecedentes_familiares,
  ];
  return campos.some(v => v && !/^nega\s/i.test(v.trim()));
}

function _handleManualReview(data, transcribedText) {
  const motivo = (data && data.motivo_revisao_manual) || 'Transcrição incoerente ou clinicamente insegura.';
  console.warn('[Audio] Revisão manual obrigatória:', motivo, '\nTranscrição:', transcribedText);

  processingStatus.textContent = 'Revisão manual necessária';
  statusText.textContent = 'Transcrição requer revisão manual';
  statusText.style.color = '#ef4444';
  statusText.style.fontWeight = 'bold';

  // Preservar a transcrição no campo de texto para o médico revisar manualmente.
  const transcriptionEl = document.getElementById('transcription-text');
  if (transcriptionEl && transcribedText) {
    transcriptionEl.value = transcribedText;
  }

  alert(
    '⚠️ Revisão manual obrigatória\n\n' +
    'A transcrição foi detectada como ruidosa ou clinicamente insegura.\n' +
    'Nenhum dado foi injetado automaticamente.\n\n' +
    'Motivo: ' + motivo
  );
}

async function processAudioInBackground(audioBlob, capturedText) {
  processingIndicator.classList.remove('hidden');

  try {
    processingStatus.textContent = 'Analisando com Gemini...';

    if (!window.GeminiService) {
      throw new Error('GeminiService não carregado. Reabra o painel.');
    }

    // Sem transcrição — tentar recentTextBuffer como fallback antes de desistir
    // (o Speech API às vezes produz resultados como "interim" que ficam no buffer
    //  mas não chegam a finalTranscript se a sessão for interrompida bruscamente)
    let textToProcess = capturedText;
    if (!textToProcess || textToProcess.trim().length === 0) {
      if (recentTextBuffer && recentTextBuffer.trim().length >= 20) {
        console.warn('[Audio] capturedText vazio — usando recentTextBuffer como fallback:', recentTextBuffer.substring(0, 80));
        textToProcess = recentTextBuffer;
        processingStatus.textContent = 'Transcrição parcial — verifique o resultado';
        statusText.textContent = 'Áudio incompleto — revise os dados';
        statusText.style.color = '#eab308';
      } else {
        console.log('[Audio] Nenhum texto capturado — sessão encerrada sem dados.');
        processingStatus.textContent = '';
        statusText.textContent = '⚠️ Nenhuma fala detectada — sessão descartada';
        statusText.style.color = '#eab308';
        statusText.style.fontWeight = 'normal';
        setTimeout(() => {
          statusText.textContent = 'Clique para iniciar o ditado';
          statusText.style.color = '';
        }, 4000);
        return;
      }
    }

    // Filtro de áudio curto (< 4 palavras = ruído)
    if (textToProcess.trim().split(/\s+/).length < 4) {
      statusText.textContent = 'Áudio muito curto, ignorado.';
      statusText.style.color = '#eab308';
      processingStatus.textContent = '';
      return;
    }

    // ── Contexto de dilatação (fase 2) ──
    // Se há uma pausa de dilatação recente persistida, anexar a transcrição da fase 1
    // (entrevista) antes do texto desta sessão, separada pelo marcador. O Gemini analisa
    // a consulta completa e libera conduta/tratamento/exames (regra do marcador no prompt).
    // Os fallbacks de gatilho abaixo continuam varrendo APENAS textToProcess — o
    // "vai dilatar" da fase 1 não pode redetectar dilatação na fase 2.
    // Carregado ANTES do guard de exame em andamento: o guard também precisa
    // do acumulado para persistir a transcrição ao adiar a análise.
    let _phase1Store = null;
    try {
      _phase1Store = await new Promise(resolve =>
        chrome.storage.local.get('_shospDilatacaoPhase1', d => resolve(d._shospDilatacaoPhase1 || null))
      );
      if (_phase1Store && Date.now() - (_phase1Store.ts || 0) > 6 * 60 * 60 * 1000) {
        _phase1Store = null;
      }
    } catch (_e) { _phase1Store = null; }

    let analysisText = textToProcess;
    if (_phase1Store?.transcript) {
      analysisText = _phase1Store.transcript + '\n\n[RETORNO DA DILATACAO]\n\n' + textToProcess;
      console.log('[Audio] Transcrição da fase pré-dilatação anexada como contexto da análise.');
    }

    // Guard pré-Gemini: exame/refração em andamento — não analisar como consulta final.
    // Exceção: dilatacaoDetectada=true indica pausa clínica (exame concluído) — o guard
    // não se aplica porque o downstream já bloqueia auto-injeção e exibe dados para revisão.
    // Exceção 2: se a consulta foi explicitamente encerrada (STOP detectado ou manual), bypassar o guard.
    if (!dilatacaoDetectada && !consultaEncerradaDetectada && ClinicalTriggers.detectaExameEmAndamento(textToProcess)) {
      // Persistir a transcrição ANTES de adiar: a próxima gravação chama
      // resetSession() e apaga recognizedText — sem isso, a entrevista de uma
      // pausa manual (ex.: gatilho de dilatação não reconhecido) era destruída
      // em silêncio. A próxima sessão anexa este texto via marcador, como na
      // fase 2 de dilatação. motivo='exame' NÃO suprime o hook de dilatação
      // na próxima sessão (a dilatação ainda pode ser anunciada nela).
      try {
        chrome.storage.local.set({
          _shospDilatacaoPhase1: {
            audio: _phase1Store?.audio || null,
            transcript: analysisText,
            ts: Date.now(),
            motivo: _phase1Store?.motivo || 'exame',
          },
        });
        console.log('[Audio] Exame em andamento — transcrição persistida; será anexada à próxima gravação.');
      } catch (_e) { /* storage indisponível — não-fatal */ }
      statusText.textContent = 'Exame em andamento, aguardando encerramento';
      statusText.style.color = '#eab308';
      statusText.style.fontWeight = 'normal';
      processingStatus.textContent = 'Exame em andamento — aguardando gatilho de fim ou pausa';
      console.log('[Audio] Exame em andamento detectado — análise com Gemini adiada.');
      return;
    }

    const data = await window.GeminiService.analyzeConsultation(analysisText);
    processingStatus.textContent = 'Análise concluída!';

    // Bloquear injeção automática quando a IA ou o DecisionEngine sinalizarem ruído.
    if (data && (data.tipo_consulta === 'invalida' || data.noiseDetected || data.revisao_manual)) {
      _handleManualReview(data, textToProcess);
      return;
    }

    if (data && data.dados) {
      // Salvar raciocínio para auditoria
      if (data._raciocinio) {
        console.group('RACIOCÍNIO DA IA');
        console.log(data._raciocinio);
        console.groupEnd();
        chrome.storage.local.set({
          lastGeminiReasoning: data._raciocinio,
          lastGeminiDate: new Date().toLocaleString()
        });
      }

      // Fallback: varrer o texto processado + buffer recente por comandos de dilatação
      // (o hook de dilatação pode não ter disparado se o Speech API reiniciou nesse momento)
      if (!dilatacaoDetectada) {
        if (data.dilatacaoDetectada) {
          dilatacaoDetectada = true;
        } else {
          const finalNorm = normalizeText(textToProcess) || normalizeText(recentTextBuffer);
          // Fase 2: só a cauda conta (narração retrospectiva não é nova pausa)
          const scanDil = fase2DilatacaoAtiva ? finalNorm.slice(-300) : finalNorm;
          if (ClinicalTriggers.detectaDilatacaoNaFala(scanDil)) {
            dilatacaoDetectada = true;
          }
        }
      }

      // DecisionEngine v6 — ponto autoritativo: aplica guards clínicos e reconcilia flags.
      // clonedAIResponse substitui `data` daqui em diante para exibição e injeção.
      let workingData = data;
      try {
        if (typeof DecisionEngine !== 'undefined' && DecisionEngine.buildDecision) {
          const decision = DecisionEngine.buildDecision(data, {
            transcribedText: analysisText,
            hookFlags: {
              blefariteInjetada,
              examesNormaisInjetados,
              dilatacaoDetectada,
            },
            tipoConsulta: data.tipo_consulta,
          });
          if (decision.guardsApplied.length > 0) {
            console.log('[DecisionEngine] Guards aplicados:', decision.guardsApplied);
          }
          console.log('[DecisionEngine] Flags reconciliadas:', decision.injectFlags,
            '| requestId:', decision.metadata.requestId);

          // Usar resposta tratada pelo DE como fonte autoritativa
          workingData = decision.clonedAIResponse;
          // Copiar flags reconciliadas de volta para o objeto de trabalho
          workingData.injectExamesNormais = decision.injectFlags.injectExamesNormais;
          workingData.injectBlefarite     = decision.injectFlags.injectBlefarite;
          if (decision.injectFlags.dilatacao) dilatacaoDetectada = true;
        }
      } catch (e) {
        console.warn('[DecisionEngine] Falha ao calcular decisão (não-fatal):', e.message);
        workingData = data;
      }

      // Dilatação detectada: finalizar e injetar os dados coletados.
      // O médico atenderá outro paciente enquanto o colírio faz efeito,
      // por isso a consulta deve ser encerrada normalmente com injeção.
      if (dilatacaoDetectada) {
        workingData.dilatacaoDetectada = true;

        // Persistir a transcrição da fase 1 ANTES de qualquer injeção/supressão.
        // A fase 2 (pós-dilatação) reanalisa a consulta completa a partir dela —
        // nada da entrevista se perde, mesmo se a injeção abaixo for suprimida.
        // analysisText já acumula fases anteriores em caso de múltiplas pausas.
        try {
          chrome.storage.local.set({
            _shospDilatacaoPhase1: {
              audio: _phase1Store?.audio || null,
              transcript: analysisText,
              ts: Date.now(),
              motivo: 'dilatacao',
            },
          });
          console.log('[Audio] Transcrição da fase 1 (pré-dilatação) persistida para a fase 2.');
        } catch (_e) { /* storage indisponível — não-fatal */ }

        // Comando puro de dilatação: nenhum dado clínico coletado — registrar pausa sem injetar.
        if (!_temDadosClinicos(workingData.dados)) {
          processingStatus.textContent = 'Paciente aguardando dilatação...';
          statusText.textContent = 'Pausa para dilatação — sem dados novos de entrevista';
          statusText.style.color = '#eab308';
          statusText.style.fontWeight = 'normal';
          console.log('[Audio] Dilatação sem dados clínicos novos — injeção adiada; transcrição preservada para a fase 2.');
          return;
        }

        displayAudioResults(workingData);
        processingStatus.textContent = 'Dilatação detectada — injetando dados coletados...';
        statusText.textContent = 'Finalizando (paciente em dilatação)...';
        statusText.style.color = '#3b82f6';
        statusText.style.fontWeight = 'normal';

        await new Promise(r => setTimeout(r, 800));

        if (audioDataInjected) {
          processingStatus.textContent = 'Dados injetados (junto com exames)!';
        } else {
          try {
            await injectAll();
            processingStatus.textContent = 'Dados injetados — paciente em dilatação.';
          } catch (injectError) {
            if (injectError.message === 'dilatacao_sem_camera') {
              // Áudio preservado — sem câmera disponível para injetar junto.
              // O médico injeta manualmente ao fim da consulta.
              processingStatus.textContent = 'Áudio preservado — injete manualmente ao retorno.';
              statusText.textContent = 'Aguardando retorno da dilatação...';
              statusText.style.color = '#eab308';
            } else if (injectError.message === 'Dados já injetados' ||
                injectError.message === 'injectAll já em execução') {
              processingStatus.textContent = 'Dados injetados (junto com exames)!';
            } else {
              console.error('[AutoInject] Erro:', injectError);
              processingStatus.textContent = 'Erro na injeção automática';
            }
          }
        }
        return;
      }

      // Exibir resultados e auto-injetar
      processingStatus.textContent = 'Injetando automaticamente...';
      displayAudioResults(workingData);

      await new Promise(r => setTimeout(r, 800)); // aguarda campos do sidepanel renderizarem

      // Se audioDataInjected já está setado, os dados de áudio foram injetados
      // em conjunto com os exames OCR por uma chamada anterior de injectAll().
      // Tratar como sucesso silencioso — não tentar reinjetar.
      if (audioDataInjected) {
        processingStatus.textContent = 'Dados injetados (junto com exames)!';
      } else {
        try {
          await injectAll();
          processingStatus.textContent = 'Dados injetados automaticamente!';
        } catch (injectError) {
          // 'Dados já injetados' = OCR e áudio foram injetados juntos — não é erro real
          if (injectError.message === 'Dados já injetados' ||
              injectError.message === 'injectAll já em execução') {
            processingStatus.textContent = 'Dados injetados (junto com exames)!';
          } else {
            console.error('[AutoInject] Erro:', injectError);
            processingStatus.textContent = 'Erro na injeção automática';
          }
        }
      }
    } else {
      throw new Error('Resposta inválida da API');
    }
  } catch (error) {
    console.error('[Audio] Erro ao processar:', error);
    statusText.textContent = 'Erro ao processar. Tente novamente.';
    statusText.style.color = '#dc2626';
  } finally {
    processingIndicator.classList.add('hidden');
    seconds = 0;
    updateTimerDisplay();
  }
}

// ============================================================================
// DESFAZER DILATAÇÃO — reprocessar a consulta como completa
// ============================================================================
// Aciona quando o gatilho de dilatação disparou por engano (ex.: "vamos esperar
// o colírio fazer efeito para ELE dilatar" era sobre o acompanhante, não o
// paciente). Reprocessa a transcrição da fase 1 forçando dilatação=false e
// reinjeta conduta/tratamento/exames. NÃO reentra no fluxo top-level (cujos
// guards — áudio curto, exame em andamento e o fallback de dilatação —
// re-armariam a pausa); chama analyzeConsultation + DecisionEngine + injeção
// diretamente, com forceComplete=true.

/** Mostra/esconde o botão de desfazer conforme a pausa de dilatação persistida. */
function refreshUndoVisibility() {
  if (!cancelDilatacaoBtn) return;
  try {
    chrome.storage.local.get('_shospDilatacaoPhase1', d => {
      const store = d._shospDilatacaoPhase1;
      const ativo = !!(store && store.transcript &&
        Date.now() - (store.ts || 0) <= 6 * 60 * 60 * 1000);
      cancelDilatacaoBtn.classList.toggle('hidden', !ativo);
    });
  } catch (_e) { /* storage indisponível — mantém oculto */ }
}

async function cancelarDilatacao() {
  let store = null;
  try {
    store = await new Promise(resolve =>
      chrome.storage.local.get('_shospDilatacaoPhase1', d => resolve(d._shospDilatacaoPhase1 || null)));
  } catch (_e) { store = null; }

  if (!store?.transcript) {
    chrome.storage.local.remove('_shospDilatacaoPhase1');
    refreshUndoVisibility();
    statusText.textContent = 'Nenhuma pausa de dilatação ativa para reprocessar.';
    statusText.style.color = '#eab308';
    return;
  }

  processingIndicator.classList.remove('hidden');
  processingStatus.textContent = 'Reprocessando consulta (dilatação cancelada)...';
  statusText.textContent = 'Reprocessando...';
  statusText.style.color = '#3b82f6';
  statusText.style.fontWeight = 'normal';

  try {
    // Zera o estado de dilatação e permite reinjeção (a fase 1 já injetou a entrevista).
    StateManager.setHookFlag('dilatacaoDetectada', false);
    audioDataInjected = false;
    cameraDataInjected = false;

    const analysisText = store.transcript;
    const data = await window.GeminiService.analyzeConsultation(analysisText, { forceComplete: true });
    if (!data || !data.dados) throw new Error('Reprocessamento retornou resposta inválida');

    // DecisionEngine com dilatação forçada em false.
    let workingData = data;
    try {
      if (typeof DecisionEngine !== 'undefined' && DecisionEngine.buildDecision) {
        const decision = DecisionEngine.buildDecision(data, {
          transcribedText: analysisText,
          hookFlags: { blefariteInjetada, examesNormaisInjetados, dilatacaoDetectada: false },
          tipoConsulta: data.tipo_consulta,
        });
        if (decision.guardsApplied.length > 0) {
          console.log('[Dilatacao] Reprocessamento — guards:', decision.guardsApplied);
        }
        workingData = decision.clonedAIResponse;
        workingData.injectExamesNormais = decision.injectFlags.injectExamesNormais;
        workingData.injectBlefarite     = decision.injectFlags.injectBlefarite;
      }
    } catch (e) {
      console.warn('[Dilatacao] DecisionEngine falhou no reprocessamento (não-fatal):', e.message);
      workingData = data;
    }
    workingData.dilatacaoDetectada = false; // garante placeholder correto em displayAudioResults

    displayAudioResults(workingData);
    await new Promise(r => setTimeout(r, 800));
    await injectAll(true); // force: sobrescreve a injeção da fase 1

    chrome.storage.local.remove('_shospDilatacaoPhase1');

    const semConduta = !workingData.dados?.conduta && !workingData.dados?.tratamento;
    processingStatus.textContent = semConduta
      ? 'Reprocessado — conduta/tratamento não estavam no áudio; complete manualmente.'
      : 'Consulta reprocessada e injetada (dilatação cancelada).';
    statusText.textContent = 'Clique para nova gravação';
    statusText.style.color = '';
  } catch (err) {
    console.error('[Dilatacao] Falha ao cancelar/reprocessar:', err);
    processingStatus.textContent = 'Erro ao reprocessar — verifique o SHOSP.';
    statusText.textContent = 'Erro ao reprocessar.';
    statusText.style.color = '#dc2626';
  } finally {
    processingIndicator.classList.add('hidden');
    refreshUndoVisibility();
  }
}

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
  if (!isRecording || stopCommandTimeout || dilatacaoDetectada || silencePendingStop) return;
  if (isSpeechPausedByCamera) return;

  if (Date.now() - sessionStartTime < SILENCE_MIN_SESSION_MS) return;

  const wordCount = recognizedText.trim() ? recognizedText.trim().split(/\s+/).length : 0;
  if (wordCount < SILENCE_MIN_WORDS) return;

  const silenceMs = Date.now() - lastSpeechTime;
  if (silenceMs < SILENCE_THRESHOLD_MS) return;

  console.log(`[Silence] ${Math.round(silenceMs / 1000)}s sem fala (${wordCount} palavras) — agendando encerramento`);
  statusText.textContent = 'Silêncio prolongado — encerrando em 5s (fale para cancelar)';
  statusText.style.color = '#16a34a';

  silencePendingStop = setTimeout(() => {
    silencePendingStop = null;
    if (isRecording && !stopCommandTimeout) {
      console.log('[Silence] Auto-stop por silêncio — encerrando consulta');
      consultaEncerradaDetectada = true;
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
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'pt-BR';

    speechRecognition.onstart = () => {
      isSpeechActive = true;
      console.log('[Speech] Reconhecimento de voz iniciado.');
    };

    speechRecognition.onresult = (event) => {
      // Fala detectada — resetar contador de no-speech e timestamp de silêncio
      noSpeechCount = 0;
      lastSpeechTime = Date.now();
      if (silencePendingStop) {
        clearTimeout(silencePendingStop);
        silencePendingStop = null;
        if (isRecording && !stopCommandTimeout) {
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

      recognizedText = (recognizedText + ' ' + finalTranscript).trim();

      // ── Normalizar texto para detecção (remove acentos, lowercase) ──
      const normalizedFinal = normalizeText(recognizedText);
      const normalizedCurrent = normalizeText(recognizedText + ' ' + interimTranscript);

      // ── Buffer de texto recente (últimas 500 chars) — protege contra restart do Speech API ──
      recentTextBuffer = normalizedCurrent.slice(-500);
      if (recentTextTimeout) clearTimeout(recentTextTimeout);
      recentTextTimeout = setTimeout(() => { recentTextBuffer = ''; }, 15000);

      // ── Execução dos hooks registrados ──
      // O runner itera por prioridade: flags → injects → stops.
      // Hooks 'inject' e 'stop' interrompem o loop após disparar.
      if (finalTranscript) {
        console.log('[Speech] Final:', normalizedFinal.slice(-120));
      }
      runHooks(normalizedFinal, normalizedCurrent, recentTextBuffer);

      // Mostrar status de exame em andamento em tempo real (só se nenhum stop agendado)
      if (!stopCommandTimeout && ClinicalTriggers.detectaExameEmAndamento(recentTextBuffer)) {
        statusText.textContent = 'Exame em andamento...';
        statusText.style.color = '#eab308';
      }

    }; // fim do speechRecognition.onresult

    speechRecognition.onerror = (event) => {
      isSpeechActive = false;
      if (event.error === 'no-speech') {
        noSpeechCount++;
        // Suprimir log após o 1º erro para não poluir o console
        if (noSpeechCount <= 1) {
          console.log('[Speech] Nenhuma fala detectada. Aguardando...');
        }
        // Backoff: após 5 erros consecutivos sem fala, pausar o reconhecimento.
        // Reinicia explicitamente após 3 s para não perder frases ditas durante a pausa
        // (sem o restart, o Speech fica parado até o próximo onend — que nunca chega).
        if (noSpeechCount >= 5) {
          console.log(`[Speech] ${noSpeechCount} erros no-speech consecutivos — pausando reconhecimento por 3s.`);
          isSpeechBackingOff = true; // Ativar trava de backoff
          try { speechRecognition.stop(); } catch (e) { /* ignorar */ }
          setTimeout(() => {
            isSpeechBackingOff = false; // Desativar trava de backoff
            noSpeechCount = 0; // reset para nova janela de tentativas
            // Reiniciar só se ainda estiver gravando, sem stop agendado e sem pausa por câmera
            if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechPausedByCamera && !isSpeechActive) {
              try {
                speechRecognition.start();
                isSpeechActive = true;
              } catch (e) { /* já ativo */ }
            }
          }, 3000);
          return;
        }
        // Reinicia imediatamente sem esperar onend
        try { speechRecognition.stop(); } catch (e) { /* ignorar */ }
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
        if (isRecording && !stopCommandTimeout && !isSpeechPausedByCamera) {
          clearTimeout(speechRecoveryTimer);
          speechRecoveryTimer = setTimeout(() => {
            speechRecoveryTimer = null;
            if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechPausedByCamera && !isSpeechActive) {
              try {
                speechRecognition.start();
                isSpeechActive = true;
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

    speechRecognition.onend = () => {
      isSpeechActive = false;
      console.log('[Speech] Reconhecimento de voz encerrado.');
      
      // Não reiniciar o speech se um comando de parada já foi agendado, se está pausado pela câmera ou em backoff.
      if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechPausedByCamera && !isSpeechBackingOff) {
        setTimeout(() => {
          if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechPausedByCamera && !isSpeechActive) {
            try {
              speechRecognition.start();
              isSpeechActive = true;
            } catch (e) {
              console.warn('[Speech] Erro ao tentar reiniciar no onend:', e.message);
            }
          }
        }, 300);
      }
    };

    speechRecognition.start();
  } catch (error) {
    console.error('[Speech] Erro ao iniciar:', error);
  }
}

function stopSpeechRecognition() {
  if (speechRecognition) {
    try {
      speechRecognition.stop();
    } catch (e) { /* já parado */ }
    speechRecognition = null;
    isSpeechActive = false;
  }
}

function pauseSpeechRecognition() {
  if (!isRecording) return;
  // Apenas sinaliza que a câmera está ativa — NÃO para o Speech API.
  // A câmera usa apenas vídeo (sem audio:true no getUserMedia), portanto não
  // há conflito de microfone. Parar o reconhecimento durante a câmera causava
  // perda do texto da consulta e rejeição por "áudio muito curto" ao retomar.
  isSpeechPausedByCamera = true;
  console.log('[Speech] Câmera ativa — reconhecimento de voz continua (câmera é vídeo-only).');
}

function resumeSpeechRecognition() {
  if (!isRecording) {
    isSpeechPausedByCamera = false;
    return;
  }
  isSpeechPausedByCamera = false;
  console.log('[Speech] Reconhecimento retomado após fechar câmera.');

  if (speechRecognition && !isSpeechActive && !stopCommandTimeout) {
    try {
      speechRecognition.start();
      isSpeechActive = true;
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

// ============================================================================
// TIMER
// ============================================================================

function startTimer() {
  seconds = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => { seconds++; updateTimerDisplay(); }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function updateTimerDisplay() {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  timerText.textContent = `${mins}:${secs}`;
}

// ============================================================================
// EXIBIÇÃO DE RESULTADOS
// ============================================================================

function displayAudioResults(data) {
  statusText.textContent = 'Clique para nova gravação';
  statusText.style.color = '';
  statusText.style.fontWeight = 'normal';
  audioData = data;

  consultationType.classList.remove('hidden');
  const badge = consultationType.querySelector('.type-badge');

  if (data.tipo_consulta === 'primeira_consulta' || data.tipo_consulta === 'conclusao') {
    badge.textContent = data.tipo_consulta === 'conclusao' ? 'Conclusão da Consulta' : 'Primeira Consulta';
    badge.className = data.tipo_consulta === 'conclusao' ? 'type-badge primeira conclusao' : 'type-badge primeira';

    primeiraConsultaFields.classList.remove('hidden');
    retornoFields.classList.add('hidden');

    hdaField.value = data.dados?.hda || '';
    medicacoesField.value = data.dados?.medicacoes_em_uso || '';
    antecedentesOftField.value = data.dados?.antecedentes_oftalmologicos || '';
    doencasSistemicasField.value = data.dados?.alteracoes_sistemicas || data.dados?.doencas_sistemicas || '';
    antecedentesFamField.value = data.dados?.antecedentes_familiares || '';
    diagnosticoField.value = data.dados?.diagnostico || '';
    condutaField.value = data.dados?.conduta || '';
    medicamentosPrescritosField.value = data.dados?.tratamento || data.dados?.medicamentos_prescritos || (data.dilatacaoDetectada ? '' : 'Sem prescrição de medicação');
  } else {
    badge.textContent = 'Retorno';
    badge.className = 'type-badge retorno';
    primeiraConsultaFields.classList.add('hidden');
    retornoFields.classList.remove('hidden');

    retornoField.value = data.dados?.retorno || data.dados?.hda || '';
    medicacoesRetornoField.value = data.dados?.uso || data.dados?.medicacoes_em_uso || '';
    diagnosticoRetornoField.value = data.dados?.diagnostico || '';
    condutaRetornoField.value = data.dados?.conduta || '';
    medicamentosPrescritosRetornoField.value = data.dados?.tratamento || data.dados?.medicamentos_prescritos || (data.dilatacaoDetectada ? '' : 'Sem prescrição de medicação');
  }

  audioFieldsContainer.classList.remove('hidden');
  updateDataSummary();
}