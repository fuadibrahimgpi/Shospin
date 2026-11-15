/**
 * CONTENT SCRIPT — Detecção de abas e campos do prontuário SHOSP (ShospFieldDetector).
 * Parte do content script dividido em src/content/*.js + src/content.js (carregados nesta
 * ordem, ver manifest.json e CONTENT_SCRIPT_FILES). Cada arquivo é uma IIFE (re-injeção segura)
 * e compartilha símbolos via window.__shospContent. Código inalterado.
 */
(function () {
"use strict";

const { FALLBACK_IDS, TAB_IDS, contentLogger } = window.__shospContent;

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
            const prefix = isReceita ? 'receitaOculos' : 'refracao';
            this.cache.set(`${prefix}.${eye}.${fieldType}`, id);
          }
        }
      }
    }
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

window.__shospContent = Object.assign(window.__shospContent || {}, { ShospFieldDetector });

})();
