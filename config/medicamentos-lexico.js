/**
 * LÉXICO DE MEDICAMENTOS OFTALMOLÓGICOS — dados puros, fora de qualquer prompt.
 * ============================================================================
 *
 * Fonte autoritativa de "o que o médico disse" → princípio ativo. Corrigir um
 * nome (marca nova, variante de ASR vista num log) é editar UMA linha aqui; o
 * agente de medicamentos e os testes leem este arquivo.
 *
 * Cada entrada:
 *   id         — chave estável (usada nos testes e no corpus)
 *   principio  — nome registrado no prontuário (princípio ativo, já formatado)
 *   classe     — 'hipotensor' | 'lubrificante' | 'corticoide' | 'antibiotico' |
 *                'associacao_atb_cortic' | 'aine' | 'antialergico' |
 *                'imunomodulador' | 'antiviral' | 'ciclopegico'
 *   nomes      — palavras que o médico pronuncia (princípio e marcas), SEM acento
 *   marcas     — subconjunto de `nomes` que são NOME COMERCIAL, com a grafia de exibição.
 *                Marca dita vai entre parênteses depois do princípio:
 *                "Vigadexa" → "Moxifloxacino + dexametasona (Vigadexa)". Princípio
 *                dito sozinho NÃO ganha marca (nunca se completa o que não foi dito).
 *   asr        — fragmentos de REGEX para variantes que o reconhecedor de voz
 *                produz ("trometolou"). Casados sobre texto normalizado.
 *
 * Matching: texto normalizado (minúsculo, sem acento) com fronteira de palavra.
 * Entradas mais específicas (associações) vêm ANTES das simples: o primeiro
 * casamento numa posição vence.
 */
'use strict';

// Registro do lubrificante quando o médico diz só "lubrificante(s)". O DecisionEngine
// mantém uma cópia desta string (carga independente no navegador); um teste as compara.
const LUBRIFICANTE_PADRAO = 'Carmelose sódica ou hialuronato de sódio';

