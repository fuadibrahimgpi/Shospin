---
name: ocr-topcon-oftalmologia
description: "Interpreta e organiza dados de tickets de autorefrator TOPCON para prontuários oftalmológicos. Use quando o usuário apresentar imagem ou transcrição de ticket TOPCON e precisar extrair refração, tonometria e paquimetria em JSON estruturado, com regras anti-alucinação, validação de lateralidade OD/OE, tratamento de tickets dobrados, ilegíveis, invertidos, colunas paralelas, ERR, lensômetro e bloqueio de injeção automática quando houver incerteza clínica."
---

# OCR TOPCON — Interpretação Segura de Tickets Oftalmológicos

## Objetivo

Extrair dados de tickets de autorefrator TOPCON de forma estruturada, rastreável e conservadora, priorizando segurança clínica e evitando alucinação. A saída deve ser um JSON pronto para revisão humana e, quando seguro, para injeção em prontuário oftalmológico.

Esta skill não substitui julgamento clínico. Em caso de dúvida visual, lateralidade incerta, leitura incompleta ou inconsistência interna, prefira `null`, registre o motivo e bloqueie a injeção automática.

## Princípios absolutos

- Leia apenas caracteres, dígitos e sinais claramente visíveis no ticket.
- Nunca copie valores de OD para OE ou de OE para OD.
- Nunca misture valores de `KRT. DATA`, `KM DATA`, `KER.` ou `KERT.` com `REF. DATA`.
- Nunca calcule valores, exceto quando esta skill autorizar explicitamente uma inferência.
- Use `null` somente junto com um campo de motivo quando houver ambiguidade clínica.
- Se a lateralidade `<R>`/`<L>` estiver incerta, não injete automaticamente no prontuário.
- Se um campo estiver ilegível, use `null` apenas naquele campo; se o olho inteiro estiver ausente ou oculto, use `null` para o objeto inteiro do olho.
- Se houver conflito entre regra de extração e segurança clínica, prevalece a segurança: marque revisão manual e bloqueie injeção automática.

## Workflow obrigatório

### Passo 1 — Identificação do equipamento

| Indicador no ticket | Interpretação | Ação |
|---|---|---|
| `REF. DATA`, `RET. DATA`, `IER. DATA` | Autorefrator TOPCON | Prosseguir |
| `TOPCON CL-200`, `PSM`, `ABBE`, `DWN`, `UP` | Lensômetro | Rejeitar como autorefrator |
| Nenhum cabeçalho reconhecível | Tipo desconhecido | Extrair apenas se houver evidência suficiente e bloquear injeção |

Se for lensômetro, não extraia refração a partir de `PSM`, `ABBE`, `DWN` ou `UP`. Retorne o schema completo com `tipo_ticket: "lensometro"`, seções clínicas `null`, `_bloquear_injecao: true` e `_aviso` explicativo.

### Passo 2 — Orientação do ticket

O ticket pode estar fotografado de cabeça para baixo. Sinais comuns:

- `NAME`, `REF. DATA`, `TONO. DATA` ou `PACH. DATA` aparecem na parte inferior.
- Texto está invertido verticalmente.
- As linhas aparecem em ordem visual reversa.

Se o ticket estiver invertido, reoriente mentalmente antes de extrair. A lateralidade continua sendo definida por `<R>` e `<L>`, independentemente da posição física na imagem. Marque `_ticket_invertido: true`.

### Passo 3 — Mapeamento das seções visíveis

Identifique quais seções estão presentes antes de extrair:

| Cabeçalho | Ação |
|---|---|
| `REF. DATA` | Extrair refração |
| `TONO. DATA` | Extrair tonometria |
| `PACH. DATA` | Extrair paquimetria |
| `KRT. DATA`, `KM DATA`, `KER.`, `KERT.` | Ignorar completamente |

Em tickets dobrados ou parciais, é frequente `KRT. DATA` aparecer de um lado da foto e `REF. DATA` de outro. Nunca use valores de ceratometria como se fossem refração.

### Passo 4 — Transcrição literal antes da extração

