/**
 * GEMINI INTERVIEW AGENT v5.1
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  AGENTE 2 — GeminiInterviewAgent                                     │
 * │  Entrada: texto transcrito da consulta (Web Speech API)              │
 * │  Tarefa: interpretação médica — extrai anamnese, conduta, tratamento │
 * │  Caller: sidepanel-audio.js → window.GeminiService.analyzeConsult*  │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Depende de (carregados antes via sidepanel.html):
 *   - dist/Logger.js      → Logger
 *   - dist/ApiService.js  → apiService
 *   - dist/geminiService.js → _parseGeminiJSON (utilitário compartilhado)
 *
 * A fachada window.GeminiService é definida AQUI (ao final deste arquivo)
 * porque ela combina geminiExamAgent (Agente 1) + geminiInterviewAgent (Agente 2).
 */

// ============================================================================
// AGENTE 2 — GeminiInterviewAgent (Entrevista / Áudio)
// ============================================================================

const CONSULTATION_CONFIG = { maxOutputTokens: 16384 };

// --------------------------------------------------------------------------
// Padrões de gatilho de voz (exclusivos do agente de entrevista)
// --------------------------------------------------------------------------

const NORMAL_EXAM_TRIGGERS = [
  /seus exames est[ãa]o todos normais/i,
  /seus exames est[ãa]o normais/i,
  /seus exames est[ãa]o [oó]timos/i,
  /biomicroscopia e fundoscopia normais/i,
  /biomicroscopia normal/i,
  /fundoscopia normal/i,
  /fundo de olho normal/i,
  /fundo de olho sem altera[çc][õo]es/i,
  /biomicroscopia sem altera[çc][õo]es/i
];

