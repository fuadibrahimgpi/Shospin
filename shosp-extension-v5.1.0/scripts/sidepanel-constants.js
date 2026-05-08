/**
 * ============================================================================
 * SIDEPANEL — ESTADO GLOBAL, CONSTANTES E REFERÊNCIAS DOM
 * ============================================================================
 * Carregado PRIMEIRO — todos os outros módulos dependem destas variáveis.
 *
 * v4.1 — Gatilhos reescritos:
 *   - Normalização de acentos (removidos duplicatas com/sem acento)
 *   - Variações naturais de fala adicionadas
 *   - Conflito blefarite vs exames normais resolvido (blefarite tem prioridade)
 *   - Gatilhos de catarata mais específicos (evitar falso positivo)
 */

// ============================================================================
// ESTADO DA APLICAÇÃO
// ============================================================================

let currentMode = 'audio';
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let timerInterval = null;
let seconds = 0;
let permissionChecked = false;
let cameraPermissionChecked = false;

// Dados cumulativos
let audioData = null;
let cameraData = null;

// Controle de injeção duplicada
let audioDataInjected = false;
let cameraDataInjected = false;

// Confirmação pendente para refração suspeita (OD=OE)
let pendingRefractionConfirmation = false;

// Web Speech API
let speechRecognition = null;
let recognizedText = '';
let isModeSwitching = false;
let noSpeechCount = 0; // contador de erros no-speech consecutivos (backoff)

// Stream de áudio persistente
let persistentStream = null;

// Estado da câmera
let cameraStream = null;
let captureInterval = null;
let captureTimeout = null;

// Flags de detecção de gatilhos (resetadas a cada gravação)
let examesNormaisInjetados = false;
let blefariteInjetada = false;
let receitaOlhoIrritadoInjetada = false;
let catarataDetectada = false;
let catarataGrau = null; // "inicial" | "incipiente" | "moderada" | "avançada" | null
let lioDetectada = false;
let opacidadeCapsulaDetectada = false;
let dilatacaoDetectada = false;
let fundoscopiaDetectada = false;

// Cooldown unificado e debounce de parada
let lastTriggerTime = 0;
let stopCommandTimeout = null;

// Buffer de texto recente — persiste entre restarts do Speech API
// (sem isso, o hook de stop perde o trigger se o Speech reiniciar no momento exato)
let recentTextBuffer = '';
let recentTextTimeout = null;

// ============================================================================
// STATE BRIDGE v5.1 (introspecção / debug)
// ============================================================================
// Refatoração estrutural completa do estado fica para v6. Em v5.1 expomos um
// objeto-fachada SOMENTE LEITURA via getters que espelha as 30+ variáveis
// globais já definidas neste arquivo. Permite:
//   - inspecionar o estado por window.__shospState (DevTools)
//   - construir telemetria sem tocar nas variáveis individuais
//   - migração futura: o caller pode adotar __shospState e a substituição
//     interna por StateManager não quebra a API.
// As variáveis continuam sendo a fonte da verdade — este bridge não as
// substitui nem altera comportamento clínico.
window.__shospState = Object.freeze({
  get currentMode()                  { return currentMode; },
  get isRecording()                  { return isRecording; },
  get permissionChecked()            { return permissionChecked; },
  get cameraPermissionChecked()      { return cameraPermissionChecked; },
  get audioData()                    { return audioData; },
  get cameraData()                   { return cameraData; },
  get audioDataInjected()            { return audioDataInjected; },
  get cameraDataInjected()           { return cameraDataInjected; },
  get pendingRefractionConfirmation(){ return pendingRefractionConfirmation; },
  get recognizedText()               { return recognizedText; },
  get noSpeechCount()                { return noSpeechCount; },
  get examesNormaisInjetados()       { return examesNormaisInjetados; },
  get blefariteInjetada()            { return blefariteInjetada; },
  get receitaOlhoIrritadoInjetada()  { return receitaOlhoIrritadoInjetada; },
  get catarataDetectada()            { return catarataDetectada; },
  get catarataGrau()                 { return catarataGrau; },
  get lioDetectada()                 { return lioDetectada; },
  get opacidadeCapsulaDetectada()    { return opacidadeCapsulaDetectada; },
  get dilatacaoDetectada()           { return dilatacaoDetectada; },
  get fundoscopiaDetectada()         { return fundoscopiaDetectada; },
  get lastTriggerTime()              { return lastTriggerTime; },
  get hasStopScheduled()             { return stopCommandTimeout !== null; },
  get recentTextBufferLength()       { return recentTextBuffer.length; },
  // Snapshot serializável para logs (sem referências a timers ou DOM)
  snapshot() {
    return {
      currentMode, isRecording,
      hasAudioData: audioData !== null,
      hasCameraData: cameraData !== null,
      audioDataInjected, cameraDataInjected,
      flags: {
        examesNormaisInjetados, blefariteInjetada, receitaOlhoIrritadoInjetada,
        catarataDetectada, catarataGrau, lioDetectada,
        opacidadeCapsulaDetectada, dilatacaoDetectada, fundoscopiaDetectada,
      },
      hasStopScheduled: stopCommandTimeout !== null,
      recognizedTextLength: recognizedText.length,
    };
  },
});

