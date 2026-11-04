// Spreadsheet-safe CSV export. UTF-8 without BOM, CRLF rows, every cell quoted, formula triggers neutralized.

import { isPlainObject } from './util.js';

export const CSV_EXPORT_COLUMNS = Object.freeze([
  'record_type',
  'id',
  'rule_id',
  'rule_version',
  'supplier_id',
  'document_id',
  'kind',
  'field',
  'expected',
  'observed',
  'delta_units',
  'text',
  'data_classification',
]);

export const CSV_FORMULA_TRIGGER_PREFIXES = Object.freeze(['=', '+', '-', '@', '\t', '\r']);

function quote(text) {
  return '"' + text.replace(/"/g, '""') + '"';
}

/** Text cell: formula-trigger prefixes get a leading single quote (one-way, CSV only). */
function textCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (text.length > 0 && CSV_FORMULA_TRIGGER_PREFIXES.includes(text[0])) text = "'" + text;
  return quote(text);
}

/** Typed integer cell emitted verbatim so spreadsheets read numbers (negative values stay numeric by design). */
function integerCell(value) {
  if (value === null || value === undefined) return '""';
  if (!Number.isSafeInteger(value)) throw new TypeError('Integer cell requires a safe integer');
  return quote(String(value));
}

function row(fields) {
  const cells = CSV_EXPORT_COLUMNS.map((column) => {
    const value = Object.prototype.hasOwnProperty.call(fields, column) ? fields[column] : null;
    return column === 'delta_units' ? integerCell(value) : textCell(value);
  });
  return cells.join(',');
}

/** Serializes a report to CSV. Group order: META, COUNT, EVIDENCE, FINDING, REVIEW_NOTE. */
export function serializeReportCsv(report) {
  if (!isPlainObject(report) || !Array.isArray(report.findings)) throw new TypeError('serializeReportCsv expects a report object');
  const classification = report.dataClassification;
  const lines = [CSV_EXPORT_COLUMNS.map((c) => quote(c)).join(',')];
  const meta = [
    ['schemaVersion', report.schemaVersion],
    ['syntheticLabel', report.syntheticLabel],
    ['engineContractVersion', report.engineContractVersion],
    ['ruleVersion', report.ruleVersion],
    ['generatedAt', report.generatedAt],
    ['semanticFingerprint', report.semanticFingerprint],
    ['shipmentId', report.input.shipment.id],
    ['declaredCountry', report.input.shipment.declaredCountry],
    ['shipmentQuantityUnits', String(report.input.shipment.quantityUnits)],
    ['status', report.status],
  ];
  for (const [id, text] of meta) lines.push(row({ record_type: 'META', id, text, data_classification: classification }));
  const counts = report.counts;
  for (const key of Object.keys(counts)) {
    if (key === 'byRule') {
      for (const ruleId of Object.keys(counts.byRule)) {
        lines.push(row({ record_type: 'COUNT', id: `byRule.${ruleId}`, rule_id: ruleId, observed: String(counts.byRule[ruleId]), data_classification: classification }));
      }
    } else {
      lines.push(row({ record_type: 'COUNT', id: key, observed: String(counts[key]), data_classification: classification }));
    }
  }
  for (const e of report.evidence) {
    lines.push(
      row({
        record_type: 'EVIDENCE',
        id: `${e.supplierId}:${e.kind}`,
        supplier_id: e.supplierId,
        kind: e.kind,
        observed: e.fulfilled ? 'fulfilled' : 'missing',
        text: e.documentIds.join(';'),
        data_classification: classification,
      }),
    );
  }
  for (const f of report.findings) {
    lines.push(
      row({
        record_type: 'FINDING',
        id: f.findingId,
        rule_id: f.ruleId,
        rule_version: f.ruleVersion,
        supplier_id: f.subject.supplierId,
        document_id: f.subject.type === 'document' ? f.subject.documentId : null,
        kind: f.subject.kind,
        field: f.field,
        expected: f.expected === null ? null : String(f.expected),
        observed: f.observed === null ? null : String(f.observed),
        delta_units: f.deltaUnits,
        text: f.rationale,
        data_classification: classification,
      }),
    );
  }
  for (const n of report.reviewNotes) {
    lines.push(
      row({
        record_type: 'REVIEW_NOTE',
        id: String(n.sequence),
        field: n.findingId,
        observed: n.recordedAt,
        text: n.text,
        data_classification: classification,
      }),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
