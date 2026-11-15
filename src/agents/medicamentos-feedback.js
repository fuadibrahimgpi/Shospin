/**
 * AUTO-FEEDBACK DE MEDICAÇÕES — captura e fila de revisão (parte pura, sem DOM)
 * ============================================================================
 *
 * Problema: o léxico (config/medicamentos-lexico.js) só aprende quando alguém
 * edita o código depois de ver um erro no log. Remédio novo ou pronúncia que o
 * reconhecedor de voz estraga ("trometolou") ficam sem registro.
 *
 * Este módulo cobre a PARTE PURA do ciclo (testável em Node):
 *   1. encontrarSuspeitas — palavras que parecem remédio na fala e que o léxico
 *      NÃO reconhece;
 *   2. adicionarNaFila    — fila de revisão deduplicada e limitada;
 *   3. resolver           — o médico decide: variante de um remédio existente,
 *      remédio novo, ou ruído;
 *   4. montarExportacao   — JSON das decisões aprovadas.
 *
 * NADA aqui altera o léxico. O léxico só muda quando as decisões aprovadas são
 * exportadas, aplicadas por uma pessoa e cobertas por teste: um nome aprendido
 * errado viraria princípio ativo errado no prontuário.
 *
 * Privacidade: o trecho guardado é uma janela curta ao redor do termo suspeito
 * (não a consulta inteira) e fica só no navegador.
 *
 * Quem persiste (chrome.storage) e desenha a tela é scripts/sidepanel-feedback-med.js.
 */
'use strict';

const _Lex = (typeof module !== 'undefined' && module.exports)
  ? require('../../config/medicamentos-lexico.js') : globalThis.MedicamentosLexico;

const MAX_FILA = 100;
const JANELA_PALAVRAS = 5;

// Palavras que aparecem depois dos gatilhos mas não são nome de remédio.
const _NAO_REMEDIO = new Set([
  'lubrificante', 'lubrificantes', 'colirio', 'colirios', 'pomada', 'pomadas', 'gotas', 'gotinha', 'gotinhas',
  'pressao', 'alergia', 'alergico', 'antialergico', 'antibiotico', 'antibioticos', 'corticoide', 'corticoides',
  'inflamatorio', 'inflamacao', 'tratamento', 'tratamentos', 'compressa', 'compressas', 'higiene', 'shampoo',
  'omega', 'vezes', 'noite', 'manha', 'tarde', 'semana', 'semanas', 'meses', 'horas', 'cada', 'todo', 'todos',
  'toda', 'todas', 'sempre', 'depois', 'antes', 'quando', 'direito', 'esquerdo', 'olhos', 'ambos', 'ambas',
  'nenhum', 'nenhuma', 'algum', 'alguma', 'mesmo', 'mesma', 'outro', 'outra', 'esses', 'essas', 'aquele',
  'aquela', 'isso', 'isto', 'aqui', 'agora', 'hoje', 'tambem', 'ainda', 'apenas', 'somente', 'muito', 'pouco',
  'bastante', 'nada', 'tudo', 'pelo', 'pela', 'pelos', 'pelas', 'como', 'porque', 'quanto', 'quantas',
  'quantos', 'preciso', 'quiser', 'puder', 'receita', 'remedio', 'remedios', 'medicamento', 'medicamentos',
  'medicacao', 'medicacoes', 'medicina', 'oculos', 'lente', 'lentes', 'exame', 'exames', 'retorno', 'consulta',
  'paciente', 'senhora', 'senhor', 'doutor', 'doutora', 'favor', 'vamos', 'comprar', 'pode', 'podem', 'deve',
  'devem', 'tenha', 'tiver', 'estiver', 'esteja', 'melhora', 'mantenha', 'continue', 'continua', 'certo',
  'certa', 'mais', 'menos', 'comeco', 'receitar', 'receitado', 'vezes', 'minutos', 'segundos', 'dias',
  'natural', 'artificial', 'normal', 'forte', 'fraco', 'fraca', 'leve', 'dilatar', 'dilatacao', 'pingar',
]);

