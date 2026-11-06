// Append-only human review notes. Notes are inert text, kept separate from findings and input records.

import { deepFreeze, fail, hasOwn, isPlainObject, isValidTimestamp, makeError, succeed } from './util.js';

export const MAX_NOTE_LENGTH = 2000;
const NOTE_KEYS = Object.freeze(['sequence', 'findingId', 'text', 'recordedAt']);

function validateNote(note, path, lastSequence, findingIds, errors) {
  if (!isPlainObject(note)) {
    errors.push(makeError('INVALID_TYPE', 'Review note must be a plain object', path));
    return null;
  }
  for (const key of NOTE_KEYS) if (!hasOwn(note, key)) errors.push(makeError('MISSING_FIELD', `Review note is missing "${key}"`, `${path}/${key}`));
  for (const key of Object.keys(note)) if (!NOTE_KEYS.includes(key)) errors.push(makeError('UNKNOWN_FIELD', `Review note has unknown field "${key}"`, `${path}/${key}`));
  if (errors.length > 0) return null;
  if (!Number.isSafeInteger(note.sequence) || note.sequence < 1 || note.sequence <= lastSequence) {
    errors.push(makeError('INVALID_SEQUENCE', `sequence must be a safe integer greater than ${lastSequence}`, `${path}/sequence`));
  }
  if (typeof note.findingId !== 'string' || !findingIds.has(note.findingId)) {
    errors.push(makeError('UNKNOWN_FINDING', 'findingId does not exist in the referenced analysis', `${path}/findingId`));
  }
  if (typeof note.text !== 'string' || note.text.length < 1 || note.text.length > MAX_NOTE_LENGTH) {
    errors.push(makeError('INVALID_NOTE', `text must be 1..${MAX_NOTE_LENGTH} characters`, `${path}/text`));
  }
  if (!isValidTimestamp(note.recordedAt)) {
    errors.push(makeError('INVALID_TIMESTAMP', 'recordedAt must match YYYY-MM-DDThh:mm:ssZ and be calendar-valid', `${path}/recordedAt`));
  }
  if (errors.length > 0) return null;
  return { sequence: note.sequence, findingId: note.findingId, text: note.text, recordedAt: note.recordedAt };
}

/** Returns a new deep-frozen history with `note` appended. Never mutates `history`. */
export function appendReviewNote(history, note, analysis) {
  const errors = [];
  if (!Array.isArray(history)) return fail([makeError('INVALID_TYPE', 'history must be an array of review notes', '/history')]);
  if (!isPlainObject(analysis) || !Array.isArray(analysis.findings)) {
    return fail([makeError('INVALID_TYPE', 'analysis must be an analysis object with findings', '/analysis')]);
  }
  const findingIds = new Set(analysis.findings.map((f) => (isPlainObject(f) ? f.findingId : undefined)).filter((id) => typeof id === 'string'));
  const replayed = [];
  let last = 0;
  for (let i = 0; i < history.length; i += 1) {
    const clean = validateNote(history[i], `/history/${i}`, last, findingIds, errors);
    if (clean === null) return fail(errors);
    replayed.push(clean);
    last = clean.sequence;
  }
  const appended = validateNote(note, '/note', last, findingIds, errors);
  if (appended === null) return fail(errors);
  replayed.push(appended);
  return succeed(deepFreeze(replayed));
}
