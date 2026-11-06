// Pure helpers for the OriginProof UI. No DOM, no I/O. Synthetic demo data only.

const CSV_DANGEROUS = new Set(['=', '+', '-', '@', '\t', '\r']);

// Neutralise a single CSV cell value so spreadsheets never treat it as a formula.
export function neutraliseCsvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return s.length > 0 && CSV_DANGEROUS.has(s[0]) ? `'${s}` : s;
}

// Apply neutraliseCsvCell to every quoted cell of an RFC-4180 CSV string produced by the engine.
export function neutraliseCsv(csv) {
  return String(csv).replace(/"((?:[^"]|"")*)"/g, (_, inner) => `"${neutraliseCsvCell(inner)}"`);
}

// Summary cards from the engine's counts object. Never invents numbers: only echoes keys present.
export function summaryCards(analysis) {
  if (!analysis || typeof analysis !== 'object') return [];
  const cards = [{ label: 'Status', value: String(analysis.status ?? '') }];
  const counts = analysis.counts && typeof analysis.counts === 'object' ? analysis.counts : {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof value === 'number') cards.push({ label: key, value: String(value) });
  }
  return cards;
}

// One-line label for a findings button.
export function findingLabel(f) {
  if (!f || typeof f !== 'object') return '';
  const parts = [f.findingId, f.severity, f.ruleId].filter((p) => typeof p === 'string' && p.length > 0);
  return parts.join(' | ');
}

// Lineage rows: ONLY the engine's actual edges. Each edge is echoed key=value, no adjacency invented.
export function lineageRows(analysis) {
  const edges = analysis && analysis.input && Array.isArray(analysis.input.edges) ? analysis.input.edges : [];
  return edges.map((e) =>
    e && typeof e === 'object'
      ? Object.entries(e).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('  ')
      : String(e),
  );
}

// Distinct UI states.
export function uiState({ ran, result }) {
  if (!ran) return 'empty';
  if (!result || result.ok === false) return 'error';
  const n = Array.isArray(result.value?.findings) ? result.value.findings.length : 0;
  return n === 0 ? 'zero' : 'findings';
}

export function formatErrors(errors) {
  if (!Array.isArray(errors)) return ['Unknown error'];
  return errors.map((e) => `${e?.code ?? 'ERROR'}${e?.path ? ' at ' + e.path : ''}: ${e?.message ?? ''}`);
}
