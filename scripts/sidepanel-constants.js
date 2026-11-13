/**
 * ============================================================================
 * SIDEPANEL — ESTADO GLOBAL, CONSTANTES E REFERÊNCIAS DOM
 * ============================================================================
 * Carregado após config/clinical-triggers.js (que define normalizeText e
 * todos os arrays de gatilhos de voz). Este arquivo define apenas:
 *   - Variáveis de estado da sessão (let) e o registro canônico
 *     SESSION_FLAG_DEFAULTS + armazenamento único SessionFlags
 *   - STATE BRIDGE (__shospState — getters de flags gerados do registro)
 *   - Textos-padrão clínicos (BIOMICROSCOPIA_NORMAL, etc.)
 *   - Função auxiliar getBiomicroscopiaComLente()
 *   - Referências DOM
 *
 * Os arrays STOP_COMMANDS, DILATACAO_COMMANDS, EXAMES_NORMAIS_COMMANDS,
 * EXAME_BLEFARITE_COMMANDS, CATARATA_COMMANDS, LIO_COMMANDS,
 * OPACIDADE_CAPSULA_COMMANDS e OLHO_IRRITADO_COMMANDS estão em:
 *   config/clinical-triggers.js
 *
 * normalizeText() também está em config/clinical-triggers.js.
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

// CIDs refrativos do OCR (ticket TOPCON) persistidos entre passadas de injeção.
// A passada de câmera injeta os CIDs específicos (H52.0/H52.2) no diagnosticoField,
// mas a passada de áudio (entrevista) que vem depois sobrescreve esse campo com o
// diagnóstico dela — que pode trazer H52.9 inespecífico. Guardar aqui permite
// re-mesclar os específicos na passada de áudio (o H52.9 redundante é então
// removido por _dropUnspecifiedRefraction). Zerado em resetSession e após consumo.
let _pendingOcrRefracaoCids = [];

// Chaves canônicas dos CIDs JÁ LANÇADOS no SHOSP nesta consulta (ex: "H522").
// handleSearchCid consome o diagnosticoField termo a termo (field.value =
// terms.slice(1)) — ao fim da cadeia o campo está VAZIO. A passada seguinte
// (câmera/OCR) montava a base de deduplicação a partir desse campo vazio e
// relançava um CID que a entrevista já tinha injetado (H52.2 duplicado no log
// 2026-07-29; mesma classe do H52.9 do log 2026-07-21). Este Set é a memória
// que sobrevive ao consumo do campo. Zerado em resetSession e na limpeza manual.
let _cidsLancadosNaSessao = new Set();

// Controle de injeção duplicada
let audioDataInjected = false;
let cameraDataInjected = false;

// true enquanto processAudioInBackground está com a análise do Gemini em voo.
// Sem isso, injectAll não distingue "análise ainda rodando, audioData nem existe"
// de "dados já injetados" e reporta o segundo — foi o que o painel disse às
// 20:07 e 20:10 do log 2026-07-29, quando nada havia sido injetado.
let _analiseEmAndamento = false;

// Modo da PRÓXIMA captura de câmera:
//   'normal'   → fluxo padrão (injectAll: refração DINÂMICA + tono/paqui/CID/etc.)
//   'estatica' → captura pós-dilatação: injeta SOMENTE no bloco Refração ESTÁTICA,
//                sem tocar em nenhum outro campo. Armado pelo botão da retomada
//                (sala de espera de dilatação) e volta a 'normal' após a captura.
let _captureMode = 'normal';

// Confirmação pendente para refração suspeita (OD=OE)
let pendingRefractionConfirmation = false;

// Web Speech API
let speechRecognition = null;
let recognizedText = '';
let isModeSwitching = false;
let noSpeechCount = 0; // contador de erros no-speech consecutivos (backoff)
let isSpeechPausedByCamera = false;
let isSpeechActive = false;
let isSpeechBackingOff = false;
let speechRecoveryTimer = null;
// `onend` foi visto desde o último `onstart`? Distingue "o Chrome encerrou a
// sessão e o restart falhou" de "a sessão morreu sem emitir evento nenhum" —
// dois diagnósticos diferentes que a sonda de liveness precisa não confundir.
let speechEndSeen = false;
// Reciclo do reconhecedor: `start()` lançar InvalidStateError prova que a sessão
// está VIVA, não que ela está PRODUZINDO. No log 2026-09-03 o reconhecedor ficou
// zumbi por 189s — vivo para a sonda, mudo para o `onresult`, sem sequer emitir
// `no-speech` — e o auto-stop por silêncio encerrou a consulta no meio do exame.
// A prova de produção é o próprio texto: sem `onresult` por SPEECH_RECICLO_MS,
// o reconhecedor é derrubado e recriado. Ver _reciclarSpeechRecognition.
let ultimoRecicloSpeech = 0;
let reciclosSpeechNaSessao = 0;


// Stream de áudio persistente
let persistentStream = null;
// Saúde do microfone: a track pode ficar MUDA (mute) sem terminar (`ended`) —
// o SO/driver rouba o dispositivo, a extensão não recebe erro nenhum e a
// sessão inteira sai vazia sem uma linha de log. Ver _watchMicTrack.
let micMudoDetectado = false;

// Estado da câmera
let cameraStream = null;
let captureInterval = null;
let captureTimeout = null;

// ============================================================================
// REGISTRO CANÔNICO DAS FLAGS DE SESSÃO (resetadas a cada gravação)
// ============================================================================
// Fonte única da verdade sobre QUAIS flags de detecção existem e seus valores
// iniciais. As camadas de acesso (SessionFlags, StateManager, HOOK_STATE,
// __shospState e o _BRIDGE dos testes) são GERADAS a partir destas chaves —
// para adicionar uma flag nova, basta registrá-la aqui.
//
// Notas por flag:
//   catarataGrau — "inicial" | "incipiente" | "moderada" | "avançada" | null
//   lioLado — "OD" | "OE" | "AO" | null. Lado PSEUDOFÁCICO quando conhecido.
//     Os gatilhos de voz não sabem o lado (deixam null = lente aplicada em todas
//     as linhas, comportamento histórico); a rede determinística
//     (parsePseudofaciaFromDados) só liga lioDetectada quando consegue o lado,
//     para não escrever pseudofacia no olho fácico de um paciente operado de um
//     olho só. Ver getBiomicroscopiaComLente.
//   despedidaNaSessao — sticky: uma despedida/encerramento já foi DETECTADA
//     nesta sessão (mesmo que bloqueada pelo gate ou cancelada). Diferente de
//     consultaEncerradaDetectada, NÃO é limpa no cancelamento — persiste até o
//     resetSession. Usada para suprimir a dilatação depois que o médico já
//     sinalizou fim de consulta (evita hijack de consulta encerrada quando o
//     "vamos dilatar" se refere a outra pessoa).
//   fase2DilatacaoAtiva — havia um slot ARMADO (retomar=true) na fila de
//     pausas de dilatação (_shospDilatacaoPausas) quando esta gravação começou
//     — ou seja, esta sessão é o RETORNO do paciente. Suprime o hook de
//     dilatação por voz: frases retrospectivas inevitáveis no retorno ("já
//     dilatou", "pinguei o colírio para dilatar a pupila") re-disparavam a
//     pausa e a consulta nunca fechava. Setada em startRecording() a partir da
//     fila (exceto motivo='exame'); os fallbacks pós-parada varrem só a cauda.
const SESSION_FLAG_DEFAULTS = Object.freeze({
  examesNormaisInjetados: false,
  blefariteInjetada: false,
  receitaOlhoIrritadoInjetada: false,
  catarataDetectada: false,
  catarataGrau: null,
  lioDetectada: false,
  lioLado: null,
  opacidadeCapsulaDetectada: false,
  lenteLimpaDetectada: false,
  dilatacaoDetectada: false,
  fundoscopiaDetectada: false,
  consultaEncerradaDetectada: false,
  despedidaNaSessao: false,
  fase2DilatacaoAtiva: false,
});

// Armazenamento ÚNICO das flags de sessão. Sealed: escrever numa chave fora do
// registro falha (em vez de criar propriedade nova silenciosamente).
// Todo acesso é explícito: SessionFlags.<flag> nos módulos, ou via
// StateManager.set/getHookFlag e HOOK_STATE (hooks).
const SessionFlags = Object.seal({ ...SESSION_FLAG_DEFAULTS });

// Id do slot da fila de dilatação criado/consumido pela sessão atual.
// Setado por processAudioInBackground quando uma pausa nasce (ou quando uma
// retomada é consumida) e usado por injectAll para gravar o payload de áudio
// da fase 1 no slot CERTO — nunca no de outro paciente da fila.
let dilatacaoPausaAtualId = null;

// Cooldown unificado e debounce de parada
let lastTriggerTime = 0;
let stopCommandTimeout = null;
// Metadados do stop agendado: { hookId, cmd, endAnchored, onCancel }.
// Usado pelo runner para CANCELAR stops de frases curtas (endAnchored) caso
// a fala continue depois da despedida ("tá bom então... vamos medir a pressão").
let stopPendingInfo = null;
// Âncora do gate de captura (condicionante de encerramento): posição no texto
// normalizado até onde despedidas já foram BLOQUEADAS por falta de conduta/
// tratamento ditados. Só uma despedida dita APÓS esta posição pode encerrar
// a consulta — sem isso, a despedida antiga que ficou no transcript pararia
// a gravação no meio do ditado da prescrição. Ver _stopGateBlocks no runner.
let stopGateOffset = 0;
// Válvula de escape do gate: nº de despedidas DISTINTAS já bloqueadas por
// falta de conduta/tratamento nesta sessão. A partir da 2ª despedida distinta
// sem captura o gate LIBERA o encerramento — casos reais (2026-07-03/06/07)
// mostraram que despedida repetida sem captura indica marcador de conduta
// faltando (falso bloqueio), não conduta faltando. Ver _stopGateBlocks.
let stopGateBlockCount = 0;

// Auto-stop por silêncio prolongado (consultas que terminam sem despedida detectável)
let lastSpeechTime = 0;
let silenceCheckInterval = null;
let silencePendingStop = null;
let semFalaAvisoAtivo = false; // aviso "sem fala há Xs" ativo no status (mic morto)

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
const _stateBridge = {
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
  get isSpeechPausedByCamera()       { return isSpeechPausedByCamera; },
  get isSpeechActive()               { return isSpeechActive; },
  get reciclosSpeechNaSessao()       { return reciclosSpeechNaSessao; },
  get lastTriggerTime()              { return lastTriggerTime; },
  get hasStopScheduled()             { return stopCommandTimeout !== null; },
  get stopGateOffset()               { return stopGateOffset; },
  get stopGateBlockCount()           { return stopGateBlockCount; },
  get recentTextBufferLength()       { return recentTextBuffer.length; },
  // Snapshot serializável para logs (sem referências a timers ou DOM).
  // As flags são geradas de SESSION_FLAG_DEFAULTS (loop abaixo) — cobertura
  // garantida por construção e verificada pelos testes [FLAGS-*].
  snapshot() {
    const flags = {};
    for (const name of Object.keys(SESSION_FLAG_DEFAULTS)) flags[name] = this[name];
    return {
      currentMode, isRecording,
      hasAudioData: audioData !== null,
      hasCameraData: cameraData !== null,
      audioDataInjected, cameraDataInjected,
      isSpeechPausedByCamera, isSpeechActive, reciclosSpeechNaSessao,
      flags,
      hasStopScheduled: stopCommandTimeout !== null,
      recognizedTextLength: recognizedText.length,
    };
  },
};
// Getters das flags de sessão — gerados do registro canônico.
for (const _flagName of Object.keys(SESSION_FLAG_DEFAULTS)) {
  Object.defineProperty(_stateBridge, _flagName, {
    get: () => SessionFlags[_flagName],
    enumerable: true,
  });
}
window.__shospState = Object.freeze(_stateBridge);

// Arrays de gatilhos clínicos definidos em config/clinical-triggers.js
// normalizeText() também em config/clinical-triggers.js

// ============================================================================
// CONSTANTES — TEXTOS PADRÃO
// ============================================================================

const BIOMICROSCOPIA_NORMAL = 'AO: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente';
const FUNDOSCOPIA_NORMAL = 'FUNDOSCOPIA INDIRETA: AO retina aplicada, mácula em bom aspecto, sem alteração do padrão vascular, escavação simétrica e fisiológica';
// "com secreção espessa" removido em 2026-08-04 (decisão do médico): a secreção
// espessa (meibum expressível) é um achado à parte, que só existe se o médico o
// examinou — no bloco padrão ela virava rotina. O template descreve apenas a
// inflamação da margem, alinhado aos exemplos do prompt e das skills.
const BIOMICROSCOPIA_BLEFARITE = 'AO: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente';

// Conduta e tratamento padrão para blefarite (auto-preenchidos quando injectBlefarite = true)
const BLEFARITE_CONDUTA_PADRAO = 'Compressa morna por 2 min antes da higiene palpebral — 2x/dia\nHigiene palpebral com shampoo infantil (espuma na base dos cílios, ~20x, enxaguar) — 3x/dia';
const BLEFARITE_TRATAMENTO_PADRAO = 'Tobramicina + dexametasona 3x/dia após higiene palpebral\nCarmelose sódica ou hialuronato de sódio em cada olho ao longo do dia\nÔmega 3 (EPA+DHA) 1000 mg — 1 comprimido no almoço e 1 no jantar por 30 dias';

// Texto padrão do campo TRATAMENTO (regra do médico, 2026-11-12): quando nenhum medicamento foi
// mencionado na conduta, o campo recebe "Sem prescrição de medicação". UM só lugar decide, e os três
// que escrevem o texto (displayAudioResults, primeira consulta e retorno, e o `_trat` do injectAll)
// passam por aqui — se um deles lesse só o valor do campo, o painel vazio voltaria a receber o texto
// na hora de injetar. Devolve null quando o texto NÃO deve ser escrito:
//   • dilatação (fase 1): o tratamento pertence ao pós-dilatação;
//   • `suprimirTextoPadraoTratamento` (DecisionEngine): o tratamento ficou vazio, mas a fala
//     prescreve ou mantém uma medicação — "Sem prescrição" seria o oposto da fala; o médico foi avisado.
const TEXTO_SEM_PRESCRICAO = 'Sem prescrição de medicação';
function tratamentoPadrao(data) {
  if (!data || data.dilatacaoDetectada || data.suprimirTextoPadraoTratamento) return null;
  return TEXTO_SEM_PRESCRICAO;
}

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
 * O texto-base já afirma a lente de um olho pseudofácico?
 *
 * Desde 2026-08-03 o prompt manda o modelo escrever a lente DIRETO na linha do olho
 * operado ("pseudofacia, LIO transparente e bem posicionada") em vez do placeholder.
 * Isso torna alcançável um texto MISTO: uma linha com a LIO escrita e a outra ainda
 * com "cristalino transparente" — ou seja, o olho FÁCICO. Ver _aplicaLente.
 */
