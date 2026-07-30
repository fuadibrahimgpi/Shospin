---
name: fundoscopia-oftalmologia
description: "Descreve o campo fundoscopia (segmento posterior / fundo de olho) em consultas oftalmológicas a partir de transcrições. Use quando o médico examina e descreve ao paciente qualquer achado de segmento posterior — nevo de coroide, retinopatia diabética ou hipertensiva, alteração macular, escavação aumentada suspeita de glaucoma, membrana epirretiniana, descolamento de retina, hemorragia vítrea, oclusão vascular, buraco macular — ou quando o fundo está normal e é preciso decidir entre o template dos dois olhos (injectExamesNormais) e escrever achado por olho. Também use para resolver lateralidade (OD/OE/AO), evitar bilateralizar achado unilateral por natureza, e para o uso correto de 'escavação simétrica' (só AO) vs 'escavação fisiológica' (linha de um olho)."
metadata:
  author: fuad-ibrahim
  version: "1.0"
  domain: oftalmologia
---

# Fundoscopia Oftalmológica (segmento posterior)

## Quando usar esta skill

Use esta skill quando precisar preencher, revisar ou corrigir o campo `fundoscopia` (fundo de olho / mapeamento de retina) em registros oftalmológicos derivados de:

- Transcrições de consulta médica.
- Saídas JSON de extração de prontuário (`dados.fundoscopia`).
- Revisões de casos em que o fundo foi bilateralizado, fabricado ou com lateralidade errada.
- Casos com achado de segmento posterior descrito ao paciente, ou fundo normal a ser injetado.

Esta skill é focada apenas em `fundoscopia`. Ela pode ser usada dentro da skill maior `transcricao-consulta-oftalmologia`, mas deve funcionar de forma autônoma. É **simétrica** à skill `biomicroscopia-oftalmologia` (segmento anterior): as duas seguem a mesma lógica normal-vs-alterado e de lateralidade.

## Onde isso REALMENTE roda (autoridade)

> ⚠️ **A cópia que executa em produção é o prompt do Gemini em
> `src/gemini-interview-agent.js` (seção `fundoscopia`, hoje ~L856-897).**
> Esta skill é o espelho legível dessas regras — editá-la NÃO muda o comportamento
> da extensão. Ao mudar uma regra, altere o prompt e esta skill juntos, para não
> divergirem. A injeção final é feita por `scripts/sidepanel-injection.js`; o
> template normal `FUNDOSCOPIA_NORMAL` só entra quando o médico mencionou "fundo"
> e nada foi descrito.

## Objetivo

Produzir a descrição do segmento posterior que reflete **exclusivamente o que o médico observou no exame atual**, com lateralidade correta, sem inventar achado no olho são.

Se o fundo é normal nos dois olhos → `dados.fundoscopia: null` (o sistema injeta `FUNDOSCOPIA_NORMAL` quando o médico mencionou "fundo").

## Princípios críticos

1. **Fonte é o exame do médico**, não o relato do paciente nem o histórico.
2. **Normal nos dois olhos → não escrever texto por olho**; deixar `injectExamesNormais=true` cuidar do template `AO`.
3. **Achado em um olho → descrever o olho afetado em detalhe E o contralateral como `fundo sem alterações`.**
4. **Nunca `AO` em achado unilateral por natureza** (descolamento, hemorragia vítrea, nevo, membrana epirretiniana, oclusão vascular, buraco macular).
5. **Lateralidade sai de TODA a consulta** (queixa/HDA + fala do exame).
6. **`escavação simétrica` é comparação entre olhos** — só na forma `AO`; em linha de um olho, `escavação fisiológica`.

## Decisão central — normal vs. alterado

### Fundo normal nos DOIS olhos
- Não preencher `dados.fundoscopia` → deixar `null`.
- O sistema injeta o template padrão via `injectExamesNormais=true` **se o médico mencionou "fundo"/"fundoscopia"**:
  `FUNDOSCOPIA INDIRETA: AO retina aplicada, mácula em bom aspecto, sem alteração do padrão vascular, escavação simétrica e fisiológica`

### Achado em UM olho (o caso principal desta skill)
- `injectExamesNormais = false`. **Regra de flag:** qualquer achado de fundo obriga a flag a `false`; o texto por olho (achado + contralateral normal) vai **inteiro** em `dados.fundoscopia` e prevalece sobre o template. Nunca deixe `injectExamesNormais=true` junto com `dados.fundoscopia` preenchida.
- Escrever header `FUNDOSCOPIA INDIRETA:` seguido de **uma linha por olho**, separadas por `\n`:
  - Olho afetado: `OD:`/`OE:` + achado detalhado + elementos normais não afetados.
  - Olho contralateral: `OE:`/`OD: fundo sem alterações, ...` (descritor normal completo, liderado por **`fundo sem alterações`**).

### Achado REALMENTE bilateral
- Linha única `AO:` — só quando o achado é dos dois olhos e assim descrito (retinopatia diabética/hipertensiva, papiledema, escavação aumentada simétrica).

## Consistência diagnóstico ↔ exame (regra crítica)

Se o `diagnostico` registra um achado de **segmento posterior como ATUAL** (retinopatia, descolamento, DMRI, membrana epirretiniana, buraco macular, nevo de coroide, oclusão vascular, glaucoma/escavação aumentada), a fundoscopia não pode afirmar `retina aplicada, escavação simétrica e fisiológica` nos dois olhos. Vale a mesma lógica da biomicroscopia — ver `biomicroscopia-oftalmologia`.

> 🛡️ **Rede de segurança no runtime (2026-07-29):** `temAchadoPosteriorNoDiagnostico()` em `scripts/sidepanel-constants.js` suprime o template `FUNDOSCOPIA_NORMAL` quando o diagnóstico afirma achado de fundo — campo **vazio** em vez de normal fabricado. A rede não compõe a descrição; descrever é trabalho desta skill.

