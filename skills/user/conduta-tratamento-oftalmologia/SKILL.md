---
name: conduta-tratamento-oftalmologia
description: "Extrai, normaliza e valida o campo conduta em consultas oftalmológicas. Use quando o usuário apresentar transcrição de consulta, resumo clínico ou saída estruturada e precisar separar conduta de tratamento, registrar retornos, encaminhamentos, prescrição de óculos, solicitação de exames, orientações verbais, suspensão de medicação e descartar logística operacional. Também use para evitar expressões proibidas como atualização de grau e para marcar revisão manual quando a conduta estiver ambígua."
metadata:
  author: fuad-ibrahim
  version: "1.0"
  domain: oftalmologia
---

# Conduta Oftalmológica

## Quando usar esta skill

Use esta skill quando precisar preencher, revisar ou corrigir o campo `conduta` em registros oftalmológicos derivados de:

- Transcrições de consulta médica.
- Resumos clínicos ditados pelo médico.
- Saídas JSON de extração de prontuário.
- Revisões de casos em que houve confusão entre `conduta` e `tratamento`.
- Casos com prescrição de óculos, retorno, encaminhamento, solicitação de exames, orientações verbais, suspensão de colírio ou logística pós-consulta.

Esta skill é focada apenas em `conduta`. Ela pode ser usada junto de uma skill maior de transcrição de consulta oftalmológica, mas deve funcionar de forma autônoma.

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
- Orientações e explicações dadas ao paciente: `Orientado higiene palpebral`, `Orientado compressa morna`, `Explicado diagnóstico e sinais de alerta`.
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
- `Orientado compressa morna 2 min, 2x/dia`
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

### Hierarquia de nomeação da medicação prescrita

Ao registrar um medicamento que o médico **prescreve**, use o nível mais específico possível — nesta ordem, descendo apenas quando o nível acima for genuinamente impossível.

⚠️ **O nível 1 é o alvo, não o caso ideal.** Um princípio ativo registrado vale mais que uma classe; uma classe vale mais que o genérico. Antes de descer de nível, confira: o médico disse a marca? disse o princípio? a fala corresponde a um protocolo declarado (nível 1.5)? Só então desça.

**Nível 1 — Princípio ativo.** Quando o médico **nomeou** o remédio: princípio ativo dito, ou marca mapeável pela base de conhecimento. Ex.: "Vigadexa" → `Moxifloxacino + dexametasona`; "dorzolamida" → `Dorzolamida`; "Tobradex" → `Tobramicina + dexametasona`.

- Marca dita **sempre** vira princípio ativo — não registre o nome comercial cru quando há mapeamento.
- ⚠️ Nunca infira o princípio ativo a partir do diagnóstico ou do contexto — só quando o nome (marca ou princípio) foi efetivamente pronunciado, ou quando um protocolo declarado (nível 1.5) se aplica. Princípio ativo errado num prontuário é pior que um genérico.

**Nível 1.5 — Protocolo declarado do médico.** O médico declarou previamente qual remédio ele usa em determinada combinação de tratamento. Não é inferência a partir do diagnóstico: é a conduta padrão dele, informada por ele.

| Protocolo | Gatilho na fala | Registro |
|---|---|---|
| Blefarite | compressa morna e/ou higiene palpebral **+** um colírio a ser pingado em seguida, sem o médico nomear esse colírio. O lubrificante NÃO é o colírio da blefarite | `Tobramicina + dexametasona` |

- ⚠️ O nível 1 sempre vence: se o médico nomeou **outro** remédio, registre o que ele disse.
- ⚠️ O protocolo apenas **nomeia** um colírio cuja prescrição já foi confirmada na fala — ele nunca cria uma prescrição que não existe (ver regra anti-invenção abaixo).

**Nível 2 — Grupo / classe.** Quando o remédio não foi nomeado, nenhum protocolo declarado se aplica, mas a classe é identificável pela fala (finalidade dita ou tratamento inequívoco). Ex.: "colírio para pressão" → `Colírio hipotensor ocular`; "colírio de alergia" → `Colírio antialérgico`; "colírio de antibiótico" (sem marca nem princípio) → `Colírio antibiótico`.

