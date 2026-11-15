/**
 * RECHECK DA INJEÇÃO — camada 1: fidelidade (enviado × prontuário)
 * ============================================================================
 *
 * Pergunta única: o que a sidepanel ENVIOU ao SHOSP ficou de fato na fonte de
 * save? O lado "enviado" é o combinedData (o mesmo que aparece no console como
 * injetado); o lado "lido" é o readback que o content script devolve no bloco
 * [Verify] de src/content.js.
 *
 * Não altera o prontuário, não usa IA, só relata.
 *
 * Contenção, não igualdade: o campo pode já ter texto antes da injeção. Por isso
 * cada LINHA enviada precisa aparecer no readback do rótulo, não o campo inteiro.
 */
'use strict';

const _Contrato = (typeof module !== 'undefined' && module.exports)
  ? require('./agent-contract.js') : globalThis.AgentContract;

// Mesmos campos que o content script injeta na aba Atendimento (primeira consulta).
const _CAMPOS_ATENDIMENTO = ['hda', 'medicacoes_em_uso', 'antecedentes_oftalmologicos', 'alteracoes_sistemicas', 'antecedentes_familiares'];

/**
 * Converte o combinedData da sidepanel em [{label, texto}], com os MESMOS rótulos
 * do bloco [Verify] de content.js (Atendimento, Retorno, Conduta, Biomicroscopia,
 * Fundoscopia). Rótulo sem texto enviado não entra na lista.
 */
function montarEnviado(data) {
  const itens = [];
  const add = (label, valor) => { if (valor) itens.push({ label, texto: String(valor) }); };
  const audio = (data && data.audio) || null;
  if (audio) {
    if (audio.tipo === 'primeira_consulta') {
      add('Atendimento', _CAMPOS_ATENDIMENTO.map(c => audio[c]).filter(Boolean).join('\n'));
    } else if (audio.tipo === 'retorno') {
      add('Retorno', [audio.retorno, audio.uso].filter(Boolean).join('\n'));
    }
    add('Conduta', [audio.conduta, audio.tratamento].filter(Boolean).join('\n'));
  }
  if (data && data.examesNormais) {
    add('Biomicroscopia', data.examesNormais.biomicroscopia);
    add('Fundoscopia', data.examesNormais.fundoscopia);
  }
  return itens;
}

/**
 * @param {Array<{label: string, texto: string}>} enviados
 * @param {Record<string, string>} readback  texto lido da fonte de save, por rótulo
 * @returns {{conferidos: number, divergencias: Array<{label, linha, motivo}>, naoVerificaveis: string[]}}
 */
function conferirFidelidade(enviados, readback) {
  const resultado = { conferidos: 0, divergencias: [], naoVerificaveis: [] };
  const leitura = readback || {};
  for (const { label, texto } of Array.isArray(enviados) ? enviados : []) {
    if (!Object.prototype.hasOwnProperty.call(leitura, label)) {
      resultado.naoVerificaveis.push(label);
      continue;
    }
    const fonte = _Contrato.normalizarContrato(leitura[label]);
    for (const linha of String(texto).split('\n')) {
      const norm = _Contrato.normalizarContrato(linha);
      if (norm.length < _Contrato.EVIDENCIA_MIN_CHARS) continue;
      resultado.conferidos++;
      if (!fonte.includes(norm)) {
        resultado.divergencias.push({
          label,
          linha: linha.trim(),
          motivo: fonte ? 'linha enviada não está no prontuário' : 'fonte de save vazia',
        });
      }
    }
  }
  return resultado;
}

const RecheckAgent = { montarEnviado, conferirFidelidade };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RecheckAgent;
}
if (typeof globalThis !== 'undefined') {
  globalThis.RecheckAgent = RecheckAgent;
} else if (typeof self !== 'undefined') {
  self.RecheckAgent = RecheckAgent;
}
