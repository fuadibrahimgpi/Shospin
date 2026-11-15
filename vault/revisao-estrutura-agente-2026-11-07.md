---
title: Revisão da estrutura do agente e das skills
date: 2026-11-07
tags: [revisao, arquitetura, skills]
---

# Revisão da estrutura do agente e das skills (2026-11-07)

Up: [Cofre](INDEX.md)

Branch analisado: `perf/paralelizar-injecao` (com alterações não commitadas). A revisão em si só leu.

> **Atualização (mesmo dia): P1 aplicado.** Há agora uma regra de autoridade única em `skills/user/README.md`, e toda skill clínica abre com a seção "Onde isso REALMENTE roda (autoridade)", sem número de linha. A skill de gatilhos passou a trazer exemplos, não listas inteiras: perdeu 6 frases fantasma e ganhou `LENTE_LIMPA` e `EXAME_EM_ANDAMENTO`. Entraram testes `[SKILL-SYNC]` para biomicroscopia, OCR, gatilhos e autoridade (550/550 passam), e o vault foi corrigido. Fica pendente a re-sincronização das cópias no claude.ai, que é ação do médico.
>
> **Atualização 2: OCR alinhado ao runtime (decisão do médico: "skill segue o runtime").** A skill de OCR largou o schema próprio (`debug_leitura`, campos `_motivo`, sinalizador único de bloqueio) e passou a usar o JSON do `_getExamPrompt`, com as regras de valor final do `_processEye` e o bloqueio por olho do `_resolveBlocking`. Mudanças concretas: `C 0.00` passou a ser `null`; a dúvida entre traço e −0,25 também vira `null`; o sinal de esfera ilegível dá `null`, sem inferência pelo S.E.; e C sem sinal é lido como negativo. A tabela de CID foi corrigida para códigos sem ponto e piso de ±0,50D para miopia e hipermetropia. Entraram 7 âncoras novas, mais um teste que proíbe a volta dos campos antigos (558/558 passam).

## Veredito

O **runtime** está bem estruturado: há um prompt grande, guards determinísticos depois dele, listas de gatilho num arquivo só e uma bateria de testes que roda. O ponto fraco são as **skills**:

- Não está definido quem manda: a skill ou o prompt.
- Só 2 das 7 skills clínicas têm teste de sincronia de verdade.
- As cópias que o Claude carrega quando você chama a skill são antigas.

Resultado: hoje as skills documentam um sistema que já não existe mais em vários pontos.

## 1. Mapa do agente (runtime)

| Camada | Arquivo | Papel |
|---|---|---|
| Captura de voz | `scripts/sidepanel-audio.js` | STT, sonda de microfone |
| Gatilhos (fonte única) | `config/clinical-triggers.js` (1342 l.) | 23 listas: STOP×5, DILATACAO, EXAMES_NORMAIS, BLEFARITE, CATARATA, LIO, OPACIDADE, LENTE_LIMPA, OLHO_IRRITADO, marcadores de conduta/tratamento |
| Hooks de voz | `scripts/sidepanel-hooks.js` + `sidepanel-hook-runner.js` | disparo, prioridade, cancelamento |
| Agente de entrevista | `src/gemini-interview-agent.js` | `_buildConsultationPrompt` (≈1372 linhas, **104 mil caracteres**), mais `_sanitizeCondutaTratamento`, `_garantirExamesPedidosNaConduta` e `MED_KNOWLEDGE_BASE` |
| Agente de exames (OCR) | `src/gemini-exam-agent.js` (2873 l.) | prompt de 15 mil caracteres, rotação, recorte, verificação, desempate de sinal/cilindro/eixo, bloqueio por olho, `_inferCidRefracao` |
| Fachada | `src/geminiService.js` (26 l.) | só reexporta |
| Guards | `src/DecisionEngine.js` (1788 l.) | ~22 guards em `buildDecision`: 0, 1, 2, 2b–2f, 3, 3b, 4, 5, 5b, 5c, 6, 7, 8, 9 |
| Subagentes | `src/agents/` | `agent-contract` (evidência literal), `medicamentos-agent`, `medicamentos-feedback`, `recheck-agent` (enviado × readback) |
| Léxico | `config/medicamentos-lexico.js` | princípio ativo, marcas, variantes de ASR, `LUBRIFICANTE_PADRAO` |
| Injeção | `scripts/sidepanel-injection.js` + `src/content.js` | Froala, CID, readback e recheck |
| Fila de dilatação | `scripts/dilatacao-pausas.js` | sala de espera multi-paciente |
| Testes | `scripts-dev/test.js` | suítes integration, hooks, agents e readback |

