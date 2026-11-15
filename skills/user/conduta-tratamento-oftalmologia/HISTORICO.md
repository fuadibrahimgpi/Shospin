# Histórico de erros e decisões — conduta e tratamento

Registro datado do que já deu errado e do que o médico decidiu. **Não é regra vigente**: as regras
que valem hoje estão em `SKILL.md` (conduta) e `TRATAMENTO.md` (medicamentos) desta pasta, e a
autoridade é o código (ver `skills/user/README.md`). Uma entrada antiga pode descrever um
comportamento que uma entrada posterior mudou; vale sempre a mais recente.

Movido de `SKILL.md` em 2026-11-15, sem mudança de conteúdo além das duas notas marcadas
"(nota de 2026-11-15)".

### 2026-05-05 — Orientações e explicações ao paciente

- **Erro observado**: orientações e explicações dadas pelo médico ao paciente não estavam sendo injetadas em `conduta`.
- **Correção aplicada**: expandida a regra de orientações verbais para incluir explicações clínicas, sinais de alerta, prognóstico, necessidade de acompanhamento e justificativa de exames.
- **Exceção adicionada**: orientações meramente operacionais ou adaptativas sobre uso dos óculos devem ser descartadas.

### 2026-05-05 — Óculos multifocais

- **Erro observado**: prescrições de óculos multifocais nem sempre ficavam explicitamente documentadas em `conduta`.
- **Correção aplicada**: adicionada regra obrigando `Prescrição de óculos multifocais` quando multifocal, progressivo ou bifocal for verbalizado.

### 2026-05-05 — Associação medicamentosa inventada

- **Erro observado**: o campo de tratamento frequentemente criava associações medicamentosas sem prescrição explícita.
- **Correção aplicada**: adicionada regra anti-associação para impedir combinação de colírios, princípios ativos ou medicamentos quando o médico prescreveu itens separados ou mencionou termos genéricos.

### 2026-05-11 — Atualização de grau listada como opção válida

- **Erro observado**: a tabela de prescrição de óculos continha a linha `Atualização de grau` como opção de registro, em contradição direta com a regra que proibio este termo.
- **Correção aplicada**: removida esta entrada da tabela; adicionada regra de inferência de prescrição de óculos para capturar casos em que o médico não verbaliza mas o contexto é inequívoco.

### 2026-05-11 — Prescrição de óculos não capturada quando não verbalizada

- **Erro observado**: quando o médico realizou refração e orientou ótica sem dizer explicitamente "prescrevo óculos", o campo conduta ficava sem prescrição.
- **Correção aplicada**: adicionada regra de inferência condicional (3 condições obrigatórias) para capturar esses casos.

### 2026-05-18 — Explicações ao paciente não eram injetadas na conduta

- **Erro observado**: quando o médico explica algo ao paciente (diagnóstico, cefaleia, prognóstico, sinais de alerta), essas explicações não apareciam no campo conduta.
- **Causa raiz**: o prompt do Gemini em geminiService.js tinha apenas uma linha vaga sem exemplos ou formato para esse tipo de entrada. O modelo não sabia gerar "Explicado..." ou "Orientado...".
- **Correção aplicada**: expandida a instrução de explicações ao paciente no prompt do Gemini com prefixos (`Orientado/Explicado/Esclarecido`), exemplos concretos incluindo cefaleia, e entradas nos exemplos do teste obrigatório.
- **Inconsistência corrigida**: o SKILL.md mostrava "Orientado compressa morna" como conduta, contradizendo o código (DecisionEngine._guardCondutaContaminada move compressa/higiene para tratamento). Corrigido para alinhar SKILL.md com comportamento real.

### 2026-05-11 — `injectExamesNormais` marcado incorretamente

- **Erro observado**: a frase "tudo em paz com o olho" estava sendo usada como gatilho único para marcar `injectExamesNormais: true`, mesmo quando o médico prescrevia lubrificante ou encaminhava.
- **Correção aplicada**: adicionada condição extra: a flag só pode ser verdadeira se não houver tratamento ou encaminhamento ativo.

### 2026-06-16 — Detalhes técnicos de lente injetados na conduta

- **Erro observado**: médico comentou que antirreflexo e filtro de luz azul seriam "jogar dinheiro fora" (desaconselhando o item), mas a conduta injetada ficou "Orientado sobre escolha de lentes multifocais (qualidade, antirreflexo, filtro azul)", como se fosse uma orientação positiva — perdendo a polaridade da fala e incluindo detalhe técnico que não deveria estar em conduta.
- **Causa raiz**: a regra de fusão de orientações verbais (`Orientado:`) não excluía explicitamente comentários sobre revestimento/filtro/qualidade de lente, então o modelo registrava esses detalhes como se fossem decisão clínica.
- **Correção aplicada**: adicionada regra explícita — conduta de óculos registra apenas se é multifocal ou não; detalhes técnicos de lente (antirreflexo, filtro azul, tamanho de campo, qualidade, marca) nunca entram em conduta, independente de terem sido recomendados ou desaconselhados pelo médico. Mesma regra adicionada em `src/geminiService.js`.

### 2026-06-17 — Óculos convencional classificado incorretamente como multifocal

- **Erro observado**: óculos convencionais (sem o médico dizer multifocal/progressivo) sendo registrados como `Prescrição de óculos multifocais`, possivelmente por ADD presente no ticket de refração ou menção isolada a "grau de perto".
- **Causa raiz**: a regra de inferência listava "ADD" e "perto/longe" como gatilhos para tipo específico, sem distinguir que ADD é medida e não tipo de lente. O modelo extrapolava para "multifocais" qualquer óculos com componente de perto.
- **Correção aplicada**: adicionada regra crítica explícita em `geminiService.js` e `SKILL.md` — "Prescrição de óculos multifocais" só quando o médico usar explicitamente a palavra multifocal/progressivo/bifocal, ou descrever longe+perto na mesma armação. ADD sozinho, "grau de perto" isolado, ou tipo não verbalizado → `Prescrição de óculos` (sem qualificador).

### 2026-06-17 — Orientações de uso, adaptação e escolha de óculos injetadas na conduta

