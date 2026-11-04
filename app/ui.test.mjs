import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neutraliseCsvCell, neutraliseCsv, summaryCards, findingLabel, lineageRows, uiState, formatErrors } from './ui.js';

test('neutraliseCsvCell prefixes dangerous leading chars', () => {
  for (const c of ['=', '+', '-', '@', '\t', '\r']) assert.equal(neutraliseCsvCell(`${c}x`), `'${c}x`);
  assert.equal(neutraliseCsvCell('safe'), 'safe');
  assert.equal(neutraliseCsvCell(null), '');
});

test('neutraliseCsv rewrites quoted cells only', () => {
  assert.equal(neutraliseCsv('"a","=SUM(1)","-5"\n'), '"a","\'=SUM(1)","\'-5"\n');
});

test('summaryCards echoes numeric counts only, never invents', () => {
  const cards = summaryCards({ status: 'X', counts: { findings: 2, byRule: { OP01: 2 } } });
  assert.deepEqual(cards, [{ label: 'Status', value: 'X' }, { label: 'findings', value: '2' }]);
  assert.deepEqual(summaryCards(null), []);
});

test('findingLabel and lineageRows', () => {
  assert.equal(findingLabel({ findingId: 'A', severity: 'S', ruleId: 'R' }), 'A | S | R');
  assert.deepEqual(lineageRows({ input: { edges: [{ from: 'A', to: 'B' }] } }), ['from=A  to=B']);
  assert.deepEqual(lineageRows({}), []);
});

test('uiState distinguishes empty / error / zero / findings', () => {
  assert.equal(uiState({ ran: false }), 'empty');
  assert.equal(uiState({ ran: true, result: { ok: false, errors: [] } }), 'error');
  assert.equal(uiState({ ran: true, result: { ok: true, value: { findings: [] } } }), 'zero');
  assert.equal(uiState({ ran: true, result: { ok: true, value: { findings: [{}] } } }), 'findings');
});

test('formatErrors', () => {
  assert.deepEqual(formatErrors([{ code: 'C', path: '/p', message: 'm' }]), ['C at /p: m']);
  assert.deepEqual(formatErrors(undefined), ['Unknown error']);
});
