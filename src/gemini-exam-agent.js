/**
 * GEMINI SERVICE v5.5.0 — Agente de Exames (OCR) + Agente de Entrevista
 *
 * v5.5.0 (revisão de estabilidade — 2026-08-06):
 *   1. APRESENTAÇÃO PADRONIZADA em vez de orientação adivinhada. As 14 fotos da
 *      pasta da câmera estão TODAS deitadas: o médico apoia a tira na mesa e
 *      fotografa de cima — nunca de pé. Duas conclusões:
 *        a) A moldura do sidepanel é HORIZONTAL (nunca vertical: de pé, o
 *           comprimento do ticket fica limitado pela altura do quadro e os
 *           dígitos perdem ~40% de resolução linear — justamente o que
 *           _cropAndZoom e o recorte da foto nativa existem para compensar).
 *           Ela marca de que lado fica o cabeçalho, o que torna a orientação
 *           uma CONSTANTE (PRE_ROTACAO_MOLDURA) em vez de uma inferência.
 *        b) Um detector local de "deitado vs em pé" foi escrito, medido contra
 *           as fotos reais e DESCARTADO: errou 2 das 5 conferidas à vista, e
 *           seu único modo de erro perigoso (girar uma foto que estava boa)
 *           passaria a acontecer justamente quando a moldura começasse a
 *           funcionar. Não se calibra um detector numa distribuição que se está
 *           tentando eliminar. Quem endireita segue sendo o modelo (v5.4.8),
 *           agora partindo de uma apresentação previsível.
 *   2. MAIS DE UM TICKET NA FOTO vira regra de prompt + aviso ao médico
 *      (_ticketsMultiplos). Foto de 2026-08-06 08:57: tono/paqui grampeado POR
 *      CIMA do ticket de refração — nada impedia misturar seções de papéis
 *      diferentes, nem ancorar a rotação no cabeçalho do ticket errado.
 *   3. TONOMETRIA GANHA CONFERÊNCIA. Toda a artilharia conferia só refração;
 *      a PIO ia sem cross-check nenhum. O prompt agora pede as medições
 *      individuais da linha TONO (_tonoMedicoes) e o pós-processamento avisa
 *      quando o AVG não bate com nenhuma delas. E PIO > 21 mmHg gera aviso
 *      clínico (pendência do log 2026-07-31: PIO 24 injetada sem alerta).
 *   4. DESEMPATE DE CILINDRO NORMALIZA O SINAL (_parseCil). A 3ª leitura
 *      devolvendo "0.50" sem sinal (convenção TOPCON documentada no próprio
 *      prompt principal) era comparada crua com pCil/vCil negativos e virava
 *      "3º valor diferente" — desempate certo, jogado fora.
 *   5. TOLERÂNCIAS CENTRALIZADAS em OCR_TOL. 0.30/0.50/0.15/0.13/8° estavam
 *      soltos no meio das funções — foi assim que um "0.25" virou exatamente
 *      um passo dióptrico sem ninguém notar (regressão da v5.4.5).
 *   6. ORÇAMENTO DE CHAMADAS por captura (contador + teto de referência em
 *      OCR_MAX_CHAMADAS) e total no log ⏱ — o pior caso passava de 10
 *      chamadas sem nenhum lugar onde isso aparecesse inteiro.
 *   7. Laço de rotação extraído para _straightenTicket (primeiro passo da
 *      fase 2 da reestruturação; o laço de disputa por olho fica para a fase).
 *
 * v5.4.8 (os DOIS sentidos de apresentação do ticket deitado):
 *   Uma tira deitada admite duas correções — 90° e 270° — e de fora não há como
 *   saber qual: o topo do ticket tanto pode estar à esquerda quanto à direita da
 *   foto, e as duas apresentações acontecem (o papel sai da impressora e é
 *   largado na mesa em qualquer sentido). Errado o sentido, a imagem girada fica
 *   DE CABEÇA PARA BAIXO — e a v5.4.7 desistia exatamente aí, no caso mais comum
 *   de erro, pedindo refoto de um ticket a um 180° de ser lido. Agora são até
 *   duas correções (90 errado + 180 = 270 certo), girando SEMPRE a partir do
 *   original pelo acumulado — girar o já girado empilha perda de JPEG. O
 *   acumulado é rastreado para recusar o pedido que fecha a volta (90 seguido de
 *   270 devolveria a foto original, que acabou de ser reprovada), e o prompt
 *   ancora 90/270 na posição do TOPO do ticket (cabeçalho com a data vs rodapé
 *   TOPCON/TONO.DATA), que é verificável na imagem — não na inclinação da cabeça.
 *
 * v5.4.7 (CAUSA RAIZ das trocas de coluna: o ticket estava DEITADO):
 *   A foto de 2026-08-06 09:03 mostra a tira a 90° sobre a mesa. O pipeline só
 *   sabia endireitar 180° (ticket grampeado, fotografado pelo verso) — 90°/270°
 *   passavam direto, com `_ticketInvertido: false`. Lendo de lado, a coluna do
 *   CILINDRO cai onde a mente espera a ESFERA: em 2 das 3 capturas do mesmo
 *   ticket o OD saiu +1.25 (o cilindro) em vez de +2.50, cada uma com um S.E.
 *   diferente e coerência interna suficiente para parecer certa. Nenhum veto a
 *   jusante conserta isso — só custa refoto. Agora a 1ª chamada devolve
 *   `_ticketRotacao` (0/90/180/270), o sistema gira a imagem (as fotos NATIVAS
 *   do recorte giram junto) e relê uma vez. `_ticketInvertido: true` continua
 *   aceito como 180 — o modelo às vezes responde no formato que memorizou.
 *
 * v5.4.6 (log 2026-08-06 — o olho bom morria antes mesmo de ser conferido):
 *   1. CROSS-CHECK S+C/2≈S.E. PASSA A REPROVAR O OLHO, NÃO A REFRAÇÃO. A conta é
 *      por olho e derrubava as duas: às 11:41 o OD saiu incoerente (S.E. +1.50
 *      com S +1.25 e C -0.50) e levou junto um OE exato. E como esse bloqueio
 *      acontece no pós-processamento, a refração zerada desligava `refracaoViva`
 *      — a captura terminava em 12s sem 2ª chamada e sem leitura ampliada para
 *      NENHUM dos dois olhos.
 *
 *   2. A LEITURA AMPLIADA VENCEDORA É A QUE CAIU NA LINHA CERTA. _signsUsable só
 *      exigia um caractere "+/−" legível, e o recorte devolve sinal legível da
 *      CÉLULA ERRADA com frequência (11:44: a magnitude do CILINDRO nos dois
 *      olhos; 19:40 do dia anterior: idem). O ticket inteiro, que tinha lido a
 *      esfera certa, era descartado — e uma captura CORRETA saía com dois avisos
 *      de "sinal não confirmado". Aviso espúrio em captura boa é como o médico
 *      aprende a ignorar aviso.
 *
 * v5.4.5 (FIX: a v5.4.4 deixou passar leitura alucinada — captura 19:40):
 *   O afrouxamento da v5.4.4 abriu dois buracos, os dois no mesmo log:
 *
 *   1. UMA DIMENSÃO RESOLVIDA ESCONDIA AS OUTRAS. O comparador devolve UMA
 *      divergência por olho; descartar essa (piso do CID, desempate, testemunha)
 *      liberava o olho inteiro, incluindo o que nunca foi conferido. Às 19:40 o
 *      OD teve a esfera liberada pelo piso (+0.25 vs -0.25) e injetou cilindro
 *      -0.50 contra -1.50 da 2ª leitura E da leitura ampliada — 1.00D de
 *      astigmatismo alucinado no prontuário. Agora cada descarte custa uma
 *      releitura do comparador com a dimensão já julgada marcada (skipDims), e
 *      um aviso 'soft' também não interrompe a conferência das demais.
 *
 *   2. TOLERÂNCIA DE MAGNITUDE DE UM PASSO DIÓPTRICO INTEIRO. A validação de
 *      linha aceitava ±0.25D — exatamente o passo do TOPCON —, então o valor da
 *      célula VIZINHA passava por "a mesma célula". Às 19:40 (OE) a ampliada
 *      devolveu magnitude 0.50 (o cilindro) contra esfera +0.25 e virou voto
 *      sobre o sinal da esfera. Número impresso se lê certo ou errado, não "por
 *      perto": a folga caiu para 0.13D.
 *
 * v5.4.4 (FIX: bloqueio frequente demais — 6 de 11 capturas do log 2026-08-05):
 *   Censo dos bloqueios da sessão: 3 por sinal de esfera de ±0.25D, 2 por
 *   cilindro discordante, 1 por sinal onde as duas leituras ampliadas
 *   discordavam ENTRE SI. Quatro correções, nenhuma delas baixando a barra de
 *   uma leitura de fato não conferida:
 *
 *   1. CONFERÊNCIA POR OLHO. O comparador parava no primeiro mismatch e o
 *      bloqueio zerava a refração inteira — em 4 das 6 capturas a disputa era
 *      de um olho só, e o outro (confirmado pelas três leituras) ia junto.
 *      Agora cada olho é comparado e bloqueado sozinho; só com os dois caídos a
 *      refração inteira cai (tono/paqui seguem preservados, v5.4.0).
 *
 *   2. AS DUAS LEITURAS AMPLIADAS VALEM. getSigns() dispara recorte e ticket
 *      inteiro em paralelo, mas só a vencedora era consultada: às 18:01 a 1ª, a
 *      2ª e o ticket inteiro liam "+0.50" no OE e o bloqueio saiu pela voz do
 *      recorte, sozinho. Discordância ENTRE as ampliadas é inconclusão.
 *
 *   3. PISO CLÍNICO TAMBÉM VALE PARA O BLOQUEIO. A mensagem justificava o veto
 *      com "troca miopia por hipermetropia (H52.1 vs H52.0)" — mas
 *      _inferCidRefracao só codifica a partir de |0.50D|. Em ±0.25D o sinal não
 *      muda CID nenhum, e três capturas seguidas do mesmo ticket (18:00, 18:01,
 *      18:02) foram perdidas por 0.5D que ninguém codifica. A neutralidade é
 *      CALCULADA (roda o inferidor nos dois cenários), não presumida.
 *
 *   4. DESEMPATE DE CILINDRO USA AS TESTEMUNHAS QUE JÁ EXISTEM. A chamada
 *      dedicada voltou ilegível em 2 de 2 (e o log chamava isso de "3º valor
 *      diferente: null"). As leituras ampliadas já transcrevem o C da linha
 *      MÉDIA; valem como voto, com a mesma exigência do eixo — unanimidade
 *      entre linhas validadas, senão o bloqueio permanece.
 *
 * v5.4.1 (FIX: a 3ª leitura não tinha segunda chance — 2 capturas bloqueadas seguidas):
 *   Log 2026-08-03 20:14: o mesmo ticket, duas capturas, as duas com a leitura
 *   ampliada voltando sinal=null — e as duas refrações bloqueadas por disputa de
 *   sinal que ninguém podia desempatar. _refDataBox é PALPITE do modelo, não
 *   medição: a mesma folha rendeu [170,170,460,380] e depois [170,100,520,450],
 *   e uma das leituras devolveu magnitude "0.77" — o EIXO do OE, prova de que o
 *   recorte levou o olhar para outra célula. Caixa INVÁLIDA já caía para o ticket
 *   inteiro; caixa VÁLIDA-E-ERRADA não tinha recurso nenhum. Agora:
 *     a) leitura ampliada ilegível nos dois olhos ⇒ repete UMA vez no ticket
 *        inteiro (1 chamada extra só no caminho de falha);
 *     b) o log registra as métricas do recorte (origem/recorte/saída/escala) —
 *        sem elas não dá para separar "caixa no lugar errado" de "resolução
 *        insuficiente" na próxima captura ruim;
 *     c) a 3ª chamada também transcreve C e A da linha MÉDIA (prova de linha) e
 *        o motivo da ilegibilidade vai para o log (_describeSignMisread).
 *
 * v5.4.0 (FIX: pilha de vetos bloqueava mais capturas boas do que capturas ruins):
 *   Diagnóstico do log 2026-08-03: 5 de 8 capturas bloqueadas; um paciente perdeu
 *   as 3 tentativas (zero refração, zero tono, zero paqui). Cinco retificações:
 *
 *   1. THINKING BUDGET. Os prompts pedem ancoragem de linha ("ache o S.E., suba
 *      uma linha") + duas checagens aritméticas, e rodavam com thinkingBudget:0.
 *      Pedir deliberação com zero tokens de raciocínio é contradição — agora há
 *      orçamento (EXAM_CONFIG/FOCUS_CONFIG).
 *
 *   2. LEITURAS FOCADAS RECEBEM PIXELS FOCADOS. _tiebreak* recebiam os mesmos 3
 *      tickets inteiros em 3840px; "olhe de perto" sobre pixels idênticos não é
 *      um olhar novo (17:48:03: o desempate de cilindro devolveu um 3º valor).
 *      A 1ª chamada agora devolve _refDataBox e o sistema recorta+amplia a
 *      REF.DATA antes de qualquer releitura. Sem chamada extra de localização.
 *
 *   3. POLÍTICA DE SINAL SIMÉTRICA. A v5.3.6 justificava o bloqueio permanente
 *      dizendo que o erro do "+" é CORRELACIONADO entre leituras — e então usava
 *      a concordância entre leituras como condição de liberação. A pilha só via
 *      discordância, logo o erro correlacionado passava direto (capturas 1 e 2 de
 *      +0.50 bloqueadas; a 3ª, com as duas chamadas concordando em -0.50, passou
 *      e injetou H521-Miopia). Agora o sinal é lido SEMPRE numa 3ª leitura
 *      AMPLIADA: ela contradizer a 1ª bloqueia (mesmo sem disputa — é o caso
 *      correlacionado), e ela confirmar a 1ª com S+C/2≈S.E. libera a disputa.
 *
 *   4. FALHA POR SEÇÃO, NÃO POR CAPTURA. _captureFailed descartava o ticket
 *      inteiro: às 17:46 tonometria (15/17) e paquimetria (517/515) sem conflito
 *      nenhum foram jogadas fora por divergência no cilindro do OE. Refração
 *      bloqueada agora zera só a refração (_refracaoBloqueada) e preserva
 *      tono/paqui; _captureFailed só quando não sobra nada.
 *
 *   5. S.E. RECUPERA O CILINDRO NÃO LIDO. Com cil=null o cross-check calculava
 *      seCalc=esf e qualquer astigmatismo real reprovava a captura (17:47:13: OD
 *      -5.00, C não lido, S.E. -5.50 → bloqueio; as outras capturas do mesmo
 *      ticket leram C=-1.00 = exatamente 2*(S.E.-S)). O S.E. impresso é o
 *      discriminador do cilindro que faltou, não a prova de leitura errada.
 *
 * v5.3.6 (FIX: sinal de esfera invertido injetado por voto 2-de-3):
 *   - Flip puro de sinal da esfera (+5.25 ↔ -5.25) inverte miopia↔hipermetropia,
 *     o CID (H52.1 vs H52.0) e o sinal da lente — é o erro de OCR de maior
 *     consequência. O desempate 2-de-3 (v5.3.4) tratava as 3 leituras como
 *     independentes, mas elas compartilham o mesmo modo de falha físico (traço
 *     vertical do "+" some na impressão térmica), então "confirmou a 1ª" pode ser
 *     a mesma alucinação vista 2×. Agora QUALQUER discordância de sinal força
 *     recaptura (mismatch 'hard' nunca é auto-liberado), como o eixo já faz; a 3ª
 *     chamada roda só para enriquecer a mensagem ao médico. Caso real: 2026-07-24,
 *     OD lido +5.25 por 2-de-3 num paciente cuja captura pós-dilatação leu esfera
 *     negativa — o sistema não tinha como decidir e não deveria ter injetado.
 *   - Piso clínico da esfera no CID determinístico (_inferCidRefracao): só
 *     codifica H52.0/H52.1 a partir de |0.50D|. ±0.25D é ruído emétrope (caso
 *     2026-07-24: OD +0.25 / OE -0.25 gerava Hipermetropia + Miopia). Testes
 *     REFRAC-FLOOR-1..3. Astigmatismo (cil ≥0.25) e o caminho de entrevista
 *     (ciente de sintomas) permanecem inalterados.
 *
 * v5.3.5 (FIX: eixo não conferido injetado — desempate de eixo por 3ª chamada):
 *   - Discordância de eixo entre 1ª e 2ª leituras (>8°, circular) era 'soft' e
 *     a math-consistency (S+C/2≈SE) NÃO envolve o eixo — então soft+math-ok
 *     jamais bloqueava e o eixo ia NÃO-CONFERIDO ao prontuário (3 de 4 capturas,
 *     log 2026-07-21). Agora dispara _tiebreakAxis (3ª chamada focada só na 3ª
 *     coluna A da MÉDIA), 2-de-3 como já se faz para sinal e cilindro. Diferença
 *     crucial: confirmar a 2ª OU inconclusivo FORÇA bloqueio (severity='hard') —
 *     o eixo não tem corroboração matemática, então "não confirmei" ⇒ "não injeta".
 *
 * v5.3.4 (FIX: sinal de esfera invertido pela verificação + média vs medições):
 *   - Desempate de sinal (3ª chamada): quando 1ª e 2ª leituras discordam da
 *     esfera por flip puro de sinal (+1.00 vs -1.00), uma 3ª chamada focada
 *     APENAS no caractere de sinal decide por 2-de-3. Modo de falha real de
 *     2026-06-12: verify leu "-1.00" onde o ticket imprimia "+1.00" e fabricou
 *     se=-2.12 CALCULADO (s+c/2) em vez de transcrito, bloqueando 2 capturas
 *     corretas em sequência.
 *   - Unanimidade das medições vence a média: se as 3 medições são idênticas
 *     e a "média" diverge, a média foi lida errado (média impressa de 3
 *     valores iguais é igual a eles). Caso real: medições c=-2.25 ×3 com
 *     média c=-2.00 passava na tolerância de 0.50D.
 *   - Prompts (principal e verify): aviso explícito sobre leitura do sinal
 *     (+ vs −) e proibição de calcular o "se" em vez de transcrever.
 *
 * v5.3.3 (FIX: falso positivo de cilindro em tickets sem astigmatismo):
 *   - "pCil=null vs vCil>0.30D" rebaixado de 'hard' → 'soft'.
 *     Quando a 1ª leitura não tem cilindro e é math-consistent (S≈SE),
 *     a alucinação de cilindro pela verificação vira aviso em vez de bloqueio.
 *     Modo de falha documentado: 2ª chamada alucina C=-1.25 em tickets de
 *     miopia pura (sem astigmatismo), impedindo injeção de leituras corretas.
 *
 * v5.3.2 (ANTI-ALUCINAÇÃO DE CILINDRO — 3 CORREÇÕES):
 *   - Divergência de cilindro >0.50D entre 1ª e 2ª chamada agora é 'hard'
 *     (sempre bloqueia injeção). Antes era 'soft' e podia ser ignorada
 *     quando a 1ª leitura era math-consistent.
 *   - Validação de passo dióptrico 0.25D: esfera e cilindro que não são
 *     múltiplos de 0.25 são rejeitados (erro de OCR em tickets degradados).
 *   - Prompt de OCR: portadas regras de anti-truncamento de CIL
 *     (-3.50 lido como -0.50) e incerteza de CYL do SKILL.md.
 *
 * v5.3.1 (DEFESAS CONTRA REFRAÇÃO INCOMPLETA):
 *   - Esférica null → olho inteiro descartado (cilindro sem esfera é
 *     clinicamente impossível e típica alucinação parcial).
 *   - Cilindro presente + eixo null → ambos descartados (cilindro sem eixo
 *     não define direção do astigmatismo, não é injetável).
 *   - Reforço no prompt: regra de completude explicitamente declarada.
 *
 * v5.3 (DEFESAS CONTRA SWAP S↔C):
 *   - Reforço no prompt: aviso explícito sobre ordem fixa das colunas e
 *     armadilha de troca S↔C (não decidir colunas por magnitude).
 *   - S.E. cross-check determinístico: |S + C/2 - S.E.| > 0.30D → falha.
 *     Pega casos onde o modelo lê cilindro errado mas mantém S.E. correto.
 *   - 2ª chamada de verificação independente da refração: prompt diferente,
 *     comparação determinística com a 1ª. Discordância em S, C ou A → falha.
 *     Pega swap S↔C onde 1ª chamada alucina "internamente consistente".
 *
 * v5.2 (REESCRITA OCR):
 *   - GeminiExamAgent reescrito do zero. 1 chamada à API, sem TWO-PASS.
 *   - Foco em "vazio é resposta válida".
 *   - Modelo retorna 3 medições + média + S.E. por olho. Cross-check em JS.
 *   - Sem auto-correção silenciosa. Sem banner com botões.
 *
 * GeminiInterviewAgent preservado da v5.1.
 */

