/**
 * ============================================================================
 * SIDEPANEL — HOOK REGISTRY
 * ============================================================================
 * Define todos os gatilhos de voz como hooks declarativos.
 * O runner em sidepanel-hook-runner.js itera sobre esta lista.
 *
 * Para adicionar um novo gatilho: registrar um hook aqui.
 * Não editar o onresult do speechRecognition.
 *
 * Carregado APÓS sidepanel-constants.js e ANTES de sidepanel-audio.js.
 * ============================================================================
 */

// ============================================================================
// ESTADO COMPARTILHADO — referência única lida e escrita pelos hooks
// ============================================================================
// Os hooks recebem este objeto por referência — mutações são refletidas
// nas flags globais via getters/setters, sem quebrar compatibilidade com o
// código existente que lê as variáveis diretamente (ex: fundoscopiaDetectada).

const HOOK_STATE = {
  get catarataDetectada()        { return catarataDetectada; },
  set catarataDetectada(v)       { catarataDetectada = v; },
  get catarataGrau()             { return catarataGrau; },
  set catarataGrau(v)            { catarataGrau = v; },
  get lioDetectada()             { return lioDetectada; },
  set lioDetectada(v)            { lioDetectada = v; },
  get opacidadeCapsulaDetectada(){ return opacidadeCapsulaDetectada; },
  set opacidadeCapsulaDetectada(v){ opacidadeCapsulaDetectada = v; },
  get examesNormaisInjetados()   { return examesNormaisInjetados; },
  set examesNormaisInjetados(v)  { examesNormaisInjetados = v; },
  get blefariteInjetada()        { return blefariteInjetada; },
  set blefariteInjetada(v)       { blefariteInjetada = v; },
  get fundoscopiaDetectada()     { return fundoscopiaDetectada; },
  set fundoscopiaDetectada(v)    { fundoscopiaDetectada = v; },
  get receitaOlhoIrritadoInjetada(){ return receitaOlhoIrritadoInjetada; },
  set receitaOlhoIrritadoInjetada(v){ receitaOlhoIrritadoInjetada = v; },
  get dilatacaoDetectada()       { return dilatacaoDetectada; },
  set dilatacaoDetectada(v)      { dilatacaoDetectada = v; },
  get lastTriggerTime()          { return lastTriggerTime; },
  set lastTriggerTime(v)         { lastTriggerTime = v; },
};

// ============================================================================
// HOOKS REGISTRADOS
// ============================================================================
// Ordem de verificação pelo runner: priority ASC (menor = primeiro).
// Dentro do mesmo priority, a ordem do array é respeitada.
//
// REGRA DE PRIORIDADE:
//   1–9   → flags passivas de cristalino (verificadas antes de qualquer injeção)
//   10–19 → inject exclusivos com bloqueio mútuo (blefarite > exames normais)
//   20–29 → inject sem bloqueio mútuo (olho irritado)
//   50    → stop com cooldown (dilatação)
//   99    → stop global (STOP_COMMANDS — verificado sempre, sem cooldown)

