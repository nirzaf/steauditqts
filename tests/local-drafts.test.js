// M7 STATE-03 - isolated, allow-listed drafts. Drafts are convenience state
// only: free-text fields, scoped per run/generation/actor/engagement/form,
// never decision values, tokens or gate state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftStore, getDraftStorageKey } from '../src/infrastructure/localDrafts.js';

function memoryStorage() {
  const map = new Map();
  return {
    _map: map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

const FIELDS = { 'review-note': ['rationale'] };
const SCOPE = { runId: 'm7-demo', generationId: 'gen-1', actorId: 'ACT-OMAR', engagementId: 'ENG-1', formId: 'review-note' };

test('saves only allow-listed text fields and reports SAVED_LOCAL_DRAFT', () => {
  const storage = memoryStorage();
  const drafts = createDraftStore(storage, FIELDS);
  const result = drafts.save(SCOPE, { rationale: 'Basis on file.', decision: 'RECOMMEND_COMPLETE' }, 3);
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'SAVED_LOCAL_DRAFT');
  const record = JSON.parse(storage._map.get(getDraftStorageKey(SCOPE)));
  assert.deepEqual(record.values, { rationale: 'Basis on file.' });
  assert.equal(record.baseRevision, 3);
  assert.equal(record.version, 3);
});

test('rejects non-text field values without writing storage', () => {
  const storage = memoryStorage();
  const drafts = createDraftStore(storage, FIELDS);
  const bad = drafts.save(SCOPE, { rationale: 42 }, 3);
  assert.equal(bad.ok, false);
  assert.equal(bad.outcome, 'UNAVAILABLE');
  assert.equal(storage._map.size, 0);
});

test('rejects unknown forms and invalid base revisions', () => {
  const storage = memoryStorage();
  const drafts = createDraftStore(storage, FIELDS);
  assert.equal(drafts.save({ ...SCOPE, formId: 'gate-state' }, { rationale: 'x' }, 3).ok, false);
  assert.equal(drafts.save(SCOPE, { rationale: 'x' }, 0).ok, false);
  assert.equal(drafts.save(SCOPE, { rationale: 'x' }, Number.NaN).ok, false);
  assert.equal(storage._map.size, 0);
});

test('scope key prevents cross-actor and cross-generation inheritance', () => {
  const storage = memoryStorage();
  const drafts = createDraftStore(storage, FIELDS);
  drafts.save(SCOPE, { rationale: 'Only for Omar.' }, 3);
  assert.equal(drafts.load({ ...SCOPE, actorId: 'ACT-PARTNER' }, 3).outcome, 'NO_DRAFT');
  assert.equal(drafts.load({ ...SCOPE, generationId: 'gen-2' }, 3).outcome, 'NO_DRAFT');
  const same = drafts.load(SCOPE, 3);
  assert.equal(same.outcome, 'DRAFT_LOADED');
  assert.equal(same.draft.values.rationale, 'Only for Omar.');
});

test('malformed stored drafts are rejected, not coerced', () => {
  const storage = memoryStorage();
  const drafts = createDraftStore(storage, FIELDS);
  const key = getDraftStorageKey(SCOPE);
  storage._map.set(key, JSON.stringify({ version: 2, scope: SCOPE, baseRevision: 3, values: { rationale: 'old' }, savedAt: 'x' }));
  const legacy = drafts.load(SCOPE, 3);
  assert.equal(legacy.ok, false);
  assert.equal(legacy.code, 'DRAFT_STORAGE_ERROR');
  storage._map.set(key, JSON.stringify({ version: 3, scope: SCOPE, baseRevision: 3, values: { decision: 'RECOMMEND_COMPLETE' }, savedAt: 'x' }));
  const foreign = drafts.load(SCOPE, 3);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, 'DRAFT_STORAGE_ERROR');
  storage._map.set(key, '{not json');
  const broken = drafts.load(SCOPE, 3);
  assert.equal(broken.ok, false);
  assert.equal(broken.outcome, 'UNAVAILABLE');
});

test('baseRevision staleness is flagged, never auto-applied', () => {
  const storage = memoryStorage();
  const drafts = createDraftStore(storage, FIELDS);
  drafts.save(SCOPE, { rationale: 'Saved against rev 4.' }, 4);
  assert.equal(drafts.load(SCOPE, 4).stale, false);
  const stale = drafts.load(SCOPE, 6);
  assert.equal(stale.outcome, 'DRAFT_LOADED');
  assert.equal(stale.stale, true);
  assert.equal(stale.draft.baseRevision, 4);
});

test('storage failures surface as UNAVAILABLE with the underlying reason', () => {
  const failing = {
    getItem: () => { throw new Error('quota exceeded'); },
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => {},
  };
  const drafts = createDraftStore(failing, FIELDS);
  const save = drafts.save(SCOPE, { rationale: 'x' }, 3);
  assert.equal(save.ok, false);
  assert.equal(save.outcome, 'UNAVAILABLE');
  assert.equal(save.code, 'DRAFT_STORAGE_ERROR');
  assert.match(save.message, /quota/i);
  const load = drafts.load(SCOPE, 3);
  assert.equal(load.ok, false);
  assert.equal(load.code, 'DRAFT_STORAGE_ERROR');
  assert.match(load.message, /quota/i);
});
