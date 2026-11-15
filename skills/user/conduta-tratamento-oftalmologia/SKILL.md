---
name: conduta-tratamento-oftalmologia
description: "Extrai, normaliza e valida o campo conduta em consultas oftalmológicas. Use quando o usuário apresentar transcrição de consulta, resumo clínico ou saída estruturada e precisar separar conduta de tratamento, registrar retornos, encaminhamentos, prescrição de óculos, solicitação de exames, orientações verbais, suspensão de medicação e descartar logística operacional. Também use para evitar expressões proibidas como atualização de grau e para marcar revisão manual quando a conduta estiver ambígua. Use também quando o campo tratamento saiu com remédio ou colírio que o médico não prescreveu (tratamento fabricado), antes de suspeitar dos gatilhos de injeção, e sempre que esta própria skill tiver errado e precisar ser corrigida."
metadata:
  author: fuad-ibrahim
  version: "1.0"
  domain: oftalmologia
---

# Conduta Oftalmológica

## Onde isso REALMENTE roda (autoridade)

> ⚠️ **A cópia que executa em produção é o prompt do Gemini em
> `src/gemini-interview-agent.js` (`_buildConsultationPrompt`, blocos `- conduta:` e
> `- tratamento:` dentro de `CAMPOS:`, mais a base de marcas, gerada do léxico por
> `montarBaseDoPrompt()`).** No mesmo arquivo,
> `_sanitizeCondutaTratamento` e `_garantirExamesPedidosNaConduta` corrigem a saída;
> depois vêm os guards de `src/DecisionEngine.js` (lista completa e ordem em
> `vault/agentes/decision-engine.md`) e o léxico `config/medicamentos-lexico.js`.
> Editar esta skill NÃO muda a extensão. Regra geral: `skills/user/README.md`.

## Como esta skill está dividida

| Arquivo | Conteúdo |
|---|---|
| `SKILL.md` (este) | campo `conduta`: óculos, retornos, exames, encaminhamentos, orientações, logística descartada |
| `TRATAMENTO.md` | campo `tratamento` e nomes de remédio: hierarquia de nomeação, antibiótico × corticoide, lubrificante, blefarite, medicação de outra pessoa, tratamento vazio |
| `HISTORICO.md` | registro datado dos erros e das decisões do médico (não é regra vigente) |

Havendo qualquer colírio, pomada, lubrificante, compressa, higiene palpebral ou ômega 3 na
consulta, leia `TRATAMENTO.md` antes de responder.

## Quando usar esta skill

Use esta skill quando precisar preencher, revisar ou corrigir o campo `conduta` em registros oftalmológicos derivados de:

- Transcrições de consulta médica.
- Resumos clínicos ditados pelo médico.
- Saídas JSON de extração de prontuário.
- Revisões de casos em que houve confusão entre `conduta` e `tratamento`.
- Casos com prescrição de óculos, retorno, encaminhamento, solicitação de exames, orientações verbais, suspensão de colírio ou logística pós-consulta.

Pode ser usada junto de uma skill maior de transcrição de consulta oftalmológica, mas funciona de forma autônoma.

## Objetivo

Produzir uma string de conduta clinicamente útil, concisa e segura, contendo apenas decisões médicas, administrativas clínicas e orientações ao paciente verbalizadas pelo médico.

Se não houver conduta clara, retorne `null`. Nunca invente uma conduta a partir de achados, diagnósticos ou valores de exame isolados.

## Princípios críticos

1. Extraia apenas decisões verbalizadas ou claramente prescritas pelo médico.
2. Não transforme tratamento medicamentoso em conduta.
3. Não transforme logística da clínica em conduta.
4. Não use expressões vagas quando houver forma clínica mais precisa.
5. Preserve lateralidade, prazo, frequência e tipo de óculos quando estiverem claros.
6. Se houver ambiguidade relevante, preencha a melhor conduta segura e marque revisão manual.

## Fonte permitida

O campo `conduta` deve vir do que o médico orienta, decide, solicita, prescreve como ação não medicamentosa ou agenda como seguimento.

Não use fala isolada do paciente como conduta, exceto quando o médico confirma e transforma aquilo em decisão clínica.

