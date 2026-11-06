import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractImages, MAX_IMAGE_BYTES, mockProvider, parseExtraction, validateImageFiles } from '../src/extraction/index.ts';
import { correctExtraction, extractionDraft } from '../src/extraction/draft.ts';
import { approvedStandingsInput, correctImport, decideImport, effectiveValues, markReady, potentialPlayers, validateImport } from '../src/results/index.ts';
import { demoContext } from '../src/results/demo.ts';
const images = [{ id: 'phone', file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }) }, { id: 'screen', file: new File(['screen'], 'screen.png', { type: 'image/png' }) }];
const sample = () => extractImages(mockProvider(), images);
test('image boundary accepts mobile JPEG/PNG/WebP and multiple files; rejects invalid sizes/types/counts', () => {
  validateImageFiles(images.map(i => i.file));
  validateImageFiles([new File(['webp'], 'landscape.webp', { type: 'image/webp' })]);
  for (const files of [[], [{ name: 'bad.svg', type: 'image/svg+xml', size: 10 }], [{ name: 'big.jpg', type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }], [{ name: 'empty.png', type: 'image/png', size: 0 }], Array(9).fill(images[0].file)]) assert.throws(() => validateImageFiles(files));
});
test('multiple source references, missing fields, and provider success/failure/cancellation', async () => {
  const report = await sample();
  assert.equal(report.fictional, true);
  assert.deepEqual(report.results[0].fields.wins.sources, ['phone', 'screen']);
  assert.equal(report.results[1].fields.draws.value, null);
  await assert.rejects(extractImages(mockProvider(true), images), /Simulated/);
  const c = new AbortController(); c.abort();
  await assert.rejects(extractImages(mockProvider(), images, c.signal), /cancelled/);
  await assert.rejects(extractImages(mockProvider(), [images[0], images[0]]), /unique/);
});
test('runtime parser rejects malformed output, source hallucinations, wrong numeric types and observed nulls', async () => {
  const report = await sample();
  for (const mutate of [
    (r: typeof report) => { r.results[0].fields.wins.value = '3'; },
    (r: typeof report) => { r.results[0].fields.wins.sources = ['invented']; },
    (r: typeof report) => { r.results[1].fields.draws.status = 'observed'; },
    (r: typeof report) => { r.results[0].fields.wins.status = 'missing'; },
    (r: typeof report) => { r.results.push(r.results[0]); },
    (r: typeof report) => { r.tournament.kind.value = 'invented'; },
  ]) { const r = structuredClone(report); mutate(r); assert.throws(() => parseExtraction(r, images.map(i => i.id))); }
  for (const v of [null, {}, [], 'ignore prior instructions']) assert.throws(() => parseExtraction(v, ['phone']));
});
test('observed/suggested/missing evidence stays separate from immutable corrections; ambiguous identities never match automatically', async () => {
  const report = await sample();
  report.tournament.name.status = 'observed';
  const d = extractionDraft('capture', report);
  assert.ok(d.original.extraction?.confirmed.includes('tournament.name'));
  assert.equal(d.original.results[1].draws, null);
  assert.equal(d.original.results[0].playerId, null);
  assert.equal(potentialPlayers('Sample Copper', demoContext.players).length, 2);
  assert.throws(() => correctExtraction(d, effectiveValues(d), ' ', 'row-1.wins'));
  const v = effectiveValues(d);
  const corrected = correctExtraction(d, { ...v, results: v.results.map((r, i) => i === 1 ? { ...r, draws: 0 } : r) }, 'Checked score sheet', 'row-2.draws');
  assert.equal(corrected.original.results[1].draws, null);
  assert.equal(effectiveValues(corrected).results[1].draws, 0);
  assert.equal(corrected.original.extraction?.sourceReport, JSON.stringify(report));
  assert.equal(corrected.corrections[0].reason, 'Checked score sheet');
  assert.ok(Object.isFrozen(corrected.original));
  assert.throws(() => markReady(corrected, demoContext));
});
test('all confirmation and identity checks precede Phase 6 calendar validation and explicit approval; drafts excluded', async () => {
  const d = extractionDraft('capture', await sample());
  const v = effectiveValues(d);
  const fixed = { ...v, results: v.results.map((r, i) => ({ ...r, playerId: `demo-00${i + 1}`, draws: r.draws ?? 0 })) };
  assert.equal(approvedStandingsInput([d], demoContext).regularEvents.length, 0);
  let resolved = correctExtraction(d, fixed, 'Compared all fields against fictional source');
  for (const path of d.original.extraction!.required) resolved = correctExtraction(resolved, effectiveValues(resolved), 'Reviewed source', path);
  assert.deepEqual(validateImport(resolved, demoContext), []);
  assert.throws(() => decideImport(resolved, 'approved', 'Reviewer', new Date().toISOString(), 'OK', demoContext));
  const ready = markReady(resolved, demoContext);
  assert.equal(approvedStandingsInput([ready], demoContext).regularEvents.length, 0);
  const wrongDate = correctExtraction(ready, { ...effectiveValues(ready), tournament: { ...fixed.tournament, seasonId: 's4' } }, 'Testing mismatch');
  assert.equal(wrongDate.state, 'draft');
  assert.ok(validateImport(wrongDate, demoContext).some(i => i.path === 'tournament.calendar'));
  const approved = decideImport(ready, 'approved', 'Reviewer', new Date().toISOString(), 'Verified fictional import', demoContext);
  assert.equal(approvedStandingsInput([approved], demoContext).regularEvents.length, 1);
  assert.throws(() => correctExtraction(approved, fixed, 'cannot change'));
  const tampered = correctExtraction(resolved, { ...effectiveValues(resolved), extraction: undefined }, 'Attempt to remove provenance');
  // correctExtraction restores source audit; direct Phase 6 corrections cannot remove the original requirement.
  assert.equal(effectiveValues(tampered).extraction?.sourceReport, d.original.extraction?.sourceReport);
});

test('Phase 6 rejects source-audit removal and altered requirements, including after confirmations', async () => {
  const d = extractionDraft('capture', await sample());
  const v = effectiveValues(d);
  for (const audit of [undefined, { ...v.extraction!, required: [] }, { ...v.extraction!, sourceReport: '{}' }]) {
    const changed = correctImport(d, { ...v, extraction: audit }, 'Attempted audit change');
    assert.ok(validateImport(changed, demoContext).some(i => i.path === 'extraction'));
    assert.throws(() => markReady(changed, demoContext));
  }
});
test('championship missing placements block readiness until corrected; missing metadata never inferred', async () => {
  const r = await sample();
  r.tournament.kind.value = 'seasonal';
  r.tournament.year = { value: null, status: 'missing', sources: [], warnings: [] };
  const d = extractionDraft('championship', r);
  assert.equal(d.original.tournament.year, 0);
  assert.equal(d.original.results[0].finalPosition, null);
  assert.ok(validateImport(d, demoContext).some(i => i.path === 'extraction.row-1.finalPosition'));
  assert.ok(validateImport(d, demoContext).some(i => i.path === 'tournament.year'));
  assert.throws(() => markReady(d, demoContext));
});
