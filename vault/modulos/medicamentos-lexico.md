---
title: "Léxico de medicamentos"
description: "Léxico de oftalmo-medicamentos com variantes de ASR, usado pelo agente de medicamentos."
date: 2026-10-22
tags: [modulo, projeto-shosp]
aliases: ["medicamentos-lexico"]
---

# Léxico de medicamentos

**Módulo** · arquivo-fonte: `config/medicamentos-lexico.js`

Motor de casamento com precedência do primeiro match e suporte a variantes de ASR. Consumido pelo [Agente de medicamentos](../agentes/medicamentos-agent.md), pelos guards de medicação do [DecisionEngine](../agentes/decision-engine.md) e pelo [Agente de entrevista](../agentes/gemini-interview-agent.md), que restaura os nomes antes de mandar a fala ao modelo.

## Uma lista só (2026-11-11)

Este é o único arquivo com nomes de remédio. O que os outros precisam é gerado daqui:

| Quem usa | O que pede ao léxico |
|---|---|
| prompt do agente de entrevista | `montarBaseDoPrompt()` — marca (princípio ativo), por classe |
| guards do DecisionEngine | `fonteDeClasse()` — tudo que cita um remédio das classes pedidas |
| protocolo da blefarite | `PROTOCOLOS` + `protocolo()`, `fonteDoRemedio()`, `fonteDoPrincipio()` |
| "a fala disse a classe" | `PALAVRAS_DE_CLASSE` |
| detector de ruído | `contarMencoes()` |

- **`radicais`** (por entrada): pedaços que bastam para dizer que o remédio foi citado ("cipro", "tobra"). Só reconhecem; nunca nomeiam.
- **`EXTRAS_DE_CLASSE`**: remédios que os guards reconhecem como da classe, mas que não têm entrada (azitromicina, gentamicina, tafluprosta…). Nunca viram nome no prontuário.
- **`notaPrompt`**: observação que acompanha a entrada na base do prompt.
- O colírio de exame (classe `ciclopegico`) não entra na base do prompt.

Antes havia sete listas escritas à mão no DecisionEngine, a base de marcas no agente de entrevista e três correções de voz soltas. A do Guard 2b reconhecia 14 dos 84 nomes daqui. O teste `[LEXICO-UNICO-1]` barra lista nova de remédios em outro arquivo; `[LEXICO-UNICO-2]` a `[LEXICO-UNICO-7]` cobrem a base gerada e as listas.

## Quem lê o quê (2026-11-11)

- **O modelo** recebe a fala já com os nomes restaurados (`restaurarVariantesAsr`, entradas marcadas `restaurar`).
- **Os guards** recebem a fala crua e acham os remédios com `encontrarMedicamentos`.

Por isso toda variante de voz de um remédio fica aqui, e não em lista à parte: com "trometolol" corrigido só no agente de entrevista, o modelo lia timolol e os guards liam Cetorolaco. A forma exata ("trometolol", na entrada `timolol`) vence o curinga do cetorolaco porque vem antes na lista.

`restaurarVariantesAsr` casa sobre uma cópia alinhada caractere a caractere com o original e troca só os trechos casados. Espaço duplo, espaço nas pontas e quebra de linha não a desligam mais. Testes `[MED-ASR-1]` a `[MED-ASR-5]`.

## Memórias relacionadas

- (nenhuma memória associada)

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Módulos](INDEX.md)
