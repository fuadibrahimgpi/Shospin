#!/usr/bin/env node
/**
 * npm run check — syntax check de todos os JS da extensão.
 *
 * Roda `node --check` em cada arquivo .js relevante (dist/, scripts/, utils/,
 * scripts-dev/), ignorando node_modules e _archive. Sai com código != 0 se
 * algum arquivo falhar.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['dist', 'scripts', 'utils', 'scripts-dev'];
const SKIP_DIRS = new Set(['_archive', 'node_modules', '.git']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield full;
    }
  }
}

let failed = 0;
let total = 0;

for (const sub of TARGET_DIRS) {
  const dir = path.join(ROOT, sub);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    total++;
    const rel = path.relative(ROOT, file);
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      console.log(`OK    ${rel}`);
    } catch (err) {
      failed++;
      const stderr = (err.stderr && err.stderr.toString()) || err.message;
      console.error(`FAIL  ${rel}\n${stderr}`);
    }
  }
}

console.log(`\n${total - failed}/${total} arquivos OK`);
if (failed > 0) {
  console.error(`${failed} arquivo(s) com erro de sintaxe`);
  process.exit(1);
}
