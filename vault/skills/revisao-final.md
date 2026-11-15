---
title: "Revisão final (skill)"
description: "Revisão obrigatória antes do passo final de qualquer outra skill do projeto: confere o resultado contra os parâmetros da skill que o produziu."
date: 2026-11-10
tags: [skill, projeto-shosp]
aliases: ["revisao-final"]
---

# Revisão final (skill)

**Skill** · arquivo-fonte: `skills/user/revisao-final/SKILL.md`

Não tem regra clínica própria. Entra depois que outra skill terminou o trabalho e antes da ação final: relê os parâmetros da skill que trabalhou (regras críticas, lista de checagem, formato de saída, histórico de erros), confere o resultado item por item e só então libera entregar o texto, lançar o CID ou seguir para testes e commit.

Toda skill da pasta fecha com a seção "Antes do passo final — revisão obrigatória", que aponta para esta. O teste `[SKILL-REVISAO]` em `utils/integration-test.js` confere que a seção existe em todas.

Não confundir com o verificador de mudanças: aquele testa uma skill depois de ela ser editada; esta revisa o resultado de uma skill antes da ação final.

Como as demais skills, é documentação: em produção quem decide é o código. Ver `skills/user/README.md`.

---

Related: [Transcrição da consulta (skill)](transcricao-consulta-oftalmologia.md) · [Conduta e tratamento (skill)](conduta-tratamento-oftalmologia.md)

Up: [Skills](INDEX.md)
