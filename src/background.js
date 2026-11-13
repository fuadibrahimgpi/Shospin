/**
 * BACKGROUND SERVICE WORKER
 * Responsabilidades:
 *   - Abrir/focar a janela popup do sidepanel (rastreada via popupWindowId).
 *   - Re-injetar o content script em navegações SPA do SHOSP (com debounce).
 *   - Rotear atalhos de teclado para o sidepanel, abrindo-o se necessário
 *     (handshake 'panelReady' com fallback por timeout).
 * A versão vem de chrome.runtime.getManifest() — não duplicar aqui.
 */
"use strict";

const bgLogger = {
  info: (msg, data) => console.log(`[Background] ℹ️ ${msg}`, data ?? ''),
  error: (msg, data) => console.error(`[Background] ❌ ${msg}`, data ?? ''),
  success: (msg, data) => console.log(`[Background] ✅ ${msg}`, data ?? '')
};

// ============================================================================
// PAINEL ÚNICO
// ============================================================================
// popupWindowId é só um CACHE. O Chrome encerra o service worker ocioso (~30s)
// e, ao acordá-lo, toda variável volta ao valor inicial. Antes, o worker tratava
// "variável nula" como "painel fechado": o clique no ícone ou um atalho abria um
// SEGUNDO painel, e como chrome.runtime.sendMessage chega a todas as páginas da
// extensão, os dois recebiam 'toggleRecording' — duas gravações da mesma consulta.
//
// A verdade está nas abas abertas: o painel é uma aba cuja URL é a do
// sidepanel.html. _findPanelWindowId confere o cache e, se ele não servir,
// procura essa aba antes de qualquer criação.
let popupWindowId = null;
let _panelOpening = null; // criação em andamento — dois cliques seguidos não abrem dois

const PANEL_URL = chrome.runtime.getURL('sidepanel.html');

/**
 * Escolhe a janela do painel entre as abas abertas. Pura (só argumentos) para
 * ser exercitada por _extractFn nos testes.
 * @returns {number|null} windowId do painel, ou null se não há painel aberto
 */
function _pickPanelWindowId(tabs, panelUrl) {
  for (const t of Array.isArray(tabs) ? tabs : []) {
    const url = (t && (t.url || t.pendingUrl)) || '';
    // Igual, ou igual + "?..." / "#..." — nunca só prefixo (sidepanel.html.bak).
    if (url === panelUrl || url.startsWith(panelUrl + '?') || url.startsWith(panelUrl + '#')) {
      if (typeof t.windowId === 'number') return t.windowId;
    }
  }
  return null;
}

/** Janela do painel já aberto (cache conferido, depois varredura das abas), ou null. */
async function _findPanelWindowId() {
  if (popupWindowId != null) {
    try {
      await chrome.windows.get(popupWindowId);
      return popupWindowId;
    } catch (_) {
      popupWindowId = null; // janela fechada sem o onRemoved ter chegado
    }
  }
  try {
    popupWindowId = _pickPanelWindowId(await chrome.tabs.query({}), PANEL_URL);
  } catch (err) {
    bgLogger.error('Falha ao procurar painel aberto:', err?.message);
    popupWindowId = null;
  }
  return popupWindowId;
}

/** Abre o painel — reaproveitando a criação em andamento, se houver. */
function _createPanelWindow() {
  if (!_panelOpening) {
    _panelOpening = chrome.windows.create({
      url: 'sidepanel.html',
      type: 'popup',
      width: 420,
      height: 700,
      left: 100,
      top: 100
    }).then((win) => {
      popupWindowId = win.id ?? null;
      return popupWindowId;
    }).finally(() => { _panelOpening = null; });
  }
  return _panelOpening;
}

/** Foca o painel existente ou abre um. @returns {{ windowId, created }} */
async function _focusOrOpenPanel() {
  const existing = await _findPanelWindowId();
  if (existing != null) {
    try {
      await chrome.windows.update(existing, { focused: true });
      return { windowId: existing, created: false };
    } catch (_) {
      popupWindowId = null;
    }
  }
  return { windowId: await _createPanelWindow(), created: true };
}

chrome.action.onClicked.addListener(() => {
  _focusOrOpenPanel().catch(err => bgLogger.error('Falha ao abrir painel:', err?.message));
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) popupWindowId = null;
});

// ============================================================================
// RE-INJEÇÃO AUTOMÁTICA EM NAVEGAÇÃO SPA
// ============================================================================
// O SHOSP é uma SPA: a troca de rota NÃO recarrega a página — apenas muda a URL.
// Por isso, status='complete' só dispara em reloads reais (F5); a navegação SPA
// emite changeInfo.url mas nunca sobe para 'complete'.
//
// Solução: reagir a AMBOS os eventos com debounce por tabId (300ms) para evitar
// dupla injeção nos reloads reais, onde url + complete chegam juntos num intervalo
// muito curto.
//
// Executar content.js mais de uma vez na mesma página é seguro POR CAUSA do
// guard em content.js: cada execução remove o listener anterior via
// window.__shospMessageListener e reaproveita window.__shospSeenRequestIds,
// então nunca há duas instâncias processando a mesma mensagem. Se esse guard
// for removido do content.js, esta re-injeção volta a criar duplicatas.

