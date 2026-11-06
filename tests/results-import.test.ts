import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedStandingsInput, correctImport, createImport, decideImport, effectiveValues, importStandings, markReady, potentialPlayers, validateImport, validateRegistry } from '../src/results/index.ts';
import { demoContext, demoImport } from '../src/results/demo.ts';
import type { EventKind, ImportDraft, ImportValues } from '../src/results/index.ts';
import { calculateChampionshipPoints } from '../src/scoring/championship.ts';
import { calculateRegularEventPoints } from '../src/scoring/regular.ts';
const at = '2027-02-02T12:00:00Z';
function valid(kind: EventKind = 'regular') {
  const d = demoImport(kind); const v = effectiveValues(d);
  return correctImport(d, { ...v, results: v.results.map((r, i) => ({ ...r, playerId: `demo-00${i + 1}`, draws: 0 })) }, 'Verified fictional source');
}
function approve(d = valid()) { return decideImport(markReady(d, demoContext), 'approved', 'Demo reviewer', at, 'Reviewed', demoContext); }
function change(d: ImportDraft, fn: (v: ImportValues) => ImportValues) { return correctImport(d, fn(effectiveValues(d)), 'Test correction'); }
test('valid regular, seasonal and annual results use stable IDs and existing scoring', () => {
  for (const kind of ['regular', 'seasonal', 'annual'] as const) {
    const d = valid(kind); assert.deepEqual(validateImport(d, demoContext), []);
    const input = approvedStandingsInput([approve(d)], demoContext);
    const standings = importStandings([approve(d)], demoContext);
    const points = kind === 'regular' ? calculateRegularEventPoints(input.regularEvents[0].results[0]) : calculateChampionshipPoints(input.championships[0])[0].totalPoints;
    assert.equal(standings.annual.standings.find(p => p.playerId === 'demo-001')!.totalPoints, points);
    assert.equal(standings.annual.standings[0].eligibleForCumulativeTitle, false);
  }
});
test('incomplete imports block readiness and approval', () => {
  const d = demoImport(); assert.ok(validateImport(d, demoContext).some(i => i.path.endsWith('playerId')));
  assert.throws(() => markReady(d, demoContext));
  assert.throws(() => decideImport(d, 'approved', 'Reviewer', at, 'Approve', demoContext));
  for (const key of ['wins', 'losses', 'draws'] as const) for (const value of [null, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(validateImport(change(valid(), v => ({ ...v, results: v.results.map((r, i) => i ? r : { ...r, [key]: value }) })), demoContext).length);
  }
  for (const scheduledRounds of [null, 0, -1, 1.5]) assert.ok(validateImport(change(valid(), v => ({ ...v, tournament: { ...v.tournament, scheduledRounds } })), demoContext).length);
});
test('invalid metadata, unknown players and overlong records are blocked; drops remain allowed', () => {
  for (const patch of [{ eventId: '' }, { sourceKey: '' }, { name: '' }, { date: '2027-02-30' }, { year: 2028 }, { seasonId: 'unknown' }]) {
    assert.ok(validateImport(change(valid(), v => ({ ...v, tournament: { ...v.tournament, ...patch } })), demoContext).length);
  }
  assert.ok(validateImport(change(valid(), v => ({ ...v, results: v.results.map(r => ({ ...r, playerId: 'unknown' })) })), demoContext).length);
  assert.ok(validateImport(change(valid(), v => ({ ...v, results: v.results.map(r => ({ ...r, losses: 4 })) })), demoContext).length);
  assert.deepEqual(validateImport(change(valid(), v => ({ ...v, results: v.results.map(r => ({ ...r, wins: 0, losses: 0 })) })), demoContext), []);
});
test('duplicate registry IDs, result IDs and unresolved names are detected without merging names', () => {
  assert.equal(potentialPlayers('  SAMPLE   COPPER ', demoContext.players).length, 2);
  assert.equal(potentialPlayers('Copper Sample', demoContext.players).length, 1);
  assert.deepEqual(validateRegistry(demoContext.players), []);
  assert.ok(validateRegistry([...demoContext.players, demoContext.players[0]]).length);
  for (const patch of [{ playerId: 'demo-001' }, { rowId: 'row-1' }]) assert.ok(validateImport(change(valid(), v => ({ ...v, results: [v.results[0], { ...v.results[1], ...patch }] })), demoContext).length);
  const d = change(valid(), v => ({ ...v, results: v.results.map(r => ({ ...r, playerId: null, importedName: 'Sample Copper' })) }));
  assert.ok(validateImport(d, demoContext).some(i => i.message.includes('duplicate unresolved')));
});
test('duplicate source, event, heuristic and championship slot block approval and batch scoring', () => {
  const original = approve();
  for (const patch of [{ eventId: 'different' }, { sourceKey: 'different' }, { eventId: 'different', sourceKey: 'different' }]) {
    const d = createImport('another', { ...effectiveValues(valid()), tournament: { ...effectiveValues(valid()).tournament, ...patch } });
    assert.ok(validateImport(d, { ...demoContext, otherImports: [original] }).length);
  }
  assert.throws(() => approvedStandingsInput([original, structuredClone(original)], demoContext));
  assert.throws(() => approvedStandingsInput([original, original], demoContext));
  assert.throws(() => decideImport(markReady(valid(), demoContext), 'approved', 'Reviewer', at, 'Check', { ...demoContext, otherImports: [original] }));
  const rejected = decideImport(valid(), 'rejected', 'Reviewer', at, 'Duplicate', demoContext);
  assert.deepEqual(validateImport(valid(), { ...demoContext, otherImports: [rejected] }), []);
  const seasonal = approve(valid('seasonal'));
  const v = effectiveValues(valid('seasonal'));
  const duplicateSlot = createImport('other-seasonal', { ...v, tournament: { ...v.tournament, eventId: 'other', sourceKey: 'other', date: '2027-03-01', name: 'Other' } });
  assert.ok(validateImport(duplicateSlot, { ...demoContext, otherImports: [seasonal] }).length);
});
test('corrections preserve source and history, reset readiness, and cannot edit terminal states', () => {
  const source = structuredClone(effectiveValues(demoImport())); const d = createImport('snapshot', source);
  (source.results as unknown as { wins: number | null }[])[0].wins = 99;
  assert.equal(d.original.results[0].wins, 3);
  const ready = markReady(valid(), demoContext); const corrected = change(ready, v => ({ ...v, tournament: { ...v.tournament, name: 'Corrected sample' } }));
  assert.equal(corrected.state, 'draft'); assert.equal(corrected.original.tournament.name, 'Fictional regular event');
  assert.equal(corrected.corrections.length, 2);
  assert.throws(() => decideImport(corrected, 'approved', 'Reviewer', at, 'OK', demoContext));
  assert.throws(() => correctImport(ready, effectiveValues(ready), ''));
  for (const terminal of [approve(), decideImport(valid(), 'rejected', 'Reviewer', at, 'Reject', demoContext)]) {
    assert.throws(() => correctImport(terminal, effectiveValues(terminal), 'Edit'));
    assert.throws(() => markReady(terminal, demoContext));
    assert.throws(() => decideImport(terminal, 'approved', 'Reviewer', at, 'Again', demoContext));
    assert.ok(Object.isFrozen(terminal.original.results[0]));
  }
});
test('draft, ready and rejected results never affect standings or attendance', () => {
  for (const d of [valid(), markReady(valid(), demoContext), decideImport(valid(), 'rejected', 'Reviewer', at, 'Reject', demoContext)]) {
    assert.equal(approvedStandingsInput([d], demoContext).regularEvents.length, 0);
    for (const row of importStandings([d], demoContext).annual.standings) { assert.equal(row.totalPoints, 0); assert.equal(row.regularEventCount, 0); }
  }
  assert.equal(importStandings([approve()], demoContext).annual.standings[0].regularEventCount, 1);
});
test('championship complete ranks, supported years, and Swiss records validated by existing engine', () => {
  for (const positions of [[1, 1], [1, 2]]) {
    assert.deepEqual(validateImport(change(valid('seasonal'), v => ({ ...v, results: v.results.map((r, i) => ({ ...r, finalPosition: positions[i] })) })), demoContext), []);
  }
  for (const positions of [[1, null], [1, 3], [2, 2]]) assert.ok(validateImport(change(valid('seasonal'), v => ({ ...v, results: v.results.map((r, i) => ({ ...r, finalPosition: positions[i] })) })), demoContext).length);
  const d = change(valid('annual'), v => ({ ...v, tournament: { ...v.tournament, year: 2028 } }));
  assert.ok(validateImport(d, { ...demoContext, year: 2028 }).length);
});
test('corrected numeric totals, best eight and attendance remain compatible through the adapter', () => {
  const corrected = change(valid(), v => ({ ...v, results: v.results.map((r, i) => i ? r : { ...r, wins: 1, losses: 1, draws: 1 }) }));
  const approved = approve(corrected);
  assert.equal(effectiveValues(approved).results[0].wins, 1);
  assert.equal(approved.original.results[0].wins, 3);
  assert.equal(importStandings([approved], demoContext).annual.standings.find(r => r.playerId === 'demo-001')!.totalPoints, 40 / 9);
  const imports = Array.from({ length: 20 }, (_, i) => {
    const v = effectiveValues(valid());
    return approve(createImport(`import-${i}`, { ...v, tournament: { ...v.tournament, eventId: `event-${i}`, sourceKey: `source-${i}`, name: `Sample event ${i}` } }));
  });
  const standings = importStandings(imports, demoContext);
  const leader = standings.annual.standings[0];
  assert.equal(leader.regularEventCount, 20);
  assert.equal(leader.totalPoints, 80);
  assert.equal(leader.eligibleForCumulativeTitle, true);
  assert.equal(standings.seasons[0].beforeChampionship.standings[0].eligibleForCumulativeTitle, true);
});
test('invalid review configuration cannot produce approval-ready records', () => {
  for (const context of [{ ...demoContext, year: 2028 }, { ...demoContext, seasonIds: ['s1'] }, { ...demoContext, seasonIds: ['s1', 's1', 's3', 's4'] }]) assert.throws(() => markReady(valid(), context));
});
