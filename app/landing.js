// Homepage glue. Runs the real engine on the bundled golden fixture and renders its output.
// All data reaches the DOM via textContent. No network beyond the same-origin fixture.
import { analyze, parseShipmentJson, computeSemanticFingerprint } from '../packages/originproof-engine/src/index.js';

const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = String(text);
  if (cls) n.className = cls;
  return n;
};
const show = (v) => (v === null || v === undefined ? 'none' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function fail(msg) {
  $('live-status').textContent = msg;
  $('live-fallback').hidden = false;
}

function select(f, button) {
  for (const b of $('findings').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
  for (const n of document.querySelectorAll('[data-finding]')) n.classList.toggle('is-on', n.dataset.finding === f.findingId);
  const d = $('detail');
  d.replaceChildren(el('h3', f.findingId));
  const dl = el('dl');
  const rows = [
    ['rule', `${f.ruleId} (${f.ruleVersion})`], ['field', f.field], ['expected', show(f.expected)], ['observed', show(f.observed)],
    ['cited inputs', (f.inputRefs || []).map((r) => r.pointer).join(', ') || 'none'], ['rationale', f.rationale],
  ];
  if (f.deltaUnits !== null && f.deltaUnits !== undefined) rows.splice(4, 0, ['delta units', show(f.deltaUnits)]);
  for (const [k, v] of rows) { dl.appendChild(el('dt', k)); dl.appendChild(el('dd', show(v))); }
  d.appendChild(dl);
  d.hidden = false;
}

async function main() {
  const url = new URL('../fixtures/originproof/golden.json', import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fixture fetch failed: HTTP ${res.status}`);
  const parsed = parseShipmentJson(new Uint8Array(await res.arrayBuffer()), { sourceName: 'golden.json' });
  const out = parsed.ok ? analyze(parsed.value.input) : parsed;
  if (!out.ok) return fail(`The engine returned an error: ${out.errors.map((e) => `${e.code} ${e.path}`).join('; ')}`);
  const a = out.value;

  const tally = $('tally');
  const c = a.counts || {};
  const items = [['status', a.status], ['findings', c.findings], ['origin documents', c.originDocuments],
    ['required pairs', c.requiredPairs], ['fulfilled pairs', c.fulfilledPairs], ['units apart (OP03)', c.quantityMismatchAbsoluteUnits]];
  for (const [k, v] of items) {
    if (v === undefined) continue;
    const row = el('div'); row.appendChild(el('dt', k)); const dd = el('dd', v); if (k === 'status') dd.className = 'status'; row.appendChild(dd); tally.appendChild(row);
  }
  tally.hidden = false;

  for (const f of a.findings) {
    const li = el('li');
    const b = el('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
    b.appendChild(el('span', f.ruleId, 'rid')); b.appendChild(el('span', f.findingId, 'fid'));
    b.appendChild(el('span', `${f.field}: expected ${show(f.expected)}, observed ${show(f.observed)}`, 'why'));
    b.addEventListener('click', () => select(f, b));
    li.appendChild(b); $('findings').appendChild(li);
  }

  let fp = '';
  try { fp = ` Semantic fingerprint ${(await computeSemanticFingerprint(a)).slice(0, 16)}… (unkeyed hash, not a signature).`; } catch { /* no WebCrypto: omit */ }
  $('live-status').textContent = `Engine ${a.engineContractVersion}, rule pack ${a.ruleVersion}, ran in this page on golden.json: ${a.findings.length} finding(s). Select one to light its record on the sheet.${fp}`;
  if (a.findings.length === 0) $('live-status').textContent += ' The engine reported no findings, which says nothing about the shipment beyond those fictional rules.';
}

main().catch((err) => fail(`The in-page engine run failed: ${err.message}`));
