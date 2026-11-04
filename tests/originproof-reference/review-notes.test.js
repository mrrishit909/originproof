// appendReviewNote: human review notes are separate from findings, inert text,
// append-only and immutable. SYNTHETIC data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../packages/originproof-engine/src/index.js';
import { loadFixtureJson } from '../../fixtures/originproof/index.js';
import { assertDeepFrozen, expectFailure, expectOk } from './helpers.js';

const { analyze, appendReviewNote } = engine;
const T = '2026-11-03T12:00:00Z';
const NOTE_1 = Object.freeze({
  sequence: 1,
  findingId: 'OP02:DOC-2',
  text: 'Reviewed DOC-2 country mismatch (synthetic demo note).',
  recordedAt: T,
});

function golden() {
  return expectOk(analyze(loadFixtureJson('golden')));
}

test('append returns a new frozen history and never mutates the previous one', () => {
  const analysis = golden();
  const history = [];
  const r1 = appendReviewNote(history, { ...NOTE_1 }, analysis);
  const h1 = expectOk(r1);
  assert.equal(history.length, 0, 'input history must not be mutated');
  assert.notEqual(h1, history);
  assert.ok(Array.isArray(h1));
  assert.equal(h1.length, 1);
  assert.deepEqual(h1[0], NOTE_1);
  assertDeepFrozen(h1);
  assert.throws(() => { h1.push({ ...NOTE_1, sequence: 2 }); }, TypeError);
  assert.throws(() => { h1[0].text = 'tampered'; }, TypeError);

  const note2 = { ...NOTE_1, sequence: 2, findingId: 'OP03:DOC-3', text: '=SUM(A1)' };
  const h2 = expectOk(appendReviewNote(h1, note2, analysis));
  assert.equal(h1.length, 1, 'previous history unchanged');
  assert.notEqual(h2, h1);
  assert.equal(h2.length, 2);
  assert.deepEqual(h2.map((n) => n.sequence), [1, 2]);
  assert.equal(h2[1].text, '=SUM(A1)', 'note text is inert and stored verbatim');
  assertDeepFrozen(h2);

  const note3 = { ...NOTE_1, sequence: 5, findingId: 'OP01:MILL-1:production', text: '<script>alert(1)</script>' };
  const h3 = expectOk(appendReviewNote(h2, note3, analysis));
  assert.equal(h3.length, 3);
  assert.equal(h3[2].text, '<script>alert(1)</script>');
  assert.deepEqual(h3.map((n) => n.sequence), [1, 2, 5]);

  const maxText = { ...NOTE_1, sequence: 6, text: 'x'.repeat(2000) };
  const h4 = expectOk(appendReviewNote(h3, maxText, analysis));
  assert.equal(h4[3].text.length, 2000);
});

test('invalid notes are rejected with the documented codes and never change history', () => {
  const analysis = golden();
  const h1 = expectOk(appendReviewNote([], { ...NOTE_1 }, analysis));
  const h1Snapshot = JSON.stringify(h1);

  const cases = [
    ['INVALID_SEQUENCE', [], { ...NOTE_1, sequence: 0 }],
    ['INVALID_SEQUENCE', [], { ...NOTE_1, sequence: -1 }],
    ['INVALID_SEQUENCE', h1, { ...NOTE_1, sequence: 1 }],
    ['INVALID_SEQUENCE', h1, { ...NOTE_1, sequence: 0 }],
    ['UNKNOWN_FINDING', [], { ...NOTE_1, findingId: 'OP99:NOPE' }],
    ['UNKNOWN_FINDING', [], { ...NOTE_1, findingId: 'OP01:RAW-1:origin' }],
    ['UNKNOWN_FINDING', [], { ...NOTE_1, findingId: '' }],
    ['INVALID_NOTE', [], { ...NOTE_1, text: '' }],
    ['INVALID_NOTE', [], { ...NOTE_1, text: 'x'.repeat(2001) }],
    ['INVALID_TIMESTAMP', [], { ...NOTE_1, recordedAt: 'not-a-date' }],
    ['INVALID_TIMESTAMP', [], { ...NOTE_1, recordedAt: '03/11/2026' }],
    ['INVALID_TIMESTAMP', [], { ...NOTE_1, recordedAt: '' }],
    ['UNKNOWN_FIELD', [], { ...NOTE_1, extra: 1 }],
    ['UNKNOWN_FIELD', [], JSON.parse('{"sequence":1,"findingId":"OP02:DOC-2","text":"t","recordedAt":"2026-11-03T12:00:00Z","__proto__":{"polluted":true}}')],
    ['MISSING_FIELD', [], { sequence: 1, findingId: 'OP02:DOC-2', recordedAt: T }],
    ['MISSING_FIELD', [], { sequence: 1, text: 't', recordedAt: T }],
    ['INVALID_TYPE', [], null],
    ['INVALID_TYPE', [], 'note'],
    ['INVALID_TYPE', [], 42],
    ['INVALID_TYPE', 'not-a-history', { ...NOTE_1 }],
    ['INVALID_TYPE', null, { ...NOTE_1 }],
  ];
  for (const [code, history, note] of cases) {
    const result = appendReviewNote(history, note, analysis);
    expectFailure(result, code);
    for (const error of result.errors) {
      assert.equal(typeof error.path, 'string');
      assert.ok(!error.message.includes('\n    at '));
    }
  }
  assert.equal(JSON.stringify(h1), h1Snapshot);
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('review notes stay separate from findings: analysis is unchanged after appends', () => {
  const analysis = golden();
  const before = JSON.stringify(analysis);
  const h1 = expectOk(appendReviewNote([], { ...NOTE_1 }, analysis));
  expectOk(appendReviewNote(h1, { ...NOTE_1, sequence: 2, text: 'second' }, analysis));
  assert.equal(JSON.stringify(analysis), before);
  assert.equal(analysis.findings.length, 3);
  assert.equal('reviewNotes' in analysis, false);
});
