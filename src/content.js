/**
 * CONTENT SCRIPT v5.1.4 — Injeção de dados nos campos do Shosp
 *
 * v5.1.4: Correção do salvamento de Atendimento/Conduta/Retorno. Causa raiz
 *   (confirmada por captura de rede): o SHOSP salva lendo o <textarea> oculto
 *   `prontuario_resp_<servico>_<campo>` que o Froala só sincroniza na digitação
 *   real. A injeção escrevia só o `.fr-element` visível, deixando o textarea
 *   vazio → o POST de autosave enviava o campo em branco. Agora setFroalaValue
 *   grava também esse textarea fonte. Campos via `textoProntuario<num>`
 *   (fundoscopia/receitas) já liam do `.fr-element` e seguem funcionando.
 *   (A ponte de mundo principal da v5.1.3 foi removida — não localizava as
 *   instâncias Froala e era desnecessária.)
 */
// IIFE: cria escopo próprio a cada re-injeção via executeScript,
// evitando SyntaxError de re-declaração de const/let no escopo global.
(function () {
"use strict";

// O listener é gerenciado via window.__shospMessageListener:
// remove o listener órfão (contexto anterior) e registra um novo a cada injeção.
// Isso permite recuperação via executeScript sem exigir F5 na aba do SHOSP.

// ============================================================================
// LOGGER
// ============================================================================

const contentLogger = {
  info: (msg, data) => console.log(`[Content] ℹ️ ${msg}`, data ?? ''),
  warn: (msg, data) => console.warn(`[Content] ⚠️ ${msg}`, data ?? ''),
  error: (msg, data) => console.error(`[Content] ❌ ${msg}`, data ?? ''),
  success: (msg, data) => console.log(`[Content] ✅ ${msg}`, data ?? ''),
  debug: (msg, data) => console.log(`[Content] 🔍 ${msg}`, data ?? '')
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
  // ── Refração ESTÁTICA (pós-dilatação) — mesma aba tdCadastro-78074 ──
  // Alvo preenchido em runtime por detecção dinâmica (bloco cujo rótulo casa
  // "estática"; ver _refractionBlockOf). Estes fallbacks só entram em cena se a
  // detecção falhar. Cole aqui os 6 IDs reais do bloco estática (dump do console
  // na aba Refração) e descomente — um ID errado injetaria no campo errado, por
  // isso ficam comentados até serem confirmados na página:
  // 'refracaoEstatica.od.esf':  'prontuario_resp_78074_XXXXXX',
  // 'refracaoEstatica.od.cil':  'prontuario_resp_78074_XXXXXX',
  // 'refracaoEstatica.od.eixo': 'prontuario_resp_78074_XXXXXX',
  // 'refracaoEstatica.oe.esf':  'prontuario_resp_78074_XXXXXX',
  // 'refracaoEstatica.oe.cil':  'prontuario_resp_78074_XXXXXX',
  // 'refracaoEstatica.oe.eixo': 'prontuario_resp_78074_XXXXXX',
  'receitaOculos.od.esf': 'od_esferico',
  'receitaOculos.od.cil': 'od_cilindrico',
  'receitaOculos.od.eixo': 'od_eixo',
  'receitaOculos.oe.esf': 'oe_esferico',
  'receitaOculos.oe.cil': 'oe_cilindrico',
  'receitaOculos.oe.eixo': 'oe_eixo'
};

// IDs conhecidos da refração DINÂMICA (alvo do OCR normal). Guarda de segurança:
// a detecção da estática NUNCA pode reclassificar um destes como estática — se a
// heurística de rótulo falhar, o pior caso deve ser "não injeta" (seguro), nunca
// gravar o grau dilatado no campo dinâmico errado. Ver _detectDynamicFields.
const DYNAMIC_REFRACTION_IDS = new Set([
  FALLBACK_IDS['refracao.od.esf'], FALLBACK_IDS['refracao.od.cil'], FALLBACK_IDS['refracao.od.eixo'],
  FALLBACK_IDS['refracao.oe.esf'], FALLBACK_IDS['refracao.oe.cil'], FALLBACK_IDS['refracao.oe.eixo'],
].filter(Boolean));

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
// FIELD DETECTOR
// ============================================================================

class ShospFieldDetector {
  constructor() {
    this.cache = new Map();
    this.tabCache = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    contentLogger.info('Iniciando detecção de campos...');
    
    // Initialize with known tab IDs
    for (const [name, id] of Object.entries(TAB_IDS)) {
      this.tabCache.set(name, id);
    }
    
    // Initialize with fallback field IDs
    for (const [path, id] of Object.entries(FALLBACK_IDS)) {
      this.cache.set(path, id);
    }
    
    // Try to detect dynamic IDs
    this._detectDynamicTabs();
    await this._detectDynamicFields();
    
    this.isInitialized = true;
    contentLogger.success(`Detecção concluída. ${this.cache.size} campos, ${this.tabCache.size} abas.`);
  }

  _detectDynamicTabs() {
    contentLogger.info('Iniciando detecção dinâmica de abas...');
    let tds = Array.from(document.querySelectorAll('td[id^="tdCadastro-"], [id*="tdCadastro"]'));

    const tabKeywords = {
      biomicroscopia: ['biomicroscopia', 'anterior', 'bio'],
      fundoscopia: ['fundoscopia', 'fundo', 'mapeamento'],
      glaucoma: ['glaucoma', 'pressão', 'pressao', 'tonometria'],
      refracao: ['refracao', 'refração', 'óculos', 'oculos', 'grau'],
      conduta: ['conduta', 'tratamento'],
      receitas: ['receitas', 'receita', 'receituário', 'receituario'],
      atendimento: ['atendimento', 'anamnese', 'história', 'clinica', 'clínica', 'geral'],
      retorno: ['retorno']
    };

    if (tds.length === 0) {
      // Sem elementos tdCadastro no DOM = prontuário não está aberto.
      // NÃO fazer fallback amplo — elementos da agenda, mensagens e popovers
      // contêm keywords como "retorno", "atendimento", "biomicroscopia" e
      // causam falsos positivos. O refresh() em injectAll() re-detecta
      // quando o prontuário efetivamente abrir.
      contentLogger.info('Nenhum elemento tdCadastro no DOM (prontuário não aberto). Usando mapeamento estático.');
      return;
    }

    for (const td of tds) {
      const id = td.id;
      if (!id) continue;
      // Limitar texto a 120 chars para evitar match em containers com texto
      // extenso (ex: conteúdo de editores Froala dentro da aba).
      const rawText = td.textContent?.toLowerCase().trim() || '';
      const text = rawText.slice(0, 120);
      if (!text) continue;

      for (const [name, keywords] of Object.entries(tabKeywords)) {
        if (keywords.some(kw => text.includes(kw))) {
          this.tabCache.set(name, id);
          contentLogger.success(`Aba "${name}" mapeada dinamicamente para ID: ${id} ("${text}")`);
          break;
        }
      }
    }
  }

  async _detectDynamicFields() {
    const inputs = document.querySelectorAll('input[id*="prontuario_resp" i], input[id*="esferico" i], input[id*="cilindrico" i], input[id*="eixo" i]');
    
    for (const input of inputs) {
      const id = input.id;
      if (!id) continue;

      const container = input.closest('.form-group, td, tr') || input.parentElement;
      if (!container) continue;
      
      const text = container.textContent?.toLowerCase() || '';
      
      // 1. Tonometria
      if (text.includes('tono') || text.includes('pressão') || text.includes('pressao')) {
        if (/\bod\b/.test(text) || text.includes('direito') || text.includes('dir.')) {
          this.cache.set('tonometria.od', id);
        } else if (/\boe\b/.test(text) || text.includes('esquerdo') || text.includes('esq.')) {
          this.cache.set('tonometria.oe', id);
        }
      }

      // 2. Paquimetria
      if (text.includes('paqui') || text.includes('espessura')) {
        if (/\bod\b/.test(text) || text.includes('direito') || text.includes('dir.')) {
          this.cache.set('paquimetria.od', id);
        } else if (/\boe\b/.test(text) || text.includes('esquerdo') || text.includes('esq.')) {
          this.cache.set('paquimetria.oe', id);
        }
      }

      // 3. Refração / Receita Óculos
      if (text.includes('esf') || text.includes('cil') || text.includes('eixo')) {
        const isOd = /\bod\b/.test(text) || text.includes('direito') || text.includes('dir.') || id.includes('od_') || id.startsWith('od');
        const isOe = /\boe\b/.test(text) || text.includes('esquerdo') || text.includes('esq.') || id.includes('oe_') || id.startsWith('oe');
        
        if (isOd || isOe) {
          const eye = isOd ? 'od' : 'oe';
          let fieldType = null;
          if (text.includes('esf') || id.includes('esfer')) fieldType = 'esf';
          else if (text.includes('cil') || id.includes('cilind')) fieldType = 'cil';
          else if (text.includes('eixo')) fieldType = 'eixo';
          
          if (fieldType) {
            const isReceita = text.includes('receita') || text.includes('prescrição') || text.includes('prescricao') || id.includes('esferico') || id.includes('cilindrico') || id.includes('eixo') && (id.startsWith('od') || id.startsWith('oe'));
            // Fora da receita, o campo pode pertencer ao bloco Refração DINÂMICA
            // (padrão, alvo do OCR normal) ou ao bloco Refração ESTÁTICA
            // (pós-dilatação). _refractionBlockOf decide pelo rótulo do bloco.
            let prefix = isReceita ? 'receitaOculos' : this._refractionBlockOf(input);
            // Guarda de segurança: um ID sabidamente dinâmico jamais vira estática
            // (evita gravar o grau dilatado no campo dinâmico se o rótulo enganar).
            if (prefix === 'refracaoEstatica' && DYNAMIC_REFRACTION_IDS.has(id)) {
              prefix = 'refracao';
            }
            this.cache.set(`${prefix}.${eye}.${fieldType}`, id);
          }
        }
      }
    }
  }

  /**
   * Decide a qual bloco de refração um campo esf/cil/eixo pertence, subindo a
   * árvore até achar o rótulo de bloco mais próximo. "estát*" → estática
   * (pós-dilatação); "dinâm*" ou nenhum → dinâmica (padrão, alvo do OCR normal,
   * preservando o comportamento anterior). Só considera rótulos curtos para não
   * casar com blobs de texto de containers grandes (que englobam os dois blocos).
   * @param {Element} input
   * @returns {'refracao'|'refracaoEstatica'}
   */
  _refractionBlockOf(input) {
    let node = input;
    for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
      // 1) cabeçalho estrutural dentro do container atual
      const heads = node.querySelectorAll
        ? node.querySelectorAll('legend, caption, th, h3, h4, h5, .titulo, .title, [class*="titulo" i]')
        : [];
      for (const h of heads) {
        const t = (h.textContent || '').trim();
        if (!t || t.length > 60) continue; // ignora blocos de texto longos
        if (/est[aá]t/i.test(t)) return 'refracaoEstatica';
        if (/din[aâ]m/i.test(t)) return 'refracao';
      }
      // 2) rótulo solto imediatamente antes deste container
      let sib = node.previousElementSibling;
      for (let j = 0; j < 3 && sib; j++, sib = sib.previousElementSibling) {
        const t = (sib.textContent || '').trim();
        if (!t || t.length > 60) continue;
        if (/est[aá]t/i.test(t)) return 'refracaoEstatica';
        if (/din[aâ]m/i.test(t)) return 'refracao';
      }
    }
    return 'refracao'; // padrão seguro: dinâmica
  }

  /**
   * Dump ESTRUTURAL dos campos de refração no DOM: id, name, placeholder, o bloco
   * que _refractionBlockOf atribui a cada um e os rótulos curtos dos 7 ancestrais
   * mais próximos. NUNCA lê .value — nenhum dado de paciente sai da página.
   *
   * Existe porque `refracaoEstatica.*` é o único grupo sem IDs em FALLBACK_IDS e
   * depende inteiramente da heurística de rótulo contra um DOM nunca inspecionado.
   * Quando a injeção estática não preenche nada, este dump é a resposta: mostra se
   * existe um segundo bloco de esf/cil/eixo, quais são seus IDs e se algum rótulo
   * ancestral contém "estát" (isto é, se a heurística tinha chance de acertar).
   * @returns {Array<{id:string,name:string|null,ph:string|null,bloco:string,labels:string[]}>}
   */
  dumpRefractionCandidates() {
    const inputs = document.querySelectorAll('input[id*="prontuario_resp" i], input[id*="esferico" i], input[id*="cilindrico" i], input[id*="eixo" i]');
    return Array.from(inputs).map(input => {
      const labels = [];
      let node = input;
      for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
        if (!node.querySelectorAll) continue;
        for (const h of node.querySelectorAll('legend, caption, th, h3, h4, h5, label, .titulo, .title, b, strong')) {
          const t = (h.textContent || '').trim();
          if (t && t.length <= 60) labels.push(t);
        }
      }
      return {
        id: input.id,
        name: input.name || null,
        ph: input.placeholder || null,
        bloco: this._refractionBlockOf(input),
        labels: Array.from(new Set(labels)).slice(0, 8)
      };
    });
  }

  getTabId(tabName) {
    return this.tabCache.get(tabName) || TAB_IDS[tabName] || null;
  }

  getFieldId(fieldPath) {
    if (this.cache.has(fieldPath)) {
      return this.cache.get(fieldPath);
    }
    return FALLBACK_IDS[fieldPath] || null;
  }

  getFullMapping() {
    return {
      tonometria: {
        od: this.getFieldId('tonometria.od'),
        oe: this.getFieldId('tonometria.oe')
      },
      paquimetria: {
        od: this.getFieldId('paquimetria.od'),
        oe: this.getFieldId('paquimetria.oe')
      },
      refracao: {
        od: {
          esf: this.getFieldId('refracao.od.esf'),
          cil: this.getFieldId('refracao.od.cil'),
          eixo: this.getFieldId('refracao.od.eixo')
        },
        oe: {
          esf: this.getFieldId('refracao.oe.esf'),
          cil: this.getFieldId('refracao.oe.cil'),
          eixo: this.getFieldId('refracao.oe.eixo')
        }
      }
    };
  }

  async refresh() {
    this.cache.clear();
    this.tabCache.clear();
    this.isInitialized = false;
    await this.initialize();
  }

  getCacheStats() {
    return {
      fieldCount: this.cache.size,
      tabCount: this.tabCache.size,
      fields: Array.from(this.cache.keys())
    };
  }
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
// SHOSP INJECTOR
// ============================================================================

class ShospInjector {
  constructor(detector) {
    this.detector = detector;
  }

  async clickTab(tabId) {
    const tabNumber = extractTabNumber(tabId);
    const tab = document.getElementById(tabId) ||
                document.querySelector(`[id*="${tabNumber || tabId}"]`);

    if (!tab) {
      contentLogger.warn(`Tab não encontrada: ${tabId}`);
      return false;
    }

    tab.click();

    // v5.1: substitui setTimeout(800) fixo por espera ativa pelo container
    // específico da aba (divTextoProntuarioServico<num>). Se aparecer antes
    // do teto (TAB_LOAD_DELAY), prossegue imediatamente — reduzindo latência
    // em máquinas rápidas e dando margem em máquinas lentas.
    const containerSelector = `[id*="divTextoProntuarioServico${tabNumber}"]`;
    const start = Date.now();
    const POLL = 80;
    while (Date.now() - start < TAB_LOAD_DELAY) {
      const container = document.querySelector(containerSelector);
      if (container && container.offsetParent !== null) {
        // Pequena margem para o conteúdo dentro do container terminar de montar
        await new Promise(r => setTimeout(r, 120));
        return true;
      }
      await new Promise(r => setTimeout(r, POLL));
    }
    // Timeout: prossegue mesmo assim — comportamento histórico era seguir após
    // 800ms cego, então não pioramos nada para o caso em que o seletor não casa.
    return true;
  }

  openSection(sectionName) {
    const sectionMappings = {
      'Atendimento': 'tdCadastro-78073',
      'Refração': 'tdCadastro-78074',
      'Glaucoma': 'tdCadastro-78726',
      'Fundoscopia': 'tdCadastro-78727',
      'Biomicroscopia': 'tdCadastro-78728',
      'Receitas': 'tdCadastro-78735',
      'Retorno': 'tdCadastro-80697',
      'Conduta': 'tdCadastro-89707'
    };

    const tabId = this.detector.getTabId(sectionName.toLowerCase()) || 
                  sectionMappings[sectionName];
    
    if (tabId) {
      const tab = document.getElementById(tabId);
      if (tab) tab.click();
    }
  }

  getEditorByIndex(index) {
    const frBoxes = document.querySelectorAll('.fr-box');
    if (index >= 0 && index < frBoxes.length) {
      return frBoxes[index].querySelector('.fr-element.fr-view');
    }
    return null;
  }



  async injectSingleField(fieldName, value, tipoConsulta) {
    const index = FIELD_INDICES[tipoConsulta]?.[fieldName];
    if (index === undefined) return false;

    let editor;

    // Para campos de retorno: usar índice relativo dentro da aba já ativa
    if (tipoConsulta === 'retorno') {
      const retornoTabId = this.detector.getTabId('retorno');
      if (retornoTabId) {
        const tabNumber = extractTabNumber(retornoTabId);
        const frElements = this.findFrElementsInTab(tabNumber);
        editor = frElements[index] || null;
      }
      // Fallback 1: Buscar por label
      if (!editor) {
        const labels = {
          retorno: 'retorno',
          uso: 'uso'
        };
        const labelText = labels[fieldName];
        if (labelText) {
          editor = this.findEditorByLabel(labelText, index);
        }
      }
      // Fallback 2: índice global se não encontrou via aba/label
      if (!editor) editor = this.getEditorByIndex(index);
    } else if (tipoConsulta === 'primeiraConsulta') {
      const atendimentoTabId = this.detector.getTabId('atendimento');
      if (atendimentoTabId) {
        const tabNumber = extractTabNumber(atendimentoTabId);
        const frElements = this.findFrElementsInTab(tabNumber);
        // Os índices em FIELD_INDICES.primeiraConsulta são 2, 3, 4, 5, 6.
        // Mapeamos para 0, 1, 2, 3, 4 usando index - 2.
        const relativeIndex = index - 2;
        editor = frElements[relativeIndex] || null;
        if (editor) {
          contentLogger.debug(`[injectSingleField] Editor para ${fieldName} encontrado via índice relativo ${relativeIndex} na aba Atendimento`);
        }
      }
      // Fallback 1: Buscar por label
      if (!editor) {
        const labels = {
          hda: 'hda',
          medicacoes_em_uso: 'medicaç',
          antecedentes_oftalmologicos: 'oftal',
          alteracoes_sistemicas: 'sistem',
          antecedentes_familiares: 'famil'
        };
        const labelText = labels[fieldName];
        if (labelText) {
          editor = this.findEditorByLabel(labelText, index - 2);
        }
      }
      // Fallback 2: índice global se não encontrou
      if (!editor) editor = this.getEditorByIndex(index);
    } else {
      editor = this.getEditorByIndex(index);
    }

    if (!editor) {
      contentLogger.warn(`Editor não encontrado para ${fieldName} (índice ${index}, tipo=${tipoConsulta})`);
      return false;
    }

    await setFroalaValueSynced(editor, value);
    highlightElement(editor);
    return true;
  }

  /**
   * Identifies an editor by looking for specific label text in its parent container.
   * This is robust against SHOSP hiding/showing multiple tabs and indices shifting.
   */
  findEditorByLabel(labelText, fallbackIndex) {
    const allBoxes = Array.from(document.querySelectorAll('.fr-box'));
    const lowerLabel = labelText.toLowerCase();

    // Helper to check if element is actually visible to the user
    const isVisible = (el) => {
      if (!el.offsetParent) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top > -5000 && rect.left > -5000;
    };

    const visibleBoxes = allBoxes.filter(isVisible);

    // 1. Search in visible boxes by label
    for (const box of visibleBoxes) {
      const container = box.closest('.form-group') || box.closest('td') || box.parentElement;
      if (container && container.textContent.toLowerCase().includes(lowerLabel)) {
        contentLogger.info(`Editor encontrado por label visível: ${labelText}`);
        return box.querySelector('.fr-element.fr-view');
      }
    }

    // 2. Fallback to visible boxes by relative index (assumes we just clicked the tab)
    if (visibleBoxes.length > 0 && fallbackIndex !== undefined && fallbackIndex < visibleBoxes.length) {
      contentLogger.info(`Editor encontrado por índice visível para ${labelText}: ${fallbackIndex}`);
      return visibleBoxes[fallbackIndex].querySelector('.fr-element.fr-view');
    }

    // 3. Absolute fallback to global array by index
    if (fallbackIndex !== undefined && allBoxes.length > fallbackIndex) {
      contentLogger.warn(`Caindo em fallback global por índice para ${labelText}: ${fallbackIndex}`);
      return allBoxes[fallbackIndex].querySelector('.fr-element.fr-view');
    }

    return null;
  }

  async fillOdOeInputs(tabName, fieldType, data) {
    const tabId = this.detector.getTabId(tabName);
    if (tabId && !(await this.clickTab(tabId))) return false;

    let filled = false;

    for (const eye of ['od', 'oe']) {
      const value = data[eye];
      if (value !== null && value !== undefined) {
        const fieldId = this.detector.getFieldId(`${fieldType}.${eye}`);
        if (!fieldId) continue;

        const input = await waitForElement(() => document.getElementById(fieldId), 2000);
        if (input) {
          setInputValue(input, value);
          highlightElement(input);
          filled = true;
        }
      }
    }

    return filled;
  }

  async fillRefractionFields(tabName, fieldType, data) {
    const tabId = this.detector.getTabId(tabName);
    if (tabId && !(await this.clickTab(tabId))) return false;

    let filled = false;

    for (const eye of ['od', 'oe']) {
      const eyeData = data[eye];
      if (!eyeData) {
        // [CORREÇÃO CLÍNICA] Se o olho for nulo (ex: olho cego), limpar os campos
        // para evitar que graus de consultas antigas permaneçam residuais na tela.
        const esfFieldId = this.detector.getFieldId(`${fieldType}.${eye}.esf`);
        const cilFieldId = this.detector.getFieldId(`${fieldType}.${eye}.cil`);
        const eixoFieldId = this.detector.getFieldId(`${fieldType}.${eye}.eixo`);
        
        if (esfFieldId) { const input = await waitForElement(() => document.getElementById(esfFieldId), 200); if (input) setInputValue(input, ''); }
        if (cilFieldId) { const input = await waitForElement(() => document.getElementById(cilFieldId), 200); if (input) setInputValue(input, ''); }
        if (eixoFieldId) { const input = await waitForElement(() => document.getElementById(eixoFieldId), 200); if (input) setInputValue(input, ''); }
        continue;
      }

      // ESF
      if (eyeData.esf !== null && eyeData.esf !== undefined) {
        const fieldId = this.detector.getFieldId(`${fieldType}.${eye}.esf`);
        if (fieldId) {
          const input = await waitForElement(() => document.getElementById(fieldId), 2000);
          if (input) {
            setInputValue(input, formatEsf(eyeData.esf));
            highlightElement(input);
            filled = true;
          }
        }
      }

      // CIL
      if (eyeData.cil !== null && eyeData.cil !== undefined) {
        const fieldId = this.detector.getFieldId(`${fieldType}.${eye}.cil`);
        if (fieldId) {
          const input = await waitForElement(() => document.getElementById(fieldId), 2000);
          if (input) {
            setInputValue(input, formatCil(eyeData.cil));
            highlightElement(input);
            filled = true;
          }
        }
      }

      // EIXO
      const cilValue = eyeData.cil !== null ? parseFloat(String(eyeData.cil)) : null;
      if (cilValue !== null && cilValue !== 0 && eyeData.eixo !== null && eyeData.eixo !== undefined) {
        const fieldId = this.detector.getFieldId(`${fieldType}.${eye}.eixo`);
        if (fieldId) {
          const input = await waitForElement(() => document.getElementById(fieldId), 2000);
          if (input) {
            const eixoValue = parseRefEixo(eyeData.eixo);
            setInputValue(input, eixoValue !== null ? String(eixoValue) : String(eyeData.eixo));
            highlightElement(input);
            filled = true;
          }
        }
      }
    }

    return filled;
  }

  async injectExamesNormais(data) {
    let success = false;

    // Biomicroscopia — só injeta se o dado for fornecido.
    // Pode vir null quando o diagnóstico afirma achado de segmento anterior e não há
    // texto descrito: nesse caso o campo fica VAZIO para o médico redigir, em vez de
    // receber o template normal que contradiria o diagnóstico (log 2026-07-29).
    const bioTabId = data.biomicroscopia ? this.detector.getTabId('biomicroscopia') : null;
    if (bioTabId && (await this.clickTab(bioTabId))) {
      const tabNumber = extractTabNumber(bioTabId);
      // Polling: aguarda editores Froala inicializarem após o container aparecer
      let frElements = [];
      for (let w = 0; w < 3000; w += 150) {
        frElements = this.findFrElementsInTab(tabNumber);
        if (frElements.length > 0) break;
        await new Promise(r => setTimeout(r, 150));
      }

      if (frElements.length > 0) {
        const bioText = data.biomicroscopia.replace(/\n/g, '<br>');
        await setFroalaValueSynced(frElements[0], bioText);
        highlightElement(frElements[0]);
        success = true;
        contentLogger.success('Biomicroscopia injetada');
      } else {
        contentLogger.warn('Editor Froala para Biomicroscopia não encontrado.');
      }
    }

    // Fundoscopia — só injeta se o dado for fornecido
    if (data.fundoscopia) {
      const fundoTabId = this.detector.getTabId('fundoscopia');
      if (fundoTabId && (await this.clickTab(fundoTabId))) {
        const tabNumber = extractTabNumber(fundoTabId);
        let frElements = [];
        for (let w = 0; w < 3000; w += 150) {
          frElements = this.findFrElementsInTab(tabNumber);
          if (frElements.length > 0) break;
          await new Promise(r => setTimeout(r, 150));
        }
        if (frElements.length > 0) {
          const fundoText = data.fundoscopia.replace(/\n/g, '<br>');
          await setFroalaValueSynced(frElements[0], fundoText);
          highlightElement(frElements[0]);
          success = true;
          contentLogger.success('Fundoscopia injetada');
        } else {
          contentLogger.warn('Editor Froala para Fundoscopia não encontrado.');
        }
      }
    } else {
      contentLogger.info('Fundoscopia não mencionada — campo não injetado.');
    }

    return success;
  }

  /**
   * Encontra editores Froala dentro de uma aba específica pelo número da aba.
   * Esta é a lógica robusta do v4 que funciona corretamente.
   *
   * v5.1: o fallback "todos .fr-box visíveis ordenados por Y" agora é OPT-IN
   * via parâmetro `{ allowYPositionFallback: true }`. Por padrão, retorna
   * array vazio quando não consegue identificar o container correto da aba —
   * forçando quem chamou a tomar decisão explícita (abortar com erro vs.
   * arriscar escrever no editor errado). O fallback original tinha potencial
   * de injetar texto no editor de outra aba quando duas abas estavam
   * simultaneamente visíveis (raro, mas catastrófico clinicamente).
   */
  findFrElementsInTab(tabNumber, options = {}) {
    const allowYPositionFallback = options.allowYPositionFallback === true;

    const isVisible = (el) => {
      if (!el.offsetParent) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    };

    let numTab = tabNumber;
    if (isNaN(parseInt(tabNumber, 10))) {
      const defaultMapping = {
        biomicroscopia: '78728',
        fundoscopia: '78727',
        glaucoma: '78726',
        refracao: '78074',
        conduta: '89707',
        receitas: '78735',
        atendimento: '78073',
        anamnese: '78073',
        retorno: '80697'
      };
      numTab = defaultMapping[tabNumber.toLowerCase()] || tabNumber;
    }

    // 1. Tentar encontrar pelo container principal da aba (divTextoProntuarioServico)
    const specificDiv = document.querySelector(`[id*="divTextoProntuarioServico${numTab}"]`);
    if (specificDiv) {
      const elements = Array.from(specificDiv.querySelectorAll('.fr-element'));
      if (elements.length > 0) {
        contentLogger.debug(`[Tab ${tabNumber}] ${elements.length} editor(es) via divTextoProntuarioServico`);
        return elements;
      }
    }

    // 2. Qualquer container com tabNumber ou numTab no ID (exceto o próprio tdCadastro que é o header)
    const candidates = Array.from(document.querySelectorAll(`[id*="${numTab}"], [id*="${tabNumber}"]`))
      .filter(el => !el.id.startsWith('tdCadastro'));
    for (const container of candidates) {
      const elements = Array.from(container.querySelectorAll('.fr-element'));
      if (elements.length > 0) {
        contentLogger.debug(`[Tab ${tabNumber}] ${elements.length} editor(es) via container ${container.id}`);
        return elements;
      }
    }

    // 3. Fallback Y-position — somente se explicitamente autorizado.
    if (!allowYPositionFallback) {
      contentLogger.error(`[Tab ${tabNumber}] Container da aba não encontrado e fallback Y-position desativado — abortando.`);
      return [];
    }

    const allVisible = Array.from(document.querySelectorAll('.fr-box'))
      .filter(box => isVisible(box))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map(box => box.querySelector('.fr-element'))
      .filter(Boolean);

    if (allVisible.length > 0) {
      contentLogger.warn(`[Tab ${tabNumber}] Fallback Y-position autorizado: ${allVisible.length} editor(es) visíveis (use com cautela)`);
    }
    return allVisible;
  }

  async injectConduta(data) {
    const tabId = this.detector.getTabId('conduta');
    if (!tabId || !(await this.clickTab(tabId))) return false;

    // Diagnóstico (CID) é tratado exclusivamente pelo handleSearchCid no sidepanel.
    // Não escrever no #nomeCid aqui — o autocomplete jQuery do SHOSP reage ao
    // evento input/change e selecionaria o CID antes do searchCid, causando duplicata.

    // Espera ativa pelos editores Froala – aguarda pelo menos 1 editor por até 4s
    // CORREÇÃO: não bloquear em 2 editores; injetar conduta assim que 1 aparecer,
    // depois tentar tratamento com espera adicional se necessário.
    const tabNumber = extractTabNumber(tabId);
    let frElements = [];
    const MAX_WAIT_MS = 4000;
    const POLL_MS = 200;
    let waited = 0;

    while (waited < MAX_WAIT_MS) {
      frElements = this.findFrElementsInTab(tabNumber);
      if (frElements.length >= 1) break;
      await new Promise(r => setTimeout(r, POLL_MS));
      waited += POLL_MS;
    }

    if (frElements.length === 0) {
      contentLogger.warn('Nenhum editor Froala encontrado na aba Conduta após espera');
      return false;
    }

    contentLogger.debug(`Encontrados ${frElements.length} editores Froala na aba ${tabNumber} (após ${waited}ms)`);
    let successCount = 0;

    // Primeiro editor: Conduta
    if (data.conduta && frElements.length > 0) {
      const condutaText = data.conduta.replace(/\n/g, '<br>');
      await setFroalaValueSynced(frElements[0], condutaText);
      highlightElement(frElements[0]);
      successCount++;
      contentLogger.success('Campo Conduta injetado');
    }

    // Segundo editor: Tratamento/Receita
    // Se ainda não há 2 editores, aguarda mais 2s antes de desistir
    if (data.tratamento) {
      if (frElements.length < 2) {
        const EXTRA_WAIT = 2000;
        let extraWaited = 0;
        while (extraWaited < EXTRA_WAIT) {
          frElements = this.findFrElementsInTab(tabNumber);
          if (frElements.length >= 2) break;
          await new Promise(r => setTimeout(r, POLL_MS));
          extraWaited += POLL_MS;
        }
      }
      if (frElements.length > 1) {
        const tratamentoText = data.tratamento.replace(/\n/g, '<br>');
        await setFroalaValueSynced(frElements[1], tratamentoText);
        highlightElement(frElements[1]);
        successCount++;
        contentLogger.success('Campo Tratamento injetado');
      } else {
        contentLogger.warn(`Tratamento não injetado: apenas ${frElements.length} editor(es) encontrado(s) na aba Conduta`);
      }
    }

    return successCount > 0;
  }

  /**
   * Injeta o diagnóstico em campos de texto simples (input/textarea/select)
   * ou em editores Froala identificados pelo label "diagnóstico"/"CID".
   */
  _injectDiagnosticoField(value) {
    // 1. Procurar por ID/Name explícito — não exige offsetParent pois após clickTab
    //    o container da aba pode existir no DOM antes do layout resolver completamente.
    const directInput = document.getElementById('nomeCid')
      || document.querySelector('input[name="diagnostico"]')
      || document.querySelector('input[name="nomeCid"]');
    if (directInput) {
      directInput.value = value;
      directInput.dispatchEvent(new Event('input', { bubbles: true }));
      directInput.dispatchEvent(new Event('change', { bubbles: true }));
      highlightElement(directInput);
      return true;
    }

    // 2. Procurar input/textarea com label contendo "diagnóst" ou "cid"
    //    Tenta visíveis primeiro, depois qualquer um no DOM (pois o layout pode
    //    ainda não ter resolvido offsetParent após o clickTab).
    const allInputs = Array.from(document.querySelectorAll('input[type="text"], textarea'));
    const byVisibility = [
      ...allInputs.filter(i => i.offsetParent),
      ...allInputs.filter(i => !i.offsetParent)
    ];
    for (const input of byVisibility) {
      const container = input.closest('.form-group, td, tr, div') || input.parentElement;
      const labelText = (container?.textContent || '').toLowerCase();
      if (labelText.includes('diagn') || labelText.includes('cid')) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(input);
        return true;
      }
    }

    // 3. Procurar editor Froala identificado pelo label
    const editor = this.findEditorByLabel('diagnóst', undefined) ||
                   this.findEditorByLabel('diagnostico', undefined) ||
                   this.findEditorByLabel('cid', undefined);
    if (editor) {
      setFroalaValue(editor, value);
      highlightElement(editor);
      return true;
    }

    return false;
  }

  async injectAll(data) {
    contentLogger.info('Iniciando injeção de dados');
    let fieldsInjected = 0;
    // v5.1: lista de avisos retornada ao popup para que o usuário veja quais
    // campos não puderam ser preenchidos com confiança (em vez de só sumir).
    const warnings = [];

    // Forçar atualização do detector antes de cada injeção para parear com o DOM atualizado da SPA
    await this.detector.refresh();

    // Open section
    if (data.audio) {
      const sectionMap = {
        'conclusao': 'conduta',
        'retorno': 'retorno',
        'primeira_consulta': 'atendimento'
      };
      let sectionName = sectionMap[data.audio.tipo] || 'atendimento';

      // Fase pós-dilatação: se não há campos de anamnese para injetar em
      // primeira_consulta, NÃO re-abrir a aba atendimento — o clique nela causa
      // re-renderização dos editores Froala pelo SHOSP, apagando os dados
      // injetados na fase 1. injectConduta() abre a aba conduta por conta própria.
      if (data.audio.tipo === 'primeira_consulta') {
        const hasAnamnese = !!(data.audio.hda || data.audio.medicacoes_em_uso ||
          data.audio.antecedentes_oftalmologicos || data.audio.alteracoes_sistemicas ||
          data.audio.antecedentes_familiares);
        if (!hasAnamnese) {
          contentLogger.info('Fase pós-dilatação sem anamnese — aba atendimento não re-aberta para preservar dados da fase 1.');
          sectionName = null;
        }
      }

      if (sectionName) {
        const tabId = this.detector.getTabId(sectionName);
        if (tabId) {
          contentLogger.info(`Abrindo aba de áudio: ${sectionName} (${tabId})`);
          const tabOpened = await this.clickTab(tabId);
          if (!tabOpened) {
            warnings.push(`Não foi possível abrir a aba "${sectionName}" (${tabId})`);
          }
        } else {
          contentLogger.warn(`Aba de áudio não mapeada/encontrada para: ${sectionName}`);
          warnings.push(`Aba não mapeada/encontrada para: ${sectionName}`);
          // Fallback histórico
          this.openSection(sectionName.charAt(0).toUpperCase() + sectionName.slice(1));
          await new Promise(r => setTimeout(r, TAB_LOAD_DELAY));
        }
      }
    }

    // Inject audio data
    if (data.audio) {
      const tipo = data.audio.tipo;

      if (tipo === 'primeira_consulta') {
        // Polling: aguarda editores Froala da aba atendimento inicializarem.
        // clickTab confirma apenas que o container apareceu; os editores Froala
        // podem levar ciclos extras para serem montados pelo SHOSP.
        const _atenTabId = this.detector.getTabId('atendimento');
        if (_atenTabId) {
          const _atenNum = extractTabNumber(_atenTabId);
          for (let w = 0; w < 3000; w += 150) {
            if (this.findFrElementsInTab(_atenNum).length > 0) break;
            await new Promise(r => setTimeout(r, 150));
          }
        }

        const fields = ['hda', 'medicacoes_em_uso', 'antecedentes_oftalmologicos', 'alteracoes_sistemicas', 'antecedentes_familiares'];
        for (const field of fields) {
          const value = data.audio[field];
          if (!value) continue;
          if (await this.injectSingleField(field, value, 'primeiraConsulta')) {
            fieldsInjected++;
          } else {
            warnings.push(`Campo "${field}" não foi injetado (editor não encontrado)`);
          }
        }
      } else if (tipo === 'retorno') {
        // Polling: aguarda editores Froala da aba retorno inicializarem.
        const _retTabId = this.detector.getTabId('retorno');
        if (_retTabId) {
          const _retNum = extractTabNumber(_retTabId);
          for (let w = 0; w < 3000; w += 150) {
            if (this.findFrElementsInTab(_retNum).length > 0) break;
            await new Promise(r => setTimeout(r, 150));
          }
        }

        if (data.audio.retorno) {
          if (await this.injectSingleField('retorno', data.audio.retorno, 'retorno')) fieldsInjected++;
          else warnings.push('Campo "retorno" não foi injetado (editor não encontrado)');
        }
        if (data.audio.uso) {
          if (await this.injectSingleField('uso', data.audio.uso, 'retorno')) fieldsInjected++;
          else warnings.push('Campo "uso" não foi injetado (editor não encontrado)');
        }
      }

      // Conduta e tratamento (diagnóstico/CID é tratado pelo handleSearchCid no sidepanel)
      if (data.audio.conduta || data.audio.tratamento) {
        if (await this.injectConduta({
          conduta: data.audio.conduta,
          tratamento: data.audio.tratamento
        })) {
          fieldsInjected++;
        } else {
          warnings.push('Conduta/tratamento não foram injetados');
        }
      }
    }

    // Inject exames normais
    if (data.examesNormais) {
      if (await this.injectExamesNormais(data.examesNormais)) {
        fieldsInjected++;
      } else {
        warnings.push('Biomicroscopia/fundoscopia não foram injetadas');
      }
    }

    // Inject exam data (camera)
    if (data.exames) {
      if (data.exames.tonometria) {
        if (await this.fillOdOeInputs('glaucoma', 'tonometria', data.exames.tonometria)) {
          fieldsInjected++;
        }
      }
      if (data.exames.paquimetria) {
        if (await this.fillOdOeInputs('glaucoma', 'paquimetria', data.exames.paquimetria)) {
          fieldsInjected++;
        }
      }
      if (data.exames.refracao) {
        // Receitas ANTES da refração: clicar na aba Receitas após preencher Refração
        // causava re-inicialização dos campos e apagava os valores injetados.
        if (data.exames.injectReceita !== false) {
          await this.fillRefractionFields('receitas', 'receitaOculos', data.exames.refracao);
        }
        // Refração sempre por último — nada mais navega para outra aba depois.
        if (await this.fillRefractionFields('refracao', 'refracao', data.exames.refracao)) {
          fieldsInjected++;
        }
      }
    }

    // ── Verificação de persistência (fonte real do save) ──
    // Lê o que o SHOSP de fato submete: para abas com <textarea> oculto
    // (prontuario_resp_*), confere o .value do textarea; para abas via
    // textoProntuario<num> (sem textarea), confere o texto do .fr-element.
    // Se a fonte do save estiver vazia, o campo será salvo em branco — avisa
    // em vez de reportar "sucesso" silencioso (bug histórico de atendimento/
    // conduta sumindo no fim da consulta).
    const verifyTargets = [];
    if (data.audio) {
      if (data.audio.tipo === 'primeira_consulta' &&
          (data.audio.hda || data.audio.medicacoes_em_uso || data.audio.antecedentes_oftalmologicos ||
           data.audio.alteracoes_sistemicas || data.audio.antecedentes_familiares)) {
        verifyTargets.push({ label: 'Atendimento', num: '78073' });
      }
      if (data.audio.tipo === 'retorno' && (data.audio.retorno || data.audio.uso)) {
        verifyTargets.push({ label: 'Retorno', num: '80697' });
      }
      if (data.audio.conduta || data.audio.tratamento) {
        verifyTargets.push({ label: 'Conduta', num: '89707' });
      }
    }
    if (data.examesNormais) {
      if (data.examesNormais.biomicroscopia) verifyTargets.push({ label: 'Biomicroscopia', num: '78728' });
      if (data.examesNormais.fundoscopia) verifyTargets.push({ label: 'Fundoscopia', num: '78727' });
    }

    for (const t of verifyTargets) {
      const container = document.querySelector(`[id*="divTextoProntuarioServico${t.num}"]`);
      if (!container) {
        contentLogger.warn(`[Verify] ${t.label}: aba não está no DOM — não verificável agora`);
        continue;
      }
      const tas = Array.from(container.querySelectorAll('textarea[id^="prontuario_resp"]'));
      let saveText = '';
      let mechanism = '';
      if (tas.length) {
        mechanism = 'textarea';
        saveText = tas.map(ta => (ta.value || '').replace(/<[^>]*>/g, '').replace(/ /g, ' ').trim()).join('');
      } else {
        mechanism = 'froala';
        saveText = Array.from(container.querySelectorAll('.fr-element'))
          .map(fr => (fr.innerText || '').trim()).join('');
      }
      if (!saveText) {
        warnings.push(`Campo "${t.label}" pode não ter sido salvo: a fonte do salvamento ficou vazia após a injeção`);
        contentLogger.error(`[Verify] ${t.label}: FONTE DE SAVE VAZIA (${mechanism}) — conteúdo provavelmente não persistirá`);
      } else {
        contentLogger.success(`[Verify] ${t.label}: ${saveText.length} caractere(s) confirmados na fonte de save (${mechanism})`);
      }
    }

    contentLogger.success(`Injeção concluída: ${fieldsInjected} campos`);
    return { success: fieldsInjected > 0, fieldsInjected, warnings };
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const fieldDetector = new ShospFieldDetector();
const injector = new ShospInjector(fieldDetector);

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

// Remove listener órfão de execuções anteriores antes de registrar um novo.
if (window.__shospMessageListener) {
  try { chrome.runtime.onMessage.removeListener(window.__shospMessageListener); } catch (_e) { /* contexto anterior já inválido */ }
}

// Idempotência: deduplicação por requestId (máx 50 IDs — bounded para evitar leak de memória)
const _seenRequestIds = window.__shospSeenRequestIds || new Set();
window.__shospSeenRequestIds = _seenRequestIds;

// Deduplicação de CIDs por paciente: evita injetar o mesmo código duas vezes
// na mesma aba (ex: áudio "Miopia" + OCR "H52.1 - Miopia" chegando separados).
// Resetado pela navegação SPA (nova URL = novo paciente).
if (!window.__shospInjectedCids || window.__shospInjectedCidsUrl !== location.href) {
  window.__shospInjectedCids = new Set();
  window.__shospInjectedCidsUrl = location.href;
}

// Retificação cross-injeção de H52.9: o transtorno de refração NÃO especificado
// é redundante quando um CID refrativo específico (H52.0–H52.4) já foi injetado
// neste paciente. `_dropUnspecifiedRefraction` (sidepanel) só enxerga um campo
// por vez; quando os específicos vêm do OCR numa rodada e o H52.9 vem do áudio
// noutra, ele não os vê. O Set `__shospInjectedCids` é a única visão cumulativa
// cross-round (per-URL, sobrevive à re-injeção). Cobre a ordem OCR→áudio.
// Autocontida (só args + literal) para ser exercitada por _extractFn nos testes.
function _isRedundantUnspecifiedRefraction(normCode, injectedSet) {
  if (normCode !== 'H529' || !injectedSet) return false;
  return ['H520', 'H521', 'H522', 'H523', 'H524'].some(c => injectedSet.has(c));
}

// prontuarioOpen: a ficha está aberta quando um marcador ESTRUTURAL da ficha
// existe no DOM. Antes checava só `td[id^="tdCadastro-"]` — seletor que exige um
// elemento <td> com esse prefixo; quando o SHOSP troca a tag/id, ele falha e a
// ficha ABERTA é lida como fechada (8/8 injeções caíram no fallback: ~5s de
// latência morta por retries+reinjeção e escolha cega de aba, log 2026-07-21).
// Os dois primeiros marcadores são os ALVOS REAIS da injeção (campos-fonte e
// containers de aba): "presente" ⇒ "injeção é possível", exatamente a semântica
// deste flag. O terceiro alinha com _detectDynamicTabs. É um SUPERSET do seletor
// antigo → não pode criar falso-negativo; o único risco é falso-positivo (aba
// não-prontuário casando), relevante só com 2+ abas SHOSP. `tdCadastro` é o
// marcador a vigiar: se vazar na agenda, removê-lo e manter os dois primeiros.
// Recebe `doc` por injeção para ser exercitada nos testes (via _extractFn).
function _isProntuarioOpen(doc) {
  if (!doc) return false;
  const markers = [
    '[id*="prontuario_resp"]',           // campos-fonte input/textarea (alvo da injeção)
    '[id*="divTextoProntuarioServico"]', // containers de conteúdo por aba
    '[id*="tdCadastro"]'                 // headers/abas da ficha (idem _detectDynamicTabs)
  ];
  return markers.some(sel => doc.querySelector(sel) !== null);
}

window.__shospMessageListener = (message, _sender, sendResponse) => {
  contentLogger.info('Mensagem recebida:', message.action);

  switch (message.action) {
    case 'checkPage': {
      // prontuarioOpen: discrimina a aba do prontuário (onde a injeção é possível)
      // de outras páginas do SHOSP (agenda, login, mensagens). Sem isto, com 2+
      // abas SHOSP a seleção escolhe cega tabs[0]; e mesmo com 1 aba, o flag falso
      // custa retries+reinjeção. Ver _isProntuarioOpen para os marcadores.
      const prontuarioOpen = _isProntuarioOpen(document);
      contentLogger.info(`checkPage recebido — content script ativo (prontuarioOpen=${prontuarioOpen}):`, window.location.href.slice(0, 60));
      sendResponse({ isShospPage: true, prontuarioOpen });
      return false;
    }

    case 'injectAll': {
      if (!message.data) {
        sendResponse({ success: false, error: 'Nenhum dado fornecido' });
        return false;
      }
      // Deduplicação por requestId
      const reqId = message.requestId || (message.data && message.data.requestId);
      if (reqId) {
        if (_seenRequestIds.has(reqId)) {
          contentLogger.warn('injectAll ignorado — requestId duplicado:', reqId);
          sendResponse({ status: 'duplicate_ignored', requestId: reqId });
          return false;
        }
        _seenRequestIds.add(reqId);
        if (_seenRequestIds.size > 50) {
          const first = _seenRequestIds.values().next().value;
          _seenRequestIds.delete(first);
        }
      }
      // Guard de concorrência — impede duas injeções simultâneas no mesmo content script
      if (injector._injecting) {
        contentLogger.warn('injectAll já em execução — mensagem duplicada ignorada');
        sendResponse({ success: false, error: 'Injeção já em progresso' });
        return false;
      }
      injector._injecting = true;
      injector.injectAll(message.data)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message }))
        .finally(() => { injector._injecting = false; });
      return true;
    }

    case 'injectExamesNormais':
      injector.injectExamesNormais(message.data)
        .then(success => sendResponse({ success }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'injectRefracaoEstatica': {
      // Captura pós-dilatação: escreve SOMENTE o bloco Refração ESTÁTICA.
      // Reusa fillRefractionFields (mesma aba Refração), trocando só o fieldType
      // para o mapeamento estática — nenhum outro campo é tocado.
      const refr = message.data && message.data.refracao;
      if (!refr) { sendResponse({ success: false, error: 'Sem dados de refração' }); return false; }
      (async () => {
        try {
          // A estática não tem fallback de IDs: depende da detecção dinâmica.
          // Clicar na aba Refração garante que os campos estejam no DOM antes de
          // redetectar (senão o bloco estática pode não ser mapeado).
          const tabId = injector.detector.getTabId('refracao');
          // Guardar o resultado do clique: fillRefractionFields retorna false tanto
          // por aba não clicada quanto por campo não mapeado. Sem distinguir, uma
          // falha de aba viraria "confira o mapeamento" + dump da aba errada.
          const tabClicked = tabId ? await injector.clickTab(tabId) : null;
          await injector.detector.refresh();

          const paths = ['od.esf', 'od.cil', 'od.eixo', 'oe.esf', 'oe.cil', 'oe.eixo'];
          const resolvidos = {};
          for (const p of paths) {
            resolvidos[p] = injector.detector.getFieldId(`refracaoEstatica.${p}`) || null;
          }

          const filled = await injector.fillRefractionFields('refracao', 'refracaoEstatica', refr);

          // Quando não preenche, a causa é sempre mapeamento ausente (a estática não
          // tem FALLBACK_IDS). Anexar o dump estrutural faz a própria falha entregar
          // os IDs necessários para fixá-la: sem isso o painel só diz "confira os
          // campos" e a sessão seguinte recomeça do zero — foi o que aconteceu nas
          // três capturas estáticas do log 2026-07-29.
          const diag = filled
            ? { resolvidos, tabClicked }
            : { resolvidos, tabClicked, candidatos: injector.detector.dumpRefractionCandidates() };
          sendResponse({ success: filled, diag });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // Dump estrutural dos campos de refração sob demanda (sem injetar nada).
    // Escape hatch para fixar os IDs do bloco ESTÁTICA sem precisar refazer uma
    // captura: chamar dumpRefracaoBlocks() no console do painel.
    case 'dumpRefracaoBlocks': {
      (async () => {
        try {
          const tabId = injector.detector.getTabId('refracao');
          if (tabId) await injector.clickTab(tabId);
          await injector.detector.refresh();
          sendResponse({ success: true, candidatos: injector.detector.dumpRefractionCandidates() });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'searchCid':
      (async () => {
        try {
          // Detectar mudança de URL (navegação SPA para outro paciente)
          if (window.__shospInjectedCidsUrl !== location.href) {
            // Se já havia CIDs injetados, esta mensagem pertence ao paciente anterior:
            // abortar para evitar contaminação cruzada entre fichas.
            if (window.__shospInjectedCids?.size > 0) {
              contentLogger.warn('[searchCid] Paciente mudou durante cadeia de CIDs — abortando injeção residual');
              window.__shospInjectedCids = new Set();
              window.__shospInjectedCidsUrl = location.href;
              sendResponse({ success: false, error: 'URL_CHANGED' });
              return;
            }
            // Primeira injeção do novo paciente: resetar Set normalmente
            window.__shospInjectedCids = new Set();
            window.__shospInjectedCidsUrl = location.href;
            contentLogger.info('[searchCid] Nova URL detectada — Set de CIDs injetados resetado');
          }

          const term = (message.term || '').trim();
          if (!term) { sendResponse({ success: false, error: 'Termo vazio' }); return; }

          // ── Helper: preencher campo e disparar busca ──
          const fillAndSearch = async (searchTerm) => {
            // Limpa todos os possíveis contêineres de resultados de buscas anteriores proativamente
            const divs = document.querySelectorAll('[id*="ResultadoBuscaCid"], [id*="resultadoCid"], #divResultadoBuscaPadraoCid');
            divs.forEach(d => { d.innerHTML = ''; });

            // Aguarda a limpeza do DOM estabilizar antes de nova busca
            await new Promise(r => setTimeout(r, 150));

            const input = document.querySelector('#formCadProntuario #nomeCid')
              || document.getElementById('nomeCid');
            if (!input) return false;

            input.focus();
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(input, searchTerm);
            else input.value = searchTerm;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            contentLogger.info('[searchCid] Campo preenchido com:', searchTerm);

            await new Promise(r => setTimeout(r, 200));

            // Despreza os "Últimos CIDs" do histórico que aparecem ao focar/digitar
            const divsToClear = document.querySelectorAll('[id*="ResultadoBuscaCid"], [id*="resultadoCid"], #divResultadoBuscaPadraoCid');
            divsToClear.forEach(d => { d.innerHTML = ''; });

            // Tenta clicar no botão de busca. O SHOSP pode usar vários seletores
            // dependendo da versão da página.
            const btn = document.querySelector('#btnBuscaCidProntuario')
                     || document.querySelector('#btn_buscaCidProntuario')
                     || document.querySelector("a[onclick*='buscaCidProntuario']")
                     || document.querySelector("button[onclick*='buscaCidProntuario']")
                     || (() => {
                          // Busca genérica: botão/link próximo ao campo #nomeCid
                          const field = document.getElementById('nomeCid');
                          if (!field) return null;
                          const row = field.closest('tr, .form-group, .input-group') || field.parentElement;
                          return row?.querySelector('a, button') || null;
                        })();
            if (btn) {
              btn.click();
              contentLogger.info('[searchCid] Busca CID disparada via btn.click()');
            } else {
              // Fallback: jQuery UI autocomplete e campos SHOSP respondem ao Enter
              contentLogger.info('[searchCid] Botão não encontrado — disparando Enter no campo');
              input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, keyCode: 13, key: 'Enter' }));
              input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, keyCode: 13, key: 'Enter' }));
            }
            return true;
          };

          // ── Helper: aguardar linhas em qualquer contêiner de resultados visível ──
          const waitForRows = async (timeoutMs = 5000) => {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
              const divs = document.querySelectorAll('[id*="ResultadoBuscaCid"], [id*="resultadoCid"], #divResultadoBuscaPadraoCid');
              for (const div of divs) {
                const rows = div.querySelectorAll('tr[onclick]');
                if (rows.length > 0) return Array.from(rows);
              }
              await new Promise(r => setTimeout(r, 300));
            }
            return [];
          };

          const categoryMatch = term.match(/^([A-Z]\d{2})/i);
          const category = categoryMatch ? categoryMatch[1].toUpperCase() : null;

          // ── Helper: selecionar melhor linha ──
          const pickRow = (rows, searchTerm) => {
            const up = searchTerm.toUpperCase();
            // Versão normalizada sem ponto: "H11.1" → "H111"
            // SHOSP armazena códigos sem ponto nos atributos onclick (ex: 'H111')
            const upNorm = up.replace(/\./g, '');
            // Exact match: código não precedido nem seguido por outro dígito/letra
            // Evita que H400 (H40.0) faça prefix-match em H4000 (H40.00)
            const isExact = (s) => {
              const regex = new RegExp(`(?<![A-Z0-9])${upNorm}(?![A-Z0-9])`, 'i');
              return regex.test(s);
            };
            // 1. Match exato no onclick
            let row = rows.find(r => isExact((r.getAttribute('onclick') || '').toUpperCase().replace(/\./g, '')));
            // 2. Match exato no texto da linha
            if (!row) row = rows.find(r => isExact((r.textContent || '').toUpperCase().replace(/\./g, '')));
            // 3. Fallback prefix — onclick (comportamento anterior, para códigos sem subcategorias)
            if (!row) row = rows.find(r => (r.getAttribute('onclick') || '').toUpperCase().replace(/\./g, '').includes(upNorm));
            // 4. Fallback prefix — texto
            if (!row) row = rows.find(r => (r.textContent || '').toUpperCase().replace(/\./g, '').includes(upNorm));
            
            // Se encontramos correspondência pelo código do CID, retornamos
            if (row) return row;

            // Se for busca genérica de categoria (como "H25"), retorna a primeira linha pertencente a essa categoria
            if (category) {
              const catRow = rows.find(r => {
                const onClickText = (r.getAttribute('onclick') || '').toUpperCase().replace(/\./g, '');
                const text = (r.textContent || '').toUpperCase().replace(/\./g, '');
                return onClickText.includes(category) || text.includes(category);
              });
              if (catRow) return catRow;
            }

            // 5. único resultado disponível
            if (rows.length === 1) return rows[0];
            return null;
          };

          // ── 1. Campo disponível? ──
          const input = document.querySelector('#formCadProntuario #nomeCid')
            || document.getElementById('nomeCid');
          if (!input) {
            contentLogger.error('[searchCid] Campo #nomeCid não encontrado');
            sendResponse({ success: false, error: 'Campo #nomeCid não encontrado na página' });
            return;
          }

          // ── 2. Construir variantes de busca resilientes ──
          const searchVariants = [];
          // Se o termo tem ponto (ex: "H25.0"), tenta primeiro sem ponto ("H250")
          // pois o SHOSP armazena códigos majoritariamente sem ponto no banco
          if (term.includes('.')) {
            searchVariants.push(term.replace(/\./g, ''));
            searchVariants.push(term);
          } else {
            searchVariants.push(term);
            if (/^[A-Z]\d{3}$/.test(term)) {
              // Se tem 4 caracteres sem ponto (ex: "H250"), tenta com ponto ("H25.0")
              searchVariants.push(term.slice(0, 3) + '.' + term.slice(3));
            }
          }
          // Fallback de categoria de 3 caracteres (ex: "H25" para Catarata)
          if (category && !searchVariants.includes(category)) {
            searchVariants.push(category);
          }
          // Fallback por palavras-chave (se o termo tem descrição longa)
          const words = term.split(/\s+/).filter(w => w.length > 3 && !/^[A-Z]\d{2,3}$/i.test(w))
            .sort((a, b) => b.length - a.length);
          for (const word of words) {
            if (!searchVariants.includes(word)) {
              searchVariants.push(word);
            }
          }

          // ── Busca + seleção integradas ──
          // Se uma variante retorna resultados mas nenhuma linha corresponde ao
          // CID desejado (ex: resultados residuais de busca anterior), continua
          // tentando as variantes restantes em vez de falhar prematuramente.
          let rows = [];
          let usedVariant = '';
          let targetRow = null;
          // Rastreia se ALGUMA variante retornou linhas, independente de terem
          // sido aceitas. `rows` só é preenchido quando há match (segue com break),
          // então não serve para distinguir "SHOSP não tem o código" de
          // "SHOSP retornou linhas mas nenhuma casou" no ramo de falha abaixo.
          let sawAnyRows = false;
          let rejectedRows = [];

          const matchCandidates = [term];
          if (term.includes('.')) matchCandidates.push(term.replace(/\./g, ''));
          if (category) matchCandidates.push(category);
          for (const word of words) {
            matchCandidates.push(word);
          }

          // Helper: tenta selecionar uma linha compatível nos resultados
          const tryPickFromRows = (currentRows, variant) => {
            // 1. Tentar match por cada candidato (termo original, sem ponto, categoria, palavras)
            for (const candidate of matchCandidates) {
              const row = pickRow(currentRows, candidate);
              if (row) return row;
            }
            // 2. Fallback de categoria: aceita qualquer linha da mesma categoria
            if (category) {
              const catRow = currentRows.find(r => {
                const combined = ((r.textContent || '') + ' ' + (r.getAttribute('onclick') || '')).toUpperCase().replace(/\./g, '');
                return combined.includes(category);
              });
              if (catRow) {
                contentLogger.info('[searchCid] Usando resultado como fallback compatível com categoria:', category);
                return catRow;
              }
            }
            // 3. Se buscou pela categoria e retornou resultados, aceita o primeiro
            if (variant === category && currentRows.length > 0) {
              contentLogger.info('[searchCid] Usando primeiro resultado da busca por categoria:', category);
              return currentRows[0];
            }
            return null;
          };

          for (const variant of searchVariants) {
            contentLogger.info('[searchCid] Tentando busca com variante:', variant);
            await fillAndSearch(variant);
            const currentRows = await waitForRows(3000);
            if (currentRows.length === 0) continue;

            sawAnyRows = true;
            rejectedRows = currentRows; // guardado p/ diagnóstico se nenhuma casar
            contentLogger.info(`[searchCid] Encontrados ${currentRows.length} resultado(s) para "${variant}"`);
            contentLogger.debug('[searchCid] Resultados:', currentRows.map(r => (r.textContent || '').trim().slice(0, 60)).join(' | '));

            const picked = tryPickFromRows(currentRows, variant);
            if (picked) {
              targetRow = picked;
              rows = currentRows;
              usedVariant = variant;
              break;
            }

            // Resultados existem mas nenhum corresponde ao CID desejado —
            // provavelmente resultados residuais de busca anterior. Tentar próxima variante.
            contentLogger.info(`[searchCid] ${currentRows.length} resultado(s) para "${variant}" mas nenhum corresponde a ${term} — tentando próxima variante`);
          }

          if (!targetRow) {
            // Nenhuma variante funcionou. Distinguir os dois cenários é crucial
            // para depurar: "SHOSP não indexa este código" exige entrada manual,
            // enquanto "retornou linhas mas nenhuma casou" é bug de matching.
            if (sawAnyRows) {
              const descartadas = rejectedRows.map(r => (r.textContent || '').trim().slice(0, 60)).join(' | ');
              contentLogger.error(`[searchCid] SHOSP retornou linhas para "${term}" mas nenhuma casou (variantes: ${searchVariants.join(', ')})`);
              contentLogger.error('[searchCid] Linhas descartadas:', descartadas);
              sendResponse({ success: false, error: `CID ${term}: SHOSP retornou resultados mas nenhum correspondeu — verifique matching. Descartadas: ${descartadas}` });
            } else {
              contentLogger.warn(`[searchCid] Nenhuma variante retornou resultados para "${term}" (tentadas: ${searchVariants.join(', ')}) — provável ausência no subset SHOSP`);
              sendResponse({ success: false, error: `Nenhum resultado no SHOSP para o CID: ${term} (variantes tentadas: ${searchVariants.join(', ')})` });
            }
            return;
          }

          // ── 5. Verificar se CID já foi injetado neste paciente e clicar ──
          // Extrai o código normalizado (sem ponto) do onclick da linha para dedup
          const rowOnclick = (targetRow.getAttribute('onclick') || '').toUpperCase().replace(/\./g, '');
          const normMatch = rowOnclick.match(/[A-Z]\d{3,4}/);
          const normCode = normMatch ? normMatch[0] : null;
          const cidSet = window.__shospInjectedCids;
          if (normCode && cidSet && cidSet.has(normCode)) {
            contentLogger.warn('[searchCid] CID já injetado neste paciente — ignorado:', normCode, term);
            sendResponse({ success: true, skipped: true });
            return;
          }
          // Retificação cross-injeção: pula H52.9 quando um específico H52.0–H52.4
          // já foi injetado neste paciente (ver _isRedundantUnspecifiedRefraction
          // e nota de bug "H52.9 duplicado" 2026-07-21). Cobre a ordem OCR→áudio.
          if (_isRedundantUnspecifiedRefraction(normCode, cidSet)) {
            contentLogger.warn('[searchCid] H52.9 ignorado — CID refrativo específico já injetado neste paciente:', [...cidSet]);
            sendResponse({ success: true, skipped: true });
            return;
          }
          targetRow.click();
          if (normCode && cidSet) cidSet.add(normCode);
          contentLogger.success('[searchCid] CID selecionado:', targetRow.textContent?.trim().slice(0, 80));

          await new Promise(r => setTimeout(r, 500));
          sendResponse({ success: true });

        } catch (err) {
          contentLogger.error('[searchCid] Erro:', err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;

    case 'injectReceitaOlhoIrritado':
      (async () => {
        try {
          const tabId = fieldDetector.getTabId('receitas');
          if (!tabId) { sendResponse({ success: false }); return; }
          
          const tab = document.getElementById(tabId);
          if (tab) {
            tab.click();
            await new Promise(r => setTimeout(r, 500));
            
            const btnTextoPadrao = document.querySelector('button[id^="texto_padrao-"]');
            if (btnTextoPadrao) {
              btnTextoPadrao.click();
              await new Promise(r => setTimeout(r, 300));
              
              const dropdownItems = document.querySelectorAll('.fr-dropdown-content a, .fr-dropdown-menu a');
              for (const item of dropdownItems) {
                const text = item.textContent || '';
                if (text.includes('RX BFL') || text.includes('BFL CRM')) {
                  item.click();
                  await new Promise(r => setTimeout(r, 500));
                  
                  const btnImprimir = document.getElementById('imprimirAtestado_botao');
                  if (btnImprimir) btnImprimir.click();
                  
                  sendResponse({ success: true });
                  return;
                }
              }
            }
          }
          sendResponse({ success: false });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;

    case 'refreshFieldDetector':
      fieldDetector.refresh()
        .then(() => sendResponse({ success: true, stats: fieldDetector.getCacheStats() }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'getFieldMapping':
      sendResponse({ success: true, mapping: fieldDetector.getFullMapping() });
      return false;

    default:
      return false;
  }
};

chrome.runtime.onMessage.addListener(window.__shospMessageListener);

// Inicializa sempre — cada re-injeção via executeScript cria novas instâncias de
// fieldDetector/injector no próprio escopo da execução, então initialize() é necessário.
// Debounce: se outra instância inicializou há menos de 500ms, pula detecção redundante.
(async () => {
  try {
    const now = Date.now();
    const lastInit = window.__shospLastInitTimestamp || 0;
    if (now - lastInit < 500) {
      contentLogger.info('Inicialização ignorada (debounce — última há ' + (now - lastInit) + 'ms)');
      return;
    }
    window.__shospLastInitTimestamp = now;
    await fieldDetector.initialize();
    contentLogger.success('Content script v5.1.4 carregado e inicializado');
  } catch (error) {
    contentLogger.error('Erro na inicialização', error);
  }
})();

// Export for compatibility
window.ShospExtension = {
  fieldDetector,
  injector
};

})(); // fim do IIFE
