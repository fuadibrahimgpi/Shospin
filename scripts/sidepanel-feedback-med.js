/**
 * ============================================================================
 * SIDEPANEL — AUTO-FEEDBACK DE MEDICAÇÕES (persistência + tela)
 * ============================================================================
 * Parte pura em src/agents/medicamentos-feedback.js. Aqui ficam só o storage
 * (chrome.storage.local) e a caixa "Medicações a revisar" do painel.
 *
 *   registrarSuspeitasMedicamentos(fala, dados) — chamado após cada análise;
 *     nunca lança e nunca bloqueia a injeção.
 *   Caixa de revisão: o médico marca cada palavra como variante de um remédio
 *     existente, remédio novo ou ruído, e exporta as aprovações (JSON copiado).
 *
 * O léxico NÃO é alterado aqui: as aprovações exportadas são aplicadas depois,
 * com teste (ver o cabeçalho de medicamentos-feedback.js).
 *
 * Carregado APÓS sidepanel-audio.js e ANTES de sidepanel-init.js.
 * ============================================================================
 */

const MED_FB_KEY_FILA = '_shospMedFeedbackFila';
const MED_FB_KEY_APROVADOS = '_shospMedFeedbackAprovados';

function _medFbLer(chave) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get([chave], r => resolve(Array.isArray(r?.[chave]) ? r[chave] : []));
    } catch (_e) { resolve([]); }
  });
}

function _medFbGravar(chave, valor) {
  return new Promise(resolve => {
    try { chrome.storage.local.set({ [chave]: valor }, () => resolve(true)); }
    catch (_e) { resolve(false); }
  });
}

/**
 * Registra na fila as palavras da fala que parecem remédio e o léxico não
 * conhece. Também enfileira o caso em que o modelo devolveu o genérico
 * ("Medicação ocular prescrita") — o sinal mais forte de nome perdido.
 */
async function registrarSuspeitasMedicamentos(fala, dados) {
  try {
    if (typeof MedicamentosFeedback === 'undefined' || !fala) return;
    const suspeitas = MedicamentosFeedback.encontrarSuspeitas(fala, dados?.tratamento || '');
    if (!suspeitas.length) return;
    const fila = await _medFbLer(MED_FB_KEY_FILA);
    await _medFbGravar(MED_FB_KEY_FILA, MedicamentosFeedback.adicionarNaFila(fila, suspeitas));
    console.log('[MedFeedback] palavras novas para revisão:', suspeitas.map(s => s.termo));
  } catch (e) {
    console.warn('[MedFeedback] falha ao registrar suspeitas (não-fatal):', e?.message);
  }
}

const _MED_FB_BTN = 'padding:2px 8px;font-size:11px;cursor:pointer;margin-right:4px;';

function _medFbEl(tag, texto, css) {
  const el = document.createElement(tag);
  if (texto != null) el.textContent = texto;
  if (css) el.style.cssText = css;
  return el;
}

