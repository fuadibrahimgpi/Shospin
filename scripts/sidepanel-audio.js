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

async function toggleRecording() {
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
    recognizedText = '';

    // Resetar flags de gatilhos para nova gravação
    examesNormaisInjetados = false;
    blefariteInjetada = false;
    receitaOlhoIrritadoInjetada = false;
    catarataDetectada = false;
    lioDetectada = false;
    opacidadeCapsulaDetectada = false;
    dilatacaoDetectada = false;
    consultaEncerradaDetectada = false;
    lastTriggerTime = 0;
    fundoscopiaDetectada = false;
    if (stopCommandTimeout) { clearTimeout(stopCommandTimeout); stopCommandTimeout = null; }
    // Resetar buffer de texto recente (agora global — persiste entre restarts do Speech)
    recentTextBuffer = '';
    if (recentTextTimeout) { clearTimeout(recentTextTimeout); recentTextTimeout = null; }
    // Resetar contador de erros no-speech consecutivos
    noSpeechCount = 0;

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      // Se é troca de modo, não processar
      if (isModeSwitching) {
        isModeSwitching = false;
        return;
      }

      // ── Espera inteligente por resultados finais do Speech API ──
      const textBefore = recognizedText;
      let waitedMs = 0;
      const POLL_INTERVAL = 200;
      const MAX_WAIT = 2000;

      while (waitedMs < MAX_WAIT) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        waitedMs += POLL_INTERVAL;
        if (recognizedText !== textBefore && waitedMs < MAX_WAIT - POLL_INTERVAL) {
          break;
        }
      }

      // Parar speech DEPOIS de capturar os resultados
      stopSpeechRecognition();

      const capturedText = recognizedText;
      if (capturedText && capturedText.trim().length > 0) {
        const words = capturedText.trim().split(/\s+/).length;
        console.log(`[Audio] Texto capturado para processamento (${words} palavras):`, capturedText.substring(0, 120) + (capturedText.length > 120 ? '…' : ''));
      } else {
        console.warn('[Audio] ⚠️ recognizedText está VAZIO ao parar — Speech API não produziu resultados finais nesta sessão.');
      }

      // Verificação final — garante que gatilho não foi perdido durante restart
      const finalNorm = normalizeText(capturedText);
      if (!stopCommandTimeout) {
        for (const cmd of STOP_COMMANDS) {
          if (finalNorm.includes(cmd)) {
            console.log('[Audio] Gatilho encontrado no texto final:', cmd);
            break; // apenas log, gravação já parou
          }
        }
      }

      // Fallback de segurança: se o médico clicou para parar manualmente ANTES
      // do Speech API finalizar o resultado, o hook de dilatação não terá disparado.
      // Varredura no capturedText + recentTextBuffer (cobre caso de speech vazio por restart).
      const textToScanDilat = finalNorm || normalizeText(recentTextBuffer);
      for (const cmd of DILATACAO_COMMANDS) {
        if (textToScanDilat.includes(cmd)) {
          dilatacaoDetectada = true;
          console.log('[Audio] Dilatação detectada no fallback onstop:', cmd);
          break;
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
      } else {
        statusText.textContent = 'Clique para iniciar o ditado';
        statusText.style.color = '';
        statusText.style.fontWeight = 'normal';
        console.log('[Audio] Nenhum texto capturado — sessão encerrada sem dados.');
        return;
      }
    }

    // Filtro de áudio curto (< 4 palavras = ruído)
    if (textToProcess.trim().split(/\s+/).length < 4) {
      statusText.textContent = 'Áudio muito curto, ignorado.';
      statusText.style.color = '#eab308';
      return;
    }

    // Guard pré-Gemini: exame/refração em andamento — não analisar como consulta final
    if (ClinicalTriggers.detectaExameEmAndamento(textToProcess)) {
      statusText.textContent = 'Exame em andamento, aguardando encerramento';
      statusText.style.color = '#eab308';
      statusText.style.fontWeight = 'normal';
      processingStatus.textContent = 'Exame em andamento — aguardando gatilho de fim ou pausa';
      console.log('[Audio] Exame em andamento detectado — análise com Gemini adiada.');
      return;
    }

    const data = await window.GeminiService.analyzeConsultation(textToProcess);
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
          for (const cmd of DILATACAO_COMMANDS) {
            if (finalNorm.includes(cmd)) {
              dilatacaoDetectada = true;
              break;
            }
          }
        }
      }

      // DecisionEngine v6 — ponto autoritativo: aplica guards clínicos e reconcilia flags.
      // clonedAIResponse substitui `data` daqui em diante para exibição e injeção.
      let workingData = data;
      try {
        if (typeof DecisionEngine !== 'undefined' && DecisionEngine.buildDecision) {
          const decision = DecisionEngine.buildDecision(data, {
            transcribedText: textToProcess,
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

      // Pausa para dilatação — exibir dados capturados mas NÃO injetar automaticamente.
      // A dilatação é pausa, não fim de consulta: médico deve injetar manualmente
      // quando o paciente retornar após o efeito do colírio.
      if (dilatacaoDetectada) {
        if (_temDadosClinicos(workingData.dados)) {
          displayAudioResults(workingData);
          processingStatus.textContent = 'Pausa para dilatação — dados disponíveis, aguardando retorno';
          console.log('[Audio] Dilatação com dados clínicos — exibindo para revisão, sem auto-injeção.');
        } else {
          processingStatus.textContent = 'Pausa para dilatação — retome quando o paciente voltar';
          console.log('[Audio] Dilatação pura — sem dados para exibir.');
        }
        statusText.textContent = 'Aguardando retorno do paciente...';
        statusText.style.color = '#3b82f6';
        statusText.style.fontWeight = 'normal';
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
// WEB SPEECH API — RECONHECIMENTO EM TEMPO REAL
// ============================================================================

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  // recentTextBuffer e recentTextTimeout são globais (sidepanel-constants.js)
  // — declará-los localmente apagaria o buffer entre restarts do Speech API.

  try {
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'pt-BR';

    speechRecognition.onresult = (event) => {
      // Fala detectada — resetar contador de no-speech
      noSpeechCount = 0;

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
          try { speechRecognition.stop(); } catch (e) { /* ignorar */ }
          setTimeout(() => {
            noSpeechCount = 0; // reset para nova janela de tentativas
            // Reiniciar só se ainda estiver gravando e sem stop agendado
            if (isRecording && speechRecognition && !stopCommandTimeout) {
              try { speechRecognition.start(); } catch (e) { /* já ativo */ }
            }
          }, 3000);
          return;
        }
        // Reinicia imediatamente sem esperar onend
        try { speechRecognition.stop(); } catch (e) { /* ignorar */ }
      } else {
        console.log('[Speech] Erro:', event.error);
      }
    };

    speechRecognition.onend = () => {
      // Não reiniciar o speech se um comando de parada já foi agendado.
      // Sem essa guarda, o speech reinicia no frame entre o onend e o
      // timeout do stopCommandTimeout disparar, deixando o botão preso em "Gravando..."
      // enquanto o mediaRecorder já foi encerrado.
      if (isRecording && speechRecognition && !stopCommandTimeout) {
        try { speechRecognition.start(); } catch (e) { /* já ativo */ }
      }
    };

    speechRecognition.start();
  } catch (error) {
    console.error('[Speech] Erro ao iniciar:', error);
  }
}

function stopSpeechRecognition() {
  if (speechRecognition) {
    try { speechRecognition.stop(); } catch (e) { /* já parado */ }
    speechRecognition = null;
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
    medicamentosPrescritosField.value = data.dados?.tratamento || data.dados?.medicamentos_prescritos || 'Sem prescrição de medicação';
  } else {
    badge.textContent = 'Retorno';
    badge.className = 'type-badge retorno';
    primeiraConsultaFields.classList.add('hidden');
    retornoFields.classList.remove('hidden');

    retornoField.value = data.dados?.retorno || data.dados?.hda || '';
    medicacoesRetornoField.value = data.dados?.uso || data.dados?.medicacoes_em_uso || '';
    diagnosticoRetornoField.value = data.dados?.diagnostico || '';
    condutaRetornoField.value = data.dados?.conduta || '';
    medicamentosPrescritosRetornoField.value = data.dados?.tratamento || data.dados?.medicamentos_prescritos || 'Sem prescrição de medicação';
  }

  audioFieldsContainer.classList.remove('hidden');
  updateDataSummary();
}