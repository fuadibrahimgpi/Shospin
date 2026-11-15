/**
 * SIDEPANEL — Injeção direta (exames normais, blefarite, receita)
 * Parte de sidepanel-injection.js dividido por responsabilidade (conteúdo inalterado).
 * Carregado logo após sidepanel-injection.js (ver sidepanel.html). Depende de: sidepanel-constants.js
 */

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
      fundoscopia: AppState.fundoscopiaDetectada ? FUNDOSCOPIA_NORMAL : null,
    },
  });
  if (response?.success) {
    statusText.textContent = 'Gravando... (exames injetados)';
    setTimeout(() => { if (AppState.isRecording) statusText.textContent = 'Gravando...'; }, 2000);
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
    setTimeout(() => { if (AppState.isRecording) statusText.textContent = 'Gravando...'; }, 2000);
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
    setTimeout(() => { if (AppState.isRecording) statusText.textContent = 'Gravando...'; }, 3000);
  } else {
    statusText.textContent = 'Gravando... (receita não injetada)';
  }
}
