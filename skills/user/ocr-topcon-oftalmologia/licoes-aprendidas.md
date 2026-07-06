# Lições Aprendidas — Extração de Refração TOPCON

Este arquivo é consultado **antes de cada extração de refração**. Cada lição vem de um ou mais erros reais registrados em `feedback-refracao.jsonl` e consolidados manualmente.

Formato de cada lição:

- **Regra**: o que fazer ou evitar.
- **Origem**: quantas correções sustentam a regra e datas.
- **Como aplicar**: gatilho concreto que ativa a regra durante a extração.

---

### Verificação independente ruidosa em ticket internamente consistente (escopo restrito a CIL/EIXO)

- **Regra**: quando a 1ª leitura tem `esf`, `cil` e `se` todos preenchidos e satisfazem `|esf + cil/2 − se| ≤ 0.15D`, isso é evidência **parcial** de leitura correta. Discordâncias da 2ª chamada (verify) **sobre CILINDRO ou EIXO** nesse olho podem ser tratadas como aviso, não bloqueio. **Discordâncias de ESFERA NUNCA caem nessa exceção** — ver lição "Alucinação math-consistent em esfera".
- **Origem**: 4 capturas em 2026-05-20 (19:27–19:28) bloqueadas indevidamente. Em 3 delas, OE 1ª pass leu `+1.00/-1.00/74/se+0.50` com math exato; verify alternava cil=-1↔-0.25.
- **Como aplicar**: sempre **bloquear** discordâncias `hard` (null vs valor significativo, olho ausente, **qualquer mismatch de esfera**). Para discordâncias `soft` (cil/eixo numéricos), só bloquear se o olho da 1ª leitura **não** for matematicamente consistente. Implementado em `_compareRefractionAgainstVerify` + caller (severidade `hard`/`soft`).

### Alucinação math-consistent em esfera

- **Regra**: discordância de ESFERA entre 1ª leitura e verify é **sempre bloqueio** (`hard`), **independente de math-consistency** da 1ª leitura. O modelo, quando alucina S, também alucina S.E. coerente — o prior de auto-coerência interna imita exatamente o sinal que distinguiria verdade. Só o verify externo separa verdade de coerência fabricada.
- **Origem**: 1 captura em 2026-05-21 11:27. OE real: S=0.00, C=-0.75, SE=-0.50. 1ª leitura alucinou S=-0.75, C=-0.75, SE=-1.00 (math: -0.75 + -0.375 = -1.125 ≈ -1.00 ✓). Verify retornou S=-0.00 (correto). Política antiga downgrade-aviou porque math-consistent. Resultado foi injetado no prontuário com valor alucinado.
- **Como aplicar**: na função `_compareRefractionAgainstVerify`, o ramo de Esfera retorna `severity: 'hard'` em qualquer mismatch >0.30D ou em verify-uninterpretable. Caller não tem chance de downgrade. Trade-off aceito: retries chatos < injeção silenciosa de grau errado de óculos.

### PLANO/PL impressos como +0.25 (alucinação em esfera zero)

- **Regra**: quando o TOPCON imprime literalmente "PLANO" ou "PL" na coluna S (esfera = 0.00), o modelo pode retornar "+0.25" em vez de "plano". Isso é **alucinação** — o modelo interpreta a palavra impressa como um valor dióptrico pequeno. A resposta correta é **sempre "plano"** quando a célula mostra "PLANO" ou "PL".
- **Origem**: 1 correção em 2026-05-25. OE real: S=0.00 (PLANO impresso). 1ª e 2ª chamadas concordaram em +0.25. Como ambas concordaram, `_compareRefractionAgainstVerify` não detectou discordância. S.E. também bateu (+0.25 = plano + 0 = +0.25, math-consistent). O erro passou silenciosamente e foi injetado no prontuário.
- **Como aplicar**: ao ler a coluna S, verificar se a célula contém uma palavra ("PLANO", "PL") em vez de número. Palavra na coluna S **sempre** significa 0.00 → retornar "plano". Nunca converter "PLANO" para um valor numérico, mesmo que os caracteres sejam borrados ou cortados.

### Sinal da esfera invertido pela verificação (flip + se calculado)

- **Regra**: quando 1ª e 2ª leituras discordam da esfera por **flip puro de sinal** (mesma magnitude, ex.: +1.00 vs -1.00), não confiar em nenhuma das duas: disparar **3ª chamada de desempate** focada APENAS no caractere de sinal (+ tem traço vertical e horizontal; − só horizontal) e na magnitude da coluna S da linha MÉDIA. Decisão por 2-de-3. A magnitude da 3ª deve bater com a da disputa (±0.25D), senão o desempate é descartado e o bloqueio original fica.
- **Origem**: 2 capturas consecutivas em 2026-06-12 (13:28:17 e 13:28:32) bloqueadas indevidamente. Verify leu OD "-1.00" onde o ticket imprimia "+1.00" e reportou se=-2.25/-2.12 — o valor **-2.12 não é passo de 0.25D**, é exatamente -1.00 + (-2.25/2) = -2.125: o verify **calculou** o se em vez de transcrevê-lo, fabricando coerência interna com o próprio erro de sinal.
- **Como aplicar**: implementado em `_tiebreakSphereSign` + flag `signFlip` em `_compareRefractionAgainstVerify` (geminiService.js v5.3.4). Prompts (principal e verify) ganharam aviso explícito de leitura do sinal e proibição de calcular o "se". Sinal de alerta diagnóstico: `se` reportado que não é passo de 0.125D do ticket, ou que coincide exatamente com s+c/2 da própria leitura discordante.
- **Não viola** a lição "Alucinação math-consistent em esfera": o desempate usa evidência **externa** (3ª leitura independente do caractere de sinal), não auto-coerência da 1ª.

### Média divergente de medições unânimes

- **Regra**: a média impressa de 3 medições idênticas é obrigatoriamente igual a elas. Se as 3 medições são unânimes (S, C ou A) e a "média" lida diverge, a média foi lida errado → usar o valor unânime das medições e avisar.
- **Origem**: captura de 2026-06-12 13:24:17 — medições OD c=-2.25 ×3, "média" c=-2.00. A tolerância antiga (`allClose ≤ 0.50D`) mantinha a média errada silenciosamente.
- **Como aplicar**: implementado em `_processEye` (geminiService.js v5.3.4) para esfera, cilindro e eixo. A unanimidade exige as 3 medições presentes e idênticas; com medições variadas, a média continua prioritária (média real pode diferir de medições individuais).

### S.E. copiado da esfera (alucinação clássica)

- **Regra**: o campo `se` SÓ pode ter valor se a linha "S.E. <numero>" estiver literalmente impressa e legível no ticket. Se a linha S.E. estiver cortada, borrada, ou ilegível, retornar `se: null`. **Nunca** completar `se` copiando a esfera, a média, ou usando S+C/2 mental.
- **Origem**: 1 correção em 2026-05-20 (`feedback-refracao.jsonl` id `2026-05-20T19:01:27`). Caso identificado pelo médico como alucinação. Lição criada antecipadamente por padrão reconhecido, não por repetição.
- **Como aplicar**: antes de devolver o JSON, executar checagem dupla — (1) se `se != null`, confirmar mentalmente que a linha S.E. está visível no ticket; (2) se `cil != null && cil != 0` e `parseFloat(se) == parseFloat(esf)`, é impossível matematicamente (porque S.E. = S + C/2) → forçar `se: null` e marcar `_revisao_manual: true`. Só permitir `se == esf` quando `cil == 0`.