## O que entra em conduta

Inclua em `conduta`:

- Retorno com prazo definido: `Retorno 1 mês`, `Retorno 6 meses`, `Retorno anual`.
- Encaminhamento: `Encaminhamento: Dermatologista`, `Encaminhamento: Retina`.
- Prescrição de óculos: `Prescrição de óculos`, `Prescrição de óculos multifocais`.
- Solicitação de exames: `Solicitar campo visual`, `Solicitar OCT de mácula`.
- Orientações e explicações dadas ao paciente: `Orientado: evitar coçar os olhos`, `Explicado diagnóstico e sinais de alerta`. Compressa morna e higiene palpebral **não** entram aqui: são `tratamento`.
- Suspensão ou alteração de conduta medicamentosa: `Suspender Xalatan`.
- Observação clínica planejada: `Acompanhar evolução`, apenas se houver contexto específico ou prazo.
- Procedimentos ou programação clínica: `Programar capsulotomia YAG`, `Indicar facoemulsificação`, se verbalizado pelo médico.
- Plano de investigação condicional: `Orientado prosseguir investigação de outras causas se não houver melhora com a correção óptica`.

## O que não entra em conduta

Não inclua em `conduta`:

- Nomes e posologias de colírios ou medicamentos prescritos. Isso vai em `tratamento`.
- Logística operacional da clínica: `retirar exames`, `pagar na recepção`, `agendar na recepção`, `entregar receita`.
- Logística pós-consulta de óculos: `conferir óculos após prontos`, `retirar na ótica`.
- Orientação comercial/orçamento de óculos: `orientado a fazer orçamento em mais de uma ótica`, `pesquisar preço em várias óticas`, `cotar valor das lentes`, `comparar preços`. Isso é orientação de compra ao paciente, não decisão médica, e nunca entra em `conduta`.
- Retornos condicionais vagos quando já existe retorno com prazo.
- Frases genéricas sem decisão clínica: `acompanhar`, `observar`, `orientado`, sem objeto ou prazo.
- Valores isolados de exame sem decisão médica explícita.
- Afirmações de normalidade ou tranquilização: `Explicado exames normais`, `pressão boa`, `fundo de olho normal`, `sem alterações`, `tranquilizado quanto à normalidade dos exames`. O resultado normal já é documentado na biomicroscopia/fundoscopia (ou pelo template de exames normais) — repeti-lo na conduta é ruído. Vale para **um exame isolado** também, não só para "todos os exames": `Explicado que a pressão ocular está normal`, `Explicado PIO normal`, `Explicado que o campo visual veio normal` — cada um desses tem campo próprio no prontuário (a PIO vem da tonometria), então reescrevê-los como "explicação" é duplicar o dado. Isso vale também **dentro de uma linha agrupada**: em `Explicado blefarite, olho seco e exames normais`, descarte só a cláusula de normalidade → `Explicado blefarite e olho seco`. Se a normalidade era a única explicação, não emita linha nenhuma. Exceção: quando o normal faz parte de uma explicação de achado ou prognóstico real (`Explicado que a pressão está alta e o campo visual ainda está normal`), a linha fica.
- Detalhes técnicos sobre o óculos prescrito: tipo de revestimento (antirreflexo), filtro de luz azul, tamanho/campo da lente, qualidade da lente, marca ou material. Esses detalhes são padrão da ótica e nunca entram em `conduta`, mesmo que o médico os tenha comentado com o paciente.

## Separação entre conduta e tratamento

### Conduta

Use para decisões e orientações não farmacológicas:

- `Retorno anual`
- `Prescrição de óculos multifocais`
- `Encaminhamento: Dermatologista`
- `Solicitar campimetria computadorizada`
- `Suspender colírio em uso`, se o médico mandar suspender

### Tratamento

Não registre em conduta. Envie para `tratamento`:

- Colírios novos ou mantidos com posologia.
- Pomadas oftalmológicas.
- Medicamentos orais.
- Lubrificantes oculares.
- Ômega 3 e suplementos.
- Compressa morna e higiene palpebral (ações físicas do paciente).

