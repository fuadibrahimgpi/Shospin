/**
 * CLINICAL TRIGGERS v6 — Fonte autoritativa de gatilhos clínicos
 * ============================================================================
 * Carregado ANTES de todos os outros módulos (primeiro <script> no HTML).
 *
 * Este arquivo centraliza:
 *   - normalizeText() — usada por hooks, runner, GeminiInterviewAgent e DecisionEngine
 *   - Todos os arrays de comandos de voz (STOP, DILATACAO, EXAMES_NORMAIS, etc.)
 *   - Namespace ClinicalTriggers para consumo externo (Node/test/geminiService)
 *
 * NÃO duplicar estas listas em sidepanel-constants.js nem em geminiService.js.
 * Para adicionar um gatilho novo: editar apenas este arquivo.
 */
'use strict';

// ============================================================================
// NORMALIZAÇÃO DE TEXTO
// ============================================================================
// Definida aqui (e não em constants.js) porque geminiService.js precisa dela
// antes de constants.js ser carregado.

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // remove diacríticos
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// STOP_COMMANDS — encerramento de consulta (prioridade 99)
// ============================================================================

const STOP_COMMANDS = [
  'algo que eu possa ajudar', 'algo que possa ajudar',
  'algo que eu posso ajudar', 'algo que posso ajudar',
  'algo mais que eu possa ajudar',
  'algo mais que eu posso ajudar',
  'mais alguma coisa que eu possa ajudar',
  'mais alguma coisa que eu posso ajudar',
  'alguma coisa mais que eu possa ajudar',
  'alguma coisa mais que eu posso ajudar',
  'posso ajudar alguma duvida',
  'posso ajudar em alguma coisa',
  'pode ir na recepcao',
  'pode buscar na recepcao',
  'pode pegar na recepcao',
  'pode ir la na recepcao',
  'pode ir ate a recepcao',
  'ate a proxima consulta',
  'ate o proximo retorno',
  'ate a proxima',
  'ate o proximo',
  'nos vemos em breve',
  'qualquer duvida me procura',
  'qualquer duvida me liga',
  'qualquer duvida pode ligar',
  'qualquer duvida pode me ligar',
  'se tiver alguma duvida me procura',
  'se tiver duvida me liga',
  'se tiver alguma duvida pode me ligar',
  'alguma duvida me procura',
  'alguma duvida me liga',
  'alguma duvida pode ligar',
  'alguma duvida pode me ligar',
  'alguma duvida pode me chamar',
  'alguma duvida me chama',
  'se tiver alguma duvida me liga',
  'se tiver alguma duvida pode ligar',
  'alguma pergunta alguma duvida',
  'alguma duvida alguma pergunta',
  'pode se retirar',
  'pode ir embora',
  'obrigado pela consulta',
  'foi um prazer',
  'so entregar na recepcao',
  'pode entregar na recepcao',
  'entregar na recepcao',
  'entrega na recepcao',
  'so entregar isso na recepcao',
  'pode entregar isso na recepcao',
  'entrega isso na recepcao',
  'pode ir para a recepcao',
  'vai la para a recepcao',
  'vai para a recepcao',
  'vai ate a recepcao',
  'pode ir ate a recepcao',
  'pode ir la ate a recepcao',
  'passa na recepcao',
  'pode passar na recepcao',
  'pode ir pegar a receita',
  'pode pegar a receita',
  'pegar a receita na recepcao',
  'pode pegar la na recepcao',
  'ate o proximo ano',
  'ate ano que vem',
  'nos vemos ano que vem',
  'volte no ano que vem',
  'retorno ano que vem',
  'retorno daqui a um ano',
  'retorno em um ano',
  'retorno em 1 ano',
  'retorno no proximo ano',
  'volte daqui a um ano',
  'volte em um ano',
  'ate daqui a um ano',
  'ate daqui a seis meses',
  'retorno em seis meses',
  'retorno daqui a seis meses',
  'volte em seis meses',
  'volte daqui a seis meses',
  'ate daqui a tres meses',
  'retorno em tres meses',
  'volte em tres meses',
  'a gente se ve depois',
  'nos vemos depois',
  'ate a proxima vez',
  'qualquer coisa estamos ai',
  'qualquer coisa estamos aqui',
  'qualquer coisa pode chamar',
  'qualquer coisa pode ligar',
  'pode fazer os oculos',
  'pode comprar os oculos',
  'pode trocar os oculos',
  'vai fazer os oculos',
  'faz os oculos',
  'troca os oculos',
  'pode pingar sem dor',
  'pode pingar sem do',
  'pode pingar sem problema',
  'pode usar sem dor',
  'pode usar sem problema',
  'pode usar a vontade',
  'volta aqui se nao melhorar',
  'volta aqui se piorar',
  'volta se nao melhorar',
  'volta se piorar',
  'pode voltar se nao melhorar',
  'pode voltar se piorar',
  'volta aqui se necessario',
  'volta se necessario',
  'tudo bom entao',
  'ta bom entao',
  'ficou claro entao',
  'ficou alguma duvida',
  'bom viagem',
  'boa viagem',
  'bom viagem pro senhor',
  'boa viagem pro senhor',
  'bom viagem pra senhora',
  'boa viagem pra senhora',
  'bom dia pro senhor',
  'bom dia pra senhora',
  'boa tarde pro senhor',
  'boa tarde pra senhora',
  'boa noite pro senhor',
  'boa noite pra senhora',
  'ta bom bom',
  'ta otimo bom',
  'ta certo bom',
  'ate mais',
  'ate logo',
  'ate mais ver',
  'usa no que precisa',
  'usa quando precisar',
  'usa sempre que precisar',
];

