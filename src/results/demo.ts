/** Fictional demonstration only. Never load these records into official standings. */
import { demoCalendar } from '../calendar/demo.ts';
import { createImport } from './index.ts';
import type { EventKind, ReviewContext } from './index.ts';
export const demoContext: ReviewContext = {
  calendar: { ...demoCalendar, years: demoCalendar.years.map(y => y.year === 2027 ? y : {
    ...y, seasons: y.seasons.map((s, i) => ({ ...s, championship: { ...s.championship,
      start: { date: ['2028-03-25', '2028-06-24', '2028-09-23', '2028-12-09'][i], time: '12:00', timeZone: 'America/Detroit' } } })),
    annualChampionship: { ...y.annualChampionship, start: { date: '2028-12-16', time: '12:00', timeZone: 'America/Detroit' } },
  }) },
  year: 2027, seasonIds: ['s1', 's2', 's3', 's4'], otherImports: [],
  players: [
    { playerId: 'demo-001', displayName: 'Sample Copper', aliases: ['Copper Sample'] },
    { playerId: 'demo-002', displayName: 'Sample Indigo', aliases: [] },
    { playerId: 'demo-003', displayName: 'Sample Copper', aliases: [] },
  ],
};
export function demoImport(kind: EventKind = 'regular') {
  const configuredYear = demoContext.calendar.years[0];
  const championship = kind === 'annual' ? configuredYear.annualChampionship : configuredYear.seasons[0].championship;
  const start = kind === 'regular' ? { date: '2027-02-01', time: '18:00', timeZone: 'America/Detroit' } : championship.start!;
  return createImport(`demo-${kind}`, {
    tournament: { eventId: kind === 'regular' ? `demo-event-${kind}` : championship.id, sourceKey: `fictional:${kind}`, name: `Fictional ${kind} event`, date: start.date, start, year: 2027,
      ...(kind !== 'annual' ? { seasonId: 's1' } : {}), kind, scheduledRounds: 3 },
    results: [
      { rowId: 'row-1', importedName: 'Sample Copper', playerId: null, wins: 3, losses: 0, draws: 0, finalPosition: 1 },
      { rowId: 'row-2', importedName: 'Sample Indigo', playerId: 'demo-002', wins: 0, losses: 3, draws: null, finalPosition: 2 },
    ],
  });
}
