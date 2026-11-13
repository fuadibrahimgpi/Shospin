---
title: "Contrato dos subagentes"
description: "Forma comum de todo subagente da conduta (nome, campo, detectar, validar, formatar, analisar) e a defesa por evidência literal."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["agent-contract"]
---

# Contrato dos subagentes

**Agente** · arquivo-fonte: `src/agents/agent-contract.js`

Todo subagente da conduta (medicamentos, exames, retorno, óculos…) é um objeto com a mesma forma, para que o regulador/fusor só conheça o contrato — agente novo entra sem mexer no resto.

- `nome`, `campo` (`tratamento` ou `conduta`, dono único do campo)
- `detectar(transcricao)`: roteamento determinístico, sem IA
- `validar(itens, transcricao)`: `{aceitos, descartados, avisos}`, roda em código
- `formatar(aceitos)`: texto que vai ao prontuário
- `analisar(transcricao, contexto)`: chamada ao modelo (opcional)

**Defesa estrutural contra alucinação:** todo item do modelo carrega `evidencia`, trecho LITERAL da fala; `verificarEvidencia()` descarta o item cuja evidência não está na transcrição.

## Memórias relacionadas

- (nenhuma memória associada)

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