const _reinjectionDebounce = new Map(); // tabId → timeoutId

async function _reInjectContentScript(tabId, reason) {
  // Debounce: cancela injeção anterior pendente para esta aba
  if (_reinjectionDebounce.has(tabId)) {
    clearTimeout(_reinjectionDebounce.get(tabId));
  }
  _reinjectionDebounce.set(tabId, setTimeout(async () => {
    _reinjectionDebounce.delete(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content.js']
      });
      bgLogger.info(`Content script re-injetado na aba ${tabId} (${reason})`);
    } catch (err) {
      // Erros esperados: aba fechada, URL privilegiada (chrome://) etc.
      bgLogger.error('Falha ao re-injetar content script:', err?.message);
    }
  }, 300));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = tab.url || changeInfo.url || '';
  if (!url.includes('shosp.com.br')) return;

  // Reagir a mudança de URL (nav SPA) OU a carregamento completo (reload real).
  // Pelo menos um destes sempre dispara em qualquer navegação dentro do SHOSP.
  if (changeInfo.url || changeInfo.status === 'complete') {
    _reInjectContentScript(tabId, changeInfo.url ? 'nav SPA' : 'reload');
  }
});

// (findShospTab/injectAndSend removidos: eram código morto desde que o sidepanel
// passou a enviar mensagens diretamente para a aba via sendToTab, e a seleção
// cega de tabs[0] era a mesma classe de bug corrigida na injeção em 293418a.)

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.action) {
    // 'injectReceitaViaBackground' e 'injectExamesViaBackground' foram removidos:
    // o sidepanel envia diretamente para a aba via sendToTab (evita um salto de mensagem).

    // ('openSidePanel' foi removido: ninguém o enviava. O painel abre pelo clique
    // no ícone ou por atalho — ver _focusOrOpenPanel.)

    case 'panelReady':
      _onPanelReady();
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
});

function _badgeClosedPanel() {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
}

// Ação de teclado aguardando o sidepanel terminar de inicializar.
// O sidepanel envia 'panelReady' ao registrar seus listeners (sidepanel-init.js);
// o timeout é só fallback caso o sinal se perca.
let _pendingPanelAction = null;
let _pendingPanelTimer = null;

function _sendPendingPanelAction(origin) {
  if (!_pendingPanelAction) return;
  const action = _pendingPanelAction;
  _pendingPanelAction = null;
  if (_pendingPanelTimer) { clearTimeout(_pendingPanelTimer); _pendingPanelTimer = null; }

  chrome.runtime.sendMessage({ action }).catch(() => {
    bgLogger.error(`Falha ao enviar "${action}" após abrir sidepanel (${origin})`);
    _badgeClosedPanel();
  });
}

function _onPanelReady() {
  _sendPendingPanelAction('panelReady');
}

// Garante que o sidepanel está aberto e envia a ação.
// Se o painel estiver fechado, abre-o e envia quando ele sinalizar 'panelReady'.
async function _ensurePanelAndSend(action) {
  // Procura o painel de verdade (não só a variável): depois que o worker dorme,
  // a variável está nula com o painel aberto — ver "PAINEL ÚNICO" no topo.
  if (await _findPanelWindowId() != null) {
    chrome.runtime.sendMessage({ action }).catch(() => {
      bgLogger.error(`Falha ao enviar "${action}" — sidepanel não respondeu`);
      _badgeClosedPanel();
    });
    return;
  }

  // Painel fechado: abre e envia quando o 'panelReady' chegar
  bgLogger.info(`Sidepanel fechado — abrindo para executar: ${action}`);
  try {
    _pendingPanelAction = action;

    await _createPanelWindow();

    // Fallback: se o panelReady não chegar (ex: sinal perdido), tenta mesmo assim
    _pendingPanelTimer = setTimeout(() => {
      _pendingPanelTimer = null;
      _sendPendingPanelAction('fallback-timeout');
    }, 3000);
  } catch (err) {
    _pendingPanelAction = null;
    bgLogger.error('Falha ao abrir sidepanel:', err?.message);
    _badgeClosedPanel();
  }
}

chrome.commands.onCommand.addListener((command) => {
  bgLogger.info('Comando recebido:', command);

  // Estes comandos controlam o sidepanel (popup), não o content script.
  switch (command) {
    case 'toggle-recording':
      _ensurePanelAndSend('toggleRecording');
      break;
    case 'capture-exam':
      _ensurePanelAndSend('captureExam');
      break;
    case 'inject-all':
      _ensurePanelAndSend('injectAllFromKeyboard');
      break;
  }
});

bgLogger.success(`Service worker v${chrome.runtime.getManifest().version} iniciado`);
