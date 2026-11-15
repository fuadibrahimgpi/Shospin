---
title: "log-2026-07-27-pendencias"
description: "Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)"
date: 2026-07-27
tags: [memoria, project]
aliases: ["log-2026-07-27-pendencias"]
---

# log-2026-07-27-pendencias

> Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)

Análise do log de sessão de 2026-07-27 (4 consultas). Três achados:

**#1 (FIX) — antecedente familiar alucinado a partir de ASR embolado.** O agente de
entrevista converteu ruído de STT ("perdeu a amizade muito muito carregamento") em
"parente perdeu a visão". Correto seria a negativa implícita ("Nega diagnósticos
oftalmológicos familiares"), pois o médico perguntou e não houve resposta clara.
Corrigido com guarda anti-alucinação no spec de `antecedentes_familiares` em
`src/gemini-interview-agent.js` E na tabela de negativas de
`skills/user/transcricao-consulta-oftalmologia/SKILL.md` (exemplo negativo trabalhado).

**#3 (FIX) — CID refrativo específico do OCR perdido, substituído por H52.9.** A passada
de câmera injeta H52.0/H52.2 no `diagnosticoField`; a passada de áudio (entrevista) que
vem depois sobrescreve o campo com o diagnóstico dela (H52.9 inespecífico) via
`displayAudioResults`, e `cameraData` já foi anulado pelo `clearAll` da câmera → os
específicos se perdiam. Fix: persistir os CIDs refrativos do OCR em
`_pendingOcrRefracaoCids` (constants.js, zerado em resetSession) e re-mesclá-los na
passada de áudio em `injectAll` (sidepanel-injection.js); `_dropUnspecifiedRefraction`
então remove o H52.9 redundante. Resolve a pendência recorrente "H52.9 duplicado" para
o caso câmera→áudio. Ver [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md).

**#2 (NÃO é bug) — duas gravações vazias após retomada de dilatação.** Investigado a
fundo: eram dois cliques manuais de gravação sem fala, descartados corretamente; o slot
de retomada armado sobrevive (`processAudioInBackground` retorna antes de consumi-lo) e
`fase2DilatacaoAtiva` é re-derivada por sessão. Nada auto-inicia gravação. NÃO mexer em
MIN_SESSION_MS nem no filtro de <4 palavras — quebraria a fase 2 legítima (que é curta).

**#4 (FIX) — biomicroscopia bilateralizou achado unilateral por trauma.** Consulta de
corpo estranho/inseto (paciente disse só o olho direito na história): biomicroscopia de
abrasão corneana injetada como `AO`, descrevendo lesão no olho são; diagnóstico
`H161 - Ceratite traumática` sem lado. Causa raiz: a regra de lateralidade mandava usar
`AO` como "fallback seguro" quando o médico não citava o olho DURANTE O EXAME — ignorava
a queixa/HDA onde o lado foi dito. Fix (prompt-level, sem guard de runtime — decisão do
usuário): regra reescrita em `src/gemini-interview-agent.js` (biomicroscopia E diagnóstico)
e no SKILL.md — lado sai de TODA a consulta; `AO` PROIBIDO em achados unilaterais por
natureza (trauma/corpo estranho/abrasão/ceratite traumática); lado indeterminável →
prefixo `[CONFIRMAR OLHO AFETADO]` na biomicroscopia e sufixo `(confirmar olho)` no CID,
nunca assumir `AO`. Marcador vive dentro do texto (não bloqueia injeção; ≠ `revisao_manual`).
Observação: ASR desta consulta estava muito embolada ("josué"=olho) e o log truncava o
texto — não deu p/ confirmar se o "direito" chegou limpo ao modelo, mas o fix cobre os dois
casos (melhora inferência da HDA + nunca bilateraliza). Ver [[transcricao-consulta-oftalmologia]].

Todos os testes passam (integração 162, hooks 176). Ver [reestruturacao-fases](reestruturacao-fases.md).

---

Related: [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md) · [reestruturacao-fases](reestruturacao-fases.md) · [Transcrição da consulta (skill)](../skills/transcricao-consulta-oftalmologia.md) · [CID (skill)](../skills/cid-oftalmologia.md) · [Agente de entrevista (Gemini)](../agentes/gemini-interview-agent.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [cid-search-hadrows-dead-branch](cid-search-hadrows-dead-branch.md)

Up: [Memórias](INDEX.md)
