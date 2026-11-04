// Implementer's own unit tests for the OriginProof engine. Not independent evidence; see tests/originproof-reference/.
// All data below is synthetic and fictional. Rule pack OP-DEMO-1 is not customs law.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as engine from '../src/index.js';

const {
  analyze,
  appendReviewNote,
  buildReport,
  canonicalJson,
  computeSemanticFingerprint,
  escapeHtml,
  parseReportJson,
  parseShipmentJson,
  serializeReportCsv,
  serializeReportJson,
  validateShipment,
  verifySemanticFingerprint,
} = engine;

function golden() {
  return {
    schemaVersion: 1,
    ruleVersion: 'OP-DEMO-1',
    shipment: { id: 'SHIP-1', declaredCountry: 'AA', quantityUnits: 100 },
    suppliers: [
      { id: 'RAW-1', name: 'Raw Material Co (fictional)' },
      { id: 'MILL-1', name: 'Mill One (fictional)' },
      { id: 'ASSEMBLER-1', name: 'Assembler One (fictional)' },
    ],
    edges: [
      { id: 'EDGE-1', fromSupplierId: 'RAW-1', toSupplierId: 'MILL-1' },
      { id: 'EDGE-2', fromSupplierId: 'MILL-1', toSupplierId: 'ASSEMBLER-1' },
    ],
    documents: [
      { id: 'DOC-1', shipmentId: 'SHIP-1', supplierId: 'RAW-1', kind: 'origin', country: 'AA', quantityUnits: 100 },
      { id: 'DOC-2', shipmentId: 'SHIP-1', supplierId: 'MILL-1', kind: 'origin', country: 'BB', quantityUnits: 100 },
      { id: 'DOC-3', shipmentId: 'SHIP-1', supplierId: 'ASSEMBLER-1', kind: 'origin', country: 'AA', quantityUnits: 90 },
    ],
    requiredEvidence: [
      { supplierId: 'RAW-1', kind: 'origin' },
      { supplierId: 'MILL-1', kind: 'origin' },
      { supplierId: 'ASSEMBLER-1', kind: 'origin' },
      { supplierId: 'MILL-1', kind: 'production' },
    ],
  };
}

function clean() {
  const g = golden();
  g.documents[1].country = 'AA';
  g.documents[2].quantityUnits = 100;
  g.documents.push({ id: 'DOC-4', shipmentId: 'SHIP-1', supplierId: 'MILL-1', kind: 'production', country: 'AA', quantityUnits: 100 });
  return g;
}

function codes(result) {
  return result.errors.map((e) => e.code);
}

test('public API surface matches ENGINE_PUBLIC_API', () => {
  assert.deepEqual(Object.keys(engine).sort(), [...engine.ENGINE_PUBLIC_API]);
});

test('golden fixture yields exactly the three expected findings with exact counts', () => {
  const result = analyze(golden());
  assert.equal(result.ok, true);
  const a = result.value;
  assert.deepEqual(
    a.findings.map((f) => f.findingId),
    ['OP01:MILL-1:production', 'OP02:DOC-2', 'OP03:DOC-3'],
  );
  assert.deepEqual(a.counts.byRule, { OP01: 1, OP02: 1, OP03: 1 });
  assert.equal(a.counts.findings, 3);
  assert.equal(a.counts.originDocuments, 3);
  assert.equal(a.counts.requiredPairs, 4);
  assert.equal(a.counts.fulfilledPairs, 3);
  assert.equal(a.counts.quantityMismatchAbsoluteUnits, 10);
  assert.equal(a.findings[1].expected, 'AA');
  assert.equal(a.findings[1].observed, 'BB');
  assert.equal(a.findings[2].expected, 100);
  assert.equal(a.findings[2].observed, 90);
  assert.equal(a.findings[2].deltaUnits, -10);
  assert.deepEqual(a.findings[1].edges, [{ id: 'EDGE-1', fromSupplierId: 'RAW-1', toSupplierId: 'MILL-1' }, { id: 'EDGE-2', fromSupplierId: 'MILL-1', toSupplierId: 'ASSEMBLER-1' }]);
  assert.deepEqual(a.lineage.documents.find((d) => d.documentId === 'DOC-2').edges, [{ id: 'EDGE-1', fromSupplierId: 'RAW-1', toSupplierId: 'MILL-1' }, { id: 'EDGE-2', fromSupplierId: 'MILL-1', toSupplierId: 'ASSEMBLER-1' }]);
  assert.equal(a.findings[0].subject.supplierId, 'MILL-1');
  assert.equal(a.findings[0].subject.kind, 'production');
  assert.equal(a.findings[1].inputRefs[0].pointer, '/documents/1/country');
  assert.equal(a.status, 'FINDINGS_PRESENT');
  assert.equal(a.dataClassification, 'SYNTHETIC');
  assert.equal(Object.isFrozen(a.findings[0].inputRefs), true);
});

