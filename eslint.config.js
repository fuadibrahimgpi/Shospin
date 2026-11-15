'use strict';
// Scripts da extensão são globais compartilhados (sem módulos), então no-undef fica desligado.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**', 'archive/**', 'shosp-extension-v5.1.0/**', 'scratch/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.node, chrome: 'readonly' }
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-redeclare': 'off',
      // Intencionais: espaço NBSP em texto do SHOSP e limpeza de caracteres de controle do JSON da IA.
      'no-irregular-whitespace': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'warn'
    }
  }
];
