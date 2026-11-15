/**
 * CONTENT SCRIPT — Injeção dos dados nos campos do SHOSP (ShospInjector).
 * Parte do content script dividido em src/content/*.js + src/content.js (carregados nesta
 * ordem, ver manifest.json e CONTENT_SCRIPT_FILES). Cada arquivo é uma IIFE (re-injeção segura)
 * e compartilha símbolos via window.__shospContent. Código inalterado.
 */
(function () {
"use strict";

const { FIELD_INDICES, TAB_LOAD_DELAY, contentLogger, extractTabNumber, formatCil, formatEsf, highlightElement, parseRefEixo, setFroalaValue, setFroalaValueSynced, setInputValue, waitForElement } = window.__shospContent;

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

    // Biomicroscopia
    const bioTabId = this.detector.getTabId('biomicroscopia');
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

window.__shospContent = Object.assign(window.__shospContent || {}, { ShospInjector });

})();