## Lateralidade (regra crítica — nunca bilateralizar unilateral)

A lateralidade sai de **toda a consulta** (queixa/HDA + fala do exame).

**Achados unilaterais por natureza (nunca `AO`):** descolamento de retina, hemorragia vítrea, nevo de coroide, membrana epirretiniana, oclusão vascular (arterial/venosa), buraco macular.

| Situação | O que fazer |
|---|---|
| Achado bilateral real (retinopatia diabética/hipertensiva, papiledema, escavação aumentada simétrica) | Linha única `AO:` com `escavação simétrica e fisiológica`. |
| Achado unilateral, lado identificável | Linha do olho afetado (`OD:`/`OE:`) + linha do contralateral como `fundo sem alterações`. **Nunca `AO:`**. |
| Lado impossível de determinar | Prefixar `[CONFIRMAR OLHO AFETADO] `, descrever **só** o olho afetado, **sem** linha do contralateral. |

> Descrever `AO` num achado unilateral inventa a lesão no olho são — mesma classe de erro do log 2026-07-27 (abrasão), agora no fundo. Um descolamento fabricado no olho bom é pior que a abrasão que originou aquela regra.

### Glaucoma NÃO entra na lista de "unilaterais por natureza"
A escavação aumentada costuma ser **bilateral**:
- Simétrica nos dois olhos → `AO` (`escavação aumentada e simétrica`).
- Só um olho com escavação suspeita → por olho (a escavação **é** o achado; a linha do olho afetado descreve a escavação e **omite** o termo `escavação fisiológica`).

## "Escavação simétrica" vs "escavação fisiológica"

> ⚠️ **`escavação simétrica` é uma comparação ENTRE os olhos** — só faz sentido na forma `AO` (ambos normais/simétricos). Numa linha de **um** olho, use `escavação fisiológica` (sem "simétrica"). No olho cuja escavação **é** o achado (glaucoma), a escavação não é normal — descreva-a e não escreva `fisiológica`.

## Formato de saída

**Unilateral** — header + uma linha por olho (`\n`):
```
FUNDOSCOPIA INDIRETA:
OD: [achado]; retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica
OE: fundo sem alterações, retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica
```

**Bilateral** — linha única `AO`:
```
FUNDOSCOPIA INDIRETA: AO [achado]; retina aplicada, escavação simétrica e fisiológica
```

Quando usada isoladamente, retorne:
```json
{
  "fundoscopia": "string ou null",
  "injectExamesNormais": false
}
```
Quando usada dentro da skill maior, preencha apenas `dados.fundoscopia` e ajuste a flag, preservando os demais campos do esquema.

## Exemplos de referência

```text
Nevo OE (unilateral por natureza):
"FUNDOSCOPIA INDIRETA:
OD: fundo sem alterações, retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica
OE: nevo de coroide inferotemporal, estável, sem sinais de atividade; retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica"

Glaucoma OD com escavação aumentada (unilateral):
"FUNDOSCOPIA INDIRETA:
OD: escavação aumentada (relação E/D ~0,7), suspeita de glaucoma — aguardar campo visual e OCT de nervo óptico; retina aplicada, mácula em bom aspecto, padrão vascular preservado
OE: fundo sem alterações, retina aplicada, mácula em bom aspecto, padrão vascular preservado, escavação fisiológica"

Retinopatia diabética (bilateral real):
"FUNDOSCOPIA INDIRETA: AO sinais de retinopatia diabética leve (microaneurismas), sem edema macular aparente; retina aplicada, escavação simétrica e fisiológica"

Glaucoma bilateral simétrico (AO):
"FUNDOSCOPIA INDIRETA: AO escavação aumentada e simétrica (relação E/D ~0,7), suspeita de glaucoma — aguardar campo visual e OCT de nervo óptico; retina aplicada, mácula em bom aspecto, padrão vascular preservado"
```

## Lista de checagem final

Antes de finalizar a fundoscopia, confirme:

- O texto descreve o exame do MÉDICO, não relato do paciente nem histórico.
- Fundo normal nos dois olhos → `null` (o sistema injeta `FUNDOSCOPIA_NORMAL` se o médico mencionou "fundo").
- Achado em um olho → `injectExamesNormais=false`, olho afetado detalhado + contralateral `fundo sem alterações`.
- Nenhum achado unilateral por natureza foi descrito como `AO`.
- Glaucoma: simétrico → `AO`; assimétrico → por olho (não está na lista de "unilaterais por natureza").
- `escavação simétrica` só em linha `AO`; `escavação fisiológica` em linha de um olho.
- Lado veio de TODA a consulta; lado indeterminável → `[CONFIRMAR OLHO AFETADO]`, sem linha do contralateral.

## Histórico de erros cobertos

### 2026-07-28 — Fundoscopia sem regras de lateralidade (assimetria com a biomicroscopia)
- **Erro**: a fundoscopia tinha só o formato `OD sem alterações / OE achado` em linha única — sem regra de `AO`-proibido para achado unilateral, sem descritor normal completo do olho contralateral, sem escape de lado indeterminável. Dependia 100% do LLM não bilateralizar um descolamento/nevo/glaucoma.
- **Correção**: seção reescrita simétrica à biomicroscopia (prompt + skill): formato por olho (`OD:`/`OE:` em linhas separadas), contralateral como `fundo sem alterações`, `AO` proibido em achado posterior unilateral por natureza, `escavação fisiológica` (não "simétrica") em linha de um olho, e regra de flag `injectExamesNormais=false` quando há achado. Glaucoma mantido fora da lista de "unilaterais por natureza" (costuma ser bilateral).