function _textoJaAfirmaPseudofacia(baseText) {
  return /pseudofac|\bLIO\b|lente\s+intra\s?ocular/i.test(baseText || '');
}

/**
 * Substitui o placeholder "cristalino transparente" pela lente.
 *
 * `lado` ("OD"/"OE") restringe a substituição às linhas daquele olho — o texto de
 * biomicroscopia é uma linha por olho ("OD: ...\nOE: ..."). Sem lado (null/"AO") a
 * substituição é global, que é o comportamento dos gatilhos de voz (não sabem o lado).
 *
 * Linha "AO:" com lado unilateral NÃO é substituída: escrever pseudofacia num texto
 * que fala dos dois olhos inventaria a cirurgia no olho fácico. Mesma política do
 * _bioNormalSeguro em sidepanel-injection.js — placeholder visível é melhor que
 * afirmação falsa, e o médico corrige a linha.
 */
function _aplicaLente(baseText, lente, lado) {
  const LADO = String(lado || '').toUpperCase();
  if (LADO !== 'OD' && LADO !== 'OE') return baseText.replaceAll('cristalino transparente', lente);

  let ignorouLinhaBilateral = false;
  const out = baseText.split('\n').map((linha) => {
    if (!linha.includes('cristalino transparente')) return linha;
    // Prefixo do olho no INÍCIO da linha, tolerando o marcador "[CONFIRMAR OLHO AFETADO] ".
    // Deliberadamente ancorado: buscar OD/OE solto acharia a menção ao outro olho no meio
    // da frase ("OD ... em relação ao OE") e trocaria a lente da linha errada.
    const m = linha.match(/^\s*(?:\[[^\]]*\]\s*)?(OD|OE|AO)\b/i);
    const prefixo = m ? m[1].toUpperCase() : null;
    if (prefixo === LADO) return linha.replaceAll('cristalino transparente', lente);
    if (prefixo === 'OD' || prefixo === 'OE') return linha; // olho contralateral: fácico
    ignorouLinhaBilateral = true;                            // "AO" ou linha sem prefixo
    return linha;
  }).join('\n');

  if (ignorouLinhaBilateral) {
    console.warn(`[Lente] Pseudofacia ${LADO} não aplicada — o texto descreve os olhos juntos ("AO"/sem prefixo). Placeholder mantido para descrição manual.`);
  }
  return out;
}

