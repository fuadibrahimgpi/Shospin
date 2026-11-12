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
 *   - guardsFalhos      — [{ guard, erro }] guards que lançaram exceção (os demais rodaram)
 *   - camposInesperados — campos de `dados` que não vieram como texto nem lista de textos
 *   - segurarInjecao    — true quando a verificação ficou incompleta: o painel mostra
 *                         os campos para conferência e NÃO injeta sozinho
 *   - motivoSegurar     — texto do motivo (null quando segurarInjecao é false)
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
  // Léxico de medicamentos — a ÚNICA lista de nomes de remédio do projeto
  // (config/medicamentos-lexico.js). Este arquivo não escreve nome de remédio:
  // toda lista usada pelos guards é GERADA do léxico em _listasDoLexico(). O
  // teste [LEXICO-UNICO-1] barra lista nova escrita à mão aqui.
  //
  // Em Node (testes) o léxico vem por require; no painel, do <script> carregado
  // antes deste em sidepanel.html. Sem léxico, _lexico() LANÇA: o guard que
  // precisava dele falha, e buildDecision segura a injeção (não falha aberto).
  // ------------------------------------------------------------------
  const _LexicoNode = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('../config/medicamentos-lexico.js') : null;

  function _lexico() {
    const L = _LexicoNode || (typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null);
    if (!L || typeof L.fonteDeClasse !== 'function') {
      throw new Error('léxico de medicamentos não carregado (config/medicamentos-lexico.js)');
    }
    return L;
  }

  // Agente de medicamentos — usado SÓ pelo modo sombra dos itens (_sombraItensMedicamentos).
  // Diferente do léxico, a falta dele NÃO é falha: a sombra só deixa uma linha no log.
  const _AgenteMedNode = (() => {
    try {
      return (typeof module !== 'undefined' && module.exports && typeof require === 'function')
        ? require('./agents/medicamentos-agent.js') : null;
    } catch (_) { return null; }
  })();

  function _agenteMed() {
    const A = _AgenteMedNode || (typeof globalThis !== 'undefined' ? globalThis.MedicamentosAgent : null);
    return (A && typeof A.validar === 'function' && typeof A.conferirComTratamento === 'function') ? A : null;
  }

  // Todas as regex abaixo são para texto MINÚSCULO E SEM ACENTO (_normalizeForGuard).
  let _listasMedCache = null;
  function _listasDoLexico() {
    if (_listasMedCache) return _listasMedCache;
    const L = _lexico();
    const prot = L.protocolo('blefarite');
    _listasMedCache = {
      // Nome registrado do colírio do protocolo da blefarite ("Tobramicina + dexametasona").
      protocoloNome: prot.principio,
      // Linha do tratamento que COMEÇA com o nome do protocolo.
      linhaProtocolo: new RegExp('^\\s*(?:[-•*]\\s*)?' + L.fonteDoPrincipio(prot.id) + '\\b'),
      // A fala PRONUNCIA o remédio do protocolo (marca, variante de voz ou um dos princípios).
      protocoloPronunciado: new RegExp(L.fonteDoRemedio(prot.id)),
      // A fala diz a classe ATB/corticoide ou um dos princípios do protocolo (Guard 2).
      classeOuPrincipioDoProtocolo: new RegExp('antibiotico|corticoide|' + L.radicaisDoPrincipio(prot.id).join('|')),
      // A linha já NOMEIA um antibiótico, um corticoide ou uma associação dos dois.
      colirioNomeado: new RegExp(L.fonteDeClasse(['antibiotico', 'corticoide', 'associacao_atb_cortic'])),
      // A fala cita antibiótico: a classe dita ou qualquer antibiótico/associação.
      falaAntibiotico: new RegExp(L.PALAVRAS_DE_CLASSE.antibiotico + '|' + L.fonteDeClasse(['antibiotico', 'associacao_atb_cortic'])),
      // Remédio de uso contínuo: hipotensor ou lubrificante (inclusive a palavra "lubrificante").
      remedioCronico: new RegExp(L.fonteDeClasse(['hipotensor', 'lubrificante'], { genericos: true })),
      // Lubrificante NOMEADO: marca ou princípio (a palavra "lubrificante" sozinha não conta).
      lubrificanteNomeado: new RegExp(L.fonteDeClasse(['lubrificante'])),
      // Colírio de glaucoma citado.
      hipotensor: new RegExp(L.fonteDeClasse(['hipotensor'])),
    };
    return _listasMedCache;
  }

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
  const _CLINICAL_VOCAB_RE = /\b(visao|vista|vistas|olho|olhos|ocular|oculares|retina|cornea|corneal|cristalino|macula|macular|nervo|pressao|tonometria|fundoscopia|dilata|colirio|biometria|refracao|catarata|glaucoma|astigmatismo|miopia|hipermetropia|cirurgia|lio|acuidade|fotofobia|lacrimejamento|conjuntiva|conjuntival|iris|esclerotica|pupila|pupilar|blefarite|calazio|ceratocone|biomicroscopia|campimetria|pachimetria|oct|lente|lentes|oftalmologico|oftalmologica|intraocular|periocular|refrac|oculo|oculos|grau|graus|consulta|consultas|retorno|retornos|receita|receitas|exame|exames|paciente|pacientes|medico|medica|medicos|medicas|doutor|doutora|doutores|doutoras|lagrima|lagrimas|medicacao|medicacoes|medicamento|medicamentos|remedio|remedios|posologia|gotas|gota|gotinha|gotinhas|instilar|pingar|acompanhamento|manutencao|conduta|tratamento|tratamentos|quadro|pterigio|higiene|compressa|compressas|omega|palpebra|palpebras|cilio|cilios|shampoo|casquinha|casquinhas|leitura|ler|perto|longe|multifocal|multifocais|laser|yag|hordeolo|tersol)\b/g;

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
    // Nome de remédio também é vocabulário clínico; quem conta é o léxico.
    const clinicalMatches = (text.match(_CLINICAL_VOCAB_RE) || []).length + _lexico().contarMencoes(text);
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
    const hasMention = _listasDoLexico().classeOuPrincipioDoProtocolo.test(_normalizeForGuard(ctx.transcribedText || ''));
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
  // O nome do colírio do protocolo ("Tobramicina + dexametasona") e a lista de
  // "colírio já nomeado" (antibióticos, corticoides e associações: se algum aparece
  // na linha, o médico — ou o modelo, via nível 1 — já nomeou o remédio, nada a
  // promover) vêm do léxico: _listasDoLexico().protocoloNome / .colirioNomeado.
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
    const listas = _listasDoLexico();
    if (linhas.some(l => listas.colirioNomeado.test(_normalizeForGuard(l)))) return;

    let promovidas = 0;
    const novas = linhas.map(linha => {
      if (_NAO_E_COLIRIO_BLEFARITE_RE.test(linha)) return linha;
      const m = linha.match(_COLIRIO_GENERICO_RE);
      if (!m) return linha;
      promovidas++;
      // Substitui só o descritor; o resto da linha (posologia, "após higiene
      // palpebral", "até acabar") sobrevive intacto.
      return linha.replace(m[1], listas.protocoloNome).trim();
    });

    // Nenhuma linha genérica = o médico não prescreveu colírio (ou já está nomeado).
    // Não acrescentamos linha nova: promover ≠ criar.
    if (!promovidas) return;

    cloned.dados.tratamento = novas.join('\n');
    log.push(`Colírio da blefarite promovido para "${listas.protocoloNome}" — protocolo declarado do médico (nível 1.5), ${promovidas} linha(s)`);
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

  function _guardColirioBlefariteSemPrescricao(cloned, ctx, log) {
    const tratamento = cloned.dados && cloned.dados.tratamento;
    if (!tratamento) return;
    const linhas = tratamento.split('\n');
    // Linha que começa com o nome do protocolo, e fala que o pronuncia: listas do léxico.
    const listas = _listasDoLexico();
    const ehLinhaDoProtocolo = (l) => listas.linhaProtocolo.test(_normalizeForGuard(l));
    if (!linhas.some(ehLinhaDoProtocolo)) return;

    if (listas.protocoloPronunciado.test(_normalizeForGuard(ctx.transcribedText))) return;
    if (_falaTemColirioDaBlefarite(ctx.transcribedText)) return;

    const restantes = linhas.filter(l => !ehLinhaDoProtocolo(l));
    cloned.dados.tratamento = restantes.join('\n').trim() || null;
    _pushAviso(cloned,
      `Tratamento: "${listas.protocoloNome}" foi removido — a fala não traz nenhum colírio ` +
      'além do lubrificante, então o protocolo da blefarite não se aplica. Se você prescreveu o colírio, ' +
      'acrescente-o manualmente.');
    log.push(`"${listas.protocoloNome}" removido do tratamento — protocolo sem colírio na fala (só compressa/higiene/lubrificante)`);
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

  const _AVISO_NOME_NAO_CLARO =
    'Tratamento: o nome do colírio não ficou claro na gravação — registrado como "Medicação ocular prescrita". ' +
    'Confira e ajuste o nome manualmente.';

  function _guardClasseAntibioticoSemFala(cloned, ctx, log) {
    const tratamento = cloned.dados && cloned.dados.tratamento;
    if (!tratamento) return;
    const linhas = tratamento.split('\n');
    if (!linhas.some(l => _LINHA_CLASSE_ATB_RE.test(_normalizeForGuard(l)))) return;
    // A classe dita ("antibiótico", "ATB") ou qualquer antibiótico do léxico citado.
    if (_listasDoLexico().falaAntibiotico.test(_normalizeForGuard(ctx.transcribedText))) return;

    let rebaixadas = 0;
    cloned.dados.tratamento = linhas.map(l => {
      if (!_LINHA_CLASSE_ATB_RE.test(_normalizeForGuard(l))) return l;
      rebaixadas++;
      return l.replace(/^(\s*(?:[-•*]\s*)?)col[ií]rio\s+antibi[oó]tico/i, '$1Medicação ocular prescrita');
    }).join('\n');
    _pushAviso(cloned, _AVISO_NOME_NAO_CLARO);
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
   *  • remédio negado/suspenso/alérgico/trocado ("sem timolol", "timolol suspenso", "trocar o
   *    timolol por Xalatan") → o guard inteiro se cala: não sabe qual era "em uso" e qual é novo;
   *  • remédio que já consta em medicacoes_em_uso só nomeia a linha do tratamento quando ela é
   *    idêntica à de medicacoes_em_uso; linha diferente pode ser um colírio novo → fica e avisa;
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
  // Negação DEPOIS do nome: "o timolol suspenso", "o timolol ela não pode usar".
  const _MED_SUSPENSO_DEPOIS_RE = /^\s*(?:\w+\s+){0,3}(?:nao\s+(?:pode|deve|usa|usar|toler\w*|consegue|funcion\w*|serve)|nunca|suspens\w*|suspend\w*|parar|parou|interromp\w*|contraindic\w*)/;
  const _CLASSES_FORA_DO_GUARD = ['lubrificante', 'ciclopegico'];

  function _medicamentosCitadosNaFala(fala) {
    const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
    if (!Lexico || !fala) return { validos: [], excluidos: 0 };
    const t = Lexico.normalizarLexico(fala);
    const validos = [];
    let excluidos = 0;
    for (const a of Lexico.encontrarMedicamentos(fala)) {
      const antes = t.slice(Math.max(0, a.indice - 50), a.indice).split(' ').slice(-4).join(' ');
      const depois = t.slice(a.indice + a.termo.length, a.indice + a.termo.length + 40);
      if (_MED_NEGADO_ANTES_RE.test(antes) || _MED_SUSPENSO_DEPOIS_RE.test(depois)) { excluidos++; continue; }
      if (!validos.some(v => v.id === a.id)) validos.push(a);
    }
    return { validos, excluidos };
  }

  function _juntarNomesMedicamento(achados, Lexico) {
    return achados
      .map(a => Lexico.nomeRegistrado(a))
      .map((n, i) => (i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1)))
      .join(' + ');
  }

  /** Linha de classe/genérico → os remédios citados na fala que poderiam nomeá-la (ou null). */
  function _candidatosNomeDaLinha(linha, citados) {
    for (const [classe, re] of Object.entries(_CLASSE_LINHA_RE)) {
      const m = linha.match(re);
      if (!m) continue;
      const doClasse = citados.filter(a => a.classe === classe);
      if (!doClasse.length || doClasse.length > 2) return null;
      return { re, prefixo: m[1], lista: doClasse };
    }
    const g = linha.match(_LINHA_MED_GENERICA_RE);
    if (g) {
      const elegiveis = citados.filter(a => !_CLASSES_FORA_DO_GUARD.includes(a.classe));
      if (elegiveis.length !== 1) return null;
      return { re: _LINHA_MED_GENERICA_RE, prefixo: g[1], lista: elegiveis };
    }
    return null;
  }

  /** Devolve o teste "este remédio citado já consta em medicacoes_em_uso?" para os dados atuais. */
  function _constaEmMedicacoesEmUso(d, Lexico) {
    const emUso = Lexico.normalizarLexico(`${d.medicacoes_em_uso || ''} ${d.uso || ''}`);
    const ids = new Set(Lexico.encontrarMedicamentos(emUso).map(a => a.id));
    return (a) => ids.has(a.id) ||
      Lexico.normalizarLexico(a.principio).split(/\s*\+\s*/).every(p => emUso.includes(p.split(' ')[0]));
  }

  /**
   * Aviso que fecha o Guard 2g: linha do tratamento que continuou em classe/genérico
   * porque o único nome citado na fala é de um remédio que o paciente JÁ usa. Roda
   * depois de todos os guards de medicação, para não avisar sobre a linha que o
   * protocolo da blefarite (Guard 2b) acabou nomeando. Só avisa; não altera nada.
   */
  function _avisoTratamentoSemNomeRemedioEmUso(cloned, ctx, log) {
    const d = cloned.dados;
    // O Guard 2d avisa "o nome não ficou claro" ao rebaixar a classe para o genérico. Se um
    // guard seguinte nomeou a linha (o 2g reconhece "trometolou" como Cetorolaco; o 2b aplica
    // o protocolo da blefarite), não sobrou linha genérica e o aviso seria falso.
    if (d && Array.isArray(cloned.avisos) && cloned.avisos.includes(_AVISO_NOME_NAO_CLARO)) {
      const sobrouGenerica = String(d.tratamento || '').split('\n').some(l => _LINHA_MED_GENERICA_RE.test(l));
      if (!sobrouGenerica) {
        cloned.avisos = cloned.avisos.filter(a => a !== _AVISO_NOME_NAO_CLARO);
        log.push('Aviso "nome do colírio não ficou claro" retirado — a linha acabou nomeada por um guard seguinte');
      }
    }
    const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
    if (!d || !Lexico || typeof d.tratamento !== 'string' || !d.tratamento.trim()) return;
    const { validos: citados, excluidos } = _medicamentosCitadosNaFala(ctx.transcribedText);
    if (!citados.length || excluidos) return;
    const jaConstaEmUso = _constaEmMedicacoesEmUso(d, Lexico);
    for (const linha of d.tratamento.split('\n')) {
      const c = _candidatosNomeDaLinha(linha, citados);
      if (!c) continue;
      const nomes = [...new Set(c.lista.filter(jaConstaEmUso).map(a => a.principio))];
      if (!nomes.length) continue;
      _pushAviso(cloned,
        `Tratamento: a linha "${linha.trim()}" ficou sem o nome do colírio. A fala cita ${nomes.join(' e ')}, ` +
        'que já consta nas medicações em uso, e não dá para saber se é o mesmo colírio. Confira o nome.');
      log.push(`Aviso: linha do tratamento "${linha.trim()}" segue sem nome — ${nomes.join(', ')} já consta em medicacoes_em_uso`);
    }
  }

  /**
   * Direção inversa do Guard 2g (log 2026-11-11): a linha NOMEIA um remédio, uma
   * associação ou uma (Marca) que a fala não pronunciou. Caso real: o paciente disse
   * "timolol" duas vezes por dia e o modelo escreveu "Brimonidina + timolol (Combigan)
   * 2x/dia". A linha é corrigida para o(s) remédio(s) efetivamente dito(s), com a
   * posologia preservada.
   *
   * Quem pode substituir, nesta ordem:
   *  1) remédio dito cujos princípios estão TODOS na linha ("timolol" dentro de
   *     "Brimonidina + timolol") — é o mesmo remédio, escrito a mais;
   *  2) na falta dele, o remédio dito da MESMA classe (1 ou 2). Este é mais fraco: a
   *     linha pode ser outro colírio. Por isso `vetarPorClasse` pode recusá-lo (o remédio
   *     já tem linha própria no campo, ou já consta em medicacoes_em_uso e a linha do
   *     tratamento não é a mesma — a regra do colírio novo, de 2026-11-11).
   * Não mexe na linha do protocolo da blefarite, nem funde duas prescrições (posologia
   * entre os dois nomes). Lubrificante e ciclopégico ficam de fora.
   * @returns {{linha: string, substitutos: Array, trocouPrincipio: boolean}|null}
   */
  const _SAL_ANTES_DO_NOME_RE = /^(\s*(?:[-•*]\s*)?)(?:(?:maleato|tartarato|cloridrato|besilato|fumarato|acetato|fosfato|sulfato)\s+de\s+)$/i;
  const _POSOLOGIA_ENTRE_NOMES_RE = /\b(?:\d+\s*x|dia|noite|manha|tarde|gota|gotas|hora|horas|\d+\/\d+)\b/i;

  function _corrigirNomeNaoPronunciado(linha, citados, Lexico, vetarPorClasse) {
    if (_listasDoLexico().linhaProtocolo.test(_normalizeForGuard(linha))) return null;
    const s = linha.replace(/\s+/g, ' ').trim();
    // Os índices do léxico são sobre o texto sem acento: só reescreve se estiverem alinhados.
    const sNorm = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!s || sNorm.length !== s.length) return null;

    const naLinha = Lexico.encontrarMedicamentos(s).filter(a => !_CLASSES_FORA_DO_GUARD.includes(a.classe));
    if (!naLinha.length) return null;
    const componentes = (a) => Lexico.normalizarLexico(a.principio).split(/\s*\+\s*/);
    const principiosFalados = new Set(citados.reduce((acc, c) => acc.concat(componentes(c)), []));
    const marcasFaladas = new Set(citados.map(c => c.marca && Lexico.normalizarLexico(c.marca)).filter(Boolean));
    const temNaoPronunciado = naLinha.some(item =>
      !componentes(item).every(comp => principiosFalados.has(comp)) ||
      (item.marca && !marcasFaladas.has(Lexico.normalizarLexico(item.marca))));
    if (!temNaoPronunciado) return null;

    const ultimo = naLinha[naLinha.length - 1];
    // Posologia entre dois remédios da mesma linha = duas prescrições distintas: não fundir.
    if (_POSOLOGIA_ENTRE_NOMES_RE.test(s.slice(naLinha[0].indice, ultimo.indice))) return null;

    const naLinhaComps = new Set(naLinha.reduce((acc, x) => acc.concat(componentes(x)), []));
    let substitutos = citados.filter(c =>
      !_CLASSES_FORA_DO_GUARD.includes(c.classe) && componentes(c).every(comp => naLinhaComps.has(comp)));
    if (!substitutos.length) {
      const doClasse = citados.filter(c => c.classe === naLinha[0].classe);
      if (doClasse.length < 1 || doClasse.length > 2) return null;
      if (vetarPorClasse && vetarPorClasse(doClasse)) return null;
      substitutos = doClasse;
    }
    if (substitutos.length < 1 || substitutos.length > 2) return null;

    let iniSpan = naLinha[0].indice;
    const mSal = s.slice(0, iniSpan).match(_SAL_ANTES_DO_NOME_RE);
    if (mSal) iniSpan = mSal[1].length;
    let fimSpan = ultimo.indice + ultimo.termo.length;
    if (s[fimSpan] === ')') fimSpan++;
    const novosComps = new Set(substitutos.reduce((acc, x) => acc.concat(componentes(x)), []));
    const trocouPrincipio = novosComps.size !== naLinhaComps.size || [...novosComps].some(c => !naLinhaComps.has(c));
    return {
      linha: s.slice(0, iniSpan) + _juntarNomesMedicamento(substitutos, Lexico) + s.slice(fimSpan),
      substitutos,
      trocouPrincipio,
    };
  }

  function _guardMedicamentoNomeadoNaFala(cloned, ctx, log) {
    const d = cloned.dados;
    const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
    if (!d || !Lexico) return;
    const { validos: citados, excluidos } = _medicamentosCitadosNaFala(ctx.transcribedText);
    if (!citados.length) return;
    // Remédio negado/suspenso/trocado na mesma fala: não dá para saber, sem o modelo, qual
    // era "em uso" e qual é o novo ("trocar o timolol por Xalatan"). Nomear o errado em
    // medicacoes_em_uso seria pior que a classe — o guard se cala e deixa o prompt decidir.
    if (excluidos) {
      log.push('Guard 2g: fala cita remédio negado/suspenso/trocado — nomeação deixada ao modelo (ambíguo)');
      return;
    }

    const usados = [];
    const candidatosDaLinha = (linha) => _candidatosNomeDaLinha(linha, citados);
    const promover = (linha, c) => {
      usados.push(...c.lista);
      return linha.replace(c.re, c.prefixo + _juntarNomesMedicamento(c.lista, Lexico));
    };
    const chaveLinha = (l) => _normalizeForGuard(l).replace(/\s+/g, ' ').trim();
    // Linha que nomeia remédio NÃO pronunciado (log 2026-11-11) → o remédio dito.
    const trocas = [];
    let corrigidas = 0;
    const corrigir = (linha, vetarPorClasse) => {
      const r = _corrigirNomeNaoPronunciado(linha, citados, Lexico, vetarPorClasse);
      if (!r) return linha;
      usados.push(...r.substitutos);
      corrigidas++;
      if (r.trocouPrincipio) trocas.push({ de: linha.trim(), para: r.linha.trim() });
      return r.linha;
    };
    // O remédio dito já tem linha própria no mesmo campo: a linha em questão é outro colírio.
    const nomeadoEmOutraLinha = (linhas, i, remedios) => {
      const outras = Lexico.normalizarLexico(linhas.filter((_, j) => j !== i).join(' '));
      return remedios.some(a => outras.includes(Lexico.normalizarLexico(a.principio).split(/[ +]/)[0]));
    };

    let alteradas = 0;

    // 1) medicacoes_em_uso: o nome citado é, por definição do campo, do remédio em uso.
    const emUsoOriginal = typeof d.medicacoes_em_uso === 'string' ? d.medicacoes_em_uso : '';
    if (emUsoOriginal.trim()) {
      const linhas = emUsoOriginal.split('\n');
      const novo = linhas.map((l, i) => {
        const c = candidatosDaLinha(l);
        return c ? promover(l, c) : corrigir(l, (subs) => nomeadoEmOutraLinha(linhas, i, subs));
      }).join('\n');
      if (novo !== emUsoOriginal) { d.medicacoes_em_uso = novo; alteradas++; }
    }

    // 2) tratamento: o remédio que JÁ CONSTA em medicacoes_em_uso não nomeia uma linha
    //    DIFERENTE do tratamento (revisão 2026-11-10). O nome citado pode ser só o do
    //    colírio que o paciente já usava, e a linha genérica, um colírio NOVO sem nome:
    //    "uso o Xalatan… vou passar um colírio 4x/dia por 7 dias" virava "Latanoprosta
    //    (Xalatan) 4x/dia por 7 dias", e o colírio da blefarite de quem usa timolol virava
    //    "Timolol 3x/dia" antes de o protocolo (Guard 2b) poder nomeá-lo. Só é o MESMO
    //    remédio com certeza quando a linha é idêntica à de medicacoes_em_uso (o caso de
    //    2026-11-09, classe repetida nos dois campos). Fora disso a linha fica como o
    //    modelo escreveu; se nenhum guard seguinte a nomear, o médico é avisado
    //    (_avisoTratamentoSemNomeRemedioEmUso). O colírio MANTIDO continua chegando ao
    //    tratamento, já com o nome, pelo Guard 2e.
    const linhasEmUso = new Set(emUsoOriginal.split('\n').map(chaveLinha).filter(Boolean));
    const jaConstaEmUso = _constaEmMedicacoesEmUso(d, Lexico);
    if (typeof d.tratamento === 'string' && d.tratamento.trim()) {
      const linhas = d.tratamento.split('\n');
      const novo = linhas.map((l, i) => {
        const c = candidatosDaLinha(l);
        // Linha já nomeada: corrige o nome não pronunciado. A troca "pela classe" obedece
        // à mesma regra do colírio novo: remédio em uso só entra na linha idêntica.
        if (!c) {
          return corrigir(l, (subs) => nomeadoEmOutraLinha(linhas, i, subs) ||
            (subs.some(jaConstaEmUso) && !linhasEmUso.has(chaveLinha(l))));
        }
        const emUso = c.lista.filter(jaConstaEmUso);
        if (emUso.length && !linhasEmUso.has(chaveLinha(l))) {
          log.push(`Guard 2g: linha do tratamento "${l.trim()}" NÃO promovida — ${[...new Set(emUso.map(a => a.principio))].join(', ')} já consta em medicacoes_em_uso e a linha não é a mesma (pode ser outro colírio)`);
          return l;
        }
        return promover(l, c);
      }).join('\n');
      if (novo !== d.tratamento) { d.tratamento = novo; alteradas++; }
    }
    if (!alteradas) return;

    // O nome que o modelo escreveu foi trocado: o médico precisa saber.
    for (const t of trocas.filter((x, i, arr) => arr.findIndex(y => y.de === x.de && y.para === x.para) === i)) {
      _pushAviso(cloned,
        `Medicação: o texto trazia "${t.de}", mas a fala não cita esse remédio — registrado "${t.para}". Confira.`);
    }

    const deVariante = usados.filter(a => {
      const entrada = Lexico.MEDICAMENTOS_LEXICO.find(e => e.id === a.id);
      return entrada && !entrada.nomes.map(Lexico.normalizarLexico).includes(Lexico.normalizarLexico(a.termo));
    });
    if (deVariante.length) {
      _pushAviso(cloned,
        'Medicação: o nome do colírio foi reconhecido por semelhança de som ' +
        `(${deVariante.map(a => `"${a.termo}" → ${a.principio}`).join(', ')}). Confira se é esse mesmo.`);
    }
    log.push(`Guard 2g: ${corrigidas ? 'linha com remédio ou marca não pronunciados corrigida para o que a fala diz' : 'remédio nomeado na fala promovido de classe/genérico para o nome'} (${[...new Set(usados.map(a => a.principio))].join(', ')}; ${alteradas} campo(s))`);
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
        // DEPOIS do nome, "para" é preposição ("timolol para a pressão"), não o verbo
        // parar: lido como suspensão, o colírio mantido sumia do tratamento e o painel
        // gravava "Sem prescrição de medicação" (revisão 2026-11-10). Só as formas que
        // são inequivocamente do verbo contam aqui.
        const reSusp = new RegExp(`(?:${_VERBO_SUSPENDER_RE.source})\\s+(?:com\\s+)?(?:o|a|os|as)?\\s*${nome}|${nome}\\s+(?:suspend|interromp|par(?:ar|ou|e|em|ad[oa])\\b|para\\s+de\\b|descontinu|retir|cort)`, 'i');
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
      if (ehRetorno && (/\d+x|vezes|dia|noite|manha|gota|continu/i.test(normLinha) || _listasDoLexico().remedioCronico.test(normLinha))) {
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
  // O registro padrão (LUBRIFICANTE_PADRAO) e a lista de lubrificantes NOMEADOS (marca ou
  // princípio) vêm do léxico — não há mais cópia aqui.
  const _LUBRIFICANTE_FALA_RE = /\blubrificantes?\b/;
  // Início da linha: "Lubrificante ocular", "Lubrificantes oculares", "Colírio lubrificante".
  // O lookahead recusa "(Marca)" colada ao nome.
  const _LINHA_LUBRIFICANTE_RE = /^(\s*(?:[-•*]\s*)?)(?:col[íi]rio\s+)?lubrificantes?(?:\s+ocular(?:es)?)?(?![A-Za-zÀ-ÿ])(?!\s*\()/i;

  function _guardLubrificanteGenerico(cloned, ctx, log) {
    const d = cloned.dados;
    if (!d || !d.tratamento) return;
    const fala = _normalizeForGuard(ctx.transcribedText);
    if (!_LUBRIFICANTE_FALA_RE.test(fala)) return;
    const nomeado = _listasDoLexico().lubrificanteNomeado;
    const LUBRIFICANTE_PADRAO = _lexico().LUBRIFICANTE_PADRAO;
    if (nomeado.test(fala)) return;

    let trocadas = 0;
    const linhas = String(d.tratamento).split('\n').map(linha => {
      if (nomeado.test(_normalizeForGuard(linha))) return linha;
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
      /oculos\s+(?:atuais?\s+)?(?:ainda\s+)?(?:(?:estao|esta|ta)\s+)?(servindo|servem|serve|ta\s+bom|esta\s+bom|bons?|bom)/,
      /mant[eé](m|r)\s+(os\s+)?oculos/,
      /continuar\s+(com\s+)?(os\s+)?oculos\s+(atuais?|que\s+tem)/,
      /nao\s+precisa\s+(fazer|comprar|trocar)\s+(?:de\s+|os?\s+|o\s+|novo\s+)?oculos/,
      /pode\s+continuar\s+com\s+(os\s+)?oculos/,
    ];

    if (!MANUTENCAO_RE.some(re => re.test(norm))) return;

    cloned.dados.conduta = conduta
      .replace(/sem\s+prescri[çc][ãa]o\s+de\s+[oó]culos/gi, 'Manutenção do óculos atual')
      .replace(/n[aã]o\s+houve\s+prescri[çc][ãa]o\s+de\s+[oó]culos/gi, 'Manutenção do óculos atual');

    log.push('Guard 5: "Sem prescrição de óculos" → "Manutenção do óculos atual" — transcript indica manutenção de grau');
  }

  // Frase negativa padrão de antecedentes oftalmológicos (canônica do prompt e paráfrases do LLM).
  const _NEGATIVA_ANTEC_OFT_RE = /^\s*nega\s+(?:diagn[oó]sticos?\s+e\s+procedimentos?\s+oftalmol[oó]gicos?|cirurgias?\s+(?:ou|e)\s+patologias?\s+(?:oculares?|oftalmol[oó]gicas?)|patologias?\s+(?:oculares?|oftalmol[oó]gicas?)|antecedentes?\s+(?:oculares?|oftalmol[oó]gicos?))(?:\s+pr[eé]vi[oa]s?)?\s*\.?\s*$/i;

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
  // "pressão tá boa / normal / 12" (PIO normal) NÃO sustenta H400 vazado (D30).
  const _NERVO_EVIDENCIA_RE = /nervo|papila|disc[oa]\s*optic|escava[cç]|excava[cç]|glaucom|pressa[oõ](?!\s+(?:ocular\s+|do\s+olho\s+|dos\s+olhos\s+)?(?:(?:ta|esta|e|bem|muito|tudo)\s+)*(?:boa|boas|normal|normais|otima|otimas|tranquila|tranquilas|certinha|ok\b|\d+))|tens[aã]o\s+ocular|\bpio\b/;
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
    // Colírio de glaucoma citado também é evidência; a lista deles é a do léxico.
    if (!fala || _NERVO_EVIDENCIA_RE.test(fala) || _listasDoLexico().hipotensor.test(fala)) return;

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
    const hasOculosParaPerto =
      /oculos\s+(?:[a-z]+\s+){0,3}(?:para|pra|de)\s+perto/.test(cleanText) ||
      /oculos\s+(?:[a-z]+\s+){0,3}(?:para|pra|de)\s+perto/.test(condutaNorm);
    const hasLeitura =
      /oculos\s+(?:[a-z]+\s+){0,3}(?:de\s+|para\s+|pra\s+)?(?:leitura|farmacia|pronto|ler)\b/.test(cleanText) ||
      /oculos\s+(?:de\s+|para\s+)?leitura\b/.test(condutaNorm);

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
   * MODO SOMBRA de medicamentos. Usa SÓ o léxico: o agente em si
   * (src/agents/medicamentos-agent.js) está estacionado e não é carregado.
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

  /**
   * MODO SOMBRA dos ITENS de medicação (passo 3 da reorganização, 2026-11-11).
   *
   * O modelo devolve, ao lado do texto de `tratamento`, uma lista estruturada
   * `medicacoes_itens` (um item por colírio/pomada/lubrificante: nome, nível, status,
   * posologia, evidência). Este passo valida os itens com o agente de medicamentos
   * (evidência literal, nome do léxico, nível) e compara, POR NOME, com o `tratamento`
   * que os guards produziram. O resultado vai só para o log — [sombra:itens] e a linha
   * [Med] — e é a medição que decide se vale deixar o agente escrever o campo.
   *
   * NÃO ALTERA NADA e NUNCA LANÇA: `rodar()` conta exceção como guard que falhou, e isso
   * seguraria a injeção por causa de uma medição. Por isso o corpo inteiro tem o próprio
   * try/catch, e agente ausente, campo ausente ou formato estranho só viram uma linha de log.
   * `medicacoes_itens` fica no nível de cima da resposta, FORA de `dados`: lista em `dados`
   * seria "formato inesperado" e seguraria a injeção.
   *
   * A evidência que o modelo cita vem do texto que ELE leu — com os nomes de remédio já
   * restaurados ("bimato à próstata" → "bimatoprosta") —, mas este passo recebe a fala
   * crua. Por isso a evidência é conferida contra a fala crua E contra a restaurada.
   * @returns {{estado: string}} estado: sem-itens | agente-ausente | formato-invalido |
   *          concorda | diverge | erro
   */
  function _sombraItensMedicamentos(cloned, ctx, log) {
    const resultado = { estado: 'sem-itens' };
    try {
      if (!cloned || cloned.medicacoes_itens === undefined) return resultado;
      const Agente = _agenteMed();
      const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
      if (!Agente || !Lexico) {
        resultado.estado = 'agente-ausente';
        log.push('[sombra:itens] agente de medicamentos não carregado — comparação não feita');
        return resultado;
      }
      const itens = cloned.medicacoes_itens;
      if (!Array.isArray(itens)) {
        resultado.estado = 'formato-invalido';
        log.push(`[sombra:itens] medicacoes_itens veio como ${itens === null ? 'null' : typeof itens}, não como lista — ignorado`);
        return resultado;
      }

      const bruta = String((ctx && ctx.transcribedText) || '');
      const fala = bruta + '\n' + Lexico.restaurarVariantesAsr(bruta).texto;
      const v = Agente.validar(itens, fala);
      const ativos = v.aceitos.filter(i => i && i.status !== 'suspenso');
      const c = Agente.conferirComTratamento(ativos, cloned.dados && cloned.dados.tratamento);

      Object.assign(resultado, {
        estado: c.concordam ? 'concorda' : 'diverge',
        recebidos: itens.length,
        aceitos: ativos.length,
        descartados: v.descartados.map(d => d.motivo),
        suspensos: v.aceitos.filter(i => i && i.status === 'suspenso').map(i => String(i.nome)),
        avisos: v.avisos,
        itemSemLinha: c.itemSemLinha,
        linhaSemItem: c.linhaSemItem,
        nomeDiferente: c.nomeDiferente,
      });

      const descartes = resultado.descartados.length ? ` (${resultado.descartados.length} descartado(s) sem sustento na fala)` : '';
      if (c.concordam) {
        log.push(`[sombra:itens] ${ativos.length} item(ns) de medicação concordam com o tratamento${descartes}`);
      } else {
        const partes = [];
        if (c.itemSemLinha.length) partes.push(`item sem linha no tratamento: ${c.itemSemLinha.join(' | ')}`);
        if (c.linhaSemItem.length) partes.push(`linha do tratamento sem item: ${c.linhaSemItem.join(' | ')}`);
        if (c.nomeDiferente.length) partes.push(`mesmo remédio com nome diferente: ${c.nomeDiferente.map(n => `item "${n.item}" × linha "${n.linha}"`).join(' | ')}`);
        log.push(`[sombra:itens] DIVERGE — ${partes.join('; ')}${descartes}`);
      }
      return resultado;
    } catch (e) {
      try { log.push(`[sombra:itens] comparação falhou (não-fatal): ${e && e.message}`); } catch (_) { /* log nunca bloqueia */ }
      return { estado: 'erro' };
    }
  }

  // Palavras genéricas de medicação, só para o log de diagnóstico [Med]. O léxico
  // enxerga marcas e princípios; "colírio", "lubrificação" e "ômega" ele não vê, e é
  // justamente o que o médico mais diz quando o nome do remédio não vem.
  const _MED_GENERICO_TOKEN_RE = /^(?:colirios?|pomadas?|gotas?|gotinhas?|pingar|instilar|lubrific\w*|lagrimas?|omega|remedios?|medicacao|medicacoes|medicamentos?|comprimidos?|capsulas?|suplementos?|vitaminas?)$/;

  /**
   * TEXTO PADRÃO DO TRATAMENTO (regra do médico, 2026-11-12): quando NENHUM medicamento foi
   * mencionado na conduta, o campo tratamento recebe "Sem prescrição de medicação". Quem
   * escreve o texto é o painel (`tratamentoPadrao`, em sidepanel-constants.js); este guard
   * decide só a EXCEÇÃO: o tratamento ficou vazio, mas a fala PRESCREVE ou MANTÉM uma
   * medicação. Escrever "Sem prescrição" aí seria o oposto da fala; o campo fica vazio e o
   * médico é avisado para preencher (flag `suprimirTextoPadraoTratamento`, no nível de cima
   * da resposta: dentro de `dados` seria "formato inesperado" e seguraria a injeção).
   *
   * Leitura desta regra (a instrução foi uma frase; a exceção é interpretação, a ser
   * conferida pelo médico): "medicamento mencionado" = remédio do léxico ou palavra genérica
   * de medicação (colírio, pomada, gota, pingar, remédio…) perto de um verbo de PRESCRIÇÃO ou
   * MANUTENÇÃO (passar, prescrever, manter, continuar, iniciar, pingar, "pode usar"…). Verbo
   * de histórico ("usa", "uso", "usando") não conta: paciente de glaucoma que só relata o
   * Xalatan, numa consulta de óculos, continua recebendo o texto padrão. Negação perto do
   * verbo ("não precisa de colírio", "sem colírio") também não conta, nem remédio
   * negado/suspenso (já excluído por _medicamentosCitadosNaFala).
   *
   * Falso positivo = campo vazio + aviso (o médico escreve o texto); falso negativo = o
   * comportamento de antes. Nenhum dos dois inventa prescrição. Não usa lista de remédios
   * própria: remédio vem do léxico, e o resto são palavras genéricas.
   */
  const _VERBO_PRESCRICAO_TOKEN_RE = /^(?:passar|passo|prescrev\w*|receit\w*|indic\w*|manter|mantem|mantenho|mantido|mantida|mantidos|mantidas|mantendo|continu\w*|inici\w*|comec\w*|aplicar|aplique|pingar|pingue|pinguem|tomar|tome|colocar|coloque|trocar|troco|troque)$/;
  const _VERBO_USAR_TOKEN_RE = /^(?:usar|use)$/;
  const _MODAL_ANTES_DE_USAR_RE = /^(?:pode|podem|vai|va|deve|devem|precisa|precisar|vamos|vou|quero|tem|tenha|recomendo|convem)$/;
  const _NEGACAO_TOKEN_RE = /^(?:nao|sem|nunca|nenhum|nenhuma|dispenso|dispensa|dispensar|desnecessario)$/;
  // Colírio de EXAME não é prescrição: o que se pinga para dilatar, anestesiar ou corar para medir a
  // pressão ("vou pingar um colírio pra dilatar") não pode suprimir o texto padrão — dilatação é comum
  // e o texto da fase 1 volta junto na fase 2.
  const _CONTEXTO_DE_EXAME_TOKEN_RE = /^(?:dilat\w*|midri\w*|pupilas?|anestesic\w*|fluoresce\w*|corante|medir|exame|tonometria|aplanacao)$/;
  const _JANELA_PRESCRICAO_TOKENS = 6;

  function _guardTratamentoVazioComMedicacao(cloned, ctx, log) {
    const d = cloned && cloned.dados;
    if (!d) return;
    if (String(d.tratamento == null ? '' : d.tratamento).trim()) return; // o campo não está vazio
    const flags = ctx.hookFlags || {};
    if (cloned.dilatacaoDetectada || flags.dilatacaoDetectada) return; // fase 1: o campo fica nulo de qualquer jeito
    const Lexico = typeof globalThis !== 'undefined' ? globalThis.MedicamentosLexico : null;
    if (!Lexico) return; // sem léxico: vale o comportamento de antes (texto padrão)
    const t = Lexico.normalizarLexico(ctx.transcribedText || '');
    if (!t) return;

    const tokens = t.split(' ');
    const mencoes = [];
    tokens.forEach((tk, i) => { if (_MED_GENERICO_TOKEN_RE.test(tk)) mencoes.push(i); });
    for (const a of _medicamentosCitadosNaFala(ctx.transcribedText).validos) {
      if (a.classe === 'ciclopegico') continue; // tropicamida/atropina: colírio de exame
      mencoes.push(t.slice(0, a.indice).split(' ').length - 1); // índice do token
    }
    if (!mencoes.length) return;

    const ehVerboDePrescricao = (i) => {
      const tk = tokens[i];
      const ehVerbo = _VERBO_PRESCRICAO_TOKEN_RE.test(tk) ||
        (_VERBO_USAR_TOKEN_RE.test(tk) && tokens.slice(Math.max(0, i - 2), i).some(x => _MODAL_ANTES_DE_USAR_RE.test(x)));
      if (!ehVerbo) return false;
      return !tokens.slice(Math.max(0, i - 4), i).some(x => _NEGACAO_TOKEN_RE.test(x));
    };

    for (const m of mencoes) {
      const ini = Math.max(0, m - _JANELA_PRESCRICAO_TOKENS);
      const fim = Math.min(tokens.length - 1, m + _JANELA_PRESCRICAO_TOKENS);
      if (tokens.slice(ini, fim + 1).some(x => _CONTEXTO_DE_EXAME_TOKEN_RE.test(x))) continue;
      for (let v = ini; v <= fim; v++) {
        if (v === m || !ehVerboDePrescricao(v)) continue;
        const trecho = tokens.slice(Math.max(0, Math.min(m, v) - 2), Math.max(m, v) + 3).join(' ');
        cloned.suprimirTextoPadraoTratamento = true;
        _pushAviso(cloned,
          `Tratamento: a fala indica medicação ("…${trecho}…"), mas o campo ficou vazio. ` +
          'O texto "Sem prescrição de medicação" NÃO foi escrito — preencha o tratamento manualmente.');
        log.push(`Texto padrão do tratamento suprimido — tratamento vazio com medicação prescrita/mantida na fala ("…${trecho}…")`);
        return;
      }
    }
  }

  /**
   * DIAGNÓSTICO [Med] — só log, nunca altera dado. Uma linha por consulta mostrando,
   * lado a lado, o que a fala cita, o que o modelo escreveu e o que sobrou depois dos
   * guards, para dizer ONDE um remédio dito se perdeu (decisão do modelo, guard ou
   * placeholder) sem deduzir pelo raciocínio. Nunca lança: log não pode quebrar a decisão.
   * @returns {string|null}
   */
  function _diagMedicacao(raw, cloned, ctx, guardsApplied, sombraItens) {
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

      // Itens estruturados do modelo × tratamento final (modo sombra; só aparece se o modelo os devolveu).
      if (sombraItens && sombraItens.estado && sombraItens.estado !== 'sem-itens') {
        const s = sombraItens;
        const nomes = (l) => (l && l.length ? l.join(' | ') : '∅');
        linhas.push(s.estado === 'concorda'
          ? `      itens(sombra): CONCORDA — ${s.aceitos} item(ns)${s.descartados && s.descartados.length ? `, ${s.descartados.length} descartado(s)` : ''}${s.suspensos && s.suspensos.length ? `, suspenso(s): ${nomes(s.suspensos)}` : ''}`
          : s.estado === 'diverge'
            ? `      itens(sombra): DIVERGE — sem-linha=[${nomes(s.itemSemLinha)}] sem-item=[${nomes(s.linhaSemItem)}] nome-diferente=[${(s.nomeDiferente || []).map(n => `${n.item} × ${n.linha}`).join(' | ') || '∅'}]${s.descartados && s.descartados.length ? ` descartados=${s.descartados.length}` : ''}`
            : `      itens(sombra): ${s.estado} (comparação não feita)`);
      }

      // Remédio do léxico dito e não nomeado em nenhum dos dois campos.
      const nomeados = norm(`${emUsoDepois || ''} ${d.tratamento || ''}`);
      const naoNomeados = achados.filter(a => !nomeados.includes(norm(a.principio).split(/[ +]/)[0]));
      if (naoNomeados.length) {
        linhas.push(`      ALERTA: fala cita ${naoNomeados.map(a => a.principio).join(', ')} e nem em_uso nem trat nomeiam`);
      }
      // Ponto A: o painel troca tratamento vazio por "Sem prescrição de medicação" — salvo quando a
      // fala prescreve/mantém medicação (_guardTratamentoVazioComMedicacao): aí o campo fica vazio.
      if ((!d.tratamento || !String(d.tratamento).trim()) && (achados.length || genericos.length)) {
        linhas.push(cloned.suprimirTextoPadraoTratamento
          ? '      ATENÇÃO: trat vazio com medicação prescrita/mantida na fala — o painel NÃO vai escrever "Sem prescrição de medicação"; o médico foi avisado para preencher'
          : '      ATENÇÃO: trat vazio com palavra de medicação na fala — o painel vai escrever "Sem prescrição de medicação" (conferir se procede)');
      }
      return linhas.join('\n');
    } catch (e) {
      return `[Med] diagnóstico falhou (não-fatal): ${e && e.message}`;
    }
  }

  // ------------------------------------------------------------------
  // Tipos dos campos + isolamento dos guards (o motor NÃO pode falhar aberto)
  // ------------------------------------------------------------------
  // Antes: os guards rodavam em fila, sem isolamento. Uma exceção em qualquer um
  // derrubava buildDecision inteiro, e o painel recuava para a resposta CRUA do
  // modelo e a injetava — a rede contra alucinação sumia justamente quando o
  // modelo saía do formato. Bastava `diagnostico` vir como lista
  // (`diagnostico.split is not a function`).
  //
  // Agora: (1) os campos de `dados` são normalizados para texto antes dos guards;
  // (2) cada guard roda isolado — o que falha é registrado e os outros seguem;
  // (3) qualquer falha, ou campo em formato inesperado, levanta `segurarInjecao`,
  // e o painel mostra os campos para conferência em vez de injetar sozinho.

  function _achatarEmTexto(v, prefixo) {
    if (v == null) return '';
    if (typeof v !== 'object') return (prefixo ? prefixo + ': ' : '') + String(v);
    const linhas = [];
    if (Array.isArray(v)) {
      for (const item of v) { const t = _achatarEmTexto(item, prefixo); if (t) linhas.push(t); }
    } else {
      for (const k of Object.keys(v)) {
        const t = _achatarEmTexto(v[k], prefixo ? `${prefixo} ${k}` : k);
        if (t) linhas.push(t);
      }
    }
    return linhas.join('\n');
  }

  /**
   * O prompt declara TODO campo de `dados` como "string ou null". Lista de textos
   * é só outro jeito de escrever "um item por linha": une sem perda. Qualquer
   * outra forma (objeto, lista de objetos, número, booleano) vira texto no melhor
   * esforço e é devolvida como INESPERADA — o conteúdo pede olho humano.
   * @returns {string[]} nomes dos campos em formato inesperado
   */
  function _normalizarTiposDados(cloned, log) {
    const inesperados = [];
    const dados = cloned && cloned.dados;
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return inesperados;
    const textual = (x) => x == null || typeof x === 'string' || typeof x === 'number';
    for (const campo of Object.keys(dados)) {
      const v = dados[campo];
      if (v == null || typeof v === 'string') continue;
      if (Array.isArray(v) && v.every(textual)) {
        const texto = v.filter(x => x != null && String(x).trim()).map(String).join('\n');
        dados[campo] = texto || null;
        log.push(`[tipos] dados.${campo} veio como lista — unido em texto, um item por linha`);
        continue;
      }
      const forma = Array.isArray(v) ? 'lista de objetos' : typeof v;
      dados[campo] = _achatarEmTexto(v) || null;
      inesperados.push(campo);
      log.push(`[tipos] dados.${campo} veio em formato inesperado (${forma}) — convertido em texto; conferir antes de injetar`);
    }
    return inesperados;
  }

  function buildDecision(rawAIResponse, context) {
    const ctx = context || {};
    const cloned = _shallowCloneAIResponse(rawAIResponse);
    const guardsApplied = [];
    const guardsFalhos = [];
    let sombraItens = { estado: 'sem-itens' };

    // Executor isolado: um guard que lança não leva os outros junto.
    const rodar = (nome, fn) => {
      try {
        return fn();
      } catch (e) {
        const erro = (e && e.message) || String(e);
        guardsFalhos.push({ guard: nome.replace(/^_/, ''), erro });
        guardsApplied.push(`[FALHA] ${nome.replace(/^_/, '')} não rodou: ${erro}`);
        return undefined;
      }
    };

    // Antes de qualquer guard: eles usam .split/.replace direto nos campos.
    const camposInesperados = rodar('_normalizarTiposDados', () => _normalizarTiposDados(cloned, guardsApplied)) || [];

    // Guard 0: ruído/incoerência — roda ANTES e fora do bloco dados (dados pode ser null)
    if (cloned) {
      rodar('_guardTranscricaoIncoerente', () => _guardTranscricaoIncoerente(cloned, ctx, guardsApplied));
      // Guard 7: fase 2 pós-dilatação. Fora do bloco `dados` porque
      // injectExamesNormais vive na raiz da resposta. Precede _reconcileInjectFlags.
      rodar('_guardExamesNormaisFase2', () => _guardExamesNormaisFase2(cloned, ctx, guardsApplied));
    }

    if (cloned && cloned.dados) {
      rodar('_guardDilatacao', () => _guardDilatacao(cloned, ctx, guardsApplied));
      rodar('_guardBlefariteLiteral', () => _guardBlefariteLiteral(cloned, ctx, guardsApplied));
      rodar('_guardAssociacaoATB', () => _guardAssociacaoATB(cloned, ctx, guardsApplied));
      rodar('_guardClasseAntibioticoSemFala', () => _guardClasseAntibioticoSemFala(cloned, ctx, guardsApplied));
      // Antes do 2e: ele copia linhas de medicacoes_em_uso para o tratamento, e a
      // cópia tem que levar o nome, não a classe (log 2026-11-09).
      rodar('_guardMedicamentoNomeadoNaFala', () => _guardMedicamentoNomeadoNaFala(cloned, ctx, guardsApplied));
      rodar('_guardColirioMantidoSemTratamento', () => _guardColirioMantidoSemTratamento(cloned, ctx, guardsApplied));
      // Depois do rebaixamento da "Associação": promove o colírio genérico da
      // blefarite ao protocolo declarado (Tobramicina + dexametasona).
      rodar('_guardColirioBlefariteProtocolo', () => _guardColirioBlefariteProtocolo(cloned, ctx, guardsApplied));
      // O inverso: a linha do protocolo que o modelo escreveu sem colírio na fala sai.
      rodar('_guardColirioBlefariteSemPrescricao', () => _guardColirioBlefariteSemPrescricao(cloned, ctx, guardsApplied));
      rodar('_guardCondutaContaminada', () => _guardCondutaContaminada(cloned, ctx, guardsApplied));
      // Depois da contaminada (traz o lubrificante da conduta) e do protocolo da
      // blefarite (que ainda lê "Lubrificante ocular" como não-colírio).
      rodar('_guardLubrificanteGenerico', () => _guardLubrificanteGenerico(cloned, ctx, guardsApplied));
      // Depois de TODOS os guards de medicação: só avisa da linha que ninguém nomeou.
      rodar('_avisoTratamentoSemNomeRemedioEmUso', () => _avisoTratamentoSemNomeRemedioEmUso(cloned, ctx, guardsApplied));
      // Antes do guard de presbiopia: PADRAO_MULTIFOCAL lê a conduta, e uma
      // conduta com tipo fabricado arrastaria H524 junto (log 2026-08-05).
      rodar('_guardMultifocalSemEvidencia', () => _guardMultifocalSemEvidencia(cloned, ctx, guardsApplied));
      rodar('_guardManutencaoOculos', () => _guardManutencaoOculos(cloned, ctx, guardsApplied));
      rodar('_guardAntecedentesNegativaFabricada', () => _guardAntecedentesNegativaFabricada(cloned, ctx, guardsApplied));
      rodar('_guardComorbidadesNegativaFabricada', () => _guardComorbidadesNegativaFabricada(cloned, ctx, guardsApplied));
      // Antes do guard de presbiopia: o veto de pseudofacia bilateral é regente
      // lá dentro — desfazer a lente depois deixaria a H52.4 apagada por uma
      // pseudofacia que já não existe (log 2026-09-02).
      rodar('_guardPseudofaciaSemEvidencia', () => _guardPseudofaciaSemEvidencia(cloned, ctx, guardsApplied));
      rodar('_guardNervoOpticoSemEvidencia', () => _guardNervoOpticoSemEvidencia(cloned, ctx, guardsApplied));
      // Guard de óculos e presbiopia só se não há dilatação
      const flags = ctx.hookFlags || {};
      const dilatacao = !!(cloned.dilatacaoDetectada || flags.dilatacaoDetectada);
      if (!dilatacao) {
        rodar('_guardOculosNaConduta', () => _guardOculosNaConduta(cloned, ctx, guardsApplied));
        rodar('_guardPresbiopiaObrigatoria', () => _guardPresbiopiaObrigatoria(cloned, ctx, guardsApplied));
      }
      // POR ÚLTIMO no bloco `dados`: guards acima reescrevem o texto da
      // biomicroscopia (blefarite literal, lente narrativa da pseudofacia).
      // Reordenar antes deixaria a reescrita pousando na ordem antiga.
      rodar('_ordenaOlhosODPrimeiro', () => _ordenaOlhosODPrimeiro(cloned, guardsApplied));
      // Depois de TODO guard que pode esvaziar o tratamento (2c remove linha; dilatação zera):
      // tratamento vazio + medicação prescrita/mantida na fala = o painel não escreve "Sem prescrição".
      rodar('_guardTratamentoVazioComMedicacao', () => _guardTratamentoVazioComMedicacao(cloned, ctx, guardsApplied));
      rodar('_sombraMedicamentos', () => _sombraMedicamentos(cloned, ctx, guardsApplied));
      // Mede os itens estruturados do modelo contra o tratamento final. Nunca lança nem altera dado.
      sombraItens = rodar('_sombraItensMedicamentos', () => _sombraItensMedicamentos(cloned, ctx, guardsApplied)) || sombraItens;
    }

    // Se a reconciliação falhar, nenhum template é injetado: é o lado seguro.
    const injectFlags = rodar('_reconcileInjectFlags', () => _reconcileInjectFlags(cloned || {}, ctx)) || {
      injectExamesNormais: false,
      injectBlefarite: false,
      dilatacao: !!((cloned && cloned.dilatacaoDetectada) || (ctx.hookFlags && ctx.hookFlags.dilatacaoDetectada)),
      blefariteDescritaNoExame: false,
    };
    rodar('_avisoBiomicroscopiaOrfa', () => _avisoBiomicroscopiaOrfa(rawAIResponse, cloned, injectFlags, ctx, guardsApplied));
    // Depois dos guards que podem ZERAR a fundoscopia (dilatação, fase 2): não avisar
    // sobre um texto que nem vai ser injetado.
    rodar('_avisoFundoscopiaInterpretativa', () => _avisoFundoscopiaInterpretativa(cloned, guardsApplied));

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

    // Verificação incompleta = o painel não injeta sozinho (ver bloco de isolamento).
    const motivos = [];
    if (guardsFalhos.length) {
      motivos.push(`${guardsFalhos.length} verificação(ões) automática(s) não rodaram (${guardsFalhos.map(f => f.guard).join(', ')})`);
    }
    if (camposInesperados.length) {
      motivos.push(`campo(s) em formato inesperado: ${camposInesperados.join(', ')}`);
    }

    return {
      clonedAIResponse: cloned,
      injectFlags,
      guardsApplied,
      guardsFalhos,
      camposInesperados,
      segurarInjecao: motivos.length > 0,
      motivoSegurar: motivos.length ? motivos.join('; ') : null,
      diagMedicacao: _diagMedicacao(rawAIResponse, cloned, ctx, guardsApplied, sombraItens),
      sombraItens,
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
