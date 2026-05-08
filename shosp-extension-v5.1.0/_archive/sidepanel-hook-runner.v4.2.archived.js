/**
 * ============================================================================
 * SIDEPANEL — HOOK RUNNER
 * ============================================================================
 * Itera sobre VOICE_HOOKS em ordem de prioridade e executa os hooks
 * que correspondem ao texto normalizado atual.
 *
 * Contrato:
 *   - hooks do tipo 'flag'   → nunca interrompem o loop
 *   - hooks do tipo 'inject' → interrompem o loop após execução
 *   - hooks do tipo 'stop'   → interrompem o loop e param a gravação
 *
 * O runner é stateless — todo o estado vem de HOOK_STATE e das variáveis
 * globais do sidepanel (via os getters/setters do HOOK_STATE).
 *
 * Carregado APÓS sidepanel-hooks.js e ANTES de sidepanel-audio.js.
 *
 * v4.2 — Correções:
 *   - Guard global removido: dilatação agora roda mesmo se outro stop foi agendado
 *   - Hook 'dilatacao' tem flag `bypassStopGuard: true` para imunidade ao guard
 *   - Log de debug adicionado para facilitar diagnóstico de falha silenciosa
 * ============================================================================
 */

// Pré-ordenar por priority ASC uma única vez (evita sort a cada onresult)
const SORTED_HOOKS = [...VOICE_HOOKS].sort((a, b) => a.priority - b.priority);

/**
 * Verifica se algum comando do hook está presente no texto.
 * Hooks com multiSource=true verificam as três fontes de texto.
 */
function _hookMatches(hook, normalizedFinal, normalizedCurrent, recentTextBuffer) {
  const sources = hook.multiSource
    ? [normalizedFinal, normalizedCurrent, recentTextBuffer]
    : [normalizedFinal];

  for (const cmd of hook.commands) {
    for (const src of sources) {
      if (src.includes(cmd)) return true;
    }
  }
  return false;
}

/**
 * Agenda stopRecording com o delay do hook e registra o timeout
 * na variável global stopCommandTimeout.
 * Guard: só agenda se stopCommandTimeout ainda não estiver ativo.
 */
function _scheduleStop(hook) {
  if (stopCommandTimeout) return; // já agendado
  stopCommandTimeout = setTimeout(() => {
    if (isRecording) stopRecording();
    stopCommandTimeout = null;
  }, hook.stopDelay ?? 500);
}

/**
 * Verifica apenas os hooks de stop (chamado após um inject disparar).
 */
function _runStopCheck(normalizedFinal, normalizedCurrent, recentTextBuffer) {
  for (const hook of SORTED_HOOKS) {
    if (hook.type !== 'stop') continue;
    if (stopCommandTimeout) break;
    if (hook.guard && hook.guard(HOOK_STATE)) continue;

    if (hook.cooldown > 0) {
      const elapsed = Date.now() - HOOK_STATE.lastTriggerTime;
      if (HOOK_STATE.lastTriggerTime > 0 && elapsed < hook.cooldown) continue;
    }

    if (!_hookMatches(hook, normalizedFinal, normalizedCurrent, recentTextBuffer)) continue;

    if (hook.onMatch) {
      try { hook.onMatch(normalizedFinal, HOOK_STATE); } catch (e) { /* ignorar */ }
    }
    _scheduleStop(hook);
    break;
  }
}

/**
 * Ponto de entrada chamado pelo onresult do speechRecognition.
 *
 * @param {string} normalizedFinal   - texto final acumulado (normalizado)
 * @param {string} normalizedCurrent - texto final + interim atual (normalizado)
 * @param {string} recentTextBuffer  - últimas 300 chars do texto atual (normalizado)
 * @returns {boolean} - true se um hook 'inject' ou 'stop' disparou
 */
function runHooks(normalizedFinal, normalizedCurrent, recentTextBuffer) {
  const state = HOOK_STATE;
  let injectedOrStopped = false;

  // ── CORREÇÃO v4.2 ──────────────────────────────────────────────────────────
  // Guard global REMOVIDO daqui. Antes bloqueava TODOS os hooks se stopCommandTimeout
  // estava ativo, impedindo que a dilatação disparasse quando outro STOP_COMMAND
  // já havia sido agendado em consulta anterior ou no mesmo fluxo.
  //
  // A proteção contra duplo disparo é feita DENTRO do _scheduleStop (que retorna
  // imediatamente se stopCommandTimeout já existe) e no guard individual de cada
  // hook stop dentro do loop abaixo.
  // ───────────────────────────────────────────────────────────────────────────

  for (const hook of SORTED_HOOKS) {

    // ── Guard ──
    if (hook.guard && hook.guard(state)) continue;

    // ── Cooldown (apenas type='stop' com cooldown > 0) ──
    if (hook.cooldown > 0) {
      const elapsed = Date.now() - state.lastTriggerTime;
      if (state.lastTriggerTime > 0 && elapsed < hook.cooldown) continue;
    }

    // ── Se já existe stop agendado: pular hooks 'stop' normais, mas
    //    PERMITIR hooks com bypassStopGuard=true (ex: dilatação) ──
    if (hook.type === 'stop' && stopCommandTimeout && !hook.bypassStopGuard) continue;

    // ── Match ──
    if (!_hookMatches(hook, normalizedFinal, normalizedCurrent, recentTextBuffer)) continue;

    // Log de debug para rastrear qual hook disparou
    console.log(`[HookRunner] Hook "${hook.id}" (${hook.type}) disparado`);

    // ── Executar onMatch (flags, inject e stop na 1ª detecção) ──
    if (hook.onMatch) {
      try {
        hook.onMatch(normalizedFinal, state);
      } catch (e) {
        console.error(`[HookRunner] Erro em onMatch do hook "${hook.id}":`, e);
      }
    }

    // ── Efeitos por tipo ──
    if (hook.type === 'flag') {
      // flags não interrompem o loop — continua verificando outros hooks
      continue;
    }

    if (hook.type === 'inject') {
      // inject: verifica stop antes de interromper o loop
      _runStopCheck(normalizedFinal, normalizedCurrent, recentTextBuffer);
      injectedOrStopped = true;
      break;
    }

    if (hook.type === 'stop') {
      _scheduleStop(hook);
      injectedOrStopped = true;
      break;
    }
  }

  return injectedOrStopped;
}
