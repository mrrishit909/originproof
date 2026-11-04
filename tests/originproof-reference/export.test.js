// Report build, JSON round trip, tamper detection, CSV export and semantic
// fingerprint. Expectations are literal values from the spec. SYNTHETIC data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../packages/originproof-engine/src/index.js';
import { loadFixtureJson } from '../../fixtures/originproof/index.js';
import {
  assertDeepFrozen, expectFailure, expectOk, parseCsvRow, splitCsvLines, unquoteCell,
} from './helpers.js';

const {
  analyze, appendReviewNote, buildReport, serializeReportJson, parseReportJson, serializeReportCsv,
  computeSemanticFingerprint, canonicalJson, CSV_EXPORT_COLUMNS, SYNTHETIC_LABEL,
} = engine;

const GENERATED_AT = '2026-11-03T12:00:00Z';
const GOLDEN_FINDING_IDS = ['OP01:MILL-1:production', 'OP02:DOC-2', 'OP03:DOC-3'];
// Code-unit sorted: 'limitations' precedes 'lineage' because 'm' < 'n'.
const REPORT_KEYS = [
  'counts', 'dataClassification', 'engineContractVersion', 'evidence', 'findings', 'generatedAt',
  'input', 'limitations', 'lineage', 'reviewNotes', 'ruleVersion', 'schemaVersion',
  'semanticFingerprint', 'status', 'syntheticLabel',
];
const COUNT_KEYS = [
  'byRule', 'documents', 'edges', 'findings', 'fulfilledPairs', 'originDocuments',
  'productionDocuments', 'quantityMismatchAbsoluteUnits', 'requiredPairs', 'suppliers',
];
const NOTE_TEXTS = ['=SUM(A1)', 'say "hi", ok', '@cmd|calc', '-1 unit short (synthetic)'];
const NOTE_FINDINGS = ['OP02:DOC-2', 'OP03:DOC-3', 'OP01:MILL-1:production', 'OP03:DOC-3'];

async function goldenReport() {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  let notes = [];
  NOTE_TEXTS.forEach((text, i) => {
    notes = expectOk(appendReviewNote(notes, {
      sequence: i + 1, findingId: NOTE_FINDINGS[i], text, recordedAt: GENERATED_AT,
    }, analysis));
  });
  const fingerprint = await computeSemanticFingerprint(analysis);
  const report = expectOk(buildReport({ analysis, reviewNotes: notes, generatedAt: GENERATED_AT, semanticFingerprint: fingerprint }));
  return { analysis, notes, fingerprint, report };
}

test('canonicalJson sorts keys recursively with no whitespace', () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: null, c: 'x' }, 2, 'y'] }), '{"a":[{"c":"x","d":null},2,"y"],"b":1}');
  assert.equal(canonicalJson([]), '[]');
  assert.equal(canonicalJson('s'), '"s"');
  assert.equal(canonicalJson({ z: { y: { x: 1 } }, a: 0 }), '{"a":0,"z":{"y":{"x":1}}}');
});

