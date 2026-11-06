import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractImages, mockProvider } from '../src/extraction/index.ts';
import { correctExtraction, extractionDraft } from '../src/extraction/draft.ts';
import { extractionFieldRequired, hasCurrentConfirmation } from '../src/results/extractionEvidence.ts';
import { approvedStandingsInput, correctImport, decideImport, effectiveValues, markReady, validateImport } from '../src/results/index.ts';
import type { ImportDraft, ImportValues } from '../src/results/index.ts';
import { demoContext } from '../src/results/demo.ts';

const report = await extractImages(mockProvider(), [{ id: 'source', file: new File(['fictional'], 'source.png', { type: 'image/png' }) }]);
const fresh = () => extractionDraft('evidence-test', report);
function resolved() {
  let d = fresh(); const v = effectiveValues(d);
  d = correctImport(d, { ...v, results: v.results.map((r, i) => ({ ...r, draws: r.draws ?? 0, playerId: `demo-00${i + 1}` })) }, 'Explicit fictional registry matching and missing draw correction');
  for (const path of d.original.extraction!.required) if (extractionFieldRequired(effectiveValues(d), path)) d = correctExtraction(d, effectiveValues(d), 'Reviewed this value against the source', path);
  assert.deepEqual(validateImport(d, demoContext), []);
  return d;
}
const rename = (v: ImportValues, name: string): ImportValues => ({ ...v, tournament: { ...v.tournament, name } });
const evidenceIssues = (d: ImportDraft) => validateImport(d, demoContext).filter(i => i.path.startsWith('extraction'));
const decision = (d: ImportDraft) => decideImport(d, 'approved', 'Fictional reviewer', '2026-11-06T12:00:00Z', 'Verified values', demoContext);

test('changing a confirmed value invalidates its earlier confirmation and readiness; reverting does not resurrect it', () => {
  const d = resolved(); const ready = markReady(d, demoContext); const before = effectiveValues(ready);
  assert.ok(hasCurrentConfirmation(before, 'tournament.name'));
  const changed = correctImport(ready, rename(before, 'Corrected tournament'), 'Correct name, pending evidence review');
  assert.equal(changed.state, 'draft');
  assert.equal(hasCurrentConfirmation(effectiveValues(changed), 'tournament.name'), false);
  assert.ok(evidenceIssues(changed).some(i => i.path === 'extraction.tournament.name'));
  assert.throws(() => markReady(changed, demoContext));
  const reverted = correctImport(changed, rename(effectiveValues(changed), before.tournament.name), 'Revert name, still requires review');
  assert.equal(hasCurrentConfirmation(effectiveValues(reverted), 'tournament.name'), false);
  assert.equal(effectiveValues(ready).tournament.name, before.tournament.name);
  assert.ok(Object.isFrozen(changed.corrections.at(-1)!.values.extraction!.confirmed));
  const confirmed = correctExtraction(reverted, effectiveValues(reverted), 'Reconfirmed exact reverted name', 'tournament.name');
  assert.deepEqual(evidenceIssues(confirmed), []);
});

test('one documented action can correct and confirm the new exact value; originals and previous actions stay immutable', () => {
  const d = resolved(); const old = effectiveValues(d); const source = d.original.extraction!.sourceReport;
  const changed = correctExtraction(d, rename(old, 'Verified new name'), 'Organizer confirmed the corrected name', 'tournament.name');
  const action = changed.corrections.at(-1)!;
  assert.deepEqual(action.extractionConfirmations, [{ path: 'tournament.name', value: 'Verified new name' }]);
  assert.ok(effectiveValues(changed).extraction!.confirmed.some(c => c.path === 'tournament.name' && c.value === 'Verified new name'));
  assert.deepEqual(validateImport(changed, demoContext), []);
  assert.equal(changed.original.extraction!.sourceReport, source);
  assert.equal(effectiveValues(d).tournament.name, old.tournament.name);
  assert.ok(Object.isFrozen(action.extractionConfirmations![0]));
  assert.ok(Object.isFrozen(changed.original));
  assert.equal(markReady(changed, demoContext).state, 'ready for approval');
});

