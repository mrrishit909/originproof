# OriginProof traceability matrix

Maps every statement in `atlas/docs/specs/ORIGINPROOF-VERTICAL-SLICE.md` to the test that
covers it. The reference test files under `tests/originproof-reference/` are
`golden.test.js`, `adversarial.test.js`, `export.test.js` and `review-notes.test.js`
(all exist; immutability and input-preservation checks live in `golden.test.js` and
`adversarial.test.js`). Case names quoted below are descriptive, not exact `test()` titles,
and the auditor should reconcile them against the actual test titles.
`tests/architecture/*` are owned by this document's author and exist. `NOT VERIFIED`
marks statements that this slice cannot verify (UI or process items).

All data is SYNTHETIC; rule pack OP-DEMO-1 is fictional and not customs law.

## 1. Minimal schema

| Spec statement | Expected covering test |
|---|---|
| `schemaVersion:1` required; other versions rejected (`UNSUPPORTED_SCHEMA_VERSION`) | `adversarial.test.js` :: "case 8: unknown schema version rejected" (expected) |
| `ruleVersion:OP-DEMO-1` required; other values rejected (`UNSUPPORTED_RULE_VERSION`) | `adversarial.test.js` :: "case 8: unknown rule version rejected, previous result unchanged" (expected) |
| Exact object shape: shipment, suppliers, edges, documents, requiredEvidence; no extra keys (`UNKNOWN_FIELD`, `MISSING_FIELD`, `INVALID_TYPE`) | `adversarial.test.js` :: "strict schema: unknown field / missing field / wrong type" (expected) |
| IDs nonempty unique strings (`INVALID_ID`, `DUPLICATE_ID` with path to duplicate) | `adversarial.test.js` :: "case 2: duplicate DOC-1 id" (expected) |
| Country exactly two uppercase letters, demo format (`INVALID_COUNTRY`) | `adversarial.test.js` :: "invalid country format rejected" (expected) |
| Quantities nonnegative safe integers (`INVALID_QUANTITY`) | `adversarial.test.js` :: "case 5: quantity -1 and 1.5 rejected" (expected) |
| Kinds `origin\|production` (`INVALID_KIND`) | `adversarial.test.js` :: "invalid kind rejected" (expected) |
| All references must resolve, incl. document.shipmentId = shipment.id (`UNKNOWN_REFERENCE` with field path) | `adversarial.test.js` :: "case 3: unknown supplier reference with field path" (expected) |
| Edges upstream→downstream must form a DAG (`CYCLE_DETECTED`, self-loop is a cycle) | `adversarial.test.js` :: "case 4: cycle rejected without hang" (expected) |
| Sum of absolute OP03 discrepancies must stay a safe integer; whole candidate rejected before counts/report/export (`AGGREGATE_OVERFLOW`, path to the document that overflows the sum); exact `MAX_SAFE_INTEGER` sum still accepted (OP-A01) | `engine.test.js` :: "OP-A01: aggregate OP03 discrepancy above MAX_SAFE_INTEGER is rejected atomically, never truncated or clamped" (self-tested); Codex-owned `originproof-independent.test.mjs` :: "aggregate quantity discrepancy must never become unsafe integer" |
| Invalid schema/reference/cycle prevents domain evaluation (no findings) | `adversarial.test.js` :: cases 2–5 assert `analyze(...).ok === false` and no `findings` (expected) |

## 2. Literal golden fixture

