---
name: transcricao-consulta-oftalmologia
description: >
  Extrai dados estruturados de transcrições de consultas médicas oftalmológicas
  para injeção em prontuários. Use esta skill sempre que o usuário apresentar
  uma transcrição de consulta (gerada por reconhecimento de voz ou digitada) e
  precisar organizar os dados em campos como HDA, diagnóstico, conduta e
  tratamento. Também use quando houver dúvida sobre o tipo de consulta
  (primeira consulta vs retorno), sobre o que vai em conduta vs tratamento,
  ou sobre como registrar negativas do paciente. Esta skill contém todas as
  regras anti-alucinação, classificação de tipo de consulta, separação
  conduta/tratamento e flags de injeção automática (exames normais, blefarite,
  dilatação).
---

# Transcrição de Consulta Oftalmológica

## Visão Geral

Esta skill organiza dados extraídos de transcrições de consultas médicas
oftalmológicas nos seguintes campos para injeção em prontuário:

**Primeira consulta:** `hda`, `medicacoes_em_uso`, `antecedentes_oftalmologicos`,
`alteracoes_sistemicas`, `antecedentes_familiares`, `diagnostico`, `conduta`, `tratamento`

**Retorno:** `retorno`, `medicacoes_em_uso`, `diagnostico`, `conduta`, `tratamento`

---

## REGRAS ANTI-ALUCINAÇÃO (CRÍTICAS)

1. A transcrição pode conter **erros de reconhecimento de voz** — palavras sem sentido devem ser IGNORADAS, não interpretadas.
   - `"beleza"` isolado → ignore
   - `"microscínio"` → provavelmente erro, não invente medicamento

2. Se não há informação clara → use `null`. **NUNCA invente.**

3. Extraia apenas FATOS CLAROS, não interpretações de texto confuso.

4. Use terminologia médica correta e concisa.

5. **NUNCA infira nomes de medicamentos não ditos explicitamente:**
   - ❌ Paciente disse `"lubrificante"` → NÃO escreva `"Artelac"` ou qualquer marca
   - ❌ Paciente disse `"colírio amarelo"` → NÃO escreva `"Xalatan"`
   - ❌ Paciente disse `"aquele remédio"` → NÃO escreva nenhum nome
   - ✅ Registre exatamente o que foi dito: `"lubrificante ocular"`, `"colírio para pressão"`

---

## REGRA DE FONTES

| Campo | Fonte |
|---|---|
| `hda`, `retorno`, `antecedentes_*`, `alteracoes_sistemicas` | O que o **PACIENTE** relata |
| `medicacoes_em_uso` | Paciente OU médico revisando prontuário |
| `diagnostico`, `conduta`, `tratamento` | O que o **MÉDICO** diz/prescreve |

---

## CLASSIFICAÇÃO DO TIPO DE CONSULTA

### ★ REGRA DE PRIORIDADE MÁXIMA — SOBREPÕE TODOS OS OUTROS CRITÉRIOS
Se o médico perguntou **explicitamente** sobre doenças sistêmicas **OU** medicamentos sistêmicos
(ex: *"alguma doença?"*, *"toma remédio?"*, *"tem diabetes?"*, *"precisa ir ao médico sempre?"*) →
**SEMPRE `primeira_consulta`**, mesmo que a consulta pareça curta ou focada.
Perguntas sistêmicas são marcador DEFINITIVO de anamnese — retornos NUNCA repetem esse levantamento.
Não é necessário levantamento completo: **uma pergunta sistêmica já é suficiente**.

### ▶ RETORNO — use quando (e a regra acima NÃO se aplica):
- Evidência de vínculo com este serviço: *"da última vez que veio aqui"*, *"o exame que eu pedi"*, *"vim no retorno"*
- Consulta focada sem nenhuma pergunta sistêmica
- Revisão de resultado de exame + atualização de prescrição
- Consulta curta voltada a problema pontual

