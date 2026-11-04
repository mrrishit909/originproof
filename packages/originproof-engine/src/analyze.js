// Deterministic rule evaluation for fictional rule pack OP-DEMO-1.
// These comparisons implement this fictional evidence contract only. They are not customs law and
// carry no inference that suppliers must legally share a country or quantity.

import { compareCodeUnits, deepFreeze, fail, makeError, pointer, succeed } from './util.js';
import { RULE_VERSION, SCHEMA_VERSION, topologicalOrder, validateShipment } from './validate.js';

export const ENGINE_CONTRACT_VERSION = 'originproof.engine.v1';
export const RULE_IDS = Object.freeze(['OP01', 'OP02', 'OP03']);
export const DATA_CLASSIFICATION = 'SYNTHETIC';
export const SYNTHETIC_LABEL =
  'SYNTHETIC DEMO DATA: fictional evidence-contract rule pack OP-DEMO-1, not customs law; no certification or clearance decision';
export const SEVERITY_REVIEW_REQUIRED = 'REVIEW_REQUIRED';

export const LIMITATIONS = Object.freeze([
  'Rule pack OP-DEMO-1 is fictional evidence-contract configuration, not customs law.',
  'All records are synthetic. Country labels such as AA/BB are fictional field values, not country assessments.',
  'Scope is one shipment and declared supplier relationships: no sanctions screening, inferred geography or customs clearance decision.',
  'Findings are review prompts, never a certification, approval or compliance determination.',
  'The semantic fingerprint is an unkeyed SHA-256 hash, not a signature; a parsed report is an unverified import.',
  'A qualified domain expert must review evidence sufficiency before any legal-use rule pack.',
]);

function sortByFindingId(findings) {
  return findings.slice().sort((a, b) => compareCodeUnits(a.findingId, b.findingId));
}

function sortRefs(refs) {
  return refs.slice().sort((a, b) => compareCodeUnits(a.pointer, b.pointer));
}

function ref(ptr, recordType, recordId, value) {
  return { pointer: ptr, recordType, recordId, value };
}

/**
 * Builds topological order plus upstream/downstream lineage for every supplier and document.
 * `edges` holds only real input edges that lie on a route through the supplier (inside its ancestors
 * or inside its descendants), so no adjacency is ever invented between unconnected suppliers (OP-A02).
 */