// Palavras comuns que a 1ª revisão da fila (2026-11-13, 52 entradas, nenhum remédio)
// mostrou caindo nos gatilhos: "tomar banho", "pingar direto", "usar o computador"...
const _MF_PALAVRAS_COMUNS = new Set([
  'banho', 'direto', 'direta', 'primeiro', 'primeira', 'junto', 'junta', 'proximo', 'proxima', 'ultimo', 'ultima',
  'ordem', 'otimo', 'otima', 'excelente', 'jeito', 'tempo', 'resto', 'canto', 'volta', 'visao', 'vista', 'cirurgia',
  'laser', 'produto', 'negocio', 'coisa', 'coisas', 'monte', 'curso', 'pessoa', 'pessoas', 'alguns', 'algumas',
  'outros', 'outras', 'muita', 'muitas', 'muitos', 'assim', 'entao', 'embora', 'enquanto', 'maior', 'menor',
  'melhor', 'cheque', 'alcool', 'vidro', 'frasco', 'frasquinho', 'limpeza', 'demora', 'prejuizo', 'viavel',
  'computador', 'celular', 'trabalho', 'trabalhar', 'leitura', 'perto', 'longe', 'casa', 'rosto', 'mesmo',
  'mesma', 'geral', 'geralmente', 'havia', 'tinha', 'quando', 'formulario', 'diretorio', 'tranquilo', 'tranquila',
  'molho', 'fogao', 'colinho', 'paraquedas', 'michelin', 'apoiadores', 'bloqueia', 'passei', 'basicamente',
  'olho', 'tela', 'telas', 'agua', 'soro', 'gelo', 'conta', 'parte', 'forma', 'caso', 'vida', 'mundo', 'nivel',
  'artificiais', 'dinheiro', 'preco', 'plano', 'sozinho', 'sozinha', 'certinho', 'certinha', 'direitinho', 'bonitinho',
]);

// Terminações de palavra comum do português (advérbio, substantivo abstrato, verbo
// conjugado, diminutivo). Nome de remédio quase nunca termina assim.
const _MF_RE_TERMINACAO_COMUM = /(?:mente|cao|coes|sao|soes|ao|oes|dor|dores|eiro|eira|eiros|eiras|ario|aria|orio|oria|avel|ivel|eza|inho|inha|inhos|inhas|idade|agem|ismo|ar|er|ir|ando|endo|indo|ado|ido|ada|ida|ados|idos|adas|idas|ou|ei|eu|ia|eia|iam|aram|eram|iram|amos|emos|imos)$/;

// Gatilho de produto: "colírio/pomada/gotas [de] X". "Remédio/medicamento" só com
// "chamado": "algum remédio" é conversa, não nome.
const _RE_PRODUTO = /\b(?:colirio|pomada|gotas?|gotinhas?|comprimido|capsula|(?:remedio|medicamento)(?=\s+chamad))\s+(?:de\s+|chamado\s+|chamada\s+)?([a-z]{5,})\b/g;
// Gatilho de verbo: só vale com contexto de remédio por perto (ver _MF_RE_CONTEXTO).
const _RE_VERBO = /\b(?:passar|passo|prescrev\w*|receit\w*|indic\w*|recomend\w*|usar|usa|pingar|pinga|tomar|toma|iniciar|inicia|comecar|comeca|trocar|troca|manter|mantem|suspender|suspende)\s+(?:o\s+|a\s+|um\s+|uma\s+|de\s+|do\s+|da\s+)?([a-z]{5,})\b/g;
// Fala de remédio: o produto, o pingar, ou a posologia.
const _MF_RE_CONTEXTO = /\b(?:colirio|colirios|pomada|gotas?|gotinhas?|pingar|pinga|pingue|vezes? ao dia|vez por dia|de manha|a noite|de noite|antes de dormir|ao deitar|quando precisar|se precisar|de \d+ em \d+ horas|de \w+ em \w+ horas|receita|receitar|receitei)\b/;
const _MF_JANELA_CONTEXTO = 8;

function _pareceVerboOuGerundio(t) {
  return /(?:ar|er|ir|ando|endo|indo|ado|ido|ada|ida|ou|aram|eram)$/.test(t);
}

function _mfPalavraComum(t) {
  return _NAO_REMEDIO.has(t) || _MF_PALAVRAS_COMUNS.has(t) || _MF_RE_TERMINACAO_COMUM.test(t);
}

function _janela(palavras, idx, len) {
  const ini = Math.max(0, idx - JANELA_PALAVRAS);
  return palavras.slice(ini, idx + len + JANELA_PALAVRAS).join(' ');
}

function _mfLevenshtein(a, b) {
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = cur;
  }
  return ant[b.length];
}

// Nomes de uma palavra só do léxico (princípio e marcas), para achar o nome que o
// reconhecimento de voz deformou ("havia matoprosta" = bimatoprosta).
let _mfNomesCache = null;
function _mfNomesDoLexico() {
  if (_mfNomesCache) return _mfNomesCache;
  const nomes = new Map();
  for (const e of _Lex.MEDICAMENTOS_LEXICO) {
    for (const n of e.nomes || []) {
      const k = _Lex.normalizarLexico(n);
      if (k.includes(' ') || k.length < 7 || _NAO_REMEDIO.has(k)) continue;
      if (!nomes.has(k)) nomes.set(k, e);
    }
  }
  _mfNomesCache = nomes;
  return nomes;
}