/**
 * Cápsula opacificada num texto que JÁ afirma a pseudofacia com a lente LIMPA.
 *
 * Desde 2026-08-03 o modelo escreve a lente direto na linha do olho operado; quando ele
 * escreve a forma limpa ("pseudofacia, LIO transparente e bem posicionada") e o médico
 * descreveu a cápsula embaçada, a substituição de placeholder não tem o que trocar — o
 * texto sairia contradizendo a fala. Aqui a troca é sobre o ESTADO DA CÁPSULA, não sobre
 * a existência da cirurgia: uma linha que já diz "pseudofacia" não é olho fácico, então
 * atualizá-la não inventa cirurgia nenhuma (é por isso que o guard de texto misto do LIO
 * não se aplica a este caminho).
 *
 * `lado` unilateral restringe a troca à linha daquele olho; linha "AO" com lado unilateral
 * é preservada — afirmar opacidade nos dois olhos quando só um foi descrito seria invenção,
 * mesma política de _aplicaLente.
 */
function _upgradeParaOpacidadeCapsula(baseText, lado) {
  const LIO_LIMPA = /LIO\s+transparente\s+e\s+bem\s+posicionada/gi;
  if (!LIO_LIMPA.test(baseText)) {
    if (!/opacidade\s+de\s+c[áa]psula/i.test(baseText)) {
      console.warn('[Lente] Opacidade de cápsula detectada, mas o texto afirma a pseudofacia com outra redação — cápsula NÃO atualizada. Confira o cristalino na biomicroscopia.');
    }
    return baseText;
  }

  const LADO = String(lado || '').toUpperCase();
  const restringe = (LADO === 'OD' || LADO === 'OE');
  let ignorouLinhaBilateral = false;

  const out = baseText.split('\n').map((linha) => {
    if (!/LIO\s+transparente\s+e\s+bem\s+posicionada/i.test(linha)) return linha;
    if (restringe) {
      const m = linha.match(/^\s*(?:\[[^\]]*\]\s*)?(OD|OE|AO)\b/i);
      const prefixo = m ? m[1].toUpperCase() : null;
      if (prefixo !== LADO) {
        if (prefixo !== 'OD' && prefixo !== 'OE') ignorouLinhaBilateral = true;
        return linha;
      }
    }
    return linha.replace(/LIO\s+transparente\s+e\s+bem\s+posicionada/gi, 'opacidade de cápsula posterior');
  }).join('\n');

  if (ignorouLinhaBilateral) {
    console.warn(`[Lente] Opacidade de cápsula ${LADO} não aplicada — o texto descreve os olhos juntos ("AO"/sem prefixo). Redação da lente mantida para correção manual.`);
  }
  return out;
}