Fluxo: voz → hooks/gatilhos → Gemini (entrevista) → sanitizações no próprio agente → DecisionEngine (guards) → injeção → readback/recheck. A foto do ticket segue outro caminho: Gemini exam → verificação → bloqueio por olho → injeção.

## 2. Skills: discriminação completa

### 2a. No repositório (`skills/user/`)

| Skill | Tamanho | Papel | Domínio | Teste de sincronia | Situação |
|---|---|---|---|---|---|
| `transcricao-consulta-oftalmologia` | 49,6 KB (734 l.) | anamnese, tipo de consulta, negativas, flags de injeção, delega conduta/biomicro/fundo | extensão | 5 âncoras (`SKILL_PROMPT_ANCHORS_ENTREVISTA`) | ok |
| `conduta-tratamento-oftalmologia` | **72,2 KB** | conduta × tratamento, hierarquia de nomeação de medicamentos, óculos, retornos, exames | extensão | 10 âncoras + verificação pontual (l. 2489) | ok, mas inchada |
| `biomicroscopia-oftalmologia` | 22,4 KB | segmento anterior, lateralidade, cristalino/LIO, lente dinâmica | extensão | **nenhum** | cita linha errada do prompt |
| `fundoscopia-oftalmologia` | 14,3 KB | segmento posterior, linguagem descritiva, escavação | extensão | verificação pontual (l. 2269) | cita linha errada do prompt |
| `cid-oftalmologia` | 28,9 KB | fluxo `searchCid` no SHOSP mais tabela H00–H59 | extensão | tabela × subset (l. 3499) | parte técnica e parte clínica misturadas |
| `gatilhos-injecao-oftalmologia` | 39,0 KB | listas de voz, prioridade, textos injetados, dilatação | extensão | **nenhum** | **muito defasada** (ver §3.2) |
| `ocr-topcon-oftalmologia` | 26,8 KB + `licoes-aprendidas.md` + `feedback-refracao.jsonl` (9 linhas) | leitura do ticket TOPCON | extensão | **nenhum** | cita `geminiService.js` (hoje é só fachada) |
| `caso-clinico-oftalmologia` | 7,3 KB | criar casos para alunos | **ensino** | — | fora do projeto |
| `simulador-oftalmologia` | 6,8 KB | contexto do simulador pedagógico | **ensino** | — | fora do projeto |
| `log-erros-skills.md` | 14 l. | log central de erros | — | — | abandonado: 1 entrada (mai/2026), enquanto a memória tem ~50 |

**Não existe** uma skill de medicamentos. As regras de medicação estão espalhadas (ver §3.3).

### 2b. Cópias fora do repositório

| Local | Skills | Situação |
|---|---|---|
| claude.ai sincronizado (`~/.claude/skills/synced/…`, 17/out) | `transcricao` (14 KB), `gatilhos` (12,7 KB), `ocr` (34 KB, outra estrutura) | **São estas que o Claude carrega** como `anthropic-skills:*`. A `transcricao` tem 0 menções a "Carmelose" contra 6 no repositório, ou seja, é anterior à mudança de 05/11. |
| `~/.claude/skills/*.md` (abr/2026) | `cid`, `gatilhos`, `ocr`, `transcricao` (2–8 KB) | arquivos soltos, que o Claude Code não reconhece como skill; apontam para `dist/geminiService.js`, que não existe |
| `vault/skills/*.md` (22/out) | as 9 | resumos; o INDEX mostra `>` como descrição de 5 skills (bug do YAML `>` dobrado) |
| claude.ai | `mestre` e `consultorio-evidencia-oftalmologia` | descrições idênticas, então são duplicata uma da outra |

