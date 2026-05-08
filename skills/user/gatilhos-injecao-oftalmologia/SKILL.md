---
name: gatilhos-injecao-oftalmologia
description: >
  Define e mantém os gatilhos de voz e a lógica de injeção automática da
  extensão Chrome de oftalmologia (Shosp). Use esta skill sempre que o usuário
  precisar adicionar, remover ou corrigir gatilhos de voz (STOP_COMMANDS,
  DILATACAO_COMMANDS, EXAMES_NORMAIS_COMMANDS, EXAME_BLEFARITE_COMMANDS,
  CATARATA_COMMANDS, LIO_COMMANDS, OPACIDADE_CAPSULA_COMMANDS,
  OLHO_IRRITADO_COMMANDS), ou quando houver problemas com injeção automática
  (biomicroscopia, fundoscopia, blefarite, receita olho irritado, conduta,
  tratamento). Também use quando a gravação parar cedo demais, não parar,
  ou quando um gatilho disparar no contexto errado.
---

# Gatilhos de Voz e Injeção Automática

## Visão Geral

A extensão usa o **Web Speech API** para monitorar o texto transcrito em tempo
real durante a gravação. Quando uma frase de gatilho é detectada, a extensão
executa uma ação automaticamente — sem parar a gravação (exceto STOP e DILATAÇÃO).

Todo texto é **normalizado antes da comparação**:
- Convertido para minúsculas
- Acentos removidos (`NFD + strip diacríticos`)
- Espaços múltiplos normalizados

> ⚠️ Por isso, todos os gatilhos devem ser escritos **SEM acentos** no código.

---

## MAPA DE GATILHOS

| Array | Tipo | Ação | Para gravação? |
|---|---|---|---|
| `STOP_COMMANDS` | Parada | Para gravação e inicia análise | ✅ Sim |
| `DILATACAO_COMMANDS` | Parada | Para gravação, omite conduta/tratamento | ✅ Sim |
| `EXAMES_NORMAIS_COMMANDS` | Injeção direta | Injeta biomicroscopia + fundoscopia normais | ❌ Não |
| `EXAME_BLEFARITE_COMMANDS` | Injeção direta | Injeta biomicroscopia blefarite + fundoscopia | ❌ Não |
| `OLHO_IRRITADO_COMMANDS` | Injeção direta | Injeta receita olho irritado | ❌ Não |
| `CATARATA_COMMANDS` | Flag passiva | Modifica lente na biomicroscopia → "catarata" | ❌ Não |
| `LIO_COMMANDS` | Flag passiva | Modifica lente → "pseudofacia, LIO transparente..." | ❌ Não |
| `OPACIDADE_CAPSULA_COMMANDS` | Flag passiva | Modifica lente → "pseudofacia, opacidade de cápsula..." | ❌ Não |

---

## PRIORIDADE DE EXECUÇÃO

A ordem de verificação é crítica para evitar conflitos:

```
1. FLAGS DE CRISTALINO (catarata / LIO / opacidade de cápsula)
   → verificadas PRIMEIRO para que a lente dinâmica esteja correta
   → setam examesNormaisInjetados = true (bloqueiam exames normais)

2. BLEFARITE
   → prioridade sobre exames normais
   → guard: blefariteInjetada OU examesNormaisInjetados

3. EXAMES NORMAIS
   → guard: examesNormaisInjetados

4. OLHO IRRITADO
   → guard: receitaOlhoIrritadoInjetada

4.5. DILATAÇÃO (com cooldown de 3s após outros gatilhos)

5. STOP (sem cooldown — deve sempre funcionar)
```

> ⚠️ **Exclusão mútua**: blefarite e exames normais nunca disparam juntos.
> Blefarite seta `examesNormaisInjetados = true`, bloqueando o gatilho de normais.

---

## TEXTOS INJETADOS

### Biomicroscopia Normal
```
AO: olho calmo, córnea transparente, câmara anterior formada,
pupila regular e reagente, cristalino transparente
```

### Biomicroscopia Blefarite
```
AO: hiperemia e espessamento da margem palpebral, telangiectasias
e disfunção de glândulas de meibômio com secreção espessa;
córnea transparente, câmara anterior formada, pupila regular e
reagente, cristalino transparente
```

### Fundoscopia Normal
```
FUNDOSCOPIA INDIRETA: AO retina aplicada, mácula em bom aspecto,
sem alteração do padrão vascular, escavação simétrica e fisiológica
```

### Lente dinâmica (prioridade: opacidade > LIO > catarata > padrão)
| Condição | Substitui "cristalino transparente" por |
|---|---|
| Catarata | `catarata` |
| LIO | `pseudofacia, LIO transparente e bem posicionada` |
| Opacidade de cápsula | `pseudofacia, opacidade de cápsula posterior` |

