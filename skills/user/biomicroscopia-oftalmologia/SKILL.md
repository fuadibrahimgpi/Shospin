---
name: biomicroscopia-oftalmologia
description: "Descreve o campo biomicroscopia (segmento anterior / lâmpada de fenda) em consultas oftalmológicas a partir de transcrições. Use quando o médico examina e descreve ao paciente qualquer achado de segmento anterior — pterígio, pinguécula, conjuntivite, úlcera ou ceratite, leucoma, nevo conjuntival, hemorragia subconjuntival, blefarite — ou quando o exame está normal e é preciso decidir entre injetar o template dos dois olhos (injectExamesNormais) e escrever achado por olho. Também use para resolver lateralidade (OD/OE/AO), evitar bilateralizar achado unilateral por natureza (trauma, corpo estranho, abrasão), tratar paciente pseudofácico (LIO) e a lente dinâmica (catarata/LIO/opacidade de cápsula)."
metadata:
  author: fuad-ibrahim
  version: "1.0"
  domain: oftalmologia
---

# Biomicroscopia Oftalmológica (segmento anterior)

## Quando usar esta skill

Use esta skill quando precisar preencher, revisar ou corrigir o campo `biomicroscopia` (exame de segmento anterior / lâmpada de fenda) em registros oftalmológicos derivados de:

- Transcrições de consulta médica.
- Saídas JSON de extração de prontuário (`dados.biomicroscopia`).
- Revisões de casos em que o exame foi bilateralizado, fabricado ou com lateralidade errada.
- Casos com achado de segmento anterior descrito ao paciente, ou exame normal a ser injetado.

Esta skill é focada apenas em `biomicroscopia`. Ela pode ser usada dentro da skill maior `transcricao-consulta-oftalmologia`, mas deve funcionar de forma autônoma. A alocação simétrica do segmento POSTERIOR é responsabilidade da skill `fundoscopia-oftalmologia`.

## Onde isso REALMENTE roda (autoridade)

> ⚠️ **A cópia que executa em produção é o prompt do Gemini em
> `src/gemini-interview-agent.js` (`_buildConsultationPrompt`, bloco
> `- biomicroscopia:` dentro de `CAMPOS:`).** Regra geral: `skills/user/README.md`.
> Esta skill é o espelho legível dessas regras — editá-la NÃO muda o comportamento
> da extensão. Ao mudar uma regra, altere o prompt e esta skill juntos, para não
> divergirem. A injeção final é feita por `scripts/sidepanel-injection.js`
> (a lente dinâmica é aplicada por `getBiomicroscopiaComLente`).

## Objetivo

Produzir a descrição do segmento anterior que reflete **exclusivamente o que o médico observou no exame atual**, com lateralidade correta, sem inventar achado no olho são e sem contradizer antecedentes cirúrgicos.

Se não houver achado específico de segmento anterior → `dados.biomicroscopia: null` (o sistema usa o template normal automático ou o de blefarite, conforme as flags).

## Princípios críticos

1. **Fonte é o exame do médico, não o relato do paciente nem o histórico.**
2. **Normal nos dois olhos → não escrever texto por olho**; deixar `injectExamesNormais=true` cuidar do template `AO`.
3. **Achado em um olho → descrever o olho afetado em detalhe E o contralateral como `olho calmo`.**
4. **Nunca `AO` em achado unilateral por natureza** (trauma, corpo estranho, abrasão) — inventa lesão no olho são.
5. **Lateralidade sai de TODA a consulta** (queixa/HDA + fala do exame), não só da fala durante o exame.
6. **Pseudofácico** → nunca "catarata", nunca "cristalino transparente".
7. Sempre terminar cada linha com `cristalino transparente` — o runtime substitui pela lente correta.

## Fonte permitida (regra crítica de fonte)

`dados.biomicroscopia` descreve **apenas** o que o médico observou ao examinar **nesta** consulta.

