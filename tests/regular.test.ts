import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateSeasonRegularResults, calculateRegularEventPoints, getCumulativeTitleEligibility } from '../src/scoring/regular.ts';
import type { SeasonalRegularResult } from '../src/scoring/regular.ts';

const results = (count: number, wins = 3): SeasonalRegularResult[] =>
  Array.from({ length: count }, (_, i) => ({ eventId: `event-${i}`, wins, draws: 0, scheduledRounds: 3 }));

test('official aggregate records produce the specified unrounded points', () => {
  for (const [wins, draws, scheduledRounds, expected] of [
    [3, 0, 3, 10], [0, 0, 3, 0], [2, 1, 3, 70 / 9],
    [2, 0, 3, 60 / 9], [0, 3, 3, 10 / 3], [4, 0, 4, 10],
    [1, 0, 4, 2.5],
  ]) {
    assert.equal(calculateRegularEventPoints({ wins, draws, scheduledRounds }), expected);
  }
});

test('all valid small records stay within bounds and identical records have identical points', () => {
  for (let rounds = 1; rounds <= 12; rounds++) {
    for (let wins = 0; wins <= rounds; wins++) {
      for (let draws = 0; draws <= rounds - wins; draws++) {
        const record = { wins, draws, scheduledRounds: rounds };
        const points = calculateRegularEventPoints(record);
        assert.ok(points >= 0 && points <= 10);
        assert.equal(points, calculateRegularEventPoints({ ...record }));
      }
    }
  }
});

test('rejects invalid counts and impossible records rather than clamping', () => {
  for (const invalid of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ['wins', 'draws', 'scheduledRounds']) {
      assert.throws(() => calculateRegularEventPoints({ wins: 0, draws: 0, scheduledRounds: 3, [field]: invalid }), RangeError);
    }
  }
  for (const record of [
    { wins: 0, draws: 0, scheduledRounds: 0 },
    { wins: 4, draws: 0, scheduledRounds: 3 },
    { wins: 2, draws: 2, scheduledRounds: 3 },
  ]) assert.throws(() => calculateRegularEventPoints(record), RangeError);
});

test('empty and below-minimum seasons retain results and points', () => {
  const empty = aggregateSeasonRegularResults([]);
  assert.equal(empty.seasonalPoints, 0);
  assert.equal(empty.pointsEarned, 0);
  assert.equal(empty.regularEventCount, 0);
  assert.equal(empty.eligibleForSeasonalCumulativeTitle, false);
  assert.deepEqual(empty.countedResults, []);
  const five = aggregateSeasonRegularResults(results(5));
  assert.equal(five.seasonalPoints, 50);
  assert.equal(five.scoredResults.length, 5);
  assert.equal(five.eligibleForSeasonalCumulativeTitle, false);
});

test('six events qualify, including zero-point events', () => {
  const season = aggregateSeasonRegularResults(results(6, 0));
  assert.equal(season.eligibleForSeasonalCumulativeTitle, true);
  assert.equal(season.seasonalPoints, 0);
});

test('best eight cap seasonal points at 80 while all attendance and earned points remain', () => {
  for (const count of [7, 8, 9, 20]) {
    const season = aggregateSeasonRegularResults(results(count));
    assert.equal(season.seasonalPoints, Math.min(count, 8) * 10);
    assert.equal(season.pointsEarned, count * 10);
    assert.equal(season.regularEventCount, count);
    assert.equal(season.countedResults.length, Math.min(count, 8));
    assert.equal(season.excludedResults.length, Math.max(count - 8, 0));
  }
});

test('selects highest results regardless of input order without mutating inputs', () => {
  const input = results(9);
  input[0] = { ...input[0], wins: 0 };
  const snapshot = structuredClone(input);
  input.forEach(Object.freeze);
  Object.freeze(input);
  const season = aggregateSeasonRegularResults(input);
  assert.equal(season.seasonalPoints, 80);
  assert.equal(season.excludedResults[0].eventId, 'event-0');
  assert.deepEqual(input, snapshot);
  assert.equal(aggregateSeasonRegularResults([...input].reverse()).seasonalPoints, 80);
});

test('aggregation never rounds fractional event scores', () => {
  const input = results(9, 2);
  const season = aggregateSeasonRegularResults(input);
  const unrounded = input.slice(0, 8).reduce((sum, record) => sum + calculateRegularEventPoints(record), 0);
  assert.equal(season.seasonalPoints, unrounded);
  assert.notEqual(season.seasonalPoints, 8 * 6.67);
});

test('rejects duplicate/blank event IDs and invalid results even outside best eight', () => {
  assert.throws(() => aggregateSeasonRegularResults([...results(8), results(1)[0]]));
  assert.throws(() => aggregateSeasonRegularResults([{ ...results(1)[0], eventId: ' ' }]));
  assert.throws(() => aggregateSeasonRegularResults([...results(8), { eventId: 'bad', wins: -1, draws: 0, scheduledRounds: 3 }]));
});

test('cumulative-title attendance thresholds are distinct at six and twenty', () => {
  for (const [count, seasonal, annual] of [
    [0, false, false], [5, false, false], [6, true, false],
    [19, true, false], [20, true, true], [21, true, true],
  ] as const) assert.deepEqual(getCumulativeTitleEligibility(count), { seasonal, annual });
  for (const invalid of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => getCumulativeTitleEligibility(invalid), RangeError);
  }
});
