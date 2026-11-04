// Report build, canonical JSON serialization and strict re-parse.
// A parsed report is an unverified import: findings and counts are recomputed from the embedded input and must match.

import { DATA_CLASSIFICATION, ENGINE_CONTRACT_VERSION, LIMITATIONS, SYNTHETIC_LABEL, analyze } from './analyze.js';
import { canonicalJson, computeSemanticFingerprint, prettyCanonicalJson } from './canonical.js';
import { decodeJson } from './parse.js';
import { appendReviewNote } from './review.js';
import { MAX_NESTING_DEPTH, deepFreeze, fail, hasOwn, isPlainData, isPlainObject, isValidTimestamp, makeError, succeed } from './util.js';

const PLAIN_DATA_MESSAGE = `Value must be plain JSON data (finite numbers, dense arrays, plain objects) nested at most ${MAX_NESTING_DEPTH} levels`;
import { RULE_VERSION } from './validate.js';

export const REPORT_SCHEMA_VERSION = 'originproof.report.v2';
const HEX64 = /^[0-9a-f]{64}$/;
const OPTION_KEYS = Object.freeze(['analysis', 'reviewNotes', 'generatedAt', 'semanticFingerprint']);
const REPORT_KEYS = Object.freeze([
  'schemaVersion',
  'dataClassification',
  'syntheticLabel',
  'engineContractVersion',
  'ruleVersion',
  'generatedAt',
  'semanticFingerprint',
  'input',
  'status',
  'findings',
  'counts',
  'evidence',
  'lineage',
  'reviewNotes',
  'limitations',
]);

function comparable(x) {
  return {
    engineContractVersion: x.engineContractVersion,
    ruleVersion: x.ruleVersion,
    status: x.status,
    findings: x.findings,
    counts: x.counts,
    evidence: x.evidence,
    lineage: x.lineage,
  };
}

/** Builds a deep-frozen report. Recomputes the analysis from its input and rejects any drift. */
export function buildReport(options) {
  if (!isPlainObject(options)) return fail([makeError('INVALID_TYPE', 'buildReport expects an options object', '')]);
  if (!isPlainData(options)) return fail([makeError('INVALID_TYPE', PLAIN_DATA_MESSAGE, '')]);
  const errors = [];
  for (const key of Object.keys(options)) if (!OPTION_KEYS.includes(key)) errors.push(makeError('UNKNOWN_FIELD', `Unknown option "${key}"`, `/${key}`));
  if (errors.length > 0) return fail(errors);
  const analysis = options.analysis;
  const reviewNotes = hasOwn(options, 'reviewNotes') ? options.reviewNotes : [];
  if (!isPlainObject(analysis)) return fail([makeError('INVALID_TYPE', 'analysis must be an analysis object', '/analysis')]);
  const recomputed = analyze(analysis.input);
  if (!recomputed.ok) return fail(recomputed.errors.map((e) => ({ ...e, path: '/analysis/input' + e.path })));
  if (canonicalJson(comparable(recomputed.value)) !== canonicalJson(comparable(analysis))) {
    return fail([makeError('REPORT_MISMATCH', 'Findings, counts, evidence or lineage do not match a recomputation from the input records', '/analysis')]);
  }
  if (!isValidTimestamp(options.generatedAt)) errors.push(makeError('INVALID_TIMESTAMP', 'generatedAt must match YYYY-MM-DDThh:mm:ssZ', '/generatedAt'));
  if (typeof options.semanticFingerprint !== 'string' || !HEX64.test(options.semanticFingerprint)) {
    errors.push(makeError('INVALID_FINGERPRINT', 'semanticFingerprint must be 64 lowercase hex characters', '/semanticFingerprint'));
  }
  if (!Array.isArray(reviewNotes)) errors.push(makeError('INVALID_TYPE', 'reviewNotes must be an array', '/reviewNotes'));
  if (errors.length > 0) return fail(errors);
  let notes = [];
  for (let i = 0; i < reviewNotes.length; i += 1) {
    const result = appendReviewNote(notes, reviewNotes[i], recomputed.value);
    if (!result.ok) return fail(result.errors.map((e) => ({ ...e, path: `/reviewNotes/${i}` + e.path.replace(/^\/note/, '') })));
    notes = result.value;
  }
  const a = recomputed.value;
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    dataClassification: DATA_CLASSIFICATION,
    syntheticLabel: SYNTHETIC_LABEL,
    engineContractVersion: ENGINE_CONTRACT_VERSION,
    ruleVersion: RULE_VERSION,
    generatedAt: options.generatedAt,
    semanticFingerprint: options.semanticFingerprint,
    input: a.input,
    status: a.status,
    findings: a.findings,
    counts: a.counts,
    evidence: a.evidence,
    lineage: a.lineage,
    reviewNotes: notes,
    limitations: LIMITATIONS.slice(),
  };
  return succeed(deepFreeze(report));
}