Antes de gerar o JSON final, monte mentalmente uma transcrição curta das linhas que sustentam a extração:

- linha ou bloco usado para OD;
- linha ou bloco usado para OE;
- linha de tonometria OD/OE, se presente;
- linha de paquimetria OD/OE, se presente.

Esses textos devem aparecer em `debug_leitura`. Se não houver texto confiável para um campo, use `null` e registre o motivo.

## Regra CYL — leitura da coluna de cilindro do ticket TOPCON

O cabeçalho da coluna de cilindro no ticket TOPCON é sempre `CYL: (−)` (notação negativa). Cada linha de medida tem 3 colunas: **S** (esfera), **C** (cilindro), **A** (eixo). Para evitar cilindro fantasma, siga rigorosamente:

1. **Só registrar cilindro quando houver número com sinal explícito** na coluna C (ex.: `−0,25`, `−0,50`, `−1,00`).
2. Se a coluna C trouxer traço, hífen, ponto, espaço em branco, `− − −`, `...`, `0.00` ou qualquer marcador não-numérico → registrar **cilindro ausente** (esférico puro). **Nunca assumir `−0,25` por padrão.**
3. Se cilindro for ausente, o campo eixo (A) **também fica vazio**. Nunca inventar eixo `90°` ou `180°` "porque o aparelho costuma imprimir".
4. Em caso de dúvida entre `−0,25` e traço (foto ruim, borda cortada, baixa resolução), **não chutar**: retornar o campo como `"indeterminado"` e sinalizar no JSON de saída com `cyl_incerto: true` para revisão manual do médico.
5. **Sanity-check obrigatório com S.E. (equivalente esférico) impresso pelo próprio TOPCON.** A relação é `S.E. = esfera + (cilindro / 2)`. Se o parser leu cilindro mas o S.E. impresso bate exatamente com a esfera pura (cilindro implícito = 0), **descartar o cilindro lido** — é alucinação. Exemplo: esfera `−0,50` e S.E. `−0,50` → cilindro tem que ser `0`; qualquer outro valor é erro de leitura.
6. As 3 medidas consecutivas do mesmo olho devem ser coerentes entre si. Se 2 das 3 vêm sem cilindro e 1 vem com `−0,25`, tratar a divergente como provável alucinação e marcar `cyl_incerto: true`.
7. Quando em dúvida, **prefira subdiagnosticar cilindro a superdiagnosticar** — astigmatismo fantasma gera prescrição errada; ausência de astigmatismo discreto não causa dano.

## Refração (`REF. DATA`)

### Lateralidade

- `<R>` corresponde a OD.
- `<L>` corresponde a OE.
- A posição física na imagem não define lateralidade.
- A ordem das colunas é definida pelo cabeçalho impresso, como `<R> <L>` ou `<L> <R>`.
- Se o cabeçalho estiver ilegível, não assuma lateralidade para injeção automática. Extraia como melhor esforço, marque `_lateralidade_insegura: true` e `_bloquear_injecao: true`.

### Estrutura usual

O TOPCON costuma imprimir 3 medições e 1 média. Use a média, geralmente a 4ª linha ou a linha sem número de medição. Exemplo:

```text
S -1.25  C -0.50  A  90   <- medição 1: ignorar
S -1.50  C -0.50  A  85   <- medição 2: ignorar
S -1.25  C -0.75  A  90   <- medição 3: ignorar
S -1.25  C -0.50  A  88   <- média: usar
S.E. -1.50                 <- SE: usar para campo se
```

Nunca use uma linha que contenha apenas `S.E.` como fonte de ESF, CIL ou EIXO.

### Campos de refração

| Campo | Regra |
|---|---|
| `esf` | Copie com sinal. Zero pode ser `"plano"` se estiver assim no ticket. Se sinal ausente, só infira se ESF puder ser derivado com segurança de `SE - CIL/2`; se não, use `null`. |
| `cil` | Deve ser negativo, zero ou `null`. Se vier positivo em notação de cilindro positivo, converta para negativo somente se todos os campos necessários para transposição forem visíveis; caso contrário, bloqueie injeção. |
| `eixo` | Inteiro entre 1 e 180. Se `cil` for `0` ou `null`, `eixo` deve ser `null`. |
| `se` | Leia do ticket. Não calcule. Se ausente, use `null`. |