export function buildLineage(input) {
  const ids = input.suppliers.map((s) => s.id);
  const { order } = topologicalOrder(ids, input.edges);
  const position = new Map();
  order.forEach((id, i) => position.set(id, i));
  const parents = new Map(ids.map((id) => [id, []]));
  const children = new Map(ids.map((id) => [id, []]));
  for (const edge of input.edges) {
    children.get(edge.fromSupplierId).push(edge.toSupplierId);
    parents.get(edge.toSupplierId).push(edge.fromSupplierId);
  }
  const closure = (start, next) => {
    const seen = new Set();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const n of next.get(current)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return Array.from(seen).sort((a, b) => position.get(a) - position.get(b));
  };
  const suppliers = ids.map((id) => {
    const upstream = closure(id, parents);
    const downstream = closure(id, children);
    const before = new Set([...upstream, id]);
    const after = new Set([id, ...downstream]);
    const within = (set, e) => set.has(e.fromSupplierId) && set.has(e.toSupplierId);
    const edges = input.edges
      .filter((e) => within(before, e) || within(after, e))
      .map((e) => ({ id: e.id, fromSupplierId: e.fromSupplierId, toSupplierId: e.toSupplierId }))
      .sort((a, b) => position.get(a.fromSupplierId) - position.get(b.fromSupplierId) || position.get(a.toSupplierId) - position.get(b.toSupplierId) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { supplierId: id, upstream, downstream, edges };
  });
  const bySupplier = new Map(suppliers.map((s) => [s.supplierId, s]));
  const documents = input.documents.map((d) => ({ documentId: d.id, supplierId: d.supplierId, edges: bySupplier.get(d.supplierId).edges }));
  return { order, suppliers, documents, bySupplier };
}

/** Validates then evaluates OP01..OP03. Invalid input returns the validation failure with no findings. */
export function analyze(value) {
  const validated = validateShipment(value);
  if (!validated.ok) return validated;
  const input = validated.value;
  const lineage = buildLineage(input);
  const shipment = input.shipment;
  const supplierIndex = new Map(input.suppliers.map((s, i) => [s.id, i]));
  const source = (clause) => ({ rulePack: RULE_VERSION, clause, illustrative: true });

  // OP01: required evidence pair absent → one finding per absent pair.
  const evidence = input.requiredEvidence.map((pair, i) => {
    const documentIds = input.documents.filter((d) => d.supplierId === pair.supplierId && d.kind === pair.kind).map((d) => d.id);
    return { supplierId: pair.supplierId, kind: pair.kind, fulfilled: documentIds.length > 0, documentIds, index: i };
  });
  const op01 = evidence
    .filter((e) => !e.fulfilled)
    .map((e) => ({
      findingId: `OP01:${e.supplierId}:${e.kind}`,
      ruleId: 'OP01',
      ruleVersion: RULE_VERSION,
      severity: SEVERITY_REVIEW_REQUIRED,
      subject: { type: 'requiredEvidence', supplierId: e.supplierId, kind: e.kind },
      field: 'kind',
      expected: e.kind,
      observed: null,
      deltaUnits: null,
      inputRefs: sortRefs([
        ref(pointer('requiredEvidence', e.index, 'supplierId'), 'requiredEvidence', null, e.supplierId),
        ref(pointer('requiredEvidence', e.index, 'kind'), 'requiredEvidence', null, e.kind),
        ref(pointer('suppliers', supplierIndex.get(e.supplierId), 'id'), 'supplier', e.supplierId, e.supplierId),
        ref(pointer('shipment', 'id'), 'shipment', shipment.id, shipment.id),
      ]),
      edges: lineage.bySupplier.get(e.supplierId).edges,
      rationale: `Required evidence pair ${e.supplierId}/${e.kind} has no matching document for shipment ${shipment.id} under fictional rule pack OP-DEMO-1 (OP01). Review only; not a legal determination.`,
      source: source('OP01'),
    }));

  // OP02: origin document country differs from shipment declaration → one per document.
  const op02 = [];
  // OP03: origin document quantity differs from shipment quantity → one per document.
  const op03 = [];
  // Each |delta| is a safe integer (both operands are non-negative safe integers), but their SUM can
  // exceed Number.MAX_SAFE_INTEGER. Check before every addition; never truncate, round or clamp.
  let quantityMismatchAbsoluteUnits = 0;
  let overflowPointer = null;
  input.documents.forEach((doc, i) => {
    if (doc.kind !== 'origin') return;
    const edges = lineage.bySupplier.get(doc.supplierId).edges;
    if (doc.country !== shipment.declaredCountry) {
      op02.push({
        findingId: `OP02:${doc.id}`,
        ruleId: 'OP02',
        ruleVersion: RULE_VERSION,
        severity: SEVERITY_REVIEW_REQUIRED,
        subject: { type: 'document', documentId: doc.id, supplierId: doc.supplierId, kind: doc.kind },
        field: 'country',
        expected: shipment.declaredCountry,
        observed: doc.country,
        deltaUnits: null,
        inputRefs: sortRefs([
          ref(pointer('documents', i, 'country'), 'document', doc.id, doc.country),
          ref(pointer('shipment', 'declaredCountry'), 'shipment', shipment.id, shipment.declaredCountry),
        ]),
        edges,
        rationale: `Origin document ${doc.id} records country ${doc.country}; shipment ${shipment.id} declares ${shipment.declaredCountry} (OP02, fictional rule pack OP-DEMO-1). Labels are fictional; review only.`,
        source: source('OP02'),
      });
    }
    if (doc.quantityUnits !== shipment.quantityUnits) {
      const delta = doc.quantityUnits - shipment.quantityUnits;
      const absDelta = Math.abs(delta);
      if (overflowPointer === null) {
        if (absDelta > Number.MAX_SAFE_INTEGER - quantityMismatchAbsoluteUnits) overflowPointer = pointer('documents', i, 'quantityUnits');
        else quantityMismatchAbsoluteUnits += absDelta;
      }
      op03.push({
        findingId: `OP03:${doc.id}`,
        ruleId: 'OP03',
        ruleVersion: RULE_VERSION,
        severity: SEVERITY_REVIEW_REQUIRED,
        subject: { type: 'document', documentId: doc.id, supplierId: doc.supplierId, kind: doc.kind },
        field: 'quantityUnits',
        expected: shipment.quantityUnits,
        observed: doc.quantityUnits,
        deltaUnits: delta,
        inputRefs: sortRefs([
          ref(pointer('documents', i, 'quantityUnits'), 'document', doc.id, doc.quantityUnits),
          ref(pointer('shipment', 'quantityUnits'), 'shipment', shipment.id, shipment.quantityUnits),
        ]),
        edges,
        rationale: `Origin document ${doc.id} records ${doc.quantityUnits} units; shipment ${shipment.id} declares ${shipment.quantityUnits} units (delta ${delta}) (OP03, fictional rule pack OP-DEMO-1). Review only.`,
        source: source('OP03'),
      });
    }
  });

  if (overflowPointer !== null) {
    // Atomic rejection: no findings, counts, report or export are produced for this candidate.
    return fail([
      makeError(
        'AGGREGATE_OVERFLOW',
        `Sum of absolute OP03 quantity discrepancies exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}); the candidate is rejected rather than truncated, rounded or clamped`,
        overflowPointer,
      ),
    ]);
  }

  const findings = [...sortByFindingId(op01), ...sortByFindingId(op02), ...sortByFindingId(op03)];
  const counts = {
    findings: findings.length,
    byRule: { OP01: op01.length, OP02: op02.length, OP03: op03.length },
    suppliers: input.suppliers.length,
    edges: input.edges.length,
    documents: input.documents.length,
    originDocuments: input.documents.filter((d) => d.kind === 'origin').length,
    productionDocuments: input.documents.filter((d) => d.kind === 'production').length,
    requiredPairs: evidence.length,
    fulfilledPairs: evidence.filter((e) => e.fulfilled).length,
    quantityMismatchAbsoluteUnits,
  };

  const analysis = {
    engineContractVersion: ENGINE_CONTRACT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    ruleVersion: RULE_VERSION,
    dataClassification: DATA_CLASSIFICATION,
    syntheticLabel: SYNTHETIC_LABEL,
    input,
    status: findings.length > 0 ? 'FINDINGS_PRESENT' : 'NO_FINDINGS',
    findings,
    counts,
    evidence: evidence.map((e) => ({ supplierId: e.supplierId, kind: e.kind, fulfilled: e.fulfilled, documentIds: e.documentIds })),
    lineage: { order: lineage.order, suppliers: lineage.suppliers, documents: lineage.documents },
    limitations: LIMITATIONS.slice(),
  };
  return succeed(deepFreeze(analysis));
}
