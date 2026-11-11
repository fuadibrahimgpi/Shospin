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

## Onde isso REALMENTE roda (autoridade)

> ⚠️ **A cópia que executa em produção é o prompt do Gemini em
> `src/gemini-interview-agent.js` (`_buildConsultationPrompt`: regras anti-delírio,
> regra de fontes, regra de ambiguidade pergunta/resposta e os blocos de cada campo
> em `CAMPOS:`).** Depois do modelo, os guards de `src/DecisionEngine.js` corrigem
> o resultado (Guard 0 ruído, 7 fase 2 da dilatação, 8 antecedentes, 9 comorbidades,
> 6 presbiopia). Editar esta skill NÃO muda a extensão. Regra geral:
> `skills/user/README.md`.

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
   - ✅ Registre exatamente o que foi dito: `"colírio para pressão"`
   - ✅ Exceção — o **médico** disse `"lubrificante(s)"` sem marca nem princípio → `"Carmelose sódica ou hialuronato de sódio"` (protocolo declarado do médico; não é marca). Marca ou princípio dito vence: `"Lubrificante ocular (Systane)"`, `"Hialuronato"`. Só nomeia um lubrificante já prescrito — nunca cria prescrição.

---

## REGRA DE FONTES

| Campo | Fonte |
|---|---|
| `hda`, `retorno`, `antecedentes_*`, `alteracoes_sistemicas` | O que o **PACIENTE** relata |
| `medicacoes_em_uso` | Paciente OU médico revisando prontuário |
| `diagnostico`, `conduta`, `tratamento` | O que o **MÉDICO** diz/prescreve |

---

## ORDEM DOS OLHOS — OD SEMPRE ANTES DE OE (regra do médico, 2026-09-04)

Em **qualquer** campo que descreva os olhos separadamente (uma linha por olho), a linha
do **OD vem primeiro** e a do **OE depois**. A ordem é a do prontuário (direito →
esquerdo), **nunca** a ordem em que os olhos apareceram na fala — mesmo quando o achado
é do OE e o OE foi o assunto da consulta.

✅ `OD: olho calmo, ...\nOE: pterígio nasal grau I, ...`
❌ `OE: pterígio nasal grau I, ...\nOD: olho calmo, ...`

Não se aplica a `diagnostico`: ali cada linha é um **CID diferente**, não o mesmo achado
descrito por olho — a ordem dos CIDs é a de lançamento no SHOSP e não deve ser mexida.

O runtime reordena as linhas de `biomicroscopia` e `fundoscopia`
(`_ordenaOlhosODPrimeiro`, `src/DecisionEngine.js`); a saída já deve nascer na ordem certa.

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
| **Histórico** de uso de óculos/lente (desde quando, regularidade, higiene) | → `antecedentes_oftalmologicos` |
| Interpretação do médico sobre os achados | → `diagnostico` |
| **Episódios recorrentes/passados** relatados pelo paciente (hemorragia subconjuntival, terçol, olho vermelho que vai e vem) | → `antecedentes_oftalmologicos` (+ HDA se motivou a consulta) — **nunca** `diagnostico` atual nem `biomicroscopia` |

> ⛔ **Achado episódico só relatado não é diagnóstico atual.** Só emita o CID (e descreva no
> exame) quando o **médico descreveu ter visto hoje** — na lâmpada de fenda ("encosta o queixo",
> "pisca") ou apontando o achado. Marcadores de história ("de vez em quando", "já tive",
> "geralmente não percebo") + médico apenas explicando a causa (anticoagulante, esforço) →
> antecedente. Declaração de normalidade do médico ("o olho está ótimo") desempata contra o CID.
> Emitir o CID força a regra de consistência a escrever o achado na biomicroscopia — o erro
> de 2026-08-14 (H113 fabricada) nasceu exatamente aí.

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

#### Queixa principal — negativa de sintoma NÃO entra na HDA:

A queixa é sempre o **sintoma POSITIVO** que motivou a consulta. O que o paciente
**nega** não é escrito na HDA (nem no campo `retorno`) — nem abrindo, nem no corpo do texto.