/**
 * Retorna biomicroscopia com lente dinâmica baseada nas flags de detecção.
 * Prioridade: opacidade cápsula > LIO > catarata > padrão (cristalino transparente)
 */
function getBiomicroscopiaComLente(baseText) {
  if (!baseText) return baseText;

  // GUARD DE TEXTO MISTO: o modelo já escreveu a lente do olho pseudofácico numa das
  // linhas. Os placeholders que sobraram são do olho FÁCICO — trocá-los por LIO/
  // opacidade de cápsula inventaria uma cirurgia que o paciente não fez naquele olho.
  const _jaTemLente = _textoJaAfirmaPseudofacia(baseText);

  if (SessionFlags.opacidadeCapsulaDetectada) {
    // Texto que já afirma pseudofacia NÃO volta intacto aqui (ao contrário do LIO): a
    // cápsula embaçada é uma atualização da lente já escrita. Ver _upgradeParaOpacidadeCapsula.
    if (_jaTemLente) return _upgradeParaOpacidadeCapsula(baseText, SessionFlags.lioLado);
    return _aplicaLente(baseText, LENTE_OPACIDADE_CAPSULA, SessionFlags.lioLado);
  }
  // LIO tem prioridade sobre catarata: pseudofacia confirmada significa que o cristalino
  // natural já foi removido — não pode haver catarata nesse olho. Se ambas as flags
  // dispararam, a menção de catarata é histórica ("antes da cirurgia tinha catarata") e a
  // LIO (LIO_COMMANDS já não cobre cirurgia futura) é o achado definitivo. Ver Caso 7.
  if (SessionFlags.lioDetectada) {
    if (_jaTemLente) return baseText;
    return _aplicaLente(baseText, LENTE_LIO, SessionFlags.lioLado);
  }
  if (SessionFlags.catarataDetectada) {
    const lente = SessionFlags.catarataGrau ? `catarata ${SessionFlags.catarataGrau}` : LENTE_CATARATA;
    // Catarata NÃO passa pelo guard misto: num paciente operado de um olho só, a linha
    // que ainda tem placeholder é justamente a do olho fácico — onde a catarata cabe.
    return _aplicaLente(baseText, lente, null);
  }
  return baseText;
}

