/**
 * API SERVICE v5.0 — Retry Exponencial + Rate Limiting
 */

const GEMINI_API_ENDPOINT    = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';
const GEMINI_API_ENDPOINT_BETA = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const DEFAULT_GEMINI_CONFIG = {
  temperature: 0,
  topK: 1,
  topP: 0.95,
  maxOutputTokens: 8192
};

const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

const DEFAULT_RATE_LIMIT_CONFIG = {
  maxRequestsPerMinute: 15,
  maxRequestsPerHour: 100
};

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  constructor(config = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = config;
    this.state = {
      requestTimestamps: [],
      isLimited: false,
      resetTime: null
    };
    this.logger = new Logger('RateLimiter');
  }

  _cleanOldTimestamps() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    this.state.requestTimestamps = this.state.requestTimestamps.filter(ts => ts > oneHourAgo);
  }

  canMakeRequest() {
    this._cleanOldTimestamps();

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const requestsLastMinute = this.state.requestTimestamps.filter(ts => ts > oneMinuteAgo).length;
    const requestsLastHour = this.state.requestTimestamps.length;

    if (requestsLastMinute >= this.config.maxRequestsPerMinute) {
      const oldestInMinute = this.state.requestTimestamps.find(ts => ts > oneMinuteAgo);
      const waitMs = oldestInMinute ? (oldestInMinute + 60000) - now : 60000;
      this.state.isLimited = true;
      this.state.resetTime = now + waitMs;
      
      this.logger.warn(`Rate limit atingido (${requestsLastMinute}/${this.config.maxRequestsPerMinute} por minuto)`);
      
      return { allowed: false, waitMs, reason: `Limite de ${this.config.maxRequestsPerMinute} requisições por minuto atingido` };
    }

    if (requestsLastHour >= this.config.maxRequestsPerHour) {
      const oldestTimestamp = this.state.requestTimestamps[0];
      const waitMs = oldestTimestamp ? (oldestTimestamp + 3600000) - now : 3600000;
      this.state.isLimited = true;
      this.state.resetTime = now + waitMs;
      
      this.logger.warn(`Rate limit por hora atingido (${requestsLastHour}/${this.config.maxRequestsPerHour})`);
      
      return { allowed: false, waitMs, reason: `Limite de ${this.config.maxRequestsPerHour} requisições por hora atingido` };
    }

    this.state.isLimited = false;
    this.state.resetTime = null;
    
    return { allowed: true, waitMs: 0 };
  }

  recordRequest() {
    this.state.requestTimestamps.push(Date.now());
  }

  getStatus() {
    this._cleanOldTimestamps();
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    return {
      requestsLastMinute: this.state.requestTimestamps.filter(ts => ts > oneMinuteAgo).length,
      requestsLastHour: this.state.requestTimestamps.length,
      isLimited: this.state.isLimited
    };
  }

  reset() {
    this.state = { requestTimestamps: [], isLimited: false, resetTime: null };
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeoutMs = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.state = { failures: 0, lastFailure: 0, state: 'closed' };
    this.logger = new Logger('CircuitBreaker');
  }

  canExecute() {
    if (this.state.state === 'closed') return true;

    if (this.state.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.state.lastFailure;
      if (timeSinceLastFailure >= this.resetTimeoutMs) {
        this.state.state = 'half-open';
        this.logger.info('Circuit breaker em half-open');
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess() {
    this.state.failures = 0;
    this.state.state = 'closed';
  }

  recordFailure() {
    this.state.failures++;
    this.state.lastFailure = Date.now();

    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'open';
      this.logger.error(`Circuit breaker aberto após ${this.state.failures} falhas`);
    }
  }

  getState() { return this.state.state; }

  reset() {
    this.state = { failures: 0, lastFailure: 0, state: 'closed' };
  }
}

// ============================================================================
// API SERVICE
// ============================================================================

class ApiService {
  constructor() {
    this.apiKey = null;
    this.rateLimiter = new RateLimiter();
    this.circuitBreaker = new CircuitBreaker();
    this.logger = new Logger('ApiService');
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['geminiApiKey']);
      this.apiKey = result.geminiApiKey || null;
      return this.apiKey;
    } catch (err) {
      this.logger.error('Erro ao carregar API key', err);
      this.apiKey = null;
      return this.apiKey;
    }
  }

  async saveApiKey(apiKey) {
    try {
      await chrome.storage.sync.set({ geminiApiKey: apiKey });
      this.apiKey = apiKey;
      this.logger.success('API key salva com sucesso');
      return true;
    } catch (err) {
      this.logger.error('Erro ao salvar API key', err);
      return false;
    }
  }

  getApiKey() { return this.apiKey; }

  _calculateDelay(attempt, config) {
    const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    const delay = Math.min(exponentialDelay + jitter, config.maxDelayMs);
    return Math.floor(delay);
  }

  _isRetryableError(error, statusCode) {
    if (error.name === 'TypeError' || error.message.includes('fetch')) return true;
    if (statusCode) {
      if (statusCode === 429) {
        // Se for 429 devido a falta de créditos/pré-pagamento, não é recuperável por retentativa
        if (error.message.includes('depleted') || error.message.includes('credits') || error.message.includes('billing') || error.message.includes('esgotados')) {
          return false;
        }
        return true;
      }
      return statusCode >= 500;
    }
    if (error.name === 'AbortError' || error.message.includes('timeout')) return true;
    return false;
  }

  async callGeminiAPI(parts, config = {}, retryConfig = {}) {
    if (!this.apiKey) {
      await this.loadApiKey();
      if (!this.apiKey) {
        throw new Error('Chave API não configurada. Configure nas opções da extensão.');
      }
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error('Serviço temporariamente indisponível. Tente novamente em 1 minuto.');
    }

    const rateLimitCheck = this.rateLimiter.canMakeRequest();
    if (!rateLimitCheck.allowed) {
      const waitSeconds = Math.ceil(rateLimitCheck.waitMs / 1000);
      throw new Error(`${rateLimitCheck.reason}. Aguarde ${waitSeconds} segundos.`);
    }

    const fullRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    // thinkingBudget: 0 desativa o thinking do Gemini 2.5 Flash (via v1beta).
    // Usado no PASS 2 para evitar que reasoning extenso consuma os tokens de saída.
    const { thinkingBudget, ...restConfig } = config;
    const generationConfig = { ...DEFAULT_GEMINI_CONFIG, ...restConfig };
    if (thinkingBudget !== undefined) {
      generationConfig.thinkingConfig = { thinkingBudget };
    }

    const baseEndpoint = thinkingBudget !== undefined ? GEMINI_API_ENDPOINT_BETA : GEMINI_API_ENDPOINT;
    const endpoint = `${baseEndpoint}?key=${this.apiKey}`;

    let lastError = null;

    for (let attempt = 0; attempt <= fullRetryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this._calculateDelay(attempt - 1, fullRetryConfig);
        this.logger.info(`Tentativa ${attempt + 1}/${fullRetryConfig.maxRetries + 1} após ${delay}ms`);
        await this._sleep(delay);
      }

      // Cada tentativa é uma requisição HTTP real contra a quota do Gemini —
      // registrar dentro do loop para o limitador local não subcontar retries.
      this.rateLimiter.recordRequest();

      try {
        const response = await this._executeRequest(endpoint, parts, generationConfig);
        this.circuitBreaker.recordSuccess();
        return response;

      } catch (error) {
        lastError = error;
        const statusCode = error.statusCode;

        this.logger.warn(`Tentativa ${attempt + 1} falhou: ${lastError.message}`);

        if (attempt < fullRetryConfig.maxRetries && this._isRetryableError(lastError, statusCode)) {
          continue;
        }

        this.circuitBreaker.recordFailure();
        break;
      }
    }

    throw lastError || new Error('Falha desconhecida na API');
  }

  async _executeRequest(endpoint, parts, generationConfig) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `Erro ${response.status}: ${errorText.substring(0, 200)}`;
        if (response.status === 429 && (errorText.includes('depleted') || errorText.includes('credits') || errorText.includes('billing'))) {
          errorMsg = 'Créditos esgotados no Google AI Studio. Verifique sua conta e recarregue seus créditos pré-pagos.';
        }
        const error = new Error(errorMsg);
        error.statusCode = response.status;
        throw error;
      }

      const data = await response.json();

      if (!data.candidates?.length) {
        throw new Error('Nenhuma resposta gerada pelo Gemini');
      }

      const candidate = data.candidates[0];
      const finishReason = candidate.finishReason || 'UNKNOWN';
      const text = candidate.content?.parts?.[0]?.text || '';

      if (finishReason === 'MAX_TOKENS') {
        this.logger.warn('Resposta truncada por MAX_TOKENS');
        throw new Error('MAX_TOKENS: resposta truncada — aumente maxOutputTokens ou reduza o prompt');
      }

      return { text, finishReason };

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Timeout: API Gemini não respondeu em 90s');
      }
      
      throw fetchError;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      hasApiKey: !!this.apiKey,
      rateLimitStatus: this.rateLimiter.getStatus(),
      circuitBreakerState: this.circuitBreaker.getState()
    };
  }

  resetLimits() {
    this.rateLimiter.reset();
    this.circuitBreaker.reset();
    this.logger.info('Rate limiter e circuit breaker resetados');
  }
}

// Singleton
const apiService = new ApiService();

// Export
if (typeof window !== 'undefined') {
  window.ApiService = ApiService;
  window.apiService = apiService;
}
