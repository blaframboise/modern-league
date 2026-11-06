import { useEffect, useRef, useState } from 'react';
import { extractImages, MAX_IMAGES, metadataKeys, mockProvider, rowKeys, validateImageFiles } from '../extraction/index.ts';
import type { Evidence, ExtractionReport, MetadataKey } from '../extraction/index.ts';
import { canConfirmExtractionField, extractionFieldRequired, hasCurrentConfirmation } from '../results/extractionEvidence.ts';
import { correctExtraction, extractionDraft } from '../extraction/draft.ts';
import { decideImport, effectiveValues, markReady, potentialPlayers, validateImport } from '../results/index.ts';
import type { ImportDraft, ImportValues } from '../results/index.ts';
import { demoContext } from '../results/demo.ts';

type Preview = { id: string; file: File; url: string };
export function ResultsImportPage() {
  const [images, setImages] = useState<Preview[]>([]);
  const imageRef = useRef(images);
  const request = useRef<AbortController | null>(null);
  const [report, setReport] = useState<ExtractionReport | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  useEffect(() => () => { request.current?.abort(); imageRef.current.forEach(i => URL.revokeObjectURL(i.url)); }, []);
  const values = draft ? effectiveValues(draft) : null;
  const editable = draft?.state === 'draft' || draft?.state === 'ready for approval';
  const issues = draft ? validateImport(draft, demoContext) : [];
  function changeImages(next: Preview[]) {
    request.current?.abort(); request.current = null; setBusy(false);
    imageRef.current.filter(i => !next.includes(i)).forEach(i => URL.revokeObjectURL(i.url));
    imageRef.current = next; setImages(next); setDraft(null); setReport(null); setReason('');
    setMessage('Image selection changed. Extract again to create a new draft.');
  }
  function select(files: FileList | null, replace?: string) {
    if (!files?.length) return;
    const chosen = Array.from(files);
    try {
      const retained = images.filter(i => i.id !== replace);
      validateImageFiles([...retained.map(i => i.file), ...chosen]);
      const added = chosen.map(file => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
      changeImages(replace ? images.flatMap(i => i.id === replace ? added : [i]) : [...images, ...added]);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to select images.'); }
  }
  function loadDemo() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setMessage('Unable to generate sample image. Choose a photo instead.'); return; }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1200, 720); ctx.fillStyle = '#171717'; ctx.font = '28px sans-serif';
    ['FICTIONAL SAMPLE — NOT OFFICIAL RESULTS', 'Fictional mobile event · regular · 3 Swiss rounds',
      '2027-02-01 18:00 America/Detroit · 2027 / s1', 'eventId: fictional-mobile · sourceKey: fictional:mobile',
      'Player                       Wins    Losses    Draws', 'Sample Copper                   3          0          0',
      'Sample Indigo                    0          3          ?', 'Draws unreadable: confirm from organizer. Copper identity ambiguous.',
      'Mock output is fixed; no pixels are interpreted.'].forEach((line, i) => ctx.fillText(line, 36, 60 + i * 70));
    canvas.toBlob(blob => {
      if (!blob) { setMessage('Unable to generate sample image.'); return; }
      const file = new File([blob], 'fictional-results.png', { type: 'image/png' });
      changeImages([{ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }]);
    }, 'image/png');
  }
  async function extract() {
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setBusy(true); setMessage('Running fictional extraction…'); setDraft(null); setReport(null);
    try {
      const output = await extractImages(mockProvider(simulateFailure), images, controller.signal);
      if (controller.signal.aborted) return;
      setReport(output); setDraft(extractionDraft(crypto.randomUUID(), output)); setReason('');
      setMessage('Fictional draft created. Resolve identities and confirm or correct uncertain fields.');
    } catch (e) { if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : 'Extraction failed. Retry.'); }
    finally { if (request.current === controller) { setBusy(false); request.current = null; } }
  }
  function edit(next: ImportValues, path?: string) {
    if (!draft) return;
    try { setDraft(correctExtraction(draft, next, reason, path && canConfirmExtractionField(next, path) ? path : undefined)); setMessage('Correction recorded. Readiness reset; review validation.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Correction failed.'); }
  }
  function transition(action: 'ready' | 'approved' | 'rejected') {
    if (!draft) return;
    try {
      setDraft(action === 'ready' ? markReady(draft, demoContext) : decideImport(draft, action, 'Fictional mobile reviewer', new Date().toISOString(), reason, demoContext));
      setMessage(action === 'approved' ? 'Approved in memory for this fictional demonstration only. Nothing published.' : `Import marked ${action}.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Transition failed.'); }
  }
  function evidence(e: Evidence<string | number>, path: string) {
    const confirmed = !!values && hasCurrentConfirmation(values, path);
    const required = !!values && extractionFieldRequired(values, path);
    return <div className={confirmed ? 'evidence resolved' : 'evidence uncertain'}>
      <small>{e.status} · original: {e.value ?? 'undetermined'} · images: {e.sources.map(id => images.findIndex(i => i.id === id) + 1).join(', ') || 'none'}</small>
      {e.warnings.map((w, i) => <small key={i}>{w}</small>)}
      {confirmed ? <small>Resolved / confirmed</small> : !required ? <small>Not required for this event</small> : <button type="button" disabled={!editable || !reason.trim() || !values || !canConfirmExtractionField(values, path)} onClick={() => values && edit(values, path)}>Confirm {path}</button>}
    </div>;
  }
  function metadata(key: MetadataKey, value: string) {
    if (!values) return;
    const t = values.tournament;
    let next = { ...t };
    if (['time', 'timeZone', 'offset'].includes(key)) next = { ...t, start: { date: t.date, time: t.start?.time ?? '', ...t.start, [key]: value || undefined } };
    else if (key === 'date') next = { ...t, date: value, start: { time: t.start?.time ?? '', ...t.start, date: value } };
    else if (key === 'year' || key === 'scheduledRounds') next = { ...t, [key]: value === '' ? key === 'year' ? 0 : null : Number(value) };
    else next = { ...t, [key]: value || (key === 'seasonId' ? undefined : '') };
    if (key === 'kind' && value === 'annual') next.seasonId = undefined;
    edit({ ...values, tournament: next }, `tournament.${key}`);
  }
  return <div className="container placeholder-page results-review results-import">
    <p className="eyebrow">PHASE 7 / FICTIONAL DEMONSTRATION</p><h1>Import from images<span className="gold">.</span></h1>
    <p className="calendar-notice"><strong>Mock extraction — no AI or OCR.</strong> Output is a fixed invented example, unrelated to your images. Images and edits stay in this page’s memory, reset on navigation or reload, and are never uploaded or published. Registry and calendar are fictional.</p>
    <section className="calendar-card" aria-label="Image selection"><h2>1. Add tournament images</h2>
      <p>JPEG, PNG or WebP · 10 MiB per image · up to {MAX_IMAGES} images. Convert iPhone HEIC photos first. Changing images discards the current review.</p>
      <div className="review-actions"><label>Take a photo<input aria-label="Take a photo" type="file" accept="image/*" capture="environment" onChange={e => { select(e.target.files); e.target.value = ''; }} /></label><label>Choose photos or screenshots<input aria-label="Choose photos or screenshots" type="file" accept="image/*" multiple onChange={e => { select(e.target.files); e.target.value = ''; }} /></label></div>
      <button onClick={loadDemo}>Load fictional source image</button>
      <p>{images.length} / {MAX_IMAGES} images selected</p>
      <div className="import-thumbnails">{images.map((i, n) => <article key={i.id}><img src={i.url} alt={`Source ${n + 1}: ${i.file.name}`} /><p>Image {n + 1}: {i.file.name}</p><button onClick={() => changeImages(images.filter(x => x.id !== i.id))}>Remove image {n + 1}</button><label>Replace image {n + 1}<input type="file" accept="image/*" onChange={e => { select(e.target.files, i.id); e.target.value = ''; }} /></label></article>)}</div>
      <label className="import-check"><input type="checkbox" checked={simulateFailure} onChange={e => setSimulateFailure(e.target.checked)} />Simulate extraction failure</label>
      <button disabled={!images.length || busy} onClick={extract}>{busy ? 'Extracting fictional sample…' : draft ? 'Restart fictional extraction' : 'Extract fictional sample / retry'}</button>
      {busy && <button onClick={() => { request.current?.abort(); request.current = null; setBusy(false); setMessage('Cancelled. Images kept; retry when ready.'); }}>Cancel extraction</button>}
      <p role="status" aria-live="polite">{message}</p>
    </section>
    {draft && values && report && <>
      <section className="calendar-card"><h2>2. Review the draft</h2><p>State: <strong>{draft.state}</strong> · {report.provider}</p>
        {report.warnings.map((w, i) => <p className="calendar-notice" key={i}>{w}</p>)}
        <label>Correction / confirmation / decision reason<input value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain your review against the source" /></label>
        <p>Enter a reason to edit or confirm. Editing a valid field corrects and confirms its new value in the same recorded action; clearing it leaves it unresolved. Select each registry identity explicitly, even when the name matches.</p>
      </section>
      <div className="import-review-layout">
        <aside id="import-source-images" className="import-sources"><h2>Source images</h2><p>Open an image to zoom in your browser.</p>{images.map((i, n) => <details className="calendar-card" key={i.id} open={n === 0}><summary>Image {n + 1}: {i.file.name}</summary><a href={i.url} target="_blank" rel="noreferrer"><img src={i.url} alt={`Original source image ${n + 1}`} /></a></details>)}</aside>
        <div className="import-records"><section className="calendar-card"><h2>Tournament metadata</h2><a href="#import-source-images">View source images</a><fieldset disabled={!editable || !reason.trim()}><legend>Correct metadata</legend><div className="review-fields">{metadataKeys.filter(k => k !== 'seasonId' || values.tournament.kind !== 'annual').map(key => {
          const t = values.tournament;
          const value = key === 'time' || key === 'timeZone' || key === 'offset' ? t.start?.[key] : t[key];
          return <div key={key}><label>{key}{key === 'kind' ? <select aria-label="Event kind" value={value ?? ''} onChange={e => metadata(key, e.target.value)}><option value="">Choose kind</option>{['regular', 'seasonal', 'annual'].map(k => <option key={k}>{k}</option>)}</select> : <input aria-label={`Tournament ${key}`} type={key === 'date' ? 'date' : ['year', 'scheduledRounds'].includes(key) ? 'number' : 'text'} value={value ?? ''} onChange={e => metadata(key, e.target.value)} />}</label>{evidence(report.tournament[key], `tournament.${key}`)}</div>;
        })}</div></fieldset></section>
        <section aria-label="Extracted player records"><h2>Player records</h2>{values.results.map((r, i) => <article className="calendar-card" key={r.rowId}>
          <h3>Record {i + 1}: {r.importedName || 'Unknown name'}</h3><a href="#import-source-images">View source images</a><p>Identity suggestions: {potentialPlayers(r.importedName, demoContext.players).map(p => `${p.displayName} (${p.playerId})`).join(', ') || 'No matches'}. Names alone do not resolve identity.</p>
          <fieldset disabled={!editable || !reason.trim()}><legend>Correct record {i + 1}</legend>
            <label>Registry player<select aria-label={`Registry player ${i + 1}`} value={r.playerId ?? ''} onChange={e => edit({ ...values, results: values.results.map((row, n) => n === i ? { ...row, playerId: e.target.value || null } : row) })}><option value="">Unresolved identity</option>{demoContext.players.map(p => <option key={p.playerId} value={p.playerId}>{p.displayName} ({p.playerId})</option>)}</select></label>
            <div className="review-fields">{rowKeys.filter(k => k !== 'finalPosition' || values.tournament.kind !== 'regular').map(key => <div key={key}><label>{key}<input aria-label={`Record ${i + 1} ${key}`} type={key === 'importedName' ? 'text' : 'number'} min={key === 'finalPosition' ? 1 : 0} step="1" value={r[key] ?? ''} onChange={e => edit({ ...values, results: values.results.map((row, n) => n === i ? { ...row, [key]: key === 'importedName' ? e.target.value : e.target.value === '' ? null : Number(e.target.value) } : row) }, `${r.rowId}.${key}`)} /></label>{evidence(report.results[i].fields[key], `${r.rowId}.${key}`)}</div>)}</div>
          </fieldset>
        </article>)}</section></div>
      </div>
      <section className="calendar-card" aria-label="Validation"><h2>3. Phase 6 validation and approval</h2><p>Drafts never contribute to official scoring. No automatic approval.</p>{issues.length ? <ul>{issues.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul> : <p>Validation passed. {draft.state === 'draft' ? 'Ready for explicit human review.' : draft.state}</p>}
        <div className="review-actions"><button disabled={draft.state !== 'draft' || issues.length > 0} onClick={() => transition('ready')}>Mark ready for approval</button><button disabled={draft.state !== 'ready for approval' || issues.length > 0 || !reason.trim()} onClick={() => transition('approved')}>Explicitly approve fictional draft</button><button disabled={!editable || !reason.trim()} onClick={() => transition('rejected')}>Reject fictional draft</button></div>
        {draft.decision && <p>{draft.decision.reviewer} · {draft.decision.at} · {draft.decision.reason}</p>}
      </section>
      <details className="calendar-card"><summary>Original extraction and correction history ({draft.corrections.length})</summary><h3>Original extraction — preserved</h3><pre>{draft.original.extraction?.sourceReport}</pre>{draft.corrections.map((c, i) => <div key={i}><h3>Correction {i + 1}: {c.reason}</h3><pre>{JSON.stringify(c, null, 2)}</pre></div>)}</details>
    </>}
  </div>;
}
