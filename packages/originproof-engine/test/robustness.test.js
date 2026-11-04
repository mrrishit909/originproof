// Robustness: untrusted-input entry points never throw, never return partial values, never pollute prototypes.
// Synthetic data only; rule pack OP-DEMO-1 is fictional, not customs law.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as engine from '../src/index.js';

const JUNK = [
  undefined,
  null,
  0,
  -0,
  1e3,
  NaN,
  Infinity,
  true,
  '',
  'text',
  '{"a":',
  [],
  [1, 2],
  {},
  new Map(),
  new Set(),
  new Date(0),
  Object.create(null),
  Object.create({ schemaVersion: 1 }),
  () => {},
  Symbol('x'),
  10n,
  new Uint8Array([0x7b]),
  new ArrayBuffer(4),
];

function assertFailure(result) {
  assert.equal(typeof result, 'object');
  assert.equal(result.ok, false);
  assert.equal('value' in result, false);
  assert.ok(result.errors.length > 0);
  for (const e of result.errors) {
    assert.deepEqual(Object.keys(e).sort(), ['code', 'message', 'path']);
    assert.ok(!e.message.includes('\n    at '));
  }
}

test('untrusted-input entry points never throw on junk arguments', () => {
  for (const junk of JUNK) {
    assertFailure(engine.validateShipment(junk));
    assertFailure(engine.analyze(junk));
    assertFailure(engine.appendReviewNote(junk, junk, junk));
    assertFailure(engine.buildReport(junk));
    if (typeof junk === 'string' || junk instanceof Uint8Array || junk instanceof ArrayBuffer) {
      // bytes/strings that are not valid shipments or reports must still fail cleanly
      assertFailure(engine.parseShipmentJson(junk));
      assertFailure(engine.parseReportJson(junk));
    } else {
      assertFailure(engine.parseShipmentJson(junk));
      assertFailure(engine.parseReportJson(junk));
    }
  }
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test('ids with pointer-special and quote characters are escaped in paths and safe in CSV', () => {
  const g = {
    schemaVersion: 1,
    ruleVersion: 'OP-DEMO-1',
    shipment: { id: 'S/1~x"', declaredCountry: 'AA', quantityUnits: 1 },
    suppliers: [{ id: '=A/B~1', name: '=HYPERLINK("x")\n@cmd' }],
    edges: [],
    documents: [{ id: 'D/1', shipmentId: 'S/1~x"', supplierId: '=A/B~1', kind: 'origin', country: 'BB', quantityUnits: 1 }],
    requiredEvidence: [{ supplierId: '=A/B~1', kind: 'production' }, { supplierId: 'GHOST', kind: 'origin' }],
  };
  const bad = engine.validateShipment(g);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors[0].path, '/requiredEvidence/1/supplierId');
  g.requiredEvidence.pop();
  const a = engine.analyze(g);
  assert.equal(a.ok, true, JSON.stringify(a.errors));
  assert.deepEqual(a.value.findings.map((f) => f.findingId), ['OP01:=A/B~1:production', 'OP02:D/1']);
  assert.equal(a.value.findings[0].inputRefs.some((r) => r.pointer === '/suppliers/0/id'), true);
  const report = engine.buildReport({ analysis: a.value, generatedAt: '2026-11-03T00:00:00Z', semanticFingerprint: 'a'.repeat(64) }).value;
  const csv = engine.serializeReportCsv(report);
  for (const line of csv.split('\r\n').filter((l) => l.length > 0)) {
    for (const cell of line.split('","')) assert.ok(!/^"?[=+\-@\t\r]/.test(cell.replace(/^"/, '')) || cell.startsWith('"\'') || /^"-?\d+"$/.test(cell), cell);
  }
  assert.ok(csv.includes('"\'=A/B~1"'));
  const reparsed = engine.parseReportJson(engine.serializeReportJson(report));
  assert.equal(reparsed.ok, true, JSON.stringify(reparsed.errors));
  assert.deepEqual(reparsed.value, report);
});

test('parseReportJson and buildReport reject deep nesting, non-finite numbers and sparse arrays without throwing', async () => {
  const g = engine.analyze(engine.validateShipment(JSON.parse(JSON.stringify({
    schemaVersion: 1,
    ruleVersion: 'OP-DEMO-1',
    shipment: { id: 'S', declaredCountry: 'AA', quantityUnits: 1 },
    suppliers: [{ id: 'A', name: 'n' }],
    edges: [],
    documents: [],
    requiredEvidence: [],
  }))).value).value;
  const fp = await engine.computeSemanticFingerprint(g);
  const text = engine.serializeReportJson(engine.buildReport({ analysis: g, generatedAt: '2026-11-03T00:00:00Z', semanticFingerprint: fp }).value);
  const deep = '['.repeat(3000) + ']'.repeat(3000);
  for (const key of ['limitations', 'findings', 'counts', 'evidence', 'lineage']) {
    const obj = JSON.parse(text);
    obj[key] = JSON.parse(deep);
    assertFailure(engine.parseReportJson(JSON.stringify(obj)));
    const infinite = JSON.stringify(obj).replace(`"${key}":`, `"${key}":[1e999],"_x":`);
    assertFailure(engine.parseReportJson(infinite.replace('"_x":', `"${key}_":`)));
  }
  assertFailure(engine.parseReportJson(text.replace('"limitations": [', '"limitations": [1e999,')));
  for (const patch of [{ findings: [NaN] }, { counts: { a: 10n } }, { findings: [Symbol('s')] }, { findings: [() => {}] }, { findings: [1, , 2] }]) {
    assertFailure(engine.buildReport({ analysis: { ...g, ...patch }, generatedAt: '2026-11-03T00:00:00Z', semanticFingerprint: fp }));
  }
  const sparse = { schemaVersion: 1, ruleVersion: 'OP-DEMO-1', shipment: { id: 'S', declaredCountry: 'AA', quantityUnits: 1 }, suppliers: new Array(3), edges: [], documents: [], requiredEvidence: [] };
  assertFailure(engine.validateShipment(sparse));
  assertFailure(engine.analyze(sparse));
});

test('deeply nested and oversized inputs are rejected without throwing', () => {
  const deep = '['.repeat(100000) + ']'.repeat(100000);
  assertFailure(engine.parseShipmentJson(deep));
  const longString = 'x'.repeat(engine.MAX_STRING_LENGTH + 1);
  const g = engine.analyze({
    schemaVersion: 1,
    ruleVersion: 'OP-DEMO-1',
    shipment: { id: 'S', declaredCountry: 'AA', quantityUnits: 1 },
    suppliers: [{ id: 'A', name: longString }],
    edges: [],
    documents: [],
    requiredEvidence: [],
  });
  assert.equal(g.errors[0].code, 'STRING_TOO_LONG');
  const wide = { schemaVersion: 1, ruleVersion: 'OP-DEMO-1', shipment: { id: 'S', declaredCountry: 'AA', quantityUnits: 1 }, suppliers: [], edges: [], documents: [], requiredEvidence: [] };
  for (let i = 0; i < 999; i += 1) wide.suppliers.push({ id: `S${i}`, name: 'n' });
  for (let i = 1; i < 999; i += 1) wide.edges.push({ id: `E${i}`, fromSupplierId: `S${i - 1}`, toSupplierId: `S${i}` });
  assert.equal(engine.analyze(wide).errors[0].code, 'TOO_MANY_RECORDS');
  wide.edges.length = 1;
  const ok = engine.analyze(wide);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.lineage.order.length, 999);
});