- **Erro observado**: médico orientou sobre uso do multifocal conforme necessidade, adaptação (não olhar para baixo ao andar) e escolha de armação (evitar extremos de preço, tamanho e curvatura). Essas três orientações apareceram como linhas `Orientado` na conduta.
- **Causa raiz**: a regra de exceção listava apenas casos operacionais genéricos (usar para perto, testar adaptação) mas não cobria explicitamente orientações sobre modo de uso, técnica de adaptação e critérios de escolha de armação.
- **Correção aplicada**: expandida a regra "Exceção: orientações sobre uso dos óculos" para cobrir todos os três tipos. Adicionado exemplo concreto mostrando que essas linhas vão para `descartado`. A mesma regra foi adicionada explicitamente em `src/geminiService.js`.

### 2026-05-27 — "Manutenção do óculos atual" classificada erroneamente como "Sem prescrição de óculos"

- **Erro observado**: médico disse "não precisa trocar o grau não" em consulta de retorno com paciente que já usa óculos. O modelo classificou como "Sem prescrição de óculos" em vez de "Manutenção do óculos atual".
- **Causa raiz**: a tabela de óculos não continha a linha "Manutenção do óculos atual" e não havia distinção explícita entre as duas situações. O modelo inferiu "Sem prescrição" porque viu "não precisa" sem o contexto de que se tratava de não precisar TROCAR.
- **Correção aplicada**: adicionada linha "Manutenção do óculos atual" na tabela e bloco de distinção crítica com exemplos de sinais discriminativos. A mesma distinção foi adicionada em `src/geminiService.js` no `_buildConsultationPrompt`.

### 2026-07-02 — Orientações de uso do óculos: de "descartar tudo" para "sufixo genérico"

- **Pedido do usuário**: para prescrição de óculos, a única informação clínica necessária é se é multifocal ou não. Orientações sobre adaptação/uso podem ser mencionadas de forma genérica, sem detalhar o conteúdo — nunca omitidas por completo quando existirem.
- **Comportamento anterior**: quando o médico dava qualquer orientação sobre uso, adaptação ou escolha de óculos, a regra mandava descartar completamente essa informação, registrando apenas `Prescrição de óculos [tipo]` — sem nenhum sinal de que orientação foi dada.
- **Correção aplicada**: a regra "Exceção: orientações sobre uso dos óculos" foi reformulada — quando houver qualquer orientação de uso/adaptação/escolha, acrescentar o sufixo genérico `" com orientações sobre o uso"` à própria linha de prescrição (ex.: `Prescrição de óculos multifocais com orientações sobre o uso`), sem detalhar o conteúdo. Sem orientação → prescrição pura, sem sufixo. Detalhes técnicos de lente (antirreflexo, filtro azul, tamanho, qualidade, marca) continuam sendo descartados por completo, sem sufixo — essa categoria não mudou. Mesma regra atualizada em `src/geminiService.js`.

### 2026-07-07 — Orientação de orçamento em mais de uma ótica injetada na conduta

- **Pedido do usuário**: quando o médico orienta o paciente a fazer orçamento/pesquisa de preço em mais de uma ótica, essa informação não deve ir para a conduta.
- **Causa raiz**: a lista de descarte cobria logística de retirada de óculos (`retirar na ótica`, `conferir óculos após prontos`), mas não cobria explicitamente a orientação comercial de cotação/comparação de preços. Sem exemplo, o modelo podia registrar `Orientado a fazer orçamento em mais de uma ótica` como linha de conduta.
- **Correção aplicada**: adicionada categoria "Orientação comercial/orçamento de óculos" na lista de descarte e na seção "Descarte de logística operacional" — orientar o paciente a orçar/cotar/comparar preços em óticas é orientação de compra, não decisão médica, e nunca entra em `conduta`. Mesma regra adicionada como filtro de descarte em `src/gemini-interview-agent.js`.

### 2026-07-08 — Hierarquia de nomeação da medicação prescrita (princípio ativo → grupo → genérico)

- **Pedido do usuário**: sempre que possível identificar o princípio ativo, registrá-lo; não sendo possível, registrar ao menos o grupo/classe da medicação; não sendo possível o grupo, registrar que foi prescrita alguma medicação. Nunca omitir a prescrição.
- **Comportamento anterior**: a "Associação (ATB + corticoide ocular)" era forçada de forma incondicional na blefarite pelo prompt, e o guard `_guardAssociacaoATB` no DecisionEngine **apagava** a linha por completo quando a transcrição não mencionava antibiótico/corticoide — perdendo o registro de que houve prescrição. Um colírio prescrito sem nome ("uma gota 3x/dia") não tinha nível de fallback definido.
- **Correção aplicada**: adicionada a seção "Hierarquia de nomeação da medicação prescrita" (3 níveis) na skill e no prompt (`_buildConsultationPrompt`). O nível 1 (princípio ativo) é estritamente condicionado ao nome ter sido pronunciado — nunca inferido do diagnóstico. A regra da blefarite passou a nomear o colírio pelos 3 níveis em vez de forçar sempre a classe ATB+corticoide. O guard `_guardAssociacaoATB` foi alterado de **apagar** para **rebaixar** a linha ao genérico (`Medicação ocular prescrita`), preservando a posologia. Testes `[DE-3]` (rebaixamento) e `[DE-3b]` (preservação quando a classe é mencionada) em `utils/integration-test.js`.
- **Limitação da época, resolvida (nota de 2026-11-15)**: o guard aceitava a linha `Associação (ATB + corticoide ocular)` com só antibiótico **ou** só corticoide dito. Corrigido na entrada "2026-11-15 — Antibiótico, corticoide ou os dois".

### 2026-08-03 — Colírio da blefarite ficava genérico; nível 1.5 "protocolo declarado"