**Nível 3 — Genérico.** Quando nem o nome, nem um protocolo, nem a classe podem ser identificados, mas houve prescrição. Ex.: "usa o colírio, 3x/dia" → `Medicação ocular prescrita`.

⚠️ **Nunca omita uma prescrição** porque o nome não foi dito — desça de nível, mas registre. A posologia (frequência, olho, duração) é preservada em qualquer nível quando mencionada.

⚠️ **Nome que o ASR destruiu NÃO é "nome não dito" nem autoriza classe.** Se o médico pronunciou algo que parece um remédio mas a transcrição saiu ilegível (ex.: "trometolou 3 vezes ao dia por 5 dias"), registre `Medicação ocular prescrita` + posologia. É PROIBIDO deduzir a classe pelo contexto clínico (corpo estranho/"machucado" → "Colírio antibiótico"): a classe do nível 2 só vale quando a FALA a diz ("antibiótico", "para pressão", "de alergia"). Backstop determinístico: Guard 2d do DecisionEngine rebaixa "Colírio antibiótico" quando a fala não cita antibiótico.

⚠️ **Colírio MANTIDO é tratamento.** "Mantido o timolol 2x/dia", "continua com o colírio da pressão" → linha em `tratamento` (`Timolol 2x/dia`), além de constar em `medicacoes_em_uso`. Não responda `tratamento: null` só porque o remédio já estava em uso — `null` vira "Sem prescrição de medicação" no prontuário, o que contradiz a fala.

Registrar a classe (`colírio hipotensor`) ou o genérico (`Medicação ocular prescrita`) **não** viola a regra anti-invenção de nomes: essas formas descrevem sem afirmar um princípio ativo que não foi dito.

### Medicação da blefarite (aplicação do nível 1.5)

O tratamento de blefarite deste consultório é: **compressa morna → higiene palpebral → colírio**. Quando o médico prescreve esse conjunto sem nomear o colírio, o colírio é `Tobramicina + dexametasona`.

Ordem de precedência ao nomear o colírio da blefarite:

1. **Médico nomeou o remédio** (marca ou princípio) → princípio ativo correspondente. O nome dito sempre vence o protocolo. Ex.: "usa o Maxitrol" → `Neomicina + polimixina B + dexametasona`.
2. **Médico não nomeou**, mas prescreveu compressa e/ou higiene palpebral **mais** um colírio a pingar em seguida → `Tobramicina + dexametasona`.
   - Vale mesmo quando a fala é vaga: *"vou passar um colírio"*, *"um tratamento pra desinflamar"*, *"um tratamento mais forte"*, *"pinga esse aqui depois da limpeza"*.
   - Não exija os três itens literais nem posologia dita — higiene **ou** compressa, mais o colírio, já bastam.
   - **O que conta como "o colírio"**: a palavra colírio/gota/pingar referindo-se a um produto que **não** é o lubrificante, ou a intenção de remédio anti-inflamatório ("tratamento mais forte", "pra desinflamar").
   - **O que NÃO conta**: o lubrificante ("um lubrificante, pode pingar quantas vezes quiser" é o item 4, não o colírio) e o simples anúncio do tratamento ("vou passar um tratamento para melhorar essa irritação, isso é coisa simples" seguido de compressa/higiene/lubrificante/ômega 3 — esse "tratamento" é a própria lista).
   - Teste obrigatório: aponte o trecho da fala em que o colírio (que não é o lubrificante) foi prescrito. Sem trecho, sem colírio.
3. **Não há colírio a pingar**, apenas uma classe identificável na fala → classe (nível 2).
4. **Nada identificável**, mas houve prescrição → `Medicação ocular prescrita` (nível 3).

⚠️ `Tobramicina + dexametasona` **não** é invenção: é o protocolo declarado do médico. O que continua proibido é criar uma prescrição inexistente — se o médico só orientou compressa e higiene e **não** prescreveu colírio nenhum, não acrescente colírio.

⚠️ **`Associação (ATB + corticoide ocular)` está aposentada na blefarite.** Ou o médico nomeou o remédio (nível 1), ou vale o protocolo `Tobramicina + dexametasona` (nível 1.5). A forma de classe só sobrevive fora da blefarite.

