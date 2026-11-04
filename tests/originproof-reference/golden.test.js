// Golden / clean fixture expectations. All values are literal, derived by hand
// from docs/specs/ORIGINPROOF-VERTICAL-SLICE.md. SYNTHETIC data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../packages/originproof-engine/src/index.js';
import { loadFixtureJson, loadFixtureText, loadFixtureBytes } from '../../fixtures/originproof/index.js';
import { assertDeepFrozen, expectOk } from './helpers.js';

const { analyze, parseShipmentJson, validateShipment } = engine;

const CHAIN = ['RAW-1', 'MILL-1', 'ASSEMBLER-1'];
// Real input edges of the linear golden chain; lineage reports these, never a node list (OP-A02).
const CHAIN_EDGES = [
  { id: 'EDGE-1', fromSupplierId: 'RAW-1', toSupplierId: 'MILL-1' },
  { id: 'EDGE-2', fromSupplierId: 'MILL-1', toSupplierId: 'ASSEMBLER-1' },
];
const GOLDEN_FINDING_IDS = ['OP01:MILL-1:production', 'OP02:DOC-2', 'OP03:DOC-3'];
const GOLDEN_COUNTS = {
  findings: 3,
  byRule: { OP01: 1, OP02: 1, OP03: 1 },
  suppliers: 3,
  edges: 2,
  documents: 3,
  originDocuments: 3,
  productionDocuments: 0,
  requiredPairs: 4,
  fulfilledPairs: 3,
  quantityMismatchAbsoluteUnits: 10,
};
const GOLDEN_EVIDENCE = [
  { supplierId: 'RAW-1', kind: 'origin', fulfilled: true, documentIds: ['DOC-1'] },
  { supplierId: 'MILL-1', kind: 'origin', fulfilled: true, documentIds: ['DOC-2'] },
  { supplierId: 'ASSEMBLER-1', kind: 'origin', fulfilled: true, documentIds: ['DOC-3'] },
  { supplierId: 'MILL-1', kind: 'production', fulfilled: false, documentIds: [] },
];
const CLEAN_COUNTS = {
  findings: 0,
  byRule: { OP01: 0, OP02: 0, OP03: 0 },
  suppliers: 3,
  edges: 2,
  documents: 4,
  originDocuments: 3,
  productionDocuments: 1,
  requiredPairs: 4,
  fulfilledPairs: 4,
  quantityMismatchAbsoluteUnits: 0,
};
const CLEAN_EVIDENCE = [
  { supplierId: 'RAW-1', kind: 'origin', fulfilled: true, documentIds: ['DOC-1'] },
  { supplierId: 'MILL-1', kind: 'origin', fulfilled: true, documentIds: ['DOC-2'] },
  { supplierId: 'ASSEMBLER-1', kind: 'origin', fulfilled: true, documentIds: ['DOC-3'] },
  { supplierId: 'MILL-1', kind: 'production', fulfilled: true, documentIds: ['DOC-4'] },
];

function assertInputRefsWellFormed(finding) {
  assert.ok(Array.isArray(finding.inputRefs) && finding.inputRefs.length > 0, `${finding.findingId} must cite inputs`);
  const pointers = finding.inputRefs.map((ref) => ref.pointer);
  for (const ref of finding.inputRefs) {
    assert.equal(typeof ref.pointer, 'string');
    assert.ok(ref.pointer.startsWith('/'), `pointer must be a JSON pointer: ${ref.pointer}`);
    assert.equal(typeof ref.recordType, 'string');
    // required-evidence pairs have no id of their own, so recordId may be null there
    assert.ok(typeof ref.recordId === 'string' || ref.recordId === null, 'recordId must be a string or null');
    assert.ok('value' in ref, 'inputRef must carry the cited value');
  }
  assert.deepEqual(pointers, [...pointers].sort(), 'inputRefs must be sorted by pointer');
}

