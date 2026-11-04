// The eight adversarial cases plus bounded-rejection and input-safety checks.
// Expectations are literal values derived by hand from the spec. SYNTHETIC data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../packages/originproof-engine/src/index.js';
import {
  FIXTURE_NAMES, NON_JSON_FIXTURE_NAMES, loadFixtureJson, loadFixtureText, loadFixtureBytes,
} from '../../fixtures/originproof/index.js';
import { assertDeepFrozen, assertErrorShape, expectFailure, expectOk } from './helpers.js';

const { analyze, parseShipmentJson, validateShipment, escapeHtml } = engine;
const MAX_BYTES = 1048576;
const GOLDEN_FINDING_IDS = ['OP01:MILL-1:production', 'OP02:DOC-2', 'OP03:DOC-3'];
const SCHEMA_KEYS = ['documents', 'edges', 'requiredEvidence', 'ruleVersion', 'schemaVersion', 'shipment', 'suppliers'];

function withBulkSuppliers(count) {
  // golden has 12 records: 3 suppliers + 2 edges + 3 documents + 4 required pairs
  const fx = loadFixtureJson('golden');
  for (let i = 0; i < count; i += 1) {
    fx.suppliers.push({ id: `BULK-${i}`, name: `Bulk synthetic supplier ${i}` });
  }
  return fx;
}

function paddedGoldenBytes(size) {
  const golden = new TextEncoder().encode(loadFixtureText('golden'));
  const out = new Uint8Array(size).fill(0x20);
  out.set(golden, 0);
  return out;
}

test('fixtures: every named fixture loads; JSON fixtures carry exactly the schema keys', () => {
  assert.ok(Object.isFrozen(FIXTURE_NAMES));
  assert.equal(FIXTURE_NAMES.length, 12);
  for (const name of FIXTURE_NAMES) {
    const text = loadFixtureText(name);
    assert.ok(text.length > 0, `${name} is empty`);
    if (NON_JSON_FIXTURE_NAMES.includes(name)) {
      assert.throws(() => JSON.parse(text), SyntaxError);
      continue;
    }
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), SCHEMA_KEYS, `${name} must have exactly the schema keys`);
  }
});

test('adversarial 01: empty documents -> four OP01 findings only, fulfilled 0/4', () => {
  const analysis = expectOk(analyze(loadFixtureJson('adversarial-01-empty-documents')));
  assert.equal(analysis.status, 'FINDINGS_PRESENT');
  assert.deepEqual(analysis.findings.map((f) => f.findingId), [
    'OP01:ASSEMBLER-1:origin', 'OP01:MILL-1:origin', 'OP01:MILL-1:production', 'OP01:RAW-1:origin',
  ]);
  for (const f of analysis.findings) {
    assert.equal(f.ruleId, 'OP01');
    assert.equal(f.observed, null);
    assert.equal(f.deltaUnits, null);
    assert.equal(f.expected, f.subject.kind);
    assert.equal(f.subject.type, 'requiredEvidence');
  }
  assert.deepEqual(analysis.counts, {
    findings: 4,
    byRule: { OP01: 4, OP02: 0, OP03: 0 },
    suppliers: 3,
    edges: 2,
    documents: 0,
    originDocuments: 0,
    productionDocuments: 0,
    requiredPairs: 4,
    fulfilledPairs: 0,
    quantityMismatchAbsoluteUnits: 0,
  });
  assert.deepEqual(analysis.evidence, [
    { supplierId: 'RAW-1', kind: 'origin', fulfilled: false, documentIds: [] },
    { supplierId: 'MILL-1', kind: 'origin', fulfilled: false, documentIds: [] },
    { supplierId: 'ASSEMBLER-1', kind: 'origin', fulfilled: false, documentIds: [] },
    { supplierId: 'MILL-1', kind: 'production', fulfilled: false, documentIds: [] },
  ]);
  assert.deepEqual(analysis.lineage.documents, []);
});

test('adversarial 02: duplicate DOC-1 id -> DUPLICATE_ID at /documents/1/id, zero findings', () => {
  const fx = loadFixtureJson('adversarial-02-duplicate-doc-id');
  const validation = validateShipment(fx);
  expectFailure(validation, 'DUPLICATE_ID', '/documents/1/id');
  const result = analyze(fx);
  expectFailure(result, 'DUPLICATE_ID', '/documents/1/id');
  assert.equal(result.findings, undefined);
  assert.equal(result.value, undefined);
  expectFailure(parseShipmentJson(loadFixtureBytes('adversarial-02-duplicate-doc-id')), 'DUPLICATE_ID', '/documents/1/id');
  const dupSupplier = loadFixtureJson('golden');
  dupSupplier.suppliers[2].id = 'RAW-1';
  expectFailure(validateShipment(dupSupplier), 'DUPLICATE_ID', '/suppliers/2/id');
});

