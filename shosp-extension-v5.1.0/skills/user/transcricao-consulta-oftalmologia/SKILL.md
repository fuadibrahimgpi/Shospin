---
name: transcricao-consulta-oftalmologia
description: >
  Extrai dados estruturados de transcrições de consultas médicas oftalmológicas
  para injeção em prontuários. Use esta skill sempre que o usuário apresentar
  uma transcrição de consulta, gerada por reconhecimento de voz ou digitada, e
  precisar organizar os dados em campos como HDA, antecedentes, medicações em
  uso, diagnóstico, conduta e tratamento. Esta versão mantém as regras gerais
  de transcrição, classificação de tipo de consulta, anti-alucinação, flags de
  injeção automática e formato JSON final. Para preencher ou revisar o campo
  conduta, use em conjunto a skill conduta-oftalmologica.
---

# Transcrição de Consulta Oftalmológica

## Visão geral

Esta skill organiza dados extraídos de transcrições de consultas médicas oftalmológicas nos seguintes campos para injeção em prontuário.

**Primeira consulta:** `hda`, `medicacoes_em_uso`, `antecedentes_oftalmologicos`, `alteracoes_sistemicas`, `antecedentes_familiares`, `diagnostico`, `conduta`, `tratamento`

**Retorno:** `retorno`, `medicacoes_em_uso`, `diagnostico`, `conduta`, `tratamento`

**Conclusão:** `retorno`, `diagnostico`, `conduta`, `tratamento`

## Regras anti-alucinação críticas

1. A transcrição pode conter erros de reconhecimento de voz. Palavras sem sentido devem ser ignoradas, não interpretadas.
   - `"beleza"` isolado: ignore.
   - `"microscínio"`: provavelmente erro; não invente medicamento.

2. Se não há informação clara, use `null`. Nunca invente.

3. Extraia apenas fatos claros, não interpretações de texto confuso.

4. Use terminologia médica correta e concisa.

5. Nunca infira nomes de medicamentos não ditos explicitamente.
   - Paciente disse `"lubrificante"`: registre `lubrificante ocular`, não invente marca.
   - Paciente disse `"colírio amarelo"`: registre `colírio para pressão` ou a expressão dita, sem inferir marca.
   - Paciente disse `"aquele remédio"`: não escreva nome específico.

6. Nunca crie associação medicamentosa se ela não foi explicitamente prescrita.
   - Se o médico prescreveu `dorzolamida` e `timolol` como itens separados, não escreva `dorzolamida + timolol`.
   - Só registre associação fixa, combinação ou fórmula composta se isso tiver sido verbalizado claramente.

## Regra de fontes

| Campo | Fonte |
|---|---|
| `hda`, `retorno`, `antecedentes_*`, `alteracoes_sistemicas` | O que o paciente relata |
| `medicacoes_em_uso` | Paciente ou médico revisando prontuário |
| `diagnostico`, `conduta`, `tratamento` | O que o médico diz, prescreve ou orienta |

## Classificação do tipo de consulta

### Retorno

Use `retorno` quando houver:

- Evidência de vínculo com este serviço: `"da última vez que veio aqui"`, `"o exame que eu pedi"`, `"vim no retorno"`.
- Consulta focada sem anamnese sistemática completa.
- Revisão de resultado de exame com atualização de prescrição.
- Consulta curta voltada a problema pontual.

### Primeira consulta

Use `primeira_consulta` quando o médico levantar anamnese sistemática, especialmente:

- Antecedentes pessoais.
- Doenças sistêmicas.
- Cirurgias.
- Medicações.
- Antecedentes familiares, como glaucoma na família.

### Conclusão

Use `conclusao` quando houver apenas leitura de resultado de exame e conduta final, sem anamnese.

### Erros comuns de classificação