### CIL zero

Se `C 0.00` ou `C 0` estiver impresso:

- use `cil: 0`;
- use `eixo: null`;
- use `cil_motivo: "zero_impresso"`;
- não trate como dado ilegível.

Isso evita confundir ausência de astigmatismo com falha de leitura.

### CIL ilegível ou ausente

Se CIL não estiver claramente impresso:

- use `cil: null`;
- use `eixo: null`;
- preencha `cil_motivo` com `"ilegivel"`, `"ausente"` ou `"nao_aplicavel"`;
- nunca copie CIL/EIXO do outro olho.

### Anti-truncamento de CIL

Em tickets térmicos, valores como `-3.50` podem ser lidos erroneamente como `-0.50` ou `.50`. Antes de registrar CIL:

- confira se existe dígito inteiro antes do ponto decimal;
- leia `C - 3.50` como `-3.50`, não como `-0.50`;
- se a imagem estiver degradada e houver dúvida entre `-0.50` e `-3.50`, use `null` e bloqueie injeção;
- não rejeite CIL alto apenas por ser alto. CIL até `-8.00` pode ser clinicamente possível.

### Anti-espelhamento

É comum o equipamento obter leitura completa de um olho e apenas esfera do outro. Se uma coluna não mostra CIL/EIXO claramente:

- mantenha `cil: null` e `eixo: null` naquele olho;
- não use simetria visual;
- não copie valores da coluna vizinha;
- se OD e OE ficarem idênticos em `esf`, `cil` e `eixo`, com `cil` diferente de zero, marque `_padrao_suspeito: true`, `_bloquear_injecao: true` e peça revisão manual.

### Colunas paralelas

Exemplo:

```text
        <L>      <R>
S    -0.75    -1.25
C    -0.50    -0.50
A       93       70
```

Resultado:

- OE é a coluna sob `<L>`: `esf="-0.75"`, `cil=-0.50`, `eixo=93`.
- OD é a coluna sob `<R>`: `esf="-1.25"`, `cil=-0.50`, `eixo=70`.

Nunca use “esquerda da imagem = OD” como regra. A lateralidade é sempre pelo cabeçalho.

### Média, inversão e linha espúria em colunas paralelas

Quando houver 3 medições e 1 média, conte as linhas. A 4ª linha costuma ser a média. Porém, se as 3 medições concordam e a última linha aparece com colunas trocadas ou valor discrepante, trate como possível erro de OCR ou linha espúria.

Regras:

- Se as 3 medições concordam num valor para cada coluna e a última linha mostra exatamente os valores invertidos, use o valor majoritário das 3 medições e marque `_medicao_discrepante_detectada: true`.
- Para CIL, se `N >= 3` medições mostram valor `X` e a última mostra `Y` com diferença maior que `0.25D`, use `X`.
- Para EIXO, se `N >= 3` medições mostram valor `X` e a última mostra `Y` com diferença circular maior que `10°`, use `X`.
- Diferença circular = `min(abs(X-Y), 180-abs(X-Y))`.
- Se a correção depender de interpretação incerta, bloqueie injeção automática.

## Tonometria (`TONO. DATA`)

| Situação | Regra |
|---|---|
| Linha `R` | OD |
| Linha `L` | OE |
| Existe `AVG.` | Use o valor após `AVG.` |
| Não existe `AVG.` | Use o último número válido da linha |
| `ERR` isolado | Ignore aquela leitura |
| Valor entre parênteses, como `(16)` | Medição válida com artefato; use `AVG.` quando disponível |

Faixa usual esperada: 8 a 25 mmHg. Valores 22 a 24 podem ser clinicamente válidos e não devem ser rejeitados automaticamente.

Exemplos:

```text
R   17   (16)  (16)  AVG. 17  -> od = 17
L   ERR  ERR   (17)  AVG. 16  -> oe = 16
R   14   15    14    14       -> od = 14
R   ERR  15                   -> od = 15
```