test('buildReport produces a deep-frozen report with exactly the contract keys', async () => {
  const { analysis, notes, fingerprint, report } = await goldenReport();
  assert.deepEqual(Object.keys(report).sort(), REPORT_KEYS);
  assert.equal(report.schemaVersion, 'originproof.report.v1');
  assert.equal(report.dataClassification, 'SYNTHETIC');
  assert.equal(report.syntheticLabel, SYNTHETIC_LABEL);
  assert.equal(report.engineContractVersion, 'originproof.engine.v1');
  assert.equal(report.ruleVersion, 'OP-DEMO-1');
  assert.equal(report.generatedAt, GENERATED_AT);
  assert.equal(report.semanticFingerprint, fingerprint);
  assert.match(report.semanticFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(report.status, 'FINDINGS_PRESENT');
  assert.deepEqual(report.input, loadFixtureJson('golden'));
  assert.deepEqual(report.findings, analysis.findings);
  assert.deepEqual(report.counts, analysis.counts);
  assert.deepEqual(report.evidence, analysis.evidence);
  assert.deepEqual(report.lineage, analysis.lineage);
  assert.deepEqual(report.reviewNotes, notes);
  assert.deepEqual(report.limitations, analysis.limitations);
  assertDeepFrozen(report);
  assert.throws(() => { report.status = 'certified'; }, TypeError);
});

test('serializeReportJson: sorted keys, 2-space indent, LF only, trailing newline', async () => {
  const { report } = await goldenReport();
  const text = serializeReportJson(report);
  assert.equal(typeof text, 'string');
  assert.ok(text.endsWith('\n'));
  assert.ok(!text.includes('\r'));
  assert.ok(text.startsWith('{\n  "counts"'));
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), REPORT_KEYS);
  assert.deepEqual(Object.keys(parsed.counts), COUNT_KEYS);
  assert.deepEqual(Object.keys(parsed.counts.byRule), ['OP01', 'OP02', 'OP03']);
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(report)));
  assert.equal(serializeReportJson(report), text, 'serialisation is stable');
});

test('export round trip: parseReportJson(serializeReportJson(report)) deep-equals report', async () => {
  const { report } = await goldenReport();
  const text = serializeReportJson(report);
  const parsed = expectOk(parseReportJson(text));
  assert.deepEqual(parsed, report);
  assertDeepFrozen(parsed);
  assert.deepEqual(parsed.findings.map((f) => f.findingId), GOLDEN_FINDING_IDS);
  assert.equal(parsed.findings[2].deltaUnits, -10);
  assert.equal(parsed.counts.quantityMismatchAbsoluteUnits, 10);
  assert.deepEqual(parsed.reviewNotes.map((n) => n.text), NOTE_TEXTS);

  const fromBytes = expectOk(parseReportJson(new TextEncoder().encode(text)));
  assert.deepEqual(fromBytes, report);

  const cleanAnalysis = expectOk(analyze(loadFixtureJson('clean')));
  const cleanReport = expectOk(buildReport({
    analysis: cleanAnalysis, reviewNotes: [], generatedAt: GENERATED_AT,
    semanticFingerprint: await computeSemanticFingerprint(cleanAnalysis),
  }));
  const cleanParsed = expectOk(parseReportJson(serializeReportJson(cleanReport)));
  assert.deepEqual(cleanParsed, cleanReport);
  assert.equal(cleanParsed.status, 'NO_FINDINGS');
  assert.deepEqual(cleanParsed.findings, []);
});

test('tampered reports fail with REPORT_MISMATCH; strict schema failures never throw', async () => {
  const { report } = await goldenReport();
  const text = serializeReportJson(report);
  const tamper = (mutate) => {
    const obj = JSON.parse(text);
    mutate(obj);
    return parseReportJson(JSON.stringify(obj));
  };

  expectFailure(tamper((o) => { o.counts.quantityMismatchAbsoluteUnits = 0; }), 'REPORT_MISMATCH');
  expectFailure(tamper((o) => { o.counts.findings = 0; }), 'REPORT_MISMATCH');
  expectFailure(tamper((o) => { o.counts.byRule.OP03 = 0; }), 'REPORT_MISMATCH');
  expectFailure(tamper((o) => { o.findings[2].observed = 95; o.findings[2].deltaUnits = -5; }), 'REPORT_MISMATCH');
  expectFailure(tamper((o) => { o.findings.pop(); o.counts.findings = 2; o.counts.byRule.OP03 = 0; o.counts.quantityMismatchAbsoluteUnits = 0; }), 'REPORT_MISMATCH');
  expectFailure(tamper((o) => { o.input.documents[1].country = 'AA'; }), 'REPORT_MISMATCH');
  expectFailure(tamper((o) => { o.evidence[3].fulfilled = true; }), 'REPORT_MISMATCH');

  const strictFailures = [
    tamper((o) => { o.extra = 1; }),
    tamper((o) => { o.schemaVersion = 'originproof.report.v2'; }),
    tamper((o) => { o.schemaVersion = 1; }),
    tamper((o) => { delete o.syntheticLabel; }),
    tamper((o) => { delete o.dataClassification; }),
    tamper((o) => { o.dataClassification = 'PRODUCTION'; }),
    tamper((o) => { delete o.findings; }),
    tamper((o) => { o.semanticFingerprint = 'nothex'; }),
  ];
  for (const r of strictFailures) {
    assert.equal(r.ok, false);
    assert.equal(r.value, undefined);
    assert.ok(r.errors.length > 0);
    for (const e of r.errors) {
      assert.equal(typeof e.code, 'string');
      assert.ok(!e.message.includes('\n    at '));
    }
  }

  for (const junk of ['', '{', 'null', '[]', '42', '"text"', undefined, null, 42, new Uint8Array([0xff])]) {
    let result;
    assert.doesNotThrow(() => { result = parseReportJson(junk); });
    assert.equal(result.ok, false);
    assert.equal(result.value, undefined);
  }
  expectOk(parseReportJson(text), 'untampered text still parses');
});

