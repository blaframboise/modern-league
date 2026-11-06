import { aggregateSeasonRegularResults, getCumulativeTitleEligibility } from './regular.ts';
import type { RegularEventRecord } from './regular.ts';
import { calculateChampionshipPoints, CHAMPIONSHIP_RULES } from './championship.ts';
import type { ChampionshipInput } from './championship.ts';

export interface Player { readonly playerId: string; readonly name: string }
export interface RegularEvent {
  readonly eventId: string;
  readonly year: number;
  readonly seasonId: string;
  readonly results: readonly (RegularEventRecord & { readonly playerId: string })[];
}
export interface Championship extends ChampionshipInput {
  readonly eventId: string;
  /** Required for seasonal championships; absent for annual championships. */
  readonly seasonId?: string;
}
export interface StandingsInput {
  readonly year: number;
  /** Exactly four explicit identifiers. Dates and season boundaries belong to the caller. */
  readonly seasonIds: readonly string[];
  readonly players: readonly Player[];
  readonly regularEvents: readonly RegularEvent[];
  readonly championships: readonly Championship[];
}
export interface Standing extends Player {
  readonly rank: number;
  readonly regularPoints: number;
  readonly championshipPoints: number;
  readonly totalPoints: number;
  readonly regularEventCount: number;
  readonly perfectFinishes: number;
  /** Null for no appearances; compares as zero (no earned match points). */
  readonly regularMatchPointPercentage: number | null;
  readonly eligibleForCumulativeTitle: boolean;
}
export interface Snapshot {
  readonly standings: readonly Standing[];
  readonly cumulativeTitleRecipientIds: readonly string[];
}
type Unranked = Omit<Standing, 'rank'>;
/** Eligibility never participates in comparison. No hidden name/ID tiebreaker. */
export function compareStandings(a: Unranked, b: Unranked): number {
  return b.totalPoints - a.totalPoints || b.championshipPoints - a.championshipPoints ||
    b.perfectFinishes - a.perfectFinishes ||
    (b.regularMatchPointPercentage ?? 0) - (a.regularMatchPointPercentage ?? 0);
}
function rank(rows: readonly Unranked[]): Snapshot {
  const sorted = [...rows].sort(compareStandings);
  const standings: Standing[] = [];
  for (const [index, row] of sorted.entries()) {
    standings.push({ ...row, rank: index && compareStandings(sorted[index - 1], row) === 0
      ? standings[index - 1].rank : index + 1 });
  }
  const firstEligible = standings.find(row => row.eligibleForCumulativeTitle);
  return { standings, cumulativeTitleRecipientIds: firstEligible
    ? standings.filter(row => row.eligibleForCumulativeTitle && row.rank === firstEligible.rank).map(row => row.playerId) : [] };
}
function id(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new RangeError(`Require nonempty ${label}`);
}

/** Pure, complete validation before aggregation. Missing championships contribute zero.
 * Title recipient lists identify the leaders of each snapshot; final conferment requires
 * an externally confirmed completed period. No tournament admission policy is inferred.
 */