## Paquimetria (`PACH. DATA`)

| Situação | Regra |
|---|---|
| `RO.` | Etiqueta de OD, não valor separado |
| `LO.` | Etiqueta de OE, não valor separado |
| Número colado a `RO.` ou `LO.` | Primeira medição, não média |
| Existe `AVG.` | Use sempre o valor após `AVG.` |
| Valor em mm, como `0.540` | Converter para micra: `540` |
| `ERR` sem número | Leitura inválida |
| `ERR` seguido de número | Use o número se estiver claro |
| Todas as medições `ERR`, mas existe `AVG.` | Use `AVG.` |
| Todas as medições e `AVG.` são `ERR` | Use `null` para aquele olho |

Faixa usual esperada: 420 a 650 µm.

Exemplo:

```text
RO.513  0.504  0.510  AVG. 0.509  -> od = 509
LO.487  0.492  0.484  AVG. 0.488  -> oe = 488
```

## Valores extremos válidos

Não rejeite automaticamente valores extremos clinicamente possíveis:

| Campo | Faixa extrema válida |
|---|---|
| ESF | -20.00 a +20.00 |
| CIL | 0 a -8.00 |
| EIXO | 1 a 180 |
| Tonometria | 8 a 25 mmHg |
| Paquimetria | 420 a 650 µm |

Valores fora dessas faixas não devem ser corrigidos automaticamente. Se estiverem claramente impressos, registre o valor, marque `_valor_extremo: true` e `_bloquear_injecao: true`.

## Schema de saída obrigatório

Retorne apenas JSON válido, sem comentários fora do JSON.

```json
{
  "debug_leitura": {
    "tipo_ticket": "autorefrator | lensometro | desconhecido",
    "orientacao": "normal | invertido | incerta",
    "secoes_visiveis": {
      "ref_data": true,
      "tono_data": false,
      "pach_data": false,
      "krt_ignorada": false
    },
    "linha_od_texto": "texto literal ou null",
    "linha_oe_texto": "texto literal ou null",
    "linha_tonometria_texto": "texto literal ou null",
    "linha_paquimetria_texto": "texto literal ou null"
  },
  "refracao": {
    "od": {
      "esf": "string_ou_null",
      "esf_motivo": "lido | inferido_com_segurança | ilegivel | ausente | nao_aplicavel",
      "cil": "numero_ou_null",
      "cil_motivo": "lido | zero_impresso | ilegivel | ausente | nao_aplicavel",
      "eixo": "inteiro_ou_null",
      "eixo_motivo": "lido | cil_zero | cil_ilegivel | ilegivel | ausente | nao_aplicavel",
      "se": "string_ou_null",
      "se_motivo": "lido | ilegivel | ausente | nao_aplicavel"
    },
    "oe": {
      "esf": "string_ou_null",
      "esf_motivo": "lido | inferido_com_segurança | ilegivel | ausente | nao_aplicavel",
      "cil": "numero_ou_null",
      "cil_motivo": "lido | zero_impresso | ilegivel | ausente | nao_aplicavel",
      "eixo": "inteiro_ou_null",
      "eixo_motivo": "lido | cil_zero | cil_ilegivel | ilegivel | ausente | nao_aplicavel",
      "se": "string_ou_null",
      "se_motivo": "lido | ilegivel | ausente | nao_aplicavel"
    }
  },
  "tonometria": {
    "od": "numero_ou_null",
    "oe": "numero_ou_null",
    "motivo_od": "lido | ilegivel | ausente | nao_aplicavel",
    "motivo_oe": "lido | ilegivel | ausente | nao_aplicavel"
  },
  "paquimetria": {
    "od": "numero_ou_null",
    "oe": "numero_ou_null",
    "motivo_od": "lido | convertido_mm_para_micra | ilegivel | ausente | nao_aplicavel",
    "motivo_oe": "lido | convertido_mm_para_micra | ilegivel | ausente | nao_aplicavel"
  },
  "_lateralidade_insegura": false,
  "_ticket_invertido": false,
  "_tipo_desconhecido": false,
  "_medicao_discrepante_detectada": false,
  "_padrao_suspeito": false,
  "_valor_extremo": false,
  "_bloquear_injecao": false,
  "_revisao_manual": false,
  "_aviso": null
}
```

