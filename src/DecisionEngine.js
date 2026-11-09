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
 *       pseudofacia,      — { detected, lado } de parsePseudofaciaFromDados (opcional;
 *                           sem ele o guard tenta o global do sidepanel)
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
  const _CLINICAL_VOCAB_RE = /\b(visao|vista|vistas|olho|olhos|ocular|oculares|retina|cornea|corneal|cristalino|macula|macular|nervo|pressao|tonometria|fundoscopia|dilata|colirio|biometria|refracao|catarata|glaucoma|astigmatismo|miopia|hipermetropia|cirurgia|lio|acuidade|fotofobia|lacrimejamento|conjuntiva|conjuntival|iris|esclerotica|pupila|pupilar|blefarite|calazio|ceratocone|biomicroscopia|campimetria|pachimetria|oct|lente|lentes|oftalmologico|oftalmologica|intraocular|periocular|refrac|oculo|oculos|grau|graus|consulta|consultas|retorno|retornos|receita|receitas|exame|exames|paciente|pacientes|medico|medica|medicos|medicas|doutor|doutora|doutores|doutoras|brimonidina|timolol|trometolol|latanoprosta|travoprosta|bimatoprosta|dorzolamida|brinzolamida|tafluprosta|moxifloxacino|ciprofloxacino|tobramicina|dexametasona|prednisolona|cetorolaco|nepafenaco|olopatadina|ciclosporina|atropina|tropicamida|fenilefrina|lubrificante|lubrificantes|hipromelose|carmelose|hialuronato|carboximetilcelulose|lagrima|lagrimas|medicacao|medicacoes|medicamento|medicamentos|remedio|remedios|posologia|gotas|gota|gotinha|gotinhas|instilar|pingar|acompanhamento|manutencao|conduta|tratamento|tratamentos|quadro|pterigio|higiene|compressa|omega)\b/g;

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

  // Anexa um aviso clínico à resposta (exibido ao médico pelo sidepanel).
  function _pushAviso(cloned, texto) {
    if (!cloned) return;
    if (!Array.isArray(cloned.avisos)) cloned.avisos = [];
    if (!cloned.avisos.includes(texto)) cloned.avisos.push(texto);
  }

  /**
   * Evidência de blefarite na transcrição, em DOIS níveis (2026-08-04).
   *
   *   • `exame`     — o médico DESCREVEU inflamação palpebral: palavra-diagnóstico,
   *                   descritor clínico do bordo/margem ou descrição leiga com um
   *                   SINAL observável (vermelhidão, crosta, caspa, secreção,
   *                   pontinho de inflamação…). Só este nível autoriza o texto
   *                   descritivo de biomicroscopia ("hiperemia e espessamento da
   *                   margem palpebral, telangiectasias…").
   *   • `qualquer`  — inclui também a evidência apenas de MANEJO (shampoo,
   *                   compressa + higiene, "glândulas de óleo da pálpebra"). Basta
   *                   para manter a flag, a conduta e o tratamento de blefarite,
   *                   mas NÃO para afirmar achados que ninguém examinou.
   *
   * Motivo da separação: log 2026-08-04 — receita de shampoo + lubrificante fez o
   * prontuário afirmar hiperemia, telangiectasias e disfunção de meibômio em uma
   * consulta de refração, sem uma palavra sobre a pálpebra no exame.
   * (No mesmo dia "com secreção espessa" saiu do template — ver BIOMICROSCOPIA_BLEFARITE.)
   */
  function _detectBlefariteEvidencia(rawText) {
    const text = rawText || '';
    const normText = _normalizeForGuard(text);

    // Estrutura anatômica citada (uma das pontas da conjunção leiga).
    const hasEstruturaPalpebral = /palpebr|cilio|meibom|bordo\s+do\s+olho/.test(normText);
    // SINAL observável — o que caracteriza um achado de exame. "higiene", "óleo" e
    // "glândula" ficam de fora: são manejo/anatomia, não inflamação descrita.
    const hasSinalInflamatorio = /inflama|vermelh|hipereme|hiperemi|crosta|caspa|descama|secre|espess|edema|inchad|entupid|obstru|disfun|telangiectasi|calazio|tercol/.test(normText);
    // ASR come "inflamação" e devolve "informação" (log 2026-08-05: "uma
    // informaçãozinha na pálpebra" — o achado descrito pelo médico, perdido).
    // "informação" é palavra comum demais para valer sozinha; só conta COLADA à
    // estrutura palpebral, onde ninguém fala de informação. Cobre o diminutivo
    // ("-zinha") e as trocas vizinhas de fonema que o reconhecedor faz.
    const _ASR_INFLAMACAO = '(?:in|im|en|em)f[oa]rma[cs][ao]\\w*';
    const hasInflamacaoAsr =
      new RegExp(`${_ASR_INFLAMACAO}\\s+(?:\\w+\\s+){0,2}(?:palpebr|bordo|cilio)`).test(normText) ||
      new RegExp(`(?:palpebr\\w*|bordo|cilios?)\\s+(?:\\w+\\s+){0,2}${_ASR_INFLAMACAO}`).test(normText);
    // "irritado" é o termo leigo mais colado em OLHO ("o olho está irritado, passa o
    // shampoo nos cílios") — na conjunção solta ele transformaria toda consulta de olho
    // irritado em blefarite descrita. Só conta ADJACENTE à estrutura palpebral, que é
    // como o médico descreve o achado de fato ("pálpebra um pouco irritada").
    const hasPalpebraIrritada =
      /(palpebr\w*|bordo|cilios?)\s+(\w+\s+){0,2}irritad/.test(normText) ||
      /irritad\w*\s+(\w+\s+){0,2}(palpebr|bordo|cilio)/.test(normText);
    // Sinal AMPLO (nível de manejo) — mantém o comportamento histórico da flag.
    const hasSinalOuManejo = hasSinalInflamatorio || hasInflamacaoAsr || /oleos|oleo\b|lipidic|glandul|higiene|vermelhid/.test(normText);

    const exame =
      // (a) palavras-diagnóstico explícitas
      /blefarite|meibomite|disfun[çc][ãa]o\s+de\s+meibom/i.test(text) ||
      // (b) descritores clínicos da pálpebra (sem acentos, já normalizados)
      /inflamacao\s+(da\s+|na\s+)?palpebra|palpebra\s+inflamada|inflamacao\s+palpebral|bordo\s+palpebral|margem\s+palpebral/.test(normText) ||
      // (c) descrição leiga COM sinal observável (log 2026-07-29)
      (hasEstruturaPalpebral && hasSinalInflamatorio) ||
      // (c') "pálpebra irritada" — exige adjacência (ver hasPalpebraIrritada)
      hasPalpebraIrritada ||
      // (c'') "informação na pálpebra" = "inflamação" comida pelo ASR
      hasInflamacaoAsr;

    const qualquer =
      exame ||
      // (d) padrão de tratamento de blefarite. "higiene palpebral" adjacente era
      // estrito demais — o médico diz "volta só para higiene" falando da pálpebra.
      (/compressa/.test(normText) && /higiene|palpebr|cilio/.test(normText)) ||
      // (e) shampoo — em oftalmologia indica higiene palpebral (retorno de blefarite sem repetir diagnóstico)
      /shampoo/.test(normText) ||
      // (f) descrição leiga de manejo/anatomia
      (hasEstruturaPalpebral && hasSinalOuManejo);

    return { exame, qualquer };
  }

  /**
   * Guard 1: blefarite só é válida se há evidência clínica na transcrição
   * (nível `qualquer` de _detectBlefariteEvidencia).
   * Remove flag E entrada do diagnóstico quando nenhum sinal está presente.
   */
  function _guardBlefariteLiteral(cloned, ctx, log) {
    const hasBlefariteKeyword = _detectBlefariteEvidencia(ctx.transcribedText).qualquer;

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
   * Guard 2b: PROTOCOLO DECLARADO da blefarite (nível 1.5) aplicado de forma
   * determinística sobre o tratamento — backstop do prompt, não substituto dele.
   *
   * Quando a fala traz o combo do consultório (compressa e/ou higiene/shampoo +
   * um colírio a pingar) e o modelo devolveu o colírio SEM nome ("Medicação ocular
   * prescrita", "Associação (ATB + corticoide ocular)", "Colírio"), a linha é
   * PROMOVIDA para "Tobramicina + dexametasona", preservando a posologia.
   *
   * Três limites, todos deliberados:
   *  1) O nível 1 vence o 1.5: se o tratamento já nomeia um princípio ativo,
   *     o guard não toca em nada (o médico pode ter dito "Maxitrol").
   *  2) PROMOVE, nunca CRIA: sem linha de colírio genérica, nada é acrescentado —
   *     inventar prescrição é o bug que a REGRA ANTI-INVENÇÃO do prompt proíbe.
   *  3) O gatilho NÃO exige os três itens literais nem a posologia "3x/dia".
   *     Essa exigência literal foi justamente o bug de 2026-08-03: a fala real
   *     ("mantém o tratamento fazendo a compressa lavando com shampoo e usando
   *     colírio até ele acabar") não diz "higiene palpebral" nem a frequência.
   *
   * Roda DEPOIS de _guardAssociacaoATB de propósito: aquele guard rebaixa
   * "Associação" → "Medicação ocular prescrita" quando a transcrição não tem as
   * palavras antibiótico/corticoide — que é o caso desta fala. Uma passada só
   * levanta tanto a linha rebaixada quanto a que já veio genérica.
   */
  const _PROTOCOLO_BLEFARITE_COLIRIO = 'Tobramicina + dexametasona';
  // Princípios ativos e marcas da base de conhecimento do prompt: se algum aparece,
  // o médico (ou o modelo, via nível 1) já nomeou o remédio — nada a promover.
  const _COLIRIO_NOMEADO_RE = /tobramicin|dexametason|moxifloxacin|gatifloxacin|ciprofloxacin|ofloxacin|azitromicin|neomicin|polimixin|prednisolon|fluorometolon|loteprednol|acetato\s+de\s+prednisolona|tobradex|tobracort|vigadexa|maxitrol|garasone|sterapred/i;
  // Linhas que descrevem o colírio SEM identidade — os níveis 2 e 3 da hierarquia.
  const _COLIRIO_GENERICO_RE = /^(?:\s*[-•*]\s*)?(medica[çc][ãa]o\s+ocular\s+prescrita|associa[çc][ãa]o\s*(?:\([^)]*\))?|col[íi]rio(?:\s+(?:antibi[óo]tico|anti-?\s?inflamat[óo]rio|com\s+corticoide|corticoide|prescrito|da\s+blefarite|para\s+desinflamar))?)(?=\s|$)/i;
  // Linhas do mesmo bloco que NÃO são o colírio da blefarite — nunca promover.
  // ANCORADO no início da linha de propósito: a posologia canônica do próprio colírio
  // é "3x/dia após higiene palpebral" e "após a compressa" — casar essas palavras em
  // qualquer posição faria o guard pular justamente a linha que ele existe para promover.
  // Uma linha É o que ela começa dizendo.
  const _NAO_E_COLIRIO_BLEFARITE_RE = /^\s*(?:[-•*]\s*)?(?:lubrificante|carmelose|hialuronato|l[áa]grima|lagrima|hidratante|[ôo]mega|omega|compressa|higiene|shampoo|col[íi]rio\s+(?:lubrificante|hipotensor|antial[ée]rgico|de\s+alergia|para\s+(?:a\s+)?press[ãa]o)|pomada)/i;

  // O colírio da blefarite é um item DISTINTO do lubrificante (log 2026-09-15).
  // A única instrução de pingar daquela consulta era do lubrificante ("um lubrificante,
  // pode pingar quantas vezes quiser") e o detector antigo — /pingar|colírio/ solto —
  // contava isso como o colírio do protocolo. Um só detector para os dois guards do
  // protocolo: promover e remover precisam ler a mesma evidência.
  const _NAO_E_COLIRIO_DA_BLEFARITE_PERTO_RE = /lubrific|lagrima|hidratant|dilat|pressao|glaucoma|alergi/;
  // Intenção de colírio ANTI-INFLAMATÓRIO sem a palavra "colírio" — as falas reais
  // que o médico confirmou como protocolo: "um tratamento mais forte" (2026-07-07,
  // 2026-08-03) e "um tratamento pra desinflamar" (2026-08-03). "vou passar um
  // tratamento para melhorar a irritação, é coisa simples" NÃO está aqui: é o anúncio
  // do pacote compressa + higiene + lubrificante (2026-09-15).
  const _INTENCAO_COLIRIO_BLEFARITE_RE = /mais\s+forte|desinflam|anti-?\s?inflamat|antibiotic|corticoid/;

  function _falaTemColirioDaBlefarite(rawText) {
    const words = _normalizeForGuard(rawText).split(/[^a-z0-9-]+/).filter(Boolean);
    if (_INTENCAO_COLIRIO_BLEFARITE_RE.test(words.join(' '))) return true;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (/^colirios?$/.test(w)) {
        // "sem colírio nenhum" é a negativa da prescrição, não a prescrição.
        if (words[i - 1] === 'sem' || words[i + 1] === 'nenhum') continue;
        // "colírio lubrificante", "colírio de lágrima", "colírio da pressão"…
        const depois = words.slice(i + 1, i + 4).join(' ');
        if (_NAO_E_COLIRIO_DA_BLEFARITE_PERTO_RE.test(depois)) continue;
        return true;
      }
      if (/^(?:ping\w*|gotas?)$/.test(w)) {
        // O objeto do pingar vem logo depois dele: "pinga o lubrificante" é do
        // lubrificante; "pinga esse aqui depois da limpeza" (frase do protocolo)
        // tem objeto próprio e é o colírio — mesmo com o lubrificante citado em seguida.
        const depois = words.slice(i + 1, i + 4).join(' ');
        if (_NAO_E_COLIRIO_DA_BLEFARITE_PERTO_RE.test(depois)) continue;
        if (/^(?:esse|este|essa|esta|isso|aqui|desse|deste)$/.test(words[i + 1] || '') ||
            /^(?:esse|este|essa|esta|isso|aqui|desse|deste)$/.test(words[i + 2] || '')) return true;
        // Sem objeto dito ("um lubrificante, pode pingar quantas vezes quiser"): o
        // pingar é do produto citado a até 6 palavras, antes ou depois.
        const janela = words.slice(Math.max(0, i - 6), i + 7).join(' ');
        if (_NAO_E_COLIRIO_DA_BLEFARITE_PERTO_RE.test(janela)) continue;
        return true;
      }
    }
    return false;
  }

  function _guardColirioBlefariteProtocolo(cloned, ctx, log) {
    const tratamento = cloned.dados && cloned.dados.tratamento;
    if (!tratamento) return;

    // Gatilho afrouxado: evidência de blefarite (inclui compressa+higiene e shampoo
    // sozinho) MAIS um colírio a ser pingado mencionado na fala — que não seja o
    // lubrificante.
    if (!_detectBlefariteEvidencia(ctx.transcribedText).qualquer) return;
    if (!_falaTemColirioDaBlefarite(ctx.transcribedText)) return;

    const linhas = tratamento.split('\n');
    // Nível 1 vence: remédio já nomeado em qualquer linha → não mexer.
    if (linhas.some(l => _COLIRIO_NOMEADO_RE.test(l))) return;

    let promovidas = 0;
    const novas = linhas.map(linha => {
      if (_NAO_E_COLIRIO_BLEFARITE_RE.test(linha)) return linha;
      const m = linha.match(_COLIRIO_GENERICO_RE);
      if (!m) return linha;
      promovidas++;
      // Substitui só o descritor; o resto da linha (posologia, "após higiene
      // palpebral", "até acabar") sobrevive intacto.
      return linha.replace(m[1], _PROTOCOLO_BLEFARITE_COLIRIO).trim();
    });

    // Nenhuma linha genérica = o médico não prescreveu colírio (ou já está nomeado).
    // Não acrescentamos linha nova: promover ≠ criar.
    if (!promovidas) return;

    cloned.dados.tratamento = novas.join('\n');
    log.push(`Colírio da blefarite promovido para "${_PROTOCOLO_BLEFARITE_COLIRIO}" — protocolo declarado do médico (nível 1.5), ${promovidas} linha(s)`);
  }

  /**
   * Guard 2c: o protocolo NOMEIA o colírio, nunca o CRIA — o inverso do Guard 2b.
   *
   * Log 2026-09-15: o médico disse "vou passar um tratamento para melhorar essa
   * irritação, isso é coisa simples" e prescreveu compressa + higiene + lubrificante
   * + ômega 3. O modelo leu o anúncio como o colírio do protocolo e escreveu
   * "Tobramicina + dexametasona" — um corticoide que ninguém prescreveu, injetado no
   * prontuário. O Guard 2b só promove linhas genéricas; a linha que o modelo já
   * escreveu com o nome do protocolo não era conferida por ninguém.
   *
   * Remove a linha do protocolo quando:
   *   • a fala NÃO pronuncia o remédio (nível 1 — se pronunciou, o nome é do médico), e
   *   • a fala NÃO tem um colírio que não seja o lubrificante, nem a intenção
   *     anti-inflamatória ("mais forte", "desinflamar") — ver _falaTemColirioDaBlefarite.
   * Remove em vez de rebaixar para "Medicação ocular prescrita": sem colírio na fala
   * não há prescrição a registrar (REGRA ANTI-INVENÇÃO), e o genérico continuaria
   * afirmando uma. Como o ASR pode ter comido a palavra, o médico é avisado.
   */
  const _LINHA_PROTOCOLO_BLEFARITE_RE = /^\s*(?:[-•*]\s*)?tobramicina\s*\+\s*dexametasona\b/i;
  const _PROTOCOLO_PRONUNCIADO_RE = /tobramicin|dexametason|tobradex|tobracort|tobra\s*-?\s*dexa/;

  function _guardColirioBlefariteSemPrescricao(cloned, ctx, log) {
    const tratamento = cloned.dados && cloned.dados.tratamento;
    if (!tratamento) return;
    const linhas = tratamento.split('\n');
    if (!linhas.some(l => _LINHA_PROTOCOLO_BLEFARITE_RE.test(l))) return;

    if (_PROTOCOLO_PRONUNCIADO_RE.test(_normalizeForGuard(ctx.transcribedText))) return;
    if (_falaTemColirioDaBlefarite(ctx.transcribedText)) return;

    const restantes = linhas.filter(l => !_LINHA_PROTOCOLO_BLEFARITE_RE.test(l));
    cloned.dados.tratamento = restantes.join('\n').trim() || null;
    _pushAviso(cloned,
      `Tratamento: "${_PROTOCOLO_BLEFARITE_COLIRIO}" foi removido — a fala não traz nenhum colírio ` +
      'além do lubrificante, então o protocolo da blefarite não se aplica. Se você prescreveu o colírio, ' +
      'acrescente-o manualmente.');
    log.push(`"${_PROTOCOLO_BLEFARITE_COLIRIO}" removido do tratamento — protocolo sem colírio na fala (só compressa/higiene/lubrificante)`);
  }

  /**
   * Guard 2d (log 2026-10-22): CLASSE de colírio que a fala não sustenta.
   *
   * O médico prescreveu um colírio cujo nome o ASR destruiu ("trometolou 3x ao dia
   * por 5 dias") após retirar corpo estranho. O modelo contornou o nome ilegível
   * escrevendo "Colírio antibiótico" — a classe veio do contexto ("machucado"), não
   * da fala — e o prontuário recebeu um antibiótico que ninguém disse (o nome sugere
   * cetorolaco, um AINE). Mesma classe de erro do Guard 2: a classe (nível 2) só vale
   * com a fala apontando para ela. Sem isso a linha é REBAIXADA ao nível 3, mantendo
   * a posologia — a prescrição existe, só o nome não pode ser afirmado.
   */
  const _LINHA_CLASSE_ATB_RE = /^(\s*(?:[-•*]\s*)?)colirio\s+antibiotico\b/;
  const _FALA_ANTIBIOTICO_RE = /antibi|\batb\b|tobra|vigamox|vigadexa|zymar|ciloxan|cilodex|moxifl|cipro|oflox|gatiflox|cloranfenicol|gentamicin|neomicin|polimixin|maxitrol|azitromicin|eritromicin|vancomicin/;

  function _guardClasseAntibioticoSemFala(cloned, ctx, log) {
    const tratamento = cloned.dados && cloned.dados.tratamento;
    if (!tratamento) return;
    const linhas = tratamento.split('\n');
    if (!linhas.some(l => _LINHA_CLASSE_ATB_RE.test(_normalizeForGuard(l)))) return;
    if (_FALA_ANTIBIOTICO_RE.test(_normalizeForGuard(ctx.transcribedText))) return;

    let rebaixadas = 0;
    cloned.dados.tratamento = linhas.map(l => {
      if (!_LINHA_CLASSE_ATB_RE.test(_normalizeForGuard(l))) return l;
      rebaixadas++;
      return l.replace(/^(\s*(?:[-•*]\s*)?)col[ií]rio\s+antibi[oó]tico/i, '$1Medicação ocular prescrita');
    }).join('\n');
    _pushAviso(cloned,
      'Tratamento: o nome do colírio não ficou claro na gravação — registrado como "Medicação ocular prescrita". ' +
      'Confira e ajuste o nome manualmente.');
    log.push(`Guard 2d: "Colírio antibiótico" rebaixado para "Medicação ocular prescrita" — fala não cita antibiótico (${rebaixadas} linha(s))`);
  }

  /**
   * Guard 2g (log 2026-11-09): remédio NOMEADO na fala não pode sair como classe.
   *
   * Regra do médico: havendo nome (comercial ou princípio ativo), o prontuário leva o
   * remédio EXPLÍCITO; classe ("Colírio hipotensor ocular") e genérico ("Medicação ocular
   * prescrita") só valem quando a fala não deu nenhum dos dois. Caso real: "bimato à
   * próstata com timol" (ASR: "hematotrófico continua lol") virou "Colírio hipotensor
   * ocular 1x/dia" em medicacoes_em_uso E em tratamento. O léxico (com as variantes de
   * ASR) acha o remédio na fala; este guard só PROMOVE linhas que o modelo já escreveu
   * em nível de classe — nunca cria linha (promover ≠ criar, REGRA ANTI-INVENÇÃO).
   *
   * Limites deliberados:
   *  • a classe da linha tem que bater com a do remédio citado (hipotensor ↔ hipotensor);
   *  • no máximo 2 remédios da classe ("bimatoprosta com timolol"); 3+ é ambíguo → fica;
   *  • "Medicação ocular prescrita" só é promovida se a fala cita UM remédio;
   *  • remédio negado/suspenso/alérgico ("sem timolol", "alergia a timolol") é ignorado;
   *  • nome que veio de variante de ASR (não do nome literal) gera aviso para conferir.
   */
  const _CLASSE_LINHA_RE = {
    hipotensor:   /^(\s*(?:[-•*]\s*)?)col[ií]rio\s+hipotensor(?:\s+ocular)?\b/i,
    antibiotico:  /^(\s*(?:[-•*]\s*)?)col[ií]rio\s+antibi[oó]tico\b/i,
    antialergico: /^(\s*(?:[-•*]\s*)?)col[ií]rio\s+antial[eé]rgico\b/i,
    corticoide:   /^(\s*(?:[-•*]\s*)?)col[ií]rio\s+(?:com\s+)?corticoide\b/i,
  };
  const _LINHA_MED_GENERICA_RE = /^(\s*(?:[-•*]\s*)?)medica[çc][ãa]o\s+ocular\s+prescrita\b/i;
  const _MED_NEGADO_ANTES_RE = /\b(?:nao|sem|nunca|parou|parar|pare|suspend\w*|interromp\w*|trocar|troca|trocou|tirar|tire|alergi\w*|intoleran\w*|reacao)\b/;
  const _MED_SUSPENSO_DEPOIS_RE = /^\s*(?:\w+\s+){0,2}(?:suspend|parar|parou|interromp)/;
  const _CLASSES_FORA_DO_GUARD = ['lubrificante', 'ciclopegico'];

  function _medicamentosCitadosNaFala(fala) {
    const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
    if (!Lexico || !fala) return [];
    const t = Lexico.normalizarLexico(fala);
    const validos = [];
    for (const a of Lexico.encontrarMedicamentos(fala)) {
      const antes = t.slice(Math.max(0, a.indice - 50), a.indice).split(' ').slice(-4).join(' ');
      const depois = t.slice(a.indice + a.termo.length, a.indice + a.termo.length + 30);
      if (_MED_NEGADO_ANTES_RE.test(antes) || _MED_SUSPENSO_DEPOIS_RE.test(depois)) continue;
      if (!validos.some(v => v.id === a.id)) validos.push(a);
    }
    return validos;
  }

  function _juntarNomesMedicamento(achados, Lexico) {
    return achados
      .map(a => Lexico.nomeRegistrado(a))
      .map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)))
      .join(' + ');
  }

  function _guardMedicamentoNomeadoNaFala(cloned, ctx, log) {
    const d = cloned.dados;
    const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
    if (!d || !Lexico) return;
    const citados = _medicamentosCitadosNaFala(ctx.transcribedText);
    if (!citados.length) return;

    const usados = [];
    const promoverLinha = (linha) => {
      for (const [classe, re] of Object.entries(_CLASSE_LINHA_RE)) {
        const m = linha.match(re);
        if (!m) continue;
        const doClasse = citados.filter(a => a.classe === classe);
        if (!doClasse.length || doClasse.length > 2) return linha;
        usados.push(...doClasse);
        return linha.replace(re, m[1] + _juntarNomesMedicamento(doClasse, Lexico));
      }
      const g = linha.match(_LINHA_MED_GENERICA_RE);
      if (g) {
        const elegiveis = citados.filter(a => !_CLASSES_FORA_DO_GUARD.includes(a.classe));
        if (elegiveis.length !== 1) return linha;
        usados.push(elegiveis[0]);
        return linha.replace(_LINHA_MED_GENERICA_RE, g[1] + _juntarNomesMedicamento(elegiveis, Lexico));
      }
      return linha;
    };

    let alteradas = 0;
    for (const campo of ['medicacoes_em_uso', 'tratamento']) {
      const valor = d[campo];
      if (typeof valor !== 'string' || !valor.trim()) continue;
      const novo = valor.split('\n').map(promoverLinha).join('\n');
      if (novo !== valor) { d[campo] = novo; alteradas++; }
    }
    if (!alteradas) return;

    const deVariante = usados.filter(a => {
      const entrada = Lexico.MEDICAMENTOS_LEXICO.find(e => e.id === a.id);
      return entrada && !entrada.nomes.map(Lexico.normalizarLexico).includes(Lexico.normalizarLexico(a.termo));
    });
    if (deVariante.length) {
      _pushAviso(cloned,
        'Medicação: o nome do colírio foi reconhecido por semelhança de som ' +
        `(${deVariante.map(a => `"${a.termo}" → ${a.principio}`).join(', ')}). Confira se é esse mesmo.`);
    }
    log.push(`Guard 2g: remédio nomeado na fala promovido de classe/genérico para o nome (${[...new Set(usados.map(a => a.principio))].join(', ')}; ${alteradas} campo(s))`);
  }

  /**
   * Guard 2e (log 2026-10-22): colírio MANTIDO some do tratamento.
   *
   * "o paciente está em uso de timolol duas vezes ao dia, mantido timolol": o modelo
   * deixou tratamento null por já constar em medicacoes_em_uso, e a injeção escreveu
   * "Sem prescrição de medicação" — o oposto da fala. Quando tratamento está vazio e a
   * fala liga "mantido/mantém/continua" a um remédio de medicacoes_em_uso, a linha
   * desse remédio (com a posologia já extraída) vira o tratamento. Só preenche
   * tratamento vazio; nunca altera o que o modelo escreveu.
   */
  /**
   * Guard 2e (log 2026-10-22, rev 2026-10-26): colírio MANTIDO some do tratamento.
   *
   * "o paciente está em uso de timolol duas vezes ao dia, mantido timolol": o modelo
   * deixou tratamento null por já constar em medicacoes_em_uso, e a injeção escreveu
   * "Sem prescrição de medicação" — o oposto da fala. Quando tratamento está vazio e a
   * fala liga "mantido/mantém/continua" a um remédio de medicacoes_em_uso, a linha
   * desse remédio (com a posologia já extraída) vira o tratamento.
   *
   * Extensão 2026-10-26: cobre também manutenções de conduta em retorno/controle
   * (ex: "mantido óculos retorno para controle" com timolol em uso). Se a fala tem
   * verbo de manutenção e não há ordem de suspender, as medicações ativas em uso
   * são preservadas no tratamento para impedir o placeholder "Sem prescrição de medicação".
   * Se já há tratamento (ex.: colírio novo prescrito), os mantidos são mesclados.
   */
  const _VERBO_MANTER_RE = /\b(?:mantid[oa]s?|mantem|mantenho|manter|mantendo|continu(?:a|ar|e|o|ando)|segue\s+com|seguir\s+com)\b/i;
  const _VERBO_SUSPENDER_RE = /\b(?:suspend(?:er|o|e|a|eu|ido|am|em)?|interromp(?:er|a|o|eu|ido|am|em)?|par(?:ar|o|a|ou|em)?|descontinu(?:ar|e|o|ou|em)?|retir(?:ar|o|a|ou|em)?|cort(?:ar|o|a|ou|em)?)\b/i;
  const _MANTER_GERAL_RE = /\b(?:mantid[oa]s?\s+(?:as?\s+)?(?:conduta|medicac(?:ao|oes)|remedios?|colirios?|tratamento|o\s+que|o\s+uso|prescric(?:ao|oes))|manter\s+(?:as?\s+)?(?:conduta|medicac(?:ao|oes)|remedios?|colirios?|tratamento|o\s+que|o\s+uso|prescric(?:ao|oes))|continua\s+(?:com\s+)?(?:tudo|o\s+mesmo|as?\s+mesmas?)|mesm[oa]\s+(?:conduta|tratamento))\b/i;
  const _REMEDIO_CRONICO_RE = /\b(?:timolol|trometolol|brimonidina|latanoprosta|travoprosta|bimatoprosta|dorzolamida|brinzolamida|tafluprosta|combigan|cosopt|ganfort|lubrificante|hialuronato|carmelose|carboximetilcelulose|hipromelose)\b/i;
  const _NAO_E_REMEDIO_RE = /^(?:nega|refere|uso|usa|usando|colirio|medicacao|medicacoes|ocular|oculares|nao|identificado|consulta|paciente|vezes|dia|olho|olhos|direito|esquerdo|ambos|gotas?|noite|manha|tarde|ao)$/i;

  function _guardColirioMantidoSemTratamento(cloned, ctx, log) {
    const d = cloned.dados;
    if (!d) return;
    const em_uso = d.medicacoes_em_uso || d.uso;
    if (!em_uso) return;
    const fala = _normalizeForGuard(ctx.transcribedText);
    if (!_VERBO_MANTER_RE.test(fala)) return;

    const linhas = String(em_uso).split(/[\n;,]+/).map(l => l.trim()).filter(Boolean);
    const ehRetorno = ctx.tipoConsulta === 'retorno' || cloned.tipo_consulta === 'retorno' || /\b(?:retorno|controle|acompanhamento)\b/.test(fala);
    const temManutencaoGeral = _MANTER_GERAL_RE.test(fala);

    const mantidas = linhas.filter(linha => {
      const normLinha = _normalizeForGuard(linha);
      if (/^nega\b|^refere uso de colirio \(nao identificado/i.test(normLinha)) return false;
      const nomes = (normLinha.match(/[a-z]{4,}/g) || []).filter(w => !_NAO_E_REMEDIO_RE.test(w));
      if (!nomes.length) return false;

      // Se houver ordem expressa de suspender este remédio específico na fala, não mantém
      const suspenso = nomes.some(nome => {
        const reSusp = new RegExp(`(?:${_VERBO_SUSPENDER_RE.source})\\s+(?:com\\s+)?(?:o|a|os|as)?\\s*${nome}|${nome}\\s+(?:suspend|interromp|par|descontinu|retir|cort)`, 'i');
        return reSusp.test(fala);
      });
      if (suspenso) return false;

      // 1. Verbo de manutenção colado ao remédio (regra estrita existente)
      const pertoDoRemedio = nomes.some(nome => {
        const re = new RegExp(`\\b${nome}\\b`, 'g');
        let m;
        while ((m = re.exec(fala))) {
          const janela = fala.slice(Math.max(0, m.index - 40), m.index + nome.length + 40);
          if (_VERBO_MANTER_RE.test(janela)) return true;
        }
        return false;
      });
      if (pertoDoRemedio) return true;

      // 2. Manutenção geral de conduta/medicação
      if (temManutencaoGeral) return true;

      // 3. Em retorno/controle, se houve verbo de manutenção ("mantido óculos", "manter", etc.)
      // e a linha tem posologia ou remédio oftálmico crônico ativo (hipotensor/lubrificante):
      if (ehRetorno && (/\d+x|vezes|dia|noite|manha|gota|continu/i.test(normLinha) || _REMEDIO_CRONICO_RE.test(normLinha))) {
        return true;
      }

      return false;
    });

    if (!mantidas.length) return;

    if (!d.tratamento || !String(d.tratamento).trim()) {
      d.tratamento = mantidas.join('\n');
      log.push(`Guard 2e: tratamento vazio preenchido com colírio mantido na fala (${mantidas.length} linha(s))`);
    } else {
      // Se já tem tratamento, certificar que os remédios mantidos não foram esquecidos
      const tratNorm = _normalizeForGuard(d.tratamento);
      const faltantes = mantidas.filter(m => {
        const nomesM = (_normalizeForGuard(m).match(/[a-z]{4,}/g) || []).filter(w => !_NAO_E_REMEDIO_RE.test(w));
        return !nomesM.some(nome => tratNorm.includes(nome));
      });
      if (faltantes.length > 0) {
        d.tratamento = d.tratamento.trim() + '\n' + faltantes.join('\n');
        log.push(`Guard 2e: colírio(s) mantido(s) adicionado(s) ao tratamento (${faltantes.length} linha(s))`);
      }
    }
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
      // Nome registrado quando o médico diz "lubrificante" (Guard 2f): o modelo pode
      // escrevê-lo direto, e a linha continua sendo tratamento, nunca conduta.
      /carmelose\s+s[óo]dica\s+ou\s+hialuronato/i,
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
   * Guard 2f (2026-11-05): LUBRIFICANTE dito vira o registro padrão do médico.
   *
   * Protocolo declarado: toda vez que o médico diz "lubrificante(s)" na conduta, o
   * prontuário registra "Carmelose sódica ou hialuronato de sódio" — são os dois
   * genéricos equivalentes que ele prescreve, escolha dele, não inferência.
   *
   * Limites deliberados:
   *  1) Só RENOMEIA linha que o modelo já escreveu ("Lubrificante ocular …"); nunca cria
   *     prescrição (a REGRA ANTI-INVENÇÃO governa o *se*, este guard governa o *nome*).
   *  2) Marca dita (Systane…) ou princípio dito (hialuronato, carmelose) vence: a fala
   *     já nomeou o produto, então o guard não toca em nada.
   *  3) Marca entre parênteses na própria linha também o inibe.
   *  4) Exige a palavra "lubrificante(s)" na fala — "lágrima artificial" não dispara.
   * A posologia da linha ("AO ao longo do dia", "6/6h") sobrevive intacta.
   *
   * Roda DEPOIS de _guardCondutaContaminada (que traz o lubrificante da conduta para o
   * tratamento) e dos guards do protocolo da blefarite, que ainda leem o nome antigo.
   */
  const LUBRIFICANTE_PADRAO = 'Carmelose sódica ou hialuronato de sódio';
  const _LUBRIFICANTE_FALA_RE = /\blubrificantes?\b/;
  const _LUBRIFICANTE_NOMEADO_RE = /\b(?:systane|hylo|hyabak|artelac|optive|refresh|lacrifilm|carmelose|carboximetilcelulose|hialuronato|hialuronico)\b/;
  // Início da linha: "Lubrificante ocular", "Lubrificantes oculares", "Colírio lubrificante".
  // O lookahead recusa "(Marca)" colada ao nome.
  const _LINHA_LUBRIFICANTE_RE = /^(\s*(?:[-•*]\s*)?)(?:col[íi]rio\s+)?lubrificantes?(?:\s+ocular(?:es)?)?(?![A-Za-zÀ-ÿ])(?!\s*\()/i;

  function _guardLubrificanteGenerico(cloned, ctx, log) {
    const d = cloned.dados;
    if (!d || !d.tratamento) return;
    const fala = _normalizeForGuard(ctx.transcribedText);
    if (!_LUBRIFICANTE_FALA_RE.test(fala)) return;
    if (_LUBRIFICANTE_NOMEADO_RE.test(fala)) return;

    let trocadas = 0;
    const linhas = String(d.tratamento).split('\n').map(linha => {
      if (_normalizeForGuard(linha).match(_LUBRIFICANTE_NOMEADO_RE)) return linha;
      const m = linha.match(_LINHA_LUBRIFICANTE_RE);
      if (!m) return linha;
      trocadas++;
      return m[1] + LUBRIFICANTE_PADRAO + linha.slice(m[0].length);
    });
    if (!trocadas) return;

    d.tratamento = linhas.join('\n');
    log.push(`Guard 2f: lubrificante dito → "${LUBRIFICANTE_PADRAO}" (${trocadas} linha(s))`);
  }

  /**
   * Par longe+perto COLADO ("longe e perto", "longe perto junto", "perto e longe")
   * com uma âncora na janela de ~10 palavras de cada lado.
   *
   * Compartilhado por _guardMultifocalSemEvidencia e _guardPresbiopiaObrigatoria:
   * os dois liam a MESMA evidência clínica com regexes separadas, e foi a divergência
   * entre elas que apagou o multifocal legítimo de 2026-08-27 (a presbiopia sobreviveu,
   * o tipo da lente não). Cada guard passa a própria âncora — a do multifocal é mais
   * estreita, ver ANCORA_PRESCRICAO_OCULOS.
   *
   * A adjacência é o filtro anti-ASR: "não é para perto, sim para longe, não"
   * (log 2026-08-05) não casa porque há palavra no meio.
   */
  function _hasParLongePertoAncorado(cleanText, ancoraRe) {
    // Instância nova por chamada: /g carrega lastIndex entre usos.
    const par = /longe\s+(?:e\s+)?(?:de\s+|para\s+|pra\s+)?perto|perto\s+(?:e\s+)?(?:de\s+|para\s+|pra\s+)?longe/g;
    let m;
    while ((m = par.exec(cleanText)) !== null) {
      const janela = cleanText.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
      if (ancoraRe.test(janela)) return true;
    }
    return false;
  }

  /**
   * Guard 3b: "multifocais/bifocais/progressivos" na conduta SEM a palavra na fala.
   *
   * Origem (log 2026-08-05, consulta das 17:54): a conduta saiu "Prescrição de
   * óculos multifocais com orientações sobre o uso" numa consulta em que o médico
   * nunca disse multifocal. O modelo apoiou-se no critério (c) do prompt (um único
   * óculos que atende longe E perto) lendo como evidência de perto uma queixa
   * sobre os óculos ANTIGOS ("esse aqui era muito miopia, incomoda demais para
   * perto") e um trecho de pergunta/resposta cheio de negativas que o ASR
   * embaralhou ("não é para perto, sim para longe, não"). O tipo da lente é
   * decisão clínica: inferi-lo de co-ocorrência de tokens fabrica prescrição.
   *
   * Regra: o qualificador de tipo só sobrevive se a palavra (multifocal,
   * progressivo, bifocal — singular ou plural) aparecer na TRANSCRIÇÃO. Sem ela,
   * a linha cai para "Prescrição de óculos", preservando qualquer sufixo de
   * orientação ("com orientações sobre o uso"). Não é veto à prescrição — é veto
   * ao tipo inferido.
   *
   * 2026-08-27 (consulta das 13:04): a exigência da palavra literal era estreita
   * DEMAIS. O médico descreveu o multifocal sem nomeá-lo — "tem grau de longe perto
   * junto, aí eu vou fazer a receita" — e o guard rebaixou uma conduta correta. O
   * prompt (2º critério de "multifocais") e a SKILL sempre aceitaram "longe + perto
   * na mesma armação"; só a rede determinística não aceitava. Segunda porta: o par
   * longe+perto COLADO, com contexto de PRESCRIÇÃO na janela.
   *
   * A âncora aqui é mais estreita que a do guard de presbiopia de propósito. Lá
   * basta "grau"/"óculos" na janela, porque a pergunta é "este paciente é présbita?"
   * — e comentar que os óculos atendem longe e perto já responde. Aqui a pergunta é
   * "o médico prescreveu multifocal AGORA?", e SKILL.md exige que a referência seja
   * sobre o óculos sendo prescrito nesta consulta. Sem verbo de prescrição na janela,
   * "os óculos estão bons, enxerga de longe e de perto" viraria multifocal.
   *
   * Roda ANTES de _guardPresbiopiaObrigatoria de propósito: PADRAO_MULTIFOCAL
   * testa a conduta, então a conduta fabricada arrastava H524 junto (foi o que
   * aconteceu na mesma consulta). Limpar a conduta depois deixaria meia correção.
   */
  function _guardMultifocalSemEvidencia(cloned, ctx, log) {
    if (!cloned.dados || !cloned.dados.conduta) return;

    const PALAVRA_TIPO_RE = /multifoca(?:l|is)|bifoca(?:l|is)|progressiv[oa]s?/i;
    if (!PALAVRA_TIPO_RE.test(cloned.dados.conduta)) return;

    const transcricaoNorm = _normalizeForGuard(ctx.transcribedText || '');
    if (/multifoca(?:l|is)|bifoca(?:l|is)|progressiv/.test(transcricaoNorm)) return;

    // Segunda porta: longe + perto na MESMA armação, dita junto da prescrição.
    // A âncora é o ato de prescrever ("vou fazer a receita", "vou passar", "receita
    // nova", "armação"), não a mera presença de "óculos"/"grau" na frase.
    const ANCORA_PRESCRICAO_OCULOS =
      /receita|prescrev|prescricao|armacao|vou\s+(?:fazer|passar|deixar|dar|receitar)|vai\s+(?:fazer|usar|levar)|fazer\s+(?:um|uns|o|os)\s+oculos/;
    const cleanText = transcricaoNorm.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ');
    if (_hasParLongePertoAncorado(cleanText, ANCORA_PRESCRICAO_OCULOS)) return;

    // "Prescrição de óculos multifocais [resto]" → "Prescrição de óculos [resto]".
    // Ancorado na forma canônica que o prompt manda emitir. Fraseado fora dela
    // ("Uso de lente progressiva") passa intacto e continua alimentando
    // PADRAO_MULTIFOCAL — buraco aceito: reescrever uma linha de forma livre
    // arriscaria mutilar conduta legítima, e o prompt já proíbe esse fraseado.
    const LINHA_RE = /^(\s*prescri[çc][ãa]o de [oó]culos)\s+(?:multifoca(?:l|is)|bifoca(?:l|is)|progressiv[oa]s?)\b/i;
    const linhas = cloned.dados.conduta.split('\n');
    const alteradas = [];
    const corrigidas = linhas.map(linha => {
      if (!LINHA_RE.test(linha)) return linha;
      const nova = linha.replace(LINHA_RE, '$1');
      alteradas.push(linha.trim());
      return nova;
    });

    if (!alteradas.length) return;
    cloned.dados.conduta = corrigidas.join('\n');
    log.push(`Tipo de lente removido da conduta — "multifocal/bifocal/progressivo" não foi dito na consulta (linha original: "${alteradas.join('; ')}")`);
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

  // Frase negativa padrão de antecedentes oftalmológicos, como o prompt a define.
  const _NEGATIVA_ANTEC_OFT_RE = /^\s*nega\s+diagn[oó]sticos?\s+e\s+procedimentos?\s+oftalmol[oó]gicos?\s+pr[eé]vios?\s*\.?\s*$/i;

  // Evidência, na TRANSCRIÇÃO, de história ocular anterior a esta consulta.
  // Deliberadamente estreita: são frases que o paciente/médico só produz quando
  // já houve encontro, diagnóstico ou procedimento oftalmológico prévio. Termos
  // soltos ("glaucoma", "catarata") ficam de fora de propósito — o médico os
  // pronuncia ao PERGUNTAR ("alguém na família tem glaucoma?"), e transformar a
  // pergunta em evidência é o mesmo erro, invertido.
  // (Testadas sobre texto já normalizado por _normalizeForGuard: minúsculas e
  // SEM acentos — por isso os padrões não trazem acentuação.)
  const _PRIOR_OFT_EVIDENCE_RE = [
    /\bja\s+(fui|foi|passei|passou|consultei|consultou)\s+(no|na|com|em)\s+(oftalmo|oculista|outro\s+medico)/,
    /\bultima\s+consulta\b/,
    /\bconsulta\s+(passada|anterior)\b/,
    /\bja\s+(me\s+)?(falaram|disseram|falou|disse)\s+que\s+(eu\s+)?(tenho|tinha|tem)\b/,
    // Simulação 2026-11-08 (D23): diagnóstico dado por OUTRO profissional, sem "já".
    /\b(outro|outra)\s+(medico|medica|doutor|doutora|oftalmo|oftalmologista|oculista)\s+(me\s+)?(falou|disse|falaram|disseram)\s+que\s+(eu\s+)?(tenho|tinha|tem|tava|estava)\b/,
    /\b(me\s+)?(falaram|disseram)\s+que\s+eu\s+(tenho|tinha|tava|estava)\b/,
    // D22: laser/YAG em 1ª pessoa ou no passado ("já fiz laser", "fizeram laser no olho").
    // "vamos fazer laser" (plano de hoje) fica de fora: infinitivo não casa.
    /\b(fiz|fizeram|fez|feito|fizemos)\s+(um\s+|uma\s+|o\s+|a\s+)?(laser|lazer|yag|capsulotomia|fotocoagulacao|panfotocoagulacao)\b/,
    /\bja\s+(tenho|tinha|tive)\s+(diagnostico|glaucoma|catarata|pressao\s+alta\s+no\s+olho|pressao\s+ocular)/,
    /\b(descobriram|descobri|descobriu)\s+(o|a)\s+(glaucoma|catarata|pressao)/,
    /\bja\s+(operou|operei|operado|operada)\b/,
    /\b(fez|fiz|feito)\s+(uma\s+)?cirurgia\s+(no|nos|do|dos)\s+olhos?\b/,
    /\bja\s+(usa|uso|usava|usei)\s+colirio\s+(pra|para|de)\s+(pressao|glaucoma)/,
    /\btrat(a|o|ava|amento)\s+(de|para|pra)\s+glaucoma\b/,
    // Lente de contato (log 2026-08-06): usar lente é história ocular prévia, e a
    // negativa saía junto com a HDA descrevendo 2 anos de uso. A menção NUA de
    // "lente de contato" fica de fora — o médico a pronuncia ao PERGUNTAR; exige-se
    // verbo de uso em 1ª pessoa, prazo, ou a orientação corretiva (que só se dá a
    // quem usa). "usa lente" em 3ª pessoa fica de fora: é a forma da PERGUNTA
    // ("o senhor usa lente de contato?"), e virou falso positivo em teste.
    /\b(uso|usava|usei|usando)\s+(a|as|essa|essas|minha|minhas|de)?\s*lentes?\b/,
    /\blentes?\s+de\s+contato\s+(ha|desde|faz|tem)\b/,
    /\b(adaptaram|adaptou|adaptei|adaptada|adaptacao)\s+(a|essa|minha)?\s*lentes?\b/,
    /\btirar?\s+(a\s+)?lente\s+(pra|para)\s+dormir\b/,
    /\bdormir\s+(de|com)\s+lentes?\b/,
  ];
  // Óculos de grau é deliberadamente omitido daqui: também é antecedente, mas a
  // maioria dos pacientes usa óculos — guardar por isso esvaziaria o campo em quase
  // toda consulta. Óculos fica a cargo do prompt (regra específica para óculos).

  // Marcas de história ocular prévia nos CAMPOS já redigidos pelo modelo.
  // Aqui o texto é prosa clínica escrita pelo próprio LLM (não ruído de ASR),
  // então o vocabulário pode ser mais direto — mas cada marca precisa apontar
  // para um ENCONTRO/PROCEDIMENTO anterior, não para o tempo do sintoma atual.
  // "há 2 anos" e "prévio" soltos ficaram de fora de propósito: "Baixa de visão
  // progressiva há 2 anos" é a HDA mais comum que existe, e "sem tratamento
  // prévio" é uma NEGATIVA — as duas derrubariam a negativa em consulta de rotina.
  const _PRIOR_OFT_IN_FIELDS_RE = new RegExp([
    'consulta\\s+(pr[eé]via|anterior|passada)',
    'diagnosticad[oa]\\s+(em|h[aá]|previamente|por)\\b',   // "…hoje/nesta consulta" não casa
    'j[aá]\\s+(diagnosticad[oa]|indicad[oa]|operad[oa]|tratad[oa])',
    'cirurgia\\s+(j[aá]\\s+)?indicada',
    'indica[çc][ãa]o\\s+cir[uú]rgica\\s+(pr[eé]via|anterior)',
    'acompanhamento\\s+(pr[eé]vio|anterior)',
    'outro\\s+(servi[çc]o|m[eé]dico)',
    // Aqui a prosa é do próprio modelo: se ELE escreveu que o paciente usa lente de
    // contato, a negativa de antecedentes no mesmo JSON é autocontraditória.
    'usu[aá]ri[oa]\\s+de\\s+lentes?',
    'lentes?\\s+de\\s+contato',
  ].join('|'), 'i');

  /**
   * Guard 8 (log 2026-08-03): a negativa de antecedentes oftalmológicos era
   * FABRICADA. O prompt manda usar a frase negativa padrão sempre que o médico
   * perguntou e nenhuma resposta positiva foi capturada — regra criada para o
   * campo vazio, mas que, com ASR ruim, escreve no prontuário que o paciente
   * NEGOU o que ele de fato relatou. Nesta consulta o paciente havia relatado
   * glaucoma prévio e o campo saiu "Nega diagnósticos e procedimentos
   * oftalmológicos prévios"; a HDA do MESMO JSON descrevia consulta anterior com
   * catarata diagnosticada e cirurgia indicada — duas afirmações contraditórias
   * no mesmo prontuário.
   *
   * O guard é ESTRITAMENTE SUBTRATIVO: nunca escreve um antecedente (isso
   * recriaria a alucinação que a frase negativa veio conter). Ele apenas retira
   * a afirmação falsa, deixa o campo em branco e chama o médico para preencher.
   * Recusar-se a afirmar é sempre seguro; afirmar não é.
   */
  function _guardAntecedentesNegativaFabricada(cloned, ctx, log) {
    const d = cloned.dados;
    if (!d) return;
    const valor = d.antecedentes_oftalmologicos;
    if (typeof valor !== 'string' || !_NEGATIVA_ANTEC_OFT_RE.test(valor)) return;

    // (a) Contradição interna: os campos que o próprio modelo redigiu já contam
    // uma história ocular anterior a hoje.
    const camposNarrativos = [d.hda, d.retorno, d.medicacoes_em_uso, d.diagnostico]
      .filter(v => typeof v === 'string').join(' \n ');
    const contradizCampos = _PRIOR_OFT_IN_FIELDS_RE.test(camposNarrativos);

    // (b) Evidência direta na transcrição.
    const norm = _normalizeForGuard(ctx.transcribedText || '');
    const contradizTranscricao = _PRIOR_OFT_EVIDENCE_RE.some(re => re.test(norm));

    if (!contradizCampos && !contradizTranscricao) return;

    d.antecedentes_oftalmologicos = null;
    const origem = [contradizCampos && 'campos da própria análise', contradizTranscricao && 'transcrição']
      .filter(Boolean).join(' + ');
    _pushAviso(cloned, 'Antecedentes oftalmológicos: a negativa automática foi removida — há sinais de história ocular prévia nesta consulta. Preencha o campo manualmente.');
    log.push(`Guard 8: negativa de antecedentes_oftalmologicos removida (evidência de história prévia em: ${origem})`);
  }

  // Frase negativa padrão de comorbidades, como o prompt a define.
  const _NEGATIVA_COMORBIDADES_RE = /^\s*nega\s+comorbidades\s*\.?\s*$/i;

  // Pergunta sistêmica do médico — os fraseados que ele realmente usa no
  // consultório ("tem alguma doença…", "toma remédio sempre?"). Serve de ÂNCORA:
  // a resposta afirmativa só conta quando vem logo depois de uma destas.
  // (Aplicado sobre texto já normalizado por _normalizeForGuard: minúsculo e
  // sem acentos.)
  const _PERGUNTA_SISTEMICA_RE = /alguma\s+doenca|outras\s+doencas|tomar\s+remedio\s+sempre|toma\s+(algum\s+)?remedio|usa\s+algum\s+remedio|remedio\s+sempre|sempre\s+no\s+medico|acompanhar\s+com\s+o\s+medico|faz\s+(algum\s+)?tratamento/g;

  // Resposta afirmativa do paciente. Janela curta (40 chars) depois da pergunta:
  // é onde a resposta cai numa transcrição sem pontuação.
  const _AFIRMATIVA_SISTEMICA_RE = /\b(sim|tenho|tomo|faco\s+uso|sou\s+diabetic|sou\s+hipertens)\b/;

  // Doença/medicação sistêmica NOMEADA em qualquer ponto da consulta.
  // "pressao alta" carrega uma armadilha oftalmológica: em metade das consultas
  // ela é a pressão DO OLHO ("a pressão do olho está alta"), que não é comorbidade
  // sistêmica. O lookahead descarta esse uso; a hipertensão sistêmica ainda entra
  // por "hipertens*" e pelos anti-hipertensivos nomeados.
  const _DOENCA_SISTEMICA_RE = /\bdiabet\w*|acucar\s+(alto|no\s+sangue)|glicemi\w*|hipertens\w*|pressao\s+alta(?!\s+(n?[oa]s?|d[oa]s?)\s+olhos?|\s+ocular)|tireoid\w*|colesterol|insulina|metformina|losartan|enalapril|anlodipino|atenolol|hidroclorotiazida|sinvastatina|levotiroxina|anticoagulant\w*|varfarina|marevan/;

  /**
   * Guard 9 (log 2026-08-04): "Nega comorbidades" FABRICADA. Mesma classe do
   * Guard 8, no campo vizinho. À pergunta "tem alguma doença que precisa ir
   * sempre no médico ou tomar remédio sempre?" o paciente respondeu "sim" — e
   * alteracoes_sistemicas saiu "Nega comorbidades". O diabetes dele não entrou no
   * prontuário, e o campo passou a AFIRMAR uma negativa que o paciente não deu.
   *
   * A negativa implícita do prompt existe para a pergunta SEM RESPOSTA; com
   * resposta afirmativa ela é uma mentira. Aqui verificamos duas evidências:
   *   (a) afirmativa do paciente logo após uma pergunta sistêmica;
   *   (b) doença/medicação sistêmica nomeada em qualquer ponto da fala.
   *
   * ESTRITAMENTE SUBTRATIVO, como o Guard 8: nunca escreve "Diabetes mellitus" a
   * partir do token "diabetes" — o próprio médico pronuncia a palavra ao PERGUNTAR
   * ("tem diabetes?"), e transformar a pergunta em diagnóstico é o mesmo erro
   * invertido. O guard retira a afirmação falsa, deixa o campo em branco e chama o
   * médico. Quem REGISTRA a doença é o prompt (regra de alteracoes_sistemicas).
   */
  function _guardComorbidadesNegativaFabricada(cloned, ctx, log) {
    const d = cloned.dados;
    if (!d) return;
    const valor = d.alteracoes_sistemicas;
    if (typeof valor !== 'string' || !_NEGATIVA_COMORBIDADES_RE.test(valor)) return;

    const norm = _normalizeForGuard(ctx.transcribedText || '');

    // (a) afirmativa na janela imediatamente posterior à pergunta sistêmica
    let respostaAfirmativa = false;
    _PERGUNTA_SISTEMICA_RE.lastIndex = 0;
    let m;
    while ((m = _PERGUNTA_SISTEMICA_RE.exec(norm)) !== null) {
      const janela = norm.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (_AFIRMATIVA_SISTEMICA_RE.test(janela)) { respostaAfirmativa = true; break; }
    }

    // (b) doença sistêmica nomeada em qualquer ponto (inclusive fora do bloco de
    // anamnese — é onde o paciente costuma soltar "eu sou diabético")
    const doencaNomeada = _DOENCA_SISTEMICA_RE.test(norm);

    if (!respostaAfirmativa && !doencaNomeada) return;

    d.alteracoes_sistemicas = null;
    const origem = [respostaAfirmativa && 'resposta afirmativa à pergunta sistêmica',
      doencaNomeada && 'doença/medicação sistêmica citada na consulta'].filter(Boolean).join(' + ');
    _pushAviso(cloned, 'Doenças sistêmicas: a negativa automática ("Nega comorbidades") foi removida — ' +
      'a consulta indica que o paciente TEM comorbidade (resposta afirmativa ou doença citada). ' +
      'Preencha o campo manualmente.');
    log.push(`Guard 9: negativa de alteracoes_sistemicas removida (evidência: ${origem})`);
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

  // ------------------------------------------------------------------
  // PSEUDOFACIA SEM EVIDÊNCIA NA FALA (log 2026-09-02)
  // ------------------------------------------------------------------
  //
  // Consulta real: o médico perguntou "já teve algum tratamento, cirurgia,
  // acidente?" e a paciente respondeu "nos dois". O TIPO da cirurgia nunca foi
  // dito. O modelo deduziu catarata, escreveu nos antecedentes "cirurgia nos dois
  // olhos (confirmado como cirurgia de catarata pela presença de LIOs)" — uma
  // dedução circular — e daí saíram Z961 AO, "pseudofacia, LIO transparente e bem
  // posicionada" na biomicroscopia e, por tabela, a REMOÇÃO da H52.4 legítima pelo
  // veto de pseudofacia bilateral. Uma alucinação, dois erros de prontuário.
  //
  // parsePseudofaciaFromDados() não tem culpa: ele leu fielmente um antecedente
  // fabricado. A rede determinística precisa ser ANTERIOR a ele — confrontar a
  // afirmação de lente com a FALA, que é a única fonte primária.
  //
  // Vocabulário deliberadamente AMPLO (política de log-2026-07-29-blefarite-leiga e
  // log-2026-08-27-multifocal-apagado: guard literal estreito já apagou achado real
  // duas vezes neste repo). Falso negativo aqui = comportamento de hoje; falso
  // positivo = apaga uma lente verdadeira. Inclui as formas leigas do médico e a
  // mutilação de ASR já vista ("catara ta").
  //
  // "cirurgia"/"cirúrgico" ficam de FORA da lista de propósito: cirurgia de tipo não
  // especificado é exatamente o vetor da fabricação. "operou/operei/operado" ficam
  // DENTRO — são os gatilhos de voz de LIO que o médico já configurou (CASO8-9), e
  // discordar deles aqui criaria duas regras para o mesmo fato.
  //
  // "lente" SOLTA fica de fora: é a mesma palavra da lente de contato e da lente do
  // óculos ("queria ver de lente", "a lente do óculos riscou") — aceitá-la faria o
  // guard não disparar justamente na consulta que o motivou. Entram as formas em que
  // a lente é a INTRAOCULAR: o médico falando dela no exame, ou o relato do implante.
  const _LENTE_EVIDENCIA_RE = new RegExp([
    'catarat|catara\\s?ta|cata\\s?rata|facectomia|facoemulsif|\\blios?\\b|intra\\s?ocular',
    'pseudofac|\\byag\\b|capsulotomi|implant',
    // "operou/operei" SOZINHO ficou de fora (revisão 2026-09-02): a paciente do caso
    // tinha sido operada de PTERÍGIO nos dois olhos — cirurgia relatada, tipo dito, e
    // nenhuma delas é lente. Verbo de cirurgia só conta quando o objeto é a catarata,
    // e essa forma já entra pelo `catarat` acima.
    // formas leigas do médico sobre a LIO (ver a regra de opacidade de cápsula no prompt)
    'lente\\s+intra',
    '(?:coloc|bot|po[sô]|troc|limp)\\w*\\s+(?:a|as|uma|duas|essa)?\\s*lentes?',
    // ordem inversa, com o verbo depois: "a lente multifocal que a senhora colocou"
    'lentes?\\s+(?:\\w+\\s+){0,4}(?:coloc|implant|bot|po[sô]|troc)\\w*',
    'limpeza\\s+d[ao]s?\\s+lentes?',
    '\\b(?:a|as)\\s+lentes?\\s+(?:esta|estao|est\\wo|ta|tao|t\\wo|ficou|ficaram|e)\\b',
    'lentes?\\s+(?:transparente|bem\\s+posicionada|opacificada|do\\s+olho|dentro\\s+do\\s+olho)',
  ].join('|'));

  // Afirmações de lente na SAÍDA do modelo (o que o guard procura para desfazer).
  const _LENTE_AFIRMADA_SRC = 'pseudofac\\w*|lentes?\\s+intra-?\\s?ocular(?:es)?|\\bLIOs?\\b|\\bZ\\s?96\\.?1\\b|facectomia\\w*|facoemulsifica\\w*|cirurgia(?:\\s+\\S+){0,2}\\s+de\\s+catarata|catarata\\s+operada|operad[ao]s?\\s+de\\s+catarata';
  const _NEUTRO_CIRURGIA = 'cirurgia ocular prévia (tipo não especificado)';

  // Marca as respostas em que a pseudofacia foi desfeita por falta de evidência —
  // lida por _pseudofaciaBilateral. Sem isto o veto de presbiopia continuaria vendo
  // o `ctx.pseudofacia` que o caller calculou sobre os dados AINDA fabricados
  // (sidepanel-audio.js:638 e :960) e mataria a H52.4 assim mesmo.
  const _SEM_EVIDENCIA_DE_LENTE = new WeakSet();

  /**
   * Remove de um campo narrativo (antecedentes/hda/retorno) a afirmação de lente
   * ou de cirurgia de catarata, PRESERVANDO a cirurgia realmente relatada.
   *
   * Estratégia em duas passadas, nesta ordem:
   *   1. parêntese inteiro que contenha a afirmação sai — é onde o modelo põe a
   *      dedução ("(confirmado como cirurgia de catarata pela presença de LIOs)");
   *   2. o que sobrar vira o termo neutro — deletar a frase apagaria a cirurgia
   *      que o paciente de fato relatou, que é antecedente legítimo.
   */
  function _neutralizaLenteNarrativa(texto) {
    if (!texto) return texto;
    const afirmada = new RegExp(_LENTE_AFIRMADA_SRC, 'i');
    const afirmadaG = new RegExp(_LENTE_AFIRMADA_SRC, 'gi');
    const neutroRepetido = new RegExp(
      `(${_NEUTRO_CIRURGIA.replace(/[()]/g, '\\$&')})(?:[\\s,;e]+\\1)+`, 'gi');

    return texto
      .split('\n')
      .map(linha => {
        let l = linha.replace(/\s*\([^)]*\)/g, par => afirmada.test(par) ? '' : par);
        if (afirmada.test(l)) {
          l = l.replace(afirmadaG, _NEUTRO_CIRURGIA).replace(neutroRepetido, '$1');
        }
        return l.replace(/\s{2,}/g, ' ').replace(/\s+([,;.])/g, '$1').trim();
      })
      .filter(l => l)
      .join('\n');
  }

  /**
   * Guard 5b: desfaz pseudofacia/LIO que o modelo afirmou sem que a consulta
   * tenha falado de lente, catarata ou olho operado.
   *
   * Roda ANTES de _guardPresbiopiaObrigatoria: o veto de pseudofacia bilateral é
   * regente lá dentro, então limpar depois deixaria a H52.4 apagada por uma lente
   * que já não existe.
   *
   * Sem transcrição não faz nada — não há fonte primária contra a qual confrontar.
   */
  function _guardPseudofaciaSemEvidencia(cloned, ctx, log) {
    if (!cloned.dados) return;
    const fala = _normalizeForGuard(ctx.transcribedText || '');
    if (!fala || _LENTE_EVIDENCIA_RE.test(fala)) return;

    const d = cloned.dados;
    const afirmada = new RegExp(_LENTE_AFIRMADA_SRC, 'i');
    const alterados = [];

    // 1) Diagnóstico: linha inteira fora. Z96.1/pseudofacia não têm meia-verdade —
    //    ou o olho foi operado, ou não foi.
    if (d.diagnostico && afirmada.test(d.diagnostico)) {
      const restantes = d.diagnostico.split('\n')
        .filter(l => l.trim() && !afirmada.test(l));
      d.diagnostico = restantes.join('\n').trim();
      alterados.push('diagnóstico');
    }

    // 2) Biomicroscopia: a lente afirmada volta a ser o cristalino. Sem cirurgia
    //    dita e sem catarata descrita, o olho é fácico — é o mesmo texto do
    //    template normal, não uma afirmação nova.
    if (d.biomicroscopia && afirmada.test(d.biomicroscopia)) {
      d.biomicroscopia = d.biomicroscopia
        .replace(/pseudofacia\s*,?\s*(?:LIOs?[^,\n]*|opacidade\s+de\s+c[áa]psula[^,\n]*)?/gi,
                 'cristalino transparente')
        .replace(/\b(cristalino transparente)(?:\s*,\s*cristalino transparente)+/gi, '$1')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,;.])/g, '$1');
      alterados.push('biomicroscopia');
    }

    // 3) Campos narrativos — são as fontes de parsePseudofaciaFromDados na injeção
    //    (sidepanel-injection.js:639). Sem limpá-los, a lente ressuscita lá.
    for (const campo of ['antecedentes_oftalmologicos', 'hda', 'retorno']) {
      if (d[campo] && afirmada.test(d[campo])) {
        d[campo] = _neutralizaLenteNarrativa(d[campo]);
        alterados.push(campo);
      }
    }

    if (!alterados.length) return;
    _SEM_EVIDENCIA_DE_LENTE.add(cloned);
    log.push(`Pseudofacia/LIO removida de ${alterados.join(', ')} — a consulta não falou de lente, catarata nem olho operado (cirurgia de tipo não especificado não é evidência de pseudofacia)`);
  }

  // Vocabulário mínimo para o médico ter falado do nervo/pressão/glaucoma ou colírios hipotensores. ASR-tolerante.
  const _NERVO_EVIDENCIA_RE = /nervo|papila|disc[oa]\s*optic|escava[cç]|excava[cç]|glaucom|pressa[oõ]|tens[aã]o\s+ocular|\bpio\b|brimonidina|timolol|latanoprosta|travoprosta|bimatoprosta|dorzolamida|brinzolamida|tafluprosta/;
  const _NERVO_AFIRMADO_RE = /nervo|papila|disco\s*[óo]ptic|escava[cç]|excava[cç]|glaucom|\bH40\d?\b/i;
  // Na fundoscopia, só sai o trecho de nervo que afirma DOENÇA; descrição normal fica.
  const _NERVO_DOENCA_RE = /altera[cç]|alterad|suspeit|sugestiv|aumentad|glaucom|assimetr|fora\s+do\s+padr|\bH40|0[,.][5-9]|escavad|p[aá]lid|edema|atrofi|entalhe|notch|hemorrag/i;

  /**
   * Guard 5c: alteração de nervo óptico / suspeita de glaucoma sem que a consulta
   * tenha falado de nervo, papila, escavação, glaucoma ou pressão (log 2026-09-29).
   *
   * Causa-raiz: o prompt trazia, como "caso real", a fala literal "o nervo do olho
   * do senhor tá um pouquinho fora do padrão" e o modelo a citou como se fosse do
   * médico numa consulta de miopia. O exemplo foi reescrito; este guard é a rede
   * determinística contra o mesmo vazamento vindo de outra fonte.
   * Sem transcrição não faz nada.
   */
  function _guardNervoOpticoSemEvidencia(cloned, ctx, log) {
    if (!cloned.dados) return;
    const fala = _normalizeForGuard(ctx.transcribedText || '');
    if (!fala || _NERVO_EVIDENCIA_RE.test(fala)) return;

    const d = cloned.dados;
    const alterados = [];

    // Diagnóstico: cada linha é um CID — a linha de nervo/glaucoma sai inteira.
    if (d.diagnostico && _NERVO_AFIRMADO_RE.test(d.diagnostico)) {
      d.diagnostico = String(d.diagnostico).split('\n')
        .filter(l => l.trim() && !_NERVO_AFIRMADO_RE.test(l)).join('\n').trim();
      alterados.push('diagnostico');
    }

    // Fundoscopia: sai só o TRECHO que afirma doença de nervo. A descrição normal
    // ("escavação simétrica e fisiológica" do texto padrão) e os achados de retina
    // na mesma linha ficam (regressão D29, simulação 2026-11-08: o guard apagava a
    // fundoscopia normal inteira numa consulta de pterígio).
    if (d.fundoscopia && _NERVO_AFIRMADO_RE.test(d.fundoscopia)) {
      const antes = String(d.fundoscopia);
      const depois = antes.split('\n').map(linha => {
        const trechos = linha.split(/(,\s+|;\s*)/);
        const out = [];
        for (let i = 0; i < trechos.length; i += 2) {
          const t = trechos[i];
          if (_NERVO_AFIRMADO_RE.test(t) && _NERVO_DOENCA_RE.test(t)) continue;
          if (out.length) out.push(trechos[i - 1]);
          out.push(t);
        }
        return out.join('').replace(/^[\s,;]+|[\s,;]+$/g, '');
      }).filter(l => l.trim()).join('\n').trim();
      if (depois !== antes.trim()) {
        d.fundoscopia = depois || null;
        alterados.push('fundoscopia');
      }
    }
    if (!alterados.length) return;
    log.push(`Nervo óptico/glaucoma removido de ${alterados.join(', ')} — a consulta não falou de nervo, papila, escavação, glaucoma nem pressão`);
  }

  /**
   * Os DOIS olhos já são pseudofácicos?
   *
   * NÃO há parser próprio aqui de propósito: o canônico é
   * `parsePseudofaciaFromDados()` (scripts/sidepanel-constants.js), que já trata
   * cirurgia planejada, negativa, cirurgia de terceiro e lateralidade. Um segundo
   * parser divergiria dele — e prompt/guard discordando entre si é justamente a
   * causa-raiz documentada no docblock do guard de presbiopia.
   *
   * Duas portas de entrada, nesta ordem:
   *   1. `ctx.pseudofacia` — o caller (sidepanel-audio) já calculou;
   *   2. o global `parsePseudofaciaFromDados`, presente no sidepanel.
   * Sem nenhuma das duas (ex.: teste que não passa o contexto), não há veto —
   * o guard se comporta como antes.
   */
  function _pseudofaciaBilateral(cloned, ctx) {
    // A lente já foi desfeita por falta de evidência na fala: o `ctx.pseudofacia`
    // do caller foi calculado sobre os dados fabricados e não vale mais.
    if (_SEM_EVIDENCIA_DE_LENTE.has(cloned)) return false;
    let r = ctx && ctx.pseudofacia;
    if (!r || typeof r !== 'object') {
      const g = (typeof globalThis !== 'undefined') ? globalThis : root;
      if (g && typeof g.parsePseudofaciaFromDados === 'function') {
        try { r = g.parsePseudofaciaFromDados(cloned.dados); } catch (_) { r = null; }
      }
    }
    return !!(r && r.detected && r.lado === 'AO');
  }

  /**
   * Guard 6: Presbiopia obrigatória quando QUALQUER um destes é verdade:
   *   (a) óculos multifocal/bifocal/progressivo aparece na conduta OU na fala;
   *   (b) foi dito que os óculos são para longe E perto;
   *   (c) "presbiopia" é mencionada explicitamente na transcrição.
   * Garante que o diagnóstico contém "H524 - Presbiopia".
   *
   * 2026-07-21: a evidência de "perto" exigia o token literal `oculos` a ≤6
   * palavras de `perto`. Na fala real o médico explica o multifocal SEM repetir
   * "óculos" — o AND falhava e o guard REMOVIA presbiopia legítima em 3 de 3
   * consultas daquele log. A evidência de perto passou a aceitar a dupla
   * longe+perto e o vocabulário de leitura, mas o AND (multifocal E perto) foi
   * mantido.
   *
   * 2026-07-31: o AND caiu, por decisão do médico. Na consulta das 13:58 a
   * conduta tinha "óculos multifocais" e o paciente já usava multifocal, e ainda
   * assim nenhum dos padrões de "perto" casou com a fala real (ASR devolveu
   * "para onde" no lugar de "para longe") — presbiopia foi removida de novo. É a
   * terceira recorrência da mesma classe: cada correção só ampliava a lista de
   * fraseados aceitos, e a fala real sempre trouxe um fraseado a mais.
   * Regra nova: multifocal É a correção da presbiopia — quem prescreve ou usa
   * multifocal tem presbiopia, sem precisar que a consulta fale de perto.
   *
   * Também de 2026-07-31, (d): óculos PARA PERTO / de leitura / para ler bastam
   * sozinhos. O prompt (`gemini-interview-agent.js`, regra da presbiopia) já
   * mandava a IA emitir H52.4 nesses fraseados e o guard apagava em seguida — os
   * dois discordavam entre si, e o resultado visível era o mesmo sintoma
   * ("presbiopia sumiu do diagnóstico"). O médico decidiu alinhar pelo prompt.
   * Custo aceito: hipermetrope jovem que recebe óculos só para perto ganha H52.4.
   *
   * O que continua NÃO bastando: falar de visão de perto sem óculos ("enxerga bem
   * de perto"), e o par longe/perto solto, que exige âncora de óculos (ver
   * `hasOculosLongeEPerto`) — sem ela, todo míope ("enxerga mal de longe e bem de
   * perto") viraria presbiopia.
   *
   * 2026-08-04 — VETO DE PSEUDOFACIA BILATERAL (decisão do médico): quem tem lente
   * intraocular nos DOIS olhos não pode receber H52.4. Presbiopia é a perda da
   * acomodação do CRISTALINO; no olho pseudofácico o cristalino já não existe e a
   * adição de perto corrige a ausência de acomodação da LIO, não presbiopia.
   * Consulta real de 2026-08-03 (a mesma do Caso 7d): pseudofácica AO saiu com
   * H401/H524/H010. O veto é REGENTE — roda ANTES dos critérios de inclusão, porque
   * `hasMultifocal` sozinho já liga `canHavePresbiopia` e o ramo de remoção nunca
   * seria alcançado. De quebra, cobre "lente multifocal" como IMPLANTE (LIO premium
   * discutida com paciente já operado), que hoje casa `PADRAO_MULTIFOCAL` sem que
   * nenhum óculos tenha sido citado.
   * Só BILATERAL veta: com um olho fácico, o olho não operado pode ser présbita de
   * verdade — e apagar presbiopia legítima já é a falha mais recorrente deste guard.
   * Pseudofacia sem lado definido NÃO veta (mesma regra do runtime da lente).
   */
  function _guardPresbiopiaObrigatoria(cloned, ctx, log) {
    if (!cloned.dados) return;

    if (_pseudofaciaBilateral(cloned, ctx)) {
      const dx = cloned.dados.diagnostico || '';
      if (/h52\.?4|presbiop/i.test(dx)) {
        const filtered = dx.split('\n').filter(l => l.trim() && !/h52\.?4|presbiop/i.test(l));
        if (filtered.length > 0) {
          cloned.dados.diagnostico = filtered.join('\n').trim();
          log.push('Presbiopia (H52.4) removida — pseudofacia bilateral: olho sem cristalino não tem acomodação a perder (a adição de perto corrige a ausência de acomodação da LIO)');
        } else {
          // Diferente do Fix A5 abaixo: aqui não é "critério fraco", é fato clínico
          // conhecido. Trocar por Z96.1 evita tanto o diagnóstico nulo quanto manter
          // um código sabidamente errado.
          // O sufixo "AO" é obrigatório: é a mesma linha que o prompt manda emitir e,
          // numa passagem posterior, é o que faz parsePseudofaciaFromDados devolver
          // lado='AO' a partir do próprio diagnóstico (sem ele, sai detected sem lado
          // — que não veta nada).
          cloned.dados.diagnostico = 'Z961 - Presença de lente intra-ocular AO';
          log.push('Presbiopia (H52.4) substituída por "Z961 - Presença de lente intra-ocular AO" — pseudofacia bilateral e H52.4 era a única linha do diagnóstico');
        }
      }
      return;
    }

    const condutaNorm = _normalizeForGuard(cloned.dados.conduta || '');
    const transcricaoNorm = _normalizeForGuard(ctx.transcribedText || '');

    // Limpa pontuações da transcrição para busca robusta de termos próximos.
    const cleanText = transcricaoNorm.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, " ");

    // (b) "os óculos são para longe e perto". O par longe+perto SÓ conta quando
    // a frase é sobre óculos/lente/grau — a âncora é o que separa "o óculos tem
    // grau de longe e de perto" (presbiopia) de "enxerga mal de longe e bem de
    // perto" (queixa refrativa de qualquer idade).
    // O par tem de vir COLADO ("longe e perto", "longe de perto junto", "perto e
    // longe") — não a 4 palavras de distância. Com a folga antiga, "enxerga mal de
    // longe e bem de perto" (queixa refrativa de qualquer idade) casava.
    // Mesmo helper do guard do tipo de lente (_hasParLongePertoAncorado): a âncora
    // é que difere — aqui basta falar de óculos/grau, ver o docblock de lá.
    const ANCORA_OCULOS = /oculos|lente|grau|armacao|receita|multifoca|bifoca|progressiv/;
    const hasOculosLongeEPerto = _hasParLongePertoAncorado(cleanText, ANCORA_OCULOS);

    // (a) Plural obrigatório: a frase canônica do prompt é "Prescrição de óculos
    // MULTIFOCAIS" — e "multifocais" NÃO contém "multifocal". O padrão antigo
    // (/multifocal/) nunca casava com a conduta que o prompt manda emitir; os
    // testes passavam só porque usavam o singular. Causa raiz da remoção de
    // presbiopia em 3 de 3 consultas do log de 2026-07-21.
    // A fala também conta: o médico pode discutir o multifocal na consulta e a
    // conduta sair com outro fraseado — e "já era multifocal" (óculos em uso)
    // é evidência de presbiopia tanto quanto a prescrição nova.
    const PADRAO_MULTIFOCAL = /multifoca(?:l|is)|bifoca(?:l|is)|progressiv/;
    const hasMultifocal = PADRAO_MULTIFOCAL.test(condutaNorm) || PADRAO_MULTIFOCAL.test(transcricaoNorm);
    const hasPresbiopiaNoTexto = /presbiop/.test(transcricaoNorm);

    // (d) Óculos PARA perto / de leitura. Exige a preposição ("óculos para perto",
    // "óculos de perto") e no máximo 3 palavras de folga: é o que separa o óculos
    // destinado ao perto de um comentário sobre a visão de perto ("os óculos estão
    // bons, ele enxerga bem de perto"), que não é diagnóstico de nada.
    const hasOculosParaPerto = /oculos\s+(?:[a-z]+\s+){0,3}(?:para|pra|de)\s+perto/.test(cleanText);
    const hasLeitura = /oculos\s+(?:de\s+)?(?:leitura|farmacia|pronto)|oculos\s+(?:[a-z]+\s+){0,3}(?:para\s+|pra\s+)?ler\b/.test(cleanText);

    // Cada critério basta por si só — ver docblock (regra de 2026-07-31).
    const canHavePresbiopia = hasPresbiopiaNoTexto || hasMultifocal || hasOculosLongeEPerto
      || hasOculosParaPerto || hasLeitura;

    const diagnostico = cloned.dados.diagnostico || '';
    const hasPresbiopia = /h52\.?4|presbiop/i.test(diagnostico);

    if (canHavePresbiopia) {
      if (!hasPresbiopia) {
        const lines = diagnostico ? diagnostico.split('\n') : [];
        lines.push('H524 - Presbiopia');
        cloned.dados.diagnostico = lines.join('\n').trim();

        const motivo = hasMultifocal
          ? 'óculos multifocal/bifocal/progressivo na conduta ou na consulta'
          : (hasOculosLongeEPerto
              ? 'óculos descritos como para longe E perto na consulta'
              : ((hasOculosParaPerto || hasLeitura)
                  ? 'óculos para perto/leitura na consulta'
                  : 'menção explícita de presbiopia na transcrição'));
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
          log.push('Presbiopia removida do diagnóstico — critérios de elegibilidade não atendidos (sem multifocal, sem óculos para perto/leitura, sem óculos para longe e perto, sem menção explícita de presbiopia)');
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
      // Autoriza (ou não) o TEXTO descritivo de blefarite na biomicroscopia.
      // Independe da flag: a blefarite inferida do tratamento mantém conduta e
      // medicação, mas não descreve um exame que o médico não relatou.
      blefariteDescritaNoExame: _detectBlefariteEvidencia(ctx.transcribedText).exame,
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

  /**
   * Rede de segurança pós-reconciliação: BIOMICROSCOPIA ÓRFÃ.
   *
   * O prompt manda o LLM devolver biomicroscopia=null quando injectBlefarite=true —
   * o texto do exame viria do TEMPLATE de blefarite. Se qualquer etapa posterior
   * (guard 1 por falta de evidência, hook já injetado, exclusão mútua) derrubar a
   * flag, sobra um estado que o contrato do prompt nunca previu: sem template E
   * sem texto → o bloco de exame sai silenciosamente EM BRANCO. Foi exatamente o
   * que aconteceu no log 2026-07-29 (consulta inteira de blefarite, prontuário só
   * com H52.2).
   *
   * Não inventamos achado — sinalizamos ao médico. Duas exceções legítimas, em
   * que a flag cai mas o campo NÃO fica órfão:
   *   • dilatação — a descrição dos exames pertence à fase 2, por design;
   *   • hook de voz já injetou um template AO VIVO (blefarite ou exames normais)
   *     durante a gravação — o texto já está no prontuário.
   *
   * Desde 2026-08-04 o campo também fica órfão com a flag DE PÉ: se a blefarite veio
   * só do tratamento (shampoo/compressa), o texto descritivo é suprimido e o médico
   * precisa saber que a biomicroscopia ficou em branco.
   */
  function _avisoBiomicroscopiaOrfa(rawAIResponse, cloned, injectFlags, ctx, log) {
    if (!cloned || !cloned.dados) return;
    if (injectFlags.dilatacao) return;                        // exame pertence à fase 2
    const hooks = (ctx && ctx.hookFlags) || {};
    if (hooks.blefariteInjetada || hooks.examesNormaisInjetados) return; // template já no prontuário
    if (!(rawAIResponse && rawAIResponse.injectBlefarite === true)) return;
    if (cloned.dados.biomicroscopia) return;                  // há texto próprio — nada órfão

    // (a) a flag caiu (guard, exclusão mútua) e nenhum template a substitui
    const flagCaiu = !injectFlags.injectBlefarite && !injectFlags.injectExamesNormais;
    // (b) flag de pé, mas sem inflamação palpebral descrita — template suprimido
    const templateSuprimido = injectFlags.injectBlefarite && !injectFlags.blefariteDescritaNoExame;
    if (!flagCaiu && !templateSuprimido) return;

    if (templateSuprimido) {
      _pushAviso(cloned,
        'Biomicroscopia ficou EM BRANCO: a blefarite foi inferida do tratamento ' +
        '(higiene/shampoo/compressa), mas nenhuma inflamação palpebral foi descrita no ' +
        'exame — o texto padrão de blefarite não foi injetado. Descreva o exame manualmente.');
      log.push('Biomicroscopia órfã — blefarite sem descrição de inflamação palpebral; template suprimido (aviso emitido ao médico)');
      return;
    }

    _pushAviso(cloned,
      'Biomicroscopia ficou EM BRANCO: a blefarite sugerida pela IA não foi injetada ' +
      '(sem evidência na transcrição ou template já aplicado) e nenhum outro achado de ' +
      'segmento anterior foi descrito. Confira e preencha o exame manualmente.');
    log.push('Biomicroscopia órfã — injectBlefarite caiu com biomicroscopia=null (aviso emitido ao médico)');
  }

  /**
   * FUNDOSCOPIA INTERPRETATIVA — aviso, nunca edição do texto.
   *
   * 2026-08-04, decisão do médico: a descrição injetada da fundoscopia não pode
   * dizer que o achado é sugestivo de glaucoma. O campo descreve O QUE FOI VISTO
   * (escavação aumentada, relação E/D, assimetria); a leitura diagnóstica vai para
   * `diagnostico` (H400) e os exames para `conduta`. O prompt é a autoridade — aqui
   * só verificamos se ele foi obedecido.
   *
   * Por que NÃO recortar a frase: em "escavação glaucomatosa (0,8)" a interpretação
   * e o achado são a MESMA oração — qualquer recorte por vírgula/ponto-e-vírgula ou
   * apaga o achado ou deixa o texto quebrado. Nenhum guard deste projeto opera dentro
   * da prosa clínica; quando o texto está errado, o padrão é campo vazio ou aviso
   * (ver `_avisoBiomicroscopiaOrfa`). O médico corrige a frase; o sistema não a reescreve.
   */
  function _avisoFundoscopiaInterpretativa(cloned, log) {
    if (!cloned || !cloned.dados) return;
    const texto = cloned.dados.fundoscopia;
    if (!texto) return;

    const INTERPRETACAO_GLAUCOMA =
      /glaucomatos|(?:suspeit|sugestiv|compat[íi]ve|indicativ)\w*\s+(?:de|para|com)\s+glaucoma|glaucoma\s+(?:suspeit|prov[áa]ve)/i;
    if (!INTERPRETACAO_GLAUCOMA.test(texto)) return;

    _pushAviso(cloned,
      'A descrição da FUNDOSCOPIA traz a interpretação diagnóstica de glaucoma. ' +
      'Esse campo é descritivo (escavação aumentada, relação E/D, assimetria): a suspeita ' +
      'pertence ao diagnóstico (H400) e os exames à conduta. Revise o texto antes de salvar.');
    log.push('Fundoscopia com leitura diagnóstica de glaucoma — texto preservado, aviso emitido ao médico');
  }

  /**
   * OD SEMPRE ANTES DE OE em qualquer texto que descreva os olhos separadamente.
   *
   * Regra do médico (2026-09-04): a leitura do prontuário é sempre olho direito
   * primeiro. O prompt já traz os exemplos nessa ordem, mas sem regra explícita o
   * modelo derivava para a ordem da FALA — na consulta do pterígio OE ele escreveu
   * "OE: ...\nOD: ..." porque o achado do olho esquerdo foi o assunto. Aqui o
   * runtime é a autoridade: o prompt pede, esta função garante.
   *
   * Escopo deliberado: APENAS biomicroscopia e fundoscopia — os campos em que cada
   * linha é o MESMO exame descrito por olho. `diagnostico` fica de fora: lá cada
   * linha é um CID diferente (não uma descrição por olho), e reordenar embaralharia
   * a ordem de lançamento no SHOSP e a dedup de CID.
   *
   * Troca CONDICIONAL, não ordenação: só age quando existe exatamente uma linha OD,
   * exatamente uma linha OE, elas são ADJACENTES e a de OE vem antes. Linhas "AO:",
   * cabeçalho ("FUNDOSCOPIA INDIRETA:") e linhas sem prefixo nunca se movem — exigir
   * adjacência é o que impede uma linha de atravessar o cabeçalho.
   *
   * O prefixo é ancorado no início da linha (tolerando "[CONFIRMAR OLHO AFETADO] "),
   * mesma política de _aplicaLente: OD/OE solto acharia a menção ao outro olho no
   * meio da frase.
   */
  function _ordenaOlhosODPrimeiro(cloned, log) {
    if (!cloned || !cloned.dados) return;
    const PREFIXO = /^\s*(?:\[[^\]]*\]\s*)?(OD|OE)\b/i;

    ['biomicroscopia', 'fundoscopia'].forEach((campo) => {
      const texto = cloned.dados[campo];
      if (!texto || typeof texto !== 'string' || !texto.includes('\n')) return;

      const linhas = texto.split('\n');
      const idxOD = [];
      const idxOE = [];
      linhas.forEach((linha, i) => {
        const m = linha.match(PREFIXO);
        if (!m) return;
        (m[1].toUpperCase() === 'OD' ? idxOD : idxOE).push(i);
      });

      if (idxOD.length !== 1 || idxOE.length !== 1) return;
      if (idxOE[0] < idxOD[0]) {
        if (idxOD[0] - idxOE[0] !== 1) {
          console.warn(`[OrdemOlhos] ${campo}: OE antes de OD, mas as linhas não são adjacentes — ordem preservada para revisão manual.`);
          return;
        }
        const tmp = linhas[idxOE[0]];
        linhas[idxOE[0]] = linhas[idxOD[0]];
        linhas[idxOD[0]] = tmp;
        cloned.dados[campo] = linhas.join('\n');
        log.push(`${campo}: linhas reordenadas — OD antes de OE`);
      }
    });
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
  /**
   * MODO SOMBRA do agente de medicamentos (src/agents/medicamentos-agent.js).
   * Não altera nada: só registra quando o léxico acha na FALA um remédio que o
   * `tratamento` final não nomeia (nem pelo princípio ativo). É a medição que
   * decide se vale ligar o agente de verdade (passo 2, com chamada ao modelo).
   */
  function _sombraMedicamentos(cloned, ctx, log) {
    const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
    if (!Lexico || !cloned || !cloned.dados) return;
    const fala = ctx.transcribedText || '';
    if (!fala) return;
    const trat = Lexico.normalizarLexico(cloned.dados.tratamento || '');
    const faltando = Lexico.encontrarMedicamentos(fala).filter(a => {
      const primeiro = Lexico.normalizarLexico(a.principio).split(/[ +]/)[0];
      return !trat.includes(primeiro);
    });
    if (faltando.length) {
      log.push(`[sombra:medicamentos] fala cita ${faltando.map(a => `${a.principio} ("${a.termo}")`).join(', ')} e o tratamento não nomeia — conferir`);
    }
  }

  // Palavras genéricas de medicação, só para o log de diagnóstico [Med]. O léxico
  // enxerga marcas e princípios; "colírio", "lubrificação" e "ômega" ele não vê, e é
  // justamente o que o médico mais diz quando o nome do remédio não vem.
  const _MED_GENERICO_TOKEN_RE = /^(?:colirios?|pomadas?|gotas?|gotinhas?|pingar|instilar|lubrific\w*|lagrimas?|omega|remedios?|medicacao|medicacoes|medicamentos?|comprimidos?|capsulas?|suplementos?|vitaminas?)$/;

  /**
   * DIAGNÓSTICO [Med] — só log, nunca altera dado. Uma linha por consulta mostrando,
   * lado a lado, o que a fala cita, o que o modelo escreveu e o que sobrou depois dos
   * guards, para dizer ONDE um remédio dito se perdeu (decisão do modelo, guard ou
   * placeholder) sem deduzir pelo raciocínio. Nunca lança: log não pode quebrar a decisão.
   * @returns {string|null}
   */
  function _diagMedicacao(raw, cloned, ctx, guardsApplied) {
    try {
      if (!cloned || !cloned.dados) return null;
      const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
      const norm = (s) => Lexico ? Lexico.normalizarLexico(s) : String(s || '').toLowerCase();
      const fala = ctx.transcribedText || '';
      const falaN = norm(fala);

      const achados = Lexico ? Lexico.encontrarMedicamentos(fala) : [];
      const lexicoTxt = achados.map(a => `${a.principio} ("${a.termo}")`);

      // Palavras genéricas com ±4 palavras de contexto (janelas sobrepostas viram uma).
      const tokens = falaN.split(' ');
      const janelas = [];
      let fimUltima = -1;
      tokens.forEach((tk, i) => {
        if (i <= fimUltima || !_MED_GENERICO_TOKEN_RE.test(tk)) return;
        const ini = Math.max(0, i - 4);
        const fim = Math.min(tokens.length - 1, i + 4);
        janelas.push(tokens.slice(ini, fim + 1).join(' '));
        fimUltima = fim;
      });
      const genericos = janelas.slice(0, 6).map(j => `"…${j}…"`);

      const v = (x) => {
        if (x == null || String(x).trim() === '') return '∅';
        const s = String(x).replace(/\s*\n\s*/g, ' ⏎ ');
        return JSON.stringify(s.length > 220 ? s.slice(0, 220) + '…' : s);
      };
      const antes = (raw && raw.dados) || {};
      const campo = (rotulo, a, b) => (a === b || (a == null && b == null) || String(a) === String(b))
        ? `${rotulo}=${v(b)}`
        : `${rotulo}=${v(a)} → ${v(b)}`;

      const d = cloned.dados;
      const emUsoAntes = antes.medicacoes_em_uso != null ? antes.medicacoes_em_uso : antes.uso;
      const emUsoDepois = d.medicacoes_em_uso != null ? d.medicacoes_em_uso : d.uso;
      const suspensoes = String(d.conduta || '').split('\n').filter(l => /suspend|suspens|interromp|parar/i.test(l));

      const guardsMed = (guardsApplied || [])
        .filter(g => /col[ií]rio|tratamento|medica|antibi|associa|protocolo|lubrific/i.test(String(g)))
        .map(g => String(g).slice(0, 160));

      const linhas = [
        `[Med] fala: lexico=[${lexicoTxt.join(', ')}] generico=[${genericos.join(' ; ')}]`,
        `      ${campo('em_uso', emUsoAntes, emUsoDepois)}`,
        `      ${campo('trat', antes.tratamento, d.tratamento)}`,
        `      conduta-suspensao=${suspensoes.length ? v(suspensoes.join(' ⏎ ')) : '∅'}`,
        `      guards-med=${guardsMed.length ? JSON.stringify(guardsMed) : '[]'}`,
      ];

      // Remédio do léxico dito e não nomeado em nenhum dos dois campos.
      const nomeados = norm(`${emUsoDepois || ''} ${d.tratamento || ''}`);
      const naoNomeados = achados.filter(a => !nomeados.includes(norm(a.principio).split(/[ +]/)[0]));
      if (naoNomeados.length) {
        linhas.push(`      ALERTA: fala cita ${naoNomeados.map(a => a.principio).join(', ')} e nem em_uso nem trat nomeiam`);
      }
      // Ponto A: o painel troca tratamento vazio por "Sem prescrição de medicação".
      if ((!d.tratamento || !String(d.tratamento).trim()) && (achados.length || genericos.length)) {
        linhas.push('      ATENÇÃO: trat vazio com palavra de medicação na fala — o painel vai escrever "Sem prescrição de medicação" (conferir se procede)');
      }
      return linhas.join('\n');
    } catch (e) {
      return `[Med] diagnóstico falhou (não-fatal): ${e && e.message}`;
    }
  }

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
      _guardClasseAntibioticoSemFala(cloned, ctx, guardsApplied);
      // Antes do 2e: ele copia linhas de medicacoes_em_uso para o tratamento, e a
      // cópia tem que levar o nome, não a classe (log 2026-11-09).
      _guardMedicamentoNomeadoNaFala(cloned, ctx, guardsApplied);
      _guardColirioMantidoSemTratamento(cloned, ctx, guardsApplied);
      // Depois do rebaixamento da "Associação": promove o colírio genérico da
      // blefarite ao protocolo declarado (Tobramicina + dexametasona).
      _guardColirioBlefariteProtocolo(cloned, ctx, guardsApplied);
      // O inverso: a linha do protocolo que o modelo escreveu sem colírio na fala sai.
      _guardColirioBlefariteSemPrescricao(cloned, ctx, guardsApplied);
      _guardCondutaContaminada(cloned, ctx, guardsApplied);
      // Depois da contaminada (traz o lubrificante da conduta) e do protocolo da
      // blefarite (que ainda lê "Lubrificante ocular" como não-colírio).
      _guardLubrificanteGenerico(cloned, ctx, guardsApplied);
      // Antes do guard de presbiopia: PADRAO_MULTIFOCAL lê a conduta, e uma
      // conduta com tipo fabricado arrastaria H524 junto (log 2026-08-05).
      _guardMultifocalSemEvidencia(cloned, ctx, guardsApplied);
      _guardManutencaoOculos(cloned, ctx, guardsApplied);
      _guardAntecedentesNegativaFabricada(cloned, ctx, guardsApplied);
      _guardComorbidadesNegativaFabricada(cloned, ctx, guardsApplied);
      // Antes do guard de presbiopia: o veto de pseudofacia bilateral é regente
      // lá dentro — desfazer a lente depois deixaria a H52.4 apagada por uma
      // pseudofacia que já não existe (log 2026-09-02).
      _guardPseudofaciaSemEvidencia(cloned, ctx, guardsApplied);
      _guardNervoOpticoSemEvidencia(cloned, ctx, guardsApplied);
      // Guard de óculos e presbiopia só se não há dilatação
      const flags = ctx.hookFlags || {};
      const dilatacao = !!(cloned.dilatacaoDetectada || flags.dilatacaoDetectada);
      if (!dilatacao) {
        _guardOculosNaConduta(cloned, ctx, guardsApplied);
        _guardPresbiopiaObrigatoria(cloned, ctx, guardsApplied);
      }
      // POR ÚLTIMO no bloco `dados`: guards acima reescrevem o texto da
      // biomicroscopia (blefarite literal, lente narrativa da pseudofacia).
      // Reordenar antes deixaria a reescrita pousando na ordem antiga.
      _ordenaOlhosODPrimeiro(cloned, guardsApplied);
      _sombraMedicamentos(cloned, ctx, guardsApplied);
    }

    const injectFlags = _reconcileInjectFlags(cloned || {}, ctx);
    _avisoBiomicroscopiaOrfa(rawAIResponse, cloned, injectFlags, ctx, guardsApplied);
    // Depois dos guards que podem ZERAR a fundoscopia (dilatação, fase 2): não avisar
    // sobre um texto que nem vai ser injetado.
    _avisoFundoscopiaInterpretativa(cloned, guardsApplied);

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
      diagMedicacao: _diagMedicacao(rawAIResponse, cloned, ctx, guardsApplied),
      avisos: (cloned && Array.isArray(cloned.avisos)) ? cloned.avisos : [],
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
