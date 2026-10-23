---
title: Memórias
date: 2026-10-22
tags: [indice, memoria]
---

# Memórias

Cópia das memórias persistentes do Claude Code deste projeto. Cada nota liga aos agentes, skills e módulos que ela afeta.

Up: [Cofre](../INDEX.md)

## Usuário (1)

- [fraseado-encerramento-consulta](fraseado-encerramento-consulta.md): Como o médico realmente encerra consultas — saudações de despedida e "passar no balcão"; não usa "me liga" nem perguntas abertas

## Feedback (como trabalhar) (12)

- [blefarite-texto-nao-e-rotina](blefarite-texto-nao-e-rotina.md): O texto descritivo de blefarite na biomicroscopia só entra se a inflamação palpebral foi DESCRITA; tratamento (shampoo/compressa) não autoriza
- [comorbidade-negativa-fabricada](comorbidade-negativa-fabricada.md): Resposta 'sim' à pergunta sistêmica virou 'Nega comorbidades' e o diabetes do paciente sumiu do prontuário (2026-08-04)
- [conduta-plano-investigacao](conduta-plano-investigacao.md): "Se não resolver, investigar outras causas" é conduta — não é retorno condicional vago (2026-08-04)
- [fundoscopia-descritiva-nao-interpretativa](fundoscopia-descritiva-nao-interpretativa.md): Regra do médico (2026-08-04) — a descrição injetada da fundoscopia não diz "sugestivo/suspeita de glaucoma"; só o achado
- [opacidade-capsula-linguagem-leiga](opacidade-capsula-linguagem-leiga.md): PCO dita em linguagem leiga ("lente um pouquinho embaçada") não virava opacidade de cápsula; e o guard de texto misto engolia a flag
- [lente-contato-e-antecedente](lente-contato-e-antecedente.md): Uso de lente de contato é antecedente ocular (não HDA) e o que importa é a irregularidade, quase sempre revelada pela fala do médico ao orientar
- [tempo-relativo-na-hda](tempo-relativo-na-hda.md): Tempo na HDA é sempre duração relativa ("há ~X meses"), nunca data de calendário; e só entra o que é pertinente à queixa
- [conduta-normalidade-nao-e-conduta](conduta-normalidade-nao-e-conduta.md): Explicado exames normais" e afins não entram na conduta — nem como cláusula dentro de linha "Explicado ..." agrupada
- [achado-episodico-nao-e-diagnostico](achado-episodico-nao-e-diagnostico.md): Hemorragia subconjuntival recorrente relatada pelo paciente virou CID atual e foi arrastada para a biomicroscopia pela regra de consistência
- [queixa-principal-sem-negativas](queixa-principal-sem-negativas.md): Negativa de SINTOMA não entra na HDA nem no campo retorno — nem abrindo, nem no corpo
- [exame-nomeado-por-deducao](exame-nomeado-por-deducao.md): nome de exame na conduta só pode vir da fala do médico; H400 não acompanha OCT/campo visual por padrão
- [ordem-olhos-od-antes-de-oe](ordem-olhos-od-antes-de-oe.md): Em qualquer descrição por olho, OD vem sempre antes de OE — ordem do prontuário, nunca a da fala

## Projeto (estado e logs) (37)