// ============================================================================
// NORMALIZAÇÃO DE TEXTO
// ============================================================================

/**
 * Remove acentos, cedilha e normaliza espaços.
 * Isso elimina a necessidade de duplicar cada frase com/sem acento,
 * e torna a detecção robusta contra variações do Web Speech API.
 *
 * Exemplo: "seus exames estão ótimos" → "seus exames estao otimos"
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove diacríticos (acentos)
    .replace(/\s+/g, ' ')             // normaliza espaços múltiplos
    .trim();
}

// ============================================================================
// CONSTANTES — GATILHOS DE VOZ
// ============================================================================
// IMPORTANTE: Todos os comandos devem ser escritos SEM acentos,
// pois o texto transcrito é normalizado antes da comparação.
// ============================================================================

const STOP_COMMANDS = [
  // Frases de encerramento com "ajudar" — longas o suficiente para não disparar no meio da consulta
  // Variantes com "possa" (subjuntivo formal) e "posso" (indicativo — mais comum na fala)
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
  // Despedida / encaminhamento para recepção
  'pode ir na recepcao',
  'pode buscar na recepcao',
  'pode pegar na recepcao',
  'pode ir la na recepcao',
  'pode ir ate a recepcao',
  // Encerramento explícito com "consulta" ou "retorno" no contexto
  'ate a proxima consulta',
  'ate o proximo retorno',
  'ate a proxima',
  'ate o proximo',
  'nos vemos em breve',
  // Encerramento com "dúvida" — contexto mais completo
  // Variantes com "qualquer"
  'qualquer duvida me procura',
  'qualquer duvida me liga',
  'qualquer duvida pode ligar',
  'qualquer duvida pode me ligar',
  'se tiver alguma duvida me procura',
  'se tiver duvida me liga',
  'se tiver alguma duvida pode me ligar',
  // Variantes com "alguma" (mais naturais na fala do médico)
  'alguma duvida me procura',
  'alguma duvida me liga',
  'alguma duvida pode ligar',
  'alguma duvida pode me ligar',
  'alguma duvida pode me chamar',
  'alguma duvida me chama',
  'se tiver alguma duvida me liga',
  'se tiver alguma duvida pode ligar',
  // "alguma pergunta" + "alguma duvida" combinados — específico o suficiente
  'alguma pergunta alguma duvida',
  'alguma duvida alguma pergunta',
  // Encaminhamento para saída
  'pode se retirar',
  'pode ir embora',
  'obrigado pela consulta',
  'foi um prazer',
  // Encerramento — entregar na recepção
  'so entregar na recepcao',
  'pode entregar na recepcao',
  'entregar na recepcao',
  'entrega na recepcao',
  'so entregar isso na recepcao',
  'pode entregar isso na recepcao',
  'entrega isso na recepcao',
  // Ir para a recepção — variantes com "para a" (não só "até a")
  'pode ir para a recepcao',
  'vai la para a recepcao',
  'vai para a recepcao',
  'vai ate a recepcao',
  'pode ir ate a recepcao',
  'pode ir la ate a recepcao',
  'passa na recepcao',
  'pode passar na recepcao',
  // Pegar receita / documentos na recepção
  'pode ir pegar a receita',
  'pode pegar a receita',
  'pegar a receita na recepcao',
  'pode pegar la na recepcao',
  // Retorno temporal — anual
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
  // Retorno temporal — semestral / mensal
  'ate daqui a seis meses',
  'retorno em seis meses',
  'retorno daqui a seis meses',
  'volte em seis meses',
  'volte daqui a seis meses',
  'ate daqui a tres meses',
  'retorno em tres meses',
  'volte em tres meses',
  // Retorno temporal — genérico
  'a gente se ve depois',
  'nos vemos depois',
  'ate a proxima vez',
  // Encerramento informal — "qualquer coisa estamos aqui/aí"
  'qualquer coisa estamos ai',
  'qualquer coisa estamos aqui',
  'qualquer coisa pode chamar',
  'qualquer coisa pode ligar',
  // Óculos / receita
  'pode fazer os oculos',
  'pode comprar os oculos',
  'pode trocar os oculos',
  'vai fazer os oculos',
  'faz os oculos',
  'troca os oculos',
  // Colírio / medicamento sem dor — encerramento de consulta com prescrição
  // (médico diz "pode pingar sem dor / sem problema" ao final da consulta)
  'pode pingar sem dor',
  'pode pingar sem do',     // variante de pronúncia / transcrição
  'pode pingar sem problema',
  'pode usar sem dor',
  'pode usar sem problema',
  'pode usar a vontade',
  // Retorno condicional — encerramento com instrução de volta se piorar
  'volta aqui se nao melhorar',
  'volta aqui se piorar',
  'volta se nao melhorar',
  'volta se piorar',
  'pode voltar se nao melhorar',
  'pode voltar se piorar',
  'volta aqui se necessario',
  'volta se necessario',
  // Encerramento com confirmação do paciente
  'tudo bom entao',
  'ta bom entao',
  'ficou claro entao',
  'ficou alguma duvida',
  // Despedida informal ao fim da consulta
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
  // "ta bom" duplo (forma coloquial de encerramento confirmatório)
  'ta bom bom',
  'ta otimo bom',
  'ta certo bom',
  // "até mais" — curto mas inequívoco como despedida
  'ate mais',
  'ate logo',
  'ate mais ver',
  // Combinações naturais de encerramento após instrução sobre óculos
  'usa no que precisa',
  'usa quando precisar',
  'usa sempre que precisar',
];

/**
 * DILATAÇÃO / ESPERA — Gatilho para parar e omitir conduta/tratamento.
 * Cenário: médico pinga colírio dilatador e manda o paciente aguardar fora
 * para retornar mais tarde (mesmo dia) e completar o exame de fundo.
 */
