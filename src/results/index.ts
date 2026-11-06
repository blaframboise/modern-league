import { assignRegularEvents, startInstant, validateCalendar } from '../calendar/index.ts';
import type { CalendarConfig, ScheduledStart } from '../calendar/index.ts';
import { calculateChampionshipPoints, CHAMPIONSHIP_RULES } from '../scoring/championship.ts';
import { calculateStandings } from '../scoring/standings.ts';
import type { StandingsInput, Championship, RegularEvent } from '../scoring/standings.ts';

export interface PlayerIdentity { readonly playerId: string; readonly displayName: string; readonly aliases: readonly string[] }
export type EventKind = 'regular' | 'seasonal' | 'annual';
export interface Tournament {
  readonly eventId: string;
  /** Stable identity from the source, e.g. organizer + source event ID. */
  readonly sourceKey: string;
  readonly name: string;
  readonly date: string;
  /** Explicit local start plus named zone/optional DST-fold offset; null remains editable. */
  readonly start: ScheduledStart | null;
  readonly year: number;
  readonly seasonId?: string;
  readonly kind: EventKind;
  readonly scheduledRounds: number | null;
}
export interface ImportedResult {
  readonly rowId: string;
  readonly importedName: string;
  readonly playerId: string | null;
  readonly wins: number | null;
  readonly losses: number | null;
  readonly draws: number | null;
  /** Official championship competition rank; regular events do not need one. */
  readonly finalPosition: number | null;
}
export interface ImportValues { readonly tournament: Tournament; readonly results: readonly ImportedResult[] }
export type ImportState = 'draft' | 'ready for approval' | 'approved' | 'rejected';
export interface Correction { readonly values: ImportValues; readonly reason: string }
export interface ImportDraft {
  readonly importId: string;
  readonly state: ImportState;
  readonly original: ImportValues;
  readonly corrections: readonly Correction[];
  readonly decision?: { readonly reviewer: string; readonly at: string; readonly reason: string };
}
export interface ReviewContext {
  readonly calendar: CalendarConfig;
  readonly players: readonly PlayerIdentity[];
  readonly year: number;
  readonly seasonIds: readonly string[];
  /** All other imports, including rejected ones (which do not reserve an event). */
  readonly otherImports: readonly ImportDraft[];
}
export interface Issue { readonly path: string; readonly message: string }
const nonempty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const count = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
export const normalizeName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
/** Suggestions only: shared names are never merged automatically. */
export function potentialPlayers(name: string, players: readonly PlayerIdentity[]) {
  const key = normalizeName(name);
  return players.filter(p => [p.displayName, ...p.aliases].some(n => normalizeName(n) === key));
}
export function validateRegistry(players: readonly PlayerIdentity[]): Issue[] {
  const issues: Issue[] = []; const ids = new Set<string>();
  players.forEach((p, i) => {
    if (!nonempty(p.playerId) || p.playerId !== p.playerId.trim() || ids.has(p.playerId)) issues.push({ path: `players.${i}.playerId`, message: 'Require unique, trimmed stable player IDs.' });
    ids.add(p.playerId);
    if (!nonempty(p.displayName) || p.aliases.some(a => !nonempty(a))) issues.push({ path: `players.${i}`, message: 'Require a display name and nonempty aliases.' });
  });
  return issues;
}
/** Independent frozen snapshots prevent caller mutations from rewriting source or approval history. */
function snapshot<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(v: unknown): void { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } }
  freeze(copy); return copy;
}
export function createImport(importId: string, original: ImportValues): ImportDraft {
  if (!nonempty(importId)) throw new Error('Require an import ID');
  return snapshot({ importId, state: 'draft', original, corrections: [] });
}
export function effectiveValues(draft: ImportDraft): ImportValues { return draft.corrections.at(-1)?.values ?? draft.original; }
export function correctImport(draft: ImportDraft, values: ImportValues, reason: string): ImportDraft {
  if (!['draft', 'ready for approval'].includes(draft.state) || !nonempty(reason)) throw new Error('Only editable imports with a correction reason may be corrected');
  return snapshot({ ...draft, state: 'draft', corrections: [...draft.corrections, { values, reason }] });
}
function championship(values: ImportValues): Championship {
  const t = values.tournament;
  return { eventId: t.eventId, year: t.year, kind: t.kind as 'seasonal' | 'annual', seasonId: t.seasonId,
    scheduledSwissRounds: t.scheduledRounds!, participants: values.results.map(r => ({ playerId: r.playerId!,
      swiss: { wins: r.wins!, losses: r.losses!, draws: r.draws! }, finalPosition: r.finalPosition! })) };
}
/** Calendar failures are review issues, never a reason to discard source/corrections. */
function reconcileCalendar(t: Tournament, context: ReviewContext): Issue[] {
  const issues: Issue[] = [];
  const add = (message: string) => issues.push({ path: 'tournament.calendar', message });
  try {
    validateCalendar(context.calendar);
    const year = context.calendar.years.find(y => y.year === t.year);
    if (!year) { add('Competitive year is not configured in the calendar.'); return issues; }
    if (t.year === context.year && (year.seasons.length !== context.seasonIds.length ||
        year.seasons.some((season, i) => season.id !== context.seasonIds[i]))) {
      add('Review season IDs must match the configured calendar periods in order.');
    }
    // Approval requires a complete reviewed competitive year, even when a
    // partial calendar could locate this particular event before a known cutoff.
    if (year.seasons.some(s => !s.championship.start) || !year.annualChampionship.start) {
      add('Missing championship cutoffs for the competitive year; complete the schedule before approval.');
    }
    if (!t.start) { add('Require an explicit event start date, time and named time zone before approval.'); return issues; }
    const instant = startInstant(t.start);
    if (t.date !== t.start.date) add('Tournament date must match the explicit local start date.');
    if (t.kind === 'regular') {
      const assignment = assignRegularEvents(context.calendar, [{ id: t.eventId, name: t.name, start: t.start, source: 'sample' }])[0];
      if (assignment.status === 'unresolved') add(`Calendar assignment unresolved: ${assignment.reason}.`);
      else if (assignment.year !== t.year || assignment.seasonId !== t.seasonId) {
        add(`Calendar assigns this start to ${assignment.year} / ${assignment.seasonId}; correct the competitive year and season.`);
      }
    } else if (t.kind === 'seasonal' || t.kind === 'annual') {
      const configured = t.kind === 'annual' ? year.annualChampionship : year.seasons.find(s => s.id === t.seasonId)?.championship;
      if (!configured || configured.id !== t.eventId) add('Championship identity does not match the configured event for this competitive period.');
      if (!configured?.start) add('Championship start is unconfirmed; approval is blocked.');
      else if (startInstant(configured.start) !== instant) add('Imported championship start does not match the configured championship instant.');
    }
  } catch (error) {
    add(`Calendar reconciliation failed: ${error instanceof Error ? error.message : 'Invalid calendar or event start'}`);
  }
  return issues;
}
export function validateImport(draft: ImportDraft, context: ReviewContext): Issue[] {
  const issues = validateRegistry(context.players);
  if (!count(context.year, 1) || !Object.hasOwn(CHAMPIONSHIP_RULES, context.year)) issues.push({ path: 'context.year', message: 'Require a configured scoring year.' });
  if (context.seasonIds.length !== 4 || new Set(context.seasonIds).size !== 4 || context.seasonIds.some(s => !nonempty(s))) issues.push({ path: 'context.seasonIds', message: 'Require four distinct configured season IDs.' });
  const add = (path: string, message: string) => issues.push({ path, message });
  const values = effectiveValues(draft); const t = values.tournament;
  issues.push(...reconcileCalendar(t, context));
  for (const key of ['eventId', 'sourceKey', 'name'] as const) if (!nonempty(t[key]) || t[key] !== t[key].trim()) add(`tournament.${key}`, 'Require a nonempty trimmed value.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date)) || new Date(t.date).toISOString().slice(0, 10) !== t.date) add('tournament.date', 'Require a valid ISO calendar date.');
  if (!count(t.year, 1) || t.year !== context.year) add('tournament.year', 'Require the configured competitive year.');
  if (!['regular', 'seasonal', 'annual'].includes(t.kind)) add('tournament.kind', 'Unknown event kind.');
  if (t.kind === 'annual' ? t.seasonId !== undefined : !context.seasonIds.includes(t.seasonId!)) add('tournament.seasonId', 'Require an explicit configured season except for annual championships.');
  if (!count(t.scheduledRounds, 1)) add('tournament.scheduledRounds', 'Require positive scheduled rounds.');
  for (const other of context.otherImports) {
    if (other.state === 'rejected') continue;
    const o = effectiveValues(other).tournament;
    if (other.importId === draft.importId || o.eventId === t.eventId || o.sourceKey === t.sourceKey ||
      (o.date === t.date && normalizeName(o.name) === normalizeName(t.name)) ||
      (t.kind !== 'regular' && o.kind === t.kind && o.year === t.year && o.seasonId === t.seasonId)) add('tournament', 'Potential duplicate event import; resolve before approval.');
  }
  if (!values.results.length) add('results', 'Require tournament results.');
  const rows = new Set<string>(); const ids = new Set<string>(); const unresolvedNames = new Set<string>();
  values.results.forEach((r, i) => {
    const path = `results.${i}`;
    if (!nonempty(r.rowId) || rows.has(r.rowId)) add(`${path}.rowId`, 'Require unique row IDs.'); rows.add(r.rowId);
    if (!nonempty(r.importedName)) add(`${path}.importedName`, 'Require the source player name.');
    if (!nonempty(r.playerId) || !context.players.some(p => p.playerId === r.playerId)) add(`${path}.playerId`, 'Resolve the player to a registry ID.');
    if (r.playerId && ids.has(r.playerId)) add(`${path}.playerId`, 'Duplicate player entry.'); if (r.playerId) ids.add(r.playerId);
    if (!r.playerId) { const name = normalizeName(r.importedName); if (unresolvedNames.has(name)) add(path, 'Potential duplicate unresolved player.'); unresolvedNames.add(name); }
    for (const key of ['wins', 'losses', 'draws'] as const) if (!count(r[key])) add(`${path}.${key}`, 'Require a nonnegative safe integer.');
    if (count(r.wins) && count(r.losses) && count(r.draws) && count(t.scheduledRounds, 1) &&
      (r.wins > t.scheduledRounds || r.draws > t.scheduledRounds - r.wins || r.losses > t.scheduledRounds - r.wins - r.draws)) add(path, 'Record exceeds scheduled rounds.');
  });
  if (t.kind !== 'regular') {
    try { calculateChampionshipPoints(championship(values)); } catch (error) { add('results', error instanceof Error ? error.message : 'Invalid championship'); }
  }
  return issues;
}
export function markReady(draft: ImportDraft, context: ReviewContext): ImportDraft {
  if (draft.state !== 'draft' || validateImport(draft, context).length) throw new Error('Only a valid draft can be ready for approval');
  return snapshot({ ...draft, state: 'ready for approval' });
}
export function decideImport(draft: ImportDraft, action: 'approved' | 'rejected', reviewer: string, at: string, reason: string, context: ReviewContext): ImportDraft {
  if (!nonempty(reviewer) || !nonempty(reason) || !Number.isFinite(Date.parse(at))) throw new Error('Require reviewer, timestamp, and reason');
  if (action === 'approved' ? draft.state !== 'ready for approval' || validateImport(draft, context).length > 0 : !['draft', 'ready for approval'].includes(draft.state)) throw new Error('Invalid approval transition');
  return snapshot({ ...draft, state: action, decision: { reviewer, at, reason } });
}
/** This boundary admits approved records only; no draft or rejected record reaches scoring. */
export function approvedStandingsInput(imports: readonly ImportDraft[], context: Omit<ReviewContext, 'otherImports'>): StandingsInput {
  const approved = imports.filter(d => d.state === 'approved');
  const regularEvents: RegularEvent[] = []; const championships: Championship[] = [];
  for (const [index, d] of approved.entries()) {
    if (!d.decision || validateImport(d, { ...context, otherImports: approved.filter((_, otherIndex) => otherIndex !== index) }).length) throw new Error('Invalid or duplicate approved import');
    const v = effectiveValues(d); const t = v.tournament;
    if (t.kind === 'regular') regularEvents.push({ eventId: t.eventId, year: t.year, seasonId: t.seasonId!, results: v.results.map(r => ({ playerId: r.playerId!, wins: r.wins!, draws: r.draws!, scheduledRounds: t.scheduledRounds! })) });
    else championships.push(championship(v));
  }
  return { year: context.year, seasonIds: context.seasonIds, players: context.players.map(p => ({ playerId: p.playerId, name: p.displayName })), regularEvents, championships };
}
export function importStandings(imports: readonly ImportDraft[], context: Omit<ReviewContext, 'otherImports'>) {
  return calculateStandings(approvedStandingsInput(imports, context));
}