- **Pedido do usuário**: ser o mais específico possível ao discriminar o colírio prescrito, colocando o nome sempre que possível. E: quando a opção for compressa + higiene + colírio em seguida, o colírio é **Tobramicina com Dexametasona**.
- **Erro observado (log 2026-08-03)**: duas consultas de blefarite no mesmo turno produziram o colírio no nível errado — "vou passar um tratamento mais forte que a blefarite está atacada" → `Associação (ATB + corticoide ocular)`; "vamos precisar passar um tratamento para desinflamar" → `Medicação ocular prescrita para desinflamar`. Nenhuma das duas nomeou o remédio.
- **Causa raiz (dupla)**:
  1. O bloco de exemplos de blefarite no prompt (`_buildConsultationPrompt`) exibia `Associação (ATB + corticoide ocular)` como *o* exemplar da blefarite. Few-shot vence prosa: o modelo copiava o exemplo em vez de seguir a regra logo abaixo.
  2. A regra de Tobramicina/Dexametasona já existia no prompt, mas com gatilho literal demais — exigia os três itens ditos (compressa **e** higiene **e** colírio) **e** a posologia "3x/dia". Nenhuma das duas falas reais casava. Além disso o bullet do combo vinha **antes** do "médico nomeou → nível 1", invertendo a precedência, e a linha seguinte ("NÃO invente nomes") dava ao modelo uma saída para ignorar o protocolo.
  3. A skill não mencionava Tobramicina em lugar nenhum — prompt e skill divergiam.
- **Correção aplicada**:
  - Criado o **nível 1.5 — protocolo declarado do médico** entre o princípio ativo e a classe, na skill e no prompt. Blefarite: compressa e/ou higiene + colírio não nomeado → `Tobramicina + dexametasona`. Gatilho afrouxado (higiene **ou** compressa basta; posologia não é exigida) e cobrindo falas vagas ("tratamento pra desinflamar", "mais forte", "pinga depois da limpeza").
  - Precedência explicitada: nível 1 (nome dito) **sempre** vence o protocolo; o protocolo apenas **nomeia** um colírio cuja prescrição já foi confirmada — nunca cria prescrição (a regra anti-invenção continua governando o *se*, o protocolo governa o *qual*).
  - Bloco de exemplos de blefarite reescrito com o nome do princípio ativo; `Associação (ATB + corticoide ocular)` aposentada na blefarite (segue válida fora dela).
  - Nível 1 reforçado no sentido positivo: marca dita sempre vira princípio ativo; checagem obrigatória antes de descer de nível. Base de conhecimento de marcas → princípios expandida (Maxitrol, Cilodex, Ciloxan, Acular, Nevanac, Lastacaft, ciclosporina, aciclovir, etc.).
  - `BLEFARITE_TRATAMENTO_PADRAO` em `scripts/sidepanel-constants.js` atualizado para o mesmo nome (constante sem uso desde então; **removida do código em 2026-11-15** — nota de 2026-11-15: os textos padrão da blefarite ficam só em `_BLEF_PAD`, no `src/DecisionEngine.js`).
  - Testes `[DE-3c]` e `[DE-3d]` em `utils/integration-test.js`: o guard `_guardAssociacaoATB` não toca em linhas nomeadas e o `hasMention` já reconhece `tobramicin|dexametason`.
- **Guard não alterado**: `_guardAssociacaoATB` só inspeciona linhas com "Associação"; uma linha nomeada passa intacta. Como efeito colateral desejado, se o modelo reincidir na forma de classe sem apoio na fala, ela continua sendo rebaixada ao genérico.

### 2026-08-04 — Plano de investigação condicional descartado como "retorno condicional vago"

- **Erro observado (log 2026-08-04)**: consulta de cefaleia atribuída a erro refrativo. O médico disse *"se resolver, perfeito; se não resolver, tem que investigar outras causas"* — e a `conduta` saiu apenas com `Prescrição de óculos multifocais com orientações sobre o uso`. O plano diagnóstico do médico não entrou no prontuário.
- **Causa raiz**: a única regra do prompt sobre condicionais era o filtro de descarte de *retornos condicionais vagos* (`retorno se piorar`, `retorno se não adaptar`). Sem um contraexemplo, o modelo classificou o plano de investigação como mais um condicional vago e o descartou.
- **Correção aplicada**: criada a categoria **plano de investigação condicional** na skill e no prompt (`_buildConsultationPrompt`), adjacente ao filtro de descarte para que os dois sejam lidos juntos. Discriminador: o condicional vago manda **voltar para rever a mesma coisa**; o plano de investigação abre **linha diagnóstica nova**. Formato: uma linha com prefixo `Orientado ` — que já é whitelist do `CONDUTA_VALIDA_RE` em `_sanitizeCondutaTratamento`, então a linha não é movida para `tratamento`. Âncora `[SKILL-SYNC]`: `prosseguir investigação de outras causas`.

### 2026-08-05 — "Óculos multifocais" prescritos sem o médico ter dito multifocal

- **Erro observado (log 2026-08-05, consulta das 17:54)**: consulta puramente refrativa (miopia + astigmatismo). A `conduta` saiu `Prescrição de óculos multifocais com orientações sobre o uso` — o médico nunca disse multifocal, progressivo nem bifocal. Como efeito em cascata, `H524 - Presbiopia` entrou no diagnóstico e foi lançada no SHOSP.
- **Causa raiz**: o 3º critério da regra de multifocal (um único óculos que atende longe **e** perto) foi lido como co-ocorrência de tokens. A única evidência de "perto" era uma **queixa sobre o óculos antigo** (*"esse aqui era muito miopia, aí incomoda demais para perto"*) e um trecho de pergunta/resposta cheio de negativas embaralhado pelo ASR (*"não é para perto, sim, para longe, não"*). O guard de presbiopia (`PADRAO_MULTIFOCAL`) lê a conduta, então a conduta fabricada sustentou o H52.4 sozinha.
- **Correção aplicada**:
  - Prompt (`src/gemini-interview-agent.js`): o 3º critério passou a exigir referência de perto **afirmativa**, atribuída ao óculos **sendo prescrito** e sem negativa/pergunta não respondida entre longe e perto. Adicionados o caso real como exemplo ❌ e a instrução de cair para `Prescrição de óculos` sempre que for preciso "reconstruir" o sentido de uma frase embaralhada.
  - Rede determinística: novo `_guardMultifocalSemEvidencia` em `src/DecisionEngine.js` — se o tipo aparece na conduta mas a palavra não está na transcrição, a linha cai para `Prescrição de óculos` (sufixo de orientações preservado). Roda **antes** de `_guardPresbiopiaObrigatoria`, senão o H52.4 sobrevive à conduta já corrigida.
  - Testes `[MULTI-1..4]` em `utils/integration-test.js`, com a fala literal do log. `[PRES-27]` teve a fixture atualizada: a conduta sozinha já não basta, a palavra precisa estar na fala.
