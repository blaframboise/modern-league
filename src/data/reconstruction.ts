import { createImport } from '../results/index.ts';
import type { Correction, ImportDraft, ImportValues } from '../results/index.ts';
import { validateExtractionEvidence } from '../results/extractionEvidence.ts';
import type { ExtractionAudit, FieldConfirmation } from '../results/extractionEvidence.ts';

function invalid(): never { throw new Error('Invalid persisted import history. Reload and investigate; no revisions were discarded.'); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(record, key)) || Object.keys(record).some(key => ![...required, ...optional].includes(key))) return invalid();
  return record;
}
function text(value: unknown): string { if (typeof value !== 'string') return invalid(); return value; }
function integer(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) return invalid(); return value; }
function nullableCount(value: unknown): number | null { return value === null ? null : integer(value); }
function array<T>(value: unknown, parse: (item: unknown) => T): T[] { if (!Array.isArray(value)) return invalid(); return value.map(parse); }
function confirmation(value: unknown): FieldConfirmation {
  const c = object(value, ['path', 'value']);
  if (typeof c.value !== 'string' && typeof c.value !== 'number') return invalid();
  if (typeof c.value === 'number' && !Number.isFinite(c.value)) return invalid();
  return { path: text(c.path), value: c.value };
}
function audit(value: unknown): ExtractionAudit {
  const a = object(value, ['sourceReport', 'required', 'confirmed']);
  // Rebuild the domain's property order: PostgreSQL jsonb does not retain key order.
  return { sourceReport: text(a.sourceReport), required: array(a.required, text), confirmed: array(a.confirmed, confirmation) };
}
/** Shape validation permits editable missing/invalid domain values, never malformed structure. */
export function parseImportValues(value: unknown): ImportValues {
  const v = object(value, ['tournament', 'results'], ['extraction']);
  const t = object(v.tournament, ['eventId', 'sourceKey', 'name', 'date', 'start', 'year', 'kind', 'scheduledRounds'], ['seasonId']);
  const start = t.start === null ? null : (() => {
    const s = object(t.start, ['date', 'time'], ['timeZone', 'offset']);
    return { date: text(s.date), time: text(s.time), ...(s.timeZone === undefined ? {} : { timeZone: text(s.timeZone) }), ...(s.offset === undefined ? {} : { offset: text(s.offset) }) };
  })();
  const kind = text(t.kind);
  // Empty kind is the extraction adapter's documented missing-field sentinel.
  if (!['', 'regular', 'seasonal', 'annual'].includes(kind)) return invalid();
  return {
    tournament: { eventId: text(t.eventId), sourceKey: text(t.sourceKey), name: text(t.name), date: text(t.date), start,
      year: integer(t.year), kind: kind as ImportValues['tournament']['kind'], scheduledRounds: nullableCount(t.scheduledRounds),
      ...(t.seasonId === undefined ? {} : { seasonId: text(t.seasonId) }) },
    results: array(v.results, item => {
      const r = object(item, ['rowId', 'importedName', 'playerId', 'wins', 'losses', 'draws', 'finalPosition']);
      return { rowId: text(r.rowId), importedName: text(r.importedName), playerId: r.playerId === null ? null : text(r.playerId),
        wins: nullableCount(r.wins), losses: nullableCount(r.losses), draws: nullableCount(r.draws), finalPosition: nullableCount(r.finalPosition) };
    }),
    ...(v.extraction === undefined ? {} : { extraction: audit(v.extraction) }),
  };
}
export function parseCorrection(value: unknown): Correction {
  const c = object(value, ['values', 'reason'], ['extractionConfirmations']);
  const reason = text(c.reason);
  if (!reason.trim()) return invalid();
  return { values: parseImportValues(c.values), reason,
    ...(c.extractionConfirmations === undefined ? {} : { extractionConfirmations: array(c.extractionConfirmations, confirmation) }) };
}
export interface StoredOriginal { readonly id: string; readonly original: unknown }
export interface StoredCorrection { readonly id: string; readonly draft_id: string; readonly revision: number; readonly snapshot: unknown; readonly reason: string }
/** expectedRevision must come from an exact database count, not the returned page length. */
export function reconstructImportDraft(original: StoredOriginal, rows: readonly StoredCorrection[], expectedRevision: number): ImportDraft {
  if (!original.id?.trim() || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || rows.length !== expectedRevision) return invalid();
  const initial = createImport(original.id, parseImportValues(original.original));
  const ids = new Set<string>();
  const corrections = rows.map((row, index) => {
    if (!row.id?.trim() || ids.has(row.id) || row.draft_id !== original.id || row.revision !== index + 1) return invalid();
    ids.add(row.id);
    const correction = parseCorrection(row.snapshot);
    if (correction.reason !== row.reason) return invalid();
    return correction;
  });
  const draft: ImportDraft = { ...initial, corrections };
  // Replay original evidence and every intermediate value-bound action; unresolved fields
  // remain editable. This does not establish readiness or approval.
  if (validateExtractionEvidence(draft, false).length) return invalid();
  function freeze(value: unknown): void {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  }
  freeze(draft);
  return draft;
}
/** Semantic equality ignores jsonb object-key order, but preserves every array entry/order. */
export function sameHistory(a: unknown, b: unknown): boolean {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
  }
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