## Validação final obrigatória

Antes de entregar o JSON, execute mentalmente esta lista:

- O tipo do equipamento foi identificado?
- Lensômetro foi rejeitado como autorefrator?
- Ticket invertido foi reorientado?
- `KRT. DATA`, `KM DATA`, `KER.` e `KERT.` foram ignorados?
- `<R>` foi mapeado para OD e `<L>` para OE?
- Lateralidade incerta gerou `_lateralidade_insegura: true` e `_bloquear_injecao: true`?
- Foi usada a média ou o valor mais seguro, e não uma linha espúria?
- CIL zero foi registrado como `0`, não como `null`?
- `cil: null` sempre gerou `eixo: null`?
- `cil: 0` sempre gerou `eixo: null`?
- CIL/EIXO não foram copiados do outro olho?
- OD e OE idênticos com CIL diferente de zero geraram `_padrao_suspeito: true`?
- `SE` foi lido do ticket, não calculado?
- Tonometria usou `AVG.` quando disponível?
- Paquimetria converteu mm para micra quando necessário?
- Todo `null` importante tem motivo?

Se qualquer resposta for incerta, marque `_revisao_manual: true`. Se a incerteza puder afetar injeção em prontuário, marque também `_bloquear_injecao: true`.

## Casos de referência

### Caso 1 — Formato padrão

```text
<R> S -0.25  C -1.75  A 82 / S.E. -1.25
<L> S +0.25  C -1.75  A 96 / S.E. -0.75
```

Resultado:

- OD: `esf="-0.25"`, `cil=-1.75`, `eixo=82`, `se="-1.25"`.
- OE: `esf="+0.25"`, `cil=-1.75`, `eixo=96`, `se="-0.75"`.

### Caso 2 — CYL zero

```text
<R> S -1.50  C 0.00  A 43 / S.E. -1.50
```

Resultado:

- OD: `esf="-1.50"`, `cil=0`, `cil_motivo="zero_impresso"`, `eixo=null`, `eixo_motivo="cil_zero"`, `se="-1.50"`.

### Caso 3 — Colunas paralelas com `<R>` à direita

```text
        <L>      <R>
S    -0.75    -1.25
C    -0.50    -0.50
A       93       70
```

Resultado:

- OE: `esf="-0.75"`, `cil=-0.50`, `eixo=93`.
- OD: `esf="-1.25"`, `cil=-0.50`, `eixo=70`.

### Caso 4 — CIL alto com risco de truncamento

```text
        <R>         <L>
S    + 0.75      + 1.25
C    - 3.50      - 3.50
A       84           76
```

Resultado:

- OD: `esf="+0.75"`, `cil=-3.50`, `eixo=84`.
- OE: `esf="+1.25"`, `cil=-3.50`, `eixo=76`.

Nunca transformar `-3.50` em `-0.50`.

### Caso 5 — Paquimetria com `RO.` e `AVG.`

```text
RO.513  0.504  0.510  AVG. 0.509
LO.487  0.492  0.484  AVG. 0.488
```

Resultado:

- OD: `509`.
- OE: `488`.

### Caso 6 — Tonometria com `ERR`

```text
R   17   (16)  (16)  AVG. 17
L   ERR  ERR   (17)  AVG. 16
```

Resultado:

- OD: `17`.
- OE: `16`.

### Caso 7 — Lensômetro CL-200

Ticket com `TOPCON CL-200`, `PSM`, `ABBE`, `DWN` ou `UP`.

Resultado:

- `tipo_ticket: "lensometro"`;
- `refracao: null`;
- `tonometria: null`;
- `paquimetria: null`;
- `_bloquear_injecao: true`;
- `_aviso: "Ticket de lensômetro CL-200. Não é ticket de autorefrator TOPCON."`.
