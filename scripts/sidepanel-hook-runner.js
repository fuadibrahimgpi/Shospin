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
 * ============================================================================
 */

// Pré-ordenar por priority ASC uma única vez (evita sort a cada onresult)
const SORTED_HOOKS = [...VOICE_HOOKS].sort((a, b) => a.priority - b.priority);

/**
 * Janela de negação: retorna true se um negador precede o comando em até 15
 * chars, para ignorar o match e evitar falso positivo clínico.
 * Janela curta (15) evita capturar negadores de cláusulas anteriores
 * (ex: "nao tem blefarite seus exames estao normais" → não bloqueia "exames").
 *
 * "sem" bloqueia somente quando precede DIRETAMENTE o comando (com ou sem
 * amplificador: "sem nenhuma", "sem alguma", "sem nada"). Isso evita
 * bloquear comandos após "sem queixas ..." ou "sem histórico ...", onde
 * "sem" pertence a uma cláusula anterior, não nega o comando em si.
 * Ex correto bloqueado:   "sem blefarite"         → bloqueia "blefarite"
 * Ex correto não bloqueado: "sem queixas biomicroscopia sem alteracoes"
 *                           → não bloqueia "biomicroscopia sem alteracoes"
 *
 * @param {string} src - texto-fonte normalizado
 * @param {number} idx - posição do comando dentro de src
 * @returns {boolean}
 */
function _negadoAntes(src, idx) {
  if (idx <= 0) return false;
  const prefix = src.slice(Math.max(0, idx - 15), idx);
  if (/\b(nao|não|nunca)\b/.test(prefix)) return true;
  if (/\bsem\s+(?:nenhuma?\s+|alguma?\s+|nada\s+)?$/.test(prefix)) return true;
  return false;
}

/**
 * Fronteira de palavra no INÍCIO do comando: rejeita matches que começam no
 * meio de outra palavra. Sem isso, comandos curtos casam por substring dentro
 * de palavras maiores — 'e catarata' casava em "cirurgiada d[e catarata]",
 * marcando catarata presente em paciente pseudofácica (menção histórica).
 * Mesma regra que matchComboPair já aplica ("lata" não casa "relata").
 * O texto-fonte é normalizado (minúsculas, sem acentos), então basta checar
 * se o caractere anterior é alfanumérico.
 *
 * @param {string} src - texto-fonte normalizado
 * @param {number} idx - posição do comando dentro de src
 * @returns {boolean}
 */
function _inicioDePalavra(src, idx) {
  if (idx <= 0) return true;
  return !/[a-z0-9]/.test(src[idx - 1]);
}

/**
 * Verifica se algum comando do hook está presente no texto.
 * Retorna o comando que disparou (string) ou null se não houve match.
 *
 * Modos de fonte:
 *   endAnchored=true → apenas normalizedCurrent, e o comando precisa estar no
 *                      FIM do texto (folga de 10 chars para muletas: "ne", "viu").
 *                      Usado por frases curtas/ambíguas (STOP_COMMANDS_CURTOS).
 *   tailOnly=true    → apenas recentTextBuffer (evita acúmulo no transcript completo)
 *   multiSource=true → [normalizedFinal, normalizedCurrent, recentTextBuffer]
 *   padrão           → apenas normalizedFinal
 *
 * @param {object} hook
 * @param {string} normalizedFinal    - texto acumulado final (normalizado)
 * @param {string} normalizedCurrent  - texto final + interim atual (normalizado)
 * @param {string} recentTextBuffer   - últimas 500 chars do normalizedCurrent
 * @returns {string|null} comando que disparou, ou null
 */
function _hookMatches(hook, normalizedFinal, normalizedCurrent, recentTextBuffer) {
  if (hook.endAnchored) {
    const slack = hook.endAnchorSlack ?? 10;
    for (const cmd of hook.commands) {
      const idx = normalizedCurrent.lastIndexOf(cmd);
      if (idx === -1) continue;
      if (idx + cmd.length < normalizedCurrent.length - slack) continue; // não está no fim
      if (!_inicioDePalavra(normalizedCurrent, idx)) continue;
      if (_negadoAntes(normalizedCurrent, idx)) continue;
      return cmd;
    }
    return null;
  }

  const sources = hook.tailOnly
    ? [recentTextBuffer]
    : hook.multiSource
      ? [normalizedFinal, normalizedCurrent, recentTextBuffer]
      : [normalizedFinal];

  for (const cmd of hook.commands) {
    for (const src of sources) {
      // Varrer TODAS as ocorrências: se a primeira menção está negada mas uma
      // posterior é afirmativa ("nao precisa dilatar... ok vamos dilatar"),
      // a afirmativa deve disparar.
      let idx = src.indexOf(cmd);
      while (idx !== -1) {
        if (_inicioDePalavra(src, idx) && !_negadoAntes(src, idx)) return cmd;
        idx = src.indexOf(cmd, idx + cmd.length);
      }
    }
  }

  // Detecção por co-ocorrência: sempre verificada apenas no recentTextBuffer.
  // Restringir ao buffer recente evita falsos positivos em consultas longas onde
  // as duas palavras do par aparecem em trechos distantes e sem relação semântica
  // (ex: "colirio" da prescrição + "dilatar" de contexto diferente, páginas atrás).
  // matchComboPair exige fronteira de palavra no início ("lata" não casa "relata").
  if (hook.combos && hook.combos.length > 0) {
    for (const pair of hook.combos) {
      if (ClinicalTriggers.matchComboPair(recentTextBuffer, pair)) {
        return `${pair[0]}+${pair[1]}`;
      }
    }
  }

  return null;
}

