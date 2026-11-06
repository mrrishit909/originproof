# OriginProof limitations

This document is normative for the slice: every item below is a deliberate boundary. The
engine also embeds a frozen `LIMITATIONS` array in every analysis and report so the
boundaries travel with the data.

**All data is SYNTHETIC.** Rule pack `OP-DEMO-1` is a fictional evidence-contract
configuration and is not customs law.

## Domain scope

1. **No customs law.** OP01/OP02/OP03 compare fields inside a fictional contract. They do
   not implement, approximate or cite any real rule of origin, tariff schedule, trade
   agreement or regulation. No inference is made that suppliers must legally share a
   country or a quantity.
2. **No sanctions, denied-party or restricted-entity screening** of any kind.
3. **No geography inference.** Country values are compared as opaque two-letter labels.
   Nothing is derived from supplier location, routing, distance or adjacency.
4. **No clearance decision.** Status is only `FINDINGS_PRESENT` or `NO_FINDINGS`. The
   engine never emits "compliant", "certified", "cleared", "approved" or any equivalent,
   and `NO_FINDINGS` means only that the fictional rules produced no findings.
5. **Single shipment.** One shipment per input; no batches, no cross-shipment history, no
   aggregation. Repeated document quantities are never summed as shipment throughput.
6. **Fictional `AA`/`BB` labels.** These are placeholders, not country assessments.
7. **Demo country format.** `^[A-Z]{2}$` is a demo field format, not ISO 3166 validation;
   any two uppercase letters are accepted.
8. **Declared relationships only.** Edges are taken as declared by the input; the engine
   does not discover, verify or score supplier relationships.

## Integrity and trust

9. **The semantic fingerprint is an unkeyed hash, not a signature.** `computeSemanticFingerprint`
   is SHA-256 over canonical JSON. It detects accidental drift; it proves nothing about
   who produced the report and offers no protection against a party who can recompute it.
10. **A parsed report is an unverified import.** `parseReportJson` checks structure,
    recomputes the analysis from `report.input` and rejects mismatches, but it cannot
    establish provenance, authorship or timestamp authenticity of the file.
11. **Independent auditor must recompute.** Release depends on an independent party
    re-deriving the exact counts (3 findings; by rule 1/1/1; origin documents 3; required
    pairs 4; fulfilled 3; 10 absolute mismatch units for the golden fixture) rather than
    trusting these tests.
12. **Review notes are inert text.** Notes are stored and exported verbatim, never
    interpreted, and never change findings or counts.

## Engineering scope

13. **UI scope.** A synthetic browser workbench and a public homepage exist and run the
    engine on the bundled fictional fixture. Their visual, keyboard and mobile behaviour
    is checked by hand, not by automated browser tests, and real data is not supported.
14. **No typecheck.** Types are JSDoc only; nothing enforces them at build time.
15. **No persistence, authentication, multi-user or audit log.** The engine is a pure
    function library.
16. **No runtime integrations.** No paid APIs, no live accounts, no network access, no
    runtime AI, no real regulated data.
17. **Bounded inputs.** Files over 1 MiB, inputs with more than 1000 records, strings
    over 500 characters and notes over 2000 characters are rejected, not truncated.
18. **No internationalisation**; messages are English demo strings.
19. **Bounded nesting.** Report and option values may nest at most 32 levels; deeper, non-finite
    or sparse data is rejected with `INVALID_TYPE` rather than canonicalized.
20. **Known minor gaps (recorded by review, not yet fixed).** `counts.quantityMismatchAbsoluteUnits`
    is a plain number, so sums above 2^53-1 lose precision (only reachable with synthetic
    quantities near the safe-integer ceiling). Review-note text is length-checked only, so
    control characters such as NUL are stored verbatim and reach the quoted CSV cell.

## Before any real-world use

19. **Expert review is required before any legal-use rule pack.** A qualified domain
    expert must review evidence sufficiency and authoritative policy; a separate
    privacy and security assessment must be completed. No production-readiness claim
    is made for this slice.
