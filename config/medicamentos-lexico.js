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
 *   restaurar  — true: a transcrição enviada ao modelo recebe o nome certo no lugar
 *                das variantes de "asr" (ver restaurarVariantesAsr).
 *   radicais   — pedaços que bastam para dizer que o remédio foi CITADO ("cipro",
 *                "tobra"). Só reconhecem; nunca são usados para nomear.
 *   notaPrompt — observação que acompanha a entrada na base de marcas do prompt.
 *
 * UMA LISTA SÓ (2026-11-11): este arquivo é a única lista de nomes de remédio do
 * projeto. A base de marcas do prompt (montarBaseDoPrompt) e as listas dos guards
 * do DecisionEngine (fonteDeClasse, fonteDoRemedio) são GERADAS daqui. Antes havia
 * listas escritas à mão em outros arquivos, e elas divergiam: uma reconhecia 14 dos
 * 84 nomes daqui, outra escrevia "fluorometolon" onde aqui está "Fluormetolona".
 * O teste [LEXICO-UNICO-1] barra lista nova de remédios fora deste arquivo.
 *
 * Matching: texto normalizado (minúsculo, sem acento) com fronteira de palavra.
 * Entradas mais específicas (associações) vêm ANTES das simples: o primeiro
 * casamento numa posição vence.
 */
'use strict';

// Registro do lubrificante quando o médico diz só "lubrificante(s)". O DecisionEngine
// lê esta constante daqui (não há mais cópia).
const LUBRIFICANTE_PADRAO = 'Carmelose sódica ou hialuronato de sódio';

