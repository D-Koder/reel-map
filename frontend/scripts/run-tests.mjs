// Runs test layers one after another, keeps going if one fails, then writes TEST-RESULTS.md.
//   node scripts/run-tests.mjs unit db e2e
import { spawnSync } from 'node:child_process';
import { writeReport } from './test-report.mjs';

const LAYERS = {
  unit: ['vitest', 'run', 'tests/unit', '--reporter=default', '--reporter=json', '--outputFile.json=test-reports/unit.json'],
  db: ['vitest', 'run', 'tests/db', '--reporter=default', '--reporter=json', '--outputFile.json=test-reports/db.json'],
  // playwright.config.js writes test-reports/e2e.json itself.
  e2e: ['playwright', 'test'],
};

const layers = process.argv.slice(2);
let failed = false;
for (const layer of layers) {
  if (!LAYERS[layer]) throw new Error(`Unknown layer "${layer}". Use: ${Object.keys(LAYERS).join(', ')}`);
  const { status } = spawnSync('npx', LAYERS[layer], { stdio: 'inherit' });
  if (status !== 0) failed = true;
}

console.log(`\n📝 ${writeReport()}`);
process.exit(failed ? 1 : 0);
