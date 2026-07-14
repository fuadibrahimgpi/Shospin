/**
 * GEMINI SERVICE — fachada window.GeminiService.
 * A implementação vive em: gemini-json-utils.js, gemini-exam-agent.js,
 * gemini-interview-agent.js (carregados antes deste arquivo — ver sidepanel.html).
 */

// ============================================================================
// FACHADA — window.GeminiService
// ============================================================================

window.GeminiService = {
  // ── Agente de Exames ──
  extractExams:        (images, cb) => geminiExamAgent.extractExams(images, cb),
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