---

## REGRAS DE QUALIDADE DOS GATILHOS

### ✅ Bom gatilho:
- Longo o suficiente para não aparecer no meio de outra frase
- Específico ao contexto (exame, encerramento, diagnóstico)
- Inclui variações naturais de fala do médico

### ❌ Gatilho problemático:
- Muito curto (ex: `"tudo normal"`, `"pode sair"`) → dispara fora de contexto
- Presente em mais de uma lista → comportamento imprevisível
- Genérico demais (ex: `"bem irritado"`) → falso positivo na queixa do paciente

### Regras específicas por tipo:

**STOP_COMMANDS:**
- Frases de despedida/encerramento que o médico usa AO FIM da consulta
- Devem ser longas ou ter contexto claro (ex: "qualquer duvida me liga")
- ❌ Evitar: `"ate logo"`, `"boa sorte"`, `"um abraco"` → acompanhante pode dizer

**DILATACAO_COMMANDS:**
- Devem combinar espera + localização física (ex: "esperar la fora")
- ❌ Evitar: `"esperar um pouco"` isolado → muito genérico

**EXAMES_NORMAIS_COMMANDS:**
- Devem indicar claramente que TODOS os exames estão normais
- ❌ Evitar: `"pressao normal"`, `"olho normal"` → só um exame

**OLHO_IRRITADO_COMMANDS:**
- Médico descrevendo o olho DO PACIENTE no exame
- ❌ Evitar: `"olho vermelho"`, `"bem irritado"` → paciente pode dizer na queixa

---

## LÓGICA DE INJEÇÃO — BLEFARITE

Quando `injectBlefarite = true`:

1. Injeta `BIOMICROSCOPIA_BLEFARITE` no campo de biomicroscopia
2. Injeta `FUNDOSCOPIA_NORMAL` no campo de fundoscopia
3. **NÃO** injeta `BLEFARITE_TRATAMENTO_PADRAO` automaticamente
4. **NÃO** injeta `BLEFARITE_CONDUTA_PADRAO` automaticamente
5. Preenche conduta e tratamento **APENAS** com o que o Gemini extraiu da consulta

> ⚠️ O tratamento padrão de blefarite (ATB+corticoide, lubrificante, Ômega 3)
> **nunca é injetado automaticamente** — só vai para tratamento se o médico
> mencionou explicitamente na consulta.

---

## LÓGICA DE INJEÇÃO — DILATAÇÃO

Quando `dilatacaoDetectada = true`:

1. Gravação para imediatamente
2. `conduta` e `tratamento` são zerados (`null`)
3. Se **não há nenhum dado clínico** → modo "pausa pura" (sem exibir nada)
4. Se **há dados clínicos** → exibe o que foi capturado, mas sem conduta/tratamento

---

## LÓGICA DE INJEÇÃO — EXAMES NORMAIS

Quando `injectExamesNormais = true`:

- Injeta `BIOMICROSCOPIA_NORMAL` (com lente dinâmica)
- Injeta `FUNDOSCOPIA_NORMAL` **apenas se** o médico mencionou "fundo" ou "fundoscopia"
  (detectado pela presença de `"fundo"` ou `"fundoscop"` no texto normalizado)

---

## GATILHOS ATUAIS — REFERÊNCIA COMPLETA

### STOP_COMMANDS (encerramento da consulta)
```
Frases de ajudar:       'algo que eu possa ajudar', 'algo que possa ajudar',
                        'algo mais que eu possa ajudar',
                        'mais alguma coisa que eu possa ajudar'

Recepção:               'pode ir na recepcao', 'pode buscar na recepcao',
                        'pode pegar na recepcao', 'pode ir la na recepcao',
                        'pode ir ate a recepcao'

Encerramento explícito: 'ate a proxima consulta', 'ate o proximo retorno',
                        'ate a proxima', 'ate o proximo',
                        'cuide-se bem', 'nos vemos em breve'

Dúvidas:                'qualquer duvida me procura', 'qualquer duvida me liga',
                        'qualquer duvida pode ligar', 'qualquer duvida pode me ligar',
                        'se tiver alguma duvida me procura', 'se tiver duvida me liga',
                        'se tiver alguma duvida pode me ligar'

Saída:                  'pode se retirar', 'pode ir embora',
                        'obrigado pela consulta', 'foi um prazer'

Entregar recepção:      'so entregar na recepcao', 'pode entregar na recepcao',
                        'entregar na recepcao', 'entrega na recepcao',
                        'so entregar isso na recepcao', 'pode entregar isso na recepcao',
                        'entrega isso na recepcao'

Encerramento médico:    'so passar na recepcao', 'pode passar na recepcao',
                        'passa na recepcao', 'passar na recepcao'

Dúvidas/perguntas:      'alguma pergunta alguma duvida', 'alguma pergunta ou duvida',
                        'tem alguma pergunta', 'tem alguma duvida',
                        'alguma duvida', 'alguma pergunta'

Posso ajudar:           'posso ajudar em alguma coisa mais',
                        'posso ajudar em mais alguma coisa',
                        'posso te ajudar em mais alguma coisa',
                        'posso ajudar em algo mais', 'posso ajudar mais em algo',
                        'posso ajudar com mais alguma coisa'
```

