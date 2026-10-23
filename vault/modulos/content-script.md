---
title: "Content script (injeção no SHOSP)"
description: "Injeta dados nos campos do prontuário; trata Froala, CID e abas."
date: 2026-10-22
tags: [modulo, projeto-shosp]
aliases: ["content-script"]
---

# Content script (injeção no SHOSP)

**Módulo** · arquivo-fonte: `src/content.js`

Content script que injeta os dados nos campos do SHOSP. A v5.1.4 corrigiu o salvamento de Atendimento/Conduta/Retorno: o SHOSP salva lendo o `<textarea>` oculto `prontuario_resp_<servico>_<campo>`, que o Froala só sincroniza na digitação real; `setFroalaValue` agora grava também esse textarea. Ver [Froala model-desync](../memorias/froala-model-desync-saving.md).

## Memórias relacionadas

- [cid-busca-exige-secao-visivel](../memorias/cid-busca-exige-secao-visivel.md): A busca de CID do SHOSP só executa com a seção C.I.D. VISÍVEL — oculta, o painel mostra o histórico e ele era lido como resultado
- [cid-historico-como-resultado](../memorias/cid-historico-como-resultado.md): Instabilidade da injeção de CID: o painel do SHOSP mistura 'Últimos CIDs selecionados' com os resultados; matcher permissivo clicava o vizinho e respondia success
- [cid-search-hadrows-dead-branch](../memorias/cid-search-hadrows-dead-branch.md): searchCid: ramo 'hadRows' era morto → msg de falha de CID não distinguia gap-do-subset de bug-de-matching; corrigido com sawAnyRows
- [conduta-plano-investigacao](../memorias/conduta-plano-investigacao.md): "Se não resolver, investigar outras causas" é conduta — não é retorno condicional vago (2026-08-04)
- [dilatacao-contaminacao-fase2](../memorias/dilatacao-contaminacao-fase2.md): Dilatação virou fila multi-paciente (v5.1.5, _shospDilatacaoPausas) — opt-in por slot; histórico da contaminação entre pacientes
- [froala-model-desync-saving](../memorias/froala-model-desync-saving.md): Por que Atendimento/Conduta não salvavam e o fix da ponte Froala (mundo principal)
- [fundoscopia-descritiva-nao-interpretativa](../memorias/fundoscopia-descritiva-nao-interpretativa.md): Regra do médico (2026-08-04) — a descrição injetada da fundoscopia não diz "sugestivo/suspeita de glaucoma"; só o achado
- [log-2026-07-21-pendencias](../memorias/log-2026-07-21-pendencias.md): Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)
- [log-2026-07-29-exame-normal-vs-diagnostico](../memorias/log-2026-07-29-exame-normal-vs-diagnostico.md): Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou "AO olho calmo"); rede de segurança criada
- [ordem-olhos-od-antes-de-oe](../memorias/ordem-olhos-od-antes-de-oe.md): Em qualquer descrição por olho, OD vem sempre antes de OE — ordem do prontuário, nunca a da fala
- [queixa-principal-sem-negativas](../memorias/queixa-principal-sem-negativas.md): Negativa de SINTOMA não entra na HDA nem no campo retorno — nem abrindo, nem no corpo
- [refracao-estatica-pos-dilatacao](../memorias/refracao-estatica-pos-dilatacao.md): Feature de captura pós-dilatação → Refração estática; implementada mas NÃO verificada (faltam IDs reais do bloco estática)
- [tempo-relativo-na-hda](../memorias/tempo-relativo-na-hda.md): Tempo na HDA é sempre duração relativa ("há ~X meses"), nunca data de calendário; e só entra o que é pertinente à queixa

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Módulos](INDEX.md)
