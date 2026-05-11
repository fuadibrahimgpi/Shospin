/**
 * GEMINI SERVICE v5.1 — Agente de Exames (OCR)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  AGENTE 1 — GeminiExamAgent                                         │
 * │  Entrada: imagens de ticket TOPCON                                   │
 * │  Tarefa: OCR puro — extrai refração, tonometria, paquimetria         │
 * │  Caller: sidepanel-camera.js → window.GeminiService.extractExams*   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * O Agente 2 (Entrevista/Áudio) está consolidado neste mesmo arquivo (a partir
 * da seção "AGENTE 2 — GeminiInterviewAgent"). A fachada window.GeminiService
 * está definida no final deste arquivo. (v5.1: o standalone antigo foi
 * arquivado em _archive/geminiInterviewAgent.standalone.archived.js.)
 */

// ============================================================================
// SHARED — Utilitários comuns aos dois agentes
// ============================================================================

/**
 * Parseia a resposta JSON do Gemini, tolerando markdown e caracteres de controle.
 * Usado por ambos os agentes.
 */
function _parseGeminiJSON(rawText, context) {
  let jsonText = rawText;
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    const logger = new Logger('ParseJSON');
    logger.error(`Erro ao parsear JSON (${context})`, err);

    try {
      const cleaned = jsonText
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      return JSON.parse(cleaned);
    } catch {
      throw new Error('Resposta da IA não está em formato JSON válido');
    }
  }
}


// ============================================================================
// AGENTE 1 — GeminiExamAgent (OCR / Câmera)
// ============================================================================

const PASS1_CONFIG       = { maxOutputTokens: 16384 };
const PASS1_RETRY_CONFIG = { maxOutputTokens: 32768 };
const PASS2_CONFIG       = { maxOutputTokens: 8192, thinkingBudget: 0 };
const SINGLE_PASS_CONFIG = { maxOutputTokens: 16384 };

class GeminiExamAgent {
  constructor() {
    this.logger = new Logger('GeminiExamAgent');
  }

  // --------------------------------------------------------------------------
  // Pré-processamento de imagem
  // --------------------------------------------------------------------------

  /**
   * Pré-processa imagem para melhorar qualidade do OCR.
   * - Aumenta contraste
   * - Converte para escala de cinza para melhor leitura de texto
   */
  async _preprocessImage(base64Image) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // SEM upscaling — escalar para cima não adiciona informação e causa
        // blur por interpolação bilinear + dupla compressão JPEG.
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Fórmula de contraste padrão (c = 60 → fator ≈ 1.6).
        // Operação: newGray = factor * (gray - 128) + 128
        // Aumenta separação entre texto escuro e fundo claro sem distorcer.
        const C = 60;
        const factor = (259 * (C + 255)) / (255 * (259 - C)); // ≈ 1.608

        for (let i = 0; i < data.length; i += 4) {
          // Conversão para escala de cinza (pesos perceptuais ITU-R BT.601)
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          // Contraste uniforme — sem ajuste adicional por faixa de valor
          const newGray = Math.max(0, Math.min(255, factor * (gray - 128) + 128));
          data[i] = newGray;
          data[i + 1] = newGray;
          data[i + 2] = newGray;
        }

