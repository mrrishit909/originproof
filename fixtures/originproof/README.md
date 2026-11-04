# OriginProof fixtures (SYNTHETIC)

All data in this directory is synthetic and fictional. Supplier names, shipment
ids, document ids, quantities and the two-letter labels `AA`/`BB`/`CC` are demo
labels only; they are not real companies, shipments, or country assessments.
Rule pack `OP-DEMO-1` is a fictional evidence-contract configuration, not
customs law. Nothing here supports a compliance or certification claim.

| Fixture | Purpose | Expected engine outcome |
|---|---|---|
| `golden.json` | Literal golden fixture from the spec | 3 findings: `OP01:MILL-1:production`, `OP02:DOC-2`, `OP03:DOC-3` (delta -10) |
| `clean.json` | Golden + DOC-4 production, DOC-2 country AA, DOC-3 quantity 100 | 0 findings, fulfilled 4/4, `NO_FINDINGS` |
| `adversarial-01-empty-documents.json` | No documents | 4 OP01 findings only, fulfilled 0/4 |
| `adversarial-02-duplicate-doc-id.json` | Second document reuses `DOC-1` | `DUPLICATE_ID` at `/documents/1/id`, no findings |
| `adversarial-03-unknown-supplier.json` | DOC-1 references `GHOST-9` | `UNKNOWN_REFERENCE` at `/documents/0/supplierId` |
| `adversarial-04-cycle.json` | Adds `ASSEMBLER-1 -> RAW-1` edge | `CYCLE_DETECTED`, no hang |
| `adversarial-05a-negative-quantity.json` | DOC-3 quantity -1 | `INVALID_QUANTITY` at `/documents/2/quantityUnits` |
| `adversarial-05b-fractional-quantity.json` | Shipment quantity 1.5 | `INVALID_QUANTITY` at `/shipment/quantityUnits` |
| `adversarial-06-two-country-contradictions.json` | DOC-2 BB and DOC-3 CC, DOC-4 production present | exactly two OP02 findings, nothing else |
| `adversarial-07-script-name.json` | Supplier name `<script>alert(1)</script>` | Valid; name preserved verbatim; displayed via `escapeHtml` |
| `adversarial-08c-malformed.json.txt` | Truncated JSON text | `MALFORMED_JSON` |
| `adversarial-08d-unknown-rule-version.json` | `ruleVersion: OP-DEMO-2` | `UNSUPPORTED_RULE_VERSION` at `/ruleVersion` |

Oversized input (1,048,577 bytes) and the 1,001-record batch
(`adversarial-08b`) are generated in-test rather than stored.

`index.js` exports `FIXTURE_NAMES`, `loadFixtureText(name)`,
`loadFixtureBytes(name)` and `loadFixtureJson(name)` for tests only. The engine
never reads files.
