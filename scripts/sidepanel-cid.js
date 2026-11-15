/**
 * SIDEPANEL — Busca e lançamento de CID
 * Parte de sidepanel-injection.js dividido por responsabilidade (conteúdo inalterado).
 * Carregado logo após sidepanel-injection.js (ver sidepanel.html). Depende de: sidepanel-constants.js
 */

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
    dbg(`[CID] Deduplicados ${terms.length - unique.length} termo(s) duplicado(s):`, terms.filter(t => !unique.includes(t)));
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
  dbg(`[CID] Processando "${rawTerm}" | campo completo: ${JSON.stringify(field.value)}`);

  // Extrair só o código CID quando o formato for "H010 - Descrição"
  const codeMatch = rawTerm.match(CID_CODE_PATTERN);
  let termToSearch = codeMatch ? codeMatch[1] : rawTerm;

  // Normalizar códigos de 4 caracteres sem ponto (ex: H400 -> H40.0) para compatibilidade com o autocomplete do SHOSP
  if (/^[A-Z]\d{3}$/.test(termToSearch)) {
    termToSearch = termToSearch.slice(0, 3) + '.' + termToSearch.slice(3);
  }

  // Feedback visual imediato
  successMessage.classList.remove('hidden');
  setFeedbackMessage(successMessage, `🔍 Buscando CID: ${rawTerm}...`);
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

    dbg(`[SearchCid] termo="${termToSearch}" → tab=${cidTab.id}`);
    const resp = await sendToTab(cidTab.id, { action: 'searchCid', term: termToSearch });
    dbg(`[SearchCid] resp=`, resp);

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
      setFeedbackMessage(successMessage, `C.I.D. lançado: ${termToSearch}`, true);
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