Consequência prática: quando você pede ao Claude "usa a skill de transcrição", ele lê uma versão de outubro. `biomicroscopia`, `fundoscopia`, `conduta` e `cid` nem estão instaladas, então só são lidas se alguém abrir o arquivo do repositório.

## 3. Problemas, por prioridade

### P1. Cada fonte aponta outra autoridade

| Fonte | O que diz |
|---|---|
| `vault/skills/INDEX.md` | as skills são a "fonte de verdade das regras clínicas" |
| biomicro e fundo, seção "Onde isso REALMENTE roda" | o **prompt** é a autoridade; editar a skill não muda nada |
| `MEMORY.md` (skills de exame) | "runtime (prompt) é a autoridade" |
| cabeçalho de `gemini-interview-agent.js` | o prompt **deve espelhar** a skill de conduta |

Recomendação: escrever **uma regra só**, num lugar só, e repeti-la como cabeçalho em toda skill:

> Autoridade = prompt + guards do DecisionEngine + `config/*.js`. A skill é a documentação legível dessas regras e um teste confere que as duas batem. Regra nova entra primeiro no código, com teste, e depois na skill.

### P1. Teste de sincronia cobre só parte das skills

- Âncoras skill↔prompt existem só para `conduta` (10) e `transcricao` (5), mais verificações pontuais em `fundoscopia` e `cid`.
- `biomicroscopia`, `gatilhos` e `ocr` não têm nenhuma.

**Drift medido em `gatilhos`.** Método: busca de substring de cada frase de `config/clinical-triggers.js` dentro da skill.

| Lista | Frases no código | Ausentes na skill |
|---|---|---|
| STOP_COMMANDS | 84 | 0 |
| STOP_COMMANDS_ANCORADOS | 30 | 0 |
| DILATACAO_COMMANDS | 104 | **90** |
| EXAMES_NORMAIS_COMMANDS | 45 | 29 |
| OPACIDADE_CAPSULA_COMMANDS | 45 | 30 |
| LIO_COMMANDS | 56 | 26 |
| EXAME_BLEFARITE_COMMANDS | 20 | 13 |
| LENTE_LIMPA_COMMANDS | 21 | **21** (lista não documentada) |
| EXAME_EM_ANDAMENTO_COMMANDS | 21 | 20 (a lista nem é citada) |

Outros dois problemas na mesma skill:

- A seção se chama "GATILHOS ATUAIS — REFERÊNCIA COMPLETA", o que hoje não é verdade.
- Duas listas (l. 390 e 399) mandam o leitor a `sidepanel-constants.js`, mas a fonte é `config/clinical-triggers.js`.

Recomendação:

- Tirar da skill a cópia das listas. Ficam as **regras de qualidade de gatilho**, a prioridade, os casos de referência e o ponteiro para o arquivo.
- Criar um teste que falha se a skill citar uma lista que não existe em `clinical-triggers.js`, ou se uma lista exportada não for citada pelo nome.
- Para `biomicro` e `ocr`, criar âncoras como as da `conduta`: 3 a 5 frases críticas por skill.

### P1. As skills que o Claude carrega estão defasadas

Re-sincronizar com o claude.ai as versões do repositório de `transcricao`, `gatilhos` e `ocr`. Decidir também se `conduta`, `biomicro`, `fundo` e `cid` devem ser instaladas. Apagar os 4 `.md` soltos de `~/.claude/skills/`.

Isso é ação sua (upload no claude.ai). Outra opção: transformar `skills/user/` em skills de projeto em `.claude/skills/`, que o Claude Code carrega direto do repositório e que nunca ficam defasadas.

### P2. Medicamentos não têm dono

As regras de medicação vivem hoje em cinco lugares:

1. hierarquia de nomeação, na skill `conduta`;
2. 11 menções a lubrificante, na skill `transcricao`;
3. `MED_KNOWLEDGE_BASE` no prompt, que repete as marcas do léxico (Systane, Hylo, Tobradex…);
4. `config/medicamentos-lexico.js`;
5. Guards 2, 2b, 2c, 2d, 2e e 2f, mais `_sanitizeCondutaTratamento`.

Além disso, o `MedicamentosAgent` é carregado em `sidepanel.html`, mas **nenhum código de produção o chama**. Só `utils/agents-test.js` o usa, e `analisar()` (a chamada ao modelo) não existe. O vault (`agentes/INDEX.md`) diz que ele "escreve o campo tratamento", o que é falso.

