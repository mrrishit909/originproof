// Bounded, atomic decoding of untrusted bytes. Size is checked before decoding or parsing.

import { MAX_STRING_LENGTH, deepFreeze, fail, isPlainObject, makeError, succeed } from './util.js';
import { validateShipment } from './validate.js';

export const MAX_UPLOAD_BYTES = 1048576; // 1 MiB

function toBytes(input) {
  // A UTF-8 encoding is never shorter than the UTF-16 code-unit count, so an oversized
  // string can be rejected before allocating its encoding.
  if (typeof input === 'string') return input.length > MAX_UPLOAD_BYTES ? { byteLength: input.length, oversized: true } : new TextEncoder().encode(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input instanceof Uint8Array) return input;
  return null;
}

/** Decodes bytes/string to a parsed JSON value with bounded, non-leaking errors. */
export function decodeJson(input) {
  const bytes = toBytes(input);
  if (bytes === null) return fail([makeError('INVALID_TYPE', 'Input must be a string, Uint8Array or ArrayBuffer', '')]);
  if (bytes.oversized === true || bytes.byteLength > MAX_UPLOAD_BYTES) {
    return fail([makeError('INPUT_TOO_LARGE', `Input exceeds the ${MAX_UPLOAD_BYTES}-byte (1 MiB) limit for this slice`, '')]);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail([makeError('INVALID_UTF8', 'Input is not valid UTF-8', '')]);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const match = /position (\d+)/.exec(error && typeof error.message === 'string' ? error.message : '');
    const where = match ? ` near position ${match[1]}` : '';
    return fail([makeError('MALFORMED_JSON', `Input is not well-formed JSON${where}`, '')]);
  }
  return succeed({ parsed, byteLength: bytes.byteLength });
}

/**
 * Parses an untrusted shipment JSON payload.
 * Returns { input: Shipment, source: { sourceName, format: 'json', byteLength } } on success.
 */
export function parseShipmentJson(input, options = {}) {
  if (!isPlainObject(options)) return fail([makeError('INVALID_TYPE', 'options must be a plain object', '/options')]);
  const sourceName = Object.prototype.hasOwnProperty.call(options, 'sourceName') ? options.sourceName : 'untitled.json';
  if (typeof sourceName !== 'string' || sourceName.length === 0 || sourceName.length > MAX_STRING_LENGTH) {
    return fail([makeError('INVALID_TYPE', `sourceName must be a string of 1..${MAX_STRING_LENGTH} characters`, '/options/sourceName')]);
  }
  const decoded = decodeJson(input);
  if (!decoded.ok) return decoded;
  const validated = validateShipment(decoded.value.parsed);
  if (!validated.ok) return validated;
  return succeed(
    deepFreeze({
      input: validated.value,
      source: { sourceName, format: 'json', byteLength: decoded.value.byteLength },
    }),
  );
}