const MEDICAMENTOS_LEXICO = [
  // ── Associações antibiótico + corticoide (antes dos componentes isolados) ──
  { id: 'vigadexa',   principio: 'Moxifloxacino + dexametasona', classe: 'associacao_atb_cortic', nomes: ['vigadexa'], marcas: ['Vigadexa'], asr: [] },
  { id: 'tobradex',   principio: 'Tobramicina + dexametasona',   classe: 'associacao_atb_cortic', nomes: ['tobradex', 'tobracort'], marcas: ['Tobradex', 'Tobracort'], asr: ['tobra\\s*-?\\s*dexa\\w*'] },
  { id: 'maxitrol',   principio: 'Neomicina + polimixina B + dexametasona', classe: 'associacao_atb_cortic', nomes: ['maxitrol'], marcas: ['Maxitrol'], asr: [] },
  { id: 'cilodex',    principio: 'Ciprofloxacino + dexametasona', classe: 'associacao_atb_cortic', nomes: ['cilodex'], marcas: ['Cilodex'], asr: [] },

  // ── Glaucoma: associações ──
  { id: 'combigan',   principio: 'Brimonidina + timolol',  classe: 'hipotensor', nomes: ['combigan'], marcas: ['Combigan'], asr: [] },
  { id: 'cosopt',     principio: 'Dorzolamida + timolol',  classe: 'hipotensor', nomes: ['cosopt'], marcas: ['Cosopt'], asr: [] },
  { id: 'ganfort',    principio: 'Bimatoprosta + timolol', classe: 'hipotensor', nomes: ['ganfort'], marcas: ['Ganfort'], asr: [] },

  // ── Glaucoma: monoterapias ──
  { id: 'latanoprosta', principio: 'Latanoprosta', classe: 'hipotensor', nomes: ['latanoprosta', 'xalatan', 'xalaprost'], marcas: ['Xalatan', 'Xalaprost'], asr: [] },
  { id: 'travoprosta',  principio: 'Travoprosta',  classe: 'hipotensor', nomes: ['travoprosta', 'travatan'], marcas: ['Travatan'], asr: [] },
  { id: 'bimatoprosta', principio: 'Bimatoprosta', classe: 'hipotensor', nomes: ['bimatoprosta', 'lumigan'], marcas: ['Lumigan'], asr: [] },
  { id: 'timolol',      principio: 'Timolol',      classe: 'hipotensor', nomes: ['timolol', 'timoptol', 'glaucotrat'], marcas: ['Timoptol', 'Glaucotrat'], asr: [] },
  { id: 'brimonidina',  principio: 'Brimonidina',  classe: 'hipotensor', nomes: ['brimonidina', 'alphagan'], marcas: ['Alphagan'], asr: [] },
  { id: 'dorzolamida',  principio: 'Dorzolamida',  classe: 'hipotensor', nomes: ['dorzolamida', 'trusopt'], marcas: ['Trusopt'], asr: [] },
  { id: 'brinzolamida', principio: 'Brinzolamida', classe: 'hipotensor', nomes: ['brinzolamida', 'azopt'], marcas: ['Azopt'], asr: [] },

  // ── Corticoides ──
  { id: 'dexametasona',  principio: 'Dexametasona',  classe: 'corticoide', nomes: ['dexametasona', 'maxidex'], marcas: ['Maxidex'], asr: [] },
  { id: 'prednisolona',  principio: 'Prednisolona',  classe: 'corticoide', nomes: ['prednisolona', 'pred fort', 'predfort'], marcas: ['Pred Fort', 'Predfort'], asr: [] },
  { id: 'fluormetolona', principio: 'Fluormetolona', classe: 'corticoide', nomes: ['fluormetolona', 'fml'], marcas: ['FML'], asr: [] },
  { id: 'loteprednol',   principio: 'Loteprednol',   classe: 'corticoide', nomes: ['loteprednol', 'loteprol'], marcas: ['Loteprol'], asr: [] },

  // ── Antibióticos ──
  { id: 'gatifloxacino',  principio: 'Gatifloxacino',  classe: 'antibiotico', nomes: ['gatifloxacino', 'zymar'], marcas: ['Zymar'], asr: [] },
  { id: 'moxifloxacino',  principio: 'Moxifloxacino',  classe: 'antibiotico', nomes: ['moxifloxacino', 'vigamox'], marcas: ['Vigamox'], asr: [] },
  { id: 'tobramicina',    principio: 'Tobramicina',    classe: 'antibiotico', nomes: ['tobramicina', 'tobrex'], marcas: ['Tobrex'], asr: [] },
  { id: 'ciprofloxacino', principio: 'Ciprofloxacino', classe: 'antibiotico', nomes: ['ciprofloxacino', 'ciloxan'], marcas: ['Ciloxan'], asr: [] },
  { id: 'ofloxacino',     principio: 'Ofloxacino',     classe: 'antibiotico', nomes: ['ofloxacino', 'oflox'], marcas: ['Oflox'], asr: [] },
  { id: 'vancomicina',    principio: 'Vancomicina',    classe: 'antibiotico', nomes: ['vancomicina', 'vancocin'], marcas: ['Vancocin'], asr: [] },

  // ── AINEs ──
  // "trometamol/trometamina" é o sufixo do cetorolaco; o ASR devolve "trometolou"
  // (log 2026-10-22: retirada de corpo estranho, "3 vezes ao dia por 5 dias").
  { id: 'cetorolaco',  principio: 'Cetorolaco',  classe: 'aine', nomes: ['cetorolaco', 'acular'], marcas: ['Acular'], asr: ['trometa\\w*', 'trometo\\w*', 'trometol\\w*'] },
  { id: 'nepafenaco',  principio: 'Nepafenaco',  classe: 'aine', nomes: ['nepafenaco', 'nevanac'], marcas: ['Nevanac'], asr: [] },
  { id: 'diclofenaco', principio: 'Diclofenaco', classe: 'aine', nomes: ['diclofenaco', 'still'], marcas: ['Still'], asr: [] },

  // ── Antialérgicos ──
  { id: 'olopatadina', principio: 'Olopatadina', classe: 'antialergico', nomes: ['olopatadina', 'patanol'], marcas: ['Patanol'], asr: [] },
  { id: 'cetotifeno',  principio: 'Cetotifeno',  classe: 'antialergico', nomes: ['cetotifeno', 'zaditen'], marcas: ['Zaditen'], asr: [] },
  { id: 'alcaftadina', principio: 'Alcaftadina', classe: 'antialergico', nomes: ['alcaftadina', 'lastacaft'], marcas: ['Lastacaft'], asr: [] },
  { id: 'pemirolaste', principio: 'Pemirolaste', classe: 'antialergico', nomes: ['pemirolaste', 'alegysal'], marcas: ['Alegysal'], asr: [] },

  // ── Imunomoduladores / olho seco ──
  { id: 'ciclosporina', principio: 'Ciclosporina', classe: 'imunomodulador', nomes: ['ciclosporina', 'restasis', 'ikervis'], marcas: ['Restasis', 'Ikervis'], asr: [] },

  // ── Lubrificantes ──
  // Princípio DITO (carmelose, hialuronato) é registrado como dito. Marca dita NÃO
  // autoriza princípio — as marcas não têm princípio único mapeado com segurança — então
  // vira a classe + a marca entre parênteses: "Lubrificante ocular (Systane)".
  //
  // PROTOCOLO DECLARADO (2026-11-05): quando o médico diz a palavra "lubrificante(s)" na
  // conduta, sem marca nem princípio, o registro é LUBRIFICANTE_PADRAO — a escolha dele
  // entre os dois genéricos equivalentes, não uma inferência do diagnóstico.
  { id: 'carmelose',   principio: 'Carmelose',   classe: 'lubrificante', nomes: ['carmelose'],   marcas: [], asr: [] },
  { id: 'hialuronato', principio: 'Hialuronato', classe: 'lubrificante', nomes: ['hialuronato'], marcas: [], asr: [] },
  { id: 'lubrificante_padrao', principio: LUBRIFICANTE_PADRAO, classe: 'lubrificante',
    nomes: ['lubrificante', 'lubrificantes'], marcas: [], asr: [] },
  { id: 'lubrificante', principio: 'Lubrificante ocular', classe: 'lubrificante',
    nomes: ['systane', 'hylo', 'hyabak', 'artelac', 'optive fusion', 'optive', 'refresh', 'lacrifilm', 'lagrima artificial'],
    marcas: ['Systane', 'Hylo', 'Hyabak', 'Artelac', 'Optive Fusion', 'Optive', 'Refresh', 'Lacrifilm'], asr: [] },

  // ── Antivirais ──
  { id: 'aciclovir', principio: 'Aciclovir', classe: 'antiviral', nomes: ['aciclovir', 'zovirax'], marcas: ['Zovirax'], asr: [] },

  // ── Ciclopégicos / midriáticos ──
  { id: 'atropina',   principio: 'Atropina',   classe: 'ciclopegico', nomes: ['atropina'], asr: [] },
  { id: 'tropicamida', principio: 'Tropicamida', classe: 'ciclopegico', nomes: ['tropicamida'], asr: [] },
];

