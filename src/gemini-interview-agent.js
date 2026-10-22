/**
 * GEMINI INTERVIEW AGENT — análise de transcrição de consulta oftalmológica.
 * Contém o prompt clínico completo (_buildConsultationPrompt) — as regras de
 * conduta/tratamento aqui DEVEM espelhar skills/user/conduta-tratamento-oftalmologia/SKILL.md
 * (testes [SKILL-SYNC] em utils/integration-test.js verificam as âncoras).
 * Depende de: Logger, apiService, _parseGeminiJSON (gemini-json-utils.js).
 * Extraído de geminiService.js na modularização de 2026-07-02.
 */

// ============================================================================
// AGENTE 2 — GeminiInterviewAgent (Entrevista / Áudio)
// ============================================================================

const CONSULTATION_CONFIG = { maxOutputTokens: 32768 };

// --------------------------------------------------------------------------
// Padrões de gatilho de voz — consumidos de config/clinical-triggers.js
// (fonte autoritativa; não duplicar aqui)
// --------------------------------------------------------------------------
// ClinicalTriggers é definido antes deste arquivo no HTML e disponível como
// globalThis.ClinicalTriggers em Node tests (UMD export do clinical-triggers.js).

// --------------------------------------------------------------------------
// Base de conhecimento de medicamentos (exclusiva do agente de entrevista)
// --------------------------------------------------------------------------

const MED_KNOWLEDGE_BASE = `
LISTA DE MEDICAMENTOS OFTALMOLÓGICOS COMUNS (BRASIL):

GLAUCOMA - Prostaglandinas:
  Xalatan/Xalaprost (Latanoprosta), Travatan (Travoprosta), Lumigan (Bimatoprosta)
GLAUCOMA - Beta-bloqueadores:
  Timoptol/Glaucotrat (Maleato de timolol)
GLAUCOMA - Alfa-agonistas:
  Alphagan (Brimonidina)
GLAUCOMA - Inib. Anidrase Carbônica:
  Trusopt (Dorzolamida), Azopt (Brinzolamida)
GLAUCOMA - Associações:
  Combigan (Brimonidina+Timolol), Cosopt (Dorzolamida+Timolol), Ganfort (Bimatoprosta+Timolol)

LUBRIFICANTES:
  Systane, Hylo, Hyabak, Artelac, Optive, Refresh, Lacrifilm (Carmelose/Hialuronato)

CORTICÓIDES:
  Maxidex (Dexametasona), Pred Fort (Prednisolona), FML (Fluormetolona), Loteprednol/Loteprol (Loteprednol)
ANTIBIÓTICOS:
  Zymar (Gatifloxacino), Vigamox (Moxifloxacino), Tobrex (Tobramicina), Ciloxan (Ciprofloxacino),
  Oflox (Ofloxacino), Vancocin colírio (Vancomicina)
ASSOCIAÇÕES ATB+CORTICÓIDE:
  Vigadexa (Moxifloxacino+Dexametasona), Tobradex/Tobracort/Tobramicina-Dexa (Tobramicina+Dexametasona),
  Maxitrol (Neomicina+Polimixina B+Dexametasona), Cilodex (Ciprofloxacino+Dexametasona)

ANTI-INFLAMATÓRIOS NÃO ESTEROIDAIS:
  Acular (Cetorolaco), "trometamol"/"trometamina"/"trometamino" e variantes de ASR como "trometolou"
  (Cetorolaco trometamina — o sufixo trometamina é do cetorolaco), Nevanac (Nepafenaco), Still (Diclofenaco)

ANTIALÉRGICOS:
  Patanol (Olopatadina), Zaditen (Cetotifeno), Lastacaft (Alcaftadina), Alegysal (Pemirolaste)

OLHO SECO / IMUNOMODULADORES:
  Restasis/Ciclosporina colírio (Ciclosporina), Optive Fusion, Ikervis (Ciclosporina)

ANTIVIRAIS:
  Zovirax pomada oftálmica (Aciclovir)
`.trim();

class GeminiInterviewAgent {
  constructor() {
    this.logger = new Logger('GeminiInterviewAgent');
  }

  // --------------------------------------------------------------------------
  // Detecção de gatilhos de exame (usada para pré-classificar o texto)
  // --------------------------------------------------------------------------

  detectExamTriggers(text) {
    if (!text) return { hasNormalExams: false, hasBlefarite: false };

    // Usar as listas autoritativas de clinical-triggers.js via normalizeText()
    const triggers = (typeof ClinicalTriggers !== 'undefined')
      ? ClinicalTriggers
      : (typeof globalThis !== 'undefined' && globalThis.ClinicalTriggers) || null;

    if (triggers) {
      const norm = triggers.normalizeText(text);
      const hasNormalExams = triggers.EXAMES_NORMAIS_COMMANDS.some(cmd => norm.includes(cmd));
      const hasBlefarite   = triggers.EXAME_BLEFARITE_COMMANDS.some(cmd => norm.includes(cmd));
      if (hasNormalExams) this.logger.info('Gatilho de exames normais detectado');
      if (hasBlefarite)   this.logger.info('Gatilho de blefarite detectado');
      return { hasNormalExams, hasBlefarite };
    }

    // Fallback defensivo: sem ClinicalTriggers disponível, não pré-classificar
    this.logger.warn('ClinicalTriggers não disponível — detectExamTriggers retorna false');
    return { hasNormalExams: false, hasBlefarite: false };
  }

  // --------------------------------------------------------------------------
  // Análise principal da consulta
  // --------------------------------------------------------------------------

  async analyzeConsultation(transcribedText, options = {}) {
    const forceComplete = !!(options && options.forceComplete);
    this.logger.info(forceComplete
      ? 'Iniciando análise de consulta (reprocessamento — dilatação cancelada)'
      : 'Iniciando análise de consulta');

    transcribedText = this._normalizarSiglasExameAsr(transcribedText);

    // Diagnóstico: o log de áudio trunca a transcrição em 120 caracteres, então
    // "falei OCT e saiu exame não especificado" não era verificável. Mostra o
    // entorno de cada "exame"/"pedido" que chegou ao modelo.
    try {
      const trechos = [];
      const reExame = /(?:exame|pedido|pedir|vou pedir)/gi;
      let mm;
      while ((mm = reExame.exec(transcribedText)) && trechos.length < 6) {
        const ini = Math.max(0, mm.index - 50);
        trechos.push('…' + transcribedText.slice(ini, mm.index + 70).replace(/\s+/g, ' ') + '…');
      }
      if (trechos.length) this.logger.info('[ASR-EXAME] Trechos de exame na transcrição enviada:', trechos);
    } catch (_) { /* diagnóstico nunca bloqueia a análise */ }

    const { hasNormalExams, hasBlefarite } = this.detectExamTriggers(transcribedText);
    const prompt = this._buildConsultationPrompt(transcribedText, hasNormalExams, hasBlefarite, forceComplete);

    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`[ANÁLISE] Tentativa ${attempt}/${maxRetries}`);

        const { text: rawText } = await apiService.callGeminiAPI(
          [{ text: prompt }],
          CONSULTATION_CONFIG
        );

        const result = _parseGeminiJSON(rawText, 'consulta');

        if (result._raciocinio) {
          this.logger.info('Raciocínio da IA:', result._raciocinio);
        }

        // Sanitização: garante que medicamentos com posologia não fiquem em conduta
        this._sanitizeCondutaTratamento(result);

        // Rede determinística: exame NOMEADO e pedido na fala não pode sumir da conduta.
        this._garantirExamesPedidosNaConduta(result, transcribedText);

        const validation = this._validateConsultationData(result);
        if (!validation.isValid) {
          this.logger.warn('[ANÁLISE] Validação falhou:', validation.errors);
          if (attempt < maxRetries) continue;
        }