// ============================================================================
// AGENTE 1 — GeminiExamAgent (OCR / Câmera) — v5.2 REESCRITO
// ============================================================================
//
// FILOSOFIA (v5.2):
//   1. Uma única chamada ao Gemini. Sem TWO-PASS. Sem retentativas automáticas.
//   2. Modelo retorna 3 medições + média + S.E. por olho. JS faz cross-check.
//   3. Quando média mostra cilindro mas as 3 medições mostram vazio → null
//      (provável alucinação por simetria visual).
//   4. Validação binária: aceita ou rejeita. Rejeição = pedir nova foto.
//   5. Sem auto-correção silenciosa. Sem botões. Sem heurísticas mágicas.
//
// FLUXO:
//   captura → _preprocessImage → callGeminiAPI(prompt único, imagem)
//          → _postProcessRefraction (cross-check determinístico)
//          → validateExamData → resultado
//   Se ticket invertido 180° detectado pelo modelo: 1 rotação + 1 nova call.
// ============================================================================

// Orçamento de raciocínio (v5.4.0). Os prompts de OCR exigem deliberação real:
// localizar a linha "S.E.", subir uma linha, conferir S+C/2≈S.E. e validar o
// passo de 0.25D. Com thinkingBudget:0 nada disso acontece — o modelo responde
// no primeiro palpite. Em Gemini 2.5 os tokens de thinking contam no
// maxOutputTokens, por isso o teto de saída subiu junto.
const EXAM_CONFIG  = { maxOutputTokens: 8192, thinkingBudget: 2048 };
// Leituras hiperfocadas (sinal/cilindro/eixo): resposta minúscula, mas é onde a
// atenção ao caractere mais importa — vale orçamento de raciocínio próprio.
const FOCUS_CONFIG = { maxOutputTokens: 2048, thinkingBudget: 1024 };

// ============================================================================
// TOLERÂNCIAS DE COMPARAÇÃO (v5.5.0)
// ============================================================================
//
// Estavam espalhadas como literais no meio das funções, e cada patch criou a
// sua. Foi exatamente assim que a v5.4.4 escreveu "0.25" na validação de linha
// sem notar que 0.25D é UM PASSO DIÓPTRICO INTEIRO — a célula vizinha passava
// por "a mesma célula", e a v5.4.5 teve que corrigir depois de uma alucinação
// chegar ao prontuário. Cada número aqui carrega a razão de ser o que é; mudar
// um passa a ser uma decisão consciente, não um typo que ninguém revisa.
const OCR_TOL = {
  // Cross-check S+C/2 ≈ S.E. impresso, e discordância de esfera entre leituras.
  // 0.30D = uma folga acima do passo (0.25D) para absorver arredondamento do
  // próprio aparelho, sem deixar passar erro de célula.
  ESFERA_DIFF: 0.30,
  SE_CROSSCHECK: 0.30,
  // Coerência interna de um olho (S+C/2 vs S.E. do MESMO olho). Mais apertada:
  // aqui não há duas leituras, é aritmética sobre os três números já lidos.
  MATH_CONSISTENT: 0.15,
  // Cilindro entre 1ª e 2ª leitura: acima de HARD sempre bloqueia; entre SOFT e
  // HARD só bloqueia se a 1ª não fechar a própria conta.
  CIL_HARD: 0.50,
  CIL_SOFT: 0.30,
  // Testemunha de cilindro (leitura ampliada) confirmando 1ª ou 2ª: precisa ser
  // o MESMO valor, folga só para ruído de formatação ("−0.50" vs "-.50").
  CIL_TESTEMUNHA: 0.15,
  // Validação de LINHA da leitura ampliada: a magnitude lida bate com |esfera|?
  // ABAIXO do passo dióptrico de propósito (v5.4.5) — número impresso se lê
  // certo ou errado, não "por perto". Com 0.25 aqui, o cilindro da linha certa
  // passava por esfera.
  LINHA_VALIDADA: 0.13,
  // Eixo, em graus, com comparação circular (1° ≡ 180°).
  EIXO_GRAUS: 8
};

// ============================================================================
// APRESENTAÇÃO PADRONIZADA DO TICKET (v5.5.0)
// ============================================================================
//
// As 14 fotos da pasta da câmera estão TODAS deitadas — o médico apoia a tira
// na mesa e fotografa de cima. Em vez de adivinhar a orientação foto a foto
// (um detector local foi medido e descartado: errou 2 de 5), a moldura do
// sidepanel PADRONIZA a apresentação, e a orientação vira uma constante.
//
// O lado marcado NÃO é arbitrário: girando as fotos reais, 270° é o que deixa
// a REF.DATA legível — ou seja, o médico já apoia o ticket com o cabeçalho à
// DIREITA. A moldura confirma o hábito em vez de pedir que ele o inverta, o que
// torna a conformidade gratuita e acerta a orientação na 1ª chamada.
// "Topo do ticket à direita" é 270° pela definição do próprio _getExamPrompt.
//
// ⚠ ACOPLAMENTO: este valor e o lado marcado na moldura em sidepanel.html
// (#cameraFramingGuide) precisam concordar. Trocar o lado na moldura sem trocar
// este número faz TODA captura chegar de cabeça para baixo. O teste ORIENT-2
// guarda os dois juntos.
//
// Errar não quebra nada, só custa uma chamada: com o cabeçalho à esquerda o
// modelo vê a imagem invertida e pede 180 (270+180=90, a outra apresentação);
// com o ticket em pé pede 90 e o alvo volta a 0. Os dois caminhos já são os da
// v5.4.8 — ver _proximoAlvoRotacao e os testes ROT-11/12.
const PRE_ROTACAO_MOLDURA = 270;

// Teto de referência de chamadas à API por captura (v5.5.0). Não é um corte
// rígido no meio do fluxo — abortar entre a verificação e a política de sinal
// deixaria a refração meio conferida, que é pior do que demorar. Serve para o
// log gritar quando o pior caso acontece: 1ª + 2 giros + verify + 2 sinais +
// desempate de cilindro + desempate de eixo já passa de 8, e o auto-retry de
// swap S↔C dobra tudo isso sem que nenhum log mostrasse o total.
const OCR_MAX_CHAMADAS = 8;

class GeminiExamAgent {
  constructor() {
    this.logger = new Logger('GeminiExamAgent');
    // Contador de chamadas à API da captura em curso (v5.5.0). Zerado no início
    // de cada extractExams de topo — o auto-retry de swap S↔C NÃO zera, senão o
    // caminho mais caro do sistema (pipeline inteiro duas vezes) seria o único
    // que o log mostraria pela metade.
    this._chamadas = 0;
  }

  /**
   * Toda chamada à API passa por aqui, para que o custo real de uma captura
   * apareça em UM lugar. `label` identifica a etapa no log.
   */
  async _callApi(apiService, parts, config, label) {
    this._chamadas++;
    if (this._chamadas === OCR_MAX_CHAMADAS + 1) {
      // Não interrompe: cortar entre a verificação e a política de sinal deixaria
      // a refração meio conferida. O aviso existe para o próximo log de problema
      // mostrar de cara que aquela captura estourou o orçamento.
      this.logger.warn(
        `[OCR] ⚠ Orçamento de chamadas excedido (${this._chamadas} > ${OCR_MAX_CHAMADAS}) — ` +
        `captura cara; ver o resumo de chamadas ao final.`
      );
    }
    this.logger.info(`[OCR] → chamada #${this._chamadas} (${label})`);
    return apiService.callGeminiAPI(parts, config);
  }

  // --------------------------------------------------------------------------
  // Pré-processamento de imagem (contraste + grayscale)
  // --------------------------------------------------------------------------
  /**
   * Contraste padrão (c=60 → fator ≈ 1.6) + escala de cinza (ITU-R BT.601),
   * in place no contexto. Aumenta a separação texto/fundo sem distorcer.
   * Compartilhado por _preprocessImage (ticket inteiro) e _cropAndZoom (recorte
   * vindo da foto nativa, que não passou pelo pré-processamento).
   */
  _applyContrastInPlace(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const C = 60;
    const factor = (259 * (C + 255)) / (255 * (259 - C));
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const newGray = Math.max(0, Math.min(255, factor * (gray - 128) + 128));
      data[i] = newGray;
      data[i + 1] = newGray;
      data[i + 2] = newGray;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  async _preprocessImage(base64Image) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        this._applyContrastInPlace(ctx, canvas.width, canvas.height);
        const processedBase64 = canvas.toDataURL('image/jpeg', 0.95);
        resolve(processedBase64.replace(/^data:image\/\w+;base64,/, ''));
      };

      img.onerror = () => {
        this.logger.warn('Falha no pré-processamento, usando imagem original');
        resolve(base64Image.replace(/^data:image\/\w+;base64,/, ''));
      };

