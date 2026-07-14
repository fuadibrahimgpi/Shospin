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
  Maxidex (Dexametasona), Pred Fort (Prednisolona), FML (Fluormetolona)
ANTIBIÓTICOS:
  Zymar (Gatifloxacino), Vigamox (Moxifloxacino), Tobrex (Tobramicina)
ASSOCIAÇÕES ATB+CORTICÓIDE:
  Vigadexa (Moxifloxacino+Dexametasona), Tobradex (Tobramicina+Dexametasona)

ANTIALÉRGICOS:
  Patanol (Olopatadina), Zaditen (Cetotifeno)
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
   - NUNCA deixe este campo em branco. Ausência de informação = negação implícita.

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
  * Inclui: sintomas relatados pelo paciente, tempo de evolução, história do evento causador
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
- alteracoes_sistemicas: doenças sistêmicas do paciente + medicamentos sistêmicos em uso
  * Doenças: DM, HAS, hipotireoidismo, cardiopatia, etc.
  * Medicamentos sistêmicos: insulina, metformina, losartan, AAS, anticoagulantes, corticóides orais, etc.
  * Formato sugerido: "DM em uso de insulina e metformina, HAS em uso de losartan"
  * Se nega doenças E nega medicamentos sistêmicos → "Nega comorbidades"
  * Se tem doença mas não mencionou medicamento sistêmico → registre só a doença
- antecedentes_familiares: doenças familiares oculares com relevância hereditária (glaucoma, degeneração macular, retinose pigmentar, estrabismo, etc.)
  ❌ NÃO registrar em antecedentes_familiares: catarata — é doença degenerativa/senil sem valor hereditário significativo; se for a única queixa familiar, retornar null
  ⚠️ Esta restrição é EXCLUSIVA de antecedentes_familiares. Catarata encontrada no PACIENTE (ex: "tem uma catarata incipiente", "cristalino com opacidade") deve ser registrada normalmente em diagnostico (H250, H251, H259, H260 ou H269 conforme o caso).

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

- diagnostico: diagnósticos que o MÉDICO identifica/comunica — incluindo achados do exame físico
  Formato obrigatório: código CID-10 + hífen + descrição clínica, um por linha (separar por \n)
  ✅ "H010 - Blefarite bilateral\nH250 - Catarata senil incipiente AO"
  ✅ "H401 - Glaucoma primário ângulo aberto OD\nH524 - Presbiopia"
  ❌ Nunca texto livre sem código: "blefarite bilateral, catarata"
  ❌ Nunca CID sem descrição: "H010\nH260"

  ⚠️ CAPTURA DE ACHADOS DO EXAME FÍSICO (biomicroscopia / lâmpada de fenda):
  Achados mencionados durante o exame (ex: "tem uma cataratinha incipiente", "cristalino com opacidade",
  "leve opacidade cortical", "catarata em formação") → capturar como diagnóstico mesmo que dito de forma
  coloquial ou breve. Não ignorar por ser "achado incidental" — foi comunicado ao paciente e é clinicamente relevante.

  CIDs OFTALMOLÓGICOS FREQUENTES (usar estes preferencialmente):
  Pálpebras/lágrimas: H010=Blefarite  H020=Entrópio  H021=Ectrópio  H040=Dacrioadenite  H042=Epífora
  Conjuntiva:        H100=Conjuntivite mucopurulenta  H104=Conjuntivite crônica  H111=Pterígio  H113=Hemorragia subconjuntival
  Córnea/esclera:    H160=Úlcera de córnea  H161=Ceratite  H162=Ceratoconjuntivite  H181=Queratopatia bolhosa  H186=Ceratocone
  Cristalino:        H250=Catarata senil incipiente(inicial/cortical)  H251=Catarata senil nuclear  H259=Catarata senil NE(usar se só "catarata senil")  H260=Catarata pré-senil/juvenil  H269=Catarata NE  H270=Afacia
  Câmara/íris:       H200=Iridociclite aguda  H201=Iridociclite crônica
  Glaucoma:          H400=Suspeita de glaucoma  H401=GPAA  H402=Glaucoma ângulo fechado  H409=Glaucoma NE
  Retina/vítreo:     H330=Descolamento retina  H340=Oclusão arterial retina  H350=Retinopatia  H360=Retinopatia diabética  H430=Hemorragia vítrea
  Nervo óptico:      H460=Neurite óptica  H470=Transtorno nervo óptico
  Refração:          H520=Hipermetropia  H521=Miopia  H522=Astigmatismo  H524=Presbiopia  H525=Transtorno acomodação  H529=Refração NE
  Outros:            H530=Ambliopia  H570=Anomalias pupilares  H591=Transtornos pós-procedimento  Z010=Exame olhos e visão

  ⚠️ REGRA — PRESBIOPIA (H52.4):
  Inferir H52.4 SOMENTE quando houver menção EXPLÍCITA a pelo menos um dos termos abaixo:
    ✅ "grau de perto" / "adição" / "ADD"
    ✅ "óculos multifocal" / "multifocal" / "óculos bifocal" / "bifocal"
    ✅ "óculos para perto" / "óculos de leitura" / "óculos para ler"
  ❌ NÃO inferir presbiopia a partir de:
    - Falas genéricas sobre conforto na leitura ("vai achar mais confortável para ler", "para ler vai ajudar")
    - Menção isolada à dificuldade de leitura sem referência a óculos de perto
    - Idade do paciente isoladamente

  ⚠️ REGRA — REFRAÇÃO ESPECÍFICA (preferir CID específico a H52.9):
  Quando houver refração mensurada (autorrefrator ou refração subjetiva), usar o CID mais específico:
    H52.0 — Hipermetropia (esférico positivo predominante)
    H52.1 — Miopia (esférico negativo predominante)
    H52.2 — Astigmatismo (cilindro presente, qualquer valor diferente de zero)
    H52.3 — Anisometropia (diferença ≥ 1.00 D entre os olhos)
  Usar H52.9 APENAS quando não houver refração disponível ou os dados forem inconclusivos.