/**
 * Deriva presença e grau de catarata a partir do texto do diagnóstico do LLM.
 *
 * O cristalino dinâmico (getBiomicroscopiaComLente) depende da flag catarataDetectada,
 * ligada APENAS pelos gatilhos de voz (CATARATA_COMMANDS). Quando o reconhecimento de
 * voz embaralha a fala do médico ("catarata" não é transcrito de forma limpa), o gatilho
 * não dispara, mas o Gemini ainda diagnostica catarata e injeta o CID H25.x — e a
 * biomicroscopia sairia com "cristalino transparente", contradizendo o diagnóstico.
 * sidepanel-injection.js usa esta função para reconciliar a flag pelo próprio diagnóstico.
 *
 * Função PURA (sem efeitos colaterais) para ser testável. Retorna { detected, grau }.
 *
 * NÃO considera catarata secundária / opacidade de cápsula posterior (H26.4): esse achado
 * é de olho pseudofácico e tem lente própria (LENTE_OPACIDADE_CAPSULA), não "catarata".
 *
 * NÃO considera menção HISTÓRICA de catarata já operada — ex.: "Ambliopia OD
 * (pós-cirurgia de catarata traumática)". Os trechos de contexto cirúrgico são
 * removidos antes da detecção; um diagnóstico real de catarata sobrevive por CID
 * (H25.x / H26.0–3) ou pela palavra fora do contexto cirúrgico ("Catarata senil AO").
 */
