export type ChampionshipKind = 'seasonal' | 'annual';

export interface ChampionshipRules {
  readonly maximumPoints: Readonly<Record<ChampionshipKind, number>>;
  readonly matchWeight: number;
  readonly placementWeight: number;
}

/** Explicit yearly rules: never silently carry a season's rules into another year. */
export const CHAMPIONSHIP_RULES: Readonly<Record<number, ChampionshipRules>> = Object.freeze({
  2027: Object.freeze({
    maximumPoints: Object.freeze({ seasonal: 40, annual: 120 }),
    matchWeight: 0.75,
    placementWeight: 0.25,
  }),
});

export interface ChampionshipParticipant {
  readonly playerId: string;
  /** Official Swiss totals, including byes and intentional draws as recorded. */
  readonly swiss: {
    readonly wins: number;
    readonly draws: number;
    readonly losses: number;
  };
  /** Competition rank: two players tied third both use 3; the next rank is 5. */
  readonly finalPosition: number;
}

export interface ChampionshipInput {
  readonly year: number;
  readonly kind: ChampionshipKind;
  readonly scheduledSwissRounds: number;
  /** Complete official standings, including drops. No inferred finishing positions. */
  readonly participants: readonly ChampionshipParticipant[];
}

function count(value: number, name: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
  }
}

/** Pure calculation; validates the entire field before awarding any points.
 * Fewer than two participants is rejected (no championship points awarded).
 * Elimination records are deliberately absent from the input.
 */
export function calculateChampionshipPoints(input: ChampionshipInput) {
  count(input.year, 'year', 1);
  if (!Object.hasOwn(CHAMPIONSHIP_RULES, input.year)) {
    throw new RangeError('No approved championship rules for this year');
  }
  const rules = CHAMPIONSHIP_RULES[input.year];
  if (!Object.hasOwn(rules.maximumPoints, input.kind)) {
    throw new RangeError('Unknown championship kind');
  }
  count(input.scheduledSwissRounds, 'scheduledSwissRounds', 1);
  const n = input.participants.length;
  count(n, 'participants', 2);
  const ids = new Set<string>();
  const groups = new Map<number, number>();
  for (const participant of input.participants) {
    if (typeof participant.playerId !== 'string' || !participant.playerId.trim() || ids.has(participant.playerId)) {
      throw new RangeError('Require unique, nonempty player IDs');
    }
    ids.add(participant.playerId);
    const { wins, draws, losses } = participant.swiss;
    count(wins, 'Swiss wins');
    count(draws, 'Swiss draws');
    count(losses, 'Swiss losses');
    if (wins > input.scheduledSwissRounds ||
        draws > input.scheduledSwissRounds - wins ||
        losses > input.scheduledSwissRounds - wins - draws) {
      throw new RangeError('Swiss record exceeds scheduled Swiss rounds');
    }
    count(participant.finalPosition, 'finalPosition', 1);
    if (participant.finalPosition > n) throw new RangeError('Position exceeds participant count');
    groups.set(participant.finalPosition, (groups.get(participant.finalPosition) ?? 0) + 1);
  }
  let nextPosition = 1;
  for (const [position, size] of [...groups].sort(([a], [b]) => a - b)) {
    if (position !== nextPosition) {
      throw new RangeError('Inconsistent tie groups: positions must cover the complete field without gaps or overlaps');
    }
    nextPosition += size;
  }
  const maximum = rules.maximumPoints[input.kind];
  return input.participants.map((participant) => {
    const { wins, draws } = participant.swiss;
    const matchPoints = maximum * rules.matchWeight *
      ((wins + draws / 3) / input.scheduledSwissRounds);
    // The placement function is linear, so its average equals its value at the
    // average occupied position. Avoid rounding components or totals.
    const averagePosition = participant.finalPosition + (groups.get(participant.finalPosition)! - 1) / 2;
    const placementPoints = maximum * rules.placementWeight * ((n - averagePosition) / (n - 1));
    return { playerId: participant.playerId, matchPoints, placementPoints, totalPoints: matchPoints + placementPoints };
  });
}

/** Presentation only; never feed this string back into cumulative scoring. */
export function formatChampionshipPoints(points: number): string {
  if (!Number.isFinite(points) || points < 0) throw new RangeError('Require finite nonnegative points');
  return points.toFixed(2);
}