const BLEFARITE_TRIGGERS = [
  // Diagnóstico direto
  /exame com blefarite/i,
  /biomicroscopia com blefarite/i,
  /blefaromeibomite/i,
  /blefarite/i,
  /meibomite/i,
  /disfun[çc][ãa]o.*meibom/i,
  /gl[âa]ndulas? de meibom/i,

  // Sinais clínicos
  /p[áa]lpebra inflamada/i,
  /inflama[çc][ãa]o da p[áa]lpebra/i,
  /comprometimento na lubrifica[çc][ãa]o/i,
  /margem palpebral.*espessa/i,
  /secre[çc][ãa]o.*espessa/i,
  /olho seco/i,

  // Tratamentos típicos de blefarite — com shampoo explícito
  /lavar.*shampoo/i,
  /shampoo.*neutro/i,
  /shampoo.*johnson/i,
  /shampoo.*beb[êe]/i,
  /compressa.*quente/i,
  /compressa.*morna/i,
  /higiene.*palpebral/i,
  /higiene.*p[áa]lpebra/i,
  /limpar.*p[áa]lpebra/i,
  /massagem.*p[áa]lpebra/i,

  // Higiene da região dos cílios — SEM "shampoo" (fala natural do médico)
  // Ex: "enxagua bem aqui na região dos cílios de manhã, na hora do almoço, à noite"
  /regi[ãa]o dos c[íi]lios/i,
  /base dos c[íi]lios/i,
  /bordo palpebral/i,
  /enxagu[ae].*c[íi]lios/i,
  /c[íi]lios.*enxagu/i,
  /lavar.*c[íi]lios/i,
  /lava.*c[íi]lios/i,
  /c[íi]lios.*lavar/i,
  /limpar.*c[íi]lios/i,
  /limpeza.*c[íi]lios/i,
  /higiene.*c[íi]lios/i,
  /limpeza da margem palpebral/i,
  /lavar a margem/i,
];

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

    const hasNormalExams = NORMAL_EXAM_TRIGGERS.some(r => r.test(text));
    const hasBlefarite   = BLEFARITE_TRIGGERS.some(r => r.test(text));

    if (hasNormalExams) this.logger.info('Gatilho de exames normais detectado');
    if (hasBlefarite)   this.logger.info('Gatilho de blefarite detectado');

    return { hasNormalExams, hasBlefarite };
  }

  // --------------------------------------------------------------------------
  // Análise principal da consulta
  // --------------------------------------------------------------------------

  async analyzeConsultation(transcribedText) {
    this.logger.info('Iniciando análise de consulta');

    const { hasNormalExams, hasBlefarite } = this.detectExamTriggers(transcribedText);
    const prompt = this._buildConsultationPrompt(transcribedText, hasNormalExams, hasBlefarite);

    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`[ANÁLISE] Tentativa ${attempt}/${maxRetries}`);

        const { text: rawText } = await apiService.callGeminiAPI(
          [{ text: prompt }],
          CONSULTATION_CONFIG
        );

        const result = _parseGeminiJSON(rawText, 'consulta');

        // ── Guard 1: injectBlefarite ──────────────────────────────────────────
        // A IA frequentemente infere blefarite por tratamento (shampoo infantil,
        // higiene palpebral) sem a palavra aparecer na transcrição. Reverte.
        if (result.injectBlefarite === true && !/blefarite|meibomite/i.test(transcribedText)) {
          result.injectBlefarite = false;
          this.logger.warn('[Guard] injectBlefarite revertido — palavra-chave ausente na transcrição');
        }

        // ── Guard 2: Associação (ATB + corticoide) ────────────────────────────
        // Remove linha de "Associação" do tratamento se não há menção explícita
        // de antibiótico/corticoide na transcrição.
        if (result.dados?.tratamento &&
            /associa[çc][ãa]o.*atb|atb.*corticoide/i.test(result.dados.tratamento) &&
            !/antibi[oó]tico|corticoide|tobramicin|dexametason/i.test(transcribedText)) {
          result.dados.tratamento = result.dados.tratamento
            .split('\n')
            .filter(line => !/associa[çc][ãa]o/i.test(line))
            .join('\n')
            .trim() || null;
          this.logger.warn('[Guard] Linha "Associação" removida do tratamento — não mencionada na transcrição');
        }

        // ── Guard 3: "Não houve prescrição de óculos" ─────────────────────────
        // Garante que conduta sempre contenha indicação sobre óculos.
        if (result.dados?.conduta &&
            !/prescri[çc][ãa]o de [oó]culos|manuten[çc][ãa]o do [oó]culos/i.test(result.dados.conduta)) {
          result.dados.conduta = result.dados.conduta.trimEnd() + '\nNão houve prescrição de óculos';
          this.logger.info('[Guard] "Não houve prescrição de óculos" adicionado à conduta');
        }

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

    if (!result.dados.conduta) return;

    // Padrão: detecta posologia farmacológica com unidade de dose EXPLÍCITA
    // FIX: regex mais restrita — evita falso positivo com "Retorno 6 meses", "Retorno 1 ano"
    const MED_POSOLOGIA_RE = /\b\w[\w\s]{1,30}?\b\s*(?:\d+\s*(?:gota[s]?|mg|mcg|ml|UI|comp(?:rimido)?|cp)\b|\d+\s*x\s*[\/\s]?\s*(?:dia|semana|noite|manha|manhã)|\d+\/\d+\s*h|\b(?:4x|6x|8x|12x|2x|3x|1x)\/dia)/i;

    // FIX: lista branca de padrões que são inequivocamente conduta médica
    // Verificada ANTES da regex de posologia para evitar falso positivo
    const CONDUTA_VALIDA_RE = /^(?:retorno\b|encaminhamento|solicitar|prescrição de óculos|prescricao de oculos|manutenção do óculos|manutencao do oculos|não houve prescrição|nao houve prescricao|sem prescrição de óculos|sem prescricao de oculos|suspender\b|manter\b|alta\b|observ|acompanhar|acompanhamento|revisar|avaliação|avaliacao|campo visual|tonometria|orientação|orientacao)/i;

    const condutaLinhas = result.dados.conduta.split(/\n/);
    const ficamNaConduta   = [];
    const vaoParaTratamento = [];

    // Procedimentos físicos: ficam em conduta mesmo que tenham frequência
    const PROCEDIMENTO_FISICO_RE = /^(compressa|massagem|higiene|shampoo|lavagem|oclusão|oclusao|tampão|tampao|exerc|oclus)/i;

    for (const linha of condutaLinhas) {
      const trimmed = linha.trim();
      if (!trimmed) continue;

      // FIX: verificar lista branca de conduta válida PRIMEIRO
      if (CONDUTA_VALIDA_RE.test(trimmed)) {
        ficamNaConduta.push(trimmed);
        continue;
      }

      // Procedimentos físicos ficam em conduta — não são medicamentos
      if (PROCEDIMENTO_FISICO_RE.test(trimmed)) {
        ficamNaConduta.push(trimmed);
        continue;
      }

      if (MED_POSOLOGIA_RE.test(trimmed)) {
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
  }

  // --------------------------------------------------------------------------
  // Validação semântica dos dados de consulta
  // --------------------------------------------------------------------------

  _validateConsultationData(data) {
    const errors = [];

    if (!data?.tipo_consulta) {
      return { isValid: false, errors: ['Campo tipo_consulta ausente'] };
    }

    if (!['primeira_consulta', 'retorno', 'conclusao'].includes(data.tipo_consulta)) {
      errors.push('tipo_consulta inválido');
    }

    if (!data.dados) {
      return { isValid: false, errors: ['Objeto dados ausente'] };
    }

    if (data.tipo_consulta === 'primeira_consulta') {
      if (!data.dados.hda || data.dados.hda.trim().length < 10) {
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

  _buildConsultationPrompt(transcribedText, hasNormalExams, hasBlefarite) {
    return `
Você é um assistente especialista em oftalmologia.
Tarefa: extrair dados ESTRUTURADOS de uma transcrição de consulta médica.

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

═══════════════════════════════════════════════════════════════
REGRA DE FONTES
═══════════════════════════════════════════════════════════════
- ANAMNESE (hda, retorno, antecedentes_*, alteracoes_sistemicas): extrair do que o PACIENTE relata
- medicacoes_em_uso: extrair tanto do que o PACIENTE relata quanto do que o MÉDICO menciona
  ao revisar o prontuário ou confirmar uso ("você está com Xalatan, Combigan..." → capture tudo)
- CONDUTA MÉDICA (diagnostico, conduta, tratamento): extrair do que o MÉDICO diz/prescreve

${MED_KNOWLEDGE_BASE}

CLASSIFICAÇÃO

▶ RETORNO — use quando qualquer um dos critérios abaixo for atendido:
  a) Evidência EXPLÍCITA de vínculo com este serviço:
     - "da última vez que veio aqui", "o exame que eu pedi", "já sou paciente seu", "vim no retorno"
     - Médico menciona exame ou decisão que ELE MESMO tomou anteriormente aqui
  b) Consulta focada e sem anamnese sistemática completa:
     - Médico aborda apenas queixa atual / sintoma novo isolado — sem levantar antecedentes + família + sistêmicas do zero
     - Revisão de resultado de exame + atualização de prescrição sem história completa
     - Consulta curta voltada a problema pontual (acidente ocular, irritação, dúvida)

▶ PRIMEIRA CONSULTA — use quando houver coleta de antecedentes:
  - Médico pergunta antecedentes pessoais (doenças sistêmicas, cirurgias, medicações em uso) OU
  - Médico pergunta antecedentes familiares (glaucoma na família, diabetes familiar, etc.)
  - Esses campos só são coletados na primeira vez — retornos não repetem esse levantamento

▶ CONCLUSAO:
  - Apenas leitura de resultado de exame + conduta final, sem anamnese

⚠️ ERROS COMUNS:
  ❌ Médico pergunta sobre queixa atual → sozinho NÃO é sinal de primeira_consulta
  ❌ Paciente já consultou em outro local → não significa que nunca veio aqui → pode ser retorno
  ❌ Consulta curta e focada sem levantamento sistemático → NÃO é primeira_consulta → é retorno
  ❌ Qualquer dúvida quando não houve anamnese sistemática completa → retorno


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
  * Captura o que o paciente relata: sintomas, dificuldades, progressos desde a última consulta
  * ⚠️ OBRIGATÓRIO: use linguagem clínica FORMAL e objetiva — NUNCA transcreva a fala coloquial
    ❌ ERRADO (coloquial): "tá difícil pra perto", "não tô conseguindo ler", "melhorou um pouquinho"
    ✅ CORRETO (clínico): "Baixa de visão para perto", "Dificuldade de leitura", "Melhora parcial dos sintomas"
  * Estrutura: queixa principal + tempo/progressão quando mencionado
  * Ex: "Dificuldade visual para perto com óculos multifocais. Irritação ocular persistente."
  * Ex: "Baixa de visão para longe progressiva há 3 meses."
  * Ex: "Retorno para avaliação pós-operatória. Sem queixas."
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
    Ex: "Xalatan 1 gota OE à noite", "Combigan 2x/dia", "Carmelose 3x/dia"
  * Se o nome não foi mencionado, registre apenas o tipo genérico: "Colírio", "Lubrificante ocular"
    ❌ PROIBIDO: "Colírio [não especificado]", "Lubrificante [desconhecido]", qualquer construção com [ ]
    ✅ CORRETO: "Colírio", "Lubrificante ocular", "Pomada ocular"
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
- alteracoes_sistemicas: doenças sistêmicas do paciente + medicamentos sistêmicos em uso
  * Doenças: DM, HAS, hipotireoidismo, cardiopatia, etc.
  * Medicamentos sistêmicos: insulina, metformina, losartan, AAS, anticoagulantes, corticóides orais, etc.
  * Formato sugerido: "DM em uso de insulina e metformina, HAS em uso de losartan"
  * Se nega doenças E nega medicamentos sistêmicos → "Nega comorbidades"
  * Se tem doença mas não mencionou medicamento sistêmico → registre só a doença
- antecedentes_familiares: doenças familiares oculares com relevância hereditária (glaucoma, degeneração macular, retinose pigmentar, estrabismo, etc.)
  ❌ NÃO registrar: catarata — é doença degenerativa/senil sem valor hereditário significativo; se for a única queixa familiar, retornar null
- diagnostico: diagnósticos que o MÉDICO identifica/comunica
- conduta: estas categorias — seja conciso, prefira frases curtas
  ✅ Retorno com prazo:      "Retorno X meses/ano"
  ✅ Encaminhamentos:        "Encaminhamento: [especialidade ou procedimento]"
  ✅ Prescrição de óculos/lentes: "Prescrição de óculos [tipo]"
     → tipo obrigatório quando informado: "multifocal", "para perto", "para longe", "para longe e perto"
     → Se o médico mencionar somente óculos para perto → "Prescrição de óculos para perto"
     → Se multifocal → "Prescrição de óculos multifocal"
     ❌ PROIBIDO: "Atualização de prescrição", "Atualizado o grau", "Atualizar óculos"
        → SEMPRE usar "Prescrição de óculos [tipo]", independentemente do termo usado pelo médico
  ✅ Manutenção do óculos anterior: quando médico decide MANTER o grau atual sem prescrever novo
     → usar "Manutenção do óculos anterior"
     → Gatilhos: "pode continuar com o mesmo óculos", "grau não mudou, mantém", "óculos atual ainda está bom",
       "grau não precisa mudar", "não precisa trocar o óculos", "segue com o óculos"
     → CONTEXTO: paciente já usa óculos + médico decide não alterar → SEMPRE "Manutenção do óculos anterior"
  ✅ Não houve prescrição de óculos: usar em TODOS os casos onde não há prescrição óptica nova
     → frase padrão: "Não houve prescrição de óculos"
     → Quando usar: médico disse que não é necessário, consulta sem avaliação de refração,
       óculos simplesmente não foi discutido (blefarite, pós-op, seguimento clínico, etc.)
     → REGRA: se a conduta NÃO contiver "Prescrição de óculos" nem "Manutenção do óculos anterior",
       SEMPRE adicionar "Não houve prescrição de óculos" como última linha da conduta
  ⚠️ DISTINÇÃO OBRIGATÓRIA — TESTE:
     Paciente tem/usa óculos atual + médico disse que grau não muda → "Manutenção do óculos anterior"
     Qualquer outro caso sem prescrição óptica nova                 → "Não houve prescrição de óculos"
     ❌ ERRO COMUM: usar "Manutenção" quando óculos não foi discutido. Só usar "Manutenção" quando
        o médico EXPLICITAMENTE confirma que o óculos atual continua válido.
  ✅ Suspensão de medicamento:   "Suspender [nome]"
  ✅ Exames solicitados:         "Solicitar campo visual", "Fundo com dilatação"
  ✅ Orientações sobre TRATAMENTO: instrução clínica do médico sobre como usar o tratamento
     Ex: "Orientação: usar colírio antes de dormir", "Orientação: não interromper o uso",
         "Orientação: aguardar 5 min entre colírios"
  ✅ Orientações sobre EVOLUÇÃO: instrução do médico sobre o curso esperado da doença ou quando retornar
     Ex: "Orientação: melhora esperada em 7 dias", "Orientação: retornar se dor ou piora da visão",
         "Orientação: pressão pode variar — manter colírio"
  ✅ Orientações gerais ao paciente: qualquer conselho clínico, educacional ou preventivo que o médico
     dá ao paciente ao longo ou ao final da consulta. Usar prefixo "Orientação:" e resumir brevemente.
     Exemplos de orientações gerais que DEVEM ser capturadas:
       - Cuidados com o olho:     "Orientação: não coçar o olho"
                                  "Orientação: não esfregar pálpebras"
                                  "Orientação: não expor ao sol sem proteção"
       - Sobre uso de óculos:     "Orientação: usar óculos de sol fotocromático"
                                  "Orientação: tempo de adaptação ao multifocal é de semanas"
       - Sobre evolução natural:  "Orientação: grau tende a estabilizar após os 40 anos"
                                  "Orientação: presbiopia é processo natural da idade"
                                  "Orientação: catarata incipiente — acompanhar anualmente"
                                  "Orientação: catarata moderada — progressão esperada; óculos compensam parcialmente"
                                  "Orientação: catarata avançada — cirurgia indicada quando comprometer qualidade de vida"
                                  "Orientação: blefarite — condição crônica; higiene palpebral contínua reduz recidivas"
       - Tranquilização clínica:  "Orientação: pressão ocular normal — não há risco de glaucoma no momento"
                                  "Orientação: fundo de olho sem alterações — acompanhamento de rotina"
                                  "Orientação: pterígio pequeno — não requer cirurgia agora"
       - Estilo de vida/saúde:    "Orientação: Ômega 3 e dieta rica em antioxidantes beneficiam olho seco"
                                  "Orientação: hidratação adequada auxilia sintomas de olho seco"
       - Sobre lentes/qualidade:  "Orientação: qualidade da lente do multifocal impacta adaptação"
       - Sobre a condição diagnosticada (OBRIGATÓRIO quando médico explica ao paciente):
                                  "Orientação: pinguecula — proliferação benigna da conjuntiva; não invade córnea"
                                  "Orientação: pterígio — crescimento que pode avançar; monitorar progressão"
                                  "Orientação: olho seco — uso frequente de lubrificante ao longo do dia"
                                  "Orientação: catarata moderada — progressão esperada; óculos compensam parcialmente"
                                  "Orientação: presbiopia — processo natural da idade; óculos corrigem"
     ⚠️ REGRA OBRIGATÓRIA: Sempre que o médico EXPLICAR ao paciente o que é a condição
        diagnosticada, como ela se comporta ou o que esperar → capturar em "Orientação:".
        Nunca omitir essa explicação clínica da conduta.
     Regra de síntese: uma orientação por tópico, de forma objetiva. Se o médico falou muito sobre
     um tema, resuma em 1 frase concisa com prefixo "Orientação:".

  FILTROS DE DESCARTE — nunca incluir em conduta:
  * ❌ Logística/operacional da clínica: "retirar exames", "buscar exames", "pagar na recepção",
    "agendar no balcão", "entregar receita" → ação do paciente/clínica, não médica
  * ❌ Logística pós-consulta de óculos: "Conferir óculos após prontos", "Retirar óculos na ótica",
    "Buscar óculos quando ficar pronto" → logística do paciente, não decisão médica
    ✅ ÚNICA entrada de óculos: "Prescrição de óculos [tipo]" + orientação clínica sobre uso (ex: tempo de adaptação)
  * ❌ Retornos condicionais vagos: "retorno se dificuldade", "retorno se não adaptar",
    "retorno se piorar", "retorno se necessário"
    → Se já há retorno com prazo definido → descartar todos os condicionais
    → Se NÃO há retorno com prazo → manter apenas UM condicional, o mais específico
  * ❌ Redundâncias: nunca repetir a mesma conduta com palavras diferentes
  * ❌ PROIBIDO: "declaração de comparecimento"
  * ❌ PROIBIDO: compressas, higiene palpebral, lubrificantes, Ômega 3 → vão em TRATAMENTO

- tratamento: tudo que o paciente aplica, ingere ou realiza no próprio corpo
  ✅ Colírios e pomadas (novos ou em continuidade) com posologia
  ✅ Medicamentos orais com posologia
  ✅ Compressa morna — SEMPRE em tratamento, NUNCA em conduta
  ✅ Higiene palpebral com shampoo — SEMPRE em tratamento, NUNCA em conduta
  ✅ Lubrificantes oculares com posologia
  ✅ Ômega 3 e suplementos com posologia
  * Exemplos CORRETOS: "Vigadexa 1 gota 4x/dia por 7 dias", "Xalatan 1 gota OE à noite",
    "Compressa morna 2 min — 2x/dia", "Higiene palpebral com shampoo infantil — 3x/dia",
    "Lubrificante ocular 1 gota 6x/dia", "Ômega 3 1000mg — 1cp almoço e 1cp jantar"
  * Se o nome do medicamento não foi dito, registre o tipo genérico sem colchetes:
    ❌ PROIBIDO: "Colírio [não especificado]", "Associação [posologia]", qualquer [ ]
    ✅ CORRETO: "Colírio", "Lubrificante ocular", "Associação (ATB + corticoide ocular) 1 gota 3x/dia"
  * Se nenhum tratamento foi prescrito → "Nenhum tratamento prescrito"

  EXEMPLOS PARA BLEFARITE (use como referência de separação):

    Cenário A — médico mencionou EXPLICITAMENTE antibiótico/anti-inflamatório/colírio específico
                (ex: "vou passar um colírio de inflamação", "antibiótico", "colírio amarelo"):
      conduta:    "Retorno 6 meses"  |  "Encaminhamento: Dermatologista"
      tratamento: "Compressa morna 2 min antes da higiene — 2x/dia"
                  "Higiene palpebral com shampoo infantil (espuma na base dos cílios, ~20x, enxaguar) — 3x/dia"
                  "Associação (ATB + corticoide ocular) 1 gota 3x/dia após higiene palpebral"
                  "Lubrificante ocular 1 gota em cada olho ao longo do dia"
                  "Ômega 3 1000mg (EPA+DHA) — 1cp almoço e 1cp jantar por 30 dias"

    Cenário B — médico prescreveu APENAS suporte (compressa, higiene, lubrificante, Ômega 3),
                SEM mencionar antibiótico/anti-inflamatório/colírio específico:
      conduta:    "Retorno 6 meses"
      tratamento: "Compressa morna 2 min antes da higiene — 2x/dia"
                  "Higiene palpebral com shampoo infantil — 3x/dia"
                  "Lubrificante ocular 1 gota em cada olho ao longo do dia"
                  "Ômega 3 1000mg (EPA+DHA) — 1cp almoço e 1cp jantar por 30 dias"
      ⚠️ SEM linha de Associação — médico NÃO prescreveu antibiótico.

  ★ REGRA DA ASSOCIAÇÃO (ATB + corticoide) — CRÍTICA ANTI-ALUCINAÇÃO:
    O DEFAULT é NÃO incluir a Associação. Ela só entra quando há GATILHO VERBAL EXPLÍCITO do médico.

    ✅ INCLUIR APENAS quando a transcrição contém uma destas palavras-chave ditas pelo MÉDICO:
       "antibiótico", "colírio antibiótico", "anti-inflamatório", "colírio de inflamação",
       "associação", "colírio combinado", "colírio amarelo", "colírio forte",
       "colírio com corticoide", ou nome de marca (Tobrex, Maxitrol, Vigadexa, Tobradex, etc.)

    ❌ NÃO INCLUIR em NENHUMA destas situações:
       - Médico prescreveu apenas compressa morna + higiene palpebral
       - Médico prescreveu compressa + higiene + lubrificante (ou lágrima)
       - Médico prescreveu compressa + higiene + Ômega 3
       - Você está tentado a incluir "porque é o protocolo padrão de blefarite"
       - injectBlefarite=true sozinho NÃO é gatilho — exige a palavra-chave verbal acima

    ⚠️ É PROIBIDO inferir Associação como "protocolo default" para injectBlefarite=true.
       Inventar antibiótico é alucinação clínica grave. Quando em dúvida → NÃO incluir.

    Quando incluir, no _raciocinio cite o trecho EXATO da transcrição que justifica
    (ex: "incluí Associação porque médico disse: 'vou passar antibiótico'").
    Sem citação direta de trecho → NÃO incluir.

══════════════════════════════════════════════════════════════
TESTE OBRIGATÓRIO — ANTES DE CADA LINHA DE CONDUTA
══════════════════════════════════════════════════════════════
"O paciente precisa fazer algo físico com o corpo para executar esta instrução?"
  → Se SIM → vai para TRATAMENTO (compressa, higiene, colírio, etc.)
  → Se NÃO (decisão administrativa/clínica ou orientação clínica) → vai para CONDUTA

Exemplos do teste:
  "Compressa morna 2x/dia"       → paciente faz algo físico → TRATAMENTO ❌ conduta
  "Higiene palpebral"             → paciente faz algo físico → TRATAMENTO ❌ conduta
  "Vigadexa 4x/dia"               → paciente aplica colírio  → TRATAMENTO ❌ conduta
  "Retorno 1 mês"                 → decisão clínica          → CONDUTA ✅
  "Suspender Xalatan"             → decisão clínica          → CONDUTA ✅
  "Prescrição de óculos"          → decisão clínica          → CONDUTA ✅
  "Orientação: não interromper uso"              → instrução sobre tratamento → CONDUTA ✅
  "Orientação: retornar se piorar"               → instrução sobre evolução   → CONDUTA ✅
  "Orientação: não coçar o olho"                 → conselho clínico geral     → CONDUTA ✅
  "Orientação: pressão ocular normal"            → tranquilização clínica     → CONDUTA ✅
  "Orientação: grau tende a estabilizar"         → educação sobre evolução    → CONDUTA ✅
  "Orientação: usar óculos de sol"               → prevenção ocular           → CONDUTA ✅
  "Retirar óculos na ótica" / "buscar exames"    → logística administrativa   → ❌ DESCARTAR

FLAGS DE INJEÇÃO:
- injectExamesNormais: true SOMENTE se o médico afirma que TODOS os exames estão normais,
  sem exceção. Exemplos corretos: "exames normais", "fundo de olho normal", "biomicroscopia normal",
  "tudo em paz com o olho", "olho tranquilo", "beleza nos exames".
  ❌ ERRADO marcar true quando: "os outros exames estão tranquilos" (há exceção),
  "tirando X tudo normal" (há alteração), "exame de pressão normal" (só um exame),
  paciente tem diagnóstico ESTRUTURAL ativo (cicatriz corneal, glaucoma, retinopatia, etc.).
  ✅ CORRETO marcar true mesmo quando há diagnóstico REFRATIVO (presbiopia, miopia,
  astigmatismo, hipermetropia) — esses NÃO afetam biomicroscopia nem fundoscopia.
  Regra: se há QUALQUER alteração estrutural ocular conhecida → false.
  Diagnósticos refrativos isolados NÃO bloqueiam esta flag.
- injectBlefarite: REGRA ABSOLUTA — só pode ser true se a palavra "blefarite" OU "meibomite"
  aparecer LITERALMENTE na transcrição. Sem essas palavras → false. PONTO FINAL.
  ════════════════════════════════════════════════════════════════
  ❌ INFERÊNCIA DE DIAGNÓSTICO POR TRATAMENTO É PROIBIDA:
     "shampoo infantil", "higiene palpebral", "compressa morna", "lavar pálpebras",
     "higiene dos cílios" → NUNCA implicam blefarite. NUNCA. São prescritos para
     qualquer irritação, coceira, olho seco, fadiga visual ou higiene preventiva.
  ❌ O raciocínio "prescreveu shampoo → típico para blefarite → injectBlefarite=true"
     É UMA ALUCINAÇÃO CLÍNICA GRAVE. Não fazer isso jamais.
  ════════════════════════════════════════════════════════════════
  Gatilhos válidos (exigem a palavra literal na transcrição):
  * "blefarite", "blefaromeibomite", "disfunção de glândulas de meibômio", "meibomite"
  ⚠️ NÃO marcar true para: pinguecula, pterígio, conjuntivite, olho seco isolado, coceira ocular.
     Esses têm tratamento similar (compressa, shampoo) mas biomicroscopia DIFERENTE da blefarite.
     A biomicroscopia padrão de blefarite descreve "hiperemia e espessamento da MARGEM PALPEBRAL,
     telangiectasias e disfunção de glândulas de meibômio" — inapropriada para outras condições.
     Para pinguecula/pterígio/outras alterações → use o campo "biomicroscopia" abaixo.
- dilatacaoDetectada: true se médico menciona dilatar pupila ou usar colírio de dilatação

BIOMICROSCOPIA E FUNDOSCOPIA PERSONALIZADAS:
Quando há achado estrutural ocular que o médico descreve (ex: pinguecula, pterígio, cicatriz
corneal, flictenula, ulcera) e injectBlefarite=false e injectExamesNormais=false:
→ Gerar "biomicroscopia" com termos técnicos no formato:
   "AO: [achado técnico]; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
   Exemplos:
   Pinguecula: "AO: pinguecula nasal bilateral; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
   Pterígio:   "AO: pterígio nasal [OD/OE/bilateral] [grau se mencionado]; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
   Se o médico mencionar a localização (nasal, temporal, bilateral) → incluir.
   Se não houver achado biomicroscópico relevante → null (o sistema usa template padrão).
→ Gerar "fundoscopia" com termos técnicos quando o médico descrever FUNDO DE OLHO com alteração:
   "FUNDOSCOPIA INDIRETA: AO [achado técnico]"
   Se fundo de olho normal → null (o sistema usa template padrão quando necessário).

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
    "tratamento": "string com \\n entre itens, ou null se nenhum tratamento foi prescrito",
    "biomicroscopia": "string técnica ou null (gerar apenas quando há achado estrutural não coberto pelo template de blefarite; null = usar template padrão)",
    "fundoscopia": "string técnica ou null (gerar apenas quando há achado no fundo de olho; null = não injetar ou usar padrão)"
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
    "tratamento": "string com \\n entre itens, ou null se nenhum tratamento foi prescrito",
    "biomicroscopia": "string técnica ou null",
    "fundoscopia": "string técnica ou null"
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


// ============================================================================
// FACHADA — window.GeminiService (compatibilidade total com código existente)
// ============================================================================
//
// sidepanel-camera.js usa: extractExams, extractExamsTwoPass, validateExamData
// sidepanel-audio.js usa:  analyzeConsultation, detectExamTriggers
// config.js usa:           getAPIKey, setAPIKey
// Logger exposto para uso externo.
//
// Nenhum arquivo de chamada precisa ser alterado.

window.GeminiService = {
  // ── Agente de Exames ──
  extractExams:       (images, cb) => geminiExamAgent.extractExams(images, cb),
  extractExamsTwoPass:(images, cb) => geminiExamAgent.extractExamsTwoPass(images, cb),
  validateExamData:   (data)       => geminiExamAgent.validateExamData(data),

  // ── Agente de Entrevista ──
  analyzeConsultation: (text) => geminiInterviewAgent.analyzeConsultation(text),
  detectExamTriggers:  (text) => geminiInterviewAgent.detectExamTriggers(text),

  // ── API / Config ──
  getAPIKey: () => apiService.getApiKey(),
  setAPIKey: (key) => apiService.saveApiKey(key),

  // ── Utilitários ──
  Logger: Logger,
};