function _medFbOpcoesAlvo() {
  return MedicamentosLexico.MEDICAMENTOS_LEXICO
    .map(e => ({ id: e.id, rotulo: e.principio }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

function _medFbSelectAlvo() {
  const sel = _medFbEl('select', null, 'font-size:11px;max-width:140px;margin-right:4px;');
  sel.appendChild(new Option('é variante de…', ''));
  for (const o of _medFbOpcoesAlvo()) sel.appendChild(new Option(o.rotulo, o.id));
  return sel;
}

async function _medFbDecidir(id, decisao) {
  const fila = await _medFbLer(MED_FB_KEY_FILA);
  const r = MedicamentosFeedback.resolver(fila, id, decisao);
  if (r.erro) { _medFbAviso(r.erro); return; }
  await _medFbGravar(MED_FB_KEY_FILA, r.fila);
  if (r.aprovado) {
    const aprovados = await _medFbLer(MED_FB_KEY_APROVADOS);
    await _medFbGravar(MED_FB_KEY_APROVADOS, [...aprovados, r.aprovado]);
  }
  renderMedFeedback();
}

function _medFbAviso(msg) {
  const el = document.getElementById('medFeedbackAviso');
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
}

function _medFbLinhaItem(item) {
  const linha = _medFbEl('div', null, 'border-top:1px solid #e5e7eb;padding:6px 0;');
  const titulo = _medFbEl('div', null, 'font-size:12px;');
  titulo.appendChild(_medFbEl('strong', item.termo));
  const extra = [];
  if (item.ocorrencias > 1) extra.push(`${item.ocorrencias}x`);
  if (item.genericoNoTratamento) extra.push('ficou como genérico');
  if (item.parecidoCom) extra.push(`parece ${item.parecidoCom}`);
  if (extra.length) titulo.appendChild(_medFbEl('span', ` (${extra.join(', ')})`, 'color:#6b7280;'));
  linha.appendChild(titulo);
  if (item.trecho) linha.appendChild(_medFbEl('div', `“…${item.trecho}…”`, 'font-size:11px;color:#6b7280;margin:2px 0 4px;'));

  const acoes = _medFbEl('div', null, 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;');
  const sel = _medFbSelectAlvo();
  if (item.parecidoComId) sel.value = item.parecidoComId;
  const btnVar = _medFbEl('button', 'Variante', _MED_FB_BTN);
  btnVar.onclick = () => {
    if (!sel.value) { _medFbAviso('Escolha de qual remédio é variante.'); return; }
    _medFbDecidir(item.id, { acao: 'variante', alvoId: sel.value });
  };
  const inpPrinc = _medFbEl('input', null, 'font-size:11px;width:90px;');
  inpPrinc.placeholder = 'princípio ativo';
  const inpMarca = _medFbEl('input', null, 'font-size:11px;width:70px;');
  inpMarca.placeholder = 'marca';
  const selClasse = _medFbEl('select', null, 'font-size:11px;');
  for (const c of MedicamentosFeedback.CLASSES) selClasse.appendChild(new Option(c, c));
  const btnNovo = _medFbEl('button', 'Novo', _MED_FB_BTN);
  btnNovo.onclick = () => _medFbDecidir(item.id, {
    acao: 'novo', principio: inpPrinc.value, classe: selClasse.value, marca: inpMarca.value,
  });
  const btnRuido = _medFbEl('button', 'Ruído', _MED_FB_BTN);
  btnRuido.onclick = () => _medFbDecidir(item.id, { acao: 'ruido' });

  acoes.append(sel, btnVar, inpPrinc, inpMarca, selClasse, btnNovo, btnRuido);
  linha.appendChild(acoes);
  return linha;
}

async function renderMedFeedback() {
  const lista = document.getElementById('medFeedbackLista');
  const contador = document.getElementById('medFeedbackCount');
  if (!lista || typeof MedicamentosFeedback === 'undefined') return;
  const fila = await _medFbLer(MED_FB_KEY_FILA);
  const aprovados = await _medFbLer(MED_FB_KEY_APROVADOS);

  contador.textContent = `(${fila.length} a revisar · ${aprovados.length} aprovada${aprovados.length === 1 ? '' : 's'})`;
  lista.textContent = '';
  if (!fila.length) lista.appendChild(_medFbEl('div', 'Nenhuma palavra nova pendente.', 'font-size:11px;color:#6b7280;'));
  for (const item of fila.slice().reverse()) lista.appendChild(_medFbLinhaItem(item));

  const exp = document.getElementById('medFeedbackExportar');
  const lim = document.getElementById('medFeedbackLimpar');
  const limFila = document.getElementById('medFeedbackLimparFila');
  if (exp) exp.disabled = !aprovados.length;
  if (lim) lim.disabled = !aprovados.length;
  if (limFila) limFila.disabled = !fila.length;
}

// Descarta de uma vez as palavras pendentes (equivale a marcar todas como ruído).
// As aprovações já feitas não são tocadas.
async function limparFilaMedFeedback() {
  const fila = await _medFbLer(MED_FB_KEY_FILA);
  if (!fila.length) return;
  if (!confirm(`Descartar as ${fila.length} palavra(s) pendentes como ruído?`)) return;
  await _medFbGravar(MED_FB_KEY_FILA, []);
  renderMedFeedback();
}

// A fila guardada pode ter sido montada por um detector mais frouxo: ao abrir o
// painel, passa os itens automáticos pelo detector atual (refiltrarFila).
async function refiltrarFilaMedFeedback() {
  try {
    if (typeof MedicamentosFeedback === 'undefined' || !MedicamentosFeedback.refiltrarFila) return;
    const fila = await _medFbLer(MED_FB_KEY_FILA);
    if (!fila.length) return;
    const nova = MedicamentosFeedback.refiltrarFila(fila);
    if (JSON.stringify(nova) === JSON.stringify(fila)) return;
    await _medFbGravar(MED_FB_KEY_FILA, nova);
    console.log(`[MedFeedback] fila refiltrada: ${fila.length} → ${nova.length} item(ns)`);
  } catch (e) {
    console.warn('[MedFeedback] falha ao refiltrar a fila (não-fatal):', e?.message);
  }
}

async function exportarMedFeedback() {
  const aprovados = await _medFbLer(MED_FB_KEY_APROVADOS);
  const json = JSON.stringify(MedicamentosFeedback.montarExportacao(aprovados), null, 2);
  try {
    await navigator.clipboard.writeText(json);
    _medFbAviso(`${aprovados.length} aprovação(ões) copiada(s) — cole no chat para aplicar ao léxico.`);
  } catch (_e) {
    console.log('[MedFeedback] exportação:\n' + json);
    _medFbAviso('Não consegui copiar; o JSON foi para o console.');
  }
}

async function limparAprovadosMedFeedback() {
  await _medFbGravar(MED_FB_KEY_APROVADOS, []);
  renderMedFeedback();
}

// Correção manual: o médico viu um nome errado e informa como foi ouvido.
async function registrarManualMedFeedback() {
  const inp = document.getElementById('medFeedbackOuvido');
  const termo = (inp?.value || '').trim();
  if (!termo) { _medFbAviso('Digite como o nome foi ouvido.'); return; }
  const fila = await _medFbLer(MED_FB_KEY_FILA);
  await _medFbGravar(MED_FB_KEY_FILA, MedicamentosFeedback.adicionarNaFila(fila, [{
    termo: MedicamentosLexico.normalizarLexico(termo), trecho: '', origem: 'manual',
  }]));
  inp.value = '';
  renderMedFeedback();
}

(function iniciarMedFeedback() {
  document.getElementById('medFeedbackExportar')?.addEventListener('click', exportarMedFeedback);
  document.getElementById('medFeedbackLimpar')?.addEventListener('click', limparAprovadosMedFeedback);
  document.getElementById('medFeedbackAdicionar')?.addEventListener('click', registrarManualMedFeedback);
  document.getElementById('medFeedbackLimparFila')?.addEventListener('click', limparFilaMedFeedback);
  try {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area === 'local' && (mudancas[MED_FB_KEY_FILA] || mudancas[MED_FB_KEY_APROVADOS])) renderMedFeedback();
    });
  } catch (_e) { /* fora da extensão (testes) */ }
  refiltrarFilaMedFeedback().then(renderMedFeedback);
})();