// ============================================================================
// DILATACAO_COMMANDS — pausa para dilatar pupila (prioridade 50)
// ============================================================================

const DILATACAO_COMMANDS = [
  'vou pedir para esperar um pouco la fora',
  'vou pedir para esperar la fora',
  'vou pedir para aguardar um pouco la fora',
  'vou pedir para aguardar la fora',
  'vou pedir para a senhora esperar um pouco la fora',
  'vou pedir para o senhor esperar um pouco la fora',
  'vou pedir para voce esperar um pouco la fora',
  'vou pedir para a senhora aguardar um pouco la fora',
  'vou pedir para o senhor aguardar um pouco la fora',
  'esperar la fora',
  'aguardar la fora',
  'espera la fora',
  'aguarda la fora',
  'esperar um pouco la fora',
  'espera um pouco la fora',
  'aguarda um pouco la fora',
  'aguardar um pouco la fora',
  'esperar ali fora',
  'espera ali fora',
  'aguarda ali fora',
  'aguardar ali fora',
  'fique la fora',
  'fica la fora',
  'fique ali fora',
  'fica ali fora',
  'senta la fora',
  'senta ali fora',
  'pode esperar la fora',
  'pode esperar ali fora',
  'pode aguardar la fora',
  'pode aguardar ali fora',
  'pode sentar la fora',
  'pode sentar ali fora',
  'pode ir la fora esperar',
  'pode ir ali fora esperar',
  'pode ir la fora aguardar',
  'precisa dilatar',
  'precisamos dilatar',
  'vou dilatar',
  'vai dilatar',
  'vamos dilatar',
  'tem que dilatar',
  'dar uma dilatada',
  'dilatar o olho',
  'dilatar os olhos',
  'colirio para dilatar',
  'colirio dilatador',
  'vou pingar para dilatar',
  'vou colocar o colirio para dilatar',
  'vou pingar o colirio',
  'vou pingar os colirios',
  'pingar o colirio',
  'pingar colirio',
  'pode ir la fora para pingar',
  'vai la fora para pingar o colirio',
  'pingou o colirio',
  'coloquei o colirio',
  'ja coloquei o colirio',
  'ja dilatei',
  'ja pinguei',
  'esperando o colirio fazer efeito',
  'esperar o colirio fazer efeito',
  'esperar um pouco para fazer efeito',
  'esperar fazer efeito',
  'enquanto o colirio faz efeito',
  'aguardar o efeito do colirio',
  'esperar o efeito do colirio',
  'pode ir sentar la fora',
  'pode ir sentar ali fora',
  'pode sentar do lado de fora',
  'vai sentar la fora',
  'vai sentar ali fora',
  'senta aqui fora',
];

// ============================================================================
// DILATACAO_COMBOS — pares de palavras que juntos indicam dilatação
// ============================================================================
// Usados pelo hook runner via hook.combos para detecção por co-ocorrência.
// Ambas as palavras devem estar presentes na mesma fonte de texto.

const DILATACAO_COMBOS = [
  ['colirio', 'la fora'],
  ['colirio', 'dilatar'],
  ['pingar', 'colirio'],
  ['colirio', 'efeito'],
  ['pupila', 'dilatar'],
];

// ============================================================================
// EXAME_EM_ANDAMENTO_COMMANDS — frases que indicam exame/refração em curso
// ============================================================================
// Detectadas no FINAL da transcrição para evitar falsos positivos de frases
// mencionadas no histórico da consulta. Usadas em detectaExameEmAndamento().

