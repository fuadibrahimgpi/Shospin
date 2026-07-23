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
- Devem ser longas ou ter contexto claro (ex: "qualquer duvida me procura")
- ❌ Evitar: `"ate logo"`, `"boa sorte"`, `"um abraco"` → acompanhante pode dizer
- ❌ NUNCA colocar aqui frases que também são DITADO DE CONDUTA ("retorno em
  um ano", "pode trocar os oculos") — o próprio texto satisfaz o gate de
  captura e a gravação para NO MEIO da consulta → usar STOP_COMMANDS_ANCORADOS
- "posso ajudar"/"algo que possa ajudar" SEMPRE com "mais" ("posso ajudar em
  MAIS alguma coisa") — sem o "mais" aparecem no meio de explicações de conduta

**STOP_COMMANDS_ANCORADOS** (encerramentos-conduta — hook `stop_ancorado`):
- Frases legítimas de despedida que também aparecem no meio da consulta como
  ditado de conduta ("retorno em seis meses", "pode trocar os oculos") ou
  entrega de documento ("declaracao de comparecimento")
- Só valem quando são a ÚLTIMA coisa dita (`endAnchored`, 2s de espera,
  cancelamento se a fala continuar) — na lista forte paravam a gravação no
  meio da consulta (revisão 2026-07-16)

**STOP_COMMANDS_CURTOS** (despedidas curtas — hook `stop_curto`):
- Frases curtas/ambíguas ("tchau", "ta bom entao", "ate logo") que só valem
  como despedida quando estão NO FIM da fala (`endAnchored`)
- Stop agendado com 2s de espera — CANCELADO se a fala continuar
- Cancelamento agora exibe aviso visível: "⚠️ Encerramento cancelado"
- **Despedida em cadeia** (2026-07-17): se a continuação for só vocabulário de
  despedida ("ate daqui a pouquinho obrigada"), o stop é PRORROGADO em vez de
  cancelado (`isContinuacaoDespedida` em `clinical-triggers.js`) — vale para
  todos os hooks endAnchored (curto, ancorado, saudação)

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

## LÓGICA DE INJEÇÃO — DILATAÇÃO (fila multi-paciente, 2 fases por paciente)

> **Rotina real do consultório (v5.1.5):** o paciente sai para dilatar e OUTRAS
> consultas acontecem enquanto o colírio faz efeito — inclusive outras
> dilatações. A extensão nunca fica "em espera": cada pausa vira um **slot
> independente** na fila persistida `_shospDilatacaoPausas`
> (`chrome.storage.local`, TTL 6h por slot, módulo `scripts/dilatacao-pausas.js`).
> O painel mostra a **sala de espera**: uma linha por paciente pausado, com
> rótulo (tipo + hora + título da aba do prontuário), botão **Retomar** próprio
> e **✕** para descartar.

### Fase 1 — pausa (`dilatacaoDetectada = true`)

1. Gravação para imediatamente
2. `conduta`, `tratamento`, `biomicroscopia` e `fundoscopia` são zerados (`null`)
   e `injectExamesNormais`/`injectBlefarite` são forçados a `false`
   (DecisionEngine `_guardDilatacao` + `_reconcileInjectFlags`)
3. A **ENTREVISTA é injetada imediatamente**: HDA/retorno, medicações em uso,
   antecedentes, alterações sistêmicas, antecedentes familiares e diagnóstico
   (se já mencionado)
4. Nasce um **slot novo na fila** com a transcrição da fase 1 e a identidade do
   prontuário aberto (URL/título da aba) — **mesmo quando não há dado clínico**
   ("pausa pura"): nada da entrevista se perde. Slots de outros pacientes já em
   dilatação **não são tocados** (o modelo antigo de chave única sobrescrevia)
5. Os dados de áudio injetados também são gravados no slot para re-injeção na
   fase 2 (caso o SHOSP descarte campos não salvos)

### Consultas intercaladas (enquanto o colírio faz efeito)

- Toda gravação sem retomada armada é **paciente NOVO**: nada da fila é
  anexado, mesclado — **nem apagado**. (Correção v5.1.5: a injeção de um
  paciente intercalado apagava a pausa de quem estava esperando.)
- Vários pacientes podem estar na sala de espera ao mesmo tempo; cada um tem
  seu slot e seu botão **Retomar**.

### Fase 2 — retorno da dilatação (armar o slot + nova gravação)

1. O médico clica em **Retomar** na linha do paciente que voltou (arma
   `retomar=true` naquele slot; no máximo UM slot armado por vez — armar um
   desarma o outro; há botão **Desarmar** para desfazer)
2. Ao processar a nova sessão, a transcrição do slot armado é anexada ANTES do
   texto atual, separada pelo marcador `[RETORNO DA DILATACAO]`
3. O Gemini analisa a consulta COMPLETA e agora extrai conduta, tratamento,
   biomicroscopia e fundoscopia normalmente (regra do marcador no prompt)
4. O marcador impede que o *"vai dilatar"* da fase 1 redetecte dilatação;
   os fallbacks de gatilho no código varrem apenas a cauda do texto da sessão
5. A injeção da fase 2 mescla os dados do slot nos campos vazios e **remove só
   aquele slot** ao concluir (injeção só de câmera no meio da fase 2 não
   consome o slot). Se o prontuário aberto difere do prontuário onde a pausa
   nasceu, um aviso é logado (sanidade anti-contaminação)

> ⚠️ O botão **Limpar** manual apenas DESARMA retomadas pendentes (paciente
> novo); as pausas dos demais pacientes ficam na fila — descarte individual
> pelo **✕** da sala de espera. O clearAll automático pós-injeção preserva tudo.
> Pausas com `motivo='exame'` (pausa manual no meio do exame, paciente ainda na
> sala) nascem ARMADAS: a gravação seguinte continua a mesma consulta.

---

## LÓGICA DE INJEÇÃO — EXAMES NORMAIS

Quando `injectExamesNormais = true`:

- Injeta `BIOMICROSCOPIA_NORMAL` (com lente dinâmica)
- Injeta `FUNDOSCOPIA_NORMAL` **apenas se** o médico mencionou "fundo" ou "fundoscopia"
  (detectado pela presença de `"fundo"` ou `"fundoscop"` no texto normalizado)

---

## GATILHOS ATUAIS — REFERÊNCIA COMPLETA

### STOP_COMMANDS (encerramento da consulta — lista forte, para em 500ms)
```
Frases de ajudar        'algo mais que eu possa ajudar', 'algo mais que eu posso ajudar',
(sempre com "mais"):    'mais alguma coisa que eu possa ajudar', 'mais alguma coisa que eu posso ajudar',
                        'alguma coisa mais que eu possa ajudar', 'alguma coisa mais que eu posso ajudar',
                        'posso ajudar em mais alguma coisa', 'posso te ajudar em mais alguma coisa',
                        'posso ajudar em alguma coisa mais', 'posso ajudar em algo mais'
                        ❌ REMOVIDAS (2026-07-16): 'algo que (eu) poss(a|o) ajudar',
                           'posso ajudar em alguma coisa', 'posso ajudar alguma duvida'
                           → sem o "mais" aparecem no meio de explicações

Recepção:               'pode ir na recepcao', 'pode buscar na recepcao', 'pode pegar na recepcao',
                        'pode ir la na recepcao', 'pode ir ate a recepcao', 'pode ir para a recepcao',
                        'vai la para a recepcao', 'vai para a recepcao', 'vai ate a recepcao',
                        'pode ir la ate a recepcao', 'passa na recepcao', 'passe na recepcao',
                        'pode passar na recepcao', 'pegar a receita na recepcao', 'pode pegar la na recepcao',
                        'entregar na recepcao', 'entrega na recepcao',
                        'entregar isso na recepcao', 'entrega isso na recepcao'

Balcão                  'passar no balcao', 'passa no balcao', 'passe no balcao',
(2026-07-15/16):        'passar la no balcao', 'passa la no balcao', 'passe la no balcao',
                        'passa ai no balcao', 'passe ai no balcao',
                        'pode ir no balcao', 'pode ir la no balcao', 'pode ir ate o balcao',
                        'pode ir para o balcao', 'vai la no balcao', 'vai ate o balcao', 'vai para o balcao',
                        'entregar no balcao', 'entrega no balcao', 'entregar isso no balcao',
                        'entrega isso no balcao', 'buscar no balcao', 'busca no balcao',
                        'pegar no balcao', 'pega no balcao', 'pega la no balcao',
                        'pagar no balcao', 'paga no balcao', 'paga la no balcao'

Encerramento explícito: 'ate a proxima consulta', 'ate o proximo retorno', 'nos vemos em breve',
                        'ate o proximo ano', 'ate ano que vem', 'nos vemos ano que vem',
                        'ate daqui a um ano', 'ate daqui a seis meses', 'ate daqui a tres meses',
                        'a gente se ve depois', 'nos vemos depois', 'ate a proxima vez'

Dúvidas com ação        'qualquer duvida me procura', 'alguma duvida me procura',
(nunca pergunta         'alguma duvida pode me chamar', 'alguma duvida me chama',
aberta):                'qualquer coisa estamos ai', 'qualquer coisa estamos aqui',
                        'qualquer coisa pode chamar'
                        ❌ REMOVIDAS (2026-07-15): perguntas abertas ('alguma duvida',
                           'tem alguma pergunta'...) e variantes com "me liga"/"pode ligar"
                           → não fazem parte do fraseado do médico e disparavam no meio
                           da consulta (caso real: "alguma pergunta alguma duvida" seguido
                           de ~2 min de consulta)

Saída/farmácia:         'pode se retirar', 'pode ir embora', 'obrigado pela consulta',
                        'pode ir na farmacia', 'vai la na farmacia', 'pode ir la na farmacia',
                        'pode ir ate a farmacia', 'bom viagem', 'boa viagem'
```

### STOP_COMMANDS_ANCORADOS (hook `stop_ancorado` — endAnchored, 2s, cancelável)
```
Óculos/receita:         'pode fazer os oculos', 'pode comprar os oculos', 'pode trocar os oculos',
                        'vai fazer os oculos', 'pode ir pegar a receita', 'pode pegar a receita'

Retorno programado:     'retorno ano que vem', 'retorno no proximo ano', 'retorno daqui a um ano',
                        'retorno em um ano', 'retorno em 1 ano', 'retorno em seis meses',
                        'retorno daqui a seis meses', 'retorno em tres meses',
                        'volte no ano que vem', 'volte daqui a um ano', 'volte em um ano',
                        'volte em seis meses', 'volte daqui a seis meses', 'volte em tres meses'

Retorno condicional:    'volta aqui se nao melhorar', 'volta aqui se piorar', 'volta se nao melhorar',
                        'volta se piorar', 'pode voltar se nao melhorar', 'pode voltar se piorar',
                        'volta aqui se necessario', 'volta se necessario'

Documento:              'declaracao de comparecimento', 'atestado de comparecimento'
```
> Movidas da lista forte em 2026-07-16: são ditado de conduta — o próprio texto
> satisfaz o gate de captura e a gravação parava NO MEIO da consulta. Só casam
> quando são a última coisa dita; o stop é cancelado se a fala continuar.

### STOP_COMMANDS_CURTOS (hook `stop_curto` — endAnchored, 2s, cancelável)
```
'tudo bom entao', 'tudo certo entao', 'ta bom entao', 'foi um prazer',
'ate mais', 'ate logo', 'tchau'
```

### STOP_SAUDACAO_COMMANDS (hook `stop_saudacao` — endAnchored + ignoradas nos primeiros 30s)
```
'bom dia', 'boa tarde', 'boa noite'
```

### STOP_FORCAR_COMMANDS (ordem explícita à extensão — IGNORAM o gate de captura)
```
'pode encerrar a consulta', 'encerrar a consulta', 'encerrar consulta',
'finalizar a consulta', 'finalizar consulta', 'consulta finalizada',
'consulta encerrada', 'fim da consulta', 'fim de consulta',
'pode parar a gravacao', 'parar a gravacao', 'parar gravacao' (+ variantes de gênero)
```

### GATE DE CAPTURA (condicionante de encerramento)

Os stops de fim de consulta só encerram se **CONDUTA e TRATAMENTO** já tiverem
sido ditados na fala (`STOP_GATE` + `checkCondutaTratamentoCaptados`). Quando
bloqueia, o status mostra "⚠️ Falta ditar ..." e é preciso ditar o que falta e
repetir a despedida. Satisfazem o requisito de **tratamento** mesmo sem
prescrição:
- **Conduta REFRATIVA** — a receita de óculos resolve a consulta (2026-07-15)
- **Conduta de PROCEDIMENTO em consultório** — excisão de calázio, drenagem
  ("vou resolver isso aqui") — o procedimento É o tratamento (2026-07-16)

Válvula de escape: a **2ª despedida distinta** bloqueada na mesma sessão libera
o encerramento (provável marcador faltando). `encerrar consulta` ignora o gate.

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
'operou catarata', 'ja operou de catarata', 'operad[ao] de catarata',
'fez cirurgia de catarata', 'fez a cirurgia de catarata', 'fez uma cirurgia de catarata',
'cirurgia foi bem', 'cirurgia ta otima', 'cirurgia deu certo',
'pseudofacico', 'pseudofaquico', 'lio bem posicionada', 'lio transparente'
(+ variações — ver config/clinical-triggers.js)
```
> ⚠️ `'cirurgia de catarata'` (sem "fez") foi REMOVIDO: ambíguo — dispara quando o médico
> *planeja* cirurgia futura, causando pseudofacia indevida em paciente fácico com catarata.
> REGRA: só entram frases que indicam cirurgia JÁ REALIZADA (passado/confirmado).

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
4. Verificar se a frase **não aparece naturalmente no meio de consultas** —
   se aparecer mas for despedida legítima no fim (frase de conduta, documento),
   colocar em `STOP_COMMANDS_ANCORADOS`, nunca na lista forte
5. Adicionar variações naturais de fala (ex: `"ta"` e `"esta"`, `"voce"` e `"o senhor"`,
   `"passa"`, `"passar"` E `"passe"` — caso real 2026-07-16)

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

### Caso 8 — STT morto no fim da consulta engole TODAS as despedidas ⭐
**Sintoma:** médico disse "boa tarde", "passe no balcão" e até "encerrar a consulta" e nada parou — nenhuma linha `[HookRunner]` no log da sessão inteira: as frases nunca viraram texto
**Causa:** reconhecimento de voz degradado/morto no trecho final (ciclos de restart do Web Speech + erros no-speech em sequência + backoff de 3s); o status seguia mostrando "Gravando..." sem nenhum indício de que o áudio não estava chegando. Agravante: "**passe** no balcão" nem existia na lista (só 'passa'/'passar')
**Correções:**
  1. Aviso visual de captura morta — após 30s sem fala reconhecida o status mostra "⚠️ Sem fala há Xs — verifique o microfone antes da despedida" (`sidepanel-audio.js`, `SEM_FALA_AVISO_MS`)
  2. Variantes adicionadas: 'passe/paga/pega/busca no balcao', 'passa ai no balcao', 'passe na recepcao'
  3. Marcadores de conduta de PROCEDIMENTO em consultório (calázio "vou resolver isso aqui") — sem eles o gate bloquearia a despedida mesmo capturada
**Regra prática:** se a despedida não parar a gravação e o status ainda disser "Gravando...", a frase NÃO foi ouvida — aproximar-se do microfone e dizer "encerrar consulta"
**Data:** 2026-07-16

### Caso 9 — Despedida em cadeia cancela o próprio stop ⭐
**Sintoma:** médico encerrou com "tá bom então até daqui a pouquinho obrigada": o `stop_curto` "ta bom entao" foi detectado mas CANCELADO ("a fala continuou após a despedida curta"); como "até daqui a pouquinho" e "obrigada" não são gatilhos, nada re-disparou e foi preciso o "consulta encerrada" forçado. Mesmo padrão na sessão anterior: "bom dia" cancelado 2x — o "tchau" final salvou por acaso
**Causa:** a mecânica endAnchored tratava QUALQUER continuação de fala como cancelamento, mas despedidas reais vêm em cadeia ("tá bom então → até daqui a pouquinho → obrigada"). Mapear cada cauda como gatilho novo não escala — as variações são infinitas
**Correção:** quando a fala continua após uma despedida ancorada, o runner verifica se a continuação é composta APENAS de vocabulário de despedida (`DESPEDIDA_CONTINUACAO_WORDS` + `isContinuacaoDespedida` em `config/clinical-triggers.js`, limite de 12 palavras). Se for, o timer de 2s é PRORROGADO (log "STOP prorrogado — a despedida continuou"); se houver qualquer palavra clínica, cancela como antes. Auto-corretivo: uma cadeia que virar conteúdo clínico em evento posterior ainda cancela
**Arquivos:** `config/clinical-triggers.js` (vocabulário + helper), `scripts/sidepanel-hook-runner.js` (`_maybeCancelAnchoredStop` prorroga; `_armStopTimer` extraído). Testes `[STOP-CURTO-6..8]`, `[STOP-ANCORADO-CADEIA-1]`, `[STOP-SAUDACAO-CADEIA-1]` em `utils/hooks-test.js`
**Data:** 2026-07-17

### Caso 7c — Derivação por diagnóstico marca catarata a partir de menção HISTÓRICA ⭐
**Sintoma:** Biomicroscopia injeta "catarata" em paciente pseudofácica (facectomia por catarata traumática). Log 2026-07-17: `[Catarata] Flag derivada do diagnóstico (gatilho de voz não disparou): (grau não especificado)` — nenhum gatilho de voz de catarata/LIO disparou; a flag veio do fallback de reconciliação pelo diagnóstico do Gemini
**Causa:** Duas falhas combinadas (terceira variação do tema do Caso 7, agora pelo caminho da derivação por diagnóstico):
  1. `parseCatarataFromDiagnostico()` detectava a palavra solta `\bcatarata\b` em qualquer lugar do texto — inclusive dentro do qualificador histórico `"H530 - Ambliopia OD (pós-cirurgia de catarata traumática)"`, que descreve a CAUSA passada da ambliopia, não achado atual. As exclusões só cobriam catarata secundária/H26.4/cápsula posterior
  2. A proteção por LIO do guard (não deriva catarata se `lioDetectada`) falhou porque o gatilho de voz de LIO não disparou: o STT quebrou "catarata" em "catara ta" E a variante falada foi "fez **uma** cirurgia de catarata" — LIO_COMMANDS só tinha 'fez'/'fez a'
**Arquivos corrigidos:** `scripts/sidepanel-constants.js` — `parseCatarataFromDiagnostico()` agora remove os trechos de contexto cirúrgico ('cirurgia de catarata', 'operad[ao] de catarata', 'facectomia') antes da detecção; um diagnóstico real sobrevive por CID H25/H26.0–3 ou pela palavra fora desses contextos. `config/clinical-triggers.js` — adicionado `'fez uma cirurgia de catarata'` em LIO_COMMANDS. Testes `[CAT-DX-7..8]` em `utils/hooks-test.js`
**Data:** 2026-07-17

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