/** Nome do léxico de que a palavra é deformação provável (até 2 letras de diferença), ou null. */
function _mfParecidoComLexico(termo) {
  if (termo.length < 7 || _mfPalavraComum(termo)) return null;
  for (const [nome, entrada] of _mfNomesDoLexico()) {
    if (Math.abs(nome.length - termo.length) > 2) continue;
    const d = _mfLevenshtein(termo, nome);
    if (d > 0 && d <= 2 && d <= Math.floor(nome.length / 4)) return entrada;
  }
  return null;
}

/**
 * Palavras da fala que parecem nome de remédio e o léxico não conhece.
 *
 * Três portas, do sinal mais forte ao mais fraco:
 *   1. deformação de um nome do léxico (qualquer lugar da fala);
 *   2. "colírio/pomada/gotas [de] X";
 *   3. "usar/passar/receitar... X", só com fala de remédio por perto.
 * Em 2 e 3, palavra comum do português é descartada (lista + terminações).
 *
 * @param {string} fala        — transcrição (qualquer caixa/acentuação)
 * @param {string|null} tratamento — o que ficou no campo tratamento (para contexto)
 * @returns {Array<{termo, trecho, nomeNoTratamento, genericoNoTratamento, parecidoCom, parecidoComId}>}
 */
function encontrarSuspeitas(fala, tratamento) {
  const t = _Lex.normalizarLexico(fala).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const trat = _Lex.normalizarLexico(tratamento || '');
  const palavras = t.split(' ');
  const vistos = new Set();
  const achados = [];

  const registrar = (termo, idxPalavra, parecido) => {
    vistos.add(termo);
    achados.push({
      termo,
      trecho: _janela(palavras, idxPalavra, 1),
      nomeNoTratamento: trat.includes(termo),
      genericoNoTratamento: /medicacao ocular prescrita/.test(trat),
      parecidoCom: parecido ? parecido.principio : null,
      parecidoComId: parecido ? parecido.id : null,
    });
  };
  const conhecido = (termo) => _Lex.encontrarMedicamentos(termo).length > 0;

  // 1. Deformação de nome do léxico.
  palavras.forEach((p, i) => {
    if (vistos.has(p) || conhecido(p)) return;
    const parecido = _mfParecidoComLexico(p);
    if (parecido) registrar(p, i, parecido);
  });

  // 2 e 3. Gatilhos.
  for (const [re, exigeContexto] of [[_RE_PRODUTO, false], [_RE_VERBO, true]]) {
    const rx = new RegExp(re.source, 'g');
    let m;
    while ((m = rx.exec(t))) {
      const termo = m[1];
      if (vistos.has(termo)) continue;
      if (_mfPalavraComum(termo) || _pareceVerboOuGerundio(termo)) continue;
      if (conhecido(termo)) continue; // léxico já conhece
      const idxPalavra = t.slice(0, m.index + m[0].length - termo.length).split(' ').length - 1;
      if (exigeContexto) {
        const ini = Math.max(0, idxPalavra - _MF_JANELA_CONTEXTO);
        const arredor = palavras.slice(ini, idxPalavra).concat(palavras.slice(idxPalavra + 1, idxPalavra + 1 + _MF_JANELA_CONTEXTO)).join(' ');
        if (!_MF_RE_CONTEXTO.test(arredor)) continue;
      }
      registrar(termo, idxPalavra, null);
    }
  }
  return achados;
}

/**
 * Passa a fila guardada pelo detector atual: item automático que o detector de hoje
 * não acharia no próprio trecho sai; se o trecho tiver outra suspeita (ex.: o termo
 * era "havia" e a suspeita é "matoprosta"), ela entra no lugar. Item manual fica.
 */
