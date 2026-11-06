import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateChampionshipPoints as score, CHAMPIONSHIP_RULES, formatChampionshipPoints } from '../src/scoring/championship.ts';
import type { ChampionshipInput, ChampionshipParticipant } from '../src/scoring/championship.ts';

const field = (n = 8): ChampionshipParticipant[] => Array.from({ length: n }, (_, i) => ({
  playerId: `player-${i}`, finalPosition: i + 1, swiss: { wins: 3, draws: 1, losses: 1 },
}));
const event = (participants = field()): ChampionshipInput => ({
  year: 2027, kind: 'seasonal', scheduledSwissRounds: 5, participants,
});
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('approved seasonal and annual maxima and 75/25 components', () => {
  for (const kind of ['seasonal', 'annual'] as const) {
    const participants = field(2).map(p => ({ ...p, swiss: { wins: 5, draws: 0, losses: 0 } }));
    const result = score({ ...event(participants), kind });
    const maximum = kind === 'seasonal' ? 40 : 120;
    assert.equal(result[0].matchPoints, maximum * 0.75);
    assert.equal(result[0].placementPoints, maximum * 0.25);
    assert.equal(result[0].totalPoints, maximum);
    assert.equal(result[1].placementPoints, 0);
  }
  assert.ok(Object.isFrozen(CHAMPIONSHIP_RULES[2027].maximumPoints));
});

test('tournament size changes placement, never Swiss performance', () => {
  for (const n of [2, 8, 16, 37, 128]) {
    const results = score(event(field(n)));
    results.forEach((result, i) => {
      near(result.matchPoints, 20);
      near(result.placementPoints, 10 * (n - i - 1) / (n - 1));
    });
  }
});

test('all small valid Swiss records match the formula for both championships', () => {
  for (const kind of ['seasonal', 'annual'] as const) {
    for (let rounds = 1; rounds <= 8; rounds++) {
      for (let wins = 0; wins <= rounds; wins++) {
        for (let draws = 0; draws <= rounds - wins; draws++) {
          const participants = field(2);
          participants[0] = { ...participants[0], swiss: { wins, draws, losses: rounds - wins - draws } };
          participants[1] = { ...participants[1], swiss: { wins: 0, draws: 0, losses: 0 } };
          const result = score({ ...event(participants), kind, scheduledSwissRounds: rounds })[0];
          const maximum = kind === 'seasonal' ? 40 : 120;
          near(result.matchPoints, maximum * 0.75 * (3 * wins + draws) / (3 * rounds));
          assert.ok(result.totalPoints >= 0 && result.totalPoints <= maximum);
        }
      }
    }
  }
});

test('official bye wins and intentional draws require no adjustment; drops keep scheduled denominator', () => {
  const participants = field(3);
  // Two played wins plus one official bye, one intentional draw.
  participants[0] = { ...participants[0], swiss: { wins: 3, draws: 1, losses: 1 } };
  participants[1] = { ...participants[1], swiss: { wins: 1, draws: 0, losses: 1 } };
  participants[2] = { ...participants[2], swiss: { wins: 0, draws: 0, losses: 0 } };
  const result = score(event(participants));
  near(result[0].matchPoints, 20);
  near(result[1].matchPoints, 6);
  assert.equal(result[2].totalPoints, 0);
});

test('official ties average all occupied positions, including first, last, and entire field', () => {
  for (const [ranks, expected] of [
    [[1, 2, 3, 3, 5], [10, 7.5, 3.75, 3.75, 0]],
    [[1, 1, 3, 4, 4], [8.75, 8.75, 5, 1.25, 1.25]],
    [[1, 1, 1, 1, 1], [5, 5, 5, 5, 5]],
  ]) {
    const participants = field(5).map((p, i) => ({ ...p, finalPosition: ranks[i] }));
    const result = score(event(participants));
    result.forEach((r, i) => near(r.placementPoints, expected[i]));
    near(result.reduce((sum, r) => sum + r.placementPoints, 0), 25);
  }
});

test('input order and frozen inputs are preserved; output retains full precision', () => {
  const participants = field(7).reverse();
  const snapshot = structuredClone(participants);
  participants.forEach(p => { Object.freeze(p.swiss); Object.freeze(p); });
  Object.freeze(participants);
  const results = score(event(participants));
  assert.deepEqual(participants, snapshot);
  assert.deepEqual(results.map(r => r.playerId), participants.map(p => p.playerId));
  const fraction = results.find(r => r.playerId === 'player-1')!;
  assert.equal(fraction.totalPoints, fraction.matchPoints + fraction.placementPoints);
  assert.notEqual(fraction.totalPoints, Number(fraction.totalPoints.toFixed(2)));
  assert.equal(formatChampionshipPoints(fraction.totalPoints), '28.33');
  assert.equal(formatChampionshipPoints(0), '0.00');
});

test('rejects unsupported years and kinds, undersized fields, and invalid rounds', () => {
  for (const participants of [[], field(1)]) assert.throws(() => score(event(participants)), RangeError);
  for (const year of [2026, 2028, NaN, 2027.5]) assert.throws(() => score({ ...event(), year }), RangeError);
  assert.throws(() => score({ ...event(), kind: 'regular' as ChampionshipInput['kind'] }), RangeError);
  for (const scheduledSwissRounds of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => score({ ...event(), scheduledSwissRounds }), RangeError);
  }
});

test('rejects invalid Swiss integers and impossible complete or partial records', () => {
  for (const key of ['wins', 'draws', 'losses'] as const) {
    for (const invalid of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const participants = field();
      participants[0] = { ...participants[0], swiss: { ...participants[0].swiss, [key]: invalid } };
      assert.throws(() => score(event(participants)), RangeError);
    }
  }
  for (const swiss of [{ wins: 6, draws: 0, losses: 0 }, { wins: 3, draws: 3, losses: 0 }, { wins: 3, draws: 1, losses: 2 }]) {
    const participants = field();
    participants[0] = { ...participants[0], swiss };
    assert.throws(() => score(event(participants)), RangeError);
  }
});

test('rejects invalid placements, gaps, dense ranks, overlapping ties, and duplicate IDs', () => {
  for (const ranks of [[1, 2, 3, 3, 4], [1, 2, 4, 5, 5], [2, 2, 3, 4, 5], [1, 2, 3, 4, 6]]) {
    assert.throws(() => score(event(field(5).map((p, i) => ({ ...p, finalPosition: ranks[i] })))), RangeError);
  }
  for (const finalPosition of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const participants = field();
    participants[0] = { ...participants[0], finalPosition };
    assert.throws(() => score(event(participants)), RangeError);
  }
  for (const playerId of ['', ' ', 'player-1']) {
    const participants = field();
    participants[0] = { ...participants[0], playerId };
    assert.throws(() => score(event(participants)), RangeError);
  }
  for (const value of [-1, NaN, Infinity]) assert.throws(() => formatChampionshipPoints(value), RangeError);
});
