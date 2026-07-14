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
// Os hooks recebem este objeto por referência — mutações são refletidas em
// SessionFlags. Os acessores das flags são GERADOS do registro canônico
// SESSION_FLAG_DEFAULTS (flag nova entra aqui automaticamente).

const HOOK_STATE = {};
for (const _flagName of Object.keys(SESSION_FLAG_DEFAULTS)) {
  Object.defineProperty(HOOK_STATE, _flagName, {
    get: () => SessionFlags[_flagName],
    set: (v) => { SessionFlags[_flagName] = v; },
    enumerable: true,
  });
}
// lastTriggerTime (cooldown unificado) não é flag de sessão — ponte manual
// para a variável em sidepanel-constants.js.
Object.defineProperty(HOOK_STATE, 'lastTriggerTime', {
  get: () => lastTriggerTime,
  set: (v) => { lastTriggerTime = v; },
  enumerable: true,
});

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
//   50    → stop de dilatação (pausa, não fim de consulta)
//   98    → stop forçado (STOP_FORCAR_COMMANDS — ordem explícita, ignora o gate)
//   99    → stop global (STOP_COMMANDS fortes + STOP_COMMANDS_CURTOS e
//           STOP_SAUDACAO_COMMANDS ancorados no fim da fala)
//
// GATE DE CAPTURA (requireCaptura): os stops de FIM DE CONSULTA só encerram
// a gravação se conduta E tratamento já tiverem sido ditados na fala
// (ClinicalTriggers.STOP_GATE + checkCondutaTratamentoCaptados). Sem a
// captura, o runner bloqueia o stop e a gravação continua — é preciso ditar
// o que falta e repetir a despedida. O stop de dilatação NÃO tem o gate
// (é pausa; conduta/tratamento vêm na fase 2).

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
      const t = text.toLowerCase();
      if (/incipiente/.test(t)) s.catarataGrau = 'incipiente';
      else if (/inicial/.test(t)) s.catarataGrau = 'inicial';
      else if (/moderada/.test(t)) s.catarataGrau = 'moderada';
      else if (/avan[çc]ad[ao]|madura/.test(t)) s.catarataGrau = 'avançada';
      console.log('[Hook] Flag: catarata detectada', s.catarataGrau || '(grau não especificado)');
      return {
        statusMessage: `Catarata detectada!${s.catarataGrau ? ' (' + s.catarataGrau + ')' : ''}`,
        statusColor: '#eab308',
      };
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
      console.log('[Hook] Flag: LIO detectada');
      return { statusMessage: 'LIO detectada!', statusColor: '#eab308' };
    },
  },

  {
    id: 'opacidade_capsula',
    type: 'flag',
    priority: 3,
    commands: OPACIDADE_CAPSULA_COMMANDS,
    // Bloqueia se já detectado OU se médico confirmou lente limpa (lenteLimpa é override definitivo)
    guard: (s) => s.opacidadeCapsulaDetectada || s.lenteLimpaDetectada,
    onMatch: (text, s) => {
      s.opacidadeCapsulaDetectada = true;
      console.log('[Hook] Flag: opacidade de cápsula detectada');
      return { statusMessage: 'Opacidade de cápsula detectada!', statusColor: '#eab308' };
    },
  },

  {
    id: 'lente_limpa',
    type: 'flag',
    priority: 4,
    commands: LENTE_LIMPA_COMMANDS,
    guard: (s) => s.lenteLimpaDetectada,
    onMatch: (text, s) => {
      s.lenteLimpaDetectada = true;
      s.lioDetectada = true;
      s.opacidadeCapsulaDetectada = false;
      console.log('[Hook] Flag: lente limpa — opacidade de cápsula descartada');
      return { statusMessage: 'Lente limpa! Sem opacidade de cápsula.', statusColor: '#16a34a' };
    },
  },

  // ── INJEÇÕES COM BLOQUEIO MÚTUO ──────────────────────────────────────────

  {
    id: 'blefarite',
    type: 'inject',
    priority: 10,
    commands: EXAME_BLEFARITE_COMMANDS,
    guard: (s) => s.blefariteInjetada || s.examesNormaisInjetados || s.dilatacaoDetectada,
    // Thunk: injectBlefariteDirect só existe após sidepanel-injection.js carregar
    inject: () => injectBlefariteDirect(),
    onMatch: (text, s) => {
      s.blefariteInjetada = true;
      s.examesNormaisInjetados = true;
      s.fundoscopiaDetectada = true;
      s.lastTriggerTime = Date.now();
      return { statusMessage: 'Blefarite detectada! Injetando...', statusColor: '#eab308' };
    },
  },

  {
    id: 'exames_normais',
    type: 'inject',
    priority: 11,
    commands: EXAMES_NORMAIS_COMMANDS,
    guard: (s) => s.examesNormaisInjetados || s.dilatacaoDetectada,
    inject: () => injectExamesNormaisDirect(),
    onMatch: (text, s) => {
      s.examesNormaisInjetados = true;
      s.fundoscopiaDetectada = text.includes('fundo') || text.includes('fundoscop');
      s.lastTriggerTime = Date.now();
      return {
        statusMessage: s.fundoscopiaDetectada
          ? 'Exames normais! Injetando bio + fundo...'
          : 'Biomicroscopia normal! Injetando...',
        statusColor: '#16a34a',
      };
    },
  },

  // ── INJEÇÕES INDEPENDENTES ───────────────────────────────────────────────

  {
    id: 'olho_irritado',
    type: 'inject',
    priority: 20,
    commands: OLHO_IRRITADO_COMMANDS,
    guard: (s) => s.receitaOlhoIrritadoInjetada,
    inject: () => injectReceitaOlhoIrritadoDirect(),
    onMatch: (text, s) => {
      s.receitaOlhoIrritadoInjetada = true;
      s.lastTriggerTime = Date.now();
      return { statusMessage: 'Olho irritado! Injetando receita...', statusColor: '#dc2626' };
    },
  },

  // ── STOP COM COOLDOWN ────────────────────────────────────────────────────

  {
    id: 'dilatacao',
    type: 'stop',
    priority: 50,
    commands: DILATACAO_COMMANDS,
    combos: DILATACAO_COMBOS,
    cooldown: 0,
    stopDelay: 800,
    // Guard de encerramento: se uma despedida já foi detectada na sessão, a
    // consulta está em fim/encerrada — um "vamos dilatar" agora provavelmente
    // se refere a outra pessoa (acompanhante/próximo paciente), não ao paciente
    // atual. Não sequestrar a consulta encerrada com uma pausa de dilatação.
    // fase2DilatacaoAtiva: esta sessão é o RETORNO de uma dilatação — frases
    // retrospectivas ("já dilatou", "pinguei o colírio para dilatar") não são
    // anúncio de nova pausa. Uma nova dilatação real nesta fase é coberta pelo
    // fallback onstop (parada manual), que varre a cauda do texto.
    guard: (s) => s.dilatacaoDetectada || s.despedidaNaSessao || s.fase2DilatacaoAtiva,
    multiSource: true,
    onMatch: (text, s) => {
      s.dilatacaoDetectada = true;
      console.log('[Hook] DILATAÇÃO detectada — stop agendado (pausa, não fim de consulta)');
      return {
        statusMessage: 'Dilatação! Pausando — aguardando retorno do paciente...',
        statusColor: '#3b82f6',
      };
    },
  },

  // ── STOP GLOBAL ──────────────────────────────────────────────────────────

  {
    id: 'stop_forcado',
    type: 'stop',
    priority: 98,
    commands: STOP_FORCAR_COMMANDS,
    cooldown: 0,
    stopDelay: 500,
    multiSource: true,
    // SEM requireCaptura: ordem explícita do médico à extensão ("encerrar
    // consulta") ignora o gate de captura — válvula de escape por voz quando
    // o gate bloqueia indevidamente (fraseado de conduta fora dos marcadores).
    guard: (s) => s.consultaEncerradaDetectada,
    onMatch: (text, s) => {
      s.consultaEncerradaDetectada = true;
      console.log('[Hook] STOP forçado por comando explícito — gate de captura ignorado');
      return { statusMessage: 'Encerramento por comando! Parando...', statusColor: '#16a34a' };
    },
  },

  {
    id: 'stop',
    type: 'stop',
    priority: 99,
    commands: STOP_COMMANDS,
    cooldown: 0,
    stopDelay: 500,
    // Fix A4: multiSource=true para verificar normalizedFinal (consultas longas) E
    // normalizedCurrent (detecção em interim). A checagem de negação em _hookMatches
    // previne falsos positivos; o guard bloqueia re-disparo após primeira detecção.
    multiSource: true,
    requireCaptura: true,
    guard: (s) => s.consultaEncerradaDetectada,
    onMatch: (text, s) => {
      s.consultaEncerradaDetectada = true;
      console.log('[Hook] STOP detectado');
      return { statusMessage: 'Comando detectado! Parando...', statusColor: '#16a34a' };
    },
  },

  {
    id: 'stop_curto',
    type: 'stop',
    priority: 99,
    commands: STOP_COMMANDS_CURTOS,
    cooldown: 0,
    // endAnchored: frases curtas/ambíguas ("tá bom então", "tchau") só casam
    // quando estão no FIM da fala atual. stopDelay maior dá tempo de o runner
    // CANCELAR o stop (via onCancel) se a fala continuar — ex: "tá bom então
    // vamos medir a pressão" não encerra a consulta.
    endAnchored: true,
    stopDelay: 2000,
    requireCaptura: true,
    guard: (s) => s.consultaEncerradaDetectada,
    onMatch: (text, s) => {
      s.consultaEncerradaDetectada = true;
      console.log('[Hook] STOP curto detectado (aguardando confirmação por silêncio)');
      return { statusMessage: 'Despedida detectada! Parando em 2s — fale para cancelar', statusColor: '#16a34a' };
    },
    onCancel: (s) => {
      s.consultaEncerradaDetectada = false;
    },
  },

  {
    id: 'stop_saudacao',
    type: 'stop',
    priority: 99,
    commands: STOP_SAUDACAO_COMMANDS,
    cooldown: 0,
    // "bom dia"/"boa tarde"/"boa noite" também são saudação de ABERTURA.
    // Dupla proteção: endAnchored (só casa no fim da fala, com cancelamento
    // se a fala continuar) + minSessionMs (ignorado nos primeiros 30s da
    // gravação, janela em que a saudação é abertura, não despedida).
    // O lastIndexOf já garante que só a ÚLTIMA ocorrência de "bom dia"
    // no transcript é testada — a de abertura fica no início e não é o fim.
    // minSessionMs=30s é suficiente: saudação de abertura ocorre em t<5s;
    // qualquer despedida real ocorre depois de 30s de consulta.
    // Caso real 2026-06-12: "tá ok, bom dia" encerrou a consulta e nenhum
    // gatilho disparou — médico precisou parar manualmente.
    // endAnchorSlack=5 (padrão=10): fillers legítimos após despedida têm ≤5
    // chars ("né", "viu", "hein"). Janela menor evita falso positivo com
    // palavras clínicas curtas como "perto" (6 chars) em contexto de refração
    // ("boa noite perto" = teste de visão noturna para perto).
    endAnchored: true,
    endAnchorSlack: 5,
    minSessionMs: 30000,
    stopDelay: 2000,
    requireCaptura: true,
    guard: (s) => s.consultaEncerradaDetectada,
    onMatch: (text, s) => {
      s.consultaEncerradaDetectada = true;
      console.log('[Hook] STOP saudação-despedida detectado (aguardando confirmação por silêncio)');
      return { statusMessage: 'Despedida detectada! Parando em 2s — fale para cancelar', statusColor: '#16a34a' };
    },
    onCancel: (s) => {
      s.consultaEncerradaDetectada = false;
    },
  },

];