- Médico perguntar sobre queixa atual, sozinho, não transforma a consulta em primeira consulta.
- Paciente ter consultado em outro local não impede que seja retorno neste serviço.
- Consulta curta e focada sem anamnese sistemática deve ser classificada como retorno.
- Dúvida sem anamnese sistemática completa deve ser classificada como retorno.

## Campos, definições e regras

### `hda`

`hda` é a narrativa subjetiva do paciente sobre a queixa que motivou a consulta: o que sente, desde quando e como evoluiu.

Fonte: exclusivamente relato do paciente. Nunca inclua achados de exame ou interpretação do médico.

Inclua em `hda`:

- Queixa principal relatada pelo paciente.
- Tempo de evolução da queixa atual.
- Fatores de piora ou melhora relatados pelo paciente.
- Outras queixas associadas à consulta atual.

Não inclua em `hda`:

| Informação | Campo correto |
|---|---|
| Pressão ocular medida hoje | Diagnóstico apenas se o médico interpretar |
| Consulta anterior em outro serviço | `antecedentes_oftalmologicos` |
| Diagnóstico prévio | `antecedentes_oftalmologicos` |
| História familiar ocular | `antecedentes_familiares` |
| Doenças sistêmicas | `alteracoes_sistemicas` |
| Interpretação do médico | `diagnostico` |

Exemplo correto:

```text
"Desconforto ocular, dor de cabeça e visão embaçada há cerca de 1 ano, agravado pelo trabalho com microscópio."
```

### `retorno`

Use `retorno` para resumir a evolução ou motivo do retorno conforme relato do paciente e contexto da consulta.

Inclua:

- Evolução desde a última consulta.
- Resultado de tratamento anterior relatado pelo paciente.
- Queixa atual em seguimento.
- Motivo do retorno.

Não inclua:

- Conduta nova.
- Diagnóstico médico.
- Prescrição nova.
- Resultado objetivo de exame sem interpretação verbalizada.

### `medicacoes_em_uso`

Inclua apenas medicamentos oftalmológicos que o paciente já usava antes desta consulta.

Capture de qualquer fonte:

- Paciente relata: `"eu uso Xalatan todo dia"`.
- Médico revisa: `"você está usando Xalatan, Combigan"`.
- Médico confirma: `"continua com o Lumigan?"`.
- Paciente confirma ao ser perguntado.

Formato:

- Nome e posologia quando mencionados: `"Xalatan 1 gota OE à noite"`.
- Sem posologia: `"Xalatan, Timoptol"`.

Não inclua medicamentos sistêmicos em `medicacoes_em_uso`. Eles vão em `alteracoes_sistemicas`.

### `alteracoes_sistemicas`

Inclua doenças sistêmicas e medicamentos sistêmicos em uso.

Formato sugerido:

```text
"DM em uso de insulina e metformina, HAS em uso de losartan"
```

### `antecedentes_oftalmologicos`

Inclua diagnósticos, cirurgias, tratamentos, acompanhamento prévio, trauma ocular ou consultas oftalmológicas relevantes anteriores à consulta atual.

### `antecedentes_familiares`

Inclua doenças oftalmológicas familiares, especialmente glaucoma, cegueira, doenças retinianas hereditárias ou outras condições mencionadas.

### Negativas do paciente

| O que o paciente disse | O que registrar |
|---|---|
| Nega colírio/remédio para os olhos | `"Nega uso de medicações oculares"` |
| Nega qualquer remédio | `medicacoes_em_uso: "Nega uso de medicações oculares"` e `alteracoes_sistemicas: "Nega comorbidades"` |
| Nunca fez cirurgia/tratamento | `"Nega diagnósticos e procedimentos oftalmológicos prévios"` |
| Não tem doença | `"Nega comorbidades"` |
| Família sem problema de visão | `"Nega diagnósticos oftalmológicos familiares"` |

## Diagnóstico

O campo `diagnostico` deve conter diagnósticos, suspeitas diagnósticas e interpretações clínicas verbalizadas pelo médico.

Regras:

- Se o médico ditar o CID, registre o CID junto ao diagnóstico.
- Se o médico não ditar o CID, não invente o CID.
- Diagnóstico textual sem CID é permitido.
- Nunca converta diagnóstico em CID por conhecimento próprio.
- Se houver diagnóstico incerto, use a formulação mais fiel possível ao que foi dito e marque `revisao_manual: true`.

## Conduta

Para preencher ou revisar `dados.conduta`, aplique a skill `conduta-oftalmologica`.

Resumo mínimo obrigatório:

- Conduta vem do médico.
- Conduta inclui decisões clínicas, orientações e explicações dadas ao paciente.
- Conduta inclui retornos, encaminhamentos, solicitação de exames, prescrição de óculos, suspensão de medicação e orientações não farmacológicas.
- Orientações e explicações clínicas dadas ao paciente devem ser injetadas em `conduta`.
- Desconsidere apenas orientações meramente operacionais ou adaptativas sobre uso dos óculos.
- Se forem prescritos óculos multifocais, progressivos ou bifocais, documente explicitamente: `Prescrição de óculos multifocais`, salvo tipo específico diferente dito pelo médico.
- Nunca use `Atualização de grau`, `Mudança de grau`, `Novo grau` ou `Ajuste de grau`.
- Medicamentos, colírios, lubrificantes, suplementos e posologias vão em `tratamento`, não em `conduta`.
- Logística operacional da clínica deve ser descartada.

## Tratamento

O campo `tratamento` deve conter apenas medicamentos, colírios, pomadas, lubrificantes, suplementos ou medicações orais prescritas ou mantidas pelo médico, com posologia quando disponível.

Inclua:

- Colírios e pomadas novos ou mantidos.
- Medicamentos orais com posologia.
- Lubrificantes oculares.
- Ômega 3 e suplementos.
- Continuidade de medicação quando o médico verbalizar manutenção.

Se nenhum tratamento medicamentoso foi prescrito, use `null`.

### Regra anti-associação

Nunca crie associação de medicamentos, colírios ou princípios ativos se isso não foi explicitamente prescrito pelo médico.

Se o médico mencionar dois medicamentos separadamente, registre separadamente.

```text
Médico: "Use dorzolamida e timolol."

tratamento: "Dorzolamida\nTimolol"
```

Não escreva:

```text
"Dorzolamida + Timolol"
```

Só use `+`, `associação`, `combinado`, `associação fixa` ou nome comercial de combinação quando o médico falar isso claramente.

## Flags de injeção automática

### `injectExamesNormais`

Marque `true` somente se o médico afirmar que todos os exames estão normais, sem exceção.

Pode marcar `true` quando o médico disser:

- `"exames normais"`.
- `"fundo de olho normal"`, `"biomicroscopia normal"` e demais exames relevantes normais.

Não marque `true` quando:

- `"tirando X tudo normal"`: há alteração.
- `"os outros exames estão tranquilos"`: há exceção.
- `"exame de pressão normal"`: apenas um exame.
- Há diagnóstico ocular ativo, como catarata, glaucoma, cicatriz ou blefarite.
- Há qualquer alteração ocular conhecida.

### `injectBlefarite`

Marque `true` se houver qualquer indicação de blefarite:

- Diagnóstico: `"blefarite"`, `"blefaromeibomite"`, `"disfunção de meibômio"`, `"olho seco"`.
- Tratamento típico: `"lavar com shampoo"`, `"compressa quente/morna"`, `"higiene palpebral"`.
- Pálpebra inflamada mencionada pelo médico.

### `dilatacaoDetectada`

Marque `true` se o médico mencionar dilatar pupila ou usar colírio de dilatação.

### Exclusão mútua

`injectBlefarite` e `injectExamesNormais` são mutuamente exclusivos.

Se há blefarite, a biomicroscopia não é normal. Portanto, `injectExamesNormais = false`.