Como nomear o remédio, o que fazer na blefarite, o lubrificante, a medicação de outra pessoa e o
campo sem medicamento (`Nega uso de tratamentos`) estão em `TRATAMENTO.md`. Resumo do que mais
pesa na separação:

- Um tratamento só existe se o médico o prescreveu na fala. Diagnóstico não gera tratamento.
- Suspender um remédio é `conduta`; o remédio novo, com posologia, é `tratamento`.
- Nenhum medicamento mencionado → `tratamento_sugerido: null` (o painel escreve o texto padrão).

## Orientações e explicações verbais do médico

Orientações verbais sobre mudança comportamental, proteção ocular, sinais de alerta, natureza do diagnóstico, prognóstico, necessidade de acompanhamento ou justificativa de exames devem entrar em `conduta`, mesmo quando ditas de forma coloquial.

> ⚠️ **Exceção crítica:** compressa morna, higiene palpebral, xampu, lubrificante ocular e ômega 3 são **ações físicas executadas pelo paciente** — pertencem sempre ao campo `tratamento`, mesmo que o médico as tenha orientado verbalmente.

Todas as explicações e orientações verbais do médico ao paciente devem ser fundidas em **uma única linha de texto corrido**, separadas por ponto e vírgula, iniciando com o prefixo `Orientado:`.

- Se houver apenas um item, escreva como linha única normal.
- Se não houver nenhum, não gere essa linha.
- Mantenha cada fragmento curto e telegráfico — sem frases completas com sujeito e verbo.

Exemplos:

```text
"Evita coçar os olhos."
conduta: "Orientado: evitar coçar os olhos"

"Se tiver dor forte, piora da visão ou vermelhidão importante, procura atendimento."
conduta: "Orientado: procurar atendimento se dor intensa, piora visual ou hiperemia"

"Expliquei que é uma catarata inicial e que por enquanto vamos acompanhar."
conduta: "Orientado: catarata inicial, acompanhamento por enquanto"

"A dor de cabeça que você sente é pelo grau dos olhos — com os óculos novos deve melhorar."
conduta: "Orientado: cefaleia relacionada ao grau refrativo"

Múltiplos itens combinados:
conduta: "Orientado: glaucoma assintomático com PO normal requer acompanhamento; catarata senil com cirurgia apenas se sintomática."
⚠️ Nota: orientações sobre adaptação a multifocal/escolha de lente NÃO entram nessa linha — ver seção "Exceção: orientações sobre uso dos óculos" abaixo.

"Pega um algodão com água morna e deixa dois minutinhos." (compressa)
"Faz uma espuma com xampu infantil e lava os cílios." (higiene)
→ as duas vão em TRATAMENTO, não em conduta (texto de cada linha: `TRATAMENTO.md`, seção 7)
```

### Exceção: orientações sobre uso dos óculos

Nunca detalhe orientações operacionais ou adaptativas sobre uso dos óculos, mesmo que tenham sido ditas pelo médico. Isso inclui qualquer tipo de instrução sobre **como usar**, **como adaptar** e **como escolher** óculos, armação ou lentes — postura, técnica de adaptação, prazo, preço, tamanho, curvatura ou material.

Nunca crie uma linha `Orientado` separada para esse conteúdo e nunca detalhe:

- `Usar os óculos para perto` / `para longe` / `para dirigir`.
- `Testar adaptação dos óculos` / `Conferir os óculos após ficarem prontos`.
- `Orientado sobre uso de óculos multifocais conforme necessidade`.
- `Orientado sobre adaptação a óculos multifocais` (postura, posição da cabeça, técnica).
- `Orientado sobre escolha de lentes e armação` (preço, tamanho, curvatura, material).

Em vez de omitir ou detalhar, registre a orientação de forma **genérica**, como sufixo da própria linha de prescrição:

- Se o médico deu **qualquer** orientação sobre uso/adaptação/escolha (mesmo breve) → acrescente `" com orientações sobre o uso"` à prescrição.
- Se o médico **não** deu nenhuma orientação sobre uso → registre apenas a prescrição, sem sufixo.

```text
Entrada:
Médico prescreve multifocal, orienta sobre uso conforme necessidade, explica que não deve olhar para baixo ao andar e aconselha sobre armação (evitar extremos de preço e curvatura).

Saída:
conduta: "Prescrição de óculos multifocais com orientações sobre o uso"
descartado: null
```