- **Não alterado**: os critérios (a) e (b) — palavra explícita e longe+perto na mesma armação — continuam bastando por si. E os demais critérios de presbiopia (óculos para perto/leitura, menção explícita) seguem independentes: em consultas onde o médico realmente discute correção de perto, o H52.4 continua entrando sem depender da conduta.

### 2026-08-12 — Protocolo declarado da blefarite ganha rede determinística (promover, nunca criar)

- **Pedido do usuário**: quando houver a construção higiene + colírio + compressa morna, considerar **sempre** que esse colírio é `Tobramicina + dexametasona` — inclusive na **injeção do tratamento** no prontuário.
- **Situação encontrada (log 2026-08-12, retorno de blefarite)**: o nível 1.5 do prompt funcionou — a fala *"mantém o tratamento fazendo a compressa lavando com shampoo e usando colírio até ele acabar"* produziu `Tobramicina + dexametasona`. O que faltava era a **rede determinística**: nada garantia o nome quando o modelo devolvesse a linha genérica (`Medicação ocular prescrita`, `Associação (ATB + corticoide ocular)`, `Colírio`). O prompt sozinho já falhou nesse ponto em 2026-08-03.
- **Correção aplicada**: novo guard `_guardColirioBlefariteProtocolo` em `src/DecisionEngine.js`, aplicado **depois** de `_guardAssociacaoATB` — aquele rebaixa `Associação` → `Medicação ocular prescrita` quando a fala não diz antibiótico/corticoide (que é o caso desta fala), então uma passada só levanta a linha rebaixada e a que já veio genérica.
  - **Gatilho afrouxado de propósito**: evidência de blefarite pelo `_detectBlefariteEvidencia(...).qualquer` já existente (compressa+higiene, ou shampoo sozinho, ou estrutura palpebral + manejo) **mais** menção a colírio/pingar na fala. Não exige os três itens literais nem a posologia "3x/dia" — essa exigência literal foi exatamente o bug de 2026-08-03, e a fala real deste log não diz "higiene palpebral" nem a frequência.
  - **Matcher reaproveitado**: o guard usa o `_detectBlefariteEvidencia` existente em vez de um segundo detector de combo — prompt e skill divergirem foi a causa raiz nº 3 de 2026-08-03.
  - **Três limites**: (1) nível 1 vence — se qualquer linha já nomeia um princípio ativo/marca, o guard não toca em nada; (2) **promove, nunca cria** — sem linha genérica de colírio, nada é acrescentado (a regra anti-invenção continua governando o *se*); (3) linhas que não são o colírio da blefarite (lubrificante, lágrima, ômega, compressa, higiene, hipotensor, antialérgico, pomada) nunca são promovidas. A posologia da linha promovida é preservada.
- **Testes**: `[DE-PROT-1..6]` em `utils/integration-test.js`, com a fala literal do log como fixture — genérico promovido, "Colírio" cru promovido com posologia, Maxitrol intacto, ausência de colírio não gera linha, lubrificante/ômega intactos, e fora da blefarite o protocolo não se aplica. `[DE-3b]` foi movido para um contexto de conjuntivite: na blefarite, `Associação` agora é **promovida** (novo `[DE-3b2]`), como o prompt já mandava desde 2026-08-03 ("Associação aposentada na blefarite").

### 2026-08-13 — Normalidade escrita na conduta

- **Erro observado**: consulta das 12:06. O médico fechou com "os outros exames estão todos tranquilos, pressão boa, fundo de olho normal" e a conduta saiu com a normalidade agrupada na linha `Explicado ...` (junto com blefarite e olho seco). O médico: coisas óbvias não fazem sentido na conduta.
- **Causa raiz**: a instrução "Capture SEMPRE que o médico explicar algo ao paciente" não tinha carve-out para resultado normal, e a regra de agrupamento (várias explicações numa linha só) fazia a normalidade entrar de carona — uma proibição de linha literal (`"Explicado exames normais"`) não pegaria esse formato.
- **Correção aplicada**: regra ★ "NORMALIDADE NÃO VAI PARA A CONDUTA" na seção de conduta do prompt (`src/gemini-interview-agent.js`), com o caso agrupado escrito como before/after; passo **0** no teste obrigatório, antes do passo que manda explicações para a conduta; exemplos negativos na lista do teste; e nota nos dois blocos de schema JSON (primeira_consulta e retorno).
- **Escopo deliberado**: a regra é sobre **normalidade/tranquilização**, não sobre "obviedade" em geral — um detector de obviedade é ilimitado e começaria a apagar conduta real. Normalidade que faz parte de uma explicação de achado (`pressão está alta e o campo visual ainda está normal`) permanece.
- **Não é guard determinístico**: nenhum strip por substring em `DecisionEngine.js`. Guards subtrativos literais já apagaram blefarite real (2026-07-29) e fabricaram negativa de antecedentes; um regex por "normal" comeria a exceção acima.
- **Intocado**: `injectExamesNormais`, `EXAMES_NORMAIS_COMMANDS` e os templates de biomicroscopia/fundoscopia normais — "fundo de olho normal" continua sendo gatilho e o exame continua documentado.
- **Testes**: `[COND-NORM-1..3]` em `utils/integration-test.js` — regra presente com o caso agrupado, ordem do passo 0 antes do passo de explicações, e trava de escopo no gatilho de voz.
- **Complemento (mesma data, 2ª rodada do médico)**: `Explicado que a pressão ocular está normal` também sai. A regra original falava em "todos os exames" e podia ser lida como se a normalidade de **um** exame fosse fato clínico digno de registro. Explicitado no prompt (`VALE PARA UM EXAME ISOLADO TAMBÉM`: PIO/tonometria, campo visual, OCT, paquimetria) — cada um já tem campo próprio, então a linha na conduta duplica o dado. Coberto por `[COND-NORM-1]`.

