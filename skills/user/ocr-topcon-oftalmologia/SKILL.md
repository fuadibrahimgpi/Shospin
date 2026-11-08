---
name: ocr-topcon-oftalmologia
description: "Interpreta e organiza dados de tickets de autorefrator TOPCON para prontuários oftalmológicos. Use quando o usuário apresentar imagem ou transcrição de ticket TOPCON e precisar extrair refração, tonometria e paquimetria em JSON estruturado, com regras anti-alucinação, validação de lateralidade OD/OE, tratamento de tickets dobrados, ilegíveis, invertidos, múltiplos tickets, ERR e lensômetro, e descarte por olho quando houver incerteza clínica — as mesmas regras do OCR da extensão. Também use quando um erro de leitura do ticket (sinal, eixo, olho trocado) derrubou o CID refrativo — miopia, hipermetropia, astigmatismo ou presbiopia não lançados; nesse caso carregue junto a skill cid-oftalmologia."
---

# OCR TOPCON — Interpretação Segura de Tickets Oftalmológicos

## Onde isso REALMENTE roda (autoridade)

> ⚠️ **O código que executa em produção é `src/gemini-exam-agent.js`:** o prompt
> `_getExamPrompt`, os prompts de verificação e desempate
> (`_getRefractionVerifyPrompt`, `_getSphereSignTiebreakPrompt`,
> `_getCylinderTiebreakPrompt`, `_getAxisTiebreakPrompt`), o pós-processamento
> `_postProcessRefraction` / `_processEye`, o bloqueio por olho `_resolveBlocking` e o
> CID refrativo `_inferCidRefracao`. Editar esta skill NÃO muda a extensão. Regra
> geral: `skills/user/README.md`.

Esta skill serve ao Claude lendo um ticket diretamente (foto ou transcrição colada).
Desde 2026-11-07 ela **segue o runtime**: mesmas regras de leitura e mesmo JSON de
saída do `_getExamPrompt`, e o valor final de cada olho é decidido pelas mesmas regras
do `_processEye`. O que só existe aqui é o que a extensão faz por mecanismo e o Claude
precisa fazer de cabeça: reorientar o ticket (a extensão gira a imagem e pede de novo),
rejeitar lensômetro e o loop de feedback com o médico. O teste
`SKILL_PROMPT_ANCHORS_OCR` confere as regras compartilhadas.

## Objetivo

Extrair dados de tickets de autorefrator TOPCON de forma estruturada, rastreável e conservadora, priorizando segurança clínica e evitando alucinação. A saída é o mesmo JSON que a extensão pede ao modelo, seguido do valor final por olho e da lista de avisos para revisão do médico.

Esta skill não substitui julgamento clínico. Em caso de dúvida visual, lateralidade incerta, leitura incompleta ou inconsistência interna, prefira `null` e explique em `_avisos`. Vazio é uma resposta válida; inventar um número é sempre pior do que `null`.

## Princípios absolutos

- Leia apenas caracteres, dígitos e sinais claramente visíveis no ticket.
- Nunca copie valores de OD para OE ou de OE para OD.
- Nunca misture valores de `KRT. DATA`, `KM DATA`, `KER.` ou `KERT.` com `REF. DATA`.
- Nunca calcule valores. Não estime. Não complete por simetria.
- Se a lateralidade `<R>`/`<L>` de um olho estiver incerta, esse olho inteiro é `null`.
- Se um campo estiver ilegível, use `null` naquele campo; se o olho inteiro estiver ausente, ilegível ou sem esfera, use `null` para o objeto inteiro do olho.
- Nunca decida qual coluna é S, C ou A pela magnitude dos valores: a ordem posicional manda (1ª = S, 2ª = C, 3ª = A). Esfera pequena com cilindro grande (ex.: `S -0.25  C -3.75  A 76`) é real.
- OD e OE podem ser muito diferentes (anisometropia). Não harmonize.

## Workflow obrigatório

### Passo 1 — Identificação do equipamento

| Indicador no ticket | Interpretação | Ação |
|---|---|---|
| `REF. DATA`, `RET. DATA`, `IER. DATA` | Autorefrator TOPCON | Prosseguir |
| `TOPCON CL-200`, `PSM`, `ABBE`, `DWN`, `UP` | Lensômetro | Rejeitar como autorefrator |
| Nenhum cabeçalho reconhecível | Tipo desconhecido | Extrair apenas o que tiver cabeçalho explícito; avisar |