/**
 * Hooks com minSessionMs só valem depois que a gravação atinge a duração
 * mínima — protege "bom dia"/"boa tarde" (saudação de abertura) de serem
 * lidas como despedida no início da consulta. Fora do sidepanel (testes
 * Node), sessionStartTime pode não existir: nesse caso o hook fica liberado
 * e o teste controla o valor via mock.
 */
function _sessionTooShort(hook) {
  if (!hook.minSessionMs) return false;
  if (typeof sessionStartTime === 'undefined' || !sessionStartTime) return false;
  return (Date.now() - sessionStartTime) < hook.minSessionMs;
}

/**
 * Busca a primeira ocorrência (não negada) de um comando do hook que COMECE
 * a partir de `offset` no texto e retorna a posição do FIM dela, ou -1.
 * Usada pelo gate de captura para exigir uma despedida NOVA depois de um
 * stop bloqueado — a despedida antiga, anterior à âncora, não reativa o
 * encerramento sozinha.
 * Folga de 5 chars: o texto interim pode encolher ao finalizar, deslocando
 * levemente as posições. Nenhum comando de stop não-endAnchored tem menos de
 * 10 chars, então a folga não re-encontra a despedida antiga.
 */
function _findStopCmdEndAfter(hook, text, offset) {
  const from = Math.max(0, offset - 5);
  for (const cmd of hook.commands) {
    let idx = text.indexOf(cmd, from);
    while (idx !== -1) {
      if (!_negadoAntes(text, idx)) return idx + cmd.length;
      idx = text.indexOf(cmd, idx + cmd.length);
    }
  }
  return -1;
}

/**
 * Gate de captura (condicionante de encerramento): hooks de stop com
 * requireCaptura só encerram a gravação se CONDUTA e TRATAMENTO já tiverem
 * sido ditados na fala (o que é exigido vem de ClinicalTriggers.STOP_GATE).
 *
 * Quando bloqueia, avança a âncora global stopGateOffset para o fim da
 * despedida bloqueada: depois que o médico ditar o que falta, é preciso uma
 * NOVA despedida (dita após o bloqueio) — sem a âncora, a despedida antiga
 * que ficou no transcript encerraria a gravação no meio do ditado da
 * prescrição, assim que o primeiro marcador de tratamento aparecesse.
 *
 * Hooks endAnchored dispensam a âncora: a frase precisa estar no FIM da fala
 * atual, o que por construção já a torna "nova".
 *
 * @param {object} hook
 * @param {string} normalizedCurrent - texto final + interim (normalizado)
 * @param {string} matchedCmd - comando retornado por _hookMatches
 * @returns {boolean} true se o stop deve ser BLOQUEADO (gravação continua)
 */
function _stopGateBlocks(hook, normalizedCurrent, matchedCmd) {
  if (!hook.requireCaptura) return false;
  const gate = ClinicalTriggers.STOP_GATE || {};
  if (!gate.exigirConduta && !gate.exigirTratamento) return false;

  let matchEnd;
  if (!hook.endAnchored && stopGateOffset > 0) {
    // Âncora ativa: só uma despedida encontrada APÓS a âncora conta.
    matchEnd = _findStopCmdEndAfter(hook, normalizedCurrent, stopGateOffset);
    if (matchEnd === -1) return true; // só a despedida antiga — segue gravando
  } else {
    const idx = normalizedCurrent.lastIndexOf(matchedCmd);
    matchEnd = idx === -1 ? normalizedCurrent.length : idx + matchedCmd.length;
  }

  const captura = ClinicalTriggers.checkCondutaTratamentoCaptados(normalizedCurrent);
  if (captura.ok) return false;

  const jaAvisado = matchEnd <= stopGateOffset;
  stopGateOffset = Math.max(stopGateOffset, matchEnd);
  if (jaAvisado) return true; // mesma despedida já bloqueada — sem repetir aviso

  const faltando = [!captura.conduta && 'CONDUTA', !captura.tratamento && 'TRATAMENTO']
    .filter(Boolean).join(' e ');
  console.log(`[HookRunner] STOP "${matchedCmd}" bloqueado — falta ditar ${faltando}; gravação continua (diga "encerrar consulta" para forçar)`);
  if (typeof statusText !== 'undefined' && statusText) {
    statusText.textContent = `⚠️ Falta ditar ${faltando} — dite ou diga "encerrar consulta"`;
    statusText.style.color = '#eab308';
    setTimeout(() => {
      if (isRecording && !stopCommandTimeout) {
        statusText.textContent = 'Gravando...';
        statusText.style.color = '#ef4444';
      }
    }, 5000);
  }
  return true;
}

