# Skills do projeto: quem manda

## Regra de autoridade (única, vale para todas as skills)

**O código é a autoridade. A skill é a documentação dele.**

| O que | Onde manda de verdade |
|---|---|
| Regras clínicas que o modelo segue | prompt em `src/gemini-interview-agent.js` (`_buildConsultationPrompt`) e `src/gemini-exam-agent.js` (`_getExamPrompt` e prompts de verificação/desempate) |
| Correções determinísticas depois do modelo | guards de `src/DecisionEngine.js` e sanitizações dos próprios agentes |
| Listas de gatilho de voz | `config/clinical-triggers.js` |
| Nomes de medicamentos | `config/medicamentos-lexico.js` |
| Textos-padrão injetados | `scripts/sidepanel-constants.js` |
| Seletores e fluxo no SHOSP | `src/content.js` |

Editar uma skill **não muda** o comportamento da extensão.

## Como mudar uma regra

1. Mude o código (prompt, guard ou config) e escreva o teste que prova a mudança.
2. Atualize a skill correspondente na mesma alteração.
3. Se a regra for crítica, acrescente uma âncora de sincronia em `utils/integration-test.js` (blocos `[SKILL-SYNC]`): uma frase que precisa existir literalmente na skill **e** no código.

## O que a skill deve conter

- A regra e o porquê, em linguagem legível.
- Exemplos de entrada e saída.
- Ponteiro para o código por **nome de função ou de seção do prompt**, nunca por número de linha (que muda a cada edição).

O que não deve conter:

- Cópia de listas inteiras do código (gatilhos, léxico). Use exemplos e aponte o arquivo.
- Histórico longo de erros. Ele vai para `vault/memorias/`, com um link curto na skill.

## Testes de sincronia

| Skill | Teste |
|---|---|
| `conduta-tratamento-oftalmologia` | `SKILL_PROMPT_ANCHORS` |
| `transcricao-consulta-oftalmologia` | `SKILL_PROMPT_ANCHORS_ENTREVISTA` |
| `biomicroscopia-oftalmologia` | `SKILL_PROMPT_ANCHORS_BIOMICRO` |
| `fundoscopia-oftalmologia` | verificação pontual + `[SKILL-SYNC-AUTORIDADE]` |
| `cid-oftalmologia` | tabela da skill × subset do SHOSP |
| `gatilhos-injecao-oftalmologia` | `[SKILL-SYNC-GATILHOS]`: toda lista exportada é citada; todo exemplo existe no código |
| `ocr-topcon-oftalmologia` | `SKILL_PROMPT_ANCHORS_OCR` |

Toda skill clínica abre com a seção "Onde isso REALMENTE roda (autoridade)", e um teste confere que ela existe e que não cita número de linha.

## Cópias instaladas

As skills que o Claude carrega quando você as chama pelo nome são cópias enviadas ao claude.ai, não estes arquivos. Depois de mudar uma skill aqui, reenvie-a ao claude.ai; senão o Claude continua lendo a versão antiga.

`caso-clinico-oftalmologia` e `simulador-oftalmologia` são do projeto de ensino e não seguem esta regra.
