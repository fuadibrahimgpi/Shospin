# Tratamento e medicamentos

Segunda parte da skill `conduta-tratamento-oftalmologia`. O `SKILL.md` desta pasta cuida do campo
`conduta` (óculos, retornos, exames, encaminhamentos, orientações). Este arquivo cuida do campo
`tratamento` e de tudo o que envolve nome de remédio: `medicacoes_em_uso`, medicação anterior e
medicação de outra pessoa.

Leia este arquivo sempre que houver colírio, pomada, lubrificante, compressa, higiene palpebral ou
ômega 3 na consulta, ou quando o `tratamento` saiu errado.

## Onde cada coisa está escrita uma vez só

Esta skill **cita** os textos abaixo; quem os define é o código. Se o código mudar, vale o código.

| O quê | Fonte única |
|---|---|
| Nomes de remédio, marcas, variantes de voz, classe de cada um | `config/medicamentos-lexico.js` |
| Registro padrão do lubrificante (`LUBRIFICANTE_PADRAO`) e remédio do protocolo da blefarite (`PROTOCOLOS`) | `config/medicamentos-lexico.js` |
| Textos e frequências padrão da blefarite (`_BLEF_PAD`) e produto da higiene (`_produtoHigieneDaFala()`) | `src/DecisionEngine.js` |
| Texto do tratamento sem medicamento (`TEXTO_SEM_PRESCRICAO`, decidido por `tratamentoPadrao()`) | `scripts/sidepanel-constants.js` |
| Redação literal das regras que o modelo segue (hierarquia de nomeação, anti-invenção, anti-associação, dois momentos do lubrificante, medicação de outra pessoa) | `src/gemini-interview-agent.js`, blocos `- medicacoes_em_uso:` e `- tratamento:` de `_buildConsultationPrompt` |
| Ordem dos guards | `vault/agentes/decision-engine.md` |

## 1. O que vai em `tratamento`

Tudo o que o paciente **usa ou faz fisicamente** por ordem do médico:

- colírios e pomadas, novos ou mantidos, com a posologia dita;
- lubrificante ocular;
- remédio oral e suplemento (ômega 3);
- compressa morna e higiene palpebral. São ações do paciente: **sempre** `tratamento`, nunca
  `conduta`, mesmo quando o médico só "orientou" (`_guardCondutaContaminada` move a linha se o
  modelo errar o campo).

Não vai em `tratamento`: pedido de exame, explicação de diagnóstico, retorno, encaminhamento, óculos
e a decisão de **suspender** um remédio (`Suspender …` é `conduta`; ver seção 9).

Nunca escreva "1 gota" ou "uma gota": é subentendido.

## 2. Regra anti-invenção (vem antes de todas as outras)

Um tratamento só existe se o médico o **prescreveu** na fala: nomeou um remédio, disse a classe ou a
finalidade, ou mandou usar, pingar, aplicar ou passar algo. As regras de nomeação abaixo decidem
**como chamar** o remédio, nunca **se** ele existe.

- O diagnóstico não gera tratamento. Corpo estranho ou abrasão não autoriza pomada nem antibiótico;
  conjuntivite não autoriza antibiótico; olho vermelho não autoriza antialérgico nem lubrificante.
- Posologia (frequência, duração, dose) entra só quando foi dita. Prescrição sem posologia dita é
  registrada sem posologia. A única exceção são as frequências padrão da blefarite (seção 7).
- Consulta encerrada sem o médico ditar tratamento: `tratamento_sugerido: null`. A seção 8 diz o
  que o painel escreve nesse caso.

## 3. Como nomear o remédio prescrito

Use sempre o nível mais específico que a **fala** sustenta. Só desça de nível quando o de cima for
impossível.

| Nível | Quando | Registro |
|---|---|---|
| 1 — Princípio ativo | o médico disse a marca ou o princípio | princípio ativo; o nome comercial dito vai entre parênteses |
| 1.5 — Protocolo declarado | blefarite: cuidado palpebral + um colírio a pingar, sem nome | `Tobramicina + dexametasona` (seção 7) |
| 2 — Classe | sem nome e sem protocolo, mas a fala diz a classe ou a finalidade | `Colírio hipotensor ocular`, `Colírio antialérgico`, `Colírio antibiótico`, `Colírio corticoide` |
| 3 — Genérico | houve prescrição, e nada mais é identificável | `Medicação ocular prescrita` |