Se for lensômetro, não extraia refração a partir de `PSM`, `ABBE`, `DWN` ou `UP`: `refracao`, `tonometria` e `paquimetria` ficam `null` e `_avisos` explica o motivo.

### Passo 2 — Orientação do ticket

O ticket é quase sempre fotografado deitado ou de cabeça para baixo. O TOPO é o cabeçalho com a data, `REF.DATA` e `VD:`; o RODAPÉ é o lado de `TOPCON`, `TONO.DATA` e `PACH.DATA`. De cabeça para baixo, `REF.DATA` vira `ATAD.FER` e `<R>` vira `>R<`.

Reoriente mentalmente antes de extrair, até `REF.DATA` ficar legível na horizontal. Nunca transcreva com o ticket torto: lendo de lado, a coluna do cilindro fica onde a mente espera a esfera, e o valor sai trocado com aparência plausível. A lateralidade continua sendo definida por `<R>` e `<L>`, independentemente da posição física na imagem. Registre a reorientação em `_avisos`.

### Passo 3 — Mapeamento das seções visíveis

| Cabeçalho | Ação |
|---|---|
| `REF. DATA` | Extrair refração |
| `TONO. DATA` | Extrair tonometria |
| `PACH. DATA` | Extrair paquimetria |
| `KRT. DATA`, `KM DATA`, `KER.`, `KERT.` | Ignorar completamente (R1, R2, AVE, CYL ceratométrico, MM1, MM2 não são refração) |

Em tickets dobrados ou parciais, é frequente `KRT. DATA` aparecer de um lado da foto e `REF. DATA` de outro. Nunca use valores de ceratometria como se fossem refração.

### Passo 4 — Mais de um ticket na mesma foto

Cada ticket tem seu próprio cabeçalho com data e hora. Nunca misture seções de tickets diferentes como se fossem do mesmo exame. Se um ticket cobre parte do outro e não dá para saber a qual papel uma seção pertence, essa seção é `null`. Com mais de um ticket, `_ticketsMultiplos: true`.

## Auto-regulação por feedback (loop de aprendizado)

Esta skill mantém memória de erros passados para melhorar com retroalimentação. Dois arquivos sustentam o loop:

- `licoes-aprendidas.md` — regras destiladas dos erros recorrentes. **Deve ser lido antes de cada extração** e aplicado como camada extra de validação.
- `feedback-refracao.jsonl` — log append-only com cada extração e a correção marcada pelo médico.

### Antes de extrair

1. Leia `licoes-aprendidas.md` (mesma pasta da SKILL.md).
2. Para cada regra ali listada, verifique se o gatilho está presente no ticket atual. Se sim, aplique-a obrigatoriamente além das regras desta SKILL.md.
3. Em caso de conflito entre uma lição aprendida e uma regra base, **prevalece a mais conservadora** (a que bloqueia injeção ou usa `null`).

### Depois de extrair — registro

Após apresentar o JSON ao médico, registre uma linha em `feedback-refracao.jsonl` com este formato:

```json
{"id":"<timestamp_iso>","input_resumo":"<trecho literal das linhas usadas, max 200 chars>","output":<json_extraido>,"correcao":null,"consolidado":false}
```

Use `id` no formato ISO 8601 com segundos (ex: `2026-05-20T14:32:05`). Mantenha `correcao: null` enquanto o médico ainda não revisou.

### Marcação de correto/incorreto

Quando o médico revisar e disser o que estava certo/errado (campo a campo), preencha o campo `correcao` da última linha do JSONL com:

```json
{
  "od": {
    "esf": {"correto": true},
    "cil": {"correto": false, "valor_correto": -3.50, "motivo_erro": "truncamento_de_-3.50_para_-0.50"},
    "eixo": {"correto": true},
    "se": {"correto": true}
  },
  "oe": { "...": "..." },
  "observacao_geral": "string ou null"
}
```

Convenções:

- `correto: true` → não preencher `valor_correto` nem `motivo_erro`.
- `correto: false` → **sempre** preencher `valor_correto` (o que era certo) e `motivo_erro` (categoria curta, snake_case).
- Se um campo não foi extraído (era `null` correto), use `{"correto": true, "era_null": true}`.
- `observacao_geral`: usar para erros que não cabem em um campo único (ex.: `"lateralidade_invertida_OD_OE"`).

