---
title: Agentes
date: 2026-10-22
tags: [indice, agentes]
---

# Agentes

Agentes e subagentes do projeto: os dois agentes Gemini (entrevista e exames), o motor de guards, o contrato dos subagentes e o runner de voz.

Up: [Cofre](../INDEX.md)

- [Agente de entrevista (Gemini)](gemini-interview-agent.md): Analisa a transcrição da consulta e devolve JSON (HDA, diagnóstico, conduta, tratamento…); contém o prompt clínico completo.
- [Agente de exames (OCR Gemini)](gemini-exam-agent.md): Lê o ticket do autorefrator TOPCON por imagem: refração, tonometria, paquimetria, com validações e bloqueio por incerteza.
- [Agente de medicamentos](medicamentos-agent.md): Subagente que escreve o campo tratamento: roteamento, validação por léxico e hierarquia de nomeação (princípio, protocolo, classe, genérico).
- [Contrato dos subagentes](agent-contract.md): Forma comum de todo subagente da conduta (nome, campo, detectar, validar, formatar, analisar) e a defesa por evidência literal.
- [DecisionEngine (guards pós-LLM)](decision-engine.md): Ponto autoritativo de segurança clínica: aplica guards determinísticos à resposta do Gemini sem mutar a resposta crua.
- [GeminiService (fachada)](gemini-service.md): Fachada window.GeminiService que expõe os agentes de exames e de entrevista.
- [Hooks de voz (VoiceHookAgent)](voice-hooks.md): Runner que percorre os hooks de voz por prioridade: flag, inject ou stop.
