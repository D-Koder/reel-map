// Turns the last test runs (test-reports/*.json) into TEST-RESULTS.md: one table per flow,
// step by step. Failed flows are open; passed ones are folded (tap to open).
//   node scripts/test-report.mjs
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = join(FRONTEND, 'test-reports');
const OUT = join(FRONTEND, '..', 'TEST-RESULTS.md');

// Which area each test file belongs to.
const AREAS = {
  'caption.test.js': '🔤 Captions',
  'reelPipeline.test.js': '🎬 Reels',
  'collectionFile.test.js': '📦 Import / export',
  'upNext.test.js': '⏭️ Up Next',
  'alerts.test.js': '🔔 Alerts',
  'places.test.js': '📍 Places',
  'device.test.js': '📱 Phone',
  'extras.test.js': '🧩 Extras',
  'account.test.js': '👤 Account',
  'collections.test.js': '🗂️ Collections',
  'security.test.js': '🔒 Security',
  'app.spec.js': '🏠 App',
  'add.spec.js': '➕ Adding places',
  'plan.spec.js': '💘 Planning',
  'social.spec.js': '👯 Sharing',
  'inbox.spec.js': '📥 Shared reels',
};
const LAYERS = [
  { key: 'unit', label: 'Quick checks', where: 'tests/unit' },
  { key: 'db', label: 'Database', where: 'tests/db' },
  { key: 'e2e', label: 'Browser', where: 'tests/e2e' },
];

const KNOWN = /\(known bug\)/i;
const MARK = { pass: '✅', fail: '❌', known: '⚠️', skip: '⏭️' };

