# OriginProof — bounded synthetic provenance slice

> **SYNTHETIC DATA.** Every shipment, supplier, document, country label and rule in this
> repository is fictional. Rule pack `OP-DEMO-1` is a fictional evidence-contract
> configuration used to demonstrate deterministic checking. It is **not customs law**,
> `AA`/`BB` are placeholder labels (not country assessments), and nothing produced here
> certifies, clears, approves or otherwise makes a legal statement about any shipment.

OriginProof is a small, dependency-free JavaScript engine that takes **one** shipment
record with its declared supplier relationships and evidence documents, validates it
strictly, evaluates three fictional rules, and produces a deterministic, traceable,
re-computable report. The scope is deliberately narrow:

- one shipment per input, declared (not inferred) supplier relationships;
- no sanctions screening, no inferred geography, no clearance decision;
- outputs say `FINDINGS_PRESENT` or `NO_FINDINGS` — never "compliant" or "certified";
- the specification is `atlas/docs/specs/ORIGINPROOF-VERTICAL-SLICE.md` (read-only here).

See `docs/LIMITATIONS.md` for what this slice does **not** do and
`docs/TRACEABILITY.md` for the spec-statement-to-test mapping.

## Layout

```
originproof/
  README.md                         this file
  .gitignore
  package.json                      root manifest: "type":"module", no dependencies
  packages/originproof-engine/src/  the engine (pure ESM, no runtime imports from node:)
    index.js                        the only public entry point
    util.js, validate.js, analyze.js, parse.js, review.js, report.js, csv.js, canonical.js
  packages/originproof-engine/test/ implementer's own unit tests (not independent evidence)
  fixtures/originproof/             synthetic JSON fixtures (golden, clean, eight adversarial cases)
  scripts/run.js                    CLI runner (the only file-reading code)
  tests/
    architecture/                   boundary and hygiene tests
      boundaries.test.js            engine source is pure, dependency-free, API-sealed
      no-secrets.test.js            no credential-shaped strings anywhere in the repo
    originproof-reference/          behavioural tests with literal spec expectations
  docs/
    LIMITATIONS.md
    TRACEABILITY.md
```

## Running

Requirements: Node 24, ES modules only, **no installs** (there are no dependencies and
no devDependencies). Tests use `node:test` and `node:assert/strict`.

```sh
cd originproof
npm test                                             # all suites (no install needed)
node --test 'tests/architecture/*.test.js'           # purity / API guards
node --test 'tests/originproof-reference/*.test.js'  # literal spec expectations
node --test 'packages/originproof-engine/test/*.test.js'   # implementer's unit tests
node scripts/run.js fixtures/originproof/golden.json         # CLI: findings + counts summary
node scripts/run.js fixtures/originproof/golden.json --json  # canonical JSON report
node scripts/run.js fixtures/originproof/golden.json --csv   # spreadsheet-safe CSV
```

Pass glob patterns, not directories: Node 24's runner treats a bare directory argument
(for example `node --test tests/architecture/`) as a test file and reports a failure.

There is no build step, no typecheck (JSDoc only), no network access and no runtime AI.
The CLI in `scripts/run.js` is the only code that reads files; the engine never does.

## Public API

Everything is exported from `packages/originproof-engine/src/index.js`. The sorted,
frozen list of exported names is itself exported as `ENGINE_PUBLIC_API`, and
`tests/architecture/boundaries.test.js` asserts the real export surface equals it.

### Constants

