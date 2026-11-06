import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { extractImages, mockProvider } from '../src/extraction/index.ts';
import { extractionDraft } from '../src/extraction/draft.ts';
import { correctImport, effectiveValues } from '../src/results/index.ts';
import type { ImportDraft } from '../src/results/index.ts';
import { demoImport } from '../src/results/demo.ts';
import { reconstructImportDraft, sameHistory } from '../src/data/reconstruction.ts';
import type { StoredCorrection } from '../src/data/reconstruction.ts';
import { leagueRepository } from '../src/data/repository.ts';
import type { Database } from '../src/data/database.ts';

const report = await extractImages(mockProvider(), [{ id: 'source', file: new File(['fictional'], 'source.png', { type: 'image/png' }) }]);
function history() {
  const first = extractionDraft('persisted-draft', report);
  const values = effectiveValues(first);
  const second = correctImport(first, { ...values, tournament: { ...values.tournament, name: 'Confirmed corrected name' } }, 'Reviewed name', { confirmExtraction: ['tournament.name'] });
  const next = effectiveValues(second);
  const third = correctImport(second, { ...next, results: next.results.map((r, i) => i === 1 ? { ...r, draws: 0 } : r) }, 'Confirmed missing draws as zero', { confirmExtraction: ['row-2.draws'] });
  return [first, second, third];
}
function stored(draft: ImportDraft): StoredCorrection[] {
  return draft.corrections.map((snapshot, index) => ({ id: `correction-${index + 1}`, draft_id: draft.importId, revision: index + 1, snapshot: JSON.parse(JSON.stringify(snapshot)), reason: snapshot.reason }));
}
function jsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonb);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => b.localeCompare(a)).map(([k, v]) => [k, jsonb(v)]));
  return value;
}
function reconstruct(draft: ImportDraft, rows = stored(draft), count = draft.corrections.length) {
  return reconstructImportDraft({ id: draft.importId, original: JSON.parse(JSON.stringify(draft.original)) }, rows, count);
}

test('multiple individual corrections reconstruct exactly, including confirmations and immutable original', () => {
  for (const draft of history()) {
    const rows = stored(draft).map(row => ({ ...row, snapshot: jsonb(row.snapshot) }));
    const result = reconstructImportDraft({ id: draft.importId, original: jsonb(draft.original) }, rows, rows.length);
    assert.deepEqual(result, draft);
    assert.ok(Object.isFrozen(result.original));
    assert.ok(Object.isFrozen(result.corrections));
    if (result.corrections.length) assert.ok(Object.isFrozen(result.corrections[0].values));
    assert.ok(!rows.some(row => Object.hasOwn(row.snapshot as object, 'original')));
  }
  const plain = demoImport();
  assert.deepEqual(reconstruct(plain), plain);
});

test('missing, duplicated, reordered, foreign and truncated revisions fail closed', () => {
  const draft = history()[2]; const rows = stored(draft);
  for (const broken of [rows.slice(1), rows.slice(0, 1), [rows[1], rows[0]], [rows[0], rows[0]],
    [rows[0], { ...rows[1], revision: 3 }], [rows[0], { ...rows[1], id: rows[0].id }],
    [rows[0], { ...rows[1], draft_id: 'other-draft' }]]) {
    assert.throws(() => reconstruct(draft, broken), /Invalid persisted/);
  }
  for (const count of [-1, 1.5, NaN, 0, 1, 3]) assert.throws(() => reconstruct(draft, rows, count));
});

test('malformed originals, correction payloads, required fields and reasons are rejected', () => {
  const draft = history()[2];
  for (const original of [null, [], {}, { ...draft.original, results: null }, { ...draft.original, tournament: {} }]) {
    assert.throws(() => reconstructImportDraft({ id: draft.importId, original }, stored(draft), 2));
  }
  const correction = draft.corrections[1];
  for (const snapshot of [null, [], {}, draft, { ...correction, reason: '' }, { ...correction, reason: 5 },
    { ...correction, values: { ...correction.values, results: [{ rowId: 'missing' }] } },
    { ...correction, values: { ...correction.values, tournament: { ...correction.values.tournament, year: '2027' } } },
    { ...correction, extractionConfirmations: [null] }, { ...correction, unknown: true }]) {
    const rows = stored(draft); rows[1] = { ...rows[1], snapshot };
    assert.throws(() => reconstruct(draft, rows));
  }
  const rows = stored(draft); rows[0] = { ...rows[0], reason: 'Altered duplicate reason' };
  assert.throws(() => reconstruct(draft, rows));
});