test('unknown, nonexistent, registry-identity and property-traversal confirmation paths are rejected', () => {
  const d = fresh(); const v = effectiveValues(d);
  for (const path of ['tournament.unknown', 'unknown.wins', 'row-1.playerId', 'tournament.start.time', '__proto__.wins', 'row-1.wins.extra', '']) {
    assert.throws(() => correctImport(d, v, 'Attempt invalid confirmation', { confirmExtraction: [path] }), /integrity/);
  }
  assert.throws(() => correctImport(d, v, 'Duplicate confirmations', { confirmExtraction: ['row-1.wins', 'row-1.wins'] }), /integrity/);
  const forged = { ...v, extraction: { ...v.extraction!, confirmed: [{ path: 'unknown.wins', value: 3 }] } };
  assert.throws(() => correctImport(d, forged, 'Attempt to inject unknown confirmation'), /integrity/);
});

test('missing/null/empty fields cannot be confirmed; zero is valid only as an explicit count correction', () => {
  const d = fresh(); const v = effectiveValues(d);
  assert.equal(v.results[1].draws, null);
  assert.throws(() => correctExtraction(d, v, 'Cannot review an unreadable count', 'row-2.draws'), /integrity/);
  assert.throws(() => correctExtraction(d, rename(v, ''), 'Cannot confirm empty name', 'tournament.name'), /integrity/);
  const next = { ...v, results: v.results.map((r, i) => i === 1 ? { ...r, draws: 0 } : r) };
  const fixed = correctExtraction(d, next, 'Organizer explicitly supplied zero draws', 'row-2.draws');
  assert.ok(hasCurrentConfirmation(effectiveValues(fixed), 'row-2.draws'));
  assert.equal(d.original.results[1].draws, null);
  assert.equal(hasCurrentConfirmation(v, 'row-2.draws'), false);
});

test('generic Phase 6 corrections cannot silently forge, remove, or rewrite audit confirmations', () => {
  const d = resolved(); const v = effectiveValues(d);
  for (const extraction of [undefined, { ...v.extraction!, confirmed: [] }, { ...v.extraction!, required: [] },
    { ...v.extraction!, sourceReport: '{}' },
    { ...v.extraction!, confirmed: v.extraction!.confirmed.map(c => c.path === 'row-1.wins' ? { ...c, value: 2 } : c) },
  ]) assert.throws(() => correctImport(d, { ...v, extraction }, 'Attempt to rewrite evidence'), /integrity/);
  const pending = fresh(); const p = effectiveValues(pending);
  assert.throws(() => correctImport(pending, { ...p, extraction: { ...p.extraction!, confirmed: [{ path: 'row-1.wins', value: 3 }] } }, 'Silent confirmation injection'), /integrity/);
  assert.throws(() => correctImport(d, { ...v, results: v.results.slice(1) }, 'Cannot erase unresolved source rows'), /integrity/);
});

test('registry selection stays mandatory and separate from evidence confirmation', () => {
  const d = resolved(); const v = effectiveValues(d);
  const unmatched = correctImport(d, { ...v, results: v.results.map(r => ({ ...r, playerId: null })) }, 'Clear identities to recheck against registry');
  assert.deepEqual(evidenceIssues(unmatched), []);
  assert.ok(validateImport(unmatched, demoContext).some(i => i.path === 'results.0.playerId'));
  assert.throws(() => markReady(unmatched, demoContext));
  const pending = fresh(); const p = effectiveValues(pending);
  const matched = correctImport(pending, { ...p, results: p.results.map((r, i) => ({ ...r, playerId: `demo-00${i + 1}` })) }, 'Explicit identity selections');
  assert.equal(effectiveValues(matched).extraction!.confirmed.length, 0);
});

