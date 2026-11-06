# OriginProof public site: design decision

Scope: the public homepage (`index.html`, `app/landing.css`, `app/landing.js`). The workbench at `app/` is unchanged. All data is synthetic; `AA`/`BB` are placeholder labels; rule pack `OP-DEMO-1` is fictional. Status of visual claims follows the rubric; rows not marked otherwise remain unverified.

## Three alternatives

| | A. Cartographic provenance atlas | B. Supplier tree ledger | C. Customs evidence folio |
|---|---|---|---|
| Type | Serif titles (Source Serif 4 intent, Iowan/Georgia fallback), humanist sans body, mono for record IDs | Condensed grotesque headers, tabular mono everywhere | Typewriter-adjacent mono headings, serif body |
| Colour | Navy `#173042`, paper `#F2EFE6`, forest `#286455`, ochre `#A77A21`, white | Cool grey, one red | Manila, stamp red, carbon blue |
| Composition | Asymmetric: short copy left, a large drafted sheet bleeds right; declared chain steps diagonally down the sheet, evidence chips hang off each supplier | Dense indented tree table, full width | Stacked paper folio with tabs and stamps |
| Domain image | Original SVG chart sheet: supplier nodes, declared edges, document chips, empty required-evidence slot, finding flags. No coastlines, no coordinates | Collapsible tree | Scanned-looking forms |
| Motion | Route draws once on load; selecting a finding lights its flag, chip and detail together | Row expand | Stamp thump |
| Phone | Vertical route list (ordered, relationships first), same flags, no horizontal scroll; sheet SVG hidden below 760 px | Tree collapses to indented list | Folio tabs become accordion |

## Selected: A, cartographic atlas

Why: it is the approved Atlas direction, and the product's real object is a directed chain with documents attached, which a drafted chart sheet shows more honestly than a tree table (B hides the document-to-supplier relation in rows) or skeuomorphic forms (C leans toward implying customs authority, which the README disclaims). The cartographic *grammar* (sheet, ticks, legend, plate labels) is borrowed; the *geography* is not. Position along the sheet means order along declared edges only, and the sheet says so.

Honesty constraints built into the image:
- The shipment is a separate plate. No arrow joins it to a supplier, because the fixture declares no such edge; documents cite it by `shipmentId` and are labelled that way.
- Only the two declared edges (`EDGE-1`, `EDGE-2`) are drawn between suppliers.
- The empty `MILL-1 / production` slot is dashed: it is a required pair with no document.
- Finding flags (OP01, OP02, OP03) are filled in from the real engine run against the bundled `golden.json` when the page loads; the drawn sheet is a static illustration of that same fixture and is labelled as such. If the engine run fails, the page says so and still links to the workbench.

## Rubric (honest)

| Criterion | Intent | Decision | Evidence inspected | Status |
|---|---|---|---|---|
| Point of view | Evidence as a drafted chart of one case | Chart-sheet hero, one named case | Code read only | Unverified |
| Typography | Editorial serif plus dense neutral sans | Local font stacks only (no webfonts allowed) | Not rendered | Unverified |
| Colour | Paper, navy ink, forest and ochre | Tokens in `landing.css`; ochre text uses a darker shade for contrast | Contrast not measured | Unverified |
| Hierarchy | Case first, findings second, limits visible, one CTA | Hero, case, live findings, rules, limits, CTA | Code read only | Unverified |
| Imagery | Original, labelled, no invented geography | Inline SVG | Not rendered | Unverified |
| Motion | One restrained route draw, selection highlight | CSS only, disabled under `prefers-reduced-motion` | Not watched | Unverified |
| Mobile | Relationships list before graph | Ordered route list below 760 px | Not viewed | Unverified |
| Invisible quality | Semantic, keyboard, fallbacks, CSP-safe | No inline script, relative URLs, text-only DOM writes | `node --check` on JS only | Mixed |

A green build upgrades none of these.

## Reported inspection (by the project owner, not by the author of this edit)

- Dist build succeeded.
- Chrome screenshots inspected at 1440x1000 and true emulated 390x844.
- At 390px, document and body width were 390: no horizontal overflow.
- The engine ran from `golden.json` and rendered 3 findings.

Defects found in that inspection:
1. Desktop: the SHIP-1 plate note ("Documents cite it by id. No edge to a supplier is declared.") was clipped at the right edge of the SVG frame. Status: **fixed in source, pending re-render** (note split into two SVG lines, plate made taller).
2. The live tally status value `FINDINGS_PRESENT` crowded neighbouring cells because every `dd` used 26px serif. Status: **fixed in source, pending re-render** (status `dd` gets 13px mono with wrapping; tally column minimum raised to 130px; numeric totals keep 26px serif).

No rubric row above is upgraded by these source edits; re-render is required.

## Post-fix evidence (second pass, recorded by the author of this edit)

Performed after the previous edits:
- `npm run build` passed.
- Chrome rendered the landing page at desktop and 390px emulated widths.
- The real bundled fixture engine returned 3 findings.
- A screenshot was inspected.
- At phone size, document and body width were 390.

Remaining (still visible in the 1440px screenshot): the `FINDINGS_PRESENT` status label wraps awkwardly.

Remediation, **pending until Codex rerenders** (not yet verified): in `app/landing.css` the first tally entry spans two grid columns (`.tally div:first-child`), and the status `dd` is 12px mono with `white-space: nowrap`. No JS or engine change. No tests run, nothing deployed.
