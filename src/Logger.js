/**
 * LOGGER v5.0 — Logging Estruturado
 */

const LOG_COLORS = {
  debug: '#6b7280',
  info: '#3b82f6',
  warn: '#f59e0b',
  error: '#ef4444',
  success: '#10b981'
};

const LOG_ICONS = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  success: '✅'
};

const VALID_LEVELS = Object.keys(LOG_COLORS);

class Logger {
  static isDebugEnabled = false;
  static history = [];
  static maxHistorySize = 100;

  // FIX #1: renomeado de "module" para "moduleName" para evitar conflito com global do Node.js
  constructor(moduleName) {
    this.module = moduleName;
  }

  static enableDebug(enabled) {
    Logger.isDebugEnabled = enabled;
  }

  static getHistory() {
    return [...Logger.history];
  }

  static clearHistory() {
    Logger.history = [];
  }

  _log(level, message, data) {
    // FIX #2: valida o level antes de prosseguir
    if (!VALID_LEVELS.includes(level)) {
      console.warn(`[Logger] Level inválido: "${level}". Use: ${VALID_LEVELS.join(', ')}`);
      return;
    }

    if (level === 'debug' && !Logger.isDebugEnabled) {
      return;
    }

    // FIX #4: omite o campo "data" do histórico quando não foi passado
    const entry = {
      timestamp: new Date(),
      level,
      module: this.module,
      message,
      ...(data !== undefined && { data })
    };

    Logger.history.push(entry);
    if (Logger.history.length > Logger.maxHistorySize) {
      Logger.history.shift();
    }

    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] ${LOG_ICONS[level]} [${this.module}]`;
    const color = LOG_COLORS[level];

    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

    if (data !== undefined) {
      console[consoleMethod](`%c${prefix} ${message}`, `color: ${color}`, data);
    } else {
      console[consoleMethod](`%c${prefix} ${message}`, `color: ${color}`);
    }
  }

  debug(message, data)   { this._log('debug',   message, data); }
  info(message, data)    { this._log('info',    message, data); }
  warn(message, data)    { this._log('warn',    message, data); }
  error(message, data)   { this._log('error',   message, data); }
  success(message, data) { this._log('success', message, data); }

  group(label)    { console.group(`[${this.module}] ${label}`); }
  groupEnd()      { console.groupEnd(); }
  time(label)     { console.time(`[${this.module}] ${label}`); }
  timeEnd(label)  { console.timeEnd(`[${this.module}] ${label}`); }
}

// FIX #3: exportação separada por ambiente, sem duplicidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Logger };
} else if (typeof globalThis !== 'undefined') {
  globalThis.Logger = Logger;
} else if (typeof window !== 'undefined') {
  window.Logger = Logger;
} else if (typeof self !== 'undefined') {
  self.Logger = Logger;
}
