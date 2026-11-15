/**
 * GEMINI CONFIG — modelo e endpoints em um único lugar.
 * Carregado por sidepanel.html (antes do ApiService) e config.html.
 * Para trocar de modelo, altere apenas GEMINI_MODEL.
 */
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const GEMINI_API_ENDPOINT = `${GEMINI_BASE_URL}/v1/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_API_ENDPOINT_BETA = `${GEMINI_BASE_URL}/v1beta/models/${GEMINI_MODEL}:generateContent`;