**Categorias sugeridas de `motivo_erro`**: `truncamento_cilindro`, `cilindro_fantasma`, `eixo_inventado`, `esfera_sinal_errado`, `lateralidade_trocada`, `linha_de_medicao_em_vez_de_media`, `se_calculado_em_vez_de_lido`, `ceratometria_lida_como_refracao`, `outro`.

### Consolidação em lições

Quando o usuário pedir "consolida as lições" (ou equivalente):

1. Leia todas as linhas de `feedback-refracao.jsonl` onde `consolidado: false` e há ao menos um `correto: false`.
2. Agrupe os erros por `motivo_erro`.
3. Para cada grupo com **≥2 ocorrências**, gere uma lição nova ou atualize uma existente em `licoes-aprendidas.md` no formato:

   ```markdown
   ### <motivo_erro em texto humano>

   - **Regra**: <ação concreta a tomar para evitar o erro>
   - **Origem**: <N> correções entre <data_primeira> e <data_ultima>
   - **Como aplicar**: <gatilho visual ou lógico que ativa a regra>
   ```

4. Erros com 1 única ocorrência **não viram lição ainda** — apenas após repetição, para evitar regras frágeis.
5. Após consolidar, marque `consolidado: true` nas linhas processadas.
6. Reporte ao médico: quantas lições novas, quantas atualizadas, quantos erros ainda isolados (1 ocorrência).

### Quando uma lição "expira"

Se uma lição existe e os últimos **5 casos** que ativaram seu gatilho foram extraídos corretamente sem precisar dela, marque-a como `<!-- candidata_a_remocao -->` e avise o médico. Não remova automaticamente.

### Convivência com a Validação final obrigatória

As lições de `licoes-aprendidas.md` são uma camada **adicional**, não substituem o checklist final. Após aplicar as lições, execute igualmente a validação final.

---

## Refração (`REF. DATA`)

### Lateralidade

- `<R>` corresponde a OD.
- `<L>` corresponde a OE.
- A posição física na imagem não define lateralidade. Nunca use "esquerda da imagem = OD".
- A ordem dos blocos é definida pelo cabeçalho impresso.
- Se você não consegue identificar `<R>` ou `<L>` claramente para um olho, retorne `null` para ESSE OLHO INTEIRO. Não chute.

### Estrutura usual

```text
<R>  S      C      A
  + 1.75  - 0.50   75    <- medição 1
  + 1.75  - 0.50   75    <- medição 2
  + 1.75  - 0.50   75    <- medição 3
  + 1.75  - 0.50   75    <- MÉDIA (negrito, imediatamente acima do S.E.)
  S.E. + 1.50            <- equivalente esférico: referência, não fonte
```

Podem existir de 1 a 3 medições. Transcreva as medições e a média separadamente (o valor final é decidido depois, ver "Valor final por olho"). A linha `S.E.` NUNCA é fonte de S, C ou A.

### Coluna S (esfera)

- Número com sinal (`+` ou `−`). Célula vazia → `null`.
- Se ESF = `0.00`, escreva `"plano"`. O TOPCON também imprime literalmente `PLANO` ou `PL`: retorne `"plano"`, nunca `+0.25` ou outro número pequeno.
- Se o sinal não aparece visível, null (não chute). Não infira o sinal pelo S.E. nem por expectativa clínica. (Na extensão, a verificação e o desempate de sinal resolvem isso com uma nova leitura; aqui, o médico confere.)
- `+` tem traço vertical E horizontal; `−` tem só o horizontal. Em impressão térmica o traço vertical do `+` sai fraco: olhe com atenção. Hipermetropia é tão comum quanto miopia.

### Regra CYL — coluna C (cilindro)

O cabeçalho `CYL: (-)` é só o marcador da convenção negativa, não é valor.