function parseCatarataFromDiagnostico(diagnostico) {
  const vazio = { detected: false, grau: null };
  if (!diagnostico) return vazio;

  const norm = diagnostico.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Remove menções históricas (cirurgia já realizada) para que a palavra "catarata"
  // dentro delas não conte como achado ativo. CIDs não aparecem nesses trechos,
  // então a detecção por H25/H26 não é afetada.
  const semHistorico = norm
    .replace(/cirurgia\s+de\s+catarata/g, ' ')
    .replace(/operad[ao]s?\s+de\s+catarata/g, ' ')
    .replace(/facectomia/g, ' ');

  // Exclui catarata secundária / opacidade de cápsula posterior (olho pseudofácico).
  const secundaria =
    /catarata\s+secundaria/.test(semHistorico) ||
    /\bh26\.?4\b/.test(semHistorico) ||
    /capsula\s+posterior/.test(semHistorico);
  if (secundaria) return vazio;

  // Catarata "real" (olho fácico): CID H25.x (senil) ou H26.0–3 (outras cataratas),
  // ou a palavra "catarata" em texto puro.
  const detected =
    /\bh25\.?\d/.test(semHistorico) ||
    /\bh26\.?[0-3]\b/.test(semHistorico) ||
    /\bcatarata\b/.test(semHistorico);
  if (!detected) return vazio;

  let grau = null;
  if (/incipiente/.test(semHistorico)) grau = 'incipiente';
  else if (/inicial/.test(semHistorico)) grau = 'inicial';
  else if (/moderada/.test(semHistorico)) grau = 'moderada';
  else if (/avancad[ao]|madura/.test(semHistorico)) grau = 'avançada';

  return { detected: true, grau };
}

/**
 * Deriva PSEUDOFACIA (olho já operado de catarata) dos dados estruturados do LLM.
 *
 * Origem (log 2026-08-03): paciente pseudofácica AO ("eu fiz a cirurgia de catarata
 * tem um ano"; médico: "a cirurgia ficou boa"). Nenhum gatilho de LIO disparou —
 * LIO_COMMANDS só tinha as formas de 3ª pessoa ("fez cirurgia de catarata"), não a
 * fala do próprio paciente ("fiz") — então a biomicroscopia foi injetada com
 * "cristalino transparente" num olho SEM cristalino. Nem o CID salvava: a consulta
 * não gerou Z96.1 (saiu H401/H524/H010), e é o campo antecedentes_oftalmologicos
 * que carrega a cirurgia.
 *
 * Função PURA (sem efeitos colaterais). Retorna { detected, lado }, com
 * lado ∈ "OD" | "OE" | "AO" | null. `detected` sem `lado` = evidência de pseudofacia
 * com lateralidade ambígua: o chamador NÃO deve ligar a flag (ver sidepanel-injection).
 *
 * Só conta cirurgia JÁ REALIZADA — mesma regra do LIO_COMMANDS. Linhas de cirurgia
 * PLANEJADA ("indicada cirurgia de catarata", "vai operar"), negativas ("nega cirurgia")
 * e cirurgia de TERCEIRO ("minha mãe operou o olho direito", que só aparece em hda) são
 * descartadas.
 */
