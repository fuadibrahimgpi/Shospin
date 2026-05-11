/**
 * ============================================================================
 * SIDEPANEL — MÓDULO DE INJEÇÃO E ORQUESTRAÇÃO
 * ============================================================================
 * Injeção de dados no SHOSP, limpeza, feedback visual,
 * injeção direta de exames normais/blefarite/receita olho irritado.
 * Depende de: sidepanel-constants.js
 *
 * v4.3 — Correções:
 *   - checkPage: aumentado de 2 para 3 tentativas com delay de 1000ms
 *     (reduz necessidade de re-injeção manual via executeScript)
 *   - injectBlefariteDirect() agora injeta fundoscopia normal junto
 *   - injectAll() blefarite também envia fundoscopia normal
 *   - Bloqueio mútuo entre blefarite e exames normais
 */

// ============================================================================
// UI — RESUMO E VISIBILIDADE
// ============================================================================

function updateDataSummary() {
  const hasAudio = audioData !== null;
  const hasCamera = cameraData !== null;

  if (hasAudio || hasCamera) {
    dataSummary.classList.remove('hidden');
    audioBadge.classList.toggle('hidden', !hasAudio);
    cameraBadge.classList.toggle('hidden', !hasCamera);
    actionButtons.classList.remove('hidden');
  } else {
    dataSummary.classList.add('hidden');
    actionButtons.classList.add('hidden');
  }
}

function hideResults() {
  consultationType.classList.add('hidden');
  // Manter audioFieldsContainer visível se ainda há diagnóstico pendente para busca de CID.
  // O botão Buscar fica inacessível se o container for escondido.
  const hasPendingCid = diagnosticoField?.value?.trim() || diagnosticoRetornoField?.value?.trim();
  if (!hasPendingCid) {
    audioFieldsContainer.classList.add('hidden');
  }
  successMessage.classList.add('hidden');
}

// ============================================================================
// INJEÇÃO PRINCIPAL — ORQUESTRAÇÃO
// ============================================================================

if (btnSearchCid) {
  btnSearchCid.addEventListener('click', () => handleSearchCid(diagnosticoField));
}
if (btnSearchCidRetorno) {
  btnSearchCidRetorno.addEventListener('click', () => handleSearchCid(diagnosticoRetornoField));
}

