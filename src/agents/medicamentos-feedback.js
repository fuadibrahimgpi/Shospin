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

// Gatilhos: "<tipo de produto> [de] X" e "<verbo de prescrever> [o/a/um] X".
const _RE_PRODUTO = /\b(?:colirio|pomada|gotas?|gotinhas?|remedio|medicamento|comprimido|capsula)\s+(?:de\s+|do\s+|da\s+|chamado\s+|chamada\s+)?([a-z]{5,})\b/g;
const _RE_VERBO = /\b(?:passar|passo|prescrev\w*|receit\w*|indic\w*|recomend\w*|usar|usa|pingar|pinga|tomar|toma|iniciar|inicia|comecar|comeca|trocar|troca|manter|mantem|suspender|suspende)\s+(?:o\s+|a\s+|um\s+|uma\s+|de\s+|do\s+|da\s+)?([a-z]{5,})\b/g;

function _pareceVerboOuGerundio(t) {
  return /(?:ar|er|ir|ando|endo|indo|ado|ido|ada|ida|ou|aram|eram)$/.test(t);
}

function _janela(palavras, idx, len) {
  const ini = Math.max(0, idx - JANELA_PALAVRAS);
  return palavras.slice(ini, idx + len + JANELA_PALAVRAS).join(' ');
}

/**
 * Palavras da fala que parecem nome de remédio e o léxico não conhece.
 * @param {string} fala        — transcrição (qualquer caixa/acentuação)
 * @param {string|null} tratamento — o que ficou no campo tratamento (para contexto)
 * @returns {Array<{termo, trecho, nomeNoTratamento, genericoNoTratamento}>}
 */
function encontrarSuspeitas(fala, tratamento) {
  const t = _Lex.normalizarLexico(fala);
  if (!t) return [];
  const trat = _Lex.normalizarLexico(tratamento || '');
  const palavras = t.split(' ');
  const vistos = new Set();
  const achados = [];

  for (const re of [_RE_PRODUTO, _RE_VERBO]) {
    const rx = new RegExp(re.source, 'g');
    let m;
    while ((m = rx.exec(t))) {
      const termo = m[1];
      if (vistos.has(termo)) continue;
      if (_NAO_REMEDIO.has(termo) || _pareceVerboOuGerundio(termo)) continue;
      if (_Lex.encontrarMedicamentos(termo).length) continue; // léxico já conhece
      vistos.add(termo);
      const idxPalavra = t.slice(0, m.index + m[0].length - termo.length).split(' ').length - 1;
      achados.push({
        termo,
        trecho: _janela(palavras, idxPalavra, 1),
        nomeNoTratamento: trat.includes(termo),
        genericoNoTratamento: /medicacao ocular prescrita/.test(trat),
      });
    }
  }
  return achados;
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
  MAX_FILA, CLASSES, encontrarSuspeitas, adicionarNaFila, resolver, montarExportacao,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MedicamentosFeedback;
}
if (typeof globalThis !== 'undefined') {
  globalThis.MedicamentosFeedback = MedicamentosFeedback;
} else if (typeof self !== 'undefined') {
  self.MedicamentosFeedback = MedicamentosFeedback;
}