| Export | Value / meaning |
|---|---|
| `ENGINE_CONTRACT_VERSION` | `'originproof.engine.v1'` |
| `SCHEMA_VERSION` | `1` |
| `RULE_VERSION` | `'OP-DEMO-1'` (fictional rule pack) |
| `RULE_IDS` | `['OP01','OP02','OP03']` |
| `EVIDENCE_KINDS` | `['origin','production']` |
| `MAX_UPLOAD_BYTES` | `1048576` (1 MiB) |
| `MAX_RECORDS` | `1000` (suppliers + edges + documents + requiredEvidence) |
| `MAX_STRING_LENGTH` | `500` |
| `MAX_NOTE_LENGTH` | `2000` |
| `DATA_CLASSIFICATION` | `'SYNTHETIC'` |
| `SYNTHETIC_LABEL` | human-readable label containing "SYNTHETIC" and "not customs law" |
| `REPORT_SCHEMA_VERSION` | `'originproof.report.v1'` |
| `CSV_EXPORT_COLUMNS` | `record_type,id,rule_id,rule_version,supplier_id,document_id,kind,field,expected,observed,delta_units,text,data_classification` |
| `LIMITATIONS` | frozen, non-empty string array embedded in every analysis and report |
| `ENGINE_PUBLIC_API` | frozen sorted array of every exported name |

### Functions

| Function | Returns | Purpose |
|---|---|---|
| `parseShipmentJson(input, {sourceName?})` | `Result<{input, source}>` | Bytes/string → validated shipment. Checks size (`INPUT_TOO_LARGE`, before decoding), then `INVALID_UTF8`, `MALFORMED_JSON`, then every `validateShipment` error. `source = {sourceName, format:'json', byteLength}`. |
| `validateShipment(value)` | `Result<Shipment>` | Strict, atomic schema validation. Returns a deep-frozen canonical clone with records verbatim in input order. |
| `analyze(value)` | `Result<Analysis>` | Re-validates, then evaluates OP01/OP02/OP03. Invalid input → `ok:false` and **no** findings. |
| `appendReviewNote(history, note, analysis)` | `Result<ReviewNote[]>` | Returns a new frozen array; never mutates `history`. Note text is inert and never interpreted. |
| `buildReport({analysis, reviewNotes, generatedAt, semanticFingerprint})` | `Result<Report>` | Deep-frozen report (`schemaVersion:'originproof.report.v1'`). |
| `serializeReportJson(report)` | `string` | Sorted keys, 2-space indent, LF, trailing newline. |
| `parseReportJson(textOrBytes)` | `Result<Report>` | Strict re-import; recomputes the analysis from `report.input` and fails with `REPORT_MISMATCH` if findings/counts differ. Never throws. Round-trips `serializeReportJson` exactly. |
| `serializeReportCsv(report)` | `string` | CRLF rows, every cell double-quoted, formula-safe (see below). Row groups in order `META, COUNT, EVIDENCE, FINDING, REVIEW_NOTE`; every row carries `data_classification = SYNTHETIC`. |
| `computeSemanticFingerprint(analysisOrReport)` | `Promise<string>` | SHA-256 hex of `canonicalJson({engineContractVersion, ruleVersion, input, findings, counts, evidence, lineage})`. Identical for an analysis and the report built from it; excludes `generatedAt` and `reviewNotes`. |
| `verifySemanticFingerprint(report)` | `Promise<boolean>` | Recomputes the fingerprint over the report's semantic subset and compares it to `report.semanticFingerprint`; `false` for non-objects or a missing fingerprint. Tamper-evidence only — not a signature. |
| `canonicalJson(value)` | `string` | Sorted object keys, no whitespace. |
| `escapeHtml(text)` | `string` | Escapes `& < > " '`. The engine never renders HTML itself. |

### Shapes (summary)

- **Shipment**: `{schemaVersion:1, ruleVersion:'OP-DEMO-1', shipment:{id, declaredCountry, quantityUnits}, suppliers:[{id,name}], edges:[{id, fromSupplierId, toSupplierId}], documents:[{id, shipmentId, supplierId, kind, country, quantityUnits}], requiredEvidence:[{supplierId, kind}]}`. Edges are upstream → downstream and must form a DAG.
- **Analysis**: `{engineContractVersion, schemaVersion, ruleVersion, dataClassification, syntheticLabel, input, status, findings, counts, evidence, lineage, limitations}`.
  `counts = {findings, byRule:{OP01,OP02,OP03}, suppliers, edges, documents, originDocuments, productionDocuments, requiredPairs, fulfilledPairs, quantityMismatchAbsoluteUnits}`.
  `lineage = {order, suppliers:[{supplierId, upstream, downstream, path}], documents:[{documentId, supplierId, path}]}`.