/** Canonical JSON: sorted keys, 2-space indent, LF line endings, trailing newline. */
export function serializeReportJson(report) {
  if (!isPlainObject(report)) throw new TypeError('serializeReportJson expects a report object');
  return prettyCanonicalJson(report);
}

/** Strict re-parse of exported report text/bytes. Never throws on bad input. */
export function parseReportJson(input) {
  const decoded = decodeJson(input);
  if (!decoded.ok) return decoded;
  const raw = decoded.value.parsed;
  const errors = [];
  if (!isPlainObject(raw)) return fail([makeError('INVALID_TYPE', 'Report must be a JSON object', '')]);
  if (!isPlainData(raw)) return fail([makeError('INVALID_TYPE', PLAIN_DATA_MESSAGE, '')]);
  for (const key of REPORT_KEYS) if (!hasOwn(raw, key)) errors.push(makeError('MISSING_FIELD', `Report is missing "${key}"`, `/${key}`));
  for (const key of Object.keys(raw)) if (!REPORT_KEYS.includes(key)) errors.push(makeError('UNKNOWN_FIELD', `Report has unknown field "${key}"`, `/${key}`));
  if (errors.length > 0) return fail(errors);
  if (raw.schemaVersion !== REPORT_SCHEMA_VERSION) errors.push(makeError('UNSUPPORTED_SCHEMA_VERSION', `schemaVersion must be ${REPORT_SCHEMA_VERSION}`, '/schemaVersion'));
  if (raw.dataClassification !== DATA_CLASSIFICATION) errors.push(makeError('INVALID_CLASSIFICATION', `dataClassification must be ${DATA_CLASSIFICATION}`, '/dataClassification'));
  if (raw.syntheticLabel !== SYNTHETIC_LABEL) errors.push(makeError('MISSING_SYNTHETIC_LABEL', 'syntheticLabel must be the engine synthetic label', '/syntheticLabel'));
  if (raw.engineContractVersion !== ENGINE_CONTRACT_VERSION) errors.push(makeError('UNSUPPORTED_ENGINE_VERSION', `engineContractVersion must be ${ENGINE_CONTRACT_VERSION}`, '/engineContractVersion'));
  if (raw.ruleVersion !== RULE_VERSION) errors.push(makeError('UNSUPPORTED_RULE_VERSION', `ruleVersion must be ${RULE_VERSION}`, '/ruleVersion'));
  if (canonicalJson(raw.limitations) !== canonicalJson(LIMITATIONS)) errors.push(makeError('INVALID_LIMITATIONS', 'limitations must equal the engine limitations list', '/limitations'));
  if (errors.length > 0) return fail(errors);
  const built = buildReport({
    analysis: {
      engineContractVersion: raw.engineContractVersion,
      ruleVersion: raw.ruleVersion,
      input: raw.input,
      status: raw.status,
      findings: raw.findings,
      counts: raw.counts,
      evidence: raw.evidence,
      lineage: raw.lineage,
    },
    reviewNotes: raw.reviewNotes,
    generatedAt: raw.generatedAt,
    semanticFingerprint: raw.semanticFingerprint,
  });
  if (!built.ok) return fail(built.errors.map((e) => ({ ...e, path: e.path.replace(/^\/analysis/, '') })));
  return built;
}

/** Recomputes the fingerprint over the report's semantic subset and compares it to the embedded one. */
export async function verifySemanticFingerprint(report) {
  if (!isPlainObject(report) || typeof report.semanticFingerprint !== 'string') return false;
  const recomputed = await computeSemanticFingerprint(report);
  return recomputed === report.semanticFingerprint;
}
