// Architecture boundary tests for the OriginProof engine (SYNTHETIC demo; OP-DEMO-1 is
// fictional, not customs law). The engine must be pure, dependency-free ESM with a sealed
// public API. These tests read the engine source with node:fs and inspect it as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const ENGINE_DIR = join(ROOT, 'packages', 'originproof-engine');
const SRC_DIR = join(ENGINE_DIR, 'src');
const INDEX_FILE = join(SRC_DIR, 'index.js');

/** Recursively list files under a directory (absolute paths, sorted). */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Remove comments (and optionally string/template/regex literals) from JS source so that
 * token checks do not trip on prose. Template expressions `${...}` are kept as code.
 * Returns { text, unbalanced } where unbalanced lists any literal left open at EOF.
 */
function stripSource(source, { blankLiterals }) {
  const n = source.length;
  const unbalanced = [];
  const REGEX_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
    'case', 'do', 'else', 'yield', 'await',
  ]);

  function regexAllowed(out) {
    let j = out.length - 1;
    while (j >= 0 && /\s/.test(out[j])) j -= 1;
    if (j < 0) return true;
    const c = out[j];
    if (!/[A-Za-z0-9_$)\]]/.test(c)) return true;
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k])) k -= 1;
    return REGEX_KEYWORDS.has(out.slice(k + 1, j + 1));
  }

  function scan(start, stopAtBrace) {
    let out = '';
    let i = start;
    let depth = 0;
    while (i < n) {
      const ch = source[i];
      const nx = source[i + 1];
      if (ch === '/' && nx === '/') {
        const end = source.indexOf('\n', i);
        i = end === -1 ? n : end;
        continue;
      }
      if (ch === '/' && nx === '*') {
        const end = source.indexOf('*/', i + 2);
        if (end === -1) { unbalanced.push('block comment'); return [out, n]; }
        i = end + 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        let closed = false;
        while (j < n) {
          const c = source[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '\n') break;
          if (c === ch) { closed = true; break; }
          j += 1;
        }
        if (!closed) unbalanced.push('string literal');
        out += blankLiterals ? ch + ch : source.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      if (ch === '`') {
        let j = i + 1;
        let closed = false;
        let verbatim = '`';
        let blanked = '`';
        while (j < n) {
          const c = source[j];
          if (c === '\\') { verbatim += source.slice(j, j + 2); j += 2; continue; }
          if (c === '`') { closed = true; verbatim += '`'; blanked += '`'; j += 1; break; }
          if (c === '$' && source[j + 1] === '{') {
            // Template expressions are code: keep them in both forms.
            const [inner, after] = scan(j + 2, true);
            verbatim += '${' + inner + '}';
            blanked += '${' + inner + '}';
            j = after;
            continue;
          }
          verbatim += c;
          j += 1;
        }
        if (!closed) unbalanced.push('template literal');
        out += blankLiterals ? blanked : verbatim;
        i = j;
        continue;
      }
      if (ch === '/' && regexAllowed(out)) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < n) {
          const c = source[j];
          if (c === '\\') { j += 2; continue; }
          if (c === '\n') break;
          if (inClass) { if (c === ']') inClass = false; }
          else if (c === '[') inClass = true;
          else if (c === '/') { closed = true; break; }
          j += 1;
        }
        if (!closed) unbalanced.push('regex literal');
        j += 1;
        while (j < n && /[a-z]/i.test(source[j])) j += 1;
        out += blankLiterals ? '/re/' : source.slice(i, j);
        i = j;
        continue;
      }
      if (stopAtBrace) {
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          if (depth === 0) return [out, i + 1];
          depth -= 1;
        }
      }
      out += ch;
      i += 1;
    }
    if (stopAtBrace) unbalanced.push('template expression');
    return [out, i];
  }

  const [text] = scan(0, false);
  return { text, unbalanced };
}