        ctx.putImageData(imageData, 0, 0);
        // Qualidade 0.95: preserva bordas de caracteres (a imagem já passou por uma compressão)
        const processedBase64 = canvas.toDataURL('image/jpeg', 0.95);
        resolve(processedBase64.replace(/^data:image\/\w+;base64,/, ''));
      };

      img.onerror = () => {
        this.logger.warn('Falha no pré-processamento, usando imagem original');
        resolve(base64Image.replace(/^data:image\/\w+;base64,/, ''));
      };

      img.src = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  // --------------------------------------------------------------------------
  // Rotação 180° (correção de ticket invertido / fotografado pelo verso)
  // --------------------------------------------------------------------------

  /**
   * Rotaciona a imagem 180° via canvas.
   * Usado quando o Pass 1 detecta [TICKET INVERTIDO 180°] — ticket grampeado
   * ao prontuário e fotografado pelo verso, aparecendo de cabeça para baixo.
   */
  async _rotateImage180(base64Image) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI); // 180°
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
      };
      img.onerror = () => {
        this.logger.warn('[Rotate180] Falha — usando imagem original');
        resolve(base64Image);
      };
      img.src = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  // --------------------------------------------------------------------------
  // Extração — Single Pass
  // --------------------------------------------------------------------------

  async extractExams(imagesBase64, onProgress) {
    const images = Array.isArray(imagesBase64) ? imagesBase64 : [imagesBase64];
    this.logger.info(`[SINGLE-PASS] Analisando ${images.length} imagem(ns)`);

    // Pré-processar imagens para melhorar qualidade
    this.logger.info('[SINGLE-PASS] Pré-processando imagens...');
    const processedImages = await Promise.all(
      images.map(img => this._preprocessImage(img))
    );

    const imageParts = processedImages.map(base64Data => {
      return { inlineData: { mimeType: 'image/jpeg', data: base64Data } };
    });

    const parts = [{ text: this._getExamSinglePassPrompt() }, ...imageParts];
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`[SINGLE-PASS] Tentativa ${attempt}/${maxRetries}`);
        if (onProgress) onProgress('reading');

        const { text: rawExtraction } = await apiService.callGeminiAPI(parts, SINGLE_PASS_CONFIG);

        const result = _parseGeminiJSON(rawExtraction, 'exames');

        // Log diagnóstico — mostra o que o OCR retornou para cada campo
        this.logger.info('[SINGLE-PASS] OCR bruto:\n' + JSON.stringify({
          debug: result.debug_leitura,
          refracao: result.refracao,
          tonometria: result.tonometria,
          paquimetria: result.paquimetria
        }, null, 2));

        const validation = this.validateExamData(result);

        // Se refração veio sem ESF (modelo leu só SE ou nada), vale retry.
        // Caso típico: modelo leu a sub-linha "S.E. +0.75" como "linha final",
        // ignorando a sub-linha com SPH/CYL/AX que vem logo acima.
        const esfOdAusente = result.refracao?.od?.esf == null;
        const esfOeAusente = result.refracao?.oe?.esf == null;
        const refracaoSemEsf = !result.refracao || (esfOdAusente && esfOeAusente);
        const temOutrosDados = result.tonometria?.od != null || result.paquimetria?.od != null;
        if (refracaoSemEsf && temOutrosDados && attempt < maxRetries) {
          this.logger.warn('[SINGLE-PASS] Refração sem ESF/CYL/AX — retentando (tentativa ' + attempt + ')...');
          continue;
        }

        if (validation.isValid) {
          this.logger.success(`[SINGLE-PASS] Dados validados na tentativa ${attempt}`);
          return result;
        }

        if (!validation.shouldRetry) {
          result._validationWarnings = validation.warnings;
          return result;
        }

        if (attempt < maxRetries) {
          this.logger.warn(`[SINGLE-PASS] Validação falhou: ${validation.warnings.join(', ')}`);
        } else {
          result._validationWarnings = validation.warnings;
          result._blockAutoInject = true;
          return result;
        }

      } catch (err) {
        if (attempt < maxRetries) {
          this.logger.warn(`[SINGLE-PASS] Erro na tentativa ${attempt}, retentando`);
        } else {
          throw err;
        }
      }
    }

    throw new Error('Falha na extração após todas as tentativas');
  }

  // --------------------------------------------------------------------------
  // Extração — Two Pass (Pass 1: transcrição literal | Pass 2: extração)
  // --------------------------------------------------------------------------

  async extractExamsTwoPass(imagesBase64, onProgress) {
    const images = Array.isArray(imagesBase64) ? imagesBase64 : [imagesBase64];
    this.logger.info(`[TWO-PASS] Analisando ${images.length} imagem(ns)`);

    // Pré-processar imagens para melhorar qualidade
    this.logger.info('[TWO-PASS] Pré-processando imagens...');
    const processedImages = await Promise.all(
      images.map(img => this._preprocessImage(img))
    );

    let imageParts = processedImages.map(base64Data => {
      return { inlineData: { mimeType: 'image/jpeg', data: base64Data } };
    });

    const maxRetries = 3; // +1 para absorver a tentativa de detecção de inversão 180°
    let cachedTranscription = null;
    let rotationAttempted = false;

    const runPass1 = async () => {
      if (cachedTranscription) {
        this.logger.info('[PASS 1] Reutilizando transcrição cacheada');
        return cachedTranscription;
      }

      this.logger.info('[PASS 1] Transcrevendo texto literal...');
      const transcriptionParts = [{ text: this._getExamTranscriptionPrompt() }, ...imageParts];

      let result = await apiService.callGeminiAPI(transcriptionParts, PASS1_CONFIG);

      if (result.finishReason === 'MAX_TOKENS') {
        this.logger.warn('[PASS 1] Transcrição truncada. Retentando com mais tokens...');
        try {
          const retryResult = await apiService.callGeminiAPI(transcriptionParts, PASS1_RETRY_CONFIG);
          if (retryResult?.text) result = retryResult;
          // se retry também truncou, mantém o resultado original (parcial mas utilizável)
        } catch (retryErr) {
          // Timeout ou erro no retry — usar transcrição truncada
          // REF/TONO/PACH aparecem no início do ticket: o fragmento costuma conter os dados relevantes
          this.logger.warn('[PASS 1] Retry falhou — prosseguindo com transcrição parcial:', retryErr.message);
        }
      }

      cachedTranscription = result.text;
      return result.text;
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`[TWO-PASS] Tentativa ${attempt}/${maxRetries}`);

        const rawTranscription = await runPass1();

        // ── DETECÇÃO DE ALUCINAÇÃO EM LOOP ──────────────────────────────────
        // O Gemini, quando truncado ou sob baixa confiança, pode gerar a
        // mesma linha dezenas de vezes. Detectar e usar Single-Pass como fallback.
        const loopCheck = this._detectHallucinationLoop(rawTranscription);
        if (loopCheck.hallucinated) {
          this.logger.warn(`[TWO-PASS] Alucinação detectada no Pass 1: ${loopCheck.reason}`);
          this.logger.warn('[TWO-PASS] Descartando transcrição corrompida — usando Single-Pass como fallback');
          // Single-Pass lê diretamente das imagens (não depende do texto corrompido)
          const fallbackResult = await this.extractExams(imagesBase64, onProgress);
          fallbackResult._avisoAlucinacaoPass1 = true;
          fallbackResult._motivoAlucinacao = loopCheck.reason;
          if (!fallbackResult._validationWarnings) fallbackResult._validationWarnings = [];
          fallbackResult._validationWarnings.unshift(`⚠️ Transcrição OCR corrompida (loop detectado) — releitura automática aplicada`);
          return fallbackResult;
        }
        // ────────────────────────────────────────────────────────────────────

        // ── DETECÇÃO DE TICKET INVERTIDO 180° ───────────────────────────────
        // Ocorre quando o ticket foi grampeado ao prontuário e fotografado
        // pelo verso: texto de cabeça para baixo, marcadores >R< em vez de <R>.
        // O Pass 1 sinaliza com [TICKET INVERTIDO 180°] e para.
        // Solução: rotacionar as imagens já pré-processadas e re-transcrever.
        if (rawTranscription.trim() === '[TICKET INVERTIDO 180°]' && !rotationAttempted) {
          this.logger.warn('[TWO-PASS] Ticket invertido 180° detectado — rotacionando imagens e re-transcrevendo');
          rotationAttempted = true;
          const rotatedProcessed = await Promise.all(
            processedImages.map(b64 => this._rotateImage180(b64))
          );
          imageParts = rotatedProcessed.map(base64Data => ({
            inlineData: { mimeType: 'image/jpeg', data: base64Data }
          }));
          cachedTranscription = null; // forçar nova transcrição com imagens rotacionadas
          continue;
        }
        // ────────────────────────────────────────────────────────────────────

        if (onProgress) onProgress('pass2');
        this.logger.info('[PASS 1] Transcrição literal:\n' + rawTranscription);
        this.logger.info('[PASS 2] Extraindo dados estruturados...');

        const extractionPrompt = this._buildExamExtractionPrompt(rawTranscription);
        const { text: rawExtraction } = await apiService.callGeminiAPI([{ text: extractionPrompt }], PASS2_CONFIG);

        const result = _parseGeminiJSON(rawExtraction, 'exames');
        result._transcricao_literal = rawTranscription;
        if (rotationAttempted) result._ticketInvertido = true;

        // Normalizar 'debug' para 'debug_leitura' (modelo as vezes usa nome errado)
        if (result.debug && !result.debug_leitura) {
          result.debug_leitura = result.debug;
          delete result.debug;
        }

        this.logger.info('[TWO-PASS] Extração:\n' + JSON.stringify({
          debug: result.debug_leitura,
          refracao: result.refracao,
          tonometria: result.tonometria,
          paquimetria: result.paquimetria
        }, null, 2));

        // Retry se ESF ausente em ambos os olhos
        const esfOdAusente = result.refracao?.od?.esf == null;
        const esfOeAusente = result.refracao?.oe?.esf == null;
        if (esfOdAusente && esfOeAusente && attempt < maxRetries) {
          this.logger.warn('[TWO-PASS] Refração sem ESF — retentando...');
          cachedTranscription = null; // nova transcrição para nova tentativa
          continue;
        }

        const validation = this.validateExamData(result);

        if (validation.isValid) {
          this.logger.success(`[TWO-PASS] Dados validados na tentativa ${attempt}`);
          return result;
        }

        if (!validation.shouldRetry) {
          result._validationWarnings = validation.warnings;
          return result;
        }

        if (attempt < maxRetries) {
          this.logger.warn('[TWO-PASS] Validação falhou. Invalidando cache...');
          cachedTranscription = null;
        } else {
          result._validationWarnings = validation.warnings;
          result._blockAutoInject = true;
          return result;
        }

      } catch (err) {
        if (attempt < maxRetries) {
          this.logger.warn(`[TWO-PASS] Erro na tentativa ${attempt}, retentando`);
          cachedTranscription = null;
        } else {
          throw err;
        }
      }
    }

    throw new Error('Falha na extração após todas as tentativas');
  }

  // --------------------------------------------------------------------------
  // Validação numérica dos dados de exame
  // --------------------------------------------------------------------------

  validateExamData(data) {
    const warnings = [];
    let shouldRetry = false;

    if (!data?.refracao) {
      return { isValid: true, warnings: [], shouldRetry: false };
    }

    const { od, oe } = data.refracao;

    // Validação de ranges - APENAS AVISA, não força retry exceto em casos absurdos
    for (const [label, eye] of [['OD', od], ['OE', oe]]) {
      if (!eye) continue;

      // Validar ESF (range aceitável amplo: -25 a +20)
      if (eye.esf !== null && eye.esf !== undefined && eye.esf !== 'plano') {
        const esf = parseFloat(String(eye.esf));
        if (!isNaN(esf)) {
          if (esf < -25 || esf > 20) {
            warnings.push(`ESF ${label} fora do range (${esf}).`);
            shouldRetry = true; // Só retry em valores absurdos
          }
        }
      }

      // Validar CIL — TOPCON usa sempre convenção negativa.
      // CIL positivo = sinal de menos perdido na leitura → negar (não descartar).
      if (eye.cil !== null && eye.cil !== undefined) {
        const cil = parseFloat(String(eye.cil));
        if (!isNaN(cil)) {
          if (cil > 0) {
            warnings.push(`CIL ${label} positivo: negado automaticamente (${cil} → ${-cil}).`);
            eye.cil = -cil; // corrige in-place
          }
          if (eye.cil < -10) {
            warnings.push(`CIL ${label} fora do range esperado (${eye.cil}).`);
            shouldRetry = true;
          }
        }
      }

      // Validar EIXO (range: 0-180) - aceitar 0
      if (eye.eixo !== null && eye.eixo !== undefined) {
        const eixo = parseInt(String(eye.eixo));
        if (!isNaN(eixo)) {
          if (eixo < 0 || eixo > 180) {
            warnings.push(`EIXO ${label} fora do range 0-180 (${eixo}).`);
            shouldRetry = true;
          }
        }
      }
    }

    // Detecção de cópia OD→OE - ÚNICA validação que força retry
    if (od && oe) {
      const esfOD = parseFloat(od.esf === 'plano' ? '0' : String(od.esf));
      const esfOE = parseFloat(oe.esf === 'plano' ? '0' : String(oe.esf));
      const cilOD = od.cil !== null ? parseFloat(String(od.cil)) : null;
      const cilOE = oe.cil !== null ? parseFloat(String(oe.cil)) : null;
      const eixoOD = od.eixo !== null ? parseInt(String(od.eixo)) : null;
      const eixoOE = oe.eixo !== null ? parseInt(String(oe.eixo)) : null;

      const esfIgual = !isNaN(esfOD) && !isNaN(esfOE) && Math.abs(esfOD - esfOE) < 0.01;
      const cilIgual = cilOD !== null && cilOE !== null && Math.abs(cilOD - cilOE) < 0.01;
      const eixoIgual = eixoOD !== null && eixoOE !== null && Math.abs(eixoOD - eixoOE) <= 3;

      // OD=OE com cilindro → bloquear SEMPRE, sem exceção
      // Também força retry: cenário clinicamente raro e geralmente é alucinação
      // por espelhamento de coluna no PASS 1 (uma coluna do ticket estava em
      // branco/ilegível e foi preenchida copiando a outra).
      if (esfIgual && cilIgual && eixoIgual && cilOD !== null && cilOD !== 0) {
        warnings.push('⚠️ OD e OE idênticos com cilindro — provável espelhamento de coluna');
        data._blockAutoInject = true;
        shouldRetry = true;
      }
    }

    // Tonometria e paquimetria - apenas avisos, sem retry
    if (data.tonometria) {
      for (const [label, val] of [['OD', data.tonometria.od], ['OE', data.tonometria.oe]]) {
        if (val !== null && val !== undefined) {
          const num = parseFloat(val);
          if (!isNaN(num) && (num < 5 || num > 40)) {
            warnings.push(`Tonometria ${label}: ${val} mmHg.`);
          }
        }
      }
    }

    if (data.paquimetria) {
      for (const [label, val] of [['OD', data.paquimetria.od], ['OE', data.paquimetria.oe]]) {
        if (val !== null && val !== undefined) {
          const num = parseFloat(val);
          if (!isNaN(num) && (num < 350 || num > 700)) {
            warnings.push(`Paquimetria ${label}: ${val} µm.`);
          }
        }
      }
    }

    // Se só tem avisos (sem shouldRetry), considera válido
    return { isValid: !shouldRetry, warnings, shouldRetry };
  }

  // --------------------------------------------------------------------------
  // Detecção de alucinação em loop (transcrição do Pass 1)
  // --------------------------------------------------------------------------

  /**
   * Detecta padrões de alucinação em loop na transcrição do Pass 1.
   * O Gemini, quando truncado ou em modo de baixa confiança, tende a repetir
   * a mesma linha dezenas de vezes (ex: "S.E. - 1.50 - 1.50" x30).
   * @param {string} text - Texto da transcrição
   * @returns {{ hallucinated: boolean, reason: string }}
   */
  _detectHallucinationLoop(text) {
    if (!text || text.length < 50) return { hallucinated: false };

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const totalLines = lines.length;
    if (totalLines < 5) return { hallucinated: false };

    // Contar frequência de cada linha
    const freq = {};
    for (const line of lines) {
      freq[line] = (freq[line] || 0) + 1;
    }

    // Se alguma linha aparece mais de 5 vezes OU > 30% das linhas → alucinação
    for (const [line, count] of Object.entries(freq)) {
      if (count >= 6) {
        return {
          hallucinated: true,
          reason: `Linha repetida ${count}x: "${line.substring(0, 60)}..."`
        };
      }
      if (count / totalLines > 0.30 && count >= 4) {
        return {
          hallucinated: true,
          reason: `Linha ocupa ${Math.round(count / totalLines * 100)}% da transcrição: "${line.substring(0, 60)}"`
        };
      }
    }

    // Detecção de padrão S.E. em loop (caso específico observado)
    const seLoopMatches = (text.match(/S\.?E\.?\s*[-−]?\s*\d/g) || []).length;
    if (seLoopMatches >= 8) {
      return {
        hallucinated: true,
        reason: `Padrão S.E. repetido ${seLoopMatches}x — transcrição corrompida`
      };
    }

    // Detecção de espelhamento de colunas paralelas em refração:
    // padrão "S/C/A X.XX    S/C/A X.XX" (mesmo valor nas duas colunas) repetido
    // 4+ vezes para o MESMO rótulo é fortíssimo indício de alucinação por simetria.
    // Ex: "S - 1.25    S - 1.25" aparecendo 5x.
    const mirroredLineCounts = {};
    for (const line of lines) {
      // Captura "S/C valor    S/C valor" (mesmo rótulo + valor numérico nas duas colunas)
      const m = line.match(/^([SCA])\s*([+\-−]?\s*\d+(?:\.\d+)?)\s+\1\s*([+\-−]?\s*\d+(?:\.\d+)?)\s*$/);
      if (m) {
        const v1 = m[2].replace(/\s/g, '');
        const v2 = m[3].replace(/\s/g, '');
        if (v1 === v2) {
          const key = `${m[1]}_${v1}`;
          mirroredLineCounts[key] = (mirroredLineCounts[key] || 0) + 1;
        }
      }
    }
    for (const [key, count] of Object.entries(mirroredLineCounts)) {
      if (count >= 4) {
        return {
          hallucinated: true,
          reason: `Coluna paralela espelhada ${count}x para "${key}" — provável alucinação por simetria`
        };
      }
    }

    return { hallucinated: false };
  }

  // --------------------------------------------------------------------------
  // Prompts do Agente de Exames
  // --------------------------------------------------------------------------

  _getExamSinglePassPrompt() {
    return `
Você é um sistema OCR especializado em tickets TOPCON de autorefrator/tonômetro.
Extraia SOMENTE o que está impresso. NUNCA invente, estime ou calcule valores.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MÚLTIPLAS FOTOS — VOTAÇÃO MAJORITÁRIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Você recebeu várias fotos do mesmo ticket.
Para cada valor: se 2 ou 3 fotos mostram o mesmo número → use-o.
Se todas mostram números diferentes → null. Use a foto mais nítida como referência.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS — ANTI-ALUCINAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Leia APENAS dígitos e sinais impressos e visíveis
• Campo ilegível → null para ESSE campo (não para o olho todo)
• Olho inteiro ilegível → null para o objeto inteiro do olho
• SEÇÃO AUSENTE → null para toda a seção
• NUNCA calcule (médias, conversões de sinal)

⚠️ REGRA ANTI-CÓPIA — ABSOLUTA:
Se um olho (OD ou OE) estiver ilegível, coberto, fora de enquadramento ou duvidoso:
  → Retorne null para ESSE OLHO INTEIRO: { "od": null } ou { "oe": null }
  → É PROIBIDO usar os valores do outro olho como substituto
  → É PROIBIDO espelhar, estimar ou "completar" um olho com dados do outro
  → null é SEMPRE a resposta correta quando há dúvida sobre qual coluna pertence a qual olho
Violar esta regra é mais danoso do que retornar null: um valor fabricado pode ser injetado silenciosamente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTIFICAÇÃO DAS SEÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cada seção começa com um cabeçalho impresso:
  "REF. DATA"           → Refração        → EXTRAIR
  "TONO. DATA"          → Tonometria      → EXTRAIR
  "PACH. DATA"          → Paquimetria     → EXTRAIR
  "KRT. DATA" / "KM DATA" / "KER." / "KRT DATA"  → Ceratometria  → IGNORAR COMPLETAMENTE

Marcadores de olho dentro de cada seção:
  <R> ou R  →  Olho Direito (OD)
  <L> ou L  →  Olho Esquerdo (OE)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEÇÃO 1 — REFRAÇÃO  ("REF. DATA")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA POSICIONAL — a seção REF. DATA tem SEMPRE este formato:
  • N linhas numeradas (1, 2, 3...) → IGNORAR completamente
  • 1 linha com S/C/A sem número    → esta é a MÉDIA → USAR
  • 1 linha com apenas S.E. ou SE   → IGNORAR completamente (não extrair SE)

PASSO 1 — Identifique a LINHA DA MÉDIA:
  Pegue SEMPRE a última linha que contém S/C/A (esfera/cilindro/eixo),
  independentemente de estar em negrito ou não.

  ★ REGRA CRÍTICA: NUNCA use uma linha que contenha APENAS S.E. ou SE como fonte de SPH/CYL/AX.
    Linhas que contêm APENAS "S.E." ou "SE" seguido de número → IGNORAR completamente.
    Se a última linha impressa contiver APENAS "S.E. X.XX" → suba uma linha para obter SPH/CYL/AX.

  Exemplo:
    1)  SPH -1.25  CYL -0.50  AX  90
    2)  SPH -1.50  CYL -0.50  AX  85
    3)  SPH -1.25  CYL -0.75  AX  90
        SPH -1.25  CYL -0.50  AX  88   ← USAR esta linha para ESF/CIL/EIXO
        SE -1.50                        ← IGNORAR

  ★ DADOS FORA DA DOBRA — IGNORAR:
    Quando o ticket está dobrado, valores do verso podem aparecer
    na margem esquerda da imagem, fora da sequência normal.
    Como identificar: valores isolados na extremidade esquerda,
    sem marcador <R>/<L> claro, ou que contradizem o bloco principal.
    Regra: se S/C/A aparece SEM marcador de olho claro E contradiz
    os valores já lidos no bloco principal → IGNORAR e marcar
    _aviso_inversao: true.
    NUNCA use valores da margem da dobra para completar um olho com
    traços (--) no bloco principal. Se bloco tem C -- → cil = null.

  ★ DETECÇÃO DE LINHA S PERDIDA (ticket dobrado):
    Sintoma: medições numeradas mostram S = C = SE = mesmo valor,
    mas a linha final (sem número) mostra S e C distintos.
    Causa: a linha S ficou na dobra do ticket; o OCR colapsou S/C/SE
    em um único valor nas medições intermediárias.

    Regra: IGNORE as medições numeradas com colapso (S = C = SE).
    USE APENAS a linha final que mostra S e C distintos.

    Se a linha final também mostrar S = C = SE:
    → Marque _aviso_inversao: true
    → Registre "[LINHA S PERDIDA?]" no debug_leitura
    → Não injete automaticamente

  ★ MEDIÇÕES IDÊNTICAS — REGRA ANTI-ALUCINAÇÃO:
    Se todas as linhas numeradas forem idênticas entre si E idênticas à linha final →
    isso é NORMAL e CORRETO (aparelho com medições consistentes).
    Confirme os valores e use-os. NÃO descarte nem marque como null por suspeita de cópia.

PASSO 2 — Extraia os campos DA LINHA DA MÉDIA:

  esf  (campo SPH):
    • Copie o valor com seu sinal (+ ou −)
    • Se o valor for exatamente zero → escreva "plano"
    • Exemplos: -1.25 → -1.25 | +2.50 → +2.50 | 0.00 → "plano"

  cil  (campo CYL):
    • O TOPCON usa CONVENÇÃO NEGATIVA — CYL é sempre ≤ 0
    • Valor com − visível  (ex: -0.75) → escreva -0.75
    • Valor SEM sinal      (ex:  0.75) → escreva -0.75  ← o − foi perdido na impressão
    • Valor com + visível  (ex: +0.75) → escreva -0.75  ← converta
    • CYL = 0.00 ou 0     → null  (sem astigmatismo)
    • CYL completamente ilegível → null
    • Campo com traços (-- ou - - ou ---) sem nenhum dígito → null (campo vazio no TOPCON)
      NUNCA interprete traços como número negativo ou como zero

  eixo (campo AX):
    • Número inteiro entre 1 e 180
    • Se cil = null → eixo = null  (OBRIGATÓRIO)
    • Se cil ≠ null mas AX ilegível → null

PASSO 3 — Preencha "debug_leitura" com o texto literal da linha da média de cada olho.
  "linha_od_texto": "SPH -1.25  CYL -0.50  AX  88"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEÇÃO 2 — TONOMETRIA  ("TONO. DATA")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA: os dados aparecem em colunas — cada linha corresponde a uma medição.

PASSO 1 — Localize as linhas de R (OD) e L (OE).

PASSO 2 — ★ USE O VALOR DA ÚLTIMA COLUNA de cada linha ★
  A última coluna contém a leitura final (média ou valor mais confiável do aparelho).

  Exemplo:
    R   14   15   14   14   ← último valor da linha R = 14 → od = 14
    L   12   13   12   12   ← último valor da linha L = 12 → oe = 12

  Alternativa (formato AVG explícito):
    R:  AVG 14  → od = 14
    L:  AVG 12  → oe = 12

PASSO 3 — Faixa esperada: 8–25 mmHg.
  Valor fora desse range → releia a coluna antes de confirmar.
  Se ilegível → null.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEÇÃO 3 — PAQUIMETRIA  ("PACH. DATA")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA: igual à tonometria — dados em colunas por olho.

PASSO 1 — Localize as linhas de R (OD) e L (OE).
PASSO 2 — ★ USE O VALOR DA ÚLTIMA COLUNA de cada linha ★
PASSO 3 — Tratamento do token "ERR":
  • "ERR" isolado (sem número na mesma linha) → null para aquela medição.
  • "ERR 0.504" (ERR seguido de número na mesma linha) → use o número (0.504 → 504 µm).
  • Se a linha contém ERR mas também contém um valor numérico válido,
    o ERR indica falha anterior; o número é válido — extraia-o.
  • Regra geral: extraia SEMPRE o último número da linha, ignorando o token ERR.
PASSO 4 — Unidade: micras (µm). Faixa esperada: 420–650 µm.
  Se o valor parecer estar em mm (ex: 0.540) → multiplique por 1000 → 540.
  Se ilegível → null.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECKLIST FINAL — responda antes de escrever o JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Refração: usei a ÚLTIMA linha que contém S/C/A de cada olho (não uma linha só com SE)?
□ Se medições idênticas → confirmei que é normal e usei os valores (não marquei null)?
□ CYL é negativo ou null? Positivo → converti para negativo?
□ CYL e AX são consistentes? (cil null → eixo null; cil presente → eixo presente)
□ Linhas com APENAS S.E./SE + número → ignoradas?
□ Tonometria/Paquimetria: usei o valor da ÚLTIMA COLUNA de cada linha?
□ Cada valor foi visto claramente na imagem (não estimado)?
□ Campos C e A com traços (--) → null, não confundir com valor negativo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO DE SAÍDA — JSON PURO (sem markdown, sem comentários)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "debug_leitura": {
    "linha_od_texto": "texto literal da linha da média OD ou null",
    "linha_oe_texto": "texto literal da linha da média OE ou null"
  },
  "tonometria":  { "od": numero_ou_null, "oe": numero_ou_null },
  "paquimetria": { "od": numero_ou_null, "oe": numero_ou_null },
  "refracao": {
    "od": { "esf": "string_ou_null", "cil": numero_negativo_ou_null, "eixo": inteiro_ou_null, "se": "string_ou_null" },
    "oe": { "esf": "string_ou_null", "cil": numero_negativo_ou_null, "eixo": inteiro_ou_null, "se": "string_ou_null" }
  },
  "_aviso_inversao": false
}
`.trim();
  }

  _getExamTranscriptionPrompt() {
    return `
━━━━ PASSO 0 — DETECÇÃO DE ORIENTAÇÃO (faça ANTES de qualquer transcrição) ━━━━
Analise se o texto nas imagens está legível normalmente ou INVERTIDO 180°
(de cabeça para baixo), o que ocorre quando o ticket foi fotografado pelo verso.

Sinais de inversão 180°:
  • Palavras conhecidas de cabeça para baixo ("ATAD .FER" = "REF. DATA" invertido)
  • Marcadores ">R<" ou ">L<" em vez de "<R>" ou "<L>"
  • "TOPCON" parece "NOCTPOT" ou semelhante
  • Cabeçalho "NAME" aparece na parte INFERIOR da imagem
  • Algarismos com hastes para o lado errado ("6" parece "9", etc.)

Se o texto estiver invertido 180°:
  → Retorne APENAS a linha: [TICKET INVERTIDO 180°]
  → Não tente transcrever. A imagem será rotacionada e reenviada automaticamente.

Se o texto estiver normal (legível diretamente):
  → NÃO escreva [TICKET INVERTIDO 180°] e prossiga com a transcrição abaixo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você é um sistema OCR de alta precisão.
Transcreva APENAS as seções clínicas do ticket TOPCON listadas abaixo.
IGNORE completamente: nome do paciente, data de nascimento, ID, número de série,
modelo do aparelho, versão de firmware, data/hora do exame, endereço, qualquer
texto administrativo ou de identificação. Isso reduz o tamanho da saída.

SEÇÕES A TRANSCREVER (e somente estas):
  • KRT. DATA / KM DATA / KER. — ceratometria (necessária para detectar posição)
  • REF. DATA / RET. DATA / IER. DATA — refração → EXTRAIR
  • TONO. DATA — tonometria → EXTRAIR
  • PACH. DATA — paquimetria → EXTRAIR
  • Os marcadores <R>, <L>, PD, VD dentro dessas seções

Se uma seção não estiver presente na imagem, não a mencione.

━━━━ DETECÇÃO DE FORMATO DE COLUNAS PARALELAS ━━━━
ATENÇÃO — FORMATO DE DUAS COLUNAS:
Alguns tickets TOPCON imprimem OD e OE lado a lado na mesma linha.
Os marcadores <R> e <L> aparecem como cabeçalho de coluna.
⚠️ A ORDEM <R>/<L> VARIA de ticket para ticket — NÃO assuma.

COMO IDENTIFICAR:
  - Cada linha tem DOIS números após o rótulo (S, C ou A)
  - Os marcadores <R> e <L> aparecem como cabeçalho de coluna

COMO TRANSCREVER — REGRA OBRIGATÓRIA:
  1. Preserve o cabeçalho de colunas EXATAMENTE como está no ticket
     (seja "<R> <L>" ou "<L> <R>"). O cabeçalho é ESSENCIAL para
     determinar a lateralidade na fase de extração.
  2. Transcreva cada linha com os dois valores na ordem original.
  3. NÃO reorganize, NÃO inverta, NÃO omita o cabeçalho.

  Exemplo (ticket com <R> à esquerda → OD=1º valor, OE=2º valor):
  <R>         <L>
  S -0.25    S -0.75
  C -0.75    C -1.50
  A  95       A   7

  Exemplo (ticket com <L> à esquerda → OE=1º valor, OD=2º valor):
  <L>         <R>
  S + 0.75    S + 0.25
  C - 0.75    C - 0.25
  A 105       A 105

  Se o cabeçalho não estiver legível, escreva [CABEÇALHO ILEGÍVEL].
  NUNCA omita o cabeçalho <R>/<L> — ele define a lateralidade.

━━━━ DETECÇÃO DE TICKET DOBRADO ━━━━
Se o ticket aparecer dobrado ou cortado na imagem (metade visível,
metade fora do enquadramento), transcreva apenas o que é claramente
visível e marque o restante como [ILEGÍVEL].
NUNCA complete ou estime valores que não estão visíveis.
Retorne _aviso_inversao: true se houver dúvida sobre qual coluna
pertence a OD e qual pertence a OE.

DADOS FORA DA DOBRA — IGNORAR:
Valores do verso da dobra podem aparecer na margem esquerda da imagem,
fora da sequência normal do ticket. Transcreva-os como [FORA DA DOBRA]
e NÃO os associe a nenhum olho. Eles não fazem parte do bloco principal.

━━━━ REGRAS GERAIS ━━━━
1. Transcreva CADA linha exatamente como aparece
2. Use marcadores <R>, <L> para delimitar blocos
3. NÃO interprete, NÃO reorganize
4. Traços (-- ou - - ou ---) em campos C ou A = campo vazio — transcreva exatamente, NÃO substitua por número
5. Se caractere ilegível, use [?]
6. Os blocos <R> e <L> QUASE NUNCA são idênticos
7. Linhas que contêm APENAS "S.E." ou "SE" seguido de número → IGNORAR completamente. Não transcreva essas linhas.
8. ⚠️ LINHA DA MÉDIA DE C (cilindro) ilegível ou com zeros:
   O TOPCON imprime a linha da MÉDIA como a última linha de C (sem número de medição).
   Se essa linha contiver "CYL: (-)" ou valores ilegíveis, transcreva exatamente assim:
   [MÉDIA C ILEGÍVEL]  (para colunas paralelas: uma por olho quando ilegível)
   Se a linha mostrar C 0.00 ou C --- (plano): transcreva "C 0.00" ou "C ---" exatamente.
   NUNCA omita a linha da MÉDIA mesmo quando ilegível — sua ausência distorce o resultado.

⚠️ REGRA ANTI-ESPELHAMENTO DE COLUNAS — CRÍTICA:
É COMUM e NORMAL que o TOPCON consiga ler a refração de um olho mas não do outro
(opacidade corneana, fixação ruim, catarata, paciente piscando). Nesses casos:
  • Um olho terá S/C/A normais
  • O OUTRO olho terá APENAS S preenchido (sem C, sem A) ou C/A em branco/traços
  • É ANATOMICAMENTE PLAUSÍVEL que um olho tenha cilindro e o outro não

REGRA: se na coluna de UM olho você não vê claramente C ou A impressos (campo
em branco, traços, espaços, ou só consegue ler a coluna do outro olho):
  → Transcreva EXATAMENTE como está: "C ---" ou "C [VAZIO]" ou "C [?]" ou "A ---"
  → NUNCA, JAMAIS, EM HIPÓTESE NENHUMA copie o C ou A do olho legível para o ilegível
  → NUNCA "complete" uma coluna com valores da outra coluna por simetria visual

❌ ERRO PROIBIDO (alucinação por simetria):
   Ticket real:
     <L>         <R>
     S - 1.25    S - 1.25
     C - 0.50    [em branco — só esfera no OD]
     A 84        [em branco]
   Transcrição ERRADA (espelhamento):
     C - 0.50    C - 0.50    ← INVENTADO
     A 84        A 84        ← INVENTADO

✓ CORRETO:
   C - 0.50    C ---
   A 84        A ---

Se TODAS as linhas de S/C/A nas duas colunas forem perfeitamente idênticas em
TODAS as medições E a média, isso é EXTREMAMENTE raro clinicamente. Releia
com atenção redobrada cada coluna antes de transcrever — provavelmente uma
das colunas tem campos em branco que você está mentalmente preenchendo.

Retorne APENAS o texto transcrito.
`.trim();
  }

  _buildExamExtractionPrompt(transcribedText) {
    return `
Transcrição de ticket TOPCON (gerada por OCR — pode conter erros de leitura):

=== TRANSCRIÇÃO ===
${transcribedText}
=== FIM ===

⚠️ VERIFICAÇÃO OBRIGATÓRIA ANTES DE EXTRAIR:
Analise se a transcrição contém PADRÕES DE ALUCINAÇÃO (linhas idênticas repetidas 5+ vezes,
ou padrão "S.E." ou "S -X.XX" repetido em loop). Se detectar isso:
→ Retorne refracao: { od: null, oe: null } e inclua em debug_leitura.linha_od_texto: "[TRANSCRIÇÃO CORROMPIDA — LOOP DETECTADO]"
→ NÃO tente extrair valores de uma transcrição em loop, pois os dados são fabricados.

Extraia os dados. Responda SOMENTE com o JSON final, sem texto antes nem depois, sem markdown.

━━━━ MARCADORES DE OLHO ━━━━
<R> ou R = OD (olho direito)
<L> ou L = OE (olho esquerdo)

━━━━ SEÇÕES ━━━━
⚠️ REGRA CRÍTICA — CERATOMETRIA:
"KRT. DATA", "KM DATA", "KER.", "KERT." → IGNORAR COMPLETAMENTE.
Todo e qualquer valor dentro dessas seções (mesmo que marcado com <R> ou <L>) NÃO é refração.
O ceratômetro mede a córnea — os valores NÃO devem ser usados como refração do paciente.
⚠️ MARCADORES DENTRO DO KRT: Os marcadores <R> e <L> que aparecem DENTRO do bloco KRT
pertencem à ceratometria e devem ser IGNORADOS junto com o bloco inteiro.
O primeiro <R> que aparecer DEPOIS do bloco KRT (identificado por linhas com padrão S ±X.XX / C -X.XX / A XXX)
é o marcador de OD da refração. Nunca use um <R>/<L> do KRT para definir lateralidade da refração.

REFRAÇÃO → cabeçalho: "REF. DATA", "RET. DATA", "IER. DATA", "HEF. DATA", "REF DATA", ou apenas "DATA"
  (o OCR às vezes distorce "REF" → "RET", "IER", etc. — identifique pela posição e conteúdo)
  A seção de refração contém colunas S/C/A (esfera, cilindro, eixo).
  ⚠️ TICKET SEM CABEÇALHO REF. DATA: alguns tickets omitem esse cabeçalho. Nesse caso,
  identifique a refração pelo padrão S/C/A fora do bloco KRT. O <R>/<L> imediatamente
  anterior a essas linhas (e fora do KRT) define o olho.
  ⚠️ CASO ESPECIAL — REFRAÇÃO DENTRO DO BLOCO KRT:
  Se a transcrição NÃO contém cabeçalho REF.DATA e os únicos dados S/C/A com valores de
  refração (ESF entre -20 e +20) aparecem DENTRO de um bloco rotulado como KRT.DATA:
  → Use esses valores como refração (o OCR confundiu os cabeçalhos)
  → MAS os marcadores <R>/<L> dentro do KRT podem ter convenção invertida (máquina ↔ paciente)
  → OBRIGATÓRIO: marque "_aviso_inversao": true
  → Isso bloqueará a auto-injeção e pedirá confirmação manual do usuário

TONOMETRIA → "TONO. DATA" → valores em mmHg (8–25)
PAQUIMETRIA → "PACH. DATA" → valores em µm (420–650). Se em mm (< 2.0) → multiplicar × 1000
  • "ERR" isolado (sem número na mesma linha) → null para aquela medição
  • "ERR 0.504" (ERR seguido de número) → use o número (0.504 → 504 µm)
  • Regra geral: extraia SEMPRE o último número da linha, ignorando o token ERR

━━━━ REFRAÇÃO — COMO EXTRAIR ━━━━
A estrutura de REF. DATA é SEMPRE:
  • N linhas numeradas (1, 2, 3...)  → IGNORAR completamente
  • 1 linha com S/C/A sem número    → esta é a MÉDIA → USAR
  • 1 linha com apenas S.E. ou SE   → IGNORAR completamente (não extrair SE)

REGRA POSICIONAL: pegue SEMPRE a última linha que contém S/C/A como fonte de ESF/CIL/EIXO.
Esta linha final é a MÉDIA calculada pelo aparelho (negrito no ticket físico) — ela é DEFINITIVA.
NUNCA use uma linha que contenha APENAS S.E. ou SE como fonte de SPH/CYL/AX.
Linhas com APENAS "S.E." ou "SE" seguido de número → IGNORAR completamente.

⚠️ REGRA DO EIXO COM MÚLTIPLAS LINHAS DE A:
Alguns tickets imprimem S, C e A em blocos separados (todas as linhas de S, depois todas de C, depois todas de A).
Quando houver 3 linhas de A numeradas + 1 linha de A sem número (a média), use SEMPRE a última linha de A como EIXO.
Exemplo: "A 95 / A 90 / A 91 / A 97" → as 3 primeiras são medições, a última (97) é a média → eixo = 97.
Regra geral: o eixo da média = ÚLTIMO valor de A na sequência do olho.

⚠️ DADOS FORA DA DOBRA — IGNORAR:
Quando o ticket está dobrado, valores do verso podem aparecer na margem
esquerda da imagem, isolados, sem marcador <R>/<L> claro ou contradizendo
o bloco principal. Regra: S/C/A sem marcador de olho claro que contradiz
o bloco principal → IGNORAR, marcar _aviso_inversao: true.
NUNCA use esses valores para completar olho com C -- no bloco principal.
Se bloco tem C -- → cil = null, mesmo que apareça C com valor na margem.

⚠️ DETECÇÃO DE LINHA S PERDIDA (ticket dobrado):
Sintoma: medições numeradas mostram S = C = SE = mesmo valor,
mas a linha final (sem número) mostra S e C distintos.
Causa: a linha S ficou na dobra do ticket; o OCR colapsou S/C/SE
em um único valor nas medições intermediárias.

Regra: IGNORE as medições numeradas com colapso (S = C = SE).
USE APENAS a linha final que mostra S e C distintos.

Se a linha final também mostrar S = C = SE:
→ Marque _aviso_inversao: true
→ Registre "[LINHA S PERDIDA?]" no debug_leitura
→ Não injete automaticamente

Exemplo:
  S -1.25  C -0.50  A  88   ← use para ESF/CIL/EIXO
  S.E. -1.50                ← IGNORAR

⚠️ MEDIÇÕES IDÊNTICAS — REGRA ANTI-ALUCINAÇÃO:
Se todas as linhas numeradas forem idênticas entre si E idênticas à linha final →
isso é NORMAL e CORRETO (aparelho com medições consistentes).
Confirme os valores e use-os. NÃO descarte nem marque como null por suspeita de cópia.

FORMATO DE COLUNAS PARALELAS:
Se a transcrição contiver linhas com DOIS valores por campo (ex: "S +0.75 +0.25"),
execute este algoritmo OBRIGATÓRIO em dois passos:

  PASSO A — DETERMINE A ORDEM DAS COLUNAS pelo cabeçalho da transcrição:
    ⚠️ A ordem <R>/<L> VARIA — SEMPRE verifique antes de atribuir valores.
    • Cabeçalho "<R> ... <L>":  coluna esquerda = OD,  coluna direita = OE
                                1º valor = OD,           2º valor = OE
    • Cabeçalho "<L> ... <R>":  coluna esquerda = OE,  coluna direita = OD
                                1º valor = OE,           2º valor = OD
    • Sem cabeçalho legível:    assuma OD à esquerda (1º = OD), marque _aviso_inversao: true

  PASSO B — EXTRAIA os valores de cada olho conforme a ordem determinada:
    Use os valores da última linha de cada campo (S, C, A) para o olho correto.
    NUNCA some ou misture valores dos dois olhos.

  ★ REGRA CRÍTICA — C/A INTERCALADOS (armadilha frequente):
    Alguns tickets imprimem S/C/A em blocos intercalados por medição (C então A, C então A...):
      S +0.50  S +0.50   ← meds S (3 linhas)
      S +0.50  S +0.50
      S +0.50  S +0.50
      C -0.50  C -0.25   ← med C 1  ⚠️ NUNCA usar como média de OE!
      A 158    A 158
      C -0.25  C -0.25   ← med C 2
      A 158    A 158
      C -0.25  C -0.25   ← med C 3  ← USAR ESTE (último C visível)
      A 158    A 158
    Para cada coluna (olho): use o ÚLTIMO valor de C na série — nunca o primeiro.
    No exemplo: OE (left/1º)→cil=-0.25 (NÃO -0.50!), OD (right/2º)→cil=-0.25.
    Se a linha da MÉDIA explícita (4ª linha sem número) não aparecer → use a última disponível.

  ★ REGRA DE OURO — A ÚLTIMA LINHA DE C E A É SEMPRE A FONTE DEFINITIVA:
    A última linha de C (e de A) na sequência de cada olho é a MÉDIA calculada
    pelo aparelho TOPCON — impressa em negrito no ticket físico.
    → Ela é a fonte DEFINITIVA e INEGOCIÁVEL do cilindro e do eixo.
    → NÃO substitua pelo modal ou valor majoritário das medições individuais anteriores.
    → Discrepâncias entre a última linha e as medições anteriores são normais
      (o aparelho calculou a média com seu próprio arredondamento interno).
    → Única exceção: quando a linha está marcada [MÉDIA C ILEGÍVEL] → ver fallback abaixo.


  Exemplo real — cabeçalho "<L> <R>" (OE à esquerda):
    Transcrição: "<L>         <R>  S + 0.75    S + 0.25  C - 0.75    C - 0.25  A 105       A 105"
    → Passo A: <L> vem antes de <R> → 1º valor = OE, 2º valor = OD
    → oe: esf="+0.75", cil=-0.75, eixo=105
    → od: esf="+0.25", cil=-0.25, eixo=105


  Exemplo clássico — cabeçalho "<R> <L>" (OD à esquerda):
    Transcrição: "<R>         <L>  S -0.25    S -0.75  C -0.75    C -1.50  A  95    A   7"
    → Passo A: <R> vem antes de <L> → 1º valor = OD, 2º valor = OE
    → od: esf="-0.25", cil=-0.75, eixo=95
    → oe: esf="-0.75", cil=-1.50, eixo=7

  Se os valores parecerem invertidos, marque _aviso_inversao: true.

⚠️ REGRA ANTI-CÓPIA — ABSOLUTA (verificar antes de atribuir qualquer valor):
Se um olho (OD ou OE) estiver ilegível, ausente, incompleto ou duvidoso na transcrição:
  → Retorne null para ESSE OLHO INTEIRO: { "od": null } ou { "oe": null }
  → NÃO use os valores do outro olho como substituto
  → NÃO espelhe, estime ou "complete" um olho com dados do outro
  → Se houver dúvida sobre qual coluna pertence a qual olho, marque _aviso_inversao: true
  → null é SEMPRE melhor do que um valor fabricado ou copiado

Se um olho inteiro não aparecer na seção REF. DATA → retorne null para esse olho (não use KRT).

Formatos possíveis:
• Com rótulo:   S -4.50  C -1.00  A 76  → esf=-4.50, cil=-1.00, eixo=76
• Sem rótulo:  -4.50  -1.00  76         → 1º=esf, 2º=cil, 3º=eixo

Regras de sinal:
• ESF: O TOPCON SEMPRE imprime o sinal (+ ou −) explicitamente.
  Se o sinal aparecer na transcrição → use-o diretamente.
  Se o sinal ESTIVER AUSENTE → o OCR perdeu o sinal. Marque esf como null (não assuma).
  Ex: "S -2.50" → esf="-2.50" | "S +1.25" → esf="+1.25" | "S 0.00" → esf="plano"
• CIL: TOPCON usa convenção negativa. "CYL: (−)" confirma que todos são negativos.
  Valor sem sinal (ex: "C 1.00") → cil=-1.00 | Valor com "−" → manter negativo | "+" → negar
  CIL = 0.00 → null | CIL ilegível → null
  Traços (-- ou - - ou ---) sem nenhum dígito → null (campo vazio); NUNCA interpretar como número negativo ou zero
• EIXO: inteiro 1–180, sempre positivo. Se cil = null → eixo = null (obrigatório)

⚠️ REGRA CRÍTICA — LINHA DA MÉDIA DE C ILEGÍVEL ou zero discrepante:
Se a transcrição contiver "[MÉDIA C ILEGÍVEL]", "CYL: (-) [ILEGÍVEL]", "[?]" ou
a linha de média mostrar C 0.00 mas as medições individuais mostrarem valor diferente:

  PASSO A — Verificar consistência das medições individuais (ANTES de retornar null):
  Se N≥3 medições individuais de C para esse olho concordam em valor X (X ≠ 0.00, X ≠ ---):
    → A linha de média é ilegível ou discrepante — USE o valor modal X como substituto
    → cil = X (negado conforme convenção negativa) | eixo = modal de A para esse olho
    → Marque _aviso_inversao: true

  PASSO B — Se as medições individuais divergem OU todas são "---" (sem leitura de cilindro):
    → cil = null | eixo = null

  CASO ESPECIAL — "C 0.00 [MÉDIA C ILEGÍVEL]" na mesma linha de colunas paralelas:
  Esse padrão indica que UMA coluna tem C 0.00 como média e a OUTRA tem [MÉDIA C ILEGÍVEL].
  Para cada coluna: verifique separadamente se as medições individuais são consistentes.
  Se a coluna com C 0.00 tinha 3+ medições de C não-zero (ex: C+1.00 × 3) → C 0.00 é
  discrepante; aplique o PASSO A (use modal das medições, que é |X| > 0.25 de 0.00).
  A coluna com [MÉDIA C ILEGÍVEL] e sem medições (C ---) → PASSO B → null.
━━━━ TONOMETRIA ━━━━
Linha R → OD, linha L → OE.
Se houver label "AVG." → use o valor após AVG.
Caso contrário → use o ÚLTIMO número de cada linha.
"ERR" = medição com erro, ignorar.
Exemplos: "R 14 16" → od=16 | "L 14 15" → oe=15 | "R AVG. 15" → od=15

━━━━ PAQUIMETRIA ━━━━
Linha R → OD, linha L → OE.
Se houver label "AVG." → use o valor após AVG.
"RO." / "LO." → valores finais de OD/OE respectivamente.
Tratamento de ERR:
  • "ERR" isolado (sem número na mesma linha) → null para aquela medição
  • "ERR 0.504" (ERR seguido de número) → use o número (0.504 → 504 µm)
  • Regra geral: extraia SEMPRE o último número da linha, ignorando o token ERR
Se valor em mm (< 2.0): multiplicar × 1000 para µm.

⚠️ CHECKLIST FINAL — responda mentalmente antes de escrever o JSON:
□ Anti-cópia: OD e OE foram lidos de colunas DIFERENTES na transcrição? Se um olho era ilegível, retornei null (não copiei do outro)?
□ Formato de colunas paralelas: verifiquei o cabeçalho (<R>/<L> ou <L>/<R>) antes de atribuir valores?
□ Refração: usei a ÚLTIMA linha C de cada olho — não a primeira? (Se C/A alternados: último C = média)
□ CIL é negativo ou null? Positivo → converti para negativo?
□ Se cil = null → eixo = null?
□ Tonometria/Paquimetria: usei AVG quando disponível, senão o último número da linha?

━━━━ JSON DE SAÍDA ━━━━
{
  "debug_leitura": {
    "linha_od_texto": "valores literais OD: 'S +0.25 C -0.25 A 105' (inclua o texto exato para auditoria)",
    "linha_oe_texto": "valores literais OE: 'S +0.75 C -0.75 A 105'"
  },
  "tonometria":  { "od": numero_ou_null, "oe": numero_ou_null },
  "paquimetria": { "od": numero_ou_null, "oe": numero_ou_null },
  "refracao": {
    "od": { "esf": "string_ou_null", "cil": numero_negativo_ou_null, "eixo": inteiro_ou_null, "se": "string_ou_null" },
    "oe": { "esf": "string_ou_null", "cil": numero_negativo_ou_null, "eixo": inteiro_ou_null, "se": "string_ou_null" }
  },
  "_aviso_inversao": false
}
`.trim();
  }
}

