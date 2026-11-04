// Canonical JSON (sorted keys) and the unkeyed semantic fingerprint.
// The fingerprint is SHA-256 over canonical JSON. It is NOT a signature and proves nothing about who produced a report.

import { compareCodeUnits } from './util.js';

function stringifySorted(value, space, depth) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type !== 'object') throw new TypeError(`Unsupported value type: ${type}`);
  const pad = space > 0 ? '\n' + ' '.repeat(space * (depth + 1)) : '';
  const close = space > 0 ? '\n' + ' '.repeat(space * depth) : '';
  const sep = space > 0 ? ',' : ',';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => pad + stringifySorted(item === undefined ? null : item, space, depth + 1));
    return '[' + items.join(sep) + close + ']';
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort(compareCodeUnits);
  if (keys.length === 0) return '{}';
  const colon = space > 0 ? ': ' : ':';
  const entries = keys.map((k) => pad + JSON.stringify(k) + colon + stringifySorted(value[k], space, depth + 1));
  return '{' + entries.join(sep) + close + '}';
}

/** Deterministic compact JSON with object keys in code-unit order. */
export function canonicalJson(value) {
  return stringifySorted(value, 0, 0);
}

/** Deterministic pretty JSON (2-space indent, LF, sorted keys, trailing newline). */
export function prettyCanonicalJson(value) {
  return stringifySorted(value, 2, 0) + '\n';
}

export function semanticSubset(analysisOrReport) {
  const x = analysisOrReport;
  return {
    engineContractVersion: x.engineContractVersion,
    ruleVersion: x.ruleVersion,
    input: x.input,
    findings: x.findings,
    counts: x.counts,
    evidence: x.evidence,
    lineage: x.lineage,
  };
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** SHA-256 hex over the canonical JSON of the semantic subset. Same for an analysis and the report built from it. */
export async function computeSemanticFingerprint(analysisOrReport) {
  if (typeof analysisOrReport !== 'object' || analysisOrReport === null) {
    throw new TypeError('computeSemanticFingerprint expects an analysis or report object');
  }
  const text = canonicalJson(semanticSubset(analysisOrReport));
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return toHex(digest);
}
