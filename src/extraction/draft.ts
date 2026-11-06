import { createImport, correctImport } from '../results/index.ts';
import type { EventKind, ImportDraft, ImportValues } from '../results/index.ts';
import type { ExtractionReport } from './index.ts';
import { initialExtractionAudit } from '../results/extractionEvidence.ts';
/** Missing fields stay empty/null. A missing kind/year uses invalid sentinels until corrected. */
export function extractionDraft(id: string, report: ExtractionReport): ImportDraft {
  const t = report.tournament;
  const str = (key: keyof typeof t) => t[key].value === null ? '' : String(t[key].value);
  const num = (key: keyof typeof t) => t[key].value as number | null;
  const values: ImportValues = {
    tournament: { eventId: str('eventId'), sourceKey: str('sourceKey'), name: str('name'), date: str('date'), start: { date: str('date'), time: str('time'), timeZone: str('timeZone'), ...(str('offset') ? { offset: str('offset') } : {}) }, year: num('year') ?? 0, seasonId: str('seasonId') || undefined, kind: str('kind') as EventKind, scheduledRounds: num('scheduledRounds') },
    results: report.results.map(r => ({ rowId: r.rowId, importedName: String(r.fields.importedName.value ?? ''), playerId: null, wins: r.fields.wins.value as number | null, losses: r.fields.losses.value as number | null, draws: r.fields.draws.value as number | null, finalPosition: r.fields.finalPosition.value as number | null })),
  };
  return createImport(id, { ...values, extraction: initialExtractionAudit(values, report) });
}
export function correctExtraction(draft: ImportDraft, values: ImportValues, reason: string, confirm?: string): ImportDraft {
  return correctImport(draft, values, reason, { confirmExtraction: confirm === undefined ? [] : [confirm] });
}