| Spec statement | Expected covering test |
|---|---|
| SHIP-1 / AA / 100; RAW-1, MILL-1, ASSEMBLER-1; EDGE-1, EDGE-2; DOC-1..3; four required pairs — fixture validates | `golden.test.js` :: "golden fixture validates and parses by name" (expected) |
| Rules evaluated in deterministic order OP01, OP02, OP03 | `golden.test.js` :: "findings ordered by rule then findingId" (expected) |
| Exactly 3 findings with ids `OP01:MILL-1:production`, `OP02:DOC-2`, `OP03:DOC-3` | `golden.test.js` :: "exactly three stable finding ids" (expected) |
| OP01 finding cites required pair and supplier | `golden.test.js` :: "OP01 subject is requiredEvidence MILL-1/production with inputRefs" (expected) |
| OP02:DOC-2 expected AA, actual BB | `golden.test.js` :: "OP02:DOC-2 expected AA observed BB" (expected) |
| OP03:DOC-3 expected 100, actual 90, delta -10 | `golden.test.js` :: "OP03:DOC-3 deltaUnits -10" (expected) |
| Counts by rule 1/1/1 | `golden.test.js` :: "counts.byRule 1/1/1" (expected) |
| Origin documents 3, required pairs 4, fulfilled pairs 3 | `golden.test.js` :: "counts originDocuments/requiredPairs/fulfilledPairs" (expected) |
| Quantity mismatch total absolute units 10 | `golden.test.js` :: "quantityMismatchAbsoluteUnits is 10" (expected) |
| Do not sum repeated document quantities as throughput | `golden.test.js` :: "no throughput sum in counts" (expected) |
| DOC-2 path RAW-1→MILL-1→ASSEMBLER-1 inspectable | `golden.test.js` :: "OP02:DOC-2 path and lineage.documents" (expected) |
| Status vocabulary: `FINDINGS_PRESENT` / `NO_FINDINGS`, never compliant/certified | `golden.test.js` :: "status is FINDINGS_PRESENT; no certification vocabulary" (expected) |
| Clean variant (DOC-4 MILL-1 production AA 100; DOC-2 AA; DOC-3 100) → zero findings, fulfilled 4/4 | `golden.test.js` :: "clean variant: zero findings, fulfilled 4/4, NO_FINDINGS" (expected) |

## 3. Eight adversarial cases

| # | Spec statement | Expected covering test |
|---|---|---|
| 1 | Empty documents → 4 OP01, no OP02/OP03, fulfilled 0/4 | `adversarial.test.js` :: "case 1: empty documents" (expected) |
| 2 | Duplicate DOC-1 id → schema rejection, zero domain findings | `adversarial.test.js` :: "case 2: duplicate DOC-1 id" (expected) |
| 3 | Unknown supplier reference → rejection with field path | `adversarial.test.js` :: "case 3: unknown supplier reference with field path" (expected) |
| 4 | ASSEMBLER-1→RAW-1 edge → cycle rejection, no traversal hang | `adversarial.test.js` :: "case 4: cycle rejected without hang" (expected) |
| 5 | Quantity -1 or 1.5 → schema rejection | `adversarial.test.js` :: "case 5: quantity -1 and 1.5 rejected" (expected) |
| 6 | Two distinct documents contradict country → two separate OP02 findings | `adversarial.test.js` :: "case 6: two OP02 findings, no merging" (expected) |
| 7 | Supplier name `<script>alert(1)</script>` → escaped display text, no execution | `adversarial.test.js` :: "case 7: script name preserved verbatim, escapeHtml neutralises" (expected); `tests/architecture/boundaries.test.js` :: "engine source contains no DOM, eval or dynamic code paths" |
| 8 | Oversized file, >1000 records, malformed JSON, unknown rule version → bounded rejection; previous valid result unchanged | `adversarial.test.js` :: "case 8: bounded rejections leave previous result unchanged" (expected) |

## 4. Acceptance

| Spec statement | Expected covering test |
|---|---|
| Unit fixtures pass | `golden.test.js`, `adversarial.test.js` (expected) |
| Integration validation/export test passes | `export.test.js` (expected) |
| End-to-end investigation journey passes | engine-level: `review-notes.test.js` + `export.test.js` (expected); UI journey: **NOT VERIFIED** |
| Independent auditor recomputes exact counts and 10-unit discrepancy | `golden.test.js` (expected) plus manual recomputation (process; see `docs/LIMITATIONS.md` item 11) |
| Domain expert reviews evidence sufficiency before any legal-use rule pack | **NOT VERIFIED** (process gate; documented in `docs/LIMITATIONS.md` item 19) |

## 5. Execution and security contract

