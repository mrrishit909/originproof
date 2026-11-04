// Shared assertions for the OriginProof reference tests. No engine helpers are
// used here: expectations are literal values derived by hand from the spec.
import assert from 'node:assert/strict';

export function assertDeepFrozen(value, path = '$') {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return;
  assert.ok(Object.isFrozen(value), `expected frozen value at ${path}`);
  for (const key of Reflect.ownKeys(value)) {
    assertDeepFrozen(value[key], `${path}.${String(key)}`);
  }
}

export function expectOk(result) {
  assert.equal(result.ok, true, `expected ok result, got errors ${JSON.stringify(result.errors)}`);
  assert.ok('value' in result, 'ok result must carry a value');
  return result.value;
}

export function expectFailure(result, code, path) {
  assert.equal(typeof result, 'object');
  assert.equal(result.ok, false, `expected failure ${code}, got ok result`);
  assert.equal(result.value, undefined, 'failed results carry no value');
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, 'errors must be a non-empty array');
  const hit = result.errors.find((e) => e.code === code && (path === undefined || e.path === path));
  assert.ok(
    hit,
    `expected error ${code}${path === undefined ? '' : ` at ${path}`}, got ${JSON.stringify(result.errors)}`,
  );
  return hit;
}

export function assertErrorShape(error) {
  assert.deepEqual(Object.keys(error).sort(), ['code', 'message', 'path']);
  assert.equal(typeof error.code, 'string');
  assert.ok(error.code.length > 0);
  assert.equal(typeof error.message, 'string');
  assert.ok(error.message.length > 0);
  assert.equal(typeof error.path, 'string');
  assert.ok(error.path === '' || error.path.startsWith('/'), 'path must be a JSON pointer');
  assert.ok(!error.message.includes('\n    at '), 'message must not contain a stack trace');
  assert.equal(error.stack, undefined);
}

// Minimal RFC4180-style row splitter that keeps cells RAW (quotes retained).
export function parseCsvRow(row) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          cur += '""';
          i += 1;
        } else {
          inQuotes = false;
          cur += '"';
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
      cur += '"';
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function unquoteCell(cell) {
  if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
    return cell.slice(1, -1).replaceAll('""', '"');
  }
  return cell;
}

export function splitCsvLines(text) {
  return text.split('\r\n').filter((line) => line.length > 0);
}
