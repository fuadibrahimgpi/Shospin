---
title: Análise de estrutura e correções
date: 2026-11-10
tags: [revisao, arquitetura]
---

# Análise de estrutura e correções (2026-11-10)

Up: [Cofre](INDEX.md)

Análise do projeto inteiro pedida pelo médico, com foco em duas perguntas: a estrutura está bem equipada, e os agentes conversam bem? Continua a [revisão de 2026-11-07](revisao-estrutura-agente-2026-11-07.md), que olhou as skills.

## Veredito

A linha principal conversa bem: voz → entrevista → guards → injeção → conferência. Os pontos fracos estavam em volta dela: o verificador falhava em silêncio, um agente não carregava, outro estava ocioso e as mensagens não tinham contrato.

## Achados e situação

| # | Achado | Situação |
|---|---|---|
| 1 | Guards falhavam abertos: exceção em um derrubava todos e a resposta crua do modelo era injetada | corrigido — ver [DecisionEngine](agentes/decision-engine.md) |
| 2 | Duas cópias divergentes do projeto (clone git e pasta sincronizada) | avisos postos na cópia (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`); em 2026-11-11 o Antigravity copiou arquivos da cópia por cima do clone (desfeito, nada foi commitado); destino da cópia pendente |
| 3 | Trabalho sem commit e `main` 33 commits atrás, sem tags | commits feitos; merge e tags pendentes |
| 4 | Service worker esquecia o painel e abria um segundo | corrigido — ver [Background](modulos/background.md) |
| 5 | `sendToTab` sem limite de tempo | corrigido — ver [Mensagens](modulos/mensagens.md) |
| 6 | Páginas de permissão sem script | corrigido — ver [Páginas de permissão](modulos/paginas-permissao.md) |
| 7 | Mensagens sem contrato, três grafias de resposta, handlers órfãos | corrigido — ver [Mensagens](modulos/mensagens.md) |
| 8 | Sequência análise → guards → injeção escrita duas vezes | corrigido junto com o item 1 (porta única `_aplicarDecisionEngine`) |
| 9 | Agente de medicamentos carregado e ocioso | estacionado em 2026-11-10; em modo sombra desde 2026-11-11 (mede, não escreve) — ver [Agente de medicamentos](agentes/medicamentos-agent.md) |
| 10 | README descrevia um projeto em TypeScript que nunca existiu | reescrito |
| 11 | Sem `CLAUDE.md`: regras de trabalho só na memória privada do assistente | criado |
| 12 | Vault era retrato de 2026-10-22 | atualizado nesta data |
| 13 | Pendências da revisão de 07/11 nas skills (tamanho, referências antigas, skills de ensino) | parcial (2026-11-12): as skills foram revisadas contra o código e as lacunas de regra corrigidas; referências e ponteiros estão em dia e travados por teste (`[SKILL-SYNC-REFS]`). Seguem abertos: tamanho de `conduta` e `transcricao` (histórico dentro da skill), as duas skills do simulador (outro projeto; uma cita a UFT e as de ensino, a UNIRG) e as cópias do claude.ai, que só o médico atualiza |
| 14 | Chave do Gemini na URL e em armazenamento sincronizado; modelo fixo em três lugares | corrigido — ver [Configuração do Gemini](modulos/gemini-config.md) |
| 15 | Ferramentas: teste de integração num arquivo só, sem CI, sem `.gitattributes` | pendente (a checagem de sintaxe já cobre `config/`) |
| 16 | Critérios de medicamentos falhavam: nomes em sete listas escritas à mão, guards em fila sobre texto livre | passos 1 e 2 feitos (lista única no [Léxico](modulos/medicamentos-lexico.md)); passo 3 em modo sombra, falta medir em consulta real e decidir se o agente passa a escrever o campo — ver [DecisionEngine](agentes/decision-engine.md) |

## O achado que a análise não previu

Ao estacionar o agente de medicamentos apareceu que o [Recheck de fidelidade](agentes/recheck-agent.md) não carregava no painel: os dois arquivos declaravam o mesmo nome no topo, e os scripts do painel dividem um escopo só. A análise inicial o tinha marcado como "ligado", porque o código o chamava. A lição vale para qualquer leitura futura: chamada no código não prova que a peça existe em execução.

## Três regras que ficaram

- **O verificador não falha aberto.** Guard que lança, motor ausente ou campo em formato inesperado seguram a injeção automática.
- **Os scripts do painel dividem um escopo.** Nome de topo repetido derruba o segundo arquivo, e só um teste que os carregue juntos enxerga.
- **Documentação é conferida por teste** no que dá para conferir: arquivo citado existe, versão é a do manifesto, comando citado existe.

## O que não foi verificado

Atualizado em 2026-11-12. Tudo foi testado fora do Chrome, com navegador simulado. Nada foi conferido na plataforma real: o aviso de injeção suspensa, o painel único, as páginas de permissão e a primeira execução ao vivo do recheck dependem de conferência do médico.

Related: [Revisão de 2026-11-07](revisao-estrutura-agente-2026-11-07.md) · [Linha do tempo](historico/linha-do-tempo.md)
