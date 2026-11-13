---
title: "refracao-estatica-pos-dilatacao"
description: "Feature de captura pós-dilatação → Refração estática; implementada mas NÃO verificada (faltam IDs reais do bloco estática)"
date: 2026-07-30
tags: [memoria, project]
aliases: ["refracao-estatica-pos-dilatacao"]
---

# refracao-estatica-pos-dilatacao

> Feature de captura pós-dilatação → Refração estática; implementada mas NÃO verificada (faltam IDs reais do bloco estática)

Feature (branch `refactor/estrutura-fase-0-1`, implementada 2026-07-24): na retomada de dilatação, o botão "📷 Refração estática" (linha verde armada da sala de espera) abre a câmera em modo `_captureMode='estatica'`; a captura vai SÓ para o bloco Refração estática, sem injectAll.

Fluxo: botão (`sidepanel-audio.js` renderDilatacaoPausas) → `startCameraCaptureEstatica` (`sidepanel-camera.js`) → `captureAndProcess` ramo estática → `injectRefracaoEstaticaDirect` (`sidepanel-injection.js`) → `case 'injectRefracaoEstatica'` (`content.js`) → clickTab+refresh+`fillRefractionFields('refracao','refracaoEstatica',refr)`. Flag `_captureMode` em `sidepanel-constants.js`.

**Bug de roteamento (achado 2026-07-27, CORRIGIDO):** uma captura estática que falhava na verificação do OCR (`_captureFailed`, ~1 em 3 no log) caía no `stopCameraCapture()` → zera `_captureMode='normal'`; o botão "Refazer captura" chamava `startCameraCapture()` (normal). Resultado: a retentativa rodava injectAll normal e empurrava o grau dilatado para RECEITA DE ÓCULOS + refração dinâmica + CID (exatamente a queixa do médico). Fix em `sidepanel-camera.js`: `showCaptureFailedMessage(reason, retryMode)` + branch `_captureFailed` passa o `captureMode` do snapshot; retry rearma via `startCameraCaptureEstatica()` quando era estática. `startCameraCaptureEstatica` evita `switchMode` (que também zera o modo), então o rearme segura.

**2026-07-29 (2ª sessão do dia) — EXERCITADO e reprovado no mapeamento.** Corrige a nota anterior ("bloqueio era do OCR, não do mapeamento"): naquela sessão sim, mas no log das duas crianças TRÊS capturas estáticas (20:05:54, 20:10:05, 20:11:14) voltaram `_captureFailed:false` e NENHUMA foi seguida de `[InjectAll]` — assinatura exclusiva do ramo `captureMode==='estatica'`, que retorna antes do Caminho 2. Logo o caminho rodou de ponta a ponta e morreu na resolução dos campos. A mensagem que o médico vê é `sidepanel-camera.js:379` "Refração estática não injetada — confira os campos e o mapeamento".

**Causa raiz (confirmada por leitura de código, não por hipótese):** `refracaoEstatica.*` é o ÚNICO grupo em FALLBACK_IDS sem IDs fixados (comentado em `src/content.js:56-61`), então `getFieldId` devolve null nos 6 caminhos → `fillRefractionFields` retorna false. Depende 100% da heurística `_refractionBlockOf` (rótulo "estát" nos ancestrais) contra DOM nunca inspecionado. Guarda `DYNAMIC_REFRACTION_IDS` impede que 259522–528 virem estática, então o pior caso é "não injeta" (seguro), nunca campo errado.

**Não escrever heurística nova antes do DOM.** Duas sessões já concluíram "precisa do dump" e a terceira quase escreveu detecção por complemento (grupo de 6 que não é o dinâmico) — premissa não verificada: não se sabe se o bloco existe como 6 inputs, se é renderizado lazy num acordeão aninhado, ou se um grupo vizinho (ceratometria/lensometria/cicloplegia) seria capturado por engano, o que destruiria a única propriedade garantida hoje (falha segura).

**Instrumentação implementada 2026-07-30 (o dump agora vem de graça):** `detector.dumpRefractionCandidates()` em `src/content.js` devolve id/name/placeholder/`bloco`/rótulos-ancestrais de cada campo de refração — estrutura só, nunca `.value`. A resposta de `injectRefracaoEstatica` anexa `diag` quando NÃO preenche, e `injectRefracaoEstaticaDirect` loga com `JSON.stringify` (o console imprime objeto como "Object" e o log copiado perde justamente esse conteúdo — ver [speech-log-truncado-120](speech-log-truncado-120.md) para a mesma classe de armadilha de log). Escape hatch sem refazer captura: `dumpRefracaoBlocks()` no console do painel. Testes `[EST-DIAG-1..5]`.

**2026-07-30 (2ª sessão) — o dump rodou e MESMO ASSIM não entregou os IDs.** A captura das 13:57 falhou, `diag.resolvidos` veio com os 6 nulls e o dump foi impresso — mas como um único `JSON.stringify(candidatos, null, 1)` (~20 campos × 28 linhas), e o console do Chrome cortou a string em `"id": "prontuario_res`, justo antes do bloco ESTÁTICA. Corrigido: `_printRefracaoDump` no painel imprime UMA LINHA POR CAMPO (`console.log` por item não tem esse limite), com cabeçalho de contagem e marca `FIM` para denunciar corte. O registro por campo agora traz `ctx` (texto do MESMO container que `_detectDynamicFields` lê — vazio ⇒ o campo morre na porta de entrada, antes da heurística de rótulo), `narrow` (rótulo visível ao seletor estreito de `_refractionBlockOf` — null com `labs` cheio ⇒ o rótulo existe mas está num `b`/`strong`/`label` que o seletor não alcança), `vis` (offsetParent), e linha/coluna da tabela. Testes `[EST-DUMP-1..8]`.

