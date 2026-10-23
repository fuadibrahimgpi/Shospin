---
title: "Gatilhos e injeção (skill)"
description: ">"
date: 2026-10-22
tags: [skill, projeto-shosp]
aliases: ["gatilhos-injecao-oftalmologia"]
---

# Gatilhos e injeção (skill)

**Skill** · arquivo-fonte: `skills/user/gatilhos-injecao-oftalmologia/SKILL.md`

Skill do projeto (fonte de verdade das regras clínicas deste domínio), em `skills/user/gatilhos-injecao-oftalmologia/SKILL.md` (570 linhas).

> >


## Memórias relacionadas

- [cid-dedup-fronteira-de-paciente](../memorias/cid-dedup-fronteira-de-paciente.md): A fronteira de paciente do dedup de CID é o painel, não a URL — o SHOSP abre toda ficha na mesma URL
- [cid-historico-como-resultado](../memorias/cid-historico-como-resultado.md): Instabilidade da injeção de CID: o painel do SHOSP mistura 'Últimos CIDs selecionados' com os resultados; matcher permissivo clicava o vizinho e respondia success
- [conduta-normalidade-nao-e-conduta](../memorias/conduta-normalidade-nao-e-conduta.md): Explicado exames normais" e afins não entram na conduta — nem como cláusula dentro de linha "Explicado ..." agrupada
- [dilatacao-contaminacao-fase2](../memorias/dilatacao-contaminacao-fase2.md): Dilatação virou fila multi-paciente (v5.1.5, _shospDilatacaoPausas) — opt-in por slot; histórico da contaminação entre pacientes
- [fraseado-encerramento-consulta](../memorias/fraseado-encerramento-consulta.md): Como o médico realmente encerra consultas — saudações de despedida e "passar no balcão"; não usa "me liga" nem perguntas abertas
- [froala-model-desync-saving](../memorias/froala-model-desync-saving.md): Por que Atendimento/Conduta não salvavam e o fix da ponte Froala (mundo principal)
- [log-2026-07-21-pendencias](../memorias/log-2026-07-21-pendencias.md): Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)
- [log-2026-07-29-gatilho-dilatacao](../memorias/log-2026-07-29-gatilho-dilatacao.md): Dilatação não disparou em 2026-07-29 — plural "-arem lá fora" e "colírio" comido pelo ASR; ambos corrigidos
- [log-2026-07-29-ocr-verify-incoerente](../memorias/log-2026-07-29-ocr-verify-incoerente.md): 5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente
- [log-2026-07-31-pendencias](../memorias/log-2026-07-31-pendencias.md): Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta
- [log-2026-08-07-microfone-mudo](../memorias/log-2026-08-07-microfone-mudo.md): Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera
- [reestruturacao-fases](../memorias/reestruturacao-fases.md): Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda
- [refracao-estatica-pos-dilatacao](../memorias/refracao-estatica-pos-dilatacao.md): Feature de captura pós-dilatação → Refração estática; implementada mas NÃO verificada (faltam IDs reais do bloco estática)
- [speech-log-truncado-120](../memorias/speech-log-truncado-120.md): O log "[Speech] Final:" mostra só os últimos 120 chars — não é o texto que os gatilhos veem

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Skills](INDEX.md)