### ▶ PRIMEIRA CONSULTA — use quando:
- A regra de prioridade acima se aplica (perguntas sistêmicas), **OU**
- Médico levanta antecedentes pessoais (cirurgias, histórico oftalmológico), **OU**
- Médico pergunta antecedentes familiares (glaucoma na família, etc.)
- **NÃO é necessário levantamento completo** — perguntar sobre UMA área já define primeira consulta

### ▶ CONCLUSAO — use quando:
- Apenas leitura de resultado de exame + conduta final, sem anamnese

### ⚠️ Erros comuns de classificação:
- ❌ Médico pergunta sobre queixa atual → sozinho NÃO é primeira_consulta
- ❌ Paciente consultou em outro local → pode ainda ser retorno aqui
- ❌ Consulta curta e focada **sem perguntas sistêmicas** → NÃO é primeira_consulta → é retorno
- ❌ Dúvida sem anamnese sistemática completa → retorno
- ❌ "Anamnese breve" não significa retorno — se houver pergunta sistêmica, é primeira_consulta

---

## CAMPOS — DEFINIÇÕES E REGRAS

### `hda` (História da Doença Atual)

**Definição:** Narrativa subjetiva do paciente sobre a queixa que motivou a consulta — o que ele sente, desde quando, e como evoluiu.

**Fonte:** Exclusivamente o relato do **PACIENTE**. Nunca inclua achados de exame ou interpretação do médico.

#### ✅ O que VAI na HDA:
- Queixa principal: sintomas relatados pelo próprio paciente (*"visão embaçada"*, *"dor de cabeça"*, *"olho vermelho"*)
- Tempo de evolução da queixa atual (*"há cerca de 1 ano"*, *"desde a semana passada"*)
- Fatores de piora ou melhora relatados pelo paciente (*"piora ao usar microscópio"*, *"melhora com descanso"*)
- Outras queixas associadas à consulta atual

#### ❌ O que NÃO vai na HDA (vai em outro campo):
| Informação | Campo correto |
|---|---|
| Pressão ocular medida hoje | → resultado de exame, não narrativa; vai implícito no diagnóstico |
| Consulta anterior em outro serviço | → `antecedentes_oftalmologicos` |
| Diagnóstico prévio (glaucoma, catarata, etc.) | → `antecedentes_oftalmologicos` |
| História familiar de doença ocular | → `antecedentes_familiares` |
| Doenças sistêmicas do paciente | → `alteracoes_sistemicas` |
| Interpretação do médico sobre os achados | → `diagnostico` |

#### Exemplos:

**❌ Errado — mistura queixa, exame e antecedente:**
```
"Desconforto ocular, dor de cabeça e visão embaçada há 1 ano, agravado pelo trabalho
com microscópio. Pressão ocular costuma ser alta, hoje 23 e 22 mmHg. Em 2018, realizou
consulta com especialista em Goiânia devido à história familiar de glaucoma."
```

**✅ Correto — apenas o relato subjetivo do paciente:**
```
"Desconforto ocular, dor de cabeça e visão embaçada há cerca de 1 ano,
agravado pelo trabalho com microscópio."
```
*(A pressão de hoje vai no diagnóstico. A consulta de 2018 vai em antecedentes_oftalmologicos.)*

#### Queixa principal — negativas de sintomas NÃO lideram:

A queixa principal é sempre o **sintoma POSITIVO** que motivou a consulta. Não abra
(nem preencha) a queixa principal com negativas de sintomas. As negativas relevantes
**não são apagadas** — apenas não lideram: entram no corpo da HDA, depois da queixa positiva.

**❌ Errado — negativa de sintoma abrindo a queixa:**
```
"Nega dor, coceira ou ardência. Refere desconforto ocasional ao usar computador,
mas nega dificuldade para visão de perto."
```

**✅ Correto — queixa positiva lidera; negativas permanecem no corpo:**
```
"Desconforto ocasional ao usar computador. Nega dor, coceira ou ardência;
nega dificuldade para visão de perto."
```
*(A negativa "nega dificuldade para perto" é MANTIDA — contrapõe presbiopia/H52.4 —,
mas nunca lidera a queixa principal.)*