Recomendação:

- Gerar `MED_KNOWLEDGE_BASE` a partir do léxico, em vez de manter duas listas.
- Decidir o destino do agente: ligá-lo em modo sombra, como planejado, ou marcá-lo como estacionado no vault.
- Se fizer sentido, criar uma skill `medicamentos-oftalmologia` curta que aponte para léxico + guards e tirar esse conteúdo de `conduta` e `transcricao`.

### P2. Duas skills são de outro projeto

`caso-clinico-oftalmologia` e `simulador-oftalmologia` tratam do simulador pedagógico, não da extensão. Devem ir para o repositório ou pasta do simulador. Elas também citam a "Universidade Federal do Tocantins", enquanto as outras skills de ensino usam UNIRG; vale conferir.

### P2. Skills carregam histórico e referências velhas

- **Tamanho.** `conduta` (72 KB) + `transcricao` (50 KB) passam do tamanho do próprio prompt (104 mil caracteres). Boa parte é "Histórico de erros cobertos", que já existe em `vault/memorias/`. Na skill devem ficar a regra e um exemplo; a história vai para a memória, com um link.
- **Linhas citadas erradas.** `biomicroscopia` aponta "~L816-854", mas a seção hoje está perto da L1378. `fundoscopia` aponta "L856-897", que hoje é o bloco de comorbidades. Trocar número de linha por nome de função ou de seção do prompt.
- **`geminiService.js` citado como local do código**, em 5 trechos da `conduta` e 3 da `ocr`. Hoje são `gemini-interview-agent.js` e `gemini-exam-agent.js`.
- **`cid` mistura duas coisas.** O manual técnico do `searchCid`, para quem mexe no código, e a tabela clínica H00–H59, para quem escolhe o CID. Separar em duas seções nomeadas, ou dois arquivos, facilita o teste da tabela e a leitura.

### P3. Limpeza

- `scripts/*.js.bak` (2 arquivos), `scratch/` e `archive/` dentro do repositório.
- `skills/user/log-erros-skills.md`: alimentar ou aposentar. A memória já cumpre esse papel.
- O vault é um retrato de 22/10 e já diverge, por exemplo no agente de medicamentos.

### Observação (sem ação agora)

O prompt de entrevista é um bloco único de 1372 linhas, com as regras de todas as seções. Ele funciona e está coberto por testes. Se um dia vier a modularização (fases 2–4 do plano "sob demanda"), o corte natural é por seção do JSON: anamnese, conduta, tratamento, biomicro, fundo. É o mesmo corte das skills, e nesse ponto cada skill poderia gerar o pedaço do prompt que lhe cabe.

## 4. O que está bem estruturado

- Gatilhos de voz numa fonte única (`clinical-triggers.js`), consumida pelo agente sem duplicação.
- Guards **subtrativos** e documentados com o log de origem (8, 9, 2c, 5b…). É a defesa certa contra alucinação clínica.
- O contrato de subagente com **evidência literal obrigatória** (`agent-contract.js`) é um bom desenho, mas ainda não roda em produção.
- O recheck de fidelidade enviado × readback está ligado na injeção.
- Testes de sincronia skill↔prompt já existem. O mecanismo é bom, só precisa cobrir todas as skills.
- Skills de exame separadas (biomicro e fundo), com delegação explícita a partir da `transcricao`.

## 5. Ordem sugerida

1. Fixar a regra de autoridade (P1) e corrigir o INDEX do vault.
2. Testes de sincronia para `gatilhos`, `biomicro` e `ocr`; tirar as listas copiadas da `gatilhos`.
3. Re-sincronizar as skills instaladas (ação sua) ou migrar para `.claude/skills/`.
4. Medicamentos: gerar `MED_KNOWLEDGE_BASE` do léxico e decidir o destino do `MedicamentosAgent`.
5. Enxugar o histórico de `conduta` e `transcricao`, trocar números de linha por nomes e corrigir as referências a `geminiService.js`.
6. Mover `caso-clinico` e `simulador`; limpar `.bak`, `scratch` e o log abandonado.