const clean = (text = '') => text
  .replace(/\u001b\[[0-9;]*m/g, '') // colours from the terminal
  .split('\n').map((line) => line.trimEnd()).filter(Boolean)
  .filter((line) => !/^\s+at /.test(line)) // stack trace
  .slice(0, 6).join('\n');
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const when = (date) => date.toLocaleString('en-AU', {
  timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});
const readJson = (name) => {
  const file = join(REPORTS, `${name}.json`);
  if (!existsSync(file)) return null;
  return { data: JSON.parse(readFileSync(file, 'utf8')), at: statSync(file).mtime };
};

// A step that failed is ⚠️ when it's a known bug.
const stepMark = (step) => (step.ok ? 'pass' : KNOWN.test(step.title) ? 'known' : 'fail');
const flowMark = (flow) => {
  if (flow.skipped) return 'skip';
  const marks = flow.steps.map((s) => s.mark);
  if (marks.includes('fail') || (flow.failed && !marks.includes('known'))) return 'fail';
  return marks.includes('known') ? 'known' : 'pass';
};

// Vitest: database journeys note their steps on the test (tests/db/helpers.js → step()).
// Unit files have no journeys, so each describe block is a flow and each test is a step.
function fromVitest(report, layer, at) {
  const flows = [];
  for (const file of report.testResults) {
    const fileName = basename(file.name);
    const byFlow = new Map();
    for (const t of file.assertionResults) {
      const skipped = ['skipped', 'pending', 'todo'].includes(t.status);
      const error = clean(t.failureMessages?.join('\n'));
      if (t.meta?.steps || layer.key !== 'unit') {
        const steps = (t.meta?.steps ?? []).map((s) => ({ ...s, mark: stepMark(s), error: clean(s.error) }));
        if (t.status === 'failed' && !steps.some((s) => !s.ok)) steps.push({ title: 'Setting up', mark: 'fail', error });
        flows.push({ fileName, title: t.title, steps, skipped, failed: t.status === 'failed', at, layer, ms: t.duration });
      } else {
        const title = t.ancestorTitles[0] ?? fileName;
        if (!byFlow.has(title)) byFlow.set(title, { fileName, title, steps: [], at, layer, ms: 0 });
        const flow = byFlow.get(title);
        const name = [...t.ancestorTitles.slice(1), t.title].join(' › ');
        flow.steps.push({ title: name, ok: !skipped && t.status !== 'failed', mark: skipped ? 'skip' : t.status === 'failed' ? 'fail' : 'pass', error });
        flow.ms += t.duration ?? 0;
      }
    }
    for (const flow of byFlow.values()) {
      flow.skipped = flow.steps.every((s) => s.mark === 'skip');
      flow.failed = flow.steps.some((s) => s.mark === 'fail');
      flows.push(flow);
    }
  }
  return flows;
}

// Playwright: each test.step is a step; a screenshot is linked when one was taken.
function fromPlaywright(report, layer, at) {
  const flows = [];
  const walk = (suite, file, parents) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const result = t.results.at(-1) ?? {};
        const errors = (result.errors ?? []).map((e) => clean(e.message));
        const steps = (result.steps ?? []).map((s) => {
          const step = { title: s.title, ok: !s.error, error: clean(s.error?.message) };
          return { ...step, mark: stepMark(step) };
        });
        // Soft checks don't stop the step, so their error is only on the test: pin it on the known-bug step.
        if (errors.length && !steps.some((s) => !s.ok)) {
          const known = steps.find((s) => KNOWN.test(s.title));
          if (known) Object.assign(known, { ok: false, mark: 'known', error: errors[0] });
          else steps.push({ title: 'Finishing up', ok: false, mark: 'fail', error: errors[0] });
        }
        const shot = result.attachments?.find((a) => a.name === 'screenshot' && a.path);
        flows.push({
          fileName: basename(file),
          title: [...parents, spec.title].join(' › '),
          steps,
          skipped: result.status === 'skipped' || !t.results.length,
          failed: !['passed', 'skipped'].includes(result.status ?? 'skipped'),
          screenshot: shot && relative(join(FRONTEND, '..'), shot.path),
          at,
          layer,
          ms: result.duration,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, file, [...parents, child.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file ?? suite.title, []);
  return flows;
}

function flowSection(flow) {
  const mark = flowMark(flow);
  const area = AREAS[flow.fileName] ?? '🧪';
  const passed = flow.steps.filter((s) => s.mark === 'pass').length;
  const count = flow.skipped ? 'skipped' : `${passed} of ${flow.steps.length} passed`;
  const open = mark === 'fail' ? ' open' : '';
  const lines = [
    `<details${open}>`,
    `<summary>${MARK[mark]} <b>${area} › ${flow.title}</b> · ${count}</summary>`,
    '',
    `\`${flow.layer.where}/${flow.fileName}\` · ran ${when(flow.at)}${flow.ms ? ` · ${(flow.ms / 1000).toFixed(1)} s` : ''}`,
    '',
  ];
  if (flow.skipped) {
    lines.push(`⏭️ Didn't run. ${flow.layer.key === 'unit' ? '' : 'Usually this means the TEST project login isn\'t filled in (see TESTING.md → One-time setup).'}`);
  } else {
    lines.push('| # | Step | Result |', '|:-:|---|:-:|');
    flow.steps.forEach((s, i) => lines.push(`| ${i + 1} | ${cell(s.title)} | ${MARK[s.mark]} |`));
    if (flow.failed && flow.steps.at(-1)?.mark !== 'pass') lines.push('| | *The rest of this flow didn\'t run* | ⏭️ |');
    for (const [i, s] of flow.steps.entries()) {
      if (s.mark === 'pass' || !s.error) continue;
      const heading = s.mark === 'known' ? '⚠️ Known bug' : '❌ Failed';
      lines.push('', `> **${heading} at step ${i + 1}: ${s.title}**`, '> ```', ...s.error.split('\n').map((l) => `> ${l}`), '> ```');
    }
    if (flow.screenshot && mark === 'fail') lines.push('>', `> 📸 Screenshot: \`${flow.screenshot}\``);
  }
  lines.push('', '</details>', '');
  return lines.join('\n');
}

export function writeReport() {
  const flows = [];
  const missing = [];
  for (const layer of LAYERS) {
    const found = readJson(layer.key);
    if (!found) { missing.push(layer.label); continue; }
    flows.push(...(layer.key === 'e2e' ? fromPlaywright(found.data, layer, found.at) : fromVitest(found.data, layer, found.at)));
  }
  for (const flow of flows) flow.mark = flowMark(flow);

  const count = (mark) => flows.filter((f) => f.mark === mark).length;
  const last = flows.reduce((latest, f) => (f.at > latest ? f.at : latest), new Date(0));
  const out = [
    '# 🧪 Test results',
    '',
    `_Last run ${flows.length ? when(last) : 'never'} · made by \`npm run test:all\` in \`frontend/\` · don't edit by hand_`,
    '',
    `**${MARK.pass} ${count('pass')} passed · ${MARK.fail} ${count('fail')} failed · ${MARK.known} ${count('known')} known bugs · ${MARK.skip} ${count('skip')} skipped**`,
    '',
  ];
  if (missing.length) out.push(`> Not run yet: ${missing.join(', ')}.`, '');
  out.push(`**Key:** ${MARK.pass} passed · ${MARK.fail} failed · ${MARK.known} known bug (expected to fail) · ${MARK.skip} skipped`, '');

  const groups = [
    ['❌ Needs a look', 'fail'],
    ['⚠️ Known bugs', 'known'],
    ['✅ Passed', 'pass'],
    ['⏭️ Skipped', 'skip'],
  ];
  for (const [heading, mark] of groups) {
    const list = flows.filter((f) => f.mark === mark);
    if (!list.length) continue;
    out.push(`## ${heading} (${list.length})`, '');
    for (const layer of LAYERS) {
      const inLayer = list.filter((f) => f.layer.key === layer.key);
      if (!inLayer.length) continue;
      out.push(`### ${layer.label}`, '', ...inLayer.map(flowSection));
    }
  }
  writeFileSync(OUT, out.join('\n'));
  return `Wrote ${relative(process.cwd(), OUT)}: ${count('pass')} passed, ${count('fail')} failed, ${count('known')} known bugs, ${count('skip')} skipped.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(writeReport());
