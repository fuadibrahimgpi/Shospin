/**
 * GEMINI SERVICE — fachada window.GeminiService.
 * A implementação vive em: gemini-json-utils.js, gemini-exam-agent.js,
 * gemini-interview-agent.js (carregados antes deste arquivo — ver sidepanel.html).
 */

// ============================================================================
// FACHADA — window.GeminiService
// ============================================================================
//
// v5.2: extractExamsTwoPass foi removido. extractExams é o único caminho.
// Mantemos um alias defensivo para o caso de algum caller ainda referenciar
// o nome antigo (loga depreciação e delega ao novo).

window.GeminiService = {
  // ── Agente de Exames ──
  extractExams:        (images, cb) => geminiExamAgent.extractExams(images, cb),
  extractExamsTwoPass: (images, cb) => {
    // alias deprecado — todos os callers devem migrar para extractExams
    console.warn('[GeminiService] extractExamsTwoPass está deprecado — use extractExams');
    return geminiExamAgent.extractExams(images, cb);
  },
  validateExamData:    (data)       => geminiExamAgent.validateExamData(data),

  // ── Agente de Entrevista ──
  analyzeConsultation: (text, options) => geminiInterviewAgent.analyzeConsultation(text, options),
  detectExamTriggers:  (text) => geminiInterviewAgent.detectExamTriggers(text),

  // ── API / Config ──
  getAPIKey: () => apiService.getApiKey(),
  setAPIKey: (key) => apiService.saveApiKey(key),

  // ── Utilitários ──
  Logger: Logger,
};