async function handleSearchCid(field) {
  const text = field.value.trim();
  if (!text) {
    showError('Nenhum diagnóstico para buscar.');
    return;
  }
  
  // Separar por newline, vírgula ou ponto e vírgula (IA usa \n como separador)
  const terms = text.split(/\n|,|;/).map(t => t.trim()).filter(t => t.length > 0);
  if (terms.length === 0) return;

  const rawTerm = terms[0];
  // Extrair só o código CID quando o formato for "H010 - Descrição"
  const codeMatch = rawTerm.match(/^([A-Z]\d+(?:\.\d+)?)\s*[-–]/);
  const termToSearch = codeMatch ? codeMatch[1] : rawTerm;

  // Feedback visual imediato
  successMessage.classList.remove('hidden');
  successMessage.innerHTML = `<span>🔍 Buscando CID: ${rawTerm}...</span>`;
  successMessage.style.background = '#eff6ff';
  successMessage.style.color = '#1e40af';

  try {
    let tabs = await chrome.tabs.query({ url: '*://*.shosp.com.br/*' });
    if (!tabs.length) {
      showError('Shosp não encontrado');
      return;
    }
    
    // content.js já está no manifest — não reinjetar (causaria instâncias duplicadas)
    
    console.log(`[SearchCid] termo="${termToSearch}" → tab=${tabs[0].id}`);
    const resp = await sendToTab(tabs[0].id, { action: 'searchCid', term: termToSearch });
    console.log(`[SearchCid] resp=`, resp);
    if (resp && resp.success) {
      // Atualiza o campo com os restantes (remove o termo já buscado)
      field.value = terms.slice(1).join('\n');
      // Feedback de sucesso
      successMessage.classList.remove('hidden');
      successMessage.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>C.I.D. lançado: ${termToSearch}</span>`;
      successMessage.style.background = '#dcfce7';
      successMessage.style.color = '#166534';
      setTimeout(() => successMessage.classList.add('hidden'), 3000);
      // Auto-encadear próximo termo após delay
      const stillHasCid = field.value.trim();
      if (stillHasCid) {
        setTimeout(() => handleSearchCid(field), 1800);
      } else {
        // Verificar se algum campo ainda tem termos pendentes
        const anyPending = diagnosticoField?.value?.trim() || diagnosticoRetornoField?.value?.trim();
        if (!anyPending) {
          audioFieldsContainer.classList.add('hidden');
        }
      }
    } else {
      const errMsg = resp?.error || 'Aba C.I.D. não encontrada na página';
      showError(`CID: ${errMsg}`);
    }
  } catch (err) {
    showError('Erro ao buscar C.I.D.');
    console.error(err);
  }
}

async function injectAll() {
  // Guard contra chamadas paralelas (ex: stop hook + botão manual simultâneos)
  if (injectAll._running) {
    console.warn('[InjectAll] Já em execução — ignorando chamada paralela.');
    throw new Error('injectAll já em execução');
  }
  injectAll._running = true;

  // Guard de segurança: bloquear injeção quando transcrição foi sinalizada como ruidosa.
  if (audioData && (audioData.tipo_consulta === 'invalida' || audioData.noiseDetected === true || audioData.revisao_manual === true)) {
    injectAll._running = false;
    showError('Revisão manual obrigatória: transcrição ruidosa ou clinicamente insegura.');
    throw new Error('Revisão manual obrigatória');
  }

  // Guard de dilatação: se a consulta ainda não encerrou (paciente foi dilatar),
  // o audioData contém dados parciais — NÃO injetar conduta/tratamento ainda.
  // Permite injeção de camera (exames OCR) mas exclui o áudio desta chamada.
  // O áudio permanece disponível para quando o paciente retornar e a gravação reiniciar.
  if (dilatacaoDetectada && audioData && !audioData._dilatacaoConcluidaManualmente) {
    console.warn('[InjectAll] Dilatação pendente — excluindo áudio desta injeção (apenas câmera será enviada).');
    audioDataInjected = true; // marcar como "já tratado" para evitar auto-injeção duplicada
    injectAll._running = false;
    // Re-chamar sem o audioData para injetar apenas câmera
    const _audioDataBackup = audioData;
    audioData = null;
    try {
      await injectAll();
    } finally {
      audioData = _audioDataBackup;
      audioDataInjected = false; // restaurar para que o médico possa injetar manualmente ao final
    }
    return;
  }

  // 1. Buscar aba do SHOSP
  // Tenta padrões do mais específico ao mais geral para não perder a aba.
  let tabs;
  try {
    // Tentativa 1: URL exata do sistema principal (HTTPS)
    tabs = await chrome.tabs.query({ url: 'https://sistema.shosp.com.br/*' });

    // Tentativa 2: qualquer subdomínio HTTPS
    if (!tabs.length) {
      tabs = await chrome.tabs.query({ url: 'https://*.shosp.com.br/*' });
    }

    // Tentativa 3: padrão genérico (inclui http — improvavél, mas cobre edge cases)
    if (!tabs.length) {
      tabs = await chrome.tabs.query({ url: '*://*.shosp.com.br/*' });
    }

    // Tentativa 4: aba ativa (o médico pode tê-la focada no momento exato)
    if (!tabs.length) {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const shosp = activeTabs.filter(t => (t.url || '').includes('shosp.com.br'));
      if (shosp.length) tabs = shosp;
    }

    console.log(`[InjectAll] Abas SHOSP encontradas: ${tabs.length}`, tabs.map(t => t.url?.slice(0, 60)));
  } catch (e) {
    injectAll._running = false;
    showError('Erro ao buscar aba do SHOSP');
    throw e;
  }

  const tab = tabs[0];
  if (!tab) {
    injectAll._running = false;
    showError('Erro: Abra a página do SHOSP primeiro');
    throw new Error('Nenhuma aba do SHOSP');
  }

  // 2. Verificar se há dados para injetar
  const temAudio = audioData && !audioDataInjected;
  const temCamera = cameraData && !cameraDataInjected;

  if (!temAudio && !temCamera) {
    injectAll._running = false;
    showError('Dados já injetados! Limpe para injetar novamente.');
    throw new Error('Dados já injetados');
  }

  // Marcar como injetado ANTES dos awaits para bloquear chamadas concorrentes.
  // Será revertido em caso de erro.
  if (temAudio) audioDataInjected = true;
  if (temCamera) cameraDataInjected = true;

  try {
  // 3. Garantir que o content script está respondendo (não reinjetar — já está no manifest)
  // Apenas aguarda um ciclo de evento para garantir que o content script está pronto

  // 4. Verificar página (com retry rápido)
  // background.js re-injeta content.js proativamente em cada nav SPA, portanto
  // a primeira tentativa deve funcionar na maioria dos casos.
  // Mantemos 3 tentativas como fallback para o caso de o background não ter
  // concluído a re-injeção a tempo (corrida de eventos entre tabs.onUpdated
  // e a chamada imediata do injectAll).
  const MAX_RETRIES = 3;
  let checkOk = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = await sendToTab(tab.id, { action: 'checkPage' });
    if (resp === 'CONTEXT_INVALIDATED') {
      showError('Recarregue a aba do SHOSP (F5) e tente novamente.');
      throw new Error('Extension context invalidated');
    }
    if (resp?.isShospPage) { checkOk = true; break; }

    console.warn(`[InjectAll] checkPage tentativa ${attempt}/${MAX_RETRIES} falhou — aguardando...`);
    if (attempt < MAX_RETRIES) {
      // Aguardar 1000ms: janela para o background.js concluir a re-injeção
      // caso a nav SPA tenha ocorrido muito próxima ao disparo do injectAll.
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!checkOk) {
    // Última tentativa: re-injetar o content script via executeScript.
    // O novo content.js remove o listener órfão e registra um fresco —
    // resolve o caso em que o guard window.__shospExtensionLoaded impedia
    // re-registro do listener após recarga da extensão.
    console.log('[InjectAll] Todas as tentativas de checkPage falharam — re-injetando content script...');
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['dist/content.js'] });
      await new Promise(r => setTimeout(r, 700)); // aguarda o listener ser registrado
      const resp = await sendToTab(tab.id, { action: 'checkPage' });
      if (resp?.isShospPage) {
        checkOk = true;
        console.log('[InjectAll] ✅ checkPage OK após re-injeção do content script.');
      }
    } catch (eReInject) {
      console.warn('[InjectAll] Falha ao re-injetar content script:', eReInject?.message);
    }
  }

  if (!checkOk) {
    showError('Erro: Abra a página do Shosp primeiro');
    throw new Error('Página não encontrada');
  }

  // 5. Preparar dados combinados
  const combinedData = { audio: null, exames: null, examesNormais: null };

  // Exames normais / blefarite / biomicroscopia personalizada
  if (!audioData?.dilatacaoDetectada && audioData?.injectExamesNormais) {
    combinedData.examesNormais = {
      biomicroscopia: getBiomicroscopiaComLente(BIOMICROSCOPIA_NORMAL),
      fundoscopia: fundoscopiaDetectada ? FUNDOSCOPIA_NORMAL : null
    };
  } else if (audioData?.injectBlefarite) {
    // Blefarite: biomicroscopia já realizada — injeta mesmo com dilatação pendente.
    combinedData.examesNormais = {
      biomicroscopia: getBiomicroscopiaComLente(BIOMICROSCOPIA_BLEFARITE),
      fundoscopia: FUNDOSCOPIA_NORMAL // blefarite sempre injeta fundoscopia normal
    };
  } else if (audioData?.dados?.biomicroscopia || audioData?.dados?.fundoscopia) {
    // Biomicroscopia/fundoscopia personalizada gerada pelo Gemini (ex: pinguecula, pterígio)
    combinedData.examesNormais = {
      biomicroscopia: audioData.dados.biomicroscopia
        ? getBiomicroscopiaComLente(audioData.dados.biomicroscopia)
        : null,
      fundoscopia: audioData.dados.fundoscopia || null
    };
  }

  if (audioData?.injectBlefarite) {
    const campoConduta   = audioData.tipo_consulta === 'retorno' ? condutaRetornoField   : condutaField;
    const campoTratamento = audioData.tipo_consulta === 'retorno' ? medicamentosPrescritosRetornoField : medicamentosPrescritosField;
    if (!campoConduta.value && audioData?.dados?.conduta) {
      campoConduta.value = audioData.dados.conduta;
    }
    // O Gemini é responsável por decidir se a Associação (ATB + corticoide) é indicada.
    // Regra: só inclui quando o médico prescreveu antibiótico/anti-inflamatório explicitamente
    // OU não prescreveu nenhum colírio específico. Não sobrescrever a decisão da IA.
    // Preencher o campo apenas se o Gemini retornou um tratamento E ele está vazio.
    if (!campoTratamento.value && audioData?.dados?.tratamento) {
      campoTratamento.value = audioData.dados.tratamento;
    }
  }

  // Áudio
  if (temAudio) {
    const tipo = audioData.tipo_consulta;
    // Durante pausa de dilatação, diagnóstico/conduta/tratamento ainda não são finais.
    // A consulta não encerrou — bloquear esses campos até a conclusão.
    const dilatacaoPendente = !!audioData?.dilatacaoDetectada;

    if (tipo === 'conclusao') {
      combinedData.audio = {
        tipo: 'conclusao',
        diagnostico: diagnosticoField.value || diagnosticoRetornoField.value || null,
        conduta: condutaField.value || condutaRetornoField.value || null,
        tratamento: medicamentosPrescritosField.value || medicamentosPrescritosRetornoField.value || null
      };
    } else if (tipo === 'retorno') {
      combinedData.audio = {
        tipo: 'retorno',
        retorno: retornoField.value || null,
        uso: medicacoesRetornoField.value || null,
        diagnostico: dilatacaoPendente ? null : (diagnosticoRetornoField.value || null),
        conduta: dilatacaoPendente ? null : (condutaRetornoField.value || null),
        tratamento: dilatacaoPendente ? null : (medicamentosPrescritosRetornoField.value || null)
      };
    } else {
      combinedData.audio = {
        tipo: 'primeira_consulta',
        hda: hdaField.value || null,
        medicacoes_em_uso: medicacoesField.value || null,
        antecedentes_oftalmologicos: antecedentesOftField.value || null,
        alteracoes_sistemicas: doencasSistemicasField.value || null,
        antecedentes_familiares: antecedentesFamField.value || null,
        diagnostico: dilatacaoPendente ? null : (diagnosticoField.value || null),
        conduta: dilatacaoPendente ? null : (condutaField.value || null),
        tratamento: dilatacaoPendente ? null : (medicamentosPrescritosField.value || null)
      };
    }
  }

  // Exames (câmera)
  if (temCamera) {
    const receitaCheckbox = document.getElementById('injectReceitaCheckbox');
    combinedData.exames = {
      tonometria: cameraData.tonometria,
      paquimetria: cameraData.paquimetria,
      refracao: cameraData.refracao,
      injectReceita: receitaCheckbox ? receitaCheckbox.checked : true
    };
  }

  // 6. Enviar para content script (sem retry com executeScript — evita instâncias duplicadas)
  const requestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  combinedData.requestId = requestId;

  let injectResp = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    injectResp = await sendToTab(tab.id, { action: 'injectAll', data: combinedData });
    if (injectResp === 'CONTEXT_INVALIDATED') {
      showError('Recarregue a aba do SHOSP (F5) e tente novamente.');
      throw new Error('Extension context invalidated');
    }
    if (injectResp) break;
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 800));
      // ← sem executeScript aqui — content.js já está no manifest
    }
  }

  if (!injectResp) {
    showError('Erro ao injetar dados — content script não respondeu');
    throw new Error('Erro na injeção');
  }

  // 7. Processar resposta
  // (audioDataInjected/cameraDataInjected já foram setados antes dos awaits)
  injectAll._running = false;

  if (injectResp.success) {
    // v5.1: surfacear warnings clínicos (campos que silenciosamente não
    // puderam ser preenchidos) sem bloquear o sucesso geral.
    if (Array.isArray(injectResp.warnings) && injectResp.warnings.length > 0) {
      console.warn('[InjectAll] Avisos:', injectResp.warnings);
      // Adia a notificação para não sobrescrever o "sucesso" imediato
      setTimeout(() => {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;font-size:12px;margin-top:8px;';
        banner.textContent = 'Atenção: ' + injectResp.warnings.length + ' campo(s) não foram preenchidos. Veja console para detalhes.';
        const container = document.querySelector('.container') || document.body;
        if (container) {
          container.appendChild(banner);
          setTimeout(() => banner.remove(), 8000);
        }
      }, 1700);
    }
    showSuccess();
    setTimeout(() => {
      // Capturar campo de diagnóstico ANTES do clearAll (os valores são preservados,
      // mas garantir referência antes de qualquer side-effect)
      const cidField = combinedData.audio
        ? (diagnosticoField?.value?.trim()
            ? diagnosticoField
            : diagnosticoRetornoField?.value?.trim() ? diagnosticoRetornoField : null)
        : null;
      console.log('[AutoCID] campo:', cidField ? (cidField === diagnosticoField ? 'diagnosticoField' : 'diagnosticoRetornoField') : 'nenhum', '| valor:', cidField?.value?.slice(0, 80));

      clearAll({
        clearAudio: !!combinedData.audio,
        clearCamera: !!combinedData.exames
      });

      // Auto-buscar CID após injeção — elimina necessidade de clique manual
      if (cidField) {
        setTimeout(() => handleSearchCid(cidField), 800);
      }
    }, 1500);
    return true;
  } else {
    showError('Alguns campos não foram preenchidos');
    return false;
  }

  } catch (err) {
    // Reverter flags early em caso de qualquer erro
    if (temAudio) audioDataInjected = false;
    if (temCamera) cameraDataInjected = false;
    injectAll._running = false;
    throw err;
  }
}

// Helper: enviar mensagem para tab com tratamento de erros
// Retorna:
//   'CONTEXT_INVALIDATED' — extensão foi recarregada/atualizada; o sidepanel deve pedir F5
//   null                  — erro transiente (SPA ainda carregando, content script reiniciando)
//   <resp>                — resposta normal do content script
function sendToTab(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message || '';
        const err = errMsg.toLowerCase();
        console.warn(`[sendToTab] tab=${tabId} action=${message.action} erro: ${errMsg}`);
        if (err.includes('context invalidated') || err.includes('extension context')) {
          // Contexto da extensão foi destruído — única situação que exige F5
          resolve('CONTEXT_INVALIDATED');
        } else {
          // "Receiving end does not exist" — content script ainda não carregou (SPA nav ou tab recém-criada)
          resolve(null);
        }
      } else {
        resolve(resp);
      }
    });
  });
}

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
      examesNormaisInjetados = false;
      blefariteInjetada = false;
      fundoscopiaDetectada = false;
      receitaOlhoIrritadoInjetada = false;
      catarataDetectada = false;
      catarataGrau = null;
      lioDetectada = false;
      opacidadeCapsulaDetectada = false;
      dilatacaoDetectada = false;
      lastTriggerTime = 0;
      if (stopCommandTimeout) { clearTimeout(stopCommandTimeout); stopCommandTimeout = null; }
      recognizedText = '';
    }

    // dilatacaoDetectada também é resetada se limpar câmera sem áudio
    // (evita que flag de sessão anterior suprima conduta da próxima gravação)
    if (clearCamera && !clearAudio && !isRecording) {
      dilatacaoDetectada = false;
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

    console.log('[ClearAll] Limpeza concluída', options);

  } catch (error) {
    console.error('[ClearAll] Erro:', error);
  }
}

// ============================================================================
// FEEDBACK VISUAL
// ============================================================================

function showSuccess() {
  successMessage.classList.remove('hidden');
  successMessage.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>Dados injetados com sucesso!</span>';
  successMessage.style.background = '#dcfce7';
  successMessage.style.color = '#166534';
  setTimeout(() => successMessage.classList.add('hidden'), 3000);
  // Nota: chrome.notifications não funciona em sidepanels, apenas feedback visual acima
}

function showError(message) {
  successMessage.classList.remove('hidden');
  successMessage.innerHTML = '<span>' + message + '</span>';
  successMessage.style.background = '#fee2e2';
  successMessage.style.color = '#991b1b';
  setTimeout(() => successMessage.classList.add('hidden'), 3000);
}

// ============================================================================
// INJEÇÃO DIRETA (durante gravação, sem parar)
// ============================================================================

async function _getShospTab() {
  const tabs = await chrome.tabs.query({ url: '*://*.shosp.com.br/*' });
  return tabs.length > 0 ? tabs[0] : null;
}

async function injectExamesNormaisDirect() {
  const tab = await _getShospTab();
  if (!tab) { statusText.textContent = 'Gravando... (Shosp não encontrado)'; return; }
  const response = await sendToTab(tab.id, {
    action: 'injectExamesNormais',
    data: {
      biomicroscopia: getBiomicroscopiaComLente(BIOMICROSCOPIA_NORMAL),
      fundoscopia: fundoscopiaDetectada ? FUNDOSCOPIA_NORMAL : null,
    },
  });
  if (response?.success) {
    statusText.textContent = 'Gravando... (exames injetados)';
    setTimeout(() => { if (isRecording) statusText.textContent = 'Gravando...'; }, 2000);
  } else {
    statusText.textContent = 'Gravando... (exames não injetados)';
  }
}

async function injectBlefariteDirect() {
  const tab = await _getShospTab();
  if (!tab) { statusText.textContent = 'Gravando... (Shosp não encontrado)'; return; }
  const response = await sendToTab(tab.id, {
    action: 'injectExamesNormais',
    data: {
      biomicroscopia: getBiomicroscopiaComLente(BIOMICROSCOPIA_BLEFARITE),
      fundoscopia: FUNDOSCOPIA_NORMAL,
    },
  });
  if (response?.success) {
    statusText.textContent = 'Gravando... (blefarite + fundoscopia injetadas)';
    setTimeout(() => { if (isRecording) statusText.textContent = 'Gravando...'; }, 2000);
  } else {
    statusText.textContent = 'Gravando... (exame não injetado)';
  }
}

async function injectReceitaOlhoIrritadoDirect() {
  const tab = await _getShospTab();
  if (!tab) { statusText.textContent = 'Gravando... (Shosp não encontrado)'; return; }
  const response = await sendToTab(tab.id, {
    action: 'injectReceitaOlhoIrritado',
    data: { receita: RECEITA_OLHO_IRRITADO },
  });
  if (response?.success) {
    statusText.textContent = 'Gravando... (receita injetada e impressa)';
    setTimeout(() => { if (isRecording) statusText.textContent = 'Gravando...'; }, 3000);
  } else {
    statusText.textContent = 'Gravando... (receita não injetada)';
  }
}