```text
Entrada:
Médico prescreve óculos para longe, sem nenhuma orientação adicional sobre uso.

Saída:
conduta: "Prescrição de óculos para longe"
descartado: null
```

O tipo (multifocal ou não) continua sendo a informação clínica central — o sufixo apenas sinaliza, de forma genérica, que houve orientação sem reproduzir seu conteúdo.

## Regra de óculos

Nunca escreva `Atualização de grau`, `Mudança de grau`, `Novo grau` ou `Ajuste de grau`.

Use sempre a estrutura `Prescrição de óculos`, especificando o tipo quando possível. A conduta registra apenas **se** a lente é multifocal ou não; revestimento antirreflexo, filtro de luz azul, tamanho de lente, qualidade e marca são descartados, tenham sido recomendados ou desaconselhados pelo médico.

| Situação | Conduta correta |
|---|---|
| Médico prescreve óculos sem especificar tipo | `Prescrição de óculos` |
| Médico menciona multifocal, progressivo ou bifocal | `Prescrição de óculos multifocais` ou o tipo dito |
| Médico menciona apenas longe | `Prescrição de óculos para longe` |
| Médico menciona apenas perto | `Prescrição de óculos para perto` |
| Paciente já usa óculos e médico muda o grau | `Prescrição de óculos [tipo]` |
| Paciente já usa óculos e médico MANTÉM o grau atual | `Manutenção do óculos atual` |
| Médico não vai prescrever (óculos não indicado) | `Sem prescrição de óculos` |

⚠️ **DISTINÇÃO CRÍTICA — "Manutenção do óculos atual" vs "Sem prescrição de óculos":**

`Manutenção do óculos atual` → paciente JÁ USA óculos e médico mantém o grau atual.
Sinais: "não precisa trocar o grau", "o grau está parecido", "grau praticamente igual",
"os óculos ainda servem", "mantém os óculos que tem", "pode continuar com os óculos atuais".

`Sem prescrição de óculos` → médico declara que o paciente NÃO PRECISA DE ÓCULOS.
Sinais: "não precisa de óculos", "grau não justifica óculos", "sem indicação de óculos no momento".

❌ ERRO CRÍTICO: "não precisa trocar o grau" ≠ "Sem prescrição de óculos".
"Não precisa trocar o grau" = paciente já usa óculos e vai CONTINUAR com os mesmos → `Manutenção do óculos atual`.

O guard `_guardManutencaoOculos` do `DecisionEngine` aplica a mesma leitura por código: além de "não precisa trocar o grau", reconhece "os óculos estão servindo/bons" e "não precisa trocar de óculos / os óculos" como manutenção (2026-11-10). O guard de presbiopia lê também "óculos para perto/leitura" dito na conduta.

Quando forem prescritos óculos multifocais, progressivos ou bifocais, isso deve ficar explicitamente documentado na conduta como `Prescrição de óculos multifocais`, salvo se o médico usar outro tipo específico que deva ser preservado.

Se o tipo de óculos estiver ambíguo, use `Prescrição de óculos` e não invente o tipo.
⚠️ **Regra estrita para "multifocais" — só com palavra explícita:**

`Prescrição de óculos multifocais` exige que o médico tenha usado **explicitamente** uma das palavras: *multifocal*, *progressivo*, *lente progressiva*, *bifocal* — ou descrito claramente longe + perto na mesma armação.

**Não qualifica como multifocal:**

| Situação | Resultado correto |
|---|---|
| ADD/adição no ticket de refração sem o médico mencionar tipo | `Prescrição de óculos` |
| Médico diz "vou mudar o grau" sem especificar tipo | `Prescrição de óculos` |
| Médico diz "vai pra ótica fazer óculos" (tipo não dito) | `Prescrição de óculos` |
| Médico diz "precisa de óculos para longe" | `Prescrição de óculos para longe` |
| Médico diz "vou passar óculos para perto" | `Prescrição de óculos para perto` |
| Paciente reclama que o óculos **antigo** é ruim de perto | `Prescrição de óculos` |
| Trecho com "perto"/"longe" cercado de negativa ou pergunta sem resposta | `Prescrição de óculos` |