### 2026-08-27 — Multifocal legítimo APAGADO pelo guard (o inverso de 2026-08-05)

- **Erro observado (log 2026-08-27, consulta das 13:04)**: paciente de 43 anos, óculos de proteção da empresa. O médico explicou o multifocal sem usar a palavra — *"tem grau de longe perto junto, aí eu vou fazer a receita, porque fazer um óculos de proteção que já corrige o grau de perto"*. O modelo acertou (`Prescrição de óculos multifocais`, com o raciocínio citando "grau de longe perto junto") e o **guard rebaixou a conduta correta** para `Prescrição de óculos`. O `H524 - Presbiopia` sobreviveu e foi lançado no SHOSP — prontuário incoerente: presbiopia diagnosticada, tipo de lente apagado.
- **Causa raiz**: `_guardMultifocalSemEvidencia` exigia a **palavra literal** na transcrição, mas o prompt (2º critério de "multifocais") e esta SKILL sempre aceitaram *"longe + perto na mesma armação"*. A rede determinística ficou mais estreita que a regra que ela protege. Divergência agravada por `_guardPresbiopiaObrigatoria` **aceitar** o par longe+perto pelo seu próprio regex — os dois guards liam a mesma evidência clínica com código separado, e só um a reconhecia.
- **Correção aplicada**:
  - Segunda porta no guard: o par longe+perto **colado** com âncora de **prescrição** na janela preserva o tipo (parâmetros na tabela da seção "Regra estrita para multifocais"). A âncora é deliberadamente mais estreita que a do guard de presbiopia (`óculos`/`grau` solto lá) — a pergunta aqui é "prescreveu multifocal agora?", não "é présbita?".
  - Helper único `_hasParLongePertoAncorado(cleanText, ancoraRe)` em `src/DecisionEngine.js`, usado pelos **dois** guards, cada um com sua âncora. Duas cópias do mesmo regex foi o que permitiu a divergência.
- **Não regride 2026-08-05**: a adjacência exigida no par derruba sozinha o trecho embaralhado daquele log ("não é para perto, sim para longe, não" tem palavra no meio) — `[MULTI-1]` continua verde sem nenhuma exceção especial. Nenhum parser de negativas foi introduzido.
- **Testes**: `[MULTI-5]` com a fala literal de 2026-08-27 (preserva "multifocais"), `[MULTI-6]` par longe+perto **sem** prescrição na janela ("os óculos estão bons, enxerga de longe e de perto") ainda rebaixa, `[MULTI-7]` par separado por outras palavras ainda rebaixa, `[MULTI-8]` pina o limite declarado (critério 2 sem verbo de prescrição é rebaixado de propósito). `[MULTI-1..4]` e `[PRES-1..28]` intactos.

### 2026-09-15 — `Tobramicina + dexametasona` injetada sem colírio na fala (o protocolo criou a prescrição)

- **Erro observado (log 2026-09-15, consulta das 12:01)**: primeira consulta com irritação ocular e diabetes. O médico disse *"vou passar um tratamento para a senhora fazer para melhorar essa irritação, isso é coisa simples"* e prescreveu compressa/limpeza de manhã e no fim do dia, *"um lubrificante, pode pingar quantas vezes quiser, pode comprar sem receita"* e ômega 3. O tratamento saiu com `Tobramicina + dexametasona` — o raciocínio do modelo: *"conforme protocolo para blefarite após higiene/compressa e prescrição de colírio para irritação"*. Nenhum colírio além do lubrificante foi prescrito: um corticoide inexistente entrou no prontuário.
- **Causa raiz (dupla)**:
  1. O afrouxamento de 2026-08-03 ("vale mesmo quando a fala é vaga: *um tratamento pra desinflamar*, *um tratamento mais forte*") não dizia o que **não** conta. O modelo leu o anúncio do pacote ("um tratamento para melhorar a irritação") como o colírio, e o único *pingar* da consulta — o do lubrificante — como o colírio a pingar em seguida. O `falaTemColirio` do `_guardColirioBlefariteProtocolo` tinha a mesma cegueira (`/pingar|colírio/` solto).
  2. A rede de 2026-08-12 só **promove** linha genérica. A linha que o próprio modelo escreve com o nome do protocolo não era conferida por ninguém — `[DE-3c]` inclusive garante que ela passe intacta.
- **Correção aplicada**:
  - Prompt (`src/gemini-interview-agent.js`) e esta skill: *"O lubrificante NÃO é o colírio da blefarite"* na definição do protocolo; lista ✅/❌ do que conta como "o colírio" (colírio/gota/pingar que não é o lubrificante; intenção anti-inflamatória "mais forte"/"desinflamar") e do que não conta (lubrificante; anúncio do tratamento seguido da própria lista); teste obrigatório de apontar o trecho da fala antes de escrever o protocolo; exemplo ❌ com a fala deste log.
  - `DecisionEngine.js`: detector único `_falaTemColirioDaBlefarite` — `colírio` que não é *lubrificante/lágrima/pressão/alergia/dilatação* nas 3 palavras seguintes nem negado ("sem colírio nenhum"); `pingar`/`gota` cujo objeto não é esse produto — objeto dito logo depois decide ("pinga o lubrificante" não conta; "pinga esse aqui" conta, mesmo com o lubrificante citado em seguida); sem objeto dito, janela de ±6 palavras ("um lubrificante, pode pingar quantas vezes quiser" não conta); ou a intenção anti-inflamatória. Usado pelo guard de **promoção** e pelo novo **`_guardColirioBlefariteSemPrescricao`**, que remove a linha `Tobramicina + dexametasona` quando a fala não pronuncia o remédio e não tem esse colírio.
  - **Remove, não rebaixa**: `Medicação ocular prescrita` continuaria afirmando uma prescrição que não houve (regra anti-invenção). Como o ASR pode ter comido a palavra, o médico recebe aviso para acrescentar manualmente.