**Armadilha ao pedir o dump:** recarregar a extensão NÃO re-injeta `content.js` numa aba já aberta (só `selectShospTab` faz `executeScript`, e `dumpRefracaoBlocks` não passa por ele). Content script velho devolve o formato antigo e o formatter imprime `vis=0 ctx=- narrow=-` em todos os campos — indistinguível de "seção estática não montada". `_printRefracaoDump` detecta (`!('ctx' in lista[0])`) e manda dar F5. Ordem correta: recarregar extensão → **F5 na aba do SHOSP** → abrir prontuário na aba Refração → `dumpRefracaoBlocks()`.

**Pista do dump truncado (não é conclusão):** os campos `prontuario_resp_78074_*` tinham como rótulos ancestrais só nomes de seção (ACUIDADE VISUAL, REFRACAO DINAMICA, MULTIFOCAL, BIFOCAL, PERTO, REFRACAO ESTATICA, OBSERVAÇÕES) — nenhum "Esférico"/"O.D." como os campos de receita têm. Se isso se confirmar com `ctx` vazio, a estática nunca foi barrada pela heurística de rótulo: ela nem chega lá, porque `text.includes('esf'|'cil'|'eixo')` falha no container. A dinâmica "funciona" só por FALLBACK_IDS fixos.

## ✅ RESOLVIDO 2026-07-30 — IDs lidos da página, injeção testada e aprovada

Inspeção direta do DOM (prontuário aberto na aba Refração, via browser MCP). Raiz do bloco: `#divCategoriaProntuarioAtendimento-78074`. Ordem no documento:

```
REFRACAO ESTATICA → OD [ESF 259536 | CIL 259542 | EIXO 259540 | AV 259533]
                  → OE [ESF 259544 | CIL 259543 | EIXO 259534 | AV 259535]
```

Todos com prefixo `prontuario_resp_78074_`. **Não são sequenciais e não seguem a ordem visual** — a extrapolação tentadora (259530-259535, "os 6 seguintes") teria acertado campos de AV. Fixados em FALLBACK_IDS; testes `[EST-ID-1..3]`.

**Teste real na plataforma (ficha de teste, autorizado):** os 6 campos receberam valores distintos (-1.11/-2.22/33 e -4.44/-5.55/66), cada um caiu no seu campo, confirmado por screenshot; AV e o bloco DINÂMICO ficaram intactos; tudo restaurado para vazio em seguida. A mecânica de `setInputValue` funciona nesses inputs.

**Causa raiz final (medida, não inferida):** `input.closest('.form-group, td, tr') || parentElement` devolve um `<div>` **sem texto nenhum** — `containerText` vazio. Logo o gate `text.includes('esf'|'cil'|'eixo')` de `_detectDynamicFields` nunca passa e NENHUM campo deste serviço é classificado. A heurística de rótulo (`_refractionBlockOf`) nunca chegou a ser consultada; a dinâmica sempre funcionou 100% por FALLBACK_IDS. O layout é em divs, não em tabela — os rótulos visíveis (ESF/CIL/EIXO/OD/OE) são nós de texto soltos, invisíveis ao seletor `legend, caption, th, h3…`.

**Hazard de sobrescrita: DESCARTADO** (era o item 3 do "para fechar"). Como nada é classificado, a estática nunca sobrescreveu a dinâmica. Mesmo assim foi adicionada a guarda simétrica `STATIC_REFRACTION_IDS` — a propriedade que nos salva é da marcação do SHOSP, não uma decisão nossa, e a falha seria silenciosa e clinicamente grave.

**Caminho de recuperação se a clínica recriar o formulário:** os cabeçalhos de bloco são inputs OCULTOS cujo `value` é o próprio rótulo (`259538="REFRACAO ESTATICA"`, `259539="OD"`, `259541="OE"`). Achar o oculto com value "REFRACAO ESTATICA" e pegar os inputs seguintes em ordem de documento reconstrói o mapeamento — é estrutura declarada pelo SHOSP, não heurística de texto.

**Histórico (o que travava antes):** a próxima captura estática que falhasse já imprimiria os IDs. Conferir 3 coisas nessa ordem: (1) 259522–528 são mesmo a dinâmica; (2) existe 2º grupo de 6 e algum rótulo ancestral contém "estát" (isto é, `_refractionBlockOf` tinha chance); (3) **hazard latente** — `_detectDynamicFields` itera em ordem de DOM e faz `cache.set('refracao.od.esf', …)` em todo match não-receita, então se a estática também classificar como `'refracao'` e vier depois no DOM, ela SOBRESCREVE o mapeamento dinâmico pré-semeado → o OCR normal estaria gravando grau não-dilatado no bloco estática. Confirmar ou descartar explicitamente; "a dinâmica funciona" não prova que está limpo. Depois pinar os 6 IDs. Ver [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md).

---

Related: [speech-log-truncado-120](speech-log-truncado-120.md) · [dilatacao-contaminacao-fase2](dilatacao-contaminacao-fase2.md) · [Agente de exames (OCR Gemini)](../agentes/gemini-exam-agent.md) · [Content script (injeção no SHOSP)](../modulos/content-script.md) · [Gatilhos e injeção (skill)](../skills/gatilhos-injecao-oftalmologia.md) · [Fila de dilatação (sala de espera)](../modulos/dilatacao-pausas.md) · [log-2026-07-29-ocr-verify-incoerente](log-2026-07-29-ocr-verify-incoerente.md) · [log-2026-07-31-pendencias](log-2026-07-31-pendencias.md)

Up: [Memórias](INDEX.md)
