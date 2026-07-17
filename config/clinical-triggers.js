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
    .replace(/\bpra\b/g, 'para')  // contração PT-BR: "pra" → "para"
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// STOP_COMMANDS — encerramento de consulta (prioridade 99)
// ============================================================================
// O match é por substring (includes), portanto NÃO adicionar frases que já
// contenham outra frase da lista — a forma mais curta cobre as variantes.
// Frases curtas/ambíguas (despedidas genéricas) ficam em STOP_COMMANDS_CURTOS.

const STOP_COMMANDS = [
  // "ajudar" SEMPRE com "mais": as formas curtas ('algo que eu possa ajudar',
  // 'posso ajudar em alguma coisa') aparecem no meio de explicações de conduta
  // e paravam a gravação cedo — removidas na revisão 2026-07-16.
  'algo mais que eu possa ajudar',
  'algo mais que eu posso ajudar',
  'mais alguma coisa que eu possa ajudar',
  'mais alguma coisa que eu posso ajudar',
  'alguma coisa mais que eu possa ajudar',
  'alguma coisa mais que eu posso ajudar',
  'posso ajudar em mais alguma coisa',
  'posso te ajudar em mais alguma coisa',
  'posso ajudar em alguma coisa mais',
  'posso ajudar em algo mais',
  'pode ir na recepcao',
  'pode buscar na recepcao',
  'pode pegar na recepcao',
  'pode ir la na recepcao',
  'pode ir ate a recepcao',
  'ate a proxima consulta',
  'ate o proximo retorno',
  'nos vemos em breve',
  // Preferências do médico (2026-07-15): variantes com "me liga"/"pode ligar"
  // removidas (não fazem parte do fraseado dele) e perguntas abertas tipo
  // "alguma pergunta alguma duvida"/"ficou alguma duvida" removidas — caso
  // real 2026-07-15: médico disse "alguma pergunta alguma duvida" e continuou
  // a consulta por ~2 minutos (teria cortado o final da gravação).
  'qualquer duvida me procura',
  'alguma duvida me procura',
  'alguma duvida pode me chamar',
  'alguma duvida me chama',
  'pode se retirar',
  'pode ir embora',
  'obrigado pela consulta',
  'entregar na recepcao',
  'entrega na recepcao',
  'entregar isso na recepcao',
  'entrega isso na recepcao',
  'pode ir para a recepcao',
  'vai la para a recepcao',
  'vai para a recepcao',
  'vai ate a recepcao',
  'pode ir la ate a recepcao',
  'passa na recepcao',
  'passe na recepcao',
  'pode passar na recepcao',
  // BALCÃO — fraseado recorrente do médico para encerrar mandando o paciente
  // ao balcão (2026-07-15). Espelha as variantes de "recepcao".
  // "passe" (imperativo formal) — caso real 2026-07-16: médico disse "passe no
  // balcão" e a lista só tinha 'passa'/'passar'.
  'passar no balcao',
  'passa no balcao',
  'passe no balcao',
  'passar la no balcao',
  'passa la no balcao',
  'passe la no balcao',
  'passa ai no balcao',
  'passe ai no balcao',
  'pode ir no balcao',
  'pode ir la no balcao',
  'pode ir ate o balcao',
  'pode ir para o balcao',
  'vai la no balcao',
  'vai ate o balcao',
  'vai para o balcao',
  'entregar no balcao',
  'entrega no balcao',
  'entregar isso no balcao',
  'entrega isso no balcao',
  'buscar no balcao',
  'busca no balcao',
  'pegar no balcao',
  'pega no balcao',
  'pega la no balcao',
  // pagamento no balcão também é encerramento
  'pagar no balcao',
  'paga no balcao',
  'paga la no balcao',
  'pegar a receita na recepcao',
  'pode pegar la na recepcao',
  // ⚠️ Frases que também são DITADO DE CONDUTA ('retorno em um ano', 'pode
  // trocar os oculos', 'volta se piorar'...) NÃO entram nesta lista forte —
  // elas param a gravação no meio da consulta porque o próprio texto satisfaz
  // o gate de captura. Ficam em STOP_COMMANDS_ANCORADOS (só casam no fim da
  // fala, com cancelamento). Revisão 2026-07-16.
  'ate o proximo ano',
  'ate ano que vem',
  'nos vemos ano que vem',
  'ate daqui a um ano',
  'ate daqui a seis meses',
  'ate daqui a tres meses',
  'a gente se ve depois',
  'nos vemos depois',
  'ate a proxima vez',
  'qualquer coisa estamos ai',
  'qualquer coisa estamos aqui',
  'qualquer coisa pode chamar',
  'pode ir na farmacia',
  'vai la na farmacia',
  'pode ir la na farmacia',
  'pode ir ate a farmacia',
  'bom viagem',
  'boa viagem',
];

// ============================================================================
// STOP_COMMANDS_CURTOS — despedidas curtas/ambíguas (match só no FIM da fala)
// ============================================================================
// Estas frases aparecem com frequência NO MEIO da consulta ("tá bom, então
// vamos medir a pressão", paciente contando uma conversa com "tchau"...).
// Por isso o hook que as consome usa endAnchored: só casam quando estão no
// final do texto atual, e o stop agendado é CANCELADO se a fala continuar.

const STOP_COMMANDS_CURTOS = [
  'tudo bom entao',
  'tudo certo entao',
  'ta bom entao',
  'foi um prazer',
  'ate mais',
  'ate logo',
  'tchau',
];