- [nested-duplicate-folder](project_nested_duplicate.md): A pasta aninhada shosp-extension-v5.1.0/ é uma cópia stale — editar apenas os scripts da raiz
- [froala-model-desync-saving](froala-model-desync-saving.md): Por que Atendimento/Conduta não salvavam e o fix da ponte Froala (mundo principal)
- [gemini-service-modularizado](gemini-service-modularizado.md): Prompt clínico e regras de conduta agora vivem em src/gemini-interview-agent.js, não mais em geminiService.js (que virou fachada)
- [reestruturacao-fases](reestruturacao-fases.md): Plano de reestruturação Caminho B — fases −1/0/1 executadas (2026-07-14); fases 2–4 planejadas sob demanda
- [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md): Dilatação virou fila multi-paciente (v5.1.5, _shospDilatacaoPausas) — opt-in por slot; histórico da contaminação entre pacientes
- [log-2026-07-21-pendencias](log-2026-07-21-pendencias.md): Log 2026-07-21: os 4 itens TRATADOS 2026-07-23 (prontuarioOpen, eixo OCR, H52.9 dup, visibilidade CID). Restam sub-item OD↔OE e validações runtime (agenda p/ prontuarioOpen)
- [log-2026-07-24-pendencias](log-2026-07-24-pendencias.md): Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)
- [cid-search-hadrows-dead-branch](cid-search-hadrows-dead-branch.md): searchCid: ramo 'hadRows' era morto → msg de falha de CID não distinguia gap-do-subset de bug-de-matching; corrigido com sawAnyRows
- [log-2026-07-27-pendencias](log-2026-07-27-pendencias.md): Log 2026-07-27 — família alucinada (fix), OCR refrativo perdido p/ H52.9 (fix), grava vazia pós-dilatação (não é bug), biomicroscopia bilateralizou achado unilateral (fix)
- [log-2026-07-28-pendencias](log-2026-07-28-pendencias.md): Log 2026-07-28 — tratamento fabricado (pomada corpo estranho) e lateralidade de catarata chutada; ambos corrigidos no prompt
- [skills-exame-biomicro-fundo](skills-exame-biomicro-fundo.md): Skills dedicadas de biomicroscopia e fundoscopia; regras normal/alterado por olho; runtime é autoridade
- [log-2026-07-29-blefarite-leiga](log-2026-07-29-blefarite-leiga.md): Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco
- [log-2026-07-29-exame-normal-vs-diagnostico](log-2026-07-29-exame-normal-vs-diagnostico.md): Exame normal era injetado contra o próprio diagnóstico (pterígio OD virou "AO olho calmo"); rede de segurança criada
- [log-2026-07-29-gatilho-dilatacao](log-2026-07-29-gatilho-dilatacao.md): Dilatação não disparou em 2026-07-29 — plural "-arem lá fora" e "colírio" comido pelo ASR; ambos corrigidos
- [log-2026-07-29-ocr-verify-incoerente](log-2026-07-29-ocr-verify-incoerente.md): 5 capturas de OCR bloqueadas por uma 2ª leitura que se auto-contradiz; fix desconta verify aritmeticamente incoerente
- [speech-log-truncado-120](speech-log-truncado-120.md): O log "[Speech] Final:" mostra só os últimos 120 chars — não é o texto que os gatilhos veem
- [cid-historico-como-resultado](cid-historico-como-resultado.md): Instabilidade da injeção de CID: o painel do SHOSP mistura 'Últimos CIDs selecionados' com os resultados; matcher permissivo clicava o vizinho e respondia success
- [cid-shosp-sem-ponto](cid-shosp-sem-ponto.md): O SHOSP grava e busca CID SEM ponto (H522, não H52.2) — vale para todos os códigos
- [refracao-estatica-pos-dilatacao](refracao-estatica-pos-dilatacao.md): Feature de captura pós-dilatação → Refração estática; implementada mas NÃO verificada (faltam IDs reais do bloco estática)
- [cid-dedup-fronteira-de-paciente](cid-dedup-fronteira-de-paciente.md): A fronteira de paciente do dedup de CID é o painel, não a URL — o SHOSP abre toda ficha na mesma URL
- [log-2026-07-31-pendencias](log-2026-07-31-pendencias.md): Log de 2026-07-31 (4 pacientes, 1 com dilatação) — dedup de CID vazando entre pacientes, presbiopia apagada por guard, PIO 24 sem alerta
- [antecedentes-negativa-fabricada](antecedentes-negativa-fabricada.md): Nega diagnósticos e procedimentos oftalmológicos prévios" era escrito por ausência de resposta — apagava glaucoma prévio relatado
- [log-2026-08-03-cristalino-pseudofacia](log-2026-08-03-cristalino-pseudofacia.md): Placeholder "cristalino transparente" foi injetado em paciente pseudofácica; prompt agora manda escrever a LIO direto na linha do olho operado
- [ocr-3a-leitura-sem-segunda-chance](ocr-3a-leitura-sem-segunda-chance.md): _refDataBox é palpite do modelo; recorte válido-e-errado deixava a 3ª leitura ilegível e bloqueava refração em série
- [cid-busca-exige-secao-visivel](cid-busca-exige-secao-visivel.md): A busca de CID do SHOSP só executa com a seção C.I.D. VISÍVEL — oculta, o painel mostra o histórico e ele era lido como resultado
- [presbiopia-veto-pseudofacia](presbiopia-veto-pseudofacia.md): Decisão do médico (2026-08-04) — paciente com LIO nos dois olhos não pode receber H52.4; veto só vale para pseudofacia BILATERAL
- [log-2026-08-05-multifocal-e-fundoscopia](log-2026-08-05-multifocal-e-fundoscopia.md): Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de "fundo" — ambos corrigidos
- [log-2026-08-05-ocr-bloqueios-e-blefarite](log-2026-08-05-ocr-bloqueios-e-blefarite.md): 3 capturas seguidas bloqueadas com a resposta dentro da própria leitura ampliada; "informação na pálpebra" é inflamação comida pelo ASR
- [ocr-criterios-bloqueio-v544](ocr-criterios-bloqueio-v544.md): v5.4.4 afrouxou 4 critérios de bloqueio do OCR; o piso de 0.50D agora libera flip de sinal não confirmado
- [ocr-ticket-deitado-90-graus](ocr-ticket-deitado-90-graus.md): Ticket TOPCON fotografado deitado (90°) é a causa raiz das trocas de coluna do OCR — corrigido na v5.4.7
- [ticket-sempre-deitado](ticket-sempre-deitado.md): Todas as fotos de ticket TOPCON da pasta da câmera estão deitadas; o médico apoia a tira na mesa e fotografa de cima — nunca de pé
- [log-2026-08-07-microfone-mudo](log-2026-08-07-microfone-mudo.md): Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera
- [cid-pterigio-h110](cid-pterigio-h110.md): Sítios errados na tabela de CIDs do prompt (pterígio H111→H110 e mais três)
- [log-2026-08-27-multifocal-apagado](log-2026-08-27-multifocal-apagado.md): Guard exigia a palavra "multifocal" e apagou conduta correta descrita como "longe perto junto"; H524 sobreviveu
- [log-2026-09-02-pseudofacia-fabricada](log-2026-09-02-pseudofacia-fabricada.md): Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz
- [log-2026-09-15-tobramicina-sem-colirio](log-2026-09-15-tobramicina-sem-colirio.md): Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e "vou passar um tratamento" agora não acionam; guard remove a linha
- [digitalizacao-fichas-ferramenta](digitalizacao-fichas-ferramenta.md): Ferramenta separada (fora do repo shosp) que renomeia fichas escaneadas para NOME_CPF.pdf via Google Cloud Vision; local, decisões não especificadas e pendências
