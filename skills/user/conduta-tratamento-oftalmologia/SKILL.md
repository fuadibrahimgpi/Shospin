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

## O que não entra em conduta

Não inclua em `conduta`:

- Nomes e posologias de colírios ou medicamentos prescritos. Isso vai em `tratamento`.
- Logística operacional da clínica: `retirar exames`, `pagar na recepção`, `agendar na recepção`, `entregar receita`.
- Logística pós-consulta de óculos: `conferir óculos após prontos`, `retirar na ótica`.
- Orientação comercial/orçamento de óculos: `orientado a fazer orçamento em mais de uma ótica`, `pesquisar preço em várias óticas`, `cotar valor das lentes`, `comparar preços`. Isso é orientação de compra ao paciente, não decisão médica, e nunca entra em `conduta`.
- Retornos condicionais vagos quando já existe retorno com prazo.
- Frases genéricas sem decisão clínica: `acompanhar`, `observar`, `orientado`, sem objeto ou prazo.
- Valores isolados de exame sem decisão médica explícita.
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

Ao registrar um medicamento que o médico **prescreve**, use o nível mais específico possível — nesta ordem, descendo apenas quando o nível acima não for possível:

1. **Princípio ativo** — quando o médico **nomeou** o remédio: princípio ativo dito, ou marca mapeável pela base de conhecimento. Ex.: "Vigadexa" → `Moxifloxacino + dexametasona`; "dorzolamida" → `Dorzolamida`.
   - ⚠️ Nunca infira o princípio ativo a partir do diagnóstico ou do contexto — só quando o nome (marca ou princípio) foi efetivamente pronunciado. Princípio ativo errado num prontuário é pior que um genérico.
2. **Grupo / classe** — quando o remédio não foi nomeado, mas a classe é identificável pela fala (finalidade dita ou tratamento inequívoco). Ex.: "colírio para pressão" → `Colírio hipotensor ocular`; antibiótico + corticoide indicados na blefarite → `Associação (ATB + corticoide ocular)`; "colírio de alergia" → `Colírio antialérgico`.
3. **Genérico** — quando nem o nome nem a classe podem ser identificados, mas houve prescrição. Ex.: "usa o colírio, uma gota 3x/dia" → `Medicação ocular prescrita`.

⚠️ **Nunca omita uma prescrição** porque o nome não foi dito — desça para o nível 2 ou 3, mas registre. A posologia (gota, frequência, olho, duração) é preservada em qualquer nível quando mencionada.

Registrar a classe (`colírio hipotensor`) ou o genérico (`Medicação ocular prescrita`) **não** viola a regra anti-invenção de nomes: essas formas descrevem sem afirmar um princípio ativo que não foi dito.

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

ADD no ticket é uma medida da prescrição, não indica que o óculos prescrito é multifocal. O médico pode ter ADD na refração e prescrever apenas óculos para perto (monofocal) ou nada.

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

- `Solicitar campo visual`
- `Solicitar OCT de mácula`
- `Solicitar retinografia`
- `Solicitar paquimetria`
- `Solicitar topografia corneana`

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
Médico orienta compressa morna, higiene palpebral com shampoo infantil, lubrificante ocular, ômega 3, dermatologista e retorno em seis meses.

Saída:
conduta: "Encaminhamento: Dermatologista\nRetorno 6 meses"
tratamento_sugerido: "Compressa morna\nHigiene palpebral com shampoo infantil\nLubrificante ocular\nÔmega 3"
descartado: null

⚠️ Nota: compressa morna e higiene palpebral são ações físicas do paciente → TRATAMENTO, não conduta.
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
- Associações medicamentosas não foram criadas se o médico não as prescreveu explicitamente.
- Logística operacional foi descartada.
- Óculos foram registrados como `Prescrição de óculos`, nunca como `Atualização de grau`.
- Óculos multifocais, progressivos ou bifocais prescritos foram explicitamente documentados.
- Orientações verbais de cuidado não foram omitidas.
- Explicações clínicas relevantes dadas ao paciente foram incluídas.
- Orientações meramente adaptativas ou operacionais sobre uso dos óculos foram descartadas.
- Retorno condicional vago foi descartado se havia retorno com prazo.
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
