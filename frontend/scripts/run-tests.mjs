// Runs test layers one after another, keeps going if one fails, then writes TEST-RESULTS.md.
//   node scripts/run-tests.mjs unit db e2e
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { writeReport } from './test-report.mjs';

const LAYERS = {
  unit: ['vitest', 'run', 'tests/unit', '--reporter=default', '--reporter=json', '--outputFile.json=test-reports/unit.json'],
  db: ['vitest', 'run', 'tests/db', '--reporter=default', '--reporter=json', '--outputFile.json=test-reports/db.json'],
  // playwright.config.js writes test-reports/e2e.json itself.
  e2e: ['playwright', 'test'],
};

const layers = process.argv.slice(2);
const failedLayers = [];
for (const layer of layers) {
  if (!LAYERS[layer]) throw new Error(`Unknown layer "${layer}". Use: ${Object.keys(LAYERS).join(', ')}`);
  // A layer that can't start must not show the last run's results.
  rmSync(`test-reports/${layer}.json`, { force: true });
  const { status } = spawnSync('npx', LAYERS[layer], { stdio: 'inherit' });
  if (status !== 0) failedLayers.push(layer);
}

console.log(`\n📝 ${writeReport({ failedLayers })}`);
process.exit(failedLayers.length ? 1 : 0);