- **Finding**: `{findingId, ruleId, ruleVersion, severity:'REVIEW_REQUIRED', subject, field, expected, observed, deltaUnits, inputRefs:[{pointer, recordType, recordId, value}], path, rationale, source:{rulePack:'OP-DEMO-1', clause, illustrative:true}}`.
  Stable ids: `OP01:<supplierId>:<kind>`, `OP02:<docId>`, `OP03:<docId>`. Findings are ordered by rule, then by `findingId` (code-unit order).
- **ReviewNote**: `{sequence, findingId, text, recordedAt:'YYYY-MM-DDThh:mm:ssZ'}`; `sequence` strictly increases, `findingId` must exist in the analysis.

### Rules (fictional contract `OP-DEMO-1`)

| Rule | Trigger | Finding |
|---|---|---|
| OP01 | a `requiredEvidence` pair has no document with the same `supplierId` + `kind` | `field:'kind'`, `expected: kind`, `observed: null` |
| OP02 | an **origin** document's `country` differs from `shipment.declaredCountry` | `field:'country'`, expected declared, observed document |
| OP03 | an **origin** document's `quantityUnits` differs from `shipment.quantityUnits` | `field:'quantityUnits'`, `deltaUnits = observed - expected` |

`counts.quantityMismatchAbsoluteUnits` is the sum of `|deltaUnits|` over OP03 findings.
The rules compare values inside this fictional contract only; they do not imply that
suppliers must legally share a country or a quantity.

## Result semantics

Every fallible function returns a discriminated union and never throws on bad input:

```js
{ ok: true,  value: T }
{ ok: false, errors: [{ code, message, path }] }   // no value, no stack traces
```

The untrusted-input entry points (`parseShipmentJson`, `validateShipment`, `analyze`,
`appendReviewNote`, `buildReport`, `parseReportJson`) never throw for any argument value.
`serializeReportJson`, `serializeReportCsv`, `computeSemanticFingerprint` and
`verifySemanticFingerprint` take engine-produced reports or analyses; passing something
else is a programmer error and throws `TypeError` (covered by
`packages/originproof-engine/test/robustness.test.js`).

`path` is a JSON pointer into the offending input (`'/documents/1/supplierId'`, `''` for
the whole input). Validation is atomic: any error means no value, no findings, and no
partial state. Error codes include `INPUT_TOO_LARGE`, `INVALID_UTF8`, `MALFORMED_JSON`,
`INVALID_TYPE`, `MISSING_FIELD`, `UNKNOWN_FIELD`, `UNSUPPORTED_SCHEMA_VERSION`,
`UNSUPPORTED_RULE_VERSION`, `INVALID_ID`, `DUPLICATE_ID`, `INVALID_COUNTRY`,
`INVALID_QUANTITY`, `INVALID_KIND`, `STRING_TOO_LONG`, `TOO_MANY_RECORDS`,
`UNKNOWN_REFERENCE`, `DUPLICATE_REQUIRED_PAIR`, `CYCLE_DETECTED`, `AGGREGATE_OVERFLOW`
(the sum of absolute OP03 quantity discrepancies would exceed `Number.MAX_SAFE_INTEGER`;
the whole candidate is rejected by `analyze`, never truncated, rounded or clamped), and for notes/reports
`INVALID_SEQUENCE`, `UNKNOWN_FINDING`, `INVALID_NOTE`, `INVALID_TIMESTAMP`,
`INVALID_FINGERPRINT`, `INVALID_CLASSIFICATION`, `MISSING_SYNTHETIC_LABEL`,
`UNSUPPORTED_ENGINE_VERSION`, `INVALID_LIMITATIONS`, `REPORT_MISMATCH`.
Errors are reported in detection order (input order within each collection), capped at 100.

## Limits