const EXAME_EM_ANDAMENTO_COMMANDS = [
  'olha para baixo',
  'olha para cima',
  'olha para frente',
  'encosta o queixo',
  'encosta a testa',
  'nao pisca',
  'abre bem o olho',
  'fecha o outro',
  'tampa o olho',
  'le de cima',
  'le pra mim',
  'consegue ver',
  'melhor assim ou assim',
  'um ou dois',
  'primeira ou segunda',
  'fica mais claro',
  'fica mais embacado',
  'vou colocar uma lente',
  'aproxima',
  'afasta',
  'chega para tras',
];

// ============================================================================
// EXAMES_NORMAIS_COMMANDS — biomicroscopia + fundoscopia normais (prioridade 11)
// ============================================================================

const EXAMES_NORMAIS_COMMANDS = [
  'seus exames estao todos normais',
  'seus exames estao normais',
  'seus exames estao otimos',
  'seus exames estao bons',
  'seus exames hoje estao normais',
  'exames estao todos normais',
  'exames estao normais',
  'exames estao otimos',
  'exames de hoje normais',
  'exames de hoje estao normais',
  'exames todos normais',
  'exames todos bons',
  'exames normais',
  'ta tudo normal nos exames',
  'ta tudo normal no exame',
  'ta tudo certo nos exames',
  'ta tudo bem nos exames',
  'esta tudo normal nos exames',
  'esta tudo certo nos exames',
  'tudo normal nos exames',
  'tudo certo nos exames',
  'biomicroscopia e fundoscopia normais',
  'biomicroscopia e fundoscopia normal',
  'biomicroscopia e a fundoscopia normais',
  'biomicroscopia e a fundoscopia normal',
  'biomicroscopia sem alteracoes',
  'biomicroscopia sem alteracao',
  'fundoscopia sem alteracoes',
  'fundoscopia sem alteracao',
  'biomicroscopia e fundoscopia sem alteracoes',
  'biomicroscopia e fundo de olho sem alteracoes',
  'sem nenhuma alteracao',
  'nao tem nenhuma alteracao',
  'nenhuma alteracao',
  'sem alteracao nenhuma',
  'fundo de olho normal',
  'o fundo de olho ta normal',
  'o fundo de olho esta normal',
  'exame de fundo de olho normal',
  'fundo de olho ta normal',
  'fundo de olho esta normal',
  'fundo de olho sem alteracoes',
  'fundo de olho sem alteracao',
  'seus olhos estao normais',
  'olhos estao normais',
];

// ============================================================================
// EXAME_BLEFARITE_COMMANDS — blefarite/meibomite (prioridade 10)
// ============================================================================

const EXAME_BLEFARITE_COMMANDS = [
  'exame com blefarite',
  'exame compativel com blefarite',
  'biomicroscopia com blefarite',
  'blefarite',
  'blefaromeibomite',
  'exame com blefaromeibomite',
  'biomicroscopia com blefaromeibomite',
  'meibomite',
  'disfuncao de meibomio',
  'disfuncao das glandulas de meibomio',
  'sua palpebra esta inflamada',
  'sua palpebra ta inflamada',
  'palpebra inflamada',
  'palpebras inflamadas',
  'inflamacao da palpebra',
  'inflamacao das palpebras',
  'inflamacao palpebral',
  'comprometimento na lubrificacao',
  'problema na lubrificacao',
  'lubrificacao comprometida',
  'sua lagrima nao esta funcionando bem',
  'sua lagrima nao ta funcionando bem',
  'lagrima nao ta boa',
  'lagrima nao esta boa',
  'problema na lagrima',
  'lagrima comprometida',
  'olho seco por blefarite',
  'ressecamento por blefarite',
  'regiao dos cilios',
  'regiao dos cilies',
  'base dos cilios',
  'lavar os cilios',
  'lava os cilios',
  'lavar bem os cilios',
  'lava bem aqui os cilios',
  'lavar aqui os cilios',
  'enxaguar os cilios',
  'enxagua os cilios',
  'enxaguar bem os cilios',
  'enxagua bem os cilios',
  'enxaguar bem aqui os cilios',
  'enxagua bem aqui os cilios',
  'lavar a margem da palpebra',
  'lavar as margens das palpebras',
  'limpeza da margem palpebral',
  'limpeza dos cilios',
  'limpar a base dos cilios',
  'limpar os cilios',
  'higiene dos cilios',
  'higiene da palpebra',
  'higiene das palpebras',
  'higiene palpebral',
  'bordo palpebral',
];

// ============================================================================
// CATARATA_COMMANDS — flag passiva de cristalino (prioridade 1)
// ============================================================================

