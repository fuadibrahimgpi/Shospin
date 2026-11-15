/**
 * SIDEPANEL — Limpeza e feedback visual
 * Parte de sidepanel-injection.js dividido por responsabilidade (conteúdo inalterado).
 * Carregado logo após sidepanel-injection.js (ver sidepanel.html). Depende de: sidepanel-constants.js
 */

// ============================================================================
// LIMPEZA
// ============================================================================

function clearAll(options = { clearAudio: true, clearCamera: true }) {
  try {
    const clearAudio = options.clearAudio !== false;
    const clearCamera = options.clearCamera !== false;

    // ── 1. Resetar dados ──
    if (clearAudio) {
      audioData = null;
      audioDataInjected = false;
    }
    if (clearCamera) {
      cameraData = null;
      cameraDataInjected = false;
    }

    // ── 2. Resetar flags de gatilhos (SOMENTE se NÃO está gravando) ──
    // Cada flag corresponde a um hook em sidepanel-hooks.js.
    // Para adicionar uma nova flag: declarar em sidepanel-constants.js,
    // registrar o hook em sidepanel-hooks.js e adicionar o reset aqui.
    if (clearAudio && !isRecording) {
      StateManager.setHookFlag('examesNormaisInjetados', false);
      StateManager.setHookFlag('blefariteInjetada', false);
      StateManager.setHookFlag('fundoscopiaDetectada', false);
      StateManager.setHookFlag('receitaOlhoIrritadoInjetada', false);
      StateManager.setHookFlag('catarataDetectada', false);
      StateManager.setHookFlag('catarataGrau', null);
      StateManager.setHookFlag('lioDetectada', false);
      StateManager.setHookFlag('opacidadeCapsulaDetectada', false);
      StateManager.setHookFlag('dilatacaoDetectada', false);
      StateManager.setHookFlag('fase2DilatacaoAtiva', false);
      lastTriggerTime = 0;
      if (stopCommandTimeout) { clearTimeout(stopCommandTimeout); stopCommandTimeout = null; }
      stopPendingInfo = null;
      stopGateOffset = 0;
      stopGateBlockCount = 0;
      recognizedText = '';
    }

    // dilatacaoDetectada também é resetada se limpar câmera sem áudio
    // (evita que flag de sessão anterior suprima conduta da próxima gravação)
    if (clearCamera && !clearAudio && !isRecording) {
      StateManager.setHookFlag('dilatacaoDetectada', false);
    }

    // ── 4. Limpar campos de áudio ──
    // Guard: não limpar campos se gravação ativa (protege dados injetados manualmente)
    if (clearAudio && !isRecording) {
      // diagnosticoField e diagnosticoRetornoField são preservados para permitir
      // busca de CID após a injeção. São limpos quando o campo fica vazio após
      // todos os termos serem processados por handleSearchCid.
      const audioFields = [hdaField, medicacoesField, antecedentesOftField, doencasSistemicasField,
        antecedentesFamField, retornoField, medicacoesRetornoField, condutaField,
        medicamentosPrescritosField, condutaRetornoField, medicamentosPrescritosRetornoField];
      audioFields.forEach(f => { if (f) f.value = ''; });
      hideResults();
    }

    // ── 5. Limpar campos de exames ──
    if (clearCamera) {
      ['tonoOdField', 'tonoOeField', 'paquiOdField', 'paquiOeField',
        'refOdEsf', 'refOdCil', 'refOdEixo', 'refOeEsf', 'refOeCil', 'refOeEixo'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
      
      if (examFieldsContainer) examFieldsContainer.classList.add('hidden');
      if (tonometriaSection) tonometriaSection.classList.add('hidden');
      if (paquimetriaSection) paquimetriaSection.classList.add('hidden');
      if (refracaoSection) refracaoSection.classList.add('hidden');
      
      const receitaOption = document.getElementById('receitaOculosOption');
      const receitaCheckbox = document.getElementById('injectReceitaCheckbox');
      if (receitaOption) receitaOption.classList.add('hidden');
      if (receitaCheckbox) receitaCheckbox.checked = true;

      const banner = document.getElementById('refractionWarningBanner');
      if (banner) banner.remove();
      pendingRefractionConfirmation = false;
    }

    if (clearAudio && clearCamera) {
      if (dataSummary) dataSummary.classList.add('hidden');
      if (actionButtons) actionButtons.classList.add('hidden');
    } else {
      updateDataSummary();
    }

    if (processingIndicator) processingIndicator.classList.add('hidden');

    // ── 10. Resetar timer visual ──
    if (clearAudio && !isRecording) {
      seconds = 0;
      if (timerText) {
        timerText.textContent = '00:00';
        timerText.classList.add('hidden');
      }
      if (statusText) {
        statusText.textContent = 'Clique para iniciar o ditado';
        statusText.style.color = '';
        statusText.style.fontWeight = 'normal';
      }
      if (recordBtn) recordBtn.classList.remove('recording');
    }

    if (clearCamera && cameraStatusText) {
      cameraStatusText.textContent = 'Aponte para o ticket TOPCON ou autorefrator';
      cameraStatusText.style.color = '';
    }

    // Privacidade: remover dados de raciocínio da IA do storage local
    if (clearAudio) {
      chrome.storage.local.remove(['lastGeminiReasoning', 'lastGeminiDate']);
    }

    // Limpeza manual (novo paciente): descartar fase 1 de dilatação persistida,
    // para que a entrevista de um paciente não contamine a análise do próximo.
    // O clearAll automático pós-injeção NÃO passa esta opção — preserva a fase 1.
    if (options.discardDilatacao === true) {
      chrome.storage.local.remove('_shospDilatacaoPhase1');
    }

    dbg('[ClearAll] Limpeza concluída', options);

  } catch (error) {
    console.error('[ClearAll] Erro:', error);
  }
}

// ============================================================================
// FEEDBACK VISUAL
// ============================================================================

function showSuccess() {
  successMessage.classList.remove('hidden');
  setFeedbackMessage(successMessage, 'Dados injetados com sucesso!', true);
  successMessage.style.background = '#dcfce7';
  successMessage.style.color = '#166534';
  setTimeout(() => successMessage.classList.add('hidden'), 3000);
  // Nota: chrome.notifications não funciona em sidepanels, apenas feedback visual acima
}

/**
 * Define a mensagem de feedback sem interpretar HTML (texto pode vir de fala/IA).
 * O ícone SVG é uma constante interna, nunca derivada de entrada externa.
 */
const SUCCESS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
function setFeedbackMessage(el, text, withIcon = false) {
  el.textContent = '';
  if (withIcon) {
    const tpl = document.createElement('template');
    tpl.innerHTML = SUCCESS_ICON_SVG;
    el.appendChild(tpl.content);
  }
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
}

function showError(message) {
  successMessage.classList.remove('hidden');
  setFeedbackMessage(successMessage, message);
  successMessage.style.background = '#fee2e2';
  successMessage.style.color = '#991b1b';
  setTimeout(() => successMessage.classList.add('hidden'), 3000);
}
