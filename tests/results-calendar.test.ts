import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedStandingsInput, correctImport, decideImport, effectiveValues, markReady, validateImport } from '../src/results/index.ts';
import type { EventKind, ReviewContext } from '../src/results/index.ts';
import type { ScheduledStart } from '../src/calendar/index.ts';
import { demoContext, demoImport } from '../src/results/demo.ts';
function valid(kind: EventKind = 'regular') {
  const d = demoImport(kind); const v = effectiveValues(d);
  return correctImport(d, { ...v, results: v.results.map((r, i) => ({ ...r, playerId: `demo-00${i + 1}`, draws: 0 })) }, 'Resolve fictional records');
}
function event(start: ScheduledStart | null, year = 2027, seasonId = 's1') {
  const d = valid(); const v = effectiveValues(d);
  return correctImport(d, { ...v, tournament: { ...v.tournament, start, date: start?.date ?? v.tournament.date, year, seasonId } }, 'Reconcile sample start');
}
const calendarIssues = (d: ReturnType<typeof valid>, context = demoContext) => validateImport(d, context).filter(i => i.path === 'tournament.calendar');
const approve = (d: ReturnType<typeof valid>, context = demoContext) => decideImport(markReady(d, context), 'approved', 'Fictional reviewer', '2027-02-02T12:00:00Z', 'Reviewed calendar', context);
function withoutCutoff(index: number): ReviewContext {
  return { ...demoContext, calendar: { ...demoContext.calendar, years: demoContext.calendar.years.map((y, i) => i ? y : {
    ...y, seasons: y.seasons.map((s, n) => n !== index ? s : { ...s, championship: { ...s.championship, start: undefined } }),
    annualChampionship: index !== 4 ? y.annualChampionship : { ...y.annualChampionship, start: undefined },
  }) } };
}
test('regular imports reconcile exact cutoffs and March rollover by actual start instant', () => {
  for (const [date, time, seasonId] of [
    ['2027-03-27', '11:59:59', 's1'],
    ['2027-03-27', '12:00', 's2'],
    ['2027-03-29', '18:00', 's2'],
    ['2027-06-26', '12:00', 's3'],
    ['2027-09-25', '12:00', 's4'],
  ]) {
    const d = event({ date, time, timeZone: 'America/Detroit' }, 2027, seasonId);
    assert.deepEqual(validateImport(d, demoContext), []);
    assert.equal(approvedStandingsInput([approve(d)], demoContext).regularEvents[0].seasonId, seasonId);
    const wrong = event({ date, time }, 2027, seasonId === 's1' ? 's2' : 's1');
    assert.match(calendarIssues(wrong)[0].message, /Calendar assigns/);
    assert.throws(() => markReady(wrong, demoContext));
  }
  // Same instant, different local zone representation.
  assert.deepEqual(calendarIssues(event({ date: '2027-03-27', time: '16:00', timeZone: 'UTC' }, 2027, 's2')), []);
});
test('December rollover enters 2028 s1 without implicitly approving 2028 scoring rules', () => {
  assert.deepEqual(calendarIssues(event({ date: '2027-12-11', time: '11:59:59' }, 2027, 's4')), []);
  for (const [date, time] of [['2027-12-11', '12:00'], ['2027-12-13', '18:00'], ['2027-12-18', '12:00'], ['2027-12-20', '18:00']]) {
    const wrong = event({ date, time }, 2027, 's4');
    assert.match(calendarIssues(wrong)[0].message, /2028 \/ s1/);
    const nextYear = event({ date, time }, 2028, 's1');
    const context = { ...demoContext, year: 2028 };
    assert.deepEqual(calendarIssues(nextYear, context), []);
    assert.ok(validateImport(nextYear, context).some(i => i.path === 'context.year'));
    assert.throws(() => markReady(nextYear, context));
  }
});
test('missing cutoffs, unresolved assignments, invalid calendars and missing starts block review', () => {
  for (let index = 0; index < 5; index++) {
    const context = withoutCutoff(index);
    assert.ok(calendarIssues(valid(), context).some(i => /Missing championship cutoffs/.test(i.message)));
    assert.throws(() => markReady(valid(), context));
  }
  assert.ok(calendarIssues(valid(), withoutCutoff(0)).some(i => /unresolved/.test(i.message)));
  assert.ok(calendarIssues(event({ date: '2027-01-03', time: '18:00' })).some(i => /Before configured league start/.test(i.message)));
  assert.ok(calendarIssues(event(null)).some(i => /explicit event start/.test(i.message)));
  const context = { ...demoContext, calendar: { ...demoContext.calendar, years: [] } };
  assert.ok(calendarIssues(valid(), context).some(i => /reconciliation failed/.test(i.message)));
  const wrongPeriods = { ...demoContext, seasonIds: ['s1', 's3', 's2', 's4'] };
  assert.ok(calendarIssues(valid(), wrongPeriods).some(i => /periods in order/.test(i.message)));
});
test('import start validation preserves Detroit default, DST gaps and explicit fold offsets', () => {
  for (const start of [
    { date: '2027-03-14', time: '02:30' },
    { date: '2027-11-07', time: '01:30' },
    { date: '2027-11-07', time: '01:30', offset: '-06:00' },
    { date: '2027-02-01', time: '' },
    { date: '2027-02-01', time: '18:00', timeZone: 'Invalid/Zone' },
  ]) assert.ok(calendarIssues(event(start, 2027, start.date.includes('11-07') ? 's4' : 's1')).length);
  for (const offset of ['-04:00', '-05:00']) assert.deepEqual(calendarIssues(event({ date: '2027-11-07', time: '01:30', offset }, 2027, 's4')), []);
});
test('championships require configured identity, owner period and scheduled instant', () => {
  for (const kind of ['seasonal', 'annual'] as const) {
    const d = valid(kind); const v = effectiveValues(d);
    assert.deepEqual(validateImport(d, demoContext), []);
    assert.equal(approvedStandingsInput([approve(d)], demoContext).championships.length, 1);
    for (const patch of [{ eventId: 'wrong' }, { year: 2028 }, { seasonId: 's2' }, { start: { ...v.tournament.start!, time: '13:00' } }]) {
      const wrong = correctImport(d, { ...v, tournament: { ...v.tournament, ...patch } }, 'Incorrect championship example');
      assert.ok(validateImport(wrong, demoContext).length);
      assert.throws(() => markReady(wrong, demoContext));
    }
    if (kind === 'seasonal') {
      const wrongPeriod = correctImport(d, { ...v, tournament: { ...v.tournament, seasonId: 's2' } }, 'Wrong period');
      assert.match(calendarIssues(wrongPeriod)[0].message, /identity/);
    }
    const context = withoutCutoff(kind === 'annual' ? 4 : 0);
    assert.ok(calendarIssues(d, context).some(i => /unconfirmed/.test(i.message)));
  }
});
test('calendar failures preserve corrections; approval and scoring revalidate changed schedules', () => {
  const d = event({ date: '2027-03-29', time: '18:00' }, 2027, 's1');
  const original = JSON.stringify(d.original);
  assert.ok(calendarIssues(d).length);
  const v = effectiveValues(d);
  const fixed = correctImport(d, { ...v, tournament: { ...v.tournament, seasonId: 's2' } }, 'Correct March assignment');
  assert.equal(JSON.stringify(fixed.original), original);
  assert.equal(fixed.corrections.length, d.corrections.length + 1);
  const ready = markReady(fixed, demoContext);
  const approved = approve(fixed);
  const missing = withoutCutoff(1);
  assert.throws(() => decideImport(ready, 'approved', 'Reviewer', '2027-03-30T12:00:00Z', 'Review', missing));
  assert.throws(() => approvedStandingsInput([approved], missing));
  const moved = { ...demoContext, calendar: { ...demoContext.calendar, years: demoContext.calendar.years.map((y, i) => i ? y : { ...y, seasons: y.seasons.map((s, n) => n ? s : { ...s, championship: { ...s.championship, start: { date: '2027-03-30', time: '12:00' } } }) }) } };
  assert.throws(() => approvedStandingsInput([approved], moved));
  assert.equal(approvedStandingsInput([approved], demoContext).regularEvents[0].seasonId, 's2');
});