const CATARATA_COMMANDS = [
  'tem catarata',
  'com catarata',
  'e catarata',
  'uma catarata',
  'a catarata',
  'catarata incipiente',
  'catarata inicial',
  'catarata madura',
  'catarata nuclear',
  'catarata cortical',
  'catarata subcapsular',
  'catarata senil',
  'opacidade do cristalino',
  'opacidade de cristalino',
  'cristalino opaco',
  'cristalino com opacidade',
];

// ============================================================================
// LIO_COMMANDS — lente intraocular (prioridade 2)
// ============================================================================

const LIO_COMMANDS = [
  'lente intraocular',
  'lente intra ocular',
  'lente esta bem',
  'lente ta bem',
  'lente bem posicionada',
  'lente no lugar',
  'ja operou de catarata',
  'operou catarata',
  'fez cirurgia de catarata',
  'cirurgia de catarata',
  'pseudofacico', 'pseudofaquico',
  'lio bem posicionada',
  'lio transparente',
];

// ============================================================================
// OPACIDADE_CAPSULA_COMMANDS — opacidade de cápsula posterior (prioridade 3)
// ============================================================================

const OPACIDADE_CAPSULA_COMMANDS = [
  'limpeza da lente', 'limpeza de lente',
  'limpar a lente', 'precisa limpar a lente',
  'precisa fazer a limpeza', 'precisa de limpeza',
  'opacidade de capsula', 'opacidade da capsula',
  'capsula posterior opaca',
  'capsulotomia', 'yag',
  'capsula opaca',
  'opacificacao de capsula',
  'opacificacao da capsula posterior',
];

// ============================================================================
// OLHO_IRRITADO_COMMANDS — receita olho irritado (prioridade 20)
// ============================================================================

const OLHO_IRRITADO_COMMANDS = [
  'seu olho esta bem irritado', 'seu olho esta irritado',
  'seu olho ta irritado', 'seu olho ta bem irritado',
  'seus olhos estao irritados',
  'o senhor esta com o olho irritado',
  'a senhora esta com o olho irritado',
  'voce esta com o olho irritado',
  'o senhor ta com o olho irritado',
  'a senhora ta com o olho irritado',
  'voce ta com o olho irritado',
  'olho esta bem irritado', 'olho esta irritado',
  'olhos estao irritados',
  'olho ta irritado', 'olho ta bem irritado',
];

// ============================================================================
// FUNÇÕES DE DETECÇÃO COMPOSTAS
// ============================================================================

/**
 * Detecta dilatação na fala verificando frases exatas E pares de palavras.
 * Mais abrangente que checar apenas DILATACAO_COMMANDS, pois captura
 * combinações como "pingar" + "colirio" mesmo sem prefixo "vou".
 *
 * @param {string} text - texto já normalizado (sem acentos, lowercase)
 * @returns {boolean}
 */
function detectaDilatacaoNaFala(text) {
  const norm = normalizeText(text);
  if (DILATACAO_COMMANDS.some(cmd => norm.includes(cmd))) return true;
  return DILATACAO_COMBOS.some(([a, b]) => norm.includes(a) && norm.includes(b));
}

/**
 * Detecta se o exame/refração ainda está em andamento verificando o FINAL
 * do texto (últimas 300 chars). Não verifica o texto inteiro para evitar
 * falsos positivos de frases mencionadas no histórico.
 *
 * @param {string} text - texto da transcrição (com ou sem acentos)
 * @returns {boolean}
 */
function detectaExameEmAndamento(text) {
  const norm = normalizeText(text);
  const tail = norm.slice(-300);
  return EXAME_EM_ANDAMENTO_COMMANDS.some(cmd => tail.includes(cmd));
}

// ============================================================================
// NAMESPACE EXPORTADO
// ============================================================================

const ClinicalTriggers = {
  normalizeText,
  STOP_COMMANDS,
  DILATACAO_COMMANDS,
  DILATACAO_COMBOS,
  EXAME_EM_ANDAMENTO_COMMANDS,
  EXAMES_NORMAIS_COMMANDS,
  EXAME_BLEFARITE_COMMANDS,
  CATARATA_COMMANDS,
  LIO_COMMANDS,
  OPACIDADE_CAPSULA_COMMANDS,
  OLHO_IRRITADO_COMMANDS,
  detectaDilatacaoNaFala,
  detectaExameEmAndamento,
};

// UMD-style export — funciona em browser (script tag), Node tests e service worker.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClinicalTriggers;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ClinicalTriggers = ClinicalTriggers;
} else if (typeof window !== 'undefined') {
  window.ClinicalTriggers = ClinicalTriggers;
} else if (typeof self !== 'undefined') {
  self.ClinicalTriggers = ClinicalTriggers;
}
