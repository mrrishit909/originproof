// DOM glue for OriginProof. All data reaches the DOM via textContent (escaped rendering only).
// Renders whatever the engine returns, including structured errors; never masks or reinterprets them.
import {
  analyze, buildReport, computeSemanticFingerprint, parseShipmentJson,
  serializeReportCsv, serializeReportJson, appendReviewNote, SYNTHETIC_LABEL,
} from '../packages/originproof-engine/src/index.js';
import { neutraliseCsv, summaryCards, findingLabel, lineageRows, uiState, formatErrors } from './ui.js';

// Seeded fixture list only; no arbitrary import in the public UI.
const FIXTURES = [
  'golden.json', 'clean.json', 'adversarial-01-empty-documents.json', 'adversarial-02-duplicate-doc-id.json',
  'adversarial-03-unknown-supplier.json', 'adversarial-04-cycle.json', 'adversarial-05a-negative-quantity.json',
  'adversarial-05b-fractional-quantity.json', 'adversarial-06-two-country-contradictions.json',
  'adversarial-07-script-name.json', 'adversarial-08c-malformed.json.txt', 'adversarial-08d-unknown-rule-version.json',
];

const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = String(text);
  if (cls) n.className = cls;
  return n;
};
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

const state = { ran: false, result: null, analysis: null, report: null, notes: [], lastButton: null };

$('synthetic-label').textContent = SYNTHETIC_LABEL;
for (const f of FIXTURES) { const o = el('option', f); o.value = f; $('fixture').appendChild(o); }

function showState(s) {
  for (const k of ['empty', 'error', 'zero', 'findings']) $(`state-${k}`).hidden = k !== s;
  $('results').hidden = s !== 'findings' && s !== 'zero';
  $('export-json').disabled = $('export-csv').disabled = !state.report;
}

async function run() {
  const name = $('fixture').value;
  $('run').disabled = true; $('run-status').textContent = 'Loading…';
  state.lastButton = null; state.report = null; state.analysis = null; state.notes = [];
  try {
    const res = await fetch(`../fixtures/originproof/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`fixture fetch failed: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const parsed = parseShipmentJson(bytes, { sourceName: name });
    state.result = parsed.ok ? analyze(parsed.value.input) : parsed;
    if (state.result.ok) {
      state.analysis = state.result.value;
      const fp = await computeSemanticFingerprint(state.analysis);
      const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const rep = buildReport({ analysis: state.analysis, reviewNotes: state.notes, generatedAt, semanticFingerprint: fp });
      if (rep.ok) state.report = rep.value; else state.result = rep;
    }
  } catch (err) {
    state.result = { ok: false, errors: [{ code: 'UI_RUNTIME', message: err.message, path: '' }] };
  }
  state.ran = true;
  $('run').disabled = false; $('run-status').textContent = `Ran ${name}`;
  render();
}

function render() {
  const s = uiState(state);
  showState(s);
  clear($('error-list')); clear($('cards')); clear($('findings')); clear($('lineage')); clear($('detail'));
  $('detail-panel').hidden = true;
  if (s === 'error') { for (const m of formatErrors(state.result.errors)) $('error-list').appendChild(el('li', m)); return; }
  const a = state.analysis;
  for (const c of summaryCards(a)) {
    const card = el('div', null, 'card'); card.appendChild(el('dt', c.label)); card.appendChild(el('dd', c.value)); $('cards').appendChild(card);
  }
  const rows = lineageRows(a);
  if (rows.length === 0) $('lineage').appendChild(el('li', 'Engine returned no edges.'));
  for (const r of rows) $('lineage').appendChild(el('li', r, 'mono'));
  $('findings-count').textContent = `${a.findings.length} finding(s)`;
  for (const f of a.findings) {
    const li = el('li');
    const b = el('button', findingLabel(f)); b.type = 'button'; b.dataset.id = f.findingId;
    b.setAttribute('aria-label', `Open finding ${f.findingId}`);
    b.addEventListener('click', () => openDetail(f, b));
    li.appendChild(b); $('findings').appendChild(li);
  }
  clear($('limitations')); for (const l of a.limitations || []) $('limitations').appendChild(el('li', l));
}

function openDetail(f, button) {
  state.lastButton = button;
  const d = $('detail'); clear(d);
  d.appendChild(el('h3', f.findingId));
  for (const [k, v] of Object.entries(f)) {
    if (k === 'findingId') continue;
    const row = el('div', null, 'kv'); row.appendChild(el('dt', k));
    row.appendChild(el('dd', typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v), 'mono')); d.appendChild(row);
  }
  const notes = state.notes.filter((n) => n.findingId === f.findingId);
  const nl = el('ul'); nl.setAttribute('aria-label', 'Reviewer notes'); for (const n of notes) nl.appendChild(el('li', n.text));
  d.appendChild(el('h4', `Reviewer notes (${notes.length}, inert: never alters findings)`)); d.appendChild(nl);
  $('note-finding').value = f.findingId;
  $('detail-panel').hidden = false; $('close-detail').focus();
}

function closeDetail() {
  $('detail-panel').hidden = true;
  if (state.lastButton) state.lastButton.focus();
}

function addNote(e) {
  e.preventDefault();
  if (!state.analysis) return;
  const text = $('note-text').value;
  const recordedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const res = appendReviewNote(state.notes, { sequence: state.notes.length + 1, recordedAt, findingId: $('note-finding').value, text }, state.analysis);
  if (!res.ok) { $('note-status').textContent = formatErrors(res.errors).join('; '); return; }
  state.notes = res.value; $('note-text').value = ''; $('note-status').textContent = 'Note recorded (inert layer).';
  const f = state.analysis.findings.find((x) => x.findingId === $('note-finding').value);
  if (f) openDetail(f, state.lastButton);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

$('run').addEventListener('click', run);
$('close-detail').addEventListener('click', closeDetail);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('detail-panel').hidden) closeDetail(); });
$('note-form').addEventListener('submit', addNote);
$('export-json').addEventListener('click', () => state.report && download('originproof-report.json', serializeReportJson(state.report), 'application/json'));
$('export-csv').addEventListener('click', () => state.report && download('originproof-report.csv', neutraliseCsv(serializeReportCsv(state.report)), 'text/csv'));
showState('empty');
