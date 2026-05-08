# Shosp Extension v5.0 — Refatoração TypeScript

## 🎯 Melhorias Implementadas

### 1. ✅ Estado Global Encapsulado (`StateManager`)

**Antes:** 30+ variáveis globais espalhadas em `sidepanel-constants.js`
```javascript
// ANTES (v4)
let isRecording = false;
let audioData = null;
let cameraData = null;
let examesNormaisInjetados = false;
// ... mais 25+ variáveis
```

**Depois:** Classe `StateManager` com estado imutável e eventos
```typescript
// DEPOIS (v5)
import { state } from './core/StateManager';

state.setRecording(true);           // Setter controlado
const data = state.getAudioData();  // Getter read-only
state.on('audio:started', () => {}); // Event system
state.reset({ audio: true });        // Reset parcial
```

**Benefícios:**
- Estado imutável (previne mutações acidentais)
- Sistema de eventos para reagir a mudanças
- Histórico com `undo()` para debug
- Reset granular por módulo

---

### 2. ✅ Retry Exponencial + Rate Limiting (`ApiService`)

**Antes:** Timeout fixo de 60s, sem retry, sem proteção de quota
```javascript
// ANTES (v4)
const response = await fetch(endpoint, { ... });
// Se falhar, falhou!
```

**Depois:** Retry inteligente com backoff exponencial + jitter
```typescript
// DEPOIS (v5)
const response = await apiService.callGeminiAPI(parts, config);
// Internamente:
// - Retry até 3x com delays: 1s → 2s → 4s (+ jitter)
// - Rate limit: 15 req/min, 100 req/hora
// - Circuit breaker: para após 5 falhas consecutivas
// - Timeout configurável (default 90s)
```

**Configuração:**
```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
};

const RATE_LIMIT_CONFIG = {
  maxRequestsPerMinute: 15,
  maxRequestsPerHour: 100
};
```

---

### 3. ✅ Detecção Dinâmica de IDs (`ShospFieldDetector`)

**Antes:** IDs hardcoded que quebram quando Shosp atualiza
```javascript
// ANTES (v4)
const SHOSP_EXAM_FIELD_IDS = {
  tonometria: {
    od: 'prontuario_resp_78726_260839', // ← quebra se mudar
    oe: 'prontuario_resp_78726_256484'
  }
};
```

**Depois:** Detecção por seletores CSS, labels e estrutura DOM
```typescript
// DEPOIS (v5)
await fieldDetector.initialize();

const fieldId = fieldDetector.getFieldId('tonometria.od');
// Estratégia:
// 1. Busca por labels de texto (tonometria, OD, direito)
// 2. Analisa estrutura de abas/seções
// 3. Cache para performance
// 4. Fallback para IDs conhecidos se falhar
```

**Benefícios:**
- Resiliente a atualizações do Shosp
- Cache de IDs detectados
- Fallback automático para IDs conhecidos
- Método `refresh()` para redetectar

---

### 4. ✅ Rate Limiting Inteligente

```typescript
// Verificação antes de cada request
const check = rateLimiter.canMakeRequest();
if (!check.allowed) {
  throw new Error(`Aguarde ${check.waitMs / 1000}s`);
}

// Status em tempo real
const status = apiService.getStatus();
// {
//   hasApiKey: true,
//   rateLimitStatus: { requestsLastMinute: 5, requestsLastHour: 42, isLimited: false },
//   circuitBreakerState: 'closed'
// }
```

---

## 📁 Estrutura do Projeto

```
shosp-extension-v5/
├── src/
│   ├── core/
│   │   └── StateManager.ts      # Estado encapsulado
│   ├── services/
│   │   ├── ApiService.ts        # Retry + Rate Limiting
│   │   └── GeminiService.ts     # Integração Gemini
│   ├── content/
│   │   ├── ShospFieldDetector.ts # Detecção dinâmica de IDs
│   │   └── ShospInjector.ts      # Injeção no DOM
│   ├── utils/
│   │   └── Logger.ts            # Logging estruturado
│   ├── types/
│   │   └── index.ts             # Definições TypeScript
│   └── index.ts                 # Exports
├── manifest.json
├── tsconfig.json
└── package.json
```

---

## 🚀 Como Usar

### Build
```bash
npm install
npm run build
```

### Desenvolvimento
```bash
npm run watch    # TypeScript watch mode
npm run lint     # ESLint
npm run typecheck # Verificar tipos
```

---

## 📊 Comparativo

| Aspecto | v4.2.1 | v5.0 |
|---------|--------|------|
| Linguagem | JavaScript | TypeScript |
| Estado | 30+ globais | StateManager |
| Retry API | Nenhum | Exponencial + jitter |
| Rate Limit | Nenhum | 15/min, 100/hora |
| IDs Shosp | Hardcoded | Detecção dinâmica |
| Logging | console.log | Logger estruturado |
| Eventos | Callbacks | Event system |
| Testabilidade | Baixa | Alta |

---

## 🔧 Migração do v4

Os módulos são compatíveis com a interface antiga:

```typescript
// Compatibilidade com código v4
window.GeminiService = {
  getAPIKey: () => apiService.getApiKey(),
  analyzeConsultation: (text) => geminiService.analyzeConsultation(text),
  extractExams: (images, cb) => geminiService.extractExams(images, cb),
  // ...
};
```