test('altered confirmation actions and intermediate audit evidence fail replay', () => {
  const draft = history()[2];
  const first = draft.corrections[0];
  for (const snapshot of [
    { ...first, extractionConfirmations: [] },
    { ...first, extractionConfirmations: [{ path: 'tournament.name', value: 'Wrong value' }] },
    { ...first, extractionConfirmations: [{ path: 'row-1.playerId', value: 'demo-001' }] },
    { ...first, extractionConfirmations: [...first.extractionConfirmations!, ...first.extractionConfirmations!] },
    { ...first, values: { ...first.values, extraction: { ...first.values.extraction!, required: [] } } },
    { ...first, values: { ...first.values, extraction: undefined } },
  ]) {
    const rows = stored(draft); rows[0] = { ...rows[0], snapshot };
    assert.throws(() => reconstruct(draft, rows), /Invalid persisted/);
  }
  // Alter an earlier value even though the last snapshot is still valid.
  const rows = stored(draft);
  rows[0] = { ...rows[0], snapshot: { ...first, values: { ...first.values, tournament: { ...first.values.tournament, name: 'Tampered intermediate name' } } } };
  assert.throws(() => reconstruct(draft, rows));
});

test('repository round-trips one original and one correction per revision and rejects stale history', async () => {
  const [first, second, third] = history();
  let original: unknown;
  const rows: StoredCorrection[] = [];
  const writes: Record<string, unknown>[] = [];
  let truncate = false;
  let omitCount = false;
  const client = createClient<Database>('https://example.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const isOriginal = url.pathname.endsWith('/import_drafts');
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)); writes.push(body);
        if (isOriginal) original = jsonb(body.original);
        else rows.push({ ...body, id: `row-${rows.length + 1}`, snapshot: jsonb(body.snapshot) });
      }
      const data = isOriginal ? { id: first.importId, original } : init?.method === 'POST' ? rows.at(-1) : truncate ? rows.slice(0, 1) : rows;
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...(!isOriginal && !omitCount ? { 'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` } : {}) } });
    } },
  });
  const repository = leagueRepository(client);
  await repository.createDraft(first.original);
  assert.deepEqual(await repository.loadDraft(first.importId), first);
  await repository.appendCorrection(first.importId, second);
  await repository.appendCorrection(first.importId, third);
  assert.deepEqual(await repository.loadDraft(first.importId), third);
  assert.equal(writes.length, 3);
  assert.ok(sameHistory(writes[0].original, first.original));
  for (let i = 1; i < writes.length; i++) {
    assert.ok(sameHistory(writes[i].snapshot, third.corrections[i - 1]));
    assert.ok(!Object.hasOwn(writes[i].snapshot as object, 'original'));
    assert.ok(!Object.hasOwn(writes[i].snapshot as object, 'corrections'));
  }
  await assert.rejects(repository.appendCorrection(first.importId, second), /Persisted history differs/);
  await assert.rejects(repository.appendCorrection('other', third), /identity/);
  const fourth = correctImport(third, effectiveValues(third), 'Document another review');
  await assert.rejects(repository.appendCorrection(first.importId, { ...fourth,
    corrections: fourth.corrections.map((c, i) => i === 0 ? { ...c, reason: 'Rewritten earlier reason' } : c),
  }), /Persisted history differs/);
  const alteredOriginal = { ...fourth.original, results: fourth.original.results.map(r => ({ ...r, playerId: 'changed' })) };
  await assert.rejects(repository.appendCorrection(first.importId, { ...fourth, original: alteredOriginal }), /Persisted history differs/);
  truncate = true;
  await assert.rejects(repository.loadDraft(first.importId), /Invalid persisted/);
  truncate = false; omitCount = true;
  await assert.rejects(repository.loadDraft(first.importId), /Incomplete persisted/);
  assert.equal(writes.length, 3);
});

test('individual corrections survive actual PostgreSQL JSONB persistence under administrator RLS', async () => {
  const db = new PGlite();
  const id = '00000000-0000-0000-0000-000000000008';
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${id}');`);
    await db.exec(await readFile(new URL('../supabase/migrations/202611060001_foundation.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into private.administrators(user_id,reason) values ('${id}','Test only');
      set role authenticated; set request.jwt.claim.sub = '${id}';`);
    const source = history()[2];
    await db.query('insert into public.import_drafts(id,original) values ($1,$2)', [id, JSON.stringify(source.original)]);
    for (const [i, correction] of source.corrections.entries()) {
      await db.query('insert into public.import_corrections(draft_id,revision,snapshot,reason) values ($1,$2,$3,$4)', [id, i + 1, JSON.stringify(correction), correction.reason]);
    }
    const originals = await db.query<{ id: string; original: unknown }>('select id,original from public.import_drafts where id=$1', [id]);
    const rows = await db.query<StoredCorrection>('select id,draft_id,revision,snapshot,reason from public.import_corrections where draft_id=$1 order by revision', [id]);
    const count = await db.query<{ count: number }>('select count(*)::integer as count from public.import_corrections where draft_id=$1', [id]);
    assert.deepEqual(reconstructImportDraft(originals.rows[0], rows.rows, count.rows[0].count), { ...source, importId: id });
    for (const row of rows.rows) assert.ok(!Object.hasOwn(row.snapshot as object, 'corrections'));
  } finally { await db.close(); }
});
