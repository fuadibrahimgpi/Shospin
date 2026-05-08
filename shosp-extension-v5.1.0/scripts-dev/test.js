#!/usr/bin/env node
/**
 * npm test — roda os dois suites existentes em sequência e agrega resultados.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SUITES = [
  ['integration', path.join(ROOT, 'utils', 'integration-test.js')],
  ['hooks',       path.join(ROOT, 'utils', 'hooks-test.js')],
];

let failed = 0;
const summaries = [];

for (const [name, file] of SUITES) {
  console.log(`\n────────── ${name} ──────────`);
  const res = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (res.status !== 0) {
    failed++;
    summaries.push(`${name}: FAIL (exit ${res.status})`);
  } else {
    summaries.push(`${name}: OK`);
  }
}

console.log('\n────────── Resumo ──────────');
for (const line of summaries) console.log(line);

if (failed > 0) {
  console.error(`\n${failed} suite(s) falharam`);
  process.exit(1);
}
console.log('\nTodos os suites passaram.');
