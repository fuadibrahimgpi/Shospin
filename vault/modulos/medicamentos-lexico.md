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
