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
(function () {
"use strict";

const { ShospFieldDetector, ShospInjector, contentLogger, waitForElement } = window.__shospContent;

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

window.__shospMessageListener = (message, _sender, sendResponse) => {
  contentLogger.info('Mensagem recebida:', message.action);

  switch (message.action) {
    case 'checkPage': {
      // prontuarioOpen: discrimina a aba do prontuário (onde a injeção é possível)
      // de outras páginas do SHOSP (agenda, login, mensagens). A presença de
      // td[id^="tdCadastro-"] é o mesmo sinal usado por _detectDynamicTabs para
      // saber se o prontuário está aberto. Sem isto, com 2+ abas SHOSP, a seleção
      // de aba escolhe cega tabs[0] e a injeção pode mirar a aba errada.
      const prontuarioOpen = document.querySelectorAll('td[id^="tdCadastro-"]').length > 0;
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
            // Nenhuma variante funcionou
            const hadRows = rows.length > 0;
            if (hadRows) {
              contentLogger.error(`[searchCid] Nenhum resultado compatível com a categoria ${category || term}`);
              contentLogger.debug('[searchCid] Linhas descartadas:', rows.map(r => (r.getAttribute('onclick') || '').slice(0, 60)).join(' | '));
              sendResponse({ success: false, error: `Nenhum resultado compatível com a categoria para o CID: ${term}` });
            } else {
              contentLogger.warn('[searchCid] Nenhum resultado para:', term);
              sendResponse({ success: false, error: `Nenhum resultado para o CID: ${term}` });
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
            // Espera ativa (até 3s) em vez de 500ms fixos; 150ms de acomodação evitam
            // pegar o botão de outra aba antes da troca de aba terminar.
            await new Promise(r => setTimeout(r, 150));
            const btnTextoPadrao = await waitForElement('button[id^="texto_padrao-"]', 3000);
            if (btnTextoPadrao) {
              btnTextoPadrao.click();
              await new Promise(r => setTimeout(r, 100));
              await waitForElement(() => document.querySelector('.fr-dropdown-content a, .fr-dropdown-menu a'), 3000);

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

})();