1. Se a célula está VAZIA, EM BRANCO, sem dígitos visíveis → `null`. Traço, hífen, ponto e `...` também são vazio.
2. Se o ticket imprime literalmente "0.00", é null (sem astigmatismo).
3. Se imprime "0.50" sem sinal, é -0.50 (convenção negativa).
4. Se a coluna C mostra algo que pode ser traço OU −0.25 (foto ruim, borda cortada, baixa resolução), não chute: `c: null` e `a: null` nesse olho.
5. Prefira subdiagnosticar cilindro a superdiagnosticar — astigmatismo fantasma gera prescrição errada; ausência de astigmatismo discreto não causa dano.
6. **Sinais independentes.** O sinal da esfera e o do cilindro são independentes. É normal haver dois números negativos na mesma linha (ex.: `S −2,25  C −0,50`). Nunca propague o sinal da esfera para o cilindro; nunca some ou combine os dois.
7. NUNCA copie o C do outro olho.

### Anti-truncamento de CIL

Em tickets térmicos, valores como `-3.50` podem ser lidos erroneamente como `-0.50` ou `.50`:

- confira se existe dígito inteiro antes do ponto decimal;
- leia `C - 3.50` como `-3.50`, não como `-0.50`;
- se houver dúvida entre `-0.50` e `-3.50`, retorne `c: null` e `a: null`;
- CIL alto (até `-8.00`) é clinicamente possível — não rejeite por magnitude.

### Coluna A (eixo)

- Inteiro de 1 a 180, sem sinal. Célula vazia → `null`.
- Se C é `null`, A obrigatoriamente também é `null`. Nunca invente `90°` ou `180°`.
- Cilindro sem eixo não existe. Se você vê o cilindro mas não consegue ler o eixo, releia; se ainda assim não conseguir, C e A ficam `null`.

### Passo dióptrico

Esfera e cilindro devem ser múltiplos exatos de 0.25D. Leitura como `-0.37`, `-1.13` ou `-0.40` é erro de OCR → `null`.

### Completude — esfera é obrigatória

Refração com C presente e S=null é IMPOSSÍVEL clinicamente. Se você não consegue ler a esfera de um olho, o OLHO INTEIRO é `null` — nunca devolva cilindro e eixo "isolados".

### S.E. — regra anti-alucinação

O campo `se` é apenas o reflexo literal da linha `S.E.` impressa. Não é cálculo, não é estimativa. Nunca copie a esfera para `se`.

- Linha `S.E.` ausente, cortada ou ilegível → `se: null`.
- Com cilindro presente, é matematicamente impossível que `se` seja igual à esfera (S.E. = S + C/2): releia; se continuar duvidoso, `se: null`.
- Sem cilindro (C vazio ou `0.00`), `se` igual à esfera é o esperado.
- Sinal do S.E. não visível → `se: null`.

### Autovigilância antes de responder

- As medições e a média de cada olho devem ser parecidas. Se as medições mostram C vazio e a média mostra C com valor, você provavelmente leu errado a média: releia.
- OD = OE exatamente em S, C e A → você quase certamente copiou um olho para o outro: releia.
- Se "preencheu" C ou A de um olho porque "o outro tem" → apague e marque `null`.
- Faltam pixels claros para um dígito → `null`.

## Tonometria (`TONO. DATA`)

| Situação | Regra |
|---|---|
| Linha `R` | OD |
| Linha `L` | OE |
| Existe `AVG.` | Use o valor da coluna `AVG.` |
| Não existe `AVG.` | Use o último número da linha |
| `ERR` isolado | Ignore aquela medição |
| `ERR 17` ou `(17)` | Use o número |

Transcreva também, em `_tonoMedicoes`, as medições individuais antes do `AVG.` (inclusive as entre parênteses, só o número; `ERR` não entra). Faixa esperada: 8 a 25 mmHg; 22 a 24 pode ser real e não deve ser rejeitado.

```text
R   17   (16)  (16)  AVG. 17  -> od = 17, _tonoMedicoes.od = [17, 16, 16]
L   ERR  ERR   (17)  AVG. 16  -> oe = 16, _tonoMedicoes.oe = [17]
R   14   15    14    14       -> od = 14
```

## Paquimetria (`PACH. DATA`)

| Situação | Regra |
|---|---|
| `RO.` / `LO.` | Etiqueta de OD / OE, não valor separado |
| Número colado a `RO.` ou `LO.` | Primeira medição, não média |
| Existe `AVG.` | Use sempre o valor após `AVG.` |
| Valor em mm, como `0.540` | Multiplique por 1000: `540` µm |
| Todas as medições e `AVG.` são `ERR` | `null` para aquele olho |

