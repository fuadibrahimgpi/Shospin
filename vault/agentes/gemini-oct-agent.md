---
title: "Agente de OCT (laudo de glaucoma)"
description: "Lê imagem ou PDF de OCT de glaucoma e gera o laudo que vai ao campo OCT da aba Glaucoma, com alertas que seguram a injeção."
date: 2026-11-10
tags: [agente, projeto-shosp]
aliases: ["gemini-oct-agent"]
---

# Agente de OCT (laudo de glaucoma)

**Agente** · arquivo-fonte: `src/gemini-oct-agent.js` · tela: `scripts/sidepanel-oct.js`

Terceiro agente Gemini da extensão (2026-11-09), ao lado do [Agente de entrevista](gemini-interview-agent.md) e do [Agente de exames](gemini-exam-agent.md). É o modo "OCT" do painel.

Fluxo: imagens ou PDF do OCT → Gemini → JSON `{e_oct, laudo, alertas[]}` → `decidirInjecao` (determinístico) → campo OCT da aba Glaucoma, escrito pelo [Content script](../modulos/content-script.md) na ação `injectOctLaudo`.

O que segura a segurança:

- **O prompt é a autoridade.** A skill de laudo de OCT é documentação; regra nova precisa entrar no prompt deste arquivo.
- **Laudo documental, não diagnóstico.** `verificarLinguagemDiagnostica` barra texto que afirme doença.
- **Alertas bloqueantes** (`ALERTAS_BLOQUEANTES`): olho ausente, olhos idênticos, várias datas, aparelhos diferentes, imagem cortada. Com alerta, a injeção automática fica retida.
- **Só o laudo vai ao prontuário.** O rodapé "Confira os valores…" e os avisos ficam no painel.
- **Campo achado pelo rótulo, e precisa ser único.** Zero ou dois candidatos: não injeta. Campo com texto não é sobrescrito sem um clique.

Pendente: o rótulo e o ID reais do campo OCT nunca foram lidos do SHOSP ao vivo. O botão "Diagnóstico do campo OCT" do painel imprime os campos da aba Glaucoma para fixar isso.

Testes em `utils/oct-test.js`.

## Memórias relacionadas

- [laudo-oct-modo-painel](../memorias/laudo-oct-modo-painel.md): modo OCT do painel; ID real do campo pendente de conferência
- [cid-busca-exige-secao-visivel](../memorias/cid-busca-exige-secao-visivel.md): por que não se inventa ID de elemento do SHOSP

---

Related: [Content script](../modulos/content-script.md) · [Mensagens entre as peças](../modulos/mensagens.md) · [Linha do tempo](../historico/linha-do-tempo.md)

Up: [Agentes](INDEX.md)
