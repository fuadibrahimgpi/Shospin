---
title: "CID (skill)"
description: ">"
date: 2026-10-22
tags: [skill, projeto-shosp]
aliases: ["cid-oftalmologia"]
---

# CID (skill)

**Skill** · arquivo-fonte: `skills/user/cid-oftalmologia/SKILL.md`

Skill do projeto (fonte de verdade das regras clínicas deste domínio), em `skills/user/cid-oftalmologia/SKILL.md` (596 linhas).

> >


## Memórias relacionadas

- [achado-episodico-nao-e-diagnostico](../memorias/achado-episodico-nao-e-diagnostico.md): Hemorragia subconjuntival recorrente relatada pelo paciente virou CID atual e foi arrastada para a biomicroscopia pela regra de consistência
- [cid-busca-exige-secao-visivel](../memorias/cid-busca-exige-secao-visivel.md): A busca de CID do SHOSP só executa com a seção C.I.D. VISÍVEL — oculta, o painel mostra o histórico e ele era lido como resultado
- [cid-dedup-fronteira-de-paciente](../memorias/cid-dedup-fronteira-de-paciente.md): A fronteira de paciente do dedup de CID é o painel, não a URL — o SHOSP abre toda ficha na mesma URL
- [cid-historico-como-resultado](../memorias/cid-historico-como-resultado.md): Instabilidade da injeção de CID: o painel do SHOSP mistura 'Últimos CIDs selecionados' com os resultados; matcher permissivo clicava o vizinho e respondia success
- [cid-pterigio-h110](../memorias/cid-pterigio-h110.md): Sítios errados na tabela de CIDs do prompt (pterígio H111→H110 e mais três)
- [cid-search-hadrows-dead-branch](../memorias/cid-search-hadrows-dead-branch.md): searchCid: ramo 'hadRows' era morto → msg de falha de CID não distinguia gap-do-subset de bug-de-matching; corrigido com sawAnyRows
- [cid-shosp-sem-ponto](../memorias/cid-shosp-sem-ponto.md): O SHOSP grava e busca CID SEM ponto (H522, não H52.2) — vale para todos os códigos
- [log-2026-07-21-pendencias](../memorias/log-2026-07-21-pendencias.md): Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)
- [log-2026-07-24-pendencias](../memorias/log-2026-07-24-pendencias.md): Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)
- [log-2026-07-27-pendencias](../memorias/log-2026-07-27-pendencias.md): Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)
- [log-2026-07-29-blefarite-leiga](../memorias/log-2026-07-29-blefarite-leiga.md): Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco
- [log-2026-07-31-pendencias](../memorias/log-2026-07-31-pendencias.md): Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta
- [log-2026-08-27-multifocal-apagado](../memorias/log-2026-08-27-multifocal-apagado.md): Guard exigia a palavra "multifocal" e apagou conduta correta descrita como "longe perto junto"; H524 sobreviveu
- [ocr-criterios-bloqueio-v544](../memorias/ocr-criterios-bloqueio-v544.md): v5.4.4 afrouxou 4 critérios de bloqueio do OCR; o piso de 0.50D agora libera flip de sinal não confirmado
- [ordem-olhos-od-antes-de-oe](../memorias/ordem-olhos-od-antes-de-oe.md): Em qualquer descrição por olho, OD vem sempre antes de OE — ordem do prontuário, nunca a da fala
- [presbiopia-veto-pseudofacia](../memorias/presbiopia-veto-pseudofacia.md): Decisão do médico (2026-08-04) — paciente com LIO nos dois olhos não pode receber H52.4; veto só vale para pseudofacia BILATERAL

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Skills](INDEX.md)