---

### `medicacoes_em_uso`
Apenas medicamentos **oftalmológicos** que o paciente já usava **antes** desta consulta.

Capture de qualquer fonte:
- Paciente relata: *"eu uso Xalatan todo dia"*
- Médico revisa: *"você está usando Xalatan, Combigan..."*
- Médico confirma: *"continua com o Lumigan?"*
- Paciente confirma ao ser perguntado: *"sim, uso o colírio amarelo"*

Formato: nome + posologia quando mencionados → `"Xalatan 1 gota OE à noite"`
Sem posologia → só o nome → `"Xalatan, Timoptol"`

❌ NÃO inclui medicamentos sistêmicos (insulina, metformina, losartan) → vão em `alteracoes_sistemicas`

### `alteracoes_sistemicas`
Doenças sistêmicas + medicamentos sistêmicos em uso.
Formato sugerido: `"DM em uso de insulina e metformina, HAS em uso de losartan"`

### Negativas do paciente — frases EXATAS:
| O que o paciente disse | O que registrar |
|---|---|
| Nega colírio/remédio para os olhos | `"Nega uso de medicações oculares"` |
| Nega qualquer remédio | `medicacoes_em_uso: "Nega uso de medicações oculares"` + `alteracoes_sistemicas: "Nega comorbidades"` |
| Nunca fez cirurgia/tratamento | `"Nega diagnósticos e procedimentos oftalmológicos prévios"` |
| Não tem doença | `"Nega comorbidades"` |
| Família sem problema de visão | `"Nega diagnósticos oftalmológicos familiares"` |

> ⚠️ **Anti-alucinação em `antecedentes_familiares` (CRÍTICO):** nunca fabrique um
> antecedente familiar positivo a partir de ruído de STT que apenas *se parece* com a
> pergunta do médico. Só registre doença familiar com resposta positiva CLARA do paciente
> (*"minha mãe tem glaucoma"*, *"meu pai perdeu a visão"*).
> - ❌ Médico pergunta *"algum parente perdeu a visão?"* e a transcrição traz o ruído
>   *"perdeu a amizade muito muito carregamento"* → **não** interprete como parente que
>   perdeu a visão. Trechos embolados que só rimam com a pergunta não são resposta.
> - ✅ Nesse caso, como o médico **perguntou** e não houve afirmação clara →
>   `"Nega diagnósticos oftalmológicos familiares"` (negativa implícita). Se o tópico
>   nunca foi abordado → `null`. Jamais uma doença inventada.

### Afirmativas ambíguas — sem nome de doença:
Quando o paciente confirma uso de remédio sistêmico ou acompanhamento médico regular mas **não nomeia** a doença, registre a informação disponível — **não use "Nega comorbidades"**:

| O que o paciente disse | O que registrar |
|---|---|
| Confirma tomar remédio mas não nomeia | `"Usa medicação sistêmica (doença não especificada)"` |
| Confirma ir ao médico regularmente + tomar remédio | `"Faz acompanhamento clínico regular com uso de medicação sistêmica (patologia não identificada na consulta)"` |
| Afirma ter doença sistêmica mas não especifica | `"Relata comorbidade sistêmica não especificada"` |

> ⚠️ **Regra:** se há QUALQUER indício afirmativo de doença/remédio sistêmico na transcrição, mesmo com STT ruidoso, **NÃO use "Nega comorbidades"**. Prefira registrar a dúvida com a informação disponível.

---

## CONDUTA vs TRATAMENTO — REGRA ABSOLUTA

### CONDUTA e TRATAMENTO — delegação obrigatória

> ⚠️ **A alocação dos campos `conduta` e `tratamento` é sempre resolvida
> pela skill `conduta-tratamento-oftalmologia`.**
>
> Nunca tente classificar esses campos diretamente aqui.
> Passe o trecho relevante da transcrição para aquela skill e use o output
> dela para preencher os dois campos.

