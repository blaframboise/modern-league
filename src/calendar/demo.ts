/** Fictional scheduling fixtures. These are never official league announcements. */
import type { CalendarConfig, CalendarEvent, LeagueYear } from './index.ts';
export const targetWindows = ['January–March', 'April–June', 'July–September', 'October–December'];
const sample = (id: string, name: string, date?: string, time = '12:00'): CalendarEvent => ({
  id, name, source: 'sample',
  ...(date ? { start: { date, time, timeZone: 'America/Detroit' } } : {}),
  description: 'Fictional scheduling example; not an official announcement.',
});
const year = (value: number, dates: readonly (string | undefined)[], annual?: string): LeagueYear => ({
  year: value,
  seasons: targetWindows.map((window, index) => ({ id: `s${index + 1}`, targetWindow: `${window} ${value}`, championship: sample(`${value}-s${index + 1}`, `Season ${index + 1} championship`, dates[index]) })),
  annualChampionship: sample(`${value}-annual`, 'Annual championship', annual),
});
export const demoCalendar: CalendarConfig = {
  begins: { date: '2027-01-04', time: '00:00' },
  years: [year(2027, ['2027-03-27', '2027-06-26', '2027-09-25', '2027-12-11'], '2027-12-18'), year(2028, ['2028-03-25', undefined, undefined, undefined])],
};
export const demoRegularEvents: readonly CalendarEvent[] = [
  sample('opening', 'Opening Monday example', '2027-01-04', '18:00'),
  sample('before-s1', 'Friday Modern example', '2027-03-26', '18:00'),
  sample('after-s1', 'Early Season 2 example', '2027-03-29', '18:00'),
  sample('before-s4', 'Season 4 Friday example', '2027-12-10', '18:00'),
  sample('after-s4', 'Next league year example', '2027-12-13', '18:00'),
  sample('after-annual', 'After annual championship example', '2027-12-20', '18:00'),
];
