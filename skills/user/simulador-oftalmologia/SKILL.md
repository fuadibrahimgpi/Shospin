---
name: simulador-oftalmologia
description: >
  Contexto completo do projeto de simulação clínica em oftalmologia para alunos do 6° período de medicina
  na Universidade Federal do Tocantins. Use esta skill SEMPRE que o usuário pedir para criar, modificar
  ou executar qualquer tarefa relacionada ao simulador de consulta oftalmológica — incluindo criar casos
  clínicos, ajustar o agente simulador, revisar o fluxo de sessão, modificar critérios de avaliação,
  gerar o prompt do agente, adaptar a devolutiva pedagógica, ou qualquer outra tarefa vinculada a este
  projeto. Use também quando o usuário mencionar "o simulador", "o agente", "o caso clínico", "a sessão",
  "a devolutiva", "o aluno", "a consulta simulada", ou termos como "DCN", "UBS", "UPA" no contexto
  educacional.
---

# Simulador de Raciocínio Clínico em Oftalmologia

## Identidade do Projeto

Agente pedagógico de simulação clínica em oftalmologia desenvolvido para alunos do **6° período de medicina** na **Universidade Federal do Tocantins**, campus de Palmas. Coordenado por Fuad Hajjar, médico oftalmologista e professor da instituição.

O sistema simula um **paciente leigo** durante consultas oftalmológicas por voz, em cenários de atenção primária (UBS) e urgência (UPA), alinhados às Diretrizes Curriculares Nacionais — **DCN (Resolução CNE/CES nº 3, setembro de 2025)**, mapeando competências dos Art. 8º e Art. 37.

---

## Arquitetura Central

O sistema é um **agente** (não um skill estático), pois exige contexto dinâmico e condução adaptativa ao longo da consulta.

### Fluxo da Sessão (5 fases)

1. **Sorteio e apresentação do caso** — caso aleatório da banco de casos; aluno recebe apenas dados superficiais do paciente (nome, queixa principal genérica)
2. **Consulta por voz — 8 interações** — aluno conduz a anamnese; agente responde como paciente leigo; contador de interações ativo
3. **Interrupção espontânea (interação 4)** — paciente pergunta espontaneamente o que o aluno acha que está acontecendo; aluno deve fornecer hipótese diagnóstica intermediária
4. **Pergunta pós-consulta** — após encerrar a anamnese, paciente pergunta o que tem e o que vai acontecer; aluno deve apresentar diagnóstico, condutas e próximos passos
5. **Devolutiva estruturada** — avaliação em 3 domínios de competência (DCN): cognitivo, psicomotor, atitudinal

### Regras de Interação

- **Canal de entrada: voz exclusivamente** — design deliberado para dificultar uso de IA durante o exercício
- Cada envio de voz = 1 interação, independentemente de quantas perguntas contém
- Recursos clínicos disponíveis: lanterna, oclusor, tabela de Snellen, evertedor de pálpebra, soro fisiológico
- Recursos **explicitamente excluídos**: fluoresceína, tonômetro, lâmpada de fenda, oftalmoscópio

---

## Banco de Casos

**Módulo atual: Trauma e Urgência Oftalmológica**
14 casos construídos, cada um com duas camadas:

### Camada do Paciente (para o agente)
- Respostas em linguagem leiga
- Imagens limitadas ao que é visível com os recursos disponíveis
- Armadilha clínica embutida (para testar raciocínio diferencial)

### Camada do Professor (para devolutiva)
- Diagnóstico principal e diferenciais
- Armadilha pedagógica explicitada
- Perguntas essenciais esperadas
- Red flags que o aluno deveria identificar
- Conduta esperada com justificativa
- Critérios de avaliação mapeados às competências DCN

---

## Avaliação (Devolutiva Estruturada)

### Domínios de Competência (DCN Art. 8º e Art. 37)

| Domínio | O que avalia |
|---|---|
| **Cognitivo** | Raciocínio clínico, hipóteses diagnósticas, diagnósticos diferenciais com justificativa de exclusão |
| **Psicomotor** | Uso correto dos recursos disponíveis, sequência de exame, pedido de manobras pertinentes |
| **Atitudinal** | Postura com o paciente, comunicação, empatia, clareza na explicação do diagnóstico |

### Exigência diferencial
O aluno deve:
1. Nomear o diagnóstico principal
2. Listar os diferenciais considerados
3. Justificar a exclusão de cada diferencial — não basta nomear uma única resposta

---

## Diversidade de Perfis de Pacientes

A geração de casos deve garantir diversidade desde o início (não como adendo):
- Faixa etária variada (criança, adulto jovem, idoso)
- Gênero
- Origem (urbano/rural)
- Grau de instrução (influencia vocabulário e comportamento narrativo)
- Mecanismo de trauma ou contexto de urgência

---

## Decisões Arquiteturais em Aberto

Três pontos ainda não finalizados:

1. **Visibilidade do contador de interações** — o aluno vê o contador durante a consulta, ou só no final?
2. **Granularidade das interações** — cada envio de voz = 1 interação (independente de quantas perguntas); confirmado, mas pode ser revisitado
3. **Detecção de postura interpessoal** — o agente detecta, reage e registra a postura do aluno durante a consulta?

---

## Alinhamento Curricular

- **DCN**: Resolução CNE/CES nº 3, setembro de 2025
- **Art. 8º**: Competências gerais do médico generalista
- **Art. 37**: Competências específicas por área clínica
- **Contexto**: UBS (atenção primária) e UPA (urgência e emergência)
- **Período**: 6° período — alunos com base semiológica, sem especialização

---

## Princípios Pedagógicos

- O simulador é **AI-resistant by design** (voz como canal de entrada)
- A armadilha clínica é obrigatória em todo caso — sem caso "direto"
- A devolutiva é estruturada e mapeada às competências DCN, tornando o instrumento pedagogicamente defensável
- Diversidade de perfis é estrutural, não cosmética
- O fluxo foi desenvolvido de forma iterativa e parte a parte — qualquer modificação deve preservar a coerência do todo

---

## Instruções para Uso desta Skill

Ao executar qualquer tarefa para este projeto:

1. **Respeite os recursos disponíveis** — nunca inclua fluoresceína, tonômetro, lâmpada de fenda ou oftalmoscópio em condutas ou exames
2. **Mantenha as duas camadas** em casos clínicos (paciente + professor)
3. **Mapeie às competências DCN** em qualquer critério de avaliação
4. **Preserve a armadilha clínica** — todo caso deve ter uma
5. **Use linguagem leiga** na camada do paciente
6. **Consulte a skill `caso-clinico-oftalmologia`** para geração de casos clínicos completos
7. **Consulte as decisões em aberto** antes de implementar funcionalidades que dependam delas

---

## Arquivos e Skills Relacionados

| Recurso | Função |
|---|---|
| `caso-clinico-oftalmologia` (skill) | Gera casos clínicos no padrão do projeto |
| Banco de 14 casos (módulo trauma/urgência) | Casos prontos para uso no agente |
| Prompt do agente simulador | Instrução do agente paciente para o Claude |