test('public constants match the engine contract literally', () => {
  assert.equal(engine.ENGINE_CONTRACT_VERSION, 'originproof.engine.v1');
  assert.equal(engine.SCHEMA_VERSION, 1);
  assert.equal(engine.RULE_VERSION, 'OP-DEMO-1');
  assert.deepEqual([...engine.RULE_IDS], ['OP01', 'OP02', 'OP03']);
  assert.deepEqual([...engine.EVIDENCE_KINDS], ['origin', 'production']);
  assert.equal(engine.MAX_UPLOAD_BYTES, 1048576);
  assert.equal(engine.MAX_RECORDS, 1000);
  assert.equal(engine.MAX_STRING_LENGTH, 500);
  assert.equal(engine.MAX_NOTE_LENGTH, 2000);
  assert.equal(engine.DATA_CLASSIFICATION, 'SYNTHETIC');
  assert.equal(typeof engine.SYNTHETIC_LABEL, 'string');
  assert.ok(engine.SYNTHETIC_LABEL.includes('SYNTHETIC'));
  assert.ok(engine.SYNTHETIC_LABEL.includes('not customs law'));
  assert.equal(engine.REPORT_SCHEMA_VERSION, 'originproof.report.v2');
  assert.deepEqual([...engine.CSV_EXPORT_COLUMNS], [
    'record_type', 'id', 'rule_id', 'rule_version', 'supplier_id', 'document_id', 'kind',
    'field', 'expected', 'observed', 'delta_units', 'text', 'data_classification',
  ]);
  assert.ok(Object.isFrozen(engine.LIMITATIONS));
  assert.ok(Array.isArray(engine.LIMITATIONS) && engine.LIMITATIONS.length > 0);
  for (const item of engine.LIMITATIONS) assert.equal(typeof item, 'string');
});

test('ENGINE_PUBLIC_API is a frozen sorted list of every exported name', () => {
  const api = engine.ENGINE_PUBLIC_API;
  assert.ok(Object.isFrozen(api));
  assert.deepEqual([...api], [...api].sort());
  assert.deepEqual([...api].sort(), Object.keys(engine).sort());
  for (const name of [
    'parseShipmentJson', 'validateShipment', 'analyze', 'appendReviewNote', 'buildReport',
    'serializeReportJson', 'parseReportJson', 'serializeReportCsv', 'computeSemanticFingerprint',
    'canonicalJson', 'escapeHtml', 'ENGINE_PUBLIC_API', 'SYNTHETIC_LABEL', 'LIMITATIONS',
  ]) {
    assert.ok(api.includes(name), `missing export ${name}`);
  }
  for (const fn of [
    'parseShipmentJson', 'validateShipment', 'analyze', 'appendReviewNote', 'buildReport',
    'serializeReportJson', 'parseReportJson', 'serializeReportCsv', 'computeSemanticFingerprint',
    'canonicalJson', 'escapeHtml',
  ]) {
    assert.equal(typeof engine[fn], 'function', `${fn} must be a function`);
  }
});

test('validateShipment(golden) returns a deep-frozen verbatim clone', () => {
  const raw = loadFixtureJson('golden');
  const value = expectOk(validateShipment(raw));
  assert.notEqual(value, raw, 'must be a clone, not the input object');
  assert.deepEqual(value, loadFixtureJson('golden'));
  assertDeepFrozen(value);
  assert.deepEqual(value.documents.map((d) => d.id), ['DOC-1', 'DOC-2', 'DOC-3']);
  assert.deepEqual(value.requiredEvidence.map((p) => `${p.supplierId}:${p.kind}`), [
    'RAW-1:origin', 'MILL-1:origin', 'ASSEMBLER-1:origin', 'MILL-1:production',
  ]);
});

test('parseShipmentJson accepts bytes, ArrayBuffer and string and reports the source', () => {
  const text = loadFixtureText('golden');
  const bytes = loadFixtureBytes('golden');
  const expectedBytes = new TextEncoder().encode(text).length;

  const fromBytes = expectOk(parseShipmentJson(bytes, { sourceName: 'golden.json' }));
  assert.deepEqual(fromBytes.source, { sourceName: 'golden.json', format: 'json', byteLength: expectedBytes });
  assert.deepEqual(fromBytes.input, loadFixtureJson('golden'));
  assertDeepFrozen(fromBytes);

  const fromBuffer = expectOk(parseShipmentJson(bytes.buffer, { sourceName: 'golden.json' }));
  assert.equal(fromBuffer.source.byteLength, expectedBytes);
  assert.deepEqual(fromBuffer.input, loadFixtureJson('golden'));

  const fromString = expectOk(parseShipmentJson(text));
  assert.equal(fromString.source.format, 'json');
  assert.equal(fromString.source.byteLength, expectedBytes);
  assert.equal(typeof fromString.source.sourceName, 'string');
  assert.deepEqual(fromString.input, loadFixtureJson('golden'));
});