---

## EXEMPLO DE REFERÊNCIA — BLEFARITE

```
conduta:    "Encaminhamento: Dermatologista"
            "Prescrição de óculos"
            "Retorno 6 meses"

tratamento: "Compressa morna 2 min — 2x/dia"
            "Higiene palpebral com shampoo infantil — 2-3x/dia"
            "Lubrificante ocular 1 gota AO 6-8x/dia"
            "Ômega 3 1000mg — 1cp almoço e 1cp jantar por 30 dias"
```

---

## FLAGS DE INJEÇÃO AUTOMÁTICA

### `injectExamesNormais`
`true` SOMENTE se o médico afirma que **TODOS** os exames estão normais, sem exceção.

✅ Correto marcar `true`:
- *"exames normais"*, *"fundo de olho normal"*, *"biomicroscopia normal"*

❌ NÃO marcar `true`:
- *"tirando X tudo normal"* → há alteração
- *"os outros exames estão tranquilos"* → há exceção
- *"exame de pressão normal"* → só um exame
- Paciente com diagnóstico ocular ativo (catarata, glaucoma, cicatriz)
- **Regra:** se há QUALQUER alteração ocular conhecida → `false`

### `injectBlefarite`
`true` APENAS se blefarite é diagnosticada **explicitamente** na fala do médico:
- Médico usa a palavra: *"blefarite"*, *"blefaromeibomite"*, *"meibomite"*, *"disfunção de meibômio"*
- Médico descreve achado palpebral inflamatório: *"pálpebra inflamada"*, *"bordo palpebral alterado"*

❌ **NÃO marcar `true`** nas seguintes situações:
- Médico orienta higiene palpebral ou compressa morna **sem nomear blefarite**
- Paciente com olho irritado recebe instrução de higiene como medida genérica
- *"olho seco"* isolado, sem menção de blefarite ou meibomite
- Qualquer inferência: "sugere", "compatível", "pode ser" sem a palavra-chave

### `dilatacaoDetectada`
`true` se médico menciona dilatar pupila ou usar colírio de dilatação.

**Regra crítica (fase 1 — pausa para dilatação):** quando `dilatacaoDetectada: true`, defina SEMPRE:
- `conduta: null`
- `tratamento: null`
- `biomicroscopia: null`
- `fundoscopia: null`
- `injectExamesNormais: false`
- `injectBlefarite: false`

Conduta, tratamento e a descrição dos exames só podem ser determinados após
o retorno do paciente da dilatação. **MAS a ENTREVISTA deve ser extraída
normalmente**: `hda` (ou `retorno`), `medicacoes_em_uso`, antecedentes,
`alteracoes_sistemicas`, `antecedentes_familiares` e `diagnostico` (se já
mencionado) são preenchidos com o que foi dito antes da dilatação — a pausa
NÃO descarta a entrevista; ela é injetada imediatamente no prontuário.

### Marcador `[RETORNO DA DILATACAO]` (fase 2 — pós-dilatação)
Se a transcrição contém a linha `[RETORNO DA DILATACAO]`, o texto ANTES do
marcador é a entrevista pré-dilatação e o texto DEPOIS é a continuação da
MESMA consulta após a dilatação. Neste caso a dilatação JÁ OCORREU:
- `dilatacaoDetectada: false` (a menos que uma NOVA dilatação seja anunciada
  DEPOIS do marcador)
- Menções a *"vai dilatar"/"vou dilatar"* ANTES do marcador NÃO contam
- `conduta`, `tratamento`, `biomicroscopia` e `fundoscopia` são extraídos
  normalmente, usando o texto COMPLETO (antes + depois do marcador)
- `tipo_consulta` é classificado considerando a consulta inteira

### FLAGS DE DIAGNÓSTICO — Presbiopia (H52.4)

