/** Fictional demonstration only. Never load these records into official standings. */
import { createImport } from './index.ts';
import type { EventKind, ReviewContext } from './index.ts';
export const demoContext: ReviewContext = {
  year: 2027, seasonIds: ['s1', 's2', 's3', 's4'], otherImports: [],
  players: [
    { playerId: 'demo-001', displayName: 'Sample Copper', aliases: ['Copper Sample'] },
    { playerId: 'demo-002', displayName: 'Sample Indigo', aliases: [] },
    { playerId: 'demo-003', displayName: 'Sample Copper', aliases: [] },
  ],
};
export function demoImport(kind: EventKind = 'regular') {
  return createImport(`demo-${kind}`, {
    tournament: { eventId: `demo-event-${kind}`, sourceKey: `fictional:${kind}`, name: `Fictional ${kind} event`, date: '2027-02-01', year: 2027,
      ...(kind !== 'annual' ? { seasonId: 's1' } : {}), kind, scheduledRounds: 3 },
    results: [
      { rowId: 'row-1', importedName: 'Sample Copper', playerId: null, wins: 3, losses: 0, draws: 0, finalPosition: 1 },
      { rowId: 'row-2', importedName: 'Sample Indigo', playerId: 'demo-002', wins: 0, losses: 3, draws: null, finalPosition: 2 },
    ],
  });
}
