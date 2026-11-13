---
title: Skills
date: 2026-11-10
tags: [indice, skills]
---

# Skills

Skills do projeto em `skills/user/`: documentação legível das regras clínicas. **A autoridade é o código** (prompts, guards do DecisionEngine e `config/*.js`); editar uma skill não muda a extensão. Regra completa em `skills/user/README.md`.

Up: [Cofre](../INDEX.md)

- [Biomicroscopia (skill)](biomicroscopia-oftalmologia.md): Descreve o campo biomicroscopia (segmento anterior / lâmpada de fenda) em consultas oftalmológicas a partir de transcrições
- [CID (skill)](cid-oftalmologia.md): Fluxo de cadastro de CID no SHOSP (handler searchCid) e tabela de CIDs oftalmológicos H00–H59
- [Caso clínico (skill)](caso-clinico-oftalmologia.md): Cria casos clínicos simulados para alunos (projeto de ensino, não da extensão)
- [Conduta e tratamento (skill)](conduta-tratamento-oftalmologia.md): Extrai, normaliza e valida o campo conduta em consultas oftalmológicas
- [Fundoscopia (skill)](fundoscopia-oftalmologia.md): Descreve o campo fundoscopia (segmento posterior / fundo de olho) em consultas oftalmológicas a partir de transcrições
- [Gatilhos e injeção (skill)](gatilhos-injecao-oftalmologia.md): Regras e exemplos dos gatilhos de voz e da injeção automática; listas completas em config/clinical-triggers.js
- [OCR TOPCON (skill)](ocr-topcon-oftalmologia.md): Interpreta e organiza dados de tickets de autorefrator TOPCON para prontuários oftalmológicos
- [Revisão final (skill)](revisao-final.md): Revisão obrigatória antes do passo final de qualquer outra skill; não tem regra clínica própria
- [Simulador (skill)](simulador-oftalmologia.md): Contexto do simulador de consulta para alunos (projeto de ensino, não da extensão)
- [Transcrição da consulta (skill)](transcricao-consulta-oftalmologia.md): Extrai HDA, antecedentes, diagnóstico e flags de injeção da transcrição; delega conduta, biomicroscopia e fundoscopia