const DILATACAO_COMMANDS = [
  // ── "Vou pedir para esperar" — forma mais comum na prática ───────────────
  'vou pedir para esperar um pouco la fora',
  'vou pedir para esperar la fora',
  'vou pedir para aguardar um pouco la fora',
  'vou pedir para aguardar la fora',
  'vou pedir para a senhora esperar um pouco la fora',
  'vou pedir para o senhor esperar um pouco la fora',
  'vou pedir para voce esperar um pouco la fora',
  'vou pedir para a senhora aguardar um pouco la fora',
  'vou pedir para o senhor aguardar um pouco la fora',
  // ── Instrução de espera com localização física ────────────────────────────
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
  // ── Menção explícita a dilatar ────────────────────────────────────────────
  'precisa dilatar',
  'precisamos dilatar',
  'vou dilatar',
  'vamos dilatar',
  'tem que dilatar',
  'dar uma dilatada',
  'dilatar o olho',
  'dilatar os olhos',
  'colirio para dilatar',
  'colirio dilatador',
  'vou pingar para dilatar',
  'vou colocar o colirio para dilatar',
  // ── Colírio + espera de efeito ────────────────────────────────────────────
  'vou pingar o colirio',
  'vou pingar os colirios',
  'pingou o colirio',
  'coloquei o colirio',
  'ja coloquei o colirio',
  'ja dilatei',
  'ja pinguei',
  'esperando o colirio fazer efeito',
  'esperar o colirio fazer efeito',
  'enquanto o colirio faz efeito',
  'aguardar o efeito do colirio',
  'esperar o efeito do colirio',
  // ── Sentar / aguardar — variantes naturais de fala ───────────────────────
  'pode ir sentar la fora',
  'pode ir sentar ali fora',
  'pode sentar do lado de fora',
  'vai sentar la fora',
  'vai sentar ali fora',
  'senta aqui fora',
];

