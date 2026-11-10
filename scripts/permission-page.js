/**
 * PÁGINAS DE PERMISSÃO — núcleo comum de permission.html e camera-permission.html
 * ============================================================================
 * O painel abre estas páginas quando o navegador nega microfone ou câmera
 * (ex.: instalação nova, permissão revogada). A permissão vale para a extensão
 * inteira, então concedê-la aqui libera o painel.
 *
 * Até 2026-11-10 os dois HTML apontavam para scripts que nunca existiram
 * (scripts/permission.js e scripts/camera-permission.js): o botão "Liberar" não
 * fazia nada e o painel esperava para sempre um 'permissionGranted'.
 *
 * Uso (um arquivo minúsculo por página chama isto):
 *   iniciarPaginaPermissao({ midia: 'microfone' | 'camera' })
 *
 * As dependências do navegador entram por `amb` para os testes rodarem em Node.
 */
'use strict';

const PERMISSAO_MIDIAS = {
  microfone: {
    nomePermissao: 'microphone',
    constraints: { audio: true },
    acaoPainel: 'permissionGranted',
    rotulo: 'microfone',
    artigo: 'o',
    liberado: 'Microfone liberado!',
    naoEncontrado: 'Nenhum microfone encontrado. Conecte um microfone e tente de novo.',
  },
  camera: {
    nomePermissao: 'camera',
    constraints: { video: true },
    acaoPainel: 'cameraPermissionGranted',
    rotulo: 'câmera',
    artigo: 'a',
    liberado: 'Câmera liberada!',
    naoEncontrado: 'Nenhuma câmera encontrada. Conecte uma câmera e tente de novo.',
  },
};

/** Mensagem para o médico a partir do erro do getUserMedia. */
function _mensagemErroPermissao(erro, cfg) {
  const nome = erro && erro.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return `Permissão negada. Clique no ícone à esquerda do endereço desta página, ` +
      `permita ${cfg.artigo} ${cfg.rotulo} e clique em "Liberar" de novo.`;
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return cfg.naoEncontrado;
  if (nome === 'NotReadableError' || nome === 'AbortError') {
    return `Não foi possível usar ${cfg.artigo} ${cfg.rotulo}: outro programa pode estar usando. Feche-o e tente de novo.`;
  }
  return `Não foi possível liberar ${cfg.artigo} ${cfg.rotulo}: ${(erro && erro.message) || nome || 'erro desconhecido'}`;
}

/**
 * @param {{ midia: 'microfone'|'camera' }} opcoes
 * @param {{ document, navigator, chrome, window }} [amb] — padrão: os globais do navegador
 * @returns {{ pedir: Function, fechar: Function }} (exposto para os testes)
 */
function iniciarPaginaPermissao(opcoes, amb) {
  const cfg = PERMISSAO_MIDIAS[opcoes && opcoes.midia];
  if (!cfg) throw new Error('mídia de permissão desconhecida: ' + (opcoes && opcoes.midia));

  const doc = (amb && amb.document) || document;
  const nav = (amb && amb.navigator) || navigator;
  const ext = (amb && amb.chrome) || (typeof chrome !== 'undefined' ? chrome : null);
  const win = (amb && amb.window) || window;

  const requestBtn = doc.getElementById('requestBtn');
  const statusEl   = doc.getElementById('status');
  const closeMsg   = doc.getElementById('closeMsg');
  const closeBtn   = doc.getElementById('closeBtn');
  const preview    = doc.getElementById('preview');       // só na página da câmera
  const video      = doc.getElementById('videoPreview');  // só na página da câmera

  let stream = null;

  function mostrarStatus(tipo, texto) {
    statusEl.className = 'status ' + tipo; // success | error | pending
    statusEl.textContent = texto;
  }

  function pararStream() {
    if (!stream) return;
    try { stream.getTracks().forEach(t => t.stop()); } catch (_e) { /* já parado */ }
    stream = null;
    if (video) video.srcObject = null;
  }

  function avisarPainel() {
    // Painel fechado = ninguém ouvindo: não é erro, ele confere a permissão ao abrir.
    try {
      const p = ext && ext.runtime && ext.runtime.sendMessage({ action: cfg.acaoPainel });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_e) { /* idem */ }
  }

  function marcarConcedida() {
    mostrarStatus('success', cfg.liberado);
    requestBtn.disabled = true;
    closeMsg.style.display = 'block';
    closeBtn.style.display = 'inline-flex';
    avisarPainel();
  }

  async function pedir() {
    requestBtn.disabled = true;
    mostrarStatus('pending', 'Aguardando sua resposta no aviso do navegador…');
    try {
      stream = await nav.mediaDevices.getUserMedia(cfg.constraints);
    } catch (erro) {
      mostrarStatus('error', _mensagemErroPermissao(erro, cfg));
      requestBtn.disabled = false;
      return false;
    }
    if (video && preview) {
      // Câmera: a prévia confirma que a imagem chega; a câmera só apaga ao fechar.
      video.srcObject = stream;
      preview.style.display = 'block';
    } else {
      // Microfone: nada a mostrar — soltar o dispositivo na hora.
      pararStream();
    }
    marcarConcedida();
    return true;
  }

  function fechar() {
    pararStream();
    // Aba aberta pela extensão: tabs.remove fecha sempre; window.close é a reserva.
    try {
      if (ext && ext.tabs && ext.tabs.getCurrent) {
        ext.tabs.getCurrent((tab) => {
          if (tab && tab.id != null) ext.tabs.remove(tab.id);
          else win.close();
        });
        return;
      }
    } catch (_e) { /* cai na reserva */ }
    win.close();
  }

  requestBtn.addEventListener('click', pedir);
  closeBtn.addEventListener('click', fechar);
  if (win.addEventListener) win.addEventListener('pagehide', pararStream);

  // Já concedida (ex.: a página foi aberta à toa): dizer logo, sem pedir clique.
  try {
    nav.permissions.query({ name: cfg.nomePermissao }).then((r) => {
      if (r && r.state === 'granted' && !stream) marcarConcedida();
    }).catch(() => {});
  } catch (_e) { /* navegador sem a consulta — o botão resolve */ }

  return { pedir, fechar };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { iniciarPaginaPermissao, PERMISSAO_MIDIAS, _mensagemErroPermissao };
}