### DILATACAO_COMMANDS
```
'esperar la fora', 'aguardar la fora', 'espera la fora', 'aguarda la fora',
'esperar um pouco la fora', 'esperar ali fora', 'espera ali fora',
'aguardar na recepcao', 'esperar na recepcao',
'precisar dilatar', 'precisa dilatar', 'vou dilatar',
'vamos dilatar', 'vai dilatar', 'dar uma dilatada'
```

### EXAMES_NORMAIS_COMMANDS
```
'seus exames estao todos normais', 'seus exames estao normais',
'seus exames estao otimos', 'seus exames estao bons',
'exames estao todos normais', 'exames estao normais', 'exames normais',
'biomicroscopia e fundoscopia normais', 'biomicroscopia e fundoscopia normal',
'biomicroscopia sem alteracoes', 'fundoscopia sem alteracoes',
'fundo de olho normal', 'fundo de olho sem alteracoes',
'seus olhos estao normais', 'olhos estao normais'
(+ variações — ver sidepanel-constants.js)
```

### EXAME_BLEFARITE_COMMANDS
```
'blefarite', 'blefaromeibomite', 'meibomite',
'disfuncao de meibomio', 'palpebra inflamada',
'inflamacao palpebral', 'lubrificacao comprometida',
'olho seco por blefarite'
(+ variações — ver sidepanel-constants.js)
```

### CATARATA_COMMANDS
```
'tem catarata', 'com catarata', 'e catarata', 'uma catarata', 'a catarata',
'catarata incipiente', 'catarata inicial', 'catarata madura',
'opacidade do cristalino', 'cristalino opaco'
```

### LIO_COMMANDS
```
'lente intraocular', 'lente esta bem', 'lente bem posicionada',
'cirurgia de catarata', 'pseudofacico', 'lio bem posicionada'
```

### OPACIDADE_CAPSULA_COMMANDS
```
'limpeza da lente', 'opacidade de capsula', 'capsulotomia', 'yag',
'opacificacao da capsula posterior'
```

### OLHO_IRRITADO_COMMANDS
```
'seu olho esta bem irritado', 'seu olho esta irritado',
'seu olho ta irritado', 'seus olhos estao irritados',
'o senhor esta com o olho irritado', 'voce esta com o olho irritado',
'olho esta bem irritado', 'olhos estao irritados'
```

---

## COMO ADICIONAR UM NOVO GATILHO

1. Identificar qual lista corresponde à ação desejada
2. Escrever a frase **SEM acentos** (normalizeText já remove, mas evita confusão)
3. Verificar se a frase **não aparece em outras listas** (conflito)
4. Verificar se a frase **não aparece naturalmente no meio de consultas**
5. Adicionar variações naturais de fala (ex: `"ta"` e `"esta"`, `"voce"` e `"o senhor"`)

---

## CASOS DE REFERÊNCIA

### Caso 1 — Médico encerra com frase não mapeada
**Sintoma:** gravação não para, médico clica manualmente
**Solução:** identificar a frase de encerramento do médico e adicionar em `STOP_COMMANDS`
**Exemplo resolvido:** *"posso ajudar em alguma coisa mais"*, *"só entregar na recepção"*

### Caso 2 — Gatilho dispara no meio da consulta
**Sintoma:** gravação para cedo ou injeção acontece antes da hora
**Causa provável:** frase muito curta ou genérica
**Solução:** remover o gatilho problemático ou torná-lo mais específico
**Exemplo resolvido:** `"tudo normal"` removido pois aparecia fora de contexto

### Caso 3 — Blefarite injeta tratamento padrão sem prescrição
**Sintoma:** `BLEFARITE_TRATAMENTO_PADRAO` aparece mesmo sem o médico prescrever
**Causa:** lógica antiga usava `if (!campoTratamento.value)` sem verificar o Gemini
**Solução atual:** só preenche se `audioData?.dados?.tratamento` existir
