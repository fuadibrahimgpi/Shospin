/**
 * DECISION ENGINE v6 — Guards pós-LLM centralizados (ponto autoritativo)
 * ============================================================================
 *
 * Tarefa: aplicar regras de segurança clínica DEPOIS que o GeminiInterviewAgent
 * devolveu uma resposta JSON, retornando uma DECISÃO derivada sem mutar a
 * resposta crua.
 *
 * Entradas:
 *   - rawAIResponse: objeto JSON parseado vindo do Gemini (não modificado)
 *   - context: {
 *       transcribedText,  — texto-fonte da transcrição
 *       hookFlags,        — flags do VoiceHookAgent já disparadas durante gravação
 *       requestId,        — UUID gerado pelo caller (opcional; gerado aqui se ausente)
 *       tipoConsulta,     — string descritiva do tipo de consulta (opcional)
 *     }
 *
 * Saída (Decision v6):
 *   - clonedAIResponse  — cópia rasa da resposta com guards aplicados
 *   - injectFlags       — { injectExamesNormais, injectBlefarite, dilatacao }
 *                         JÁ reconciliados com hooks (mutual exclusion aplicado)
 *   - guardsApplied     — array de strings descrevendo o que foi alterado
 *   - metadata          — { requestId, timestamp, engineVersion, tipoConsulta }
 *
 * Uso:
 *   const decision = window.DecisionEngine.buildDecision(rawResponse, ctx);
 *   // decision.clonedAIResponse — usar em displayAudioResults / injectAll
 *   // decision.injectFlags.dilatacao — verificar pausa para dilatação
 *   // decision.guardsApplied — logar para auditoria
 */
'use strict';