Faixa esperada: 420 a 650 µm.

```text
RO.513  0.504  0.510  AVG. 0.509  -> od = 509
LO.487  0.492  0.484  AVG. 0.488  -> oe = 488
```

## Schema de saída (o mesmo do `_getExamPrompt`)

Retorne este JSON, sem comentários dentro dele:

```json
{
  "_ticketsMultiplos": false,
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
```

Regras de `null`:

- Olho inteiro ilegível, sem esfera ou com lateralidade incerta → `refracao.od = null` (ou `refracao.oe = null`).
- Seção `REF.DATA` não aparece → `refracao = null`. Idem `tonometria` e `paquimetria`.
- Menos de 3 medições visíveis → preencha o que tiver e use `null` nas faltantes.
- Linha `S.E.` não visível ou ilegível → `se: null` nesse olho.

Os campos `_ticketRotacao` e `_refDataBox` do prompt da extensão servem ao mecanismo de girar e recortar a imagem; lendo direto, eles não se aplicam.

## Valor final por olho (o mesmo do `_processEye`)

Depois do JSON, apresente ao médico o valor final de cada olho (`esf`, `cil`, `eixo`, `se`) e a lista `_avisos`. As regras:

- **Esfera:** a da média; se a média não tem S, o valor mais frequente das medições. Se as 3 medições são unânimes e a média diverge, valem as medições (a média de 3 valores iguais é igual a eles). Sem esfera → olho descartado.
- **Cilindro:**
  - média vazia e 2+ medições vazias → sem cilindro;
  - média vazia e 2+ medições com valor → valor mais frequente das medições, com aviso;
  - média com valor e 2+ medições vazias → descartado (provável alucinação), com aviso;
  - média e medições com valor: 3 medições unânimes e diferentes da média → medições; todas a até 0.50D da média → média; senão, valor mais frequente das medições, com aviso.
- **Eixo:** só existe com cilindro. Mesma regra de unanimidade; sem eixo na média, o mais frequente de 2+ medições. Eixo fora de 1–180 → cilindro e eixo descartados. Cilindro sem eixo → cilindro descartado, olho fica esférico puro e `se` vira `null` (o S.E. impresso embutia o cilindro removido).
- **Passo dióptrico:** esfera fora do passo de 0.25D → olho descartado; cilindro fora do passo → cilindro e eixo descartados.
- **OD idêntico a OE** em esfera, cilindro e eixo, com cilindro presente → provável duplicação: a refração inteira não é aproveitada (`refracao` final `null`), e tonometria e paquimetria são preservadas.

### Bloqueio é por olho (o mesmo do `_resolveBlocking`)

Não existe um sinalizador único de "bloquear tudo". Um olho inseguro vira `null` e ganha um aviso como "Refração do OD NÃO injetada — <motivo>. O outro olho foi preservado." Se a refração inteira cair, tonometria e paquimetria da mesma captura continuam valendo, com o aviso "Refração NÃO injetada — <motivo>". Só quando nada se aproveita a captura inteira falha.

Valores extremos clinicamente possíveis (ESF de −20.00 a +20.00, CIL até −8.00) não são corrigidos: se estiverem claramente impressos, registre e acrescente um aviso para o médico conferir.

## Campo `cid_refracao` — computado pelo código, não pela IA

O campo `cid_refracao` **não** faz parte do JSON que a IA gera. Ele é calculado deterministicamente por `_inferCidRefracao` (em `src/gemini-exam-agent.js`) depois da validação da refração. Códigos **sem ponto**, que é o formato do SHOSP.

| Condição | CID adicionado |
|---|---|
| `esf ≥ +0.50` em qualquer olho | H520 — Hipermetropia |
| `esf ≤ −0.50` em qualquer olho | H521 — Miopia |
| `\|cil\| ≥ 0.25` em qualquer olho | H522 — Astigmatismo |
| `\|SE_OD − SE_OE\| > 1.50D` | H523 — Anisometropia |
| Esfera entre −0.25 e +0.25 e sem cilindro | nenhum CID refrativo (faixa emétrope: ±0.25 seria diagnóstico de ruído) |

- Só é preenchido quando a captura não falhou; refração bloqueada → `[]`.
- Olho `null` é ignorado na análise.
- Deduplicação contra os CIDs da transcrição clínica no momento da injeção.