export function calculateStandings(input: StandingsInput) {
  if (!Number.isSafeInteger(input.year) || !Object.hasOwn(CHAMPIONSHIP_RULES, input.year)) throw new RangeError('Unconfigured year');
  const seasons = new Set(input.seasonIds);
  if (input.seasonIds.length !== 4 || seasons.size !== 4) throw new RangeError('Require four unique season IDs');
  input.seasonIds.forEach(value => id(value, 'season ID'));
  const players = new Set<string>();
  for (const player of input.players) {
    id(player.playerId, 'player ID'); id(player.name, 'player name');
    if (players.has(player.playerId)) throw new RangeError('Duplicate player ID');
    players.add(player.playerId);
  }
  const eventIds = new Set<string>();
  function event(eventId: string, year: number, seasonId?: string) {
    id(eventId, 'event ID');
    if (eventIds.has(eventId)) throw new RangeError('Duplicate event ID');
    eventIds.add(eventId);
    if (year !== input.year || (seasonId !== undefined && !seasons.has(seasonId))) {
      throw new RangeError('Inconsistent year or season ID');
    }
  }
  for (const regular of input.regularEvents) {
    event(regular.eventId, regular.year, regular.seasonId);
    if (!seasons.has(regular.seasonId)) throw new RangeError('Unknown regular season');
    const seen = new Set<string>();
    for (const result of regular.results) {
      if (!players.has(result.playerId) || seen.has(result.playerId)) throw new RangeError('Unknown or duplicate player result');
      seen.add(result.playerId);
    }
  }
  const championshipSlots = new Set<string>();
  const scored = input.championships.map(championship => {
    event(championship.eventId, championship.year, championship.seasonId);
    if ((championship.kind === 'seasonal' && !seasons.has(championship.seasonId!)) ||
        (championship.kind === 'annual' && championship.seasonId !== undefined)) {
      throw new RangeError('Inconsistent championship season ID');
    }
    const slot = championship.kind === 'annual' ? 'annual' : `season:${championship.seasonId}`;
    if (championshipSlots.has(slot)) throw new RangeError('Duplicate championship for period');
    championshipSlots.add(slot);
    if (championship.participants.some(player => !players.has(player.playerId))) throw new RangeError('Unknown championship player');
    return { championship, points: calculateChampionshipPoints(championship) };
  });
  function championshipPoints(playerId: string, seasonId?: string): number {
    return scored.filter(({ championship }) => seasonId === undefined || championship.seasonId === seasonId)
      .reduce((sum, result) => sum + (result.points.find(player => player.playerId === playerId)?.totalPoints ?? 0), 0);
  }
  function stats(playerId: string, seasonId?: string) {
    const results = input.regularEvents.filter(event => seasonId === undefined || event.seasonId === seasonId)
      .flatMap(event => event.results.filter(result => result.playerId === playerId).map(result => ({ ...result, eventId: event.eventId })));
    const earned = results.reduce((sum, result) => sum + 3 * result.wins + result.draws, 0);
    const possible = results.reduce((sum, result) => sum + 3 * result.scheduledRounds, 0);
    return { regularEventCount: results.length,
      perfectFinishes: results.filter(result => result.wins === result.scheduledRounds && result.draws === 0).length,
      regularMatchPointPercentage: possible ? earned / possible : null };
  }
  const seasonalRows = input.seasonIds.map(seasonId => ({ seasonId, rows: input.players.map(player => {
    const results = input.regularEvents.filter(event => event.seasonId === seasonId).flatMap(event =>
      event.results.filter(result => result.playerId === player.playerId).map(result => ({ ...result, eventId: event.eventId })));
    const regular = aggregateSeasonRegularResults(results);
    const points = championshipPoints(player.playerId, seasonId);
    return { ...player, ...stats(player.playerId, seasonId), regularPoints: regular.seasonalPoints,
      championshipPoints: points, totalPoints: regular.seasonalPoints + points,
      eligibleForCumulativeTitle: regular.eligibleForSeasonalCumulativeTitle };
  }) }));
  const annual = rank(input.players.map(player => {
    const regularPoints = seasonalRows.reduce((sum, season) => sum + season.rows.find(row => row.playerId === player.playerId)!.regularPoints, 0);
    const statistics = stats(player.playerId);
    const points = championshipPoints(player.playerId);
    return { ...player, ...statistics, regularPoints, championshipPoints: points, totalPoints: regularPoints + points,
      eligibleForCumulativeTitle: getCumulativeTitleEligibility(statistics.regularEventCount).annual };
  }));
  function tournamentWinnerIds(seasonId?: string) {
    return scored.filter(({ championship }) => seasonId === undefined ? championship.kind === 'annual' : championship.seasonId === seasonId)
      .flatMap(({ championship }) => championship.participants.filter(player => player.finalPosition === 1).map(player => player.playerId));
  }
  return { year: input.year, seasons: seasonalRows.map(({ seasonId, rows }) => ({ seasonId,
    beforeChampionship: rank(rows.map(row => ({ ...row, championshipPoints: 0, totalPoints: row.regularPoints }))),
    afterChampionship: rank(rows), tournamentChampionIds: tournamentWinnerIds(seasonId),
    championshipRecorded: scored.some(({ championship }) => championship.seasonId === seasonId),
  })), annual, annualTournamentChampionIds: tournamentWinnerIds(),
  annualChampionshipRecorded: scored.some(({ championship }) => championship.kind === 'annual') };
}