// ============================================================================
// STOP_COMMANDS_ANCORADOS — encerramentos que também são ditado de conduta
// ============================================================================
// Frases legítimas de despedida que TAMBÉM aparecem no meio da consulta como
// ditado de conduta ("retorno em seis meses", "pode trocar os oculos") ou
// entrega de documento ("declaracao de comparecimento"). Na lista forte elas
// paravam a gravação NO MEIO da consulta: o próprio texto satisfaz o gate de
// captura (são marcadores de conduta/conduta refrativa), então o stop
// disparava em 500ms sem cancelamento. O hook que as consome usa endAnchored:
// só casam no FIM da fala atual, e o stop agendado é CANCELADO se a fala
// continuar (mesma mecânica dos STOP curtos). Revisão 2026-07-16.

const STOP_COMMANDS_ANCORADOS = [
  // óculos / receita (conduta refrativa — o próprio texto satisfaz o gate)
  'pode fazer os oculos',
  'pode comprar os oculos',
  'pode trocar os oculos',
  'vai fazer os oculos',
  'pode ir pegar a receita',
  'pode pegar a receita',
  // retorno programado (marcador de conduta)
  'retorno ano que vem',
  'retorno no proximo ano',
  'retorno daqui a um ano',
  'retorno em um ano',
  'retorno em 1 ano',
  'retorno em seis meses',
  'retorno daqui a seis meses',
  'retorno em tres meses',
  'volte no ano que vem',
  'volte daqui a um ano',
  'volte em um ano',
  'volte em seis meses',
  'volte daqui a seis meses',
  'volte em tres meses',
  // retorno condicional
  'volta aqui se nao melhorar',
  'volta aqui se piorar',
  'volta se nao melhorar',
  'volta se piorar',
  'pode voltar se nao melhorar',
  'pode voltar se piorar',
  'volta aqui se necessario',
  'volta se necessario',
  // documento de fim de consulta — caso real 2026-07-16: "declaração de
  // comparecimento" foi a última fala inteligível transcrita antes de o STT
  // morrer e engolir as despedidas
  'declaracao de comparecimento',
  'atestado de comparecimento',
];

// ============================================================================
// STOP_FORCAR_COMMANDS — encerramento explícito que IGNORA o gate de captura
// ============================================================================
// Válvula de escape por voz: se o gate bloquear indevidamente (conduta ditada
// com fraseado que os marcadores não cobrem — caso real 2026-07-03), o médico
// diz um destes comandos e a gravação encerra SEM verificar conduta/tratamento.
// São ordens diretas à extensão, nunca ditas pelo paciente ou em explicação.

const STOP_FORCAR_COMMANDS = [
  'pode encerrar a consulta',
  'encerrar a consulta',
  'encerrar consulta',
  'finalizar a consulta',
  'finalizar consulta',
  // declarações de fim ditas à extensão — caso real 2026-07-07: médico disse
  // "consulta encerrado ... fim da consulta" e nada casou (só "encerrar
  // consulta" parou); cobrir variantes de gênero (STT erra concordância)
  'consulta finalizada',
  'consulta finalizado',
  'consulta encerrada',
  'consulta encerrado',
  'fim da consulta',
  'fim de consulta',
  'pode encerrar a gravacao',
  'encerrar a gravacao',
  'encerrar gravacao',
  'pode parar a gravacao',
  'parar a gravacao',
  'parar gravacao',
];

// ============================================================================
// STOP_SAUDACAO_COMMANDS — saudações usadas como despedida ("tá ok, bom dia")
// ============================================================================
// "bom dia"/"boa tarde"/"boa noite" também ABREM a consulta. O hook que as
// consome usa dupla proteção: endAnchored (só no fim da fala, cancelável se a
// fala continuar) E minSessionMs (ignoradas nos primeiros minutos da gravação,
// quando são saudação de abertura, não despedida).
// Caso real (log 2026-06-12): médico encerrou com "tá ok, bom dia" e nenhum
// gatilho disparou — a gravação precisou ser parada manualmente.

const STOP_SAUDACAO_COMMANDS = [
  'bom dia',
  'boa tarde',
  'boa noite',
];

// ============================================================================
// CONTINUAÇÃO DE DESPEDIDA — prorroga (em vez de cancelar) stops ancorados
// ============================================================================
// Caso real 2026-07-17: a despedida veio em cadeia — "ta bom entao" (agendou o
// stop) seguido de "ate daqui a pouquinho obrigada". A mecânica endAnchored
// cancelou o stop porque "a fala continuou", mas a continuação era a própria
// despedida; como o trecho final não é gatilho, nada re-disparou e o médico
// precisou do "consulta encerrada" forçado. Não adianta mapear cada cauda de
// despedida como gatilho novo (variam infinitamente) — em vez disso, quando a
// fala continua após uma despedida ancorada, o runner verifica se a
// continuação é composta APENAS destas palavras: se for, o timer de silêncio é
// prorrogado; se houver qualquer palavra fora da lista (conteúdo clínico), o
// stop é cancelado como antes.

const DESPEDIDA_CONTINUACAO_WORDS = new Set([
  // conectivos e muletas curtas
  'a', 'o', 'e', 'um', 'uma', 'de', 'do', 'da', 'no', 'na', 'em',
  'pra', 'para', 'com', 'se', 'que', 'ne', 'viu', 'hein', 'entao',
  'ta', 'tao', 'ai', 'la', 'ok', 'beleza', 'certo', 'tudo', 'bem',
  // vocabulário de despedida
  'ate', 'logo', 'mais', 'breve', 'depois', 'amanha', 'daqui',
  'pouquinho', 'pouco', 'tchau', 'obrigado', 'obrigada', 'brigado',
  'brigada', 'valeu', 'prazer', 'foi', 'bom', 'boa', 'dia', 'tarde',
  'noite', 'semana', 'fim', 'sorte', 'viagem', 'cuida', 'cuide',
  'deus', 'vai', 'fica', 'tranquilo', 'tranquila', 'abraco', 'gente',
  'nos', 'vemos', 've', 'proxima', 'consulta', 'retorno', 'ano', 'vem',
]);