/** Minúsculo, sem acento, espaços colapsados — a forma em que tudo é comparado. */
function normalizarLexico(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Chave de comparação de marca: sem acento, minúscula e sem espaços ("Pred Fort" = "predfort").
function _chaveMarca(s) {
  return normalizarLexico(s).replace(/\s+/g, '');
}

/** Grafia de exibição da marca se o termo dito é um nome comercial da entrada; senão null. */
function _marcaDita(entrada, termo) {
  const k = _chaveMarca(termo);
  return (entrada.marcas || []).find(m => _chaveMarca(m) === k) || null;
}

/** Nome como vai para o prontuário: princípio ativo + marca dita entre parênteses. */
function nomeRegistrado(achado) {
  return achado.marca ? `${achado.principio} (${achado.marca})` : achado.principio;
}

function _escapar(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Regex por entrada, montada uma vez. Nomes literais + fragmentos de ASR.
const _REGEX_POR_ID = new Map(MEDICAMENTOS_LEXICO.map(e => {
  const partes = [...e.nomes.map(n => _escapar(normalizarLexico(n)).replace(/ /g, '\\s+')), ...e.asr];
  return [e.id, new RegExp(`\\b(?:${partes.join('|')})\\b`, 'g')];
}));

/**
 * Acha os remédios do léxico num texto, na ordem em que aparecem.
 * Num mesmo trecho, a entrada mais específica (a primeira da lista) vence: o
 * "Vigadexa" não vira também "dexametasona".
 * @returns {Array<{id, principio, classe, termo, marca, indice}>}
 */
function encontrarMedicamentos(texto) {
  const t = normalizarLexico(texto);
  const achados = [];
  const ocupado = []; // [ini, fim) já reivindicados por entrada mais específica
  for (const entrada of MEDICAMENTOS_LEXICO) {
    const re = new RegExp(_REGEX_POR_ID.get(entrada.id).source, 'g');
    let m;
    while ((m = re.exec(t))) {
      const ini = m.index;
      const fim = ini + m[0].length;
      if (ocupado.some(([a, b]) => ini < b && fim > a)) continue;
      ocupado.push([ini, fim]);
      achados.push({ id: entrada.id, principio: entrada.principio, classe: entrada.classe, termo: m[0], marca: _marcaDita(entrada, m[0]), indice: ini });
    }
  }
  return achados.sort((a, b) => a.indice - b.indice);
}

const MedicamentosLexico = { MEDICAMENTOS_LEXICO, LUBRIFICANTE_PADRAO, normalizarLexico, encontrarMedicamentos, nomeRegistrado };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MedicamentosLexico;
}
if (typeof globalThis !== 'undefined') {
  globalThis.MedicamentosLexico = MedicamentosLexico;
} else if (typeof window !== 'undefined') {
  window.MedicamentosLexico = MedicamentosLexico;
} else if (typeof self !== 'undefined') {
  self.MedicamentosLexico = MedicamentosLexico;
}
