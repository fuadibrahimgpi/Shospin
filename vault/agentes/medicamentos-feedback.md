---
title: "Auto-feedback de medicações"
description: "Captura palavras que parecem remédio e que o léxico não conhece, e as põe numa fila para o médico revisar. Nunca altera o léxico sozinho."
date: 2026-11-10
tags: [agente, projeto-shosp]
aliases: ["medicamentos-feedback"]
---

# Auto-feedback de medicações

**Agente** · arquivo-fonte: `src/agents/medicamentos-feedback.js` · tela e armazenamento: `scripts/sidepanel-feedback-med.js`

Problema que resolve: o [Léxico de medicamentos](../modulos/medicamentos-lexico.md) só aprendia quando alguém editava o código depois de ver um erro no log. Remédio novo, ou pronúncia que o reconhecimento de voz estraga, ficava sem registro.

O ciclo:

1. `encontrarSuspeitas`: depois de cada análise, acha na fala palavras que parecem remédio e que o léxico não reconhece.
2. `adicionarNaFila`: fila de revisão sem repetição e com tamanho limitado.
3. `resolver`: o médico decide, na caixa "Medicações a revisar" do painel, se a palavra é variante de um remédio existente, remédio novo ou ruído.
4. `montarExportacao`: gera o JSON das decisões aprovadas.

Duas travas de propósito:

- **Nada aqui altera o léxico.** As aprovações exportadas são aplicadas depois, por uma pessoa, com teste. Um nome aprendido errado viraria princípio ativo errado no prontuário.
- **Privacidade.** Guarda só uma janela curta ao redor do termo suspeito, não a consulta, e fica só no navegador.

A captura nunca atrasa nem derruba a injeção.

Este é o agente de medicamentos que está em produção. O [Agente de medicamentos](medicamentos-agent.md) propriamente dito está estacionado.

## Memórias relacionadas

- [lubrificante-registro-padrao](../memorias/lubrificante-registro-padrao.md): registro padrão quando o médico diz "lubrificante"

---

Related: [Léxico de medicamentos](../modulos/medicamentos-lexico.md) · [DecisionEngine](decision-engine.md) · [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