const VOICE_HOOKS = [

  // ── FLAGS DE CRISTALINO ──────────────────────────────────────────────────
  // Prioridade 1–3: verificadas primeiro para que a lente dinâmica
  // (getBiomicroscopiaComLente) esteja correta quando a injeção disparar.

  {
    id: 'catarata',
    type: 'flag',
    priority: 1,
    commands: CATARATA_COMMANDS,
    guard: (s) => s.catarataDetectada,
    onMatch: (text, s) => {
      s.catarataDetectada = true;
      // Extrair grau da fala para refletir na biomicroscopia
      const t = text.toLowerCase();
      if (/incipiente/.test(t)) s.catarataGrau = 'incipiente';
      else if (/inicial/.test(t)) s.catarataGrau = 'inicial';
      else if (/moderada/.test(t)) s.catarataGrau = 'moderada';
      else if (/avan[çc]ada|madura/.test(t)) s.catarataGrau = 'avançada';
      statusText.textContent = `Catarata detectada!${s.catarataGrau ? ' (' + s.catarataGrau + ')' : ''}`;
      statusText.style.color = '#eab308';
      console.log('[Hook] Flag: catarata detectada', s.catarataGrau || '(grau não especificado)');
    },
  },

  {
    id: 'lio',
    type: 'flag',
    priority: 2,
    commands: LIO_COMMANDS,
    guard: (s) => s.lioDetectada,
    onMatch: (text, s) => {
      s.lioDetectada = true;
      // NÃO seta examesNormaisInjetados — getBiomicroscopiaComLente() lê lioDetectada
      // e substitui "cristalino transparente" por "pseudofacia, LIO transparente..."
      statusText.textContent = 'LIO detectada!';
      statusText.style.color = '#eab308';
      console.log('[Hook] Flag: LIO detectada');
    },
  },

  {
    id: 'opacidade_capsula',
    type: 'flag',
    priority: 3,
    commands: OPACIDADE_CAPSULA_COMMANDS,
    guard: (s) => s.opacidadeCapsulaDetectada,
    onMatch: (text, s) => {
      s.opacidadeCapsulaDetectada = true;
      // NÃO seta examesNormaisInjetados — getBiomicroscopiaComLente() lê esta flag
      statusText.textContent = 'Opacidade de cápsula detectada!';
      statusText.style.color = '#eab308';
      console.log('[Hook] Flag: opacidade de cápsula detectada');
    },
  },

  // ── INJEÇÕES COM BLOQUEIO MÚTUO ──────────────────────────────────────────
  // Blefarite (priority 10) é verificada ANTES de exames normais (priority 11).
  // Guard de blefarite bloqueia também se examesNormaisInjetados=true (exclusão mútua).
  // Guard de exames normais bloqueia se examesNormaisInjetados=true.

  {
    id: 'blefarite',
    type: 'inject',
    priority: 10,
    commands: EXAME_BLEFARITE_COMMANDS,
    // Bloqueia se já injetou blefarite, se exames normais já foram injetados,
    // ou se dilatação foi detectada (não injeta durante pausa para dilatar).
    guard: (s) => s.blefariteInjetada || s.examesNormaisInjetados || s.dilatacaoDetectada,
    onMatch: (text, s) => {
      s.blefariteInjetada = true;
      s.examesNormaisInjetados = true;
      // Flag de estado — injectAll() usa FUNDOSCOPIA_NORMAL diretamente para blefarite
      // (não lê fundoscopiaDetectada), mas a flag é mantida para consistência
      // de estado global (outros módulos podem consultá-la).
      s.fundoscopiaDetectada = true;
      s.lastTriggerTime = Date.now();
      statusText.textContent = 'Blefarite detectada! Injetando...';
      statusText.style.color = '#eab308';
      injectBlefariteDirect();
    },
  },

  {
    id: 'exames_normais',
    type: 'inject',
    priority: 11,
    commands: EXAMES_NORMAIS_COMMANDS,
    // Bloqueia se exames já foram injetados OU se dilatação foi detectada
    // (não injeta exames durante pausa para dilatar).
    guard: (s) => s.examesNormaisInjetados || s.dilatacaoDetectada,
    onMatch: (text, s) => {
      s.examesNormaisInjetados = true;
      // Injeta fundoscopia somente se o médico mencionou "fundo" ou "fundoscopia"
      s.fundoscopiaDetectada = text.includes('fundo') || text.includes('fundoscop');
      s.lastTriggerTime = Date.now();
      statusText.textContent = s.fundoscopiaDetectada
        ? 'Exames normais! Injetando bio + fundo...'
        : 'Biomicroscopia normal! Injetando...';
      statusText.style.color = '#16a34a';
      injectExamesNormaisDirect();
    },
  },

  // ── INJEÇÕES INDEPENDENTES ───────────────────────────────────────────────

  {
    id: 'olho_irritado',
    type: 'inject',
    priority: 20,
    commands: OLHO_IRRITADO_COMMANDS,
    guard: (s) => s.receitaOlhoIrritadoInjetada,
    onMatch: (text, s) => {
      s.receitaOlhoIrritadoInjetada = true;
      s.lastTriggerTime = Date.now();
      statusText.textContent = 'Olho irritado! Injetando receita...';
      statusText.style.color = '#dc2626';
      injectReceitaOlhoIrritadoDirect();
    },
  },

  // ── STOP COM COOLDOWN ────────────────────────────────────────────────────
  // cooldown: 3000ms desde o último trigger (evita disparo acidental
  // logo após outro gatilho, ex: blefarite seguida de "esperar fora").

  {
    id: 'dilatacao',
    type: 'stop',
    priority: 50,
    commands: DILATACAO_COMMANDS,
    cooldown: 0,       // sem cooldown — stopCommandTimeout do runner já impede duplo disparo
    stopDelay: 800,    // margem maior para o Speech capturar a frase completa
    guard: (_s) => false,
    multiSource: true, // verifica final + interim + recentBuffer (disparo mais rápido)
    onMatch: (text, s) => {
      s.dilatacaoDetectada = true;
      statusText.textContent = 'Dilatação! Parando e omitindo conduta...';
      statusText.style.color = '#3b82f6';
      console.log('[Hook] DILATAÇÃO detectada — stop agendado');
    },
  },

  // ── STOP GLOBAL ──────────────────────────────────────────────────────────
  // Priority 99: verificado por último, mas usa tripla busca de texto
  // (normalizedFinal, normalizedCurrent, recentTextBuffer) via multiSource=true.
  // Não tem cooldown — deve disparar sempre que detectado.

  {
    id: 'stop',
    type: 'stop',
    priority: 99,
    commands: STOP_COMMANDS,
    cooldown: 0,
    stopDelay: 500,
    guard: (_s) => false,
    onMatch: (text, s) => {
      statusText.textContent = 'Comando detectado! Parando...';
      statusText.style.color = '#16a34a';
      console.log('[Hook] STOP detectado');
    },
    // Flag especial: o runner verifica este hook contra TRÊS fontes de texto
    // (normalizedCurrent, recentTextBuffer, normalizedFinal) em vez de apenas normalizedFinal
    multiSource: true,
  },

];
