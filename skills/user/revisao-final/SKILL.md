---
name: revisao-final
description: >
  Revisão obrigatória ANTES DO PASSO FINAL de qualquer outra skill do projeto
  (transcrição, conduta/tratamento, biomicroscopia, fundoscopia, CID, OCR,
  gatilhos, caso clínico, simulador). Confere o resultado pronto, item por item,
  contra os parâmetros da própria skill que o produziu (regras críticas, lista
  de checagem final, formato de saída, histórico de erros) e contra as regras
  do médico registradas na memória. Só depois libera o passo final: entregar o
  JSON/texto para injeção, lançar o CID, entregar o caso ao aluno ou seguir
  para testes e commit. Use SEMPRE ao terminar o trabalho de uma skill e antes
  de entregar, e quando o Fuad disser "revisa", "confere antes", "tá tudo
  certo?" ou "passa a revisão". NÃO é o verificador-mudancas: aquele testa uma
  skill depois de ela ser EDITADA; esta revisa o RESULTADO de uma skill antes
  da ação final.
metadata:
  author: fuad-ibrahim
  version: "1.0"
  criada: 2026-11-07
---

# Revisão final (antes do passo final de qualquer skill)

Fuad não programa: o relatório é curto, em português, sem jargão.

Esta skill **não tem regra clínica própria**. Ela não repete as regras das
outras skills (ver `skills/user/README.md`: o código é a autoridade, a skill
documenta). Ela é um procedimento: pegar os parâmetros da skill que acabou de
trabalhar e conferir o resultado contra eles **antes** de executar o passo final.

## Quando roda

Toda skill do projeto termina com a seção **"Antes do passo final — revisão
obrigatória"**, que diz qual é o passo final dela. A revisão roda exatamente ali:

```
trabalho da skill → RASCUNHO pronto → revisao-final → (aprovado) → passo final
```

O passo final nunca é executado com a revisão pendente ou reprovada.

## Passo 1 — Juntar os parâmetros

Ler de novo, da skill que produziu o resultado (não de memória):

1. As seções de regra crítica / "Princípios" / "Regras invioláveis".
2. A **lista de checagem final** ou "Validação final obrigatória", quando existir — ela entra inteira.
3. O **formato de saída** (campos, ordem, o que é proibido no campo).
4. O **histórico de erros** da skill: cada linha vira uma pergunta "este erro se repetiu aqui?".
5. As regras do médico na memória do projeto (`MEMORY.md`, entradas de feedback) que tocam o resultado — por exemplo OD antes de OE, negativa de sintoma fora da queixa, exame só com o nome dito pelo médico, normalidade fora da conduta, tempo relativo na HDA.

Se o resultado passou por mais de uma skill (ex.: transcrição que usa conduta,
biomicroscopia e CID), juntar os parâmetros de todas.

## Passo 2 — Conferir item por item

Montar a lista e marcar cada item contra o rascunho:

| Marca | Significado |
|---|---|
| ✅ | cumprido — dizer onde, em poucas palavras |
| ❌ | violado — dizer o trecho exato e qual regra |
| ⚠️ | não dá para decidir pela fonte (ex.: lado do olho não dito) |
| — | não se aplica a este caso |

Perguntas que valem para toda skill:

- **Fonte**: cada afirmação do resultado tem origem na entrada (transcrição, foto, pedido)? Nada inventado, nada deduzido de exemplo.
- **Ausência ≠ negativa**: nenhum "nega"/"sem alterações" escrito só porque o assunto não apareceu.
- **Consistência interna**: diagnóstico × exame × conduta × tratamento não se contradizem.
- **Campo certo**: cada informação está no campo que a skill manda (ex.: conduta × tratamento, HDA × antecedentes).
- **Formato**: o formato de saída da skill foi seguido à risca (campos, ordem, códigos, sem texto extra).
- **Tratamento vazio**: sem nenhum medicamento mencionado, o campo é `Sem prescrição de medicação`; se a fala prescreve ou mantém medicação e o campo está vazio, **não** escrever o texto — avisar o médico (regra de 2026-11-12, skill de conduta).
- **Verificação automática**: se a verificação do `DecisionEngine` não rodou por inteiro (injeção suspensa), o passo final automático **não** é liberado; o médico decide pelo botão.

## Passo 3 — Decidir

- **Tudo ✅ ou —**: aprovado. Executar o passo final.
- **Algum ❌**: corrigir o rascunho e voltar ao Passo 2 com a lista inteira (a correção pode quebrar outro item). No máximo **3 rodadas**; se ainda houver ❌, **não** executar o passo final — mostrar ao Fuad o que falha e por quê.
- **Algum ⚠️**: não chutar. Usar o escape que a própria skill prevê (ex.: `[CONFIRMAR OLHO AFETADO]`, campo vazio, "não especificado na consulta") ou perguntar ao Fuad antes do passo final.

## Passo 4 — Relatar (curto)

```
Revisão final — <skill>
Conferidos: N itens · ✅ X · corrigidos Y · pendentes Z
Corrigido: <uma linha por correção>
Pendente: <o que precisa do Fuad, se houver>
→ Passo final: <executado | bloqueado>
```

Quando estiver tudo certo de primeira, uma linha basta:
`Revisão final — <skill>: N itens conferidos, tudo certo. Seguindo.`

## Quando o passo final é mudar código ou skill

Se o trabalho foi alterar o projeto (código, gatilho, prompt, a própria skill),
a revisão confere a **alteração** contra as regras da skill e do
`skills/user/README.md` (código e skill mudados juntos, teste novo escrito,
âncora `[SKILL-SYNC]` quando a regra é crítica). Aprovada, segue a ordem da
`commit-e-push-github`: testes → commit → push. A revisão vem **antes** dos testes
e não os substitui.

## O que esta skill não faz

- Não testa a skill editada com casos de teste — isso é da `verificador-mudancas`.
- Não chama a si mesma nem revisa o próprio relatório.
- Não muda o comportamento da extensão: no runtime quem revisa são os guards do `src/DecisionEngine.js`.