function refiltrarFila(fila) {
  const nova = [];
  for (const item of fila || []) {
    if (item.origem === 'manual' || !item.trecho) { nova.push({ ...item }); continue; }
    const achados = encontrarSuspeitas(item.trecho, null);
    const mesmo = achados.find(a => a.termo === _Lex.normalizarLexico(item.termo));
    const escolhido = mesmo || achados[0];
    if (!escolhido) continue;
    nova.push({
      ...item, termo: escolhido.termo,
      parecidoCom: escolhido.parecidoCom || item.parecidoCom || null,
      parecidoComId: escolhido.parecidoComId || item.parecidoComId || null,
    });
  }
  // Dois itens antigos podem ter virado o mesmo termo: soma as ocorrências.
  const porTermo = new Map();
  for (const i of nova) {
    const k = _Lex.normalizarLexico(i.termo);
    const ja = porTermo.get(k);
    if (ja) { ja.ocorrencias = (ja.ocorrencias || 1) + (i.ocorrencias || 1); ja.ts = Math.max(ja.ts || 0, i.ts || 0); }
    else porTermo.set(k, i);
  }
  return [...porTermo.values()];
}

function _id(prefixo) {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Soma suspeitas à fila: termo já pendente só incrementa `ocorrencias`.
 * Mantém no máximo MAX_FILA itens (descarta os mais antigos).
 */
function adicionarNaFila(fila, suspeitas, agora = Date.now()) {
  const nova = (fila || []).map(i => ({ ...i }));
  for (const s of suspeitas || []) {
    const chave = _Lex.normalizarLexico(s.termo);
    const existente = nova.find(i => _Lex.normalizarLexico(i.termo) === chave);
    if (existente) {
      existente.ocorrencias = (existente.ocorrencias || 1) + 1;
      existente.ts = agora;
      continue;
    }
    nova.push({
      id: _id('mf'), ts: agora, termo: s.termo, trecho: s.trecho || '',
      ocorrencias: 1, origem: s.origem || 'auto',
      nomeNoTratamento: !!s.nomeNoTratamento, genericoNoTratamento: !!s.genericoNoTratamento,
      parecidoCom: s.parecidoCom || null, parecidoComId: s.parecidoComId || null,
    });
  }
  return nova.length > MAX_FILA ? nova.slice(nova.length - MAX_FILA) : nova;
}

const CLASSES = ['hipotensor', 'lubrificante', 'corticoide', 'antibiotico', 'associacao_atb_cortic',
  'aine', 'antialergico', 'imunomodulador', 'antiviral', 'ciclopegico'];

/**
 * Aplica a decisão do médico a um item da fila.
 * decisao: { acao: 'variante', alvoId } | { acao: 'novo', principio, classe, marca? } | { acao: 'ruido' }
 * @returns {{fila, aprovado}|{erro}} aprovado = null para ruído
 */
function resolver(fila, id, decisao, agora = Date.now()) {
  const item = (fila || []).find(i => i.id === id);
  if (!item) return { erro: 'item não encontrado' };
  const d = decisao || {};
  let aprovado = null;

  if (d.acao === 'variante') {
    const alvo = _Lex.MEDICAMENTOS_LEXICO.find(e => e.id === d.alvoId);
    if (!alvo) return { erro: 'remédio de destino inválido' };
    aprovado = { acao: 'variante', alvoId: alvo.id, termo: item.termo, trecho: item.trecho, ts: agora };
  } else if (d.acao === 'novo') {
    const principio = String(d.principio || '').trim();
    if (!principio) return { erro: 'informe o princípio ativo' };
    if (!CLASSES.includes(d.classe)) return { erro: 'classe inválida' };
    aprovado = {
      acao: 'novo', principio, classe: d.classe, marca: String(d.marca || '').trim() || null,
      termo: item.termo, trecho: item.trecho, ts: agora,
    };
  } else if (d.acao !== 'ruido') {
    return { erro: 'ação desconhecida' };
  }
  return { fila: fila.filter(i => i.id !== id), aprovado };
}

/** JSON das decisões aprovadas — é o que se aplica ao léxico (por uma pessoa, com teste). */
function montarExportacao(aprovados, agora = new Date()) {
  const lista = aprovados || [];
  return {
    versao: 1,
    geradoEm: agora.toISOString(),
    variantes: lista.filter(a => a.acao === 'variante')
      .map(a => ({ alvoId: a.alvoId, termo: a.termo, trecho: a.trecho })),
    novos: lista.filter(a => a.acao === 'novo')
      .map(a => ({ principio: a.principio, classe: a.classe, marca: a.marca, termo: a.termo, trecho: a.trecho })),
  };
}

const MedicamentosFeedback = {
  MAX_FILA, CLASSES, encontrarSuspeitas, adicionarNaFila, refiltrarFila, resolver, montarExportacao,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MedicamentosFeedback;
}
if (typeof globalThis !== 'undefined') {
  globalThis.MedicamentosFeedback = MedicamentosFeedback;
} else if (typeof self !== 'undefined') {
  self.MedicamentosFeedback = MedicamentosFeedback;
}