## Dados objetivos de exame

- Dados objetivos de exame, como PIO, acuidade visual, biomicroscopia, fundoscopia e refração, não vão em `hda`.
- Só devem aparecer em `diagnostico`, `conduta` ou `tratamento` se o médico verbalizar interpretação, diagnóstico ou decisão baseada neles.
- Não crie campo novo para exame físico.
- Não transforme valores isolados em diagnóstico se o médico não disser.

Exemplo:

```text
"PIO 23/22" não vira glaucoma automaticamente.
```

Pode fundamentar `"suspeita de glaucoma"` apenas se o médico disser explicitamente.

## Lateralidade

- Preserve OD, OE e AO quando a lateralidade for clara.
- `"Olho direito"`: OD.
- `"Olho esquerdo"`: OE.
- `"Ambos os olhos"` ou `"nos dois olhos"`: AO.
- Nunca infira lateralidade.
- Se a lateralidade for necessária e não estiver clara, registre sem lateralidade apenas se clinicamente aceitável e marque `revisao_manual: true`.
- Se houver contradição de lateralidade, marque `revisao_manual: true`.

## Conflitos e contradições

- Se o paciente nega algo, mas depois confirma algo específico, prefira a informação específica e mais recente.
- Se o médico revisa o prontuário e o paciente confirma, registre como confirmado.
- Se paciente e médico dizem coisas incompatíveis sem resolução, não escolha arbitrariamente.
- Registre a informação mais segura e marque `revisao_manual: true`.
- Não mescle informações contraditórias.

## Segurança clínica e revisão manual

Assinale `revisao_manual: true` sempre que houver risco ou incerteza.

Situações para marcar revisão manual:

- Medicamento mencionado de forma incompleta ou ambígua.
- Possível associação medicamentosa não clara.
- Lateralidade ambígua ou contraditória.
- Posologia contraditória.
- Diagnóstico incerto.
- Transcrição muito ruidosa.
- Conflito entre fala do paciente e revisão do médico sem resolução.
- Dados importantes ausentes para injeção segura.
- Conduta ambígua segundo a skill `conduta-oftalmologica`.

Se tudo estiver claro e seguro, mantenha `revisao_manual: false` e `motivo_revisao_manual: null`.

## Formato de saída JSON

Todos os campos de texto devem ser strings, nunca arrays.

Use `\n` para separar múltiplos itens dentro de um campo.

O campo `_raciocinio` é apenas auditoria e não deve ser injetado no prontuário. Ele deve ser breve, objetivo e sem cadeia de pensamento extensa.

### Primeira consulta

```json
{
  "tipo_consulta": "primeira_consulta",
  "dados": {
    "hda": "string ou null",
    "medicacoes_em_uso": "string ou null",
    "antecedentes_oftalmologicos": "string ou null",
    "alteracoes_sistemicas": "string ou null",
    "antecedentes_familiares": "string ou null",
    "diagnostico": "string ou null",
    "conduta": "string com \\n entre itens, ou null",
    "tratamento": "string com \\n entre itens, ou null"
  },
  "injectExamesNormais": false,
  "injectBlefarite": false,
  "dilatacaoDetectada": false,
  "revisao_manual": false,
  "motivo_revisao_manual": null,
  "_raciocinio": "explicação breve do raciocínio"
}
```

### Retorno

```json
{
  "tipo_consulta": "retorno",
  "dados": {
    "retorno": "string ou null",
    "medicacoes_em_uso": "string ou null",
    "diagnostico": "string ou null",
    "conduta": "string com \\n entre itens, ou null",
    "tratamento": "string com \\n entre itens, ou null"
  },
  "injectExamesNormais": false,
  "injectBlefarite": false,
  "dilatacaoDetectada": false,
  "revisao_manual": false,
  "motivo_revisao_manual": null,
  "_raciocinio": "explicação breve do raciocínio"
}
```

### Conclusão