test('approval and approved-only scoring reject stale values, forged confirmations and removed history', () => {
  const d = resolved(); const ready = markReady(d, demoContext); const approved = decision(ready);
  assert.equal(approvedStandingsInput([approved], demoContext).regularEvents.length, 1);
  const last = approved.corrections.at(-1)!;
  const stale = rename(last.values, 'Unreviewed change after approval');
  const rebound = { ...stale, extraction: { ...stale.extraction!, confirmed: stale.extraction!.confirmed.map(c => c.path === 'tournament.name' ? { ...c, value: stale.tournament.name } : c) } };
  const noAudit = { ...last.values, extraction: undefined };
  for (const values of [stale, rebound, noAudit]) {
    const tampered = { ...approved, corrections: [...approved.corrections.slice(0, -1), { ...last, values }] };
    assert.ok(evidenceIssues(tampered).length);
    assert.throws(() => approvedStandingsInput([tampered], demoContext), /Invalid or duplicate approved import/);
    assert.throws(() => decision({ ...tampered, state: 'ready for approval' }));
    assert.throws(() => markReady({ ...tampered, state: 'draft' }, demoContext));
  }
  const noActions = { ...approved, corrections: approved.corrections.map(c => ({ ...c, extractionConfirmations: [] })) };
  assert.throws(() => approvedStandingsInput([noActions], demoContext));
});

test('validation replays intermediate snapshots and action values even when final audit looks valid', () => {
  const d = resolved();
  const changedHistory = { ...d, corrections: d.corrections.map((c, i) => i === 1 ? { ...c, extractionConfirmations: [{ path: 'tournament.name', value: 'Never reviewed' }] } : c) };
  assert.ok(evidenceIssues(changedHistory).some(i => i.path === 'extraction'));
  assert.throws(() => markReady(changedHistory, demoContext));
  const unknown = { ...d, corrections: [...d.corrections, { reason: 'Bogus path', values: effectiveValues(d), extractionConfirmations: [{ path: 'unknown.wins', value: 0 }] }] };
  assert.ok(evidenceIssues(unknown).length);
  const noReason = { ...d, corrections: d.corrections.map((c, i) => i === 1 ? { ...c, reason: '' } : c) };
  assert.ok(evidenceIssues(noReason).length);
});

test('observed source evidence is value-bound and loses validity after a correction without explicit confirmation', () => {
  const observed = structuredClone(report); observed.tournament.name.status = 'observed';
  const d = extractionDraft('observed', observed); const v = effectiveValues(d);
  assert.ok(hasCurrentConfirmation(v, 'tournament.name'));
  const changed = correctImport(d, rename(v, 'Corrected observed name'), 'Observed text was wrong');
  assert.equal(hasCurrentConfirmation(effectiveValues(changed), 'tournament.name'), false);
  const reverted = correctImport(changed, rename(effectiveValues(changed), v.tournament.name), 'Reverted but not rechecked');
  assert.equal(hasCurrentConfirmation(effectiveValues(reverted), 'tournament.name'), false);
});

test('a correction invalidates every changed field, not just the field explicitly confirmed in that action', () => {
  const d = resolved(); const v = effectiveValues(d);
  const next = { ...rename(v, 'Confirmed new name'), results: v.results.map((r, i) => i === 0 ? { ...r, wins: null } : r) };
  const changed = correctExtraction(d, next, 'Confirmed name; wins now unreadable', 'tournament.name');
  assert.ok(hasCurrentConfirmation(effectiveValues(changed), 'tournament.name'));
  assert.equal(hasCurrentConfirmation(effectiveValues(changed), 'row-1.wins'), false);
  assert.ok(evidenceIssues(changed).some(i => i.path === 'extraction.row-1.wins'));
  assert.throws(() => markReady(changed, demoContext));
  const correctedValues = { ...effectiveValues(changed), results: next.results.map((r, i) => i === 0 ? { ...r, wins: 2 } : r) };
  const fixed = correctExtraction(changed, correctedValues, 'Verified two wins with organizer', 'row-1.wins');
  assert.deepEqual(validateImport(fixed, demoContext), []);
});

test('forged original attestations and nonexistent required fields cannot establish review evidence', () => {
  const d = fresh(); const v = d.original;
  for (const extraction of [
    { ...v.extraction!, confirmed: [{ path: 'row-1.wins', value: 3 }] },
    { ...v.extraction!, required: [...v.extraction!.required, 'ghost.wins'] },
  ]) {
    const forged = { ...d, original: { ...v, extraction } };
    assert.ok(evidenceIssues(forged).some(i => i.path === 'extraction'));
    assert.throws(() => markReady(forged, demoContext));
  }
  const changedSourceValues = { ...d, original: rename(v, 'Name absent from original report') };
  assert.ok(evidenceIssues(changedSourceValues).some(i => i.path === 'extraction'));
});
