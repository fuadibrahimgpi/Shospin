/**
 * MODO OCT — laudo de OCT para glaucoma (2026-11-09)
 *
 * Carrega imagem/PDF do OCT → GeminiOctAgent (src/gemini-oct-agent.js) gera o
 * laudo no formato da skill laudo-oct-glaucoma-oftalmologia → injeta SÓ no campo
 * OCT da aba Glaucoma (content.js, action `injectOctLaudo`).
 *
 * Fluxo isolado da consulta: não passa por injectAll, clearAll nem recheck.
 * Injeção automática só quando decidirInjecao() libera; senão o laudo fica no
 * painel e o médico injeta pelo botão.
 *
 * Depende de (carregados antes): apiService, _parseGeminiJSON, GeminiOctAgent,
 * switchMode, _getShospTab, sendToTab, audioModeBtn, cameraModeBtn.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const octModeBtn = $('octModeBtn');
  const octSection = $('octSection');
  const dropZone = $('octDropZone');
  const fileInput = $('octFileInput');
  const chips = $('octArquivos');
  const autoChk = $('octAutoInject');
  const statusEl = $('octStatus');
  const alertasEl = $('octAlertas');
  const resultadoEl = $('octResultado');
  const laudoEl = $('octLaudo');
  const gerarBtn = $('octGerarBtn');
  const injetarBtn = $('octInjetarBtn');
  const limparBtn = $('octLimparBtn');
  const dumpBtn = $('octDumpBtn');
  if (!octModeBtn || !octSection) return;

  let arquivos = [];        // [{nome, mimeType, base64}]
  let geracao = 0;          // descarta resultado de geração antiga
  let gerando = false;
  let pendente = false;     // arquivo chegou durante a geração
  let debounce = null;
  let substituirNoProximo = false;

  // ── Modo: estende o switchMode do painel sem mexer nele ──────────────────
  const _switchModeOriginal = window.switchMode;
  window.switchMode = function (mode) {
    const r = _switchModeOriginal ? _switchModeOriginal(mode) : undefined;
    const oct = mode === 'oct';
    octSection.classList.toggle('hidden', !oct);
    octModeBtn.classList.toggle('active', oct);
    if (oct) {
      audioModeBtn?.classList.remove('active');
      cameraModeBtn?.classList.remove('active');
      dropZone.focus();
    }
    return r;
  };
  octModeBtn.addEventListener('click', () => window.switchMode('oct'));

  // ── Entrada de arquivos: clique, arrastar, colar ─────────────────────────
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => {
    adicionarArquivos(Array.from(fileInput.files || []));
    fileInput.value = '';
  });
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('arrastando'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('arrastando'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('arrastando');
    adicionarArquivos(Array.from(e.dataTransfer?.files || []));
  });
  document.addEventListener('paste', (e) => {
    if (octSection.classList.contains('hidden')) return;
    if (e.target === laudoEl) return; // colar texto no laudo é edição, não arquivo
    const files = Array.from(e.clipboardData?.items || [])
      .filter(it => it.kind === 'file')
      .map(it => it.getAsFile())
      .filter(Boolean);
    if (files.length) { e.preventDefault(); adicionarArquivos(files); }
  });

  function lerComoBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).replace(/^data:[^;]+;base64,/, ''));
      fr.onerror = () => reject(fr.error || new Error('Falha ao ler o arquivo'));
      fr.readAsDataURL(file);
    });
  }

  async function adicionarArquivos(files) {
    const validos = files.filter(f => /^image\//.test(f.type) || f.type === 'application/pdf');
    if (!validos.length) { setStatus('Use imagem (JPG/PNG) ou PDF do OCT.'); return; }
    for (const f of validos) {
      try {
        arquivos.push({ nome: f.name || 'colado.png', mimeType: f.type, base64: await lerComoBase64(f) });
      } catch (err) {
        setStatus(`Não consegui ler ${f.name}: ${err.message}`);
      }
    }
    desenharChips();
    // Espera um pouco: páginas do mesmo exame costumam chegar em sequência
    // (OD numa imagem, OE na outra). Gerar na primeira daria "olho ausente".
    clearTimeout(debounce);
    debounce = setTimeout(gerar, 1500);
    setStatus(`${arquivos.length} arquivo(s) — gerando o laudo em instantes…`);
  }

  function desenharChips() {
    chips.textContent = '';
    for (const a of arquivos) {
      const s = document.createElement('span');
      s.className = 'oct-chip';
      s.textContent = a.nome;
      chips.appendChild(s);
    }
    chips.classList.toggle('hidden', arquivos.length === 0);
    gerarBtn.classList.toggle('hidden', arquivos.length === 0);
    limparBtn.classList.toggle('hidden', arquivos.length === 0 && !laudoEl.value);
  }

  function setStatus(t) { statusEl.textContent = t || ''; }

  function desenharAlertas(alertas, motivos) {
    alertasEl.textContent = '';
    const add = (texto, bloqueio) => {
      const d = document.createElement('div');
      d.className = 'oct-alerta' + (bloqueio ? ' bloqueio' : '');
      d.textContent = (bloqueio ? '⛔ ' : '⚠️ ') + texto;
      alertasEl.appendChild(d);
    };
    const jaMostrado = new Set();
    for (const m of motivos || []) { add(m, true); jaMostrado.add(m); }
    for (const a of alertas || []) if (!jaMostrado.has(a.texto)) add(a.texto, false);
    alertasEl.classList.toggle('hidden', alertasEl.childElementCount === 0);
  }

  // ── Geração ───────────────────────────────────────────────────────────────
  async function gerar() {
    clearTimeout(debounce);
    if (!arquivos.length) return;
    if (gerando) { pendente = true; return; }
    gerando = true;
    const minha = ++geracao;
    gerarBtn.disabled = true;
    injetarBtn.classList.add('hidden');
    substituirNoProximo = false;
    setStatus('Lendo o OCT e gerando o laudo… (pode levar até 1 minuto)');
    try {
      const r = await GeminiOctAgent.gerarLaudo(
        arquivos.map(a => ({ mimeType: a.mimeType, base64: a.base64 })),
        { apiService, parseJSON: _parseGeminiJSON }
      );
      if (minha !== geracao) return;
      desenharAlertas(r.alertas, r.decisao.motivos);
      if (!r.eOct) {
        resultadoEl.classList.add('hidden');
        setStatus('A imagem não parece ser um OCT — nada foi injetado.');
        return;
      }
      laudoEl.value = r.laudo;
      resultadoEl.classList.remove('hidden');
      injetarBtn.textContent = 'Injetar no campo OCT';
      injetarBtn.classList.remove('hidden');
      limparBtn.classList.remove('hidden');
      if (autoChk.checked && r.decisao.auto) {
        await injetar(false);
      } else if (!r.decisao.auto) {
        setStatus('Laudo pronto, mas NÃO injetado automaticamente — veja os avisos e injete pelo botão se estiver certo.');
      } else {
        setStatus('Laudo pronto. Confira e injete pelo botão.');
      }
    } catch (err) {
      if (minha === geracao) setStatus(`Erro ao gerar o laudo: ${err.message}`);
    } finally {
      gerando = false;
      gerarBtn.disabled = false;
      if (pendente) { pendente = false; gerar(); }
    }
  }
  gerarBtn.addEventListener('click', gerar);

  // ── Injeção ───────────────────────────────────────────────────────────────
  async function injetar(substituir) {
    const laudo = laudoEl.value.trim();
    if (!laudo) { setStatus('Laudo vazio.'); return; }
    const tab = await _getShospTab();
    if (!tab) { setStatus('Abra a ficha do paciente no SHOSP para injetar.'); return; }
    injetarBtn.disabled = true;
    setStatus('Injetando no campo OCT da aba Glaucoma…');
    try {
      const resp = await sendToTab(tab.id, { action: 'injectOctLaudo', data: { laudo, substituir: !!substituir } });
      if (resp === 'CONTEXT_INVALIDATED') { setStatus('A extensão foi recarregada — aperte F5 na página do SHOSP e tente de novo.'); return; }
      if (!resp) { setStatus('O SHOSP não respondeu — a ficha está aberta nesta aba?'); return; }
      if (resp.success) {
        // O campo agora tem texto: um novo clique substitui (o médico já viu o aviso).
        injetarBtn.textContent = 'Injetar de novo (substitui)';
        const conferido = resp.readback && resp.readback.fonte && resp.readback.chars > 0;
        setStatus(`Laudo injetado em "${resp.campo.rotulo}". ` +
          (conferido ? 'Salve a ficha no SHOSP.' : 'ATENÇÃO: não confirmei o texto no campo que o SHOSP salva — confira antes de salvar.'));
        substituirNoProximo = true;
        return;
      }
      if (resp.ocupado) {
        substituirNoProximo = true;
        injetarBtn.textContent = 'Substituir texto do campo OCT';
        setStatus(`${resp.erro} — nada foi alterado. Use "Substituir" se quiser trocar.`);
        return;
      }
      setStatus(`${resp.erro || 'Falha na injeção'}. Use "Diagnóstico do campo OCT" e me mande o resultado do console.`);
      if (resp.campos) console.log('[OCT] campos vistos na aba Glaucoma:', resp.campos);
    } finally {
      injetarBtn.disabled = false;
    }
  }
  injetarBtn.addEventListener('click', () => injetar(substituirNoProximo));

  // ── Limpar / diagnóstico ─────────────────────────────────────────────────
  limparBtn.addEventListener('click', () => {
    geracao++;
    clearTimeout(debounce);
    arquivos = [];
    laudoEl.value = '';
    resultadoEl.classList.add('hidden');
    injetarBtn.classList.add('hidden');
    substituirNoProximo = false;
    desenharAlertas([], []);
    desenharChips();
    setStatus('');
  });

  dumpBtn.addEventListener('click', async () => {
    const tab = await _getShospTab();
    if (!tab) { setStatus('Abra a ficha do paciente no SHOSP.'); return; }
    const resp = await sendToTab(tab.id, { action: 'dumpCamposGlaucoma' });
    if (!resp || !resp.success) { setStatus(`Diagnóstico falhou: ${resp?.erro || 'sem resposta do SHOSP'}`); return; }
    // Uma linha por campo (o console corta strings longas — ver dumpRefractionCandidates).
    console.log(`[OCT] container da aba Glaucoma: ${resp.container}`);
    for (const c of resp.campos) {
      console.log(`[OCT] #${c.i} ${c.tipo} id=${c.id || '-'} rotulo="${c.rotulo}" vis=${c.vis} temConteudo=${c.temConteudo}`);
    }
    const rotulos = resp.campos.map(c => c.rotulo || '(sem rótulo)').join(' · ');
    setStatus(`${resp.campos.length} campo(s) na aba Glaucoma: ${rotulos || 'nenhum'}`);
  });
})();