(function (root) {
  const ENGINE_VERSION = '6.0';

  // ------------------------------------------------------------------
  // Cópia rasa para evitar mutação acidental do input.
  // ------------------------------------------------------------------
  function _shallowCloneAIResponse(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const out = Object.assign({}, raw);
    if (raw.dados && typeof raw.dados === 'object') {
      out.dados = Object.assign({}, raw.dados);
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Helpers para detecção de ruído
  // ------------------------------------------------------------------

  function _normalizeForGuard(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Vocabulário clínico oftalmológico mínimo esperado em uma transcrição real.
  const _CLINICAL_VOCAB_RE = /\b(visao|vista|vistas|olho|olhos|ocular|oculares|retina|cornea|corneal|cristalino|macula|macular|nervo|pressao|tonometria|fundoscopia|dilata|colirio|biometria|refracao|catarata|glaucoma|astigmatismo|miopia|hipermetropia|cirurgia|lio|acuidade|fotofobia|lacrimejamento|conjuntiva|conjuntival|iris|esclerotica|pupila|pupilar|blefarite|calazio|ceratocone|biomicroscopia|campimetria|pachimetria|oct|lente|lentes|oftalmologico|oftalmologica|intraocular|periocular|refrac)\b/g;

  // Indicadores de ruído: palavrões ou tokens claramente não-clínicos e incoerentes.
  const _NOISE_INDICATOR_RE = /\b(merda|porra|caralho|puta|fodase|foda.se|cacete|desgraça|desgraca|inferno|droga)\b/;

  // ------------------------------------------------------------------
  // GUARDS — aplicados em sequência sobre a cópia da resposta.
  // Cada guard recebe (cloned, ctx, log) e muta SOMENTE a cópia.
  // ------------------------------------------------------------------

  /**
   * Guard 0: detecta transcrição incoerente (ruído extremo ou ausência de
   * vocabulário clínico mínimo). Deve ser chamado ANTES dos demais guards e
   * FORA do bloco `if (cloned && cloned.dados)`.
   */
  function _guardTranscricaoIncoerente(cloned, ctx, log) {
    if (!cloned) return;
    const text = _normalizeForGuard(ctx.transcribedText || '');
    if (!text) return;

    const words = text.trim().split(/\s+/);
    const totalWords = words.length;
    const clinicalMatches = (text.match(_CLINICAL_VOCAB_RE) || []).length;
    const hasProfanity = _NOISE_INDICATOR_RE.test(text);

    const isNoisy =
      (totalWords >= 15 && clinicalMatches < 2) ||
      (hasProfanity && clinicalMatches < 3);

    if (!isNoisy) return;

    cloned.noiseDetected    = true;
    cloned.revisao_manual   = true;
    cloned.motivo_revisao_manual = 'Transcrição incoerente detectada pelo DecisionEngine.';

    if (cloned.dados) {
      cloned.dados.diagnostico              = null;
      cloned.dados.conduta                  = null;
      cloned.dados.tratamento               = null;
      cloned.dados.antecedentes_familiares  = null;
      cloned.dados.antecedentes_oftalmologicos = null;
    }

    log.push(`Transcrição incoerente: ${totalWords} palavras, ${clinicalMatches} termos clínicos — revisão manual obrigatória`);
  }

  /**
   * Guard 1: injectBlefarite só pode ser true se "blefarite" ou "meibomite"
   * aparecem literalmente na transcrição.
   */
  function _guardBlefariteLiteral(cloned, ctx, log) {
    if (cloned.injectBlefarite !== true) return;
    if (!/blefarite|meibomite/i.test(ctx.transcribedText || '')) {
      cloned.injectBlefarite = false;
      log.push('injectBlefarite revertido — palavra-chave ausente na transcrição');
    }
  }

  /**
   * Guard 2: linha "Associação ATB+corticoide" só permanece se há menção
   * explícita de antibiótico/corticoide na transcrição.
   */
  function _guardAssociacaoATB(cloned, ctx, log) {
    const tratamento = cloned.dados && cloned.dados.tratamento;
    if (!tratamento) return;
    const hasAssocLine = /associa[çc][ãa]o.*atb|atb.*corticoide/i.test(tratamento);
    if (!hasAssocLine) return;
    const hasMention = /antibi[oó]tico|corticoide|tobramicin|dexametason/i.test(ctx.transcribedText || '');
    if (hasMention) return;
    const filtered = tratamento
      .split('\n')
      .filter(line => !/associa[çc][ãa]o/i.test(line))
      .join('\n')
      .trim();
    cloned.dados.tratamento = filtered || null;
    log.push('Linha "Associação" removida do tratamento — não mencionada na transcrição');
  }

  /**
   * Guard 3: normaliza termos proibidos de óculos na conduta.
   * Remove "Atualização de grau", "Mudança de grau", "Novo grau", "Ajuste de grau"
   * e os substitui por "Prescrição de óculos" — jamais devem aparecer na conduta.
   */
  function _guardTermosOculosProibidos(cloned, _ctx, log) {
    if (!cloned.dados || !cloned.dados.conduta) return;
    const TERMOS_PROIBIDOS_RE = /^(?:atualiza[çc][ãa]o de grau|mudan[çc]a de grau|novo grau|ajuste de grau)\b/i;
    const linhas = cloned.dados.conduta.split('\n');
    let alterado = false;
    const normalizadas = linhas.map(linha => {
      const trimmed = linha.trim();
      if (TERMOS_PROIBIDOS_RE.test(trimmed)) {
        log.push(`Termo proibido "${trimmed}" substituído por "Prescrição de óculos" na conduta`);
        alterado = true;
        return 'Prescrição de óculos';
      }
      return linha;
    });
    if (alterado) {
      cloned.dados.conduta = normalizadas.join('\n');
    }
  }

  /**
   * Guard 4: quando dilatação foi detectada (hook ou IA), nula conduta,
   * tratamento e medicamentos_prescritos — o médico ainda não concluiu.
   */
  function _guardDilatacao(cloned, ctx, log) {
    const flags = ctx.hookFlags || {};
    const dilatacao = flags.dilatacaoDetectada || cloned.dilatacaoDetectada;
    if (!dilatacao || !cloned.dados) return;
    cloned.dados.conduta = null;
    cloned.dados.tratamento = null;
    if (cloned.dados.medicamentos_prescritos !== undefined) {
      cloned.dados.medicamentos_prescritos = null;
    }
    log.push('Conduta/tratamento omitidos — flag de dilatação/espera ativa');
  }

  /**
   * Reconcilia flags entre o agente LLM e os hooks de voz já disparados.
   * Aplica exclusão mútua: blefarite > exames normais; hook disparado bloqueia reinjeção.
   */
  function _reconcileInjectFlags(cloned, ctx) {
    const flags = ctx.hookFlags || {};
    const out = {
      injectExamesNormais: cloned.injectExamesNormais === true,
      injectBlefarite:     cloned.injectBlefarite === true,
      dilatacao:           !!(cloned.dilatacaoDetectada || (flags.dilatacaoDetectada)),
    };

    if (flags.blefariteInjetada) {
      out.injectBlefarite    = false;
      out.injectExamesNormais = false;
    } else if (flags.examesNormaisInjetados) {
      out.injectExamesNormais = false;
      out.injectBlefarite    = false;
    } else if (out.injectBlefarite) {
      out.injectExamesNormais = false;
    } else if (out.injectExamesNormais) {
      out.injectBlefarite = false;
    }

    return out;
  }

  /**
   * Guard 5: injectExamesNormais não pode ser true quando há tratamento ativo
   * ou encaminhamento na conduta — indicam achado que contradiz "todos normais".
   */
  function _guardExamesNormaisComTratamento(cloned, _ctx, log) {
    if (cloned.injectExamesNormais !== true) return;
    const temTratamento = !!(cloned.dados && cloned.dados.tratamento);
    const temEncaminhamento = !!(cloned.dados && cloned.dados.conduta &&
      /encaminhamento/i.test(cloned.dados.conduta));
    if (temTratamento || temEncaminhamento) {
      cloned.injectExamesNormais = false;
      log.push('injectExamesNormais revertido — há tratamento ativo ou encaminhamento na conduta');
    }
  }

  // ------------------------------------------------------------------
  // API principal
  // ------------------------------------------------------------------

  /**
   * Recebe a resposta crua do Gemini e retorna uma decisão derivada e auditável.
   * @param {object} rawAIResponse
   * @param {{ transcribedText?: string, hookFlags?: object, requestId?: string, tipoConsulta?: string }} context
   * @returns {{ clonedAIResponse, injectFlags, guardsApplied, metadata }}
   */
  function buildDecision(rawAIResponse, context) {
    const ctx = context || {};
    const cloned = _shallowCloneAIResponse(rawAIResponse);
    const guardsApplied = [];

    // Guard 0: ruído/incoerência — roda ANTES e fora do bloco dados (dados pode ser null)
    if (cloned) {
      _guardTranscricaoIncoerente(cloned, ctx, guardsApplied);
    }

    if (cloned && cloned.dados) {
      _guardBlefariteLiteral(cloned, ctx, guardsApplied);
      _guardAssociacaoATB(cloned, ctx, guardsApplied);
      _guardTermosOculosProibidos(cloned, ctx, guardsApplied);
      _guardDilatacao(cloned, ctx, guardsApplied);
    }

    // Guard 5 roda fora do bloco dados pois modifica flag de topo
    _guardExamesNormaisComTratamento(cloned, ctx, guardsApplied);

    const injectFlags = _reconcileInjectFlags(cloned || {}, ctx);

    const requestId = ctx.requestId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `de-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const metadata = {
      requestId,
      timestamp:     new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      tipoConsulta:  ctx.tipoConsulta || (rawAIResponse && rawAIResponse.tipo_consulta) || null,
    };

    return {
      clonedAIResponse: cloned,
      injectFlags,
      guardsApplied,
      metadata,
    };
  }

  const api = { buildDecision };

  // Export universal — funciona em service worker, sidepanel e Node tests.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.DecisionEngine = api;
  } else if (typeof window !== 'undefined') {
    window.DecisionEngine = api;
  } else if (typeof self !== 'undefined') {
    self.DecisionEngine = api;
  }
})(typeof self !== 'undefined' ? self : this);