Inclua `"H524 - Presbiopia"` no campo `diagnostico` **somente** se PELO MENOS UM dos seguintes for verdadeiro:

✅ **Incluir H524:**
- Médico usa explicitamente a palavra *"presbiopia"* ou *"presbicia"*
- Médico prescreve óculos para perto / multifocal / progressivo **EM RESPOSTA A UMA QUEIXA ATIVA de dificuldade para ver de perto nesta consulta** (queixa relatada pelo paciente nesta visita, não histórica)
- Médico confirma dificuldade de acomodação relacionada à idade como achado novo desta consulta

❌ **NÃO incluir H524:**
- Paciente apenas menciona que *já usa* óculos de leitura / multifocal / progressivo na anamnese (histórico, sem nova queixa)
- Médico renova receita de óculos sem discutir dificuldade de visão para perto como queixa ativa
- Médico prescreve ou menciona óculos sem especificar tipo ("óculos", "lentes") — sem referência a perto, multifocal ou progressivo
- Consulta sobre outro diagnóstico (blefarite, pterígio, catarata) em que óculos são prescritos mas o motivo não é visão de perto
- A queixa de "dificuldade para perto" já era conhecida em consultas anteriores e não é o motivo desta visita

### ⚠️ Regra de exclusão mútua:
`injectBlefarite` e `injectExamesNormais` são **MUTUAMENTE EXCLUSIVOS**.
Se há blefarite → biomicroscopia NÃO é normal → `injectExamesNormais = false`.

### `dados.biomicroscopia` e `dados.fundoscopia` — delegação obrigatória

> ⚠️ **A descrição do segmento ANTERIOR (`biomicroscopia`) e do segmento
> POSTERIOR (`fundoscopia`) é sempre resolvida pelas skills dedicadas
> `biomicroscopia-oftalmologia` e `fundoscopia-oftalmologia`.**
>
> Nunca classifique esses campos diretamente aqui. Passe o trecho relevante da
> transcrição (queixa/HDA + fala do exame) para a skill correspondente e use o
> output dela para preencher o campo e ajustar `injectExamesNormais` /
> `injectBlefarite`. A cópia que executa em produção é o prompt
> `src/gemini-interview-agent.js`.

Resumo das regras que aquelas skills aplicam (orientação rápida — a fonte
canônica são as skills e o prompt):

- **Normal nos dois olhos** → campo `null` + `injectExamesNormais=true` (template `AO` automático).
- **Achado em um olho** → olho afetado detalhado + contralateral normal (`olho calmo` na biomicroscopia, `fundo sem alterações` na fundoscopia); `injectExamesNormais=false`.
- **Lateralidade** sai de TODA a consulta; `AO` PROIBIDO em achado unilateral por natureza; lado indeterminável → `[CONFIRMAR OLHO AFETADO]`.
- **Fonte** = exame do médico, nunca relato do paciente nem histórico.
- **Exclusão mútua**: `injectBlefarite` e `injectExamesNormais` nunca são ambos `true`.

---

## FORMATO DE SAÍDA — JSON

Todos os campos de texto = **strings** (nunca arrays).
Use `\n` para separar múltiplos itens dentro de um campo.

### Primeira consulta:
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
    "conduta": "string com \n entre itens, ou null",
    "tratamento": "string com \n entre itens, ou null",
    "biomicroscopia": "string ou null (preencher apenas quando há achado de segmento anterior: pterígio, pinguécula, leucoma, etc.)"
  },
  "injectExamesNormais": false,
  "injectBlefarite": false,
  "dilatacaoDetectada": false,
  "_raciocinio": "explicação do raciocínio"
}
```

### Retorno:
```json
{
  "tipo_consulta": "retorno",
  "dados": {
    "retorno": "string ou null",
    "medicacoes_em_uso": "string ou null",
    "diagnostico": "string ou null",
    "conduta": "string com \n entre itens, ou null",
    "tratamento": "string com \n entre itens, ou null",
    "biomicroscopia": "string ou null (preencher apenas quando há achado de segmento anterior: pterígio, pinguécula, leucoma, etc.)"
  },
  "injectExamesNormais": false,
  "injectBlefarite": false,
  "dilatacaoDetectada": false,
  "_raciocinio": "explicação do raciocínio"
}
```

---

## CASOS DE REFERÊNCIA

### Caso 1 — Primeira consulta com catarata
```
Médico: levantou HDA, antecedentes, família, examinou, diagnosticou catarata incipiente,
        prescreveu óculos multifocais, retorno anual.