/**
 * EXAMES NORMAIS — Gatilho para injetar biomicroscopia + fundoscopia normais.
 * Cobre variações naturais: "tá tudo normal", "exames bons", "sem alteração", etc.
 */
const EXAMES_NORMAIS_COMMANDS = [
  // Frases diretas sobre exames (todos os exames)
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
  // Variações coloquiais com "exames" explícito
  'ta tudo normal nos exames',
  'ta tudo normal no exame',
  'ta tudo certo nos exames',
  'ta tudo bem nos exames',
  'esta tudo normal nos exames',
  'esta tudo certo nos exames',
  'tudo normal nos exames',
  'tudo certo nos exames',
  // Biomicroscopia e fundoscopia explícitas (dois exames = todos)
  'biomicroscopia e fundoscopia normais',
  'biomicroscopia e fundoscopia normal',
  'biomicroscopia e a fundoscopia normais',
  'biomicroscopia e a fundoscopia normal',
  // Sem alterações (exames combinados)
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
  // Fundo de olho (implica exame completo quando associado a contexto de normalidade)
  'fundo de olho normal',
  'o fundo de olho ta normal',
  'o fundo de olho esta normal',
  'exame de fundo de olho normal',
  'fundo de olho ta normal',
  'fundo de olho esta normal',
  'fundo de olho sem alteracoes',
  'fundo de olho sem alteracao',
  // Variações com "seus olhos" (implica exame do conjunto)
  'seus olhos estao normais',
  'olhos estao normais'
];

/**
 * BLEFARITE — Gatilho para injetar biomicroscopia com blefarite + fundoscopia normal.
 * Tem PRIORIDADE sobre exames normais (verificado primeiro na detecção).
 */
const EXAME_BLEFARITE_COMMANDS = [
  // Termos técnicos
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
  // Linguagem para o paciente
  'sua palpebra esta inflamada',
  'sua palpebra ta inflamada',
  'palpebra inflamada',
  'palpebras inflamadas',
  'inflamacao da palpebra',
  'inflamacao das palpebras',
  'inflamacao palpebral',
  // Lubrificação / lágrima
  'comprometimento na lubrificacao',
  'problema na lubrificacao',
  'lubrificacao comprometida',
  'sua lagrima nao esta funcionando bem',
  'sua lagrima nao ta funcionando bem',
  'lagrima nao ta boa',
  'lagrima nao esta boa',
  'problema na lagrima',
  'lagrima comprometida',
  // Olho seco associado
  'olho seco por blefarite',
  'ressecamento por blefarite',
  // ── Higiene da região dos cílios — SEM mencionar "shampoo" explicitamente ──
  // Cobre frases como "lava/enxagua bem aqui na região dos cílios"
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

/**
 * CATARATA — Flag passiva (modifica a lente na biomicroscopia).
 * Termos mais específicos para evitar falso positivo com "catarata" isolado
 * em contexto de conversa (ex: "não é catarata").
 */
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
  'cristalino com opacidade'
];

