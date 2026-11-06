import { createImport, correctImport, effectiveValues } from '../results/index.ts';
import type { EventKind, ImportDraft, ImportValues } from '../results/index.ts';
import type { ExtractionReport } from './index.ts';
import { metadataKeys, rowKeys } from './index.ts';
/** Missing fields stay empty/null. A missing kind/year uses invalid sentinels until corrected. */
export function extractionDraft(id: string, report: ExtractionReport): ImportDraft {
  const t = report.tournament;
  const str = (key: keyof typeof t) => t[key].value === null ? '' : String(t[key].value);
  const num = (key: keyof typeof t) => t[key].value as number | null;
  const required = metadataKeys.filter(k => k !== 'offset' || t.offset.value !== null).map(k => `tournament.${k}`);
  const confirmed = required.filter(p => t[p.slice(11) as keyof typeof t].status === 'observed');
  for (const row of report.results) for (const k of rowKeys) {
    const path = `${row.rowId}.${k}`; required.push(path);
    if (row.fields[k].status === 'observed') confirmed.push(path);
  }
  return createImport(id, {
    tournament: { eventId: str('eventId'), sourceKey: str('sourceKey'), name: str('name'), date: str('date'), start: { date: str('date'), time: str('time'), timeZone: str('timeZone'), ...(str('offset') ? { offset: str('offset') } : {}) }, year: num('year') ?? 0, seasonId: str('seasonId') || undefined, kind: str('kind') as EventKind, scheduledRounds: num('scheduledRounds') },
    results: report.results.map(r => ({ rowId: r.rowId, importedName: String(r.fields.importedName.value ?? ''), playerId: null, wins: r.fields.wins.value as number | null, losses: r.fields.losses.value as number | null, draws: r.fields.draws.value as number | null, finalPosition: r.fields.finalPosition.value as number | null })),
    extraction: { sourceReport: JSON.stringify(report), required, confirmed },
  });
}
export function correctExtraction(draft: ImportDraft, values: ImportValues, reason: string, confirm?: string): ImportDraft {
  const audit = effectiveValues(draft).extraction;
  if (!audit) throw new Error('Missing extraction audit.');
  return correctImport(draft, { ...values, extraction: { ...audit, confirmed: confirm ? [...new Set([...audit.confirmed, confirm])] : audit.confirmed } }, reason);
}
