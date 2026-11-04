// Repository hygiene: no credential-shaped strings anywhere in the tree (SYNTHETIC demo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const MAX_BYTES = 5 * 1024 * 1024;

// Patterns are assembled from fragments so this file never contains a literal match.
const SECRET_PATTERNS = [
  ['AWS access key id', new RegExp('\\b' + 'AK' + 'IA' + '[0-9A-Z]{16}\\b')],
  ['private key block', new RegExp('BEGIN ' + '(?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?' + 'PRIVATE' + ' KEY')],
  ['live secret key prefix', new RegExp('\\bsk' + '[-_]' + 'live' + '[-_]?[0-9A-Za-z]{8,}')],
  ['GitHub token', new RegExp('\\b' + 'gh' + '[pousr]' + '_' + '[0-9A-Za-z]{20,}\\b')],
  ['Slack token', new RegExp('\\b' + 'xox' + '[baprs]' + '-' + '[0-9A-Za-z-]{10,}\\b')],
  ['Google API key', new RegExp('\\b' + 'AI' + 'za' + '[0-9A-Za-z_-]{35}\\b')],
  ['generic bearer secret', new RegExp('\\b' + 'Bearer' + ' ' + '[0-9A-Za-z._-]{40,}\\b')],
];

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && st.size <= MAX_BYTES) out.push(full);
  }
  return out;
}

function looksBinary(buf) {
  const probe = buf.subarray(0, Math.min(buf.length, 8000));
  return probe.includes(0);
}

test('no credential-shaped strings in the repository', () => {
  const files = walk(ROOT, []).filter((f) => f !== SELF);
  assert.ok(files.length > 0, 'repository walk found no files');
  const hits = [];
  for (const file of files) {
    const buf = readFileSync(file);
    if (looksBinary(buf)) continue;
    const text = buf.toString('utf8');
    for (const [label, re] of SECRET_PATTERNS) {
      if (re.test(text)) hits.push(`${relative(ROOT, file)}: ${label}`);
    }
  }
  assert.deepEqual(hits, []);
});
