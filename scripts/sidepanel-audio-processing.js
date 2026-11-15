/**
 * SIDEPANEL — Processamento do áudio (Gemini) e desfazer dilatação
 * Parte de sidepanel-audio.js dividido por responsabilidade (conteúdo inalterado).
 * Carregado logo após sidepanel-audio.js (ver sidepanel.html). Depende de: sidepanel-constants.js
 */

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
      if (AppState.recentTextBuffer && AppState.recentTextBuffer.trim().length >= 20) {
        console.warn('[Audio] capturedText vazio — usando recentTextBuffer como fallback:', AppState.recentTextBuffer.substring(0, 80));
        textToProcess = AppState.recentTextBuffer;
        processingStatus.textContent = 'Transcrição parcial — verifique o resultado';
        statusText.textContent = 'Áudio incompleto — revise os dados';
        statusText.style.color = '#eab308';
      } else {
        dbg('[Audio] Nenhum texto capturado — sessão encerrada sem dados.');
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
      dbg('[Audio] Transcrição da fase pré-dilatação anexada como contexto da análise.');
    }

    // Guard pré-Gemini: exame/refração em andamento — não analisar como consulta final.
    // Exceção: dilatacaoDetectada=true indica pausa clínica (exame concluído) — o guard
    // não se aplica porque o downstream já bloqueia auto-injeção e exibe dados para revisão.
    // Exceção 2: se a consulta foi explicitamente encerrada (STOP detectado ou manual), bypassar o guard.
    if (!AppState.dilatacaoDetectada && !AppState.consultaEncerradaDetectada && ClinicalTriggers.detectaExameEmAndamento(textToProcess)) {
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
        dbg('[Audio] Exame em andamento — transcrição persistida; será anexada à próxima gravação.');
      } catch (_e) { /* storage indisponível — não-fatal */ }
      statusText.textContent = 'Exame em andamento, aguardando encerramento';
      statusText.style.color = '#eab308';
      statusText.style.fontWeight = 'normal';
      processingStatus.textContent = 'Exame em andamento — aguardando gatilho de fim ou pausa';
      dbg('[Audio] Exame em andamento detectado — análise com Gemini adiada.');
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
        dbg(data._raciocinio);
        console.groupEnd();
        chrome.storage.local.set({
          lastGeminiReasoning: data._raciocinio,
          lastGeminiDate: new Date().toLocaleString()
        });
      }

      // Fallback: varrer o texto processado + buffer recente por comandos de dilatação
      // (o hook de dilatação pode não ter disparado se o Speech API reiniciou nesse momento)
      if (!AppState.dilatacaoDetectada) {
        if (data.dilatacaoDetectada) {
          StateManager.setHookFlag('dilatacaoDetectada', true);
        } else {
          const finalNorm = normalizeText(textToProcess) || normalizeText(AppState.recentTextBuffer);
          // Fase 2: só a cauda conta (narração retrospectiva não é nova pausa)
          const scanDil = AppState.fase2DilatacaoAtiva ? finalNorm.slice(-300) : finalNorm;
          if (ClinicalTriggers.detectaDilatacaoNaFala(scanDil)) {
            StateManager.setHookFlag('dilatacaoDetectada', true);
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
              blefariteInjetada: AppState.blefariteInjetada,
              examesNormaisInjetados: AppState.examesNormaisInjetados,
              dilatacaoDetectada: AppState.dilatacaoDetectada,
            },
            tipoConsulta: data.tipo_consulta,
          });
          if (decision.guardsApplied.length > 0) {
            dbg('[DecisionEngine] Guards aplicados:', decision.guardsApplied);
          }
          dbg('[DecisionEngine] Flags reconciliadas:', decision.injectFlags,
            '| requestId:', decision.metadata.requestId);

          // Usar resposta tratada pelo DE como fonte autoritativa
          workingData = decision.clonedAIResponse;
          // Copiar flags reconciliadas de volta para o objeto de trabalho
          workingData.injectExamesNormais = decision.injectFlags.injectExamesNormais;
          workingData.injectBlefarite     = decision.injectFlags.injectBlefarite;
          if (decision.injectFlags.dilatacao) StateManager.setHookFlag('dilatacaoDetectada', true);
        }
      } catch (e) {
        console.warn('[DecisionEngine] Falha ao calcular decisão (não-fatal):', e.message);
        workingData = data;
      }

      // Dilatação detectada: finalizar e injetar os dados coletados.
      // O médico atenderá outro paciente enquanto o colírio faz efeito,
      // por isso a consulta deve ser encerrada normalmente com injeção.
      if (AppState.dilatacaoDetectada) {
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
          dbg('[Audio] Transcrição da fase 1 (pré-dilatação) persistida para a fase 2.');
        } catch (_e) { /* storage indisponível — não-fatal */ }

        // Comando puro de dilatação: nenhum dado clínico coletado — registrar pausa sem injetar.
        if (!_temDadosClinicos(workingData.dados)) {
          processingStatus.textContent = 'Paciente aguardando dilatação...';
          statusText.textContent = 'Pausa para dilatação — sem dados novos de entrevista';
          statusText.style.color = '#eab308';
          statusText.style.fontWeight = 'normal';
          dbg('[Audio] Dilatação sem dados clínicos novos — injeção adiada; transcrição preservada para a fase 2.');
          return;
        }

        displayAudioResults(workingData);
        processingStatus.textContent = 'Dilatação detectada — injetando dados coletados...';
        statusText.textContent = 'Finalizando (paciente em dilatação)...';
        statusText.style.color = '#3b82f6';
        statusText.style.fontWeight = 'normal';

        await new Promise(r => setTimeout(r, 800));

        if (AppState.audioDataInjected) {
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
      if (AppState.audioDataInjected) {
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
    AppState.seconds = 0;
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
    AppState.audioDataInjected = false;
    AppState.cameraDataInjected = false;

    const analysisText = store.transcript;
    const data = await window.GeminiService.analyzeConsultation(analysisText, { forceComplete: true });
    if (!data || !data.dados) throw new Error('Reprocessamento retornou resposta inválida');

    // DecisionEngine com dilatação forçada em false.
    let workingData = data;
    try {
      if (typeof DecisionEngine !== 'undefined' && DecisionEngine.buildDecision) {
        const decision = DecisionEngine.buildDecision(data, {
          transcribedText: analysisText,
          hookFlags: { blefariteInjetada: AppState.blefariteInjetada, examesNormaisInjetados: AppState.examesNormaisInjetados, dilatacaoDetectada: false },
          tipoConsulta: data.tipo_consulta,
        });
        if (decision.guardsApplied.length > 0) {
          dbg('[Dilatacao] Reprocessamento — guards:', decision.guardsApplied);
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