**❌ Errado — negativa abrindo a queixa:**
```
"Nega dor, coceira ou ardência. Refere desconforto ocasional ao usar computador,
mas nega dificuldade para visão de perto."
```

**❌ Errado — negativa no corpo, depois da queixa:**
```
"Desconforto ocasional ao usar computador. Nega dor, coceira ou ardência;
nega dificuldade para visão de perto."
```

**✅ Correto — só o que é positivo:**
```
"Desconforto ocasional ao usar computador."
```

*(Vale também para as formas sem o verbo "negar" — "não sente dor", "sem coceira",
"não tem ardência": é a mesma negativa com outro fraseado e também fica de fora. Se o
paciente só deu negativas, a HDA fica com a queixa que existir, ou vazia — nunca
preenchida com negativas.)*

> ⛔ **Isso é sobre negativa de SINTOMA.** Negativa de **antecedente**
> (cirurgia, diagnóstico prévio, uso de óculos/lente, doença familiar, comorbidade)
> é proibida na HDA — pertence ao campo próprio.
> Teste rápido: *a frase fala de algo anterior a esta consulta que não é sintoma?*
> Então não é HDA.

#### Óculos/lente como motivo da procura — aí SIM lidera a HDA

O que separa os campos é o **papel** do dispositivo, não a palavra:

| O dispositivo é… | Campo |
|---|---|
| **Motivo da consulta** — *"vim trocar o óculos"*, *"o óculos não resolve mais"*, *"acho que o grau da lente aumentou"* | → `hda`, pode liderar a queixa |
| **Histórico de uso** — desde quando usa, regularidade de troca, higiene, adaptação | → `antecedentes_oftalmologicos` |

```
✅ hda: "Dificuldade para leitura com o óculos atual há ~6 meses; refere que o grau
         não resolve mais."
❌ hda: "Paciente usa lente de contato há dois anos, troca fora do prazo."  ← histórico
```

#### Tempo na HDA é sempre relativo — nunca data de calendário

Escreva **"há ~X dias / semanas / meses / anos"**. Nunca *"25 de junho"*, *"em 12/03"*,
*"desde março"*. E **não invente tempo**: se o paciente não disse, omita — converter data
em duração exige saber a data de hoje.

Só entra na HDA o que é **pertinente à queixa**. Números e trechos soltos da transcrição
(ruído de STT, valores de grau lidos em voz alta, conversa administrativa) não viram texto
de prontuário — dado de refração tem campo próprio.

**❌ Errado (log 2026-08-06):**
```
"…Relata que o grau parece ter aumentado, mencionando valores de 'dois e dois dois e
meio' e '25 de junho'."
```

> Em `antecedentes_oftalmologicos` vale a mesma preferência pela duração relativa, mas um
> **ano** explicitamente relatado pode ficar (*"cirurgia de catarata em 2018"*) — converter
> exigiria a data de hoje.

#### Lente de contato — é antecedente, e o que importa é a IRREGULARIDADE

O uso de lente de contato vai em `antecedentes_oftalmologicos`, nunca na HDA — mesma
lógica dos óculos. E o campo deve carregar o **padrão de uso**, não só o fato de usar:
tempo total, troca fora do prazo, ausência de dia de descanso, uso durante o sono,
adaptação sem orientação. É a irregularidade que tem valor clínico (ceratite, hipóxia
corneana, neovascularização).

⚠️ Esse dado quase sempre vem da fala do **médico**, e não do paciente — não descarte por
"não foi o paciente que disse". **Mas orientação sozinha não prova não-conformidade:** o
médico dá a mesma educação de rotina a quem já faz tudo certo. Pergunte se ele está
*reagindo* a algo que o paciente relatou:
- Reagindo (*"teve gente que usou até um ano"* logo após o paciente falar da lente dele) →
  **afirme o hábito**: `"troca irregular (lente mensal usada por até ~1 ano)"`.
- Conselho genérico solto (*"o ideal é ficar um dia da semana sem lente"*, sem nada do
  paciente) → registre a **orientação**, não a falha:
  `"Orientada sobre pausa semanal e retirada noturna"` — nunca `"sem dia de descanso
  semanal e com uso noturno"`, que seria fabricar não-conformidade.

