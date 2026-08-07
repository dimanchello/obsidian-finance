#!/usr/bin/env node
/**
 * Smoke driver for obsidian-finance.
 *
 * This plugin runs inside Obsidian's Electron process and cannot be launched
 * headless. "Running" it means building the bundle and exercising the pure-
 * domain layer that covers all financial logic.
 *
 * Usage:
 *   node .claude/skills/run-obsidian-finance/driver.mjs [--verbose]
 *
 * Exits 0 on success, 1 on any failure.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const verbose = process.argv.includes('--verbose');

function run(cmd, label) {
  if (verbose) console.log(`\n▶ ${label}`);
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    if (verbose) process.stdout.write(out);
    console.log(`  ✓ ${label}`);
    return out;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(e.stderr || e.stdout || e.message);
    process.exit(1);
  }
}

async function smokeDomain() {
  const script = `
import { addMonthsClamped, daysBetweenStr, isoWeek } from '${ROOT}/src/domain/dateMath.ts';
import { round2, sumMoney, isZeroMoney } from '${ROOT}/src/domain/money.ts';
import { parseCSV } from '${ROOT}/src/domain/csv.ts';
import { buildDepositSchedule } from '${ROOT}/src/domain/schedule.ts';
import { parseAccountId, insertAccountId } from '${ROOT}/src/domain/accountId.ts';
import { defaultViewState } from '${ROOT}/src/domain/viewState.ts';

let ok = 0, fail = 0;
function check(label, got, expected) {
  const pass = JSON.stringify(got) === JSON.stringify(expected);
  console.log((pass ? '  ✓' : '  ✗') + ' ' + label + (pass ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(expected)));
  pass ? ok++ : fail++;
}

check('addMonthsClamped Jan31+1', addMonthsClamped('2026-01-31', 1), '2026-02-28');
check('daysBetweenStr Jan01→Mar01', daysBetweenStr('2026-01-01', '2026-03-01'), 59);
check('isoWeek 2026-01-01', isoWeek('2026-01-01'), {year:2026, week:1});
check('isoWeek 2027-01-01 (prev year)', isoWeek('2027-01-01'), {year:2026, week:53});
check('round2(1.005) float repr', round2(1.005), 1.0);
check('sumMoney 0.1+0.2', sumMoney([0.1,0.2]), 0.30);
check('isZeroMoney(0.004)', isZeroMoney(0.004), true);
const rows = parseCSV('date,amount\\n2026-01-01,"1,234.56"');
check('parseCSV quoted comma', rows[1]?.[1], '1,234.56');
check('parseCSV newline in field', parseCSV('a,"b\\nc"\\nd,e')[0]?.[1], 'b\\nc');

const deps = { today: '2026-04-01', newId: (()=>{ let n=0; return ()=>\`id\${++n}\`; })() };
const deposit = { id:'dep1', startDate:'2026-01-01', termMonths:3, amount:10000, rate:12,
  frequency:'monthly', accruals:[], paidDate:undefined, autoReplenish:false,
  status:'active', name:'Test', currency:'RUB', linkedRecordId:'', linkedReplenishId:'' };
const accruals = buildDepositSchedule(deposit, deps);
check('deposit schedule length', accruals.length, 3);
check('deposit first due', accruals[0]?.dueDate, '2026-02-01');

check('parseAccountId missing', parseAccountId('foo\\nbar').kind, 'missing');
const inserted = insertAccountId('\`\`\`finance-account\\nname: x\\n\`\`\`', 0, 2, 'abc123def456');
check('insertAccountId', inserted?.split('\\n')[1], 'id: abc123def456');

const vs = defaultViewState(25);
check('defaultViewState page', vs.page, 0);
check('defaultViewState pageSize', vs.pageSize, 25);

console.log(\`\\n  \${ok} passed, \${fail} failed\`);
if (fail > 0) process.exit(1);
`;

  const tmp = '/tmp/_obsidian_finance_smoke.ts';
  require('fs').writeFileSync(tmp, script);
  run(`npx tsx --tsconfig tsconfig.json ${tmp}`, 'domain smoke tests');
}

console.log('obsidian-finance driver\n');

// 1. Build
run('npm run build', 'build (tsc + esbuild)');

// 2. Verify dist artefacts
for (const f of ['dist/main.js', 'dist/manifest.json', 'dist/styles.css']) {
  if (!existsSync(path.join(ROOT, f))) {
    console.error(`  ✗ missing dist artefact: ${f}`); process.exit(1);
  }
}
console.log('  ✓ dist artefacts present');

// 3. Lint
run('npm run lint', 'lint (0 errors)');

// 4. Unit tests
run('npm test -- --reporter=verbose 2>&1 | tail -8', 'unit tests');

// 5. Domain smoke
// Use child_process + tsx directly to avoid tsx not being on PATH
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
await smokeDomain();

console.log('\nAll checks passed.');
