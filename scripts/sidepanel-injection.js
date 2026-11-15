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
  const hasAudio = AppState.audioData !== null;
  const hasCamera = AppState.cameraData !== null;

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
// SELEÇÃO DE ABA SHOSP
// ============================================================================
// Com 2+ abas SHOSP abertas (ex: agenda + prontuário), escolher cega tabs[0]
// frequentemente mira a aba ERRADA → checkPage falha ou a injeção vai para uma
// página sem prontuário, "parando de injetar" silenciosamente.
// Esta função prefere a aba com o PRONTUÁRIO ABERTO (checkPage.prontuarioOpen),
// caindo para a primeira aba responsiva apenas como último recurso.
//
//   retries  — ciclos de espera (1s cada) aguardando o background concluir a
//              re-injeção do content script após navegação SPA.
//   reinject — re-injeta src/content.js nas abas que não respondem (recupera
//              contexto órfão após recarga da extensão) e re-verifica.
//
// Retorna a aba escolhida ou null. Lança Error('...context invalidated') quando
// a extensão foi recarregada (exige F5 na aba do SHOSP).
async function selectShospTab(tabs, { retries = 0, reinject = false } = {}) {
  if (!tabs || !tabs.length) return null;

  // Sonda todas as candidatas: retorna a aba com prontuário aberto e a 1ª responsiva.
  // CRÍTICO: se houver 2+ prontuários abertos (paciente A e B), NÃO escolher por
  // ordem de índice — isso pode lançar os dados na ficha errada (contaminação
  // cruzada, a mesma falha que os guards URL_CHANGED temem). Preferir a aba EM
  // FOCO (.active) e, como desempate, a última acessada (.lastAccessed).
  const probeAll = async () => {
    let responsiveTab = null;
    const prontuarioTabs = [];
    for (const t of tabs) {
      const resp = await sendToTab(t.id, { action: 'checkPage' }, { silent: true });
      if (resp === 'CONTEXT_INVALIDATED') throw new Error('Extension context invalidated');
      if (resp?.isShospPage) {
        if (!responsiveTab) responsiveTab = t;
        if (resp.prontuarioOpen) prontuarioTabs.push(t);
      }
    }
    let prontuarioTab = null;
    if (prontuarioTabs.length === 1) {
      prontuarioTab = prontuarioTabs[0];
    } else if (prontuarioTabs.length > 1) {
      prontuarioTab = prontuarioTabs.find(t => t.active)
        || prontuarioTabs.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      console.warn(`[selectShospTab] ${prontuarioTabs.length} prontuários abertos — escolhida aba ${prontuarioTab.id} (em foco/última acessada). Confirme o paciente!`);
    }
    return { prontuarioTab, responsiveTab };
  };

  let lastResponsive = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { prontuarioTab, responsiveTab } = await probeAll();
    if (prontuarioTab) return prontuarioTab;
    lastResponsive = responsiveTab || lastResponsive;
    if (attempt < retries) await new Promise(r => setTimeout(r, 1000));
  }

  // Nenhuma aba com prontuário aberto respondeu. Re-injetar content.js em todas
  // as candidatas (recupera contexto órfão pós-recarga) e re-verificar uma vez.
  if (reinject) {
    dbg('[selectShospTab] Nenhuma aba com prontuário aberto — re-injetando content script nas candidatas...');
    for (const t of tabs) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['src/content/core.js', 'src/content/field-detector.js', 'src/content/injector.js', 'src/content.js'] });
      } catch (e) {
        console.warn('[selectShospTab] Falha ao re-injetar na aba', t.id, e?.message);
      }
    }
    await new Promise(r => setTimeout(r, 700));
    const { prontuarioTab, responsiveTab } = await probeAll();
    if (prontuarioTab) return prontuarioTab;
    lastResponsive = responsiveTab || lastResponsive;
  }

  return lastResponsive;
}