| Limit | Value | Behaviour |
|---|---|---|
| Upload size | 1 MiB (`MAX_UPLOAD_BYTES`) | `INPUT_TOO_LARGE`, checked before decoding |
| Records | 1000 total (`MAX_RECORDS`) | `TOO_MANY_RECORDS`, checked before deep validation |
| String fields | 500 chars | `STRING_TOO_LONG` |
| Review note text | 1..2000 chars | `INVALID_NOTE` |
| Shipments per input | exactly one | by schema |

A rejected input never changes a previously computed result (results are frozen values,
not shared state).

## Security posture

- **Strict schema.** Unknown own keys (including `__proto__`, `constructor`, `prototype`)
  are rejected with `UNKNOWN_FIELD`; wrong types and versions are rejected rather than
  coerced or guessed. Validation happens before any domain logic.
- **No code execution of any kind.** The engine contains no `eval`, `new Function`,
  dynamic `import()`, `require`, timers or clock reads, and no randomness; the
  architecture test enforces this on every source file.
- **No I/O.** No `fetch`, `XMLHttpRequest`, DOM (`document.`, `window.`, `innerHTML`),
  `process.` or `node:` imports in the engine. Document URLs are never fetched; uploaded
  content is parsed as data and never executed. No runtime AI.
- **Frozen outputs.** Validated shipments, analyses, reports and review-note arrays are
  deep-frozen; inputs are preserved verbatim; review notes are kept separate from findings.
- **Formula-safe CSV.** Every cell is double-quoted with `"` doubled; text cells beginning
  with `=`, `+`, `-`, `@`, TAB or CR get a leading `'`. `delta_units` is a typed integer cell
  emitted verbatim (for example `"-10"`), and every row carries `data_classification`.
- **Escaped display.** `escapeHtml` exists for consumers; the engine never builds HTML.
  Supplier names such as `<script>alert(1)</script>` are stored verbatim and rendered only
  as escaped text.
- **Unkeyed integrity hash.** `computeSemanticFingerprint` is a SHA-256 of the semantic
  content — a tamper-evidence aid, **not** a signature or authentication.
- **No secrets.** `tests/architecture/no-secrets.test.js` scans the tree for
  credential-shaped strings.

## User journey → test coverage

Steps are from the spec's user journey. Test files are under `tests/originproof-reference/`;
engine-level coverage only, since this slice has no UI.

| # | Journey step | Engine surface | Covering test |
|---|---|---|---|
| 1 | Load named fixture | `parseShipmentJson(bytes, {sourceName})` → `source.sourceName` | `golden.test.js` |
| 2 | Inspect source records | `analysis.input` is the verbatim, frozen shipment | `golden.test.js` |
| 3 | Run validation | `validateShipment` / `analyze` | `golden.test.js`, `adversarial.test.js` |
| 4 | Filter findings | `findings[].ruleId` / `severity` / `subject`; `counts.byRule` matches a filter | `golden.test.js` |
| 5 | Open one finding, its cited inputs and rule version | `inputRefs` (sorted pointers), `path`, `source.{rulePack,clause}`, `ruleVersion` | `golden.test.js` |
| 6 | Record a human review note | `appendReviewNote` (separate from findings, inert text) | `review-notes.test.js` |
| 7 | Export JSON report (and CSV) | `buildReport`, `serializeReportJson`, `serializeReportCsv` | `export.test.js` |
| 8 | Re-import exported report and compare findings | `parseReportJson` round-trip + `REPORT_MISMATCH` on tampering | `export.test.js` |
| — | Empty / invalid-file / export-error states are real | adversarial case 1 (empty), case 8 (invalid file), `buildReport`/`parseReportJson` `ok:false` | `adversarial.test.js`, `export.test.js` |
| — | Loading state, keyboard access, mobile layout | no UI in this slice | **NOT VERIFIED** |

## Status

Specification-driven vertical slice. No production-readiness claim is made. Qualified
expert review of authoritative policy and a separate privacy/security assessment must
precede any real-world use; see `docs/LIMITATIONS.md`.