❌ NUNCA inclua na biomicroscopia:
- Relato subjetivo do paciente ("meu olho ficou vermelho há dias", "ardia bastante") → isso é HDA.
- Achado histórico ("já tive uma úlcera", "operei catarata") → isso é antecedente.
- Diagnóstico ou hipótese não observada na lâmpada de fenda.

| Situação | Campo correto |
|---|---|
| Paciente: "meu olho ficou vermelho há 3 dias" | HDA |
| Médico examinando: "hemorragia subconjuntival OD presente" | `dados.biomicroscopia` |
| Paciente: "já operei catarata dos dois" | `antecedentes_oftalmologicos` |

## Decisão central — normal vs. alterado

### Exame normal nos DOIS olhos
- Não preencher `dados.biomicroscopia` → deixar `null`.
- O sistema injeta o template padrão via `injectExamesNormais=true`:
  `AO: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente`

### Achado em UM olho (o caso principal desta skill)
- `injectExamesNormais = false` (há patologia → não é "tudo normal"). **Regra de flag:** qualquer achado de segmento anterior obriga a flag a `false`, para o texto por olho ser preservado na injeção e não sobrescrito pelo template `AO`.
- Escrever **duas linhas**, uma por olho, separadas por `\n`:
  - Olho afetado: `OD:`/`OE:` + achado detalhado + elementos normais não afetados.
  - Olho contralateral: `OE:`/`OD: olho calmo, ...` (descritor normal completo, liderado por **`olho calmo`**).

### Achado REALMENTE bilateral
- Usar linha única `AO:` — só quando o achado é dos dois olhos e assim descrito (blefarite, conjuntivite bilateral, pterígio nos dois olhos).
- `AO` **não** é prefixo padrão; nunca é fallback.

## Consistência diagnóstico ↔ exame (regra crítica)

Se o `diagnostico` registra um achado **estrutural de segmento anterior como ATUAL** (pterígio, pinguécula, leucoma, ceratocone, úlcera, ceratite, conjuntivite, hordéolo, calázio, uveíte, hemorragia subconjuntival), então `biomicroscopia` **não pode ser null** e não pode descrever o olho afetado como normal. Um prontuário que diagnostica pterígio OD e descreve `AO: olho calmo` se contradiz.

- Isto **não afrouxa a regra de fonte** acima: relato do paciente e história continuam não virando achado de exame. A regra é *posterior* — depois de decidir que o achado é atual e digno de `diagnostico`, o exame precisa refleti-lo.
- Achado verbalizado **durante** o exame (médico na lâmpada de fenda: *"encosta o queixo"*, *"olha pra frente"*, *"pisca"*) conta como achado de exame mesmo que o STT embarale quem fala.
- Achado histórico/resolvido → marque no diagnóstico (` - resolvida`); aí não exige descrição no exame atual.
- ⛔ **A decisão certa é antes, no `diagnostico`.** Achado **episódico** que só o paciente relatou (hemorragia subconjuntival recorrente, terçol, olho vermelho que vai e vem, conjuntivite passada) **não entra** em `diagnostico` como atual — vai para `antecedentes_oftalmologicos` (e, se motivou a consulta, também a queixa/HDA). Se não entra lá, esta regra não o arrasta para cá. Só há diagnóstico atual se o **médico descreveu ter visto hoje**; declaração de normalidade do médico ("o olho está ótimo") desempata contra. Nunca use a consistência como justificativa para escrever no exame o que o médico não descreveu.

> 🛡️ **Rede de segurança no runtime (2026-07-29):** `temAchadoAnteriorNoDiagnostico()` em `scripts/sidepanel-constants.js` bloqueia a injeção do template normal quando o diagnóstico afirma achado anterior — o campo fica **vazio** para o médico redigir, em vez de receber `AO: olho calmo` contradizendo o prontuário. A rede **não compõe** a descrição por olho (isso seria inventar o detalhe); descrever bem continua sendo trabalho desta skill.