- **Não alterado**: "tratamento mais forte" (2026-07-07, 2026-08-03) e "pra desinflamar" seguem acionando o protocolo; remédio pronunciado (nível 1) nunca é removido; `[DE-3c]` e `[DE-PROT-1..7]` intactos.
- **Testes**: `[DE-PROT-8..14]` em `utils/integration-test.js` (fala do log como fixture; `[DE-PROT-14]` pina "pinga esse aqui" + lubrificante logo depois; `[DE-PROT-10]`, `[DE-PROT-12]` e `[DE-PROT-14]` conferidos por mutação — ficam vermelhos sem o ramo que guardam) e âncora `[SKILL-SYNC]` "O lubrificante NÃO é o colírio da blefarite".
- **Pendente**: o `H010 - Blefarite bilateral` da mesma consulta foi lançado no SHOSP. Se a compressa/higiene não foi dita, o diagnóstico também foi inferido sem base — conferir com a transcrição completa (o log mostra só 120 caracteres por linha).

### 2026-10-30 — Princípio ativo primeiro; marca dita entre parênteses

- **Decisão do médico**: o registro prioriza sempre o princípio ativo; quando o nome comercial foi citado na consulta, ele aparece entre parênteses após o princípio (`Moxifloxacino + dexametasona (Vigadexa)`). Princípio dito sozinho não ganha marca.
- **Correção aplicada**:
  - Prompt (`src/gemini-interview-agent.js`) e esta skill: regra do nível 1 reescrita (o nome comercial dito vai entre parênteses logo após o princípio ativo); exemplos de Vigadexa e Maxitrol atualizados.
  - Léxico (`config/medicamentos-lexico.js`): campo `marcas` por entrada e `nomeRegistrado()`; o agente de medicamentos compõe `Princípio (Marca)`.
  - Lubrificantes: marca dita → `Lubrificante ocular (Marca)` (sem inferir princípio); princípio dito (hialuronato, carmelose) é registrado como dito.
  - Base de conhecimento: `Optive Fusion` saiu do grupo da ciclosporina (é lubrificante).
- **Não alterado**: marca fora da base e nome destruído pelo ASR continuam sem marca entre parênteses (genérico `Medicação ocular prescrita`).
- **Testes**: `[LEXICO-6..9]`, corpus `marca-*` em `utils/agents-test.js` e âncora `[SKILL-SYNC]` "o nome comercial dito vai entre parênteses".

### 2026-11-11 — Nome do colírio em uso ia para o colírio novo; "para" lido como "parar"

- **Origem**: revisão da estrutura de medicamentos (13 casos montados e rodados contra o código; não vieram de log de consulta).
- **Erros confirmados**:
  1. Guard 2g: paciente em uso de Xalatan + colírio novo sem nome → `Latanoprosta (Xalatan) 4x/dia por 7 dias`, sem aviso. Na blefarite de quem usa timolol, o colírio do protocolo virava `Timolol 3x/dia`, porque o 2g roda antes do protocolo.
  2. Guard 2e: "mantém o timolol **para** a pressão" contava como suspensão; o tratamento ficava vazio e o painel gravava "Nega uso de tratamentos".
  3. "trometolol" era timolol para o modelo (correção de ASR do agente) e Cetorolaco para os guards (curinga do léxico sobre a fala crua).
  4. A restauração de nomes do léxico (`restaurarVariantesAsr`) desistia em silêncio com espaço duplo, espaço nas pontas ou quebra de linha — sempre presente na fase 2 da dilatação.
- **Correção aplicada**:
  - Guard 2g: remédio que já consta em `medicacoes_em_uso` só nomeia a linha do `tratamento` idêntica à de `medicacoes_em_uso`; novo passo `_avisoTratamentoSemNomeRemedioEmUso` avisa o médico quando a linha termina sem nome.
  - Guard 2e: depois do nome, só as formas do verbo ("parar", "parou", "pare", "para de") contam como suspensão.
  - Léxico: "trometolol" e "timetolol" entram na entrada `timolol` (a forma exata vence o curinga do cetorolaco); a correção duplicada saiu do agente de entrevista.
  - Léxico: `restaurarVariantesAsr` casa sobre uma cópia alinhada caractere a caractere e devolve o resto do texto idêntico.
  - Prompt: o nome dito vale só para o remédio a que se refere.
- **Limitação conhecida**: colírio mantido que o modelo escreve como classe no `tratamento` e com nome em `medicacoes_em_uso` ("continua com o colírio da pressão") sai em duas linhas (`Colírio hipotensor ocular 2x/dia` e `Timolol 2x/dia`), com aviso. Sem saber se a linha é nova ou mantida, juntar as duas arriscaria apagar um colírio novo.
- **Decidido pelo médico (2026-11-11)**: "trometolou" é Cetorolaco. O prompt e esta skill o citavam como exemplo de nome ilegível que vira `Medicação ocular prescrita`, enquanto o léxico e a base de marcas já diziam Cetorolaco; os dois textos foram corrigidos e o exemplo de nome ilegível passou a ser uma palavra que não aponta nome nenhum. Teste `[DE-3c-CETOROLACO]`.
- **Testes**: `[MED-USO-1..6]`, `[DE-3h2]`, `[DE-3h3]`, `[MED-ASR-1..5]` em `utils/integration-test.js`.

### 2026-11-11 — "Timolol" virou "Brimonidina + timolol (Combigan)"; remédio e marca não pronunciados

- **Erro observado (log de consulta)**: o paciente disse "timolol" duas vezes por dia e o prontuário recebeu `Brimonidina + timolol (Combigan) 2x/dia`. O modelo completou a monoterapia com uma associação e uma marca que ninguém disse.
- **Correção aplicada**:
  - Prompt, esta skill e a de transcrição: regra anti-associação e anti-marca não dita (monoterapia dita não vira associação; marca entre parênteses só se foi pronunciada).
  - Guard 2g, direção inversa (`_corrigirNomeNaoPronunciado`): linha que nomeia remédio, associação ou (Marca) que a fala não pronunciou é corrigida para o remédio dito, com a posologia. Substitui primeiro o remédio dito cujos princípios estão todos na linha; na falta dele, o remédio dito da mesma classe.
  - A troca "pela classe" não acontece se o remédio dito já tem linha própria no campo, nem — no `tratamento` — se ele já consta em `medicacoes_em_uso` e a linha não é a mesma (regra do colírio novo). Quando o princípio é trocado, o médico recebe aviso.
