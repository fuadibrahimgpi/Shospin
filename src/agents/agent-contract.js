/**
 * CONTRATO DOS SUBAGENTES DA CONDUTA
 * ============================================================================
 *
 * Todo subagente (medicamentos, exames, retorno, óculos…) é um objeto com a
 * mesma forma. O regulador/fusor só conhece este contrato — agente novo entra
 * sem mexer no resto.
 *
 *   nome      — string estável ('medicamentos')
 *   campo     — onde o resultado vai: 'tratamento' | 'conduta' (dono ÚNICO do campo)
 *   detectar(transcricao)            → boolean. Roteamento DETERMINÍSTICO: decide se
 *                                      vale chamar o modelo. Sem chamada de IA.
 *   validar(itens, transcricao)      → { aceitos, descartados, avisos }. Roda em código
 *                                      sobre o que o modelo devolveu.
 *   formatar(aceitos)                → { <campo>: string|null, ... } — texto que vai ao
 *                                      prontuário.
 *   analisar(transcricao, contexto)  → Promise<itens[]> — a chamada ao modelo
 *                                      (opcional até o agente ser ligado).
 *
 * Todo ITEM devolvido pelo modelo carrega `evidencia`: trecho LITERAL da fala que
 * o sustenta. verificarEvidencia() descarta o item cuja evidência não está na
 * transcrição — é a defesa estrutural contra alucinação (o modelo pode errar o
 * que escreve, mas não pode inventar o que a fala não tem).
 */
'use strict';

function normalizarContrato(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+\/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const EVIDENCIA_MIN_CHARS = 4;

/**
 * Separa os itens cuja `evidencia` aparece literalmente (normalizada) na
 * transcrição dos que não têm sustentação.
 * @returns {{aceitos: object[], descartados: Array<{item, motivo}>}}
 */
function verificarEvidencia(itens, transcricao) {
  const fala = normalizarContrato(transcricao);
  const aceitos = [];
  const descartados = [];
  for (const item of Array.isArray(itens) ? itens : []) {
    const ev = normalizarContrato(item && item.evidencia);
    if (ev.length < EVIDENCIA_MIN_CHARS) {
      descartados.push({ item, motivo: 'sem evidência' });
    } else if (!fala.includes(ev)) {
      descartados.push({ item, motivo: 'evidência não está na fala' });
    } else {
      aceitos.push(item);
    }
  }
  return { aceitos, descartados };
}

const METODOS_OBRIGATORIOS = ['detectar', 'validar', 'formatar'];

/** Confere a forma de um agente; devolve a lista de problemas (vazia = ok). */
function conferirAgente(agente) {
  const problemas = [];
  if (!agente || typeof agente !== 'object') return ['agente ausente'];
  if (!agente.nome || typeof agente.nome !== 'string') problemas.push('nome ausente');
  if (!['tratamento', 'conduta'].includes(agente.campo)) problemas.push('campo deve ser tratamento|conduta');
  for (const m of METODOS_OBRIGATORIOS) {
    if (typeof agente[m] !== 'function') problemas.push(`método ${m} ausente`);
  }
  return problemas;
}

const AgentContract = { normalizarContrato, verificarEvidencia, conferirAgente, EVIDENCIA_MIN_CHARS };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AgentContract;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AgentContract = AgentContract;
} else if (typeof self !== 'undefined') {
  self.AgentContract = AgentContract;
}