```text
Entrada:
"Faz compressa morna dois minutos, depois lava os cílios com shampoo de neném e pinga o colírio três vezes ao dia. Volta em duas semanas."

Saída:
conduta: "Retorno 2 semanas"
tratamento_sugerido: "Compressa morna 2 min — 2x/dia\nHigiene palpebral com shampoo infantil\nTobramicina + dexametasona 3x/dia após higiene palpebral"
```

```text
Entrada:
"A blefarite tá mais atacada, vou passar um tratamento mais forte pra você fazer." (paciente já faz higiene com shampoo e usa lubrificante)

Saída:
tratamento_sugerido: "Tobramicina + dexametasona\nHigiene palpebral com shampoo infantil\nLubrificante ocular"
```

```text
Entrada (log 2026-09-15):
"Vou passar um tratamento para a senhora fazer para melhorar essa irritação, isso é coisa simples. [compressa e limpeza] de manhã e no fim do dia... um lubrificante, pode pingar quantas vezes quiser, pode comprar sem receita... já tem costume de tomar ômega 3?"

Saída:
tratamento_sugerido: "Compressa morna\nHigiene palpebral\nLubrificante ocular\nÔmega 3"
❌ NÃO: "Tobramicina + dexametasona" — o único pingar é do lubrificante; não houve colírio da blefarite.
```

### Regra anti-invenção de tratamento (crítica)

Um tratamento só existe se o médico o **prescreveu** na fala — nomeando um remédio, indicando uma classe/finalidade, ou dando instrução inequívoca de usar/pingar/aplicar/passar algo. Os 3 níveis de nomeação acima só valem **depois** de confirmado que houve prescrição real.

- ❌ **Nunca infira que existe prescrição a partir do diagnóstico ou do contexto.** O diagnóstico não gera tratamento automático. Ex.: `corpo estranho`/`abrasão` → não assuma pomada ou colírio antibiótico; `conjuntivite` → não assuma antibiótico tópico. Se o médico removeu o corpo estranho e não prescreveu nada, `tratamento_sugerido: null`.
- ❌ **Nunca invente posologia** (frequência, duração, dose — "4/4h", "por 3 dias", "3x/dia"). Posologia entra só quando pronunciada; houve prescrição sem posologia dita → registre a medicação sem posologia.
- ❌ **Consulta encerrada (despedida/STOP) sem o médico ditar conduta/tratamento → `tratamento_sugerido: null`.** A ausência de prescrição é um desfecho válido; deixar `null` é sempre preferível a fabricar tratamento para "fechar" o prontuário.

### Regra anti-associação medicamentosa

Nunca crie associação de medicamentos, colírios ou princípios ativos se a associação não foi explicitamente prescrita pelo médico.

Se o médico prescrever medicamentos separados, registre-os como itens separados no `tratamento_sugerido`. Não combine os nomes em uma fórmula composta, associação fixa ou apresentação comercial.

Exemplos:

```text
Médico: "Use dorzolamida e timolol."

Correto:
tratamento_sugerido: "Dorzolamida\nTimolol"

Errado:
tratamento_sugerido: "Dorzolamida + Timolol"
```

```text
Médico: "Mantém o colírio da pressão e começa lubrificante."

Correto:
tratamento_sugerido: "Colírio para pressão\nLubrificante ocular"

Errado:
tratamento_sugerido: "Associação de colírio hipotensor com lubrificante"
```

Só registre associação quando a fala indicar claramente associação, combinação, fórmula composta ou nome comercial correspondente.

Exemplo:

```text
Médico: "Faz compressa morna duas vezes ao dia e usa lubrificante de seis em seis horas."

conduta: "Orientado compressa morna 2x/dia"
tratamento: "Lubrificante ocular 1 gota AO 6/6h"
```

## Orientações e explicações verbais do médico

Orientações verbais sobre mudança comportamental, proteção ocular, sinais de alerta, natureza do diagnóstico, prognóstico, necessidade de acompanhamento ou justificativa de exames devem entrar em `conduta`, mesmo quando ditas de forma coloquial.