test('serializeReportCsv: header, CRLF, quoting, group order, formula protection, typed delta', async () => {
  const { report, notes } = await goldenReport();
  const text = serializeReportCsv(report);
  assert.equal(typeof text, 'string');
  assert.notEqual(text.charCodeAt(0), 0xfeff, 'no BOM');
  assert.ok(text.includes('\r\n'));
  assert.equal(text.split('\n').length, text.split('\r\n').length, 'every LF is part of a CRLF');
  assert.ok(!/[^\r]\n/.test(text));

  const lines = splitCsvLines(text);
  const header = parseCsvRow(lines[0]);
  assert.deepEqual(header.map(unquoteCell), [...CSV_EXPORT_COLUMNS]);
  assert.equal(header.length, 13);

  const rows = lines.slice(1).map(parseCsvRow);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.length, 13, `row must have 13 cells: ${row.join(',')}`);
    for (const cell of row) assert.match(cell, /^"(?:[^"]|"")*"$/, `cell must be fully quoted: ${cell}`);
    assert.equal(unquoteCell(row[12]), 'SYNTHETIC', 'every row carries data_classification SYNTHETIC');
  }

  const ORDER = ['META', 'COUNT', 'EVIDENCE', 'FINDING', 'REVIEW_NOTE'];
  const types = rows.map((r) => unquoteCell(r[0]));
  for (const t of types) assert.ok(ORDER.includes(t), `unexpected record_type ${t}`);
  const ranks = types.map((t) => ORDER.indexOf(t));
  for (let i = 1; i < ranks.length; i += 1) assert.ok(ranks[i] >= ranks[i - 1], 'groups must be emitted in order');
  assert.ok(types.includes('META'));
  assert.ok(types.includes('COUNT'));
  assert.equal(types.filter((t) => t === 'EVIDENCE').length, 4);
  assert.equal(types.filter((t) => t === 'FINDING').length, 3);
  assert.equal(types.filter((t) => t === 'REVIEW_NOTE').length, notes.length);

  const metaRows = rows.filter((r) => unquoteCell(r[0]) === 'META');
  assert.ok(metaRows.some((r) => r.some((c) => {
    const v = unquoteCell(c);
    return v.includes('SYNTHETIC') && v.includes('not customs law');
  })), 'a META row must include the synthetic label');
  assert.ok(metaRows.some((r) => r.some((c) => unquoteCell(c) === 'OP-DEMO-1')), 'META must carry the rule version');

  const evidenceRows = rows.filter((r) => unquoteCell(r[0]) === 'EVIDENCE');
  assert.deepEqual(evidenceRows.map((r) => [unquoteCell(r[4]), unquoteCell(r[6])]), [
    ['RAW-1', 'origin'], ['MILL-1', 'origin'], ['ASSEMBLER-1', 'origin'], ['MILL-1', 'production'],
  ]);

  const findingRows = rows.filter((r) => unquoteCell(r[0]) === 'FINDING');
  assert.deepEqual(findingRows.map((r) => unquoteCell(r[1])), GOLDEN_FINDING_IDS);
  assert.deepEqual(findingRows.map((r) => unquoteCell(r[2])), ['OP01', 'OP02', 'OP03']);
  for (const r of findingRows) assert.equal(unquoteCell(r[3]), 'OP-DEMO-1');

  const op1 = findingRows[0];
  assert.equal(unquoteCell(op1[4]), 'MILL-1');
  assert.equal(unquoteCell(op1[6]), 'production');
  assert.equal(unquoteCell(op1[7]), 'kind');
  assert.equal(unquoteCell(op1[8]), 'production');

  const op2 = findingRows[1];
  assert.equal(unquoteCell(op2[4]), 'MILL-1');
  assert.equal(unquoteCell(op2[5]), 'DOC-2');
  assert.equal(unquoteCell(op2[6]), 'origin');
  assert.equal(unquoteCell(op2[7]), 'country');
  assert.equal(unquoteCell(op2[8]), 'AA');
  assert.equal(unquoteCell(op2[9]), 'BB');

  const op3 = findingRows[2];
  assert.equal(unquoteCell(op3[4]), 'ASSEMBLER-1');
  assert.equal(unquoteCell(op3[5]), 'DOC-3');
  assert.equal(unquoteCell(op3[7]), 'quantityUnits');
  assert.equal(unquoteCell(op3[8]), '100');
  assert.equal(unquoteCell(op3[9]), '90');
  assert.equal(op3[10], '"-10"', 'delta_units is a typed integer cell emitted verbatim');

  const noteRows = rows.filter((r) => unquoteCell(r[0]) === 'REVIEW_NOTE');
  assert.equal(noteRows[0][11], '"\'=SUM(A1)"', 'formula prefix = gets a leading single quote');
  assert.equal(noteRows[1][11], '"say ""hi"", ok"', 'embedded quotes are doubled');
  assert.equal(noteRows[2][11], '"\'@cmd|calc"', 'formula prefix @ gets a leading single quote');
  assert.equal(noteRows[3][11], '"\'-1 unit short (synthetic)"', 'text starting with - gets a leading single quote');
  assert.ok(noteRows[0].some((c) => unquoteCell(c) === 'OP02:DOC-2'), 'review note row cites its finding id');
  assert.ok(noteRows[2].some((c) => unquoteCell(c) === 'OP01:MILL-1:production'));
  assert.ok(!text.includes('\n"=') && !text.includes(',"='), 'no unprotected formula cell');

  assert.equal(serializeReportCsv(report), text, 'CSV serialisation is stable');
});

