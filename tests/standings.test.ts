import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateStandings, compareStandings } from '../src/scoring/standings.ts';
import type { StandingsInput, RegularEvent, Championship, Standing } from '../src/scoring/standings.ts';

const players = ['a', 'b', 'c'].map(playerId => ({ playerId, name: playerId.toUpperCase() }));
const empty = (): StandingsInput => ({ year: 2027, seasonIds: ['s1', 's2', 's3', 's4'], players, regularEvents: [], championships: [] });
function events(count: number, seasonId = 's1', ids = ['a'], wins = 4, rounds = 4): RegularEvent[] {
  return Array.from({ length: count }, (_, index) => ({ eventId: `${seasonId}-${index}`, year: 2027, seasonId,
    results: ids.map(playerId => ({ playerId, wins, draws: 0, scheduledRounds: rounds })) }));
}
function championship(seasonId?: string): Championship {
  return { eventId: seasonId ? `champ-${seasonId}` : 'annual-champ', year: 2027,
    kind: seasonId ? 'seasonal' : 'annual', seasonId, scheduledSwissRounds: 4,
    participants: [{ playerId: 'a', swiss: { wins: 4, draws: 0, losses: 0 }, finalPosition: 1 },
      { playerId: 'b', swiss: { wins: 0, draws: 0, losses: 4 }, finalPosition: 2 }] };
}
const row = (input: StandingsInput, playerId = 'a') => calculateStandings(input).seasons[0].afterChampionship.standings.find(row => row.playerId === playerId)!;

test('best eight cap, every appearance and perfect finish count, seasonal threshold', () => {
  for (const count of [5, 6, 8, 9, 12]) {
    const result = row({ ...empty(), regularEvents: events(count) });
    assert.equal(result.regularPoints, Math.min(count, 8) * 10);
    assert.equal(result.perfectFinishes, count);
    assert.equal(result.regularEventCount, count);
    assert.equal(result.eligibleForCumulativeTitle, count >= 6);
  }
  const mixed = events(10).map((event, index) => ({ ...event, results: [{ ...event.results[0], wins: index % 5 }] }));
  assert.equal(row({ ...empty(), regularEvents: mixed }).regularPoints, 50);
});

test('ineligible first-place retains first in both seasonal snapshots; eligible second gets title', () => {
  const regularEvents = events(6, 's1', ['b', 'c'], 2).map((event, index) => ({ ...event,
    results: [...event.results, ...(index < 5 ? [{ playerId: 'a', wins: 4, draws: 0, scheduledRounds: 4 }] : [])] }));
  const result = calculateStandings({ ...empty(), regularEvents, championships: [championship('s1')] });
  for (const snapshot of [result.seasons[0].beforeChampionship, result.seasons[0].afterChampionship]) {
    assert.equal(snapshot.standings[0].playerId, 'a');
    assert.equal(snapshot.standings[0].rank, 1);
    assert.equal(snapshot.standings[0].eligibleForCumulativeTitle, false);
    assert.deepEqual(snapshot.cumulativeTitleRecipientIds, ['b', 'c']);
    assert.deepEqual(snapshot.standings.map(row => row.rank), [1, 2, 2]);
  }
  // Tournament honors follow official position, independent of attendance.
  assert.deepEqual(result.seasons[0].tournamentChampionIds, ['a']);
});

test('annual 19/20 threshold; ineligible annual first keeps rank while eligible second gets title', () => {
  const regularEvents = empty().seasonIds.flatMap((seasonId, index) => events(5, seasonId, ['b'], 2).map((event, i) => ({ ...event,
    results: [...event.results, ...(index === 3 && i === 4 ? [] : [{ playerId: 'a', wins: 4, draws: 0, scheduledRounds: 4 }])] })));
  const result = calculateStandings({ ...empty(), regularEvents, championships: [championship()] });
  assert.equal(result.annual.standings[0].playerId, 'a');
  assert.equal(result.annual.standings[0].rank, 1);
  assert.equal(result.annual.standings[0].regularEventCount, 19);
  assert.equal(result.annual.standings[0].eligibleForCumulativeTitle, false);
  assert.equal(result.annual.standings[1].regularEventCount, 20);
  assert.equal(result.annual.standings[1].eligibleForCumulativeTitle, true);
  assert.deepEqual(result.annual.cumulativeTitleRecipientIds, ['b']);
  assert.deepEqual(result.annualTournamentChampionIds, ['a']);
});

test('four-season aggregation, seasonal 120 and annual 600 maxima', () => {
  const input = { ...empty(), regularEvents: empty().seasonIds.flatMap(id => events(10, id)),
    championships: [...empty().seasonIds.map(id => championship(id)), championship()] };
  const result = calculateStandings(input);
  for (const season of result.seasons) {
    assert.equal(season.beforeChampionship.standings[0].totalPoints, 80);
    assert.equal(season.afterChampionship.standings[0].totalPoints, 120);
  }
  assert.equal(result.annual.standings[0].regularPoints, 320);
  assert.equal(result.annual.standings[0].championshipPoints, 280);
  assert.equal(result.annual.standings[0].totalPoints, 600);
});