## Lateralidade (regra crítica — nunca bilateralizar unilateral)

A lateralidade sai de **toda a consulta**. Se o paciente disse na história que foi *"o olho direito"* (inseto, poeira, arranhão), a biomicroscopia é `OD:`, mesmo que o médico não repita o lado ao examinar.

**Achados unilaterais por natureza** — trauma, corpo estranho, inseto, arranhão / abrasão / erosão de córnea, ceratite ou úlcera traumática, hemorragia subconjuntival por trauma:

| Situação | O que fazer |
|---|---|
| Lado identificável (história **ou** exame) | `OD:` **ou** `OE:` com o achado + linha do contralateral como `olho calmo`. **Nunca `AO:`**. |
| Lado impossível de determinar em toda a consulta | Prefixar com `[CONFIRMAR OLHO AFETADO] `, descrever **só** o olho afetado, **sem** linha do contralateral. Não assumir `AO`. |

> `AO` nunca é "fallback seguro" para achado traumático — descrever nos dois olhos inventa lesão no olho são (origem: log 2026-07-27).

O mesmo vale para o `diagnostico`: `"H161 - Ceratite traumática OD"` — nunca `AO`; lado indeterminável → `"H161 - Ceratite traumática - confirmar olho"`. Sem parênteses no diagnóstico (regra do médico, 2026-10-29); usar " - ", nunca vírgula (o painel divide o campo por vírgula e buscaria "confirmar olho" como CID).

## Cristalino: decidir OLHO A OLHO antes de escrever a linha

**1) Olho fácico (nunca operado) — caso padrão:** terminar a linha com `cristalino transparente`.
Esse termo é um **placeholder**: o runtime o troca por `catarata ...` quando a catarata é detectada.

**2) Olho pseudofácico (já operado de catarata) — exceção obrigatória:**

- **NUNCA** escreva `cristalino transparente` — o cristalino foi removido na cirurgia (erro grave de prontuário; foi o que aconteceu no log 2026-08-03).
- **NUNCA** escreva "catarata" nesse olho — não há lente natural para opacificar.
- Escreva a lente **direto na linha daquele olho**:
  - cápsula limpa / médico diz que a lente está boa → `pseudofacia, LIO transparente e bem posicionada`
  - cápsula posterior opacificada → `pseudofacia, opacidade de cápsula posterior`

### Opacidade de cápsula em linguagem leiga (2026-08-05)

O médico não diz "opacidade de cápsula posterior" na frente do paciente — ele descreve **a lente embaçada, suja ou precisando de limpeza**. Todas estas falas **do médico** sobre a lente do olho pseudofácico são opacidade de cápsula:

- "a lente está (um pouco/um pouquinho) embaçada", "está embaçando", "embaçadinha"
- "tem uma sujeirinha na lente", "a lente está suja"
- "vai precisar fazer uma limpeza", "vamos dar uma limpada na lente", YAG, capsulotomia

**Intensidade não importa:** *"tá um pouquinho embaçada mas ainda não está atrapalhando"* **é** opacidade de cápsula. O "ainda não precisa limpar" é conduta, não muda o achado do exame.

Não confundir com:
- **queixa de visão** do paciente ("minha vista está embaçada") → sintoma, vai para a HDA;
- **histórico** do paciente ("já fiz a limpeza da lente", "fizeram o laser há 2 anos") → antecedente; a cápsula pode estar limpa hoje;
- médico afirmando lente **limpa/transparente** → forma limpa, mesmo com o paciente relatando embaçamento.

