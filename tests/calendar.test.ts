import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignRegularEvents, startInstant, validateCalendar } from '../src/calendar/index.ts';
import type { CalendarConfig, CalendarEvent } from '../src/calendar/index.ts';
import { demoCalendar, demoRegularEvents } from '../src/calendar/demo.ts';
import { aggregateSeasonRegularResults } from '../src/scoring/regular.ts';
const event = (date: string, time = '18:00', id = 'test'): CalendarEvent => ({ id, name: 'Test', source: 'sample', start: { date, time } });
const assigned = (date: string, time = '18:00') => assignRegularEvents(demoCalendar, [event(date, time)])[0];
test('initial, seasonal, exact-cutoff and December rollover assignments', () => {
  for (const [date, time, year, seasonId] of [
    ['2027-01-04', '00:00', 2027, 's1'],
    ['2027-03-27', '11:59:59', 2027, 's1'],
    ['2027-03-27', '12:00', 2027, 's2'],
    ['2027-03-29', '18:00', 2027, 's2'],
    ['2027-12-11', '11:59:59', 2027, 's4'],
    ['2027-12-11', '12:00', 2028, 's1'],
    ['2027-12-17', '18:00', 2028, 's1'],
    ['2027-12-18', '12:00', 2028, 's1'],
    ['2027-12-20', '18:00', 2028, 's1'],
  ] as const) assert.deepEqual(assigned(date, time), { status: 'assigned', eventId: 'test', year, seasonId });
});
test('championship ownership stays explicit and separate from regular events', () => {
  const year = demoCalendar.years[0];
  assert.equal(year.year, 2027);
  assert.equal(year.seasons[3].id, 's4');
  assert.notEqual(year.seasons[3].championship.id, year.annualChampionship.id);
  for (const championship of [year.seasons[3].championship, year.annualChampionship]) assert.throws(() => assignRegularEvents(demoCalendar, [championship]), /unique/);
});
test('named-zone conversion ignores process time zone and handles DST', () => {
  const old = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      assert.equal(startInstant({ date: '2027-01-04', time: '18:00' }), Date.UTC(2027, 0, 4, 23));
      assert.equal(startInstant({ date: '2027-07-04', time: '18:00' }), Date.UTC(2027, 6, 4, 22));
      assert.equal(assigned('2027-03-29').status, 'assigned');
    }
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  assert.throws(() => startInstant({ date: '2027-03-14', time: '02:30' }));
  assert.throws(() => startInstant({ date: '2027-11-07', time: '01:30' }));
  const early = startInstant({ date: '2027-11-07', time: '01:30', offset: '-04:00' });
  const late = startInstant({ date: '2027-11-07', time: '01:30', offset: '-05:00' });
  assert.equal(late - early, 3600000);
  assert.throws(() => startInstant({ date: '2027-11-07', time: '01:30', offset: '-06:00' }));
});
test('invalid dates, zones, event IDs and championship ordering are rejected', () => {
  for (const start of [{ date: '2027-02-30', time: '12:00' }, { date: '2027-01-01', time: '24:00' }, { date: '2027-01-01', time: '12:00', timeZone: 'Invalid/Zone' }]) assert.throws(() => startInstant(start));
  assert.throws(() => validateCalendar(demoCalendar, [event('2027-01-04'), event('2027-01-05')]), /unique/);
  assert.throws(() => validateCalendar(demoCalendar, [{ id: 'no-start', name: '', source: 'sample' }]), /start/);
  const mutate = (change: (config: CalendarConfig) => void) => {
    const config = structuredClone(demoCalendar) as any;
    change(config);
    assert.throws(() => validateCalendar(config));
  };
  mutate((c: any) => c.years[0].seasons.pop());
  mutate((c: any) => c.years[0].seasons[1].id = 's1');
  mutate((c: any) => c.years[0].seasons[1].championship.id = c.years[0].seasons[0].championship.id);
  mutate((c: any) => c.years[0].annualChampionship.id = c.years[0].seasons[3].championship.id);
  mutate((c: any) => c.years[0].seasons[1].championship.start.date = '2027-03-01');
  mutate((c: any) => c.years[0].annualChampionship.start.date = '2027-12-01');
});
test('incomplete schedules are explicit; annual cutoff can establish rollover', () => {
  assert.equal(assigned('2028-04-01').status, 'unresolved');
  assert.equal(assigned('2027-01-03').status, 'unresolved');
  const config = structuredClone(demoCalendar) as any;
  delete config.years[0].seasons[0].championship.start;
  assert.equal(assignRegularEvents(config, [event('2027-01-04')])[0].status, 'unresolved');
  delete config.years[0].seasons[3].championship.start;
  assert.equal(assignRegularEvents(config, [event('2027-12-17')])[0].status, 'unresolved');
  assert.deepEqual(assignRegularEvents(config, [event('2027-12-20')])[0], { status: 'assigned', eventId: 'test', year: 2028, seasonId: 's1' });
  const only2027 = { ...demoCalendar, years: [demoCalendar.years[0]] };
  assert.equal(assignRegularEvents(only2027, [event('2027-12-20')])[0].status, 'unresolved');
});
test('immutable assignments allow callers to select only one year and season for scoring', () => {
  const before = JSON.stringify({ demoCalendar, demoRegularEvents });
  const assignments = assignRegularEvents(demoCalendar, demoRegularEvents);
  const selected = assignments.filter(a => a.status === 'assigned' && a.year === 2027 && a.seasonId === 's1');
  const result = aggregateSeasonRegularResults(selected.map(a => ({ eventId: a.eventId, wins: 3, draws: 0, scheduledRounds: 3 })));
  assert.equal(result.regularEventCount, 2);
  assert.equal(result.seasonalPoints, 20);
  assert.equal(JSON.stringify({ demoCalendar, demoRegularEvents }), before);
});

