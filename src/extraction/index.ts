/** Provider contract only. Production providers belong behind an authenticated server endpoint. */
export type Evidence<T> = { value: T | null; status: 'observed' | 'suggested' | 'missing'; sources: string[]; warnings: string[] };
export const metadataKeys = ['name', 'eventId', 'sourceKey', 'date', 'time', 'timeZone', 'offset', 'year', 'seasonId', 'kind', 'scheduledRounds'] as const;
export const rowKeys = ['importedName', 'wins', 'losses', 'draws', 'finalPosition'] as const;
export type MetadataKey = typeof metadataKeys[number];
export type RowKey = typeof rowKeys[number];
export interface ExtractionReport {
  version: 1;
  provider: string;
  fictional: boolean;
  warnings: string[];
  tournament: Record<MetadataKey, Evidence<string | number>>;
  results: { rowId: string; fields: Record<RowKey, Evidence<string | number>> }[];
}
export interface SourceImage { id: string; file: File }
export interface ExtractionProvider {
  extract(images: readonly SourceImage[], signal?: AbortSignal): Promise<unknown>;
}
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 8;
export function validateImageFiles(files: readonly Pick<File, 'name' | 'type' | 'size'>[]): void {
  if (!files.length || files.length > MAX_IMAGES) throw new Error('Choose between 1 and 8 images.');
  for (const f of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) throw new Error(`${f.name}: use JPEG, PNG or WebP (convert HEIC first).`);
    if (f.size <= 0 || f.size > MAX_IMAGE_BYTES) throw new Error(`${f.name}: images must be nonempty and at most 10 MiB.`);
  }
}
/** Strict bounded runtime parsing; provider output and text are untrusted data. */
export function parseExtraction(input: unknown, sourceIds: readonly string[]): ExtractionReport {
  const fail = (): never => { throw new Error('Invalid extraction response. Retry or review the provider integration.'); };
  const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
  const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 2000;
  const texts = (v: unknown): string[] => Array.isArray(v) && v.length <= 100 && v.every(text) ? [...v] : fail();
  const evidence = (v: unknown, numeric: boolean): Evidence<string | number> => {
    const e = object(v);
    if (!['observed', 'suggested', 'missing'].includes(e.status as string)) fail();
    if (e.status === 'missing' ? e.value !== null : e.value === null) fail();
    if (e.value !== null && (numeric ? typeof e.value !== 'number' || !Number.isSafeInteger(e.value) || e.value < 0 : !text(e.value) || !(e.value as string).trim())) fail();
    const sources = texts(e.sources);
    if (new Set(sources).size !== sources.length || sources.some(s => !sourceIds.includes(s)) || (e.status === 'observed' && !sources.length)) fail();
    return { value: e.value as string | number | null, status: e.status as Evidence<never>['status'], sources, warnings: texts(e.warnings) };
  };
  const r = object(input);
  if (r.version !== 1 || !text(r.provider) || !r.provider.trim() || typeof r.fictional !== 'boolean') fail();
  const t = object(r.tournament);
  const tournament = Object.fromEntries(metadataKeys.map(k => [k, evidence(t[k], ['year', 'scheduledRounds'].includes(k))])) as ExtractionReport['tournament'];
  if (tournament.kind.value !== null && !['regular', 'seasonal', 'annual'].includes(String(tournament.kind.value))) fail();
  if (!Array.isArray(r.results) || !r.results.length || r.results.length > 1000) fail();
  const ids = new Set<string>();
  const results = (r.results as unknown[]).map(v => {
    const row = object(v); if (!text(row.rowId) || !row.rowId.trim() || ids.has(row.rowId)) fail();
    const rowId = row.rowId as string; ids.add(rowId); const fields = object(row.fields);
    return { rowId, fields: Object.fromEntries(rowKeys.map(k => [k, evidence(fields[k], k !== 'importedName')])) as ExtractionReport['results'][number]['fields'] };
  });
  return { version: 1, provider: r.provider as string, fictional: r.fictional as boolean, warnings: texts(r.warnings), tournament, results };
}
export async function extractImages(provider: ExtractionProvider, images: readonly SourceImage[], signal?: AbortSignal) {
  validateImageFiles(images.map(i => i.file));
  if (new Set(images.map(i => i.id)).size !== images.length || images.some(i => !i.id.trim())) throw new Error('Require unique image IDs.');
  return parseExtraction(await provider.extract(images, signal), images.map(i => i.id));
}

/** Fixed invented output, never OCR and never a reading of the supplied photograph. */
export function mockProvider(fail = false): ExtractionProvider {
  return { async extract(images, signal) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 400);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Extraction cancelled.')); }, { once: true });
    });
    if (signal?.aborted) throw new Error('Extraction cancelled.');
    if (fail) throw new Error('Simulated provider failure. Disable failure simulation and retry.');
    const field = (value: string | number | null): Evidence<string | number> => ({ value, status: value === null ? 'missing' : 'suggested', sources: images.map(i => i.id), warnings: ['Fictional fixture; not read from your image.'] });
    const values = { name: 'Fictional mobile event', eventId: 'fictional-mobile', sourceKey: 'fictional:mobile', date: '2027-02-01', time: '18:00', timeZone: 'America/Detroit', offset: null, year: 2027, seasonId: 's1', kind: 'regular', scheduledRounds: 3 };
    return { version: 1, provider: 'Fictional mock — no AI or OCR', fictional: true, warnings: ['All output is invented. Confirm every required field against a trusted source. Multiple images do not imply complete tournament coverage.'],
      tournament: Object.fromEntries(metadataKeys.map(k => [k, field(values[k])])),
      results: [
        { rowId: 'row-1', fields: { importedName: field('Sample Copper'), wins: field(3), losses: field(0), draws: field(0), finalPosition: field(null) } },
        { rowId: 'row-2', fields: { importedName: field('Sample Indigo'), wins: field(0), losses: field(3), draws: field(null), finalPosition: field(null) } },
      ] };
  } };
}
