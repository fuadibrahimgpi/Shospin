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

// Remove CIDs duplicados pelo código (ex: H010 = H01.0) antes de iniciar a cadeia.
// Mapeia termos clínicos em texto puro para o código CID normalizado.
// Impede duplicatas quando a IA emite a mesma patologia em dois formatos:
// ex: "H524 - Presbiopia" e "Presbiopia" → ambos resolvem para "H524".
// Extrai o código CID do formato "H01.0 - Descrição" (grupo 1 = código)
const CID_CODE_PATTERN = /^([A-Z]\d+(?:\.\d+)?)\s*[-–]/;

// Retificação de refração: H52.9 (transtorno de refração NÃO especificado) é
// redundante quando já existe um CID refrativo específico no mesmo diagnóstico —
// H52.0 (hipermetropia), H52.1 (miopia), H52.2 (astigmatismo), H52.3 (anisometropia)
// ou H52.4 (presbiopia). Ocorre quando a entrevista devolve H52.9 e o OCR do ticket
// (ou a própria IA) adiciona os específicos: mantém só os específicos, remove o vago.
function _dropUnspecifiedRefraction(fieldValue) {
  if (!fieldValue) return fieldValue;
  const normCid = s => s.replace(/\./g, '').toUpperCase();
  const lines = fieldValue.split('\n');
  const codes = lines.map(l => {
    const m = l.match(CID_CODE_PATTERN);
    return m ? normCid(m[1]) : null;
  });
  const hasSpecific = codes.some(c => c && /^H52[0-4]$/.test(c));
  if (!hasSpecific) return fieldValue;
  return lines.filter((_, i) => codes[i] !== 'H529').join('\n');
}

const _CLINICAL_TERM_TO_CID = [
  [/presbiop/i,      'H524'],
  [/blefarite/i,     'H010'],
  [/pterigio/i,      'H111'],
  [/catarata/i,      'H260'],  // fallback genérico; preferência para código específico se vier com dash
  [/glaucoma/i,      'H409'],
  // H52.x — erros refrativos: gerados pelo OCR (_inferCidRefracao) e frequentemente
  // descritos por texto puro no áudio. Sem este mapeamento, "Miopia" e "H52.1 - Miopia"
  // recebem chaves diferentes e ambos são enviados ao SHOSP → CID duplicado.
  [/miop/i,          'H521'],
  [/astigmat/i,      'H522'],
  [/hipermetrop/i,   'H520'],
  [/anisometrop/i,   'H523'],
];

function _cidKeyFromText(text) {
  const norm = normalizeText(text);
  for (const [re, code] of _CLINICAL_TERM_TO_CID) {
    if (re.test(norm)) return code;
  }
  return null;
}