/**
 * true se o trecho dito APÓS uma despedida ancorada é continuação da própria
 * despedida ("ate daqui a pouquinho obrigada") e não conteúdo clínico novo.
 * Toda palavra precisa estar no vocabulário; limite de 12 palavras evita
 * prorrogação indefinida. Auto-corretivo: se a cauda crescer com qualquer
 * palavra clínica em eventos seguintes, o cancelamento normal acontece.
 *
 * @param {string} tail - texto normalizado após o fim do comando de despedida
 * @returns {boolean}
 */
function isContinuacaoDespedida(tail) {
  const words = tail.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (words.length > 12) return false;
  return words.every(w => DESPEDIDA_CONTINUACAO_WORDS.has(w));
}

// ============================================================================
// DILATACAO_COMMANDS — pausa para dilatar pupila (prioridade 50)
// ============================================================================

// O match é por substring (includes) — manter apenas a forma MÍNIMA de cada
// frase; variantes com prefixo ("vou pedir para...", "pode...") já são
// cobertas pela forma curta e não devem ser re-adicionadas.

const DILATACAO_COMMANDS = [
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
  'pode sentar la fora',
  'pode sentar ali fora',
  'pode ir la fora esperar',
  'pode ir ali fora esperar',
  'pode ir la fora aguardar',
  'vai la fora esperar',
  'vai la fora aguardar',
  'vai ali fora esperar',
  'vai ali fora aguardar',
  'vai para fora esperar',
  'vai para fora aguardar',
  'pode ir para fora esperar',
  'pode ir para fora aguardar',
  'precisa dilatar',
  'precisamos dilatar',
  'vou dilatar',
  'vai dilatar',
  'tem que dilatar',
  'dar uma dilatada',
  'dilatar o olho',
  'dilatar os olhos',
  'dilata ele',
  'dilata ela',
  'pode dilatar',
  'dilata o olho',
  'dilata os olhos',
  // REMOVIDO 'dilata' isolado: por substring ele casava com QUALQUER "dilata*"
  // em qualquer ponto do transcript (ex: "na última consulta dilatamos"),
  // causando pausa indevida. As variantes específicas acima + os combos cobrem
  // os casos legítimos.
  'colirio para dilatar',
  'colirio dilatador',
  'vou pingar para dilatar',
  // REMOVIDOS por serem genéricos demais e causarem falso positivo quando o médico
  // prescreve colírio de blefarite ou lubrificante:
  //   'vou pingar o colirio', 'vou pingar os colirios', 'pingar o colirio', 'pingar colirio'
  // Manter apenas as formas que combinam explicitamente com dilatação:
  // REMOVIDOS 'pingou o colirio', 'coloquei o colirio', 'ja pinguei':
  // são frases que o PACIENTE diz ao relatar adesão ao colírio prescrito
  // ("coloquei o colírio direitinho todo dia") e que o médico diz ao RETOMAR
  // pós-dilatação — nos dois casos disparavam pausa indevida. A aplicação do
  // dilatador na fase 1 continua coberta por 'ja dilatei', 'vou pingar para
  // dilatar' e pelos combos (tropicamida, pinga+dilata) — e o envio para fora
  // ("espera la fora") quase sempre acompanha a aplicação.
  'ja dilatei',
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
  // Variantes coloquiais brasileiras — frequentes em consulta informal
  // ("bora dilata" cobre "bora dilatar" por substring, etc.)
  'bora dilata',
  'deixa eu dilatar',
  'deixa dilatar',
  'vamos dilata',
  'precisa de dilata',
  'tem de dilata',
  'hora de dilata',
  'vou aplicar para dilatar',
  // Variantes para enviar paciente aguardar sem citar "dilatar" explicitamente
  'pode aguardar aqui fora',
  'fica fora aguardando',
  'espera aqui fora',
  'aguarda aqui fora',
  // Imperativo PLURAL — médico falando com acompanhante + paciente (criança):
  // "esperem lá fora", "aguardem aqui fora". As formas no singular não casam
  // o plural por substring ('espera la' exige espaço após "espera").
  'esperem la fora',
  'aguardem la fora',
  'esperem ali fora',
  'aguardem ali fora',
  'esperem aqui fora',
  'aguardem aqui fora',
  'vao la fora esperar',
  'vao la fora aguardar',
  // Médico instruindo o ACOMPANHANTE a levar a criança para aguardar
  'leva ele la fora',
  'leva ela la fora',
  'levar ele la fora',
  'levar ela la fora',
  // "fazer a dilatação" — frase natural em PT-BR, muito comum
  'fazer a dilatacao',
  'fazer dilatacao',
  // "vai precisar dilatar"
  'vai precisar dilatar',
  'vou precisar dilatar',
  // REMOVIDO 'ja dilatou': é a frase típica do RETORNO da dilatação ("já
  // dilatou? deixa eu ver o fundo") — re-disparava a pausa na fase 2 e a
  // consulta nunca fechava. A pós-aplicação na fase 1 segue coberta por
  // 'ja dilatei' e pelas frases de envio para fora.
  // "dilatação" como substantivo direto
  'dilatacao do olho',
  'dilatacao dos olhos',
];