```json
{
  "tipo_consulta": "conclusao",
  "dados": {
    "retorno": "string ou null",
    "diagnostico": "string ou null",
    "conduta": "string com \\n entre itens, ou null",
    "tratamento": "string com \\n entre itens, ou null"
  },
  "injectExamesNormais": false,
  "injectBlefarite": false,
  "dilatacaoDetectada": false,
  "revisao_manual": false,
  "motivo_revisao_manual": null,
  "_raciocinio": "explicação breve do raciocínio"
}
```

## Casos de referência

### Primeira consulta com catarata

```text
Médico levantou HDA, antecedentes, família, examinou, diagnosticou catarata incipiente, prescreveu óculos multifocais e retorno anual.

tipo_consulta: "primeira_consulta"
diagnostico: "Catarata incipiente"
conduta: "Prescrição de óculos multifocais\nRetorno anual"
tratamento: null
injectExamesNormais: false
injectBlefarite: false
```

### Retorno de blefarite

```text
Médico perguntou evolução, examinou pálpebras, confirmou blefarite, orientou compressa e higiene, prescreveu lubrificante, encaminhou para dermatologista e retorno em 6 meses.

tipo_consulta: "retorno"
diagnostico: "Blefarite\nOlho seco"
conduta: "Encaminhamento: Dermatologista\nOrientado compressa morna\nOrientado higiene palpebral\nRetorno 6 meses"
tratamento: "Lubrificante ocular"
injectExamesNormais: false
injectBlefarite: true
```

### Consulta com exames normais

```text
Médico: "biomicroscopia e fundoscopia normais, pressão normal, grau estável, retorno em 1 ano."

tipo_consulta: "retorno"
conduta: "Retorno anual"
tratamento: null
injectExamesNormais: true
injectBlefarite: false
```

### Paciente nega tudo

```text
Paciente nega colírios, nega doenças, nega cirurgias e família sem problemas.

medicacoes_em_uso: "Nega uso de medicações oculares"
antecedentes_oftalmologicos: "Nega diagnósticos e procedimentos oftalmológicos prévios"
alteracoes_sistemicas: "Nega comorbidades"
antecedentes_familiares: "Nega diagnósticos oftalmológicos familiares"
```

### Pressão limítrofe e história familiar de glaucoma

```text
Paciente refere desconforto ocular, dor de cabeça e visão embaçada há cerca de 1 ano, com piora ao usar microscópio. Já fez consulta em 2018 em Goiânia por suspeita de glaucoma. Mãe tem glaucoma. Pressão hoje: 23 e 22 mmHg.

hda: "Desconforto ocular, dor de cabeça e visão embaçada há cerca de 1 ano, agravado pelo trabalho com microscópio."
antecedentes_oftalmologicos: "Acompanhamento por suspeita de glaucoma, com consulta com especialista em Goiânia em 2018."
antecedentes_familiares: "Mãe com diagnóstico de glaucoma."
diagnostico: "Suspeita de glaucoma"
```

Pressão de hoje não vai na HDA. É dado de exame e só aparece no diagnóstico se o médico verbalizar a interpretação.

## Histórico de erros mantidos nesta skill

### Atualização de grau

- Erro observado: campo `conduta` preenchido como `"Atualização de grau"` em vez de `"Prescrição de óculos [tipo]"`.
- Correção: a regra detalhada fica na skill `conduta-oftalmologica`; esta skill mantém a proibição mínima.

### Orientações verbais omitidas

- Erro observado: orientações verbais do médico, como compressa, higiene e proteção, foram omitidas de `conduta`.
- Correção: esta skill determina que orientações e explicações clínicas sejam injetadas; a extração detalhada fica na skill `conduta-oftalmologica`.

### Associação medicamentosa inventada

- Erro observado: tratamento preenchido com associação medicamentosa não prescrita.
- Correção: regra anti-associação adicionada em `tratamento` e em regras anti-alucinação.