async function injectAll(force = false) {
  // Guard contra chamadas paralelas (ex: stop hook + botão manual simultâneos)
  if (injectAll._running) {
    console.warn('[InjectAll] Já em execução — ignorando chamada paralela.');
    throw new Error('injectAll já em execução');
  }
  _setRunningState(true);

  let skipAudioDueToError = false;

  // Guard de segurança: isolar injeção quando transcrição foi sinalizada como ruidosa.
  // Se forçado manualmente (force === true), ignora a trava de segurança e tenta injetar o que houver.
  if (!force && AppState.audioData && (AppState.audioData.tipo_consulta === 'invalida' || AppState.audioData.noiseDetected === true || AppState.audioData.revisao_manual === true)) {
    if (!AppState.cameraData || AppState.cameraDataInjected) {
      _setRunningState(false);
      showError('Revisão manual obrigatória: transcrição ruidosa ou clinicamente insegura.');
      throw new Error('Revisão manual obrigatória');
    } else {
      console.warn('[InjectAll] Áudio ignorado temporariamente devido a necessidade de revisão manual, prosseguindo com injeção da câmera.');
      showError('Áudio ruidoso: Injetando apenas os exames...');
      skipAudioDueToError = true;
    }
  }

  // (Guard de dilatação removido — agora injetamos todos os dados coletados imediatamente)

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

    dbg(`[InjectAll] Abas SHOSP encontradas: ${tabs.length}`, tabs.map(t => t.url?.slice(0, 60)));
  } catch (e) {
    _setRunningState(false);
    showError('Erro ao buscar aba do SHOSP');
    throw e;
  }

  if (!tabs.length) {
    _setRunningState(false);
    showError('Erro: Abra a página do SHOSP primeiro');
    throw new Error('Nenhuma aba do SHOSP');
  }

  // 2. Verificar se há dados para injetar
  const temAudio = AppState.audioData && !AppState.audioDataInjected && !skipAudioDueToError;
  const temCamera = AppState.cameraData && !AppState.cameraDataInjected;

  dbg('[InjectAll] check:', { audioData: !!AppState.audioData, audioDataInjected: AppState.audioDataInjected, skipAudioDueToError, cameraData: !!AppState.cameraData, cameraDataInjected: AppState.cameraDataInjected, temAudio, temCamera });

  if (!temAudio && !temCamera) {
    _setRunningState(false);
    showError('Dados já injetados! Limpe para injetar novamente.');
    throw new Error('Dados já injetados');
  }

  // Marcar como injetado ANTES dos awaits para bloquear chamadas concorrentes.
  // Será revertido em caso de erro.
  if (temAudio) AppState.audioDataInjected = true;
  if (temCamera) AppState.cameraDataInjected = true;

  try {
  // 3-4. Selecionar a aba SHOSP correta e garantir que o content script responde.
  // selectShospTab prefere a aba com o PRONTUÁRIO ABERTO (não escolhe cega tabs[0]),
  // espera o background concluir a re-injeção pós-nav SPA (retries) e re-injeta o
  // content script nas candidatas órfãs como último recurso (reinject).
  let tab;
  try {
    tab = await selectShospTab(tabs, { retries: 4, reinject: true });
  } catch (eSelect) {
    if (/context invalidated/i.test(eSelect?.message || '')) {
      showError('Recarregue a aba do SHOSP (F5) e tente novamente.');
    }
    throw eSelect;
  }

  if (!tab) {
    showError('Abra o prontuário do paciente no SHOSP e tente novamente.');
    throw new Error('Nenhuma aba com prontuário aberto');
  }
  dbg('[InjectAll] Aba de injeção selecionada:', tab.id, tab.url?.slice(0, 60));

  // Carregar dados persistidos da fase 1 de dilatação (se existirem e não expiraram em 6h)
  let _phase1Data = null;
  try {
    _phase1Data = await new Promise(resolve =>
      chrome.storage.local.get('_shospDilatacaoPhase1', d => resolve(d._shospDilatacaoPhase1 || null))
    );
    if (_phase1Data && Date.now() - (_phase1Data.ts || 0) > 6 * 60 * 60 * 1000) {
      _phase1Data = null;
      chrome.storage.local.remove('_shospDilatacaoPhase1');
    }
  } catch (_e) { _phase1Data = null; }

  // 5. Preparar dados combinados
  const combinedData = { audio: null, exames: null, examesNormais: null };

  // Exames normais / blefarite / biomicroscopia personalizada
  // Guard !blefariteInjetada && !examesNormaisInjetados evita dupla injeção se exames já foram disparados por hooks de voz.
  // Guard adicional: injectExamesNormais não pode disparar quando há tratamento ativo (consulta patológica).
  const _temTratamentoAtivo = !!(AppState.audioData?.dados?.tratamento || AppState.audioData?.dados?.conduta?.match(/encaminhamento/i));
  const transcricaoNorm = normalizeText(AppState.recognizedText || '');
  const mencionouFundoNaFala = transcricaoNorm.includes('fundo') || transcricaoNorm.includes('fundoscop');

  // Reconciliação de catarata a partir do diagnóstico do LLM.
  // O cristalino dinâmico (getBiomicroscopiaComLente) depende de catarataDetectada,
  // ligada apenas pelos gatilhos de voz. Quando a fala do médico é embaralhada pelo
  // reconhecimento e o gatilho CATARATA_COMMANDS não dispara, o Gemini ainda diagnostica
  // catarata (CID H25.x) e a biomicroscopia sairia com "cristalino transparente",
  // contradizendo o diagnóstico. Aqui derivamos a flag do próprio diagnóstico.
  // Respeita a prioridade da lente (opacidade cápsula > LIO > catarata): olho pseudofácico
  // (LIO/opacidade já detectadas) NÃO recebe catarata — a menção seria histórica.
  if (!AppState.catarataDetectada && !AppState.lioDetectada && !AppState.opacidadeCapsulaDetectada) {
    const _cat = parseCatarataFromDiagnostico(AppState.audioData?.dados?.diagnostico);
    if (_cat.detected) {
      StateManager.setHookFlag('catarataDetectada', true);
      if (!AppState.catarataGrau && _cat.grau) StateManager.setHookFlag('catarataGrau', _cat.grau);
      dbg('[Catarata] Flag derivada do diagnóstico (gatilho de voz não disparou):', AppState.catarataGrau || '(grau não especificado)');
    }
  }

  if (!AppState.blefariteInjetada && !AppState.examesNormaisInjetados) {
    if (!AppState.audioData?.dilatacaoDetectada && AppState.audioData?.injectExamesNormais && !_temTratamentoAtivo) {
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(BIOMICROSCOPIA_NORMAL),
        fundoscopia: (AppState.fundoscopiaDetectada || mencionouFundoNaFala) ? FUNDOSCOPIA_NORMAL : null
      };
    } else if (!AppState.audioData?.dilatacaoDetectada && AppState.audioData?.injectBlefarite) {
      // Blefarite: se Gemini gerou biomicroscopia personalizada (ex: pterígio + blefarite),
      // usa ela; caso contrário usa o template padrão de blefarite.
      // Com dilatação pendente NÃO injeta — descrição de exames pertence à fase 2.
      const _bioBase = AppState.audioData?.dados?.biomicroscopia || BIOMICROSCOPIA_BLEFARITE;
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(_bioBase),
        fundoscopia: FUNDOSCOPIA_NORMAL // blefarite sempre injeta fundoscopia normal
      };
    } else if (!AppState.audioData?.dilatacaoDetectada &&
               (AppState.audioData?.dados?.biomicroscopia || AppState.audioData?.dados?.fundoscopia)) {
      // Biomicroscopia/fundoscopia personalizada gerada pelo Gemini (ex: pinguecula, pterígio, nevo)
      // Quando só fundoscopia foi preenchida (achado posterior com segmento anterior normal),
      // injeta o template normal de biomicroscopia para não deixar o campo em branco.
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(
          AppState.audioData.dados.biomicroscopia || BIOMICROSCOPIA_NORMAL
        ),
        fundoscopia: AppState.audioData.dados.fundoscopia || null
      };
    } else if (AppState.audioData && AppState.consultaEncerradaDetectada && !AppState.audioData.dilatacaoDetectada && !_temTratamentoAtivo) {
      // Fallback de despedida: a consulta foi encerrada pelo STOP (despedida) e
      // nenhum gatilho de exame disparou (garantido pelo guard externo).
      // Guard: _temTratamentoAtivo impede injeção de exames "normais" em consultas
      // com patologia ativa (conduta com encaminhamento ou tratamento prescrito).
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(BIOMICROSCOPIA_NORMAL),
        fundoscopia: mencionouFundoNaFala ? FUNDOSCOPIA_NORMAL : null,
      };
    }
  }

  if (AppState.audioData?.injectBlefarite) {
    const campoConduta   = AppState.audioData.tipo_consulta === 'retorno' ? condutaRetornoField   : condutaField;
    const campoTratamento = AppState.audioData.tipo_consulta === 'retorno' ? medicamentosPrescritosRetornoField : medicamentosPrescritosField;
    if (!campoConduta.value && AppState.audioData?.dados?.conduta) {
      campoConduta.value = AppState.audioData.dados.conduta;
    }
    // O Gemini é responsável por decidir se a Associação (ATB + corticoide) é indicada.
    // Regra: só inclui quando o médico prescreveu antibiótico/anti-inflamatório explicitamente
    // OU não prescreveu nenhum colírio específico. Não sobrescrever a decisão da IA.
    // Preencher o campo apenas se o Gemini retornou um tratamento E ele está vazio.
    if (!campoTratamento.value && AppState.audioData?.dados?.tratamento) {
      campoTratamento.value = AppState.audioData.dados.tratamento;
    }
  }

  // Áudio
  if (temAudio) {
    const tipo = AppState.audioData.tipo_consulta;

    const _dilatacao = !!AppState.audioData.dilatacaoDetectada;
    // Sem tratamento ditado, o campo TRATAMENTO é injetado com o registro
    // explícito "Sem prescrição de medicação" (mesmo texto que o painel exibe
    // via displayAudioResults) — o prontuário nunca fica com tratamento em
    // branco. Na dilatação (fase 1) permanece null: pertence ao pós-dilatação.
    const _trat = (v) => _dilatacao ? null : (v || 'Sem prescrição de medicação');
    if (tipo === 'conclusao') {
      combinedData.audio = {
        tipo: 'conclusao',
        diagnostico: diagnosticoField.value || diagnosticoRetornoField.value || null,
        conduta: _dilatacao ? null : (condutaField.value || condutaRetornoField.value || null),
        tratamento: _trat(medicamentosPrescritosField.value || medicamentosPrescritosRetornoField.value)
      };
    } else if (tipo === 'retorno') {
      combinedData.audio = {
        tipo: 'retorno',
        retorno: retornoField.value || null,
        uso: medicacoesRetornoField.value || null,
        diagnostico: diagnosticoRetornoField.value || null,
        conduta: _dilatacao ? null : (condutaRetornoField.value || null),
        tratamento: _trat(medicamentosPrescritosRetornoField.value)
      };
    } else {
      // Mesclar com dados da fase 1 de dilatação (se o médico atendeu outro paciente
      // durante a dilatação, o SHOSP pode ter descartado os campos não salvos).
      // Os campos do sidepanel atual têm prioridade; os da fase 1 preenchem o que está vazio.
      const _ph1 = _phase1Data?.audio || null;
      if (_ph1) dbg('[InjectAll] Mesclando dados da fase 1 de dilatação na injeção da fase 2.');
      combinedData.audio = {
        tipo: 'primeira_consulta',
        hda: hdaField.value || _ph1?.hda || null,
        medicacoes_em_uso: medicacoesField.value || _ph1?.medicacoes_em_uso || null,
        antecedentes_oftalmologicos: antecedentesOftField.value || _ph1?.antecedentes_oftalmologicos || null,
        alteracoes_sistemicas: doencasSistemicasField.value || _ph1?.alteracoes_sistemicas || null,
        antecedentes_familiares: antecedentesFamField.value || _ph1?.antecedentes_familiares || null,
        diagnostico: diagnosticoField.value || _ph1?.diagnostico || null,
        conduta: _dilatacao ? null : (condutaField.value || null),
        tratamento: _trat(medicamentosPrescritosField.value)
      };
    }
  }

  // Exames (câmera)
  if (temCamera) {
    const receitaCheckbox = document.getElementById('injectReceitaCheckbox');
    combinedData.exames = {
      tonometria: {
        od: AppState.cameraData.tonometria ? parseClinicalInt(AppState.cameraData.tonometria.od) : null,
        oe: AppState.cameraData.tonometria ? parseClinicalInt(AppState.cameraData.tonometria.oe) : null
      },
      paquimetria: {
        od: AppState.cameraData.paquimetria ? parseClinicalInt(AppState.cameraData.paquimetria.od) : null,
        oe: AppState.cameraData.paquimetria ? parseClinicalInt(AppState.cameraData.paquimetria.oe) : null
      },
      refracao: AppState.cameraData.refracao,
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
  _setRunningState(false);

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
    // Persistir dados de áudio quando a dilatação foi detectada, para que a fase 2
    // possa re-injetá-los caso o SHOSP descarte campos não salvos durante o período.
    // Em injeções normais (sem dilatação), limpar o dado persistido se existir.
    if (combinedData.audio && AppState.audioData?.dilatacaoDetectada) {
      // Preservar a transcrição da fase 1 já persistida pelo sidepanel-audio
      // (acumula fases anteriores); fallback para o texto da sessão atual.
      chrome.storage.local.set({ _shospDilatacaoPhase1: {
        audio: combinedData.audio,
        transcript: _phase1Data?.transcript || AppState.recognizedText || '',
        ts: Date.now(),
        motivo: 'dilatacao',
      } });
      dbg('[InjectAll] Dados da fase 1 (dilatação) salvos para re-injeção pós-dilatação.');
    } else {
      chrome.storage.local.remove('_shospDilatacaoPhase1');
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
      dbg('[AutoCID] campo:', cidField ? (cidField === diagnosticoField ? 'diagnosticoField' : 'diagnosticoRetornoField') : 'nenhum', '| valor:', cidField?.value?.slice(0, 80));

      // Capturar CIDs de refração do OCR antes do clearAll (cameraData será apagado)
      const ocrCids = (combinedData.exames && AppState.cameraData?.cid_refracao?.length)
        ? [...AppState.cameraData.cid_refracao]
        : [];

      clearAll({
        clearAudio: !!combinedData.audio,
        clearCamera: !!combinedData.exames
      });

      // Mesclar CIDs do OCR ao campo de diagnóstico (deduplicados contra CIDs de áudio)
      let novosCids = [];
      const cidTarget = cidField || (ocrCids.length ? diagnosticoField : null);
      if (ocrCids.length && cidTarget) {
        // Normaliza removendo pontos para comparar "H521" e "H52.1" como iguais
        const normCid = s => s.replace(/\./g, '').toUpperCase();
        const existingCodes = new Set(
          (cidTarget.value || '').split(/\n|,|;/)
            .map(t => { const m = t.match(CID_CODE_PATTERN); return normCid(m ? m[1] : t.trim()); })
            .filter(Boolean)
        );
        novosCids = ocrCids.filter(cid => {
          const m = cid.match(CID_CODE_PATTERN);
          return !existingCodes.has(normCid(m ? m[1] : cid.trim()));
        });
        if (novosCids.length) {
          cidTarget.value = [cidTarget.value, ...novosCids].filter(Boolean).join('\n');
          dbg('[AutoCID-OCR] CIDs de refração adicionados:', novosCids);
        }
      }

      // Retificação: remove H52.9 (refração NE) quando já há CID refrativo específico
      // no diagnóstico (vindo do OCR ou da própria entrevista).
      if (cidTarget && cidTarget.value) {
        const reconciled = _dropUnspecifiedRefraction(cidTarget.value);
        if (reconciled !== cidTarget.value) {
          cidTarget.value = reconciled;
          dbg('[AutoCID] H52.9 removido — CID refrativo específico presente no diagnóstico');
        }
      }

      // Auto-buscar CID após injeção.
      // Dispara apenas se: havia CIDs de áudio (cidField) OU novos CIDs de OCR foram adicionados.
      // Evita segunda chamada a handleSearchCid quando injectAll de câmera detecta que
      // diagnosticoField ainda tem os CIDs de áudio (já processados pela primeira chamada).
      const activeField = (cidField?.value?.trim() ? cidField : null)
        || (novosCids.length && cidTarget?.value?.trim() ? cidTarget : null);
      if (activeField) {
        setTimeout(() => handleSearchCid(activeField), 800);
      }
    }, 1500);
    return true;
  } else {
    console.warn('[InjectAll] Injeção não sucedida (success=false). Revertendo flags para permitir nova tentativa.');
    if (temAudio) AppState.audioDataInjected = false;
    if (temCamera) AppState.cameraDataInjected = false;
    showError('Alguns campos não foram preenchidos');
    return false;
  }

  } catch (err) {
    // Reverter flags early em caso de qualquer erro
    if (temAudio) AppState.audioDataInjected = false;
    if (temCamera) AppState.cameraDataInjected = false;
    _setRunningState(false);
    throw err;
  }
}

// Helper: enviar mensagem para tab com tratamento de erros
// Retorna:
//   'CONTEXT_INVALIDATED' — extensão foi recarregada/atualizada; o sidepanel deve pedir F5
//   null                  — erro transiente (SPA ainda carregando, content script reiniciando)
//   <resp>                — resposta normal do content script
// silent=true suprime o warn para erros transientes esperados (ex: checkPage retries)
function sendToTab(tabId, message, { silent = false } = {}) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message || '';
        const err = errMsg.toLowerCase();
        if (err.includes('context invalidated') || err.includes('extension context')) {
          // Contexto da extensão foi destruído — única situação que exige F5
          if (!silent) console.warn(`[sendToTab] tab=${tabId} action=${message.action} erro: ${errMsg}`);
          resolve('CONTEXT_INVALIDATED');
        } else {
          // "Receiving end does not exist" — content script ainda não carregou (SPA nav ou tab recém-criada)
          if (!silent) console.warn(`[sendToTab] tab=${tabId} action=${message.action} erro: ${errMsg}`);
          resolve(null);
        }
      } else {
        resolve(resp);
      }
    });
  });
}