**❌ Errado (log 2026-08-06):**
```
hda: "Paciente refere uso de lentes de contato há aproximadamente dois anos… Nega
problemas ou alterações oculares prévias além do uso de lentes de contato."
```
*(histórico do dispositivo na HDA + negativa de antecedente que contradiz a própria frase;
e a irregularidade — lente mensal usada por ~1 ano, sem descanso, dormindo de lente —
foi perdida.)*

**✅ Correto:**
```
hda: "Impressão de aumento do grau; dúvida sobre a validade da lente atual."
antecedentes_oftalmologicos: "Usuária de lente de contato há ~2 anos, sem orientação na
adaptação; troca irregular (lente mensal usada por até ~1 ano). Orientada sobre pausa
semanal e retirada noturna da lente."
```

---

### `medicacoes_em_uso`
Apenas medicamentos **oftalmológicos** que o paciente já usava **antes** desta consulta.

Capture de qualquer fonte:
- Paciente relata: *"eu uso Xalatan todo dia"*
- Médico revisa: *"você está usando Xalatan, Timolol..."*
- Médico confirma: *"continua com o Lumigan?"*
- Paciente confirma ao ser perguntado: *"sim, uso o colírio amarelo"*

Formato: nome + posologia quando mencionados → `"Xalatan 1 gota OE à noite"`, `"Timolol 2x/dia"`
Sem posologia → só o nome → `"Xalatan, Timoptol"`

- ⛔ **REGRA ANTI-ASSOCIAÇÃO E ANTI-MARCA NÃO DITA (log 2026-11-11):** NUNCA transforme uma monoterapia dita ("timolol") em associação fixa ("Brimonidina + timolol", "Bimatoprosta + timolol", "Dorzolamida + timolol", Combigan, Ganfort, Cosopt) se o outro componente ou a marca da associação NÃO foram pronunciados na transcrição. Timolol usado 2x/dia é `"Timolol 2x/dia"` — nunca Combigan nem Ganfort. Da mesma forma, NUNCA coloque entre parênteses um nome comercial que não tenha sido literalmente dito na gravação.

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

> ⛔ **`antecedentes_oftalmologicos` não aceita negativa implícita quando a consulta
> mostra história ocular prévia** (log 2026-08-03). A negativa implícita existe para o
> campo **vazio**, não para apagar o que foi dito. Antes de escrever *"Nega diagnósticos e
> procedimentos oftalmológicos prévios"*, varra a transcrição inteira atrás de: diagnóstico
> ocular dado por outro médico/consulta, consulta ou exame oftalmológico anterior,
> cirurgia/laser/injeção prévia, indicação cirúrgica anterior a hoje, colírio já em uso por
> um problema ocular, **uso de óculos de grau ou lente de contato**. Achou qualquer um →
> registre o achado (com o tempo, se dito).
> - ❌ **Erro real:** paciente com glaucoma prévio relatado saiu como *"Nega diagnósticos e
>   procedimentos oftalmológicos prévios"* — no mesmo JSON cuja HDA descrevia consulta
>   anterior com catarata diagnosticada e cirurgia indicada. Duas afirmações contraditórias
>   no mesmo prontuário; a negativa era falsa.
> - Resposta embolada/truncada a ponto de não dar para saber se afirmou ou negou → `null`.
>   Silêncio da transcrição não é negação do paciente: `null` diz *"não coletado"*; a frase
>   negativa **afirma** que ele negou.
> - **Rede determinística:** `DecisionEngine._guardAntecedentesNegativaFabricada` (Guard 8)
>   remove a frase negativa quando os campos redigidos ou a transcrição mostram história
>   prévia. É estritamente subtrativo — deixa o campo em branco e avisa o médico, nunca
>   escreve um antecedente.
> - **Lente de contato** entra nas duas listas do Guard 8 (log 2026-08-06). Óculos ficou
>   **de fora do guard** de propósito: quase todo paciente usa óculos, e guardar por isso
>   esvaziaria o campo em toda consulta — óculos é responsabilidade do prompt.
>   A forma da pergunta (*"o senhor usa lente de contato?"*, 3ª pessoa) também não conta
>   como evidência; exige-se verbo em 1ª pessoa, prazo, ou a orientação corretiva.