test('golden analysis: header, status and exact finding ids in rule order', () => {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  assert.equal(analysis.engineContractVersion, 'originproof.engine.v1');
  assert.equal(analysis.schemaVersion, 1);
  assert.equal(analysis.ruleVersion, 'OP-DEMO-1');
  assert.equal(analysis.dataClassification, 'SYNTHETIC');
  assert.equal(analysis.syntheticLabel, engine.SYNTHETIC_LABEL);
  assert.ok(analysis.syntheticLabel.includes('SYNTHETIC'));
  assert.equal(analysis.status, 'FINDINGS_PRESENT');
  assert.ok(['FINDINGS_PRESENT', 'NO_FINDINGS'].includes(analysis.status));
  assert.deepEqual(analysis.input, loadFixtureJson('golden'), 'input records preserved verbatim');
  assert.deepEqual(analysis.findings.map((f) => f.findingId), GOLDEN_FINDING_IDS);
  assert.deepEqual(analysis.findings.map((f) => f.ruleId), ['OP01', 'OP02', 'OP03']);
  assert.ok(Array.isArray(analysis.limitations) && analysis.limitations.length > 0);
  for (const item of analysis.limitations) assert.equal(typeof item, 'string');
});

test('golden finding OP01:MILL-1:production cites the absent required pair', () => {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  const f = analysis.findings[0];
  assert.equal(f.findingId, 'OP01:MILL-1:production');
  assert.equal(f.ruleId, 'OP01');
  assert.equal(f.ruleVersion, 'OP-DEMO-1');
  assert.equal(f.severity, 'REVIEW_REQUIRED');
  assert.deepEqual(f.subject, { type: 'requiredEvidence', supplierId: 'MILL-1', kind: 'production' });
  assert.equal(f.field, 'kind');
  assert.equal(f.expected, 'production');
  assert.equal(f.observed, null);
  assert.equal(f.deltaUnits, null);
  assert.deepEqual(f.source, { rulePack: 'OP-DEMO-1', clause: 'OP01', illustrative: true });
  assert.equal(typeof f.rationale, 'string');
  assert.ok(f.rationale.length > 0);
  assert.ok(f.edges.some((e) => e.fromSupplierId === 'MILL-1' || e.toSupplierId === 'MILL-1'));
  assertInputRefsWellFormed(f);
  assert.ok(f.inputRefs.some((r) => r.pointer.startsWith('/requiredEvidence/3')), 'must cite the required pair');
});

test('golden finding OP02:DOC-2 expects AA, observes BB, path RAW-1 -> MILL-1 -> ASSEMBLER-1', () => {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  const f = analysis.findings[1];
  assert.equal(f.findingId, 'OP02:DOC-2');
  assert.equal(f.ruleId, 'OP02');
  assert.equal(f.ruleVersion, 'OP-DEMO-1');
  assert.equal(f.severity, 'REVIEW_REQUIRED');
  assert.deepEqual(f.subject, { type: 'document', documentId: 'DOC-2', supplierId: 'MILL-1', kind: 'origin' });
  assert.equal(f.field, 'country');
  assert.equal(f.expected, 'AA');
  assert.equal(f.observed, 'BB');
  assert.equal(f.deltaUnits, null);
  assert.deepEqual(f.edges, CHAIN_EDGES);
  assert.deepEqual(f.source, { rulePack: 'OP-DEMO-1', clause: 'OP02', illustrative: true });
  assertInputRefsWellFormed(f);
  const docRef = f.inputRefs.find((r) => r.pointer.startsWith('/documents/1'));
  assert.ok(docRef, 'must cite DOC-2 at /documents/1');
  assert.equal(docRef.recordId, 'DOC-2');
});

test('golden finding OP03:DOC-3 expects 100, observes 90, delta -10', () => {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  const f = analysis.findings[2];
  assert.equal(f.findingId, 'OP03:DOC-3');
  assert.equal(f.ruleId, 'OP03');
  assert.equal(f.severity, 'REVIEW_REQUIRED');
  assert.deepEqual(f.subject, { type: 'document', documentId: 'DOC-3', supplierId: 'ASSEMBLER-1', kind: 'origin' });
  assert.equal(f.field, 'quantityUnits');
  assert.equal(f.expected, 100);
  assert.equal(f.observed, 90);
  assert.equal(f.deltaUnits, -10);
  assert.deepEqual(f.source, { rulePack: 'OP-DEMO-1', clause: 'OP03', illustrative: true });
  assert.ok(f.edges.some((e) => e.fromSupplierId === 'ASSEMBLER-1' || e.toSupplierId === 'ASSEMBLER-1'));
  assertInputRefsWellFormed(f);
  const docRef = f.inputRefs.find((r) => r.pointer.startsWith('/documents/2'));
  assert.ok(docRef, 'must cite DOC-3 at /documents/2');
  assert.equal(docRef.recordId, 'DOC-3');
});