As quatro regras que governam a tabela:

1. **Nome dito vence a classe; classe vence o genérico.** Se a marca ou o princípio aparece na fala
   (dito pelo médico ou pelo paciente, em uso ou prescrito), o registro leva o remédio. Nome com erro
   de reconhecimento de voz mas reconhecível pelo som conta como dito ("bimato à próstata" =
   bimatoprosta; "trometolou" = Cetorolaco, decisão do médico).
2. **Nunca infira o princípio ativo do diagnóstico nem do contexto.** A base de marcas serve para
   reconhecer um nome dito, nunca para completar um nome que faltou. Classe também só vale quando a
   fala a diz ("antibiótico", "para pressão", "de alergia").
3. **Nunca crie prescrição inexistente** (seção 2). O protocolo e a classe nomeiam um colírio cuja
   prescrição já está na fala.
4. **Nunca omita uma prescrição** porque o nome não foi dito: desça de nível, mas registre. A
   posologia dita é preservada em qualquer nível.

Detalhes do nível 1:

- Marca dita: `Latanoprosta (Xalatan)`, `Moxifloxacino + dexametasona (Vigadexa)`,
  `Tobramicina + dexametasona (Tobradex)`. Princípio dito sozinho não ganha marca: `Dorzolamida`.
- Nunca ponha entre parênteses uma marca que não foi pronunciada.
- Dois remédios ditos juntos como combinação ("bimatoprosta com timolol") ficam numa linha:
  `Bimatoprosta + timolol`.
- Palavra que não aponta nenhum nome da base ("um colírio zarolou 3 vezes ao dia por 5 dias") não é
  nome e não autoriza classe: `Medicação ocular prescrita 3x/dia por 5 dias`.

⚠️ **O nome do colírio que o paciente JÁ USA não é o nome do colírio novo.** "Uso o Xalatan… vou
passar um colírio 4x/dia por 7 dias": o Xalatan vai em `medicacoes_em_uso`; o colírio novo, que não
foi nomeado, fica `Medicação ocular prescrita 4x/dia por 7 dias`. O nome dito vale só para o remédio
a que ele se refere.

**Associação e marca não ditas.** Monoterapia dita ("timolol") nunca vira associação fixa nem ganha
marca que ninguém pronunciou (caso real: "timolol" saiu como "Brimonidina + timolol (Combigan)"). A
redação completa da regra está no prompt, em "REGRA ANTI-ASSOCIAÇÃO E ANTI-MARCA NÃO DITA"; não é
repetida aqui.

Rede de código: `_guardMedicamentoNomeadoNaFala` troca classe ou genérico pelo nome dito e corrige
remédio, associação ou marca que a fala não pronunciou; `_guardClasseAntibioticoSemFala` troca por
`Medicação ocular prescrita` a classe que a fala não disse; `_avisoTratamentoSemNomeRemedioEmUso`
avisa o médico quando o colírio novo ficou sem nome.

## 4. Antibiótico, corticoide ou associação: três situações

| Situação | O que a fala traz | Registro |
|---|---|---|
| Blefarite, colírio sem nome | cuidado palpebral + colírio a pingar | `Tobramicina + dexametasona` |
| Só antibiótico | "colírio de antibiótico", sem corticoide e sem nome | `Colírio antibiótico` |
| Só corticoide | "colírio de corticoide", sem antibiótico e sem nome | `Colírio corticoide` |

- Nunca complete uma classe com a outra.
- `Associação (ATB + corticoide ocular)` só existe **fora da blefarite** e só quando a fala diz **os
  dois**. Na blefarite ela nunca é usada.
- Na blefarite, classe dita sozinha ("colírio de antibiótico") ou negada ("sem corticoide") não vira
  `Tobramicina + dexametasona`: fica a classe dita.
- Rede de código: `_guardAssociacaoATB` rebaixa a linha de associação para a classe dita (ou para
  `Medicação ocular prescrita`, se nenhuma foi dita), preservando a posologia.

## 5. Lubrificante: dois momentos

| Momento | Quem fala | Campo | Registro |
|---|---|---|---|
| Atendimento | o paciente conta o que usa | `medicacoes_em_uso` | `Lubrificante ocular`; marca entre parênteses só se ele a disse: `Lubrificante ocular (Systane)` |
| Conduta | o médico prescreve ou mantém | `tratamento` | `Carmelose sódica ou hialuronato de sódio` |