/**
 * LIO (Lente Intraocular) — Flag passiva.
 */
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
  'lio transparente'
];

/**
 * OPACIDADE DE CÁPSULA — Flag passiva.
 */
const OPACIDADE_CAPSULA_COMMANDS = [
  'limpeza da lente', 'limpeza de lente',
  'limpar a lente', 'precisa limpar a lente',
  'precisa fazer a limpeza', 'precisa de limpeza',
  'opacidade de capsula', 'opacidade da capsula',
  'capsula posterior opaca',
  'capsulotomia', 'yag',
  'capsula opaca',
  'opacificacao de capsula',
  'opacificacao da capsula posterior'
];


/**
 * OLHO IRRITADO — Gatilho para injetar receita de olho irritado.
 */
const OLHO_IRRITADO_COMMANDS = [
  // Frases com pronome possessivo — médico descrevendo o olho do paciente
  'seu olho esta bem irritado', 'seu olho esta irritado',
  'seu olho ta irritado', 'seu olho ta bem irritado',
  'seus olhos estao irritados',
  // Frases com "o senhor/a senhora/você" — contexto claro de exame
  'o senhor esta com o olho irritado',
  'a senhora esta com o olho irritado',
  'voce esta com o olho irritado',
  'o senhor ta com o olho irritado',
  'a senhora ta com o olho irritado',
  'voce ta com o olho irritado',
  // Frases com verbo + sujeito externo (médico descrevendo)
  'olho esta bem irritado', 'olho esta irritado',
  'olhos estao irritados',
  'olho ta irritado', 'olho ta bem irritado'
];

// ============================================================================
// CONSTANTES — TEXTOS PADRÃO
// ============================================================================

const BIOMICROSCOPIA_NORMAL = 'AO: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente';
const FUNDOSCOPIA_NORMAL = 'FUNDOSCOPIA INDIRETA: AO retina aplicada, mácula em bom aspecto, sem alteração do padrão vascular, escavação simétrica e fisiológica';
const BIOMICROSCOPIA_BLEFARITE = 'AO: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio com secreção espessa; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente';

// Conduta e tratamento padrão para blefarite (auto-preenchidos quando injectBlefarite = true)
const BLEFARITE_CONDUTA_PADRAO = 'Compressa morna por 2 min antes da higiene palpebral — 2x/dia\nHigiene palpebral com shampoo infantil (espuma na base dos cílios, ~20x, enxaguar) — 3x/dia';
const BLEFARITE_TRATAMENTO_PADRAO = 'Associação (ATB + corticoide ocular) 1 gota 3x/dia após higiene palpebral\nLubrificante ocular 1 gota em cada olho ao longo do dia\nÔmega 3 (EPA+DHA) 1000 mg — 1 comprimido no almoço e 1 no jantar por 30 dias';

const LENTE_CATARATA = 'catarata';
const LENTE_LIO = 'pseudofacia, LIO transparente e bem posicionada';
const LENTE_OPACIDADE_CAPSULA = 'pseudofacia, opacidade de cápsula posterior';

const RECEITA_OLHO_IRRITADO = `USO OCULAR

1 - Carmelose Sódica 5ml/mg                                      1 frasco

Pingar uma gota em cada olho até 8 vezes por dia.

USO EXTERNO

1 - Compressas de água morna por DOIS minutos antes da massagem com xampu.

2 - Xampu infantil                                                           1 frasco

Fazer espuma na palma da mão. Massagear a base dos cílios com a espuma cerca de vinte vezes, cuidando para que o xampu não entre em contato com o olho. Enxaguar bem em seguida. Repetir o processo outra vez.

Realizar este procedimento 3 vezes ao dia.


USO ORAL

1 - Ômega 3 (EPA+DHA) 1000 mg                                     1 caixa

Tomar um comprimido no almoço e um no jantar por 30 dias.`;