ADD no ticket é uma medida da prescrição, não indica que o óculos prescrito é multifocal. O médico pode ter ADD na refração e prescrever apenas óculos para perto (monofocal) ou nada.

O critério "longe + perto na mesma armação" só vale quando a referência de perto é **afirmativa**, dita pelo médico e **sobre o óculos que está sendo prescrito agora**. Queixa sobre o óculos velho, pergunta sem resposta clara e trecho com negativa não contam — na dúvida, `Prescrição de óculos` sem qualificador.

**Rede determinística — parâmetros exatos:** `_guardMultifocalSemEvidencia` (`src/DecisionEngine.js`) rebaixa a linha para `Prescrição de óculos` (sufixo de orientações preservado) **a menos que** a transcrição satisfaça uma das duas portas abaixo. Como o guard de presbiopia lê a conduta, ele roda antes — senão o H52.4 sobreviveria à conduta corrigida.

| Porta | O que a transcrição precisa ter | Exemplo que passa |
|---|---|---|
| **1 — palavra explícita** | `multifocal`/`multifocais`, `bifocal`/`bifocais`, `progressivo(a/s)` em qualquer posição da fala | "vou passar um multifocal" |
| **2 — longe + perto na mesma armação** | o par **colado** (`longe (e) (de/para/pra) perto` ou `perto (e) (de/para/pra) longe`) **e**, na janela de ~10 palavras de cada lado, uma âncora de **prescrição**: `receita`, `prescrev…`, `armação`, `vou fazer/passar/deixar/dar/receitar`, `vai fazer/usar/levar`, `fazer um(ns)/o(s) óculos` | "tem grau de longe perto junto, aí eu vou fazer a receita" |

Três consequências desses parâmetros, todas deliberadas:

- **Adjacência é o filtro anti-ASR.** Qualquer palavra entre *longe* e *perto* derruba a porta 2 — é o que descarta o trecho embaralhado de 2026-08-05 ("não é para perto, sim para longe, não") sem precisar de um parser de negativas.
- **A âncora aqui é mais estreita que a do guard de presbiopia.** Lá basta `óculos`/`grau` na janela, porque a pergunta é *"é présbita?"*. Aqui a pergunta é *"prescreveu multifocal agora?"*, e sem verbo de prescrição "os óculos estão bons, enxerga de longe e de perto" viraria multifocal.
- **O que a porta 2 deliberadamente NÃO cobre.** Ela implementa o critério "longe + perto na mesma armação" **apenas** quando o par é dito ao lado do ato de prescrever. Ficam de fora, e são rebaixadas para `Prescrição de óculos`: (a) o par sem verbo de prescrição na janela ("óculos que serve para perto e longe" — ✅ no prompt, rebaixado pelo guard); (b) o 3º critério do prompt, com longe e perto **espalhados** por frases diferentes ("para perto aí nem se fala… para longe o óculos também faz falta"). Alargar a âncora para cobri-los é exatamente o que reabre o falso positivo de 2026-08-05 (ver `[MULTI-6]`). Vale a regra do próprio prompt: errar para menos é barato — o médico completa o tipo; multifocal afirmado sem prescrição, não. Limite pinado em `[MULTI-8]`.
- **Fraseado fora da forma canônica passa intacto.** O rebaixamento é ancorado em `^Prescrição de óculos <tipo>`; "Uso de lente progressiva" não é reescrito — buraco aceito, porque o prompt já proíbe esse fraseado e reescrever linha livre arriscaria mutilar conduta legítima.

### Inferência de prescrição de óculos

Em consultas de refração, é possível inferir a prescrição de óculos quando o médico não verbaliza explicitamente mas o contexto é inequívoco. Infira `Prescrição de óculos` quando:

- Houve refração (ticket TOPCON ou refração subjetiva na consulta), **e**
- O médico orientou o paciente a ir a uma ótica ou comprar óculos (mesmo de forma coloquial), **e**
- Não houve declaração de que não vai prescrever.

Não infira prescrição quando o médico não mencionou óculos de nenhuma forma.

## Retornos