## Validação final obrigatória

Antes de entregar, confira mentalmente:

- `licoes-aprendidas.md` foi lido e suas regras aplicáveis foram aplicadas?
- O tipo do equipamento foi identificado e lensômetro foi rejeitado?
- O ticket foi reorientado até `REF.DATA` ficar na horizontal?
- `KRT. DATA`, `KM DATA`, `KER.` e `KERT.` foram ignorados?
- `<R>` foi mapeado para OD e `<L>` para OE? Lateralidade incerta zerou o olho?
- As colunas S, C, A foram lidas pela posição, não pela magnitude?
- `C 0.00` e C vazio viraram `null`? C sem eixo virou `null`?
- Nenhum C/A foi copiado do outro olho?
- Todos os valores estão no passo de 0.25D?
- `se` foi lido do ticket, não calculado nem copiado da esfera?
- Tonometria usou `AVG.` e trouxe `_tonoMedicoes`? Paquimetria converteu mm para µm?
- Todo descarte relevante tem um aviso em `_avisos`?

## Casos de referência

### Caso 1 — Formato padrão

```text
<R> S -0.25  C -1.75  A 82 / S.E. -1.25
<L> S +0.25  C -1.75  A 96 / S.E. -0.75
```

Valor final: OD `esf="-0.25"`, `cil=-1.75`, `eixo=82`, `se="-1.25"`; OE `esf="+0.25"`, `cil=-1.75`, `eixo=96`, `se="-0.75"`.

### Caso 2 — CYL zero impresso

```text
<R> S -1.50  C 0.00  A 43 / S.E. -1.50
```

Valor final: OD `esf="-1.50"`, `cil=null`, `eixo=null`, `se="-1.50"`. O `0.00` é "sem astigmatismo", e o `A 43` não vale sem cilindro.

### Caso 3 — Colunas paralelas com `<R>` à direita

```text
        <L>      <R>
S    -0.75    -1.25
C    -0.50    -0.50
A       93       70
```

Valor final: OE `esf="-0.75"`, `cil=-0.50`, `eixo=93`; OD `esf="-1.25"`, `cil=-0.50`, `eixo=70`.

### Caso 4 — CIL alto com risco de truncamento

```text
        <R>         <L>
S    + 0.75      + 1.25
C    - 3.50      - 3.50
A       84           76
```

Valor final: OD `esf="+0.75"`, `cil=-3.50`, `eixo=84`; OE `esf="+1.25"`, `cil=-3.50`, `eixo=76`. Nunca transformar `-3.50` em `-0.50`.

### Caso 5 — Sinal da esfera ilegível

```text
<R> S  1.25  C -0.50  A 90 / S.E. -1.50   (sinal da esfera apagado)
```

Valor final: OD `null` (esfera sem sinal visível → `s: null` → olho sem esfera é descartado). Aviso para o médico conferir no ticket. Não deduzir `-1.25` pelo S.E.

### Caso 6 — Paquimetria com `RO.` e `AVG.`

```text
RO.513  0.504  0.510  AVG. 0.509
LO.487  0.492  0.484  AVG. 0.488
```

Resultado: OD `509`, OE `488`.

### Caso 7 — Tonometria com `ERR`

```text
R   17   (16)  (16)  AVG. 17
L   ERR  ERR   (17)  AVG. 16
```

Resultado: OD `17`, OE `16`.

### Caso 8 — Lensômetro CL-200

Ticket com `TOPCON CL-200`, `PSM`, `ABBE`, `DWN` ou `UP`: `refracao`, `tonometria` e `paquimetria` `null`, com o aviso "Ticket de lensômetro CL-200. Não é ticket de autorefrator TOPCON."

---

## Histórico de Erros