| Spec statement | Expected covering test |
|---|---|
| No paid runtime APIs, live account integrations or real regulated data | `tests/architecture/boundaries.test.js` :: "engine source contains no DOM, eval or dynamic code paths" (no fetch/XHR/`node:`); all fixtures synthetic |
| Demo data labelled synthetic in exports | `export.test.js` :: "JSON report carries dataClassification and syntheticLabel; CSV META row includes label and every row has SYNTHETIC" (expected) |
| Demo data labelled synthetic in UI | **NOT VERIFIED** (no UI) |
| Preserve input records | `golden.test.js` :: "analysis.input deep-equals validated input, records verbatim in input order" (expected) |
| Findings and reviewer decisions are separate | `review-notes.test.js` :: "notes live in reviewNotes; findings and fingerprint unchanged" (expected) |
| Reject unknown schema/rule versions rather than guessing | `adversarial.test.js` :: case 8 (expected) |
| Validate payload before processing | `adversarial.test.js` :: cases 2–5 (`analyze` returns errors, no findings) (expected) |
| No evaluating expressions, raw HTML, URL fetching or executing uploaded content | `tests/architecture/boundaries.test.js` :: "engine source contains no DOM, eval or dynamic code paths"; `adversarial.test.js` :: case 7 (expected) |
| Reject files over 1 MiB or over 1000 records | `adversarial.test.js` :: case 8 (`INPUT_TOO_LARGE` before decoding, `TOO_MANY_RECORDS`) (expected) |
| Engine is dependency-free ESM with a sealed public API | `tests/architecture/boundaries.test.js` :: "root package.json is ESM with no dependencies", "index.js exports exactly ENGINE_PUBLIC_API", "relative imports end with .js and nothing imports node:" |
| No credentials in the tree | `tests/architecture/no-secrets.test.js` :: "no credential-shaped strings in the repository" |

## 6. User journey

| Step | Expected covering test |
|---|---|
| Load named fixture | `golden.test.js` :: "golden fixture validates and parses by name" (`source.sourceName`, `format:'json'`, `byteLength`) (expected) |
| Inspect source records | `golden.test.js` :: "analysis.input deep-equals validated input" (expected) |
| Run validation | `golden.test.js`, `adversarial.test.js` (expected) |
| Filter findings | `golden.test.js` :: "filtering findings by ruleId matches counts.byRule" (expected) |
| Open one finding and its cited inputs / rule version | `golden.test.js` :: "finding inputRefs sorted by pointer, source.clause, ruleVersion" (expected) |
| Record a human review note | `review-notes.test.js` :: "appendReviewNote returns new frozen array; error codes" (expected) |
| Export JSON report | `export.test.js` :: "serializeReportJson sorted keys / LF / trailing newline" (expected) |
| Re-import/reparse exported report and compare findings | `export.test.js` :: "parseReportJson(serializeReportJson(r)) deep-equals r; tampered findings → REPORT_MISMATCH" (expected) |
| Semantic fingerprint stable across analysis and report, excludes notes/timestamp | `export.test.js` :: "computeSemanticFingerprint 64 hex, equal for analysis and report" (expected) |
| Loading state is real | **NOT VERIFIED** (UI) |
| Empty state is real | `adversarial.test.js` :: case 1 (engine); UI **NOT VERIFIED** |
| Invalid-file state is real | `adversarial.test.js` :: case 8 (engine); UI **NOT VERIFIED** |
| Export-error state is real | `export.test.js` :: "buildReport / parseReportJson return ok:false on bad input" (expected); UI **NOT VERIFIED** |
| Keyboard access | **NOT VERIFIED** (no UI) |
| Mobile layout | **NOT VERIFIED** (no UI) |

## 7. Release-blocking audit conditions

| Condition | Expected covering test |
|---|---|
| Count mismatch | `golden.test.js` counts cases; `export.test.js` :: `REPORT_MISMATCH` on tampered report (expected) |
| Untraceable finding | `golden.test.js` :: every finding has non-empty `inputRefs`, `path`, `source.clause` (expected) |
| Unsafe input handling | `adversarial.test.js` (expected); `tests/architecture/boundaries.test.js` |
| False certification claim | `golden.test.js` :: status vocabulary (expected); README and `SYNTHETIC_LABEL` wording |
| No production-readiness claim; expert/privacy/security review precede deployment | **NOT VERIFIED** (process; `docs/LIMITATIONS.md` item 19) |