// ============================================================================
// DILATACAO_COMBOS — pares de palavras que juntos indicam dilatação
// ============================================================================
// Usados pelo hook runner via hook.combos para detecção por co-ocorrência.
// Ambas as palavras devem estar presentes na mesma fonte de texto.

const DILATACAO_COMBOS = [
  // Apenas combos com palavras específicas de dilatação — "dilatar" e "pupila"
  // são inequívocas. Os combos anteriores com 'pingar', 'efeito' e 'la fora'
  // foram removidos: essas palavras aparecem em contextos não-dilatação
  // (prescrição de colírios, "fazer efeito" de qualquer medicamento, "la fora"
  // referindo-se a outros locais), causando falsos positivos em consultas longas
  // onde o texto acumulado contém "colirio" de prescrição junto com termos genéricos.
  ['colirio', 'dilatar'],
  ['pupila', 'dilatar'],
  // STT misrecognition: "colírio" → "currículo" ("pingar o currículo para dilatar")
  ['curriculo', 'dilatar'],
  // "pinga/aplica o colírio (de/para dilatar)" — cobre frases onde o verbo de
  // aplicação aparece próximo de "dilata*" sem a frase completa estar na lista
  ['pinga', 'dilata'],
  ['aplica', 'dilata'],
  // "colírio de dilatação" / "colírio dilatador" descrito com o substantivo
  ['colirio', 'dilatacao'],
  // STT misrecognition: "dilata" → "de lata" na frase "dilata e passa no aparelho".
  // "lata" + "aparelho" juntos no buffer recente são inequívocos em oftalmologia.
  ['lata', 'aparelho'],
  // "fazer a dilatação" em variação livre (verbo + substantivo sem artigo/preposição)
  ['fazer', 'dilatacao'],
  // REMOVIDO ['pupila','dilata']: por prefixo, "dilata" casa "dilatadA" — e
  // "pupila dilatada" é ACHADO DE EXAME (midríase, retorno da dilatação),
  // não anúncio de pausa. Disparava pausa indevida na fase 2 e em descrição
  // de midríase. A intenção de dilatar segue coberta por ['pupila','dilatar'].
  // tropicamida sendo aplicada — nome do colírio dilatador mais usado em oftalmologia
  ['tropicamida', 'pingar'],
  ['tropicamida', 'colocar'],
  ['tropicamida', 'aplicar'],
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

// Apenas gatilhos diagnósticos específicos de blefarite/meibomite.
// Frases genéricas de higiene palpebral (ex: 'higiene palpebral', 'lavar os cílios')
// foram removidas para evitar falsos positivos em orientações de olho irritado ou seco.
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
  'olho seco por blefarite',
  'ressecamento por blefarite',
  'bordo palpebral',
];

// ============================================================================
// CATARATA_COMMANDS — flag passiva de cristalino (prioridade 1)
// ============================================================================

const CATARATA_COMMANDS = [
  'tem catarata',
  'com catarata',
  // 'e catarata' depende da fronteira de palavra no início do comando
  // (_inicioDePalavra no hook-runner): sem ela, casava por substring dentro de
  // "cirurgiada d[e catarata]" / "cirurgia d[e catarata]", marcando catarata
  // presente em paciente pseudofácica (menção histórica de cirurgia).
  'e catarata',
  'uma catarata',
  // 'a catarata' REMOVIDO: substring genérico demais — dispara em qualquer menção
  // histórica ("antes tinha a catarata", "a cirurgia que resolveu a catarata"),
  // causando falso positivo em pacientes pseudofácicos.
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
  'lente esta otima',
  'lente ta otima',
  'lente esta boa',
  'lente ta boa',
  'lente bem posicionada',
  'lente no lugar',
  'ja operou de catarata',
  'operou catarata',
  'operou de catarata',
  'operou o olho',
  'operou os olhos',
  'ja operou o olho',
  'ja operou os olhos',
  'fez cirurgia de catarata',
  'fez a cirurgia de catarata',
  'fez uma cirurgia de catarata',   // caso real 2026-07-17: "já que você fez uma cirurgia de catarata traumática"
  // 'cirurgia de catarata' REMOVIDO: ambíguo — dispara quando médico *planeja* cirurgia futura
  // ("agora dá para pensar em mexer"), causando pseudofacia indevida em paciente fácico com catarata.
  // 'fez cirurgia de catarata' já cobre o caso passado com clareza.
  // REGRA: só entram aqui frases que indicam cirurgia JÁ REALIZADA (passado/
  // confirmado). Formas de presente/futuro ("vamos colocar a lente", "a gente
  // coloca a lente") ficam de fora de propósito: quando o médico apenas explica
  // como a cirurgia é feita a um paciente fácico com catarata, a flag de
  // catarata deve prevalecer.
  'cirurgiada de catarata',
  'cirurgiado de catarata',
  'operada de catarata',
  'operado de catarata',
  'colocou a lente',
  'colocou as lentes',
  'colocou duas lentes',
  'colocaram a lente',
  'colocaram as lentes',
  'cirurgia foi bem',
  'cirurgia ta otima',
  'cirurgia esta otima',
  'cirurgia deu certo',
  'cirurgias estao boas',
  'cirurgia estao boas',           // ruído comum do ASR: "a cirurgia estão boas"
  'cirurgias foram boas',
  'cirurgias estao funcionando',
  'cirurgia estao todas funcionando', // ruído do ASR: "a cirurgia estão todas funcionando"
  'cirurgias estao todas funcionando',
  'lentes estao bem',
  'lentes estao boas',
  'lentes estao otimas',
  'lentes bem posicionadas',
  'pseudofacico', 'pseudofaquico',
  'lio bem posicionada',
  'lio transparente',
];

