// Shared helpers for the OriginProof engine. Pure: no I/O, no clock, no randomness.

export const MAX_STRING_LENGTH = 500;
export const MAX_ID_LENGTH = 200;
export const MAX_ERRORS_REPORTED = 100;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** True for objects whose prototype is Object.prototype or null (never arrays, class instances, Maps). */
export function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function makeError(code, message, path) {
  return Object.freeze({ code: String(code), message: String(message), path: String(path) });
}

export function fail(errors) {
  const bounded = errors.slice(0, MAX_ERRORS_REPORTED).map((e) => makeError(e.code, e.message, e.path));
  return Object.freeze({ ok: false, errors: Object.freeze(bounded) });
}

export function succeed(value) {
  return Object.freeze({ ok: true, value });
}

/** Recursively freezes plain data (objects/arrays). Returns the same reference. */
export function deepFreeze(value) {
  if (typeof value !== 'object' || value === null) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

export function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Builds a JSON pointer from path segments. pointer('documents', 1, 'country') => '/documents/1/country'. */
export function pointer(...segments) {
  return segments.map((s) => '/' + escapePointerSegment(s)).join('');
}

export function hasControlChars(text) {
  return CONTROL_CHARS.test(text);
}

/** Deterministic code-unit comparison (never localeCompare). */
export function compareCodeUnits(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isValidId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH && !hasControlChars(value);
}

export function isNonNegativeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Validates `YYYY-MM-DDThh:mm:ssZ`, calendar- and clock-valid, UTC only. */
export function isValidTimestamp(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > daysInMonth) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return true;
}

export const MAX_NESTING_DEPTH = 32;

/**
 * Iteratively (no recursion) checks whether plain data nests deeper than `limit`.
 * JSON.parse accepts arbitrarily deep input, so untrusted values must be depth-checked
 * before any recursive canonicalization or freezing.
 */
export function exceedsNestingDepth(value, limit = MAX_NESTING_DEPTH) {
  const stack = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const { value: current, depth } = stack.pop();
    if (typeof current !== 'object' || current === null) continue;
    if (depth >= limit) return true;
    const children = Array.isArray(current) ? current : Object.values(current);
    for (const child of children) {
      if (typeof child === 'object' && child !== null) stack.push({ value: child, depth: depth + 1 });
    }
  }
  return false;
}

/**
 * Iteratively checks that a value is bounded plain JSON data: plain objects / dense arrays /
 * strings / booleans / null / finite numbers, nested at most `limit` levels. Cycles fail via
 * the depth limit. Must be true before any recursive canonicalization or freezing.
 */
export function isPlainData(value, limit = MAX_NESTING_DEPTH) {
  const stack = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const { value: current, depth } = stack.pop();
    const type = typeof current;
    if (current === null || type === 'string' || type === 'boolean') continue;
    if (type === 'number') {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (type !== 'object') return false;
    if (depth >= limit) return false;
    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i += 1) {
        if (!(i in current)) return false;
        stack.push({ value: current[i], depth: depth + 1 });
      }
      continue;
    }
    if (!isPlainObject(current)) return false;
    for (const key of Object.keys(current)) stack.push({ value: current[key], depth: depth + 1 });
  }
  return true;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