> ⛔ **"Nega comorbidades" é PROIBIDA após resposta afirmativa** (log 2026-08-04). A negativa
> implícita existe para a pergunta **sem resposta** — nunca para apagar um "sim". Antes de
> escrever *"Nega comorbidades"*, releia a resposta que veio **depois** da pergunta sistêmica
> (*"alguma doença?"*, *"toma remédio sempre?"*, *"precisa ir sempre ao médico?"*):
> - Resposta afirmativa em qualquer parte — *"sim"*, *"tenho"*, *"tomo"*, *"faço uso"*,
>   *"sou diabético"* → **proibido** escrever *"Nega comorbidades"*.
> - Afirmou **e** nomeou a doença/remédio (aqui ou em qualquer outro ponto da consulta) →
>   registre o que foi nomeado: `"Diabetes mellitus"`, `"HAS em uso de losartan"`.
> - Afirmou **sem** nomear → use a tabela de *Afirmativas ambíguas* logo abaixo.
> - ❌ **Erro real:** à pergunta *"tem alguma doença que precisa ir sempre no médico ou tomar
>   remédio sempre?"* o paciente respondeu *"sim"* — e o campo saiu *"Nega comorbidades"*. O
>   diabetes dele não entrou no prontuário.
> - **Varra a transcrição inteira:** o paciente costuma nomear a doença fora do bloco de
>   anamnese (*"eu sou diabético"*, *"tomo remédio de pressão"*). Diabetes, hipertensão e
>   tireoidopatia têm alto valor oftalmológico — nunca podem ficar de fora.
> - **Rede determinística:** `DecisionEngine._guardComorbidadesNegativaFabricada` (Guard 9)
>   remove a frase negativa quando a transcrição mostra resposta afirmativa ou doença
>   sistêmica citada. É estritamente subtrativo — deixa o campo em branco e avisa o médico,
>   nunca escreve um diagnóstico (o médico pronuncia *"diabetes"* ao **perguntar**).

### Afirmativas ambíguas — sem nome de doença:
Quando o paciente confirma uso de remédio sistêmico ou acompanhamento médico regular mas **não nomeia** a doença, registre a informação disponível — **não use "Nega comorbidades"**:

| O que o paciente disse | O que registrar |
|---|---|
| Confirma tomar remédio mas não nomeia | `"Usa medicação sistêmica (doença não especificada)"` |
| Confirma ir ao médico regularmente + tomar remédio | `"Faz acompanhamento clínico regular com uso de medicação sistêmica (patologia não identificada na consulta)"` |
| Afirma ter doença sistêmica mas não especifica | `"Relata comorbidade sistêmica não especificada"` |

O mesmo vale para `medicacoes_em_uso`, que **nunca** pode ficar em branco:

| O que o paciente disse | O que registrar |
|---|---|
| Nega usar colírio, ou nenhum foi mencionado | `"Nega uso de medicações oculares"` |
| Confirma usar colírio e nomeia ou diz a finalidade | o que ele disse: `"Xalatan"`, `"colírio para pressão"`, `"colírio lubrificante"` |
| Confirma usar colírio sem nomear nem dizer para quê | `"Refere uso de colírio (não identificado na consulta)"` |

> ⚠️ *Ausência de resposta* = negativa implícita. *Resposta afirmativa sem detalhe* **não é** ausência de resposta — é o terceiro caso da tabela, nunca a frase negativa e nunca `null`.

> ⚠️ **Regra:** se há QUALQUER indício afirmativo de doença/remédio sistêmico na transcrição, mesmo com STT ruidoso, **NÃO use "Nega comorbidades"**. Prefira registrar a dúvida com a informação disponível.