- **Como chegou ao repositório**: a correção foi escrita numa cópia antiga do projeto (pasta do Drive) e copiada por cima do clone, o que trocou seis arquivos por versões de dias antes. Foi refeita sobre a versão atual; nada da cópia antiga entrou.
- **Testes**: `[MED-NOME-11]`, `[MED-NOME-12]`.

### 2026-11-11 — Uma lista só de nomes de remédio

- **Problema**: os nomes de remédio estavam em sete listas escritas à mão no `DecisionEngine` (colírio já nomeado, protocolo pronunciado, antibiótico na fala, remédio crônico, lubrificante nomeado, vocabulário de ruído, evidência de glaucoma), mais a base de marcas do prompt e três correções de voz no agente de entrevista. Elas divergiam: a do Guard 2b reconhecia 14 dos 84 nomes do léxico e escrevia "fluorometolon" onde o léxico diz "Fluormetolona".
- **Correção aplicada**: `config/medicamentos-lexico.js` passou a gerar tudo — `montarBaseDoPrompt()` para o prompt; `fonteDeClasse()`, `fonteDoRemedio()` e `contarMencoes()` para os guards; `PROTOCOLOS` para o nome do colírio da blefarite; `PALAVRAS_DE_CLASSE` para "a fala disse a classe". Remédio que os guards só precisam reconhecer, sem nomear, fica em `EXTRAS_DE_CLASSE`.
- **O que muda no comportamento**: nenhuma lista deixou de reconhecer nada (comparação em 240 termos); todas passaram a reconhecer as marcas que faltavam (Xalatan, Vigamox, Zymar, Maxidex, Pred Fort, FML…). Na base do prompt, "Maleato de timolol" virou "Timolol" e os subgrupos de glaucoma viraram uma lista só.
- **Regra para quem mexer**: marca nova, princípio novo ou variante de voz entra **só** no léxico. Lista de remédios escrita em outro arquivo é barrada pelo teste `[LEXICO-UNICO-1]`.
- **Testes**: `[LEXICO-UNICO-1..7]`.

### 2026-11-12 — Texto padrão do tratamento só quando nenhum medicamento foi mencionado

- **Regra do médico**: quando não houver nenhum medicamento mencionado na conduta, escrever "Nega uso de tratamentos". Já era o comportamento do painel; faltava a exceção.
- **Correção aplicada**: um só ponto decide o texto (`tratamentoPadrao`), usado pela tela e pela injeção; o guard `_guardTratamentoVazioComMedicacao` suprime o texto quando a fala prescreve ou mantém medicação e o tratamento ficou vazio, avisando o médico. A injeção manual também respeita a flag (`suprimirTextoPadraoTratamento`): sem isso, clicar em Injetar com o campo vazio repunha o texto.
- **Medição em andamento (modo sombra)**: o modelo também devolve `medicacoes_itens`, uma lista estruturada da mesma medicação (nome, nível, novo/mantido/suspenso, posologia, trecho da fala). O `DecisionEngine` só a compara com o `tratamento` e registra no console; **não escreve no prontuário**. A saída desta skill (`tratamento_sugerido`) não muda.
- **Testes**: `[TRAT-1..9]`, `[MED-SOMBRA-0..8]`.


### 2026-11-15 — Antibiótico, corticoide ou os dois: três situações (limitação do `hasMention` resolvida)

- **Pedido do usuário**: blefarite usa a associação tobramicina + dexametasona; outras patologias usam **só** corticoide ou **só** antibiótico. São três situações diferentes.
- **Comportamento anterior**: o `hasMention` do `_guardAssociacaoATB` era um OR — bastava a fala citar antibiótico **ou** corticoide para a linha `Associação (ATB + corticoide ocular)` sobreviver, afirmando a classe que não foi dita.
- **Correção aplicada**: o guard agora separa a fala em `falaAntibiotico` e `falaCorticoide` (novo, em `_listasDoLexico`). Os dois ditos → mantém a associação; só antibiótico → `Colírio antibiótico`; só corticoide → `Colírio corticoide`; nenhum → `Medicação ocular prescrita`. Posologia preservada. Prompt (`gemini-interview-agent.js`) e esta skill ganharam a tabela das três situações.
- **Testes**: `[DE-3e]` (só antibiótico), `[DE-3f]` (só corticoide) e `[DE-3g]` (os dois mantêm a associação) em `utils/integration-test.js`.

### 2026-11-15 — Tratamento padrão da blefarite (pacote recorrente)

- **Pedido do usuário**: criar injeção padrão para a blefarite — compressa morna, higiene (com xampu infantil ou gel de higiene palpebral: Hialurop ou Blephagel), lubrificante e ômega 3 oral; e a mesma versão acrescida de tobramicina + dexametasona. O gatilho deve ser pautado pelas orientações dadas ao paciente.
- **Correção aplicada**: novo guard `_guardBlefaritePadrao` (ver seção "Tratamento padrão da blefarite"). Promove e padroniza, nunca cria. Produto da higiene lido da fala. Testes `[BLEF-PAD-1..5]`; testes `[DE-PROT-*]` e `[LUB-10]` atualizados para o texto padronizado; vault ganhou o passo.
- **Decisão assumida (não confirmada)**: higiene orientada sem produto dito → xampu infantil; frequências padrão (compressa 2x/dia, higiene 3x/dia, colírio 3x/dia após a higiene) vêm do padrão já existente do consultório.

### 2026-11-15 — Revisão independente (Fable): correções dos achados críticos e importantes