      img.src = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  // --------------------------------------------------------------------------
  // Rotação de quarto de volta (v5.4.7)
  // --------------------------------------------------------------------------
  //
  // Só 180° era corrigido — o caso do ticket grampeado e fotografado pelo verso.
  // Mas o ticket TOPCON é uma tira LONGA: fotografado sobre a mesa ele quase
  // sempre sai DEITADO, e aí as colunas S/C/A viram linhas. Foto de
  // 2026-08-06 09:03 (ticket a 90°): duas das três capturas leram o CILINDRO
  // como esfera do OD (+1.25 no lugar de +2.50) — cada uma com um S.E. diferente
  // e coerência interna suficiente para parecer certa. Ler de lado é a causa
  // raiz das trocas de coluna; endireitar a imagem é mais barato do que
  // qualquer veto a jusante.
  //
  // @param {number} deg 90 | 180 | 270, sentido horário.
  async _rotateImage(base64Image, deg) {
    const norm = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
    if (norm === 0) return base64Image;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const swap = norm === 90 || norm === 270;
        canvas.width  = swap ? img.height : img.width;
        canvas.height = swap ? img.width  : img.height;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(norm * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
      };
      img.onerror = () => {
        this.logger.warn(`[Rotate] Falha ao girar ${norm}° — usando imagem original`);
        resolve(base64Image);
      };
      img.src = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  /**
   * Para qual orientação ABSOLUTA girar, dada a acumulada e o passo que o modelo
   * pediu agora? `null` = não girar (passo inválido, ou o destino é uma
   * orientação já reprovada).
   *
   * É aqui que mora o caso dos DOIS SENTIDOS: uma tira deitada pode estar a 90°
   * ou a 270° e de fora não dá para saber. Errado o sentido, a imagem girada sai
   * de cabeça para baixo e o modelo pede mais 180° — 90+180 = 270, a outra
   * apresentação. Já 90 seguido de 270 fecha 360° e devolveria a foto original,
   * que acabou de ser reprovada: esse é o pedido que se recusa.
   */
  _proximoAlvoRotacao(acumulada, passo, tentadas) {
    const p = this._rotacaoPedida({ _ticketRotacao: passo });
    if (!p) return null;
    const alvo = (((acumulada + p) % 360) + 360) % 360;
    if (tentadas && tentadas.has(alvo)) return null;
    return alvo;
  }

  /** Compat: o caminho antigo (e os testes) chamavam a rotação de 180°. */
  async _rotateImage180(base64Image) {
    return this._rotateImage(base64Image, 180);
  }

  /**
   * Quantos graus o modelo pediu para girar? Aceita o contrato novo
   * (_ticketRotacao: 0|90|180|270) e o antigo (_ticketInvertido: true = 180),
   * porque o modelo às vezes responde no formato do exemplo que memorizou.
   * Qualquer valor fora dos quatro múltiplos de 90 vira 0 — girar por um número
   * inventado estragaria uma imagem que estava boa.
   */
  _rotacaoPedida(raw) {
    if (!raw) return 0;
    if (raw._ticketInvertido === true && raw._ticketRotacao == null) return 180;
    const n = Number(raw._ticketRotacao);
    // Sem arredondar: 45 não é "quase 90". Um número que não é múltiplo exato de
    // 90 é resposta inventada, e girar por ela estragaria uma imagem boa.
    if (!Number.isInteger(n) || n % 90 !== 0) return 0;
    const norm = ((n % 360) + 360) % 360;
    return [90, 180, 270].includes(norm) ? norm : 0;
  }

  /**
   * Endireita o ticket e devolve a 1ª leitura já na orientação correta (v5.5.0).
   *
   * Extraído de extractExams: era um bloco de ~60 linhas no meio de um método de
   * 500, com quatro variáveis mutáveis (`raw`, `imageParts`, `cropSources`,
   * `_rotAcumulada`) atravessando o resto da função. Aqui a rotação tem entrada
   * e saída explícitas.
   *
   * Uma tira deitada admite duas correções — 90° e 270° — e do lado de fora não
   * há como saber qual: o topo tanto pode estar à esquerda quanto à direita da
   * foto, e as duas apresentações acontecem (o papel sai da impressora e é
   * largado na mesa em qualquer sentido). Errado o sentido, a imagem girada fica
   * DE CABEÇA PARA BAIXO — e a v5.4.7 desistia exatamente aí, no caso mais comum
   * de erro. Duas correções, portanto, e no máximo duas: 90 errado + 180 = 270
   * certo. O acumulado é rastreado para nunca repetir uma orientação já tentada.
   *
   * `preRot` é a orientação de partida que a moldura padroniza
   * (PRE_ROTACAO_MOLDURA). Ela entra no acumulado e no conjunto de tentadas —
   * mas a orientação 0 NÃO entra como "já reprovada" quando houve pré-rotação,
   * porque o modelo nunca a viu: se ele pedir a volta (90 + 270 = 0), está
   * corrigindo a nossa premissa (o médico apoiou o ticket de outro jeito), e
   * essa correção precisa ser possível.
   *
   * @returns {{raw, imageParts, cropSources}|{erro: string}}
   */
  async _straightenTicket(prompt, processedImages, nativeImages, preRot, apiService) {
    const _MAX_GIROS = 2;

    // Gira SEMPRE a partir do original, pelo acumulado: girar o já girado
    // empilharia perda de qualidade de JPEG a cada volta.
    const aplicar = async (deg) => {
      const proc = deg === 0
        ? processedImages
        : await Promise.all(processedImages.map(b => this._rotateImage(b, deg)));
      // As fontes do recorte precisam girar junto, ou a caixa devolvida pelo
      // modelo (medida sobre o ticket já rotacionado) apontaria para o lugar
      // errado na foto nativa.
      const crop = nativeImages
        ? (deg === 0 ? nativeImages : await Promise.all(nativeImages.map(b => this._rotateImage(b, deg))))
        : proc;
      return {
        cropSources: crop,
        imageParts: proc.map(b64 => ({ inlineData: { mimeType: 'image/jpeg', data: b64 } }))
      };
    };

    let rotAcumulada = preRot || 0;
    const tentadas = new Set([rotAcumulada]);
    let atual = await aplicar(rotAcumulada);
    let raw;

    const _tCall1 = Date.now();
    try {
      const { text } = await this._callApi(
        apiService, [{ text: prompt }, ...atual.imageParts], EXAM_CONFIG, '1ª leitura'
      );
      raw = _parseGeminiJSON(text, 'exames');
      this.logger.info(`[OCR] ⏱ 1ª chamada: ${Date.now() - _tCall1}ms`);
    } catch (err) {
      this.logger.error('[OCR] Falha na chamada à API:', err);
      return { erro: 'Erro na comunicação com a IA. Tente novamente.' };
    }

    for (let giro = 0; giro < _MAX_GIROS; giro++) {
      const passo = this._rotacaoPedida(raw);
      if (!passo) break;

      const alvo = this._proximoAlvoRotacao(rotAcumulada, passo, tentadas);
      if (alvo === null) {
        // O modelo está oscilando (pede 90, depois 270) — mais uma volta cairia
        // numa orientação já reprovada. Parar aqui é honesto; insistir é loop.
        this.logger.warn(`[OCR] Rotação pedida (${passo}°) levaria a uma orientação já tentada — parando de girar.`);
        break;
      }
      this.logger.warn(`[OCR] Ticket torto: girando ${passo}° (acumulado ${alvo}°) e relendo`);
      rotAcumulada = alvo;
      tentadas.add(alvo);
      atual = await aplicar(rotAcumulada);

      try {
        const { text } = await this._callApi(
          apiService, [{ text: prompt }, ...atual.imageParts], EXAM_CONFIG, `releitura após girar ${alvo}°`
        );
        raw = _parseGeminiJSON(text, 'exames');
      } catch (err) {
        this.logger.error('[OCR] Falha após rotação:', err);
        return { erro: 'Erro ao re-ler o ticket rotacionado.' };
      }
    }

    // Esgotadas as tentativas com o modelo ainda vendo o ticket torto: devolver
    // `raw` sem refração daria um "captura vazia" que não explica nada.
    if (this._rotacaoPedida(raw)) {
      this.logger.warn('[OCR] Após girar, o modelo continua vendo o ticket torto — desistindo da rotação automática.');
      return { erro: 'Não foi possível endireitar o ticket automaticamente. Fotografe o ticket com o texto na horizontal.' };
    }

    // A marca vale para QUALQUER rotação aplicada, inclusive a nossa pré-rotação
    // local — o consumidor usa isso para saber que a imagem lida não é a foto
    // como ela saiu da câmera.
    if (raw && rotAcumulada !== 0) raw._ticketFoiRotacionado = true;

    return { raw, imageParts: atual.imageParts, cropSources: atual.cropSources };
  }

  // --------------------------------------------------------------------------
  // Recorte + ampliação da REF.DATA (v5.4.0)
  // --------------------------------------------------------------------------
  //
  // As releituras "hiperfocadas" (sinal, cilindro, eixo) recebiam exatamente os
  // mesmos 3 tickets inteiros em 3840px que a 1ª chamada. Um prompt que diz
  // "olhe de perto" sobre pixels idênticos não produz um olhar novo — produz a
  // mesma leitura com instrução mais curta (log 2026-08-03 17:48:03: o desempate
  // de cilindro devolveu um TERCEIRO valor, 3.25, quando a disputa era
  // -1.25 vs -3.25). Recortar a REF.DATA e ampliá-la dá pixels de verdade para
  // a releitura decidir.
  //
  // A caixa vem da própria 1ª chamada (_refDataBox), evitando um round-trip de
  // localização. É relativa à PRIMEIRA imagem; como as 3 fotos são um burst de
  // 200ms com enquadramento praticamente igual, a mesma caixa serve para todas
  // desde que haja folga — daí o padding generoso.

  /** Valida e aplica folga à caixa [ymin,xmin,ymax,xmax] normalizada 0-1000. */
  // padPct 0.30 (era 0.12): a caixa é palpite do modelo e erra de lado. Na mesma
  // folha, três capturas do log 2026-08-05 renderam xmin 680, 680 e 580 e ymin
  // 100, 170 e 200 — variação maior que a folga que existia, e o recorte saía
  // sem a coluna do sinal. Folga generosa custa alguns pixels de ampliação e
  // compra tolerância a um palpite torto.
  _normalizeBox(box, padPct = 0.30) {
    if (!Array.isArray(box) || box.length !== 4) return null;
    const [ymin, xmin, ymax, xmax] = box.map(Number);
    if ([ymin, xmin, ymax, xmax].some(v => isNaN(v) || v < 0 || v > 1000)) return null;
    const h = ymax - ymin, w = xmax - xmin;
    // Caixa degenerada ou "ticket inteiro" não agrega ampliação — descarta.
    if (h < 50 || w < 50) return null;
    if (h > 950 && w > 950) return null;
    const padY = h * padPct, padX = w * padPct;
    return {
      ymin: Math.max(0, ymin - padY), xmin: Math.max(0, xmin - padX),
      ymax: Math.min(1000, ymax + padY), xmax: Math.min(1000, xmax + padX)
    };
  }

  /**
   * Recorta a região e reamostra para cima (até 3×, alvo ~2400px no maior lado).
   *
   * `applyContrast` existe porque a fonte do recorte mudou: quando recortamos da
   * FOTO NATIVA (crua, colorida), o realce de contraste do _preprocessImage não
   * passou por ali — precisa ser aplicado aqui, no recorte, ou a região volta
   * mais fiel em pixels e pior em separação texto/fundo. Quando a fonte é a
   * imagem já pré-processada, o realce não se repete (dobraria o efeito).
   */
  async _cropAndZoom(base64Image, norm, applyContrast = false) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const sx = Math.round((norm.xmin / 1000) * img.width);
          const sy = Math.round((norm.ymin / 1000) * img.height);
          const sw = Math.max(1, Math.round(((norm.xmax - norm.xmin) / 1000) * img.width));
          const sh = Math.max(1, Math.round(((norm.ymax - norm.ymin) / 1000) * img.height));

          const TARGET = 2400;
          const scale = Math.max(1, Math.min(3, TARGET / Math.max(sw, sh)));
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(sw * scale);
          canvas.height = Math.round(sh * scale);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          if (applyContrast) this._applyContrastInPlace(ctx, canvas.width, canvas.height);
          resolve({
            data: canvas.toDataURL('image/jpeg', 0.95).split(',')[1],
            // Métricas do recorte — sem elas não dá para distinguir "caixa no
            // lugar errado" de "caixa certa, resolução insuficiente" quando a
            // releitura ampliada volta ilegível (log 2026-08-03 20:14).
            src: `${img.width}x${img.height}`,
            crop: `${sw}x${sh}@${sx},${sy}`,
            out: `${canvas.width}x${canvas.height}`,
            scale: scale.toFixed(2)
          });
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = base64Image.startsWith('data:')
        ? base64Image
        : `data:image/jpeg;base64,${base64Image}`;
    });
  }

  /**
   * Monta os imageParts recortados. Retorna null quando não há caixa utilizável
   * — o caller então cai de volta no ticket inteiro (comportamento pré-v5.4.0).
   */
  async _buildFocusedParts(images, box, fromNative = false) {
    const norm = this._normalizeBox(box);
    if (!norm) {
      this.logger.warn('[OCR] _refDataBox ausente/inválido — releituras usarão o ticket inteiro');
      return null;
    }
    try {
      const crops = (await Promise.all(images.map(b64 => this._cropAndZoom(b64, norm, fromNative))))
        .filter(c => c && c.data);
      if (crops.length === 0) {
        this.logger.warn('[OCR] Recorte da REF.DATA falhou — releituras usarão o ticket inteiro');
        return null;
      }
      const m = crops[0];
      this.logger.info(
        `[OCR] REF.DATA recortada e ampliada em ${crops.length} imagem(ns) — ` +
        `fonte=${fromNative ? 'FOTO NATIVA' : 'imagem do payload'} ` +
        `caixa=[${box}] origem=${m.src} recorte=${m.crop} saída=${m.out} (${m.scale}×)`
      );
      return crops.map(c => ({ inlineData: { mimeType: 'image/jpeg', data: c.data } }));
    } catch (err) {
      this.logger.warn('[OCR] Erro ao recortar REF.DATA:', err.message);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Extração principal
  // --------------------------------------------------------------------------
  //
  // fullResImages: as fotos NATIVAS da mesma captura, na resolução em que
  // saíram da câmera. Não vão para o payload da API (3 fotos full-res estouram
  // o limite de inline data) — servem só de fonte para o recorte da REF.DATA,
  // que é uma região pequena e portanto cabe. Sem elas o recorte saía da imagem
  // já reduzida a 3840 e já reencodada duas vezes, e o "zoom" era interpolação
  // de pixel perdido. Opcional: ausente, o recorte volta ao comportamento antigo.
  async extractExams(imagesBase64, onProgress, _isRetry = false, fullResImages = null) {
    const images = Array.isArray(imagesBase64) ? imagesBase64 : [imagesBase64];
    const nativeImages = Array.isArray(fullResImages) && fullResImages.length === images.length
      ? fullResImages
      : null;
    // O auto-retry de swap S↔C reentra aqui: só a captura de topo zera o
    // contador, para que o caminho mais caro do sistema (pipeline inteiro duas
    // vezes) apareça inteiro no log em vez de pela metade.
    if (!_isRetry) this._chamadas = 0;
    this.logger.info(
      `[OCR] Analisando ${images.length} imagem(ns)` +
      (nativeImages ? ' (com fotos nativas para o recorte)' : '')
    );

    if (onProgress) onProgress('reading');

    // Cronometragem por fase. Os logs só carimbam o INÍCIO de cada etapa, então
    // o custo do pré-processamento (loop por pixel em 3 imagens de 8 MP) ficava
    // embutido no tempo da 1ª chamada e não dava para saber quanto era de rede
    // e quanto era de canvas.
    const _t0 = Date.now();
    const _ms = () => Date.now() - _t0;

    this.logger.info('[OCR] Pré-processando imagens...');
    const processedImages = await Promise.all(
      images.map(img => this._preprocessImage(img))
    );
    this.logger.info(`[OCR] ⏱ pré-processamento: ${_ms()}ms`);

    const prompt = this._getExamPrompt();
    const endireitado = await this._straightenTicket(
      prompt, processedImages, nativeImages, PRE_ROTACAO_MOLDURA, apiService
    );
    if (endireitado.erro) return this._captureFailed(endireitado.erro);

    // cropSources acompanha imageParts (a rotação troca as duas juntas), para
    // que o recorte da REF.DATA use o MESMO enquadramento que o modelo viu. A
    // caixa vem em coordenadas normalizadas 0-1000, então serve igualmente à
    // foto nativa e à imagem reduzida — desde que a orientação seja a mesma.
    // `const` porque a orientação está RESOLVIDA aqui: antes da v5.5.0 estas
    // quatro variáveis eram reatribuídas pelo laço de rotação no meio da função,
    // e o leitor tinha de rastrear 500 linhas para saber qual imagem valia.
    const raw = endireitado.raw;
    const imageParts = endireitado.imageParts;
    const cropSources = endireitado.cropSources;
    const cropFromNative = !!nativeImages;

    this.logger.info('[OCR] Resposta bruta do modelo:\n' + JSON.stringify(raw, null, 2));

    // Pós-processamento determinístico
    const processed = this._postProcessRefraction(raw);

    // Recorte ampliado da REF.DATA — memoizado como PROMESSA (não como valor),
    // para que a leitura de sinal possa ser DISPARADA cedo e correr em paralelo
    // com a verificação, em vez de esperar a verificação terminar.
    let _focusedPromise;
    const getFocusedParts = () => {
      if (!_focusedPromise) {
        _focusedPromise = this._buildFocusedParts(cropSources, raw?._refDataBox, cropFromNative)
          .then(parts => parts || imageParts)
          .catch(() => imageParts);
      }
      return _focusedPromise;
    };

    // Leitura ampliada do sinal da esfera — memoizada: roda uma vez por captura
    // e serve tanto à checagem sempre-ativa quanto ao desempate de flip.
    //
    // v5.4.1 — SEGUNDA CHANCE NO TICKET INTEIRO. _refDataBox é um palpite do
    // modelo, não uma medição: no log 2026-08-03 20:14 a MESMA folha rendeu
    // [170,170,460,380] numa captura e [170,100,520,450] na seguinte. Uma caixa
    // inválida já caía para o ticket inteiro (_buildFocusedParts → null), mas uma
    // caixa VÁLIDA-E-ERRADA não tinha recurso: as duas capturas voltaram com
    // sinal=null (uma delas com magnitude "0.77" — o EIXO do OE, prova de que o
    // recorte levou o olhar para outra célula) e as duas refrações foram
    // bloqueadas. Custo de 1 chamada extra apenas no caminho de falha.
    //
    // v5.4.2 — AS DUAS LEITURAS CORREM EM PARALELO. Em série, a "segunda chance"
    // só começava depois de o recorte falhar: no log 2026-08-05 o recorte voltou
    // ilegível em 3 de 3 capturas e o ticket inteiro leu certo em 2 de 2, ou seja,
    // ~5s eram queimados antes de começarem os ~7s que de fato resolvem — e esse
    // era o caminho NORMAL, não o de exceção. Em paralelo o custo de parede é o do
    // mais lento em vez da soma, e o recorte mantém a preferência quando serve.
    // v5.4.3 — AS DUAS LEITURAS FICAM GUARDADAS COMO TESTEMUNHAS. O prompt do
    // sinal já manda transcrever C e A da MESMA linha MÉDIA ("servem para provar
    // que você está na linha certa"). Essa prova era jogada fora: só o campo
    // `sinal` era lido, e disputas de cilindro/eixo eram decididas (ou não) sem
    // ela. No log 2026-08-05 as três capturas do mesmo ticket foram bloqueadas
    // com a resposta certa dentro da própria leitura ampliada — ver
    // _rowWitnesses e o uso em extractExams.
    const _signsCandidates = [];
    let _signsPromise;
    const getSigns = () => {
      if (!_signsPromise) {
        _signsPromise = (async () => {
          const focused = await getFocusedParts();
          // Sem recorte utilizável, a leitura no ticket inteiro é a única —
          // disparar duas iguais só desperdiçaria chamada.
          if (focused === imageParts) {
            const only = await this._readSphereSigns(imageParts, apiService);
            if (only) _signsCandidates.push(only);
            return only;
          }

          const [cropSigns, fullSigns] = await Promise.all([
            this._readSphereSigns(focused, apiService).catch(() => null),
            this._readSphereSigns(imageParts, apiService).catch(() => null)
          ]);
          if (cropSigns) _signsCandidates.push(cropSigns);
          if (fullSigns) _signsCandidates.push(fullSigns);

          // v5.4.6 — VENCE QUEM ESTÁ NA LINHA CERTA, não quem tem um sinal
          // legível. "Utilizável" só exigia o caractere +/−, e o recorte devolve
          // um sinal legível da CÉLULA ERRADA com frequência: no log 2026-08-06
          // 11:44 as duas leituras do recorte devolveram a magnitude do CILINDRO
          // nos dois olhos, e o ticket inteiro — que tinha lido a esfera certa —
          // foi descartado. Resultado: dois avisos de "sinal não confirmado"
          // numa captura correta, com a confirmação parada em _signsCandidates.
          // Aviso espúrio em captura boa é como o médico aprende a ignorar aviso.
          const ref = {
            od: processed.refracao?.od || processed._olhosFalhosPorSE?.od?.eye || null,
            oe: processed.refracao?.oe || processed._olhosFalhosPorSE?.oe?.eye || null
          };
          if (this._signsUsable(cropSigns, ref)) return cropSigns;
          if (this._signsUsable(fullSigns, ref)) {
            this.logger.warn('[OCR] Leitura ampliada do recorte não caiu na linha da esfera — usando a leitura paralela do ticket inteiro.');
            return fullSigns;
          }
          // Nenhuma das duas na linha certa: mantém a preferência antiga (sinal
          // legível), para não trocar um voto ruim por nenhum voto.
          if (this._signsUsable(cropSigns)) return cropSigns;
          if (this._signsUsable(fullSigns)) {
            this.logger.warn('[OCR] Sinal ilegível no recorte — usando a leitura paralela do ticket inteiro.');
            return fullSigns;
          }
          return cropSigns || fullSigns;
        })();
      }
      return _signsPromise;
    };

    // Dispara a leitura de sinal AGORA. Ela depende só de raw._refDataBox e das
    // imagens — nada do resultado da verificação — mas era iniciada depois dela,
    // somando ~12s de verificação com ~7s de sinal quando os dois podiam correr
    // juntos. Condicionado à refração ter sobrevivido ao pós-processamento: uma
    // captura já bloqueada não deve gastar chamadas que ninguém vai ler.
    // O .catch() aqui só evita "unhandled rejection" do disparo solto — quem
    // consome getSigns() continua recebendo a rejeição e tratando no try de lá.
    const temOlhoFalhoPorSE = !!(processed._olhosFalhosPorSE &&
      (processed._olhosFalhosPorSE.od || processed._olhosFalhosPorSE.oe));
    const refracaoViva = (!processed._captureFailed && processed.refracao &&
      (processed.refracao.od || processed.refracao.oe)) || temOlhoFalhoPorSE;
    if (refracaoViva) getSigns().catch(() => {});

    // ── DEFESA: 2ª chamada independente para verificar refração ────────────
    // Se a 1ª call produziu refração válida, fazer uma 2ª call com prompt
    // diferente e focado APENAS em refração. Comparar resultados. Discordância
    // em S, C ou A → bloquear. Pega swap S↔C e outras alucinações que a 1ª
    // call faria de forma "internamente consistente".
    //
    // Custo: 1 call extra (~5-10s). Valor: bloqueia o caso de hoje (OE com
    // S e C trocados, onde a 1ª call mostrou consistência interna falsa).
    if (refracaoViva) {
      // A 2ª chamada tem try PRÓPRIO e estreito: falhar aqui (rede, JSON
      // malformado) não pode arrastar consigo a política de sinal, que é
      // independente dela. Antes da v5.4.0 tudo vivia num try só — um erro de
      // rede na verificação pulava silenciosamente TODA a conferência e a
      // refração era injetada sem que nenhuma leitura confirmasse o sinal.
      let mismatchByEye = { od: null, oe: null };
      let verifyData = null;
      let verifyOk = false;
      const _tV = Date.now();
      try {
        this.logger.info('[OCR] Verificação independente (2ª chamada)...');
        const verifyPrompt = this._getRefractionVerifyPrompt();
        const { text: verifyText } = await this._callApi(
          apiService, [{ text: verifyPrompt }, ...imageParts], EXAM_CONFIG, 'verificação de refração'
        );
        const verify = _parseGeminiJSON(verifyText, 'verify');
        this.logger.info('[OCR] Verificação retornou:\n' + JSON.stringify(verify, null, 2));
        this.logger.info(`[OCR] ⏱ verificação: ${Date.now() - _tV}ms`);
        verifyData = verify;
        this._rescueEyesFailedBySE(processed, verify);
        mismatchByEye = this._compareEyesAgainstVerify(processed.refracao, verify);
        verifyOk = true;
      } catch (err) {
        this.logger.warn('[OCR] Verificação 2ª chamada falhou:', err.message);
        processed._avisos = processed._avisos || [];
        processed._avisos.push('Verificação independente da refração não pôde ser realizada — confira manualmente.');
      }

      try {
        // ── Política de sinal da esfera (v5.4.0) ────────────────────────────
        // Roda SEMPRE: com ou sem disputa, com ou sem a 2ª chamada.
        // Ver _applySignPolicy.
        // Se o paralelismo pegou, esta espera é ~0ms: a leitura de sinal já
        // rodou junto com a verificação acima. Um valor alto aqui significa que
        // a leitura de sinal está mais lenta que a verificação — nesse caso ela
        // virou o gargalo e é ela que precisa encolher.
        const _tS = Date.now();
        // Uma disputa RESOLVIDA (desempate, testemunha, correção) não é o mesmo
        // que uma captura em que ninguém discordou: "Leituras independentes
        // concordam com a 1ª" ao lado de "eixo corrigido de 75° para 50°" desmente
        // o aviso que pede conferência. Só o caminho sem disputa nenhuma o merece.
        let resolvidoPorConferencia = false;
        const _signs = await getSigns();
        this.logger.info(`[OCR] ⏱ espera pelo sinal: ${Date.now() - _tS}ms`);
        if (this._rescueEyesFailedBySE(processed, verifyData, _signsCandidates)) {
          mismatchByEye = this._compareEyesAgainstVerify(processed.refracao, verifyData);
        }
        // Olho que já foi bloqueado no pós-processamento (e não foi resgatado)
        // não deve gerar o falso erro de "1ª leitura disse olho ausente".
        if (processed._olhosBloqueados) {
          for (const lado of ['od', 'oe']) {
            if (processed._olhosBloqueados[lado]) mismatchByEye[lado] = null;
          }
        }
        const _preSinal = { od: mismatchByEye.od, oe: mismatchByEye.oe };
        mismatchByEye = await this._applySignPolicy(processed, mismatchByEye, _signs, _signsCandidates);

        // Conferência POR OLHO (v5.4.4): cada olho é julgado e, se for o caso,
        // bloqueado sozinho. Antes o comparador parava no primeiro mismatch e o
        // bloqueio zerava os dois olhos — o olho conferido ia junto.
        //
        // v5.4.5 — E POR DIMENSÃO. O comparador devolve UMA divergência por vez;
        // quando o caller descartava essa (desempate, testemunha, piso do CID),
        // as dimensões seguintes do mesmo olho nunca eram conferidas. Log
        // 2026-08-05 19:40: a esfera do OD foi liberada pelo piso do CID e o
        // cilindro (1ª=-0.50 vs 2ª=-1.50) entrou no prontuário sem conferência.
        // Cada descarte agora custa uma releitura do comparador com a dimensão
        // resolvida marcada — até acabarem as dimensões ou algo bloquear.
        let houveDisputa = !!(processed._resgatouPorSE || processed._olhosBloqueados?.od || processed._olhosBloqueados?.oe);
        for (const lado of ['od', 'oe']) {
          const dimsResolvidas = [];
          let mismatch = mismatchByEye[lado];
          // A política de sinal descartou a disputa de esfera deste olho? Então
          // a esfera está julgada, mas as outras dimensões continuam pendentes.
          if (!mismatch && _preSinal[lado]) {
            houveDisputa = true;
            dimsResolvidas.push(_preSinal[lado].dim || 'esfera');
            mismatch = this._compareEye(lado, processed.refracao?.[lado], verifyData?.[lado], dimsResolvidas);
          }
          let _guard = 0;
          let bloqueou = false;
          while (mismatch && _guard++ < 4) {
          houveDisputa = true;
          const _dimAtual = mismatch.dim || 'esfera';

          // ── Desempate de Cilindro (3ª chamada focada) ──────────────
          // Ocorre quando há confusão/pulo de linha entre Média e Medições.
          // A 3ª chamada foca apenas na coluna central (C) da linha MÉDIA.
          if (mismatch && mismatch.isCylinderMismatch && mismatch.pCil !== null && mismatch.vCil !== null) {
            const eyeData = processed.refracao[mismatch.eye];
            const mathConsistent = this._isEyeMathConsistent(eyeData);
            if (mathConsistent || mismatch.severity === 'hard') {
              let vereditoCil = await this._tiebreakCylinder(mismatch, await getFocusedParts(), apiService);
              // A chamada dedicada volta ilegível com frequência (2 de 2 nesta
              // sessão) — e as leituras ampliadas do sinal já transcreveram o C da
              // linha MÉDIA. Mesmo desempate de graça, com a mesma exigência do
              // eixo: só vale se as testemunhas de linha validada forem UNÂNIMES.
              if (!vereditoCil) vereditoCil = this._cylinderWitnessVerdict(mismatch, eyeData, _signsCandidates);
              if (vereditoCil === 'primeira') {
                processed._avisos = processed._avisos || [];
                processed._avisos.push(`${mismatch.eye.toUpperCase()}: 2ª chamada leu cilindro diferente (1ª="${mismatch.pCil}" vs 2ª="${mismatch.vCil}"); desempate por 3ª leitura confirmou a 1ª. Confira manualmente.`);
                resolvidoPorConferencia = true;
                mismatch = null;
              } else if (vereditoCil === 'segunda') {
                mismatch.message = `${mismatch.eye.toUpperCase()}: erro na 1ª leitura do cilindro — desempate (3ª leitura) concordou com a 2ª ("${mismatch.vCil}"). Refaça a captura.`;
              }
              // veredito nulo → mantém o bloqueio original
            }
          }

          // ── Cilindro que só a 2ª leitura não viu ───────────────────────────
          // 'hard' incondicional: uma verificação que devolve C=null derrubava a
          // 1ª mesmo com o cilindro impresso no ticket. É o modo de falha inverso
          // do já tratado logo abaixo (pCil null, vCil presente), e não tinha
          // recurso nenhum — nem o desempate de cilindro roda, porque ele exige
          // os DOIS valores. Log 2026-08-05 13:38: 1ª leu OD C=-1.25 x50 nas três
          // medições E na média, a leitura ampliada leu C=-1.25 x50 na mesma
          // linha, a 2ª não achou cilindro — captura bloqueada.
          // Testemunha da linha validada confirmando o C da 1ª ⇒ 2 contra 1.
          //
          // (A limitação de "só o primeiro olho era comparado" caiu na v5.4.4 —
          // o comparador agora devolve um veredito por olho e este laço passa
          // pelos dois.)
          if (mismatch && mismatch.isCylinderMissingInVerify) {
            const eyeData = processed.refracao[mismatch.eye];
            const conf = this._rowWitnesses(mismatch.eye, eyeData, _signsCandidates)
              .find(w => w.cil !== null && Math.abs(w.cil - mismatch.pCil) <= OCR_TOL.CIL_SOFT);
            if (conf) {
              const aviso = `${mismatch.eye.toUpperCase()}: 2ª chamada não encontrou cilindro, mas a leitura ampliada leu C=${conf.cil} na mesma linha e confirmou a 1ª (C=${mismatch.pCil}). Liberado — confira manualmente.`;
              this.logger.info('[OCR] ' + aviso);
              processed._avisos = processed._avisos || [];
              processed._avisos.push(aviso);
              resolvidoPorConferencia = true;
              mismatch = null;
            }
          }

          // ── Desempate de Eixo (3ª chamada focada) ──────────────
          // Eixo discordante é 'soft', mas a math-consistency (S+C/2≈SE) NÃO
          // envolve o eixo — então soft+math-ok jamais bloqueava e o eixo ia
          // NÃO-CONFERIDO ao prontuário (3 de 4 capturas, log 2026-07-21). Uma
          // 3ª leitura focada só na 3ª coluna (A) da MÉDIA desempata 2-de-3, como
          // já se faz para sinal e cilindro. Diferença crucial: quando o desempate
          // confirma a 2ª OU é inconclusivo, FORÇA bloqueio (severity='hard') — ao
          // contrário de S/C, o eixo não tem corroboração matemática que o resgate,
          // então "não pude confirmar" ⇒ "não injeta".
          if (mismatch && mismatch.isAxisMismatch && mismatch.pEixo != null && mismatch.vEixo != null) {
            const circ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 180 - d); };
            const eyeData = processed.refracao[mismatch.eye];
            let vereditoEixo = await this._tiebreakAxis(mismatch, await getFocusedParts(), apiService);

            // A chamada dedicada volta ilegível com frequência (3 de 3 no log
            // 2026-08-05). As leituras ampliadas do sinal já transcreveram A da
            // linha MÉDIA na mesma captura — quando a linha delas foi validada,
            // elas são o mesmo voto, de graça.
            if (!vereditoEixo) {
              for (const w of this._rowWitnesses(mismatch.eye, eyeData, _signsCandidates)) {
                if (w.eixo === null) continue;
                if (circ(w.eixo, mismatch.pEixo) <= OCR_TOL.EIXO_GRAUS) { vereditoEixo = 'primeira'; break; }
                if (circ(w.eixo, mismatch.vEixo) <= OCR_TOL.EIXO_GRAUS) { vereditoEixo = 'segunda'; break; }
              }
              if (vereditoEixo) this.logger.info(`[OCR] Eixo desempatado pela leitura ampliada — confirmou a ${vereditoEixo === 'primeira' ? '1ª' : '2ª'}.`);
            }

            // A MÉDIA da 1ª leitura é corroborada pelas MEDIÇÕES do próprio olho?
            // O TOPCON imprime a média das 3 medições: uma "média" que discorda de
            // 2 delas foi lida errado. Log 2026-08-05 13:33: OD medições 80/50/49
            // com "média" 75 — enquanto a 2ª leitura e a leitura ampliada liam 50.
            const medicoes = Array.isArray(eyeData?._eixoMedicoes) ? eyeData._eixoMedicoes : [];
            const apoiam = alvo => medicoes.filter(a => circ(a, alvo) <= OCR_TOL.EIXO_GRAUS).length;
            // vEixo vem de um parseInt cru da 2ª leitura — a faixa 1-180 que
            // _processEye impõe à 1ª precisa valer também para o valor adotado.
            const vEixoValido = mismatch.vEixo >= 1 && mismatch.vEixo <= 180;
            const mediaContradita = vEixoValido && medicoes.length >= 2 &&
              apoiam(mismatch.pEixo) < 2 && apoiam(mismatch.vEixo) >= 2;

            processed._avisos = processed._avisos || [];
            if (vereditoEixo === 'primeira') {
              processed._avisos.push(`${mismatch.eye.toUpperCase()}: 2ª chamada leu eixo diferente (1ª=${mismatch.pEixo}° vs 2ª=${mismatch.vEixo}°); desempate por 3ª leitura confirmou a 1ª. Confira manualmente.`);
              resolvidoPorConferencia = true;
              mismatch = null;
            } else if (vereditoEixo === 'segunda' && mediaContradita) {
              // Duas leituras independentes E as medições do próprio olho apontam
              // o mesmo eixo contra uma única fonte (a média da 1ª). Bloquear aqui
              // custa uma recaptura que tende a repetir o mesmo erro; corrigir tem
              // três testemunhas. O aviso registra a troca — não é injeção silenciosa.
              const aviso = `${mismatch.eye.toUpperCase()}: eixo corrigido de ${mismatch.pEixo}° para ${mismatch.vEixo}° — a 2ª leitura, a 3ª leitura e ${apoiam(mismatch.vEixo)} das ${medicoes.length} medições do ticket leem ${mismatch.vEixo}°. Confira manualmente.`;
              this.logger.warn('[OCR] ' + aviso);
              eyeData.eixo = mismatch.vEixo;
              processed._avisos.push(aviso);
              resolvidoPorConferencia = true;
              mismatch = null;
            } else {
              mismatch.severity = 'hard';
              mismatch.message = vereditoEixo === 'segunda'
                ? `${mismatch.eye.toUpperCase()}: eixo da 1ª leitura provavelmente errado — desempate (3ª leitura) concordou com a 2ª (${mismatch.vEixo}°). Refaça a captura.`
                : `${mismatch.eye.toUpperCase()}: eixo discordante entre leituras (1ª=${mismatch.pEixo}° vs 2ª=${mismatch.vEixo}°) e 3ª leitura não desempatou. Refaça a captura.`;
            }
          }

          if (mismatch) {
            // Política: se a discordância é 'soft' (numérica) E o olho da 1ª
            // leitura é matematicamente autoconsistente (S+C/2 ≈ S.E. com diff
            // ≤ 0.15D), trate como aviso — confia-se na 1ª leitura porque
            // alucinar 3 valores simultaneamente coerentes com a matemática é
            // raríssimo. Discordâncias 'hard' (null vs valor, olho ausente)
            // bloqueiam sempre.
            const eyeData = processed.refracao[mismatch.eye];
            const mathConsistent = this._isEyeMathConsistent(eyeData);
            const shouldBlock = mismatch.severity === 'hard' || !mathConsistent;

            processed._avisos = processed._avisos || [];
            if (shouldBlock) {
              // v5.4.0: bloqueia a REFRAÇÃO, não a captura. Tonometria e
              // paquimetria são outras seções do ticket e não têm relação com a
              // divergência de S/C/A (log 17:46: tono 15/17 e paqui 517/515 sem
              // conflito nenhum foram descartadas por causa do cilindro do OE).
              // v5.4.4: e bloqueia o OLHO, não os dois.
              this._failEye(processed, lado, mismatch.message);
              processed._avisos.push(mismatch.message);
              mismatchByEye[lado] = mismatch;
              bloqueou = true;
              break; // olho fora — as demais dimensões não têm mais o que salvar
            }
            const aviso = `${mismatch.message} (1ª leitura matematicamente consistente — não bloqueado, confira manualmente)`;
            processed._avisos.push(aviso);
          }
          // Divergência resolvida (descartada ou rebaixada a aviso): as demais
          // dimensões deste olho ainda não foram conferidas — v5.4.5.
          dimsResolvidas.push(_dimAtual);
          mismatch = this._compareEye(lado, processed.refracao?.[lado], verifyData?.[lado], dimsResolvidas);
          }
          // Guarda estourada com disputa viva: FALHA FECHADA. Sair daqui com
          // `mismatch` truthy e nada bloqueado injetaria um olho não conferido —
          // exatamente a classe de erro que este laço veio corrigir.
          if (!bloqueou && mismatch) {
            const motivo = `${lado.toUpperCase()}: a conferência não terminou (dimensões demais em disputa). Refaça a captura.`;
            this.logger.warn('[OCR] ' + motivo);
            this._failEye(processed, lado, motivo);
            processed._avisos.push(motivo);
            bloqueou = true;
            mismatchByEye[lado] = mismatch;
          }
          if (!bloqueou) mismatchByEye[lado] = null;
        }

        if (!houveDisputa && verifyOk && !resolvidoPorConferencia) {
          // Só afirma concordância se a 2ª chamada realmente respondeu — senão o
          // aviso de "não pôde ser concluída" (já empilhado) é o que vale.
          processed._avisos = processed._avisos || [];
          processed._avisos.push('Leituras independentes concordam com a 1ª.');
        }
      } catch (err) {
        this.logger.warn('[OCR] Conferência da refração falhou:', err.message);
        // Não bloqueia — registra aviso e segue. Falhar a conferência é diferente
        // de detectar discordância: pode ser erro de rede.
        processed._avisos = processed._avisos || [];
        processed._avisos.push('Conferência da refração não pôde ser concluída — confira manualmente.');
      }

      // Reconcilia o que ficou bloqueado nesta etapa: zera só a refração se
      // tono/paqui sobreviveram, ou marca a captura inteira se não sobrou nada.
      this._resolveBlocking(processed);
      processed.cid_refracao = (!processed._captureFailed && processed.refracao)
        ? this._inferCidRefracao(processed.refracao)
        : [];
    }

    // ── AUTO-RETRY: swap S↔C na 1ª leitura ──────────────────────────────
    // Quando todos os olhos são descartados por s=null mas o raw tinha
    // cilindro presente, o modelo confundiu colunas S↔C. Repetir o pipeline
    // completo (1ª call + verify) com as mesmas imagens restaura as garantias
    // de duas leituras independentes sem baixar a barra de segurança.
    // _isRetry previne recursão infinita se a 2ª tentativa também falhar.
    if (!_isRetry) {
      // Lê a marca gravada em _postProcessRefraction, não `processed.refracao`:
      // desde a v5.4.0 um bloqueio de refração zera esse objeto, o que apagaria
      // o gatilho da releitura automática.
      const _todosDescartados = processed._todosOlhosDescartados === true;
      const _rawTemCilSemEsfera = ['od', 'oe'].some(l => {
        const e = raw?.refracao?.[l];
        return e && e.media?.s == null && e.media?.c != null;
      });
      if (_todosDescartados && _rawTemCilSemEsfera) {
        this.logger.warn('[OCR] Swap S↔C detectado (s=null, c presente) — repetindo pipeline automaticamente...');
        const retry = await this.extractExams(imagesBase64, null, true, fullResImages);
        if (!retry._captureFailed && (retry.refracao?.od || retry.refracao?.oe)) {
          retry._avisos = retry._avisos || [];
          retry._avisos.unshift('Releitura automática (1ª chamada confundiu S↔C). Confira manualmente.');
          return retry;
        }
        this.logger.warn('[OCR] Releitura automática também falhou — retornando resultado original.');
      }
    }

    this.logger.info(
      `[OCR] ⏱ TOTAL da captura: ${_ms()}ms em ${this._chamadas} chamada(s) à API` +
      (this._chamadas > OCR_MAX_CHAMADAS ? ` ⚠ acima do orçamento de ${OCR_MAX_CHAMADAS}` : '')
    );
    this.logger.info('[OCR] Resultado final:\n' + JSON.stringify({
      refracao: processed.refracao,
      tonometria: processed.tonometria,
      paquimetria: processed.paquimetria,
      _avisos: processed._avisos,
      _captureFailed: processed._captureFailed,
      _refracaoBloqueada: processed._refracaoBloqueada === true,
      _refracaoReason: processed._refracaoReason || null,
      _reason: processed._reason
    }, null, 2));

    return processed;
  }

  /**
   * Prompt da 2ª chamada — focada APENAS em refração, com framing diferente
   * do prompt principal para minimizar chance de mesmo erro nas duas calls.
   */
  _getRefractionVerifyPrompt() {
    return `VERIFICAÇÃO INDEPENDENTE DE REFRAÇÃO.

Você está vendo um ticket TOPCON. Sua única tarefa é confirmar três valores por olho a partir da seção REF.DATA, mais o valor de S.E. para cross-check.

ESTRUTURA DAS COLUNAS — ORDEM FIXA E INVIOLÁVEL:
  1ª coluna (esquerda)  = S (esfera)
  2ª coluna (meio)      = C (cilindro)
  3ª coluna (direita)   = A (eixo)

Os marcadores <R> = OD e <L> = OE.

LAYOUT VERTICAL DE CADA OLHO (de cima para baixo):
  <N medições individuais> (pode haver 1, 2 ou 3 linhas de medições)
  MÉDIA        (3 valores: S, C, A)   ← É DAQUI que você lê s, c, a
  S.E. X.XX    (1 valor único)        ← É DAQUI que você lê se

⚠ ESTRATÉGIA OBRIGATÓRIA PARA ACHAR A MÉDIA (De baixo para cima):
A quantidade de medições varia. Se você tentar contar linhas de cima para baixo, VOCÊ VAI LER A LINHA ERRADA caso o ticket tenha menos de 3 medições. Siga estes passos de forma estrita:
  1. Primeiro localize visualmente a linha "S.E." (tem o rótulo literal "S.E.").
  2. A linha IMEDIATAMENTE ACIMA da S.E. é a MÉDIA. É dela que você tira s, c, a.
  3. Reporte também o valor da linha S.E. no campo "se" da resposta.
  4. SANITY CHECK ANTES DE ENVIAR: se o seu "s" for igual ao seu "se", você leu a linha errada. Volte uma linha acima e releia s.
  5. SANITY CHECK 2: se s, c, a foram lidos corretamente, deve valer s + c/2 ≈ se (tolerância 0.25D). Se não vale, releia.

⚠ 2º ERRO MAIS COMUM: inverter o SINAL da esfera (ler "+1.00" como "-1.00").
O sinal (+ ou −) está impresso explicitamente antes de cada valor da coluna S.
Leia o caractere de sinal como um passo separado: "+" tem traço vertical E horizontal;
"−" tem APENAS o horizontal (em impressão térmica o traço vertical pode sair fraco).
Hipermetropia (esfera positiva) é tão comum quanto miopia — NUNCA escolha o sinal
por expectativa clínica.

⚠ O campo "se" é TRANSCRIÇÃO LITERAL da linha "S.E." impressa — NUNCA cálculo.
Se você se pegar calculando s + c/2 para preencher "se", PARE: reporte o que está
IMPRESSO, ou null se a linha estiver ilegível. Um "se" calculado torna o cross-check
circular e inútil — ele só tem valor se for lido independentemente do papel.

⚠ REGRA INVIOLÁVEL — TROCA S↔C:
NUNCA decida qual coluna é S ou C pela magnitude. Um olho pode ter S=-0.25 e C=-3.75 (esfera pequena, cilindro grande) — isso é astigmatismo de alto grau, plenamente clínico. Respeite a ordem impressa da esquerda para direita.

Se uma célula está em branco (sem dígitos), retorne null.
Se o olho inteiro está ilegível, retorne null no lugar do objeto.
Se a coluna de cilindro mostra "0.00" ou "----", retorne null para c e a.

⚠ PLANO/PL NA ESFERA: O TOPCON imprime literalmente "PLANO" ou "PL" quando a esfera é 0.00.
Se você ler "PLANO" ou "PL" na coluna S, retorne "plano" — NUNCA "+0.25" ou qualquer número.

CYL: (-) entre as colunas é apenas marcador de convenção (TOPCON usa negativo). Ignore.
KRT.DATA (ceratometria) NÃO é refração. Ignore.

Retorne JSON PURO (sem markdown, sem comentários):
{
  "od": {"s": "string_com_sinal_ou_null", "c": numero_negativo_ou_null, "a": inteiro_ou_null, "se": "string_com_sinal_ou_null"},
  "oe": {"s": "string_com_sinal_ou_null", "c": numero_negativo_ou_null, "a": inteiro_ou_null, "se": "string_com_sinal_ou_null"}
}
`;
  }

  /**
   * Leitura AMPLIADA do sinal da esfera dos dois olhos — 3ª chamada.
   *
   * v5.4.0: roda em TODA captura (não só em disputa) e sobre o recorte
   * ampliado da REF.DATA. Devolve o JSON cru {od:{sinal,magnitude}, oe:{...}}
   * ou null se a chamada falhar. A interpretação fica em _sphereSignVerdict.
   */
  async _readSphereSigns(imageParts, apiService) {
    try {
      this.logger.info('[OCR] Leitura ampliada do sinal da esfera (3ª chamada)...');
      const { text } = await this._callApi(
        apiService, [{ text: this._getSphereSignTiebreakPrompt() }, ...imageParts],
        FOCUS_CONFIG, 'leitura ampliada do sinal'
      );
      const tie = _parseGeminiJSON(text, 'sinal_esfera');
      this.logger.info('[OCR] Sinal ampliado retornou: ' + JSON.stringify(tie));
      return (tie && typeof tie === 'object') ? tie : null;
    } catch (err) {
      this.logger.warn('[OCR] Leitura ampliada do sinal falhou:', err.message);
      return null;
    }
  }

  /**
   * A leitura ampliada serviu para alguma coisa? Basta UM olho com sinal legível
   * — o outro pode estar genuinamente ilegível no papel. Sem nenhum, a chamada
   * não produziu evidência e vale repetir com outros pixels (ticket inteiro).
   */
  /**
   * A leitura ampliada serve como voto?
   *
   * Sem `refracao`: critério histórico — basta um olho com o caractere +/−.
   * Com `refracao`: exige que esse olho esteja na LINHA CERTA (a magnitude bate
   * com a esfera da 1ª leitura). Um sinal legível da célula errada não é voto
   * sobre a esfera — ver _sphereSignVerdict.
   */
  _signsUsable(signs, refracao) {
    if (!signs || typeof signs !== 'object') return false;
    const temSinal = l => signs[l] && (signs[l].sinal === '+' || signs[l].sinal === '-');
    if (!refracao) return ['od', 'oe'].some(temSinal);
    return ['od', 'oe'].some(l =>
      temSinal(l) && this._sphereSignVerdict(refracao[l], signs[l]) !== 'ilegivel');
  }

  /**
   * Confronta a leitura ampliada do sinal com a esfera da 1ª leitura.
   * Retorna 'confirma' | 'contradiz' | 'ilegivel' | 'na' (não aplicável).
   *
   * A magnitude é guarda de sanidade: se a 3ª leitura reporta um número que não
   * é o mesmo em disputa, ela olhou outra célula e seu voto não vale.
   *
   * v5.4.5 — a tolerância era 0.25D, que é EXATAMENTE um passo dióptrico: o
   * valor da célula vizinha passava por "a mesma". Log 2026-08-05 19:40 (OE): a
   * leitura ampliada devolveu magnitude 0.50 (o cilindro -0.50) contra uma
   * esfera de +0.25 e foi aceita como voto sobre a esfera. Número impresso se lê
   * certo ou errado — não "por perto". Agora exige o mesmo valor (folga só para
   * ruído de formatação).
   */
  _sphereSignVerdict(eye, sign) {
    if (!eye || eye.esf == null) return 'na';
    const esfStr = String(eye.esf).toLowerCase();
    if (esfStr === 'plano') return 'na';           // esfera 0.00 não tem sinal
    const esf = parseFloat(esfStr);
    if (isNaN(esf) || esf === 0) return 'na';
    if (!sign || (sign.sinal !== '+' && sign.sinal !== '-')) return 'ilegivel';
    const mag = parseFloat(sign.magnitude);
    if (isNaN(mag) || Math.abs(mag - Math.abs(esf)) > OCR_TOL.LINHA_VALIDADA) return 'ilegivel';
    return sign.sinal === (esf >= 0 ? '+' : '-') ? 'confirma' : 'contradiz';
  }

  /**
   * Testemunhas de C e A extraídas das leituras ampliadas do sinal (v5.4.3).
   *
   * O prompt do sinal pede C e A da MESMA linha MÉDIA justamente como prova de
   * que o modelo está na linha certa. Aqui essa prova vira voto — mas só depois
   * de a linha ser VALIDADA: a magnitude da esfera precisa bater com a esfera da
   * 1ª leitura (±0.25D). Sem isso a leitura olhou outra célula e seus C/A não
   * valem nada (ver _describeSignMisread).
   *
   * Descarta ainda o lixo que a leitura ampliada às vezes devolve com a linha
   * certa — eixo "0.00"/fora de 1-180 e cilindro zero — porque um autorrefrator
   * não imprime nenhum dos dois. O voto precisa ser um NÚMERO LIDO, não um
   * preenchimento de campo.
   *
   * Retorna [{ cil, eixo }] — uma entrada por leitura cuja linha foi validada.
   */
  _rowWitnesses(lado, eye, candidates) {
    if (!eye || eye.esf == null || !Array.isArray(candidates)) return [];
    const esfStr = String(eye.esf).toLowerCase();
    const esfAbs = esfStr === 'plano' ? 0 : Math.abs(parseFloat(esfStr));
    if (isNaN(esfAbs)) return [];

    const out = [];
    for (const cand of candidates) {
      const s = cand?.[lado];
      if (!s || typeof s !== 'object') continue;
      const mag = parseFloat(s.magnitude);
      if (isNaN(mag) || Math.abs(mag - esfAbs) > OCR_TOL.LINHA_VALIDADA) continue;  // outra linha/célula (v5.4.5: 0.25 era um passo dióptrico inteiro)
      // Resposta de preenchimento, não leitura: no log 2026-08-05 uma das
      // chamadas devolveu {magnitude:"0.25", c:"0.25", a:"0.25"} — a mesma
      // string nas três colunas. Não é voto sobre nada.
      if (String(s.c) === String(s.magnitude) && String(s.a) === String(s.magnitude)) continue;
      const cil = this._parseCil(s.c);
      const eixoNum = this._parseEixo(s.a);
      const eixo = (eixoNum !== null && eixoNum >= 1 && eixoNum <= 180) ? eixoNum : null;
      out.push({ cil, eixo });
    }
    return out;
  }

  /**
   * Diagnóstico (só para o log) de POR QUE a 3ª leitura não valeu como voto.
   * "sinal ausente" pede pixels melhores; "magnitude = o eixo" prova que o
   * recorte apontou o olhar para a coluna errada — são consertos diferentes.
   */
  /**
   * Veredito de cilindro pelas testemunhas de linha validada (v5.4.4).
   *
   * Exige UNANIMIDADE: se uma testemunha confirma a 1ª e outra confirma a 2ª,
   * não há veredito — liberar contra uma testemunha de linha validada seria a
   * mesma assimetria que a v5.4.0 removeu da política de sinal. Caso real
   * 2026-08-05 18:30 (OD): recorte lê C=-0.50, ticket inteiro lê C=-1.25 →
   * empate → o bloqueio original permanece.
   */
  _cylinderWitnessVerdict(mismatch, eyeData, candidates) {
    let p = 0, s = 0;
    for (const w of this._rowWitnesses(mismatch.eye, eyeData, candidates)) {
      if (w.cil === null) continue;
      if (Math.abs(w.cil - mismatch.pCil) <= OCR_TOL.CIL_TESTEMUNHA) p++;
      else if (Math.abs(w.cil - mismatch.vCil) <= OCR_TOL.CIL_TESTEMUNHA) s++;
    }
    if (p > 0 && s === 0) {
      this.logger.info('[OCR] Cilindro desempatado pela leitura ampliada — confirmou a 1ª.');
      return 'primeira';
    }
    if (s > 0 && p === 0) {
      this.logger.info('[OCR] Cilindro desempatado pela leitura ampliada — confirmou a 2ª.');
      return 'segunda';
    }
    return null;
  }

  _describeSignMisread(eye, sign) {
    if (!sign || typeof sign !== 'object') return 'a 3ª leitura não devolveu este olho';
    if (sign.sinal !== '+' && sign.sinal !== '-') return `sinal ausente/ambíguo (magnitude lida: ${sign.magnitude ?? 'null'})`;
    const mag = parseFloat(sign.magnitude);
    if (isNaN(mag)) return 'magnitude não numérica';
    const esf = parseFloat(String(eye?.esf));
    const eixo = Number(eye?.eixo);
    const cil = Number(eye?.cil);
    if (!isNaN(eixo) && Math.abs(mag * 100 - eixo) < 1) return `magnitude "${sign.magnitude}" é o EIXO (${eixo}) — leu a 3ª coluna`;
    if (!isNaN(cil) && Math.abs(mag - Math.abs(cil)) <= 0.05) return `magnitude "${sign.magnitude}" é o CILINDRO (${cil}) — leu a 2ª coluna`;
    return `magnitude "${sign.magnitude}" ≠ esfera da 1ª leitura (${isNaN(esf) ? eye?.esf : esf}) — outra célula`;
  }

  /**
   * Política de sinal da esfera (v5.4.0) — substitui o fail-safe da v5.3.6.
   *
   * O QUE ESTAVA ERRADO: a v5.3.6 justificava "flip de sinal nunca é liberado
   * por voto" argumentando que o erro do "+" térmico é CORRELACIONADO entre
   * leituras — e, ao mesmo tempo, deixava passar sem checagem alguma toda
   * captura em que as duas chamadas CONCORDAVAM. Ou seja: usava como condição
   * de liberação exatamente a evidência que declarava não valer. A pilha só
   * enxergava discordância, então o erro correlacionado era invisível.
   * Log 2026-08-03: OD "+0.50" (S+C/2 = -0.125 = S.E. impresso -0.13) bloqueado
   * duas vezes; na 3ª captura as duas chamadas leram "-0.50", ninguém checou, e
   * H521-Miopia foi para a ficha. Qual das duas é a verdadeira não se decide
   * pelo log — a assimetria é que era o defeito.
   *
   * POLÍTICA NOVA (simétrica, sempre-ativa):
   *   1. A leitura AMPLIADA contradiz a 1ª em qualquer olho → bloqueia, haja
   *      disputa ou não. É isto que fecha o buraco do erro correlacionado.
   *   2. Havendo disputa 1ª vs 2ª (flip puro), libera SOMENTE se a ampliada
   *      confirmar a 1ª E a 1ª fechar S+C/2 ≈ S.E. impresso. Duas evidências
   *      independentes — uma óptica (pixels ampliados), outra aritmética.
   *   3. Ampliada ilegível + disputa → bloqueia (como antes).
   */
  async _applySignPolicy(processed, mismatchByEye, signs, signsCandidates) {
    processed._avisos = processed._avisos || [];
    mismatchByEye = mismatchByEye || { od: null, oe: null };

    // (1) Contradição direta da leitura ampliada — inclusive sem disputa.
    for (const lado of ['od', 'oe']) {
      const eye = processed.refracao?.[lado];
      const veredito = this._sphereSignVerdict(eye, signs?.[lado]);
      // Ilegível NÃO bloqueia por si só: bloquear a cada leitura ampliada
      // ruim recriaria a enxurrada de recapturas que a v5.4.0 veio corrigir.
      // Mas o médico precisa saber que o sinal ficou sem 3ª confirmação.
      if (veredito === 'ilegivel') {
        // Por que ficou ilegível não aparecia em lugar nenhum — e é a diferença
        // entre "o papel está ruim" e "o recorte levou o olhar para outra célula".
        this.logger.warn(`[OCR] ${lado.toUpperCase()}: 3ª leitura não confirmou o sinal — ${this._describeSignMisread(eye, signs?.[lado])}`);
        processed._avisos.push(`${lado.toUpperCase()}: a leitura ampliada não confirmou o sinal da esfera (${eye.esf}) — confira o "+/−" no ticket.`);
      }
      if (veredito === 'contradiz') {
        // v5.4.4 — A LEITURA AMPLIADA NÃO É UMA SÓ. getSigns() dispara DUAS
        // (recorte e ticket inteiro) e devolve uma vencedora; a perdedora era
        // descartada mesmo quando confirmava a 1ª. Log 2026-08-05 18:01, OE: a
        // 1ª, a 2ª e a leitura do ticket inteiro liam "+0.50"; só o recorte leu
        // "−", e o bloqueio saiu pela voz do dissidente solitário. Discordância
        // ENTRE as ampliadas é inconclusão, não contradição.
        if (this._signWitnessesConfirm(lado, eye, signsCandidates)) {
          const aviso = `${lado.toUpperCase()}: as duas leituras ampliadas discordaram entre si sobre o sinal da esfera (${eye.esf}) — uma confirmou a 1ª leitura. Não bloqueado; confira o "+/−" no ticket.`;
          this.logger.warn('[OCR] ' + aviso);
          processed._avisos.push(aviso);
          continue;
        }
        // Abaixo do piso clínico do CID determinístico (|0.50D|), inverter o
        // sinal não troca hipermetropia por miopia — não troca CID nenhum. A
        // justificativa do bloqueio ("H52.1 vs H52.0") simplesmente não se
        // aplica, e o preço era jogar fora cilindro, eixo, tono e paqui
        // conferidos (18:00/18:01/18:02: três capturas do mesmo ticket
        // bloqueadas por ±0.25D).
        if (this._signFlipIsCidNeutral(processed.refracao, lado)) {
          const aviso = `${lado.toUpperCase()}: leitura ampliada leu o sinal oposto da esfera (${eye.esf}), mas nesta magnitude o sinal não muda nenhum CID (piso de 0.50D). Não bloqueado; confira o "+/−" no ticket.`;
          this.logger.warn('[OCR] ' + aviso);
          processed._avisos.push(aviso);
          continue;
        }
        const msg = `${lado.toUpperCase()}: a leitura ampliada leu o sinal da esfera como "${signs[lado].sinal}" e a 1ª leitura registrou "${eye.esf}". Sinal invertido troca miopia por hipermetropia (H52.1 vs H52.0) — refaça a captura.`;
        this.logger.warn('[OCR] ' + msg);
        mismatchByEye[lado] = { eye: lado, severity: 'hard', signFlip: true, message: msg };
      }
    }

    // (2)/(3) Disputa de sinal entre 1ª e 2ª leituras.
    for (const lado of ['od', 'oe']) {
      const mismatch = mismatchByEye[lado];
      // pEsfStr só existe na disputa 1ª vs 2ª; mismatches criados pela regra (1)
      // acima já passaram pelos mesmos testes e não são reprocessados aqui.
      if (!mismatch || !mismatch.signFlip || mismatch.pEsfStr == null) continue;
      const eye = processed.refracao?.[lado];
      const veredito = this._sphereSignVerdict(eye, signs?.[lado]);
      const mathOk = this._isEyeMathConsistent(eye);

      if (veredito === 'confirma' && mathOk) {
        processed._avisos.push(
          `${lado.toUpperCase()}: 2ª chamada leu sinal oposto (1ª="${mismatch.pEsfStr}" vs 2ª="${mismatch.vEsfStr}"); a leitura ampliada confirmou a 1ª e S+C/2 fecha com o S.E. impresso. Liberado — confira o sinal no ticket.`
        );
        mismatchByEye[lado] = null;
        continue;
      }
      // Mesmo raciocínio do piso clínico, agora na disputa 1ª vs 2ª: sem CID em
      // jogo, a recaptura obrigatória cobra caro por 0.5D que ninguém codifica.
      if (this._signFlipIsCidNeutral(processed.refracao, lado)) {
        const aviso = `${lado.toUpperCase()}: sinal da esfera discordante (1ª="${mismatch.pEsfStr}" vs 2ª="${mismatch.vEsfStr}"), mas nesta magnitude o sinal não muda nenhum CID (piso de 0.50D). Não bloqueado; confira o "+/−" no ticket.`;
        this.logger.warn('[OCR] ' + aviso);
        processed._avisos.push(aviso);
        mismatchByEye[lado] = null;
        continue;
      }
      mismatch.message = veredito === 'confirma'
        ? `${lado.toUpperCase()}: sinal da esfera discordante (1ª="${mismatch.pEsfStr}" vs 2ª="${mismatch.vEsfStr}"); a leitura ampliada confirmou a 1ª, mas S+C/2 não fecha com o S.E. impresso — sem a segunda evidência, refaça a captura.`
        : `${lado.toUpperCase()}: sinal da esfera discordante (1ª="${mismatch.pEsfStr}" vs 2ª="${mismatch.vEsfStr}") e a leitura ampliada não foi legível. Refaça a captura.`;
    }

    return mismatchByEye;
  }

  /**
   * Alguma das leituras ampliadas (recorte E ticket inteiro) confirma o sinal
   * da 1ª leitura, na linha validada? Ver _rowWitnesses para o critério de
   * validação da linha (magnitude ≈ |esfera| ±0.25D).
   */
  _signWitnessesConfirm(lado, eye, candidates) {
    if (!Array.isArray(candidates)) return false;
    return candidates.some(c => this._sphereSignVerdict(eye, c?.[lado]) === 'confirma');
  }

  /**
   * Inverter o sinal da esfera deste olho mudaria algum CID determinístico?
   *
   * _inferCidRefracao só codifica H52.0/H52.1 a partir de |0.50D| (piso clínico
   * da v5.4.0) — abaixo disso o sinal é indiferente ao diagnóstico. A resposta
   * é calculada, não estimada: roda o inferidor nos dois cenários e compara,
   * o que também cobre a anisometropia (H52.3), cuja fronteira de 1.50D o
   * deslocamento de S.E. poderia atravessar.
   */
  _signFlipIsCidNeutral(refracao, lado) {
    const eye = refracao?.[lado];
    if (!eye) return false;
    const esfStr = String(eye.esf ?? '').toLowerCase();
    const esf = esfStr === 'plano' ? 0 : parseFloat(esfStr);
    if (isNaN(esf) || esf === 0) return false;
    const cil = eye.cil != null ? parseFloat(eye.cil) : 0;
    const flipped = {
      ...refracao,
      [lado]: {
        ...eye,
        esf: (-esf).toFixed(2),
        se: (-esf + (isNaN(cil) ? 0 : cil) / 2).toFixed(2)
      }
    };
    const antes = this._inferCidRefracao(refracao).slice().sort().join('|');
    const depois = this._inferCidRefracao(flipped).slice().sort().join('|');
    return antes === depois;
  }

  _getSphereSignTiebreakPrompt() {
    return `LEITURA DO SINAL DA ESFERA — TAREFA ÚNICA E MÍNIMA.

Você vê um ticket TOPCON — possivelmente um RECORTE AMPLIADO da seção REF.DATA,
onde o cabeçalho "REF.DATA" e as demais seções podem não aparecer. Isso é
esperado: oriente-se pelos marcadores <R> (olho direito) e <L> (olho esquerdo)
e pelas linhas "S.E.".
Em cada bloco, localize a linha MÉDIA: a linha em negrito imediatamente ACIMA da linha "S.E.".

Sua tarefa PRINCIPAL: para cada olho, transcrever o PRIMEIRO valor dessa linha MÉDIA
(coluna S, a mais à esquerda), separando o CARACTERE DE SINAL da MAGNITUDE.

Transcreva TAMBÉM, da MESMA linha MÉDIA, a 2ª coluna (C, cilindro) e a 3ª coluna
(A, eixo). Elas não são o objetivo — servem para provar que você está na linha
certa. Se não conseguir lê-las, retorne null nelas; NÃO troque de linha para
preenchê-las e NUNCA use o eixo (número inteiro, 0-180) como magnitude da esfera.

Examine o caractere de sinal com máxima atenção:
  • "+" tem um traço VERTICAL e um horizontal.
  • "−" tem APENAS o traço horizontal.
  • Em impressão térmica o traço vertical do "+" pode sair fraco — olhe de perto.
  • NÃO use plausibilidade clínica para decidir: hipermetropia (+) e miopia (−) são ambas comuns.

Se o sinal estiver ilegível ou ambíguo, retorne null no campo "sinal". Não chute.

Responda APENAS JSON puro (sem markdown):
{"od": {"sinal": "+", "magnitude": "1.00", "c": "-0.50", "a": "139"},
 "oe": {"sinal": "-", "magnitude": "0.75", "c": "-2.50", "a": "77"}}
`;
  }

  /**
   * Desempate de Cilindro — 3ª chamada hiperfocada.
   */
  async _tiebreakCylinder(mismatch, imageParts, apiService) {
    try {
      this.logger.info(`[OCR] Desempate de Cilindro (3ª chamada) para ${mismatch.eye.toUpperCase()}...`);
      const { text } = await this._callApi(
        apiService, [{ text: this._getCylinderTiebreakPrompt() }, ...imageParts],
        FOCUS_CONFIG, `desempate de cilindro (${mismatch.eye.toUpperCase()})`
      );
      const tie = _parseGeminiJSON(text, 'tiebreak_cil');
      const t = tie?.[mismatch.eye];
      if (t === undefined || t === null) {
        this.logger.warn('[OCR] Desempate de cilindro não retornou leitura legível');
        return null;
      }
      
      // v5.5.0 — NORMALIZAR O SINAL antes de comparar. `pCil`/`vCil` já passaram
      // por _parseCil (convenção negativa do TOPCON), mas aqui a leitura entrava
      // crua: uma 3ª leitura devolvendo "0.50" — formato que o PRÓPRIO prompt
      // principal documenta como válido ("se imprime 0.50 sem sinal, é -0.50") —
      // era comparada contra -0.50 e virava "3º valor diferente". Desempate
      // certo, chamada gasta, disputa registrada como inconclusiva.
      //
      // A normalização é feita aqui em vez de por _parseCil porque este ponto
      // precisa preservar o ZERO: nesta disputa os dois lados têm cilindro, então
      // um "0.00" lido é um terceiro valor (inconclusivo), não "sem cilindro".
      const bruto = t === "null" ? null : parseFloat(t);
      if (bruto !== null && isNaN(bruto)) return null;
      const vCil = bruto === null ? null : (bruto > 0 ? -bruto : bruto);
      // Ilegível, não "terceiro valor": a disputa só chega aqui com pCil e vCil
      // presentes, então um null é o modelo dizendo que não leu — o log dizia
      // "retornou um 3º valor diferente: null" e mandava procurar um valor que
      // não existe.
      if (vCil === null) {
        this.logger.warn('[OCR] Desempate de Cilindro não legível (o recorte é o mesmo que já falhou na leitura do sinal)');
        return null;
      }

      // Se leu igual a pCil, a primeira estava certa
      if (vCil === mismatch.pCil || (vCil !== null && mismatch.pCil !== null && Math.abs(vCil - mismatch.pCil) < 0.01)) {
        this.logger.info(`[OCR] Desempate de Cilindro retornou "${vCil}" (Confirmou a 1ª)`);
        return 'primeira';
      }
      
      // Se leu igual a vCil, a segunda estava certa
      if (vCil === mismatch.vCil || (vCil !== null && mismatch.vCil !== null && Math.abs(vCil - mismatch.vCil) < 0.01)) {
        this.logger.info(`[OCR] Desempate de Cilindro retornou "${vCil}" (Confirmou a 2ª)`);
        return 'segunda';
      }

      this.logger.warn(`[OCR] Desempate de Cilindro retornou um 3º valor diferente: ${vCil} (Disputa era ${mismatch.pCil} vs ${mismatch.vCil})`);
      return null;
    } catch (err) {
      this.logger.warn('[OCR] Desempate de Cilindro falhou:', err.message);
      return null;
    }
  }

  _getCylinderTiebreakPrompt() {
    return `DESEMPATE DE CILINDRO — TAREFA ÚNICA E MÍNIMA.

Você vê um ticket TOPCON — possivelmente um RECORTE AMPLIADO da seção REF.DATA.
Oriente-se pelos marcadores <R> (olho direito) e <L> (olho esquerdo).

Sua ÚNICA tarefa: para cada olho, identificar a linha da MÉDIA e ler EXCLUSIVAMENTE O SEGUNDO NÚMERO (Coluna do Meio - Cilindro).
NÃO conte as linhas de cima para baixo. A linha MÉDIA é a linha em negrito que fica IMEDIATAMENTE ACIMA da linha que diz "S.E.".

Leia apenas a coluna do meio (C). Se o valor estiver vazio, em branco, ou ausente, retorne a string "null".

Responda APENAS JSON puro (sem markdown). Exemplo de formato:
{"od": "-0.50", "oe": "-3.00"}
`;
  }

  /**
   * Desempate de Eixo — 3ª chamada hiperfocada.
   *
   * Disparada quando 1ª e 2ª discordam do eixo (>8°, circular). Lê APENAS a 3ª
   * coluna (A) da linha MÉDIA. Comparação circular (1° ≡ 180°). O valor da 3ª
   * leitura precisa bater com a 1ª OU a 2ª (±8°); um 3º valor diferente é
   * inconclusivo. Retorna 'primeira' | 'segunda' | null.
   */
  async _tiebreakAxis(mismatch, imageParts, apiService) {
    try {
      this.logger.info(`[OCR] Desempate de Eixo (3ª chamada) para ${mismatch.eye.toUpperCase()}...`);
      const { text } = await this._callApi(
        apiService, [{ text: this._getAxisTiebreakPrompt() }, ...imageParts],
        FOCUS_CONFIG, `desempate de eixo (${mismatch.eye.toUpperCase()})`
      );
      const tie = _parseGeminiJSON(text, 'tiebreak_eixo');
      const t = tie?.[mismatch.eye];
      if (t === undefined || t === null || t === 'null') {
        this.logger.warn('[OCR] Desempate de Eixo não retornou leitura legível');
        return null;
      }
      const tEixo = parseInt(t, 10);
      if (isNaN(tEixo)) return null;
      const circ = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 180 - d); };
      if (circ(tEixo, mismatch.pEixo) <= OCR_TOL.EIXO_GRAUS) {
        this.logger.info(`[OCR] Desempate de Eixo retornou ${tEixo}° (confirmou a 1ª)`);
        return 'primeira';
      }
      if (circ(tEixo, mismatch.vEixo) <= OCR_TOL.EIXO_GRAUS) {
        this.logger.info(`[OCR] Desempate de Eixo retornou ${tEixo}° (confirmou a 2ª)`);
        return 'segunda';
      }
      this.logger.warn(`[OCR] Desempate de Eixo retornou um 3º valor: ${tEixo}° (disputa era ${mismatch.pEixo}° vs ${mismatch.vEixo}°) — inconclusivo`);
      return null;
    } catch (err) {
      this.logger.warn('[OCR] Desempate de Eixo falhou:', err.message);
      return null;
    }
  }

  _getAxisTiebreakPrompt() {
    return `DESEMPATE DE EIXO — TAREFA ÚNICA E MÍNIMA.

Você vê um ticket TOPCON — possivelmente um RECORTE AMPLIADO da seção REF.DATA.
Oriente-se pelos marcadores <R> (olho direito) e <L> (olho esquerdo).

Sua ÚNICA tarefa: para cada olho, identificar a linha da MÉDIA e ler EXCLUSIVAMENTE O TERCEIRO NÚMERO (Coluna da Direita — Eixo/A).
NÃO conte as linhas de cima para baixo. A linha MÉDIA é a linha em negrito que fica IMEDIATAMENTE ACIMA da linha que diz "S.E.".

O eixo é um inteiro de 1 a 180, SEM sinal. Se a coluna estiver vazia, em branco, ou ausente, retorne a string "null".

Responda APENAS JSON puro (sem markdown). Exemplo de formato:
{"od": 84, "oe": 64}
`;
  }

  /**
   * Checa se o olho da 1ª leitura é matematicamente autoconsistente:
   * esf, cil e se todos presentes e |esf + cil/2 - se| <= 0.15D.
   *
   * Quando um olho passa nessa checagem, é evidência forte de que a 1ª leitura
   * leu corretamente os 3 valores (alucinar três números simultaneamente
   * coerentes com a matemática é raríssimo). Nesse caso, discordâncias da
   * verificação independente em S/C/A são tratadas como aviso, não bloqueio.
   */
  _isEyeMathConsistent(eye) {
    if (!eye) return false;
    if (eye.se == null || eye.esf == null) return false;
    const esf = String(eye.esf).toLowerCase() === 'plano' ? 0 : parseFloat(eye.esf);
    const cil = eye.cil != null ? parseFloat(eye.cil) : 0;
    const se = parseFloat(eye.se);
    if (isNaN(esf) || isNaN(se)) return false;
    const seCalc = esf + cil / 2;
    return Math.abs(seCalc - se) <= OCR_TOL.MATH_CONSISTENT;
  }

  /**
   * Compara refração da 1ª call (pós-processada) com a 2ª call de verificação.
   * Retorna { eye, message, severity } descrevendo a discordância, ou null.
   *
   * Severidade:
   *   - 'hard'  → sempre bloqueia (null vs valor significativo, olho ausente,
   *               discordância de ESFERA sem assinatura de erro da 2ª).
   *   - 'soft'  → bloqueia, exceto se o olho da 1ª for matematicamente
   *               autoconsistente (S+C/2 ≈ S.E.). Nesse caso, o caller
   *               converte em aviso. Aplica-se a CIL, EIXO, e ao caso
   *               específico de "2ª chamada confundiu linha S.E. com esfera"
   *               (ver bloco abaixo).
   *
   * Tolerâncias:
   *   - Esfera: ±0.30D — mismatch acima é 'hard', EXCETO quando há
   *     assinatura clara de erro da 2ª chamada (s reportado pela 2ª bate
   *     com SE da 1ª e/ou com seu próprio se reportado). Esse caso vira
   *     'soft' e só passa se a 1ª for math-consistent.
   *   - Cilindro: ±0.30D (null vs valor significativo é hard; valor vs valor é soft)
   *   - Eixo: ±8° (com tratamento circular: 1° e 180° são adjacentes)
   */
  _compareRefractionAgainstVerify(processed, verify) {
    const porOlho = this._compareEyesAgainstVerify(processed, verify);
    return porOlho.od || porOlho.oe || null;
  }

  /**
   * Conferência POR OLHO (v5.4.4).
   *
   * _compareRefractionAgainstVerify devolvia só o PRIMEIRO mismatch e o bloqueio
   * zerava a refração inteira — então uma divergência no OD levava junto um OE
   * que as duas leituras (e a ampliada) tinham confirmado. Log 2026-08-05: em 4
   * das 6 capturas bloqueadas a disputa era de um olho só. Comparar os dois
   * sempre é o que permite bloquear só o olho culpado.
   */
  _compareEyesAgainstVerify(processed, verify) {
    const out = { od: null, oe: null };
    if (!verify || typeof verify !== 'object') return out; // sem verificação válida — não bloqueia
    if (!processed) return out;
    for (const lado of ['od', 'oe']) {
      out[lado] = this._compareEye(lado, processed[lado], verify[lado]);
    }
    return out;
  }

  /**
   * Resgata olho reprovado pelo cross-check de S.E. da 1ª leitura quando a 2ª
   * chamada independente confirma exatamente S, C e A da 1ª leitura e fecha a
   * conta S + C/2 ≈ S.E. (ou quando o S.E. da 1ª teve apenas inversão de sinal
   * e tanto a 2ª chamada quanto a leitura ampliada confirmam S, C e A).
   *
   * Caso real 2026-11-09 (pós-dilatação): 1ª leitura leu OD +0.75 -2.00 x170
   * nas 3 medições e na média, mas leu S.E. "+0.25" em vez de "-0.25" (flip de
   * sinal na linha S.E.). A 2ª leitura leu +0.75 -2.00 x170 com S.E. "-0.25" e
   * as leituras ampliadas (#3 e #4) confirmaram "+0.75 -2.00 x170". Sem este
   * resgate, o olho era descartado antes da verificação e ainda gerava falso
   * erro de "1ª leitura disse olho ausente".
   */
  _rescueEyesFailedBySE(processed, verify, signsCandidates = null) {
    if (!processed || !processed._olhosFalhosPorSE || !verify || typeof verify !== 'object') {
      return false;
    }
    let resgatou = false;
    for (const lado of ['od', 'oe']) {
      const falho = processed._olhosFalhosPorSE[lado];
      const v = verify[lado];
      if (!falho || !falho.eye || !v || typeof v !== 'object' || v.s == null) continue;

      const eye = falho.eye;
      const pEsf = String(eye.esf).toLowerCase() === 'plano' ? 0 : parseFloat(eye.esf);
      const vEsfStr = String(v.s).toLowerCase().trim();
      const vEsf = /^(plano|pl)$/.test(vEsfStr) ? 0 : parseFloat(vEsfStr);
      if (isNaN(pEsf) || isNaN(vEsf) || Math.abs(pEsf - vEsf) > 0.01) continue;
      if (pEsf !== 0 && (pEsf > 0) !== (vEsf > 0)) continue;

      const pCil = eye.cil != null ? parseFloat(eye.cil) : null;
      const vCil = this._parseCil(v.c);
      if ((pCil === null) !== (vCil === null)) continue;
      if (pCil !== null && Math.abs(pCil - vCil) > 0.01) continue;

      const vSeStr = v.se != null ? String(v.se).toLowerCase().trim() : null;
      const vSe = vSeStr != null ? (/^(plano|pl)$/.test(vSeStr) ? 0 : parseFloat(vSeStr)) : NaN;
      const seCalc = falho.seCalculado;
      const verifySeOk = !isNaN(vSe) && Math.abs(vSe - seCalc) <= OCR_TOL.MATH_CONSISTENT;

      const se1SignFlip = seCalc !== 0 && Math.abs(falho.seNum + seCalc) <= OCR_TOL.MATH_CONSISTENT;
      const ampliadaConfirma = Array.isArray(signsCandidates) &&
        this._signWitnessesConfirm(lado, eye, signsCandidates);

      if (!verifySeOk && !(se1SignFlip && ampliadaConfirma)) continue;

      const seCorrigido = verifySeOk
        ? String(v.se)
        : (seCalc >= 0 ? `+${seCalc.toFixed(2)}` : seCalc.toFixed(2));
      const candidateEye = { ...eye, se: seCorrigido };

      if (this._compareEye(lado, candidateEye, v) !== null) continue;

      processed.refracao = processed.refracao || { od: null, oe: null };
      processed.refracao[lado] = candidateEye;
      delete processed._olhosFalhosPorSE[lado];
      if (processed._olhosBloqueados) {
        delete processed._olhosBloqueados[lado];
        if (Object.keys(processed._olhosBloqueados).length === 0) {
          delete processed._olhosBloqueados;
        }
      }
      processed._refracaoBloqueada = false;
      processed._refracaoReason = null;
      processed._captureFailed = false;
      processed._blockAutoInject = false;
      processed._reason = null;

      processed._avisos = (processed._avisos || []).filter(a =>
        a !== falho.avisoCil &&
        a !== falho.motivo &&
        !a.includes(falho.motivo)
      );
      const avisoResgate = `${lado.toUpperCase()}: S.E. da 1ª leitura (${eye.se}) divergia de S+C/2 (${seCalc.toFixed(2)}), mas a 2ª leitura confirmou S=${eye.esf}, C=${eye.cil ?? 'null'}, A=${eye.eixo ?? 'null'}° com S.E.=${seCorrigido}. Olho preservado — confira no ticket.`;
      this.logger.info('[OCR] ' + avisoResgate);
      processed._avisos.push(avisoResgate);
      processed._validationWarnings = processed._avisos.slice();
      processed._resgatouPorSE = true;
      resgatou = true;
    }
    return resgatou;
  }

  /**
   * @param {string[]} skipDims dimensões já julgadas neste olho ('esfera',
   *   'cilindro', 'eixo'). Existe porque um veredito devolvido — e depois
   *   descartado pelo caller — ESCONDIA as dimensões seguintes: o comparador
   *   devolve uma por vez. Log 2026-08-05 19:40 (OD): a esfera foi liberada pelo
   *   piso do CID e o cilindro (1ª=-0.50 vs 2ª=-1.50, Δ=1.00D) nunca chegou a
   *   ser conferido — a leitura da 1ª foi injetada com o cilindro alucinado.
   */
  _compareEye(lado, p, v, skipDims = []) {
    {
      // Ambos null: tudo bem
      if (!p && !v) return null;

      // Discordância de presença/ausência do olho
      if (!p && v && (v.s != null || v.c != null)) {
        return { eye: lado, dim: 'presenca', severity: 'hard', message: `${lado.toUpperCase()}: 1ª leitura disse "olho ausente" mas verificação encontrou valores (${JSON.stringify(v)}). Refaça a captura.` };
      }
      if (p && !v) return null; // verificação não conseguiu — não é evidência de erro na 1ª

      // ── Esfera ──
      // Discordância de esfera é 'hard' por padrão: quando o modelo alucina S
      // na 1ª, ele costuma alucinar S.E. coerente, e só o verify externo
      // distingue verdade de coerência interna.
      //
      // EXCEÇÃO — "verify confundiu S.E. com esfera":
      // Quando a 2ª chamada desce uma linha e lê a S.E. como se fosse a
      // esfera, ela retorna um valor que bate com o SE da 1ª (ou com seu
      // próprio "se" reportado). Esse é um modo de falha observado e
      // documentado da 2ª chamada (prompt frágil quando a média não está
      // em negrito visível). Quando a assinatura aparece E a 1ª é
      // math-consistent (S+C/2 ≈ S.E.), confiamos na 1ª: a mismatch vira
      // 'soft' e o caller a degrada para aviso.
      const pEsfStr = p.esf != null ? String(p.esf).toLowerCase() : p.esf;
      const vEsfStr = v?.s != null ? String(v.s).toLowerCase() : v?.s;
      const pEsf = pEsfStr === 'plano' ? 0 : parseFloat(pEsfStr);
      const vEsf = vEsfStr === 'plano' ? 0 : parseFloat(vEsfStr);
      if (!isNaN(pEsf) && !isNaN(vEsf) && !skipDims.includes('esfera')) {
        if (Math.abs(pEsf - vEsf) > OCR_TOL.ESFERA_DIFF) {
          const pSeStr = p.se != null ? String(p.se).toLowerCase() : p.se;
          const vSeStr = v?.se != null ? String(v.se).toLowerCase() : v?.se;
          const pSe = pSeStr === 'plano' ? 0 : (pSeStr != null ? parseFloat(pSeStr) : NaN);
          const vSe = vSeStr === 'plano' ? 0 : (vSeStr != null ? parseFloat(vSeStr) : NaN);

          // (a) esfera e SE da 1ª são distinguíveis (cilindro significativo)
          const esfSeDistinguivel = !isNaN(pSe) && Math.abs(pEsf - pSe) > 0.20;
          // (b) verify.s bate com SE da 1ª (verify leu uma linha abaixo)
          const verifyBateComSe1 = !isNaN(pSe) && Math.abs(vEsf - pSe) <= OCR_TOL.MATH_CONSISTENT;
          // (c) verify se auto-contradiz: reportou s == se (leu mesma célula 2x)
          const verifyAutoConfuso = !isNaN(vSe) && Math.abs(vEsf - vSe) <= OCR_TOL.MATH_CONSISTENT;
          // (d) a 1ª leitura é matematicamente coerente
          const mathOk = this._isEyeMathConsistent(p);

          const assinaturaErroVerify = esfSeDistinguivel && (verifyBateComSe1 || verifyAutoConfuso);

          if (assinaturaErroVerify && mathOk) {
            const evidencia = [];
            if (verifyBateComSe1) evidencia.push(`s da 2ª (${vEsfStr}) bate com S.E. da 1ª (${pSeStr})`);
            if (verifyAutoConfuso) evidencia.push(`2ª reportou s=${vEsfStr} e se=${vSeStr} (iguais)`);
            return { eye: lado, dim: 'esfera', severity: 'soft', message: `${lado.toUpperCase()}: 2ª chamada provavelmente leu linha S.E. como esfera (${evidencia.join('; ')}); 1ª leitura é internamente coerente (S+C/2≈S.E.). Confira manualmente.` };
          }

          // Flip puro de sinal (+1.00 vs -1.00): mesma magnitude, sinais
          // opostos. O caller dispara desempate por 3ª chamada nesse caso.
          const signFlip = pEsf !== 0 && Math.abs(pEsf + vEsf) < 0.01;

          // ── (e) A 2ª leitura contradiz a PRÓPRIA aritmética ────────────────
          // Testemunha que se auto-refuta não tem peso para derrubar uma 1ª
          // leitura coerente. Se o trio (s, c, se) da verificação não fecha
          // s + c/2 ≈ se, ela leu célula errada em algum ponto — e o único
          // motivo de a 1ª estar bloqueada é a palavra dessa leitura quebrada.
          // Generaliza (b)/(c), que só pegavam a assinatura estreita de "verify
          // desceu uma linha"; aqui basta que a 2ª seja internamente incoerente.
          //
          // ESCOPO DELIBERADAMENTE ESTREITO — exige as três condições:
          //   !signFlip  → flip puro de sinal NUNCA é liberado por esta via; a
          //                política de recaptura obrigatória (caso 2026-07-24)
          //                continua intacta, mesmo com a 2ª incoerente.
          //   mathOk     → a 1ª precisa fechar S+C/2≈S.E. por conta própria.
          //   > 0.30D    → mesma tolerância do cross-check de _postProcessRefraction.
          //
          // Caso real 2026-07-29 (pós-dilatação): 1ª leu OD -1.75 -2.00 x174,
          // S.E. -2.75 (exato); a 2ª leu s="+2.00" c=-2 se="1.75" — que exigiria
          // S.E.=+1.00. Não era flip puro (|-1.75 + 2.00| = 0.25), então nem o
          // desempate rodava, e a captura correta foi bloqueada 5×. NÃO se aplica
          // ao cilindro: em 18:27 a 1ª era coerente E errada (c=-0.5 vs -2.5 real),
          // prova de que coerência interna não é prova de acerto.
          if (!signFlip && mathOk) {
            const vCilNum = v?.c != null ? parseFloat(v.c) : NaN;
            if (!isNaN(vSe) && !isNaN(vCilNum)) {
              const vSeCalc = vEsf + vCilNum / 2;
              const vDiff = Math.abs(vSe - vSeCalc);
              if (vDiff > OCR_TOL.SE_CROSSCHECK) {
                return { eye: lado, dim: 'esfera', severity: 'soft', message: `${lado.toUpperCase()}: 2ª leitura é internamente incoerente (s=${vEsfStr}, c=${vCilNum} ⇒ S.E. esperado ${vSeCalc.toFixed(2)}, mas reportou ${vSeStr} — erro de ${vDiff.toFixed(2)}D); 1ª leitura fecha S+C/2≈S.E. Confira manualmente.` };
              }
            }
          }

          return { eye: lado, dim: 'esfera', severity: 'hard', signFlip, pEsf, vEsf, pEsfStr, vEsfStr, message: `${lado.toUpperCase()}: esfera discordante entre leituras (1ª="${pEsfStr}" vs 2ª="${vEsfStr}"). Refaça a captura.` };
        }
      } else if (!isNaN(pEsf) && isNaN(vEsf) && vEsfStr != null && !skipDims.includes('esfera')) {
        return { eye: lado, dim: 'esfera', severity: 'hard', message: `${lado.toUpperCase()}: esfera da 2ª leitura não pôde ser interpretada ("${vEsfStr}"). Refaça a captura.` };
      }

      // ── Cilindro descartado por eixo ausente na 1ª leitura ──
      // O olho já foi reduzido a esférico puro de propósito. Divergência de
      // cilindro/eixo com a verificação é esperada (a 2ª leitura pode até achar
      // o cilindro), mas não deve bloquear: ambas concordam na esfera e só o
      // astigmatismo — sem eixo — é não-injetável. A esfera já foi conferida.
      if (p._cilDescartadoPorEixo) return null;

      // ── Cilindro ──
      const pCil = p?.cil != null ? parseFloat(p.cil) : null;
      const vCil = v?.c != null ? parseFloat(v.c) : null;
      const pulaCil = skipDims.includes('cilindro');
      // null vs valor significativo (>0.30D) → soft: deixa math-consistency decidir.
      // Quando 1ª leu sem cilindro e S≈SE (math-consistent), a verificação
      // provavelmente alucionou o cilindro — modo de falha documentado em tickets
      // sem astigmatismo. Hard bloquearia injeções corretas sistematicamente.
      if (!pulaCil && pCil === null && vCil !== null && !isNaN(vCil) && Math.abs(vCil) > OCR_TOL.CIL_SOFT) {
        return { eye: lado, dim: 'cilindro', severity: 'soft', message: `${lado.toUpperCase()}: 1ª leitura disse "sem cilindro" mas verificação leu C=${vCil}. Refaça a captura.` };
      }
      if (!pulaCil && pCil !== null && (vCil === null || isNaN(vCil)) && Math.abs(pCil) > OCR_TOL.CIL_SOFT) {
        return { eye: lado, dim: 'cilindro', severity: 'hard', isCylinderMissingInVerify: true, pCil, message: `${lado.toUpperCase()}: 1ª leitura disse C=${pCil} mas verificação não encontrou cilindro. Refaça a captura.` };
      }
      // Ambos valores: divergência >0.50D é hard (sempre bloqueia);
      // divergência 0.30-0.50D é soft (bloqueia se não math-consistent).
      // Razão: o Gemini pode alucinar cilindro E SE coerente entre si,
      // enganando a math-consistency. Divergência grande entre chamadas
      // é evidência externa que não pode ser ignorada.
      if (!pulaCil && pCil !== null && vCil !== null && !isNaN(vCil)) {
        const cilDiff = Math.abs(pCil - vCil);
        if (cilDiff > OCR_TOL.CIL_HARD) {
          return { eye: lado, dim: 'cilindro', severity: 'hard', isCylinderMismatch: true, pCil, vCil, message: `${lado.toUpperCase()}: cilindro muito discordante entre leituras (1ª=${pCil} vs 2ª=${vCil}, Δ=${cilDiff.toFixed(2)}D). Refaça a captura.` };
        }
        if (cilDiff > OCR_TOL.CIL_SOFT) {
          return { eye: lado, dim: 'cilindro', severity: 'soft', isCylinderMismatch: true, pCil, vCil, message: `${lado.toUpperCase()}: cilindro discordante entre leituras (1ª=${pCil} vs 2ª=${vCil}, Δ=${cilDiff.toFixed(2)}D). Refaça a captura.` };
        }
      }

      // ── Eixo (só se ambos têm cilindro presente) ──
      if (!skipDims.includes('eixo') && pCil !== null && vCil !== null && p?.eixo != null && v?.a != null) {
        const pEixo = parseInt(p.eixo, 10);
        const vEixo = parseInt(v.a, 10);
        if (!isNaN(pEixo) && !isNaN(vEixo)) {
          const diff = Math.abs(pEixo - vEixo);
          const circularDiff = Math.min(diff, 180 - diff); // 1° ≡ 180°
          if (circularDiff > OCR_TOL.EIXO_GRAUS) {
            return { eye: lado, dim: 'eixo', severity: 'soft', isAxisMismatch: true, pEixo, vEixo, message: `${lado.toUpperCase()}: eixo discordante entre leituras (1ª=${pEixo}° vs 2ª=${vEixo}°). Refaça a captura.` };
          }
        }
      }
    }
    return null;
  }

  /**
   * Bloqueia UM olho, não a refração inteira (v5.4.4).
   *
   * O olho bloqueado vai como null para a injeção — fillRefractionFields já
   * trata olho null LIMPANDO os campos daquele olho, então nada de consulta
   * antiga fica residual na tela. Só quando os DOIS olhos caem é que a refração
   * inteira é dada como bloqueada (e aí tono/paqui seguem preservados, v5.4.0).
   */
  _failEye(result, lado, reason) {
    if (!result.refracao) return;
    result._olhosBloqueados = result._olhosBloqueados || {};
    result._olhosBloqueados[lado] = reason;
    result.refracao[lado] = null;
    const outro = lado === 'od' ? 'oe' : 'od';
    if (!result.refracao[outro]) this._failRefraction(result, reason);
  }

  _captureFailed(reason) {
    return {
      refracao: null,
      tonometria: null,
      paquimetria: null,
      _captureFailed: true,
      _blockAutoInject: true,
      _reason: reason,
      _avisos: [reason],
      _validationWarnings: [reason]
    };
  }

  // --------------------------------------------------------------------------
  // Prompt único — formato vertical, foco em "vazio é resposta válida"
  // --------------------------------------------------------------------------
  _getExamPrompt() {
    return `Você é um OCR especializado em tickets TOPCON (autorrefrator/tonômetro/paquímetro). Você receberá UMA OU MAIS fotos do MESMO ticket. Extraia SOMENTE o que está IMPRESSO. Sua saída deve ser JSON puro.

╔══════════════════════════════════════════════════════════════════════╗
║ REGRA SUPREMA — VAZIO É UMA RESPOSTA VÁLIDA                          ║
╠══════════════════════════════════════════════════════════════════════╣
║ Quando uma posição no ticket está em branco, sem dígitos visíveis,   ║
║ retorne null para esse campo. É CLINICAMENTE COMUM (e correto) que   ║
║ um olho tenha cilindro/eixo e o outro NÃO tenha NADA naquelas        ║
║ colunas. NUNCA copie valor de um olho para o outro. NUNCA invente    ║
║ valor por simetria visual ou "porque o outro olho tem".              ║
║                                                                      ║
║ Inventar um número é o PIOR erro possível — sempre pior do que       ║
║ retornar null. O cilindro é o campo onde alucinação mais ocorre:     ║
║ tenha disciplina extrema.                                            ║
╚══════════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════════╗
║ REGRA CARDINAL — ORDEM FIXA DAS COLUNAS S, C, A                      ║
╠══════════════════════════════════════════════════════════════════════╣
║ Em TODA seção REF.DATA do TOPCON, da ESQUERDA para a DIREITA:        ║
║                                                                      ║
║   COLUNA 1 (primeira) = S (esfera)    — número com sinal explícito   ║
║   COLUNA 2 (meio)     = C (cilindro)  — sempre negativo no TOPCON    ║
║   COLUNA 3 (última)   = A (eixo)      — inteiro 1-180, sem sinal     ║
║                                                                      ║
║ ⚠ ARMADILHA DE TROCA S↔C — A MAIS GRAVE:                             ║
║   NUNCA decida qual coluna é qual pela MAGNITUDE dos valores.        ║
║   É CLINICAMENTE PLAUSÍVEL E COMUM um olho ter:                      ║
║                                                                      ║
║     S = -0.25   C = -3.75   A = 76                                   ║
║                                                                      ║
║   ou seja, esfera PEQUENA com cilindro GRANDE em magnitude. Isso é   ║
║   astigmatismo de alto grau — não é erro. Não "corrija" trocando.    ║
║                                                                      ║
║   Confie SEMPRE na ORDEM POSICIONAL das colunas (1ª=S, 2ª=C, 3ª=A),  ║
║   nunca na magnitude dos números. Mesmo que pareça "mais natural"    ║
║   colocar o número maior em S, NÃO FAÇA. Respeite a ordem impressa.  ║
║                                                                      ║
║ ⚠ ARMADILHA DE SIMETRIA ENTRE OLHOS:                                 ║
║   OD e OE podem ter padrões muito diferentes (anisometropia).        ║
║   Se OD tem |S|>|C| e OE tem |S|<|C|, isso é REAL. Não harmonize.    ║
╚══════════════════════════════════════════════════════════════════════╝

━━━━ ORIENTAÇÃO ━━━━
O ticket só pode ser transcrito com o texto NA HORIZONTAL, lido da esquerda para
a direita. Antes de qualquer coisa, decida quantos graus a IMAGEM precisa girar
no sentido HORÁRIO para que "REF.DATA" fique legível na horizontal:

Use como referência ONDE está o TOPO do ticket — o cabeçalho com a data
("06_AUG_2026"), "REF.DATA" e "VD:". O RODAPÉ é o lado de "TOPCON",
"TONO.DATA" e "PACH.DATA". Deitado, o ticket aparece nos dois sentidos: o papel
sai da impressora e é largado na mesa de qualquer jeito.

  • 0   — topo do ticket EM CIMA: já está legível na horizontal.
  • 90  — topo do ticket à ESQUERDA da foto.
  • 180 — topo EMBAIXO, texto de cabeça para baixo ("REF.DATA" vira "ATAD.FER",
          ">R<" em vez de "<R>", "TOPCON" parece "NOCTPOT").
  • 270 — topo do ticket à DIREITA da foto.

Se a resposta NÃO for 0, pare imediatamente e responda APENAS:
  {"_ticketRotacao": 270}
Não tem problema errar entre 90 e 270: o sistema percebe pelo resultado e tenta
o outro sentido. O que NÃO pode é transcrever com o ticket torto.
NÃO transcreva nada com o ticket torto — o sistema gira a imagem e pede de novo.
Ticket deitado é a causa nº 1 de troca de colunas: lendo de lado, a coluna do
CILINDRO fica onde a mente espera a ESFERA, e o valor sai trocado com aparência
perfeitamente plausível.

━━━━ MAIS DE UM TICKET NA MESMA FOTO ━━━━
Acontece de dois ou mais tickets aparecerem juntos (grampeados, sobrepostos, ou
lado a lado) — por exemplo um ticket com REF.DATA e outro, impresso em outro
horário, com TONO.DATA/PACH.DATA por cima dele. Cada ticket tem seu próprio
cabeçalho com DATA e HORA no topo.

  • NUNCA misture seções de tickets diferentes como se fossem do mesmo exame.
  • Transcreva cada seção lendo os números que estão IMPRESSOS NAQUELE ticket.
  • Se um ticket cobre parte do outro e você não tem certeza de a qual papel uma
    seção pertence, retorne null para essa seção. Não deduza.
  • Se você vir mais de um ticket, informe "_ticketsMultiplos": true (o médico
    é avisado para conferir). Um ticket só → false.
  • Para decidir a ROTAÇÃO, use o ticket que contém a seção REF.DATA.

━━━━ ESTRUTURA DO TICKET ━━━━
O ticket TOPCON imprime, na vertical, de cima para baixo:

  REF.DATA           ← seção de refração (EXTRAIR)
    VD: 12.00
    CYL: (-)         ← apenas marcador de convenção, NÃO é valor
    <R>  S    C    A   ← cabeçalho do OLHO DIREITO (OD)
      <medição 1>     ex:  + 1.75    - 0.50    75
      ... (pode ter 1, 2 ou 3 medições no total)
      <MÉDIA>         ← linha em NEGRITO no papel, IMEDIATAMENTE ACIMA DO S.E.
      S.E. <valor>    ← equivalente esférico do OD (referência, não fonte)
    <L>  S    C    A   ← cabeçalho do OLHO ESQUERDO (OE)
      <medição 1>
      ...
      <MÉDIA>
      S.E. <valor>    ← equivalente esférico do OE

  KRT.DATA           ← ceratometria — IGNORAR COMPLETAMENTE
  TONO.DATA          ← tonometria (EXTRAIR)
  PACH.DATA          ← paquimetria (EXTRAIR)

A ordem das seções no ticket pode variar, mas REF.DATA, KRT.DATA, TONO.DATA e PACH.DATA são identificadas pelos seus cabeçalhos explícitos.

━━━━ LATERALIDADE — REGRA ABSOLUTA ━━━━
<R> = OD (olho direito). <L> = OE (olho esquerdo). Nunca inverta.
Se você não consegue identificar <R> ou <L> claramente para um olho, retorne null para ESSE OLHO INTEIRO. Não chute.

━━━━ REFRAÇÃO — COMO LER CADA OLHO ━━━━
Para cada olho (OD do bloco <R>, OE do bloco <L>):

1. Localize a linha "S.E." (equivalente esférico). Esta linha NUNCA é a fonte de ESF/CIL/EIXO — só serve como âncora de referência.
2. Localize a linha MÉDIA. A linha média é a linha (em negrito) que está IMEDIATAMENTE ACIMA da linha "S.E.".
3. Localize as MEDIÇÕES numeradas. Elas ficam acima da linha MÉDIA (podem ser de 1 a 3 medições).

Para cada linha (3 medições + média), extraia 3 valores:

  • S (esfera):
    - Número com sinal (+ ou −). Se a célula está vazia, null.
    - Se ESF = "0.00", escreva "plano".
    - Se o sinal não aparece visível, null (não chute).
    - ⚠ SINAL: transcreva o caractere de sinal exatamente como impresso.
      "+" tem traço vertical E horizontal; "−" tem APENAS o horizontal (em
      impressão térmica o traço vertical do "+" pode sair fraco — olhe com
      atenção). Ler "+1.00" como "-1.00" inverte o grau do paciente — erro
      gravíssimo. Hipermetropia (+) é tão comum quanto miopia (−): nunca
      escolha o sinal por expectativa clínica.
    - ⚠ PLANO/PL: O TOPCON imprime literalmente a palavra "PLANO" ou "PL" na
      coluna S quando a esfera é 0.00. Se você ler "PLANO" ou "PL" na coluna S,
      retorne "plano" — NUNCA "+0.25" ou qualquer número positivo pequeno.
      Mesmo que os caracteres estejam levemente borrados, "PLANO"/"PL" nunca
      deve ser convertido para um valor numérico como +0.25.

  • C (cilindro):
    - Número (TOPCON usa convenção negativa).
    - Se a célula está VAZIA, EM BRANCO, sem dígitos visíveis → null.
    - NUNCA confunda célula vazia com "0.00". Vazio é vazio.
    - Se o ticket imprime literalmente "0.00", é null (sem astigmatismo).
    - Se imprime "0.50" sem sinal, é -0.50 (convenção negativa).
    - NUNCA copie o C do outro olho.

  • A (eixo):
    - Inteiro 1-180. Se a célula está vazia, null.
    - Se C é null, A obrigatoriamente também é null.
    - Se C tem valor, A é OBRIGATÓRIO. Cilindro sem eixo não existe.
      Se você não consegue ler o eixo mas vê o cilindro impresso, releia. Se
      mesmo assim não conseguir ler o eixo, marque tanto C quanto A como null
      (nunca retorne C com valor e A=null).

━━━━ ANTI-TRUNCAMENTO DE CILINDRO ━━━━
Em tickets térmicos degradados, valores como C = -3.50 podem aparecer
parcialmente apagados e ser lidos erroneamente como -0.50 ou .50.
Antes de registrar C:
  • Confira se existe dígito inteiro antes do ponto decimal.
  • "C - 3.50" é -3.50, NÃO -0.50.
  • Se houver dúvida entre -0.50 e -3.50 (imagem borrada, borda cortada,
    dígito apagado) → retorne c: null e a: null.
  • CIL alto (até -8.00) é clinicamente possível — não rejeite por magnitude.

━━━━ INCERTEZA NO CILINDRO ━━━━
Se a coluna C mostra algo que pode ser traço OU −0.25 (ambiguidade visual,
pixels insuficientes, baixa resolução), NÃO CHUTE:
  • Retorne c: null e a: null para esse olho.
  • Prefira subdiagnosticar astigmatismo a inventá-lo.
  • Astigmatismo fantasma gera prescrição errada; ausência de astigmatismo
    discreto não causa dano significativo.

━━━━ PASSO DIÓPTRICO ━━━━
Todos os valores de esfera e cilindro devem ser múltiplos exatos de 0.25D.
Exemplos válidos: -0.25, -0.50, -0.75, -1.00, -1.25, ..., -8.00.
Se você ler algo como -0.37, -1.13, -0.40 → é erro de OCR → use null.

━━━━ REGRA DE COMPLETUDE — ESFERA É OBRIGATÓRIA ━━━━
A esfera (S) é a medida primária do TOPCON — toda refração tem esfera. Se
você não consegue ler a esfera de um olho:
  → Retorne null para o OLHO INTEIRO (não retorne cilindro/eixo "isolados")
Refração com C presente e S=null é IMPOSSÍVEL clinicamente. Se você ler só o
C de um olho, significa que está alucinando — releia com mais cuidado, e se
ainda assim não conseguir ler S, marque o olho inteiro como null.

━━━━ S.E. — REGRA ANTI-ALUCINAÇÃO ━━━━
O campo "se" é APENAS o reflexo literal da linha "S.E. <numero>" impressa
no ticket (logo após a linha da média). Não é cálculo. Não é estimativa.
Não é cópia da esfera.

  ◆ Se a linha "S.E." NÃO aparece visível, está cortada, borrada ou ilegível
    → "se": null. NUNCA "complete" usando a esfera, a média, a memória
    visual de outro olho ou cálculo mental de S+C/2.
  ◆ Se cil != 0 e cil != null, é matematicamente IMPOSSÍVEL que se == esfera
    (porque S.E. = S + C/2). Se sua leitura der se igual à esfera com
    cilindro presente, VOCÊ ALUCINOU o S.E. — releia. Se mesmo após releitura
    a linha S.E. não estiver clara, retorne "se": null.
  ◆ Se cil == 0 (cilindro zero impresso), aí sim se == esfera é esperado e
    correto — pode retornar.
  ◆ O número de "se" pode ter sinal explícito ou implícito; copie como
    aparece impresso. Se o sinal não estiver visível, "se": null.

━━━━ CONSISTÊNCIA INTERNA (AUTOVIGILÂNCIA) ━━━━
Antes de retornar, faça MENTALMENTE estas checagens:

  ◆ As 3 medições + média de cada olho devem ser parecidas.
    Se as 3 medições mostram C vazio e a média mostra C com valor → você provavelmente leu errado a média. Releia ou marque null.

  ◆ Se OE = OD em S, C e A exatamente (todos os 3 campos idênticos) →
    você quase certamente copiou um olho para o outro. Releia.

  ◆ Se você "preencheu" o C ou A de um olho porque "o outro tem" →
    APAGUE e marque null.

  ◆ Se faltam pixels claros para um dígito → null.

━━━━ TONOMETRIA (TONO.DATA) ━━━━
Uma linha "R" (= OD) e uma linha "L" (= OE), em mmHg.
Use o valor da coluna AVG. Se não houver AVG, use o último número da linha.
"ERR" isolado (sem número) = ignore essa medição individual.
"ERR 17" ou "(17)" = use o número.
Faixa esperada: 8-25 mmHg.

Transcreva TAMBÉM, em "_tonoMedicoes", as medições INDIVIDUAIS impressas na
linha de cada olho — os números que aparecem ANTES da coluna AVG, inclusive os
que estão entre parênteses (transcreva só o número, sem os parênteses). Elas
servem de conferência do AVG. Exemplo: a linha "R 13 (14)(14) 13" dá
tonometria.od = 13 (a coluna AVG) e "_tonoMedicoes": {"od": [13, 14, 14]}.
"ERR" não é número: não entra na lista. Se não conseguir lê-las, use [].

━━━━ PAQUIMETRIA (PACH.DATA) ━━━━
Uma linha "R" (= OD) e uma linha "L" (= OE), em mm.
Use a coluna AVG. Multiplique por 1000 para µm (ex: 0.504 → 504).
Faixa esperada: 420-650 µm.

━━━━ KRT.DATA (CERATOMETRIA) ━━━━
IGNORAR COMPLETAMENTE. Os valores de R1, R2, AVE, CYL ceratométrico, MM1, MM2 NÃO são refração. Não use NADA da seção KRT em nenhum dos campos de saída.

━━━━ LOCALIZAÇÃO DA SEÇÃO REF.DATA ━━━━
Além dos valores, informe ONDE a seção REF.DATA está na PRIMEIRA imagem. O
sistema usa essa caixa para recortar e ampliar a região quando precisar reler
um dígito duvidoso.

  "_refDataBox": [ymin, xmin, ymax, xmax]

Coordenadas NORMALIZADAS de 0 a 1000 (0,0 = canto superior esquerdo da imagem;
1000,1000 = canto inferior direito). A caixa deve cobrir do cabeçalho
"REF.DATA" até a última linha "S.E." do bloco <L>, com uma folga pequena.
NÃO devolva o ticket inteiro — uma caixa que cobre tudo não amplia nada.
Se não conseguir determinar a região, use null.

━━━━ FORMATO DE SAÍDA — JSON PURO (sem markdown) ━━━━
{
  "_ticketRotacao": 0,
  "_ticketsMultiplos": false,
  "_refDataBox": [180, 40, 520, 960],
  "refracao": {
    "od": {
      "medicoes": [
        {"s": "+1.75", "c": -0.50, "a": 75},
        {"s": "+1.75", "c": -0.50, "a": 75},
        {"s": "+1.75", "c": -0.50, "a": 75}
      ],
      "media": {"s": "+1.75", "c": -0.50, "a": 75},
      "se":   "+1.50"
    },
    "oe": {
      "medicoes": [
        {"s": "+1.50", "c": null, "a": null},
        {"s": "+1.50", "c": null, "a": null},
        {"s": "+1.50", "c": null, "a": null}
      ],
      "media": {"s": "+1.50", "c": null, "a": null},
      "se":   "+1.50"
    }
  },
  "tonometria":  {"od": 15, "oe": 14},
  "_tonoMedicoes": {"od": [15, 15, 16], "oe": [14, 14]},
  "paquimetria": {"od": 504, "oe": 526}
}

REGRAS DE NULL:
  - Olho inteiro ilegível → refracao.od = null (ou refracao.oe = null)
  - Seção REF.DATA não aparece → refracao = null
  - Seção TONO.DATA não aparece → tonometria = null
  - Seção PACH.DATA não aparece → paquimetria = null
  - Menos de 3 medições visíveis → preencha o que tiver e use null nas faltantes
  - Linha "S.E." não visível/ilegível para um olho → se: null nesse olho
  - Não chute. Não estime. Não complete por simetria.

Responda APENAS com o JSON. Sem texto antes, sem texto depois, sem markdown.
`;
  }

  // --------------------------------------------------------------------------
  // Pós-processamento determinístico — cross-check 3 medições vs média
  // --------------------------------------------------------------------------
  _postProcessRefraction(raw) {
    const result = {
      tonometria:  raw?.tonometria || null,
      paquimetria: raw?.paquimetria || null,
      refracao:    null,
      _avisos: [],
      _captureFailed: false,
      _reason: null
    };

    // Estrutura mínima para o caller
    if (!raw || typeof raw !== 'object') {
      result._captureFailed = true;
      result._reason = 'Resposta vazia da IA.';
      return result;
    }

    // ===== Refração =====
    const refracao = raw.refracao;
    if (refracao && (refracao.od || refracao.oe)) {
      result.refracao = { od: null, oe: null };

      for (const lado of ['od', 'oe']) {
        const eye = refracao[lado];
        if (!eye || typeof eye !== 'object') continue;
        result.refracao[lado] = this._processEye(eye, lado.toUpperCase(), result._avisos);
      }

      // Cross-check inter-olhos: OD === OE exatamente em S+C+A é raríssimo
      // e geralmente significa cópia. Bloquear se acontecer com cilindro presente.
      const od = result.refracao.od;
      const oe = result.refracao.oe;

      // Marca preservada para o auto-retry de swap S↔C: um bloqueio de refração
      // zera result.refracao, e sem esta marca o gatilho da releitura sumiria.
      result._todosOlhosDescartados = !od && !oe;

      if (od && oe && od.cil != null && oe.cil != null) {
        const esfIgual = String(od.esf) === String(oe.esf);
        const cilIgual = Math.abs(od.cil - oe.cil) < 0.01;
        const eixoIgual = od.eixo != null && oe.eixo != null && Math.abs(od.eixo - oe.eixo) < 1;
        if (esfIgual && cilIgual && eixoIgual) {
          this._failRefraction(result, 'OD e OE saíram idênticos em esfera, cilindro e eixo — provável duplicação. Refaça a captura.');
        }
      }

      // ── DEFESA: S.E. cross-check matemático ─────────────────────────
      // Se o modelo retornou S.E. para um olho, verificar que S + C/2 ≈ S.E.
      // Discrepância > 0.30D indica que algum dos campos (S, C ou S.E.) foi
      // alucinado. Pega o caso clássico de cilindro errado (modelo lê um valor
      // mas o S.E. da impressão original continua certo) — ex: ticket diz
      // S=-4.75, C=-1.00, S.E.=-5.25 mas modelo lê C=-1.75 → S+C/2=-5.625,
      // discrepa do S.E.=-5.25 em 0.375 → bloquear.
      //
      // ATENÇÃO: não tente "corrigir" qual valor está errado — só sinalize a
      // discrepância e peça nova foto. Confiar em S.E. para corrigir CIL
      // (ou vice-versa) já se mostrou perigoso porque o modelo às vezes
      // alucina o S.E. junto.
      //
      // v5.4.6 — REPROVA O OLHO, NÃO A REFRAÇÃO. Esta conta é POR OLHO e
      // derrubava os dois: log 2026-08-06 11:41, o OD saiu incoerente (S.E.
      // +1.50 com S +1.25 e C -0.50) e levou junto um OE perfeito. Pior: com a
      // refração zerada aqui, `refracaoViva` fica falso e a captura termina sem
      // 2ª chamada e sem leitura ampliada — o olho bom perde também a segunda
      // opinião (12.6s de captura, nenhuma conferência).
      for (const lado of ['od', 'oe']) {
        const eye = result.refracao[lado];
        if (!eye) continue;
        const seReportado = eye.se;
        if (seReportado == null) continue;
        const seNum = parseFloat(seReportado);
        if (isNaN(seNum)) continue;
        const esfNum = String(eye.esf).toLowerCase() === 'plano' ? 0 : parseFloat(eye.esf);
        if (isNaN(esfNum)) continue;

        // ── Cilindro não lido: o S.E. impresso é o DISCRIMINADOR, não o réu ──
        // Com cil=null o cálculo virava seCalc=esf, e aí QUALQUER astigmatismo
        // real reprovava a captura inteira. Caso 2026-08-03 17:47:13: OD -5.00
        // com C não lido e S.E. impresso -5.50 → bloqueio por "leitura
        // incorreta"; as outras duas capturas do mesmo ticket leram C=-1.00 —
        // exatamente o 2*(S.E.-S) que o próprio S.E. já implicava. Isso é
        // leitura PARCIAL (faltou uma célula), não leitura errada: a esfera
        // conferida pelo S.E. continua válida.
        // O cilindro implícito NÃO é injetado: sem eixo ele não é prescritível
        // (mesma regra de _processEye) — vira aviso para conferência.
        if (eye.cil == null) {
          const cilImplicito = 2 * (seNum - esfNum);
          if (Math.abs(cilImplicito) <= OCR_TOL.SE_CROSSCHECK) continue; // coerente: sem cilindro mesmo
          const plausivel = cilImplicito < 0
            && Math.abs(cilImplicito) <= 8
            && this._isValidDiopterStep(cilImplicito);
          if (plausivel) {
            result._avisos.push(`${lado.toUpperCase()}: cilindro não foi lido, mas o S.E. impresso (${seNum.toFixed(2)}) com a esfera (${esfNum.toFixed(2)}) implica C≈${cilImplicito.toFixed(2)} — esfera preservada; confira cilindro e eixo no ticket.`);
            continue;
          }
          this._failEye(result, lado, `${lado.toUpperCase()}: S.E. lido (${seNum.toFixed(2)}) não bate com a esfera (${esfNum.toFixed(2)}) e a diferença não corresponde a um cilindro plausível. Refaça a captura.`);
          continue;
        }

        const cilNum = parseFloat(eye.cil);
        const seCalculado = esfNum + cilNum / 2;
        const diff = Math.abs(seNum - seCalculado);
        if (diff > OCR_TOL.SE_CROSSCHECK) {
          // A conta do próprio ticket aponta qual cilindro fecharia — informação
          // que o médico usa para decidir se vale refazer a foto ou digitar.
          const cilImplicito = 2 * (seNum - esfNum);
          const avisoCil = `${lado.toUpperCase()}: com o S.E. impresso (${seNum.toFixed(2)}) e a esfera (${esfNum.toFixed(2)}), o cilindro que fecharia a conta seria C≈${cilImplicito.toFixed(2)} (lido: ${cilNum.toFixed(2)}).`;
          const motivo = `${lado.toUpperCase()}: S.E. lido (${seNum.toFixed(2)}) não bate com S+C/2 calculado (${seCalculado.toFixed(2)}) — diferença ${diff.toFixed(2)}D indica leitura incorreta. Refaça a captura.`;
          result._olhosFalhosPorSE = result._olhosFalhosPorSE || {};
          result._olhosFalhosPorSE[lado] = { eye, seNum, seCalculado, avisoCil, motivo };
          result._avisos.push(avisoCil);
          this._failEye(result, lado, motivo);
          continue;
        }
      }
    }

    // ===== Tonometria: sanity + conferência + alerta clínico (v5.5.0) =====
    //
    // Até aqui a PIO só passava por uma faixa de plausibilidade: toda a
    // artilharia de conferência (2ª chamada, leitura ampliada, desempates)
    // protegia apenas a refração, e um "13" lido como "18" entrava no prontuário
    // sem que nada olhasse duas vezes. O ticket imprime as medições individuais
    // ao lado do AVG — é uma conferência que já está no papel e custa zero
    // chamada, exatamente como o cross-check médias-vs-média da refração.
    if (result.tonometria) {
      for (const lado of ['od', 'oe']) {
        const v = result.tonometria[lado];
        if (v == null) continue;
        const num = parseFloat(v);
        if (isNaN(num) || num < 5 || num > 40) {
          result._avisos.push(`Tonometria ${lado.toUpperCase()} (${v}) fora da faixa 5-40 mmHg — descartada`);
          result.tonometria[lado] = null;
          continue;
        }
        result.tonometria[lado] = num;

        // Distância ao valor IMPRESSO mais próximo — não à faixa [min,max].
        //
        // O AVG do TOPCON não é a média do que está visível: leituras entre
        // parênteses são excluídas da conta. Prova nas fotos reais:
        //   2026-08-06  R  13 (14) (14)  AVG 13   ← média de 13,14,14 seria 14
        //   2026-05-21  L  ERR (16) (18) AVG 19   ← nem a média, nem um dos dois
        // Uma regra de faixa reprovaria a segunda linha por 1 mmHg. Este arquivo
        // inteiro é a história de avisos espúrios ensinando o médico a ignorar
        // avisos — a checagem só vale se pegar erro de DÍGITO (13 lido como 18),
        // que é o que a folga de 3 mmHg separa de qualquer efeito de parênteses.
        const medicoes = this._tonoMedicoes(raw, lado);
        if (medicoes.length >= 1) {
          const distancia = Math.min(...medicoes.map(m => Math.abs(num - m)));
          if (distancia > 3) {
            result._avisos.push(
              `Tonometria ${lado.toUpperCase()}: o AVG lido (${num}) não bate com nenhuma medição do próprio ` +
              `ticket (${medicoes.join(', ')}) — confira a PIO no papel.`
            );
          }
        }

        // Pendência do log 2026-07-31: PIO 24 mmHg foi injetada sem nenhum
        // sinalizador. O valor está dentro da faixa de plausibilidade do
        // aparelho, então nada o marcava — mas é hipertensão ocular e o motivo
        // clínico de a tonometria estar sendo feita.
        if (num > 21) {
          result._avisos.push(
            `PIO ${lado.toUpperCase()} = ${num} mmHg — acima de 21. Considere avaliação de hipertensão ocular/glaucoma.`
          );
        }
      }
    }

    // ===== Sanity sobre paquimetria (incluindo auto-conversão mm → µm) =====
    if (result.paquimetria) {
      for (const lado of ['od', 'oe']) {
        const v = result.paquimetria[lado];
        if (v == null) continue;
        let num = parseFloat(v);
        if (isNaN(num)) {
          result.paquimetria[lado] = null;
          continue;
        }
        if (num < 2.0) num = Math.round(num * 1000); // mm → µm
        if (num < 350 || num > 700) {
          result._avisos.push(`Paquimetria ${lado.toUpperCase()} (${num}µm) fora da faixa 350-700 — descartada`);
          result.paquimetria[lado] = null;
        } else {
          result.paquimetria[lado] = num;
        }
      }
    }

    // ===== Metadados de propagação =====
    //
    // Mais de um ticket na foto (v5.5.0): não bloqueia — o modelo pode ter lido
    // tudo do papel certo —, mas o médico precisa saber que a foto tinha dois
    // exames, possivelmente de horários diferentes. Caso real na foto de
    // 2026-08-06 08:57: tono/paqui grampeado por cima do ticket de refração.
    if (raw._ticketsMultiplos === true) {
      const aviso = 'A foto tem mais de um ticket — confira se refração, tonometria e paquimetria vieram todas do exame de hoje.';
      this.logger.warn('[OCR] ' + aviso);
      if (!result._avisos.includes(aviso)) result._avisos.push(aviso);
    }

    this._resolveBlocking(result);
    if (raw._ticketFoiRotacionado) result._ticketInvertido = true;

    // CIDs de refração inferidos deterministicamente (só quando captura válida)
    result.cid_refracao = (!result._captureFailed && result.refracao)
      ? this._inferCidRefracao(result.refracao)
      : [];

    return result;
  }

  /**
   * Marca a REFRAÇÃO como não-injetável, sem condenar a captura (v5.4.0).
   *
   * Antes, toda divergência de S/C/A setava _captureFailed e o consumidor
   * descartava o ticket inteiro. Tonometria e paquimetria são outras seções do
   * papel, lidas de outros números, e não têm relação alguma com a divergência
   * — no log 2026-08-03 às 17:46 tono 15/17 e paqui 517/515, sem conflito
   * nenhum entre as leituras, foram jogadas fora por causa do cilindro do OE.
   * A primeira razão registrada prevalece (é a que descreve a causa raiz).
   */
  _failRefraction(result, reason) {
    result._refracaoBloqueada = true;
    if (!result._refracaoReason) result._refracaoReason = reason;
  }

  /**
   * Converte o estado de bloqueio no contrato que o consumidor entende.
   *
   * _captureFailed mantém o significado histórico "não há NADA aproveitável
   * nesta captura" — todos os consumidores existentes continuam corretos.
   * Refração bloqueada com tono/paqui vivos vira injeção parcial + aviso.
   * Idempotente: extractExams chama de novo após a etapa de verificação.
   */
  _resolveBlocking(result) {
    result._avisos = result._avisos || [];

    // Bloqueio de um olho só (v5.4.4): o outro olho é injetado normalmente e o
    // olho bloqueado vai como null — fillRefractionFields limpa os campos dele,
    // então não sobra grau de consulta antiga na tela.
    if (!result._refracaoBloqueada && result._olhosBloqueados && result.refracao) {
      for (const [lado, motivo] of Object.entries(result._olhosBloqueados)) {
        // "preservado", não "conferido": este aviso também é montado no
        // pós-processamento, ANTES da 2ª chamada — dizer que o outro olho já foi
        // conferido seria falso metade das vezes.
        const aviso = `Refração do ${lado.toUpperCase()} NÃO injetada — ${motivo} O outro olho foi preservado.`;
        if (!result._avisos.includes(aviso)) result._avisos.push(aviso);
      }
      result._validationWarnings = result._avisos.slice();
    }

    if (result._refracaoBloqueada) {
      result._avisos = result._avisos.filter(a => !a.endsWith('O outro olho foi preservado.'));
      result.refracao = null;
      result.cid_refracao = [];

      const temTono = !!(result.tonometria &&
        (result.tonometria.od != null || result.tonometria.oe != null));
      const temPaqui = !!(result.paquimetria &&
        (result.paquimetria.od != null || result.paquimetria.oe != null));

      if (temTono || temPaqui) {
        result._captureFailed = false;
        result._blockAutoInject = false;
        result._reason = null;
        const aviso = `Refração NÃO injetada — ${result._refracaoReason} Tonometria/paquimetria desta captura foram preservadas.`;
        if (!result._avisos.includes(aviso)) result._avisos.push(aviso);
        result._validationWarnings = result._avisos.slice();
      } else {
        result._captureFailed = true;
        result._blockAutoInject = true;
        result._reason = result._refracaoReason;
        result._validationWarnings = [result._reason];
      }
      return;
    }

    if (result._captureFailed) {
      result._blockAutoInject = true;
      result._validationWarnings = [result._reason];
    } else if (result._avisos.length > 0) {
      result._validationWarnings = result._avisos.slice();
    }
  }

  /**
   * Processa um olho. Aplica cross-check entre 3 medições e média.
   * Regra crítica: se média mostra cilindro mas 2+ medições mostram null,
   * descarta o cilindro (alucinação de simetria visual).
   */
  _processEye(eye, label, avisos) {
    const medicoes = Array.isArray(eye.medicoes) ? eye.medicoes : [];
    const media = eye.media || null;
    let se = eye.se || null;
    let cilDescartadoPorEixo = false;

    // ESF: média prioritária; se ausente, modal das medições
    let esf = media?.s ?? null;
    if (esf == null && medicoes.length > 0) {
      const sValues = medicoes.map(m => m?.s).filter(v => v != null);
      if (sValues.length > 0) esf = this._modal(sValues);
    }

    // Unanimidade vence a média: a média impressa de 3 medições idênticas é
    // obrigatoriamente igual a elas. Se as 3 medições são unânimes e a média
    // diverge, a média foi lida errado (caso real: medições c=-2.25 ×3 com
    // "média" -2.00).
    const sUnanimes = medicoes.map(m => m?.s).filter(v => v != null);
    if (esf != null && sUnanimes.length === 3 &&
        sUnanimes.every(v => String(v) === String(sUnanimes[0])) &&
        String(esf) !== String(sUnanimes[0])) {
      avisos.push(`${label}: média S (${esf}) diverge das 3 medições unânimes (${sUnanimes[0]}) — usadas as medições`);
      esf = sUnanimes[0];
    }

    // ⚠️ REGRA DE COMPLETUDE — ESFÉRICA É OBRIGATÓRIA:
    // Refração com cilindro presente E esfera ausente é clinicamente impossível
    // (TOPCON sempre imprime esfera). Se o modelo retornou só C ou só A para um
    // olho, é alucinação garantida — invalidar o olho inteiro.
    if (esf == null) {
      avisos.push(`${label}: esfera não foi lida — olho descartado (refração sem esfera é impossível)`);
      return null;
    }

    // CIL: aplica lógica defensiva contra alucinação
    const cilMedia = this._parseCil(media?.c);
    const cilMedicoes = medicoes.map(m => this._parseCil(m?.c));
    const cilNullCount = cilMedicoes.filter(v => v === null).length;
    const cilNumCount  = cilMedicoes.filter(v => v !== null).length;

    let cil = null;
    if (cilMedia === null && cilNullCount >= 2) {
      // Consistente: 2+ medições null + média null → sem cilindro
      cil = null;
    } else if (cilMedia === null && cilNumCount >= 2) {
      // Média sumiu mas medições mostram valor → usar modal
      const valids = cilMedicoes.filter(v => v !== null);
      cil = this._modal(valids);
      avisos.push(`${label}: média de C ausente — usado modal das medições (${cil})`);
    } else if (cilMedia !== null && cilNullCount >= 2) {
      // ⚠️ ALUCINAÇÃO PROVÁVEL: média mostrou cilindro mas medições estavam vazias
      cil = null;
      avisos.push(`${label}: média mostrou C=${cilMedia} mas medições estavam vazias — descartado (provável alucinação)`);
    } else if (cilMedia !== null && cilNumCount >= 2) {
      // Caso normal: validar consistência média vs medições
      const valids = cilMedicoes.filter(v => v !== null);
      const unanime = valids.length === 3 && valids.every(v => Math.abs(v - valids[0]) < 0.01);
      const allClose = valids.every(v => Math.abs(v - cilMedia) <= 0.50);
      if (unanime && Math.abs(valids[0] - cilMedia) > 0.01) {
        // Média impressa de 3 valores iguais é igual a eles — média foi lida errado
        cil = valids[0];
        avisos.push(`${label}: média de C (${cilMedia}) diverge das 3 medições unânimes (${valids[0]}) — usadas as medições`);
      } else if (allClose) {
        cil = cilMedia;
      } else {
        // Média diverge das medições → usar modal e avisar
        cil = this._modal(valids);
        avisos.push(`${label}: média de C (${cilMedia}) diverge das medições — usado modal (${cil})`);
      }
    } else {
      // Caso ambíguo (poucos dados) — usar média se existir
      cil = cilMedia;
    }

    // EIXO: depende de CIL. Se CIL é null, EIXO é null obrigatoriamente.
    let eixo = null;
    let eixoMedicoesValidos = [];
    if (cil !== null) {
      const eixoMedia = this._parseEixo(media?.a);
      const eixoMedicoes = medicoes.map(m => this._parseEixo(m?.a));
      const eixoValidos = eixoMedicoes.filter(v => v !== null);
      eixoMedicoesValidos = eixoValidos.slice();

      const eixoUnanime = eixoValidos.length === 3 && eixoValidos.every(v => v === eixoValidos[0]);
      if (eixoMedia !== null && eixoUnanime && eixoValidos[0] !== eixoMedia) {
        // Mesma regra de unanimidade aplicada a S e C
        eixo = eixoValidos[0];
        avisos.push(`${label}: média de A (${eixoMedia}°) diverge das 3 medições unânimes (${eixoValidos[0]}°) — usadas as medições`);
      } else if (eixoMedia !== null) {
        eixo = eixoMedia;
      } else if (eixoValidos.length >= 2) {
        eixo = this._modal(eixoValidos);
        avisos.push(`${label}: média de A ausente — usado modal das medições (${eixo}°)`);
      }

      if (eixo !== null && (eixo < 1 || eixo > 180)) {
        avisos.push(`${label}: eixo ${eixo} fora da faixa 1-180 — refração descartada`);
        cil = null;
        eixo = null;
      }

      // ⚠️ REGRA DE COMPLETUDE — CILINDRO COM EIXO AUSENTE É INVÁLIDO:
      // Se temos cilindro mas não conseguimos ler o eixo, anular ambos.
      // Cilindro sem eixo não define direção do astigmatismo — clinicamente
      // não-injetável e tipicamente sinal de leitura parcial/alucinada.
      if (cil !== null && eixo === null) {
        avisos.push(`${label}: cilindro C=${cil} presente mas eixo ausente — cilindro descartado; olho injetado como esférico puro (S.E. impresso ignorado por refletir o cilindro removido)`);
        cil = null;
        cilDescartadoPorEixo = true;
        // O S.E. impresso embutia o cilindro que acabamos de descartar, então
        // deixa de ser comparável a S+C/2. Anulá-lo evita que o cross-check
        // determinístico de S.E. bloqueie a captura inteira (tono/paqui inclusos).
        se = null;
      }
    }

    // ⚠️ VALIDAÇÃO DE PASSO DIÓPTRICO (0.25D)
    // Autorrefratores medem em passos de 0.25D. Valores fora desse grid
    // (ex: -0.37, -1.13) indicam erro de OCR em ticket degradado.
    if (!this._isValidDiopterStep(esf)) {
      avisos.push(`${label}: esfera ${esf} não é múltiplo de 0.25D — provável erro de OCR, olho descartado`);
      return null;
    }
    if (cil !== null && !this._isValidDiopterStep(cil)) {
      avisos.push(`${label}: cilindro ${cil} não é múltiplo de 0.25D — descartado (provável erro de OCR)`);
      cil = null;
      eixo = null;
    }

    if (esf != null) esf = String(esf).toLowerCase();
    // `_eixoMedicoes` não é dado de prontuário: fica disponível para a etapa de
    // conferência decidir se a MÉDIA de A é corroborada pelas próprias medições
    // do olho (ver correção de eixo por 2-de-3 em extractExams).
    return { esf, cil, eixo, se, _cilDescartadoPorEixo: cilDescartadoPorEixo, _eixoMedicoes: eixoMedicoesValidos };
  }

  /**
   * Normaliza valor de cilindro. TOPCON usa convenção negativa.
   * Retorna número ≤ 0 ou null. Valor 0 vira null (sem astigmatismo).
   */
  _parseCil(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    const num = parseFloat(v);
    if (isNaN(num)) return null;
    if (num === 0) return null;
    return num > 0 ? -num : num;
  }

  _parseEixo(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    const num = parseInt(v, 10);
    if (isNaN(num)) return null;
    return num;
  }

  /**
   * Medições individuais da linha TONO de um olho (v5.5.0).
   *
   * O TOPCON imprime algo como `R 13 (14)(14) AVG 13` — as medições e a média
   * na MESMA linha. Isso é uma testemunha gratuita do AVG, do mesmo tipo que a
   * refração já usa (média vs 3 medições), e estava sendo ignorada.
   *
   * Descarta o que não é medição de PIO: fora de 5-40 mmHg é ruído de OCR
   * (número de série, horário, o "(14)" de uma leitura com ERR).
   */
  _tonoMedicoes(raw, lado) {
    const brutas = raw?._tonoMedicoes?.[lado];
    if (!Array.isArray(brutas)) return [];
    return brutas
      .map(v => parseFloat(v))
      .filter(n => !isNaN(n) && n >= 5 && n <= 40);
  }

  /**
   * Verifica se um valor é múltiplo válido de 0.25D (passo dióptrico padrão).
   * Autorrefratores e refratores medem em passos de 0.25D.
   * Valores como -0.37 ou -1.13 não existem clinicamente e indicam erro de OCR.
   */
  _isValidDiopterStep(value) {
    if (value === null || value === undefined) return true;
    if (value != null && String(value).toLowerCase() === 'plano') return true;
    const num = parseFloat(value);
    if (isNaN(num)) return true; // outras validações lidam com NaN
    return Math.round(Math.abs(num) * 100) % 25 === 0;
  }

  /**
   * Infere CIDs H52.x deterministicamente a partir da refração validada.
   * Só chamado quando _captureFailed === false.
   */
  _inferCidRefracao(refracao) {
    if (!refracao) return [];

    // Código SEM ponto: é o formato da plataforma (o SHOSP grava "H522ASTIGMATISMO")
    // e o mesmo que o agente de entrevista emite ("H521 - Miopia AO"). Com ponto, o
    // texto do diagnóstico saía em dois formatos na mesma consulta conforme a origem
    // (OCR vs entrevista). A dedup é insensível a ponto (_cidKeyFromText), então a
    // troca não altera o casamento entre as duas origens.
    const CIDS = {
      H520: 'H520 - Hipermetropia',
      H521: 'H521 - Miopia',
      H522: 'H522 - Astigmatismo',
      H523: 'H523 - Anisometropia',
    };

    function parseEsf(esf) {
      if (esf == null) return null;
      if (typeof esf === 'string' && /^(plano|pl)$/i.test(esf.trim())) return 0.0;
      const n = parseFloat(esf);
      return isNaN(n) ? null : n;
    }

    // SE: usa valor do ticket; se ausente, deriva de esf+cil/2 (só para anisometropia)
    function getSE(eye) {
      if (!eye) return null;
      if (eye.se != null) {
        const seN = parseFloat(eye.se);
        if (!isNaN(seN)) return seN;
      }
      const esfN = parseEsf(eye.esf);
      if (esfN == null) return null;
      const cilN = (eye.cil != null) ? parseFloat(eye.cil) : 0;
      return esfN + cilN / 2;
    }

    const codes = new Set();

    for (const lado of ['od', 'oe']) {
      const eye = refracao[lado];
      if (!eye) continue;
      const esfN = parseEsf(eye.esf);
      if (esfN == null) continue;

      // Piso clínico: só codifica ametropia esférica a partir de |0.50D|. Uma
      // esfera de ±0.25D está dentro da faixa emétrope — codificar H52.0/H52.1
      // aí gera diagnóstico de ruído (caso 2026-07-24: OD +0.25 / OE -0.25
      // gerou Hipermetropia + Miopia). O caminho determinístico do OCR não tem
      // contexto de sintomas; o de entrevista (ciente da queixa) ainda pode
      // codificar ±0.25 se o médico tratar disso.
      if (esfN >= 0.50)       codes.add('H520'); // hipermetropia
      else if (esfN <= -0.50) codes.add('H521'); // miopia

      const cilN = (eye.cil != null) ? parseFloat(eye.cil) : 0;
      if (!isNaN(cilN) && Math.abs(cilN) >= 0.25) codes.add('H522');
    }

    // Anisometropia: diferença de SE entre olhos > 1.50D
    const seOD = getSE(refracao.od);
    const seOE = getSE(refracao.oe);
    if (seOD != null && seOE != null && Math.abs(seOD - seOE) > 1.50) {
      codes.add('H523');
    }

    return [...codes].map(c => CIDS[c]).filter(Boolean);
  }

  /** Modal (valor mais frequente) — usado quando média ausente ou divergente. */
  _modal(arr) {
    if (!arr || arr.length === 0) return null;
    const counts = new Map();
    for (const v of arr) {
      const key = String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let best = arr[0], bestCount = 0;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = arr.find(v => String(v) === key);
      }
    }
    return best;
  }

  // --------------------------------------------------------------------------
  // Validação binária — aceita ou rejeita. SEM auto-correção.
  // --------------------------------------------------------------------------
  validateExamData(data) {
    if (!data) return { isValid: false, warnings: ['Sem dados extraídos. Refaça a captura.'], shouldRetry: false };
    if (data._captureFailed) {
      return {
        isValid: false,
        warnings: [data._reason || 'Captura inválida. Refaça a foto.'],
        shouldRetry: false
      };
    }
    return {
      isValid: true,
      warnings: data._avisos || [],
      shouldRetry: false
    };
  }
}

// Singleton do agente de exames
const geminiExamAgent = new GeminiExamAgent();

