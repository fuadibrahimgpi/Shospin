---
title: "DecisionEngine (guards pós-LLM)"
description: "Ponto autoritativo de segurança clínica: aplica guards determinísticos à resposta do Gemini sem mutar a resposta crua."
date: 2026-10-22
tags: [agente, projeto-shosp]
aliases: ["decision-engine"]
---

# DecisionEngine (guards pós-LLM)

**Agente** · arquivo-fonte: `src/DecisionEngine.js`

Guards pós-LLM centralizados (v6): recebem a resposta JSON do [Agente de entrevista](gemini-interview-agent.md) e o contexto (transcrição, flags dos hooks) e devolvem uma DECISÃO derivada, sem mutar a resposta crua. Cada guard é determinístico e cobre uma falha real que já aconteceu.

## Passos do pipeline (ordem de execução)

Lista tirada do código em 2026-11-10. Inclui a normalização de tipos, os guards, a reconciliação das flags e os avisos.

1. `_normalizarTiposDados`
2. `_guardTranscricaoIncoerente`
3. `_guardExamesNormaisFase2`
4. `_guardDilatacao`
5. `_guardBlefariteLiteral`
6. `_guardAssociacaoATB`
7. `_guardClasseAntibioticoSemFala`
8. `_guardMedicamentoNomeadoNaFala`
9. `_guardColirioMantidoSemTratamento`
10. `_guardColirioBlefariteProtocolo`
11. `_guardColirioBlefariteSemPrescricao`
12. `_guardCondutaContaminada`
13. `_guardLubrificanteGenerico`
14. `_guardMultifocalSemEvidencia`
15. `_guardManutencaoOculos`
16. `_guardAntecedentesNegativaFabricada`
17. `_guardComorbidadesNegativaFabricada`
18. `_guardPseudofaciaSemEvidencia`
19. `_guardNervoOpticoSemEvidencia`
20. `_guardOculosNaConduta`
21. `_guardPresbiopiaObrigatoria`
22. `_ordenaOlhosODPrimeiro`
23. `_sombraMedicamentos`
24. `_reconcileInjectFlags`
25. `_avisoBiomicroscopiaOrfa`
26. `_avisoFundoscopiaInterpretativa`

## Não falha aberto (2026-11-10)

Antes, os guards rodavam em fila sem isolamento: uma exceção em qualquer um derrubava todos, e o painel recuava para a resposta crua do modelo e a injetava. Bastava `diagnostico` vir como lista.

- **Tipos normalizados antes dos guards.** Lista de textos é unida sem perda; objeto, número ou lista de objetos vira texto e é marcado como inesperado.
- **Cada passo roda isolado.** O que falha é registrado em `guardsFalhos` e os outros seguem.
- **Verificação incompleta segura a injeção.** A decisão devolve `segurarInjecao` e `motivoSegurar`; o painel mostra os campos com aviso e não injeta sozinho.
- **Porta única no painel.** `_aplicarDecisionEngine` (em `scripts/sidepanel-audio.js`) serve o fluxo normal e o "Não era dilatação"; motor ausente ou que lança também segura a injeção.

Testes `[DE-ABERTO-1]` a `[DE-ABERTO-9]`.

O histórico de cada falha que gerou um guard está nas memórias relacionadas abaixo e na [linha do tempo](../historico/linha-do-tempo.md). O "modo sombra" de medicamentos deste pipeline usa só o [Léxico](../modulos/medicamentos-lexico.md); o [Agente de medicamentos](medicamentos-agent.md) está estacionado.

## Memórias relacionadas

- [antecedentes-negativa-fabricada](../memorias/antecedentes-negativa-fabricada.md): Nega diagnósticos e procedimentos oftalmológicos prévios" era escrito por ausência de resposta — apagava glaucoma prévio relatado
- [blefarite-texto-nao-e-rotina](../memorias/blefarite-texto-nao-e-rotina.md): O texto descritivo de blefarite na biomicroscopia só entra se a inflamação palpebral foi DESCRITA; tratamento (shampoo/compressa) não autoriza
- [comorbidade-negativa-fabricada](../memorias/comorbidade-negativa-fabricada.md): Resposta 'sim' à pergunta sistêmica virou 'Nega comorbidades' e o diabetes do paciente sumiu do prontuário (2026-08-04)
- [fundoscopia-descritiva-nao-interpretativa](../memorias/fundoscopia-descritiva-nao-interpretativa.md): Regra do médico (2026-08-04) — a descrição injetada da fundoscopia não diz "sugestivo/suspeita de glaucoma"; só o achado
- [lente-contato-e-antecedente](../memorias/lente-contato-e-antecedente.md): Uso de lente de contato é antecedente ocular (não HDA) e o que importa é a irregularidade, quase sempre revelada pela fala do médico ao orientar
- [log-2026-07-24-pendencias](../memorias/log-2026-07-24-pendencias.md): Log 2026-07-24 (4 consultas): OCR sinal de esfera invertido por voto 2-de-3 CORRIGIDO (v5.3.6); H04.1 olho seco é gap do subset do SHOSP como H16.2 (by design)
- [log-2026-07-29-blefarite-leiga](../memorias/log-2026-07-29-blefarite-leiga.md): Guard literal de blefarite apagou blefarite real descrita em linguagem leiga; biomicroscopia saiu órfã em branco
- [log-2026-08-05-multifocal-e-fundoscopia](../memorias/log-2026-08-05-multifocal-e-fundoscopia.md): Multifocal fabricado por co-ocorrência de tokens e fundoscopia normal barrada por gate literal de "fundo" — ambos corrigidos
- [log-2026-08-07-microfone-mudo](../memorias/log-2026-08-07-microfone-mudo.md): Consulta inteira perdida por track de áudio MUDA (readyState='live'); corrigido com leitura de `muted`, sonda de liveness do STT e fim do guard de câmera
- [log-2026-08-27-multifocal-apagado](../memorias/log-2026-08-27-multifocal-apagado.md): Guard exigia a palavra "multifocal" e apagou conduta correta descrita como "longe perto junto"; H524 sobreviveu
- [log-2026-09-02-pseudofacia-fabricada](../memorias/log-2026-09-02-pseudofacia-fabricada.md): Cirurgia de PTERÍGIO relatada virou catarata→LIO→Z961 e apagou a H52.4; corrigido em prompt, guard e gatilho de voz
- [log-2026-09-15-tobramicina-sem-colirio](../memorias/log-2026-09-15-tobramicina-sem-colirio.md): Protocolo da blefarite criou Tobramicina+dexametasona sem colírio na fala; lubrificante e "vou passar um tratamento" agora não acionam; guard remove a linha
- [presbiopia-veto-pseudofacia](../memorias/presbiopia-veto-pseudofacia.md): Decisão do médico (2026-08-04) — paciente com LIO nos dois olhos não pode receber H52.4; veto só vale para pseudofacia BILATERAL
- [queixa-principal-sem-negativas](../memorias/queixa-principal-sem-negativas.md): Negativa de SINTOMA não entra na HDA nem no campo retorno — nem abrindo, nem no corpo
- [ticket-sempre-deitado](../memorias/ticket-sempre-deitado.md): Todas as fotos de ticket TOPCON da pasta da câmera estão deitadas; o médico apoia a tira na mesa e fotografa de cima — nunca de pé

---

Related: [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