- **C1** — remédio citado como história de **terceiro** ("minha mãe pinga Xalatan") ou **passado** ("ano passado usei Tobrex"), ou sem verbo de prescrição/manutenção perto, não nomeia mais o colírio novo: a linha fica genérica e o médico é avisado (Guard 2g).
- **C2** — `trocar/tirar/"não precisa mais"/"não pingo mais"` contam como suspensão no Guard 2e; "continuar acompanhando/vindo/retorno" não conta como manter remédio.
- **C3** — o protocolo da blefarite exige **cuidado palpebral orientado** (higiene/lavagem de pálpebra ou cílios, ou compressa + xampu/sabonete). "Shampoo" ou "pálpebra" soltos não bastam; calázio/terçol sem a palavra blefarite não usam o pacote.
- **C4** — na blefarite, classe dita **sozinha** ("colírio de antibiótico") ou **negada** ("sem corticoide") não é promovida a Tobramicina + dexametasona.
- **I1** — o padrão da blefarite só preenche a linha "pelada" ("Compressa morna"); posologia, tempo ou produto ditos são preservados. Gel/Hialurop/Blephagel ditos vencem o produto da linha.
- **I2** — a exceção do tratamento vazio reconhece "pinga", "passa", "passe", "coloca", "aplica".
- **I3** — rebaixar "Associação" preserva posologia sem número ("de manhã e à noite").
- **I4** — "Colírio corticoide / antialérgico / hipotensor" sem apoio na fala é rebaixado a "Medicação ocular prescrita" (antes só o antibiótico era conferido).
- **I5** — "o colírio continua normal" / "pode parar o colírio" não sustentam a Tobramicina do protocolo.
- **Pendente (depende do médico):** frequências padrão quando não ditas; calázio/terçol com pacote próprio; "lágrima artificial" como lubrificante; colírio contínuo sem menção; "mantido" genérico em retorno.
- **Testes:** `[REV-C1..C4]`, `[REV-I1..I5]`.

### 2026-11-15 — Medicação de outra pessoa e medicação anterior

- **Pedido do usuário**: não usar medicação de outras pessoas na consulta; medicação anterior, somente oftalmológica, vai nos antecedentes oculares.
- **Regra**: remédio de familiar/terceiro ("minha mãe pinga Xalatan") não entra em `medicacoes_em_uso`, `tratamento` nem em lugar nenhum (a doença do familiar segue em `antecedentes_familiares`, sem o remédio). Remédio oftalmológico **anterior** ("ano passado usei Tobrex") sai de uso/tratamento e vai em `antecedentes_oftalmologicos` como `Uso prévio de <nome dito>`. Anterior não oftalmológico não é registrado. Se qualquer citação do remédio é atual (em uso, prescrição, manutenção), nada é mexido.
- **Implementação**: prompt (`gemini-interview-agent.js`, regra junto de `medicacoes_em_uso`) + guard `_guardMedicacaoDeOutraPessoa` (`DecisionEngine.js`). O guard só remove linhas que nomeiam o remédio; `medicacoes_em_uso` esvaziado volta ao padrão "Nega uso de medicações oculares" (contrato do prompt). Em retorno não há antecedente a criar: só sai de uso.
- **Testes**: `[OUTRA-1..4]`.

### 2026-11-15 — Sequência padrão da blefarite (compressas → higiene → "pingar este colírio 3x ao dia")

- **Pedido do usuário**: toda vez que vier a sequência compressas, higiene e pingar este colírio 3x ao dia, o colírio é necessariamente a tobramicina com dexametasona; fazer disso um padrão de injeção.
- **Regra**: a fala traz, **nesta ordem**, compressa(s) → higiene (xampu infantil, gel Hialurop ou Blephagel) → pingar/colírio/gota **3 vezes ao dia** (`3x` ou "três vezes"). Então o tratamento recebe o **pacote completo**: `Compressa morna…`, `Higiene palpebral com <produto>…` e `Tobramicina + dexametasona 3x/dia após higiene palpebral` — inclusive quando o modelo esqueceu uma das linhas ou devolveu só o genérico (o lastro é a própria sequência dita).
- **Não dispara** quando: o colírio da sequência é lubrificante/lágrima/hipotensor/antialérgico/dilatação; outro remédio é **nomeado** na fala (nível 1 vence); a fala restringe a classe ("só antibiótico", "sem corticoide"); a ordem está invertida; não há frequência de 3 vezes.
- **Implementação**: guard `_guardBlefariteSequenciaPadrao` (`DecisionEngine.js`, antes do protocolo 1.5); `_guardBlefaritePadrao` padroniza o texto de cada linha. Testes `[SEQ-1..3]`.

### 2026-11-15 — Lubrificante: dois momentos (atendimento × conduta)

- **Pedido do usuário**: o médico não prescreve nome comercial; "lágrima artificial", "colírio para limpar o olho" e "lágrima" são termos leigos do **paciente** e valem para o **atendimento**, não para a conduta.
- **Momento 1 — Atendimento (fala do paciente → `medicacoes_em_uso`)**: "lágrima artificial", "lágrima" dita como produto, "colírio para limpar/hidratar/lubrificar o olho" = lubrificante → `Lubrificante ocular` (marca entre parênteses só se o paciente a disse; nunca princípio nem o registro padrão). "Lágrima" como sintoma ("muita lágrima") **não** é produto.
- **Momento 2 — Conduta/tratamento (fala do médico → `tratamento`)**: termo leigo do paciente não cria nem nomeia prescrição; **marca nunca vai em tratamento** (o guard 2f tira "(Systane)" da linha); o médico dizendo "lubrificante" → `Carmelose sódica ou hialuronato de sódio`; princípio dito (hialuronato, carmelose) vence o padrão.
- **Implementação**: léxico (`config/medicamentos-lexico.js`: frases leigas reconhecidas; "lágrima" solta de fora) + base do prompt + regra no prompt do Gemini + Guard 2f (`_guardLubrificanteGenerico`). Testes `[LUB-4]`, `[LUB-11..13]`.
- **Pendente de decisão**: a regra "médico não prescreve marca" foi aplicada só ao lubrificante; outros colírios (ex.: `Latanoprosta (Xalatan)` no tratamento) seguem a decisão antiga de manter a marca dita entre parênteses.
