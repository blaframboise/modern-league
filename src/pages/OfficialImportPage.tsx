import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { parseImportValues } from '../data/reconstruction';
import { screenshotClient } from '../importInfrastructure/client';
import { fieldPaths, validateHumanEvidence } from '../importInfrastructure/evidence';
import { SOURCE_BUCKET } from '../importInfrastructure/validation';
import { validateImageFiles } from '../extraction';
import { effectiveValues } from '../results';
import type { ImportDraft } from '../results';

type Asset = { id: string; object_path: string; sha256: string; mime_type: string; byte_size: number };
export function OfficialImportPage() {
  const { client } = supabaseConfiguration;
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState('Checking administrator access…');
  const [drafts, setDrafts] = useState<{ id: string }[]>([]);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('[]');
  const [reviewed, setReviewed] = useState(false);
  const [uploadConfirmed, setUploadConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const currentUser = useRef<string | null>(null);
  const createId = useRef(crypto.randomUUID());
  const urls = useRef<string[]>([]);
  function clearPreview() { urls.current.forEach(URL.revokeObjectURL); urls.current = []; setPreview(null); }
  useEffect(() => {
    if (!client) return;
    let active = true;
    async function verify() {
      const request = ++generation.current;
      setBusy(false); setAuthorized(false); setDrafts([]); setDraft(null); setAssets([]); setText(''); setUploadConfirmed(false); clearPreview();
      try {
        const { data } = await client!.auth.getUser();
        if (currentUser.current !== (data.user?.id ?? null)) createId.current = crypto.randomUUID();
        currentUser.current = data.user?.id ?? null;
        const admin = !!data.user && await leagueRepository(client!).isAdministrator();
        const list = admin ? await leagueRepository(client!).drafts() : [];
        if (active && request === generation.current) { setAuthorized(admin); setDrafts(list ?? []); setStatus(admin ? 'Administrator verified. Select or create a private draft.' : 'Administrator sign-in required.'); }
      } catch { if (active && request === generation.current) setStatus('Unable to verify access.'); }
    }
    void verify();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      // Token refresh preserves the current editing session. Sign-in/out clears private views.
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== currentUser.current) || event === 'USER_UPDATED') setTimeout(() => { if (active) void verify(); }, 0);
    });
    return () => { active = false; generation.current++; subscription.unsubscribe(); urls.current.forEach(URL.revokeObjectURL); };
  }, [client]);
  async function load(id: string, request: number) {
    const loaded = await leagueRepository(client!).loadDraft(id);
    const response = await client!.from('screenshot_assets').select('*').eq('draft_id', id);
    if (response.error) throw new Error('Unable to recover source metadata.');
    if (request !== generation.current) return;
    clearPreview(); setUploadConfirmed(false); setDraft(loaded); setAssets((response.data ?? []) as unknown as Asset[]);
    setText(JSON.stringify(effectiveValues(loaded), null, 2)); setReason(''); setEvidence('[]'); setReviewed(false);
  }
  async function run(action: (request: number) => Promise<void>) {
    const request = generation.current; setBusy(true);
    try { await action(request); } catch (error) { if (request === generation.current) setStatus(error instanceof Error ? error.message : 'Request failed.'); }
    finally { if (request === generation.current) setBusy(false); }
  }
  return <section className="container admin-page secure-import"><p className="eyebrow">PRIVATE / ADMINISTRATOR DRAFTS</p><h1>Screenshot import drafts</h1>
    <p>Private source storage and human review only. AI extraction is not configured. Approval and publication are disabled. Missing fields and player identities remain unresolved.</p>
    <p><Link to="/results-import">Fictional in-memory demonstration</Link> · <Link to="/admin">Administrator sign in</Link></p>
    <p role="status">{client ? status : 'Supabase is not configured. No upload or persistence is available.'}</p>
    {authorized && <>
      <button disabled={busy} onClick={() => void run(async request => {
        const id = createId.current;
        await screenshotClient(client!)('create', id);
        await load(id, request);
        if (request !== generation.current) return;
        const list = await leagueRepository(client!).drafts();
        if (request !== generation.current) return;
        createId.current = crypto.randomUUID(); setDrafts(list ?? []); setStatus('Empty private draft saved. Upload sources separately.');
      })}>Create private draft</button>
      <label>Recover saved draft <select disabled={busy} value={draft?.importId ?? ''} onChange={event => { const id = event.target.value; if (id) void run(async request => { await load(id, request); if (request === generation.current) setStatus('Draft and full audit history recovered.'); }); }}>
        <option value="">Select a draft</option>{drafts.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
      </select></label>
      {draft && <>
        <h2>Source images ({assets.length}/8)</h2>
        <label><input type="checkbox" checked={uploadConfirmed} disabled={busy} onChange={event => setUploadConfirmed(event.target.checked)} /> I have permission to upload these tournament screenshots and have removed unrelated personal information. Screenshots are privately stored, not published, and AI processing is currently disabled.</label>
        <label>Upload JPEG, PNG or WebP (10 MiB each, eight per draft)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || !uploadConfirmed} onChange={event => {
          const files = Array.from(event.target.files ?? []); event.target.value = '';
          void run(async request => {
            if (!uploadConfirmed) throw new Error('Confirm source permission before uploading.');
            validateImageFiles(files);
            for (let i = 0; i < files.length; i++) {
              if (request !== generation.current) return;
              setStatus(`Uploading ${i + 1}/${files.length}…`);
              await screenshotClient(client!)('upload', draft.importId, files[i]);
            }
            // Refresh metadata without discarding unsaved review text.
            const result = await client!.from('screenshot_assets').select('*').eq('draft_id', draft.importId);
            if (result.error) throw new Error('Upload may have succeeded. Reload to recover sources.');
            if (request === generation.current) { setAssets(result.data as unknown as Asset[]); setReviewed(false); setStatus('Sources saved privately. Re-select identical files to retry safely.'); }
          });
        }} /></label>
        <ul>{assets.map(asset => <li key={asset.id}><button disabled={busy} onClick={() => void run(async request => {
          const result = await client!.storage.from(SOURCE_BUCKET).download(asset.object_path);
          if (result.error) throw new Error('Private source unavailable. Check access and retry.');
          if (request === generation.current) { clearPreview(); const url = URL.createObjectURL(result.data); urls.current.push(url); setPreview(url); }
        })}>View source {asset.id}</button> — {asset.byte_size} bytes · SHA-256 {asset.sha256}</li>)}</ul>
        {preview && <img src={preview} alt="Private tournament source for human evidence review" style={{ maxWidth: '100%', maxHeight: 600 }} />}
        <p>No image interpretation has run. Enter only information you can verify from the linked sources. Use null/empty values for unresolved fields. Player IDs require explicit registry verification; names never resolve identities.</p>
        <p>Unsaved edits are lost on refresh or navigation. Save a review revision before leaving; failed saves retain your text.</p>
        <label>Review values (JSON; every saved revision remains in the audit history)<textarea rows={18} value={text} disabled={busy} onChange={event => { setText(event.target.value); setReviewed(false); }} /></label>
        <button disabled={busy} onClick={() => { try { setEvidence(JSON.stringify(fieldPaths(parseImportValues(JSON.parse(text))).map(path => ({ path, sources: [], note: '' })), null, 2)); } catch { setStatus('Correct the values JSON first.'); } }}>Prepare field evidence form</button>
        <label>Field evidence JSON (fill source ID arrays and notes for each populated field)<textarea rows={12} value={evidence} disabled={busy} onChange={event => { setEvidence(event.target.value); setReviewed(false); }} /></label>
        <label>Reason for this correction<textarea value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
        <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} /> I reviewed the source images and recorded field evidence and unresolved values in the reason.</label>
        <button disabled={busy || !reviewed || !reason.trim() || !assets.length} onClick={() => void run(async request => {
          const values = parseImportValues(JSON.parse(text));
          await screenshotClient(client!)('correct', draft.importId, { revision: draft.corrections.length + 1, values, reason, confirm: [], sources: assets.map(a => a.id), evidence: validateHumanEvidence(JSON.parse(evidence), values, assets.map(a => a.id)) });
          await load(draft.importId, request); if (request === generation.current) setStatus('Append-only review revision saved. This draft cannot be published.');
        })}>Save review revision</button>
        <p>Saved revisions: {draft.corrections.length}. A conflict preserves your text; copy it before reloading. Repeating the same saved action is safe.</p>
        <details><summary>Immutable original and correction audit</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(draft, null, 2)}</pre></details>
      </>}
    </>}
  </section>;
}