test('calendar assignments satisfy cumulative standings input without including 2028 events', async () => {
  const { calculateStandings } = await import('../src/scoring/standings.ts');
  const { year, seasons } = demoCalendar.years[0];
  const regularEvents = assignRegularEvents(demoCalendar, demoRegularEvents).flatMap(assignment => assignment.status === 'assigned' && assignment.year === year
    ? [{ eventId: assignment.eventId, year: assignment.year, seasonId: assignment.seasonId, results: [{ playerId: 'fixture', wins: 3, draws: 0, scheduledRounds: 3 }] }] : []);
  const standings = calculateStandings({ year, seasonIds: seasons.map(s => s.id), players: [{ playerId: 'fixture', name: 'Fixture' }], regularEvents, championships: [] });
  assert.equal(standings.annual.standings[0].regularEventCount, 4);
  assert.equal(standings.seasons[0].beforeChampionship.standings[0].regularEventCount, 2);
  assert.equal(standings.seasons[1].beforeChampionship.standings[0].regularEventCount, 1);
});

/** Independent incomplete fixtures: dates are supplied only by each test. */
function sparseCalendar(cutoffs: Readonly<Record<number, string>>): CalendarConfig {
  const championship = (slot: number): CalendarEvent => ({
    id: `cutoff-${slot}`, name: 'Championship fixture', source: 'sample',
    ...(cutoffs[slot] ? { start: { date: cutoffs[slot], time: '12:00' } } : {}),
  });
  return {
    begins: { date: '2027-01-04', time: '00:00' },
    years: [2027, 2028, 2029].map((year, index) => ({
      year,
      seasons: [0, 1, 2, 3].map(season => ({ id: `s${season + 1}`, targetWindow: 'Fixture', championship: championship(index * 5 + season) })),
      annualChampionship: championship(index * 5 + 4),
    })),
  };
}

test('every pair of known cutoffs stays ordered across missing dates and league years', () => {
  // Covers seasonal/annual pairs, prior annual -> next first known season,
  // and an entirely undated intervening league year. Equal instants also fail.
  for (let earlier = 0; earlier < 15; earlier++) {
    for (let later = earlier + 1; later < 15; later++) {
      const ordered = sparseCalendar({ [earlier]: '2027-06-01', [later]: '2027-06-02' });
      assert.doesNotThrow(() => validateCalendar(ordered), `ordered slots ${earlier}, ${later}`);
      for (const date of ['2027-06-01', '2027-05-31']) {
        const contradictory = sparseCalendar({ [earlier]: '2027-06-01', [later]: date });
        assert.throws(() => validateCalendar(contradictory), /chronological/, `contradictory slots ${earlier}, ${later}`);
        assert.throws(() => assignRegularEvents(contradictory, [event('2027-06-01')]), /chronological/);
      }
    }
  }
});

test('annual rollover does not invent missing seasonal cutoffs on either side of a year boundary', () => {
  // 2027 S4 is missing; annual is known. 2028 S1 is the next known cutoff.
  const config = sparseCalendar({ 4: '2027-12-18', 5: '2028-03-25' });
  const before = JSON.stringify(config);
  const cases = [
    ['2027-12-18', '11:59:59', undefined],
    ['2027-12-18', '12:00', 's1'],
    ['2027-12-18', '12:00:01', 's1'],
    ['2028-03-25', '11:59:59', 's1'],
    // At S1's cutoff S2 has no upper boundary, so keep it unresolved.
    ['2028-03-25', '12:00', undefined],
  ] as const;
  for (const [date, time, seasonId] of cases) {
    const assignment = assignRegularEvents(config, [event(date, time)])[0];
    if (seasonId) assert.deepEqual(assignment, { status: 'assigned', eventId: 'test', year: 2028, seasonId });
    else assert.equal(assignment.status, 'unresolved');
  }
  assert.equal(JSON.stringify(config), before);
  // A known S2 cutoff cannot disambiguate S1 vs S2 when S1 is missing.
  const missingFirst = sparseCalendar({ 4: '2027-12-18', 6: '2028-06-24' });
  assert.equal(assignRegularEvents(missingFirst, [event('2027-12-18', '12:00')])[0].status, 'unresolved');
});

test('known Season 4 permits rollover without annual but unknown year transitions remain unresolved', () => {
  const config = sparseCalendar({ 2: '2027-09-25', 3: '2027-12-11', 5: '2028-03-25' });
  // Earlier missing seasons do not establish a definitive assignment before S4.
  assert.equal(assignRegularEvents(config, [event('2027-12-11', '11:59:59')])[0].status, 'unresolved');
  assert.deepEqual(assignRegularEvents(config, [event('2027-12-11', '12:00')])[0], { status: 'assigned', eventId: 'test', year: 2028, seasonId: 's1' });
  const unknownRollover = sparseCalendar({ 2: '2027-09-25', 5: '2028-03-25' });
  assert.equal(assignRegularEvents(unknownRollover, [event('2027-12-20')])[0].status, 'unresolved');
});