Registre retornos com prazo definido. Nunca acrescente contexto diagnóstico ao retorno — o diagnóstico pertence a outro campo.

Normalizações recomendadas:

| Fala do médico | Conduta |
|---|---|
| "Volta em um mês" | `Retorno 1 mês` |
| "Reavaliar em seis meses" | `Retorno 6 meses` |
| "Consulta anual" | `Retorno anual` |
| "Volta depois dos exames" | `Retorno após exames` |

### Retornos condicionais

Se já houver retorno com prazo, descarte retornos condicionais vagos como:

- `Retorno se necessário`
- `Retorno se dificuldade`
- `Retorno se piora`

Se não houver retorno com prazo, mantenha apenas um retorno condicional, escolhendo o mais específico:

```text
conduta: "Retorno se piora dos sintomas"
```

### Plano de investigação condicional — NÃO é retorno condicional vago

Quando o médico atribui a queixa a uma causa provável e declara que, **se aquilo não resolver, é preciso investigar outras causas**, isso é decisão clínica e entra **sempre** em `conduta`, numa única linha com o prefixo `Orientado `.

Discriminador: o retorno condicional vago manda o paciente **voltar para rever a mesma coisa**; o plano de investigação abre uma **linha diagnóstica nova** (outra causa, outra hipótese).

| Fala do médico | Conduta |
|---|---|
| "vou passar o óculos; se resolver a dor de cabeça, perfeito — se não resolver, tem que investigar outras causas" | `Orientado prosseguir investigação de outras causas se não houver melhora com a correção óptica` |
| "se o colírio não melhorar a vermelhidão, a gente vai ter que procurar outra origem" | `Orientado prosseguir investigação de outras causas se não houver melhora com o tratamento` |
| "se não adaptar, volta aqui" / "qualquer coisa me procura" | descartado (retorno condicional vago) |

Esta linha **não substitui** o `Retorno X meses` quando há prazo definido — as duas coexistem.

## Encaminhamentos

Use o padrão:

```text
Encaminhamento: [especialidade ou serviço]
```

Exemplos:

- `Encaminhamento: Dermatologista`
- `Encaminhamento: Retina`
- `Encaminhamento: Neuro-oftalmologia`

Não invente especialidade se o médico apenas disser `vou encaminhar` sem destino. Nesse caso:

```text
conduta: "Encaminhamento não especificado"
revisao_manual: true
motivo_revisao_manual: "Destino do encaminhamento não especificado na transcrição."
```

## Solicitação de exames

Registre exames solicitados pelo médico com verbo no infinitivo:

**Catálogo** (fonte única: `EXAMES_CATALOGO` em `config/clinical-triggers.js`):

- `Solicitar OCT` (com região só se dita: `Solicitar OCT de mácula`, `Solicitar OCT de nervo óptico`)
- `Solicitar campo visual`
- `Solicitar retinografia`
- `Solicitar paquimetria`
- `Solicitar topografia corneana`
- `Solicitar curva de tensão`
- `Solicitar biometria`
- `Solicitar angiografia`
- `Solicitar ecografia ocular`
- `Solicitar mapeamento de retina`

"Tomografia" / "tomografia do nervo" = OCT. "Campimetria" / "exame de campo" = campo visual.
`Fundo com dilatação` não é exame pedido: é a dilatação.

### Critérios de injeção (2026-10-22 — o OCT vinha sumindo da conduta)

**Emitir a linha** quando as duas condições valem:

1. o exame foi **nomeado** na fala (a sigla OCT chega restaurada do ASR: "o c t", "ocete", "ó cê tê");
2. a fala o coloca no **futuro** ou como **decisão do médico**: "vou pedir um OCT", "vamos fazer o OCT",
   "precisa de campo visual", "vamos repetir a retinografia".

- Exame que o paciente fará **na própria clínica hoje** ("vai fazer o OCT ali com a moça") **é pedido**.
- **Vários exames** → uma linha `Solicitar` para cada; nenhum se perde.
- Pedido de exame e retorno são **linhas separadas**; o retorno nunca engole o exame.
- Exame anunciado **sem nome** → `Solicitar exame complementar (não especificado na consulta)`; se o mesmo
  exame for nomeado em outro ponto da fala, usa-se o nome e a linha genérica não é emitida.