/**
 * Agenda stopRecording com o delay do hook e registra o timeout
 * na variável global stopCommandTimeout. Guarda os metadados em
 * stopPendingInfo para permitir cancelamento de stops endAnchored.
 * Guard: só agenda se stopCommandTimeout ainda não estiver ativo.
 */
function _scheduleStop(hook, matchedCmd) {
  if (stopCommandTimeout) return; // já agendado
  stopPendingInfo = {
    hookId: hook.id,
    cmd: matchedCmd,
    endAnchored: !!hook.endAnchored,
    endAnchorSlack: hook.endAnchorSlack ?? 10,
    onCancel: hook.onCancel || null,
  };
  stopCommandTimeout = setTimeout(() => {
    if (isRecording) stopRecording();
    stopCommandTimeout = null;
    stopPendingInfo = null;
  }, hook.stopDelay ?? 500);
}

/**
 * Se há um stop endAnchored agendado e a fala CONTINUOU depois da frase curta
 * que o disparou, cancela o stop (e desfaz o efeito do onMatch via onCancel).
 * Retorna true se o stop foi cancelado (o runner deve seguir processando).
 */
function _maybeCancelAnchoredStop(normalizedCurrent) {
  if (!stopCommandTimeout || !stopPendingInfo || !stopPendingInfo.endAnchored) return false;
  const { cmd, endAnchorSlack = 10 } = stopPendingInfo;
  const idx = normalizedCurrent.lastIndexOf(cmd);
  const aindaNoFim = idx !== -1 && (idx + cmd.length) >= normalizedCurrent.length - endAnchorSlack;
  if (aindaNoFim) return false;

  clearTimeout(stopCommandTimeout);
  stopCommandTimeout = null;
  const info = stopPendingInfo;
  stopPendingInfo = null;
  console.log(`[HookRunner] STOP "${info.cmd}" cancelado — a fala continuou após a despedida curta`);
  if (info.onCancel) {
    try { info.onCancel(HOOK_STATE); } catch (e) { /* ignorar */ }
  }
  // Notificação explícita do cancelamento: o médico precisa saber que a
  // consulta NÃO vai encerrar sozinha (antes voltava direto a "Gravando..."
  // e o cancelamento passava despercebido). Após 4s, restaura o status normal.
  if (typeof statusText !== 'undefined' && statusText) {
    statusText.textContent = `⚠️ Encerramento cancelado ("${info.cmd}") — repita a despedida no fim da fala`;
    statusText.style.color = '#eab308';
    setTimeout(() => {
      if (isRecording && !stopCommandTimeout) {
        statusText.textContent = 'Gravando...';
        statusText.style.color = '#ef4444';
      }
    }, 4000);
  }
  return true;
}

/**
 * Verifica apenas os hooks de stop (chamado após um inject disparar).
 * Equivalente ao checkStop() interno do onresult original.
 *
 * @param {string} normalizedFinal
 * @param {string} normalizedCurrent
 * @param {string} recentTextBuffer
 */
function _runStopCheck(normalizedFinal, normalizedCurrent, recentTextBuffer) {
  for (const hook of SORTED_HOOKS) {
    if (hook.type !== 'stop') continue;
    if (stopCommandTimeout) break;
    if (hook.guard && hook.guard(HOOK_STATE)) continue;
    if (_sessionTooShort(hook)) continue;

    // Respeitar cooldown também dentro do check pós-inject
    if (hook.cooldown > 0) {
      const elapsed = Date.now() - HOOK_STATE.lastTriggerTime;
      if (HOOK_STATE.lastTriggerTime > 0 && elapsed < hook.cooldown) continue;
    }

    const matchedCmd = _hookMatches(hook, normalizedFinal, normalizedCurrent, recentTextBuffer);
    if (!matchedCmd) continue;

    // Gate de captura: sem conduta+tratamento ditados, não encerra a consulta
    if (_stopGateBlocks(hook, normalizedCurrent, matchedCmd)) continue;

    console.log(`[HookRunner] STOP matched — hook "${hook.id}", cmd: "${matchedCmd}"`);
    let stopResult = null;
    if (hook.onMatch) {
      try { stopResult = hook.onMatch(normalizedFinal, HOOK_STATE); } catch (e) { /* ignorar */ }
    }
    if (stopResult && stopResult.statusMessage) {
      statusText.textContent = stopResult.statusMessage;
      if (stopResult.statusColor) statusText.style.color = stopResult.statusColor;
    }
    _scheduleStop(hook, matchedCmd);
    break;
  }
}

