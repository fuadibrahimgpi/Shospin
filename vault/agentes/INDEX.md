---
title: Agentes
date: 2026-11-10
tags: [indice, agentes]
---

# Agentes

Agentes e subagentes do projeto: os três agentes Gemini (entrevista, exames e OCT), o motor de guards, o recheck de fidelidade, o auto-feedback de medicações, o contrato dos subagentes e o runner de voz.

Up: [Cofre](../INDEX.md)

- [Agente de entrevista (Gemini)](gemini-interview-agent.md): Analisa a transcrição da consulta e devolve JSON (HDA, diagnóstico, conduta, tratamento…); contém o prompt clínico completo.
- [Agente de exames (OCR Gemini)](gemini-exam-agent.md): Lê o ticket do autorefrator TOPCON por imagem: refração, tonometria, paquimetria, com validações e bloqueio por incerteza.
- [Agente de OCT (laudo de glaucoma)](gemini-oct-agent.md): Lê imagem ou PDF de OCT de glaucoma e gera o laudo do campo OCT da aba Glaucoma, com alertas que seguram a injeção.
- [Auto-feedback de medicações](medicamentos-feedback.md): Captura palavras que parecem remédio e o léxico não conhece; fila de revisão do médico. Nunca altera o léxico sozinho.
- [Recheck de fidelidade](recheck-agent.md): Compara o enviado com o que ficou no prontuário; só relata. Não carregava no painel até 2026-11-10.
- [Agente de medicamentos](medicamentos-agent.md): **EM MODO SOMBRA desde 2026-11-11** — carregado no painel, mas só mede: valida os itens de medicação que o modelo devolve e compara com o `tratamento`; não escreve no prontuário. Roteamento, validação por léxico e hierarquia de nomeação (princípio, protocolo, classe, genérico).
- [Contrato dos subagentes](agent-contract.md): Forma comum de todo subagente da conduta (nome, campo, detectar, validar, formatar, analisar) e a defesa por evidência literal.
- [DecisionEngine (guards pós-LLM)](decision-engine.md): Ponto autoritativo de segurança clínica: aplica guards determinísticos à resposta do Gemini sem mutar a resposta crua.
- [GeminiService (fachada)](gemini-service.md): Fachada window.GeminiService que expõe os agentes de exames e de entrevista.
- [Hooks de voz (VoiceHookAgent)](voice-hooks.md): Runner que percorre os hooks de voz por prioridade: flag, inject ou stop.
