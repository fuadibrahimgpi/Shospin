# Archive

Arquivos preservados fora do bundle de runtime para referência histórica. **Nada nesta pasta é carregado pela extensão.**

## geminiInterviewAgent.standalone.archived.js

Versão anterior, **standalone**, do Agente 2 (entrevista/áudio). O conteúdo
deste arquivo foi consolidado dentro de `dist/geminiService.js` (a fachada
`window.GeminiService` agora reside no fim daquele arquivo). Este standalone
**não era carregado** por `sidepanel.html` — apenas existia como leftover
da reorganização v5. Movido aqui em v5.1 para evitar confusão de manutenção.

## sidepanel-hook-runner.v4.2.archived.js

Variante anterior do hook runner (rotulada internamente "v4.2") com:
- guard global removido (`stopCommandTimeout` não bloqueia hooks);
- flag `bypassStopGuard` para hooks de dilatação;
- log de debug por hook disparado.

A versão atualmente carregada (`scripts/sidepanel-hook-runner.js`) usa o
guard global `if (stopCommandTimeout) return false`, que é o comportamento
exercitado pelos testes (`utils/hooks-test.js`). Mantido aqui para que a
diferença entre as duas variantes permaneça inspecionável sem voltar ao
controle de versão.