Resultado:
  tipo_consulta: "primeira_consulta"
  diagnostico: "H250 - Catarata senil incipiente\nH524 - Presbiopia"
  conduta: "Prescrição de óculos multifocais\nRetorno anual"
  tratamento: null
  injectExamesNormais: false  ← há alteração (catarata)
  injectBlefarite: false
```

⚠️ O diagnóstico SEMPRE usa o formato "HXXX - Descrição". Catarata nuclear → H251.
Ver regra completa de H524 na seção "FLAGS DE DIAGNÓSTICO — Presbiopia" abaixo.

### Caso 2 — Retorno de blefarite
```
Médico: perguntou evolução, examinou pálpebras, confirmou blefarite,
        orientou compressa + higiene, prescreveu lubrificante,
        encaminhou para dermatologista, retorno em 6 meses.

Resultado:
  tipo_consulta: "retorno"
  diagnostico: "H010 - Blefarite\nOlho seco"
  conduta: "Encaminhamento: Dermatologista\nRetorno 6 meses"
  tratamento: "Compressa morna 2 min — 2x/dia\nHigiene palpebral com shampoo infantil — 2-3x/dia\nLubrificante ocular 1 gota AO 6x/dia"
  injectExamesNormais: false
  injectBlefarite: true
```

### Caso 3 — Consulta com exames normais
```
Médico: "biomicroscopia e fundoscopia normais, pressão normal,
         grau estável, retorno em 1 ano."

Resultado:
  tipo_consulta: "retorno"
  conduta: "Retorno anual"
  tratamento: null
  injectExamesNormais: true
  injectBlefarite: false
```

### Caso 5 — Primeira consulta com pressão limítrofe e história familiar de glaucoma
```
Paciente: refere desconforto ocular, dor de cabeça e visão embaçada há ~1 ano,
          piora com uso de microscópio. Já fez consulta em 2018 em Goiânia por
          suspeita de glaucoma. Mãe tem glaucoma. Pressão hoje: 23 e 22 mmHg.

hda:                      "Desconforto ocular, dor de cabeça e visão embaçada há
                           cerca de 1 ano, agravado pelo trabalho com microscópio."
antecedentes_oftalmol.:   "Acompanhamento por suspeita de glaucoma — consulta
                           com especialista em Goiânia em 2018."
antecedentes_familiares:  "Mãe com diagnóstico de glaucoma."
diagnostico:              "H400 - Suspeita de glaucoma\nH529 - Refração NE"

⚠️  Pressão de hoje (23/22 mmHg) NÃO vai na HDA — é dado de exame,
    não relato do paciente. Aparece implicitamente no diagnóstico.
```

### Caso 4 — Paciente nega tudo
```
Paciente: nega colírios, nega doenças, nega cirurgias, família sem problemas.

Resultado:
  medicacoes_em_uso: "Nega uso de medicações oculares"
  antecedentes_oftalmologicos: "Nega diagnósticos e procedimentos oftalmológicos prévios"
  alteracoes_sistemicas: "Nega comorbidades"
  antecedentes_familiares: "Nega diagnósticos oftalmológicos familiares"
```

### Caso 6a — Retorno de blefarite + presbiopia ATIVA (H524 ✅)
```
Cenário: Retorno. Paciente com irritação ocular e dificuldade para perto
(queixa ativa desta visita). Médico confirma blefarite, orienta compressa
morna + higiene palpebral com shampoo infantil, prescreve lubrificante
de uso contínuo, prescreve óculos só para perto COMO RESPOSTA à queixa.

