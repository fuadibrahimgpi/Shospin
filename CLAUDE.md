# CLAUDE.md — regras de trabalho deste repositório

Extensão Chrome MV3, JavaScript puro, sem build. Visão geral e mapa das peças em `README.md`. Este arquivo diz **como trabalhar aqui**.

## Com quem você fala

O dono do projeto é médico oftalmologista e não programa. Responda em português, sem jargão, com relatório curto. Nunca peça que ele rode comandos; rode você. Diga com clareza o que foi testado e o que não foi.

## Onde e como alterar

- Este clone é o lugar de editar, commitar e enviar. Faça `git pull` antes de começar.
- Pode existir uma cópia do projeto em pasta sincronizada (Drive), sem git. Não edite lá.
- Ao fechar uma alteração: `npm run check`, `npm test`, commit e push do branch atual, sem perguntar. Nunca force push, merge em `main` ou PR sem pedido explícito.
- Mensagens de commit em português, no estilo do histórico (`fix(ocr): ...`, `feat(camera): ...`), com os testes que passaram no corpo.
- Alteração que muda o que o médico vê ou o que vai ao prontuário pede um teste novo que falharia sem ela.

## O que os testes não cobrem

`npm test` roda fora do Chrome, com navegador simulado. Tela, permissões, Froala e campos reais do SHOSP não são exercitados. Depois de mexer nisso, diga que a conferência ao vivo é do médico e explique como ele confere. Nunca toque em dado real de paciente.

## Segurança clínica — o que não pode quebrar

- **Nada entra no prontuário sem lastro na fala do médico.** A transcrição é fala de médico para paciente, em linguagem leiga, com erros de reconhecimento de voz; não é laudo.
- **Guards do `src/DecisionEngine.js` são subtrativos:** removem ou rebaixam o que a fala não sustenta. Não acrescente conteúdo clínico por dedução.
- **O verificador não falha aberto.** Guard que lança, motor ausente ou campo em formato inesperado seguram a injeção automática (`segurarInjecao`). Nunca recue para a resposta crua do modelo.
- **Exame é descritivo, não interpretativo.** Suspeita vai para o diagnóstico, não para o texto da biomicroscopia ou da fundoscopia.
- **Negativa só existe se foi dita.** Ausência de resposta não vira "Nega ...".
- Regra clínica nova entra primeiro no código (prompt, guard ou `config/`), com teste, e depois na skill correspondente. Ver `skills/user/README.md`.

## Armadilhas já pagas

- **Os scripts do painel dividem um escopo só.** Dois arquivos com `const X` no topo: o segundo não carrega, e os testes em Node não veem. O teste `[ESCOPO-1]` barra isso; ao criar arquivo novo para o `sidepanel.html`, use nomes de topo únicos.
- **Todo arquivo citado num HTML precisa existir** (`[PERM-1]`).
- **Toda mensagem entre as peças está em `config/messages.js`.** Ação nova: registre lá, escreva envio e handler. Resposta de falha usa `error`; sucesso usa `success`.
- **`sendToTab` tem limite de tempo** e devolve `'CONTEXT_INVALIDATED'`, `null` ou a resposta. Trate os três.
- **O service worker dorme.** Variável global do `src/background.js` é só cache; a verdade está nas abas abertas.
- **O extrator dos testes (`_extractFn`) acha o corpo da função pela primeira chave** depois do nome: função que os testes extraem não pode desestruturar parâmetros na assinatura, e o `async` precisa ser reposto no teste.
- **O log `[Speech]` do console é cortado em 120 caracteres.** Os gatilhos veem o texto inteiro; não diagnostique gatilho pelo que "sumiu" do log.
- **Nome de remédio existe em um arquivo só: `config/medicamentos-lexico.js`.** A base de marcas do prompt e as listas dos guards são geradas dele. Marca, princípio ou variante de voz nova entra lá; lista de remédios escrita em outro arquivo é barrada pelo teste `[LEXICO-UNICO-1]`. Os guards leem a fala crua e o modelo lê a fala corrigida: correção de voz de nome de remédio fora do léxico faz os dois enxergarem remédios diferentes.
- **Nunca copie arquivo da pasta do Drive para este clone.** A cópia do Drive está dias atrás. Em 2026-11-11 uma correção feita lá foi copiada para cá e trocou seis arquivos por versões antigas, apagando o verificador que não falha aberto e mais de mil linhas de teste (nada tinha sido commitado, e foi desfeito). Correção feita fora do clone é refeita aqui, sobre a versão atual. Antes de começar, `git status` tem que estar limpo ou explicado.

## Fatos do SHOSP que o código pressupõe

- O SHOSP é uma página única: trocar de paciente **não muda a URL**. A URL não serve de fronteira de paciente; o painel é quem declara a fronteira (`setInjectedCids`).
- CID é buscado **sem ponto**: `H522`, não `H52.2`.
- A busca de CID só roda com a seção C.I.D. **visível**; a aba é achada pelo rótulo, não por ID.
- Campos de texto longo são editores Froala: escrever no DOM não basta, é preciso atualizar o modelo do editor.
- IDs de campo (`prontuario_resp_...`) não são sequenciais; não deduza um ID a partir de outro.
- Descrição por olho segue sempre a ordem OD, depois OE.

## Onde está cada coisa

| Preciso de | Olhe em |
|---|---|
| frases que disparam ações na gravação | `config/clinical-triggers.js` |
| nomes de medicamentos | `config/medicamentos-lexico.js` |
| modelo, endereço e chave do Gemini | `config/gemini.js` |
| regras que o modelo segue | `src/gemini-interview-agent.js`, `src/gemini-exam-agent.js`, `src/gemini-oct-agent.js` |
| correções depois do modelo | `src/DecisionEngine.js` |
| textos-padrão injetados e estado da sessão | `scripts/sidepanel-constants.js` |
| escrita nos campos do SHOSP | `src/content.js` |
| histórico de erros e decisões | `vault/memorias/`, `vault/historico/` |

## Estado de peças que enganam

- `src/agents/medicamentos-agent.js` está **estacionado**: não é carregado pelo painel. O cabeçalho do arquivo diz como religar.
- `src/geminiService.js` é só fachada; a lógica está nos três agentes Gemini.
