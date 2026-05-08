---
name: caso-clinico-oftalmologia
description: >
  Cria casos clínicos simulados de oftalmologia para alunos do 6° período de medicina,
  no padrão de consulta na UBS ou UPA. Use esta skill sempre que o usuário pedir para
  criar, gerar ou construir um caso clínico de oftalmologia — mesmo que use palavras como
  "montar", "escrever", "fazer" ou "preparar" um caso. Também use quando o usuário
  informar um diagnóstico ou tema oftalmológico e pedir um caso para alunos.
  A skill gera o caso completo em duas camadas: camada do paciente (para o agente simular
  a consulta) e camada do professor (para a devolutiva ao aluno). Respeita os recursos
  disponíveis na UBS/UPA e segue o padrão pedagógico com armadilha clínica embutida.
---

# Skill — Criador de Casos Clínicos de Oftalmologia

## O que esta skill faz

Gera casos clínicos completos de oftalmologia para uso em agente simulador de consultas.
Cada caso segue um padrão pedagógico fixo com duas camadas:
- **Camada do paciente** → usada pelo agente durante a consulta simulada
- **Camada do professor** → usada apenas na devolutiva ao aluno

Leia o arquivo de referência antes de gerar qualquer caso:
`references/regras-clinicas.md`

Ele contém: recursos disponíveis, regras de imagem, tipos de armadilha, casos já existentes e critérios de avaliação.

---

## Entrada esperada do usuário

O usuário pode informar:
- Um diagnóstico (ex: "dacriocistite aguda")
- Um tema (ex: "olho vermelho sem dor")
- Uma situação clínica (ex: "criança com pálpebra caída")
- Um conjunto de temas (ex: "quero 3 casos sobre trauma")

Se o usuário não informar o cenário (UBS ou UPA), pergunte antes de gerar.
Se o usuário não informar o nível do aluno, assuma 6° período de medicina.

---

## Processo de geração

### Passo 1 — Verificar unicidade
Consulte a tabela de casos já construídos em `references/regras-clinicas.md`.
Se o diagnóstico já existir, gere uma **variação com apresentação diferente** —
mude o perfil do paciente, o cenário, a armadilha ou o mecanismo de entrada.
Informe ao usuário que é uma variação e o que foi modificado.

### Passo 2 — Definir a armadilha pedagógica
Todo caso deve ter uma armadilha. Escolha uma da lista em `references/regras-clinicas.md`
ou crie uma nova coerente com o diagnóstico. A armadilha deve:
- Ser realista para o contexto de UBS/UPA
- Ser possível de identificar com raciocínio clínico correto
- Não ser cruel ou impossível para um aluno de 6° período

### Passo 3 — Construir o perfil do paciente
- Idade e sexo compatíveis com a epidemiologia do diagnóstico
- Profissão relevante quando contribui para o raciocínio
- Nível cultural que justifique a linguagem leiga usada nas respostas
- Tom emocional coerente com a gravidade do quadro

### Passo 4 — Escrever as duas camadas
Siga rigorosamente o template em `references/regras-clinicas.md`.
Nunca pule seções. Se uma seção não se aplica, escreva "Não se aplica" e justifique.

### Passo 5 — Verificar consistência
Antes de entregar, verifique:
- [ ] O paciente usa linguagem leiga em todas as respostas?
- [ ] As imagens descritas são compatíveis com os recursos disponíveis?
- [ ] A conduta é realista para UBS/UPA?
- [ ] O nível de urgência está classificado corretamente?
- [ ] A armadilha está embutida de forma que exija raciocínio para ser identificada?
- [ ] O diagnóstico não repete nenhum caso já existente (ou a variação está justificada)?

---

## Alinhamento com a DCN (Resolução CNE/CES nº 3/2025)

Antes de gerar qualquer caso, consulte a seção "Alinhamento com a DCN" em
`references/regras-clinicas.md`. Todo caso deve:

1. Contemplar os **três domínios de competência** do Art. 37
   (cognitivo, psicomotor, atitudinal)
2. Cobrir ao menos **4 competências** do Art. 8º — indicar quais na camada do professor
3. Refletir os **princípios do SUS** (universalidade, equidade, integralidade)
4. Respeitar a **regra de diversidade de perfis** (faixa etária, sexo, contexto social)
5. Garantir **devolutiva formativa** nos três domínios — nunca apenas cognitiva

Ao final de cada caso gerado, listar explicitamente:
```
DCN — Competências contempladas neste caso:
- Art. 8º, III — Anamnese e raciocínio diagnóstico ✓
- Art. 8º, VI — Coordenação do cuidado / encaminhamento ✓
- [demais competências aplicáveis]

Domínios avaliados:
- Cognitivo ✓
- Psicomotor ✓
- Atitudinal ✓ / parcial / não aplicável neste caso
```

---

## Regras invioláveis

1. **Linguagem do paciente** → sempre leiga, nunca técnica
2. **Recursos clínicos** → respeitar estritamente o que está disponível na UBS/UPA
3. **Imagens durante a consulta** → apenas segmento anterior visível com lanterna ou eversor
4. **Fundo de olho** → nunca durante a consulta, apenas na devolutiva
5. **Armadilha** → obrigatória em todos os casos
6. **Conduta** → deve ser executável por médico generalista sem especialista presente
7. **Nível de urgência** → classificar sempre como emergência, urgência ou eletivo
8. **DCN** → todo caso deve mapear explicitamente as competências contempladas
9. **Devolutiva** → sempre nos três domínios — cognitivo, psicomotor e atitudinal
10. **Diversidade** → perfis de pacientes devem variar ao longo do banco de casos

---

## Formato de saída

Entregar o caso completo em markdown com as seções claramente separadas:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CASO CLÍNICO — [DIAGNÓSTICO]
Módulo: [tema do encontro]
Cenário: [UBS / UPA]
Nível de urgência: [emergência / urgência / eletivo]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ CAMADA 1 — PACIENTE

  IDENTIFICAÇÃO
  ...

  APRESENTAÇÃO INICIAL (fala espontânea)
  "..."

  BANCO DE RESPOSTAS — ANAMNESE
  ...

  BANCO DE RESPOSTAS — EXAME FÍSICO
  ...

  RESPOSTA PARA PERGUNTAS INESPERADAS
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ CAMADA 2 — PROFESSOR

  DIAGNÓSTICO PRINCIPAL
  DIAGNÓSTICOS DIFERENCIAIS
  ARMADILHA PEDAGÓGICA
  PERGUNTAS ESSENCIAIS
  RED FLAGS
  CONDUTA ESPERADA
  NÍVEL DE URGÊNCIA E ENCAMINHAMENTO
  CRITÉRIOS DE AVALIAÇÃO
  IMAGENS PARA DEVOLUTIVA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Casos em lote

Se o usuário pedir mais de um caso:
- Gere um por vez e aguarde confirmação antes do próximo, OU
- Se o usuário pedir todos de uma vez, gere todos e ao final pergunte se algum precisa de ajuste

Para lotes de 3 ou mais casos sobre o mesmo tema, variar obrigatoriamente:
- Perfil do paciente (idade, sexo, profissão)
- Forma de apresentação (aguda, subaguda, crônica)
- Armadilha pedagógica
- Nível de gravidade (leve, moderado, grave)

---

## Após gerar o caso

Pergunte ao usuário:
1. O perfil do paciente está adequado para sua realidade local?
2. Há algum dado clínico que queira ajustar?
3. Quer que eu descreva com mais detalhe as imagens necessárias?
4. Quer uma variação deste caso com apresentação diferente?
