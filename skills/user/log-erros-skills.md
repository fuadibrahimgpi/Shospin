# Log Central de Erros de Skills

Registro cross-skill de erros para visualizar padrões entre skills diferentes ao longo do tempo.

---

## 2026-05-21 — ocr-topcon-oftalmologia — T3+T7 — Nº 1

- **Erro**: 1ª leitura OCR alucinou ESF do OE (-0.75) com S.E. coerente (-1.00). Verify externo retornou -0.00 (correto). Política downgradeava mismatch para aviso por "math-consistency" interna. Valor alucinado foi injetado no prontuário.
- **Ponto**: `_compareRefractionAgainstVerify` + caller em `src/geminiService.js`. Ramo Esfera retornava `severity: 'soft'`, e caller convertia para aviso quando 1ª leitura passava em `_isEyeMathConsistent`.
- **Causa raiz**: heurística media coerência interna da 1ª leitura — exatamente o sinal que o prior de auto-coerência do modelo imita melhor durante alucinação. Confundiu coerência com verdade externa.
- **Nível**: 2 — Revisão Estrutural (regressão da lição anterior em direção oposta).
- **Correção**: discordância de ESFERA agora é sempre `hard`. Math-consistency exception restrita a CIL/EIXO.
- **Princípio generalizável (cross-skill)**: para campos clinicamente críticos (grau, dose, lateralidade, diagnóstico principal), **coerência interna da 1ª leitura não vale como contra-evidência contra discordância de verificação externa**. Aplica-se a qualquer skill com double-call check.