- Termos leigos do paciente ("lágrima artificial", "colírio para limpar / hidratar o olho") são
  lubrificante no atendimento. Eles não criam nem nomeiam prescrição. "Lágrima" como sintoma ("muita
  lágrima") não é produto.
- O médico não prescreve nome comercial: marca de lubrificante nunca fica em `tratamento`.
- O registro padrão vale quando o **médico** diz "lubrificante". A posologia dita é preservada
  (`usa lubrificante 4x ao dia` → `Carmelose sódica ou hialuronato de sódio 4x/dia`). Princípio dito
  ("hialuronato", "carmelose") vence o padrão.
- O registro padrão só nomeia um lubrificante já prescrito; não cria prescrição.
- O lubrificante NÃO é o colírio da blefarite (seção 7).
- Rede de código: `_guardLubrificanteGenerico`.

## 6. Medicação de outra pessoa e medicação anterior

| Fala | Destino |
|---|---|
| Remédio de familiar ou de terceiro ("minha mãe pinga Xalatan") | não entra em campo nenhum. A doença do familiar segue em `antecedentes_familiares`, sem o remédio |
| Remédio oftalmológico que o paciente usou e parou ("ano passado usei Tobrex") | `antecedentes_oftalmologicos`: `Uso prévio de tobramicina (Tobrex)`. Não entra em `medicacoes_em_uso` nem em `tratamento` |
| Remédio anterior não oftalmológico | não é registrado |

Se alguma citação do mesmo remédio é atual (em uso, prescrito, mantido), nada é mexido. Rede de
código: `_guardMedicacaoDeOutraPessoa` (em consulta de retorno o remédio só sai de uso; não há campo
de antecedente a criar).

## 7. Blefarite

Tudo sobre o tratamento da blefarite está nesta seção.

### 7.1 Pacote padrão

A blefarite é conduzida sempre com o mesmo pacote. O gatilho são as **orientações dadas ao paciente**
na fala; não existe frase-gatilho. O sistema padroniza o texto de cada item que o médico orientou e
**nunca cria item que ele não orientou** (única exceção: a sequência do item 7.3).

| Ordem | Item | Texto padrão (linha sem detalhe dito) |
|---|---|---|
| 1 | Compressa morna | `Compressa morna por 2 min antes da higiene palpebral — 2x/dia` |
| 2 | Higiene palpebral | `Higiene palpebral com <produto> — 3x/dia` |
| 3 | Colírio (só na versão com colírio) | `Tobramicina + dexametasona 3x/dia após higiene palpebral` |
| 4 | Lubrificante | `Carmelose sódica ou hialuronato de sódio em cada olho ao longo do dia` |
| 5 | Ômega 3 oral | `Ômega 3 (EPA+DHA) 1000 mg — 1 comprimido no almoço e 1 no jantar por 30 dias` |

- **Produto da higiene, lido da fala:** `xampu infantil`; `gel de higiene palpebral (Hialurop)`;
  `gel de higiene palpebral (Blephagel)`; "gel" sem marca → `gel de higiene palpebral`. Higiene
  orientada sem produto dito → `xampu infantil`.
- **O que foi dito vence o padrão.** Posologia, tempo, produto ou dose ditos ficam como o médico
  disse; só a linha "pelada" (`Compressa morna`, `Higiene palpebral`, `Ômega 3`) recebe o texto padrão.
- **A confirmar com o médico:** as frequências da tabela (compressa 2x/dia, higiene 3x/dia, colírio
  3x/dia após a higiene, ômega 3 por 30 dias) e o xampu infantil como produto quando nenhum foi dito
  vêm do padrão já usado no consultório e ainda não foram confirmados por ele. Estão no código como
  estão (`_BLEF_PAD`).
- O pacote só se aplica com **cuidado palpebral realmente orientado** (higiene ou lavagem da pálpebra
  ou dos cílios, ou compressa + xampu/sabonete/gel). "Xampu" ou "pálpebra" soltos não bastam; calázio
  e terçol sem a palavra blefarite não usam o pacote.
- Rede de código: `_guardBlefaritePadrao`.

### 7.2 Qual é o colírio

Ordem de precedência:

1. **O médico nomeou** (marca ou princípio) → o que ele disse. "Usa o Maxitrol" →
   `Neomicina + polimixina B + dexametasona (Maxitrol)`.
2. **Não nomeou, mas prescreveu compressa e/ou higiene mais um colírio a pingar** →
   `Tobramicina + dexametasona`. Vale também para fala vaga: "vou passar um colírio", "um tratamento
   mais forte", "pra desinflamar", "pinga esse aqui depois da limpeza". Não exige os três itens
   literais nem posologia dita.
3. **A fala diz só uma classe** → a classe (seção 4).
4. **Houve prescrição e nada é identificável** → `Medicação ocular prescrita`.

O que conta como "o colírio": a palavra colírio, gota ou pingar referindo-se a um produto que não é
o lubrificante, ou a intenção de remédio anti-inflamatório. O que **não** conta:

- o lubrificante ("um lubrificante, pode pingar quantas vezes quiser");
- o simples anúncio do tratamento ("vou passar um tratamento para melhorar essa irritação", seguido
  de compressa, higiene, lubrificante e ômega 3: o "tratamento" é a própria lista);
- "o colírio continua normal" ou "pode parar o colírio".

Teste obrigatório antes de escrever `Tobramicina + dexametasona`: aponte o trecho da fala em que o
colírio (que não é o lubrificante) foi prescrito. Sem trecho, sem colírio.

Rede de código: `_guardColirioBlefariteProtocolo` promove a linha genérica ao nome do protocolo
(promove, nunca cria); `_guardColirioBlefariteSemPrescricao` remove `Tobramicina + dexametasona`
quando a fala não tem esse colírio, e avisa o médico.

### 7.3 Sequência padrão

Quando a fala traz, **nesta ordem**, compressa(s) → higiene (xampu infantil, gel Hialurop ou
Blephagel) → pingar o colírio **3 vezes ao dia**, o colírio é `Tobramicina + dexametasona` e o
tratamento recebe o pacote completo (compressa, higiene e colírio), mesmo que o modelo tenha
esquecido uma das linhas. O lastro é a própria sequência dita.

Não vale quando o colírio da sequência é lubrificante, hipotensor, antialérgico ou de dilatação;
quando outro remédio é nomeado; quando a fala restringe a classe ("só antibiótico", "sem
corticoide"); quando a ordem está invertida; ou quando não há a frequência de 3 vezes. Rede de
código: `_guardBlefariteSequenciaPadrao`.

## 8. Tratamento sem nenhum medicamento

Quando **nenhum medicamento foi mencionado**, o campo recebe `Nega uso de tratamentos`. Quem escreve
é o painel, não o modelo: o modelo devolve `null`.

**Exceção:** a fala prescreve ou mantém uma medicação ("vou passar um colírio", "continua com o
colírio da pressão", "pode usar um lubrificante") e o `tratamento` veio vazio. O texto padrão seria
o oposto da fala: o campo **fica vazio** e o médico recebe um aviso para preencher
(`_guardTratamentoVazioComMedicacao`).

- Não contam como prescrição: histórico ("o senhor usa o Xalatan"), negação ("não vou passar
  colírio"), remédio suspenso e colírio de exame (dilatar, anestesiar, corar).
- Compressa, higiene ou ômega 3 sozinhos já preenchem o campo: nada é acrescentado.
- Na dilatação (fase 1) o campo continua nulo.

## 9. Remédio mantido e remédio suspenso

- **Mantido é tratamento.** "Mantido o timolol 2x/dia", "continua com o colírio da pressão" → linha
  em `tratamento` (`Timolol 2x/dia`), além de constar em `medicacoes_em_uso`. Devolver `null` aqui
  faria o painel escrever o texto da seção 8, contra a fala. Rede de código:
  `_guardColirioMantidoSemTratamento`.
- **Suspenso é conduta.** "Suspende o Xalatan e começa Timoptol de manhã e à noite" → conduta
  `Suspender Xalatan`; tratamento `Timolol (Timoptol) de manhã e à noite`.

## 10. Medição em andamento (não escreve no prontuário)

O modelo também devolve `medicacoes_itens`, a mesma medicação em lista estruturada. O
`DecisionEngine` só a compara com o `tratamento` e registra no console (modo sombra). A saída desta
skill não muda.

## Exemplos

Todos os resultados abaixo foram conferidos contra os guards em 2026-11-15.

```text
Fala: "Faz compressa morna dois minutos, depois lava os cílios com xampu de neném e pinga o colírio
       três vezes ao dia. Volta em duas semanas."
conduta: "Retorno 2 semanas"
tratamento_sugerido: "Compressa morna por 2 min antes da higiene palpebral — 2x/dia\nHigiene palpebral com xampu infantil — 3x/dia\nTobramicina + dexametasona 3x/dia"
(sequência padrão, item 7.3)
```

```text
Fala: "A blefarite tá mais atacada, vou passar um tratamento mais forte. Continua a higiene da
       pálpebra com o xampu e o lubrificante."
tratamento_sugerido: "Higiene palpebral com xampu infantil — 3x/dia\nTobramicina + dexametasona 3x/dia após higiene palpebral\nCarmelose sódica ou hialuronato de sódio em cada olho ao longo do dia"
```

```text
Fala: "Vou passar um tratamento para a senhora fazer para melhorar essa irritação. Faz a compressa
       morna e a limpeza dos cílios de manhã e no fim do dia, um lubrificante, pode pingar quantas
       vezes quiser, e o ômega 3."
tratamento_sugerido: "Compressa morna por 2 min antes da higiene palpebral — 2x/dia\nHigiene palpebral com xampu infantil — 3x/dia\nCarmelose sódica ou hialuronato de sódio em cada olho ao longo do dia\nÔmega 3 (EPA+DHA) 1000 mg — 1 comprimido no almoço e 1 no jantar por 30 dias"
❌ NÃO "Tobramicina + dexametasona": o único pingar é do lubrificante.
```

```text
Fala: "É uma conjuntivite, vou passar um colírio de antibiótico quatro vezes ao dia."
tratamento_sugerido: "Colírio antibiótico 4x/dia"
❌ NÃO "Associação (ATB + corticoide ocular)": corticoide não foi dito.
```

```text
Fala: "Mantém o colírio da pressão e começa lubrificante."
tratamento_sugerido: "Colírio hipotensor ocular\nCarmelose sódica ou hialuronato de sódio"
```

```text
Fala: "Faz compressa morna duas vezes ao dia e usa lubrificante de seis em seis horas."
conduta: null
tratamento_sugerido: "Compressa morna 2x/dia\nCarmelose sódica ou hialuronato de sódio 6/6h"
```

```text
Fala: "Está tudo bem com os olhos, volta em um ano."
conduta: "Retorno anual"
tratamento_sugerido: null      ← o painel escreve "Nega uso de tratamentos"
```

```text
Fala: "Vou passar um colírio para o senhor usar." (e o modelo não devolveu tratamento)
tratamento_sugerido: null      ← o campo fica vazio e o médico é avisado
```

## Checagem do tratamento

- Cada linha tem um trecho da fala em que o médico prescreveu ou manteve aquilo.
- Nenhuma posologia foi inventada (fora as frequências padrão da blefarite, seção 7).
- O remédio está no nível mais específico que a fala sustenta; marca só se foi dita.
- Nenhuma associação e nenhuma marca que a fala não pronunciou.
- Antibiótico, corticoide e associação seguem a tabela da seção 4; nada de `Associação` na blefarite.
- Lubrificante: `Lubrificante ocular` no atendimento; `Carmelose sódica ou hialuronato de sódio` no
  tratamento, sem marca.
- Remédio de outra pessoa não aparece; remédio oftalmológico anterior está em
  `antecedentes_oftalmologicos`.
- Na blefarite: só os itens orientados; `Tobramicina + dexametasona` só com colírio na fala.
- Compressa, higiene, lubrificante e ômega 3 estão em `tratamento`, não em `conduta`.
- Sem medicamento mencionado: `null` (o painel escreve o texto padrão). Fala prescreve e campo
  vazio: fica vazio, com aviso.

## Pendências que dependem do médico

- Confirmar as frequências padrão da blefarite e o xampu infantil como produto padrão (seção 7.1).
- "O médico não prescreve nome comercial" foi aplicado só ao lubrificante. Os outros colírios ainda
  levam a marca dita entre parênteses no tratamento (`Latanoprosta (Xalatan)`).
- Calázio e terçol: têm pacote próprio?
- Colírio mantido que o modelo escreve como classe no tratamento e com nome em uso sai em duas
  linhas, com aviso. Juntar as duas arriscaria apagar um colírio novo.
- Dois remédios prescritos em separado ("use dorzolamida e timolol"): uma linha para cada, ou
  `Dorzolamida + timolol`? O prompt só trata o caso "X com Y" (uma linha).

O histórico datado de erros e decisões está em `HISTORICO.md`, nesta pasta.