const MEDICAMENTOS_LEXICO = [
  // ── Associações antibiótico + corticoide (antes dos componentes isolados) ──
  { id: 'vigadexa',   principio: 'Moxifloxacino + dexametasona', classe: 'associacao_atb_cortic', nomes: ['vigadexa'], marcas: ['Vigadexa'], asr: [] },
  { id: 'tobradex',   principio: 'Tobramicina + dexametasona',   classe: 'associacao_atb_cortic', nomes: ['tobradex', 'tobracort'], marcas: ['Tobradex', 'Tobracort'], asr: ['tobra\\s*-?\\s*dexa\\w*'],
    notaPrompt: 'também dito "Tobramicina-Dexa"' },
  { id: 'maxitrol',   principio: 'Neomicina + polimixina B + dexametasona', classe: 'associacao_atb_cortic', nomes: ['maxitrol'], marcas: ['Maxitrol'], asr: [] },
  { id: 'cilodex',    principio: 'Ciprofloxacino + dexametasona', classe: 'associacao_atb_cortic', nomes: ['cilodex'], marcas: ['Cilodex'], asr: [] },

  // ── Glaucoma: associações ──
  { id: 'combigan',   principio: 'Brimonidina + timolol',  classe: 'hipotensor', nomes: ['combigan'], marcas: ['Combigan'], asr: [] },
  { id: 'cosopt',     principio: 'Dorzolamida + timolol',  classe: 'hipotensor', nomes: ['cosopt'], marcas: ['Cosopt'], asr: [] },
  { id: 'ganfort',    principio: 'Bimatoprosta + timolol', classe: 'hipotensor', nomes: ['ganfort'], marcas: ['Ganfort'], asr: [] },

  // ── Glaucoma: monoterapias ──
  { id: 'latanoprosta', principio: 'Latanoprosta', classe: 'hipotensor', nomes: ['latanoprosta', 'xalatan', 'xalaprost'], marcas: ['Xalatan', 'Xalaprost'], asr: [] },
  { id: 'travoprosta',  principio: 'Travoprosta',  classe: 'hipotensor', nomes: ['travoprosta', 'travatan'], marcas: ['Travatan'], asr: [] },
  // ASR (log 2026-11-09): "bimatoprosta com timolol" saiu como "bimato à próstata com timol" e
  // "hematotrófico continua lol". `restaurar` = a transcrição enviada ao modelo recebe o nome certo.
  { id: 'bimatoprosta', principio: 'Bimatoprosta', classe: 'hipotensor', nomes: ['bimatoprosta', 'lumigan'], marcas: ['Lumigan'],
    asr: ['bimato\\w*(?:\\s+(?:a|e|de)?\\s*prosta\\w*)?', 'hematotr\\w*'], restaurar: true },
  // "trometolol"/"timetolol" são TIMOLOL (caso Consulta 4, 2026-10-26). Ficam aqui, e não só
  // na correção de ASR do agente de entrevista: o curinga do cetorolaco ("trometol…", mais
  // abaixo) pegava "trometolol", e os guards — que leem a fala crua — nomeavam Cetorolaco
  // enquanto o modelo recebia "timolol" (revisão 2026-11-10). O timolol vem ANTES do
  // cetorolaco na lista, então a forma exata vence o curinga. "trometolou" segue cetorolaco.
  { id: 'timolol',      principio: 'Timolol',      classe: 'hipotensor', nomes: ['timolol', 'timoptol', 'glaucotrat'], marcas: ['Timoptol', 'Glaucotrat'],
    asr: ['timol\\w*', 'lol', 'trometolol', 'timetolol'], restaurar: true },
  { id: 'brimonidina',  principio: 'Brimonidina',  classe: 'hipotensor', nomes: ['brimonidina', 'alphagan'], marcas: ['Alphagan'], asr: ['brimo\\s+nidina'], restaurar: true },
  { id: 'dorzolamida',  principio: 'Dorzolamida',  classe: 'hipotensor', nomes: ['dorzolamida', 'trusopt'], marcas: ['Trusopt'], asr: ['dorzo\\s+lamida'], restaurar: true },
  { id: 'brinzolamida', principio: 'Brinzolamida', classe: 'hipotensor', nomes: ['brinzolamida', 'azopt'], marcas: ['Azopt'], asr: [] },

  // ── Corticoides ──
  { id: 'dexametasona',  principio: 'Dexametasona',  classe: 'corticoide', nomes: ['dexametasona', 'maxidex'], marcas: ['Maxidex'], asr: [] },
  { id: 'prednisolona',  principio: 'Prednisolona',  classe: 'corticoide', nomes: ['prednisolona', 'pred fort', 'predfort'], marcas: ['Pred Fort', 'Predfort'], asr: [] },
  { id: 'fluormetolona', principio: 'Fluormetolona', classe: 'corticoide', nomes: ['fluormetolona', 'fml'], marcas: ['FML'], asr: [] },
  { id: 'loteprednol',   principio: 'Loteprednol',   classe: 'corticoide', nomes: ['loteprednol', 'loteprol'], marcas: ['Loteprol'], asr: [] },

  // ── Antibióticos ──
  { id: 'gatifloxacino',  principio: 'Gatifloxacino',  classe: 'antibiotico', nomes: ['gatifloxacino', 'zymar'], marcas: ['Zymar'], asr: [], radicais: ['gatiflox'] },
  { id: 'moxifloxacino',  principio: 'Moxifloxacino',  classe: 'antibiotico', nomes: ['moxifloxacino', 'vigamox'], marcas: ['Vigamox'], asr: [], radicais: ['moxifl'] },
  { id: 'tobramicina',    principio: 'Tobramicina',    classe: 'antibiotico', nomes: ['tobramicina', 'tobrex'], marcas: ['Tobrex'], asr: [], radicais: ['tobra'] },
  { id: 'ciprofloxacino', principio: 'Ciprofloxacino', classe: 'antibiotico', nomes: ['ciprofloxacino', 'ciloxan'], marcas: ['Ciloxan'], asr: [], radicais: ['cipro'] },
  { id: 'ofloxacino',     principio: 'Ofloxacino',     classe: 'antibiotico', nomes: ['ofloxacino', 'oflox'], marcas: ['Oflox'], asr: [] },
  { id: 'vancomicina',    principio: 'Vancomicina',    classe: 'antibiotico', nomes: ['vancomicina', 'vancocin'], marcas: ['Vancocin'], asr: [] },

  // ── AINEs ──
  // "trometamol/trometamina" é o sufixo do cetorolaco; o ASR devolve "trometolou"
  // (log 2026-10-22: retirada de corpo estranho, "3 vezes ao dia por 5 dias").
  { id: 'cetorolaco',  principio: 'Cetorolaco',  classe: 'aine', nomes: ['cetorolaco', 'acular'], marcas: ['Acular'], asr: ['trometa\\w*', 'trometo\\w*', 'trometol\\w*'],
    notaPrompt: '"trometamol"/"trometamina"/"trometamino" e variantes de ASR como "trometolou" são o Cetorolaco trometamina — o sufixo trometamina é do cetorolaco' },
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

/**
 * Reescreve, na transcrição que vai ao modelo, as variantes de ASR das entradas
 * marcadas `restaurar` pelo nome certo ("bimato à próstata" → "bimatoprosta").
 * Só reconhecimento fonético do que foi PRONUNCIADO — nunca dedução por diagnóstico.
 *
 * Casa numa cópia sem acento e minúscula ALINHADA caractere a caractere com o
 * original (os espaços não são colapsados) e troca só os trechos casados; todo o
 * resto do texto volta idêntico. Antes, a função desistia em silêncio se o texto
 * tivesse espaço duplo, espaço nas pontas ou quebra de linha — e a transcrição da
 * fase 2 da dilatação sempre tem quebra de linha (revisão 2026-11-10).
 * @returns {{texto: string, trocas: Array<{de: string, para: string}>}}
 */
function restaurarVariantesAsr(texto) {
  const original = String(texto || '');
  const COMBINANTE = /[\u0300-\u036f]/;
  let norm = '';
  const mapa = []; // mapa[i] = posição, no original, do i-ésimo caractere de `norm`
  for (let i = 0; i < original.length; i++) {
    const c = original[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let k = 0; k < c.length; k++) { norm += c[k]; mapa.push(i); }
  }
  const alvos = [];
  for (const entrada of MEDICAMENTOS_LEXICO) {
    if (!entrada.restaurar || !entrada.asr || !entrada.asr.length) continue;
    const re = new RegExp(`\\b(?:${entrada.asr.join('|')})\\b`, 'g');
    let m;
    while ((m = re.exec(norm))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      const ini = mapa[m.index];
      let fim = mapa[m.index + m[0].length - 1] + 1;
      while (fim < original.length && COMBINANTE.test(original[fim])) fim++; // acento solto do último caractere
      if (alvos.some(a => ini < a.fim && fim > a.ini)) continue;
      const de = original.slice(ini, fim);
      // Trecho que já está certo também reserva o lugar: outra entrada não o reescreve.
      alvos.push({ ini, fim, de, para: entrada.nomes[0], certo: normalizarLexico(de) === entrada.nomes[0] });
    }
  }
  const trocar = alvos.filter(a => !a.certo).sort((a, b) => b.ini - a.ini);
  let out = original;
  for (const a of trocar) out = out.slice(0, a.ini) + a.para + out.slice(a.fim);
  return { texto: out, trocas: trocar.slice().reverse().map(a => ({ de: a.de, para: a.para })) };
}

// ============================================================================
// LISTAS GERADAS — tudo o que os guards e o prompt precisam saber de nomes sai daqui
// ============================================================================

/** Como a FALA diz a classe sem nomear o remédio (fragmentos de regex, texto normalizado). */
const PALAVRAS_DE_CLASSE = {
  antibiotico:  'antibi|\\batb\\b',
  hipotensor:   'pressao|glaucoma|hipotensor',
  antialergico: 'alergi|antial',
  corticoide:   'corticoid|cortison',
  aine:         'inflama',
  lubrificante: 'lubrific|lagrima|hidrat',
};

/**
 * Remédios RECONHECIDOS como da classe, mas que NUNCA nomeiam nada: não têm entrada
 * acima (o princípio não foi conferido pelo médico). Servem só para os guards saberem
 * que "a fala citou um antibiótico" ou "a linha já tem um corticoide". São radicais,
 * sem a terminação. "fluorometolon" é a outra grafia de Fluormetolona.
 */
const EXTRAS_DE_CLASSE = {
  antibiotico:           ['neomicin', 'polimixin', 'cloranfenicol', 'gentamicin', 'azitromicin', 'eritromicin'],
  corticoide:            ['fluorometolon', 'sterapred'],
  associacao_atb_cortic: ['garasone'],
  hipotensor:            ['tafluprost'],
  lubrificante:          ['carboximetilcelulos', 'hipromelos', 'hialuronic'],
  ciclopegico:           ['fenilefrin'],
};

/** Protocolos declarados do médico: situação → id da entrada cujo princípio é registrado. */
const PROTOCOLOS = { blefarite: 'tobradex' };

function entradaPorId(id) {
  return MEDICAMENTOS_LEXICO.find(e => e.id === id) || null;
}

function protocolo(nome) {
  const e = entradaPorId(PROTOCOLOS[nome]);
  if (!e) throw new Error(`protocolo "${nome}" sem entrada no léxico`);
  return e;
}

function _radical(palavra) {
  return palavra.replace(/[aeo]$/, '');
}

function _fonteNome(nome) {
  return _escapar(normalizarLexico(nome)).replace(/ /g, '\\s+');
}

/** O nome identifica um PRODUTO (marca ou princípio), e não só a classe ("lubrificante", "lágrima artificial"). */
function _ehNomeProprio(entrada, nome) {
  if ((entrada.marcas || []).some(m => _chaveMarca(m) === _chaveMarca(nome))) return true;
  return normalizarLexico(entrada.principio) === normalizarLexico(nome);
}

/** Alternativas de regex que identificam UMA entrada; cada uma já traz a própria fronteira final. */
function _alternativasDaEntrada(e, opcoes) {
  const { genericos = false, asr = true } = opcoes || {};
  const alts = [];
  for (const n of e.nomes) if (genericos || _ehNomeProprio(e, n)) alts.push(_fonteNome(n) + '\\b');
  if (asr) for (const f of e.asr || []) alts.push(`(?:${f})\\b`);
  // Radical do princípio ("moxifloxacin…" pega "moxifloxacina"), só quando o princípio é um remédio único.
  const p = normalizarLexico(e.principio);
  if (!p.includes(' ') && e.nomes.map(normalizarLexico).includes(p)) alts.push(_escapar(_radical(p)) + '\\w*');
  for (const r of e.radicais || []) alts.push(r + '\\w*');
  return alts;
}

/**
 * Fonte de regex (para texto minúsculo e sem acento) de tudo o que cita um remédio das
 * classes pedidas: nomes, variantes de voz, radicais e os EXTRAS_DE_CLASSE.
 *   genericos — inclui os nomes que só dizem a classe ("lubrificante", "lágrima artificial");
 *   asr       — inclui as variantes de voz (padrão: sim);
 *   extras    — inclui EXTRAS_DE_CLASSE (padrão: sim).
 * Associação entra só pelos próprios nomes: o corticoide de uma associação não vira "antibiótico".
 */
function fonteDeClasse(classes, opcoes) {
  const { extras = true } = opcoes || {};
  const alts = [];
  for (const e of MEDICAMENTOS_LEXICO) {
    if (classes.includes(e.classe)) alts.push(..._alternativasDaEntrada(e, opcoes));
  }
  if (extras) for (const c of classes) for (const x of EXTRAS_DE_CLASSE[c] || []) alts.push(x + '\\w*');
  return `\\b(?:${[...new Set(alts)].join('|')})`;
}

/** Radical de cada componente do princípio: "Tobramicina + dexametasona" → ["tobramicin", "dexametason"]. */
function radicaisDoPrincipio(id) {
  const e = entradaPorId(id);
  if (!e) throw new Error(`remédio "${id}" não está no léxico`);
  return normalizarLexico(e.principio).split(/\s*\+\s*/).map(comp => _escapar(_radical(comp.split(' ')[0])));
}

/** Fonte de regex do que PRONUNCIA um remédio: nomes, variantes de voz e o radical de cada componente. */
function fonteDoRemedio(id) {
  const e = entradaPorId(id);
  if (!e) throw new Error(`remédio "${id}" não está no léxico`);
  const alts = _alternativasDaEntrada(e, { genericos: true });
  for (const r of radicaisDoPrincipio(id)) alts.push(r + '\\w*');
  return `\\b(?:${[...new Set(alts)].join('|')})`;
}

/** Fonte de regex do princípio como ele é ESCRITO numa linha ("tobramicina + dexametasona"). */
function fonteDoPrincipio(id) {
  const e = entradaPorId(id);
  if (!e) throw new Error(`remédio "${id}" não está no léxico`);
  return normalizarLexico(e.principio).split(/\s*\+\s*/)
    .map(p => _escapar(p).replace(/ /g, '\\s+')).join('\\s*\\+\\s*');
}

/** Quantas vezes o texto cita um remédio (entradas do léxico + extras). Para o detector de ruído. */
function contarMencoes(texto) {
  const t = normalizarLexico(texto);
  const extras = Object.values(EXTRAS_DE_CLASSE).reduce((a, l) => a.concat(l), []);
  const re = new RegExp(`\\b(?:${extras.join('|')})\\w*`, 'g');
  return encontrarMedicamentos(t).length + (t.match(re) || []).length;
}

// Ordem e título de cada classe na base de marcas do prompt. `ciclopegico` fica de fora:
// é colírio de exame (dilatação), não de prescrição.
const _CLASSES_NO_PROMPT = [
  ['hipotensor', 'GLAUCOMA (colírios hipotensores)'],
  ['lubrificante', null],
  ['corticoide', 'CORTICOIDES'],
  ['antibiotico', 'ANTIBIÓTICOS'],
  ['associacao_atb_cortic', 'ASSOCIAÇÕES ATB+CORTICOIDE'],
  ['aine', 'ANTI-INFLAMATÓRIOS NÃO ESTEROIDAIS'],
  ['antialergico', 'ANTIALÉRGICOS'],
  ['imunomodulador', 'OLHO SECO / IMUNOMODULADORES'],
  ['antiviral', 'ANTIVIRAIS'],
];

/**
 * Base de marcas → princípio ativo que vai no prompt do agente de entrevista.
 * Gerada das entradas acima: marca nova no léxico aparece no prompt sem outra edição.
 */
function montarBaseDoPrompt() {
  const linhas = ['LISTA DE MEDICAMENTOS OFTALMOLÓGICOS COMUNS (BRASIL) — marca (princípio ativo):'];
  for (const [classe, titulo] of _CLASSES_NO_PROMPT) {
    const entradas = MEDICAMENTOS_LEXICO.filter(e => e.classe === classe);
    if (!entradas.length) continue;
    linhas.push('');
    if (classe === 'lubrificante') {
      const marcas = entradas.reduce((a, e) => a.concat(e.marcas || []), []);
      const principios = entradas
        .filter(e => e.nomes.map(normalizarLexico).includes(normalizarLexico(e.principio)))
        .map(e => normalizarLexico(e.principio));
      linhas.push('LUBRIFICANTES (a MARCA NÃO identifica um princípio único — registre "Lubrificante ocular (Marca)"):');
      linhas.push('  ' + marcas.join(', '));
      linhas.push(`  (princípio só se o médico o DISSE: ${principios.join(', ')})`);
      linhas.push(`  Médico disse só "lubrificante(s)", sem marca nem princípio → "${LUBRIFICANTE_PADRAO}"`);
      continue;
    }
    linhas.push(titulo + ':');
    for (const e of entradas) {
      const marcas = e.marcas || [];
      const base = marcas.length ? `${marcas.join('/')} (${e.principio})` : e.principio;
      linhas.push('  ' + base + (e.notaPrompt ? ` — ${e.notaPrompt}` : ''));
    }
  }
  return linhas.join('\n');
}

const MedicamentosLexico = {
  MEDICAMENTOS_LEXICO, LUBRIFICANTE_PADRAO, PALAVRAS_DE_CLASSE, EXTRAS_DE_CLASSE, PROTOCOLOS,
  normalizarLexico, encontrarMedicamentos, nomeRegistrado, restaurarVariantesAsr,
  entradaPorId, protocolo, fonteDeClasse, fonteDoRemedio, fonteDoPrincipio, radicaisDoPrincipio, contarMencoes, montarBaseDoPrompt,
};

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