test('adversarial 03: unknown references -> UNKNOWN_REFERENCE with a JSON pointer naming the field', () => {
  expectFailure(analyze(loadFixtureJson('adversarial-03-unknown-supplier')), 'UNKNOWN_REFERENCE', '/documents/0/supplierId');
  expectFailure(validateShipment(loadFixtureJson('adversarial-03-unknown-supplier')), 'UNKNOWN_REFERENCE', '/documents/0/supplierId');

  const badPair = loadFixtureJson('golden');
  badPair.requiredEvidence[3].supplierId = 'GHOST-9';
  expectFailure(validateShipment(badPair), 'UNKNOWN_REFERENCE', '/requiredEvidence/3/supplierId');

  const badEdge = loadFixtureJson('golden');
  badEdge.edges[0].toSupplierId = 'GHOST-9';
  expectFailure(validateShipment(badEdge), 'UNKNOWN_REFERENCE', '/edges/0/toSupplierId');

  const badShipmentRef = loadFixtureJson('golden');
  badShipmentRef.documents[0].shipmentId = 'SHIP-2';
  expectFailure(validateShipment(badShipmentRef), 'UNKNOWN_REFERENCE', '/documents/0/shipmentId');
});

test('adversarial 04: ASSEMBLER-1 -> RAW-1 edge -> CYCLE_DETECTED naming the cycle, no hang', () => {
  const started = Date.now();
  const result = analyze(loadFixtureJson('adversarial-04-cycle'));
  const elapsed = Date.now() - started;
  const err = expectFailure(result, 'CYCLE_DETECTED');
  assert.ok(elapsed < 5000, 'cycle detection must not hang');
  for (const id of ['RAW-1', 'MILL-1', 'ASSEMBLER-1']) {
    assert.ok(err.message.includes(id), `cycle message must list ${id}`);
  }
  assert.equal(result.value, undefined);

  const selfLoop = loadFixtureJson('golden');
  selfLoop.edges.push({ id: 'EDGE-3', fromSupplierId: 'RAW-1', toSupplierId: 'RAW-1' });
  const selfErr = expectFailure(validateShipment(selfLoop), 'CYCLE_DETECTED');
  assert.ok(selfErr.message.includes('RAW-1'));
});

test('adversarial 05: quantity -1 and fractional 1.5 -> INVALID_QUANTITY', () => {
  expectFailure(analyze(loadFixtureJson('adversarial-05a-negative-quantity')), 'INVALID_QUANTITY', '/documents/2/quantityUnits');
  expectFailure(analyze(loadFixtureJson('adversarial-05b-fractional-quantity')), 'INVALID_QUANTITY', '/shipment/quantityUnits');

  const fractionalDoc = loadFixtureJson('golden');
  fractionalDoc.documents[0].quantityUnits = 1.5;
  expectFailure(validateShipment(fractionalDoc), 'INVALID_QUANTITY', '/documents/0/quantityUnits');

  const unsafe = loadFixtureJson('golden');
  unsafe.shipment.quantityUnits = Number.MAX_SAFE_INTEGER + 1;
  expectFailure(validateShipment(unsafe), 'INVALID_QUANTITY', '/shipment/quantityUnits');

  const zero = loadFixtureJson('golden');
  zero.shipment.quantityUnits = 0;
  const analysis = expectOk(analyze(zero));
  assert.equal(analysis.counts.byRule.OP03, 3);
  assert.deepEqual(analysis.findings.filter((f) => f.ruleId === 'OP03').map((f) => f.deltaUnits), [100, 100, 90]);
  assert.equal(analysis.counts.quantityMismatchAbsoluteUnits, 290);
});