// ============================================================================
// OPACIDADE_CAPSULA_COMMANDS — opacidade de cápsula posterior (prioridade 3)
// ============================================================================

const OPACIDADE_CAPSULA_COMMANDS = [
  // REMOVIDO: 'limpeza da lente', 'limpeza de lente', 'precisa de limpeza'
  // Motivo: frases genéricas que aparecem no relato histórico do paciente
  // ("fez limpeza da lente") causando falso positivo. O sinal de negação
  // ("lente limpa") é tratado por LENTE_LIMPA_COMMANDS.
  'limpar a lente', 'precisa limpar a lente',
  'precisa fazer a limpeza da capsula',
  'opacidade de capsula', 'opacidade da capsula',
  'capsula posterior opaca',
  'capsulotomia', 'yag',
  'capsula opaca',
  'opacificacao de capsula',
  'opacificacao da capsula posterior',
];

// ============================================================================
// LENTE_LIMPA_COMMANDS — lente intraocular sem opacidade de cápsula (prioridade 4)
// ============================================================================
// Sinal POSITIVO do médico de que a cápsula está limpa, sem opacificação.
// Quando detectado, cancela qualquer flag de opacidade disparada por histórico.

const LENTE_LIMPA_COMMANDS = [
  'lente esta limpa',
  'lente ta limpa',
  'lente limpa',
  'lente bem limpa',
  'lentes estao limpas',
  'lentes ta limpas',
  'lentes limpas',
  'lentes bem limpas',
  'capsula limpa',
  'capsula esta limpa',
  'capsula ta limpa',
  'capsula posterior limpa',
  'capsula posterior esta limpa',
  'capsula posterior ta limpa',
  'capsula esta transparente',
  'capsula ta transparente',
  'capsula transparente',
  'capsula esta otima',
  'capsula ta otima',
  'sem opacidade de capsula',
  'sem opacidade na capsula',
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
// STOP GATE — condicionante de encerramento (conduta + tratamento captados)
// ============================================================================
// Os hooks de stop de FIM DE CONSULTA (stop, stop_curto, stop_saudacao) só
// podem encerrar a gravação se a fala já contiver evidência de CONDUTA e de
// TRATAMENTO ditados pelo médico. Quando a despedida dispara sem essa captura,
// o encerramento é BLOQUEADO e a gravação continua — o médico dita o que
// falta e repete a despedida.
// Para desligar a exigência de um dos campos, mudar a flag para false.
// EXCEÇÃO: conduta REFRATIVA (óculos/grau/lente — CONDUTA_REFRATIVA_MARKERS)
// satisfaz também o requisito de TRATAMENTO, porque consulta de refração pura
// legitimamente não tem tratamento a ditar (caso real 2026-07-15).
// NÃO passam pelo gate: botão manual de parar, auto-stop por silêncio e o
// stop de dilatação (pausa, não fim de consulta — conduta/tratamento vêm na
// fase 2).

const STOP_GATE = {
  exigirConduta: true,
  exigirTratamento: true,
};

// Marcadores de CONDUTA falada — decisões clínicas: retorno, encaminhamento,
// solicitação de exame, óculos, cirurgia, suspensão/manutenção, alta.
// Match por substring em texto normalizado (sem acentos). Falso positivo aqui
// apenas reverte ao comportamento antigo (o stop libera), então os marcadores
// podem ser moderadamente abrangentes.

const CONDUTA_FALA_MARKERS = [
  // ditado explícito ("a conduta é...")
  'conduta',
  // retorno / reavaliação
  'retorno em', 'retorno daqui', 'retorno com', 'retorno anual', 'retorno semestral',
  'retorna em', 'retorna daqui', 'retornar em', 'retornar daqui',
  'volte em', 'volte daqui', 'volta em', 'volta daqui', 'volta aqui em',
  'voltar em', 'voltar daqui', 'volta se', 'volta aqui se', 'pode voltar se',
  // retorno condicional com "se" ANTES do verbo ("se não tiver bom pode voltar aqui")
  'pode voltar aqui', 'pode voltar la',
  // retorno condicional ditado como "vem/passa aqui falar comigo" — caso real
  // 2026-07-07: "se daqui uns 15 dias ve que nao ta legal passa aqui para
  // falar comigo" não casou nenhum marcador e o gate bloqueou "boa viagem"
  'falar comigo', 'fala comigo', 'me procura', 'me procure',
  'reavaliacao', 'reavaliar',
  'ano que vem', 'daqui a um ano', 'daqui a seis meses', 'daqui a tres meses',
  // encaminhamento (prefixo cobre encaminhar/encaminhamento/encaminho)
  'encaminh',
  // solicitação de exames complementares
  'vou solicitar', 'solicitar exame', 'solicitar o exame', 'solicitar um', 'solicitar uma',
  'vou pedir um exame', 'vou pedir o exame', 'campo visual', 'topografia',
  // cirurgia (indicação/programação)
  'indicar cirurgia', 'indicacao de cirurgia', 'indicacao cirurgica',
  'precisa operar', 'vai precisar operar', 'vamos operar',
  'programar a cirurgia', 'agendar a cirurgia', 'marcar a cirurgia',
  // suspensão / manutenção / alta
  'suspender o colirio', 'suspender colirio', 'suspender o uso',
  'suspende o colirio', 'parar o colirio', 'parar de usar o colirio',
  'manter o colirio', 'manter a medicacao', 'manter o tratamento', 'manter o uso',
  'dar alta',
];

// Marcadores de CONDUTA REFRATIVA — prescrição/ajuste/manutenção de óculos e
// lentes. Ficam em lista própria porque, além de contarem como conduta, também
// SATISFAZEM o requisito de tratamento no gate de captura: consulta refrativa
// pura legitimamente não tem tratamento a ditar (a receita de óculos RESOLVE a
// consulta). Caso real 2026-07-15: consulta de refração (multifocal + lente de
// prova) foi bloqueada com "falta ditar TRATAMENTO" e exigiu "encerrar
// consulta" forçado.

const CONDUTA_REFRATIVA_MARKERS = [
  // óculos (prescrição, troca, ajuste ou manutenção é conduta)
  'prescrever oculos', 'prescrever os oculos', 'prescrever o oculos',
  'prescricao de oculos', 'receita de oculos', 'receita do oculos', 'receita dos oculos',
  'vou passar um oculos', 'vou passar oculos', 'fazer o oculos', 'fazer os oculos',
  'fazer um oculos', 'trocar o oculos', 'trocar os oculos', 'trocar de oculos',
  'manter o oculos', 'manter os oculos', 'mesmo oculos', 'continuar com o oculos',
  'continuar com os oculos', 'nao precisa de oculos', 'nao vai precisar de oculos',
  'oculos novo',
  // troca de óculos com o substantivo implícito — caso real 2026-07-06: a
  // conduta foi ditada como "so se voce quiser trocar" / "so se precisar vai
  // trocar" e o gate bloqueou o encerramento com a conduta já completa
  'quiser trocar', 'precisar trocar', 'vai trocar', 'se precisar mesmo',
  'so se precisar',
  // manutenção ditada como "não mexer" no óculos/grau — caso real 2026-07-07:
  // "o oculos nao precisamos mexer" / "para que que vai mexer" / "demora uns
  // bons anos ate precisar mexer" não casaram e o gate bloqueou o stop
  'precisa mexer', 'precisamos mexer', 'precisar mexer', 'vamos mexer',
  'vai mexer', 'mexer no oculos', 'mexer no grau', 'mexer no seu grau',
  'oculos ta tranquilo', 'oculos esta tranquilo',
  // ajuste de grau/óculos — caso real 2026-07-03: médico ditou a conduta como
  // "ajustar o oculos"/"vou aumentar o grau" e o gate não reconheceu conduta
  'ajustar o oculos', 'ajustar os oculos', 'ajuste do oculos', 'ajuste no oculos',
  'ajustar o grau', 'ajuste do grau', 'ajuste de grau',
  'aumentar o grau', 'diminuir o grau', 'aumentar so um pouquinho',
  'grau de perto', 'grau para perto', 'grau de longe', 'grau para longe',
  'multifocal', 'bifocal', 'lente progressiva', 'lentes progressivas',
  // correção de grau — caso real 2026-07-15: "vou corrigir aqui o grau do
  // oculos" não tinha marcador direto (só "multifocal" salvou a conduta)
  'corrigir o grau', 'corrigir aqui o grau', 'grau do oculos', 'corrigir o oculos',
  // teste de lente de contato solicitado pelo médico (conduta refrativa)
  'lente de prova',
  // corrupção STT real 2026-07-06: "bifocal/multifocal" transcrito como
  // "vai ter que ir para um tipo de fogao" — em consulta oftalmológica,
  // "fogao" só aparece como essa corrupção da prescrição de lente
  'tipo de fogao',
];

// Marcadores de CONDUTA DE PROCEDIMENTO em consultório — o procedimento
// resolve a consulta (excisão de calázio, drenagem, retirada de corpo
// estranho): conta como conduta E satisfaz o requisito de tratamento no gate,
// como a conduta refrativa. Caso real 2026-07-16: consulta de calázio ("eu vou
// ate resolver isso aqui") não casava nenhum marcador — a despedida seria
// bloqueada com "falta ditar CONDUTA e TRATAMENTO" mesmo com a consulta
// resolvida.

const CONDUTA_PROCEDIMENTO_MARKERS = [
  'resolver isso aqui', 'resolvo isso aqui', 'vou resolver isso',
  'tirar isso aqui', 'vou tirar isso', 'remover isso', 'retirar isso',
  'fazer o procedimento', 'pequeno procedimento', 'pequena cirurgia',
  'drenar', 'drenagem', 'excisao', 'exerese', 'curetagem',
  'no consultorio mesmo', 'aqui no consultorio',
];

// Marcadores de TRATAMENTO falado — prescrição de medicamentos/posologia.
// As negativas explícitas ("não precisa de tratamento") também CONTAM como
// tratamento captado: o médico resolveu o campo verbalmente.

const TRATAMENTO_FALA_MARKERS = [
  // ditado explícito ("o tratamento é...")
  'tratamento',
  // verbos de prescrição
  'vou prescrever', 'vou receitar', 'vou te receitar', 'vou deixar prescrito',
  'vou passar um colirio', 'vou passar o colirio', 'vou passar esse colirio',
  'vou passar uma pomada', 'vou passar um lubrificante', 'vou passar um antibiotico',
  'vou colocar na receita', 'ta na receita', 'esta na receita', 'na receita',
  // uso/aplicação ditada ao paciente
  'usar o colirio', 'usa o colirio', 'usar esse colirio', 'usa esse colirio',
  'pingar o colirio', 'pinga o colirio', 'pingar uma gota', 'pinga uma gota',
  // produtos típicos de prescrição oftalmológica
  'lubrificante', 'lagrima artificial', 'lagrimas artificiais', 'pomada',
  'omega 3', 'compressa morna', 'compressas mornas', 'higiene palpebral',
  // shampoo em oftalmologia = higiene palpebral; caso real 2026-07-03: médico
  // disse "shampoo de nenem" e o STT corrompeu "higiene palpebral" — cobrir
  // as variantes faladas para o tratamento não depender só dos outros itens
  'shampoo infantil', 'shampoo de nenem', 'shampoo de bebe', 'shampoo neutro',
  'antibiotico', 'corticoide', 'antiinflamatorio', 'anti inflamatorio',
  // negativas explícitas — tratamento "resolvido" sem prescrição
  'sem necessidade de tratamento', 'nao precisa de tratamento',
  'nao tem necessidade de tratamento', 'nenhum tratamento',
  'nao vou passar nada', 'nao vou prescrever nada', 'nao vou passar medicacao',
  'nao precisa de remedio', 'nao precisa de colirio',
  'sem medicacao', 'nenhuma medicacao',
];

// Conduta falada em padrões que exigem fronteira de palavra (substring não basta).
// Caso real 2026-07-03: a conduta foi ditada como "pede para OTICA retificar" e
// "fazer uma CONSULTA COM DERMATOLOGISTA" — nenhum marcador simples casou e o
// gate bloqueou o encerramento com a conduta já completa.
const CONDUTA_FALA_REGEXES = [
  // "consulta com [qualquer especialista -ologista]" = encaminhamento
  /consulta com (?:o |a |um |uma )?[a-z]+ologista/,
];

// Conduta refrativa em padrões com fronteira de palavra.
const CONDUTA_REFRATIVA_REGEXES = [
  // menção a ótica = prescrição de óculos em andamento (\b evita "antibiotica")
  /\boticas?\b/,
];

// Posologia falada — padrões que só aparecem quando o médico dita prescrição.
const TRATAMENTO_FALA_REGEXES = [
  /\b(uma|duas|tres|quatro|\d+)\s+got(a|as|inha|inhas)\b/,
  /\bde\s+\d+\s+em\s+\d+\s+horas?\b/,
  /\b(uma|duas|tres|quatro|cinco|seis|\d+)\s+vez(es)?\s+(ao|por)\s+dia\b/,
  /\b\d+\s*x\s+(ao|por)\s+dia\b/,
  /\bpor\s+(\d+|sete|dez|quinze|vinte|trinta)\s+dias\b/,
  /\bem\s+cada\s+olho\b/,
  /\bnos\s+dois\s+olhos\b/,
];

// ============================================================================
// FUNÇÕES DE DETECÇÃO COMPOSTAS
// ============================================================================

/**
 * Verifica um par de palavras de combo com fronteira de palavra no INÍCIO.
 * Prefixo é permitido ("dilata" casa "dilatar"/"dilatacao"), mas a palavra
 * não pode estar embutida em outra ("lata" NÃO casa "relata").
 *
 * @param {string} normText - texto já normalizado
 * @param {[string, string]} pair - par de palavras do combo
 * @returns {boolean}
 */
// Cache de regexes por palavra: matchComboPair roda no caminho quente
// (todo onresult do Speech API × todos os pares), então evita recompilar.
const _comboWordRegexCache = new Map();

function _comboWordRegex(word) {
  let re = _comboWordRegexCache.get(word);
  if (!re) {
    re = new RegExp('\\b' + word);
    _comboWordRegexCache.set(word, re);
  }
  return re;
}

function matchComboPair(normText, [a, b]) {
  return _comboWordRegex(a).test(normText) && _comboWordRegex(b).test(normText);
}

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
  // Combos por co-ocorrência: só na CAUDA do texto (últimas 500 chars),
  // espelhando o hook runner (_hookMatches). No texto acumulado inteiro as
  // duas palavras podem co-ocorrer em trechos distantes e sem relação
  // ("colirio" da prescrição + "dilatar" de outro contexto, páginas atrás),
  // marcando como pausa de dilatação uma consulta COMPLETA no fallback de
  // parada — conduta/tratamento eram zerados indevidamente.
  const tail = norm.slice(-500);
  return DILATACAO_COMBOS.some(pair => matchComboPair(tail, pair));
}