test('clean variant yields zero findings and 4/4 fulfilled', () => {
  const result = analyze(clean());
  assert.equal(result.ok, true);
  assert.equal(result.value.findings.length, 0);
  assert.equal(result.value.counts.fulfilledPairs, 4);
  assert.equal(result.value.counts.requiredPairs, 4);
  assert.equal(result.value.status, 'NO_FINDINGS');
});

test('adversarial: empty documents gives four OP01 findings only', () => {
  const g = golden();
  g.documents = [];
  const a = analyze(g).value;
  assert.deepEqual(a.counts.byRule, { OP01: 4, OP02: 0, OP03: 0 });
  assert.equal(a.counts.fulfilledPairs, 0);
  assert.deepEqual(
    a.findings.map((f) => f.findingId),
    ['OP01:ASSEMBLER-1:origin', 'OP01:MILL-1:origin', 'OP01:MILL-1:production', 'OP01:RAW-1:origin'],
  );
});

test('adversarial: duplicate, unknown reference, cycle, bad quantity, unknown fields and versions are rejected', () => {
  const dup = golden();
  dup.documents[1].id = 'DOC-1';
  const dupResult = validateShipment(dup);
  assert.equal(dupResult.ok, false);
  assert.equal(dupResult.errors[0].code, 'DUPLICATE_ID');
  assert.equal(dupResult.errors[0].path, '/documents/1/id');
  assert.equal('value' in dupResult, false);

  const unknown = golden();
  unknown.documents[0].supplierId = 'GHOST-9';
  const unknownResult = analyze(unknown);
  assert.equal(unknownResult.errors[0].code, 'UNKNOWN_REFERENCE');
  assert.equal(unknownResult.errors[0].path, '/documents/0/supplierId');

  const cyclic = golden();
  cyclic.edges.push({ id: 'EDGE-3', fromSupplierId: 'ASSEMBLER-1', toSupplierId: 'RAW-1' });
  const cycleResult = analyze(cyclic);
  assert.equal(cycleResult.errors[0].code, 'CYCLE_DETECTED');

  const selfLoop = golden();
  selfLoop.edges.push({ id: 'EDGE-3', fromSupplierId: 'RAW-1', toSupplierId: 'RAW-1' });
  assert.equal(analyze(selfLoop).errors[0].code, 'CYCLE_DETECTED');

  for (const bad of [-1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1, NaN]) {
    const q = golden();
    q.documents[0].quantityUnits = bad;
    assert.equal(analyze(q).errors[0].code, 'INVALID_QUANTITY', String(bad));
  }

  const extra = golden();
  extra.notes = 'x';
  assert.equal(validateShipment(extra).errors[0].code, 'UNKNOWN_FIELD');

  const version = golden();
  version.ruleVersion = 'OP-DEMO-2';
  assert.equal(validateShipment(version).errors[0].code, 'UNSUPPORTED_RULE_VERSION');

  const schema = golden();
  schema.schemaVersion = 2;
  assert.equal(validateShipment(schema).errors[0].code, 'UNSUPPORTED_SCHEMA_VERSION');

  const country = golden();
  country.shipment.declaredCountry = 'aa';
  assert.equal(validateShipment(country).errors[0].code, 'INVALID_COUNTRY');

  const pair = golden();
  pair.requiredEvidence.push({ supplierId: 'RAW-1', kind: 'origin' });
  assert.equal(validateShipment(pair).errors[0].code, 'DUPLICATE_REQUIRED_PAIR');
});

test('prototype pollution payloads are rejected as unknown fields and do not pollute', () => {
  const text = JSON.stringify(golden()).replace('"schemaVersion":1', '"schemaVersion":1,"__proto__":{"polluted":true}');
  const result = parseShipmentJson(text);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('UNKNOWN_FIELD'));
  assert.equal({}.polluted, undefined);
  const ctor = golden();
  ctor.constructor = { x: 1 };
  assert.ok(codes(validateShipment(ctor)).includes('UNKNOWN_FIELD'));
  assert.equal(validateShipment(Object.create({ schemaVersion: 1 })).errors[0].code, 'INVALID_TYPE');
  const nullProto = Object.assign(Object.create(null), golden());
  assert.equal(validateShipment(nullProto).ok, true);
  assert.equal(validateShipment(new Map()).errors[0].code, 'INVALID_TYPE');
});

