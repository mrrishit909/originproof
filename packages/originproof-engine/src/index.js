// OriginProof engine public API. This file is the only entry point for domain behaviour.
// Pure ESM: no I/O, no network, no clock, no randomness, no eval, no DOM. Synthetic demo data only.
// Rule pack OP-DEMO-1 is fictional evidence-contract configuration, not customs law.

export { DATA_CLASSIFICATION, ENGINE_CONTRACT_VERSION, LIMITATIONS, RULE_IDS, SYNTHETIC_LABEL, analyze } from './analyze.js';
export { canonicalJson, computeSemanticFingerprint } from './canonical.js';
export { CSV_EXPORT_COLUMNS, serializeReportCsv } from './csv.js';
export { MAX_UPLOAD_BYTES, parseShipmentJson } from './parse.js';
export { REPORT_SCHEMA_VERSION, buildReport, parseReportJson, serializeReportJson, verifySemanticFingerprint } from './report.js';
export { MAX_NOTE_LENGTH, appendReviewNote } from './review.js';
export { MAX_STRING_LENGTH, escapeHtml } from './util.js';
export { EVIDENCE_KINDS, MAX_RECORDS, RULE_VERSION, SCHEMA_VERSION, validateShipment } from './validate.js';

/** Sorted list of every exported name; a test asserts the module namespace equals this list. */
export const ENGINE_PUBLIC_API = Object.freeze([
  'CSV_EXPORT_COLUMNS',
  'DATA_CLASSIFICATION',
  'ENGINE_CONTRACT_VERSION',
  'ENGINE_PUBLIC_API',
  'EVIDENCE_KINDS',
  'LIMITATIONS',
  'MAX_NOTE_LENGTH',
  'MAX_RECORDS',
  'MAX_STRING_LENGTH',
  'MAX_UPLOAD_BYTES',
  'REPORT_SCHEMA_VERSION',
  'RULE_IDS',
  'RULE_VERSION',
  'SCHEMA_VERSION',
  'SYNTHETIC_LABEL',
  'analyze',
  'appendReviewNote',
  'buildReport',
  'canonicalJson',
  'computeSemanticFingerprint',
  'escapeHtml',
  'parseReportJson',
  'parseShipmentJson',
  'serializeReportCsv',
  'serializeReportJson',
  'validateShipment',
  'verifySemanticFingerprint',
]);
