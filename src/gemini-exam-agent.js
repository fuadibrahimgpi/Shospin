/**
 * GEMINI SERVICE v5.3.5 — Agente de Exames (OCR) + Agente de Entrevista
 *
 * v5.3.5 (FIX: eixo não conferido injetado — desempate de eixo por 3ª chamada):
 *   - Discordância de eixo entre 1ª e 2ª leituras (>8°, circular) era 'soft' e
 *     a math-consistency (S+C/2≈SE) NÃO envolve o eixo — então soft+math-ok
 *     jamais bloqueava e o eixo ia NÃO-CONFERIDO ao prontuário (3 de 4 capturas,
 *     log 2026-07-21). Agora dispara _tiebreakAxis (3ª chamada focada só na 3ª
 *     coluna A da MÉDIA), 2-de-3 como já se faz para sinal e cilindro. Diferença
 *     crucial: confirmar a 2ª OU inconclusivo FORÇA bloqueio (severity='hard') —
 *     o eixo não tem corroboração matemática, então "não confirmei" ⇒ "não injeta".
 *
 * v5.3.4 (FIX: sinal de esfera invertido pela verificação + média vs medições):
 *   - Desempate de sinal (3ª chamada): quando 1ª e 2ª leituras discordam da
 *     esfera por flip puro de sinal (+1.00 vs -1.00), uma 3ª chamada focada
 *     APENAS no caractere de sinal decide por 2-de-3. Modo de falha real de
 *     2026-06-12: verify leu "-1.00" onde o ticket imprimia "+1.00" e fabricou
 *     se=-2.12 CALCULADO (s+c/2) em vez de transcrito, bloqueando 2 capturas
 *     corretas em sequência.
 *   - Unanimidade das medições vence a média: se as 3 medições são idênticas
 *     e a "média" diverge, a média foi lida errado (média impressa de 3
 *     valores iguais é igual a eles). Caso real: medições c=-2.25 ×3 com
 *     média c=-2.00 passava na tolerância de 0.50D.
 *   - Prompts (principal e verify): aviso explícito sobre leitura do sinal
 *     (+ vs −) e proibição de calcular o "se" em vez de transcrever.
 *
 * v5.3.3 (FIX: falso positivo de cilindro em tickets sem astigmatismo):
 *   - "pCil=null vs vCil>0.30D" rebaixado de 'hard' → 'soft'.
 *     Quando a 1ª leitura não tem cilindro e é math-consistent (S≈SE),
 *     a alucinação de cilindro pela verificação vira aviso em vez de bloqueio.
 *     Modo de falha documentado: 2ª chamada alucina C=-1.25 em tickets de
 *     miopia pura (sem astigmatismo), impedindo injeção de leituras corretas.
 *
 * v5.3.2 (ANTI-ALUCINAÇÃO DE CILINDRO — 3 CORREÇÕES):
 *   - Divergência de cilindro >0.50D entre 1ª e 2ª chamada agora é 'hard'
 *     (sempre bloqueia injeção). Antes era 'soft' e podia ser ignorada
 *     quando a 1ª leitura era math-consistent.
 *   - Validação de passo dióptrico 0.25D: esfera e cilindro que não são
 *     múltiplos de 0.25 são rejeitados (erro de OCR em tickets degradados).
 *   - Prompt de OCR: portadas regras de anti-truncamento de CIL
 *     (-3.50 lido como -0.50) e incerteza de CYL do SKILL.md.
 *
 * v5.3.1 (DEFESAS CONTRA REFRAÇÃO INCOMPLETA):
 *   - Esférica null → olho inteiro descartado (cilindro sem esfera é
 *     clinicamente impossível e típica alucinação parcial).
 *   - Cilindro presente + eixo null → ambos descartados (cilindro sem eixo
 *     não define direção do astigmatismo, não é injetável).
 *   - Reforço no prompt: regra de completude explicitamente declarada.
 *
 * v5.3 (DEFESAS CONTRA SWAP S↔C):
 *   - Reforço no prompt: aviso explícito sobre ordem fixa das colunas e
 *     armadilha de troca S↔C (não decidir colunas por magnitude).
 *   - S.E. cross-check determinístico: |S + C/2 - S.E.| > 0.30D → falha.
 *     Pega casos onde o modelo lê cilindro errado mas mantém S.E. correto.
 *   - 2ª chamada de verificação independente da refração: prompt diferente,
 *     comparação determinística com a 1ª. Discordância em S, C ou A → falha.
 *     Pega swap S↔C onde 1ª chamada alucina "internamente consistente".
 *
 * v5.2 (REESCRITA OCR):
 *   - GeminiExamAgent reescrito do zero. 1 chamada à API, sem TWO-PASS.
 *   - Foco em "vazio é resposta válida".
 *   - Modelo retorna 3 medições + média + S.E. por olho. Cross-check em JS.
 *   - Sem auto-correção silenciosa. Sem banner com botões.
 *
 * GeminiInterviewAgent preservado da v5.1.
 */

// ============================================================================
// AGENTE 1 — GeminiExamAgent (OCR / Câmera) — v5.2 REESCRITO
// ============================================================================
//
// FILOSOFIA (v5.2):
//   1. Uma única chamada ao Gemini. Sem TWO-PASS. Sem retentativas automáticas.
//   2. Modelo retorna 3 medições + média + S.E. por olho. JS faz cross-check.
//   3. Quando média mostra cilindro mas as 3 medições mostram vazio → null
//      (provável alucinação por simetria visual).
//   4. Validação binária: aceita ou rejeita. Rejeição = pedir nova foto.
//   5. Sem auto-correção silenciosa. Sem botões. Sem heurísticas mágicas.
//
// FLUXO:
//   captura → _preprocessImage → callGeminiAPI(prompt único, imagem)
//          → _postProcessRefraction (cross-check determinístico)
//          → validateExamData → resultado
//   Se ticket invertido 180° detectado pelo modelo: 1 rotação + 1 nova call.
// ============================================================================

const EXAM_CONFIG = { maxOutputTokens: 4096, thinkingBudget: 0 };

class GeminiExamAgent {
  constructor() {
    this.logger = new Logger('GeminiExamAgent');
  }