test('bounded rejection: oversized, malformed, too many records; prior result unchanged', () => {
  const prior = analyze(golden()).value;
  const snapshot = canonicalJson(prior);
  const big = new Uint8Array(engine.MAX_UPLOAD_BYTES + 1);
  assert.equal(parseShipmentJson(big).errors[0].code, 'INPUT_TOO_LARGE');
  assert.equal(parseShipmentJson('{"schemaVersion":').errors[0].code, 'MALFORMED_JSON');
  assert.equal(parseShipmentJson(new Uint8Array([0xff, 0xfe])).errors[0].code, 'INVALID_UTF8');
  const many = golden();
  for (let i = 0; i < 1000; i += 1) many.suppliers.push({ id: `S-${i}`, name: 'x' });
  assert.equal(analyze(many).errors[0].code, 'TOO_MANY_RECORDS');
  assert.equal(canonicalJson(prior), snapshot);
  assert.throws(() => {
    'use strict';
    prior.findings.push({});
  });
});

test('input mutation after analyze does not alter the analysis', () => {
  const g = golden();
  const a = analyze(g).value;
  g.documents[1].country = 'AA';
  g.documents.pop();
  assert.equal(a.input.documents[1].country, 'BB');
  assert.equal(a.input.documents.length, 3);
});

test('two distinct origin documents contradicting country yield two separate OP02 findings', () => {
  const g = clean();
  g.documents[1].country = 'BB';
  g.documents[2].country = 'CC';
  const a = analyze(g).value;
  assert.deepEqual(a.findings.map((f) => f.findingId), ['OP02:DOC-2', 'OP02:DOC-3']);
});