Gatilho de H524: dificuldade de perto é queixa ativa + prescrição de óculos
para perto nesta consulta.

⚠️ ERRO DOCUMENTADO (2026-05-13): modelo alocou compressa morna e higiene
palpebral em CONDUTA. Correto é TRATAMENTO — o paciente executa fisicamente.

Resultado CORRETO:
  tipo_consulta: "retorno"
  diagnostico: "H010 - Blefarite bilateral\nH524 - Presbiopia"
  conduta: "Prescrição de óculos para perto"
  tratamento: "Compressa morna 2 min — 2-3x/dia
               Higiene palpebral com shampoo infantil — 1x/dia
               Lubrificante ocular — uso contínuo"
  injectBlefarite: true
  injectExamesNormais: false

❌ Resultado ERRADO que deve ser evitado:
  conduta: "Prescrição de óculos para perto
            Compressa morna 2 min — 3x/dia        ← ERRADO
            Higiene palpebral com shampoo infantil ← ERRADO"
  tratamento: "Lubrificante ocular — uso contínuo"
```

### Caso 6b — Retorno de blefarite, paciente já usa multifocal (H524 ❌)
```
Cenário: Retorno de blefarite. Paciente menciona na anamnese que usa óculos
multifocais há 2 anos. Médico trata blefarite, renova receita dos óculos
sem discussão nova sobre visão de perto. Não há queixa ativa de dificuldade
para perto nesta consulta.

Resultado CORRETO:
  tipo_consulta: "retorno"
  diagnostico: "H010 - Blefarite bilateral"   ← SEM H524
  injectBlefarite: true
  injectExamesNormais: false

❌ Resultado ERRADO: incluir H524 só porque o paciente mencionou multifocal
na anamnese ou porque o médico renovou os óculos sem nova queixa de perto.
```

### Caso 7 — Pterígio com blefarite concomitante
```
Médico: "começo de pterígio nasal, pálpebra um pouco irritada — vou passar
         compressa morna e shampoo de neném nos cílios, lubrificante."

Resultado:
  tipo_consulta: "primeira_consulta"
  diagnostico: "H111 - Pterígio\nH010 - Blefarite"
  conduta: "Retorno 2 semanas"
  tratamento: "Compressa morna 2 min — 2x/dia\nHigiene palpebral com shampoo infantil — 3x/dia\nLubrificante ocular 1 gota AO ao longo do dia"
  injectBlefarite: true
  injectExamesNormais: false
  dados.biomicroscopia: "AO: pterígio nasal em crescimento; hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio com secreção espessa; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
