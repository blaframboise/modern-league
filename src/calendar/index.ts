/** Scheduling is independent of scores, persistence, and the host time zone. */
export const DEFAULT_TIME_ZONE = 'America/Detroit';
export interface ScheduledStart {
  readonly date: string;
  readonly time: string;
  readonly timeZone?: string;
  /** Required for a repeated local time; must match the named zone. */
  readonly offset?: string;
}
export interface CalendarEvent {
  readonly id: string;
  readonly name: string;
  readonly start?: ScheduledStart;
  readonly venue?: string;
  readonly description?: string;
  readonly source: 'sample' | 'confirmed';
}
export interface Season {
  readonly id: string;
  readonly targetWindow: string;
  readonly championship: CalendarEvent;
  readonly status?: string;
}
export interface LeagueYear {
  readonly year: number;
  readonly seasons: readonly Season[];
  readonly annualChampionship: CalendarEvent;
}
export interface CalendarConfig {
  /** Explicit lower bound for the first configured competitive season. */
  readonly begins: ScheduledStart;
  readonly years: readonly LeagueYear[];
}
export type Assignment =
  | { readonly status: 'assigned'; readonly eventId: string; readonly year: number; readonly seasonId: string }
  | { readonly status: 'unresolved'; readonly eventId: string; readonly reason: string };

/** Resolve by finding all instants matching the local wall clock. DST gaps have
 * no candidates; folds require an explicit offset. No Date string parsing. */
export function startInstant(start: ScheduledStart): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start.date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(start.time)) {
    throw new RangeError('Require ISO local date and HH:mm[:ss] time');
  }
  const [year, month, day] = start.date.split('-').map(Number);
  const [hour, minute, second = 0] = start.time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (year < 100 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new RangeError('Invalid local date or time');
  const zone = start.timeZone ?? DEFAULT_TIME_ZONE;
  if (/^[+-]/.test(zone)) throw new RangeError('Require a named time zone');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const local = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  };
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const probe = wall + h * 3600000;
    offsets.add(local(probe) - probe);
  }
  let candidates = [...offsets].map(offset => wall - offset).filter(instant => local(instant) === wall);
  if (start.offset !== undefined) {
    if (!/^[+-](0\d|1\d|2[0-3]):[0-5]\d$/.test(start.offset)) throw new RangeError('Invalid UTC offset');
    const minutes = (Number(start.offset.slice(1, 3)) * 60 + Number(start.offset.slice(4))) * (start.offset[0] === '-' ? -1 : 1);
    candidates = candidates.filter(instant => wall - instant === minutes * 60000);
  }
  if (candidates.length !== 1) throw new RangeError('Invalid or ambiguous local start; supply a matching explicit offset for repeated times');
  return candidates[0];
}

export function validateCalendar(config: CalendarConfig, regularEvents: readonly CalendarEvent[] = []): void {
  const begins = startInstant(config.begins);
  const ids = new Set<string>();
  const register = (event: CalendarEvent) => {
    if (!event.id.trim() || ids.has(event.id)) throw new RangeError('Require unique nonempty event IDs');
    ids.add(event.id);
    if (event.start) startInstant(event.start);
  };
  let lastYear = 0;
  let previousSeason = begins;
  let previousAnnual: number | undefined;
  const seasonIds = new Set<string>();
  for (const year of config.years) {
    if (!Number.isSafeInteger(year.year) || year.year <= lastYear || (lastYear && year.year !== lastYear + 1)) throw new RangeError('Require consecutive ordered league years');
    lastYear = year.year;
    if (year.seasons.length !== 4) throw new RangeError('Require exactly four seasons');
    let firstCutoff: number | undefined;
    for (const season of year.seasons) {
      // IDs are scoped to a year, matching the assignment pair (year, seasonId).
      const key = `${year.year}:${season.id}`;
      if (!season.id.trim() || seasonIds.has(key)) throw new RangeError('Require distinct season IDs within each year');
      seasonIds.add(key);
      register(season.championship);
      if (season.championship.start) {
        const instant = startInstant(season.championship.start);
        if (instant <= previousSeason) throw new RangeError('Seasonal championships must be strictly chronological');
        firstCutoff ??= instant;
        previousSeason = instant;
      }
    }
    register(year.annualChampionship);
    if (previousAnnual !== undefined && firstCutoff !== undefined && firstCutoff <= previousAnnual) throw new RangeError('Next year championships must follow the prior annual championship');
    if (year.annualChampionship.start) {
      const instant = startInstant(year.annualChampionship.start);
      if (instant <= previousSeason || (previousAnnual !== undefined && instant <= previousAnnual)) throw new RangeError('Annual championship must follow seasonal championships');
      previousAnnual = instant;
    }
  }
  if (!config.years.length) throw new RangeError('Require at least one league year');
  for (const event of regularEvents) {
    register(event);
    if (!event.start) throw new RangeError('Regular events require valid start times');
  }
}

/** Missing boundaries are never replaced by calendar quarters. Known annual
 * cutoffs can prove rollover even if an earlier seasonal cutoff is unknown. */
export function assignRegularEvents(config: CalendarConfig, events: readonly CalendarEvent[]): Assignment[] {
  validateCalendar(config, events);
  return events.map(event => {
    const unresolved = (reason: string): Assignment => ({ status: 'unresolved', eventId: event.id, reason });
    const instant = startInstant(event.start!);
    if (instant < startInstant(config.begins)) return unresolved('Before configured league start');
    for (const year of config.years) {
      const annual = year.annualChampionship.start;
      const fourth = year.seasons[3].championship.start;
      if ((annual && instant >= startInstant(annual)) || (fourth && instant >= startInstant(fourth))) continue;
      for (const season of year.seasons) {
        if (!season.championship.start) return unresolved('Missing seasonal championship cutoff');
        if (instant < startInstant(season.championship.start)) return { status: 'assigned', eventId: event.id, year: year.year, seasonId: season.id };
      }
    }
    return unresolved('Next league year is not configured');
  });
}
