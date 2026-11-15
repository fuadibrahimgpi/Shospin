---
title: "simulacao-coordenador-skills"
description: "Simulação 2026-11-07 de agente coordenador das skills clínicas — descartado; descrições ajustadas dão 48/48; `mestre` é a ATUAL (consultorio-evidencia é a aposentada)"
date: 2026-11-07
tags: [memoria, project]
aliases: ["simulacao-coordenador-skills"]
---

# simulacao-coordenador-skills

> Simulação 2026-11-07 de agente coordenador das skills clínicas — descartado; descrições ajustadas dão 48/48; `mestre` é a ATUAL (consultorio-evidencia é a aposentada)

Simulação (2026-11-07), 24 pedidos × 2 rodadas por braço, só roteamento:
- Sem coordenador 44/48 → com coordenador 48/48 (enviesado: gabarito e tabela escritos pelo mesmo autor), +12% de contexto.
- DECIDIDO: sem coordenador. Descrições de ocr-topcon, conduta-tratamento e gatilhos ajustadas → 48/48 sem coordenador.
- `mestre` é a skill ATUAL (fusão de 22/10/2026); a duplicata a apagar no claude.ai é `consultorio-evidencia-oftalmologia`. (Eu tinha dito o contrário — errado.)
- O skills-claude JÁ tem `geral/coordenador-de-skills`, mas ele cobre o ciclo da prova e a manutenção de skills, não as skills clínicas.
- No skills-claude, `skill-melhoria-continua` está aposentada (substituta: `revisor-de-skills`); não citá-la em skills.
- Em produção (extensão) as skills não rodam — o runtime é o prompt Gemini.

**Why:** decidir se vale criar coordenador e qual duplicata apagar.
**How to apply:** ver `copias-skills-dev-github` (nota fora do cofre) para onde ficam as cópias.

---

Related: [Skills](../skills/INDEX.md) · [Revisão de 2026-11-07](../revisao-estrutura-agente-2026-11-07.md)

Up: [Memórias](INDEX.md)
