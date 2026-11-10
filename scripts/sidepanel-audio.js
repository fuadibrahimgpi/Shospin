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
// SAÚDE DO MICROFONE
// ============================================================================
//
// A falha mais cara desta extensão não gera erro: a track de áudio fica MUDA
// (o SO/driver reconfigura o grafo de dispositivos — abrir a câmera em 4K é
// um gatilho comum no Windows) e tudo segue "normal". MediaRecorder grava
// silêncio, a Web Speech API não recebe áudio e não dispara `onerror`, o
// status continua mostrando "Gravando...", e a consulta inteira se perde.
// Caso real 2026-08-07: um único `onstart`, nenhum `onend` por 70s, nenhum
// resultado, nenhuma linha de log — o `readyState` da track o tempo todo
// dizendo 'live'.
//
// `muted` é a evidência que existe e nunca era lida. Ela é observável em dois
// pontos: antes de reutilizar o stream, e ao vivo pelos eventos da track.

/** Uma track que terminou OU que está muda não serve para gravar. */
function _micTrackSaudavel(stream) {
  const track = stream?.getAudioTracks?.()[0];
  return !!track && track.readyState !== 'ended' && !track.muted;
}

/**
 * Liga os eventos de saúde da track de áudio. Idempotente: os handlers são
 * atribuídos (não acumulados com addEventListener), então re-observar o mesmo
 * stream a cada gravação não empilha listeners.
 */
function _watchMicTrack(stream) {
  const track = stream?.getAudioTracks?.()[0];
  if (!track) return;

  track.onmute = () => {
    micMudoDetectado = true;
    console.warn('[Mic] ⚠️ Track de áudio MUDA — o microfone parou de entregar som (nenhum erro é emitido pelo navegador).');
    if (isRecording) _avisarMicMorto('⚠️ Microfone mudo — o áudio NÃO está sendo capturado');
  };

  track.onunmute = () => {
    micMudoDetectado = false;
    console.log('[Mic] Track de áudio voltou a entregar som.');
    if (isRecording && !stopCommandTimeout) {
      statusText.textContent = 'Gravando...';
      statusText.style.color = '#ef4444';
      // A Web Speech API perde a sessão quando o áudio some; sem esta sonda ela
      // ficaria parada até o fim da consulta.
      _probeSpeechAlive();
    }
  };

  track.onended = () => {
    micMudoDetectado = true;
    console.warn('[Mic] ⚠️ Track de áudio ENCERRADA durante a sessão.');
    if (isRecording) _avisarMicMorto('⚠️ Microfone perdido — reinicie a gravação');
  };
}

/** Solta os handlers de uma track que vai ser descartada. */
function _unwatchMicTrack(stream) {
  const track = stream?.getAudioTracks?.()[0];
  if (!track) return;
  track.onmute = null;
  track.onunmute = null;
  track.onended = null;
}

