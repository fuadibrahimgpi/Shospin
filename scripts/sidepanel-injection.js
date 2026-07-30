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

// Início de cadeia manual: zera o acumulador de CIDs recusados (não é recursão).
if (btnSearchCid) {
  btnSearchCid.addEventListener('click', () => { handleSearchCid._failed = []; handleSearchCid(diagnosticoField); });
}
if (btnSearchCidRetorno) {
  btnSearchCidRetorno.addEventListener('click', () => { handleSearchCid._failed = []; handleSearchCid(diagnosticoRetornoField); });
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

/**
 * Chave canônica de um termo de CID — base ÚNICA de deduplicação do módulo.
 * "H522 - Astigmatismo OD", "H52.2 - Astigmatismo", "H522" e "Astigmatismo"
 * colapsam todos em "H522" (a IA e o OCR escrevem o mesmo código em formatos
 * diferentes: com ponto, sem ponto, com e sem lateralidade).
 */
function _cidKey(term) {
  const t = (term || '').trim();
  if (!t) return '';
  const m = t.match(CID_CODE_PATTERN);
  if (m) return m[1].replace(/\./g, '').toUpperCase();
  const bare = t.match(/^([A-Za-z]\d+(?:\.\d+)?)$/);
  if (bare) return bare[1].replace(/\./g, '').toUpperCase();
  return _cidKeyFromText(t) || t.toUpperCase();
}

function _deduplicateCidField(field) {
  if (!field || !field.value.trim()) return;
  const terms = field.value.split(/\n|,|;/).map(t => t.trim()).filter(Boolean);
  if (terms.length <= 1) return;
  const seen = new Set();
  const unique = terms.filter(t => {
    const key = _cidKey(t);
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
      // Memória de lançamento: o campo é consumido termo a termo logo abaixo e
      // acaba vazio — sem este registro, a passada seguinte (OCR) perde a base de
      // deduplicação e relança o mesmo CID no SHOSP.
      const _key = _cidKey(rawTerm);
      if (_key) _cidsLancadosNaSessao.add(_key);
      // Atualiza o campo com os restantes (remove o termo já buscado)
      field.value = terms.slice(1).join('\n');
      // Feedback de sucesso
      successMessage.classList.remove('hidden');
      successMessage.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>C.I.D. lançado: ${termToSearch}</span>`;
      successMessage.style.background = '#dcfce7';
      successMessage.style.color = '#166534';
      _armHideSuccess();
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
        _surfaceFailedCids(); // fim de cadeia — mostra CIDs recusados, se houver
      }
    } else {
      // S2: pular termo com falha e continuar a cadeia (não interromper por um CID inválido)
      const errMsg = resp?.error || 'Aba C.I.D. não encontrada na página';
      console.warn(`[CID] Falha ao buscar "${rawTerm}": ${errMsg}`);
      // Acumula para o aviso persistente de fim de cadeia (o toast some em 3s).
      (handleSearchCid._failed || (handleSearchCid._failed = [])).push(rawTerm);
      showError(`CID não encontrado: ${rawTerm}`);
      field.value = terms.slice(1).join('\n');
      const stillHasCid = field.value.trim();
      if (stillHasCid) {
        setTimeout(() => { handleSearchCid._running = false; handleSearchCid(field); }, 1800);
        return;
      } else {
        handleSearchCid._running = false;
        _surfaceFailedCids(); // fim de cadeia — mostra CIDs recusados, se houver
      }
    }
  } catch (err) {
    handleSearchCid._running = false;
    showError('Erro ao buscar C.I.D.');
    console.error(err);
  }
}
handleSearchCid._running = false;
handleSearchCid._failed = []; // CIDs recusados pelo SHOSP na cadeia atual

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
    // "Nada capturado ainda" ≠ "já injetado". Conflatar os dois fazia o botão
    // manual acusar "Dados já injetados" quando nada havia sido injetado: a
    // análise do Gemini estava em voo (audioData ainda null) e o ramo estática
    // acabara de zerar cameraData de propósito. Log 2026-07-29, 20:07 e 20:10.
    if (!audioData && !cameraData) {
      const motivo = isRecording
        ? 'Gravação em andamento — pare a gravação para injetar.'
        : _analiseEmAndamento
          ? 'Análise em andamento — aguarde o resultado para injetar.'
          : 'Nada capturado ainda — grave a consulta ou fotografe o ticket.';
      showError(motivo);
      throw new Error('Nada para injetar');
    }
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

  // Carregar dados persistidos da fase 1 SOMENTE do slot ARMADO da fila de
  // pausas (retomar=true — o médico confirmou o retorno DESTE paciente). Sem
  // slot armado, nenhum campo de fase 1 é mesclado na injeção atual — evita
  // levar a entrevista de um paciente ao prontuário de outro atendido durante
  // a espera (caso 2026-07-17). Slots expirados são podados na leitura; os
  // não-armados são apenas ignorados (seguem aguardando na sala de espera).
  let _phase1Data = null;
  try {
    _phase1Data = await DilatacaoPausas.obterRetomada();
  } catch (_e) { _phase1Data = null; }

  // Sanidade anti-contaminação: se a pausa armada nasceu em OUTRO prontuário
  // (URL diferente da aba de injeção), avisar — o médico pode ter armado a
  // retomada errada ou trocado de paciente sem desarmar.
  if (_phase1Data?.tabUrl && tab?.url && _phase1Data.tabUrl !== tab.url) {
    console.warn('[InjectAll] ⚠️ Prontuário aberto difere do prontuário da pausa armada:',
      { pausa: _phase1Data.tabUrl.slice(0, 80), atual: tab.url.slice(0, 80) });
  }

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
  if (!SessionFlags.catarataDetectada && !SessionFlags.lioDetectada && !SessionFlags.opacidadeCapsulaDetectada) {
    const _cat = parseCatarataFromDiagnostico(audioData?.dados?.diagnostico);
    if (_cat.detected) {
      SessionFlags.catarataDetectada = true;
      if (!SessionFlags.catarataGrau && _cat.grau) SessionFlags.catarataGrau = _cat.grau;
      console.log('[Catarata] Flag derivada do diagnóstico (gatilho de voz não disparou):', SessionFlags.catarataGrau || '(grau não especificado)');
    }
  }

  // Nunca afirmar exame NORMAL que contradiz o próprio diagnóstico da consulta.
  // Origem (log 2026-07-29): diagnóstico "H111 - Pterígio OD" + biomicroscopia null →
  // o fallback de despedida injetou "AO: olho calmo" logo abaixo do pterígio.
  // `_temTratamentoAtivo` não cobria: a consulta não tinha tratamento nem encaminhamento.
  // Política (mesma do _guardExamesNormaisFase2): campo VAZIO — que o médico redige —
  // é preferível a texto fabricado que contradiz o prontuário. Não compomos a descrição
  // por olho aqui: "pterígio nasal grau I" seria invenção; só o médico dita o detalhe.
  const _dxAnterior  = temAchadoAnteriorNoDiagnostico(audioData?.dados?.diagnostico);
  const _dxPosterior = temAchadoPosteriorNoDiagnostico(audioData?.dados?.diagnostico);
  const _bioNormalSeguro = () => {
    if (_dxAnterior) {
      console.warn('[ExamesNormais] Biomicroscopia normal SUPRIMIDA — diagnóstico afirma achado de segmento anterior. Campo deixado vazio para descrição manual.');
      return null;
    }
    return getBiomicroscopiaComLente(BIOMICROSCOPIA_NORMAL);
  };
  const _fundoNormalSeguro = () => {
    if (_dxPosterior) {
      console.warn('[ExamesNormais] Fundoscopia normal SUPRIMIDA — diagnóstico afirma achado de segmento posterior. Campo deixado vazio para descrição manual.');
      return null;
    }
    return FUNDOSCOPIA_NORMAL;
  };

  if (!SessionFlags.blefariteInjetada && !SessionFlags.examesNormaisInjetados) {
    if (!audioData?.dilatacaoDetectada && audioData?.injectExamesNormais && !_temTratamentoAtivo) {
      combinedData.examesNormais = {
        biomicroscopia: _bioNormalSeguro(),
        fundoscopia: (SessionFlags.fundoscopiaDetectada || mencionouFundoNaFala) ? _fundoNormalSeguro() : null
      };
    } else if (!audioData?.dilatacaoDetectada && audioData?.injectBlefarite) {
      // Blefarite: se Gemini gerou biomicroscopia personalizada (ex: pterígio + blefarite),
      // usa ela; caso contrário usa o template padrão de blefarite.
      // Com dilatação pendente NÃO injeta — descrição de exames pertence à fase 2.
      const _bioBase = audioData?.dados?.biomicroscopia || BIOMICROSCOPIA_BLEFARITE;
      combinedData.examesNormais = {
        biomicroscopia: getBiomicroscopiaComLente(_bioBase),
        // Blefarite é achado de segmento ANTERIOR — não implica fundo normal.
        // Se o médico discutiu achado posterior (ex.: escavação aumentada suspeita de
        // glaucoma), o Gemini preenche dados.fundoscopia e ela prevalece; o template
        // normal só entra quando nada foi descrito no fundo.
        fundoscopia: audioData?.dados?.fundoscopia || _fundoNormalSeguro()
      };
    } else if (!audioData?.dilatacaoDetectada &&
               (audioData?.dados?.biomicroscopia || audioData?.dados?.fundoscopia)) {
      // Biomicroscopia/fundoscopia personalizada gerada pelo Gemini (ex: pinguecula, pterígio, nevo)
      // Quando só fundoscopia foi preenchida (achado posterior com segmento anterior normal),
      // injeta o template normal de biomicroscopia para não deixar o campo em branco.
      combinedData.examesNormais = {
        biomicroscopia: audioData.dados.biomicroscopia
          ? getBiomicroscopiaComLente(audioData.dados.biomicroscopia)
          : _bioNormalSeguro(),
        fundoscopia: audioData.dados.fundoscopia || null
      };
    } else if (audioData && SessionFlags.consultaEncerradaDetectada && !audioData.dilatacaoDetectada && !_temTratamentoAtivo) {
      // Fallback de despedida: a consulta foi encerrada pelo STOP (despedida) e
      // nenhum gatilho de exame disparou (garantido pelo guard externo).
      // Guard: _temTratamentoAtivo impede injeção de exames "normais" em consultas
      // com patologia ativa (conduta com encaminhamento ou tratamento prescrito).
      combinedData.examesNormais = {
        biomicroscopia: _bioNormalSeguro(),
        fundoscopia: mencionouFundoNaFala ? _fundoNormalSeguro() : null,
      };
    }
  } else if (!audioData?.dilatacaoDetectada &&
             (audioData?.dados?.biomicroscopia || audioData?.dados?.fundoscopia)) {
    // Correção pós-análise: um gatilho de voz (blefarite/exames normais) já injetou
    // os templates no momento em que disparou — antes de o médico descrever o exame.
    // Se a análise depois identificou um achado, o achado real prevalece sobre o
    // template, que afirmaria "olho calmo" / "escavação simétrica e fisiológica" e
    // contradiria o diagnóstico.
    // A condição cobre biomicroscopia TAMBÉM (2026-07-29): o caso mais provável é o
    // médico disparar "exames normais" cedo e achar o pterígio depois — antes, só
    // fundoscopia entrava aqui e o "AO: olho calmo" do gatilho ficava no prontuário.
    const _bioExplicita = audioData?.dados?.biomicroscopia ||
      (SessionFlags.blefariteInjetada ? BIOMICROSCOPIA_BLEFARITE : null);
    combinedData.examesNormais = {
      biomicroscopia: _bioExplicita ? getBiomicroscopiaComLente(_bioExplicita) : _bioNormalSeguro(),
      // null = nada a corrigir no fundo; a fundoscopia já injetada pelo gatilho permanece.
      fundoscopia: audioData.dados.fundoscopia || null,
    };
    console.log('[ExamesNormais] Exame do gatilho corrigido —',
      [audioData?.dados?.biomicroscopia && 'biomicroscopia',
       audioData?.dados?.fundoscopia && 'fundoscopia'].filter(Boolean).join(' + '),
      'descrito(s) na consulta.');
  }

  // Se a supressão zerou os dois campos, não enviar o objeto vazio: `examesNormais`
  // truthy com tudo null faz o content.js reportar "não foram injetadas" — aviso
  // enganoso, já que a supressão é deliberada. null é o estado pré-existente de
  // "nada a injetar" e já é tratado pelo handler.
  if (combinedData.examesNormais &&
      !combinedData.examesNormais.biomicroscopia &&
      !combinedData.examesNormais.fundoscopia) {
    combinedData.examesNormais = null;
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
    // O payload vai para o slot DESTA sessão na fila (criado por
    // processAudioInBackground) — junto com a identidade do prontuário da
    // injeção, usada como rótulo e sanidade na retomada. Slots de OUTROS
    // pacientes em espera nunca são tocados aqui: era exatamente o remove
    // incondicional do modelo antigo que apagava a pausa de quem dilatava
    // quando um paciente intercalado era injetado.
    if (combinedData.audio && audioData?.dilatacaoDetectada) {
      const _slotId = dilatacaoPausaAtualId || _phase1Data?.id || null;
      const _patch = {
        audio: combinedData.audio,
        ts: Date.now(),
        motivo: 'dilatacao',
        retomar: false,
        tabUrl: tab?.url || null,
        tabTitle: tab?.title || null,
      };
      try {
        const _atualizado = _slotId ? await DilatacaoPausas.atualizar(_slotId, _patch) : null;
        if (!_atualizado) {
          // Slot não localizado (sessão fora de ordem) — criar para não perder a fase 1
          await DilatacaoPausas.criar({
            ..._patch,
            transcript: _phase1Data?.transcript || recognizedText || '',
          });
        }
        console.log('[InjectAll] Dados da fase 1 (dilatação) salvos no slot da fila para re-injeção pós-dilatação.');
      } catch (_e) { console.warn('[InjectAll] Falha ao persistir slot de dilatação (não-fatal):', _e?.message); }
    } else if (_phase1Data && combinedData.audio) {
      // Fase 2 concluída (injeção de ÁUDIO sem dilatação): consumir SOMENTE o
      // slot retomado deste paciente. Injeção só de câmera (OCR capturado no
      // meio da fase 2) NÃO consome — a transcrição da fase 1 ainda será
      // anexada quando a gravação da fase 2 terminar.
      try { await DilatacaoPausas.remover(_phase1Data.id); } catch (_e) { /* não-fatal */ }
      console.log('[InjectAll] Fase 2 concluída — pausa retomada removida da fila.');
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
      // Persistir os específicos do ticket: a passada de áudio (entrevista) que vem
      // DEPOIS sobrescreve o diagnosticoField com o diagnóstico dela (ex: H52.9 via
      // displayAudioResults) e cameraData já foi anulado pelo clearAll da câmera —
      // sem persistir, H52.0/H52.2 se perdem (regressão do log 2026-07-27).
      if (ocrCids.length) _pendingOcrRefracaoCids = [...ocrCids];

      // CIDs a mesclar: os do OCR desta passada OU, numa passada de áudio, os CIDs
      // refrativos pendentes de uma passada de câmera anterior do mesmo paciente.
      const cidsToMerge = ocrCids.length
        ? ocrCids
        : (combinedData.audio && _pendingOcrRefracaoCids.length ? [..._pendingOcrRefracaoCids] : []);

      clearAll({
        clearAudio: !!combinedData.audio,
        clearCamera: !!combinedData.exames
      });

      // Mesclar CIDs do OCR ao campo de diagnóstico (deduplicados contra CIDs de áudio)
      let novosCids = [];
      const cidTarget = cidField || (cidsToMerge.length ? diagnosticoField : null);
      if (cidsToMerge.length && cidTarget) {
        // Base de deduplicação = o que ainda está no campo + o que JÁ FOI LANÇADO
        // nesta consulta. A segunda parcela é indispensável: quando a entrevista
        // vem antes do OCR, a cadeia de handleSearchCid já esvaziou o campo e o
        // campo sozinho não prova nada (H52.2 duplicado, log 2026-07-29).
        const existingCodes = new Set([
          ..._cidsLancadosNaSessao,
          ...(cidTarget.value || '').split(/\n|,|;/).map(t => _cidKey(t)).filter(Boolean),
        ]);
        novosCids = cidsToMerge.filter(cid => !existingCodes.has(_cidKey(cid)));
        const _jaLancados = cidsToMerge.filter(cid => existingCodes.has(_cidKey(cid)));
        if (_jaLancados.length) {
          console.log('[AutoCID-OCR] CIDs ignorados (já lançados nesta consulta):', _jaLancados);
        }
        if (novosCids.length) {
          cidTarget.value = [cidTarget.value, ...novosCids].filter(Boolean).join('\n');
          console.log('[AutoCID-OCR] CIDs de refração adicionados:', novosCids);
        }
      }
      // Passada de áudio consumiu os pendentes — não devem vazar p/ o próximo paciente.
      if (combinedData.audio) _pendingOcrRefracaoCids = [];

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
        handleSearchCid._failed = []; // início de cadeia — zera CIDs recusados
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
    // Subconjunto INTENCIONAL: lenteLimpaDetectada, consultaEncerradaDetectada
    // e despedidaNaSessao NÃO são zeradas aqui (só no resetSession da próxima
    // gravação) — são sticky da sessão. Para adicionar flag nova: registrar em
    // SESSION_FLAG_DEFAULTS (sidepanel-constants.js), criar o hook em
    // sidepanel-hooks.js e decidir se ela entra neste reset parcial.
    if (clearAudio && !isRecording) {
      SessionFlags.examesNormaisInjetados = false;
      SessionFlags.blefariteInjetada = false;
      SessionFlags.fundoscopiaDetectada = false;
      SessionFlags.receitaOlhoIrritadoInjetada = false;
      SessionFlags.catarataDetectada = false;
      SessionFlags.catarataGrau = null;
      SessionFlags.lioDetectada = false;
      SessionFlags.opacidadeCapsulaDetectada = false;
      SessionFlags.dilatacaoDetectada = false;
      SessionFlags.fase2DilatacaoAtiva = false;
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
      SessionFlags.dilatacaoDetectada = false;
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
      // NÃO remover o clinicalWarningBanner aqui: este clearAll é o AUTOMÁTICO
      // pós-injeção, que roda ~1,5s depois da análise. Removê-lo aqui apagaria o
      // aviso (ex: biomicroscopia em branco) antes de o médico conseguir lê-lo —
      // justamente no momento em que o campo acabou de entrar vazio no prontuário.
      // O banner morre só na fronteira de PACIENTE (limpeza manual / nova gravação).
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

    // Limpeza manual (novo paciente): DESARMAR qualquer retomada pendente —
    // a próxima gravação volta a ser paciente novo. As pausas em si ficam na
    // fila (outros pacientes seguem dilatando); descarte individual é pelo ✕
    // da sala de espera. O clearAll automático pós-injeção não passa a opção.
    if (options.discardDilatacao === true) {
      try { DilatacaoPausas.desmarcarRetomadas(); } catch (_e) { /* não-fatal */ }
      // Novo paciente: a memória de CIDs lançados não pode atravessar fichas —
      // senão um CID legítimo do próximo paciente seria silenciosamente ignorado.
      _cidsLancadosNaSessao = new Set();
      // Fronteira de paciente: o aviso clínico da consulta anterior sai de cena.
      const _warnBanner = document.getElementById('clinicalWarningBanner');
      if (_warnBanner) _warnBanner.remove();
    }

    console.log('[ClearAll] Limpeza concluída', options);

  } catch (error) {
    console.error('[ClearAll] Erro:', error);
  }
}

// ============================================================================
// FEEDBACK VISUAL
// ============================================================================

// successMessage é um elemento COMPARTILHADO (sucesso, erro, "buscando", e o
// aviso persistente de CIDs recusados). Cada feedback transitório armava seu
// próprio setTimeout de hide sem cancelar os anteriores — então um toast antigo
// podia esconder um aviso posterior. Centralizar num único slot (clear-antes-de-
// set) garante que só há um timer pendente e que o aviso persistente possa
// cancelá-lo. Passar delay=0 (ou omitir o arm) deixa a mensagem fixa.
function _armHideSuccess(delay = 3000) {
  if (successMessage._hideTimer) clearTimeout(successMessage._hideTimer);
  successMessage._hideTimer = setTimeout(() => {
    successMessage.classList.add('hidden');
    successMessage._hideTimer = null;
  }, delay);
}

function showSuccess() {
  successMessage.classList.remove('hidden');
  successMessage.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>Dados injetados com sucesso!</span>';
  successMessage.style.background = '#dcfce7';
  successMessage.style.color = '#166534';
  _armHideSuccess();
  // Nota: chrome.notifications não funciona em sidepanels, apenas feedback visual acima
}

function showError(message) {
  successMessage.classList.remove('hidden');
  successMessage.innerHTML = '<span>' + message + '</span>';
  successMessage.style.background = '#fee2e2';
  successMessage.style.color = '#991b1b';
  _armHideSuccess();
}

// Monta a mensagem PERSISTENTE de CIDs recusados pelo SHOSP. Pura (testável):
// retorna null quando não há falhas. Ver _surfaceFailedCids para a exibição.
function _formatFailedCidsMessage(failed) {
  if (!failed || !failed.length) return null;
  const lista = failed.map(c => String(c).trim()).filter(Boolean);
  if (!lista.length) return null;
  const s = lista.length > 1 ? 's' : '';
  return `⚠️ ${lista.length} CID${s} não aceito${s} pelo SHOSP — adicione manualmente: ${lista.join(', ')}`;
}

// Exibe (sem auto-hide) os CIDs que o SHOSP recusou durante a cadeia e consome
// o acumulador. Cancela qualquer hide pendente para o aviso não sumir em 3s.
function _surfaceFailedCids() {
  const msg = _formatFailedCidsMessage(handleSearchCid._failed);
  handleSearchCid._failed = [];
  if (!msg) return;
  if (successMessage._hideTimer) { clearTimeout(successMessage._hideTimer); successMessage._hideTimer = null; }
  successMessage.classList.remove('hidden');
  successMessage.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>' + msg + '</span>';
  successMessage.style.background = '#fef3c7';
  successMessage.style.color = '#92400e';
  // Sem _armHideSuccess: persistente até a próxima ação de feedback.
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
      fundoscopia: SessionFlags.fundoscopiaDetectada ? FUNDOSCOPIA_NORMAL : null,
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

/**
 * Injeção pós-dilatação: escreve o grau capturado APENAS no bloco Refração
 * ESTÁTICA, sem passar pelo injectAll (não toca em receita, tono, paqui, CID,
 * áudio nem clearAll). Estrutura idêntica à refração dinâmica; só muda o alvo.
 * @param {{od:object|null, oe:object|null}} refracao objeto no formato do OCR
 * @returns {Promise<boolean>} true se ao menos um campo foi preenchido
 */
async function injectRefracaoEstaticaDirect(refracao) {
  if (!refracao || (refracao.od == null && refracao.oe == null)) return false;
  const tab = await _getShospTab();
  if (!tab) return false;
  const response = await sendToTab(tab.id, {
    action: 'injectRefracaoEstatica',
    data: { refracao },
  });

  // Falha de TRANSPORTE não traz diag: sendToTab resolve a string
  // 'CONTEXT_INVALIDATED' ou null. Sem separar esses casos, o painel mandaria o
  // médico colar um dump que nunca foi impresso — a mesma pista falsa que este
  // diagnóstico existe para eliminar.
  if (response === 'CONTEXT_INVALIDATED') {
    console.warn('[RefracaoEstatica] Contexto da extensão invalidado — dê F5 na página do SHOSP e refaça a captura.');
    return false;
  }
  if (!response || typeof response !== 'object') {
    console.warn('[RefracaoEstatica] Sem resposta do content script (SPA ainda carregando?) — refaça a captura.');
    return false;
  }

  // JSON.stringify de propósito: o console imprime objeto como "Object" e o log
  // copiado pelo médico perde exatamente o conteúdo que interessa. Ver
  // [InjectAll] check: Object no log 2026-07-29.
  const diag = response.diag;
  if (diag) {
    console.log('[RefracaoEstatica] IDs resolvidos:', JSON.stringify(diag.resolvidos), '| aba clicada:', diag.tabClicked);
    if (diag.candidatos) {
      console.log('[RefracaoEstatica] campos de refração no DOM (estrutura, sem valores):');
      console.log(JSON.stringify(diag.candidatos, null, 1));
    }
  }
  if (!response.success) {
    if (diag && diag.tabClicked === false) {
      console.warn('[RefracaoEstatica] A aba Refração não foi aberta — o mapeamento nem chegou a ser testado. Abra o prontuário na aba Refração e refaça.');
    } else {
      console.warn('[RefracaoEstatica] Nada injetado — bloco ESTÁTICA não mapeado. ' +
        'Cole o dump acima para fixar os 6 IDs em FALLBACK_IDS (src/content.js:56-61).');
    }
  }
  return !!response.success;
}

/**
 * Dump estrutural dos campos de refração, sob demanda e sem injetar nada.
 * Uso: abrir o console do painel com o prontuário aberto e chamar
 * `dumpRefracaoBlocks()`. Serve para fixar os 6 IDs do bloco ESTÁTICA sem
 * precisar refazer uma captura pós-dilatação.
 * @returns {Promise<boolean>} true se o dump foi obtido
 */
async function dumpRefracaoBlocks() {
  const tab = await _getShospTab();
  if (!tab) { console.warn('[DumpRefracao] Nenhuma aba do SHOSP encontrada.'); return false; }
  const response = await sendToTab(tab.id, { action: 'dumpRefracaoBlocks' });
  if (response === 'CONTEXT_INVALIDATED') {
    console.warn('[DumpRefracao] Contexto da extensão invalidado — dê F5 na página do SHOSP.');
    return false;
  }
  if (!response || typeof response !== 'object' || !response.success) {
    console.warn('[DumpRefracao] Falhou:', (response && response.error) || 'sem resposta do content script');
    return false;
  }
  console.log('[DumpRefracao] campos de refração no DOM (estrutura, sem valores):');
  console.log(JSON.stringify(response.candidatos, null, 1));
  return true;
}

// Exposto explicitamente: a instrução ao médico é "chame dumpRefracaoBlocks() no
// console do painel", e isso tem que valer independente de como o console resolve
// o escopo dos scripts concatenados.
window.dumpRefracaoBlocks = dumpRefracaoBlocks;