// Singleton do agente de exames
const geminiExamAgent = new GeminiExamAgent();


// ============================================================================
// AGENTE 2 — GeminiInterviewAgent (Entrevista / Áudio)
// ============================================================================

const CONSULTATION_CONFIG = { maxOutputTokens: 16384 };

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

    // Lista branca: padrões que são inequivocamente conduta médica
    // Inclui orientações procedimentais ao paciente (compressa, higiene) que
    // DEVEM ficar em conduta no novo modelo.
    const CONDUTA_VALIDA_RE = /^(?:retorno\b|encaminhamento|solicitar|prescrição de óculos|prescricao de oculos|manutenção do óculos|manutencao do oculos|sem prescrição de óculos|sem prescricao de oculos|atualização de grau|atualizacao de grau|suspender\b|manter\b|alta\b|observ|acompanhar|acompanhamento|revisar|avaliação|avaliacao|campo visual|tonometria|compressa|massagem|higiene|shampoo|lavagem|orientad[ao]|explicad[ao]|esclarecid[ao]|programar|indicar|fundo com)/i;

    const condutaLinhas = result.dados.conduta ? result.dados.conduta.split(/\n/) : [];
    const ficamNaConduta   = [];
    const vaoParaTratamento = [];

    // Orientações procedimentais: ficam em conduta mesmo que tenham frequência —
    // compressa morna e higiene palpebral são instruções ao paciente, não medicamentos.
    const ORIENTACAO_PROCEDIMENTAL_RE = /^(compressa|massagem|higiene|shampoo|lavagem|oclusão|oclusao|tampão|tampao|exerc|oclus)/i;

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

    // Mover compressa/higiene do tratamento para conduta caso o Gemini as tenha
    // colocado em tratamento (comportamento do prompt antigo).
    if (result.dados.tratamento) {
      const tratLinhas = result.dados.tratamento.split(/\n/);
      const ficamNoTrat = [];
      const vaoParaConduta = [];
      for (const linha of tratLinhas) {
        const trimmed = linha.trim();
        if (!trimmed) continue;
        if (ORIENTACAO_PROCEDIMENTAL_RE.test(trimmed)) {
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
    Ex: "Xalatan 1 gota OE à noite", "Combigan 2x/dia", "Carmelose 3x/dia"
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
- alteracoes_sistemicas: doenças sistêmicas do paciente + medicamentos sistêmicos em uso
  * Doenças: DM, HAS, hipotireoidismo, cardiopatia, etc.
  * Medicamentos sistêmicos: insulina, metformina, losartan, AAS, anticoagulantes, corticóides orais, etc.
  * Formato sugerido: "DM em uso de insulina e metformina, HAS em uso de losartan"
  * Se nega doenças E nega medicamentos sistêmicos → "Nega comorbidades"
  * Se tem doença mas não mencionou medicamento sistêmico → registre só a doença
- antecedentes_familiares: doenças familiares oculares com relevância hereditária (glaucoma, degeneração macular, retinose pigmentar, estrabismo, etc.)
  ❌ NÃO registrar: catarata — é doença degenerativa/senil sem valor hereditário significativo; se for a única queixa familiar, retornar null

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

- diagnostico: diagnósticos que o MÉDICO identifica/comunica
  Formato obrigatório: código CID-10 + hífen + descrição clínica, um por linha (separar por \n)
  ✅ "H010 - Blefarite bilateral\nH250 - Catarata senil incipiente AO"
  ✅ "H401 - Glaucoma primário ângulo aberto OD\nH524 - Presbiopia"
  ❌ Nunca texto livre sem código: "blefarite bilateral, catarata"
  ❌ Nunca CID sem descrição: "H010\nH260"

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

- conduta: decisões clínicas E orientações procedimentais ao paciente
  ✅ Retorno com prazo:           "Retorno X meses/ano"
  ✅ Encaminhamentos:             "Encaminhamento: [especialidade ou procedimento]"
  ✅ Prescrição de óculos/lentes: "Prescrição de óculos [tipo]"
  ✅ Suspensão de medicamento:    "Suspender [nome]"
  ✅ Exames solicitados:          "Solicitar campo visual", "Fundo com dilatação"
  ✅ Compressa morna:             "Compressa morna X min — Yx/dia"
  ✅ Higiene palpebral:           "Higiene palpebral com shampoo infantil — Xx/dia"
  (compressa e higiene são orientações ao paciente — SEMPRE em conduta, NUNCA em tratamento)

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

  ★ INFERÊNCIA DE PRESCRIÇÃO DE ÓCULOS (quando o médico não verbaliza explicitamente):
  Em consultas de refração, a prescrição de óculos é a conclusão natural da consulta.
  Você PODE inferir "Prescrição de óculos" quando TODAS as condições abaixo forem verdadeiras:
    a) Houve refração (ticket TOPCON ou refração subjetiva mencionada na consulta).
    b) O médico orientou o paciente a ir a uma ótica ou comprar óculos (mesmo de forma coloquial).
    c) NÃO houve declaração do médico de que não vai prescrever.
  Nesse caso → registre "Prescrição de óculos" (sem tipo se o tipo não for claro).
  Se o médico mencionar multifocal, progressivo, bifocal, perto, longe ou ADD → use o tipo específico.
  ❌ NUNCA inferir prescrição quando o médico não mencionou óculos de forma alguma.

  ⚠️ Longe + perto na MESMA armação = multifocal ou bifocal — NÃO duas linhas separadas.
     Duas prescrições só quando há DUAS armações (ex.: óculos de sol + óculos de leitura).
  ⚠️ "Sem prescrição de óculos" só quando o médico for explícito:
     "não precisa de óculos", "grau não justifica", "sem indicação no momento".
     ❌ NÃO usar quando o médico simplesmente não falou em óculos.

  FILTROS DE DESCARTE — nunca incluir em conduta:
  * ❌ Logística/operacional da clínica: "retirar exames", "buscar exames", "pagar na recepção",
    "agendar no balcão", "entregar receita" → ação do paciente/clínica, não médica
  * ❌ Logística pós-consulta de óculos: "Conferir óculos após prontos", "Retirar óculos na ótica",
    "Buscar óculos quando ficar pronto" → logística do paciente, não decisão médica
    ✅ ÚNICA entrada de óculos: "Prescrição de óculos [tipo]"
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

