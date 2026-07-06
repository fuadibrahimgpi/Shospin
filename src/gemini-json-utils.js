/**
 * GEMINI JSON UTILS — utilitários compartilhados pelos dois agentes Gemini
 * (_repairJsonStrings e _parseGeminiJSON).
 * Carregado ANTES de gemini-exam-agent.js e gemini-interview-agent.js.
 * Extraído de geminiService.js na modularização de 2026-07-02.
 */

// ============================================================================
// SHARED — Utilitários comuns aos dois agentes
// ============================================================================

/**
 * Repara strings JSON com aspas literais não escapadas usando máquina de estados.
 * Heurística: `"` é terminador real se seguido de `,` `}` `]` ou `:` (separador de chave).
 */
function _repairJsonStrings(text) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    if (escaped) { result += ch; escaped = false; continue; }

    if (ch === '\\') { escaped = true; result += ch; continue; }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
      } else {
        let j = i + 1;
        while (j < text.length && ' \t\r\n'.includes(text[j])) j++;
        const next = text[j] ?? '';
        if (!next || ',}]:'.includes(next)) {
          inString = false;
          result += ch;
        } else {
          result += '\\"';
        }
      }
      continue;
    }

    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (code < 0x20) continue;
    }

    result += ch;
  }

  return result;
}

function _parseGeminiJSON(rawText, context) {
  const logger = new Logger('ParseJSON');

  // Passo 1: extrair bloco markdown se presente
  let jsonText = rawText;
  const mdMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) jsonText = mdMatch[1].trim();

  // Passo 2: parse direto
  try { return JSON.parse(jsonText); } catch {}

  // Passo 3: extrair apenas o objeto JSON (ignora texto antes/depois)
  const startIdx = jsonText.indexOf('{');
  const endIdx   = jsonText.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    try { return JSON.parse(jsonText.slice(startIdx, endIdx + 1)); } catch {}
  }

  // Passo 4: limpeza estrutural (trailing commas + chars de controle)
  try {
    const cleaned = jsonText
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return JSON.parse(cleaned);
  } catch {}

  // Passo 5: reparo via state machine (aspas literais + \n dentro de strings)
  try { return JSON.parse(_repairJsonStrings(jsonText)); } catch {}

  // Todas as tentativas falharam — logar contexto ao redor do ponto de erro para diagnóstico
  try {
    JSON.parse(jsonText);
  } catch (diagErr) {
    const posMatch = diagErr.message.match(/position (\d+)/);
    if (posMatch) {
      const p = Number(posMatch[1]);
      logger.error(
        `Erro ao parsear JSON (${context}) — contexto pos ${p}:`,
        jsonText.slice(Math.max(0, p - 80), p + 80)
      );
    } else {
      logger.error(`Erro ao parsear JSON (${context})`, diagErr);
    }
    logger.error(`JSON termina com: ${JSON.stringify(jsonText.slice(-60))}`);
  }

  throw new Error('Resposta da IA não está em formato JSON válido');
}

