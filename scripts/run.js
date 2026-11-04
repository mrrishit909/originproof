#!/usr/bin/env node
// Local CLI runner for OriginProof. Reads ONE JSON fixture file and prints the analysis or an export.
// This script does file I/O; the engine itself never does. Synthetic demo data only.
//
// Usage:
//   node scripts/run.js <path/to/shipment.json> [--json | --csv | --summary] [--generated-at 2026-11-03T12:00:00Z]

import { readFileSync } from 'node:fs';
import { argv, exit, stdout } from 'node:process';

import {
  analyze,
  buildReport,
  computeSemanticFingerprint,
  parseShipmentJson,
  serializeReportCsv,
  serializeReportJson,
} from '../packages/originproof-engine/src/index.js';

const args = argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const mode = args.includes('--json') ? 'json' : args.includes('--csv') ? 'csv' : 'summary';
const generatedAtIndex = args.indexOf('--generated-at');
const generatedAt = generatedAtIndex >= 0 ? args[generatedAtIndex + 1] : '2026-01-01T00:00:00Z';

if (!file) {
  stdout.write('usage: node scripts/run.js <shipment.json> [--json | --csv | --summary] [--generated-at <YYYY-MM-DDThh:mm:ssZ>]\n');
  exit(2);
}

const bytes = new Uint8Array(readFileSync(file));
const parsed = parseShipmentJson(bytes, { sourceName: file.split('/').pop() });
if (!parsed.ok) {
  stdout.write(JSON.stringify({ ok: false, errors: parsed.errors }, null, 2) + '\n');
  exit(1);
}
const analysis = analyze(parsed.value.input).value;
const semanticFingerprint = await computeSemanticFingerprint(analysis);
const report = buildReport({ analysis, reviewNotes: [], generatedAt, semanticFingerprint });
if (!report.ok) {
  stdout.write(JSON.stringify({ ok: false, errors: report.errors }, null, 2) + '\n');
  exit(1);
}

if (mode === 'json') stdout.write(serializeReportJson(report.value));
else if (mode === 'csv') stdout.write(serializeReportCsv(report.value));
else {
  const a = analysis;
  stdout.write(`${a.syntheticLabel}\n`);
  stdout.write(`source: ${parsed.value.source.sourceName} (${parsed.value.source.byteLength} bytes)\n`);
  stdout.write(`status: ${a.status}  fingerprint: ${semanticFingerprint}\n`);
  stdout.write(`counts: ${JSON.stringify(a.counts)}\n`);
  for (const f of a.findings) {
    stdout.write(`- ${f.findingId}  expected=${JSON.stringify(f.expected)} observed=${JSON.stringify(f.observed)} delta=${f.deltaUnits}  path=${f.path.join(' -> ')}\n`);
  }
}
