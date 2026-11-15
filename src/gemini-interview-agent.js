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
    const CONDUTA_VALIDA_RE = /^(?:retorno\b|encaminhamento|solicitar|pedir\b|pedido de|prescrição de óculos|prescricao de oculos|manutenção do óculos|manutencao do oculos|sem prescrição de óculos|sem prescricao de oculos|atualização de grau|atualizacao de grau|suspender\b|manter\b|alta\b|observ|acompanhar|acompanhamento|revisar|avaliação|avaliacao|campo visual|tonometria|massagem|orientad[ao]|explicad[ao]|esclarecid[ao]|programar|indicar|fundo com|oct\b|retinografia|topografia|paquimetria|biometria|angiografia|ecografia|curva de tens[aã]o)/i;

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
    const EXAME_RE = /^(?:solicitar|pedir|pedido de|exame[:\s]|oct\b|campo visual|retinografia|topografia|paquimetria|curva de tens[aã]o|biometria|angiografia|ecografia|ultrassonografia ocular|fundo com|biomicroscopia)/i;

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
    return buildConsultationPrompt(transcribedText, hasNormalExams, hasBlefarite, forceComplete);
  }
}

// Singleton do agente de entrevista
const geminiInterviewAgent = new GeminiInterviewAgent();