/**
 * Detecta encerramento de consulta no texto final (fallback pós-gravação,
 * espelha o que os hooks 'stop'/'stop_curto' fazem em tempo real).
 * Frases fortes valem em qualquer posição; frases curtas/ambíguas
 * (STOP_COMMANDS_CURTOS) só valem se estiverem no FIM do texto.
 *
 * @param {string} text - texto da transcrição (com ou sem acentos)
 * @returns {boolean}
 */
function detectaEncerramentoNaFala(text) {
  const norm = normalizeText(text);
  if (STOP_FORCAR_COMMANDS.some(cmd => norm.includes(cmd))) return true;
  if (STOP_COMMANDS.some(cmd => norm.includes(cmd))) return true;
  const tail = norm.slice(-40);
  if (STOP_COMMANDS_CURTOS.some(cmd => tail.includes(cmd))) return true;
  // Ancorados: aqui a gravação já terminou — se a frase está na cauda, foi a
  // última coisa dita e vale como encerramento.
  if (STOP_COMMANDS_ANCORADOS.some(cmd => tail.includes(cmd))) return true;
  // Saudações-despedida: aqui a gravação já terminou, então uma saudação no
  // FIM do texto é despedida (a saudação de abertura fica no início do texto).
  return STOP_SAUDACAO_COMMANDS.some(cmd => tail.includes(cmd));
}

