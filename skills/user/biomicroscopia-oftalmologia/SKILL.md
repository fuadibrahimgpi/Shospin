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
> `src/gemini-interview-agent.js` (seção `biomicroscopia`, hoje ~L816-854).**
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
- Achado histórico/resolvido → marque no diagnóstico (`(resolvida)`); aí não exige descrição no exame atual.

> 🛡️ **Rede de segurança no runtime (2026-07-29):** `temAchadoAnteriorNoDiagnostico()` em `scripts/sidepanel-constants.js` bloqueia a injeção do template normal quando o diagnóstico afirma achado anterior — o campo fica **vazio** para o médico redigir, em vez de receber `AO: olho calmo` contradizendo o prontuário. A rede **não compõe** a descrição por olho (isso seria inventar o detalhe); descrever bem continua sendo trabalho desta skill.

## Lateralidade (regra crítica — nunca bilateralizar unilateral)

A lateralidade sai de **toda a consulta**. Se o paciente disse na história que foi *"o olho direito"* (inseto, poeira, arranhão), a biomicroscopia é `OD:`, mesmo que o médico não repita o lado ao examinar.

**Achados unilaterais por natureza** — trauma, corpo estranho, inseto, arranhão / abrasão / erosão de córnea, ceratite ou úlcera traumática, hemorragia subconjuntival por trauma:

| Situação | O que fazer |
|---|---|
| Lado identificável (história **ou** exame) | `OD:` **ou** `OE:` com o achado + linha do contralateral como `olho calmo`. **Nunca `AO:`**. |
| Lado impossível de determinar em toda a consulta | Prefixar com `[CONFIRMAR OLHO AFETADO] `, descrever **só** o olho afetado, **sem** linha do contralateral. Não assumir `AO`. |

> `AO` nunca é "fallback seguro" para achado traumático — descrever nos dois olhos inventa lesão no olho são (origem: log 2026-07-27).

O mesmo vale para o `diagnostico`: `"H161 - Ceratite traumática OD"` — nunca `AO`; lado indeterminável → `"H161 - Ceratite traumática (confirmar olho)"`.

## Paciente pseudofácico (pós-facectomia)

Quando `antecedentes_oftalmologicos` contém **facectomia / cirurgia de catarata / facoemulsificação**:

- **NUNCA** escreva "catarata" na biomicroscopia — a lente natural foi removida.
- **NUNCA** escreva "cristalino transparente" — o cristalino natural não existe mais.
- Substitua por `pseudofácico, LIO bem posicionada` (ou `pseudofácico, opacidade de cápsula posterior` quando houver opacidade).

| Situação do cristalino | O que escrever |
|---|---|
| Sem cirurgia prévia | `cristalino transparente` |
| Pós-facectomia (LIO implantada) | `pseudofácico, LIO bem posicionada` |
| Pós-facectomia + opacidade de cápsula | `pseudofácico, opacidade de cápsula posterior` |

## Lente dinâmica (o runtime substitui — sempre termine com "cristalino transparente")

Sempre finalize cada linha com **`cristalino transparente`**. O código (`getBiomicroscopiaComLente`) substitui automaticamente esse termo pela lente correta quando um gatilho de voz ou o diagnóstico detecta o estado do cristalino, com esta prioridade:

| Condição detectada | Substitui "cristalino transparente" por |
|---|---|
| Opacidade de cápsula | `pseudofacia, opacidade de cápsula posterior` |
| LIO / pseudofacia | `pseudofacia, LIO transparente e bem posicionada` |
| Catarata | `catarata` |
| (nenhuma) | mantém `cristalino transparente` |

Prioridade: **opacidade > LIO > catarata > padrão**. Por isso o texto escrito pela IA sempre traz `cristalino transparente` no fim — a decisão da lente é do runtime.

## Blefarite + outro achado de segmento anterior

- Blefarite pura → **não** preencher `dados.biomicroscopia`; usar `injectBlefarite=true` (o sistema aplica o template de blefarite).
- Blefarite **+ outro** achado anterior (ex.: pterígio) → preencher `dados.biomicroscopia` com o texto combinado. Os dois coexistem: a flag dispara o tratamento automático de blefarite; o campo garante que o achado apareça na descrição.

## Formato de saída

```
[OD/OE/AO]: [achado]; [elementos normais não afetados: córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente]
```
- Achado unilateral → incluir linha do contralateral como `olho calmo`, separada por `\n`.
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

```text
Pterígio OD (unilateral):
"OD: pterígio nasal grau I, sem invasão de eixo visual; córnea transparente nas demais regiões, câmara anterior formada, pupila regular e reagente, cristalino transparente
OE: olho calmo, córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

Conjuntivite alérgica AO (bilateral real):
"AO: hiperemia conjuntival difusa com secreção serosa, papilas tarsais; córnea transparente, câmara anterior formada, pupila regular e reagente, cristalino transparente"

Abrasão por corpo estranho, lado só na história (unilateral por natureza):
"OD: erosão corneana paracentral inferior, teste de fluoresceína positivo; câmara anterior formada, pupila regular e reagente, cristalino transparente
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
- **Erro**: consulta com `H111 - Pterígio OD` no diagnóstico saiu com `biomicroscopia: null`; o fallback de despedida injetou `AO: olho calmo, córnea transparente...` — o prontuário afirmou exame normal logo abaixo do diagnóstico de pterígio.
- **Causa (dupla)**: (1) o modelo atribuiu o pterígio à fala do paciente e aplicou a regra de fonte, deixando o campo null — mas aceitou o mesmo achado como `diagnostico`, saída internamente inconsistente; (2) no runtime, o fallback de despedida só era barrado por `_temTratamentoAtivo` (tratamento ou encaminhamento), e essa consulta tinha apenas receita de óculos — passou direto.
- **Correção**: regra de consistência diagnóstico↔exame no prompt (sem tocar na regra de fonte) + rede determinística `temAchadoAnteriorNoDiagnostico()` aplicada a **todos** os pontos de default do injectAll. Política: campo vazio > texto fabricado. Testes `[DX-EXAME-1..9]` e `[DX-NORMAL-1..4]`.

### 2026-07-27 — Lateralidade (bilateralização de achado unilateral)
- **Erro**: abrasão corneana por corpo estranho (só o olho direito na história) injetada como `AO`, descrevendo lesão no olho são; diagnóstico sem lado.
- **Correção**: lado sai de toda a consulta; `AO` PROIBIDO em achado unilateral por natureza; lado indeterminável → `[CONFIRMAR OLHO AFETADO]` / `(confirmar olho)`, nunca `AO`.