        this.logger.success('Análise concluída', { tipo: result.tipo_consulta });
        return result;

      } catch (err) {
        if (attempt < maxRetries) {
          this.logger.warn(`[ANÁLISE] Erro na tentativa ${attempt}, retentando`);
        } else {
          throw err;
        }
      }
    }

    throw new Error('Falha na análise após todas as tentativas');
  }

  // --------------------------------------------------------------------------
  // ASR: a sigla "OCT" falada ("ó-cê-tê") sai do reconhecimento de voz como
  // "o c t", "ocete", "o ce te", "octi"… O modelo não reconhece isso como o
  // exame, e a regra "nunca nomear exame que o médico não nomeou" (correta)
  // rebaixa o pedido para "exame complementar (não especificado)". Aqui a
  // grafia é restaurada ANTES do prompt — só variantes fonéticas da própria
  // sigla, nunca dedução a partir de diagnóstico.
  // --------------------------------------------------------------------------

  _normalizarSiglasExameAsr(texto) {
    if (typeof texto !== 'string' || !texto) return texto;
    const L = 'a-zà-úA-ZÀ-Ú0-9';
    const VARIANTES_OCT = new RegExp(
      `(?<![${L}])(?:` +
        `o\\.?\\s?c\\.?\\s?t` +                      // "o c t", "o.c.t"
        `|[oóô]\\s?c[eêé]\\s?t[eêéií]` +              // "o ce te", "ó cê tê", "o ce ti"
        `|[oóô]s[eêé]\\s?t[eêé]` +                   // "ose te"
        `|oc[eêé]t[eêé]?` +                          // "ocete", "ocetê"
        `|oct[iíe]` +                                // "octi", "octe"
        `|o\\s?c\\s?d\\s?e` +                        // "o c d e"
        `|ocde` +                                    // "OCDE" (erro comum do Chrome)
      `)(?![${L}])`,
      'gi'
    );
    let n = 0;
    const out = texto.replace(VARIANTES_OCT, () => { n++; return 'OCT'; });
    if (n > 0) {
      this.logger.info(`[ASR-EXAME] ${n} variante(s) fonética(s) de "OCT" restaurada(s) na transcrição`);
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // Rede determinística: exames pedidos na FALA que o modelo omitiu da conduta.
  // Queixa recorrente (2026-10-22): "vou pedir um OCT" ditado e a conduta sem a
  // linha. O prompt sozinho não basta — a regra "nunca nomear exame que o médico
  // não nomeou" empurra o modelo para o lado do silêncio. Aqui a fonte é a fala
  // (catálogo em ClinicalTriggers), nunca o diagnóstico, então a regra de
  // 2026-08-17 continua intacta. Só ACRESCENTA linha; nunca remove pedido do
  // modelo, exceto a linha genérica "exame complementar" quando a fala nomeou o exame.
  // --------------------------------------------------------------------------

  _garantirExamesPedidosNaConduta(result, transcricao) {
    try {
      if (!result || !result.dados || result.tipo_consulta === 'invalida') return;
      const triggers = (typeof ClinicalTriggers !== 'undefined')
        ? ClinicalTriggers
        : (typeof globalThis !== 'undefined' && globalThis.ClinicalTriggers) || null;
      if (!triggers || typeof triggers.detectaExamesPedidosNaFala !== 'function') return;

      const pedidos = triggers.detectaExamesPedidosNaFala(transcricao);
      if (!pedidos.length) return;

      const norm = (s) => triggers.normalizeText(String(s || ''));
      let linhas = (result.dados.conduta || '').split(/\n/).map(l => l.trim()).filter(Boolean);
      const catalogo = triggers.EXAMES_CATALOGO || [];
      const jaTem = (ex) => {
        const def = catalogo.find(c => c.id === ex.id);
        return !!def && linhas.some(l => /^(?:solicitar|pedir|pedido)/i.test(l) && def.re.test(norm(l)));
      };

      const novos = pedidos.filter(ex => !jaTem(ex));
      if (!novos.length) return;

      // A fala NOMEOU o exame: a linha genérica "não especificado" fica obsoleta.
      linhas = linhas.filter(l => !/exame complementar \(n[aã]o especificado/i.test(l));

      const idxRetorno = linhas.findIndex(l => /^retorno\b/i.test(l));
      const linhasNovas = novos.map(ex => 'Solicitar ' + ex.label);
      if (idxRetorno >= 0) linhas.splice(idxRetorno, 0, ...linhasNovas);
      else linhas.push(...linhasNovas);

      result.dados.conduta = linhas.join('\n');
      this.logger.warn('[EXAME-GARANTIDO] Pedido(s) de exame ditos na fala e ausentes da conduta — acrescentado(s):', linhasNovas);
    } catch (err) {
      this.logger.warn('[EXAME-GARANTIDO] falhou sem bloquear a análise:', err && err.message);
    }
  }

  // --------------------------------------------------------------------------
  // Sanitização: move medicamentos com posologia de conduta → tratamento
  // --------------------------------------------------------------------------

  /**
   * Move linhas com medicamento+posologia que erroneamente foram para conduta → tratamento.
   * Detecta: nome-de-droga seguido de dose/frequência (gota, mg, x/dia, 6/6h, etc.)
   */
  _sanitizeCondutaTratamento(result) {
    if (!result?.dados) return;

    // Gemini pode retornar conduta/tratamento como array em vez de string — normalizar.
    const _toString = (v) => {
      if (v == null) return null;
      if (Array.isArray(v)) return v.filter(Boolean).join('\n');
      if (typeof v === 'string') return v;
      return String(v);
    };
    result.dados.conduta   = _toString(result.dados.conduta);
    result.dados.tratamento = _toString(result.dados.tratamento);

    // Padrão: detecta posologia farmacológica — unidade de dose explícita OU frequência
    // de uso sem unidade numérica (ex: "ao longo do dia", "conforme necessidade").
    // Restrita o suficiente para evitar falso positivo com "Retorno 6 meses", "Retorno 1 ano".
    const MED_POSOLOGIA_RE = /\b\w[\w\s]{1,30}?\b\s*(?:\d+\s*(?:gota[s]?|mg|mcg|ml|UI|comp(?:rimido)?|cp)\b|\d+\s*x\s*[\/\s]?\s*(?:dia|semana|noite|manha|manhã)|\d+\/\d+\s*h|\b(?:4x|6x|8x|12x|2x|3x|1x)\/dia|ao\s+longo\s+do\s+dia\b|conforme\s+necessidade|conforme\s+necessario|quando\s+necessario|se\s+necessario\b|ao\s+deitar\b|s\/n\b)/i;

    // Linhas que começam com classe de medicamento oftálmico específico — são prescrições
    // mesmo sem posologia numérica (ex: "Lubrificante ocular 1x ao dia").
    const MED_CLASS_INDICATOR_RE = /^(?:lubrificante\s+ocular|pomada\s+oftalm|gel\s+oftalm|solucao\s+oftalm)/i;

    // Lista branca: padrões que são inequivocamente conduta médica.
    // Compressa, higiene palpebral, shampoo e lavagem NÃO constam aqui —
    // pertencem ao TRATAMENTO (ações físicas do paciente).
    const CONDUTA_VALIDA_RE = /^(?:retorno\b|encaminhamento|solicitar|pedir\b|pedido de|prescrição de óculos|prescricao de oculos|manutenção do óculos|manutencao do oculos|sem prescrição de óculos|sem prescricao de oculos|atualização de grau|atualizacao de grau|suspender\b|manter\b|alta\b|observ|acompanhar|acompanhamento|revisar|avaliação|avaliacao|campo visual|tonometria|massagem|orientad[ao]|explicad[ao]|esclarecid[ao]|programar|indicar|fundo com|oct\b|retinografia|topografia|paquimetria|biometria|angiografia|ecografia|ultrassonografia|tomografia|campimetria|curva de tens[aã]o)/i;

    const condutaLinhas = result.dados.conduta ? result.dados.conduta.split(/\n/) : [];
    const ficamNaConduta   = [];
    const vaoParaTratamento = [];

    // Orientações que podem ficar em conduta (ex.: oclusão ocular pós-op).
    // Compressa, higiene palpebral, shampoo, lubrificante e ômega 3 pertencem
    // ao TRATAMENTO e são tratados pela LISTA NEGRA no DecisionEngine.
    const ORIENTACAO_PROCEDIMENTAL_RE = /^(oclusão|oclusao|tampão|tampao|exerc|oclus)/i;

    for (const linha of condutaLinhas) {
      const trimmed = linha.trim();
      if (!trimmed) continue;

      // Conduta válida explícita — não mover
      if (CONDUTA_VALIDA_RE.test(trimmed)) {
        ficamNaConduta.push(trimmed);
        continue;
      }

      // Orientações procedimentais ficam em conduta — não são medicamentos
      if (ORIENTACAO_PROCEDIMENTAL_RE.test(trimmed)) {
        ficamNaConduta.push(trimmed);
        continue;
      }

      if (MED_POSOLOGIA_RE.test(trimmed) || MED_CLASS_INDICATOR_RE.test(trimmed)) {
        vaoParaTratamento.push(trimmed);
        this.logger.warn(`[Sanitize] Movido de conduta → tratamento: "${trimmed}"`);
      } else {
        ficamNaConduta.push(trimmed);
      }
    }

    if (vaoParaTratamento.length > 0) {
      result.dados.conduta = ficamNaConduta.join('\n') || null;

      const tratamentoAtual = result.dados.tratamento || '';
      const novoTratamento  = [tratamentoAtual, ...vaoParaTratamento].filter(Boolean).join('\n');
      result.dados.tratamento = novoTratamento || null;
    }

    // Pedidos de exame: sempre pertencem à conduta — mover se Gemini os colocou em tratamento.
    const EXAME_RE = /^(?:solicitar|pedir|pedido de|exame[:\s]|oct\b|campo visual|retinografia|topografia|paquimetria|curva de tens[aã]o|biometria|angiografia|ecografia|ultrassonografia|tomografia|campimetria|fundo com|biomicroscopia)/i;

    // Mover pedidos de exame do tratamento para conduta.
    // Compressa/higiene que estejam em tratamento ficam lá — pertencem ao tratamento.
    if (result.dados.tratamento) {
      const tratLinhas = result.dados.tratamento.split(/\n/);
      const ficamNoTrat = [];
      const vaoParaConduta = [];
      for (const linha of tratLinhas) {
        const trimmed = linha.trim();
        if (!trimmed) continue;
        if (EXAME_RE.test(trimmed)) {
          vaoParaConduta.push(trimmed);
          this.logger.warn(`[Sanitize] Movido de tratamento → conduta: "${trimmed}"`);
        } else {
          ficamNoTrat.push(trimmed);
        }
      }
      if (vaoParaConduta.length > 0) {
        result.dados.tratamento = ficamNoTrat.join('\n') || null;
        const condutaAtual = result.dados.conduta || '';
        result.dados.conduta = [condutaAtual, ...vaoParaConduta].filter(Boolean).join('\n') || null;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Validação semântica dos dados de consulta
  // --------------------------------------------------------------------------

  _validateConsultationData(data) {
    const errors = [];

    if (!data?.tipo_consulta) {
      return { isValid: false, errors: ['Campo tipo_consulta ausente'] };
    }

    if (!['primeira_consulta', 'retorno', 'conclusao', 'invalida'].includes(data.tipo_consulta)) {
      errors.push('tipo_consulta inválido');
    }

    // Para transcrições inválidas, dados pode ser null — isso é esperado.
    if (data.tipo_consulta === 'invalida') {
      return { isValid: true, errors: [] };
    }

    if (!data.dados) {
      return { isValid: false, errors: ['Objeto dados ausente'] };
    }

    if (data.tipo_consulta === 'primeira_consulta') {
      // Paciente sem queixa em consulta com dilatação tem HDA vazia por design
      if (!data.dilatacaoDetectada && (!data.dados.hda || data.dados.hda.trim().length < 10)) {
        errors.push('HDA muito curta ou vazia');
      }
    }

    // Retorno não exige HDA — validar apenas que tem algum dado útil
    if (data.tipo_consulta === 'retorno') {
      const d = data.dados;
      const hasAnyData = d.retorno || d.medicacoes_em_uso || d.diagnostico || d.conduta || d.tratamento;
      if (!hasAnyData) {
        errors.push('Retorno sem nenhum dado extraído');
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  // --------------------------------------------------------------------------
  // Prompt do Agente de Entrevista
  // --------------------------------------------------------------------------

  _buildConsultationPrompt(transcribedText, hasNormalExams, hasBlefarite, forceComplete = false) {
    return `
Você é um assistente especialista em oftalmologia.
Tarefa: extrair dados ESTRUTURADOS de uma transcrição de consulta médica.
${forceComplete ? `
═══════════════════════════════════════════════════════════════
★★★ MODO REPROCESSAMENTO — DILATAÇÃO CANCELADA (PRIORIDADE MÁXIMA)
═══════════════════════════════════════════════════════════════
O médico CANCELOU uma marcação de dilatação feita por engano. Trate esta
transcrição como uma consulta COMPLETA e NORMAL:
- Defina SEMPRE dilatacaoDetectada=false, mesmo que o texto contenha "dilatar",
  "colírio para dilatar", "esperar o colírio fazer efeito" ou similar. Essas
  menções NÃO indicam dilatação nesta análise — ignore-as como gatilho.
- Extraia conduta, tratamento, biomicroscopia e fundoscopia NORMALMENTE do texto,
  como em qualquer consulta encerrada. NÃO zere esses campos por causa da dilatação.
` : ''}
═══════════════════════════════════════════════════════════════
REGRAS ANTI-DELÍRIO (CRÍTICAS)
═══════════════════════════════════════════════════════════════
1. A transcrição pode conter ERROS de reconhecimento de voz.
   - Palavras sem sentido devem ser IGNORADAS, não interpretadas.
   - Ex: "beleza" isolado não significa nada médico - ignore.
   - Ex: "microscínio" provavelmente é erro - não invente medicamento.

2. Se o paciente NEGA algo, use estas frases EXATAS:
   - "não usa colírio/remédio para os olhos" → medicacoes_em_uso: "Nega uso de medicações oculares"
   - "não usa nenhum remédio" (sistêmico também) → medicacoes_em_uso: "Nega uso de medicações oculares" + alteracoes_sistemicas inclui "Nega comorbidades"
   - "nunca fez cirurgia/tratamento" → antecedentes_oftalmologicos: "Nega diagnósticos e procedimentos oftalmológicos prévios"
   - "não tem doença" → alteracoes_sistemicas: "Nega comorbidades"
   - "família sem problema de visão" → antecedentes_familiares: "Nega diagnósticos oftalmológicos familiares"

   ⚠️ REGRA CRÍTICA — medicacoes_em_uso NUNCA pode ser null ou vazio em primeira_consulta ou retorno:
   - Se o paciente nega uso OU nenhum colírio/pomada foi mencionado → "Nega uso de medicações oculares"
   - Se o paciente AFIRMA usar mas não nomeia nem diz a finalidade → "Refere uso de colírio (não identificado na consulta)"
     (a negativa é PROIBIDA depois de um "sim" — ver a exceção obrigatória adiante)
   - NUNCA deixe este campo em branco. Ausência de RESPOSTA = negação implícita; resposta
     afirmativa sem detalhe NÃO é ausência de resposta.

3. Se não há informação clara, use null ou string vazia - NÃO INVENTE.
   Exceção: medicacoes_em_uso — use "Nega uso de medicações oculares" em vez de null (ver regra 2).

4. Extraia apenas FATOS CLAROS, não interpretações de texto confuso.

5. Use terminologia médica CORRETA e CONCISA.

6. NUNCA infira ou complete o nome de um medicamento que não foi dito explicitamente.
   ❌ Paciente disse "lubrificante" → NÃO escreva "Artelac" ou qualquer marca
   ❌ Paciente disse "colírio amarelo" → NÃO escreva "Xalatan"
   ❌ Paciente disse "aquele remédio" → NÃO escreva nenhum nome
   ✅ Registre exatamente o que foi dito: "lubrificante ocular", "colírio para pressão", "colírio amarelo"
   A base de conhecimento serve APENAS para reconhecer nomes efetivamente pronunciados,
   nunca para completar ou inferir nomes não ditos.
   ⚠️ Isto NÃO impede registrar a CLASSE ou um genérico quando o médico PRESCREVE um remédio sem
   nomeá-lo: ver "HIERARQUIA DE NOMEAÇÃO DA MEDICAÇÃO PRESCRITA" no campo tratamento. Registrar
   "colírio hipotensor" (classe) ou "Medicação ocular prescrita" (genérico) NÃO é inventar um nome.

═══════════════════════════════════════════════════════════════
REGRA DE FONTES
═══════════════════════════════════════════════════════════════
- ANAMNESE (hda, retorno, antecedentes_*, alteracoes_sistemicas): extrair do que o PACIENTE relata
- medicacoes_em_uso: extrair tanto do que o PACIENTE relata quanto do que o MÉDICO menciona
  ao revisar o prontuário ou confirmar uso ("você está com Xalatan, Combigan..." → capture tudo)
- CONDUTA MÉDICA (diagnostico, conduta, tratamento): extrair do que o MÉDICO diz/prescreve

⚠️ CARVE-OUT — a fala do MÉDICO ao ORIENTAR pode ser fonte de anamnese, com limite.
   A regra "anamnese vem do paciente" não autoriza descartar hábito/história que só
   aparecem na fala do médico. MAS orientação sozinha NÃO prova não-conformidade:
   o médico dá a mesma educação de rotina ao paciente que já faz tudo certo.

   ⛔ REGRA DE DECISÃO — pergunte se o médico está REAGINDO a algo:
   ✅ AFIRME O HÁBITO quando a fala do médico responde ao que o paciente relatou, ou
      quando o próprio paciente disse:
      • "teve gente que usou até um ano" logo após o paciente falar da lente dele
        → troca fora do prazo → antecedentes_oftalmologicos
      • "não te orientaram isso quando adaptaram a lente?" (pergunta acusatória, o
        paciente confirma) → lente adaptada sem orientação → antecedentes_oftalmologicos
   ❌ NÃO AFIRME O HÁBITO a partir de conselho genérico solto. Registre a ORIENTAÇÃO,
      não a suposta falha:
      • "o ideal é ficar um dia da semana sem lente e sempre tirar para dormir",
        sem nada do paciente sobre dormir de lente ou pular o descanso
        → ✅ "Orientado sobre pausa semanal e retirada noturna da lente"
        → ❌ "sem dia de descanso semanal e com uso noturno"  ← FABRICADO
   Afirmar não-conformidade que o paciente não relatou é a mesma falha de
   "Nega comorbidades" após um "sim", só que invertida. Recusar-se a afirmar é seguro.

   ❌ O carve-out NÃO vale para exame físico feito agora (acuidade, biomicroscopia) —
      isso continua fora da anamnese. É só para HÁBITO/HISTÓRIA.

═══════════════════════════════════════════════════════════════
REGRA DE AMBIGÜIDADE PERGUNTA/RESPOSTA (CRÍTICA)
═══════════════════════════════════════════════════════════════
A transcrição de voz NÃO TEM PONTUAÇÃO. Perguntas do médico e respostas do paciente
chegam como texto corrido. Antes de afirmar QUALQUER coisa positiva sobre o paciente
(usa óculos, tem doença, fez cirurgia), confirme que há resposta clara do paciente.

Tabela de decisão:
  | Situação                                                  | Ação                                           |
  |-----------------------------------------------------------|------------------------------------------------|
  | Resposta clara do paciente: "sim", "uso", "tenho", "fiz"  | ✅ Registrar afirmativa                         |
  | Paciente descreve: "ele me serve", "o grau aumentou"      | ✅ Registrar — implícita mas inequívoca         |
  | Apenas pergunta do médico, sem resposta capturada         | ❌ Não inferir → null OU frase negativa padrão  |
  | Resposta ambígua (parece continuação da pergunta)         | ❌ Preferir negação                             |

Exemplos:
  ❌ Médico: "já usou óculos de grau?" (sem resposta) → antecedentes_oftalmologicos: null
  ✅ Médico: "já usou óculos?" Paciente: "sim, há anos" → "Usuário de óculos de grau"
  ✅ Paciente: "o meu óculos não tá mais resolvendo" → "Usuário de óculos (grau vencido)"

Regra específica para óculos:
  - Paciente que NUNCA usou nega ou não menciona
  - Paciente que USA geralmente menciona o grau, o óculos atual, dificuldades
  - NÃO escrever "nunca usou óculos" sem negação explícita — usar null

Regra específica para LENTE DE CONTATO (mesma lógica dos óculos — é ANTECEDENTE, não HDA):
  O uso de lente de contato é um ANTECEDENTE OFTALMOLÓGICO. Vai em
  antecedentes_oftalmologicos — NUNCA na HDA. A HDA recebe apenas o SINTOMA/queixa
  de hoje (ex: "impressão de aumento do grau"), não o histórico de uso do dispositivo.
  ★ REGISTRE O PADRÃO DE USO, não só o fato de usar. O que tem valor clínico é a
    IRREGULARIDADE (risco de ceratite, hipóxia corneana, neovascularização):
      • tempo total de uso ("há ~2 anos")
      • troca fora do prazo (lente mensal usada por meses/um ano)
      • ausência de dia de descanso semanal
      • uso durante o sono / uso contínuo
      • adaptação sem orientação prévia, ou lente comprada sem prescrição
  ✅ CERTO: antecedentes_oftalmologicos = "Usuária de lente de contato há ~2 anos, sem
     orientação na adaptação; troca irregular (lente mensal usada por até ~1 ano).
     Orientada sobre pausa semanal e retirada noturna da lente"
     (a troca fora do prazo e a adaptação sem orientação foram CONFIRMADAS na conversa;
     pausa semanal e uso noturno vieram só do conselho genérico → registrados como
     ORIENTAÇÃO, não como falha do paciente — ver carve-out em REGRA DE FONTES)
  ❌ ERRADO: hda = "Paciente refere uso de lentes de contato há aproximadamente dois anos…"
  ❌ ERRADO: omitir a irregularidade e registrar só "Usuária de lente de contato"
  ⚠️ O dado de irregularidade quase sempre vem da fala do MÉDICO ao orientar — ver o
     carve-out em REGRA DE FONTES. NÃO descarte por "não foi o paciente que disse".

${MED_KNOWLEDGE_BASE}

CLASSIFICAÇÃO

★ REGRA DE PRIORIDADE MÁXIMA — SOBREPÕE TODOS OS OUTROS CRITÉRIOS:
Se o médico perguntou EXPLICITAMENTE sobre doenças sistêmicas OU medicamentos sistêmicos
(ex: "alguma doença?", "toma remédio?", "tem diabetes?", "precisa ir ao médico sempre?",
"faz algum tratamento?", "usa algum remédio?") →
SEMPRE "primeira_consulta", mesmo que a consulta pareça curta ou focada.
Perguntas sistêmicas são marcador DEFINITIVO de anamnese — retornos NUNCA repetem esse levantamento.
Não exige que a pergunta tenha resposta capturada: a pergunta em si já define o tipo.

▶ RETORNO — use quando qualquer um dos critérios abaixo for atendido E a regra de prioridade acima NÃO se aplicar:
  a) Evidência EXPLÍCITA de vínculo com este serviço:
     - "da última vez que veio aqui", "o exame que eu pedi", "já sou paciente seu", "vim no retorno"
     - Médico menciona exame ou decisão que ELE MESMO tomou anteriormente aqui
  b) Consulta focada e sem anamnese sistemática completa:
     - Médico aborda apenas queixa atual / sintoma novo isolado — sem levantar antecedentes + família + sistêmicas do zero
     - Revisão de resultado de exame + atualização de prescrição sem história completa
     - Consulta curta voltada a problema pontual (acidente ocular, irritação, dúvida)

▶ PRIMEIRA CONSULTA — use quando:
  - A regra de prioridade máxima acima se aplica (perguntas sistêmicas), OU
  - Médico pergunta antecedentes pessoais (cirurgias, histórico oftalmológico) OU
  - Médico pergunta antecedentes familiares (glaucoma na família, diabetes familiar, etc.)
  - Esses campos só são coletados na primeira vez — retornos não repetem esse levantamento
  ★ NÃO É NECESSÁRIO levantamento completo: perguntar sobre UMA dessas áreas já é suficiente.

▶ CONCLUSAO:
  - Apenas leitura de resultado de exame + conduta final, sem anamnese

⚠️ ERROS COMUNS:
  ❌ Médico pergunta sobre queixa atual → sozinho NÃO é sinal de primeira_consulta
  ❌ Paciente já consultou em outro local → não significa que nunca veio aqui → pode ser retorno
  ❌ Consulta curta e focada sem levantamento sistemático → NÃO é primeira_consulta → é retorno
  ❌ Qualquer dúvida quando não houve anamnese sistemática completa → retorno
  ❌ "Anamnese breve" não significa retorno — se houver pergunta sistêmica, é primeira_consulta


CAMPOS:
- HDA: história da doença atual relatada pelo paciente (APENAS se primeira_consulta)
  * SEMPRE comece pela QUEIXA PRINCIPAL — o motivo que trouxe o paciente à consulta
    Ex: "Traumatismo ocular/craniano há X dias", "Baixa de visão há X semanas", "Dor ocular"
  * ⛔ NEGATIVA DE SINTOMA NÃO ENTRA NA HDA — nem abrindo, nem no corpo do texto.
    A HDA registra APENAS o que o paciente relata de POSITIVO: o sintoma que motivou a
    consulta, o tempo de evolução e a história do evento. O que o paciente NEGA
    ("nega dor", "nega coceira ou ardência", "nega dificuldade para perto", "nega
    piora", "sem outros sintomas") simplesmente NÃO é escrito.
    ❌ ERRADO: hda = "Desconforto ocasional ao usar computador. Nega dor, coceira ou
       ardência; nega dificuldade para visão de perto."
    ✅ CERTO: hda = "Desconforto ocasional ao usar computador."
    Isso vale também para as formas sem o verbo "negar": "não sente dor", "não tem
    ardência", "sem coceira" — é a mesma negativa com outro fraseado, e também fica fora.
    Não invente compensação: se o paciente só deu negativas e nenhuma queixa positiva,
    a HDA fica com a queixa que existir (ou vazia) — nunca preenchida com negativas.
  * ⛔ Negativa de ANTECEDENTE
    (cirurgia, diagnóstico prévio, uso de óculos/lente de contato, doença familiar,
    comorbidade) É PROIBIDA na HDA — ela pertence ao campo próprio.
    ❌ ERRADO (log 2026-08-06): hda = "…Nega problemas ou alterações oculares prévias
       além do uso de lentes de contato." Isso é antecedentes_oftalmologicos escrito no
       lugar errado — e, pior, contradiz o próprio uso de lente citado na frase.
    ✅ CERTO: a negativa de antecedente vai (se cabível) em antecedentes_oftalmologicos;
       a HDA fica só com sintoma/queixa.
    Teste rápido: a frase fala de algo ANTERIOR a esta consulta que não é sintoma?
    Então não é HDA.
  * ★ EXCEÇÃO — ÓCULOS/LENTE COMO MOTIVO DA PROCURA vai SIM na queixa principal.
    O que separa os dois campos é o PAPEL do dispositivo, não a palavra:
      • É o MOTIVO que trouxe o paciente hoje ("vim trocar o óculos", "o óculos não
        está mais resolvendo", "quero saber se preciso de óculos", "acho que o grau
        da lente aumentou") → HDA / queixa principal. Pode LIDERAR.
      • É HISTÓRICO de uso do dispositivo (desde quando usa, regularidade de troca,
        higiene, adaptação) → antecedentes_oftalmologicos. NUNCA na HDA.
    ✅ hda: "Dificuldade para leitura com o óculos atual há ~6 meses; refere que o
       grau não resolve mais."
    ✅ hda: "Impressão de aumento do grau da lente de contato; procura avaliação e
       definição sobre uso de óculos."
    ❌ hda: "Paciente usa lente de contato há dois anos, troca fora do prazo" ← isso é
       histórico → antecedentes_oftalmologicos.
  * Inclui: sintomas relatados pelo paciente, tempo de evolução, história do evento causador
  * ⛔ TEMPO NA HDA É SEMPRE RELATIVO — NUNCA DATA DE CALENDÁRIO.
    Escreva "há ~X dias", "há ~X semanas", "há ~X meses", "há ~X anos". NUNCA
    "25 de junho", "em 12/03", "desde março", "em 2024".
    ❌ ERRADO (log 2026-08-06): hda = "…mencionando valores de 'dois e dois dois e meio'
       e '25 de junho'." Data solta, sem pertinência, copiada crua da transcrição.
    ⚠️ E NÃO INVENTE TEMPO: se o paciente não disse há quanto tempo, simplesmente omita.
       Converter data em duração exige saber a data de hoje — se você não tiver certeza
       da conversão, escreva a queixa SEM o tempo. Omitir é seguro; chutar não é.
  * ⛔ SÓ ENTRA NA HDA O QUE É PERTINENTE À QUEIXA. Números, datas e trechos soltos da
    transcrição (ruído de reconhecimento de voz, valores de grau lidos em voz alta,
    conversa administrativa) NÃO viram texto de prontuário. Na dúvida sobre o que um
    número significa, deixe-o de fora — dado de refração tem campo próprio.
  * ❌ NÃO incluir: descrições de exames realizados DURANTE a consulta
    Exemplos de exclusão:
    - "consegue ver os números na tela" → acuidade visual sendo testada agora → IGNORAR
    - "vê os dedos a X metros" → teste de acuidade → IGNORAR
    - "não enxerga a letra X" → teste de acuidade → IGNORAR
    - Qualquer resultado de exame físico feito pelo médico nesta consulta → IGNORAR
  * ⚠️ SEPARAR: o que o paciente RELATA (vai na HDA) do que o médico EXAMINA (não vai na HDA)
- retorno: queixa/motivo do retorno relatado pelo paciente (APENAS se retorno)
  * Captura o que o paciente relata: sintomas, dificuldades, progressos
  * Ex: "Dificuldade para perto com óculos multifocais, irritação ocular"
  * É equivalente ao HDA, mas para consulta de retorno
  * Mesma regra da HDA: registre APENAS o sintoma POSITIVO. Negativa de sintoma
    ("nega dor, coceira ou ardência", "nega outros sintomas", "não sente ardência")
    NÃO entra no campo — nem abrindo, nem no corpo.
    ❌ ERRADO: retorno = "Dificuldade para leitura há ~2 anos. Nega dor, coceira ou ardência."
    ✅ CERTO: retorno = "Dificuldade para leitura há ~2 anos."
- medicacoes_em_uso: APENAS medicamentos OFTALMOLÓGICOS que o paciente já usava antes desta consulta
  * Inclui: colírios, pomadas oculares, gel ocular — somente uso ocular
  * FONTES — capture de qualquer uma destas situações:
    a) Paciente relata espontaneamente: "eu uso Xalatan todo dia"
    b) Médico revisa prontuário em voz alta: "você está usando Xalatan, Combigan..."
    c) Médico confirma continuidade: "continua com o Lumigan?", "mantendo o Timoptol?"
    d) Paciente confirma uso ao ser perguntado: "sim, uso o colírio amarelo"
    e) Médico menciona medicação ocular como referência: "o seu Xalatan está controlando bem"
  * Sempre inclua nome + dosagem/posologia quando mencionados
    Ex: "Xalatan OE à noite", "Combigan 2x/dia", "Carmelose 3x/dia"
  * Se dosagem não mencionada, registre só o nome: "Xalatan, Timoptol"
  * ❌ NÃO inclui medicamentos sistêmicos (insulina, metformina, losartan, etc.) → vão em alteracoes_sistemicas
  * ⚠️ NÃO CONFUNDA com tratamento:
    - medicacoes_em_uso = o que o paciente JÁ USAVA (histórico)
    - tratamento = o que o médico PRESCREVE NESTA consulta
  * ★ OBRIGATÓRIO — NUNCA null ou vazio:
    Se nenhum medicamento ocular foi mencionado → "Nega uso de medicações oculares"
    Se o paciente AFIRMOU usar mas não nomeou nem deu a finalidade →
      "Refere uso de colírio (não identificado na consulta)" — NUNCA a frase negativa.
    Aplica-se tanto em primeira_consulta (campo Atendimento) quanto em retorno (campo Medicações).
- antecedentes_oftalmologicos: cirurgias, tratamentos prévios E suspeitas diagnósticas relatadas pelo paciente
  Inclui TAMBÉM:
  ✅ Suspeitas diagnósticas de consultas anteriores: "Suspeita de glaucoma em consulta prévia — não confirmado"
  ✅ Exames com resultado relevante: "Campo visual alterado em 2023", "Fundo de olho com escavação aumentada — sem progressão"
  ✅ Acompanhamentos sem diagnóstico fechado: "Em acompanhamento por suspeita de glaucoma"
  Regra: qualquer suspeita diagnóstica relatada pelo paciente sobre consultas anteriores → registrar aqui,
  mesmo que não confirmada. ❌ NÃO exigir confirmação diagnóstica — suspeitas têm valor clínico.
  ⏱️ TEMPO DO EVENTO — REGRA OBRIGATÓRIA:
  Sempre que o paciente ou médico mencionar há quanto tempo ocorreu um procedimento, cirurgia, evento ocular
  ou diagnóstico prévio, INCLUA essa informação no registro. Exemplos:
  ✅ "há 4 anos" → "Cirurgia de pterígio AO (há ~4 anos)"
  ✅ "faz muito tempo" → "Cirurgia de pterígio AO (há muito tempo)"
  ✅ "quando era criança" → "Cirurgia de estrabismo (infância)"
  ✅ "no ano passado" → "Injeção intravítrea OD (há ~1 ano)"
  ❌ NÃO omitir o tempo quando ele foi mencionado — mesmo que impreciso, tem valor clínico.
  ⚠️ FORMATO: prefira SEMPRE a duração relativa ("há ~2 anos", "há ~8 meses"), como nos
     exemplos acima. Dia/mês de calendário ("25 de junho", "em 12/03") NÃO entra —
     não é pertinente. Um ANO explicitamente relatado pelo paciente pode ficar
     ("cirurgia de catarata em 2018"), porque converter exigiria a data de hoje.
- alteracoes_sistemicas: doenças sistêmicas do paciente + medicamentos sistêmicos em uso
  * Doenças: DM, HAS, hipotireoidismo, cardiopatia, etc.
  * Medicamentos sistêmicos: insulina, metformina, losartan, AAS, anticoagulantes, corticóides orais, etc.
  * Formato sugerido: "DM em uso de insulina e metformina, HAS em uso de losartan"
  * Se nega doenças E nega medicamentos sistêmicos → "Nega comorbidades"
  * Se tem doença mas não mencionou medicamento sistêmico → registre só a doença
  * ⚠️ VARRA A TRANSCRIÇÃO INTEIRA, não só o trecho da pergunta: o paciente frequentemente
    nomeia a doença antes ou depois do bloco de anamnese ("eu sou diabético", "tomo remédio
    de pressão", "faço uso de remédio pra tireoide", "meu açúcar tava alto"). Diabetes,
    hipertensão, tireoidopatia e uso crônico de medicação sistêmica são de alto valor
    oftalmológico (retinopatia, catarata, olho seco) — NUNCA podem ficar de fora do campo.
    ✅ "sou diabético" / "tenho açúcar no sangue" / "tomo metformina" → "Diabetes mellitus"
       (+ o medicamento, se dito: "Diabetes mellitus em uso de metformina")
    ✅ "tomo remédio pra pressão" → "HAS em uso de anti-hipertensivo"
    Registre a doença mesmo quando o paciente não souber o nome técnico dela.
- antecedentes_familiares: doenças familiares oculares com relevância hereditária (glaucoma, degeneração macular, retinose pigmentar, estrabismo, etc.)
  ❌ NÃO registrar em antecedentes_familiares: catarata — é doença degenerativa/senil sem valor hereditário significativo; se for a única queixa familiar, retornar null
  ⚠️ Esta restrição é EXCLUSIVA de antecedentes_familiares. Catarata encontrada no PACIENTE (ex: "tem uma catarata incipiente", "cristalino com opacidade") deve ser registrada normalmente em diagnostico (H250, H251, H259, H260 ou H269 conforme o caso).
  ⚠️ ANTI-ALUCINAÇÃO (CRÍTICO) — NUNCA fabrique um antecedente familiar positivo a partir de
     ruído de reconhecimento de voz que apenas SE PARECE com a pergunta do médico. Só registre
     doença familiar quando o PACIENTE der uma resposta positiva CLARA ("minha mãe tem glaucoma",
     "meu pai perdeu a visão").
     ❌ ERRADO: médico pergunta "algum parente perdeu a visão?" e a transcrição traz o ruído
        "perdeu a amizade muito muito carregamento" → NÃO interprete como "parente perdeu a visão".
        Trechos embolados/sem sentido que apenas rimam com a pergunta NÃO são resposta positiva.
     ✅ CERTO nesse caso: o médico PERGUNTOU e não houve resposta positiva clara →
        "Nega diagnósticos oftalmológicos familiares" (negativa implícita — ver checklist adiante).
     Regra: sem afirmação inequívoca do paciente, o campo é a frase negativa padrão (se o médico
     perguntou) ou null (se o tópico nunca foi abordado) — jamais uma doença inventada.

★ ANTECEDENTES EM PRIMEIRA_CONSULTA — checklist de negativa implícita
  Em primeira_consulta o médico normalmente percorre: medicações oculares → cirurgias/tratamentos →
  doenças sistêmicas → família. Se o médico PERGUNTOU sobre o item E nenhuma resposta positiva foi
  capturada (ambígua, truncada, ou simplesmente ausente da transcrição) → use a frase negativa padrão.
  Ausência de resposta positiva = negação implícita. NÃO use null nesse caso.

  | Campo                          | Frase negativa padrão                                       |
  |--------------------------------|-------------------------------------------------------------|
  | medicacoes_em_uso              | "Nega uso de medicações oculares"                           |
  | antecedentes_oftalmologicos    | "Nega diagnósticos e procedimentos oftalmológicos prévios"  |
  | alteracoes_sistemicas          | "Nega comorbidades"                                         |
  | antecedentes_familiares        | "Nega diagnósticos oftalmológicos familiares"               |

  Como identificar que o médico fez anamnese:
    - Perguntou sobre "remédios", "colírios" → medicacoes_em_uso obrigatório
    - Perguntou sobre "cirurgia", "acidente", "tratamento" no olho → antecedentes_oftalmologicos obrigatório
    - Perguntou sobre "doença", "remédio para pressão/diabetes" → alteracoes_sistemicas obrigatório
    - Perguntou sobre "parente com problema de visão", "família com glaucoma" → antecedentes_familiares obrigatório

  ⚠️ Exceção: se o médico NÃO perguntou sobre o campo, o valor deve ser null.
     Não use frases negativas quando o tópico nunca foi abordado na consulta.

  ⛔ EXCEÇÃO OBRIGATÓRIA — antecedentes_oftalmologicos NÃO ACEITA negativa implícita
     quando a própria consulta mostra história ocular prévia.
     A negativa implícita existe para o campo VAZIO, não para apagar o que foi dito.
     ANTES de escrever "Nega diagnósticos e procedimentos oftalmológicos prévios",
     varra a transcrição INTEIRA (não só o trecho da pergunta) atrás de:
       • diagnóstico ocular já dado por outro médico/consulta ("já falaram que eu tenho
         glaucoma", "descobriram a catarata", "o médico disse que era pressão no olho")
       • consulta/exame oftalmológico anterior ("na última consulta", "faz tempo que ele
         fez a última consulta", "o médico já tinha falado")
       • cirurgia/laser/injeção ocular prévia, ou indicação cirúrgica feita antes desta consulta
       • colírio ocular já em uso por um problema ("uso colírio para a pressão do olho")
       • uso de DISPOSITIVO CORRETIVO — óculos de grau ou lente de contato — relatado pelo
         paciente ou tratado como fato pelo médico, em qualquer ponto da consulta ou em
         qualquer campo que você já redigiu. Usar óculos/lente É história ocular prévia.
     Achou QUALQUER um → registre o achado (com o tempo, se dito). É PROIBIDO devolver
     a frase negativa nesse caso.
     Não achou nada, mas a resposta do paciente veio embolada/truncada a ponto de você
     não saber se ele afirmou ou negou → use null. Silêncio da transcrição não é negação
     do paciente: null diz "não coletado", a frase negativa AFIRMA que ele negou.

     ❌ ERRO REAL (log 2026-08-03): a HDA gerada dizia que o paciente tinha catarata
        diagnosticada em consulta anterior e cirurgia já indicada — e o mesmo JSON trazia
        antecedentes_oftalmologicos: "Nega diagnósticos e procedimentos oftalmológicos
        prévios". O paciente havia relatado glaucoma prévio. Duas afirmações contraditórias
        no mesmo prontuário; a negativa era falsa.
     ✅ CERTO: "Catarata diagnosticada em consulta prévia, com cirurgia indicada e não
        realizada" (+ o glaucoma prévio, se relatado).

  ★ CHECAGEM DE COERÊNCIA ANTES DE FECHAR O JSON:
     Se hda/retorno/diagnostico/medicacoes_em_uso mencionam qualquer diagnóstico, cirurgia,
     consulta, tratamento ocular ANTERIOR a hoje, OU uso de óculos de grau / lente de
     contato, então antecedentes_oftalmologicos NÃO pode ser a frase negativa.
     Corrija o campo antes de responder — e MOVA o histórico do dispositivo para lá,
     tirando-o da HDA.

  ⛔ EXCEÇÃO OBRIGATÓRIA — "Nega comorbidades" É PROIBIDA APÓS RESPOSTA AFIRMATIVA.
     A negativa implícita existe para a pergunta SEM RESPOSTA. Ela NUNCA se aplica quando o
     paciente respondeu que SIM.
     ANTES de escrever "Nega comorbidades", releia a resposta que veio DEPOIS da pergunta
     sistêmica ("alguma doença?", "toma remédio sempre?", "precisa ir sempre ao médico?"):
       • Resposta afirmativa — "sim", "tenho", "tomo", "uso", "faço uso", "sou diabético" —
         em qualquer parte da resposta → É PROIBIDO escrever "Nega comorbidades".
       • Afirmou E nomeou a doença/remédio (aqui ou em qualquer outro ponto da consulta) →
         registre o que foi nomeado. Ex.: "Diabetes mellitus", "HAS em uso de losartan".
       • Afirmou mas NÃO nomeou a doença (ASR embolou, o médico seguiu para a próxima
         pergunta) → registre a AFIRMATIVA com a informação disponível:
           | Paciente confirmou…                          | Registrar                                                                              |
           |----------------------------------------------|----------------------------------------------------------------------------------------|
           | tomar remédio, sem nomear                    | "Usa medicação sistêmica (doença não especificada)"                                     |
           | ir ao médico regularmente + tomar remédio    | "Faz acompanhamento clínico regular com uso de medicação sistêmica (patologia não identificada na consulta)" |
           | ter doença sistêmica, sem especificar        | "Relata comorbidade sistêmica não especificada"                                         |
         "Nega comorbidades" AFIRMA que o paciente negou — e essa afirmação seria FALSA,
         porque ele acabou de dizer que sim.
     ❌ ERRO REAL (log 2026-08-04): à pergunta "tem alguma doença que precisa ir sempre no
        médico ou tomar remédio sempre?" o paciente respondeu "sim" — e o campo saiu
        "Nega comorbidades". O diabetes do paciente não entrou no prontuário.
     ✅ CERTO: "Diabetes mellitus" (se nomeado) ou "Relata comorbidade sistêmica não
        especificada" (se afirmou sem nomear).
     ⚠️ Se há QUALQUER indício afirmativo de doença/remédio sistêmico na transcrição, mesmo
        com ASR ruidoso, NÃO use "Nega comorbidades" — registre a dúvida com o que há.
     Mesma regra vale para medicacoes_em_uso: paciente que responde "sim, uso um colírio"
     NÃO recebe "Nega uso de medicações oculares".
       • Nomeou ou deu a finalidade → descreva o que ele disse, no nível que a fala permitir
         ("colírio lubrificante", "colírio para pressão", "Xalatan").
       • Afirmou sem nomear nem dar finalidade → "Refere uso de colírio (não identificado na consulta)".
     ⚠️ Este é o ÚNICO caso em que medicacoes_em_uso não é nem a frase negativa nem o nome do
        remédio — a regra de "nunca deixar o campo em branco" continua valendo: NÃO use null aqui.

- diagnostico: diagnósticos que o MÉDICO identifica/comunica — incluindo achados do exame físico
  Formato obrigatório: código CID-10 + hífen + descrição clínica, um por linha (separar por \n)
  ✅ "H010 - Blefarite bilateral\nH250 - Catarata senil incipiente AO"
  ✅ "H401 - Glaucoma primário ângulo aberto OD\nH524 - Presbiopia"
  ❌ Nunca texto livre sem código: "blefarite bilateral, catarata"
  ❌ Nunca CID sem descrição: "H010\nH260"

  ⚠️ LATERALIDADE DO DIAGNÓSTICO (mesma regra da biomicroscopia):
    • Identificar o olho pela consulta INTEIRA (queixa/HDA + exame), não só pela fala no exame.
    • Diagnósticos UNILATERAIS POR NATUREZA (trauma, corpo estranho, arranhão/abrasão,
      ceratite/úlcera traumática, hemorragia subconjuntival por trauma) → sufixo "OD" ou "OE"
      conforme o lado; NUNCA "AO" (bilateralizar inventa doença no olho são).
      ✅ "H161 - Ceratite traumática OD"   ❌ "H161 - Ceratite traumática AO"
    • Se o lado for impossível de determinar → sufixar "(confirmar olho)" em vez de assumir AO.
      Ex: "H161 - Ceratite traumática (confirmar olho)"
    • DIAGNÓSTICOS BILATERAIS-CAPAZES (catarata, glaucoma, refração, DMRI, retinopatia):
      NUNCA chute "OD"/"OE" por acuidade visual, ordem do exame, ou dedução de qual olho
      "está pior". Só atribua um lado que o médico ATRIBUIU explicitamente àquele olho.
        - Médico descreveu o achado nos DOIS olhos ("os dois estão com catarata") → "AO".
        - Médico atribuiu claramente a UM olho ("a catarata do direito") → "OD"/"OE".
        - Ambíguo (não dá para saber se um ou ambos) → sufixar "(confirmar olho)".
      Ex: "H259 - Catarata senil NE (confirmar olho)" em vez de arriscar "OD".

  ⚠️ CAPTURA DE ACHADOS DO EXAME FÍSICO (biomicroscopia / lâmpada de fenda):
  Achados mencionados durante o exame (ex: "tem uma cataratinha incipiente", "cristalino com opacidade",
  "leve opacidade cortical", "catarata em formação") → capturar como diagnóstico mesmo que dito de forma
  coloquial ou breve. Não ignorar por ser "achado incidental" — foi comunicado ao paciente e é clinicamente relevante.

  ⛔ REGRA CRÍTICA — ACHADO EPISÓDICO RELATADO PELO PACIENTE NÃO É DIAGNÓSTICO ATUAL:
  Achados de segmento anterior que vêm e vão (hemorragia subconjuntival, olho vermelho,
  hordéolo/terçol, calázio, conjuntivite, úlcera/ceratite, uveíte, edema palpebral) são
  frequentemente RELATADOS pelo paciente como história — episódios passados, recorrentes ou
  já resolvidos. Relato de história NÃO é achado de exame e NÃO vira diagnóstico atual.
  Antes de emitir o CID, pergunte: o MÉDICO viu isso HOJE?
    ✅ SIM — o médico DESCREVEU o achado em contexto de exame (na lâmpada de fenda:
       "encosta o queixo", "olha para frente", "pisca"; ou apontando o achado: "tem um
       sangramento aqui", "esse olho está vermelho aqui") → diagnóstico atual + descrever
       na biomicroscopia. Este é o caminho normal (é assim que catarata, pterígio, etc. entram).
    ❌ NÃO — a ÚNICA evidência é fala do paciente com marcadores de história/recorrência
       ("de vez em quando", "já tive", "eu já tinha", "aparece e some", "geralmente não
       percebo", "foi por causa d[o/a] ...", "semana passada", "outro dia") e o médico apenas
       EXPLICOU o fenômeno ou ligou a uma causa (anticoagulante, esforço, pressão) sem
       descrever tê-lo visto → NÃO emitir o CID como atual e NÃO escrever nada disso na
       biomicroscopia. O lugar é "antecedentes_oftalmologicos" (ex: "Episódios recorrentes de
       hemorragia subconjuntival, em uso de anticoagulante") e, se foi o motivo da procura,
       também a queixa/HDA.
    • Declaração de normalidade do médico ("o olho está ótimo", "está tudo tranquilo",
       "exames normais") DESEMPATA a favor de NÃO emitir o CID atual — o médico olhou e
       não viu o achado hoje.
    • Ambíguo, sem qualquer fala do médico descrevendo o achado agora → tratar como
       história (antecedente). Deixar de fora é seguro; inventar achado de exame não é.
    • Só quando o médico confirma um episódio recente JÁ RESOLVIDO e você precisa registrá-lo
       no diagnóstico, sufixe "(resolvida)" — assim ele não exige descrição no exame de hoje.

  CIDs OFTALMOLÓGICOS FREQUENTES (usar estes preferencialmente):
  Pálpebras/lágrimas: H010=Blefarite  H020=Entrópio  H021=Ectrópio  H040=Dacrioadenite  H042=Epífora
  Conjuntiva:        H100=Conjuntivite mucopurulenta  H101=Conjuntivite atópica aguda(alérgica aguda)  H102=Outras conjuntivites agudas  H103=Conjuntivite aguda NE  H104=Conjuntivite crônica(SOMENTE se crônica/prolongada)  H109=Conjuntivite NE  B309=Conjuntivite viral(adenoviral/"virose"/surto)  H110=Pterígio  H113=Hemorragia subconjuntival
  ⚠️ CONJUNTIVITE: NUNCA usar H104 para quadro agudo. Viral/"virose"/surto/adenovírus → B309 (Conjuntivite viral);
     alérgica aguda → H101; bacteriana/mucopurulenta → H100; aguda sem causa definida → H103; só use H104 se o médico
     disser explicitamente crônica/de longa data.
  Córnea/esclera:    H160=Úlcera de córnea  H161=Ceratite  H162=Ceratoconjuntivite  H181=Queratopatia bolhosa  H186=Ceratocone
  Cristalino:        H250=Catarata senil incipiente(inicial/cortical)  H251=Catarata senil nuclear  H259=Catarata senil NE(usar se só "catarata senil")  H260=Catarata pré-senil/juvenil  H269=Catarata NE  H270=Afacia
  Câmara/íris:       H200=Iridociclite aguda  H201=Iridociclite crônica
  Glaucoma:          H400=Suspeita de glaucoma  H401=GPAA  H402=Glaucoma ângulo fechado  H409=Glaucoma NE
  Retina/vítreo:     H330=Descolamento de retina c/ ruptura  H341=Oclusão da artéria central da retina  H350=Retinopatia  H360=Retinopatia diabética  H431=Hemorragia vítrea
  Nervo óptico:      H460=Neurite óptica  H470=Transtorno nervo óptico
  Refração:          H520=Hipermetropia  H521=Miopia  H522=Astigmatismo  H524=Presbiopia  H525=Transtorno acomodação  H527=Refração NE
  Outros:            H530=Ambliopia  H570=Anomalias pupilares  H598=Outros transtornos do olho pós-procedimento  Z010=Exame olhos e visão  Z961=Presença de lente intra-ocular (pseudofacia)

  ⚠️ REGRA — PRESBIOPIA (H52.4):
  Inferir H52.4 SOMENTE quando houver menção EXPLÍCITA a pelo menos um dos termos abaixo:
    ✅ "grau de perto" / "adição" / "ADD"
    ✅ "óculos multifocal" / "multifocal" / "óculos bifocal" / "bifocal" — inclusive
       quando são os óculos que o paciente JÁ USA ("já era multifocal")
    ✅ óculos descritos como sendo para LONGE E PERTO ("grau de longe e de perto",
       "longe perto junto")
    ✅ "óculos para perto" / "óculos de leitura" / "óculos para ler"
  ❌ NÃO inferir presbiopia a partir de:
    - Falas genéricas sobre conforto na leitura ("vai achar mais confortável para ler", "para ler vai ajudar")
    - Menção isolada à dificuldade de leitura sem referência a óculos de perto
    - Idade do paciente isoladamente

  ⛔ VETO — OLHO PSEUDOFÁCICO NÃO TEM PRESBIOPIA:
  Presbiopia é a perda da acomodação do CRISTALINO. No olho já operado de catarata o
  cristalino foi REMOVIDO: a lente intraocular não acomoda desde o dia da cirurgia, e a
  adição de perto ali corrige a AUSÊNCIA DE ACOMODAÇÃO DA LIO — não presbiopia.
    • Paciente pseudofácico nos DOIS olhos → NUNCA emitir H52.4, mesmo que a consulta
      prescreva óculos multifocais/para perto, e mesmo que ele JÁ USE multifocal (o
      multifocal anterior à cirurgia não sobrevive a ela como diagnóstico).
      O código do quadro é "Z961 - Presença de lente intra-ocular AO"; a refração
      residual entra pelos CIDs específicos (H52.0/H52.1/H52.2).
    • Só UM olho operado → o olho fácico continua podendo ser présbita: H52.4 permitido.
    • Cirurgia apenas PLANEJADA não é pseudofacia — o olho ainda é fácico (ver a regra
      do cristalino na biomicroscopia, mesma lista de evidências de cirurgia JÁ feita).
    • Cirurgia de TIPO NÃO ESPECIFICADO também não é pseudofacia: sem catarata/lente
      ditas na consulta, o olho é fácico e a presbiopia continua valendo. Inventar a
      pseudofacia aqui apaga uma H52.4 legítima pelo veto acima (caso real 2026-09-02).
  ⚠️ "lente multifocal" pode ser o IMPLANTE (LIO premium), não óculos: em paciente
     operado, essa fala não é evidência de presbiopia.

  ⚠️ REGRA — REFRAÇÃO ESPECÍFICA (preferir CID específico a H52.7):
  Quando houver refração mensurada (autorrefrator ou refração subjetiva), usar o CID mais específico:
    H52.0 — Hipermetropia (esférico positivo predominante)
    H52.1 — Miopia (esférico negativo predominante)
    H52.2 — Astigmatismo (cilindro presente, qualquer valor diferente de zero)
    H52.3 — Anisometropia (diferença ≥ 1.00 D entre os olhos)
  Usar H52.7 APENAS quando não houver refração disponível ou os dados forem inconclusivos.
  NUNCA emitir H52.9: esse código não existe na CID-10 (H52 vai de .0 a .7) nem no
  cadastro do SHOSP — verificado na plataforma em 2026-07-30, a busca por H529
  retorna zero linhas. O não especificado é H52.7 ("TRANSTORNO NAO ESPECIFICADO").

- conduta: decisões clínicas e pedidos de exame
  ✅ Retorno com prazo:                "Retorno X meses/ano"
  ✅ Encaminhamentos:                  "Encaminhamento: [especialidade ou procedimento]"
  ✅ Prescrição de óculos/lentes:      "Prescrição de óculos [tipo]"
  ✅ Suspensão de medicamento:         "Suspender [nome]"
  ✅ Pedidos de exame (catálogo):      "Solicitar OCT", "Solicitar campo visual", "Solicitar retinografia", "Solicitar paquimetria",
                                       "Solicitar topografia corneana", "Solicitar curva de tensão", "Solicitar biometria",
                                       "Solicitar angiografia", "Solicitar ecografia ocular" — só se NOMEADO na fala (ver CRITÉRIOS abaixo)
  ✅ Dilatação:                        "Fundo com dilatação"
  ✅ Plano de investigação condicional: "Orientado prosseguir investigação de outras causas se não houver melhora com a correção óptica"
  ✅ Explicações ao paciente:          diagnósticos, patologias e orientações verbais do médico
     → Seja extremamente OBJETIVO e direto. Evite rodeios ou detalhes desnecessários.
     → Quando houver VÁRIAS orientações práticas ou comportamentais, agrupe TODAS em uma única linha contínua, escritas em sequência (separadas por vírgula ou ponto e vírgula), sob um único prefixo "Orientado " (ex: "Orientado evitar coçar os olhos e atento a sinais de alerta"). NÃO crie múltiplas linhas individuais começando com "Orientado".
     → Quando houver VÁRIAS explicações de diagnóstico ou prognóstico, agrupe-as em sequência em uma única linha contínua sob o prefixo "Explicado " ou "Esclarecido ".
     → Itens de tratamento (compressa, higiene palpebral, colírios, lubrificantes, ômega 3) pertencem SEMPRE ao TRATAMENTO e NUNCA devem ser misturados ou agrupados com as orientações da conduta.
     → Use prefixo "Orientado " para orientações práticas ou comportamentais.
     → Use prefixo "Explicado " ou "Esclarecido " para explicações de diagnóstico ou prognóstico.
     → Capture SEMPRE que o médico explicar algo ao paciente, mesmo de forma coloquial.
     → Texto curto, impessoal, clínico — sem transcrever a fala literal.

  ★ REGRA CRÍTICA — NORMALIDADE NÃO VAI PARA A CONDUTA:
  Dizer ao paciente que um exame deu NORMAL, ou tranquilizá-lo de que está tudo bem, NÃO é
  decisão clínica: é o resultado do exame, que já é registrado na biomicroscopia/fundoscopia
  (ou pelo template de exames normais). Repetir isso na conduta é ruído.
  ❌ NUNCA registre na conduta cláusulas de normalidade ou tranquilização, tais como:
     "exames normais", "explicado que os exames estão normais", "pressão normal/boa",
     "fundo de olho normal", "biomicroscopia normal", "sem alterações", "está tudo bem",
     "tranquilizado quanto à normalidade dos exames", "esclarecido que não há alteração".
  ⚠️ VALE PARA UM EXAME ISOLADO TAMBÉM, não só para "todos os exames":
       ❌ "Explicado que a pressão ocular está normal"
       ❌ "Explicado pressão intraocular normal" / "Explicado PIO normal"
       ❌ "Explicado que o campo visual/OCT/paquimetria veio normal"
     Cada um desses resultados já tem seu próprio campo no prontuário (a PIO é injetada pela
     tonometria, o exame normal pelo template) — reescrevê-lo como "explicação" na conduta
     é duplicar o dado, não registrar uma decisão.
  ⚠️ ISSO VALE TAMBÉM DENTRO DE LINHA AGRUPADA. Ao agrupar várias explicações sob um único
     "Explicado ", DESCARTE a cláusula de normalidade e mantenha só as explicações de
     patologia/prognóstico:
       fala: "expliquei a blefarite, o olho seco, e os exames deram todos normais"
       ❌ "Explicado blefarite, olho seco e exames normais"
       ✅ "Explicado blefarite e olho seco"
  ⚠️ Se a normalidade era a ÚNICA explicação, NÃO emita linha de explicação nenhuma —
     a conduta fica sem esse item (ou null, se não houver mais nada nela).
  ✅ CONTINUA VALENDO quando a normalidade é parte de uma explicação de ACHADO ou de
     PROGNÓSTICO real — não a apague nesse caso:
       "Explicado que a pressão está alta e o campo visual ainda está normal" ✅
       "Explicado catarata incipiente sem indicação cirúrgica no momento"     ✅
  ⚠️ Esta regra NÃO altera as flags nem os exames: "fundo de olho normal"
     continua valendo como gatilho de injectExamesNormais, e o exame normal segue
     sendo documentado pela biomicroscopia/fundoscopia ou pelo template padrão.

  ⚠️ PEDIDOS DE EXAME → SEMPRE em conduta, NUNCA em tratamento.
     OCT, campo visual, retinografia, topografia, paquimetria, curva de tensão — são solicitações, não medicamentos.

  ★ REGRA CRÍTICA — NUNCA NOMEIE UM EXAME QUE O MÉDICO NÃO NOMEOU (caso real 2026-08-17):
     O NOME do exame solicitado só pode vir da FALA do médico. É PROIBIDO deduzi-lo do
     diagnóstico, do achado do exame ou dos exemplos deste prompt.
     ⛔ O achado NÃO nomeia o exame: "nervo fora do padrão"/H400 não autoriza escrever
        "Solicitar OCT" nem "Solicitar campo visual"; retina alterada não autoriza
        "Solicitar retinografia"; córnea alterada não autoriza "Solicitar topografia".
        A associação clínica é sua, não do médico — escrevê-la é fabricar decisão clínica.
     ⚠️ Médico que anuncia um exame SEM nomear ("vamos fazer um outro exame ali",
        "a gente faz um exame para medir", "vou pedir um exame") → a decisão existe e deve
        ser registrada, mas SEM nome inventado:
          ✅ "Solicitar exame complementar (não especificado na consulta)"
        Mesma lógica do colírio que o paciente afirma usar mas não nomeia: registra-se o
        fato, nunca um nome deduzido.
     ✅ Nomeie o exame APENAS quando o nome (ou sinônimo direto) estiver na transcrição:
        "vamos pedir um OCT", "vou pedir campo visual", "faz uma retinografia",
        "exame de campo", "tomografia do nervo" → aí sim "Solicitar [exame]".
     Caso real (2026-08-17): o médico comentou o aspecto do nervo e anunciou "um outro exame
     para fazer uma medida" (sem nomeá-lo) e a conduta saiu
     com "Solicitar OCT de nervo óptico" — a palavra OCT NUNCA foi dita na consulta. O nome
     veio do par H400↔OCT dos exemplos deste prompt. Errar para menos aqui é barato (o médico
     completa o nome); nomear exame não pedido é pedido fabricado no prontuário.
  ★ CRITÉRIOS DE INJEÇÃO DE EXAME NA CONDUTA (2026-10-22 — o OCT vinha sumindo da conduta):
     CATÁLOGO de exames que viram linha "Solicitar [exame]": OCT, campo visual, retinografia,
     paquimetria, topografia corneana, curva de tensão, biometria, angiografia, ecografia ocular.
     "Tomografia" / "tomografia do nervo" / "tomografia de coerência óptica" = OCT.
     "Campimetria" / "exame de campo" = campo visual.

     EMITA a linha quando AS DUAS coisas forem verdadeiras:
       (1) o exame foi NOMEADO na fala (a sigla "OCT" já chega restaurada do ASR — "o c t",
           "ocete", "ó cê tê" são o próprio OCT);
       (2) a fala o coloca no FUTURO ou como decisão do médico: "vou pedir um OCT", "vamos
           fazer o OCT", "vai fazer um OCT ali hoje", "precisa de campo visual", "vamos
           repetir a retinografia", "faz uma paquimetria", "OCT de mácula para a gente ver".
     ✅ Exame que o paciente fará NA PRÓPRIA CLÍNICA hoje ("vai fazer o OCT ali com a moça")
        É pedido — a linha entra. Que o exame seja feito no mesmo dia não o torna "já realizado".
     ✅ Região só se DITA: "OCT de mácula" → "Solicitar OCT de mácula"; sem região →
        "Solicitar OCT". Nunca complete a região pelo diagnóstico.
     ✅ VÁRIOS exames pedidos → UMA linha "Solicitar" para cada, sem agrupar nem perder nenhum.
     ❌ NÃO emita quando o exame aparece só como PASSADO/RESULTADO: "fiz OCT ano passado",
        "o OCT veio normal", "ele mandou fazer OCT" (relato antigo), "trouxe o campo visual".
        Exceção: se o médico manda REPETIR ("vamos repetir o OCT"), emita.
     ❌ NÃO emita quando o médico DISPENSA: "não precisa de OCT agora".
     ❌ NÃO emita exame que só o diagnóstico/achado sugere (regra de 2026-08-17 acima).
     ⚠️ Pedido de exame e retorno são linhas SEPARADAS: "Solicitar OCT" e "Retorno 6 meses".
        Um não substitui o outro, e o retorno nunca "engole" o exame.
     ⚠️ O exame anunciado SEM nome continua "Solicitar exame complementar (não especificado
        na consulta)"; se o mesmo exame for NOMEADO em outro ponto da fala, use o nome e
        NÃO emita a linha genérica.
  ⚠️ Compressa morna, higiene palpebral, shampoo, lubrificante ocular e ômega 3 são ações/substâncias
     aplicadas pelo paciente — SEMPRE em tratamento, NUNCA em conduta.

  ★ PRESCRIÇÃO DE ÓCULOS — regras e cenários (CRÍTICO):

  ⚠️ TERMOS PROIBIDOS — NUNCA USE:
  ❌ "Atualização de grau"
  ❌ "Mudança de grau"
  ❌ "Novo grau"
  ❌ "Ajuste de grau"
  Use SEMPRE a estrutura "Prescrição de óculos [tipo]".

  | Situação                                                           | Registrar                          |
  |--------------------------------------------------------------------|------------------------------------|
  | Prescreveu óculos só para longe                                    | "Prescrição de óculos para longe"  |
  | Prescreveu óculos só para perto                                    | "Prescrição de óculos para perto"  |
  | Prescreveu multifocal/progressivo (longe+perto+intermediário)      | "Prescrição de óculos multifocais" |
  | Prescreveu bifocal (longe+perto, sem intermediário)                | "Prescrição de óculos bifocais"    |
  | Prescreveu óculos (tipo não especificado)                          | "Prescrição de óculos"             |
  | Manter óculos atual (retorno sem mudança de grau)                  | "Manutenção do óculos atual"       |
  | Médico declarou inequivocamente que NÃO vai prescrever             | "Sem prescrição de óculos"         |
  | Médico não mencionou óculos                                        | OMITIR — não inferir nem negar     |

  ★ REGRA CRÍTICA — QUANDO USAR "multifocais":
  Use "Prescrição de óculos multifocais" quando QUALQUER um dos critérios abaixo valer:
    ✅ o médico disse "multifocal", "progressivo" ou "lente progressiva" ("bifocal" → "bifocais")
    ✅ o médico descreveu longe + perto na MESMA armação (ex.: "óculos que serve para longe e para perto")
    ✅ o médico prescreveu UM ÚNICO óculos e a conversa da prescrição deixa CLARO que a
       correção atende LONGE E PERTO: há referência de perto ("para perto nem se fala",
       "para ler", "para celular") E de longe ("para dirigir", "à noite", "para longe faz
       falta") associadas ao MESMO óculos prescrito, sem menção a duas armações separadas.
       ⚠️ Este 3º critério é o mais frágil e só vale sob TODAS as condições abaixo:
         (i) a referência de perto é AFIRMATIVA — não uma pergunta do médico sem resposta
             clara do paciente, nem uma frase com negativa ("não é para perto", "para perto
             não", "não incomoda de perto");
         (ii) a referência de perto é sobre o óculos que está sendo PRESCRITO agora — não
              uma queixa sobre o óculos ANTIGO/atual do paciente ("esse aqui era muito
              míope, incomoda demais para perto" é queixa do óculos velho, NÃO prescrição
              de multifocal);
         (iii) longe e perto aparecem na MESMA decisão, dita pelo médico, sem negativa
               entre elas.
       Na dúvida — inclusive quando a transcrição estiver embaralhada e você precisar
       "reconstruir" o sentido da frase — use "Prescrição de óculos" sem qualificador.
       Errar para menos aqui é barato (o médico completa o tipo); afirmar multifocal que
       não foi prescrito é fabricar decisão clínica.
  ❌ NÃO classificar como multifocal com base em:
    - ADD ou adição presentes APENAS no ticket de refração, sem o médico falar de correção
      de perto na consulta (ADD é medida, não tipo de óculos)
    - Queixa do paciente sobre o óculos ANTIGO ser ruim de perto — isso motiva a troca,
      não define o tipo da lente nova
    - Trechos com negativa ou pergunta não respondida em torno de "perto"/"longe"
    - "grau de perto" isolado, sem nenhuma referência a longe (pode ser óculos só de leitura)
    - "grau de longe" isolado, sem nenhuma referência a perto
    - Médico que falou em DOIS óculos/armações separados ("um para longe e outro para perto")
      → são DUAS linhas de prescrição, não multifocal
  Se nenhum critério permitir identificar o tipo → "Prescrição de óculos" (sem qualificador).

  Exemplos:
    Médico: "vou passar multifocal" → "Prescrição de óculos multifocais" ✅
    Médico: "vou fazer óculos progressivo" → "Prescrição de óculos multifocais" ✅
    Médico: "óculos que serve para perto e longe" → "Prescrição de óculos multifocais" ✅
    Médico (paciente présbita, UM óculos prescrito): "para perto aí nem se fala... vai ver que
      para longe o óculos também faz falta, para estrada e à noite sempre de óculos"
      → "Prescrição de óculos multifocais" ✅ (correção de longe E perto no mesmo óculos)
    Médico: "vou mudar o grau" (ticket tem ADD, sem fala de perto) → "Prescrição de óculos" ❌ não multifocal
    Médico: "vai pra ótica" (ticket tem ADD, sem fala de perto) → "Prescrição de óculos" ❌ não multifocal
    Médico: "precisa de óculos para longe" → "Prescrição de óculos para longe" ❌ não multifocal
    Médico: "vou passar óculos para perto" → "Prescrição de óculos para perto" ❌ não multifocal
    Médico: "um óculos para longe e outro para leitura" → duas linhas de prescrição ❌ não multifocal
    (caso real 2026-08-05) Paciente sobre o óculos ANTIGO: "esse aqui era muito miopia, aí
      incomoda demais para perto"; médico, com o ASR embaralhado: "não é para perto, sim,
      para longe, não... eu ajustei o grau"
      → "Prescrição de óculos" ❌ NÃO multifocal — o "perto" é queixa do óculos velho e o
        trecho está cheio de negativas; nada indica lente de longe+perto na mesma armação

  ★ INFERÊNCIA DE PRESCRIÇÃO DE ÓCULOS (quando o médico não verbaliza explicitamente):
  Em consultas de refração, a prescrição de óculos é a conclusão natural da consulta.
  Você PODE inferir "Prescrição de óculos" quando TODAS as condições abaixo forem verdadeiras:
    a) Houve refração (ticket TOPCON ou refração subjetiva mencionada na consulta).
    b) O médico orientou o paciente a ir a uma ótica ou comprar óculos (mesmo de forma coloquial).
    c) NÃO houve declaração do médico de que não vai prescrever.
  Nesse caso → registre "Prescrição de óculos" (sem qualificador de tipo).
  Para usar "multifocais", aplicar a REGRA CRÍTICA acima: palavra explícita OU correção de
  longe E perto claramente atribuída ao mesmo óculos na fala do médico.
  ❌ NUNCA inferir prescrição quando o médico não mencionou óculos de forma alguma.

  ⚠️ Longe + perto na MESMA armação = multifocal ou bifocal — NÃO duas linhas separadas.
     Duas prescrições só quando há DUAS armações (ex.: óculos de sol + óculos de leitura).
     Mas só classifique como multifocal se o médico deixou claro que é longe+perto juntos.

  ⚠️ SEM DETALHES TÉCNICOS DE LENTE: a conduta registra SOMENTE se é multifocal ou não.
     NUNCA inclua revestimento antirreflexo, filtro de luz azul, tamanho/campo de lente,
     qualidade ou marca da lente — são padrão de ótica, não decisão clínica.
     Isso vale mesmo que o médico tenha comentado esses detalhes com o paciente, e
     independente de ele ter recomendado ou desaconselhado o item (ex.: médico dizendo
     que filtro azul "é jogar dinheiro fora" também NÃO entra em conduta).
     ❌ ERRADO: "Orientado sobre escolha de lentes multifocais (qualidade, antirreflexo, filtro azul)"
     ✅ CORRETO: "Prescrição de óculos multifocais"

  ⚠️ ORIENTAÇÕES SOBRE USO/ADAPTAÇÃO DOS ÓCULOS — GENÉRICO, NUNCA DETALHAR:
     Quando o médico prescreveu óculos E também deu qualquer orientação sobre USO, ADAPTAÇÃO
     ou ESCOLHA de óculos/armação/lente (mesmo breve, informal ou parcial), NÃO detalhe o
     conteúdo dessas orientações e NÃO crie uma linha "Orientado" separada para elas.
     Em vez disso, acrescente o sufixo " com orientações sobre o uso" à própria linha de
     prescrição:
       ✅ "Prescrição de óculos multifocais com orientações sobre o uso"
       ✅ "Prescrição de óculos para perto com orientações sobre o uso"
     Se o médico NÃO deu nenhuma orientação sobre uso/adaptação/escolha, registre apenas a
     prescrição pura, sem o sufixo:
       ✅ "Prescrição de óculos multifocais"
     NUNCA detalhe (mesmo resumido) o conteúdo da orientação — nem postura, nem técnica de
     adaptação, nem prazo, nem critério de escolha de armação, preço, tamanho ou curvatura.
     Exemplo — médico prescreve multifocal e orienta uso conforme necessidade + adaptação
     (evitar olhar para baixo ao andar) + escolha de armação (evitar extremos de preço):
       ❌ ERRADO (detalhado): "Prescrição de óculos multifocais\nOrientado sobre uso de óculos multifocais conforme necessidade\nOrientado sobre adaptação a óculos multifocais (evitar olhar para baixo ao andar)"
       ❌ ERRADO (omitido): "Prescrição de óculos multifocais"  ← houve orientação, o sufixo genérico é obrigatório
       ✅ CORRETO: "Prescrição de óculos multifocais com orientações sobre o uso"
     Exemplo — médico prescreve óculos para longe sem nenhuma orientação adicional sobre uso:
       ✅ CORRETO: "Prescrição de óculos para longe"
  ⚠️ "Sem prescrição de óculos" só quando o médico for explícito:
     "não precisa de óculos", "grau não justifica", "sem indicação no momento".
     ❌ NÃO usar quando o médico simplesmente não falou em óculos.

  ⚠️ DISTINÇÃO CRÍTICA — "Manutenção do óculos atual" vs "Sem prescrição de óculos" (confusão frequente):

  "Manutenção do óculos atual" → paciente JÁ USA óculos e médico MANTÉM o grau atual:
    ✅ Sinais no transcript: "não precisa trocar o grau", "o grau está parecido", "grau praticamente igual",
       "os óculos ainda servem", "mantém os óculos que tem", "grau não mudou muito",
       "pode continuar com os óculos atuais", "não precisa fazer novo óculos"
    → Em retorno: se paciente já usa óculos (mencionado na anamnese) E médico diz qualquer
      variação de "não trocar" ou "manter" → use SEMPRE "Manutenção do óculos atual"

  "Sem prescrição de óculos" → SOMENTE quando médico diz que paciente NÃO PRECISA DE ÓCULOS:
    ✅ "não precisa de óculos", "grau não justifica óculos", "ainda não precisa de óculos",
       "sem indicação de óculos no momento", "visão ainda não precisa de correção"

  ❌ ERRO CRÍTICO: "não precisa trocar o grau" ≠ "Sem prescrição de óculos"
     "não precisa trocar o grau" = paciente já usa óculos e vai CONTINUAR usando os mesmos
     → Registrar: "Manutenção do óculos atual" — NUNCA "Sem prescrição de óculos"

  FILTROS DE DESCARTE — nunca incluir em conduta:
  * ❌ Logística/operacional da clínica: "retirar exames", "buscar exames", "pagar na recepção",
    "agendar no balcão", "entregar receita" → ação do paciente/clínica, não médica
  * ❌ Logística pós-consulta de óculos: "Conferir óculos após prontos", "Retirar óculos na ótica",
    "Buscar óculos quando ficar pronto" → logística do paciente, não decisão médica
    ✅ ÚNICA entrada de óculos: "Prescrição de óculos [tipo]"
  * ❌ Orçamento/cotação de óculos: "orientado a fazer orçamento em mais de uma ótica",
    "pesquisar preço em várias óticas", "cotar o valor das lentes", "comparar preços"
    → orientação comercial ao paciente, não decisão médica → NUNCA entra em conduta
  * ❌ Retornos condicionais vagos: "retorno se dificuldade", "retorno se não adaptar",
    "retorno se piorar", "retorno se necessário"
    → Se já há retorno com prazo definido → descartar todos os condicionais
    → Se NÃO há retorno com prazo → manter apenas UM condicional, o mais específico
  * ✅ EXCEÇÃO — PLANO DE INVESTIGAÇÃO CONDICIONAL (não confundir com o item acima):
    quando o médico atribui a queixa a uma causa provável e declara que, se o tratamento
    ou a correção NÃO resolver, é preciso INVESTIGAR OUTRAS CAUSAS → isso é DECISÃO CLÍNICA
    e entra SEMPRE na conduta, em UMA linha com o prefixo "Orientado ".
    Discriminador: o condicional vago manda o paciente VOLTAR para rever a MESMA coisa;
    o plano de investigação abre uma LINHA DIAGNÓSTICA NOVA (outra causa, outra hipótese).
    ✅ Médico: "vou passar o óculos; se resolver a dor de cabeça, perfeito — se não resolver,
       tem que investigar outras causas"
       → "Orientado prosseguir investigação de outras causas se não houver melhora com a
          correção óptica"
    ✅ Médico: "se o colírio não melhorar a vermelhidão, a gente vai ter que procurar outra
       origem" → "Orientado prosseguir investigação de outras causas se não houver melhora
       com o tratamento"
    ❌ NÃO é plano de investigação: "se não adaptar, volta aqui", "qualquer coisa me procura",
       "se piorar, retorna" → seguem descartados pela regra dos condicionais vagos.
    ⚠️ Esta linha NÃO substitui o "Retorno X meses" quando houver prazo definido — as duas
       coexistem.
  * ❌ Redundâncias: nunca repetir a mesma conduta com palavras diferentes
  * ❌ PROIBIDO: frases longas, explicações, "com orientação sobre...", "para avaliação de..."
  * ❌ PROIBIDO: "declaração de comparecimento"
  * ❌ PROIBIDO: colírios, pomadas e medicamentos nomeados com posologia → vão em TRATAMENTO

  ★ RETORNOS — discriminação patologia vs óculos (CRÍTICA):
  Antes de incluir qualquer "Retorno X", identifique o MOTIVO do retorno:
    | Motivo                                                                       | Destino             |
    |------------------------------------------------------------------------------|---------------------|
    | Acompanhamento de PATOLOGIA (catarata, glaucoma, blefarite, DMRI, suspeita)  | ✅ MANTER em conduta |
    | Revisar EXAME solicitado (campo visual, OCT, retinografia)                   | ✅ MANTER em conduta |
    | Controle de TRATAMENTO em curso (pós-op, colírio novo)                       | ✅ MANTER em conduta |
    | Conferir ÓCULOS quando chegarem da ótica                                     | ❌ DESCARTAR         |
    | ADAPTAÇÃO a óculos multifocais/progressivos                                  | ❌ DESCARTAR         |
    | BUSCAR receita, laudo ou documento                                           | ❌ DESCARTAR         |

  Teste prático: "Se o paciente nunca tivesse comprado óculos, esse retorno faria sentido?"
    SIM → retorno clínico → CONDUTA
    NÃO → logística de óculos → DESCARTAR

  Quando o médico junta razões num só enunciado:
    Ex: "volta em 6 meses pra acompanhar a catarata e já traz os óculos pra conferir"
    → Extraia APENAS a razão clínica: "Retorno 6 meses"
    (a conferência de óculos é descartada mesmo estando no mesmo enunciado).

- tratamento: medicamentos, substâncias farmacológicas E orientações físicas ao paciente

  ★★ HIERARQUIA DE NOMEAÇÃO DA MEDICAÇÃO PRESCRITA (aplicar a CADA colírio/remédio que o médico PRESCREVE):
     Registre sempre no nível MAIS específico possível — nesta ordem:
     ⚠️ O nível 1 é o ALVO — desça só quando ele for genuinamente impossível. Um princípio ativo
        registrado é sempre melhor que uma classe; uma classe é sempre melhor que o genérico.
        Antes de descer de nível, confira: o médico disse a marca? disse o princípio? a fala
        corresponde a um protocolo declarado abaixo (nível 1.5)? Só então use o nível 2 ou 3.
     1) PRINCÍPIO ATIVO — quando o médico NOMEOU o remédio: princípio ativo dito, OU marca
        mapeável pela base de conhecimento acima. Ex.: "Vigadexa" → "Moxifloxacino + dexametasona";
        "dorzolamida" → "Dorzolamida"; "Tobradex" → "Tobramicina + dexametasona".
        Marca dita SEMPRE vira princípio ativo — não registre o nome comercial cru quando a base
        de conhecimento tem o mapeamento.
        ⚠️ NUNCA infira o princípio ativo a partir do diagnóstico ou do contexto — apenas quando o
        nome (marca ou princípio) foi efetivamente PRONUNCIADO, ou quando um PROTOCOLO DECLARADO
        do médico (nível 1.5) se aplica. Princípio ativo errado num prontuário é pior que um genérico.
     1.5) PROTOCOLO DECLARADO DO MÉDICO — o médico declarou previamente qual remédio ele usa em
        determinada combinação de tratamento. Não é inferência a partir do diagnóstico: é a conduta
        padrão dele, informada por ele. Protocolos vigentes:
          • BLEFARITE — compressa morna e/ou higiene palpebral + um colírio a ser pingado em seguida,
            SEM o médico nomear esse colírio → "Tobramicina + dexametasona".
            O lubrificante NÃO é o colírio da blefarite: o "pingar" do lubrificante nunca aciona o protocolo.
        ⚠️ O nível 1 sempre vence o 1.5: se o médico nomeou OUTRO remédio, registre o que ele disse.
        ⚠️ O protocolo apenas NOMEIA um colírio cuja prescrição já foi confirmada na fala — ele nunca
        cria uma prescrição que não existe (ver REGRA ANTI-INVENÇÃO abaixo).
     2) GRUPO / CLASSE — quando o médico NÃO nomeou o remédio, nenhum protocolo declarado se aplica,
        mas a classe é identificável pela fala (finalidade dita ou tratamento inequívoco).
        Ex.: "colírio para pressão" → "Colírio hipotensor ocular"; "colírio de alergia" → "Colírio antialérgico";
        "colírio de antibiótico" (sem marca/princípio) → "Colírio antibiótico".
     3) GENÉRICO — quando NEM o nome, NEM um protocolo declarado, NEM a classe podem ser identificados,
        mas houve prescrição. Ex.: médico diz só "usa o colírio 3x/dia", fora de qualquer protocolo
        → "Medicação ocular prescrita".
     ⚠️ NUNCA omita uma prescrição porque o nome não foi dito — desça para o nível 2 ou 3, mas REGISTRE.
     ⚠️ Nome que o ASR destruiu (ex.: "trometolou 3 vezes ao dia por 5 dias") NÃO autoriza classe:
        registre "Medicação ocular prescrita" + posologia. É PROIBIDO deduzir a classe pelo contexto
        clínico (corpo estranho/"machucado" → "Colírio antibiótico") — a classe do nível 2 só vale
        quando a FALA a diz ("antibiótico", "para pressão", "de alergia").
     ⚠️ Colírio MANTIDO é tratamento: "mantido o timolol 2x/dia", "continua com o colírio da pressão"
        → linha em tratamento ("Timolol 2x/dia"), além de constar em medicacoes_em_uso. NÃO devolva
        tratamento null só porque o remédio já estava em uso — null vira "Sem prescrição de medicação".
     ⚠️ IMPORTANTE: Nunca inclua "1 gota" ou "uma gota" nas prescrições de colírio, pois já é subentendido.
     A posologia (frequência, olho, duração) é preservada em qualquer nível quando mencionada.

  ★★ REGRA ANTI-INVENÇÃO DE TRATAMENTO (CRÍTICA — precede toda a hierarquia acima):
     Um tratamento só existe se o MÉDICO efetivamente o PRESCREVEU na fala — nomeando um remédio,
     indicando uma classe/finalidade, OU dando uma instrução inequívoca de usar/pingar/aplicar/passar
     algo. Os níveis de nomeação acima (incluindo o protocolo declarado 1.5) só se aplicam DEPOIS de
     confirmado que houve prescrição real — eles decidem COMO chamar o remédio, nunca SE ele existe.
     ❌ PROIBIDO inferir que existe prescrição a partir do DIAGNÓSTICO ou do contexto clínico.
        O diagnóstico NÃO gera tratamento automático. Exemplos do que NÃO se pode inventar:
          - "corpo estranho" / "abrasão" → NÃO assuma pomada ou colírio antibiótico
          - "olho vermelho" → NÃO assuma colírio antialérgico ou lubrificante
          - "conjuntivite" → NÃO assuma antibiótico tópico
        Se o médico removeu o corpo estranho e NÃO prescreveu nada, tratamento = null.
     ❌ PROIBIDO inventar posologia (frequência, duração, dose — "4/4h", "por 3 dias", "3x/dia").
        Posologia entra SOMENTE quando pronunciada. Houve prescrição sem posologia dita?
        Registre a medicação sem posologia — NUNCA complete com valores plausíveis.
     ❌ Consulta encerrou (despedida/STOP) sem o médico ditar conduta/tratamento? tratamento = null.
        A AUSÊNCIA de prescrição é um desfecho válido e esperado — não preencha o vazio para
        "fechar" o prontuário. Deixar null é sempre preferível a um tratamento fabricado.

  ✅ Colírios nomeados ou por classe: "Vigadexa 4x/dia por 7 dias" → "Moxifloxacino + dexametasona 4x/dia por 7 dias",
     "Tobramicina + dexametasona 3x/dia após higiene palpebral"
  ✅ Lubrificantes oculares: "Lubrificante ocular AO ao longo do dia"
  ✅ Medicamentos orais: "Ômega 3 1000mg — 1cp almoço e 1cp jantar por 30 dias"
  ✅ Pomadas oculares com posologia
  ✅ Compressa morna: "Compressa morna 2 min — 2x/dia"
  ✅ Higiene palpebral: "Higiene palpebral com shampoo infantil — 3x/dia"
  ❌ Pedidos de exame (OCT, campo visual, retinografia…) → vão em CONDUTA
  ❌ Explicações de diagnósticos/patologias → vão em CONDUTA
     (exceção: explicação de que o exame deu NORMAL não vai para lugar nenhum — é resultado
      de exame, não conduta; ver "NORMALIDADE NÃO VAI PARA A CONDUTA")
  * Se nenhum medicamento/colírio/orientação física foi prescrito → null

  EXEMPLOS PARA BLEFARITE (use como referência de separação):
    conduta:    "Retorno 2 semanas"
    tratamento: "Compressa morna 2 min — 2x/dia"
                "Higiene palpebral com shampoo infantil — 3x/dia"
                "Tobramicina + dexametasona 3x/dia após higiene palpebral"
                "Lubrificante ocular AO ao longo do dia"
                "Ômega 3 1000mg — 1cp almoço e 1cp jantar por 30 dias"

  ★ Regra da medicação de blefarite (CRÍTICA — quando injectBlefarite=true ou a blefarite está
    sendo tratada): além da compressa e da higiene, a blefarite é tratada com um colírio.
    Nomeie esse colírio seguindo a HIERARQUIA DE NOMEAÇÃO acima, NESTA ORDEM DE PRECEDÊNCIA:
      1º) médico NOMEOU o remédio (marca ou princípio) → princípio ativo correspondente (nível 1).
          O nome dito SEMPRE vence o protocolo padrão. Ex.: "usa o Maxitrol" →
          "Neomicina + polimixina B + dexametasona".
      2º) médico NÃO nomeou, mas prescreveu compressa e/ou higiene palpebral MAIS um colírio a ser
          pingado em seguida → "Tobramicina + dexametasona" (PROTOCOLO DECLARADO, nível 1.5).
          Este é o padrão do médico para blefarite — use-o mesmo quando ele disser apenas
          "vou passar um colírio", "um tratamento pra desinflamar", "um tratamento mais forte",
          "pinga esse aqui depois da limpeza". NÃO exija que os três itens apareçam literalmente
          nem que a posologia seja dita: higiene OU compressa + colírio já bastam.
          ⚠️ O QUE CONTA COMO "O COLÍRIO" (log 2026-09-15 — Tobramicina injetada sem colírio na fala):
             ✅ a palavra colírio / gota / pingar referindo-se a um produto que NÃO é o lubrificante;
             ✅ a intenção de um remédio anti-inflamatório: "tratamento mais forte", "pra desinflamar".
             ❌ o LUBRIFICANTE — "um lubrificante, pode pingar quantas vezes quiser" é o item 4 da lista,
                não o colírio da blefarite. Pingar lubrificante NUNCA aciona o protocolo.
             ❌ o simples ANÚNCIO do tratamento — "vou passar um tratamento para melhorar essa
                irritação, isso é coisa simples", seguido de compressa/higiene/lubrificante/ômega 3.
                Esse "tratamento" É a lista que o médico enumera em seguida, não um colírio a mais.
          Teste obrigatório antes de escrever "Tobramicina + dexametasona": aponte o trecho da fala
          em que o colírio (que não é o lubrificante) foi prescrito. Não achou? Não há colírio:
          registre só compressa, higiene, lubrificante e ômega 3 que o médico ditou.
      3º) não há colírio a pingar, apenas uma classe identificável na fala (ex.: médico disse
          "colírio de antibiótico" para outro quadro) → classe (nível 2).
      4º) nada disso é identificável, mas houve prescrição → "Medicação ocular prescrita" (nível 3).
    ⚠️ "Tobramicina + dexametasona" NÃO é invenção: é o protocolo declarado do médico para blefarite.
       O que continua PROIBIDO é criar uma prescrição que não existe — se o médico NÃO prescreveu
       nenhum colírio (só compressa e higiene, ou nada), não acrescente colírio algum.
    ⚠️ NÃO use mais "Associação (ATB + corticoide ocular)" na blefarite: ou o médico nomeou o
       remédio (nível 1), ou vale o protocolo "Tobramicina + dexametasona" (nível 1.5).
    A ordem clínica no tratamento:
      tratamento: 1) Compressa morna  2) Higiene palpebral  3) Colírio da blefarite  4) Lubrificante  5) Ômega 3

- biomicroscopia: texto de biomicroscopia — preencher quando o médico descreve ao paciente um achado ocular de segmento anterior.
  ❌ NÃO preencher quando:
    • Exames normais sem patologia → usar injectExamesNormais=true (o sistema injeta o template padrão)
    • ÚNICO achado é blefarite/meibomite → usar injectBlefarite=true (o sistema usa template blefarite)
    • Nenhuma alteração foi descrita
  ✅ Preencher quando o médico descreve ao paciente QUALQUER alteração de segmento anterior:
    pterígio, pinguécula, conjuntivite, úlcera de córnea, ceratocone, nevo conjuntival, etc.
  ✅ Preencher também quando blefarite + outro achado de segmento anterior (gerar texto combinado)

  ⚠️ CONSISTÊNCIA DIAGNÓSTICO ↔ EXAME (crítica): se você registrou em "diagnostico" um achado
    ESTRUTURAL de segmento anterior como ATUAL (pterígio, pinguécula, leucoma, ceratocone,
    úlcera, ceratite, conjuntivite, hordéolo, calázio, uveíte, hemorragia subconjuntival...),
    então "biomicroscopia" NÃO pode ser null e NÃO pode descrever o olho afetado como normal.
    Descreva por olho (olho afetado + contralateral "olho calmo"). Um prontuário que diagnostica
    pterígio OD e descreve "AO: olho calmo" se contradiz — erro grave.
    • Isto NÃO afrouxa a regra de fonte: continua valendo que relato do paciente e história não
      viram achado de exame. A regra aqui é posterior — DEPOIS de você decidir que o achado é
      atual e digno de "diagnostico", o exame precisa refleti-lo.
    • ⛔ POR ISSO a decisão certa é lá atrás, no "diagnostico": achado EPISÓDICO que só o
      PACIENTE relatou (hemorragia subconjuntival recorrente, terçol, olho vermelho que vai e
      vem) NÃO pode entrar em "diagnostico" como atual — ver a REGRA CRÍTICA de achado
      episódico na seção "diagnostico". Se ele não entra lá, esta regra não o arrasta para cá.
      Nunca use esta regra como justificativa para escrever no exame um achado que o médico
      não descreveu ter visto hoje.
    • Achado verbalizado DURANTE o exame (o médico está na lâmpada de fenda: "encosta o queixo",
      "olha para frente", "pisca") conta como achado de exame mesmo que o reconhecimento de voz
      embarale quem fala — nesse contexto a frase é do exame, não anamnese.
    • Se o achado é histórico/resolvido, marque-o como tal no diagnóstico ("(resolvida)") — aí
      ele não exige descrição no exame atual.

  ⚠️ REGRA DE FLAG (crítica): se QUALQUER olho tem achado de segmento anterior, injectExamesNormais=false.
    O texto por olho (achado no olho afetado + linha "olho calmo" do contralateral) vai INTEIRO em
    dados.biomicroscopia. Nunca deixe injectExamesNormais=true junto com dados.biomicroscopia
    preenchida — o template normal AO sobrescreveria o achado.

  LATERALIDADE — regra crítica:
    • Identificar o olho afetado usando TODA a consulta — não apenas a fala do médico
      durante o exame, mas também a queixa/HDA. O lado dito na HISTÓRIA vale para a
      biomicroscopia (ex: "o inseto entrou no olho direito", "arranhei esse olho aqui",
      "a poeira caiu no esquerdo" → o achado do exame é nesse mesmo olho).
    • Usar prefixo "OD" / "OE".
    • Só usar "AO" (ambos os olhos) quando o achado for REALMENTE bilateral e assim
      descrito (blefarite, conjuntivite bilateral, pterígio nos dois olhos, etc.).

  ⚠️ PROIBIDO "AO" em achados UNILATERAIS POR NATUREZA:
    trauma, corpo estranho, inseto, arranhão / abrasão / erosão de córnea, úlcera ou
    ceratite traumática, hemorragia subconjuntival por trauma. Descrever "AO" nesses
    casos INVENTA uma lesão no olho são — erro grave de prontuário. NÃO existe "fallback
    AO seguro" para essas situações.
    • Lado identificável (história OU exame) → descrever SÓ o olho afetado (OD ou OE) e
      a linha do contralateral como "olho calmo".
    • Lado IMPOSSÍVEL de determinar em toda a consulta → NÃO assuma AO e NÃO invente o
      olho são. Prefixe o texto com "[CONFIRMAR OLHO AFETADO] " e descreva apenas o olho
      afetado, SEM a linha do contralateral. O médico confirma/corrige o lado no prontuário.

  FORMATO OBRIGATÓRIO:
    "[OD/OE/AO]: [descrição do achado]; [elementos normais não afetados: córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente]"
    Se achado unilateral: incluir linha para o olho contralateral como "olho calmo"

  🔴 ORDEM DOS OLHOS — OD SEMPRE ANTES DE OE (regra geral, vale para QUALQUER campo
     em que os olhos sejam descritos separadamente):
     A linha do OD vem SEMPRE primeiro, mesmo quando o achado é do OE e o OE foi o
     assunto da consulta. A ordem é a do prontuário (direito → esquerdo), NUNCA a
     ordem em que os olhos apareceram na fala.
     ✅ "OD: olho calmo, ...\nOE: pterígio nasal grau I, ..."
     ❌ "OE: pterígio nasal grau I, ...\nOD: olho calmo, ..."

  Exemplos:
    Pterígio OD: "OD: pterígio nasal grau I, sem invasão de eixo visual; córnea transparente nas demais regiões, câmara anterior formada, pupila regular e reagente, cristalino transparente\nOE: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
    Conjuntivite alérgica AO: "AO: hiperemia conjuntival difusa com secreção serosa, papilas tarsais; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
    Blefarite + pterígio OD: "OD: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; pterígio nasal grau I; córnea transparente nas demais regiões, câmara anterior formada, pupila regular e reagente, cristalino transparente\nOE: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

  ⛔ "hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas
     de meibômio" NÃO É FRASE DE ROTINA. E "com secreção espessa" NÃO entra nessa frase:
     secreção espessa é um achado à parte (meibum expressível), só escrito se o médico
     falou de secreção/glândula entupida na consulta. Só escreva essa descrição
     quando o médico DESCREVEU inflamação na pálpebra na consulta — falando de blefarite/
     meibomite, de pálpebra/bordo inflamado ou vermelho, de crosta, caspa, descamação,
     secreção, glândulas entupidas, "pontinhos de inflamação" nos cílios.
     ❌ Prescrever higiene palpebral, shampoo ou compressa morna NÃO autoriza essa descrição:
        tratamento não é exame. Nesses casos deixe biomicroscopia=null — o médico redige.

  ⚠️ CRISTALINO — decidir ANTES de escrever cada linha (olho a olho):

    1) Olho FÁCICO (nunca operado de catarata) — caso padrão:
       terminar a linha com "cristalino transparente". Esse termo é um PLACEHOLDER: o
       sistema o troca por "catarata ..." quando a catarata é detectada na consulta.

    2) Olho PSEUDOFÁCICO (JÁ operado de catarata) — EXCEÇÃO OBRIGATÓRIA:
       ❌ PROIBIDO escrever "cristalino transparente" nesse olho. O cristalino foi
          REMOVIDO na cirurgia; dizer que ele está transparente é erro grave de prontuário.
       ✅ Escrever a lente DIRETO na linha daquele olho:
          • cápsula limpa / médico diz que a lente está boa, bem posicionada, sem opacidade
            → "pseudofacia, LIO transparente e bem posicionada"
          • cápsula posterior opacificada
            → "pseudofacia, opacidade de cápsula posterior"

       ⚠️ OPACIDADE DE CÁPSULA EM LINGUAGEM LEIGA (regra do médico, 2026-08-05):
          a consulta é fala médico→paciente, não laudo. O médico QUASE NUNCA diz
          "opacidade de cápsula posterior" na frente do paciente — ele diz que a lente
          está embaçada, com sujeira, ou que vai precisar de limpeza. Todas estas falas
          do MÉDICO sobre a lente do olho pseudofácico são opacidade de cápsula posterior:
            • "a lente está (um pouco/um pouquinho) embaçada", "está embaçando", "embaçadinha"
            • "tem uma sujeira / sujeirinha na lente", "a lente está suja"
            • "vai precisar fazer uma limpeza", "vamos dar uma limpada na lente",
              "vai precisar limpar a lente", YAG, capsulotomia
          ✅ INTENSIDADE NÃO IMPORTA: "está um pouquinho embaçada, mas ainda não está
             atrapalhando" É opacidade de cápsula — escreva a lente opacificada do mesmo
             jeito. O grau/conduta ("ainda não precisa limpar") vai para conduta, não muda
             o achado do exame.
          ✅ Pronome conta: se o assunto da frase é a lente do olho operado, "ela está
             embaçada" / "está um pouquinho embaçada" é a lente — não invente outro sujeito.
          ❌ NÃO confundir com a QUEIXA DE VISÃO do paciente ("minha vista está embaçada",
             "enxergo embaçado"): isso é sintoma, vai para a HDA, não descreve a cápsula.
          ❌ NÃO confundir com HISTÓRICO do paciente: "já fiz a limpeza da lente",
             "fizeram o laser há dois anos" é antecedente — a cápsula pode estar limpa
             HOJE. Só o que o médico descreve NESTA consulta define a lente.
          ❌ Se o médico diz que a lente está limpa/transparente/boa → forma limpa, mesmo
             que o paciente relate embaçamento.

    Como saber que o olho é pseudofácico — QUALQUER uma destas evidências basta:
      • o paciente relata a cirurgia, inclusive em 1ª pessoa: "fiz a cirurgia de catarata",
        "operei esse olho", "fui operada de catarata", "coloquei a lente"
      • o médico confirma no exame: "a lente está boa", "a cirurgia ficou boa", "a lente
        está bem posicionada", "a lente está limpa"
      • antecedentes/diagnóstico registram facectomia, LIO, pseudofacia ou Z96.1
    ⚠️ Cirurgia apenas PLANEJADA ("vamos operar", "está indicada a cirurgia") NÃO é
       pseudofacia — esse olho continua fácico (com catarata).
    ⛔ CIRURGIA DE TIPO NÃO ESPECIFICADO NÃO É PSEUDOFACIA (regra do médico, 2026-09-02):
       o nome do procedimento vem da FALA, nunca de dedução — mesma regra do nome do
       exame complementar. Quando a cirurgia é citada sem nome ("já teve algum
       tratamento, cirurgia, acidente?" → "nos dois"; "fiz cirurgia há 15 anos"; "operei
       os dois olhos" sem dizer do quê):
         ✅ registrar em antecedentes EXATAMENTE como foi dito, sem nomear o
            procedimento: "Cirurgia ocular prévia AO há ~15 anos (tipo não especificado)"
         ❌ NÃO escrever facectomia, catarata, LIO, pseudofacia nem Z96.1
         ❌ o olho continua FÁCICO na biomicroscopia ("cristalino transparente")
       ⛔ PROIBIDA a dedução circular: nunca justificar a cirurgia pelo que você mesmo
          concluiu dela ("confirmado como cirurgia de catarata pela presença de LIO",
          "pela idade deve ter sido catarata"). A evidência tem de ser uma MENÇÃO FALADA
          a catarata, lente, facectomia ou à lente no exame — não uma inferência sua.
    ⛔ CIRURGIA NOMEADA MANTÉM O NOME QUE FOI DITO (caso real 2026-09-02): a paciente
       disse que a cirurgia dos dois olhos foi de PTERÍGIO e o antecedente saiu como
       "cirurgia de catarata". Trocar o tipo dito por outro é fabricação, não resumo.
         ✅ "Cirurgia de pterígio AO (há ~15 anos)" — o nome vem da fala
         ❌ nunca reescrever pterígio, glaucoma, retina, transplante, estrabismo,
            pálpebra, estética ou laser refrativo como catarata/facectomia
       Nenhuma dessas cirurgias é pseudofacia: o cristalino continua lá, o olho segue
       fácico na biomicroscopia e a presbiopia continua valendo. Só facectomia/catarata
       operada produz LIO. Se a cirurgia relatada tem CID próprio (pterígio = H11.0),
       ela entra nos antecedentes — não vira diagnóstico atual sem achado no exame.

    LATERALIDADE DA LENTE: a exceção vale SÓ para o(s) olho(s) operado(s).
      • Os dois olhos operados → a linha "AO" leva a pseudofacia.
      • Um olho só → a linha desse olho leva a pseudofacia e a do outro continua com
        "cristalino transparente". NUNCA escrever pseudofacia em "AO" quando só um olho
        foi operado — isso inventa uma cirurgia no olho são.

    Exemplo (pseudofacia bilateral, segmento anterior sem outro achado):
      "AO: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, pseudofacia, LIO transparente e bem posicionada"
    Exemplo (pseudofacia OD, OE ainda fácico):
      "OD: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, pseudofacia, LIO transparente e bem posicionada\nOE: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

- fundoscopia: texto de fundoscopia — preencher quando o médico descreve ao paciente um achado de segmento posterior.
  ❌ NÃO preencher quando: fundoscopia normal nos DOIS olhos (coberta por injectExamesNormais=true) ou não realizada
  ✅ Preencher quando: nevo de coroide, retinopatia, alteração macular, escavação aumentada, membrana epirretiniana, descolamento de retina, hemorragia vítrea, oclusão vascular, buraco macular, etc.

  ⚠️ REGRA DE FLAG (crítica): se QUALQUER olho tem achado de fundo, injectExamesNormais=false.
    O texto por olho (achado no olho afetado + linha normal do contralateral) vai INTEIRO em
    dados.fundoscopia. Nunca deixe injectExamesNormais=true junto com dados.fundoscopia
    preenchida — o template normal AO sobrescreveria o achado.

  LATERALIDADE — mesma regra crítica da biomicroscopia:
    • Identificar o olho afetado usando TODA a consulta (queixa/HDA + fala do exame).
    • Usar prefixo "OD" / "OE"; achado unilateral → descrever o olho afetado + linha do
      contralateral como fundo normal.
    • Só usar "AO" quando o achado for REALMENTE bilateral e assim descrito
      (retinopatia diabética/hipertensiva, papiledema bilateral).

  ⚠️ PROIBIDO "AO" em achados de fundo UNILATERAIS POR NATUREZA:
    descolamento de retina, hemorragia vítrea, nevo de coroide, membrana epirretiniana,
    oclusão vascular (arterial/venosa), buraco macular. Descrever "AO" nesses casos INVENTA
    a lesão no olho são — erro grave de prontuário (um descolamento fabricado no olho bom é
    pior que a abrasão do caso 2026-07-27).
    (Glaucoma NÃO entra nesta lista: a escavação aumentada costuma ser bilateral — se
    simétrica nos dois olhos, é "AO"; se só um olho tem escavação suspeita, é por olho.)
    • Lado identificável → descrever SÓ o olho afetado (OD ou OE) + linha do contralateral
      como fundo normal.
    • Lado IMPOSSÍVEL de determinar em toda a consulta → NÃO assuma AO. Prefixe o texto com
      "[CONFIRMAR OLHO AFETADO] " e descreva apenas o olho afetado, SEM a linha do contralateral.

  ⚠️ "escavação simétrica" é comparação ENTRE os olhos — só cabe na forma AO (ambos normais).
    Em linha de UM olho use "escavação fisiológica" (sem "simétrica"); no olho cuja
    escavação É o achado (glaucoma), a escavação não é normal — descreva-a e omita a linha.

  ⛔ A FUNDOSCOPIA É DESCRITIVA — NUNCA INTERPRETATIVA (regra do médico, 2026-08-04):
    o campo registra O QUE FOI VISTO no fundo, não a leitura diagnóstica do achado.
    ❌ PROIBIDO no texto da fundoscopia: "suspeita de glaucoma", "sugestivo de glaucoma",
       "compatível com glaucoma", "escavação glaucomatosa", "suspeito para glaucoma".
    ✅ Descreva o achado: "escavação aumentada (relação E/D ~0,7)", "assimetria de escavação
       entre os olhos", "rima neural afilada inferiormente".
    A suspeita vai para OUTROS campos, cada um no seu lugar:
      • diagnostico → "H400 - Suspeita de glaucoma" (com o lado, quando o médico o atribuiu)
      • conduta     → o pedido de exame, quando o médico PEDIU o exame e o NOMEOU
                      ("Solicitar campo visual" / "Solicitar OCT de nervo óptico" só se
                      "campo visual" / "OCT" tiverem sido ditos na consulta)
        ⛔ Este item é sobre ONDE o pedido é registrado, NÃO sobre QUAL exame pedir.
           A suspeita de glaucoma NÃO acompanha exame nenhum por padrão: se o médico não
           nomeou o exame, use "Solicitar exame complementar (não especificado na consulta)";
           se não anunciou exame algum, a conduta não tem linha de exame.
           (caso real 2026-08-17: "Solicitar OCT de nervo óptico" foi copiado deste exemplo
           numa consulta em que a palavra OCT nunca foi dita — mesmo defeito de 2026-08-04,
           que vazou este par para o TEXTO da fundoscopia, agora reaparecendo na conduta.)
    Mesma regra vale para qualquer outra interpretação diagnóstica no fundo: descreva o
    achado, deixe o nome da doença para o diagnóstico.

  FORMATO (unilateral): header "FUNDOSCOPIA INDIRETA:" seguido de uma linha por olho (\n):
    "FUNDOSCOPIA INDIRETA:\nOD: [achado]; retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica\nOE: fundo sem alterações, retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica"
  FORMATO (bilateral): linha única AO:
    "FUNDOSCOPIA INDIRETA: AO [achado]; retina aplicada, escavação simétrica e fisiológica"
  🔴 ORDEM DOS OLHOS: a linha do OD vem SEMPRE antes da linha do OE, mesmo quando o
     achado é do OE. Vale a ordem do prontuário, nunca a ordem da fala.

  Exemplos:
    Nevo OE (unilateral): "FUNDOSCOPIA INDIRETA:\nOD: fundo sem alterações, retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica\nOE: nevo de coroide inferotemporal, estável, sem sinais de atividade; retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica"
    Glaucoma OD escavação aumentada (unilateral) — SÓ a descrição; a suspeita vai para o diagnóstico (H400) e os exames para a conduta: "FUNDOSCOPIA INDIRETA:\nOD: escavação aumentada (relação E/D ~0,7); retina aplicada, mácula em bom aspecto, padrão vascular preservado\nOE: fundo sem alterações, retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica"
    Retinopatia diabética (bilateral): "FUNDOSCOPIA INDIRETA: AO sinais de retinopatia diabética leve (microaneurismas), sem edema macular aparente; retina aplicada, escavação simétrica e fisiológica"
    Glaucoma bilateral simétrico (AO) — idem, sem a leitura diagnóstica: "FUNDOSCOPIA INDIRETA: AO escavação aumentada e simétrica (relação E/D ~0,7); retina aplicada, mácula em bom aspecto, padrão vascular preservado"

══════════════════════════════════════════════════════════════
TESTE OBRIGATÓRIO — ANTES DE CADA LINHA
══════════════════════════════════════════════════════════════
Aplique os testes abaixo NA ORDEM:

⚠️ ESTES TESTES VALEM SÓ PARA LINHAS DE CONDUTA/TRATAMENTO — não tocam biomicroscopia,
   fundoscopia, diagnóstico nem as flags de injeção. O exame normal continua sendo
   documentado no campo de exame (ou pelo template), como sempre foi.

0. "É apenas a afirmação de que um exame deu NORMAL, ou uma tranquilização de que está tudo bem?"
   → Se SIM → OMITIR de ambos (nem conduta nem tratamento). Só siga para o teste 1 se sobrar
     conteúdo clínico além da normalidade. Se a normalidade vier COLADA a explicações de
     patologia, descarte só a cláusula de normalidade e siga com o resto.

1. "É um pedido de exame (OCT, campo visual, retinografia, paquimetria, topografia, curva de tensão, biometria, angiografia, ecografia)?"
   → Se SIM → CONDUTA (sempre — exames são solicitações, não tratamento)
   → Exame NOMEADO + futuro/decisão do médico = EMITA a linha (veja CRITÉRIOS DE INJEÇÃO DE EXAME); não a omita por cautela.
   → E ANTES de escrever a linha: "o médico NOMEOU esse exame na consulta?"
        NÃO nomeou, mas anunciou um exame → "Solicitar exame complementar (não especificado na consulta)"
        NÃO nomeou nem anunciou exame     → NÃO emita linha de exame (o achado não pede exame sozinho)
     NUNCA deduza o nome do exame do diagnóstico, do achado ou dos exemplos deste prompt.

2. "É uma explicação de patologia ou diagnóstico para o paciente?"
   → Se SIM → CONDUTA

3. "É uma prescrição de óculos, retorno, encaminhamento ou suspensão de medicamento?"
   → Se SIM → CONDUTA

4. "É compressa morna, higiene palpebral, shampoo, lubrificante ocular ou ômega 3?"
   → Se SIM → TRATAMENTO (ação/substância aplicada pelo paciente — NUNCA em conduta)

5. "É um medicamento, colírio ou substância farmacológica com posologia?"
   → Se SIM → TRATAMENTO

Exemplos do teste:
  "Solicitar OCT" (médico disse "OCT")                   → pedido de exame                → CONDUTA ✅
  "Solicitar campo visual" (médico disse "campo visual") → pedido de exame                → CONDUTA ✅
  Médico: "vamos fazer um outro exame ali para medir"    → exame sem nome                 → CONDUTA "Solicitar exame complementar (não especificado na consulta)" ✅
  Médico comenta achado do nervo sem nomear exame        → nome deduzido do achado        → NÃO emitir "Solicitar OCT" ❌
  "Retorno 1 mês"                                        → decisão clínica                → CONDUTA ✅
  "Suspender Xalatan"                                    → decisão clínica                → CONDUTA ✅
  "Prescrição de óculos"                                 → decisão clínica                → CONDUTA ✅
  "Explicado catarata e necessidade de acompanhamento"   → explicação ao paciente         → CONDUTA ✅
  "Explicado relação da cefaleia com grau refrativo"     → explicação ao paciente         → CONDUTA ✅
  "Orientado evitar coçar os olhos e atento a sinais de alerta (dor, piora visual)" → orientação sequencial → CONDUTA ✅
  "Orientado prosseguir investigação de outras causas se não houver melhora com a correção óptica" → plano diagnóstico → CONDUTA ✅
  "Compressa morna 2x/dia"                               → ação física do paciente        → TRATAMENTO ✅
  "Higiene palpebral"                                    → ação física do paciente        → TRATAMENTO ✅
  "Vigadexa 4x/dia"                                      → medicamento nomeado            → TRATAMENTO ✅
  "Lubrificante ocular 6x"                               → substância farmacológica       → TRATAMENTO ✅
  "Ômega 3 1000mg 1cp/dia"                               → suplemento com dose            → TRATAMENTO ✅
  "Explicado exames normais"                             → normalidade                    → OMITIR ❌
  "Explicado que a pressão e o fundo estão normais"      → normalidade                    → OMITIR ❌
  "Tranquilizado quanto à normalidade dos exames"        → normalidade                    → OMITIR ❌
  "Explicado que a pressão ocular está normal"           → normalidade de UM exame        → OMITIR ❌
  "Explicado blefarite, olho seco e exames normais"      → agrupada com normalidade       → vira "Explicado blefarite e olho seco" ✅
  "Explicado que a pressão está alta e o campo visual ainda está normal" → normalidade dentro de achado → CONDUTA ✅

FLAGS DE INJEÇÃO:
- injectExamesNormais: true SOMENTE se o médico afirma que TODOS os exames estão normais,
  sem exceção, E não há nenhum tratamento ou encaminhamento sendo prescrito por achado ocular.
  Exemplos corretos: "exames normais", "fundo de olho normal", "biomicroscopia normal",
  "olho tranquilo", "beleza nos exames".
  ⚠️ "tudo em paz com o olho" e "olho em paz" NÃO são suficientes por si só:
    → Se o médico prescreve lubrificante, encaminha, solicita exame ou indica cirurgia → false
    → Só marque true se for uma frase de conclusão geral sem nenhum tratamento ou encaminhamento
  ❌ ERRADO marcar true quando: "os outros exames estão tranquilos" (há exceção),
  "tirando X tudo normal" (há alteração), "exame de pressão normal" (só um exame),
  paciente tem diagnóstico ESTRUTURAL ativo (cicatriz corneal, glaucoma, retinopatia, etc.),
  médico prescreveu qualquer tratamento ativo (lubrificante, colírio, encaminhamento).
  ✅ CORRETO marcar true mesmo quando há diagnóstico REFRATIVO (presbiopia, miopia,
  astigmatismo, hipermetropia) — esses NÃO afetam biomicroscopia nem fundoscopia.
  Regra: se há QUALQUER alteração estrutural ocular conhecida OU prescrição de tratamento → false.
  Diagnósticos refrativos isolados com prescrição de óculos PODEM coexistir com true,
  desde que não haja outro tratamento ou encaminhamento por achado ocular.
- injectBlefarite: true se há QUALQUER indicação de blefarite, incluindo:
  * Diagnóstico: "blefarite", "blefaromeibomite", "disfunção de meibômio", "olho seco"
  * Tratamento típico: "lavar com shampoo", "compressa quente/morna", "higiene palpebral"
  * Se médico prescreve lavar olho com shampoo → injectBlefarite = true
  * Se médico menciona pálpebra inflamada → injectBlefarite = true
  ⚠️ A flag governa CONDUTA e TRATAMENTO de blefarite — não a descrição do exame.
  Quando a blefarite vem SÓ do tratamento (shampoo, compressa, higiene palpebral) e o médico
  não descreveu nenhuma inflamação da pálpebra, mantenha injectBlefarite=true e
  biomicroscopia=null: o sistema deixa o exame em branco e avisa o médico. Não escreva
  achados palpebrais que ninguém relatou.
- dilatacaoDetectada: true se médico menciona dilatar pupila ou usar colírio de dilatação
  ⚠️ REGRA CRÍTICA: quando dilatacaoDetectada=true, defina SEMPRE conduta=null, tratamento=null,
  biomicroscopia=null, fundoscopia=null, injectExamesNormais=false e injectBlefarite=false.
  Conduta, tratamento e a descrição dos exames só podem ser determinados após o retorno
  do paciente da dilatação. Preencher esses campos antes disso é clinicamente incorreto.
  ⚠️ MAS a ENTREVISTA deve ser extraída normalmente: hda (ou retorno), medicacoes_em_uso,
  antecedentes_oftalmologicos, alteracoes_sistemicas, antecedentes_familiares e diagnostico
  (se já mencionado) DEVEM ser preenchidos com o que foi dito ANTES da dilatação.
  A pausa para dilatação NÃO descarta a entrevista — ela é injetada imediatamente no
  prontuário e o restante (exames, conduta, tratamento) é completado no retorno.

⚠️ MARCADOR [RETORNO DA DILATACAO]:
Se a transcrição contiver a linha "[RETORNO DA DILATACAO]", o texto ANTES do marcador é a
entrevista pré-dilatação e o texto DEPOIS é a continuação da MESMA consulta após a dilatação.
Neste caso a dilatação JÁ OCORREU:
  - defina dilatacaoDetectada=false (a menos que uma NOVA dilatação seja anunciada DEPOIS do marcador)
  - menções a "vai dilatar"/"vou dilatar" ANTES do marcador NÃO contam como nova dilatação
  - extraia conduta, tratamento, biomicroscopia e fundoscopia normalmente, usando o texto COMPLETO
  - classifique tipo_consulta considerando a consulta inteira (antes + depois do marcador)

REGRA: injectBlefarite e injectExamesNormais são MUTUAMENTE EXCLUSIVOS.
Se houver blefarite, NÃO marque exames normais (a biomicroscopia não é normal).

Pre-detecção: examesNormais=${hasNormalExams}, blefarite=${hasBlefarite}

=== TRANSCRIÇÃO ===
${transcribedText}
=== FIM ===

IMPORTANTE — FORMATO DOS CAMPOS DE TEXTO:
Todos os campos de texto devem ser STRINGS (texto simples), nunca arrays ou listas JSON.
Use quebras de linha (\\n) para separar múltiplos itens dentro de um campo.
Exemplo CORRETO:   "conduta": "Prescrição de óculos\\nRetorno 1 mês"
Exemplo ERRADO:    "conduta": ["Prescrição de óculos", "Retorno 1 mês"]

⚠️ REGRA DE INTEGRIDADE — TRANSCRIÇÃO INVÁLIDA:
Se o texto contiver palavrões, frases incoerentes, ruído extremo, ou não houver informação
clínica confiável extraível, retorne APENAS:
{
  "tipo_consulta": "invalida",
  "dados": null,
  "motivo_revisao_manual": "Transcrição incoerente ou sem dados clínicos confiáveis.",
  "revisao_manual": true,
  "_raciocinio": "explicação"
}
NÃO infira diagnósticos, medicamentos, negações, lateralidade ou história familiar
a partir de texto ruidoso ou incoerente. Em caso de dúvida, prefira "invalida".

Retorne JSON conforme o tipo:

Se primeira_consulta:
{
  "tipo_consulta": "primeira_consulta",
  "dados": {
    "hda": "string ou null",
    "medicacoes_em_uso": "string — OBRIGATÓRIO, nunca null (use 'Nega uso de medicações oculares' se nenhum mencionado)",
    "antecedentes_oftalmologicos": "string ou null",
    "alteracoes_sistemicas": "string ou null",
    "antecedentes_familiares": "string ou null",
    "diagnostico": "string ou null",
    "conduta": "string com \\n entre itens, ou null — NUNCA incluir itens de normalidade/tranquilização ('exames normais', 'pressão boa', 'fundo normal', 'sem alterações'), nem como cláusula dentro de uma linha 'Explicado ...' agrupada",
    "tratamento": "string com \\n entre itens, ou null",
    "biomicroscopia": "string ou null — preencher APENAS quando há achado de segmento anterior descrito ao paciente (exceto blefarite pura e exames normais)",
    "fundoscopia": "string ou null — preencher APENAS quando há achado de segmento posterior descrito ao paciente"
  },
  "injectExamesNormais": true/false,
  "injectBlefarite": true/false,
  "dilatacaoDetectada": true/false,
  "_raciocinio": "explicação"
}

Se retorno:
{
  "tipo_consulta": "retorno",
  "dados": {
    "retorno": "string ou null",
    "medicacoes_em_uso": "string — OBRIGATÓRIO, nunca null (use 'Nega uso de medicações oculares' se nenhum mencionado)",
    "diagnostico": "string ou null",
    "conduta": "string com \\n entre itens, ou null — NUNCA incluir itens de normalidade/tranquilização ('exames normais', 'pressão boa', 'fundo normal', 'sem alterações'), nem como cláusula dentro de uma linha 'Explicado ...' agrupada",
    "tratamento": "string com \\n entre itens, ou null",
    "biomicroscopia": "string ou null — preencher APENAS quando há achado de segmento anterior descrito ao paciente (exceto blefarite pura e exames normais)",
    "fundoscopia": "string ou null — preencher APENAS quando há achado de segmento posterior descrito ao paciente"
  },
  "injectExamesNormais": true/false,
  "injectBlefarite": true/false,
  "dilatacaoDetectada": true/false,
  "_raciocinio": "explicação"
}
`.trim();
  }
}

// Singleton do agente de entrevista
const geminiInterviewAgent = new GeminiInterviewAgent();