/**
 * Ponto de entrada chamado pelo onresult do speechRecognition.
 *
 * @param {string} normalizedFinal   - texto final acumulado (normalizado)
 * @param {string} normalizedCurrent - texto final + interim atual (normalizado)
 * @param {string} recentTextBuffer  - últimas 500 chars do texto atual (normalizado)
 * @returns {boolean} - true se um hook 'inject' ou 'stop' disparou
 */
function runHooks(normalizedFinal, normalizedCurrent, recentTextBuffer) {
  const state = HOOK_STATE;
  let injectedOrStopped = false;

  // Guard global: se um stop já foi agendado, não processar nenhum hook.
  // Evita os múltiplos disparos "[Hook] STOP detectado" quando o onresult
  // é chamado várias vezes antes do setTimeout(stopDelay) expirar.
  // Exceção: stop endAnchored cuja frase deixou de estar no fim da fala é
  // cancelado aqui, e o processamento segue normalmente neste evento.
  if (stopCommandTimeout) {
    if (!_maybeCancelAnchoredStop(normalizedCurrent)) return false;
  }

  for (const hook of SORTED_HOOKS) {

    // ── Guard ──
    if (hook.guard && hook.guard(state)) continue;

    // ── Sessão mínima (apenas hooks com minSessionMs — ex: stop_saudacao) ──
    if (_sessionTooShort(hook)) continue;

    // ── Cooldown (apenas type='stop' com cooldown > 0) ──
    if (hook.cooldown > 0) {
      const elapsed = Date.now() - state.lastTriggerTime;
      if (state.lastTriggerTime > 0 && elapsed < hook.cooldown) continue;
    }

    // ── Match ──
    const matchedCmd = _hookMatches(hook, normalizedFinal, normalizedCurrent, recentTextBuffer);
    if (!matchedCmd) continue;

    // ── Gate de captura (stop de fim de consulta): sem conduta+tratamento
    //    ditados na fala, o encerramento é bloqueado e a gravação continua ──
    if (hook.type === 'stop' && _stopGateBlocks(hook, normalizedCurrent, matchedCmd)) continue;

    // ── Executar onMatch — retorna { statusMessage, statusColor } opcional ──
    let hookResult = null;
    if (hook.onMatch) {
      try {
        hookResult = hook.onMatch(normalizedFinal, state);
      } catch (e) {
        console.error(`[HookRunner] Erro em onMatch do hook "${hook.id}":`, e);
      }
    }

    // ── Atualizar UI com o retorno do hook (responsabilidade do runner) ──
    if (hookResult && hookResult.statusMessage) {
      statusText.textContent = hookResult.statusMessage;
      if (hookResult.statusColor) statusText.style.color = hookResult.statusColor;
    }

    // ── Efeitos por tipo ──
    if (hook.type === 'flag') {
      continue;
    }

    if (hook.type === 'inject') {
      // Fix F1: funções são async — capturar rejeição para evitar falha silenciosa.
      // Promise.resolve() envolve o retorno para compatibilidade com mocks síncronos.
      let injectResult;
      if (typeof hook.inject === 'function') {
        injectResult = hook.inject();
      } else {
        console.warn(`[HookRunner] hook "${hook.id}" tipo 'inject' sem função inject definida`);
      }
      if (injectResult && typeof injectResult.catch === 'function') {
        injectResult.catch(err => {
          console.error(`[HookRunner] Erro na injeção "${hook.id}":`, err);
          statusText.textContent = `Erro ao injetar (${hook.id}) — verifique o SHOSP`;
          statusText.style.color = '#dc2626';
        });
      }
      _runStopCheck(normalizedFinal, normalizedCurrent, recentTextBuffer);
      injectedOrStopped = true;
      break;
    }

    if (hook.type === 'stop') {
      console.log(`[HookRunner] STOP matched — hook "${hook.id}", cmd: "${matchedCmd}"`);
      _scheduleStop(hook, matchedCmd);
      injectedOrStopped = true;
      break;
    }
  }

  return injectedOrStopped;
}