- tratamento: APENAS medicamentos e substâncias farmacológicas com posologia
  ✅ Colírios nomeados ou por classe: "Vigadexa 1 gota 4x/dia por 7 dias",
     "Associação (ATB + corticoide ocular) 1 gota 3x/dia após higiene palpebral"
  ✅ Lubrificantes oculares: "Lubrificante ocular 1 gota AO ao longo do dia"
  ✅ Medicamentos orais: "Ômega 3 1000mg — 1cp almoço e 1cp jantar por 30 dias"
  ✅ Pomadas oculares com posologia
  ❌ Compressas → vão em CONDUTA
  ❌ Higiene palpebral → vai em CONDUTA
  * Se nenhum medicamento/colírio foi prescrito → null

  EXEMPLOS PARA BLEFARITE (use como referência de separação):
    conduta:    "Retorno 2 semanas"
                "Compressa morna 2 min — 2x/dia"
                "Higiene palpebral com shampoo infantil — 3x/dia"
    tratamento: "Associação (ATB + corticoide ocular) 1 gota 3x/dia após higiene palpebral"
                "Lubrificante ocular 1 gota AO ao longo do dia"
                "Ômega 3 1000mg — 1cp almoço e 1cp jantar por 30 dias"

  ★ Regra da Associação ATB + corticoide (CRÍTICA — quando injectBlefarite=true):
    O TRATAMENTO DEVE incluir a linha:
      "Associação (ATB + corticoide ocular) 1 gota 3x/dia após higiene palpebral"
    Use exatamente esta forma genérica quando o médico não citar nomes em voz —
    NÃO invente nomes de medicamentos.
    A ordem clínica entre conduta e tratamento:
      conduta:    1) Compressa morna  2) Higiene palpebral
      tratamento: 3) Associação ATB+corticoide  4) Lubrificante  5) Ômega 3

