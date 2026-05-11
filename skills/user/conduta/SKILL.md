---
name: conduta
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
- Retornos condicionais vagos quando já existe retorno com prazo.
- Frases genéricas sem decisão clínica: `acompanhar`, `observar`, `orientado`, sem objeto ou prazo.
- Valores isolados de exame sem decisão médica explícita.

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

Orientações verbais informais sobre cuidado físico, higiene, compressa, proteção ocular, mudança comportamental, sinais de alerta, natureza do diagnóstico, prognóstico, necessidade de acompanhamento ou justificativa de exames devem entrar em `conduta`, mesmo quando ditas de forma coloquial.

Normalize orientações práticas com o prefixo `Orientado` ou `Orientada`, usando forma impessoal e clínica.

Normalize explicações clínicas com o prefixo `Explicado` ou `Esclarecido`, mantendo texto curto e útil para prontuário.

Exemplos:

```text
"Pega um algodão com água morna e deixa dois minutinhos."
conduta: "Orientado compressa morna 2 min"

"Faz uma espuma com shampoo infantil e lava os cílios."
conduta: "Orientado higiene palpebral com shampoo infantil"

"Evita coçar os olhos."
conduta: "Orientado evitar coçar os olhos"

"Expliquei que é uma catarata inicial e que por enquanto vamos acompanhar."
conduta: "Explicado diagnóstico de catarata inicial e necessidade de acompanhamento"

"Se tiver dor forte, piora da visão ou vermelhidão importante, procura atendimento."
conduta: "Orientado procurar atendimento se dor intensa, piora visual ou hiperemia importante"
```

### Exceção: orientações sobre uso dos óculos

Desconsidere orientações meramente operacionais ou adaptativas sobre uso dos óculos, mesmo que tenham sido ditas pelo médico.

Não inclua em `conduta`:

- `Usar os óculos para perto`.
- `Usar os óculos para longe`.
- `Usar os óculos para dirigir`.
- `Testar adaptação dos óculos`.
- `Conferir os óculos após ficarem prontos`.
- `Voltar se não adaptar aos óculos`, quando for apenas orientação de adaptação.

Essas orientações não substituem a conduta de prescrição. Se os óculos foram prescritos, registre apenas a prescrição adequada, por exemplo `Prescrição de óculos multifocais`.

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
| Médico não vai prescrever (óculos não indicado) | `Sem prescrição de óculos` |

Quando forem prescritos óculos multifocais, progressivos ou bifocais, isso deve ficar explicitamente documentado na conduta como `Prescrição de óculos multifocais`, salvo se o médico usar outro tipo específico que deva ser preservado.

Se o tipo de óculos estiver ambíguo, use `Prescrição de óculos` e não invente o tipo.

### Inferência de prescrição de óculos

Em consultas de refração, é possível inferir a prescrição de óculos quando o médico não verbaliza explicitamente mas o contexto é inequívoco. Infira `Prescrição de óculos` quando:

- Houve refração (ticket TOPCON ou refração subjetiva na consulta), **e**
- O médico orientou o paciente a ir a uma ótica ou comprar óculos (mesmo de forma coloquial), **e**
- Não houve declaração de que não vai prescrever.

Não infira prescrição quando o médico não mencionou óculos de nenhuma forma.

## Retornos

Registre retornos com prazo definido.

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
conduta: "Encaminhamento: Dermatologista\nOrientado compressa morna\nOrientado higiene palpebral com shampoo infantil\nRetorno 6 meses"
tratamento_sugerido: "Lubrificante ocular\nÔmega 3"
descartado: null
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

### 2026-05-11 — `injectExamesNormais` marcado incorretamente

- **Erro observado**: a frase "tudo em paz com o olho" estava sendo usada como gatilho único para marcar `injectExamesNormais: true`, mesmo quando o médico prescrevia lubrificante ou encaminhava.
- **Correção aplicada**: adicionada condição extra: a flag só pode ser verdadeira se não houver tratamento ou encaminhamento ativo.