function _deduplicateCidField(field) {
  if (!field || !field.value.trim()) return;
  const terms = field.value.split(/\n|,|;/).map(t => t.trim()).filter(Boolean);
  if (terms.length <= 1) return;
  const seen = new Set();
  const unique = terms.filter(t => {
    const m = t.match(CID_CODE_PATTERN);
    const key = m
      ? m[1].replace(/\./g, '').toUpperCase()
      : (_cidKeyFromText(t) || t.toUpperCase());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length < terms.length) {
    console.log(`[CID] Deduplicados ${terms.length - unique.length} termo(s) duplicado(s):`, terms.filter(t => !unique.includes(t)));
    field.value = unique.join('\n');
  }
}

async function handleSearchCid(field) {
  // Guard: previne chamadas paralelas (câmera + áudio, botão duplo, etc.)
  // Reagenda em vez de descartar silenciosamente — evita perda de CIDs do áudio
  // quando a cadeia do OCR ainda está em andamento.
  if (handleSearchCid._running) {
    console.warn('[CID] Já em execução — reagendando para 2s');
    setTimeout(() => handleSearchCid(field), 2000);
    return;
  }
  handleSearchCid._running = true;

  const text = field.value.trim();
  if (!text) {
    handleSearchCid._running = false;
    showError('Nenhum diagnóstico para buscar.');
    return;
  }

  // Deduplicar por código CID antes de iniciar a cadeia
  _deduplicateCidField(field);

  // Separar por newline, vírgula ou ponto e vírgula (IA usa \n como separador)
  const terms = field.value.split(/\n|,|;/).map(t => t.trim()).filter(t => t.length > 0);
  if (terms.length === 0) { handleSearchCid._running = false; return; }

  const rawTerm = terms[0];
  // Log diagnóstico: captura o estado do campo a cada passo da cadeia
  console.log(`[CID] Processando "${rawTerm}" | campo completo: ${JSON.stringify(field.value)}`);

  // Extrair só o código CID quando o formato for "H010 - Descrição"
  const codeMatch = rawTerm.match(CID_CODE_PATTERN);
  let termToSearch = codeMatch ? codeMatch[1] : rawTerm;

  // Normalizar códigos de 4 caracteres sem ponto (ex: H400 -> H40.0) para compatibilidade com o autocomplete do SHOSP
  if (/^[A-Z]\d{3}$/.test(termToSearch)) {
    termToSearch = termToSearch.slice(0, 3) + '.' + termToSearch.slice(3);
  }

  // Feedback visual imediato
  successMessage.classList.remove('hidden');
  successMessage.innerHTML = `<span>🔍 Buscando CID: ${rawTerm}...</span>`;
  successMessage.style.background = '#eff6ff';
  successMessage.style.color = '#1e40af';

  try {
    let tabs = await chrome.tabs.query({ url: '*://*.shosp.com.br/*' });
    if (!tabs.length) {
      handleSearchCid._running = false;
      showError('Shosp não encontrado');
      return;
    }

    // content.js já está no manifest — não reinjetar (causaria instâncias duplicadas).
    // Seleciona a aba com o prontuário aberto (não tabs[0] cega) para não lançar o
    // CID na ficha errada quando há 2+ abas SHOSP.
    const cidTab = await selectShospTab(tabs, { retries: 1, reinject: false }) || tabs[0];

    console.log(`[SearchCid] termo="${termToSearch}" → tab=${cidTab.id}`);
    const resp = await sendToTab(cidTab.id, { action: 'searchCid', term: termToSearch });
    console.log(`[SearchCid] resp=`, resp);

    // Fix C6: contexto inválido → abortar cadeia imediatamente (evita loop infinito)
    if (resp === 'CONTEXT_INVALIDATED') {
      handleSearchCid._running = false;
      showError('Extensão recarregada — reabra o painel e tente novamente.');
      return;
    }

    // Médico navegou para outro paciente durante a cadeia — abortar completamente
    // para não injetar CIDs do paciente anterior na ficha do novo.
    if (resp?.error === 'URL_CHANGED') {
      console.warn('[CID] Paciente mudou durante injeção — cadeia encerrada');
      field.value = '';
      handleSearchCid._running = false;
      showError('Paciente mudou — injeção cancelada para evitar contaminação.');
      return;
    }

    if (resp && resp.success) {
      // Atualiza o campo com os restantes (remove o termo já buscado)
      field.value = terms.slice(1).join('\n');
      // Feedback de sucesso
      successMessage.classList.remove('hidden');
      successMessage.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>C.I.D. lançado: ${termToSearch}</span>`;
      successMessage.style.background = '#dcfce7';
      successMessage.style.color = '#166534';
      setTimeout(() => successMessage.classList.add('hidden'), 3000);
      // Auto-encadear próximo termo após delay.
      // O lock é mantido logicamente: liberamos e re-adquirimos dentro do callback
      // do setTimeout (JS é single-threaded — nenhum outro código corre entre as duas linhas).
      const stillHasCid = field.value.trim();
      if (stillHasCid) {
        setTimeout(() => { handleSearchCid._running = false; handleSearchCid(field); }, 1800);
        return; // Não liberar o lock antes do próximo passo
      } else {
        handleSearchCid._running = false;
        // Verificar se algum campo ainda tem termos pendentes
        const anyPending = diagnosticoField?.value?.trim() || diagnosticoRetornoField?.value?.trim();
        if (!anyPending) {
          audioFieldsContainer.classList.add('hidden');
        }
      }
    } else {
      // S2: pular termo com falha e continuar a cadeia (não interromper por um CID inválido)
      const errMsg = resp?.error || 'Aba C.I.D. não encontrada na página';
      console.warn(`[CID] Falha ao buscar "${rawTerm}": ${errMsg}`);
      showError(`CID não encontrado: ${rawTerm}`);
      field.value = terms.slice(1).join('\n');
      const stillHasCid = field.value.trim();
      if (stillHasCid) {
        setTimeout(() => { handleSearchCid._running = false; handleSearchCid(field); }, 1800);
        return;
      } else {
        handleSearchCid._running = false;
      }
    }
  } catch (err) {
    handleSearchCid._running = false;
    showError('Erro ao buscar C.I.D.');
    console.error(err);
  }
}
handleSearchCid._running = false;

function _setRunningState(running) {
  injectAll._running = running;
  const elements = [recordBtn, injectAllBtn, clearBtn];
  elements.forEach(el => {
    if (el) {
      if (running) {
        el.setAttribute('disabled', '');
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
      } else {
        el.removeAttribute('disabled');
        el.style.opacity = '';
        el.style.pointerEvents = '';
      }
    }
  });
}

function parseClinicalInt(val) {
  if (val == null) return null;
  let str = String(val).trim();
  if (!str || str === 'ERR' || str === 'ILEGÍVEL') return null;
  const match = str.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const num = Math.round(parseFloat(match[0]));
  return isNaN(num) ? null : num;
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
    console.log('[selectShospTab] Nenhuma aba com prontuário aberto — re-injetando content script nas candidatas...');
    for (const t of tabs) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['src/content.js'] });
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
  if (!force && audioData && (audioData.tipo_consulta === 'invalida' || audioData.noiseDetected === true || audioData.revisao_manual === true)) {
    if (!cameraData || cameraDataInjected) {
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

    console.log(`[InjectAll] Abas SHOSP encontradas: ${tabs.length}`, tabs.map(t => t.url?.slice(0, 60)));
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
  const temAudio = audioData && !audioDataInjected && !skipAudioDueToError;
  const temCamera = cameraData && !cameraDataInjected;

  console.log('[InjectAll] check:', { audioData: !!audioData, audioDataInjected, skipAudioDueToError, cameraData: !!cameraData, cameraDataInjected, temAudio, temCamera });

  if (!temAudio && !temCamera) {
    _setRunningState(false);
    showError('Dados já injetados! Limpe para injetar novamente.');
    throw new Error('Dados já injetados');
  }

  // Marcar como injetado ANTES dos awaits para bloquear chamadas concorrentes.
  // Será revertido em caso de erro.
  if (temAudio) audioDataInjected = true;
  if (temCamera) cameraDataInjected = true;

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
  console.log('[InjectAll] Aba de injeção selecionada:', tab.id, tab.url?.slice(0, 60));

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
  const _temTratamentoAtivo = !!(audioData?.dados?.tratamento || audioData?.dados?.conduta?.match(/encaminhamento/i));
  const transcricaoNorm = normalizeText(recognizedText || '');
  const mencionouFundoNaFala = transcricaoNorm.includes('fundo') || transcricaoNorm.includes('fundoscop');

  // Reconciliação de catarata a partir do diagnóstico do LLM.
  // O cristalino dinâmico (getBiomicroscopiaComLente) depende de catarataDetectada,
  // ligada apenas pelos gatilhos de voz. Quando a fala do médico é embaralhada pelo
  // reconhecimento e o gatilho CATARATA_COMMANDS não dispara, o Gemini ainda diagnostica
  // catarata (CID H25.x) e a biomicroscopia sairia com "cristalino transparente",
  // contradizendo o diagnóstico. Aqui derivamos a flag do próprio diagnóstico.
  // Respeita a prioridade da lente (opacidade cápsula > LIO > catarata): olho pseudofácico
  // (LIO/opacidade já detectadas) NÃO recebe catarata — a menção seria histórica.
  if (!catarataDetectada && !lioDetectada && !opacidadeCapsulaDetectada) {
    const _cat = parseCatarataFromDiagnostico(audioData?.dados?.diagnostico);
    if (_cat.detected) {
      catarataDetectada = true;
      if (!catarataGrau && _cat.grau) catarataGrau = _cat.grau;
      console.log('[Catarata] Flag derivada do diagnóstico (gatilho de voz não disparou):', catarataGrau || '(grau não especificado)');
    }
  }

  if (!blefariteInjetada && !examesNormaisInjetados) {
    if (!audioData?.dilatacaoDetectada && audioData?.injectExamesNormais && !_temTratamentoAtivo) {
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(BIOMICROSCOPIA_NORMAL),
        fundoscopia: (fundoscopiaDetectada || mencionouFundoNaFala) ? FUNDOSCOPIA_NORMAL : null
      };
    } else if (!audioData?.dilatacaoDetectada && audioData?.injectBlefarite) {
      // Blefarite: se Gemini gerou biomicroscopia personalizada (ex: pterígio + blefarite),
      // usa ela; caso contrário usa o template padrão de blefarite.
      // Com dilatação pendente NÃO injeta — descrição de exames pertence à fase 2.
      const _bioBase = audioData?.dados?.biomicroscopia || BIOMICROSCOPIA_BLEFARITE;
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(_bioBase),
        fundoscopia: FUNDOSCOPIA_NORMAL // blefarite sempre injeta fundoscopia normal
      };
    } else if (!audioData?.dilatacaoDetectada &&
               (audioData?.dados?.biomicroscopia || audioData?.dados?.fundoscopia)) {
      // Biomicroscopia/fundoscopia personalizada gerada pelo Gemini (ex: pinguecula, pterígio, nevo)
      // Quando só fundoscopia foi preenchida (achado posterior com segmento anterior normal),
      // injeta o template normal de biomicroscopia para não deixar o campo em branco.
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(
          audioData.dados.biomicroscopia || BIOMICROSCOPIA_NORMAL
        ),
        fundoscopia: audioData.dados.fundoscopia || null
      };
    } else if (audioData && consultaEncerradaDetectada && !audioData.dilatacaoDetectada && !_temTratamentoAtivo) {
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

    const _dilatacao = !!audioData.dilatacaoDetectada;
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
      if (_ph1) console.log('[InjectAll] Mesclando dados da fase 1 de dilatação na injeção da fase 2.');
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
        od: cameraData.tonometria ? parseClinicalInt(cameraData.tonometria.od) : null,
        oe: cameraData.tonometria ? parseClinicalInt(cameraData.tonometria.oe) : null
      },
      paquimetria: {
        od: cameraData.paquimetria ? parseClinicalInt(cameraData.paquimetria.od) : null,
        oe: cameraData.paquimetria ? parseClinicalInt(cameraData.paquimetria.oe) : null
      },
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
    if (combinedData.audio && audioData?.dilatacaoDetectada) {
      // Preservar a transcrição da fase 1 já persistida pelo sidepanel-audio
      // (acumula fases anteriores); fallback para o texto da sessão atual.
      chrome.storage.local.set({ _shospDilatacaoPhase1: {
        audio: combinedData.audio,
        transcript: _phase1Data?.transcript || recognizedText || '',
        ts: Date.now(),
        motivo: 'dilatacao',
      } });
      console.log('[InjectAll] Dados da fase 1 (dilatação) salvos para re-injeção pós-dilatação.');
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
      console.log('[AutoCID] campo:', cidField ? (cidField === diagnosticoField ? 'diagnosticoField' : 'diagnosticoRetornoField') : 'nenhum', '| valor:', cidField?.value?.slice(0, 80));

      // Capturar CIDs de refração do OCR antes do clearAll (cameraData será apagado)
      const ocrCids = (combinedData.exames && cameraData?.cid_refracao?.length)
        ? [...cameraData.cid_refracao]
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
          console.log('[AutoCID-OCR] CIDs de refração adicionados:', novosCids);
        }
      }

      // Retificação: remove H52.9 (refração NE) quando já há CID refrativo específico
      // no diagnóstico (vindo do OCR ou da própria entrevista).
      if (cidTarget && cidTarget.value) {
        const reconciled = _dropUnspecifiedRefraction(cidTarget.value);
        if (reconciled !== cidTarget.value) {
          cidTarget.value = reconciled;
          console.log('[AutoCID] H52.9 removido — CID refrativo específico presente no diagnóstico');
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
    if (temAudio) audioDataInjected = false;
    if (temCamera) cameraDataInjected = false;
    showError('Alguns campos não foram preenchidos');
    return false;
  }

  } catch (err) {
    // Reverter flags early em caso de qualquer erro
    if (temAudio) audioDataInjected = false;
    if (temCamera) cameraDataInjected = false;
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
      fase2DilatacaoAtiva = false;
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

    // Limpeza manual (novo paciente): descartar fase 1 de dilatação persistida,
    // para que a entrevista de um paciente não contamine a análise do próximo.
    // O clearAll automático pós-injeção NÃO passa esta opção — preserva a fase 1.
    if (options.discardDilatacao === true) {
      chrome.storage.local.remove('_shospDilatacaoPhase1');
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
  if (!tabs.length) return null;
  // Prefere a aba com o prontuário aberto; cai para tabs[0] se a sondagem falhar
  // (injeções diretas durante a gravação não devem bloquear por erro de sondagem).
  try {
    return (await selectShospTab(tabs, { retries: 0, reinject: false })) || tabs[0];
  } catch (_e) {
    return tabs[0];
  }
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