> ⚠️ **Exceção crítica:** compressa morna, higiene palpebral, shampoo, lubrificante ocular e ômega 3 são **ações físicas executadas pelo paciente** — pertencem sempre ao campo `tratamento`, mesmo que o médico as tenha orientado verbalmente.

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
tratamento: "Compressa morna 2 min — 2x/dia"   ← vai em TRATAMENTO, não conduta

"Faz uma espuma com shampoo infantil e lava os cílios." (higiene)
tratamento: "Higiene palpebral com shampoo infantil"   ← vai em TRATAMENTO, não conduta
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

Use sempre a estrutura `Prescrição de óculos`, especificando o tipo quando possível:

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

Quando forem prescritos óculos multifocais, progressivos ou bifocais, isso deve ficar explicitamente documentado na conduta como `Prescrição de óculos multifocais`, salvo se o médico usar outro tipo específico que deva ser preservado.

Se o tipo de óculos estiver ambíguo, use `Prescrição de óculos` e não invente o tipo.

⚠️ **Regra de simplicidade — sem detalhes técnicos do óculos:** a conduta registra apenas SE a lente é multifocal ou não, nunca como ela é feita. Não inclua revestimento antirreflexo, filtro de luz azul, tamanho/campo de lente, qualidade ou marca — isso é padrão de ótica e não é decisão clínica.

- Se o médico não especificar multifocal/progressivo/bifocal → `Prescrição de óculos`.
- Se o médico especificar multifocal/progressivo/bifocal → `Prescrição de óculos multifocais` (ou o tipo dito).
- Comentários do médico sobre antirreflexo, filtro azul, qualidade de lente, tamanho de campo, etc. são descartados, independentemente de serem recomendados ou desaconselhados pelo médico.

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

Suspensão, troca ou interrupção de medicamento pode entrar em `conduta` quando representa uma decisão clínica, mas a nova medicação com posologia pertence a `tratamento`.

Exemplo:

```text
Médico: "Suspende o Xalatan e começa Timoptol uma gota de manhã e à noite."

conduta: "Suspender Xalatan"
tratamento: "Timoptol 1 gota 12/12h"
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
Médico orienta compressa morna, higiene palpebral com shampoo infantil, o colírio depois da limpeza, lubrificante ocular, ômega 3, dermatologista e retorno em seis meses.

Saída:
conduta: "Encaminhamento: Dermatologista\nRetorno 6 meses"
tratamento_sugerido: "Compressa morna\nHigiene palpebral com shampoo infantil\nTobramicina + dexametasona após higiene palpebral\nLubrificante ocular\nÔmega 3"
descartado: null

⚠️ Nota: compressa morna e higiene palpebral são ações físicas do paciente → TRATAMENTO, não conduta.
⚠️ Nota: o colírio não foi nomeado, mas veio na combinação compressa + higiene + colírio → protocolo declarado (nível 1.5).
Se o médico NÃO tivesse mencionado nenhum colírio, a linha simplesmente não existiria — o protocolo nomeia, não cria.
```

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
- Medicamentos com posologia foram separados para `tratamento`.
- Cada medicação foi registrada no nível mais específico possível — marca dita virou princípio ativo, e não se desceu de nível sem antes checar nome e protocolo declarado.
- O colírio da blefarite não nomeado, prescrito junto de compressa/higiene, virou `Tobramicina + dexametasona` — e nenhum colírio foi criado onde o médico não prescreveu nenhum.
- Associações medicamentosas não foram criadas se o médico não as prescreveu explicitamente.
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

## Histórico de erros cobertos

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
- **Limitação conhecida (não corrigida)**: o `hasMention` do guard é um OR sobre `antibiótico|corticoide`, então a linha da classe sobrevive mesmo se o médico citou só um dos dois — a expressão "ATB + corticoide" pode sobre-afirmar o corticoide. Fora do escopo deste pedido.

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
  - `BLEFARITE_TRATAMENTO_PADRAO` em `scripts/sidepanel-constants.js` atualizado para o mesmo nome (constante hoje sem uso — o texto injetado vem da saída do Gemini; alinhada para não divergir se voltar a ser usada).
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