Evidências de que o olho é pseudofácico (qualquer uma basta): relato do paciente, **inclusive em 1ª pessoa** (`fiz a cirurgia de catarata`, `operei esse olho`, `fui operada de catarata`); confirmação do médico no exame (`a lente está boa/bem posicionada/limpa`, `a cirurgia ficou boa`); facectomia / LIO / pseudofacia / `Z96.1` nos antecedentes ou no diagnóstico.
Cirurgia apenas **planejada** (`vamos operar`, `está indicada a cirurgia`) **não** é pseudofacia — esse olho segue fácico.

| Situação do cristalino | O que escrever na linha daquele olho |
|---|---|
| Sem cirurgia prévia | `cristalino transparente` |
| Pós-facectomia (LIO implantada) | `pseudofacia, LIO transparente e bem posicionada` |
| Pós-facectomia + opacidade de cápsula | `pseudofacia, opacidade de cápsula posterior` |

**Lateralidade da lente:** a exceção vale só para o(s) olho(s) operado(s). Operou um olho só → a linha do outro continua com `cristalino transparente`. Nunca escrever pseudofacia em `AO` quando só um olho foi operado — inventa cirurgia no olho são.

## Lente dinâmica (o que o runtime faz com o placeholder)

`getBiomicroscopiaComLente` substitui `cristalino transparente` pela lente detectada por gatilho de voz, pelo diagnóstico (catarata) ou pela rede determinística de pseudofacia (`parsePseudofaciaFromDados`, que lê `antecedentes_oftalmologicos` + `diagnostico` + `biomicroscopia`):

| Condição detectada | Substitui "cristalino transparente" por |
|---|---|
| Opacidade de cápsula | `pseudofacia, opacidade de cápsula posterior` |
| LIO / pseudofacia | `pseudofacia, LIO transparente e bem posicionada` |
| Catarata | `catarata` (+ grau, quando dito) |
| (nenhuma) | mantém `cristalino transparente` |

Prioridade: **opacidade > LIO > catarata > padrão**. Dois limites importantes:

- **Texto misto** — se o texto já afirma `pseudofacia`/`LIO` em alguma linha, o runtime **não** converte os placeholders restantes em LIO: eles são do olho fácico.
- **Cápsula opacificada sobre lente já escrita** (2026-08-05) — quando a opacidade foi detectada e o texto já traz `pseudofacia, LIO transparente e bem posicionada`, o runtime **atualiza essa linha** para `opacidade de cápsula posterior`. Aqui não há risco de inventar cirurgia: a linha já afirma pseudofacia; o que muda é o estado da cápsula. (Antes o texto voltava intacto e o prontuário contradizia a fala do médico.)
- **Lado** — quando o lado pseudofácico é conhecido (`SessionFlags.lioLado = OD/OE`), a substituição ocorre só na linha daquele olho; com lado unilateral e texto em `AO`, o placeholder é preservado e o runtime emite um `console.warn` para o médico redigir.

O runtime é a rede de segurança, não a decisão principal: a lente correta é responsabilidade do texto que a IA escreve.

## Blefarite + outro achado de segmento anterior

- Blefarite pura → **não** preencher `dados.biomicroscopia`; usar `injectBlefarite=true` (o sistema aplica o template de blefarite).
- Blefarite **+ outro** achado anterior (ex.: pterígio) → preencher `dados.biomicroscopia` com o texto combinado. Os dois coexistem: a flag dispara o tratamento automático de blefarite; o campo garante que o achado apareça na descrição.

## Formato de saída

```
[OD/OE/AO]: [achado]; [elementos normais não afetados: córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente]
```
- Achado unilateral → incluir linha do contralateral como `olho calmo`, separada por `\n`.
- **Ordem dos olhos (regra do médico, 2026-09-04): OD SEMPRE antes de OE.** Vale a ordem
  do prontuário (direito → esquerdo), nunca a ordem em que os olhos apareceram na fala —
  mesmo quando o achado é do OE e o OE foi o assunto da consulta.
  ✅ `OD: olho calmo, ...\nOE: pterígio nasal grau I, ...`
  ❌ `OE: pterígio nasal grau I, ...\nOD: olho calmo, ...`
  O runtime reordena as duas linhas (`_ordenaOlhosODPrimeiro`, `src/DecisionEngine.js`),
  mas a saída já deve nascer certa — a rede determinística é a segunda barreira, não a
  primeira.
