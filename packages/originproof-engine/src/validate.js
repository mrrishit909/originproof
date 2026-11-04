// Strict, atomic schema validation for the OriginProof input shipment.
// Invalid schema, unresolved references or a cycle prevent any domain evaluation.
// Rule pack OP-DEMO-1 is fictional evidence-contract configuration, not customs law.

import {
  MAX_STRING_LENGTH,
  deepFreeze,
  fail,
  hasOwn,
  isNonNegativeSafeInteger,
  isPlainObject,
  isValidId,
  makeError,
  pointer,
  succeed,
} from './util.js';

export const SCHEMA_VERSION = 1;
export const RULE_VERSION = 'OP-DEMO-1';
export const EVIDENCE_KINDS = Object.freeze(['origin', 'production']);
export const MAX_RECORDS = 1000;

const COUNTRY_FORMAT = /^[A-Z]{2}$/;

const TOP_KEYS = Object.freeze(['schemaVersion', 'ruleVersion', 'shipment', 'suppliers', 'edges', 'documents', 'requiredEvidence']);
const SHIPMENT_KEYS = Object.freeze(['id', 'declaredCountry', 'quantityUnits']);
const SUPPLIER_KEYS = Object.freeze(['id', 'name']);
const EDGE_KEYS = Object.freeze(['id', 'fromSupplierId', 'toSupplierId']);
const DOCUMENT_KEYS = Object.freeze(['id', 'shipmentId', 'supplierId', 'kind', 'country', 'quantityUnits']);
const REQUIRED_KEYS = Object.freeze(['supplierId', 'kind']);
const COLLECTIONS = Object.freeze(['suppliers', 'edges', 'documents', 'requiredEvidence']);

/** Checks a plain object has exactly `allowed` own keys. Returns false when not a plain object. */
function checkShape(value, allowed, path, errors, label) {
  if (!isPlainObject(value)) {
    errors.push(makeError('INVALID_TYPE', `${label} must be a JSON object`, path));
    return false;
  }
  for (const key of allowed) {
    if (!hasOwn(value, key)) errors.push(makeError('MISSING_FIELD', `${label} is missing required field "${key}"`, path + pointer(key)));
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(makeError('UNKNOWN_FIELD', `${label} has unknown field "${key}"`, path + pointer(key)));
  }
  return true;
}

function checkId(value, path, errors, label) {
  if (!isValidId(value)) {
    errors.push(makeError('INVALID_ID', `${label} must be a non-empty string without control characters (max 200 chars)`, path));
    return false;
  }
  return true;
}

function checkCountry(value, path, errors, label) {
  if (typeof value !== 'string' || !COUNTRY_FORMAT.test(value)) {
    errors.push(makeError('INVALID_COUNTRY', `${label} must be exactly two uppercase letters (demo field format)`, path));
    return false;
  }
  return true;
}

function checkQuantity(value, path, errors, label) {
  if (!isNonNegativeSafeInteger(value)) {
    errors.push(makeError('INVALID_QUANTITY', `${label} must be a non-negative safe integer number of units`, path));
    return false;
  }
  return true;
}

function checkKind(value, path, errors, label) {
  if (typeof value !== 'string' || !EVIDENCE_KINDS.includes(value)) {
    errors.push(makeError('INVALID_KIND', `${label} must be one of ${EVIDENCE_KINDS.join('|')}`, path));
    return false;
  }
  return true;
}

function checkText(value, path, errors, label) {
  if (typeof value !== 'string') {
    errors.push(makeError('INVALID_TYPE', `${label} must be a string`, path));
    return false;
  }
  if (value.length > MAX_STRING_LENGTH) {
    errors.push(makeError('STRING_TOO_LONG', `${label} exceeds ${MAX_STRING_LENGTH} characters`, path));
    return false;
  }
  return true;
}

/**
 * Kahn topological sort with ties broken by input order. Returns {order, cycle}.
 * `cycle` lists supplier ids that could not be ordered (members of, or downstream of, a cycle).
 */
export function topologicalOrder(supplierIds, edges) {
  const index = new Map();
  supplierIds.forEach((id, i) => index.set(id, i));
  const n = supplierIds.length;
  const indegree = new Array(n).fill(0);
  const outgoing = Array.from({ length: n }, () => []);
  for (const edge of edges) {
    const from = index.get(edge.fromSupplierId);
    const to = index.get(edge.toSupplierId);
    outgoing[from].push(to);
    indegree[to] += 1;
  }
  const taken = new Array(n).fill(false);
  const order = [];
  for (let step = 0; step < n; step += 1) {
    let pick = -1;
    for (let i = 0; i < n; i += 1) {
      if (!taken[i] && indegree[i] === 0) {
        pick = i;
        break;
      }
    }
    if (pick === -1) break;
    taken[pick] = true;
    order.push(supplierIds[pick]);
    for (const to of outgoing[pick]) indegree[to] -= 1;
  }
  const cycle = supplierIds.filter((_, i) => !taken[i]);
  return { order, cycle };
}