**Não emitir** quando o exame aparece só como passado/resultado ("fiz OCT ano passado", "o OCT veio normal",
"trouxe o campo visual"), quando é dispensado ("não precisa de OCT agora") ou quando só o diagnóstico/achado o
sugeriria. Exceção: "vamos **repetir** o OCT" é pedido.

**Rede de código:** `GeminiInterviewAgent._garantirExamesPedidosNaConduta` relê a fala com
`ClinicalTriggers.detectaExamesPedidosNaFala` e acrescenta a linha que o modelo omitiu. Ela só acrescenta
(e troca a linha genérica pelo nome); nunca remove pedido do modelo e nunca lê o diagnóstico.

> ⛔ **O nome do exame só pode vir da fala do médico** (regra endurecida em 2026-08-17).
> Nunca deduza o nome do diagnóstico, do achado do exame ou dos exemplos acima: "nervo fora
> do padrão"/`H400` **não** autoriza `Solicitar OCT`; retina alterada **não** autoriza
> `Solicitar retinografia`.
> - Médico anunciou exame **sem nomear** ("vamos fazer um outro exame ali para medir") →
>   `Solicitar exame complementar (não especificado na consulta)` — mesma forma do colírio
>   que o paciente afirma usar mas não nomeia.
> - Médico **não anunciou exame algum** → nenhuma linha de exame. O achado não pede exame
>   sozinho.
>
> Caso real (2026-08-17): a conduta saiu com `Solicitar OCT de nervo óptico` numa consulta em
> que a palavra "OCT" nunca foi dita — o nome foi copiado do par `H400`↔OCT dos exemplos
> canônicos. Ver `[COND-EXAM-1..3]` em `utils/integration-test.js`.

Não registre exames apenas mencionados como já realizados, salvo se o médico pedir repetição ou novo controle.

## Suspensão e mudança de medicação

Suspensão, troca ou interrupção de medicamento entra em `conduta` quando é decisão clínica; a nova medicação, com posologia, pertence a `tratamento`.

```text
Médico: "Suspende o Xalatan e começa Timoptol de manhã e à noite."

conduta: "Suspender Xalatan"
tratamento: "Timolol (Timoptol) de manhã e à noite"
```

Se a fala sobre suspensão estiver ambígua, marque revisão manual.

## Descarte de logística operacional

Descarte frases que são apenas fluxo administrativo, mesmo que tenham sido ditas pelo médico ou pela equipe:

- `Retirar exames no balcão`.
- `Pagar na recepção`.
- `Agendar na recepção`.
- `Entregar receita`.
- `Passar na ótica`.
- `Conferir óculos quando ficarem prontos`.
- `Fazer orçamento em mais de uma ótica` / `pesquisar preço em várias óticas` / `comparar preços das lentes`.

Essas frases não são conduta médica para o prontuário.

## Formato de saída

Quando usada isoladamente, retorne:

```json
{
  "conduta": "string com \\n entre itens, ou null",
  "tratamento_sugerido": "string com itens que devem ir para tratamento, ou null",
  "descartado": "string com itens descartados por serem logística ou ruído, ou null",
  "revisao_manual": false,
  "motivo_revisao_manual": null
}
```

Quando usada dentro de uma skill maior, preencha apenas `dados.conduta` e preserve os demais campos do esquema original.

## Ordem recomendada dos itens

Organize múltiplas condutas nesta ordem:

1. Encaminhamentos.
2. Procedimentos ou indicações cirúrgicas.
3. Solicitação de exames.
4. Prescrição de óculos.
5. Orientações verbais de cuidado.
6. Suspensão ou mudança de conduta medicamentosa.
7. Retorno.

Use `\n` para separar itens.

## Revisão manual

Marque `revisao_manual: true` quando:

- A transcrição estiver ruidosa e a decisão médica não for clara.
- O destino do encaminhamento estiver ausente.
- Houver contradição entre condutas.
- O tipo de óculos for relevante, mas estiver incompreensível.
- Houver dúvida se algo é tratamento ou orientação de cuidado.
- A suspensão de medicação estiver ambígua.
- Houver retorno sem prazo e múltiplas condições vagas.

