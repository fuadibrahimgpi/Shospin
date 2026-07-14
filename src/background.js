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

let popupWindowId = null;

chrome.action.onClicked.addListener(async () => {
  if (popupWindowId) {
    try {
      await chrome.windows.update(popupWindowId, { focused: true });
      return;
    } catch (_) {
      popupWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url: 'sidepanel.html',
    type: 'popup',
    width: 420,
    height: 700,
    left: 100,
    top: 100
  });
  popupWindowId = win.id ?? null;
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

    case 'openSidePanel':
      chrome.windows.create({ url: 'sidepanel.html', type: 'popup', width: 420, height: 700 })
        .then(win => { popupWindowId = win.id ?? null; });
      sendResponse({ success: true });
      return false;

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
  if (popupWindowId) {
    try {
      // Verifica se a janela ainda existe (pode ter sido fechada sem disparar onRemoved)
      await chrome.windows.get(popupWindowId);
    } catch (_) {
      popupWindowId = null;
    }
  }

  if (popupWindowId) {
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

    const win = await chrome.windows.create({
      url: 'sidepanel.html',
      type: 'popup',
      width: 420,
      height: 700,
      left: 100,
      top: 100
    });
    popupWindowId = win.id ?? null;

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