/**
 * Detecta se a CONDUTA já foi ditada na fala (decisão clínica: retorno,
 * encaminhamento, exame complementar, óculos, cirurgia, suspensão, alta).
 *
 * @param {string} text - transcrição (com ou sem acentos)
 * @returns {boolean}
 */
function detectaCondutaNaFala(text) {
  const norm = normalizeText(text);
  if (CONDUTA_FALA_MARKERS.some(m => norm.includes(m))) return true;
  if (CONDUTA_FALA_REGEXES.some(re => re.test(norm))) return true;
  if (detectaCondutaProcedimentoNaFala(norm)) return true;
  return detectaCondutaRefrativaNaFala(norm);
}

/**
 * Detecta se uma CONDUTA DE PROCEDIMENTO em consultório foi ditada na fala
 * (excisão de calázio, drenagem, retirada de corpo estranho). Como a conduta
 * refrativa, também satisfaz o requisito de tratamento no gate de captura:
 * o procedimento É o tratamento da consulta.
 *
 * @param {string} text - transcrição (com ou sem acentos)
 * @returns {boolean}
 */
function detectaCondutaProcedimentoNaFala(text) {
  const norm = normalizeText(text);
  return CONDUTA_PROCEDIMENTO_MARKERS.some(m => norm.includes(m));
}

