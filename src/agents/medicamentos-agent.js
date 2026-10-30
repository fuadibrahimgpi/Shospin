/**
 * AGENTE DE MEDICAMENTOS (conduta → campo `tratamento`)
 * ============================================================================
 *
 * Passo 1 do plano: a parte DETERMINÍSTICA — roteamento, validação e
 * formatação. A chamada ao modelo (`analisar`) entra no passo 2, atrás de flag,
 * em modo sombra. Tudo aqui roda sem IA e é coberto por utils/agents-test.js
 * sobre o corpus real em utils/corpus/medicamentos.json.
 *
 * Item que o modelo devolve:
 *   { nome, nivel, status, posologia, olho, duracao, evidencia }
 *   nivel  : 'principio' | 'protocolo' | 'classe' | 'generico'  (HIERARQUIA DE NOMEAÇÃO)
 *   status : 'novo' | 'mantido' | 'suspenso'
 *   evidencia : trecho LITERAL da fala que sustenta O NOME (não a posologia)
 *
 * validar() aplica, nesta ordem:
 *   1. contrato — evidência literal na fala (senão o item cai);
 *   2. léxico   — remédio achado na evidência vira princípio ativo do léxico,
 *                 mesmo que o modelo tenha escrito outra coisa ("trometolou" →
 *                 Cetorolaco, não "Colírio antibiótico");
 *   3. nível    — princípio sem sustentação na evidência é rebaixado a genérico;
 *                 classe só vale com a CLASSE dita; protocolo exige colírio dito.
 */
'use strict';

const _Contrato = (typeof module !== 'undefined' && module.exports)
  ? require('./agent-contract.js') : globalThis.AgentContract;
const _Lexico = (typeof module !== 'undefined' && module.exports)
  ? require('../../config/medicamentos-lexico.js') : globalThis.MedicamentosLexico;

const GENERICO = 'Medicação ocular prescrita';

// Gatilho amplo de roteamento: qualquer menção a remédio ou ao ato de prescrever.
const _GATILHO_RE = /\b(?:colirio|colirios|pomada|pomadas|gota|gotas|gotinha|gotinhas|remedio|remedios|medicacao|medicamento|comprimido|comprimidos|capsula|capsulas|lubrificante|lubrificantes|vidro|frasco|pingar|instilar|prescrev\w*|receita(?:r|ndo)? (?:de )?(?:colirio|remedio))\b/;

// Para cada classe, o que a FALA precisa dizer para a classe ser afirmada (nível 2).
const _CLASSE_NA_FALA = [
  { rotulo: /antibiotic/i,        fala: /antibi|\batb\b/ },
  { rotulo: /hipotensor|pressao/i, fala: /press[aã]o|glaucoma|hipotensor/ },
  { rotulo: /antial[eé]rgic/i,    fala: /alergi|antial/ },
  { rotulo: /corticoid/i,         fala: /corticoid|cortison/ },
  { rotulo: /anti-?inflamat/i,    fala: /inflama/ },
  { rotulo: /lubrificante/i,      fala: /lubrific|lagrima|hidrat/ },
];

const _PROTOCOLO_EXIGE_RE = /colirio|pingar|gota|instilar/;

function detectar(transcricao) {
  const t = _Lexico.normalizarLexico(transcricao);
  if (_GATILHO_RE.test(t)) return true;
  return _Lexico.encontrarMedicamentos(t).length > 0;
}

function _rebaixar(item, motivo, avisos) {
  avisos.push(`"${item.nome}" → "${GENERICO}": ${motivo}`);
  return { ...item, nome: GENERICO, nivel: 'generico' };
}

function validar(itens, transcricao) {
  const { aceitos: comEvidencia, descartados } = _Contrato.verificarEvidencia(itens, transcricao);
  const avisos = [];
  const aceitos = [];

  for (const original of comEvidencia) {
    let item = { ...original };
    const evNorm = _Lexico.normalizarLexico(item.evidencia);
    const achados = _Lexico.encontrarMedicamentos(item.evidencia);

    if (item.status === 'suspenso') { aceitos.push(item); continue; }

    if (achados.length === 1 && item.nivel !== 'protocolo') {
      // O léxico manda: o nome vem do que foi DITO, não do que o modelo escreveu.
      // Princípio ativo primeiro; a marca, se foi dita, vai entre parênteses.
      const nomeLexico = _Lexico.nomeRegistrado(achados[0]);
      if (item.nome !== nomeLexico) {
        avisos.push(`"${item.nome}" → "${nomeLexico}": nome resolvido pelo léxico (${achados[0].termo})`);
      }
      item.nome = nomeLexico;
      item.nivel = achados[0].principio === 'Lubrificante ocular' ? 'classe' : 'principio';
    } else if (item.nivel === 'principio') {
      const primeira = _Lexico.normalizarLexico(item.nome).split(/[ +]/)[0];
      if (!primeira || !evNorm.includes(primeira)) {
        item = _rebaixar(item, 'princípio não está na evidência', avisos);
      }
    } else if (item.nivel === 'classe') {
      const regra = _CLASSE_NA_FALA.find(r => r.rotulo.test(_Lexico.normalizarLexico(item.nome)));
      if (!regra || !regra.fala.test(evNorm)) {
        item = _rebaixar(item, 'a fala não diz essa classe', avisos);
      }
    } else if (item.nivel === 'protocolo') {
      if (!_PROTOCOLO_EXIGE_RE.test(evNorm)) {
        descartados.push({ item: original, motivo: 'protocolo sem colírio dito (anúncio vago não cria prescrição)' });
        continue;
      }
    }
    aceitos.push(item);
  }
  return { aceitos, descartados, avisos };
}

function _linha(item) {
  return [item.nome, item.posologia, item.duracao, item.olho]
    .map(p => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(' ');
}

/** Itens novos e mantidos viram linhas de tratamento; suspensos saem à parte. */
function formatar(aceitos) {
  const ativos = aceitos.filter(i => i.status !== 'suspenso');
  const suspensos = aceitos.filter(i => i.status === 'suspenso').map(i => i.nome);
  return {
    tratamento: ativos.length ? ativos.map(_linha).join('\n') : null,
    suspensos,
  };
}

const MedicamentosAgent = {
  nome: 'medicamentos',
  campo: 'tratamento',
  GENERICO,
  detectar,
  validar,
  formatar,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MedicamentosAgent;
}
if (typeof globalThis !== 'undefined') {
  globalThis.MedicamentosAgent = MedicamentosAgent;
} else if (typeof self !== 'undefined') {
  self.MedicamentosAgent = MedicamentosAgent;
}