test('golden counts, evidence and lineage are exact', () => {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  assert.deepEqual(analysis.counts, GOLDEN_COUNTS);
  assert.deepEqual(analysis.evidence, GOLDEN_EVIDENCE);

  assert.deepEqual(analysis.lineage.order, CHAIN);
  const bySupplier = Object.fromEntries(analysis.lineage.suppliers.map((s) => [s.supplierId, s]));
  assert.deepEqual(Object.keys(bySupplier).sort(), [...CHAIN].sort());
  assert.deepEqual(bySupplier['RAW-1'].upstream, []);
  assert.deepEqual(bySupplier['MILL-1'].upstream, ['RAW-1']);
  assert.deepEqual(bySupplier['MILL-1'].downstream, ['ASSEMBLER-1']);
  assert.deepEqual(bySupplier['MILL-1'].edges, CHAIN_EDGES);
  assert.deepEqual(bySupplier['ASSEMBLER-1'].downstream, []);
  assert.ok(bySupplier['ASSEMBLER-1'].upstream.includes('MILL-1'));
  assert.ok(bySupplier['RAW-1'].downstream.includes('MILL-1'));

  const doc2 = analysis.lineage.documents.find((d) => d.documentId === 'DOC-2');
  assert.deepEqual(doc2, { documentId: 'DOC-2', supplierId: 'MILL-1', edges: CHAIN_EDGES });
  assert.deepEqual(analysis.lineage.documents.map((d) => d.documentId), ['DOC-1', 'DOC-2', 'DOC-3']);
});

test('clean variant: zero findings, fulfilled 4/4, status NO_FINDINGS', () => {
  const analysis = expectOk(analyze(loadFixtureJson('clean')));
  assert.equal(analysis.status, 'NO_FINDINGS');
  assert.notEqual(analysis.status, 'compliant');
  assert.notEqual(analysis.status, 'certified');
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.counts, CLEAN_COUNTS);
  assert.deepEqual(analysis.evidence, CLEAN_EVIDENCE);
  assert.deepEqual(analysis.lineage.order, CHAIN);
  assert.deepEqual(analysis.input, loadFixtureJson('clean'));
  assert.equal(analysis.dataClassification, 'SYNTHETIC');
});

test('analysis is deep-frozen and strict-mode mutation attempts throw', () => {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  assertDeepFrozen(analysis);
  assert.throws(() => { analysis.status = 'certified'; }, TypeError);
  assert.throws(() => { analysis.findings.push({ findingId: 'FAKE' }); }, TypeError);
  assert.throws(() => { analysis.findings[2].deltaUnits = 0; }, TypeError);
  assert.throws(() => { analysis.counts.quantityMismatchAbsoluteUnits = 0; }, TypeError);
  assert.throws(() => { analysis.counts.byRule.OP03 = 0; }, TypeError);
  assert.throws(() => { analysis.input.documents[1].country = 'AA'; }, TypeError);
  assert.throws(() => { analysis.evidence[3].fulfilled = true; }, TypeError);
  assert.throws(() => { delete analysis.counts; }, TypeError);
  assert.equal(analysis.status, 'FINDINGS_PRESENT');
  assert.equal(analysis.findings.length, 3);
  assert.equal(analysis.counts.quantityMismatchAbsoluteUnits, 10);
});

test('mutating the raw input after analyze does not change the analysis', () => {
  const raw = loadFixtureJson('golden');
  const analysis = expectOk(analyze(raw));
  raw.documents[1].country = 'AA';
  raw.documents[2].quantityUnits = 100;
  raw.shipment.quantityUnits = 1;
  raw.suppliers[0].name = 'changed';
  raw.documents.push({ id: 'DOC-9', shipmentId: 'SHIP-1', supplierId: 'MILL-1', kind: 'production', country: 'AA', quantityUnits: 100 });
  raw.requiredEvidence.length = 0;
  assert.equal(analysis.input.documents[1].country, 'BB');
  assert.equal(analysis.input.documents[2].quantityUnits, 90);
  assert.equal(analysis.input.shipment.quantityUnits, 100);
  assert.equal(analysis.input.suppliers[0].name, 'Synthetic Raw Materials (fictional)');
  assert.equal(analysis.input.documents.length, 3);
  assert.equal(analysis.input.requiredEvidence.length, 4);
  assert.deepEqual(analysis.findings.map((f) => f.findingId), GOLDEN_FINDING_IDS);
  assert.deepEqual(analysis.counts, GOLDEN_COUNTS);
});

test('analyze is deterministic across raw and parsed inputs', () => {
  const fromRaw = expectOk(analyze(loadFixtureJson('golden')));
  const parsed = expectOk(parseShipmentJson(loadFixtureBytes('golden')));
  const fromParsed = expectOk(analyze(parsed.input));
  const again = expectOk(analyze(loadFixtureJson('golden')));
  assert.equal(JSON.stringify(fromParsed), JSON.stringify(fromRaw));
  assert.equal(JSON.stringify(again), JSON.stringify(fromRaw));
  assert.deepEqual(fromParsed, fromRaw);
});