> ⛔ **Resposta embolada com indício de história** (log 2026-10-23): se a resposta à pergunta sistêmica veio fragmentada mas cita cirurgia, câncer/"cancerígena", internação, "cirurgias na cabeça", tratamento ou remédio, **não é ausência de resposta nem negação** — a ambiguidade NÃO "prioriza a negação". Registre o que foi dito sem completar o que o STT não entregou (ex.: "Relata cirurgias prévias (múltiplas, região craniana — detalhes não especificados)" ou "Relata comorbidade sistêmica não especificada"). A negativa padrão só vale se o trecho for puro ruído, sem nenhum indício de história. Erro real: "cinco cirurgias na minha cabeça" + "cancerígena não sei" → "Nega comorbidades".

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
            "Carmelose sódica ou hialuronato de sódio AO 6-8x/dia"
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

> **Texto do exame ≠ flag** (2026-08-04). O runtime é mais permissivo com a flag —
> shampoo/compressa/higiene mantêm `injectBlefarite` para conduta e tratamento. O que
> exige inflamação palpebral **descrita** é a descrição da biomicroscopia ("hiperemia e
> espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio").
> Sem descrição: `biomicroscopia: null` e o campo fica em branco com aviso ao médico.
> Nunca escreva achados palpebrais a partir do tratamento prescrito.
> **"Secreção espessa" não entra por rotina** (2026-08-04): saiu do template injetado e só
> é escrita se o médico falou de secreção ou glândula entupida.

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

⛔ **VETO CLÍNICO — pseudofacia bilateral (2026-08-04):** paciente com lente
intraocular nos **dois** olhos **nunca** recebe H52.4, mesmo com óculos
multifocais/para perto prescritos ou já em uso. Presbiopia é a perda da acomodação
do CRISTALINO — no olho operado ele não existe mais, e a adição de perto corrige a
ausência de acomodação da LIO. O código do quadro é `Z961 - Presença de lente
intra-ocular`; a refração residual entra pelos CIDs específicos (H52.0/H52.1/H52.2).
Com **um** olho fácico, H52.4 continua permitido (o olho não operado pode ser
présbita). Cirurgia apenas planejada não é pseudofacia.
Runtime: prompt em `src/gemini-interview-agent.js` (regra da presbiopia) + veto no
guard `_guardPresbiopiaObrigatoria` de `src/DecisionEngine.js`, que só bloqueia
quando a lateralidade resolvida por `parsePseudofaciaFromDados()` é `AO`.
Testes `[PRES-21..28]` em `utils/integration-test.js`.

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
  tratamento: "Compressa morna 2 min — 2x/dia\nHigiene palpebral com shampoo infantil — 2-3x/dia\nCarmelose sódica ou hialuronato de sódio AO 6x/dia"
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
               Carmelose sódica ou hialuronato de sódio — uso contínuo"
  injectBlefarite: true
  injectExamesNormais: false

❌ Resultado ERRADO que deve ser evitado:
  conduta: "Prescrição de óculos para perto
            Compressa morna 2 min — 3x/dia        ← ERRADO
            Higiene palpebral com shampoo infantil ← ERRADO"
  tratamento: "Carmelose sódica ou hialuronato de sódio — uso contínuo"
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
  diagnostico: "H110 - Pterígio\nH010 - Blefarite"
  conduta: "Retorno 2 semanas"
  tratamento: "Compressa morna 2 min — 2x/dia\nHigiene palpebral com shampoo infantil — 3x/dia\nCarmelose sódica ou hialuronato de sódio AO ao longo do dia"
  injectBlefarite: true
  injectExamesNormais: false
  dados.biomicroscopia: "AO: pterígio nasal em crescimento; hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"
```

⚠️ `dados.biomicroscopia` pode coexistir com `injectBlefarite = true`: a flag dispara o tratamento automático de blefarite; o campo biomicroscopia garante que o pterígio apareça na descrição do exame. Aqui o médico DESCREVEU o achado palpebral ("pálpebra um pouco irritada") — é o que autoriza a linha de blefarite no texto.

⚠️ Se a blefarite viesse **só** do tratamento (shampoo/compressa/higiene, sem nada dito sobre a pálpebra), o correto seria `biomicroscopia: null` com `injectBlefarite: true` — o runtime deixa o exame em branco e avisa o médico, em vez de afirmar hiperemia e telangiectasias que ninguém examinou.

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
| 2026-08-04 | Fundoscopia interpretativa | A descrição injetada da fundoscopia afirmava "suspeita de glaucoma — aguardar campo visual e OCT de nervo óptico" junto do achado | Os exemplos canônicos do prompt e da skill de fundoscopia ensinavam exatamente essa frase; o laudo do exame carregava a leitura diagnóstica e o plano, que pertencem a `diagnostico` (H400) e `conduta` | Regra "descritiva, nunca interpretativa" no prompt e na skill `fundoscopia-oftalmologia`; os dois exemplos de glaucoma reescritos só com a descrição. Runtime **avisa** e não edita (`_avisoFundoscopiaInterpretativa`) — em "escavação glaucomatosa (0,8)" o achado e a interpretação são a mesma oração. Testes `[FUNDO-INTERP-1..4]` |
| 2026-08-04 | Presbiopia em paciente pseudofácico | Paciente com LIO nos dois olhos (cirurgia AO há ~1 ano) recebeu `H524 - Presbiopia` — consulta de 2026-08-03 saiu com H401/H524/H010. Não há cristalino para perder acomodação: a adição de perto corrige a ausência de acomodação da LIO | Nem o prompt nem o guard conheciam pseudofacia como critério de exclusão; pior, `multifocal` sozinho já bastava para o guard INSERIR H52.4 (regra de 2026-07-31) — inclusive quando "lente multifocal" era o IMPLANTE, não óculos | Veto de pseudofacia **bilateral**: bloco `⛔ VETO` na regra da presbiopia do prompt + veto regente no `_guardPresbiopiaObrigatoria` (roda ANTES dos critérios de inclusão, porque `hasMultifocal` tornava o ramo de remoção inalcançável). Lateralidade vem de `parsePseudofaciaFromDados()`: só `AO` veta; unilateral e lado indefinido mantêm H52.4. H52.4 sozinha vira `Z961`. Testes `[PRES-21..28]` |
| 2026-08-04 | Negativa de comorbidades fabricada | À pergunta "tem alguma doença que precisa ir sempre no médico ou tomar remédio sempre?" o paciente respondeu **"sim"** — e `alteracoes_sistemicas` saiu `"Nega comorbidades"`. O diabetes dele não entrou no prontuário, e o campo passou a afirmar uma negativa que ele não deu | O checklist de negativa implícita do prompt (criado para a pergunta **sem resposta**) não tinha exceção para resposta afirmativa. Pior: a tabela de "afirmativas ambíguas sem nome de doença" existia **só na skill** — o prompt do Gemini nunca a recebeu, e nenhum teste `[SKILL-SYNC]` cobria a skill da entrevista | Bloco `⛔ EXCEÇÃO OBRIGATÓRIA` no prompt e na skill: afirmativa proíbe `"Nega comorbidades"`; nomeou → registra a doença; afirmou sem nomear → `"Relata comorbidade sistêmica não especificada"`. Ordem de varredura ampliada (o paciente nomeia a doença fora do bloco de anamnese). Rede determinística `_guardComorbidadesNegativaFabricada` (Guard 9), subtrativa como o Guard 8. Testes `[DE-COMORB-1..5]` e novos `[SKILL-SYNC]` da skill de entrevista |
| 2026-08-05 | Opacidade de cápsula perdida (linguagem leiga) | O médico examinou a LIO e disse *"realmente tá um pouquinho embaçada, mas ainda não tá atrapalhando"* — a biomicroscopia saiu `pseudofacia, LIO transparente e bem posicionada`, contradizendo a fala | Duas falhas somadas: (a) prompt e gatilhos só conheciam o jargão (`opacidade de cápsula`, YAG, `limpar a lente`) — a consulta é fala médico→paciente, mesma classe do log 2026-07-29 (blefarite leiga); (b) mesmo com a flag ligada, `getBiomicroscopiaComLente` devolvia o texto INTACTO pelo guard de texto misto: não havia placeholder `cristalino transparente` para trocar | Registro leigo no prompt e na skill `biomicroscopia-oftalmologia` (embaçada/embaçando, sujeira/sujeirinha, "vai precisar de uma limpeza"), com "intensidade não importa" e a separação queixa-de-visão / histórico do paciente. Gatilhos leigos em `OPACIDADE_CAPSULA_COMMANDS` **com o marcador de futuro dentro da string** (para não repetir 2026-06-18). Runtime: `_upgradeParaOpacidadeCapsula` atualiza a linha que já afirma pseudofacia (não inventa cirurgia — a linha já é de olho operado). Testes `[PCO-1..5]` e `[LENTE-9..12]` |
| 2026-08-14 | Negativa de sintoma na queixa | Consulta de retorno das 17:59 saiu com `retorno` = *"…O paciente nega outros sintomas como dor, coceira ou ardência"*. Negativa de sintoma não é queixa e não precisa constar do prontuário | A regra de 2026-07-23 só proibia a negativa de **liderar** — mandava explicitamente mantê-la no corpo (*"DEVE ser mantida"*), e o exemplo `✅ Correto` da skill exibia a negativa depois da queixa. O modelo seguiu a regra ao pé da letra | Proibição total no prompt (`hda` e `retorno`) e na skill: negativa de sintoma não entra no campo, nem abrindo nem no corpo; formas sem o verbo negar ("não sente dor", "sem coceira") incluídas; exemplo `✅` da skill reescrito só com a queixa positiva. Nenhum guard lê o texto da HDA — a mudança é de prompt |
| 2026-08-04 | Plano de investigação descartado da conduta | Consulta de cefaleia atribuída a erro refrativo: o médico disse "se resolver, perfeito; se não resolver, tem que investigar outras causas" e a `conduta` saiu só com a prescrição de óculos | A única regra do prompt sobre condicionais era o **descarte** de retornos condicionais vagos; sem contraexemplo, o modelo tratou o plano diagnóstico como mais um condicional vago | Categoria "plano de investigação condicional" na skill `conduta-tratamento-oftalmologia` e no prompt, adjacente ao filtro de descarte. Discriminador: condicional vago manda **rever a mesma coisa**; plano de investigação abre **linha diagnóstica nova**. Âncora `[SKILL-SYNC]`: `prosseguir investigação de outras causas` |
| 2026-08-17 | Exame nomeado por dedução (OCT fabricado) | Consulta das 12:38: o médico comentou o aspecto do nervo e anunciou *"um outro exame para fazer uma medida"* (sem nomeá-lo) e a `conduta` saiu com `Solicitar OCT de nervo óptico` — a palavra "OCT" **nunca** foi dita na consulta | O par `H400`↔(campo visual + OCT) era ensinado como exemplo canônico em 4 lugares (prompt: lista ✅ de conduta e bloco da fundoscopia; skills `fundoscopia` e `conduta-tratamento`). Com "nervo fora do padrão" + exame anunciado sem nome, o modelo casou o exibit e copiou o nome do exame de lá. É o **mesmo par** que em 2026-08-04 vazou para o TEXTO da fundoscopia: corrigiu-se ali e ele sobreviveu na conduta | Regra de classe (não patch de OCT) no prompt: o nome do exame só pode vir da **fala** do médico — proibido deduzi-lo do diagnóstico, do achado ou dos exemplos. Exame anunciado sem nome → `Solicitar exame complementar (não especificado na consulta)` (mesma forma do colírio não identificado); nenhum exame anunciado → linha nenhuma. O item da fundoscopia passou a dizer que trata de **onde** o pedido é registrado, não de **qual** exame pedir. Passo 1 do teste obrigatório checa o nome antes de emitir a linha. Skills `conduta-tratamento` e `fundoscopia` alinhadas. Testes `[COND-EXAM-1..3]` |

---

## Antes do passo final — revisão obrigatória

**Passo final desta skill:** entregar o JSON final da consulta para injeção no prontuário.

Antes de executá-lo, rodar a skill `revisao-final` sobre o resultado pronto: ela relê os parâmetros desta skill (regras críticas, checagem final, formato de saída, histórico de erros) e as regras do médico na memória, confere item por item e só então libera o passo final. Com algum item violado, corrige e revisa de novo (no máximo 3 rodadas); se ainda falhar, o passo final não é executado e o problema vai para o Fuad.