// ============================================================================
// CONSTANTES — CÂMERA
// ============================================================================

const MAX_TIME = 15000;

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Retorna biomicroscopia com lente dinâmica baseada nas flags de detecção.
 * Prioridade: opacidade cápsula > LIO > catarata > padrão (cristalino transparente)
 */
function getBiomicroscopiaComLente(baseText) {
  if (opacidadeCapsulaDetectada) return baseText.replace('cristalino transparente', LENTE_OPACIDADE_CAPSULA);
  if (lioDetectada) return baseText.replace('cristalino transparente', LENTE_LIO);
  if (catarataDetectada) {
    const lente = catarataGrau ? `catarata ${catarataGrau}` : LENTE_CATARATA;
    return baseText.replace('cristalino transparente', lente);
  }
  return baseText;
}

// ============================================================================
// REFERÊNCIAS DOM
// ============================================================================

// Seletor de modo
const audioModeBtn = document.getElementById('audioModeBtn');
const cameraModeBtn = document.getElementById('cameraModeBtn');
const audioSection = document.getElementById('audioSection');
const cameraSection = document.getElementById('cameraSection');

// Áudio
const recordBtn = document.getElementById('recordBtn');
const statusText = document.getElementById('statusText');
const timerText = document.getElementById('timerText');
const processingIndicator = document.getElementById('processingIndicator');
const processingStatus = document.getElementById('processingStatus');
const consultationType = document.getElementById('consultationType');
const audioFieldsContainer = document.getElementById('audioFieldsContainer');
const primeiraConsultaFields = document.getElementById('primeiraConsultaFields');
const retornoFields = document.getElementById('retornoFields');

// Câmera
const cameraVideo = document.getElementById('cameraVideo');
const cameraOverlay = document.getElementById('cameraOverlay');
const processingOverlay = document.getElementById('processingOverlay');
const captureCanvas = document.getElementById('captureCanvas');
const cameraStatusText = document.getElementById('cameraStatusText');
const cameraProgress = document.getElementById('cameraProgress');
const progressFill = document.getElementById('progressFill');
const attemptCount = document.getElementById('attemptCount');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const examFieldsContainer = document.getElementById('examFieldsContainer');
const manualCaptureBtn = document.getElementById('manualCaptureBtn');

// Comum
const dataSummary = document.getElementById('dataSummary');
const audioBadge = document.getElementById('audioBadge');
const cameraBadge = document.getElementById('cameraBadge');
const actionButtons = document.getElementById('actionButtons');
const injectAllBtn = document.getElementById('injectAllBtn');
const clearBtn = document.getElementById('clearBtn');
const successMessage = document.getElementById('successMessage');
const btnSearchCid = document.getElementById('btnSearchCid');
const btnSearchCidRetorno = document.getElementById('btnSearchCidRetorno');

// Campos de áudio — primeira consulta
const hdaField = document.getElementById('hdaField');
const medicacoesField = document.getElementById('medicacoesField');
const antecedentesOftField = document.getElementById('antecedentesOftField');
const doencasSistemicasField = document.getElementById('doencasSistemicasField');
const antecedentesFamField = document.getElementById('antecedentesFamField');
const diagnosticoField = document.getElementById('diagnosticoField');
const condutaField = document.getElementById('condutaField');
const medicamentosPrescritosField = document.getElementById('medicamentosPrescritosField');

// Campos de áudio — retorno
const retornoField = document.getElementById('retornoField');
const medicacoesRetornoField = document.getElementById('medicacoesRetornoField');
const diagnosticoRetornoField = document.getElementById('diagnosticoRetornoField');
const condutaRetornoField = document.getElementById('condutaRetornoField');
const medicamentosPrescritosRetornoField = document.getElementById('medicamentosPrescritosRetornoField');

// Campos de exames
const tonometriaSection = document.getElementById('tonometriaSection');
const paquimetriaSection = document.getElementById('paquimetriaSection');
const refracaoSection = document.getElementById('refracaoSection');