/** Forbidden source patterns (checked on code with comments and literals removed). */
const FORBIDDEN = [
  ['require(', /\brequire\s*\(/],
  ['eval(', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\b/],
  ['Date.now', /\bDate\.now\b/],
  ['new Date(', /\bnew\s+Date\s*\(/],
  ['Math.random', /\bMath\.random\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['document.', /\bdocument\./],
  ['window.', /\bwindow\./],
  ['innerHTML', /\binnerHTML\b/],
  ['process.', /\bprocess\./],
  ['import(', /\bimport\s*\(/],
];

/** Extract import/export specifiers from comment-stripped source. */
function importSpecifiers(code) {
  const specs = [];
  const fromRe = /\b(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"]*)\1/g;
  const bareRe = /\bimport\s*(['"])([^'"]*)\1/g;
  let m;
  while ((m = fromRe.exec(code)) !== null) specs.push(m[2]);
  while ((m = bareRe.exec(code)) !== null) specs.push(m[2]);
  return specs;
}

function engineSourceFiles() {
  assert.ok(existsSync(SRC_DIR), `engine source directory missing: ${SRC_DIR}`);
  const files = walk(SRC_DIR);
  assert.ok(files.length > 0, 'engine source directory is empty');
  assert.ok(files.includes(INDEX_FILE), 'packages/originproof-engine/src/index.js must exist');
  for (const f of files) {
    assert.notEqual(extname(f), '.cjs', `CommonJS file in engine source: ${f}`);
  }
  return files.filter((f) => extname(f) === '.js' || extname(f) === '.mjs');
}

test('engine source contains no DOM, eval or dynamic code paths', () => {
  const violations = [];
  for (const file of engineSourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const { text, unbalanced } = stripSource(source, { blankLiterals: true });
    assert.deepEqual(unbalanced, [], `unbalanced literal/comment while scanning ${file}`);
    for (const [label, re] of FORBIDDEN) {
      if (re.test(text)) violations.push(`${file}: contains '${label}'`);
    }
  }
  assert.deepEqual(violations, []);
});

test('relative imports end with .js and nothing imports node: or bare packages', () => {
  const violations = [];
  for (const file of engineSourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const { text } = stripSource(source, { blankLiterals: false });
    assert.ok(!/['"]node:/.test(text), `${file}: references a node: specifier`);
    for (const spec of importSpecifiers(text)) {
      if (spec.startsWith('node:')) violations.push(`${file}: imports ${spec}`);
      else if (!(spec.startsWith('./') || spec.startsWith('../'))) {
        violations.push(`${file}: non-relative import ${spec} (engine must be dependency-free)`);
      } else if (!spec.endsWith('.js')) {
        violations.push(`${file}: relative import without .js extension: ${spec}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('root package.json is ESM with no dependencies', () => {
  const file = join(ROOT, 'package.json');
  assert.ok(existsSync(file), 'root package.json missing');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(pkg.type, 'module', 'root package.json must declare "type": "module"');
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.ok(!Object.hasOwn(pkg, key), `root package.json must not have a ${key} key`);
  }
  const enginePkg = join(ENGINE_DIR, 'package.json');
  if (existsSync(enginePkg)) {
    const epkg = JSON.parse(readFileSync(enginePkg, 'utf8'));
    assert.equal(epkg.type ?? 'module', 'module', 'engine package.json must be ESM');
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      assert.ok(!Object.hasOwn(epkg, key), `engine package.json must not have a ${key} key`);
    }
  }
});

test('index.js exports exactly ENGINE_PUBLIC_API', async () => {
  assert.ok(existsSync(INDEX_FILE), 'engine index.js missing');
  const mod = await import(pathToFileURL(INDEX_FILE).href);
  assert.ok(Array.isArray(mod.ENGINE_PUBLIC_API), 'ENGINE_PUBLIC_API must be an array');
  assert.ok(Object.isFrozen(mod.ENGINE_PUBLIC_API), 'ENGINE_PUBLIC_API must be frozen');
  const api = [...mod.ENGINE_PUBLIC_API];
  assert.deepEqual(api, [...api].sort(), 'ENGINE_PUBLIC_API must be sorted');
  assert.deepEqual(Object.keys(mod).sort(), api, 'export surface must equal ENGINE_PUBLIC_API');
  assert.ok(!('default' in mod), 'engine must not have a default export');
  assert.equal(mod.DATA_CLASSIFICATION, 'SYNTHETIC');
  assert.equal(typeof mod.SYNTHETIC_LABEL, 'string');
  assert.match(mod.SYNTHETIC_LABEL, /SYNTHETIC/);
  assert.match(mod.SYNTHETIC_LABEL, /not customs law/);
});
