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
  const _CLINICAL_VOCAB_RE = /\b(visao|vista|vistas|olho|olhos|ocular|oculares|retina|cornea|corneal|cristalino|macula|macular|nervo|pressao|tonometria|fundoscopia|dilata|colirio|biometria|refracao|catarata|glaucoma|astigmatismo|miopia|hipermetropia|cirurgia|lio|acuidade|fotofobia|lacrimejamento|conjuntiva|conjuntival|iris|esclerotica|pupila|pupilar|blefarite|calazio|ceratocone|biomicroscopia|campimetria|pachimetria|oct|lente|lentes|oftalmologico|oftalmologica|intraocular|periocular|refrac|oculo|oculos|grau|graus|consulta|consultas|retorno|retornos|receita|receitas|exame|exames|paciente|pacientes|medico|medica|medicos|medicas|doutor|doutora|doutores|doutoras)\b/g;

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
   * Guard 1: blefarite só é válida se há evidência clínica na transcrição.
   * Aceita: (a) palavra literal "blefarite"/"meibomite"; (b) descritores clínicos
   * da pálpebra (inflamacao palpebral, palpebra inflamada, bordo palpebral);
   * (c) padrão de tratamento inequívoco: compressa morna + higiene palpebral.
   * Remove flag E entrada do diagnóstico quando nenhum sinal está presente.
   */
  function _guardBlefariteLiteral(cloned, ctx, log) {
    const rawText = ctx.transcribedText || '';
    const normText = _normalizeForGuard(rawText);

    const hasBlefariteKeyword =
      // (a) palavras-diagnóstico explícitas
      /blefarite|meibomite|disfun[çc][ãa]o\s+de\s+meibom/i.test(rawText) ||
      // (b) descritores clínicos da pálpebra (sem acentos, já normalizados)
      /inflamacao\s+(da\s+)?palpebra|palpebra\s+inflamada|inflamacao\s+palpebral|bordo\s+palpebral/.test(normText) ||
      // (c) padrão de tratamento inequívoco de blefarite
      (/compressa/.test(normText) && /higiene\s+palpebral/.test(normText)) ||
      // (d) shampoo — em oftalmologia indica higiene palpebral (retorno de blefarite sem repetir diagnóstico)
      /shampoo/.test(normText);

    if (cloned.injectBlefarite === true && !hasBlefariteKeyword) {
      cloned.injectBlefarite = false;
      log.push('injectBlefarite revertido — nenhuma evidência clínica de blefarite na transcrição');
    }

    // Remove blefarite do diagnóstico se foi inferida sem nenhuma evidência.
    if (!hasBlefariteKeyword && cloned.dados && cloned.dados.diagnostico) {
      const lines = cloned.dados.diagnostico.split('\n');
      const filtered = lines.filter(l => !/blefarite|meibomite/i.test(l));
      if (filtered.length !== lines.length) {
        cloned.dados.diagnostico = filtered.join('\n').trim() || null;
        log.push('Blefarite removida do diagnóstico — nenhuma evidência clínica na transcrição');
      }
    }
  }

  /**
   * Guard 2: a linha "Associação ATB+corticoide" (expressão de GRUPO/nível 2) só
   * permanece se há menção explícita de antibiótico/corticoide na transcrição.
   * Sem esse apoio, a classe não pode ser afirmada — mas a prescrição NÃO é apagada:
   * é REBAIXADA ao nível genérico ("Medicação ocular prescrita"), preservando a
   * posologia. Backstop determinístico da HIERARQUIA DE NOMEAÇÃO do prompt (nível 3).
   */
  function _guardAssociacaoATB(cloned, ctx, log) {
    const tratamento = cloned.dados && cloned.dados.tratamento;
    if (!tratamento) return;
    const hasAssocLine = /associa[çc][ãa]o.*atb|atb.*corticoide/i.test(tratamento);
    if (!hasAssocLine) return;
    const hasMention = /antibi[oó]tico|corticoide|tobramicin|dexametason/i.test(ctx.transcribedText || '');
    if (hasMention) return;
    // Rebaixa "Associação (ATB + corticoide ocular) <posologia>" → "Medicação ocular
    // prescrita <posologia>". Remove o descritor de classe (tudo de "Associação" até o
    // início da posologia, isto é, o primeiro dígito), preservando gota/frequência/olho.
    const downgraded = tratamento
      .split('\n')
      .map(line => /associa[çc][ãa]o/i.test(line)
        ? line.replace(/associa[çc][ãa]o[^0-9]*/i, 'Medicação ocular prescrita ').trim()
        : line)
      .join('\n')
      .trim();
    cloned.dados.tratamento = downgraded || null;
    log.push('Linha "Associação" rebaixada para "Medicação ocular prescrita" — classe ATB+corticoide não mencionada na transcrição');
  }

  /**
   * Guard 3 (intercalado): move itens da LISTA NEGRA da conduta (ações físicas
   * do paciente) para tratamento quando o LLM os alocou incorretamente.
   * Também substitui termos de grau proibidos por "Prescrição de óculos".
   * Padrões são inequívocos e sem exceção — independem do contexto clínico.
   * Documentado em 2026-05-13 e recorrente em 2026-05-14.
   */
  function _guardCondutaContaminada(cloned, _ctx, log) {
    if (!cloned.dados || !cloned.dados.conduta) return;

    // Fix B2: substituir termos de grau proibidos (restauração do _guardTermosOculosProibidos)
    const TERMOS_GRAU_RE = /^(?:atualiza[çc][ãa]o de grau|mudan[çc]a de grau|novo grau|ajuste de grau)\b/i;
    const linhasConduta = cloned.dados.conduta.split('\n');
    let grauAlterado = false;
    const linhasCorrigidas = linhasConduta.map(linha => {
      const trimmed = linha.trim();
      if (TERMOS_GRAU_RE.test(trimmed)) {
        grauAlterado = true;
        log.push(`Termo proibido "${trimmed}" substituído por "Prescrição de óculos" na conduta`);
        return 'Prescrição de óculos';
      }
      return linha;
    });
    if (grauAlterado) {
      cloned.dados.conduta = linhasCorrigidas.join('\n');
    }

    const LISTA_NEGRA = [
      /compressa\s+(morna|quente|fria|[uú]mida)/i,
      /higiene\s+palpebral/i,
      // "de neném"/"nenê" — variante falada real (log 2026-07-03: "shampoo de nenem")
      /shampoo\s+(infantil|neutro|de\s+beb[êe]|de\s+nen[eéê]m?)/i,
      /sabonete\s+palpebral/i,
      /lubrificante\s+ocular/i,
      /[oô]mega[\s-]*3/i,
    ];

    const condutaLines = cloned.dados.conduta.split('\n');
    const keepInConduta = [];
    const moveToTratamento = [];

    for (const line of condutaLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (LISTA_NEGRA.some(re => re.test(trimmed))) {
        moveToTratamento.push(trimmed);
      } else {
        keepInConduta.push(trimmed);
      }
    }

    if (moveToTratamento.length === 0) return;

    cloned.dados.conduta = keepInConduta.join('\n').trim() || null;

    const existingLines = cloned.dados.tratamento
      ? cloned.dados.tratamento.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
      : [];

    for (const item of moveToTratamento) {
      const norm = item.replace(/\s+/g, ' ').toLowerCase();
      if (!existingLines.some(l => l.replace(/\s+/g, ' ').toLowerCase() === norm)) {
        existingLines.push(item);
      }
    }

    cloned.dados.tratamento = existingLines.join('\n');
    log.push(`Conduta contaminada: ${moveToTratamento.length} item(ns) movido(s) para tratamento — "${moveToTratamento.join('; ')}"`);
  }

  /**
   * Guard 5: corrige "Sem prescrição de óculos" → "Manutenção do óculos atual"
   * quando o transcript indica que o paciente já usa óculos e o médico manteve
   * o grau. O LLM confunde "não precisa trocar o grau" com ausência de indicação.
   */
  function _guardManutencaoOculos(cloned, ctx, log) {
    if (!cloned.dados || !cloned.dados.conduta) return;

    const conduta = cloned.dados.conduta;
    const temSemPrescricao =
      /sem\s+prescri[çc][ãa]o\s+de\s+[oó]culos/i.test(conduta) ||
      /n[aã]o\s+houve\s+prescri[çc][ãa]o\s+de\s+[oó]culos/i.test(conduta);
    if (!temSemPrescricao) return;

    const norm = _normalizeForGuard(ctx.transcribedText || '');

    // Frases que indicam manutenção do grau atual (paciente já usa óculos).
    const MANUTENCAO_RE = [
      /nao\s+precisa\s+trocar\s+(o\s+)?grau/,
      /grau\s+(ta|esta|está|esta)\s+(parecido|igual|similar|bom)/,
      /grau\s+praticamente\s+igual/,
      /grau\s+nao\s+mudou/,
      /oculos\s+(ainda\s+)?(servem|serve|ta\s+bom|esta\s+bom)/,
      /mant[eé](m|r)\s+(os\s+)?oculos/,
      /continuar\s+(com\s+)?(os\s+)?oculos\s+(atuais?|que\s+tem)/,
      /nao\s+precisa\s+(fazer|comprar|trocar)\s+(novo\s+)?oculos/,
      /pode\s+continuar\s+com\s+(os\s+)?oculos/,
    ];

    if (!MANUTENCAO_RE.some(re => re.test(norm))) return;

    cloned.dados.conduta = conduta
      .replace(/sem\s+prescri[çc][ãa]o\s+de\s+[oó]culos/gi, 'Manutenção do óculos atual')
      .replace(/n[aã]o\s+houve\s+prescri[çc][ãa]o\s+de\s+[oó]culos/gi, 'Manutenção do óculos atual');

    log.push('Guard 5: "Sem prescrição de óculos" → "Manutenção do óculos atual" — transcript indica manutenção de grau');
  }

  /**
   * Guard de dilatação: quando o médico vai dilatar, conduta e tratamento
   * pertencem ao pós-dilatação. Zera ambos para evitar injeção prematura.
   * Roda antes dos demais guards de conduta para evitar trabalho desnecessário.
   */
  function _guardDilatacao(cloned, ctx, log) {
    const flags = ctx.hookFlags || {};
    const dilatacao = !!(cloned.dilatacaoDetectada || flags.dilatacaoDetectada);
    if (!dilatacao || !cloned.dados) return;

    const changed = [];
    if (cloned.dados.conduta != null) { cloned.dados.conduta = null; changed.push('conduta'); }
    if (cloned.dados.tratamento != null) { cloned.dados.tratamento = null; changed.push('tratamento'); }
    // Fix E2: zerar também medicamentos_prescritos (chave legada que displayAudioResults lê como fallback)
    if (cloned.dados.medicamentos_prescritos != null) { cloned.dados.medicamentos_prescritos = null; changed.push('medicamentos_prescritos'); }
    // Descrição dos exames (biomicroscopia/fundoscopia) é feita após a dilatação —
    // na fase 1 injeta-se apenas a entrevista.
    if (cloned.dados.biomicroscopia != null) { cloned.dados.biomicroscopia = null; changed.push('biomicroscopia'); }
    if (cloned.dados.fundoscopia != null) { cloned.dados.fundoscopia = null; changed.push('fundoscopia'); }
    if (changed.length) {
      log.push(`Dilatação: ${changed.join(', ')} zerado(s) — pertencem ao pós-dilatação`);
    }
  }

  // Marcador inserido por sidepanel-audio.js quando a transcrição da fase 1
  // (pré-dilatação) é anexada como contexto da análise da fase 2.
  const _MARCADOR_FASE2_RE = /\[\s*retorno\s+da\s+dilatacao\s*\]/;

  // Fala que caracteriza a DESCRIÇÃO ou DECLARAÇÃO dos exames pelo médico.
  // Termos anatômicos do fundo só são ditos ao descrever o exame; as frases de
  // "exames normais" são o gatilho de voz equivalente (EXAMES_NORMAIS_COMMANDS).
  const _FALA_EXAMES_RE = new RegExp([
    // Até 3 modificadores entre "exames" e o qualificador: cobre "exames estão
    // TODOS normais" e "exames DE HOJE ESTÃO normais" (entradas literais de
    // EXAMES_NORMAIS_COMMANDS). Um único slot opcional não dava conta.
    'exames?\\s+(?:[a-z]+\\s+){0,3}(?:normais|normal|otimos|bons|tranquilos|certos?|paz)',
    '(?:tudo|ta\\s+tudo|esta\\s+tudo)\\s+(?:normal|certo|bem|tranquilo|em\\s+paz)\\s+(?:n?os?\\s+)?exames?',
    'biomicroscopia|fundoscopia|mapeamento\\s+de\\s+retina',
    // "fundo de olho", "fundo alterado", "fundo tá bem" — mas não "lá no fundo".
    'fundo\\s+d[eo]\\s+olho',
    'fundo\\s+(?:(?:esta|ta|foi|ficou|estava)\\s+)?(?:alterado|normal|limpo|bom|bem|tranquilo|ok|sem)',
    'retina|macula|macular|nervo\\s+optico|escavacao|papila|vitreo',
    'cristalino|camara\\s+anterior|cornea|conjuntiva|iris\\b'
  ].join('|'));

  /**
   * Guard 7: na fase 2 (retomada pós-dilatação), a declaração de exames normais
   * precisa vir da fala DA FASE 2 — não da fase 1.
   *
   * 2026-07-21: consulta das 13:39. A fase 2 teve 37 palavras, nenhuma sobre
   * fundo de olho, e mesmo assim injectExamesNormais saiu true: o LLM se apoiou
   * em "o resto tá tudo em paz com olho", dito ANTES da dilatação. A dilatação
   * existe justamente para ver o fundo — declarar fundoscopia normal a partir
   * de fala pré-dilatação lauda um exame que não foi feito.
   *
   * Só o trecho após o marcador é varrido. Fase 2 silenciosa sobre os exames →
   * derruba a flag e a descrição de fundoscopia. Perder uma biomicroscopia
   * legítima da fase 1 (o médico redigita) é preferível a fabricar fundoscopia.
   */
  function _guardExamesNormaisFase2(cloned, ctx, log) {
    const texto = _normalizeForGuard(ctx.transcribedText || '');
    const marcador = texto.match(_MARCADOR_FASE2_RE);
    if (!marcador) return; // não é fase 2 — guard não se aplica

    const falaFase2 = texto.slice(marcador.index + marcador[0].length);
    if (_FALA_EXAMES_RE.test(falaFase2)) return; // exames descritos na fase 2

    const alterado = [];
    if (cloned.injectExamesNormais === true) {
      cloned.injectExamesNormais = false;
      alterado.push('injectExamesNormais');
    }
    if (cloned.dados && cloned.dados.fundoscopia != null) {
      cloned.dados.fundoscopia = null;
      alterado.push('fundoscopia');
    }
    if (alterado.length) {
      log.push(`Fase 2 pós-dilatação: ${alterado.join(', ')} zerado(s) — os exames não foram descritos após a dilatação (evidência vinha da fala pré-dilatação)`);
    }
  }

  /**
   * Guard 4: garante indicação sobre óculos na conduta.
   * Só dispara quando a conduta já contém ao menos uma DECISÃO CLÍNICA
   * (retorno, encaminhamento, exame solicitado, suspensão) — evita adicionar
   * a nota em condutas compostas apenas por orientações procedimentais
   * (compressa, higiene) onde óculos simplesmente não foi discutido.
   */
  function _guardOculosNaConduta(cloned, _ctx, log) {
    if (cloned.noiseDetected || cloned.revisao_manual) return;
    const conduta = cloned.dados && cloned.dados.conduta;
    if (!conduta) return;
    if (/prescri[çc][ãa]o de [oó]culos|manuten[çc][ãa]o do [oó]culos/i.test(conduta)) return;
    // Se há tratamento farmacológico, a consulta é de patologia — óculos irrelevante.
    // Evita confusão: "Não houve prescrição de óculos" sendo lido como negação de medicamento.
    if (cloned.dados.tratamento) return;
    // Só adicionar quando há ao menos uma decisão clínica — não para condutas
    // com orientações procedimentais puras (compressa, higiene palpebral, etc.)
    const temDecisaoClinica = /retorno\b|encaminhamento|solicitar|suspender\b|manter\b|alta\b|avalia[çc][ãa]o|campo visual|tonometria|prescrição/i.test(conduta);
    if (!temDecisaoClinica) return;
    cloned.dados.conduta = conduta.trimEnd() + '\nNão houve prescrição de óculos';
    log.push('"Não houve prescrição de óculos" adicionado à conduta');
  }

  /**
   * Guard 6: Presbiopia obrigatória quando (a) óculos multifocal/progressivo/bifocal
   * é prescrito na conduta E a consulta tratou de visão de perto, OU (b) "presbiopia"
   * é mencionada explicitamente na transcrição.
   * Garante que o diagnóstico contém "H524 - Presbiopia".
   *
   * 2026-07-21: a evidência de "perto" exigia o token literal `oculos` a ≤6
   * palavras de `perto`. Na fala real o médico explica o multifocal SEM repetir
   * "óculos" ("multifocal é o que tem grau de longe perto junto", "longe de
   * perto junto") — o AND falhava e o guard REMOVIA presbiopia legítima em 3 de
   * 3 consultas do log de 2026-07-21. A evidência de perto agora aceita também
   * a dupla longe+perto e o vocabulário de leitura (óculos de farmácia, para
   * ler). O AND foi mantido: "óculos para perto" sozinho continua insuficiente
   * (PRES-6) e multifocal declarado só para longe também (PRES-7).
   */
  function _guardPresbiopiaObrigatoria(cloned, ctx, log) {
    if (!cloned.dados) return;

    const condutaNorm = _normalizeForGuard(cloned.dados.conduta || '');
    const transcricaoNorm = _normalizeForGuard(ctx.transcribedText || '');

    // Limpa pontuações da transcrição para busca robusta de termos próximos.
    const cleanText = transcricaoNorm.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, " ");
    const hasOculosParaPerto = /oculos\s+(?:[a-z]+\s+){0,6}perto|perto\s+(?:[a-z]+\s+){0,6}oculos/.test(cleanText);
    // "longe ... perto" (em qualquer ordem): forma como o médico descreve a
    // lente multifocal sem nomear "óculos" de novo.
    const hasLongePerto = /longe\s+(?:[a-z]+\s+){0,4}perto|perto\s+(?:[a-z]+\s+){0,4}longe/.test(cleanText);
    // Vocabulário de correção para perto já em uso pelo paciente.
    const hasLeitura = /oculos\s+(?:de\s+)?(?:leitura|farmacia|pronto)|oculos\s+(?:[a-z]+\s+){0,4}(?:para\s+)?ler\b/.test(cleanText);
    const hasEvidenciaPerto = hasOculosParaPerto || hasLongePerto || hasLeitura;

    // Plural obrigatório: a frase canônica do prompt é "Prescrição de óculos
    // MULTIFOCAIS" — e "multifocais" NÃO contém "multifocal". O padrão antigo
    // (/multifocal/) nunca casava com a conduta que o prompt manda emitir; os
    // testes passavam só porque usavam o singular. Causa raiz da remoção de
    // presbiopia em 3 de 3 consultas do log de 2026-07-21.
    const hasMultifocal = /multifoca(?:l|is)|bifoca(?:l|is)|progressiv/.test(condutaNorm);
    const hasPresbiopiaNoTexto = /presbiop/.test(transcricaoNorm);

    // Menção explícita de presbiopia basta por si só; multifocal exige que a
    // consulta tenha tratado de visão de perto.
    const canHavePresbiopia = hasPresbiopiaNoTexto || (hasMultifocal && hasEvidenciaPerto);

    const diagnostico = cloned.dados.diagnostico || '';
    const hasPresbiopia = /h52\.?4|presbiop/i.test(diagnostico);

    if (canHavePresbiopia) {
      if (!hasPresbiopia) {
        const lines = diagnostico ? diagnostico.split('\n') : [];
        lines.push('H524 - Presbiopia');
        cloned.dados.diagnostico = lines.join('\n').trim();

        const motivo = hasMultifocal
          ? 'prescrição de óculos multifocal/progressivo na conduta'
          : 'menção explícita de presbiopia na transcrição';
        log.push(`Diagnóstico de Presbiopia (H52.4) adicionado automaticamente — ${motivo}`);
      }
    } else {
      if (hasPresbiopia) {
        const lines = diagnostico.split('\n');
        const filtered = lines.filter(l => !/h52\.?4|presbiop/i.test(l));
        // Fix A5: só remove presbiopia se sobrarem outros diagnósticos.
        // Se era a única entrada, manter — evitar nular o diagnóstico inteiro.
        if (filtered.length > 0) {
          cloned.dados.diagnostico = filtered.join('\n').trim();
          log.push('Presbiopia removida do diagnóstico — critérios de elegibilidade não atendidos (sem multifocal ou menção explícita de presbiopia)');
        } else {
          log.push('Presbiopia mantida no diagnóstico — era a única entrada; critérios não atendidos mas remoção causaria diagnóstico nulo');
        }
      }
    }
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

    // Dilatação: a descrição dos exames pertence ao pós-dilatação — nenhuma
    // injeção de biomicroscopia/fundoscopia (normais ou blefarite) na fase 1.
    if (out.dilatacao) {
      out.injectExamesNormais = false;
      out.injectBlefarite     = false;
    }

    return out;
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
      // Guard 7: fase 2 pós-dilatação. Fora do bloco `dados` porque
      // injectExamesNormais vive na raiz da resposta. Precede _reconcileInjectFlags.
      _guardExamesNormaisFase2(cloned, ctx, guardsApplied);
    }

    if (cloned && cloned.dados) {
      _guardDilatacao(cloned, ctx, guardsApplied);
      _guardBlefariteLiteral(cloned, ctx, guardsApplied);
      _guardAssociacaoATB(cloned, ctx, guardsApplied);
      _guardCondutaContaminada(cloned, ctx, guardsApplied);
      _guardManutencaoOculos(cloned, ctx, guardsApplied);
      // Guard de óculos e presbiopia só se não há dilatação
      const flags = ctx.hookFlags || {};
      const dilatacao = !!(cloned.dilatacaoDetectada || flags.dilatacaoDetectada);
      if (!dilatacao) {
        _guardOculosNaConduta(cloned, ctx, guardsApplied);
        _guardPresbiopiaObrigatoria(cloned, ctx, guardsApplied);
      }
    }

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