Preencha `motivo_revisao_manual` de forma curta e objetiva.

## Exemplos de referência

### Blefarite

```text
Entrada:
Médico diagnostica blefarite, orienta compressa morna, higiene da pálpebra com xampu infantil, o colírio depois da limpeza, lubrificante e ômega 3, encaminha ao dermatologista e marca retorno em seis meses.

Saída:
conduta: "Encaminhamento: Dermatologista\nRetorno 6 meses"
tratamento_sugerido: "Compressa morna por 2 min antes da higiene palpebral — 2x/dia\nHigiene palpebral com xampu infantil — 3x/dia\nTobramicina + dexametasona 3x/dia após higiene palpebral\nCarmelose sódica ou hialuronato de sódio em cada olho ao longo do dia\nÔmega 3 (EPA+DHA) 1000 mg — 1 comprimido no almoço e 1 no jantar por 30 dias"
descartado: null
```

Compressa e higiene são ações do paciente: `tratamento`, não `conduta`. O colírio não foi nomeado, mas veio junto do cuidado palpebral: é o protocolo da blefarite. Se o médico não tivesse mencionado colírio nenhum, a linha não existiria. Regras, textos e frequências padrão (estas ainda a confirmar com o médico): `TRATAMENTO.md`, seção 7.

### Óculos

```text
Entrada:
Médico diz que vai mudar o grau e passar multifocal novo.

Saída:
conduta: "Prescrição de óculos multifocais"
tratamento_sugerido: null
descartado: null
```

### Logística

```text
Entrada:
Médico diz para retirar o exame no balcão, agendar na recepção e retornar em um ano.

Saída:
conduta: "Retorno anual"
tratamento_sugerido: null
descartado: "Retirar exame no balcão\nAgendar na recepção"
```

### Exame solicitado

```text
Entrada:
Médico: "Vamos pedir campo visual e OCT, depois volta com os exames."

Saída:
conduta: "Solicitar campo visual\nSolicitar OCT\nRetorno após exames"
tratamento_sugerido: null
descartado: null
```

## Lista de checagem final

Antes de finalizar a conduta, confirme:

- A conduta veio do médico, não de inferência.
- Medicamentos, compressa morna e higiene palpebral foram separados para `tratamento`.
- Havendo medicação, compressa, higiene ou ômega 3: a "Checagem do tratamento" de `TRATAMENTO.md` foi feita inteira.
- Logística operacional foi descartada.
- Óculos foram registrados como `Prescrição de óculos`, nunca como `Atualização de grau`.
- Óculos multifocais, progressivos ou bifocais prescritos foram explicitamente documentados.
- Orientações verbais de cuidado não foram omitidas.
- Explicações clínicas relevantes dadas ao paciente foram incluídas.
- Orientações meramente adaptativas ou operacionais sobre uso dos óculos foram descartadas.
- Retorno condicional vago foi descartado se havia retorno com prazo.
- Plano de investigação condicional ditado pelo médico ("se não resolver, investigar outras causas") foi registrado — não confundido com retorno condicional vago.
- Retorno não contém complemento diagnóstico (`Retorno anual`, nunca `Retorno anual para acompanhamento de X`).
- Todas as orientações e explicações verbais foram fundidas em uma única linha `Orientado:` com fragmentos separados por ponto e vírgula.
- Ambiguidades relevantes geraram `revisao_manual: true`.

---

## Antes do passo final — revisão obrigatória

**Passo final desta skill:** entregar os campos `conduta` e `tratamento` prontos (a "Lista de checagem final" deste arquivo e a "Checagem do tratamento" de `TRATAMENTO.md` entram inteiras na revisão).

Antes de executá-lo, rodar a skill `revisao-final` sobre o resultado pronto: ela relê os parâmetros desta skill (regras críticas, checagem final, formato de saída e o histórico de erros em `HISTORICO.md`) e as regras do médico na memória, confere item por item e só então libera o passo final. Com algum item violado, corrige e revisa de novo (no máximo 3 rodadas); se ainda falhar, o passo final não é executado e o problema vai para o Fuad.
