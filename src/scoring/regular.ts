/** Official aggregate results only; byes and intentional draws need no adjustment. */
export interface RegularEventRecord {
  readonly wins: number;
  readonly draws: number;
  readonly scheduledRounds: number;
}

export interface SeasonalRegularResult extends RegularEventRecord {
  readonly eventId: string;
}

export const SEASON_COUNTED_RESULTS = 8;
export const SEASON_MINIMUM_EVENTS = 6;
export const ANNUAL_MINIMUM_EVENTS = 20;

function validateCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

/** Returns unrounded points. Scheduled rounds remain the denominator after a drop. */
export function calculateRegularEventPoints(record: RegularEventRecord): number {
  const { wins, draws, scheduledRounds } = record;
  validateCount(wins, 'wins');
  validateCount(draws, 'draws');
  validateCount(scheduledRounds, 'scheduledRounds');
  if (scheduledRounds === 0 || wins > scheduledRounds || draws > scheduledRounds - wins) {
    throw new RangeError('Require positive scheduled rounds and wins + draws <= scheduled rounds');
  }
  return (10 * (3 * wins + draws)) / (3 * scheduledRounds);
}

/** Attendance eligibility for cumulative titles only, never tournament admission. */
export function getCumulativeTitleEligibility(regularEventCount: number) {
  validateCount(regularEventCount, 'regularEventCount');
  return {
    seasonal: regularEventCount >= SEASON_MINIMUM_EVENTS,
    annual: regularEventCount >= ANNUAL_MINIMUM_EVENTS,
  };
}

/** Caller supplies distinct regular events for one player in one season. No ranking or filtering. */
export function aggregateSeasonRegularResults(results: readonly SeasonalRegularResult[]) {
  const seen = new Set<string>();
  const scoredResults = results.map((result) => {
    if (typeof result.eventId !== 'string' || result.eventId.trim() === '' || seen.has(result.eventId)) {
      throw new Error('Require a non-empty, unique eventId for each regular result');
    }
    seen.add(result.eventId);
    return { ...result, points: calculateRegularEventPoints(result) };
  });
  const byPoints = [...scoredResults].sort((a, b) => b.points - a.points);
  const countedResults = byPoints.slice(0, SEASON_COUNTED_RESULTS);
  return {
    regularEventCount: results.length,
    pointsEarned: scoredResults.reduce((total, result) => total + result.points, 0),
    seasonalPoints: countedResults.reduce((total, result) => total + result.points, 0),
    eligibleForSeasonalCumulativeTitle: getCumulativeTitleEligibility(results.length).seasonal,
    scoredResults,
    countedResults,
    excludedResults: byPoints.slice(SEASON_COUNTED_RESULTS),
  };
}