test('semantic fingerprint: 64 hex, equal for analysis and report, stable, differs between golden and clean', async () => {
  const { analysis, fingerprint, report } = await goldenReport();
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(await computeSemanticFingerprint(report), fingerprint);
  assert.equal(await computeSemanticFingerprint(analysis), fingerprint, 'stable across repeated runs');
  assert.equal(await computeSemanticFingerprint(expectOk(analyze(loadFixtureJson('golden')))), fingerprint);

  const otherReport = expectOk(buildReport({
    analysis, reviewNotes: [], generatedAt: '2030-01-01T00:00:00Z', semanticFingerprint: fingerprint,
  }));
  assert.equal(await computeSemanticFingerprint(otherReport), fingerprint, 'generatedAt and reviewNotes are excluded');

  const reparsed = expectOk(parseReportJson(serializeReportJson(report)));
  assert.equal(await computeSemanticFingerprint(reparsed), fingerprint);

  const cleanAnalysis = expectOk(analyze(loadFixtureJson('clean')));
  const cleanFingerprint = await computeSemanticFingerprint(cleanAnalysis);
  assert.match(cleanFingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(cleanFingerprint, fingerprint);

  const emptyDocs = expectOk(analyze(loadFixtureJson('adversarial-01-empty-documents')));
  assert.notEqual(await computeSemanticFingerprint(emptyDocs), fingerprint);
});