- Quando usada isoladamente, retorne:
```json
{
  "biomicroscopia": "string ou null",
  "injectExamesNormais": false,
  "injectBlefarite": false
}
```
- Quando usada dentro da skill maior, preencha apenas `dados.biomicroscopia` e ajuste as flags, preservando os demais campos do esquema.

## Exemplos de referência

> ⛔ A linha de blefarite ("hiperemia e espessamento da margem palpebral, telangiectasias
> e disfunção de glândulas de meibômio") aparece nos exemplos de blefarite abaixo, mas
> **não é frase de rotina** (2026-08-04): só escreva quando o médico descreveu inflamação
> na pálpebra. Higiene palpebral, shampoo ou compressa prescritos são tratamento, não
> exame — nesse caso a biomicroscopia fica em branco para o médico redigir.
>
> ⛔ **"com secreção espessa" não faz parte dessa linha** (2026-08-04): secreção espessa é
> achado à parte (meibum expressível), escrito só quando o médico falou de secreção ou de
> glândula entupida. O template injetado (`BIOMICROSCOPIA_BLEFARITE`) deixou de trazê-la.

```text
Pterígio OD (unilateral):
"OD: pterígio nasal grau I, sem invasão de eixo visual; córnea transparente nas demais regiões, câmara anterior formada, pupila regular e reagente, cristalino transparente
OE: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

Conjuntivite alérgica AO (bilateral real):
"AO: hiperemia conjuntival difusa com secreção serosa, papilas tarsais, presença de folículos em fundo de saco conjuntival; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

Conjuntivite com diagnóstico ATUAL (regra do médico, 2026-10-29): o olho citado na consulta sempre leva "presença de folículos em fundo de saco conjuntival" na biomicroscopia. Contralateral não citado → "olho calmo".

Abrasão por corpo estranho, lado só na história (unilateral por natureza):
"OD: erosão corneana paracentral inferior, teste de fluoresceína positivo; câmara anterior formada, pupila regular e reagente, cristalino transparente
OE: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

Pseudofacia bilateral, sem outro achado de segmento anterior:
"AO: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, pseudofacia, LIO transparente e bem posicionada"

Pseudofacia OD, OE ainda fácico:
"OD: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, pseudofacia, LIO transparente e bem posicionada
OE: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

Blefarite + pterígio OD:
"OD: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; pterígio nasal grau I; córnea transparente nas demais regiões, câmara anterior formada, pupila regular e reagente, cristalino transparente
OE: hiperemia e espessamento da margem palpebral, telangiectasias e disfunção de glândulas de meibômio; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

Pseudofácico com pterígio:
"AO: pterígio nasal; córnea transparente, câmara anterior formada, pupila regular e reagente, pseudofácico, LIO bem posicionada"
```

## Lista de checagem final

Antes de finalizar a biomicroscopia, confirme:

- O texto descreve o exame do MÉDICO, não relato do paciente nem histórico.
- Exame normal nos dois olhos → `null` + `injectExamesNormais=true` (não escrever `AO` à mão).
- Achado em um olho → `injectExamesNormais=false`, olho afetado detalhado + contralateral `olho calmo`.
- Nenhum achado unilateral por natureza foi descrito como `AO`.
- Lado veio de TODA a consulta (queixa/HDA + exame), não só do exame.
- Lado indeterminável → `[CONFIRMAR OLHO AFETADO]`, sem linha do contralateral.
- Paciente pseudofácico → sem "catarata" e sem "cristalino transparente".
- Cada linha termina com `cristalino transparente` (o runtime troca a lente).

## Histórico de erros cobertos

### 2026-06-18 — Fonte errada (relato do paciente virou exame)
- **Erro**: hemorragia subconjuntival relatada pelo paciente como histórico ("olho ficou vermelho há dias") foi incluída na biomicroscopia.
- **Correção**: regra de fonte explícita — `dados.biomicroscopia` = apenas observações do médico no exame atual; relato do paciente vai na HDA.

### 2026-06-24 — Fonte errada (paciente pseudofácico)
- **Erro**: paciente relatou "catarata os dois, as duas cirurgias" na anamnese → modelo escreveu "catarata"/"cristalino transparente" na biomicroscopia como achado atual.
- **Correção**: pós-facectomia → "catarata" e "cristalino transparente" proibidos; obrigatório `pseudofácico, LIO bem posicionada`. Menção de catarata na transcrição vai para `antecedentes_oftalmologicos`.

### 2026-07-29 — Exame normal afirmado contra o próprio diagnóstico ⭐
- **Erro**: consulta com `H111 - Pterígio OD` no diagnóstico (código errado na época — pterígio é **H11.0**, corrigido em 2026-08-27) saiu com `biomicroscopia: null`; o fallback de despedida injetou `AO: olho calmo, córnea transparente...` — o prontuário afirmou exame normal logo abaixo do diagnóstico de pterígio.
- **Causa (dupla)**: (1) o modelo atribuiu o pterígio à fala do paciente e aplicou a regra de fonte, deixando o campo null — mas aceitou o mesmo achado como `diagnostico`, saída internamente inconsistente; (2) no runtime, o fallback de despedida só era barrado por `_temTratamentoAtivo` (tratamento ou encaminhamento), e essa consulta tinha apenas receita de óculos — passou direto.
- **Correção**: regra de consistência diagnóstico↔exame no prompt (sem tocar na regra de fonte) + rede determinística `temAchadoAnteriorNoDiagnostico()` aplicada a **todos** os pontos de default do injectAll. Política: campo vazio > texto fabricado. Testes `[DX-EXAME-1..9]` e `[DX-NORMAL-1..4]`.

### 2026-08-14 — Achado episódico da história virou diagnóstico e foi arrastado para o exame ⭐
- **Erro**: paciente em uso de anticoagulante relatou hemorragias subconjuntivais **recorrentes** ("de vez em quando eu tenho", "geralmente não percebo"); o médico apenas explicou o fenômeno e afirmou que o olho estava ótimo. Saiu `H113 - Hemorragia subconjuntival` no diagnóstico e a hemorragia **descrita na biomicroscopia** como achado de hoje.
- **Causa**: a regra de consistência diagnóstico↔exame funcionou corretamente sobre uma premissa errada — uma vez que H113 entrou no `diagnostico`, ela **obriga** o exame a refleti-lo. A regra de fonte estava na seção da biomicroscopia; a decisão real acontece antes, na seção `diagnostico`, e lá não havia porta de saída para achado episódico só relatado.
- **Correção**: regra crítica de **achado episódico** adicionada na seção `diagnostico` do prompt (`src/gemini-interview-agent.js`), com discriminador "o médico descreveu ter visto hoje?" + marcadores de recorrência + desempate por declaração de normalidade; rota correta = `antecedentes_oftalmologicos` (+ HDA se motivou a consulta). A regra de consistência **não foi afrouxada** — ganhou apenas um ponteiro para a decisão anterior.

### 2026-07-27 — Lateralidade (bilateralização de achado unilateral)
- **Erro**: abrasão corneana por corpo estranho (só o olho direito na história) injetada como `AO`, descrevendo lesão no olho são; diagnóstico sem lado.
- **Correção**: lado sai de toda a consulta; `AO` PROIBIDO em achado unilateral por natureza; lado indeterminável → `[CONFIRMAR OLHO AFETADO]` / ` - confirmar olho` no diagnóstico, nunca `AO`.