- conduta: decisões clínicas e pedidos de exame
  ✅ Retorno com prazo:                "Retorno X meses/ano"
  ✅ Encaminhamentos:                  "Encaminhamento: [especialidade ou procedimento]"
  ✅ Prescrição de óculos/lentes:      "Prescrição de óculos [tipo]"
  ✅ Suspensão de medicamento:         "Suspender [nome]"
  ✅ Pedidos de exame:                 "Solicitar OCT", "Solicitar campo visual", "Solicitar retinografia", "Fundo com dilatação"
  ✅ Explicações ao paciente:          diagnósticos, patologias e orientações verbais do médico
     → Seja extremamente OBJETIVO e direto. Evite rodeios ou detalhes desnecessários.
     → Quando houver VÁRIAS orientações práticas ou comportamentais, agrupe TODAS em uma única linha contínua, escritas em sequência (separadas por vírgula ou ponto e vírgula), sob um único prefixo "Orientado " (ex: "Orientado evitar coçar os olhos e atento a sinais de alerta"). NÃO crie múltiplas linhas individuais começando com "Orientado".
     → Quando houver VÁRIAS explicações de diagnóstico ou prognóstico, agrupe-as em sequência em uma única linha contínua sob o prefixo "Explicado " ou "Esclarecido ".
     → Itens de tratamento (compressa, higiene palpebral, colírios, lubrificantes, ômega 3) pertencem SEMPRE ao TRATAMENTO e NUNCA devem ser misturados ou agrupados com as orientações da conduta.
     → Use prefixo "Orientado " para orientações práticas ou comportamentais.
     → Use prefixo "Explicado " ou "Esclarecido " para explicações de diagnóstico ou prognóstico.
     → Capture SEMPRE que o médico explicar algo ao paciente, mesmo de forma coloquial.
     → Texto curto, impessoal, clínico — sem transcrever a fala literal.

  ⚠️ PEDIDOS DE EXAME → SEMPRE em conduta, NUNCA em tratamento.
     OCT, campo visual, retinografia, topografia, paquimetria, curva de tensão — são solicitações, não medicamentos.
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
  "Prescrição de óculos multifocais" SOMENTE quando o médico usar EXPLICITAMENTE uma das palavras:
    ✅ "multifocal", "progressivo", "lente progressiva", "bifocal"
    ✅ OU descrever claramente longe + perto na MESMA armação (ex.: "óculos que serve para longe e para perto")
  ❌ NÃO classificar como multifocal com base em:
    - ADD ou adição presentes no ticket de refração (ADD é medida, não tipo de óculos)
    - Médico mencionar "grau de perto" isoladamente (pode ser óculos separado)
    - Médico mencionar "grau de longe" isoladamente
    - Óculos convencional com qualquer combinação de esfério/cilíndrico sem mencionar longe+perto juntos
    - Qualquer situação em que o tipo não foi verbalizado pelo médico
  Se o tipo não foi verbalizado → "Prescrição de óculos" (sem qualificador).

  Exemplos:
    Médico: "vou passar multifocal" → "Prescrição de óculos multifocais" ✅
    Médico: "vou fazer óculos progressivo" → "Prescrição de óculos multifocais" ✅
    Médico: "óculos que serve para perto e longe" → "Prescrição de óculos multifocais" ✅
    Médico: "vou mudar o grau" (ticket tem ADD) → "Prescrição de óculos" ❌ não multifocal
    Médico: "vai pra ótica" (ticket tem ADD) → "Prescrição de óculos" ❌ não multifocal
    Médico: "precisa de óculos para longe" → "Prescrição de óculos para longe" ❌ não multifocal
    Médico: "vou passar óculos para perto" → "Prescrição de óculos para perto" ❌ não multifocal

  ★ INFERÊNCIA DE PRESCRIÇÃO DE ÓCULOS (quando o médico não verbaliza explicitamente):
  Em consultas de refração, a prescrição de óculos é a conclusão natural da consulta.
  Você PODE inferir "Prescrição de óculos" quando TODAS as condições abaixo forem verdadeiras:
    a) Houve refração (ticket TOPCON ou refração subjetiva mencionada na consulta).
    b) O médico orientou o paciente a ir a uma ótica ou comprar óculos (mesmo de forma coloquial).
    c) NÃO houve declaração do médico de que não vai prescrever.
  Nesse caso → registre "Prescrição de óculos" (sem qualificador de tipo — não inferir multifocal).
  Para usar "multifocais", aplicar a REGRA CRÍTICA acima: o médico deve ter dito a palavra.
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
     1) PRINCÍPIO ATIVO — só quando o médico NOMEOU o remédio: princípio ativo dito, OU marca
        mapeável pela base de conhecimento acima. Ex.: "Vigadexa" → "Moxifloxacino + dexametasona";
        "dorzolamida" → "Dorzolamida".
        ⚠️ NUNCA infira o princípio ativo a partir do diagnóstico ou do contexto — apenas quando o
        nome (marca ou princípio) foi efetivamente PRONUNCIADO. Princípio ativo errado num prontuário
        é pior que um genérico.
     2) GRUPO / CLASSE — quando o médico NÃO nomeou o remédio, mas a classe é identificável pela fala
        (finalidade dita ou tratamento inequívoco). Ex.: "colírio para pressão" → "Colírio hipotensor ocular";
        antibiótico + corticoide indicados na blefarite → "Associação (ATB + corticoide ocular)";
        "colírio de alergia" → "Colírio antialérgico".
     3) GENÉRICO — quando NEM o nome NEM a classe podem ser identificados, mas houve prescrição.
        Ex.: médico diz só "usa o colírio 3x/dia" → "Medicação ocular prescrita".
     ⚠️ NUNCA omita uma prescrição porque o nome não foi dito — desça para o nível 2 ou 3, mas REGISTRE.
     ⚠️ IMPORTANTE: Nunca inclua "1 gota" ou "uma gota" nas prescrições de colírio, pois já é subentendido.
     A posologia (frequência, olho, duração) é preservada em qualquer nível quando mencionada.

  ✅ Colírios nomeados ou por classe: "Vigadexa 4x/dia por 7 dias",
     "Associação (ATB + corticoide ocular) 3x/dia após higiene palpebral"
  ✅ Lubrificantes oculares: "Lubrificante ocular AO ao longo do dia"
  ✅ Medicamentos orais: "Ômega 3 1000mg — 1cp almoço e 1cp jantar por 30 dias"
  ✅ Pomadas oculares com posologia
  ✅ Compressa morna: "Compressa morna 2 min — 2x/dia"
  ✅ Higiene palpebral: "Higiene palpebral com shampoo infantil — 3x/dia"
  ❌ Pedidos de exame (OCT, campo visual, retinografia…) → vão em CONDUTA
  ❌ Explicações de diagnósticos/patologias → vão em CONDUTA
  * Se nenhum medicamento/colírio/orientação física foi prescrito → null

  EXEMPLOS PARA BLEFARITE (use como referência de separação):
    conduta:    "Retorno 2 semanas"
    tratamento: "Compressa morna 2 min — 2x/dia"
                "Higiene palpebral com shampoo infantil — 3x/dia"
                "Associação (ATB + corticoide ocular) 3x/dia após higiene palpebral"
                "Lubrificante ocular AO ao longo do dia"
                "Ômega 3 1000mg — 1cp almoço e 1cp jantar por 30 dias"

  ★ Regra da medicação de blefarite (CRÍTICA — quando injectBlefarite=true):
    Além da compressa e da higiene, a blefarite é tratada com um colírio. Nomeie esse colírio
    seguindo a HIERARQUIA DE NOMEAÇÃO acima:
      • Se a prescrição combinar: 1) compressas mornas, 2) higiene palpebral e 3) pingar um colírio 3x/dia → OBRIGATORIAMENTE considere este colírio como "Tobramicina/Dexametasona 3x/dia" (nível 2 específico).
      • médico nomeou o remédio → princípio ativo (nível 1)
      • médico indicou antibiótico + corticoide, ou é o tratamento inequívoco →
        "Associação (ATB + corticoide ocular) 3x/dia após higiene palpebral" (nível 2)
      • médico só mencionou "o colírio" sem nome nem classe (e sem a combinação acima) →
        "Medicação ocular prescrita 3x/dia após higiene palpebral" (nível 3)
    NÃO invente nomes e NÃO force a classe ATB+corticoide se ela não estiver apoiada na fala.
    A ordem clínica no tratamento:
      tratamento: 1) Compressa morna  2) Higiene palpebral  3) Colírio da blefarite (nível 1/2/3)  4) Lubrificante  5) Ômega 3

