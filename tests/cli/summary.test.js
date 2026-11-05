// Regression: `scripts/run.js --summary` crashed after OP-A02 replaced findings[].path with real edges.
// Spawns the CLI on the bundled golden fixture and asserts real-edge rendering. SYNTHETIC data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RUN = join(ROOT, 'scripts', 'run.js');
const GOLDEN = join(ROOT, 'fixtures', 'originproof', 'golden.json');
const CHAIN_EDGES = 'edges=EDGE-1:RAW-1->MILL-1, EDGE-2:MILL-1->ASSEMBLER-1';

function runSummary(file) {
  return spawnSync(process.execPath, [RUN, file, '--summary'], { cwd: ROOT, encoding: 'utf8' });
}

function findingLines(stdout) {
  return stdout.split('\n').filter((l) => l.startsWith('- '));
}

test('summary CLI on golden fixture exits 0 and prints real lineage edges', () => {
  const r = runSummary(GOLDEN);
  assert.equal(r.stderr, '');
  assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
  assert.match(r.stdout, /^status: /m);
  assert.match(r.stdout, /^counts: /m);
  const lines = findingLines(r.stdout);
  assert.deepEqual(
    lines.map((l) => l.split(/\s+/)[1]),
    ['OP01:MILL-1:production', 'OP02:DOC-2', 'OP03:DOC-3'],
  );
  for (const line of lines) {
    assert.ok(line.endsWith(`  ${CHAIN_EDGES}`), line);
    assert.ok(!line.includes('path='), line);
    assert.ok(!line.includes('RAW-1 -> MILL-1 -> ASSEMBLER-1'), `invented node path: ${line}`);
  }
});

test('summary CLI renders zero-edge findings as (none) without crashing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'originproof-summary-'));
  try {
    const fixture = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    fixture.edges = [];
    const file = join(dir, 'golden-no-edges.json');
    writeFileSync(file, JSON.stringify(fixture));
    const r = runSummary(file);
    assert.equal(r.stderr, '');
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`);
    const lines = findingLines(r.stdout);
    assert.ok(lines.length > 0);
    for (const line of lines) assert.ok(line.endsWith('  edges=(none)'), line);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