  // --------------------------------------------------------------------------
  // Pré-processamento de imagem (contraste + grayscale)
  // --------------------------------------------------------------------------
  async _preprocessImage(base64Image) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Contraste padrão (c=60 → fator ≈ 1.6). Aumenta separação texto/fundo
        // sem distorcer. Conversão para escala de cinza (pesos ITU-R BT.601).
        const C = 60;
        const factor = (259 * (C + 255)) / (255 * (259 - C));

        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const newGray = Math.max(0, Math.min(255, factor * (gray - 128) + 128));
          data[i] = newGray;
          data[i + 1] = newGray;
          data[i + 2] = newGray;
        }

        ctx.putImageData(imageData, 0, 0);
        const processedBase64 = canvas.toDataURL('image/jpeg', 0.95);
        resolve(processedBase64.replace(/^data:image\/\w+;base64,/, ''));
      };

      img.onerror = () => {
        this.logger.warn('Falha no pré-processamento, usando imagem original');
        resolve(base64Image.replace(/^data:image\/\w+;base64,/, ''));
      };

      img.src = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  // --------------------------------------------------------------------------
  // Rotação 180° (correção de ticket grampeado e fotografado pelo verso)
  // --------------------------------------------------------------------------
  async _rotateImage180(base64Image) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI);
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
  // Extração principal
  // --------------------------------------------------------------------------
  async extractExams(imagesBase64, onProgress, _isRetry = false) {
    const images = Array.isArray(imagesBase64) ? imagesBase64 : [imagesBase64];
    this.logger.info(`[OCR] Analisando ${images.length} imagem(ns)`);

    if (onProgress) onProgress('reading');

    this.logger.info('[OCR] Pré-processando imagens...');
    const processedImages = await Promise.all(
      images.map(img => this._preprocessImage(img))
    );

    let imageParts = processedImages.map(b64 => ({
      inlineData: { mimeType: 'image/jpeg', data: b64 }
    }));
    const prompt = this._getExamPrompt();

    // 1ª chamada
    let raw;
    try {
      const { text } = await apiService.callGeminiAPI(
        [{ text: prompt }, ...imageParts],
        EXAM_CONFIG
      );
      raw = _parseGeminiJSON(text, 'exames');
    } catch (err) {
      this.logger.error('[OCR] Falha na chamada à API:', err);
      return this._captureFailed('Erro na comunicação com a IA. Tente novamente.');
    }

    // Ticket invertido 180° → rotacionar e reenviar (uma vez só)
    if (raw && raw._ticketInvertido === true) {
      this.logger.warn('[OCR] Ticket invertido 180° detectado — rotacionando');
      const rotated = await Promise.all(
        processedImages.map(b64 => this._rotateImage180(b64))
      );
      imageParts = rotated.map(b64 => ({
        inlineData: { mimeType: 'image/jpeg', data: b64 }
      }));
      try {
        const { text } = await apiService.callGeminiAPI(
          [{ text: prompt }, ...imageParts],
          EXAM_CONFIG
        );
        raw = _parseGeminiJSON(text, 'exames');
        if (raw) raw._ticketFoiRotacionado = true;
      } catch (err) {
        this.logger.error('[OCR] Falha após rotação:', err);
        return this._captureFailed('Erro ao re-ler o ticket rotacionado.');
      }
    }

    this.logger.info('[OCR] Resposta bruta do modelo:\n' + JSON.stringify(raw, null, 2));

    // Pós-processamento determinístico
    const processed = this._postProcessRefraction(raw);

    // ── DEFESA: 2ª chamada independente para verificar refração ────────────
    // Se a 1ª call produziu refração válida, fazer uma 2ª call com prompt
    // diferente e focado APENAS em refração. Comparar resultados. Discordância
    // em S, C ou A → bloquear. Pega swap S↔C e outras alucinações que a 1ª
    // call faria de forma "internamente consistente".
    //
    // Custo: 1 call extra (~5-10s). Valor: bloqueia o caso de hoje (OE com
    // S e C trocados, onde a 1ª call mostrou consistência interna falsa).
    if (!processed._captureFailed && processed.refracao &&
        (processed.refracao.od || processed.refracao.oe)) {
      try {
        this.logger.info('[OCR] Verificação independente (2ª chamada)...');
        const verifyPrompt = this._getRefractionVerifyPrompt();
        const { text: verifyText } = await apiService.callGeminiAPI(
          [{ text: verifyPrompt }, ...imageParts],
          EXAM_CONFIG
        );
        const verify = _parseGeminiJSON(verifyText, 'verify');
        this.logger.info('[OCR] Verificação retornou:\n' + JSON.stringify(verify, null, 2));

        let mismatch = this._compareRefractionAgainstVerify(processed.refracao, verify);

        // ── Desempate de sinal de esfera (3ª chamada focada) ──────────────
        // Modo de falha recorrente (2026-06-12): a 2ª chamada lê o sinal da
        // esfera invertido (+1.00 → -1.00) e fabrica um "se" calculado de
        // s+c/2 coerente com o próprio erro. Quando a discordância é flip
        // puro de sinal (mesma magnitude), uma 3ª chamada que olha APENAS o
        // caractere de sinal desempata: 2-de-3 vence. Isso não viola a lição
        // "alucinação math-consistent em esfera" — o desempate é evidência
        // EXTERNA nova (3ª leitura), não auto-coerência da 1ª.
        if (mismatch && mismatch.severity === 'hard' && mismatch.signFlip) {
          const veredito = await this._tiebreakSphereSign(mismatch, imageParts, apiService);
          if (veredito === 'primeira') {
            processed._avisos = processed._avisos || [];
            processed._avisos.push(`${mismatch.eye.toUpperCase()}: 2ª chamada leu o sinal da esfera invertido (1ª="${mismatch.pEsfStr}" vs 2ª="${mismatch.vEsfStr}"); desempate por 3ª leitura confirmou a 1ª (2-de-3). Confira manualmente.`);
            mismatch = null;
          } else if (veredito === 'segunda') {
            mismatch.message = `${mismatch.eye.toUpperCase()}: sinal da esfera da 1ª leitura provavelmente invertido — desempate (3ª leitura) concordou com a 2ª ("${mismatch.vEsfStr}"). Refaça a captura.`;
          }
          // veredito null (3ª ilegível/divergente) → mantém o bloqueio original
        }

        // ── Desempate de Cilindro (3ª chamada focada) ──────────────
        // Ocorre quando há confusão/pulo de linha entre Média e Medições.
        // A 3ª chamada foca apenas na coluna central (C) da linha MÉDIA.
        if (mismatch && mismatch.isCylinderMismatch && mismatch.pCil !== null && mismatch.vCil !== null) {
          const eyeData = processed.refracao[mismatch.eye];
          const mathConsistent = this._isEyeMathConsistent(eyeData);
          if (mathConsistent || mismatch.severity === 'hard') {
            const vereditoCil = await this._tiebreakCylinder(mismatch, imageParts, apiService);
            if (vereditoCil === 'primeira') {
              processed._avisos = processed._avisos || [];
              processed._avisos.push(`${mismatch.eye.toUpperCase()}: 2ª chamada leu cilindro diferente (1ª="${mismatch.pCil}" vs 2ª="${mismatch.vCil}"); desempate por 3ª leitura confirmou a 1ª. Confira manualmente.`);
              mismatch = null;
            } else if (vereditoCil === 'segunda') {
              mismatch.message = `${mismatch.eye.toUpperCase()}: erro na 1ª leitura do cilindro — desempate (3ª leitura) concordou com a 2ª ("${mismatch.vCil}"). Refaça a captura.`;
            }
            // veredito nulo → mantém o bloqueio original
          }
        }

        // ── Desempate de Eixo (3ª chamada focada) ──────────────
        // Eixo discordante é 'soft', mas a math-consistency (S+C/2≈SE) NÃO
        // envolve o eixo — então soft+math-ok jamais bloqueava e o eixo ia
        // NÃO-CONFERIDO ao prontuário (3 de 4 capturas, log 2026-07-21). Uma
        // 3ª leitura focada só na 3ª coluna (A) da MÉDIA desempata 2-de-3, como
        // já se faz para sinal e cilindro. Diferença crucial: quando o desempate
        // confirma a 2ª OU é inconclusivo, FORÇA bloqueio (severity='hard') — ao
        // contrário de S/C, o eixo não tem corroboração matemática que o resgate,
        // então "não pude confirmar" ⇒ "não injeta".
        if (mismatch && mismatch.isAxisMismatch && mismatch.pEixo != null && mismatch.vEixo != null) {
          const vereditoEixo = await this._tiebreakAxis(mismatch, imageParts, apiService);
          if (vereditoEixo === 'primeira') {
            processed._avisos = processed._avisos || [];
            processed._avisos.push(`${mismatch.eye.toUpperCase()}: 2ª chamada leu eixo diferente (1ª=${mismatch.pEixo}° vs 2ª=${mismatch.vEixo}°); desempate por 3ª leitura confirmou a 1ª. Confira manualmente.`);
            mismatch = null;
          } else {
            mismatch.severity = 'hard';
            mismatch.message = vereditoEixo === 'segunda'
              ? `${mismatch.eye.toUpperCase()}: eixo da 1ª leitura provavelmente errado — desempate (3ª leitura) concordou com a 2ª (${mismatch.vEixo}°). Refaça a captura.`
              : `${mismatch.eye.toUpperCase()}: eixo discordante entre leituras (1ª=${mismatch.pEixo}° vs 2ª=${mismatch.vEixo}°) e 3ª leitura não desempatou. Refaça a captura.`;
          }
        }

        if (mismatch) {
          // Política: se a discordância é 'soft' (numérica) E o olho da 1ª
          // leitura é matematicamente autoconsistente (S+C/2 ≈ S.E. com diff
          // ≤ 0.15D), trate como aviso — confia-se na 1ª leitura porque
          // alucinar 3 valores simultaneamente coerentes com a matemática é
          // raríssimo. Discordâncias 'hard' (null vs valor, olho ausente)
          // bloqueiam sempre.
          const eyeData = processed.refracao[mismatch.eye];
          const mathConsistent = this._isEyeMathConsistent(eyeData);
          const shouldBlock = mismatch.severity === 'hard' || !mathConsistent;

          processed._avisos = processed._avisos || [];
          if (shouldBlock) {
            processed._captureFailed = true;
            processed._blockAutoInject = true;
            processed._reason = mismatch.message;
            processed._validationWarnings = [mismatch.message];
            processed._avisos.push(mismatch.message);
          } else {
            const aviso = `${mismatch.message} (1ª leitura matematicamente consistente — não bloqueado, confira manualmente)`;
            processed._avisos.push(aviso);
          }
        } else {
          processed._avisos = processed._avisos || [];
          processed._avisos.push('Verificação independente concorda com a 1ª leitura.');
        }
      } catch (err) {
        this.logger.warn('[OCR] Verificação 2ª chamada falhou:', err.message);
        // Não bloqueia — registra aviso e segue. Falhar a verificação é diferente
        // de detectar discordância: pode ser erro de rede.
        processed._avisos = processed._avisos || [];
        processed._avisos.push('Verificação independente da refração não pôde ser realizada — confira manualmente.');
      }
    }

    // ── AUTO-RETRY: swap S↔C na 1ª leitura ──────────────────────────────
    // Quando todos os olhos são descartados por s=null mas o raw tinha
    // cilindro presente, o modelo confundiu colunas S↔C. Repetir o pipeline
    // completo (1ª call + verify) com as mesmas imagens restaura as garantias
    // de duas leituras independentes sem baixar a barra de segurança.
    // _isRetry previne recursão infinita se a 2ª tentativa também falhar.
    if (!_isRetry) {
      const _todosDescartados = processed.refracao &&
          !processed.refracao.od && !processed.refracao.oe;
      const _rawTemCilSemEsfera = ['od', 'oe'].some(l => {
        const e = raw?.refracao?.[l];
        return e && e.media?.s == null && e.media?.c != null;
      });
      if (_todosDescartados && _rawTemCilSemEsfera) {
        this.logger.warn('[OCR] Swap S↔C detectado (s=null, c presente) — repetindo pipeline automaticamente...');
        const retry = await this.extractExams(imagesBase64, null, true);
        if (!retry._captureFailed && (retry.refracao?.od || retry.refracao?.oe)) {
          retry._avisos = retry._avisos || [];
          retry._avisos.unshift('Releitura automática (1ª chamada confundiu S↔C). Confira manualmente.');
          return retry;
        }
        this.logger.warn('[OCR] Releitura automática também falhou — retornando resultado original.');
      }
    }

    this.logger.info('[OCR] Resultado final:\n' + JSON.stringify({
      refracao: processed.refracao,
      tonometria: processed.tonometria,
      paquimetria: processed.paquimetria,
      _avisos: processed._avisos,
      _captureFailed: processed._captureFailed,
      _reason: processed._reason
    }, null, 2));

    return processed;
  }

  /**
   * Prompt da 2ª chamada — focada APENAS em refração, com framing diferente
   * do prompt principal para minimizar chance de mesmo erro nas duas calls.
   */
  _getRefractionVerifyPrompt() {
    return `VERIFICAÇÃO INDEPENDENTE DE REFRAÇÃO.

Você está vendo um ticket TOPCON. Sua única tarefa é confirmar três valores por olho a partir da seção REF.DATA, mais o valor de S.E. para cross-check.

ESTRUTURA DAS COLUNAS — ORDEM FIXA E INVIOLÁVEL:
  1ª coluna (esquerda)  = S (esfera)
  2ª coluna (meio)      = C (cilindro)
  3ª coluna (direita)   = A (eixo)

Os marcadores <R> = OD e <L> = OE.

LAYOUT VERTICAL DE CADA OLHO (de cima para baixo):
  <N medições individuais> (pode haver 1, 2 ou 3 linhas de medições)
  MÉDIA        (3 valores: S, C, A)   ← É DAQUI que você lê s, c, a
  S.E. X.XX    (1 valor único)        ← É DAQUI que você lê se

⚠ ESTRATÉGIA OBRIGATÓRIA PARA ACHAR A MÉDIA (De baixo para cima):
A quantidade de medições varia. Se você tentar contar linhas de cima para baixo, VOCÊ VAI LER A LINHA ERRADA caso o ticket tenha menos de 3 medições. Siga estes passos de forma estrita:
  1. Primeiro localize visualmente a linha "S.E." (tem o rótulo literal "S.E.").
  2. A linha IMEDIATAMENTE ACIMA da S.E. é a MÉDIA. É dela que você tira s, c, a.
  3. Reporte também o valor da linha S.E. no campo "se" da resposta.
  4. SANITY CHECK ANTES DE ENVIAR: se o seu "s" for igual ao seu "se", você leu a linha errada. Volte uma linha acima e releia s.
  5. SANITY CHECK 2: se s, c, a foram lidos corretamente, deve valer s + c/2 ≈ se (tolerância 0.25D). Se não vale, releia.

⚠ 2º ERRO MAIS COMUM: inverter o SINAL da esfera (ler "+1.00" como "-1.00").
O sinal (+ ou −) está impresso explicitamente antes de cada valor da coluna S.
Leia o caractere de sinal como um passo separado: "+" tem traço vertical E horizontal;
"−" tem APENAS o horizontal (em impressão térmica o traço vertical pode sair fraco).
Hipermetropia (esfera positiva) é tão comum quanto miopia — NUNCA escolha o sinal
por expectativa clínica.

⚠ O campo "se" é TRANSCRIÇÃO LITERAL da linha "S.E." impressa — NUNCA cálculo.
Se você se pegar calculando s + c/2 para preencher "se", PARE: reporte o que está
IMPRESSO, ou null se a linha estiver ilegível. Um "se" calculado torna o cross-check
circular e inútil — ele só tem valor se for lido independentemente do papel.

⚠ REGRA INVIOLÁVEL — TROCA S↔C:
NUNCA decida qual coluna é S ou C pela magnitude. Um olho pode ter S=-0.25 e C=-3.75 (esfera pequena, cilindro grande) — isso é astigmatismo de alto grau, plenamente clínico. Respeite a ordem impressa da esquerda para direita.

Se uma célula está em branco (sem dígitos), retorne null.
Se o olho inteiro está ilegível, retorne null no lugar do objeto.
Se a coluna de cilindro mostra "0.00" ou "----", retorne null para c e a.

⚠ PLANO/PL NA ESFERA: O TOPCON imprime literalmente "PLANO" ou "PL" quando a esfera é 0.00.
Se você ler "PLANO" ou "PL" na coluna S, retorne "plano" — NUNCA "+0.25" ou qualquer número.

CYL: (-) entre as colunas é apenas marcador de convenção (TOPCON usa negativo). Ignore.
KRT.DATA (ceratometria) NÃO é refração. Ignore.

Retorne JSON PURO (sem markdown, sem comentários):
{
  "od": {"s": "string_com_sinal_ou_null", "c": numero_negativo_ou_null, "a": inteiro_ou_null, "se": "string_com_sinal_ou_null"},
  "oe": {"s": "string_com_sinal_ou_null", "c": numero_negativo_ou_null, "a": inteiro_ou_null, "se": "string_com_sinal_ou_null"}
}
`;
  }

  /**
   * Desempate de sinal de esfera — 3ª chamada hiperfocada.
   *
   * Disparada pelo caller quando 1ª e 2ª leituras discordam da esfera por
   * flip puro de sinal. Pergunta APENAS o caractere de sinal e a magnitude
   * da coluna S da linha MÉDIA. A magnitude serve de guarda: se não bater
   * com a magnitude em disputa, a 3ª leu outra célula e o desempate é
   * descartado (retorna null → bloqueio original mantido).
   *
   * Retorna 'primeira' | 'segunda' | null.
   */
  async _tiebreakSphereSign(mismatch, imageParts, apiService) {
    try {
      this.logger.info(`[OCR] Desempate de sinal da esfera (3ª chamada) para ${mismatch.eye.toUpperCase()}...`);
      const { text } = await apiService.callGeminiAPI(
        [{ text: this._getSphereSignTiebreakPrompt() }, ...imageParts],
        EXAM_CONFIG
      );
      const tie = _parseGeminiJSON(text, 'tiebreak');
      const t = tie?.[mismatch.eye];
      if (!t || (t.sinal !== '+' && t.sinal !== '-')) {
        this.logger.warn('[OCR] Desempate não retornou sinal legível:', JSON.stringify(tie));
        return null;
      }
      const mag = parseFloat(t.magnitude);
      if (isNaN(mag) || Math.abs(mag - Math.abs(mismatch.pEsf)) > 0.25) {
        this.logger.warn(`[OCR] Desempate leu magnitude ${t.magnitude}, incompatível com a disputa (|${mismatch.pEsf}|) — descartado`);
        return null;
      }
      const sinal1 = mismatch.pEsf >= 0 ? '+' : '-';
      this.logger.info(`[OCR] Desempate retornou "${t.sinal}${t.magnitude}" (1ª leu sinal "${sinal1}")`);
      return t.sinal === sinal1 ? 'primeira' : 'segunda';
    } catch (err) {
      this.logger.warn('[OCR] Desempate de sinal falhou:', err.message);
      return null;
    }
  }

  _getSphereSignTiebreakPrompt() {
    return `DESEMPATE DE SINAL DE ESFERA — TAREFA ÚNICA E MÍNIMA.

Você vê um ticket TOPCON. Na seção REF.DATA há dois blocos: <R> (olho direito) e <L> (olho esquerdo).
Em cada bloco, localize a linha MÉDIA: a linha em negrito imediatamente ACIMA da linha "S.E.".

Sua ÚNICA tarefa: para cada olho, transcrever o PRIMEIRO valor dessa linha MÉDIA
(coluna S, a mais à esquerda), separando o CARACTERE DE SINAL da MAGNITUDE.

Examine o caractere de sinal com máxima atenção:
  • "+" tem um traço VERTICAL e um horizontal.
  • "−" tem APENAS o traço horizontal.
  • Em impressão térmica o traço vertical do "+" pode sair fraco — olhe de perto.
  • NÃO use plausibilidade clínica para decidir: hipermetropia (+) e miopia (−) são ambas comuns.

Se o sinal estiver ilegível ou ambíguo, retorne null no campo "sinal". Não chute.

Responda APENAS JSON puro (sem markdown):
{"od": {"sinal": "+", "magnitude": "1.00"}, "oe": {"sinal": "-", "magnitude": "0.75"}}
`;
  }

  /**
   * Desempate de Cilindro — 3ª chamada hiperfocada.
   */
  async _tiebreakCylinder(mismatch, imageParts, apiService) {
    try {
      this.logger.info(`[OCR] Desempate de Cilindro (3ª chamada) para ${mismatch.eye.toUpperCase()}...`);
      const { text } = await apiService.callGeminiAPI(
        [{ text: this._getCylinderTiebreakPrompt() }, ...imageParts],
        EXAM_CONFIG
      );
      const tie = _parseGeminiJSON(text, 'tiebreak_cil');
      const t = tie?.[mismatch.eye];
      if (t === undefined || t === null) {
        this.logger.warn('[OCR] Desempate de cilindro não retornou leitura legível');
        return null;
      }
      
      const vCil = t === "null" ? null : parseFloat(t);
      if (vCil !== null && isNaN(vCil)) return null;

      // Se leu igual a pCil, a primeira estava certa
      if (vCil === mismatch.pCil || (vCil !== null && mismatch.pCil !== null && Math.abs(vCil - mismatch.pCil) < 0.01)) {
        this.logger.info(`[OCR] Desempate de Cilindro retornou "${vCil}" (Confirmou a 1ª)`);
        return 'primeira';
      }
      
      // Se leu igual a vCil, a segunda estava certa
      if (vCil === mismatch.vCil || (vCil !== null && mismatch.vCil !== null && Math.abs(vCil - mismatch.vCil) < 0.01)) {
        this.logger.info(`[OCR] Desempate de Cilindro retornou "${vCil}" (Confirmou a 2ª)`);
        return 'segunda';
      }

      this.logger.warn(`[OCR] Desempate de Cilindro retornou um 3º valor diferente: ${vCil} (Disputa era ${mismatch.pCil} vs ${mismatch.vCil})`);
      return null;
    } catch (err) {
      this.logger.warn('[OCR] Desempate de Cilindro falhou:', err.message);
      return null;
    }
  }

  _getCylinderTiebreakPrompt() {
    return `DESEMPATE DE CILINDRO — TAREFA ÚNICA E MÍNIMA.

Você vê um ticket TOPCON. Na seção REF.DATA há dois blocos: <R> (olho direito) e <L> (olho esquerdo).

Sua ÚNICA tarefa: para cada olho, identificar a linha da MÉDIA e ler EXCLUSIVAMENTE O SEGUNDO NÚMERO (Coluna do Meio - Cilindro).
NÃO conte as linhas de cima para baixo. A linha MÉDIA é a linha em negrito que fica IMEDIATAMENTE ACIMA da linha que diz "S.E.".

Leia apenas a coluna do meio (C). Se o valor estiver vazio, em branco, ou ausente, retorne a string "null".

Responda APENAS JSON puro (sem markdown). Exemplo de formato:
{"od": "-0.50", "oe": "-3.00"}
`;
  }

  /**
   * Desempate de Eixo — 3ª chamada hiperfocada.
   *
   * Disparada quando 1ª e 2ª discordam do eixo (>8°, circular). Lê APENAS a 3ª
   * coluna (A) da linha MÉDIA. Comparação circular (1° ≡ 180°). O valor da 3ª
   * leitura precisa bater com a 1ª OU a 2ª (±8°); um 3º valor diferente é
   * inconclusivo. Retorna 'primeira' | 'segunda' | null.
   */
  async _tiebreakAxis(mismatch, imageParts, apiService) {
    try {
      this.logger.info(`[OCR] Desempate de Eixo (3ª chamada) para ${mismatch.eye.toUpperCase()}...`);
      const { text } = await apiService.callGeminiAPI(
        [{ text: this._getAxisTiebreakPrompt() }, ...imageParts],
        EXAM_CONFIG
      );
      const tie = _parseGeminiJSON(text, 'tiebreak_eixo');
      const t = tie?.[mismatch.eye];
      if (t === undefined || t === null || t === 'null') {
        this.logger.warn('[OCR] Desempate de Eixo não retornou leitura legível');
        return null;
      }
      const tEixo = parseInt(t, 10);
      if (isNaN(tEixo)) return null;
      const circ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 180 - d); };
      if (circ(tEixo, mismatch.pEixo) <= 8) {
        this.logger.info(`[OCR] Desempate de Eixo retornou ${tEixo}° (confirmou a 1ª)`);
        return 'primeira';
      }
      if (circ(tEixo, mismatch.vEixo) <= 8) {
        this.logger.info(`[OCR] Desempate de Eixo retornou ${tEixo}° (confirmou a 2ª)`);
        return 'segunda';
      }
      this.logger.warn(`[OCR] Desempate de Eixo retornou um 3º valor: ${tEixo}° (disputa era ${mismatch.pEixo}° vs ${mismatch.vEixo}°) — inconclusivo`);
      return null;
    } catch (err) {
      this.logger.warn('[OCR] Desempate de Eixo falhou:', err.message);
      return null;
    }
  }

  _getAxisTiebreakPrompt() {
    return `DESEMPATE DE EIXO — TAREFA ÚNICA E MÍNIMA.

Você vê um ticket TOPCON. Na seção REF.DATA há dois blocos: <R> (olho direito) e <L> (olho esquerdo).

Sua ÚNICA tarefa: para cada olho, identificar a linha da MÉDIA e ler EXCLUSIVAMENTE O TERCEIRO NÚMERO (Coluna da Direita — Eixo/A).
NÃO conte as linhas de cima para baixo. A linha MÉDIA é a linha em negrito que fica IMEDIATAMENTE ACIMA da linha que diz "S.E.".

O eixo é um inteiro de 1 a 180, SEM sinal. Se a coluna estiver vazia, em branco, ou ausente, retorne a string "null".

Responda APENAS JSON puro (sem markdown). Exemplo de formato:
{"od": 84, "oe": 64}
`;
  }

  /**
   * Checa se o olho da 1ª leitura é matematicamente autoconsistente:
   * esf, cil e se todos presentes e |esf + cil/2 - se| <= 0.15D.
   *
   * Quando um olho passa nessa checagem, é evidência forte de que a 1ª leitura
   * leu corretamente os 3 valores (alucinar três números simultaneamente
   * coerentes com a matemática é raríssimo). Nesse caso, discordâncias da
   * verificação independente em S/C/A são tratadas como aviso, não bloqueio.
   */
  _isEyeMathConsistent(eye) {
    if (!eye) return false;
    if (eye.se == null || eye.esf == null) return false;
    const esf = String(eye.esf).toLowerCase() === 'plano' ? 0 : parseFloat(eye.esf);
    const cil = eye.cil != null ? parseFloat(eye.cil) : 0;
    const se = parseFloat(eye.se);
    if (isNaN(esf) || isNaN(se)) return false;
    const seCalc = esf + cil / 2;
    return Math.abs(seCalc - se) <= 0.15;
  }

  /**
   * Compara refração da 1ª call (pós-processada) com a 2ª call de verificação.
   * Retorna { eye, message, severity } descrevendo a discordância, ou null.
   *
   * Severidade:
   *   - 'hard'  → sempre bloqueia (null vs valor significativo, olho ausente,
   *               discordância de ESFERA sem assinatura de erro da 2ª).
   *   - 'soft'  → bloqueia, exceto se o olho da 1ª for matematicamente
   *               autoconsistente (S+C/2 ≈ S.E.). Nesse caso, o caller
   *               converte em aviso. Aplica-se a CIL, EIXO, e ao caso
   *               específico de "2ª chamada confundiu linha S.E. com esfera"
   *               (ver bloco abaixo).
   *
   * Tolerâncias:
   *   - Esfera: ±0.30D — mismatch acima é 'hard', EXCETO quando há
   *     assinatura clara de erro da 2ª chamada (s reportado pela 2ª bate
   *     com SE da 1ª e/ou com seu próprio se reportado). Esse caso vira
   *     'soft' e só passa se a 1ª for math-consistent.
   *   - Cilindro: ±0.30D (null vs valor significativo é hard; valor vs valor é soft)
   *   - Eixo: ±8° (com tratamento circular: 1° e 180° são adjacentes)
   */
  _compareRefractionAgainstVerify(processed, verify) {
    if (!verify || typeof verify !== 'object') return null; // sem verificação válida — não bloqueia

    for (const lado of ['od', 'oe']) {
      const p = processed[lado];
      const v = verify[lado];

      // Ambos null: tudo bem
      if (!p && !v) continue;

      // Discordância de presença/ausência do olho
      if (!p && v && (v.s != null || v.c != null)) {
        return { eye: lado, severity: 'hard', message: `${lado.toUpperCase()}: 1ª leitura disse "olho ausente" mas verificação encontrou valores (${JSON.stringify(v)}). Refaça a captura.` };
      }
      if (p && !v) continue; // verificação não conseguiu — não é evidência de erro na 1ª

      // ── Esfera ──
      // Discordância de esfera é 'hard' por padrão: quando o modelo alucina S
      // na 1ª, ele costuma alucinar S.E. coerente, e só o verify externo
      // distingue verdade de coerência interna.
      //
      // EXCEÇÃO — "verify confundiu S.E. com esfera":
      // Quando a 2ª chamada desce uma linha e lê a S.E. como se fosse a
      // esfera, ela retorna um valor que bate com o SE da 1ª (ou com seu
      // próprio "se" reportado). Esse é um modo de falha observado e
      // documentado da 2ª chamada (prompt frágil quando a média não está
      // em negrito visível). Quando a assinatura aparece E a 1ª é
      // math-consistent (S+C/2 ≈ S.E.), confiamos na 1ª: a mismatch vira
      // 'soft' e o caller a degrada para aviso.
      const pEsfStr = p.esf != null ? String(p.esf).toLowerCase() : p.esf;
      const vEsfStr = v?.s != null ? String(v.s).toLowerCase() : v?.s;
      const pEsf = pEsfStr === 'plano' ? 0 : parseFloat(pEsfStr);
      const vEsf = vEsfStr === 'plano' ? 0 : parseFloat(vEsfStr);
      if (!isNaN(pEsf) && !isNaN(vEsf)) {
        if (Math.abs(pEsf - vEsf) > 0.30) {
          const pSeStr = p.se != null ? String(p.se).toLowerCase() : p.se;
          const vSeStr = v?.se != null ? String(v.se).toLowerCase() : v?.se;
          const pSe = pSeStr === 'plano' ? 0 : (pSeStr != null ? parseFloat(pSeStr) : NaN);
          const vSe = vSeStr === 'plano' ? 0 : (vSeStr != null ? parseFloat(vSeStr) : NaN);

          // (a) esfera e SE da 1ª são distinguíveis (cilindro significativo)
          const esfSeDistinguivel = !isNaN(pSe) && Math.abs(pEsf - pSe) > 0.20;
          // (b) verify.s bate com SE da 1ª (verify leu uma linha abaixo)
          const verifyBateComSe1 = !isNaN(pSe) && Math.abs(vEsf - pSe) <= 0.15;
          // (c) verify se auto-contradiz: reportou s == se (leu mesma célula 2x)
          const verifyAutoConfuso = !isNaN(vSe) && Math.abs(vEsf - vSe) <= 0.15;
          // (d) a 1ª leitura é matematicamente coerente
          const mathOk = this._isEyeMathConsistent(p);

          const assinaturaErroVerify = esfSeDistinguivel && (verifyBateComSe1 || verifyAutoConfuso);

          if (assinaturaErroVerify && mathOk) {
            const evidencia = [];
            if (verifyBateComSe1) evidencia.push(`s da 2ª (${vEsfStr}) bate com S.E. da 1ª (${pSeStr})`);
            if (verifyAutoConfuso) evidencia.push(`2ª reportou s=${vEsfStr} e se=${vSeStr} (iguais)`);
            return { eye: lado, severity: 'soft', message: `${lado.toUpperCase()}: 2ª chamada provavelmente leu linha S.E. como esfera (${evidencia.join('; ')}); 1ª leitura é internamente coerente (S+C/2≈S.E.). Confira manualmente.` };
          }

          // Flip puro de sinal (+1.00 vs -1.00): mesma magnitude, sinais
          // opostos. O caller dispara desempate por 3ª chamada nesse caso.
          const signFlip = pEsf !== 0 && Math.abs(pEsf + vEsf) < 0.01;
          return { eye: lado, severity: 'hard', signFlip, pEsf, vEsf, pEsfStr, vEsfStr, message: `${lado.toUpperCase()}: esfera discordante entre leituras (1ª="${pEsfStr}" vs 2ª="${vEsfStr}"). Refaça a captura.` };
        }
      } else if (!isNaN(pEsf) && isNaN(vEsf) && vEsfStr != null) {
        return { eye: lado, severity: 'hard', message: `${lado.toUpperCase()}: esfera da 2ª leitura não pôde ser interpretada ("${vEsfStr}"). Refaça a captura.` };
      }

      // ── Cilindro descartado por eixo ausente na 1ª leitura ──
      // O olho já foi reduzido a esférico puro de propósito. Divergência de
      // cilindro/eixo com a verificação é esperada (a 2ª leitura pode até achar
      // o cilindro), mas não deve bloquear: ambas concordam na esfera e só o
      // astigmatismo — sem eixo — é não-injetável. A esfera já foi conferida.
      if (p._cilDescartadoPorEixo) continue;

      // ── Cilindro ──
      const pCil = p?.cil != null ? parseFloat(p.cil) : null;
      const vCil = v?.c != null ? parseFloat(v.c) : null;
      // null vs valor significativo (>0.30D) → soft: deixa math-consistency decidir.
      // Quando 1ª leu sem cilindro e S≈SE (math-consistent), a verificação
      // provavelmente alucionou o cilindro — modo de falha documentado em tickets
      // sem astigmatismo. Hard bloquearia injeções corretas sistematicamente.
      if (pCil === null && vCil !== null && !isNaN(vCil) && Math.abs(vCil) > 0.30) {
        return { eye: lado, severity: 'soft', message: `${lado.toUpperCase()}: 1ª leitura disse "sem cilindro" mas verificação leu C=${vCil}. Refaça a captura.` };
      }
      if (pCil !== null && (vCil === null || isNaN(vCil)) && Math.abs(pCil) > 0.30) {
        return { eye: lado, severity: 'hard', message: `${lado.toUpperCase()}: 1ª leitura disse C=${pCil} mas verificação não encontrou cilindro. Refaça a captura.` };
      }
      // Ambos valores: divergência >0.50D é hard (sempre bloqueia);
      // divergência 0.30-0.50D é soft (bloqueia se não math-consistent).
      // Razão: o Gemini pode alucinar cilindro E SE coerente entre si,
      // enganando a math-consistency. Divergência grande entre chamadas
      // é evidência externa que não pode ser ignorada.
      if (pCil !== null && vCil !== null && !isNaN(vCil)) {
        const cilDiff = Math.abs(pCil - vCil);
        if (cilDiff > 0.50) {
          return { eye: lado, severity: 'hard', isCylinderMismatch: true, pCil, vCil, message: `${lado.toUpperCase()}: cilindro muito discordante entre leituras (1ª=${pCil} vs 2ª=${vCil}, Δ=${cilDiff.toFixed(2)}D). Refaça a captura.` };
        }
        if (cilDiff > 0.30) {
          return { eye: lado, severity: 'soft', isCylinderMismatch: true, pCil, vCil, message: `${lado.toUpperCase()}: cilindro discordante entre leituras (1ª=${pCil} vs 2ª=${vCil}, Δ=${cilDiff.toFixed(2)}D). Refaça a captura.` };
        }
      }

      // ── Eixo (só se ambos têm cilindro presente) ──
      if (pCil !== null && vCil !== null && p?.eixo != null && v?.a != null) {
        const pEixo = parseInt(p.eixo, 10);
        const vEixo = parseInt(v.a, 10);
        if (!isNaN(pEixo) && !isNaN(vEixo)) {
          const diff = Math.abs(pEixo - vEixo);
          const circularDiff = Math.min(diff, 180 - diff); // 1° ≡ 180°
          if (circularDiff > 8) {
            return { eye: lado, severity: 'soft', isAxisMismatch: true, pEixo, vEixo, message: `${lado.toUpperCase()}: eixo discordante entre leituras (1ª=${pEixo}° vs 2ª=${vEixo}°). Refaça a captura.` };
          }
        }
      }
    }
    return null;
  }

  _captureFailed(reason) {
    return {
      refracao: null,
      tonometria: null,
      paquimetria: null,
      _captureFailed: true,
      _blockAutoInject: true,
      _reason: reason,
      _avisos: [reason],
      _validationWarnings: [reason]
    };
  }

  // --------------------------------------------------------------------------
  // Prompt único — formato vertical, foco em "vazio é resposta válida"
  // --------------------------------------------------------------------------
  _getExamPrompt() {
    return `Você é um OCR especializado em tickets TOPCON (autorrefrator/tonômetro/paquímetro). Você receberá UMA OU MAIS fotos do MESMO ticket. Extraia SOMENTE o que está IMPRESSO. Sua saída deve ser JSON puro.

╔══════════════════════════════════════════════════════════════════════╗
║ REGRA SUPREMA — VAZIO É UMA RESPOSTA VÁLIDA                          ║
╠══════════════════════════════════════════════════════════════════════╣
║ Quando uma posição no ticket está em branco, sem dígitos visíveis,   ║
║ retorne null para esse campo. É CLINICAMENTE COMUM (e correto) que   ║
║ um olho tenha cilindro/eixo e o outro NÃO tenha NADA naquelas        ║
║ colunas. NUNCA copie valor de um olho para o outro. NUNCA invente    ║
║ valor por simetria visual ou "porque o outro olho tem".              ║
║                                                                      ║
║ Inventar um número é o PIOR erro possível — sempre pior do que       ║
║ retornar null. O cilindro é o campo onde alucinação mais ocorre:     ║
║ tenha disciplina extrema.                                            ║
╚══════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════╗
║ REGRA CARDINAL — ORDEM FIXA DAS COLUNAS S, C, A                      ║
╠══════════════════════════════════════════════════════════════════════╣
║ Em TODA seção REF.DATA do TOPCON, da ESQUERDA para a DIREITA:        ║
║                                                                      ║
║   COLUNA 1 (primeira) = S (esfera)    — número com sinal explícito   ║
║   COLUNA 2 (meio)     = C (cilindro)  — sempre negativo no TOPCON    ║
║   COLUNA 3 (última)   = A (eixo)      — inteiro 1-180, sem sinal     ║
║                                                                      ║
║ ⚠ ARMADILHA DE TROCA S↔C — A MAIS GRAVE:                             ║
║   NUNCA decida qual coluna é qual pela MAGNITUDE dos valores.        ║
║   É CLINICAMENTE PLAUSÍVEL E COMUM um olho ter:                      ║
║                                                                      ║
║     S = -0.25   C = -3.75   A = 76                                   ║
║                                                                      ║
║   ou seja, esfera PEQUENA com cilindro GRANDE em magnitude. Isso é   ║
║   astigmatismo de alto grau — não é erro. Não "corrija" trocando.    ║
║                                                                      ║
║   Confie SEMPRE na ORDEM POSICIONAL das colunas (1ª=S, 2ª=C, 3ª=A),  ║
║   nunca na magnitude dos números. Mesmo que pareça "mais natural"    ║
║   colocar o número maior em S, NÃO FAÇA. Respeite a ordem impressa.  ║
║                                                                      ║
║ ⚠ ARMADILHA DE SIMETRIA ENTRE OLHOS:                                 ║
║   OD e OE podem ter padrões muito diferentes (anisometropia).        ║
║   Se OD tem |S|>|C| e OE tem |S|<|C|, isso é REAL. Não harmonize.    ║
╚══════════════════════════════════════════════════════════════════════╝

━━━━ ORIENTAÇÃO ━━━━
Se o texto está de cabeça para baixo (palavras como "REF.DATA" aparecem como "ATAD.FER", marcadores ">R<" em vez de "<R>", "TOPCON" parece "NOCTPOT"), pare imediatamente e responda APENAS:
  {"_ticketInvertido": true}
NÃO transcreva nada se o ticket estiver invertido — o sistema rotaciona automaticamente.

━━━━ ESTRUTURA DO TICKET ━━━━
O ticket TOPCON imprime, na vertical, de cima para baixo:

  REF.DATA           ← seção de refração (EXTRAIR)
    VD: 12.00
    CYL: (-)         ← apenas marcador de convenção, NÃO é valor
    <R>  S    C    A   ← cabeçalho do OLHO DIREITO (OD)
      <medição 1>     ex:  + 1.75    - 0.50    75
      ... (pode ter 1, 2 ou 3 medições no total)
      <MÉDIA>         ← linha em NEGRITO no papel, IMEDIATAMENTE ACIMA DO S.E.
      S.E. <valor>    ← equivalente esférico do OD (referência, não fonte)
    <L>  S    C    A   ← cabeçalho do OLHO ESQUERDO (OE)
      <medição 1>
      ...
      <MÉDIA>
      S.E. <valor>    ← equivalente esférico do OE

  KRT.DATA           ← ceratometria — IGNORAR COMPLETAMENTE
  TONO.DATA          ← tonometria (EXTRAIR)
  PACH.DATA          ← paquimetria (EXTRAIR)

A ordem das seções no ticket pode variar, mas REF.DATA, KRT.DATA, TONO.DATA e PACH.DATA são identificadas pelos seus cabeçalhos explícitos.

━━━━ LATERALIDADE — REGRA ABSOLUTA ━━━━
<R> = OD (olho direito). <L> = OE (olho esquerdo). Nunca inverta.
Se você não consegue identificar <R> ou <L> claramente para um olho, retorne null para ESSE OLHO INTEIRO. Não chute.

━━━━ REFRAÇÃO — COMO LER CADA OLHO ━━━━
Para cada olho (OD do bloco <R>, OE do bloco <L>):

1. Localize a linha "S.E." (equivalente esférico). Esta linha NUNCA é a fonte de ESF/CIL/EIXO — só serve como âncora de referência.
2. Localize a linha MÉDIA. A linha média é a linha (em negrito) que está IMEDIATAMENTE ACIMA da linha "S.E.".
3. Localize as MEDIÇÕES numeradas. Elas ficam acima da linha MÉDIA (podem ser de 1 a 3 medições).

Para cada linha (3 medições + média), extraia 3 valores:

  • S (esfera):
    - Número com sinal (+ ou −). Se a célula está vazia, null.
    - Se ESF = "0.00", escreva "plano".
    - Se o sinal não aparece visível, null (não chute).
    - ⚠ SINAL: transcreva o caractere de sinal exatamente como impresso.
      "+" tem traço vertical E horizontal; "−" tem APENAS o horizontal (em
      impressão térmica o traço vertical do "+" pode sair fraco — olhe com
      atenção). Ler "+1.00" como "-1.00" inverte o grau do paciente — erro
      gravíssimo. Hipermetropia (+) é tão comum quanto miopia (−): nunca
      escolha o sinal por expectativa clínica.
    - ⚠ PLANO/PL: O TOPCON imprime literalmente a palavra "PLANO" ou "PL" na
      coluna S quando a esfera é 0.00. Se você ler "PLANO" ou "PL" na coluna S,
      retorne "plano" — NUNCA "+0.25" ou qualquer número positivo pequeno.
      Mesmo que os caracteres estejam levemente borrados, "PLANO"/"PL" nunca
      deve ser convertido para um valor numérico como +0.25.

  • C (cilindro):
    - Número (TOPCON usa convenção negativa).
    - Se a célula está VAZIA, EM BRANCO, sem dígitos visíveis → null.
    - NUNCA confunda célula vazia com "0.00". Vazio é vazio.
    - Se o ticket imprime literalmente "0.00", é null (sem astigmatismo).
    - Se imprime "0.50" sem sinal, é -0.50 (convenção negativa).
    - NUNCA copie o C do outro olho.

  • A (eixo):
    - Inteiro 1-180. Se a célula está vazia, null.
    - Se C é null, A obrigatoriamente também é null.
    - Se C tem valor, A é OBRIGATÓRIO. Cilindro sem eixo não existe.
      Se você não consegue ler o eixo mas vê o cilindro impresso, releia. Se
      mesmo assim não conseguir ler o eixo, marque tanto C quanto A como null
      (nunca retorne C com valor e A=null).

━━━━ ANTI-TRUNCAMENTO DE CILINDRO ━━━━
Em tickets térmicos degradados, valores como C = -3.50 podem aparecer
parcialmente apagados e ser lidos erroneamente como -0.50 ou .50.
Antes de registrar C:
  • Confira se existe dígito inteiro antes do ponto decimal.
  • "C - 3.50" é -3.50, NÃO -0.50.
  • Se houver dúvida entre -0.50 e -3.50 (imagem borrada, borda cortada,
    dígito apagado) → retorne c: null e a: null.
  • CIL alto (até -8.00) é clinicamente possível — não rejeite por magnitude.

━━━━ INCERTEZA NO CILINDRO ━━━━
Se a coluna C mostra algo que pode ser traço OU −0.25 (ambiguidade visual,
pixels insuficientes, baixa resolução), NÃO CHUTE:
  • Retorne c: null e a: null para esse olho.
  • Prefira subdiagnosticar astigmatismo a inventá-lo.
  • Astigmatismo fantasma gera prescrição errada; ausência de astigmatismo
    discreto não causa dano significativo.

━━━━ PASSO DIÓPTRICO ━━━━
Todos os valores de esfera e cilindro devem ser múltiplos exatos de 0.25D.
Exemplos válidos: -0.25, -0.50, -0.75, -1.00, -1.25, ..., -8.00.
Se você ler algo como -0.37, -1.13, -0.40 → é erro de OCR → use null.

━━━━ REGRA DE COMPLETUDE — ESFERA É OBRIGATÓRIA ━━━━
A esfera (S) é a medida primária do TOPCON — toda refração tem esfera. Se
você não consegue ler a esfera de um olho:
  → Retorne null para o OLHO INTEIRO (não retorne cilindro/eixo "isolados")
Refração com C presente e S=null é IMPOSSÍVEL clinicamente. Se você ler só o
C de um olho, significa que está alucinando — releia com mais cuidado, e se
ainda assim não conseguir ler S, marque o olho inteiro como null.

━━━━ S.E. — REGRA ANTI-ALUCINAÇÃO ━━━━
O campo "se" é APENAS o reflexo literal da linha "S.E. <numero>" impressa
no ticket (logo após a linha da média). Não é cálculo. Não é estimativa.
Não é cópia da esfera.

  ◆ Se a linha "S.E." NÃO aparece visível, está cortada, borrada ou ilegível
    → "se": null. NUNCA "complete" usando a esfera, a média, a memória
    visual de outro olho ou cálculo mental de S+C/2.
  ◆ Se cil != 0 e cil != null, é matematicamente IMPOSSÍVEL que se == esfera
    (porque S.E. = S + C/2). Se sua leitura der se igual à esfera com
    cilindro presente, VOCÊ ALUCINOU o S.E. — releia. Se mesmo após releitura
    a linha S.E. não estiver clara, retorne "se": null.
  ◆ Se cil == 0 (cilindro zero impresso), aí sim se == esfera é esperado e
    correto — pode retornar.
  ◆ O número de "se" pode ter sinal explícito ou implícito; copie como
    aparece impresso. Se o sinal não estiver visível, "se": null.

━━━━ CONSISTÊNCIA INTERNA (AUTOVIGILÂNCIA) ━━━━
Antes de retornar, faça MENTALMENTE estas checagens:

  ◆ As 3 medições + média de cada olho devem ser parecidas.
    Se as 3 medições mostram C vazio e a média mostra C com valor → você provavelmente leu errado a média. Releia ou marque null.

  ◆ Se OE = OD em S, C e A exatamente (todos os 3 campos idênticos) →
    você quase certamente copiou um olho para o outro. Releia.

  ◆ Se você "preencheu" o C ou A de um olho porque "o outro tem" →
    APAGUE e marque null.

  ◆ Se faltam pixels claros para um dígito → null.

━━━━ TONOMETRIA (TONO.DATA) ━━━━
Uma linha "R" (= OD) e uma linha "L" (= OE), em mmHg.
Use o valor da coluna AVG. Se não houver AVG, use o último número da linha.
"ERR" isolado (sem número) = ignore essa medição individual.
"ERR 17" ou "(17)" = use o número.
Faixa esperada: 8-25 mmHg.

━━━━ PAQUIMETRIA (PACH.DATA) ━━━━
Uma linha "R" (= OD) e uma linha "L" (= OE), em mm.
Use a coluna AVG. Multiplique por 1000 para µm (ex: 0.504 → 504).
Faixa esperada: 420-650 µm.

━━━━ KRT.DATA (CERATOMETRIA) ━━━━
IGNORAR COMPLETAMENTE. Os valores de R1, R2, AVE, CYL ceratométrico, MM1, MM2 NÃO são refração. Não use NADA da seção KRT em nenhum dos campos de saída.

━━━━ FORMATO DE SAÍDA — JSON PURO (sem markdown) ━━━━
{
  "_ticketInvertido": false,
  "refracao": {
    "od": {
      "medicoes": [
        {"s": "+1.75", "c": -0.50, "a": 75},
        {"s": "+1.75", "c": -0.50, "a": 75},
        {"s": "+1.75", "c": -0.50, "a": 75}
      ],
      "media": {"s": "+1.75", "c": -0.50, "a": 75},
      "se":   "+1.50"
    },
    "oe": {
      "medicoes": [
        {"s": "+1.50", "c": null, "a": null},
        {"s": "+1.50", "c": null, "a": null},
        {"s": "+1.50", "c": null, "a": null}
      ],
      "media": {"s": "+1.50", "c": null, "a": null},
      "se":   "+1.50"
    }
  },
  "tonometria":  {"od": 15, "oe": 14},
  "paquimetria": {"od": 504, "oe": 526}
}

REGRAS DE NULL:
  - Olho inteiro ilegível → refracao.od = null (ou refracao.oe = null)
  - Seção REF.DATA não aparece → refracao = null
  - Seção TONO.DATA não aparece → tonometria = null
  - Seção PACH.DATA não aparece → paquimetria = null
  - Menos de 3 medições visíveis → preencha o que tiver e use null nas faltantes
  - Linha "S.E." não visível/ilegível para um olho → se: null nesse olho
  - Não chute. Não estime. Não complete por simetria.

Responda APENAS com o JSON. Sem texto antes, sem texto depois, sem markdown.
`;
  }

  // --------------------------------------------------------------------------
  // Pós-processamento determinístico — cross-check 3 medições vs média
  // --------------------------------------------------------------------------
  _postProcessRefraction(raw) {
    const result = {
      tonometria:  raw?.tonometria || null,
      paquimetria: raw?.paquimetria || null,
      refracao:    null,
      _avisos: [],
      _captureFailed: false,
      _reason: null
    };

    // Estrutura mínima para o caller
    if (!raw || typeof raw !== 'object') {
      result._captureFailed = true;
      result._reason = 'Resposta vazia da IA.';
      return result;
    }

    // ===== Refração =====
    const refracao = raw.refracao;
    if (refracao && (refracao.od || refracao.oe)) {
      result.refracao = { od: null, oe: null };

      for (const lado of ['od', 'oe']) {
        const eye = refracao[lado];
        if (!eye || typeof eye !== 'object') continue;
        result.refracao[lado] = this._processEye(eye, lado.toUpperCase(), result._avisos);
      }

      // Cross-check inter-olhos: OD === OE exatamente em S+C+A é raríssimo
      // e geralmente significa cópia. Bloquear se acontecer com cilindro presente.
      const od = result.refracao.od;
      const oe = result.refracao.oe;
      if (od && oe && od.cil != null && oe.cil != null) {
        const esfIgual = String(od.esf) === String(oe.esf);
        const cilIgual = Math.abs(od.cil - oe.cil) < 0.01;
        const eixoIgual = od.eixo != null && oe.eixo != null && Math.abs(od.eixo - oe.eixo) < 1;
        if (esfIgual && cilIgual && eixoIgual) {
          result._captureFailed = true;
          result._reason = 'OD e OE saíram idênticos em esfera, cilindro e eixo — provável duplicação. Refaça a captura.';
        }
      }

      // ── DEFESA: S.E. cross-check matemático ─────────────────────────
      // Se o modelo retornou S.E. para um olho, verificar que S + C/2 ≈ S.E.
      // Discrepância > 0.30D indica que algum dos campos (S, C ou S.E.) foi
      // alucinado. Pega o caso clássico de cilindro errado (modelo lê um valor
      // mas o S.E. da impressão original continua certo) — ex: ticket diz
      // S=-4.75, C=-1.00, S.E.=-5.25 mas modelo lê C=-1.75 → S+C/2=-5.625,
      // discrepa do S.E.=-5.25 em 0.375 → bloquear.
      //
      // ATENÇÃO: não tente "corrigir" qual valor está errado — só sinalize a
      // discrepância e peça nova foto. Confiar em S.E. para corrigir CIL
      // (ou vice-versa) já se mostrou perigoso porque o modelo às vezes
      // alucina o S.E. junto.
      for (const lado of ['od', 'oe']) {
        const eye = result.refracao[lado];
        if (!eye) continue;
        const seReportado = eye.se;
        if (seReportado == null) continue;
        const seNum = parseFloat(seReportado);
        if (isNaN(seNum)) continue;
        const esfNum = String(eye.esf).toLowerCase() === 'plano' ? 0 : parseFloat(eye.esf);
        const cilNum = eye.cil != null ? parseFloat(eye.cil) : 0;
        if (isNaN(esfNum)) continue;
        const seCalculado = esfNum + cilNum / 2;
        const diff = Math.abs(seNum - seCalculado);
        if (diff > 0.30) {
          result._captureFailed = true;
          result._reason = `${lado.toUpperCase()}: S.E. lido (${seNum.toFixed(2)}) não bate com S+C/2 calculado (${seCalculado.toFixed(2)}) — diferença ${diff.toFixed(2)}D indica leitura incorreta. Refaça a captura.`;
          break;
        }
      }
    }

    // ===== Sanity sobre tonometria =====
    if (result.tonometria) {
      for (const lado of ['od', 'oe']) {
        const v = result.tonometria[lado];
        if (v == null) continue;
        const num = parseFloat(v);
        if (isNaN(num) || num < 5 || num > 40) {
          result._avisos.push(`Tonometria ${lado.toUpperCase()} (${v}) fora da faixa 5-40 mmHg — descartada`);
          result.tonometria[lado] = null;
        } else {
          result.tonometria[lado] = num;
        }
      }
    }

    // ===== Sanity sobre paquimetria (incluindo auto-conversão mm → µm) =====
    if (result.paquimetria) {
      for (const lado of ['od', 'oe']) {
        const v = result.paquimetria[lado];
        if (v == null) continue;
        let num = parseFloat(v);
        if (isNaN(num)) {
          result.paquimetria[lado] = null;
          continue;
        }
        if (num < 2.0) num = Math.round(num * 1000); // mm → µm
        if (num < 350 || num > 700) {
          result._avisos.push(`Paquimetria ${lado.toUpperCase()} (${num}µm) fora da faixa 350-700 — descartada`);
          result.paquimetria[lado] = null;
        } else {
          result.paquimetria[lado] = num;
        }
      }
    }

    // ===== Metadados de propagação =====
    if (result._captureFailed) {
      result._blockAutoInject = true;
      result._validationWarnings = [result._reason];
    } else if (result._avisos.length > 0) {
      result._validationWarnings = result._avisos.slice();
    }
    if (raw._ticketFoiRotacionado) result._ticketInvertido = true;

    // CIDs de refração inferidos deterministicamente (só quando captura válida)
    result.cid_refracao = (!result._captureFailed && result.refracao)
      ? this._inferCidRefracao(result.refracao)
      : [];

    return result;
  }

  /**
   * Processa um olho. Aplica cross-check entre 3 medições e média.
   * Regra crítica: se média mostra cilindro mas 2+ medições mostram null,
   * descarta o cilindro (alucinação de simetria visual).
   */
  _processEye(eye, label, avisos) {
    const medicoes = Array.isArray(eye.medicoes) ? eye.medicoes : [];
    const media = eye.media || null;
    let se = eye.se || null;
    let cilDescartadoPorEixo = false;

    // ESF: média prioritária; se ausente, modal das medições
    let esf = media?.s ?? null;
    if (esf == null && medicoes.length > 0) {
      const sValues = medicoes.map(m => m?.s).filter(v => v != null);
      if (sValues.length > 0) esf = this._modal(sValues);
    }

    // Unanimidade vence a média: a média impressa de 3 medições idênticas é
    // obrigatoriamente igual a elas. Se as 3 medições são unânimes e a média
    // diverge, a média foi lida errado (caso real: medições c=-2.25 ×3 com
    // "média" -2.00).
    const sUnanimes = medicoes.map(m => m?.s).filter(v => v != null);
    if (esf != null && sUnanimes.length === 3 &&
        sUnanimes.every(v => String(v) === String(sUnanimes[0])) &&
        String(esf) !== String(sUnanimes[0])) {
      avisos.push(`${label}: média S (${esf}) diverge das 3 medições unânimes (${sUnanimes[0]}) — usadas as medições`);
      esf = sUnanimes[0];
    }

    // ⚠️ REGRA DE COMPLETUDE — ESFÉRICA É OBRIGATÓRIA:
    // Refração com cilindro presente E esfera ausente é clinicamente impossível
    // (TOPCON sempre imprime esfera). Se o modelo retornou só C ou só A para um
    // olho, é alucinação garantida — invalidar o olho inteiro.
    if (esf == null) {
      avisos.push(`${label}: esfera não foi lida — olho descartado (refração sem esfera é impossível)`);
      return null;
    }

    // CIL: aplica lógica defensiva contra alucinação
    const cilMedia = this._parseCil(media?.c);
    const cilMedicoes = medicoes.map(m => this._parseCil(m?.c));
    const cilNullCount = cilMedicoes.filter(v => v === null).length;
    const cilNumCount  = cilMedicoes.filter(v => v !== null).length;

    let cil = null;
    if (cilMedia === null && cilNullCount >= 2) {
      // Consistente: 2+ medições null + média null → sem cilindro
      cil = null;
    } else if (cilMedia === null && cilNumCount >= 2) {
      // Média sumiu mas medições mostram valor → usar modal
      const valids = cilMedicoes.filter(v => v !== null);
      cil = this._modal(valids);
      avisos.push(`${label}: média de C ausente — usado modal das medições (${cil})`);
    } else if (cilMedia !== null && cilNullCount >= 2) {
      // ⚠️ ALUCINAÇÃO PROVÁVEL: média mostrou cilindro mas medições estavam vazias
      cil = null;
      avisos.push(`${label}: média mostrou C=${cilMedia} mas medições estavam vazias — descartado (provável alucinação)`);
    } else if (cilMedia !== null && cilNumCount >= 2) {
      // Caso normal: validar consistência média vs medições
      const valids = cilMedicoes.filter(v => v !== null);
      const unanime = valids.length === 3 && valids.every(v => Math.abs(v - valids[0]) < 0.01);
      const allClose = valids.every(v => Math.abs(v - cilMedia) <= 0.50);
      if (unanime && Math.abs(valids[0] - cilMedia) > 0.01) {
        // Média impressa de 3 valores iguais é igual a eles — média foi lida errado
        cil = valids[0];
        avisos.push(`${label}: média de C (${cilMedia}) diverge das 3 medições unânimes (${valids[0]}) — usadas as medições`);
      } else if (allClose) {
        cil = cilMedia;
      } else {
        // Média diverge das medições → usar modal e avisar
        cil = this._modal(valids);
        avisos.push(`${label}: média de C (${cilMedia}) diverge das medições — usado modal (${cil})`);
      }
    } else {
      // Caso ambíguo (poucos dados) — usar média se existir
      cil = cilMedia;
    }

    // EIXO: depende de CIL. Se CIL é null, EIXO é null obrigatoriamente.
    let eixo = null;
    if (cil !== null) {
      const eixoMedia = this._parseEixo(media?.a);
      const eixoMedicoes = medicoes.map(m => this._parseEixo(m?.a));
      const eixoValidos = eixoMedicoes.filter(v => v !== null);

      const eixoUnanime = eixoValidos.length === 3 && eixoValidos.every(v => v === eixoValidos[0]);
      if (eixoMedia !== null && eixoUnanime && eixoValidos[0] !== eixoMedia) {
        // Mesma regra de unanimidade aplicada a S e C
        eixo = eixoValidos[0];
        avisos.push(`${label}: média de A (${eixoMedia}°) diverge das 3 medições unânimes (${eixoValidos[0]}°) — usadas as medições`);
      } else if (eixoMedia !== null) {
        eixo = eixoMedia;
      } else if (eixoValidos.length >= 2) {
        eixo = this._modal(eixoValidos);
        avisos.push(`${label}: média de A ausente — usado modal das medições (${eixo}°)`);
      }

      if (eixo !== null && (eixo < 1 || eixo > 180)) {
        avisos.push(`${label}: eixo ${eixo} fora da faixa 1-180 — refração descartada`);
        cil = null;
        eixo = null;
      }

      // ⚠️ REGRA DE COMPLETUDE — CILINDRO COM EIXO AUSENTE É INVÁLIDO:
      // Se temos cilindro mas não conseguimos ler o eixo, anular ambos.
      // Cilindro sem eixo não define direção do astigmatismo — clinicamente
      // não-injetável e tipicamente sinal de leitura parcial/alucinada.
      if (cil !== null && eixo === null) {
        avisos.push(`${label}: cilindro C=${cil} presente mas eixo ausente — cilindro descartado; olho injetado como esférico puro (S.E. impresso ignorado por refletir o cilindro removido)`);
        cil = null;
        cilDescartadoPorEixo = true;
        // O S.E. impresso embutia o cilindro que acabamos de descartar, então
        // deixa de ser comparável a S+C/2. Anulá-lo evita que o cross-check
        // determinístico de S.E. bloqueie a captura inteira (tono/paqui inclusos).
        se = null;
      }
    }

    // ⚠️ VALIDAÇÃO DE PASSO DIÓPTRICO (0.25D)
    // Autorrefratores medem em passos de 0.25D. Valores fora desse grid
    // (ex: -0.37, -1.13) indicam erro de OCR em ticket degradado.
    if (!this._isValidDiopterStep(esf)) {
      avisos.push(`${label}: esfera ${esf} não é múltiplo de 0.25D — provável erro de OCR, olho descartado`);
      return null;
    }
    if (cil !== null && !this._isValidDiopterStep(cil)) {
      avisos.push(`${label}: cilindro ${cil} não é múltiplo de 0.25D — descartado (provável erro de OCR)`);
      cil = null;
      eixo = null;
    }

    if (esf != null) esf = String(esf).toLowerCase();
    return { esf, cil, eixo, se, _cilDescartadoPorEixo: cilDescartadoPorEixo };
  }

  /**
   * Normaliza valor de cilindro. TOPCON usa convenção negativa.
   * Retorna número ≤ 0 ou null. Valor 0 vira null (sem astigmatismo).
   */
  _parseCil(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    const num = parseFloat(v);
    if (isNaN(num)) return null;
    if (num === 0) return null;
    return num > 0 ? -num : num;
  }

  _parseEixo(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    const num = parseInt(v, 10);
    if (isNaN(num)) return null;
    return num;
  }

  /**
   * Verifica se um valor é múltiplo válido de 0.25D (passo dióptrico padrão).
   * Autorrefratores e refratores medem em passos de 0.25D.
   * Valores como -0.37 ou -1.13 não existem clinicamente e indicam erro de OCR.
   */
  _isValidDiopterStep(value) {
    if (value === null || value === undefined) return true;
    if (value != null && String(value).toLowerCase() === 'plano') return true;
    const num = parseFloat(value);
    if (isNaN(num)) return true; // outras validações lidam com NaN
    return Math.round(Math.abs(num) * 100) % 25 === 0;
  }

  /**
   * Infere CIDs H52.x deterministicamente a partir da refração validada.
   * Só chamado quando _captureFailed === false.
   */
  _inferCidRefracao(refracao) {
    if (!refracao) return [];

    const CIDS = {
      H520: 'H52.0 - Hipermetropia',
      H521: 'H52.1 - Miopia',
      H522: 'H52.2 - Astigmatismo',
      H523: 'H52.3 - Anisometropia',
    };

    function parseEsf(esf) {
      if (esf == null) return null;
      if (typeof esf === 'string' && /^(plano|pl)$/i.test(esf.trim())) return 0.0;
      const n = parseFloat(esf);
      return isNaN(n) ? null : n;
    }

    // SE: usa valor do ticket; se ausente, deriva de esf+cil/2 (só para anisometropia)
    function getSE(eye) {
      if (!eye) return null;
      if (eye.se != null) {
        const seN = parseFloat(eye.se);
        if (!isNaN(seN)) return seN;
      }
      const esfN = parseEsf(eye.esf);
      if (esfN == null) return null;
      const cilN = (eye.cil != null) ? parseFloat(eye.cil) : 0;
      return esfN + cilN / 2;
    }

    const codes = new Set();

    for (const lado of ['od', 'oe']) {
      const eye = refracao[lado];
      if (!eye) continue;
      const esfN = parseEsf(eye.esf);
      if (esfN == null) continue;

      if (esfN > 0)      codes.add('H520');
      else if (esfN < 0) codes.add('H521');

      const cilN = (eye.cil != null) ? parseFloat(eye.cil) : 0;
      if (!isNaN(cilN) && Math.abs(cilN) >= 0.25) codes.add('H522');
    }

    // Anisometropia: diferença de SE entre olhos > 1.50D
    const seOD = getSE(refracao.od);
    const seOE = getSE(refracao.oe);
    if (seOD != null && seOE != null && Math.abs(seOD - seOE) > 1.50) {
      codes.add('H523');
    }

    return [...codes].map(c => CIDS[c]).filter(Boolean);
  }

  /** Modal (valor mais frequente) — usado quando média ausente ou divergente. */
  _modal(arr) {
    if (!arr || arr.length === 0) return null;
    const counts = new Map();
    for (const v of arr) {
      const key = String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = arr[0], bestCount = 0;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = arr.find(v => String(v) === key);
      }
    }
    return best;
  }

  // --------------------------------------------------------------------------
  // Validação binária — aceita ou rejeita. SEM auto-correção.
  // --------------------------------------------------------------------------
  validateExamData(data) {
    if (!data) return { isValid: false, warnings: ['Sem dados extraídos. Refaça a captura.'], shouldRetry: false };
    if (data._captureFailed) {
      return {
        isValid: false,
        warnings: [data._reason || 'Captura inválida. Refaça a foto.'],
        shouldRetry: false
      };
    }
    return {
      isValid: true,
      warnings: data._avisos || [],
      shouldRetry: false
    };
  }
}

// Singleton do agente de exames
const geminiExamAgent = new GeminiExamAgent();