- biomicroscopia: texto de biomicroscopia — preencher quando o médico descreve ao paciente um achado ocular de segmento anterior.
  ❌ NÃO preencher quando:
    • Exames normais sem patologia → usar injectExamesNormais=true (o sistema injeta o template padrão)
    • ÚNICO achado é blefarite/meibomite → usar injectBlefarite=true (o sistema usa template blefarite)
    • Nenhuma alteração foi descrita
  ✅ Preencher quando o médico descreve ao paciente QUALQUER alteração de segmento anterior:
    pterígio, pinguécula, conjuntivite, úlcera de córnea, ceratocone, nevo conjuntival, etc.
  ✅ Preencher também quando blefarite + outro achado de segmento anterior (gerar texto combinado)

  LATERALIDADE — regra crítica:
    • Identificar o olho afetado pelo que o médico diz na explicação ao paciente
    • Usar prefixo "OD" / "OE" / "AO" (ambos os olhos)
    • Se o médico não cita o olho explicitamente → usar "AO" como fallback seguro

  FORMATO OBRIGATÓRIO:
    "[OD/OE/AO]: [descrição do achado]; [elementos normais não afetados: córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente]"
    Se achado unilateral: incluir linha para o olho contralateral como "olho calmo"

  Exemplos:
    Pterígio OD: "OD: pterígio nasal grau I, sem invasão de eixo visual; córnea transparente nas demais regiões, câmara anterior formada, pupila regular e reagente, cristalino transparente\nOE: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
    Conjuntivite alérgica AO: "AO: hiperemia conjuntival difusa com secreção serosa, papilas tarsais; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
    Blefarite + pterígio OD: "OD: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; pterígio nasal grau I; córnea transparente nas demais regiões, câmara anterior formada, pupila regular e reagente, cristalino transparente\nOE: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

  ⚠️ SEMPRE incluir "cristalino transparente" no final de cada linha — o sistema substitui automaticamente por "catarata" ou "LIO" quando detectado na consulta.

