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

**STOP_COMMANDS_CURTOS** (despedidas curtas — hook `stop_curto`):
- Frases curtas/ambíguas ("tchau", "ta bom entao", "ate logo") que só valem
  como despedida quando estão NO FIM da fala (`endAnchored`)
- Stop agendado com 2s de espera — CANCELADO se a fala continuar
- Cancelamento agora exibe aviso visível: "⚠️ Encerramento cancelado"

**STOP_SAUDACAO_COMMANDS** (saudações-despedida — hook `stop_saudacao`):
- `"bom dia"`, `"boa tarde"`, `"boa noite"` usadas como despedida ("tá ok, bom dia")
- Dupla proteção: `endAnchored` (fim da fala + cancelamento) E `minSessionMs`
  (ignoradas nos primeiros 2 min da gravação, quando são saudação de ABERTURA)
- Origem: caso real 2026-06-12 — consulta encerrada com "tá ok, bom dia" não
  disparou nenhum gatilho e precisou de parada manual

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

## LÓGICA DE INJEÇÃO — DILATAÇÃO (fluxo em 2 fases)

### Fase 1 — pausa (`dilatacaoDetectada = true`)

1. Gravação para imediatamente
2. `conduta`, `tratamento`, `biomicroscopia` e `fundoscopia` são zerados (`null`)
   e `injectExamesNormais`/`injectBlefarite` são forçados a `false`
   (DecisionEngine `_guardDilatacao` + `_reconcileInjectFlags`)
3. A **ENTREVISTA é injetada imediatamente**: HDA/retorno, medicações em uso,
   antecedentes, alterações sistêmicas, antecedentes familiares e diagnóstico
   (se já mencionado)
4. A transcrição da fase 1 é persistida em `_shospDilatacaoPhase1`
   (`chrome.storage.local`, TTL 6h) — **mesmo quando não há dado clínico**
   ("pausa pura"): nada da entrevista se perde
5. Os dados de áudio injetados também são persistidos para re-injeção na fase 2
   (caso o SHOSP descarte campos não salvos)

### Fase 2 — retorno da dilatação (nova gravação)

1. Ao processar a nova sessão, a transcrição da fase 1 é anexada ANTES do texto
   atual, separada pelo marcador `[RETORNO DA DILATACAO]`
2. O Gemini analisa a consulta COMPLETA e agora extrai conduta, tratamento,
   biomicroscopia e fundoscopia normalmente (regra do marcador no prompt)
3. O marcador impede que o *"vai dilatar"* da fase 1 redetecte dilatação;
   os fallbacks de gatilho no código varrem apenas o texto da sessão atual
4. A injeção da fase 2 mescla os dados persistidos da fase 1 nos campos vazios
   e remove `_shospDilatacaoPhase1` ao concluir

> ⚠️ O botão **Limpar** manual descarta a fase 1 persistida (novo paciente).
> O clearAll automático pós-injeção preserva.

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
'tem catarata', 'com catarata', 'e catarata', 'uma catarata',
'catarata incipiente', 'catarata inicial', 'catarata madura',
'opacidade do cristalino', 'cristalino opaco'
```
> ⚠️ `'a catarata'` foi REMOVIDO (2026-06-15): substring genérico demais — disparava em
> qualquer menção histórica ("antes tinha a catarata"), causando falso positivo em pseudofácicos.

### LIO_COMMANDS
```
'lente intraocular', 'lente esta bem', 'lente ta bem',
'lente esta otima', 'lente ta otima', 'lente esta boa', 'lente ta boa',
'lente bem posicionada', 'lente no lugar',
'operou o olho', 'operou os olhos', 'ja operou o olho', 'ja operou os olhos',
'operou catarata', 'ja operou de catarata',
'cirurgia de catarata', 'cirurgia foi bem', 'cirurgia ta otima', 'cirurgia deu certo',
'pseudofacico', 'pseudofaquico', 'lio bem posicionada', 'lio transparente'
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

### Caso 4 — STOP não dispara em consultas após a primeira da sessão ⭐
**Sintoma:** gatilho de encerramento não dispara a partir da 2ª consulta, médico precisa clicar manualmente
**Causa:** `consultaEncerradaDetectada` era setada como `true` na 1ª consulta e **não era resetada** em `StateManager.resetSession()`. O guard do hook STOP (`(s) => s.consultaEncerradaDetectada`) bloqueava todos os disparos subsequentes na mesma sessão do Chrome.
**Arquivo corrigido:** `scripts/state-manager.js` — adicionado `consultaEncerradaDetectada = false` no bloco de reset de flags
**Data:** 2026-05-11

