// OriginProof SYNTHETIC fixtures loader. All data here is fictional; rule pack
// OP-DEMO-1 is a fictional evidence-contract configuration, not customs law.
// This loader is for tests only. The engine never reads files.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_FILES = Object.freeze({
  'golden': 'golden.json',
  'clean': 'clean.json',
  'adversarial-01-empty-documents': 'adversarial-01-empty-documents.json',
  'adversarial-02-duplicate-doc-id': 'adversarial-02-duplicate-doc-id.json',
  'adversarial-03-unknown-supplier': 'adversarial-03-unknown-supplier.json',
  'adversarial-04-cycle': 'adversarial-04-cycle.json',
  'adversarial-05a-negative-quantity': 'adversarial-05a-negative-quantity.json',
  'adversarial-05b-fractional-quantity': 'adversarial-05b-fractional-quantity.json',
  'adversarial-06-two-country-contradictions': 'adversarial-06-two-country-contradictions.json',
  'adversarial-07-script-name': 'adversarial-07-script-name.json',
  'adversarial-08c-malformed': 'adversarial-08c-malformed.json.txt',
  'adversarial-08d-unknown-rule-version': 'adversarial-08d-unknown-rule-version.json',
});

export const FIXTURE_NAMES = Object.freeze(Object.keys(FIXTURE_FILES));

// Fixtures that are intentionally NOT valid JSON text.
export const NON_JSON_FIXTURE_NAMES = Object.freeze(['adversarial-08c-malformed']);

export function fixturePath(name) {
  if (!Object.hasOwn(FIXTURE_FILES, name)) {
    throw new Error(`Unknown OriginProof fixture: ${String(name)}`);
  }
  return join(FIXTURE_DIR, FIXTURE_FILES[name]);
}

export function loadFixtureText(name) {
  return readFileSync(fixturePath(name), 'utf8');
}

export function loadFixtureBytes(name) {
  // Fresh standalone Uint8Array (offset 0, exact length), never a pooled Buffer view.
  return new Uint8Array(readFileSync(fixturePath(name)));
}

export function loadFixtureJson(name) {
  // Returns a fresh, mutable object on every call (useful for mutation tests).
  return JSON.parse(loadFixtureText(name));
}