/** Aviso visível de captura morta. O médico precisa VER antes da despedida. */
function _avisarMicMorto(msg) {
  semFalaAvisoAtivo = true;
  statusText.textContent = msg;
  statusText.style.color = '#dc2626';
  statusText.style.fontWeight = 'bold';
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
    // Reutilizar stream existente ou criar novo.
    // `muted` conta como inválido: uma track MUDA passa em `readyState` como se
    // estivesse saudável (readyState só vira 'ended' quando ela termina de vez),
    // e o stream reutilizado carrega o mudo para a sessão seguinte — a gravação
    // roda inteira sem capturar nada. Caso real 2026-08-07: 70s de consulta,
    // zero texto, zero erro no console.
    if (!persistentStream || !_micTrackSaudavel(persistentStream)) {
      if (persistentStream) {
        console.warn('[Mic] Stream anterior inutilizável (encerrado ou mudo) — readquirindo microfone.');
        // Desligar os handlers ANTES do stop(): `stop()` dispara `ended` na track
        // antiga, e o handler pintaria "Microfone perdido" em vermelho no meio de
        // uma reaquisição que está dando certo. Hoje `isRecording` ainda é false
        // aqui e o aviso não sairia — mas isso é posição, não intenção.
        _unwatchMicTrack(persistentStream);
        try { persistentStream.getTracks().forEach(t => t.stop()); } catch (_e) { /* já parado */ }
      }
      persistentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    micMudoDetectado = false;
    _watchMicTrack(persistentStream);
    permissionChecked = true;

    mediaRecorder = new MediaRecorder(persistentStream);
    audioChunks = [];

    // Resetar todo o estado de sessão via StateManager (flags, transcript, buffers, timers)
    StateManager.resetSession();

    // Nova gravação = novo paciente: o aviso clínico da consulta anterior sai de
    // cena aqui (o clearAll automático pós-injeção NÃO o remove — lá o médico
    // ainda precisa lê-lo). Cobre quem nunca aperta "Limpar" entre pacientes.
    const _warnBanner = document.getElementById('clinicalWarningBanner');
    if (_warnBanner) _warnBanner.remove();

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

    // Fase 2 de dilatação: só é a fase 2 de um paciente da fila quando o médico
    // ARMOU o slot dele pelo botão "retomar" da sala de espera (slot.retomar).
    // Sem slot armado, esta gravação é tratada como paciente NOVO — assumir
    // "próxima gravação = retorno" fazia a pausa de um paciente contaminar/
    // suprimir a consulta do próximo atendido durante a espera (caso real
    // 2026-07-17, dois irmãos). Pausas de OUTROS pacientes seguem intactas na
    // fila. motivo='exame' (pausa manual no meio do exame) anexa o contexto,
    // mas não ativa o modo fase 2 (o gatilho de dilatação continua vivo).
    try {
      const _slot = await DilatacaoPausas.obterRetomada();
      if (_slot && _slot.motivo !== 'exame') {
        StateManager.setHookFlag('fase2DilatacaoAtiva', true);
        console.log('[Audio] Fase 2 armada (retomada confirmada) — gatilho de dilatação restrito à cauda da fala.');
      }
    } catch (_e) { /* storage indisponível — segue sem supressão */ }

    // Timestamp de início — usado para calcular duração mínima da sessão
    sessionStartTime = Date.now();
    lastSpeechTime = Date.now();
    ultimoRecicloSpeech = Date.now();
    reciclosSpeechNaSessao = 0;
    semFalaAvisoAtivo = false;
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
        // "Sem TEXTO", não "sem som": hasSpeech vem de recognizedText, não de
        // nível de áudio. A mensagem antiga afirmava um silêncio que ninguém
        // mediu e mandava procurar o problema no lugar errado.
        console.log('[Audio] Nenhum texto reconhecido na sessão, pulando espera.');
      }

      // Parar de vez e limpar
      stopSpeechRecognition();

      const capturedText = recognizedText;
      if (capturedText && capturedText.trim().length > 0) {
        const words = capturedText.trim().split(/\s+/).length;
        console.log(`[Audio] Texto capturado para processamento (${words} palavras):`, capturedText.substring(0, 120) + (capturedText.length > 120 ? '…' : ''));
      } else {
        const _micState = persistentStream && !_micTrackSaudavel(persistentStream) ? 'MUDA/encerrada' : 'ok';
        console.warn(`[Audio] ⚠️ recognizedText está VAZIO ao parar — Speech API não produziu resultados finais nesta sessão. Track de áudio: ${_micState}${micMudoDetectado ? ' (mudo detectado durante a sessão)' : ''}.`);
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
        const _dilScan = SessionFlags.fase2DilatacaoAtiva ? _textToScan.slice(-300) : _textToScan;
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

/**
 * Banner persistente de avisos clínicos do DecisionEngine (ex: biomicroscopia
 * órfã). NÃO usa alert(): não é fatal e não deve travar o fluxo — mas precisa
 * ficar visível até o médico limpar/injetar, porque sinaliza um campo que saiu
 * em branco no prontuário.
 */
function _showClinicalWarnings(avisos) {
  const existing = document.getElementById('clinicalWarningBanner');
  if (existing) existing.remove();
  if (!avisos || !avisos.length) return;

  // Texto, não array: "Array(1)" colapsado some na cópia do console.
  console.warn('[DecisionEngine] Avisos clínicos:\n  ' + avisos.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join('\n  '));

  const banner = document.createElement('div');
  banner.id = 'clinicalWarningBanner';
  const itens = avisos.map(a => `<li style="margin-bottom:4px">${a}</li>`).join('');
  banner.innerHTML = `
    <div style="background:#78350f;border:1px solid #f59e0b;border-radius:8px;padding:12px 14px;margin:10px 0;color:#fffbeb">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px">Atenção — revisar antes de fechar</div>
      <ul style="font-size:12px;opacity:0.95;margin:0;padding-left:18px">${itens}</ul>
    </div>`;

  const container = audioFieldsContainer || document.getElementById('audioFieldsContainer');
  if (container?.parentNode) {
    container.parentNode.insertBefore(banner, container);
  } else {
    document.body.appendChild(banner);
  }
}

/**
 * Passa a resposta do modelo pelo DecisionEngine e devolve o dado de trabalho.
 *
 * NUNCA devolve a resposta crua como se estivesse verificada. Antes, motor ausente
 * ou exceção caíam num `catch` "não-fatal" que seguia com o dado cru e o injetava:
 * a rede contra alucinação sumia em silêncio. Agora os três casos sem verificação
 * completa (motor não carregado, motor lançou, motor pediu para segurar) voltam
 * com `segurar: true`, e quem chama mostra os campos em vez de injetar.
 *
 * Autocontida (só argumentos + globais conferidos por typeof) para ser exercitada
 * por _extractFn nos testes. Usada pelo fluxo normal e pelo "desfazer dilatação".
 *
 * @returns {{ workingData: object, decision: object|null, segurar: boolean, motivo: string|null }}
 */
function _aplicarDecisionEngine(data, analysisText, hookFlags) {
  if (typeof DecisionEngine === 'undefined' || !DecisionEngine || typeof DecisionEngine.buildDecision !== 'function') {
    return { workingData: data, decision: null, segurar: true, motivo: 'o verificador clínico (DecisionEngine) não foi carregado' };
  }
  try {
    const decision = DecisionEngine.buildDecision(data, {
      transcribedText: analysisText,
      hookFlags: hookFlags || {},
      // Pseudofacia AO veta H52.4 (guard de presbiopia). Calculada aqui porque
      // o parser canônico vive no sidepanel; o DE não tem parser próprio.
      pseudofacia: (typeof parsePseudofaciaFromDados === 'function')
        ? parsePseudofaciaFromDados(data.dados) : null,
      tipoConsulta: data.tipo_consulta,
    });
    // Resposta tratada pelo DE é a fonte autoritativa, com as flags reconciliadas.
    const workingData = decision.clonedAIResponse;
    workingData.injectExamesNormais = decision.injectFlags.injectExamesNormais;
    workingData.injectBlefarite     = decision.injectFlags.injectBlefarite;
    workingData.blefariteDescritaNoExame = decision.injectFlags.blefariteDescritaNoExame;
    return {
      workingData,
      decision,
      segurar: !!decision.segurarInjecao,
      motivo: decision.segurarInjecao ? (decision.motivoSegurar || 'verificação automática incompleta') : null,
    };
  } catch (e) {
    return { workingData: data, decision: null, segurar: true, motivo: 'o verificador clínico falhou: ' + ((e && e.message) || e) };
  }
}

/**
 * Verificação clínica incompleta: mostra os campos para o médico conferir e NÃO
 * injeta. Nada se perde — os campos ficam editáveis e o botão "Injetar" segue
 * funcionando; o que muda é que a decisão de gravar no prontuário passa a ser dele.
 */
function _segurarInjecaoAutomatica(workingData, transcribedText, motivo, avisos) {
  console.warn('[DecisionEngine] Injeção automática SUSPENSA — ' + motivo);

  displayAudioResults(workingData);

  const transcriptionEl = document.getElementById('transcription-text');
  if (transcriptionEl && transcribedText) transcriptionEl.value = transcribedText;

  // O banner é montado com innerHTML, e o motivo pode carregar nome de campo vindo
  // do modelo ou mensagem de exceção: escapar antes de exibir.
  const motivoSeguro = String(motivo || 'verificação automática incompleta')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  _showClinicalWarnings([
    'Injeção automática suspensa: ' + motivoSeguro + '. Confira todos os campos abaixo e clique em Injetar.',
    ...(Array.isArray(avisos) ? avisos : []),
  ]);

  processingStatus.textContent = 'Não injetado — confira os campos e clique em Injetar';
  statusText.textContent = 'Injeção suspensa — conferir antes de injetar';
  statusText.style.color = '#ef4444';
  statusText.style.fontWeight = 'bold';
}

async function processAudioInBackground(audioBlob, capturedText) {
  processingIndicator.classList.remove('hidden');
  _analiseEmAndamento = true;

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
        // Distinguir "ninguém falou" de "o microfone estava mudo": a segunda é
        // uma falha do equipamento e o médico precisa saber ANTES de atribuir a
        // perda a si mesmo — e antes de atender o próximo paciente.
        if (micMudoDetectado) {
          statusText.textContent = '⚠️ Microfone mudo nesta sessão — nada foi capturado';
          statusText.style.color = '#dc2626';
          statusText.style.fontWeight = 'bold';
        } else {
          statusText.textContent = '⚠️ Nenhuma fala detectada — sessão descartada';
          statusText.style.color = '#eab308';
          statusText.style.fontWeight = 'normal';
        }
        setTimeout(() => {
          statusText.textContent = 'Clique para iniciar o ditado';
          statusText.style.color = '';
          statusText.style.fontWeight = '';
        }, micMudoDetectado ? 15000 : 4000);
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
    // Só anexa o contexto da fase 1 quando o médico ARMOU a retomada de um slot
    // da fila (botão "retomar" da sala de espera). Sem slot armado, as pausas
    // persistidas pertencem — potencialmente — a OUTROS pacientes atendidos
    // durante a espera, e colá-las aqui contaminaria a análise/prontuário
    // atual (caso 2026-07-17). A fila expira slots (TTL 6h) na leitura.
    let _phase1Store = null;
    try {
      _phase1Store = await DilatacaoPausas.obterRetomada();
    } catch (_e) { _phase1Store = null; }
    if (_phase1Store) dilatacaoPausaAtualId = _phase1Store.id;

    let analysisText = textToProcess;
    if (_phase1Store?.transcript) {
      analysisText = _phase1Store.transcript + '\n\n[RETORNO DA DILATACAO]\n\n' + textToProcess;
      console.log('[Audio] Fase 2 confirmada — transcrição da fase 1 anexada como contexto da análise.');
    }

    // Guard pré-Gemini: exame/refração em andamento — não analisar como consulta final.
    // Exceção: dilatacaoDetectada=true indica pausa clínica (exame concluído) — o guard
    // não se aplica porque o downstream já bloqueia auto-injeção e exibe dados para revisão.
    // Exceção 2: se a consulta foi explicitamente encerrada (STOP detectado ou manual), bypassar o guard.
    if (!SessionFlags.dilatacaoDetectada && !SessionFlags.consultaEncerradaDetectada && ClinicalTriggers.detectaExameEmAndamento(textToProcess)) {
      // Persistir a transcrição ANTES de adiar: a próxima gravação chama
      // resetSession() e apaga recognizedText — sem isso, a entrevista de uma
      // pausa manual (ex.: gatilho de dilatação não reconhecido) era destruída
      // em silêncio. O slot nasce/continua ARMADO (retomar=true): pausa de
      // exame é do MESMO paciente, que segue na sala — a próxima gravação
      // anexa este texto via marcador automaticamente. motivo='exame' NÃO
      // suprime o hook de dilatação na próxima sessão (a dilatação ainda pode
      // ser anunciada nela). Pausas de outros pacientes na fila ficam intactas.
      try {
        if (_phase1Store) {
          await DilatacaoPausas.atualizar(_phase1Store.id, {
            transcript: analysisText,
            ts: Date.now(),
            retomar: true,
          });
        } else {
          const _aba = await DilatacaoPausas.capturarAbaAtual();
          dilatacaoPausaAtualId = await DilatacaoPausas.criar({
            transcript: analysisText,
            motivo: 'exame',
            retomar: true,
            ...(_aba || {}),
          });
        }
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
      if (!SessionFlags.dilatacaoDetectada) {
        if (data.dilatacaoDetectada) {
          SessionFlags.dilatacaoDetectada = true;
        } else {
          const finalNorm = normalizeText(textToProcess) || normalizeText(recentTextBuffer);
          // Fase 2: só a cauda conta (narração retrospectiva não é nova pausa)
          const scanDil = SessionFlags.fase2DilatacaoAtiva ? finalNorm.slice(-300) : finalNorm;
          if (ClinicalTriggers.detectaDilatacaoNaFala(scanDil)) {
            SessionFlags.dilatacaoDetectada = true;
          }
        }
      }

      // DecisionEngine v6 — ponto autoritativo: aplica guards clínicos e reconcilia flags.
      // workingData substitui `data` daqui em diante para exibição e injeção.
      // Se a verificação ficar incompleta, _de.segurar barra a injeção automática
      // nos dois pontos de injeção abaixo (dilatação e fluxo normal).
      const _de = _aplicarDecisionEngine(data, analysisText, {
        blefariteInjetada:      SessionFlags.blefariteInjetada,
        examesNormaisInjetados: SessionFlags.examesNormaisInjetados,
        dilatacaoDetectada:     SessionFlags.dilatacaoDetectada,
      });
      const workingData = _de.workingData;
      if (_de.decision) {
        const decision = _de.decision;
        if (decision.guardsApplied.length > 0) {
          // Texto, não array: o DevTools colapsa "Array(4)" e a cópia do console
          // perde o conteúdo (log 2026-11-04).
          console.log('[DecisionEngine] Guards aplicados:\n  ' + decision.guardsApplied.join('\n  '));
        }
        if (decision.diagMedicacao) console.log(decision.diagMedicacao);
        console.log('[DecisionEngine] Flags reconciliadas:', decision.injectFlags,
          '| requestId:', decision.metadata.requestId);
        _showClinicalWarnings(decision.avisos);
        if (decision.injectFlags.dilatacao) SessionFlags.dilatacaoDetectada = true;
      }

      // Auto-feedback: palavra de remédio que o léxico não conhece vai para a fila de
      // revisão (fire-and-forget — nunca atrasa nem derruba a injeção).
      if (typeof registrarSuspeitasMedicamentos === 'function') registrarSuspeitasMedicamentos(textToProcess, workingData && workingData.dados);

      // Bloquear injeção automática quando o DecisionEngine sinalizar ruído / revisão manual
      if (workingData && (workingData.tipo_consulta === 'invalida' || workingData.noiseDetected || workingData.revisao_manual)) {
        _handleManualReview(workingData, textToProcess);
        return;
      }

      // Dilatação detectada: finalizar e injetar os dados coletados.
      // O médico atenderá outro paciente enquanto o colírio faz efeito,
      // por isso a consulta deve ser encerrada normalmente com injeção.
      if (SessionFlags.dilatacaoDetectada) {
        workingData.dilatacaoDetectada = true;

        // Persistir a transcrição da fase 1 ANTES de qualquer injeção/supressão.
        // A fase 2 (pós-dilatação) reanalisa a consulta completa a partir dela —
        // nada da entrevista se perde, mesmo se a injeção abaixo for suprimida.
        // analysisText já acumula fases anteriores em caso de múltiplas pausas.
        // Retomada em consumo (mesmo paciente dilatando de novo): o slot dele é
        // ATUALIZADO e desarmado. Sem retomada: nasce um slot NOVO na fila —
        // outros pacientes já em dilatação não são sobrescritos.
        try {
          if (_phase1Store) {
            await DilatacaoPausas.atualizar(_phase1Store.id, {
              transcript: analysisText,
              ts: Date.now(),
              motivo: 'dilatacao',
              retomar: false,
            });
          } else {
            const _aba = await DilatacaoPausas.capturarAbaAtual();
            dilatacaoPausaAtualId = await DilatacaoPausas.criar({
              transcript: analysisText,
              motivo: 'dilatacao',
              ...(_aba || {}),
            });
          }
          console.log('[Audio] Transcrição da fase 1 (pré-dilatação) persistida na fila de pausas.');
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

        // Depois de persistir a fase 1: a transcrição fica salva mesmo sem injeção.
        if (_de.segurar) {
          _segurarInjecaoAutomatica(workingData, textToProcess, _de.motivo, _de.decision && _de.decision.avisos);
          return;
        }

        displayAudioResults(workingData);
        processingStatus.textContent = 'Dilatação detectada — injetando dados coletados...';
        statusText.textContent = 'Finalizando (paciente em dilatação)...';
        statusText.style.color = '#3b82f6';
        statusText.style.fontWeight = 'normal';

        // displayAudioResults é síncrono: campos já preenchidos, sem espera fixa.
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

      if (_de.segurar) {
        _segurarInjecaoAutomatica(workingData, textToProcess, _de.motivo, _de.decision && _de.decision.avisos);
        return;
      }

      // Exibir resultados e auto-injetar
      processingStatus.textContent = 'Injetando automaticamente...';
      displayAudioResults(workingData);

      // displayAudioResults é síncrono (atribui .value direto): sem espera fixa de render.

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
    _analiseEmAndamento = false;
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

/**
 * Renderiza a SALA DE ESPERA de dilatação: uma linha por pausa ativa na fila,
 * cada uma com rótulo (tipo + hora + título da aba do prontuário, quando
 * capturado), botão "retomar" próprio e "✕" para descartar. O slot armado
 * (retomar=true) vira uma linha de confirmação verde com opção de desarmar.
 * O botão global "Não era dilatação" age sobre a pausa MAIS RECENTE.
 * Fonte única: a fila persistida _shospDilatacaoPausas (storage.onChanged
 * re-renderiza em todos os pontos de mutação).
 */
async function renderDilatacaoPausas() {
  if (!dilatacaoPausasContainer && !cancelDilatacaoBtn) return;
  let pausas = [];
  try {
    pausas = await DilatacaoPausas.listar();
  } catch (_e) { pausas = []; }

  if (cancelDilatacaoBtn) {
    cancelDilatacaoBtn.classList.toggle('hidden', pausas.length === 0);
  }
  if (!dilatacaoPausasContainer) return;

  dilatacaoPausasContainer.innerHTML = '';
  dilatacaoPausasContainer.classList.toggle('hidden', pausas.length === 0);

  for (const slot of pausas.slice().reverse()) { // mais recente no topo
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;' +
      'border-radius:6px;font-size:12px;margin-top:4px;' +
      (slot.retomar ? 'background:#dcfce7;color:#166534;' : 'background:#fef9c3;color:#854d0e;');

    const info = document.createElement('span');
    info.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    info.textContent = (slot.retomar ? '▶ ' : '⏳ ') + DilatacaoPausas.rotulo(slot);
    info.title = slot.retomar
      ? 'Retomada armada — a próxima gravação continua a consulta deste paciente'
      : 'Paciente aguardando (a próxima gravação NÃO usa esta pausa a menos que você clique em Retomar)';
    row.appendChild(info);

    // Slot armado (paciente voltou da dilatação): oferece capturar o NOVO grau
    // dilatado e injetá-lo SOMENTE na Refração estática. Opt-in — nem toda
    // retomada tem refração pós-dilatação.
    if (slot.retomar) {
      const estatica = document.createElement('button');
      estatica.className = 'btn btn-secondary';
      estatica.style.cssText = 'padding:2px 8px;font-size:11px;width:auto;';
      estatica.textContent = '📷 Refração estática';
      estatica.title = 'Capturar o ticket pós-dilatação e injetar apenas na Refração estática';
      estatica.addEventListener('click', () => {
        if (typeof startCameraCaptureEstatica === 'function') startCameraCaptureEstatica();
      });
      row.appendChild(estatica);
    }

    const acao = document.createElement('button');
    acao.className = 'btn ' + (slot.retomar ? 'btn-secondary' : 'btn-primary');
    acao.style.cssText = 'padding:2px 8px;font-size:11px;width:auto;';
    if (slot.retomar) {
      acao.textContent = 'Desarmar';
      acao.title = 'Não é o retorno deste paciente — próxima gravação volta a ser paciente novo';
      acao.addEventListener('click', () => desarmarRetomadaDilatacao());
    } else {
      acao.textContent = 'Retomar';
      acao.title = 'Este paciente voltou da dilatação — a próxima gravação continua a consulta dele';
      acao.addEventListener('click', () => confirmarRetomadaDilatacao(slot.id));
    }
    row.appendChild(acao);

    const descartar = document.createElement('button');
    descartar.textContent = '✕';
    descartar.title = 'Descartar esta pausa (a fase 1 persistida deste paciente será apagada)';
    descartar.style.cssText = 'border:none;background:transparent;cursor:pointer;' +
      'font-size:12px;color:inherit;padding:2px 4px;';
    descartar.addEventListener('click', () => descartarPausaDilatacao(slot.id));
    row.appendChild(descartar);

    dilatacaoPausasContainer.appendChild(row);
  }
}

// Nome antigo mantido como alias — chamadas legadas/documentação.
const refreshUndoVisibility = renderDilatacaoPausas;

/**
 * Arma a retomada de UM paciente da fila: a próxima gravação é a fase 2 dele
 * (anexa a transcrição, mescla campos na injeção e restringe o gatilho de
 * dilatação à cauda). Slots dos demais pacientes seguem aguardando, intactos.
 * Enquanto nenhum slot está armado, toda gravação é tratada como paciente
 * novo — o padrão seguro contra contaminação entre pacientes.
 */
async function confirmarRetomadaDilatacao(id) {
  let slot = null;
  try {
    slot = await DilatacaoPausas.marcarRetomada(id);
  } catch (_e) { slot = null; }
  renderDilatacaoPausas();

  if (!slot) {
    if (statusText) {
      statusText.textContent = 'Pausa de dilatação não encontrada (expirada?).';
      statusText.style.color = '#eab308';
    }
    return;
  }
  console.log('[Audio] Retomada armada — próxima gravação usará o contexto da fase 1 de:', DilatacaoPausas.rotulo(slot));
  if (statusText) {
    statusText.textContent = 'Retorno confirmado — grave a fase 2 deste paciente.';
    statusText.style.color = '#16a34a';
    statusText.style.fontWeight = 'normal';
  }
}

/** Desarma a retomada pendente — a próxima gravação volta a ser paciente novo. */
async function desarmarRetomadaDilatacao() {
  try { await DilatacaoPausas.desmarcarRetomadas(); } catch (_e) { /* não-fatal */ }
  renderDilatacaoPausas();
  if (statusText) {
    statusText.textContent = 'Retomada desarmada — próxima gravação é paciente novo.';
    statusText.style.color = '';
    statusText.style.fontWeight = 'normal';
  }
}

/** Descarta uma pausa específica da fila (fase 1 daquele paciente é apagada). */
async function descartarPausaDilatacao(id) {
  try { await DilatacaoPausas.remover(id); } catch (_e) { /* não-fatal */ }
  renderDilatacaoPausas();
}

async function cancelarDilatacao() {
  // Age sobre a pausa MAIS RECENTE de dilatação: o gatilho por engano é
  // percebido na hora, logo após a pausa indevida nascer.
  let store = null;
  try {
    const pausas = await DilatacaoPausas.listar();
    store = pausas.slice().reverse().find(p => p.motivo === 'dilatacao') || null;
  } catch (_e) { store = null; }

  if (!store?.transcript) {
    renderDilatacaoPausas();
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
    const _de = _aplicarDecisionEngine(data, analysisText, {
      blefariteInjetada:      SessionFlags.blefariteInjetada,
      examesNormaisInjetados: SessionFlags.examesNormaisInjetados,
      dilatacaoDetectada:     false,
    });
    const workingData = _de.workingData;
    if (_de.decision) {
      if (_de.decision.guardsApplied.length > 0) {
        console.log('[Dilatacao] Reprocessamento — guards:\n  ' + _de.decision.guardsApplied.join('\n  '));
      }
      // O banner é o ÚNICO sinal visível quando um template é suprimido (ex.: blefarite
      // sem inflamação descrita deixa a biomicroscopia em branco). Sem esta chamada, a
      // fase 2 volta a falhar em silêncio como no log 2026-07-29.
      _showClinicalWarnings(_de.decision.avisos);
    }
    workingData.dilatacaoDetectada = false; // garante placeholder correto em displayAudioResults

    // Verificação incompleta: mostra para conferência e NÃO reinjeta. A pausa fica
    // na sala de espera — a transcrição só sai da fila depois de uma injeção feita.
    if (_de.segurar) {
      _segurarInjecaoAutomatica(workingData, analysisText, _de.motivo, _de.decision && _de.decision.avisos);
      return;
    }

    displayAudioResults(workingData);
    await injectAll(true); // force: sobrescreve a injeção da fase 1

    await DilatacaoPausas.remover(store.id); // só o slot cancelado — a fila segue

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
const SEM_FALA_AVISO_MS      = 30_000;  // 30s sem fala mostra aviso de mic morto
// 40s sem NENHUM `onresult` (nem interim) derruba e recria o reconhecedor. O
// intervalo fica bem abaixo do SILENCE_THRESHOLD_MS para dar 3–4 tentativas de
// ressuscitar a captura antes que o auto-stop sequer considere encerrar, e bem
// acima da pausa normal entre falas de um exame (o interim dispara a cada
// ruído, não só a cada frase completa).
const SPEECH_RECICLO_MS      = 40_000;

/**
 * Saúde da captura — sinais OBJETIVOS, não inferência a partir de silêncio.
 * Roda inclusive com a câmera aberta, onde o silêncio é normal mas a morte do
 * microfone (justamente o que abrir a câmera provoca) não seria vista por
 * nenhuma outra rede.
 */
function _checkMicHealth() {
  if (persistentStream && !_micTrackSaudavel(persistentStream)) {
    if (!micMudoDetectado) {
      micMudoDetectado = true;
      console.warn('[Mic] ⚠️ Track de áudio inutilizável (mute/ended) detectada no polling.');
    }
    _avisarMicMorto('⚠️ Microfone mudo — o áudio NÃO está sendo capturado');
    return;
  }
  if (stopCommandTimeout) return;
  if (_probeSpeechAlive() === 'alive') _checkSpeechProduzindo();
}

/**
 * Prova de PRODUÇÃO — a que a sonda de liveness não dá.
 *
 * `_probeSpeechAlive` só distingue "parado" de "rodando": um reconhecedor zumbi
 * (rodando, sem entregar `onresult` nem `no-speech`) devolve 'alive' a cada 10s
 * indefinidamente. Foi assim que o log 2026-09-03 perdeu os 3 minutos finais da
 * consulta — fim da refração, conduta e despedida — sem uma linha de aviso.
 *
 * O único sinal confiável de que a captura funciona é texto chegando. Sem
 * `onresult` por SPEECH_RECICLO_MS, a sessão é descartada e recriada do zero:
 * `stop()` não tira um zumbi do lugar (ele não emite `onend`), então o objeto
 * inteiro é abandonado e um novo `SpeechRecognition` assume.
 *
 * `lastSpeechTime` NÃO é tocado aqui: o reciclo é uma tentativa de conserto, não
 * prova de fala. Zerá-lo tornaria o auto-stop por silêncio inalcançável.
 */
function _checkSpeechProduzindo() {
  if (Date.now() - lastSpeechTime < SPEECH_RECICLO_MS) return;
  if (Date.now() - ultimoRecicloSpeech < SPEECH_RECICLO_MS) return;
  _reciclarSpeechRecognition(`${Math.round((Date.now() - lastSpeechTime) / 1000)}s sem onresult`);
}

/** Derruba o reconhecedor atual e sobe um novo. Seguro contra o zumbi. */
function _reciclarSpeechRecognition(motivo) {
  ultimoRecicloSpeech = Date.now();
  reciclosSpeechNaSessao++;
  console.warn(`[Speech] Reciclo forçado #${reciclosSpeechNaSessao} (${motivo}) — sessão viva mas sem produzir texto.`);

  const _velho = speechRecognition;
  // Zerar a referência ANTES de parar: os handlers do objeto velho comparam
  // contra `speechRecognition` e viram no-op, então o `onend` atrasado dele não
  // derruba `isSpeechActive` nem tenta reiniciar a sessão nova.
  speechRecognition = null;
  isSpeechActive = false;
  try { _velho?.abort(); } catch (_e) { /* zumbi não responde — esperado */ }

  startSpeechRecognition();
}

function _checkSilence() {
  if (!isRecording) return;

  _checkMicHealth();

  if (stopCommandTimeout || SessionFlags.dilatacaoDetectada || silencePendingStop) return;
  // O aviso por silêncio e o auto-stop seguem suspensos durante a câmera: ali o
  // silêncio é esperado, e avisar em toda captura de OCR treinaria o médico a
  // ignorar o aviso. A morte do microfone já é coberta por _checkMicHealth.
  if (isSpeechPausedByCamera) return;

  const silenceMs = Date.now() - lastSpeechTime;

  // Aviso de captura morta: nenhuma fala reconhecida há 30s+. O médico precisa
  // VER que o áudio não está chegando antes de dizer a despedida — caso real
  // 2026-07-16: o STT morreu no fim da consulta e engoliu "passe no balcão",
  // "boa tarde" e "encerrar a consulta" sem nenhum feedback; o status seguia
  // mostrando "Gravando..." como se tudo estivesse normal.
  if (silenceMs >= SEM_FALA_AVISO_MS) {
    semFalaAvisoAtivo = true;
    statusText.textContent = `⚠️ Sem fala há ${Math.round(silenceMs / 1000)}s — verifique o microfone antes da despedida`;
    statusText.style.color = '#f59e0b';
  }

  if (Date.now() - sessionStartTime < SILENCE_MIN_SESSION_MS) return;

  const wordCount = recognizedText.trim() ? recognizedText.trim().split(/\s+/).length : 0;
  if (wordCount < SILENCE_MIN_WORDS) return;

  if (silenceMs < SILENCE_THRESHOLD_MS) return;

  console.log(`[Silence] ${Math.round(silenceMs / 1000)}s sem fala (${wordCount} palavras) — agendando encerramento`);
  statusText.textContent = 'Silêncio prolongado — encerrando em 5s (fale para cancelar)';
  statusText.style.color = '#16a34a';

  silencePendingStop = setTimeout(() => {
    silencePendingStop = null;
    if (isRecording && !stopCommandTimeout) {
      // O auto-stop NÃO é um encerramento de consulta — é uma rede de segurança
      // contra gravação esquecida. Marcar consultaEncerradaDetectada aqui era
      // afirmar uma despedida que ninguém disse: a flag bypassa o guard de
      // "exame em andamento" e libera o fallback de exames normais na injeção.
      // No log 2026-09-03 foi ela que transformou uma captura morta no meio da
      // refração em prontuário completo e injetado. Só é setada quando a
      // despedida REALMENTE está no texto (o hook pode ter perdido o gatilho
      // por restart do Speech no momento exato).
      const _txt = normalizeText(recognizedText) || normalizeText(recentTextBuffer);
      const _despediu = ClinicalTriggers.detectaEncerramentoNaFala(_txt);
      if (_despediu) {
        SessionFlags.consultaEncerradaDetectada = true;
        console.log('[Silence] Auto-stop por silêncio — despedida presente no texto, tratando como encerramento');
      } else {
        console.warn(`[Silence] Auto-stop por silêncio SEM despedida no texto — a consulta pode ter sido cortada (reciclos do reconhecedor nesta sessão: ${reciclosSpeechNaSessao}). Sem bypass do guard de exame e sem fallback de exames normais.`);
      }
      stopRecording();
      if (!_despediu) {
        // stopRecording deixa "Processando..."; o médico precisa ver que este
        // encerramento foi da rede de segurança, não da consulta.
        statusText.textContent = '⚠️ Parada por silêncio — confira se o fim da consulta foi capturado';
        statusText.style.color = '#f59e0b';
      }
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

    // Identidade da sessão. Um reconhecedor reciclado ainda pode emitir eventos
    // atrasados (o `onend` do zumbi chega minutos depois); sem esta guarda, esses
    // eventos mexeriam no estado da sessão NOVA — `isSpeechActive = false` num
    // reconhecedor saudável reabre exatamente o buraco que o reciclo fechou.
    const _rec = speechRecognition;
    const _daSessaoAtual = () => speechRecognition === _rec;

    speechRecognition.onstart = () => {
      if (!_daSessaoAtual()) return;
      isSpeechActive = true;
      speechEndSeen = false;
      console.log('[Speech] Reconhecimento de voz iniciado.');
    };

    speechRecognition.onresult = (event) => {
      if (!_daSessaoAtual()) return;
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
      // Fala voltou a chegar — restaurar o status se o aviso de mic morto estava ativo
      if (semFalaAvisoAtivo) {
        semFalaAvisoAtivo = false;
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
      if (!_daSessaoAtual()) return;
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
            // Reiniciar só se ainda estiver gravando e sem stop agendado.
            // (A câmera não bloqueia mais a recuperação — ver onend.)
            if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechActive) {
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
        if (isRecording && !stopCommandTimeout) {
          clearTimeout(speechRecoveryTimer);
          speechRecoveryTimer = setTimeout(() => {
            speechRecoveryTimer = null;
            if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechActive) {
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
      if (!_daSessaoAtual()) return;
      isSpeechActive = false;
      speechEndSeen = true;
      console.log('[Speech] Reconhecimento de voz encerrado.');

      // Não reiniciar se um comando de parada já foi agendado ou se está em backoff.
      //
      // A câmera NÃO bloqueia mais o restart. Ela nunca parou o reconhecimento
      // (pauseSpeechRecognition só levanta uma flag — a câmera é vídeo-only),
      // então bloquear a recuperação aqui era herança de quando ela parava: um
      // `onend` do Chrome no meio de uma captura de OCR ficava sem restart até
      // a câmera fechar, e a consulta seguia gravando nada. Ver log 2026-08-07.
      if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechBackingOff) {
        setTimeout(() => {
          if (isRecording && speechRecognition && !stopCommandTimeout && !isSpeechActive) {
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

/**
 * Sonda de liveness do reconhecedor — e conserto no mesmo gesto.
 *
 * `isSpeechActive` é otimista: é marcado `true` ao CHAMAR `start()` e só volta
 * a `false` no `onend`. Quando o Chrome mata a sessão sem emitir `onend` (é o
 * que acontece quando o áudio some), a flag fica presa em `true` e todo caminho
 * de recuperação — que testa `!isSpeechActive` — vira no-op silencioso.
 *
 * `start()` numa sessão viva lança `InvalidStateError` sem efeito colateral.
 * Isso torna a própria chamada o teste: se lançar, estava vivo; se não lançar,
 * estava morto e acabou de voltar.
 *
 * @returns {'alive'|'restarted'|'failed'|'skip'}
 */
function _probeSpeechAlive() {
  if (!isRecording || !speechRecognition || stopCommandTimeout || isSpeechBackingOff) return 'skip';
  try {
    speechRecognition.start();
    isSpeechActive = true;
    // Os dois casos são falhas diferentes e não podem sair com a mesma frase:
    // com `onend` visto, o restart de 300ms é que não pegou; sem ele, a sessão
    // morreu sem emitir evento nenhum — que é o modo silencioso do log 2026-08-07.
    console.warn(speechEndSeen
      ? '[Speech] Reconhecedor parado após onend (restart não pegou) — reiniciado pela sonda.'
      : '[Speech] Reconhecedor estava parado sem ter emitido onend — reiniciado pela sonda.');
    return 'restarted';
  } catch (e) {
    if (e?.name === 'InvalidStateError') return 'alive';
    console.warn('[Speech] Sonda de liveness falhou:', e?.message);
    return 'failed';
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

  // Não confiar em `isSpeechActive` aqui: no log 2026-08-07 esta função logou
  // "retomado" e não reiniciou nada, porque a flag ainda dizia `true` enquanto o
  // reconhecedor estava morto havia 70s. A sonda descobre o estado real.
  const estado = _probeSpeechAlive();
  console.log(`[Speech] Reconhecimento retomado após fechar câmera (reconhecedor: ${estado}).`);

  if ((estado === 'alive' || estado === 'restarted') && !micMudoDetectado) {
    statusText.textContent = 'Gravando...';
    statusText.style.color = '#ef4444';
    statusText.style.fontWeight = 'bold';
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