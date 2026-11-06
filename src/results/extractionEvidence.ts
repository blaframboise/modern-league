import { metadataKeys, parseExtraction, rowKeys } from '../extraction/index.ts';
import type { Evidence, ExtractionReport } from '../extraction/index.ts';
import type { ImportDraft, ImportValues, Issue } from './index.ts';

export interface FieldConfirmation { readonly path: string; readonly value: string | number }
export interface ExtractionAudit {
  readonly sourceReport: string;
  readonly required: readonly string[];
  readonly confirmed: readonly FieldConfirmation[];
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function fail(): never { throw new Error('Invalid extraction confirmation integrity.'); }
/** Exact allowlist: no property traversal, registry IDs, or arbitrary/nonexistent paths. */
function fields(values: ImportValues): Map<string, string | number | null> {
  const t = values.tournament;
  const entries: [string, string | number | null][] = metadataKeys.map(k => [
    `tournament.${k}`, (k === 'time' || k === 'timeZone' || k === 'offset' ? t.start?.[k] : t[k]) ?? null,
  ]);
  for (const row of values.results) for (const key of rowKeys) entries.push([`${row.rowId}.${key}`, row[key]]);
  if (new Set(entries.map(([path]) => path)).size !== entries.length) fail();
  return new Map(entries);
}
function reviewable(path: string, value: unknown): value is string | number {
  const key = path.slice(path.lastIndexOf('.') + 1);
  if (['wins', 'losses', 'draws', 'finalPosition', 'year', 'scheduledRounds'].includes(key)) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= (['wins', 'losses', 'draws'].includes(key) ? 0 : 1);
  }
  return typeof value === 'string' && !!value.trim();
}
export function extractionFieldRequired(values: ImportValues, path: string): boolean {
  if (path === 'tournament.offset') return !!values.tournament.start?.offset;
  if (path === 'tournament.seasonId') return values.tournament.kind !== 'annual';
  if (path.endsWith('.finalPosition')) return values.tournament.kind !== 'regular';
  return true;
}
export function canConfirmExtractionField(values: ImportValues, path: string): boolean {
  return reviewable(path, fields(values).get(path));
}
export function hasCurrentConfirmation(values: ImportValues, path: string): boolean {
  const value = fields(values).get(path);
  return reviewable(path, value) && !!values.extraction?.confirmed.some(c => c.path === path && Object.is(c.value, value));
}
function reportFields(report: ExtractionReport) {
  return new Map<string, Evidence<string | number>>([
    ...metadataKeys.map(k => [`tournament.${k}`, report.tournament[k]] as const),
    ...report.results.flatMap(r => rowKeys.map(k => [`${r.rowId}.${k}`, r.fields[k]] as const)),
  ]);
}
/** Observed source evidence is value-bound too, but never resolves a registry identity. */
export function initialExtractionAudit(values: ImportValues, report: ExtractionReport): ExtractionAudit {
  const current = fields(values);
  const evidence = reportFields(report);
  return {
    sourceReport: JSON.stringify(report), required: [...current.keys()],
    confirmed: [...current].flatMap(([path, value]) => evidence.get(path)?.status === 'observed' && reviewable(path, value) ? [{ path, value }] : []),
  };
}
/** Re-parse stored evidence; immutable originals must agree with the source, not arbitrary attestations. */
function originalAudit(values: ImportValues): ExtractionAudit {
  const audit = values.extraction!;
  const raw = JSON.parse(audit.sourceReport) as ExtractionReport;
  const evidence = reportFields(raw);
  const sources = [...new Set([...evidence.values()].flatMap(e => e.sources))];
  const report = parseExtraction(raw, sources);
  const current = fields(values);
  if (current.size !== evidence.size) fail();
  for (const [path, value] of current) {
    const source = evidence.get(path); if (!source) fail();
    // The adapter uses empty text / invalid year sentinel to keep missing metadata editable.
    const missing = path === 'tournament.year' ? 0 :
      ['name', 'eventId', 'sourceKey', 'date', 'time', 'timeZone', 'kind'].some(k => path === `tournament.${k}`) || path.endsWith('.importedName') ? '' : null;
    if (!Object.is(value, source.value ?? missing)) fail();
  }
  const expected = initialExtractionAudit(values, report);
  if (!equal(audit, expected)) fail();
  return expected;
}
/** Invalidate changed values, then apply only explicit, value-bound actions with a reason. */
export function nextExtractionAudit(original: ImportValues, previous: ImportValues, next: ImportValues, actions: readonly FieldConfirmation[]): ExtractionAudit {
  const source = original.extraction!;
  const before = fields(previous); const after = fields(next);
  // Changing the extracted row set needs a separate source-evidence policy, not silent deletion.
  if (!equal([...after.keys()], source.required) || !equal([...before.keys()], source.required)) fail();
  const confirmed = new Map(previous.extraction!.confirmed.filter(c =>
    before.has(c.path) && Object.is(before.get(c.path), c.value) && Object.is(after.get(c.path), c.value),
  ).map(c => [c.path, c]));
  const seen = new Set<string>();
  for (const action of actions) {
    if (!after.has(action.path) || seen.has(action.path) || !reviewable(action.path, action.value) || !Object.is(after.get(action.path), action.value)) fail();
    seen.add(action.path); confirmed.set(action.path, { path: action.path, value: action.value });
  }
  return { ...source, confirmed: source.required.flatMap(path => confirmed.has(path) ? [confirmed.get(path)!] : []) };
}
/** The generic Phase 6 API cannot accept caller-written audit state. */
export function extractionCorrection(draft: ImportDraft, next: ImportValues, paths: readonly string[]) {
  const previous = draft.corrections.at(-1)?.values ?? draft.original;
  if (!draft.original.extraction) {
    if (next.extraction || paths.length) fail();
    return { values: next };
  }
  if (validateExtractionEvidence(draft, false).length || !equal(previous.extraction, next.extraction)) fail();
  const current = fields(next);
  const actions = paths.map(path => {
    const value = current.get(path);
    if (!current.has(path) || !reviewable(path, value)) fail();
    return { path, value };
  });
  return {
    values: { ...next, extraction: nextExtractionAudit(draft.original, previous, next, actions) },
    extractionConfirmations: actions,
  };
}
/** Replay every documented action, including for approved imports at the scoring boundary. */
export function validateExtractionEvidence(draft: ImportDraft, requireResolved = true): Issue[] {
  const issues: Issue[] = [];
  try {
    if (!draft.original.extraction) {
      if (draft.corrections.some(c => c.values.extraction || c.extractionConfirmations?.length)) fail();
      return issues;
    }
    let previous = { ...draft.original, extraction: originalAudit(draft.original) };
    for (const correction of draft.corrections) {
      if (!correction.reason.trim()) fail();
      const expected = nextExtractionAudit(draft.original, previous, correction.values, correction.extractionConfirmations ?? []);
      if (!equal(correction.values.extraction, expected)) fail();
      previous = { ...correction.values, extraction: expected };
    }
    if (requireResolved) for (const path of previous.extraction.required) {
      if (extractionFieldRequired(previous, path) && !hasCurrentConfirmation(previous, path)) issues.push({ path: `extraction.${path}`, message: 'Confirm or correct the current field value with a documented reason.' });
    }
  } catch {
    issues.push({ path: 'extraction', message: 'Invalid extraction evidence or confirmation history; source values and documented confirmation actions must remain intact.' });
  }
  return issues;
}