/**
 * Detecta se uma CONDUTA REFRATIVA foi ditada na fala (prescrição, ajuste,
 * troca ou manutenção de óculos/grau/lentes). Subconjunto da conduta geral
 * que também satisfaz o requisito de tratamento no gate de captura.
 *
 * @param {string} text - transcrição (com ou sem acentos)
 * @returns {boolean}
 */
function detectaCondutaRefrativaNaFala(text) {
  const norm = normalizeText(text);
  if (CONDUTA_REFRATIVA_MARKERS.some(m => norm.includes(m))) return true;
  return CONDUTA_REFRATIVA_REGEXES.some(re => re.test(norm));
}

/**
 * Detecta se o TRATAMENTO já foi ditado na fala (prescrição/posologia ou
 * negativa explícita de tratamento).
 *
 * @param {string} text - transcrição (com ou sem acentos)
 * @returns {boolean}
 */
function detectaTratamentoNaFala(text) {
  const norm = normalizeText(text);
  if (TRATAMENTO_FALA_MARKERS.some(m => norm.includes(m))) return true;
  return TRATAMENTO_FALA_REGEXES.some(re => re.test(norm));
}

/**
 * Condicionante de encerramento: verifica se conduta e tratamento exigidos
 * pelo STOP_GATE já aparecem na fala. Usada pelo hook runner ANTES de
 * encerrar a gravação por gatilho de voz.
 *
 * @param {string} text - transcrição (com ou sem acentos)
 * @returns {{conduta: boolean, tratamento: boolean, ok: boolean}}
 */
function checkCondutaTratamentoCaptados(text) {
  const norm = normalizeText(text);
  const conduta    = !STOP_GATE.exigirConduta    || detectaCondutaNaFala(norm);
  // Conduta REFRATIVA satisfaz o requisito de tratamento: consulta de refração
  // pura não tem tratamento a ditar — a receita de óculos resolve a consulta.
  // Caso real 2026-07-15: gate bloqueou "alguma pergunta alguma duvida" com
  // "falta ditar TRATAMENTO" numa consulta só de óculos + lente de prova,
  // forçando o médico a usar "encerrar consulta".
  // Conduta de PROCEDIMENTO idem: a excisão/drenagem feita em consultório É o
  // tratamento da consulta (caso real 2026-07-16: calázio resolvido na hora,
  // nenhum colírio a ditar).
  const tratamento = !STOP_GATE.exigirTratamento
    || detectaTratamentoNaFala(norm)
    || detectaCondutaRefrativaNaFala(norm)
    || detectaCondutaProcedimentoNaFala(norm);
  return { conduta, tratamento, ok: conduta && tratamento };
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
  STOP_COMMANDS_CURTOS,
  STOP_COMMANDS_ANCORADOS,
  STOP_FORCAR_COMMANDS,
  STOP_SAUDACAO_COMMANDS,
  DESPEDIDA_CONTINUACAO_WORDS,
  isContinuacaoDespedida,
  DILATACAO_COMMANDS,
  DILATACAO_COMBOS,
  EXAME_EM_ANDAMENTO_COMMANDS,
  EXAMES_NORMAIS_COMMANDS,
  EXAME_BLEFARITE_COMMANDS,
  CATARATA_COMMANDS,
  LIO_COMMANDS,
  OPACIDADE_CAPSULA_COMMANDS,
  LENTE_LIMPA_COMMANDS,
  OLHO_IRRITADO_COMMANDS,
  STOP_GATE,
  CONDUTA_FALA_MARKERS,
  CONDUTA_FALA_REGEXES,
  CONDUTA_REFRATIVA_MARKERS,
  CONDUTA_REFRATIVA_REGEXES,
  CONDUTA_PROCEDIMENTO_MARKERS,
  TRATAMENTO_FALA_MARKERS,
  TRATAMENTO_FALA_REGEXES,
  matchComboPair,
  detectaDilatacaoNaFala,
  detectaExameEmAndamento,
  detectaEncerramentoNaFala,
  detectaCondutaNaFala,
  detectaCondutaRefrativaNaFala,
  detectaCondutaProcedimentoNaFala,
  detectaTratamentoNaFala,
  checkCondutaTratamentoCaptados,
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