test('weighted percentage and full precision use all attended events, excluding championship matches', () => {
  const regularEvents = [...events(8), { ...events(1, 's2')[0], results: [{ playerId: 'a', wins: 1, draws: 1, scheduledRounds: 7 }] }];
  const result = calculateStandings({ ...empty(), regularEvents, championships: [championship()] });
  assert.equal(result.annual.standings[0].regularMatchPointPercentage, 100 / 117);
  assert.equal(result.annual.standings[0].perfectFinishes, 8);
  assert.equal(result.annual.standings[0].regularPoints, 80 + 40 / 21);
  assert.notEqual(result.annual.standings[0].regularPoints, Number((80 + 40 / 21).toFixed(2)));
});

test('every comparison key takes precedence over later keys; final equality shares rank', () => {
  const base: Standing = { ...players[0], rank: 1, regularPoints: 0, totalPoints: 30, championshipPoints: 10,
    regularEventCount: 6, perfectFinishes: 1, regularMatchPointPercentage: 0.5, eligibleForCumulativeTitle: true };
  for (const opponent of [
    { ...base, totalPoints: 29, championshipPoints: 20, perfectFinishes: 10, regularMatchPointPercentage: 1 },
    { ...base, championshipPoints: 9, perfectFinishes: 10, regularMatchPointPercentage: 1 },
    { ...base, perfectFinishes: 0, regularMatchPointPercentage: 1 },
    { ...base, regularMatchPointPercentage: 0.4 },
  ]) assert.ok(compareStandings(base, opponent) < 0);
  assert.equal(compareStandings(base, { ...base, eligibleForCumulativeTitle: false, name: 'Z' }), 0);
  const result = calculateStandings({ ...empty(), regularEvents: events(6, 's1', ['a', 'b']) });
  assert.deepEqual(result.seasons[0].beforeChampionship.standings.map(row => row.rank), [1, 1, 3]);
  assert.deepEqual(result.seasons[0].beforeChampionship.cumulativeTitleRecipientIds, ['a', 'b']);
});

test('missing championships and no appearances are explicit, deterministic and finite', () => {
  const result = calculateStandings(empty());
  assert.equal(result.annualChampionshipRecorded, false);
  assert.deepEqual(result.annual.cumulativeTitleRecipientIds, []);
  for (const season of result.seasons) {
    assert.equal(season.championshipRecorded, false);
    assert.deepEqual(season.tournamentChampionIds, []);
    for (const row of season.afterChampionship.standings) {
      assert.equal(row.totalPoints, 0); assert.equal(row.rank, 1);
      assert.equal(row.regularMatchPointPercentage, null);
    }
  }
  const champOnly = row({ ...empty(), championships: [championship('s1')] });
  assert.equal(champOnly.totalPoints, 40);
  assert.equal(champOnly.eligibleForCumulativeTitle, false);
});

test('reject duplicate events and inconsistent player, season, year and championship identities', () => {
  const event = events(1)[0]; const champ = championship('s1');
  const invalid: StandingsInput[] = [
    { ...empty(), year: 2028 }, { ...empty(), seasonIds: ['s1', 's1', 's3', 's4'] },
    { ...empty(), seasonIds: ['s1'] }, { ...empty(), players: [...players, players[0]] },
    { ...empty(), regularEvents: [event, event] },
    { ...empty(), regularEvents: [{ ...event, year: 2026 }] },
    { ...empty(), regularEvents: [{ ...event, seasonId: 'unknown' }] },
    { ...empty(), regularEvents: [{ ...event, results: [...event.results, event.results[0]] }] },
    { ...empty(), regularEvents: [{ ...event, results: [{ ...event.results[0], playerId: 'unknown' }] }] },
    { ...empty(), regularEvents: [{ ...event, results: [{ ...event.results[0], wins: -1 }] }] },
    { ...empty(), championships: [champ, { ...champ, eventId: 'other' }] },
    { ...empty(), championships: [{ ...champ, seasonId: undefined }] },
    { ...empty(), championships: [{ ...championship(), seasonId: 's1' }] },
    { ...empty(), championships: [{ ...champ, year: 2026 }] },
    { ...empty(), championships: [{ ...champ, participants: champ.participants.map(p => ({ ...p, playerId: 'unknown' })) }] },
    { ...empty(), championships: [champ], regularEvents: [{ ...event, eventId: champ.eventId }] },
  ];
  for (const input of invalid) assert.throws(() => calculateStandings(input));
});

test('deeply frozen inputs are not mutated and output mutation cannot alter inputs', () => {
  const input = { ...empty(), regularEvents: events(9), championships: [championship('s1')] };
  const copy = structuredClone(input);
  function freeze(value: unknown) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(input);
  calculateStandings(input);
  assert.deepEqual(input, copy);
});