══════════════════════════════════════════════════════════════
TESTE OBRIGATÓRIO — ANTES DE CADA LINHA
══════════════════════════════════════════════════════════════
"A instrução envolve um medicamento, colírio ou substância farmacológica com posologia?"
  → Se SIM → vai para TRATAMENTO (colírio, pomada, lubrificante, Ômega 3, etc.)
  → Se NÃO → vai para CONDUTA (compressa, higiene, retorno, encaminhamento, óculos)

Exemplos do teste:
  "Compressa morna 2x/dia"  → procedimento físico, sem droga  → CONDUTA ✅
  "Higiene palpebral"       → procedimento físico, sem droga  → CONDUTA ✅
  "Retorno 1 mês"           → decisão clínica                 → CONDUTA ✅
  "Suspender Xalatan"       → decisão clínica                 → CONDUTA ✅
  "Prescrição de óculos"    → decisão clínica                 → CONDUTA ✅
  "Vigadexa 4x/dia"         → medicamento nomeado             → TRATAMENTO ✅
  "Lubrificante ocular 6x"  → substância farmacológica        → TRATAMENTO ✅
  "Ômega 3 1000mg 1cp/dia"  → suplemento com dose             → TRATAMENTO ✅

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
    "tratamento": "string com \\n entre itens, ou null"
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
    "tratamento": "string com \\n entre itens, ou null"
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