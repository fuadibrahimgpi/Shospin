/**
 * CONTENT SCRIPT — Núcleo: logger, IDs de fallback, utilitários de DOM/Froala e formatação.
 * Parte do content script dividido em src/content/*.js + src/content.js (carregados nesta
 * ordem, ver manifest.json e CONTENT_SCRIPT_FILES). Cada arquivo é uma IIFE (re-injeção segura)
 * e compartilha símbolos via window.__shospContent. Código inalterado.
 */
(function () {
"use strict";

// ============================================================================
// LOGGER
// ============================================================================

// Logs informativos desligados por padrão (evitam expor dados de paciente no console da página).
const CONTENT_DEBUG = false;

const contentLogger = {
  info: (msg, data) => CONTENT_DEBUG && console.log(`[Content] ℹ️ ${msg}`, data ?? ''),
  warn: (msg, data) => console.warn(`[Content] ⚠️ ${msg}`, data ?? ''),
  error: (msg, data) => console.error(`[Content] ❌ ${msg}`, data ?? ''),
  success: (msg, data) => CONTENT_DEBUG && console.log(`[Content] ✅ ${msg}`, data ?? ''),
  debug: (msg, data) => CONTENT_DEBUG && console.log(`[Content] 🔍 ${msg}`, data ?? '')
};

// ============================================================================
// FALLBACK IDS
// ============================================================================

const FALLBACK_IDS = {
  'tonometria.od': 'prontuario_resp_78726_260839',
  'tonometria.oe': 'prontuario_resp_78726_256484',
  'paquimetria.od': 'prontuario_resp_78726_260846',
  'paquimetria.oe': 'prontuario_resp_78726_260841',
  'refracao.od.esf': 'prontuario_resp_78074_259522',
  'refracao.od.cil': 'prontuario_resp_78074_259523',
  'refracao.od.eixo': 'prontuario_resp_78074_259524',
  'refracao.oe.esf': 'prontuario_resp_78074_259526',
  'refracao.oe.cil': 'prontuario_resp_78074_259527',
  'refracao.oe.eixo': 'prontuario_resp_78074_259528',
  'receitaOculos.od.esf': 'od_esferico',
  'receitaOculos.od.cil': 'od_cilindrico',
  'receitaOculos.od.eixo': 'od_eixo',
  'receitaOculos.oe.esf': 'oe_esferico',
  'receitaOculos.oe.cil': 'oe_cilindrico',
  'receitaOculos.oe.eixo': 'oe_eixo'
};

const TAB_IDS = {
  biomicroscopia: 'tdCadastro-78728',
  fundoscopia: 'tdCadastro-78727',
  glaucoma: 'tdCadastro-78726',
  refracao: 'tdCadastro-78074',
  conduta: 'tdCadastro-89707',
  receitas: 'tdCadastro-78735',
  atendimento: 'tdCadastro-78073',
  retorno: 'tdCadastro-80697'
};

const FIELD_INDICES = {
  primeiraConsulta: {
    hda: 2,
    medicacoes_em_uso: 3,
    antecedentes_oftalmologicos: 4,
    alteracoes_sistemicas: 5,
    antecedentes_familiares: 6
  },
  // Índices RELATIVOS dentro da aba Retorno (0-based após clickTab)
  // Não usar índice global — varia conforme o conteúdo da página
  retorno: {
    retorno: 0,
    uso: 1
  }
};

const TAB_LOAD_DELAY = 800;

// Helper robust para extrair número da aba (ID do serviço do banco de dados do SHOSP)
function extractTabNumber(tabId) {
  if (!tabId) return '';
  const match = String(tabId).match(/\d+/);
  return match ? match[0] : '';
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

async function waitForElement(selectorOrFn, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = typeof selectorOrFn === 'function' 
      ? selectorOrFn() 
      : document.querySelector(selectorOrFn);
    if (el) return el;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

function setInputValue(input, value) {
  if (!input) return false;
  
  const isTextarea = input.tagName && input.tagName.toLowerCase() === 'textarea';
  const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }
  
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  
  return true;
}

function _sanitizeFroalaText(value) {
  // Permite apenas <br> — remove qualquer outra tag HTML para evitar XSS
  // de respostas inesperadas da IA ou dados externos.
  return value.replace(/<(?!br\s*\/?>)[^>]+>/gi, '');
}

// Localiza o <textarea> fonte que o SHOSP submete para um dado editor Froala.
// Estrutura SHOSP: <div.botaoTextoPadrao> <label> <div.fr-box>…<div.fr-element>…
//                  <textarea.editorFroala id="prontuario_resp_<servico>_<campo>">.
// O textarea é irmão do .fr-box. Retorna null para editores que NÃO têm textarea
// (campos salvos via textoProntuario<num>, ex.: fundoscopia/receitas).
function _findFroalaSourceTextarea(frElement) {
  const box = frElement.closest('.fr-box');
  if (!box) return null;
  let sib = box.nextElementSibling;
  while (sib && sib.tagName !== 'TEXTAREA') sib = sib.nextElementSibling;
  if (sib && sib.tagName === 'TEXTAREA') return sib;
  const wrap = box.parentElement;
  return wrap ? wrap.querySelector('textarea.editorFroala, textarea[id^="prontuario_resp"]') : null;
}

// CRÍTICO (v5.1.4): o SHOSP salva lendo o <textarea> fonte (prontuario_resp_*),
// não o .fr-element visível. O Froala só sincroniza esse textarea na digitação
// REAL do usuário; nossa injeção sintética não dispara essa sync, então o
// textarea fica vazio e o campo é salvo em branco (causa do bug de Atendimento/
// Conduta/Retorno não salvarem). Aqui escrevemos o textarea diretamente.
function _syncFroalaSourceTextarea(frElement) {
  const ta = _findFroalaSourceTextarea(frElement);
  if (!ta) return false;
  const html = frElement.innerHTML;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(ta, html); else ta.value = html;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  contentLogger.debug(`[Froala] textarea fonte preenchido: ${ta.id || ta.name} (${html.length} chars)`);
  return true;
}

function setFroalaValue(element, value) {
  if (!element) return;

  element.focus();
  element.innerHTML = _sanitizeFroalaText(value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));

  // Preenche o textarea fonte que o SHOSP realmente salva.
  _syncFroalaSourceTextarea(element);

  setTimeout(() => {
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    // Reafirma após o blur, caso o Froala tenha re-sincronizado o textarea vazio.
    _syncFroalaSourceTextarea(element);
  }, 150);
}

// Escreve o valor no editor e no <textarea> fonte que o SHOSP salva.
// (Mantida como wrapper async para compatibilidade com os call sites que usam
// await; a persistência real é feita por setFroalaValue → _syncFroalaSourceTextarea.)
async function setFroalaValueSynced(element, value) {
  if (!element) return { ok: false, found: false, noElement: true };
  setFroalaValue(element, value);
  return { ok: true, found: true };
}

function highlightElement(element) {
  if (!element) return;
  
  const orig = {
    border: element.style.border,
    background: element.style.background,
    boxShadow: element.style.boxShadow,
    transition: element.style.transition
  };
  
  element.style.transition = 'all 0.3s ease';
  element.style.border = '2px solid #22c55e';
  element.style.background = '#f0fdf4';
  element.style.boxShadow = '0 0 10px rgba(34, 197, 94, 0.3)';
  
  setTimeout(() => {
    element.style.border = orig.border;
    element.style.background = orig.background;
    element.style.boxShadow = orig.boxShadow;
    element.style.transition = orig.transition;
  }, 2000);
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatEsf(value) {
  if (value === null || value === undefined) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  if (num === 0) return 'Plano';
  const formatted = num.toFixed(2).replace('.', ',');
  return num > 0 ? `+${formatted}` : formatted;
}

function formatCil(value) {
  if (value === null || value === undefined) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  if (num === 0) return '';
  return num.toFixed(2).replace('.', ',');
}

function parseRefEixo(value) {
  if (value === null || value === undefined) return null;
  
  let numValue;
  if (typeof value === 'number') {
    numValue = value;
  } else {
    const parsed = parseInt(String(value).replace('°', '').trim());
    if (isNaN(parsed)) return null;
    numValue = parsed;
  }
  
  let rounded = Math.round(numValue / 5) * 5;
  if (rounded < 5) rounded = 5;
  if (rounded > 180) rounded = 180;
  return rounded;
}

// ============================================================================
window.__shospContent = Object.assign(window.__shospContent || {}, { CONTENT_DEBUG, contentLogger, FALLBACK_IDS, TAB_IDS, FIELD_INDICES, TAB_LOAD_DELAY, extractTabNumber, waitForElement, setInputValue, _sanitizeFroalaText, _findFroalaSourceTextarea, _syncFroalaSourceTextarea, setFroalaValue, setFroalaValueSynced, highlightElement, formatEsf, formatCil, parseRefEixo });

})();