### 2026-06-12 — Ocorrência Nº 2 (verify inverte sinal da esfera + se calculado) e Nº 3 (média divergente de medições unânimes)
- **Erro observado (Nº 2)**: em 2 capturas consecutivas (13:28:17 e 13:28:32), a 2ª chamada (verify) leu OD `-1.00` onde o ticket imprimia `+1.00` e reportou `se=-2.25`/`-2.12`. O valor `-2.12` não é passo de 0.25D — é exatamente `-1.00 + (-2.25/2) = -2.125`: o verify **calculou** o se em vez de transcrever, fabricando coerência com o próprio erro de sinal. Resultado: 2 leituras corretas bloqueadas (`motivo_erro: esfera_sinal_errado` + `se_calculado_em_vez_de_lido`).
- **Erro observado (Nº 3)**: captura 13:24:17 — medições OD c=`-2.25` ×3 unânimes, "média" lida como `-2.00`; a tolerância `allClose ≤ 0.50D` mantinha a média errada silenciosamente.
- **Ponto exato na skill**: `_compareRefractionAgainstVerify` (sem tratamento para flip puro de sinal) e `_processEye` (média prioritária mesmo contra medições unânimes) em `geminiService.js`.
- **Causa raiz (Nº 2)**: prior do modelo favorece miopia (esfera negativa); em impressão térmica o traço vertical do "+" sai fraco. O verify, ao errar o sinal, completa o `se` por aritmética em vez de leitura, anulando o cross-check.
- **Nível de resposta aplicado**: Nível 2 — Revisão Estrutural.
- **Correção aplicada (v5.3.4)**: (a) flag `signFlip` no mismatch de esfera + `_tiebreakSphereSign`: 3ª chamada focada APENAS no caractere de sinal e magnitude da coluna S; decisão 2-de-3, com guarda de magnitude (±0.25D) para garantir que a 3ª leu a célula em disputa; (b) unanimidade das 3 medições sobrepõe a média em S, C e A; (c) prompts principal e verify ganharam instrução explícita de leitura do sinal ("+" tem traço vertical e horizontal, "−" só horizontal) e proibição de calcular o `se`.
- **Regra preventiva adicionada**: sim — lições "Sinal da esfera invertido pela verificação" e "Média divergente de medições unânimes" em `licoes-aprendidas.md`. O desempate 2-de-3 **não** reabre a brecha da Ocorrência Nº 1: usa evidência externa (3ª leitura), nunca auto-coerência da 1ª.

### 2026-05-21 — T3+T7 — Ocorrência Nº 1 (alucinação math-consistent em esfera)
- **Erro observado**: 1ª leitura alucinou ESF do OE como -0.75 (ticket real: 0.00). Verify retornou -0.00 (correto). Sistema injetou valor alucinado no prontuário com aviso "matematicamente consistente — não bloqueado".
- **Ponto exato na skill**: `_compareRefractionAgainstVerify` + caller em `geminiService.js`. Política downgradeava mismatch de esfera para aviso quando 1ª leitura passava em `_isEyeMathConsistent` (|esf+cil/2−se|≤0.15D).
- **Contexto de input**: ticket TOPCON normal, sem ambiguidade visual. Modelo alucinou esfera + S.E. coerente entre si.
- **Causa raiz**: heurística math-consistency mede coerência **interna** da 1ª leitura, que é precisamente o que o prior de auto-coerência do modelo imita melhor durante alucinação. Confundiu coerência com verdade. Verify externo é o único sinal independente.
- **Nível de resposta aplicado**: Nível 2 — Revisão Estrutural (refinou regressão da lição anterior, não simples remendo).
- **Correção aplicada**: ramo de Esfera em `_compareRefractionAgainstVerify` agora retorna `severity: 'hard'` sempre. Math-consistency exception fica restrita a CIL e EIXO. Comentários e JSDoc atualizados.
- **Regra preventiva adicionada**: sim — lição "Alucinação math-consistent em esfera" em `licoes-aprendidas.md`. Princípio generalizado: **coerência interna da 1ª leitura não vale contra discordância da 2ª, para campos clinicamente críticos**. Em futuras adições, qualquer novo campo crítico (grau de óculos, dose, lateralidade) deve seguir essa política.

---

## Antes do passo final — revisão obrigatória

**Passo final desta skill:** entregar os valores de refração/tonometria/paquimetria para injeção (a "Validação final obrigatória" desta skill entra inteira na revisão).

Antes de executá-lo, rodar a skill `revisao-final` sobre o resultado pronto: ela relê os parâmetros desta skill (regras críticas, checagem final, formato de saída, histórico de erros) e as regras do médico na memória, confere item por item e só então libera o passo final. Com algum item violado, corrige e revisa de novo (no máximo 3 rodadas); se ainda falhar, o passo final não é executado e o problema vai para o Fuad.
