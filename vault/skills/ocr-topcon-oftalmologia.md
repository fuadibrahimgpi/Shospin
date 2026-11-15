---
title: "OCR TOPCON (skill)"
description: "Interpreta e organiza dados de tickets de autorefrator TOPCON para prontuários oftalmológicos"
date: 2026-10-22
tags: [skill, projeto-shosp]
aliases: ["ocr-topcon-oftalmologia"]
---

# OCR TOPCON (skill)

**Skill** · arquivo-fonte: `skills/user/ocr-topcon-oftalmologia/SKILL.md`

Skill do projeto (fonte de verdade das regras clínicas deste domínio), em `skills/user/ocr-topcon-oftalmologia/SKILL.md` (544 linhas).

> Interpreta e organiza dados de tickets de autorefrator TOPCON para prontuários oftalmológicos. Use quando o usuário apresentar imagem ou transcrição de ticket TOPCON e precisar extrair refração, tonometria e paquimetria em JSON estruturado, com regras anti-alucinação, validação de lateralidade OD/OE, tratamento de tickets dobrados, ilegíveis, invertidos, colunas paralelas, ERR, lensômetro e bloqueio de injeção automática quando houver incerteza clínica.

Arquivos auxiliares na pasta da skill: `feedback-refracao.jsonl`, `licoes-aprendidas.md`.


## Memórias relacionadas

- [cid-shosp-sem-ponto](../memorias/cid-shosp-sem-ponto.md): O SHOSP grava e busca CID SEM ponto (H522, não H52.2) — vale para todos os códigos
- [log-2026-07-24-pendencias](../memorias/log-2026-07-24-pendencias.md): Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)
- [log-2026-07-29-blefarite-leiga](../memorias/log-2026-07-29-blefarite-leiga.md): Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco
- [log-2026-07-29-ocr-verify-incoerente](../memorias/log-2026-07-29-ocr-verify-incoerente.md): 5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente
- [log-2026-08-05-ocr-bloqueios-e-blefarite](../memorias/log-2026-08-05-ocr-bloqueios-e-blefarite.md): 3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; "informação na pálpebra" é inflamação comida pelo ASR
- [ocr-3a-leitura-sem-segunda-chance](../memorias/ocr-3a-leitura-sem-segunda-chance.md): _refDataBox é palpite do modelo; recorte válido-e-errado deixava a 3ª leitura ilegível e bloqueava refração em série
- [ocr-criterios-bloqueio-v544](../memorias/ocr-criterios-bloqueio-v544.md): v5.4.4 afrouxou 4 critérios de bloqueio do OCR; o piso de 0.50D agora libera flip de sinal não confirmado
- [ocr-ticket-deitado-90-graus](../memorias/ocr-ticket-deitado-90-graus.md): Ticket TOPCON fotografado deitado (90°) é a causa raiz das trocas de coluna do OCR — corrigido na v5.4.7
- [ticket-sempre-deitado](../memorias/ticket-sempre-deitado.md): Todas as fotos de ticket TOPCON da pasta da câmera estão deitadas; o médico apoia a tira na mesa e fotografa de cima — nunca de pé

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Skills](INDEX.md)