test('adversarial 06: two distinct country contradictions -> two separate OP02 findings, no merging', () => {
  const analysis = expectOk(analyze(loadFixtureJson('adversarial-06-two-country-contradictions')));
  assert.deepEqual(analysis.findings.map((f) => f.findingId), ['OP02:DOC-2', 'OP02:DOC-3']);
  assert.deepEqual(analysis.findings.map((f) => [f.expected, f.observed]), [['AA', 'BB'], ['AA', 'CC']]);
  assert.deepEqual(analysis.findings.map((f) => f.subject.documentId), ['DOC-2', 'DOC-3']);
  assert.deepEqual(analysis.findings.map((f) => f.subject.supplierId), ['MILL-1', 'ASSEMBLER-1']);
  assert.deepEqual(analysis.counts, {
    findings: 2,
    byRule: { OP01: 0, OP02: 2, OP03: 0 },
    suppliers: 3,
    edges: 2,
    documents: 4,
    originDocuments: 3,
    productionDocuments: 1,
    requiredPairs: 4,
    fulfilledPairs: 4,
    quantityMismatchAbsoluteUnits: 0,
  });
  assert.equal(analysis.status, 'FINDINGS_PRESENT');
});

test('adversarial 07: script supplier name is preserved verbatim and escapeHtml neutralises it', () => {
  const script = '<script>alert(1)</script>';
  const analysis = expectOk(analyze(loadFixtureJson('adversarial-07-script-name')));
  assert.equal(analysis.input.suppliers[0].name, script);
  assert.deepEqual(analysis.findings.map((f) => f.findingId), GOLDEN_FINDING_IDS);
  assert.equal(escapeHtml(script), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml(analysis.input.suppliers[0].name), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"q"'), '&quot;q&quot;');
  assert.match(escapeHtml("it's"), /^it(?:&#39;|&apos;|&#x27;)s$/);
  const escaped = escapeHtml('<a href="x" onclick=\'y\'>&</a>');
  assert.ok(!/[<>"']/.test(escaped), 'no raw HTML metacharacters may survive');
  assert.ok(!/&(?!amp;|lt;|gt;|quot;|#39;|apos;|#x27;)/.test(escaped), 'every & must be an entity');
  assert.equal(escapeHtml('plain text 123'), 'plain text 123');
});

test('adversarial 08a: oversized input (1048577 bytes) -> INPUT_TOO_LARGE before decoding; 1048576 accepted', () => {
  const tooBigValidJson = paddedGoldenBytes(MAX_BYTES + 1);
  const r1 = parseShipmentJson(tooBigValidJson, { sourceName: 'big.json' });
  expectFailure(r1, 'INPUT_TOO_LARGE');
  assert.equal(r1.errors[0].code, 'INPUT_TOO_LARGE');

  const tooBigInvalidUtf8 = new Uint8Array(MAX_BYTES + 1).fill(0xff);
  const r2 = parseShipmentJson(tooBigInvalidUtf8);
  expectFailure(r2, 'INPUT_TOO_LARGE');
  assert.equal(r2.errors[0].code, 'INPUT_TOO_LARGE', 'size is checked before UTF-8 decoding');

  const goldenText = loadFixtureText('golden');
  const tooBigString = goldenText + ' '.repeat(MAX_BYTES + 1 - goldenText.length);
  expectFailure(parseShipmentJson(tooBigString), 'INPUT_TOO_LARGE');

  const exactlyMax = paddedGoldenBytes(MAX_BYTES);
  const r3 = expectOk(parseShipmentJson(exactlyMax));
  assert.equal(r3.source.byteLength, MAX_BYTES);
  assert.deepEqual(r3.input, loadFixtureJson('golden'));
  expectOk(parseShipmentJson(exactlyMax.buffer));
});

test('adversarial 08b: 1001 records -> TOO_MANY_RECORDS; 1000 records accepted', () => {
  const over = withBulkSuppliers(989); // 12 + 989 = 1001
  expectFailure(validateShipment(over), 'TOO_MANY_RECORDS');
  expectFailure(analyze(over), 'TOO_MANY_RECORDS');
  expectFailure(parseShipmentJson(JSON.stringify(over)), 'TOO_MANY_RECORDS');

  const overWithGarbage = withBulkSuppliers(989);
  overWithGarbage.documents[0].quantityUnits = -1;
  expectFailure(validateShipment(overWithGarbage), 'TOO_MANY_RECORDS');

  const atLimit = withBulkSuppliers(988); // 12 + 988 = 1000
  const value = expectOk(validateShipment(atLimit));
  assert.equal(value.suppliers.length, 991);
});

test('adversarial 08c: malformed JSON -> MALFORMED_JSON; invalid UTF-8 -> INVALID_UTF8', () => {
  expectFailure(parseShipmentJson(loadFixtureText('adversarial-08c-malformed')), 'MALFORMED_JSON');
  expectFailure(parseShipmentJson(loadFixtureBytes('adversarial-08c-malformed')), 'MALFORMED_JSON');
  expectFailure(parseShipmentJson('{'), 'MALFORMED_JSON');
  expectFailure(parseShipmentJson(''), 'MALFORMED_JSON');
  expectFailure(parseShipmentJson(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])), 'INVALID_UTF8');
});

test('adversarial 08d: unknown rule version and unknown schema version are rejected, never guessed', () => {
  expectFailure(analyze(loadFixtureJson('adversarial-08d-unknown-rule-version')), 'UNSUPPORTED_RULE_VERSION', '/ruleVersion');
  expectFailure(validateShipment(loadFixtureJson('adversarial-08d-unknown-rule-version')), 'UNSUPPORTED_RULE_VERSION', '/ruleVersion');
  expectFailure(parseShipmentJson(loadFixtureText('adversarial-08d-unknown-rule-version')), 'UNSUPPORTED_RULE_VERSION', '/ruleVersion');

  const badSchema = loadFixtureJson('golden');
  badSchema.schemaVersion = 2;
  expectFailure(validateShipment(badSchema), 'UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion');
  expectFailure(analyze(badSchema), 'UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion');
  expectFailure(parseShipmentJson(JSON.stringify(badSchema)), 'UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion');
});

test('adversarial 08: a previous valid analysis is unchanged and still frozen after failed parses', () => {
  const analysis = expectOk(analyze(loadFixtureJson('golden')));
  const before = JSON.stringify(analysis);

  const failures = [
    parseShipmentJson(paddedGoldenBytes(MAX_BYTES + 1)),
    parseShipmentJson(JSON.stringify(withBulkSuppliers(989))),
    parseShipmentJson(loadFixtureText('adversarial-08c-malformed')),
    parseShipmentJson(loadFixtureText('adversarial-08d-unknown-rule-version')),
    analyze(loadFixtureJson('adversarial-02-duplicate-doc-id')),
    analyze(loadFixtureJson('adversarial-04-cycle')),
  ];
  for (const r of failures) {
    assert.equal(r.ok, false);
    assert.equal(r.value, undefined);
    assert.equal(r.findings, undefined);
  }

  assert.equal(JSON.stringify(analysis), before);
  assertDeepFrozen(analysis);
  assert.throws(() => { analysis.status = 'certified'; }, TypeError);
  assert.throws(() => { analysis.findings.pop(); }, TypeError);
  assert.deepEqual(analysis.findings.map((f) => f.findingId), GOLDEN_FINDING_IDS);
  assert.equal(analysis.counts.quantityMismatchAbsoluteUnits, 10);
});

test('prototype-pollution payloads are rejected as UNKNOWN_FIELD and never pollute Object.prototype', () => {
  const goldenText = loadFixtureText('golden');

  const protoText = `{"__proto__": {"polluted": true}, ${goldenText.trim().slice(1)}`;
  expectFailure(parseShipmentJson(protoText), 'UNKNOWN_FIELD', '/__proto__');
  expectFailure(validateShipment(JSON.parse(protoText)), 'UNKNOWN_FIELD', '/__proto__');
  expectFailure(analyze(JSON.parse(protoText)), 'UNKNOWN_FIELD', '/__proto__');

  const ctorText = `{"constructor": {"prototype": {"polluted": true}}, ${goldenText.trim().slice(1)}`;
  expectFailure(parseShipmentJson(ctorText), 'UNKNOWN_FIELD', '/constructor');
  expectFailure(validateShipment(JSON.parse(ctorText)), 'UNKNOWN_FIELD', '/constructor');

  const nested = loadFixtureJson('golden');
  nested.suppliers[0] = JSON.parse('{"id": "RAW-1", "name": "n", "__proto__": {"polluted": true}}');
  expectFailure(validateShipment(nested), 'UNKNOWN_FIELD', '/suppliers/0/__proto__');

  const nestedCtor = loadFixtureJson('golden');
  nestedCtor.documents[1].constructor = { prototype: { polluted: true } };
  expectFailure(validateShipment(nestedCtor), 'UNKNOWN_FIELD', '/documents/1/constructor');

  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
  assert.equal({}.polluted, undefined);
  assert.equal([].polluted, undefined);
});

test('unknown fields are rejected with the pointer to the extra key', () => {
  const top = loadFixtureJson('golden');
  top.extra = 1;
  expectFailure(validateShipment(top), 'UNKNOWN_FIELD', '/extra');

  const doc = loadFixtureJson('golden');
  doc.documents[0].url = 'http://example.invalid/doc';
  expectFailure(validateShipment(doc), 'UNKNOWN_FIELD', '/documents/0/url');

  const ship = loadFixtureJson('golden');
  ship.shipment.certified = true;
  expectFailure(validateShipment(ship), 'UNKNOWN_FIELD', '/shipment/certified');

  const pair = loadFixtureJson('golden');
  pair.requiredEvidence[0].note = 'x';
  expectFailure(validateShipment(pair), 'UNKNOWN_FIELD', '/requiredEvidence/0/note');
});

test('remaining schema error codes: type, missing, id, country, kind, string length, duplicate pair', () => {
  for (const bad of [null, undefined, 42, 'text', [], true]) {
    expectFailure(validateShipment(bad), 'INVALID_TYPE', '');
  }
  const notArray = loadFixtureJson('golden');
  notArray.suppliers = {};
  expectFailure(validateShipment(notArray), 'INVALID_TYPE', '/suppliers');

  const missingShipmentId = loadFixtureJson('golden');
  delete missingShipmentId.shipment.id;
  expectFailure(validateShipment(missingShipmentId), 'MISSING_FIELD', '/shipment/id');
  const missingSuppliers = loadFixtureJson('golden');
  delete missingSuppliers.suppliers;
  expectFailure(validateShipment(missingSuppliers), 'MISSING_FIELD', '/suppliers');

  const emptyId = loadFixtureJson('golden');
  emptyId.suppliers[0].id = '';
  expectFailure(validateShipment(emptyId), 'INVALID_ID', '/suppliers/0/id');
  const controlId = loadFixtureJson('golden');
  controlId.documents[0].id = 'DOC\u0000-1';
  expectFailure(validateShipment(controlId), 'INVALID_ID', '/documents/0/id');
  const longId = loadFixtureJson('golden');
  longId.edges[0].id = 'E'.repeat(501);
  expectFailure(validateShipment(longId), 'INVALID_ID', '/edges/0/id');

  for (const country of ['aa', 'AAA', 'A1', '']) {
    const bad = loadFixtureJson('golden');
    bad.shipment.declaredCountry = country;
    expectFailure(validateShipment(bad), 'INVALID_COUNTRY', '/shipment/declaredCountry');
  }
  const badDocCountry = loadFixtureJson('golden');
  badDocCountry.documents[1].country = 'bb';
  expectFailure(validateShipment(badDocCountry), 'INVALID_COUNTRY', '/documents/1/country');

  const badKind = loadFixtureJson('golden');
  badKind.documents[0].kind = 'certificate';
  expectFailure(validateShipment(badKind), 'INVALID_KIND', '/documents/0/kind');
  const badPairKind = loadFixtureJson('golden');
  badPairKind.requiredEvidence[3].kind = 'assembly';
  expectFailure(validateShipment(badPairKind), 'INVALID_KIND', '/requiredEvidence/3/kind');

  const longName = loadFixtureJson('golden');
  longName.suppliers[0].name = 'n'.repeat(501);
  expectFailure(validateShipment(longName), 'STRING_TOO_LONG', '/suppliers/0/name');
  const maxName = loadFixtureJson('golden');
  maxName.suppliers[0].name = 'n'.repeat(500);
  expectOk(validateShipment(maxName));

  const dupPair = loadFixtureJson('golden');
  dupPair.requiredEvidence.push({ supplierId: 'RAW-1', kind: 'origin' });
  const dupErr = expectFailure(validateShipment(dupPair), 'DUPLICATE_REQUIRED_PAIR');
  assert.ok(dupErr.path.startsWith('/requiredEvidence/4'), `path ${dupErr.path} must point at the duplicate pair`);
});

test('errors are plain {code, message, path} records without stack traces', () => {
  const results = [
    validateShipment(loadFixtureJson('adversarial-02-duplicate-doc-id')),
    validateShipment(loadFixtureJson('adversarial-03-unknown-supplier')),
    validateShipment(loadFixtureJson('adversarial-04-cycle')),
    parseShipmentJson(loadFixtureText('adversarial-08c-malformed')),
    parseShipmentJson(new Uint8Array(MAX_BYTES + 1)),
    validateShipment(null),
  ];
  for (const result of results) {
    assert.equal(result.ok, false);
    assert.equal(result.value, undefined);
    for (const error of result.errors) assertErrorShape(error);
  }
});