- fundoscopia: texto de fundoscopia — preencher quando o médico descreve ao paciente um achado de segmento posterior.
  ❌ NÃO preencher quando: fundoscopia normal (coberta por injectExamesNormais=true) ou não realizada
  ✅ Preencher quando: nevo de coroide, retinopatia, alteração macular, escavação aumentada suspeita, membrana epirretiniana, descolamento de retina, hemorragia vítrea, etc.

  FORMATO: "FUNDOSCOPIA INDIRETA: [achado por olho + elementos normais não afetados]"
  Exemplos:
    "FUNDOSCOPIA INDIRETA: OD sem alterações / OE nevo de coroide inferotemporal, estável, sem sinais de atividade; mácula em bom aspecto, retina aplicada, padrão vascular normal, escavação simétrica e fisiológica"
    "FUNDOSCOPIA INDIRETA: AO sinais de retinopatia diabética leve (microaneurismas), sem edema macular aparente; retina aplicada, escavação simétrica e fisiológica"
    "FUNDOSCOPIA INDIRETA: AO escavação aumentada suspeita de glaucoma — aguardar campo visual e OCT de nervo óptico; mácula em bom aspecto, retina aplicada, padrão vascular normal"

══════════════════════════════════════════════════════════════
TESTE OBRIGATÓRIO — ANTES DE CADA LINHA
══════════════════════════════════════════════════════════════
Aplique os testes abaixo NA ORDEM:

1. "É um pedido de exame (OCT, campo visual, retinografia, topografia, curva de tensão…)?"
   → Se SIM → CONDUTA (sempre — exames são solicitações, não tratamento)

2. "É uma explicação de patologia ou diagnóstico para o paciente?"
   → Se SIM → CONDUTA

3. "É uma prescrição de óculos, retorno, encaminhamento ou suspensão de medicamento?"
   → Se SIM → CONDUTA

4. "É compressa morna, higiene palpebral, shampoo, lubrificante ocular ou ômega 3?"
   → Se SIM → TRATAMENTO (ação/substância aplicada pelo paciente — NUNCA em conduta)

5. "É um medicamento, colírio ou substância farmacológica com posologia?"
   → Se SIM → TRATAMENTO

Exemplos do teste:
  "Solicitar OCT"                                        → pedido de exame                → CONDUTA ✅
  "Solicitar campo visual"                               → pedido de exame                → CONDUTA ✅
  "Retorno 1 mês"                                        → decisão clínica                → CONDUTA ✅
  "Suspender Xalatan"                                    → decisão clínica                → CONDUTA ✅
  "Prescrição de óculos"                                 → decisão clínica                → CONDUTA ✅
  "Explicado catarata e necessidade de acompanhamento"   → explicação ao paciente         → CONDUTA ✅
  "Explicado relação da cefaleia com grau refrativo"     → explicação ao paciente         → CONDUTA ✅
  "Orientado evitar coçar os olhos e atento a sinais de alerta (dor, piora visual)" → orientação sequencial → CONDUTA ✅
  "Compressa morna 2x/dia"                               → ação física do paciente        → TRATAMENTO ✅
  "Higiene palpebral"                                    → ação física do paciente        → TRATAMENTO ✅
  "Vigadexa 4x/dia"                                      → medicamento nomeado            → TRATAMENTO ✅
  "Lubrificante ocular 6x"                               → substância farmacológica       → TRATAMENTO ✅
  "Ômega 3 1000mg 1cp/dia"                               → suplemento com dose            → TRATAMENTO ✅

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
    "conduta": "string com \\n entre itens, ou null",
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
    "conduta": "string com \\n entre itens, ou null",
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