function parsePseudofaciaFromDados(dados) {
  const vazio = { detected: false, lado: null };
  if (!dados) return vazio;

  // hda/retorno entram porque é ali que a cirurgia costuma vir na voz do paciente
  // ("fiz um olho e depois o outro"). Fonte narrativa é segura AQUI porque o portão
  // é a lateralidade: texto frouxo no máximo produz detected sem lado — que o
  // chamador trata como "não substituir nada", nunca como pseudofacia inventada.
  const fontes = [
    dados.antecedentes_oftalmologicos,
    dados.diagnostico,
    dados.biomicroscopia,
    dados.hda,
    dados.retorno,
  ].filter(Boolean).join('\n');
  if (!fontes) return vazio;

  const norm = String(fontes).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Cirurgia FUTURA/planejada não é pseudofacia. O veto é REGENTE (o marcador precisa
  // vir a até 2 palavras da cirurgia) — um "aguarda YAG" no fim da linha não pode
  // apagar a facectomia dita no começo dela. Mesma estreiteza da negação abaixo.
  const futuroRege = /\b(indicad[ao]|indicacao|programad[ao]|agendad[ao]|aguardando|planejad[ao]|encaminhad[ao]|vai|vamos|ira|sera|pretende|pensar\s+em|candidat[ao])\s+(\S+\s+){0,2}(cirurgia|facectomia|facoemulsificacao|operar|operad\w*|catarata)/;

  // Negação explícita da cirurgia. Deliberadamente ESTREITA: um "sem" solto não serve
  // de negação porque aparece na própria descrição da lente ("pseudofacia AO, LIO sem
  // opacidade de cápsula") — só nega quando o "sem" rege a cirurgia.
  const negacao = /\b(nega|negou|nunca\s+operou|jamais|nao\s+(foi\s+)?(operad[ao]|operou|fez))\b|sem\s+(cirurgia|antecedente|historia\s+de\s+cirurgia)/;

  // Cirurgia de TERCEIRO — em hda/retorno o paciente fala da família ("minha mãe
  // operou o olho direito"). Sem este filtro isso viraria pseudofacia com lado.
  const terceiro = /\b(mae|pai|irma|irmao|filh[ao]|espos[ao]|marido|mulher|avo|avos|tia|tio|prim[ao]|sogr[ao]|vizinh[ao]|amig[ao]|colega)\b/;

  // Evidência INEQUÍVOCA de olho já operado: são estados, não eventos — nenhuma delas
  // aparece em consulta de olho fácico, então o veto de futuro não se aplica.
  const evidenciaInequivoca = /pseudofac|\blio\b|lente\s+intra\s?ocular|facectomia|facoemulsificacao|\bz\s?96\.?1\b/;
  // Evidência CIRÚRGICA: descreve o evento, e evento pode ser futuro — passa pelo veto.
  // "cirurgia ... de catarata" aceita até 2 palavras no meio — caso real 2026-08-03:
  // "Cirurgia combinada de catarata e glaucoma AO há ~1 ano".
  const evidenciaCirurgica = /cirurgia(\s+\S+){0,2}\s+de\s+catarata|operad[ao]s?\s+de\s+catarata|catarata\s+operada|operou\s+(a\s+)?catarata/;

  let temOD = false, temOE = false, temAO = false, achou = false;

  for (const linha of norm.split('\n')) {
    if (negacao.test(linha) || terceiro.test(linha)) continue;
    const inequivoca = evidenciaInequivoca.test(linha);
    const cirurgica  = evidenciaCirurgica.test(linha) && !futuroRege.test(linha);
    if (!inequivoca && !cirurgica) continue;
    achou = true;

    // A linha mistura olho operado e cirurgia PLANEJADA ("Pseudofacia OD; indicada
    // cirurgia de catarata no olho esquerdo"): os dois olhos são citados, mas só um
    // é pseudofácico. Não dá para separar com confiança — conta a detecção e abandona
    // a lateralidade (sem lado o chamador não substitui nada, que é o desfecho seguro).
    if (futuroRege.test(linha)) continue;

    const bilateral = /\bao\b|\bambos\b|\bbilateral\b|(os\s+)?dois\s+olhos|um\s+olho\s+e\s+(depois\s+)?o\s+outro|nos\s+dois/.test(linha);
    const od = /\bod\b|olho\s+direito/.test(linha);
    const oe = /\boe\b|olho\s+esquerdo/.test(linha);

    if (bilateral || (od && oe)) temAO = true;
    else if (od) temOD = true;
    else if (oe) temOE = true;
  }

  if (!achou) return vazio;

  let lado = null;
  if (temAO || (temOD && temOE)) lado = 'AO';
  else if (temOD) lado = 'OD';
  else if (temOE) lado = 'OE';

  return { detected: true, lado };
}

/**
 * Normaliza o diagnóstico mantendo apenas as linhas de achado ATIVO.
 * Linhas marcadas como resolvidas ("H109 - Conjuntivite NE (resolvida)") não
 * contradizem um exame normal de hoje — o quadro já passou.
 * Retorna '' quando não sobra nenhuma linha ativa.
 *
 * ⚠️ O filtro é DELIBERADAMENTE estreito: só `resolvid[ao]`, que é o marcador que o
 * prompt realmente emite. Termos como "cicatrizado"/"prévio" descrevem achados ATIVOS
 * ("H170 - Leucoma aderente OE (cicatrizado)" — um leucoma É uma cicatriz) e descartar
 * essas linhas desarmaria o guard justamente no caso que ele existe para pegar. Mesmo
 * modo de falha que o contexto histórico do parseCatarataFromDiagnostico (Casos 7/7c).
 */
function _diagnosticoAtivoNorm(diagnostico) {
  if (!diagnostico) return '';
  return String(diagnostico)
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split('\n')
    .filter(l => !/\bresolvid[ao]\b/.test(l))
    .join('\n');
}

/**
 * O diagnóstico afirma um achado ESTRUTURAL de segmento anterior?
 *
 * Origem (log 2026-07-29): consulta com `H111 - Pterígio OD` no diagnóstico saiu com
 * `dados.biomicroscopia: null`; o fallback de despedida injetou BIOMICROSCOPIA_NORMAL e
 * o prontuário ficou afirmando "AO: olho calmo" logo abaixo do próprio diagnóstico de
 * pterígio. Nenhum guard cobria o caso: `_temTratamentoAtivo` só olha tratamento e
 * encaminhamento, e essa consulta não tinha nenhum dos dois (só receita de óculos).
 *
 * Casa por TERMO e por FAIXA de CID — o modelo erra o código (emitiu H111 para pterígio,
 * que na CID-10 é H11.0), então o termo não pode depender do código estar certo.
 *
 * Catarata NÃO entra aqui: já é tratada pela lente dinâmica (getBiomicroscopiaComLente),
 * que produz um texto normal correto para o cristalino — não há contradição a evitar.
 */
function temAchadoAnteriorNoDiagnostico(diagnostico) {
  const norm = _diagnosticoAtivoNorm(diagnostico);
  if (!norm) return false;

  // Achados estruturais/inflamatórios que contradizem "olho calmo, córnea transparente".
  const termo = /\b(pterigio|pinguecula|leucoma|ceratocone|ulcera|ceratite|conjuntivite|blefarite|hordeolo|calazio|episclerite|esclerite|uveite|irite|hifema|hemorragia\s+subconjuntival|erosao\s+corneana|abrasao|corpo\s+estranho|distrofia\s+corneana|simblefaro|triquiase|ectropio|entropio)\b/
    .test(norm);

  // CIDs de segmento anterior: H00–H13 (pálpebra/lacrimal/órbita/conjuntiva),
  // H15–H22 (esclera/córnea/íris/corpo ciliar). H25/H26 (catarata) ficam de fora.
  const cid = /\bh(0\d|1[0-3]|1[5-9]|2[0-2])\.?\d?\b/.test(norm);

  return termo || cid;
}

/**
 * O diagnóstico afirma um achado de segmento POSTERIOR?
 * Simétrico ao anterior — evita injetar FUNDOSCOPIA_NORMAL ("retina aplicada, escavação
 * simétrica e fisiológica") em paciente cujo próprio diagnóstico diz o contrário.
 */
function temAchadoPosteriorNoDiagnostico(diagnostico) {
  const norm = _diagnosticoAtivoNorm(diagnostico);
  if (!norm) return false;

  const termo = /\b(retinopatia|descolamento\s+de\s+retina|degeneracao\s+macular|dmri|membrana\s+epirretiniana|buraco\s+macular|nevo\s+de\s+coroide|hemorragia\s+vitrea|oclusao\s+(arterial|venosa|de\s+ramo)|edema\s+macular|glaucoma|escavacao\s+aumentada|papiledema|retinose\s+pigmentar|corioretinite)\b/
    .test(norm);

  // H30–H36 (coroide/retina), H40–H42 (glaucoma), H46–H48 (nervo óptico/vias).
  const cid = /\bh(3[0-6]|4[0-2]|4[6-8])\.?\d?\b/.test(norm);

  return termo || cid;
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
const cameraFramingGuide = document.getElementById('cameraFramingGuide');

// Comum
const dataSummary = document.getElementById('dataSummary');
const audioBadge = document.getElementById('audioBadge');
const cameraBadge = document.getElementById('cameraBadge');
const actionButtons = document.getElementById('actionButtons');
const injectAllBtn = document.getElementById('injectAllBtn');
const clearBtn = document.getElementById('clearBtn');
const cancelDilatacaoBtn = document.getElementById('cancelDilatacaoBtn');
const dilatacaoPausasContainer = document.getElementById('dilatacaoPausasContainer');
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