test('script-like supplier name is preserved as text and escapable', () => {
  const g = golden();
  g.suppliers[0].name = '<script>alert(1)</script>';
  const a = analyze(g).value;
  assert.equal(a.input.suppliers[0].name, '<script>alert(1)</script>');
  assert.equal(escapeHtml(a.input.suppliers[0].name), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('review notes are append-only, validated and separate from findings', () => {
  const a = analyze(golden()).value;
  const first = appendReviewNote([], { sequence: 1, findingId: 'OP02:DOC-2', text: 'Checked with supplier (fictional).', recordedAt: '2026-11-03T12:00:00Z' }, a);
  assert.equal(first.ok, true);
  assert.equal(Object.isFrozen(first.value), true);
  const second = appendReviewNote(first.value, { sequence: 1, findingId: 'OP02:DOC-2', text: 'dup', recordedAt: '2026-11-03T12:00:00Z' }, a);
  assert.equal(second.errors[0].code, 'INVALID_SEQUENCE');
  assert.equal(appendReviewNote([], { sequence: 1, findingId: 'OP09:X', text: 'x', recordedAt: '2026-11-03T12:00:00Z' }, a).errors[0].code, 'UNKNOWN_FINDING');
  assert.equal(appendReviewNote([], { sequence: 1, findingId: 'OP02:DOC-2', text: 'x', recordedAt: '2026-02-30T12:00:00Z' }, a).errors[0].code, 'INVALID_TIMESTAMP');
  assert.equal(a.findings.length, 3);
});

test('report round trip, tamper detection, fingerprint and CSV safety', async () => {
  const a = analyze(golden()).value;
  const fingerprint = await computeSemanticFingerprint(a);
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(await computeSemanticFingerprint(analyze(golden()).value), fingerprint);
  assert.notEqual(await computeSemanticFingerprint(analyze(clean()).value), fingerprint);
  const notes = appendReviewNote([], { sequence: 1, findingId: 'OP03:DOC-3', text: '=SUM(A1:A2) looks like a formula', recordedAt: '2026-11-03T12:00:00Z' }, a).value;
  const built = buildReport({ analysis: a, reviewNotes: notes, generatedAt: '2026-11-03T12:30:00Z', semanticFingerprint: fingerprint });
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  const report = built.value;
  assert.equal(await computeSemanticFingerprint(report), fingerprint);
  assert.equal(await verifySemanticFingerprint(report), true);
  const json = serializeReportJson(report);
  assert.ok(json.endsWith('\n'));
  assert.ok(!json.includes('\r'));
  const parsed = parseReportJson(json);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.deepEqual(parsed.value, report);
  assert.equal(serializeReportJson(parsed.value), json);

  const tampered = JSON.parse(json);
  tampered.counts.quantityMismatchAbsoluteUnits = 0;
  assert.equal(parseReportJson(JSON.stringify(tampered)).errors[0].code, 'REPORT_MISMATCH');
  const unlabeled = JSON.parse(json);
  unlabeled.syntheticLabel = 'real data';
  assert.equal(parseReportJson(JSON.stringify(unlabeled)).errors[0].code, 'MISSING_SYNTHETIC_LABEL');
  const extra = JSON.parse(json);
  extra.certified = true;
  assert.equal(parseReportJson(JSON.stringify(extra)).errors[0].code, 'UNKNOWN_FIELD');
  assert.equal(parseReportJson('nope').errors[0].code, 'MALFORMED_JSON');

  const csv = serializeReportCsv(report);
  const rows = csv.split('\r\n');
  assert.equal(rows[0], engine.CSV_EXPORT_COLUMNS.map((c) => `"${c}"`).join(','));
  assert.ok(rows.every((r) => r === '' || (r.startsWith('"') && r.endsWith('"'))));
  assert.ok(csv.includes('"\'=SUM(A1:A2) looks like a formula"'));
  assert.ok(csv.includes('"OP03:DOC-3"'));
  assert.ok(csv.includes(',"-10",'));
  assert.ok(rows.filter((r) => r !== '').slice(1).every((r) => r.endsWith('"SYNTHETIC"')));
  assert.ok(csv.includes('SYNTHETIC DEMO DATA'));
});

test('OP-A01: aggregate OP03 discrepancy above MAX_SAFE_INTEGER is rejected atomically, never truncated or clamped', () => {
  const overflow = golden();
  overflow.shipment.quantityUnits = 0;
  // Every per-document delta is individually a safe integer; only the SUM overflows.
  overflow.documents.forEach((d, i) => (d.quantityUnits = i < 2 ? Number.MAX_SAFE_INTEGER : 1));
  assert.equal(validateShipment(overflow).ok, true, 'inputs are individually valid');
  const rejected = analyze(overflow);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errors.length, 1);
  assert.equal(rejected.errors[0].code, 'AGGREGATE_OVERFLOW');
  assert.equal(rejected.errors[0].path, '/documents/1/quantityUnits', 'points at the document that pushes the sum past the limit');
  assert.equal('value' in rejected, false, 'no partial findings or counts leak out');
  assert.equal(buildReport({ analysis: rejected.value, generatedAt: '2026-11-03T21:00:00Z', semanticFingerprint: 'x' }).ok, false);

  // Boundary: a sum of exactly MAX_SAFE_INTEGER is still exact and accepted.
  const boundary = golden();
  boundary.shipment.quantityUnits = 0;
  boundary.documents.forEach((d, i) => (d.quantityUnits = i === 0 ? Number.MAX_SAFE_INTEGER - 1 : i === 1 ? 1 : 0));
  const accepted = analyze(boundary);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.counts.quantityMismatchAbsoluteUnits, Number.MAX_SAFE_INTEGER);
  assert.equal(accepted.value.counts.byRule.OP03, 2);
});

test('OP-A02: lineage lists only real edges on routes through the subject, never invented adjacency', () => {
  // Codex repro: A->C and B->C, origin document at C with a country mismatch. A and B are not connected.
  const input = {
    schemaVersion: 1,
    ruleVersion: 'OP-DEMO-1',
    shipment: { id: 'SHIP-1', declaredCountry: 'AA', quantityUnits: 100 },
    suppliers: [{ id: 'A', name: 'Synthetic A (fictional)' }, { id: 'B', name: 'Synthetic B (fictional)' }, { id: 'C', name: 'Synthetic C (fictional)' }],
    edges: [{ id: 'E1', fromSupplierId: 'A', toSupplierId: 'C' }, { id: 'E2', fromSupplierId: 'B', toSupplierId: 'C' }],
    documents: [{ id: 'DOC-C', shipmentId: 'SHIP-1', supplierId: 'C', kind: 'origin', country: 'BB', quantityUnits: 100 }],
    requiredEvidence: [{ supplierId: 'C', kind: 'origin' }],
  };
  const a = analyze(input);
  assert.equal(a.ok, true);
  const f = a.value.findings.find((x) => x.findingId === 'OP02:DOC-C');
  assert.deepEqual(f.edges, [{ id: 'E1', fromSupplierId: 'A', toSupplierId: 'C' }, { id: 'E2', fromSupplierId: 'B', toSupplierId: 'C' }]);
  assert.equal(f.edges.some((e) => e.fromSupplierId === 'A' && e.toSupplierId === 'B'), false);
  assert.equal('path' in f, false);
  const bySupplier = Object.fromEntries(a.value.lineage.suppliers.map((s) => [s.supplierId, s]));
  // E2 (B->C) is not on any route through A, so A's lineage must not show it.
  assert.deepEqual(bySupplier.A.edges, [{ id: 'E1', fromSupplierId: 'A', toSupplierId: 'C' }]);
  assert.deepEqual(bySupplier.A.downstream, ['C']);
});