/** Validates an untrusted shipment value. Returns a Result with a deep-frozen canonical clone on success. */
export function validateShipment(value) {
  const errors = [];
  if (!checkShape(value, TOP_KEYS, '', errors, 'Input')) return fail(errors);

  if (hasOwn(value, 'schemaVersion') && value.schemaVersion !== SCHEMA_VERSION) {
    errors.push(makeError('UNSUPPORTED_SCHEMA_VERSION', `schemaVersion must be ${SCHEMA_VERSION}`, '/schemaVersion'));
  }
  if (hasOwn(value, 'ruleVersion') && value.ruleVersion !== RULE_VERSION) {
    errors.push(makeError('UNSUPPORTED_RULE_VERSION', `ruleVersion must be ${RULE_VERSION}`, '/ruleVersion'));
  }
  for (const key of COLLECTIONS) {
    if (!hasOwn(value, key)) continue;
    if (!Array.isArray(value[key])) {
      errors.push(makeError('INVALID_TYPE', `${key} must be an array`, pointer(key)));
      continue;
    }
    for (let i = 0; i < value[key].length; i += 1) {
      if (!(i in value[key])) {
        errors.push(makeError('INVALID_TYPE', `${key} must be a dense array (hole at index ${i})`, pointer(key, i)));
        break;
      }
    }
  }
  if (errors.length > 0) return fail(errors);

  const totalRecords = COLLECTIONS.reduce((sum, key) => sum + value[key].length, 0);
  if (totalRecords > MAX_RECORDS) {
    return fail([makeError('TOO_MANY_RECORDS', `Input has ${totalRecords} records; the limit for this slice is ${MAX_RECORDS}`, '')]);
  }

  // Shipment
  const ship = value.shipment;
  let shipmentId = null;
  if (checkShape(ship, SHIPMENT_KEYS, '/shipment', errors, 'shipment')) {
    if (hasOwn(ship, 'id') && checkId(ship.id, '/shipment/id', errors, 'shipment.id')) shipmentId = ship.id;
    if (hasOwn(ship, 'declaredCountry')) checkCountry(ship.declaredCountry, '/shipment/declaredCountry', errors, 'shipment.declaredCountry');
    if (hasOwn(ship, 'quantityUnits')) checkQuantity(ship.quantityUnits, '/shipment/quantityUnits', errors, 'shipment.quantityUnits');
  }

  // Suppliers
  const supplierIds = new Set();
  value.suppliers.forEach((supplier, i) => {
    const path = pointer('suppliers', i);
    if (!checkShape(supplier, SUPPLIER_KEYS, path, errors, `suppliers[${i}]`)) return;
    if (hasOwn(supplier, 'id') && checkId(supplier.id, path + '/id', errors, `suppliers[${i}].id`)) {
      if (supplierIds.has(supplier.id)) errors.push(makeError('DUPLICATE_ID', `Duplicate supplier id "${supplier.id}"`, path + '/id'));
      else supplierIds.add(supplier.id);
    }
    if (hasOwn(supplier, 'name')) checkText(supplier.name, path + '/name', errors, `suppliers[${i}].name`);
  });

  // Edges
  const edgeIds = new Set();
  value.edges.forEach((edge, i) => {
    const path = pointer('edges', i);
    if (!checkShape(edge, EDGE_KEYS, path, errors, `edges[${i}]`)) return;
    if (hasOwn(edge, 'id') && checkId(edge.id, path + '/id', errors, `edges[${i}].id`)) {
      if (edgeIds.has(edge.id)) errors.push(makeError('DUPLICATE_ID', `Duplicate edge id "${edge.id}"`, path + '/id'));
      else edgeIds.add(edge.id);
    }
    for (const key of ['fromSupplierId', 'toSupplierId']) {
      if (!hasOwn(edge, key)) continue;
      if (checkId(edge[key], path + pointer(key), errors, `edges[${i}].${key}`) && !supplierIds.has(edge[key])) {
        errors.push(makeError('UNKNOWN_REFERENCE', `edges[${i}].${key} references unknown supplier "${edge[key]}"`, path + pointer(key)));
      }
    }
  });

  // Documents
  const documentIds = new Set();
  value.documents.forEach((doc, i) => {
    const path = pointer('documents', i);
    if (!checkShape(doc, DOCUMENT_KEYS, path, errors, `documents[${i}]`)) return;
    if (hasOwn(doc, 'id') && checkId(doc.id, path + '/id', errors, `documents[${i}].id`)) {
      if (documentIds.has(doc.id)) errors.push(makeError('DUPLICATE_ID', `Duplicate document id "${doc.id}"`, path + '/id'));
      else documentIds.add(doc.id);
    }
    if (hasOwn(doc, 'shipmentId') && checkId(doc.shipmentId, path + '/shipmentId', errors, `documents[${i}].shipmentId`)) {
      if (shipmentId !== null && doc.shipmentId !== shipmentId) {
        errors.push(makeError('UNKNOWN_REFERENCE', `documents[${i}].shipmentId references unknown shipment "${doc.shipmentId}"`, path + '/shipmentId'));
      }
    }
    if (hasOwn(doc, 'supplierId') && checkId(doc.supplierId, path + '/supplierId', errors, `documents[${i}].supplierId`)) {
      if (!supplierIds.has(doc.supplierId)) {
        errors.push(makeError('UNKNOWN_REFERENCE', `documents[${i}].supplierId references unknown supplier "${doc.supplierId}"`, path + '/supplierId'));
      }
    }
    if (hasOwn(doc, 'kind')) checkKind(doc.kind, path + '/kind', errors, `documents[${i}].kind`);
    if (hasOwn(doc, 'country')) checkCountry(doc.country, path + '/country', errors, `documents[${i}].country`);
    if (hasOwn(doc, 'quantityUnits')) checkQuantity(doc.quantityUnits, path + '/quantityUnits', errors, `documents[${i}].quantityUnits`);
  });

  // Required evidence pairs
  const pairs = new Set();
  value.requiredEvidence.forEach((pair, i) => {
    const path = pointer('requiredEvidence', i);
    if (!checkShape(pair, REQUIRED_KEYS, path, errors, `requiredEvidence[${i}]`)) return;
    let supplierOk = false;
    let kindOk = false;
    if (hasOwn(pair, 'supplierId') && checkId(pair.supplierId, path + '/supplierId', errors, `requiredEvidence[${i}].supplierId`)) {
      if (!supplierIds.has(pair.supplierId)) {
        errors.push(makeError('UNKNOWN_REFERENCE', `requiredEvidence[${i}].supplierId references unknown supplier "${pair.supplierId}"`, path + '/supplierId'));
      } else supplierOk = true;
    }
    if (hasOwn(pair, 'kind')) kindOk = checkKind(pair.kind, path + '/kind', errors, `requiredEvidence[${i}].kind`);
    if (supplierOk && kindOk) {
      const key = pair.supplierId + '\u0000' + pair.kind;
      if (pairs.has(key)) errors.push(makeError('DUPLICATE_REQUIRED_PAIR', `Duplicate required evidence pair ${pair.supplierId}/${pair.kind}`, path));
      else pairs.add(key);
    }
  });

  if (errors.length > 0) return fail(errors);

  // DAG check (bounded Kahn sort; never recurses, never hangs)
  const { cycle } = topologicalOrder(value.suppliers.map((s) => s.id), value.edges);
  if (cycle.length > 0) {
    return fail([
      makeError('CYCLE_DETECTED', `Supplier edges must form a DAG; suppliers involved in a cycle: ${cycle.join(', ')}`, '/edges'),
    ]);
  }

  const canonical = {
    schemaVersion: SCHEMA_VERSION,
    ruleVersion: RULE_VERSION,
    // `+ 0` normalizes a JSON `-0` to `0` so canonical JSON and strict equality agree.
    shipment: { id: ship.id, declaredCountry: ship.declaredCountry, quantityUnits: ship.quantityUnits + 0 },
    suppliers: value.suppliers.map((s) => ({ id: s.id, name: s.name })),
    edges: value.edges.map((e) => ({ id: e.id, fromSupplierId: e.fromSupplierId, toSupplierId: e.toSupplierId })),
    documents: value.documents.map((d) => ({
      id: d.id,
      shipmentId: d.shipmentId,
      supplierId: d.supplierId,
      kind: d.kind,
      country: d.country,
      quantityUnits: d.quantityUnits + 0,
    })),
    requiredEvidence: value.requiredEvidence.map((p) => ({ supplierId: p.supplierId, kind: p.kind })),
  };
  return succeed(deepFreeze(canonical));
}