```

⚠️ `dados.biomicroscopia` NÃO é omitido quando `injectBlefarite = true`. Ambos coexistem: a flag dispara o tratamento automático de blefarite; o campo biomicroscopia garante que o pterígio apareça na descrição do exame.

---

## HISTÓRICO DE ERROS

| Data | Tipo | Erro | Causa raiz | Correção aplicada |
|---|---|---|---|---|
| 2026-05-13 | Alocação errada | Compressa morna e higiene palpebral foram para CONDUTA | Modelo ignorou regra SEMPRE-TRATAMENTO; confundiu "orientação do médico" com "decisão clínica" | Lista negra da conduta + teste obrigatório reposicionado + Caso 6 adicionado |
| 2026-05-14 | Alocação repetida | Compressa morna e higiene palpebral foram para CONDUTA novamente (erro idêntico ao de 2026-05-13) | Reforço de prompt insuficiente para prevenir recorrência | Guard `_guardCondutaContaminada` adicionado ao DecisionEngine — corrige no runtime independente do LLM |
| 2026-05-15 | Classificação errada | Consulta de primeira vez classificada como `retorno` | Médico fez perguntas sistêmicas ("alguma doença?", "toma remédio?") mas a anamnese foi breve — IA pesou o critério "consulta focada" acima da presença de perguntas sistêmicas | Regra de prioridade máxima adicionada: perguntas sistêmicas = sempre `primeira_consulta`, independente de qualquer outro critério |
| 2026-06-18 | Fonte errada na biomicroscopia | Hemorragia subconjuntival relatada pelo paciente como histórico ("olho ficou vermelho há dias") foi incluída na biomicroscopia | Regra de fonte da biomicroscopia estava implícita — IA inferiu achado de exame a partir de relato subjetivo | Regra explícita adicionada: `dados.biomicroscopia` = apenas observações do médico no exame atual; relato do paciente vai na HDA |
| 2026-06-18 | Falso positivo opacidade cápsula | `opacidadeCapsulaDetectada=true` disparado pelo relato histórico do paciente ("fiz limpeza da lente") | `'limpeza da lente'` em OPACIDADE_CAPSULA_COMMANDS era genérico demais — aparece em histórico de pacientes pseudofácicos | Removido das triggers genéricas; adicionado LENTE_LIMPA_COMMANDS como sinal negativo explícito ("lente limpa") |
| 2026-06-19 | Falso positivo H524 | Presbiopia (H524) inserida em consultaS onde paciente apenas menciona já usar multifocal/óculos para perto na anamnese, sem queixa ativa de dificuldade de perto nesta visita | Regra "obrigatória quando multifocal é prescrito" era ampla demais — disparava em renovação de receita e em menções históricas | Seção "FLAGS DE DIAGNÓSTICO — Presbiopia" adicionada com critérios explícitos; Caso 6 dividido em 6a (H524 ✅) e 6b (H524 ❌) |
| 2026-06-24 | Fonte errada na biomicroscopia (paciente pseudofácico) | Paciente relatou "catarata os dois, as duas cirurgias" na anamnese → modelo escreveu "catarata" (ou "cristalino transparente") na biomicroscopia como se fosse achado atual | Dado histórico da anamnese (cirurgia prévia) foi confundido com achado de exame; a regra de fonte estava definida para "hemorragia subconjuntival" mas não cobria o caso de pseudofácico | Regra explícita adicionada na seção `dados.biomicroscopia`: pós-facectomia → "cristalino transparente" proibido → obrigatório "pseudofácico, LIO bem posicionada" |
| 2026-07-27 | Lateralidade — bilateralização de achado unilateral | Abrasão corneana por corpo estranho (só o olho direito na história) injetada como `AO`, descrevendo lesão no olho são; diagnóstico `H161 - Ceratite traumática` sem lado | Regra antiga mandava usar `AO` como "fallback seguro" quando o médico não citava o olho no exame — fez exatamente o que está escrito. Lateralidade estava presa à fala do exame, ignorando a queixa/HDA | Regra reescrita (`biomicroscopia` + `diagnostico`): lado sai de toda a consulta; `AO` PROIBIDO em achados unilaterais por natureza (trauma/corpo estranho/abrasão); lado indeterminável → `[CONFIRMAR OLHO AFETADO]` / `(confirmar olho)`, nunca assumir `AO` |
| 2026-07-28 | Fundoscopia sem regras de lateralidade (assimetria com a biomicroscopia) | A fundoscopia tinha só formato `OD sem alterações / OE achado` numa linha; sem regra de `AO`-proibido para achado unilateral, sem descritor normal completo do olho contralateral, sem escape de lado indeterminável | A seção de fundoscopia no prompt nunca recebeu o bloco de lateralidade que a biomicroscopia ganhou — dependia 100% do LLM não bilateralizar um descolamento/nevo/glaucoma | Seção `dados.fundoscopia` reescrita simétrica à biomicroscopia (prompt + SKILL): formato por olho (`OD:`/`OE:` em linhas separadas), contralateral como `fundo sem alterações`, `AO` proibido em achado posterior unilateral por natureza, `escavação fisiológica` (não "simétrica") em linha de um olho, regra de flag `injectExamesNormais=false` quando há achado |