### Caso 5 — Dilatação falsa disparada ao prescrever colírio de blefarite ⭐
**Sintoma:** Hook de dilatação dispara com cmd `"pingar o colirio"` quando médico está prescrevendo tratamento de blefarite (3x/dia), interrompendo a consulta prematuramente
**Causa:** `'pingar o colirio'`, `'vou pingar o colirio'`, `'pingar colirio'` e `'vou pingar os colirios'` eram genéricos demais — aparecem tanto em prescrição de blefarite quanto em dilataçcão
**Arquivo corrigido:** `config/clinical-triggers.js` — removidas as 4 variantes genéricas. Mantidas apenas formas que combinam dilation explícita: `'vou pingar para dilatar'`, `'vou colocar o colirio para dilatar'`
**Data:** 2026-05-11

### Caso 7 — Biomicroscopia injeta "catarata" em paciente pseudofácico ⭐
**Sintoma:** Campo de biomicroscopia mostra "catarata" para paciente que já fez facectomia (pseudofácico)
**Causa:** Duas falhas combinadas:
  1. `'a catarata'` em CATARATA_COMMANDS casava por substring em qualquer menção histórica da consulta ("antes tinha a catarata", "a cirurgia resolveu a catarata"), setando `catarataDetectada = true`
  2. LIO_COMMANDS não continha variantes das frases reais do médico ("lente tá ótima", "cirurgia tá ótima"), então `lioDetectada` ficava `false`; como `getBiomicroscopiaComLente()` prioriza LIO > catarata, o resultado final foi "catarata" indevido
**Arquivo corrigido:** `config/clinical-triggers.js` — removido `'a catarata'`; adicionadas variantes em LIO_COMMANDS: `'lente ta otima'`, `'lente esta otima'`, `'lente ta boa'`, `'cirurgia ta otima'`, `'cirurgia foi bem'`, `'cirurgia deu certo'`, `'operou o olho'`, `'operou os olhos'`
**Data:** 2026-06-15

### Caso 7b — Regressão do Caso 7: catarata vence LIO quando ambas as flags disparam ⭐
**Sintoma:** Biomicroscopia injeta "catarata" em paciente pseudofácico (consulta 2026-06-30: log mostrou `[Hook] Flag: catarata detectada` + `[Hook] Flag: LIO detectada`; o CID veio correto — `Z961 - Presença de lente intra-ocular` — mas a lente da biomicroscopia veio "catarata")
**Causa:** Uma mudança não commitada em `getBiomicroscopiaComLente()` inverteu a prioridade documentada do Caso 7. O código passou a usar `if (lioDetectada && !catarataDetectada) return LIO; if (catarataDetectada) return catarata`, fazendo **catarata vencer LIO** quando as duas flags disparam. A justificativa do comentário (cirurgia futura ativando LIO) já estava obsoleta — `'cirurgia de catarata'` foi removido de LIO_COMMANDS, então uma flag LIO ativa só significa pseudofacia confirmada (sem cristalino natural → impossível ter catarata).
**Arquivo corrigido:** `scripts/sidepanel-constants.js` — restaurada a prioridade **LIO > catarata** (`if (lioDetectada) return LIO`). Adicionados testes de regressão `[LENTE-1..4]` em `utils/hooks-test.js` cobrindo a resolução de lente (incl. catarata+LIO → LIO vence).
**Data:** 2026-06-30

### Caso 6 — injectAll injeta dados de áudio durante pausa de dilatação ⭐
**Sintoma:** Quando a câmera captura OCR enquanto a dilatação está pendente, o `injectAll()` chamado pela câmera encontra `audioData` setado (por `displayAudioResults`) e injeta conduta/tratamento de uma consulta que ainda não terminou
**Causa:** `injectAll()` não tinha guard para `dilatacaoDetectada` — apenas `processAudioInBackground` bloqueava o caminho de áudio, mas o caminho de câmera contornava esse bloqueio
**Arquivo corrigido:** `scripts/sidepanel-injection.js` — adicionado guard no topo de `injectAll()`: quando `dilatacaoDetectada=true`, o áudio é temporariamente removido e apenas a câmera é injetada; o `audioData` é restaurado para injeção manual ao final da consulta
**Data:** 2026-05-11
