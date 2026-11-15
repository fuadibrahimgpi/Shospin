/**
 * CONTRATO DAS MENSAGENS — fonte única de quem fala com quem
 * ============================================================================
 * A extensão tem quatro peças que conversam por mensagem (painel, aba do SHOSP,
 * background e páginas de permissão). Até 2026-11-10 os nomes das ações eram
 * texto solto espalhado pelos arquivos, as respostas usavam três grafias
 * (`success`/`error`, `erro`, `ok`) e havia três handlers que ninguém chamava.
 *
 * Este arquivo é o REGISTRO: toda ação existe aqui, com remetente, destinatário
 * e o que volta. Ele não é carregado pela extensão em execução — quem o faz valer
 * é o teste `[MSG-*]` em utils/integration-test.js, que falha se:
 *   - o código enviar uma ação que não está aqui;
 *   - uma ação daqui não tiver quem envie ou quem trate;
 *   - existir handler para uma ação que não está aqui (handler órfão);
 *   - uma resposta voltar a usar `erro:` ou `ok:`.
 *
 * Para criar uma ação nova: registre aqui, escreva o envio e o handler, rode
 * `npm test`.
 *
 * ── FORMATO DA RESPOSTA (um só) ─────────────────────────────────────────────
 *   sucesso: { success: true,  ...dados }
 *   falha:   { success: false, error?: 'texto para o médico/log', ...diagnóstico }
 *
 * Exceções documentadas (formas próprias, mantidas de propósito):
 *   - checkPage responde { isShospPage, prontuarioOpen } — é sondagem, não operação.
 *   - injectAll com requestId repetido responde { status: 'duplicate_ignored', requestId }.
 *
 * ── TRANSPORTE painel → aba (sendToTab, scripts/sidepanel-injection.js) ─────
 * Além da resposta do content script, o chamador pode receber:
 *   'CONTEXT_INVALIDATED' — extensão recarregada; pedir F5 na aba do SHOSP
 *   null                  — sem resposta (content script ausente OU limite de tempo)
 */
'use strict';

const MENSAGENS = {
  // Painel → aba do SHOSP. Envia: scripts/sidepanel-*.js (via sendToTab).
  // Trata: window.__shospMessageListener em src/content.js.
  painelParaAba: {
    checkPage:                 'sonda a aba → { isShospPage, prontuarioOpen }',
    injectAll:                 'injeta a consulta inteira → { success, warnings?, readback? }',
    injectExamesNormais:       'biomicroscopia/fundoscopia padrão durante a gravação → { success }',
    injectReceitaOlhoIrritado: 'receita padrão de olho irritado → { success }',
    injectRefracaoEstatica:    'só o bloco Refração ESTÁTICA (pós-dilatação) → { success, diag }',
    injectOctLaudo:            'laudo de OCT no campo OCT da aba Glaucoma → { success, campo?, readback?, ocupado? }',
    searchCid:                 'busca e lança um CID → { success, skipped?, reason? }',
    setInjectedCids:           'redefine os CIDs já lançados (fronteira de paciente) → { success, codes }',
    dumpRefracaoBlocks:        'diagnóstico dos campos de refração → { success, candidatos }',
    dumpCamposGlaucoma:        'diagnóstico dos campos da aba Glaucoma → { success, container, campos }',
  },

  // Background → painel (atalhos de teclado). Envia: src/background.js.
  // Trata: chrome.runtime.onMessage em scripts/sidepanel-init.js.
  backgroundParaPainel: {
    toggleRecording:       'Ctrl+Shift+M — inicia/para a gravação',
    captureExam:           'Ctrl+Shift+C — abre a câmera ou captura',
    injectAllFromKeyboard: 'Ctrl+Shift+V — injeta tudo',
  },

  // Painel → background. Envia: scripts/sidepanel-init.js. Trata: src/background.js.
  painelParaBackground: {
    panelReady: 'painel terminou de carregar — libera a ação de atalho pendente',
  },

  // Páginas de permissão → painel. Envia: scripts/permission-page.js.
  // Trata: chrome.runtime.onMessage em scripts/sidepanel-init.js.
  paginaParaPainel: {
    permissionGranted:       'microfone liberado em permission.html',
    cameraPermissionGranted: 'câmera liberada em camera-permission.html',
  },
};

/** Nomes das ações de um canal. */
function acoesDoCanal(canal) {
  return Object.keys(MENSAGENS[canal] || {});
}

/** Todos os nomes, de todos os canais (sem repetição). */
function todasAsAcoes() {
  return [...new Set(Object.keys(MENSAGENS).flatMap(acoesDoCanal))];
}

const ShospMensagens = { MENSAGENS, acoesDoCanal, todasAsAcoes };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShospMensagens;
}
