import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { screenshotClient } from '../importInfrastructure/client';
import { fieldPaths, validateHumanEvidence } from '../importInfrastructure/evidence';
import { SOURCE_BUCKET } from '../importInfrastructure/validation';
import { validateImageFiles } from '../extraction';
import { suggestedImportValues } from '../importInfrastructure/suggestions';
import { suggestDisplayName } from '../importInfrastructure/displayNames';
import { parseImportValues } from '../data/reconstruction';
import { effectiveValues } from '../results';
import type { ImportDraft, ImportValues, ImportedResult, Tournament } from '../results';

type Asset = { id: string; object_path: string; sha256: string; byte_size: number };
type Step = 'select' | 'confirm' | 'processing' | 'review' | 'saved';
type Candidate = { object_path: string; retention_reason: string; activity_at: string };
const blankResult = (): ImportedResult => ({
  rowId: crypto.randomUUID(), importedName: '', playerId: null,
  wins: null, losses: null, draws: null, finalPosition: null,
});
const numberOrNull = (text: string) => text.trim() === '' ? null : Number.isSafeInteger(Number(text)) && Number(text) >= 0 ? Number(text) : null;

export function OfficialImportPage() {
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const requestedDraft=searchParams.get('draft');
  const autoLoadedDraft=useRef<string|null>(null);
  const { client, error: configurationError } = supabaseConfiguration;
  const [authorized, setAuthorized] = useState(false);
  const [authStatus, setAuthStatus] = useState('Checking administrator access…');
  const [step, setStep] = useState<Step>('select');
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [drafts, setDrafts] = useState<{id:string}[]>([]);
  const [values, setValues] = useState<ImportValues | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [cleanupReason, setCleanupReason] = useState('');
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false);
  const generation = useRef(0);
  const currentUser = useRef<string | null>(null);
  const nextDraft = useRef(crypto.randomUUID());
  const previewUrl = useRef<string | null>(null);
  const api = client ? screenshotClient(client) : null;

  function usePreview(url: string | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = url;
    setPreview(url);
  }
  function reset() {
    usePreview(null); setPending(null); setConfirmed(false); setStep('select');
    setDraft(null); setAssets([]); setValues(null); setCorrecting(false);
    setReviewed(false); setReason(''); setNotice(''); setError('');
  }
  useEffect(() => {
    if (!client) return;
    let active = true;
    async function verify() {
      const version = ++generation.current;
      try {
        const {data} = await client!.auth.getUser();
        if (!active || generation.current !== version) return;
        const userId = data.user?.id ?? null;
        if (currentUser.current !== userId) {
          currentUser.current = userId; nextDraft.current = crypto.randomUUID();
          reset();
        }
        const admin = !!data.user && await leagueRepository(client!).isAdministrator();
        const existing = admin ? await leagueRepository(client!).drafts() : [];
        if (active && generation.current === version) {
          setAuthorized(admin); setDrafts(existing ?? []);
          setAuthStatus(admin ? '' : 'Administrator sign-in required.');
        }
      } catch {
        if (active) { setAuthorized(false); setAuthStatus('Unable to verify access.'); }
      }
    }
    void verify();
    const {data:{subscription}} = client.auth.onAuthStateChange((event,session) => {
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== currentUser.current) || event === 'USER_UPDATED')
        setTimeout(() => { if (active) void verify(); }, 0);
    });
    return () => { active = false; generation.current++; subscription.unsubscribe(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, [client]);

  useEffect(()=>{
    if (!authorized || !requestedDraft || !drafts.some(item=>item.id===requestedDraft) || autoLoadedDraft.current===requestedDraft) return;
    autoLoadedDraft.current=requestedDraft;
    void loadDraft(requestedDraft);
  },[authorized,requestedDraft,drafts]);

  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The request failed. Please try again.'); }
    finally { setBusy(false); }
  }

  function selectImage(file: File | undefined) {
    if (!file) return;
    try {
      validateImageFiles([file]);
      usePreview(URL.createObjectURL(file)); setPending(file); setConfirmed(false);
      setDraft(null); setAssets([]); setValues(null); setReviewed(false);
      setError(''); setStep('confirm');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unsupported image.'); }
  }

  async function analyze(draftId: string, asset: Asset) {
    if (!api) return;
    setStep('processing'); setError(''); setNotice('Reading the image and preparing results…');
    try {
      const response = await api('extract',draftId,{sourceId:asset.id});
      const proposed = suggestedImportValues(response.report,asset.id);
      setValues(proposed); setCorrecting(false); setReviewed(false); setStep('review');
      setNotice('Extraction complete. Compare the results with your screenshot before approving.');
    } catch (failure) {
      setCorrecting(true); setStep('review');
      setNotice('Your screenshot is safely stored. You can retry analysis or enter results manually.');
      setError(failure instanceof Error ? failure.message : 'Image analysis failed. You may retry.');
    }
  }

  async function submitImage() {
    if (!api || !client || !pending || !confirmed) return;
    await perform(async () => {
      setStep('processing'); setNotice('Uploading screenshot securely…');
      const draftId = nextDraft.current;
      try {
        await api('create',draftId);
        const asset = await api('upload',draftId,pending) as Asset;
        setDraft({importId:draftId,state:'draft',original:{
          tournament:{eventId:'',sourceKey:'',name:'',date:'',start:null,year:0,kind:'' as Tournament['kind'],scheduledRounds:null},
          results:[]},corrections:[]});
        setAssets([asset]);
        setPending(null);
        nextDraft.current = crypto.randomUUID();
        const list = await leagueRepository(client).drafts();
        setDrafts(list ?? []);
        await analyze(draftId,asset);
      } catch (failure) {
        setStep('confirm');
        throw failure;
      }
    });
  }

  async function loadDraft(id: string) {
    if (!client) return;
    await perform(async () => {
      const loaded = await leagueRepository(client).loadDraft(id);
      const response = await client.from('screenshot_assets').select('*').eq('draft_id',id);
      if (response.error) throw new Error('Unable to load saved sources.');
      const saved = (response.data ?? []) as Asset[];
      setDraft(loaded); setAssets(saved); setValues(effectiveValues(loaded));
      setPending(null); setCorrecting(false); setReviewed(false); setConfirmed(true);
      if (saved[0]) {
        const download = await client.storage.from(SOURCE_BUCKET).download(saved[0].object_path);
        if (!download.error && download.data) usePreview(URL.createObjectURL(download.data));
        else usePreview(null);
      } else usePreview(null);
      setStep(loaded.corrections.length ? 'saved' : 'review');
      setNotice('Saved draft loaded.');
    });
  }

  function updateTournament(patch: Partial<Tournament>) {
    setValues(previous => previous ? {...previous,tournament:{...previous.tournament,...patch}} : previous);
    setReviewed(false);
  }
  function updateResult(index: number, patch: Partial<ImportedResult>) {
    setValues(previous => previous ? {...previous,results:previous.results.map((row,i)=>i===index?{...row,...patch}:row)} : previous);
    setReviewed(false);
  }
  function suggestNameCorrections() {
    setValues(previous => previous ? {...previous,results:previous.results.map(row => ({
      ...row, importedName:suggestDisplayName(row.importedName),
    }))} : previous);
    setReviewed(false);
    setNotice('Capitalization suggestions applied to the editable review. Check each name, especially Mc/Mac, particles, and preferred spellings before saving.');
  }
  function addResult() {
    setValues(previous => previous ? {...previous,results:[...previous.results,blankResult()]} : previous);
    setReviewed(false);
  }
  async function saveReview() {
    if (!api || !draft || !values || !reviewed || !assets.length) return;
    await perform(async()=>{
      const parsed = parseImportValues({...values,tournament:{...values.tournament,year:/^\d{4}-\d{2}-\d{2}$/.test(values.tournament.date)?Number(values.tournament.date.slice(0,4)):values.tournament.year}});
      const ids = assets.map(asset=>asset.id);
      const evidence = validateHumanEvidence(fieldPaths(parsed).map(path=>({
        path,sources:ids,note:'Administrator verified this value against the source screenshot.',
      })),parsed,ids);
      const reviewReason = reason.trim() || 'Administrator reviewed the screenshot and confirmed the extracted results.';
      await api('correct',draft.importId,{
        revision:draft.corrections.length+1,values:parsed,reason:reviewReason,
        confirm:[],sources:ids,evidence,
      });
      const loaded = await leagueRepository(client!).loadDraft(draft.importId);
      setDraft(loaded);setValues(effectiveValues(loaded));setStep('saved');setCorrecting(false);
      setNotice('Review saved. Continue to player matching to register participants and calculate test standings. Nothing is published officially.');
    });
  }
  const canReview = !!values && !!draft && !!assets.length;

  return <section className="container admin-page guided-import">
    <div className="import-intro">
      <p className="eyebrow">LEAGUE ADMINISTRATION</p>
      <h1>Upload Results</h1>
      <p>Submit a tournament screenshot, verify the extracted results, then save your review.</p>
      <Link to="/admin">Administrator access</Link>
    </div>
    {!authorized ? <p role="status">{client ? authStatus : configurationError ?? 'Supabase is unavailable.'}</p> : <>
      <nav className="import-progress" aria-label="Import progress">
        {(['Upload','Confirm','Analyze','Review'] as const).map((label,index) =>
          <span key={label} className={['select','confirm','processing','review','saved'].indexOf(step)>=index?'current':''}>{index+1}. {label}</span>)}
      </nav>
      {(error || notice || busy) && <div className="import-feedback" role="status" aria-live="polite">
        {busy && <span className="import-spinner" aria-hidden="true" />}
        {error && <strong className="import-error">{error}</strong>}
        {notice && <span>{notice}</span>}
      </div>}
      {step==='select' && <div className="import-panel">
        <h2>Choose a tournament screenshot</h2>
        <label className="import-file">Upload Results
          <input aria-label="Choose tournament screenshot" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{
            selectImage(event.target.files?.[0]);event.target.value='';
          }}/>
        </label>
        <p className="import-hint">PNG, JPG or WebP, up to 10 MB.</p>
      </div>}
      {step==='confirm' && <div className="import-panel">
        <h2>Confirm your screenshot</h2>
        {preview && <img className="import-preview" src={preview} alt="Tournament screenshot selected for analysis"/>}
        <p>{pending?.name}</p>
        <label className="import-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>
          I have permission to process this screenshot and have removed unrelated personal information. I understand submitting it will send the image to OpenAI for transcription.
        </label>
        <div className="import-actions">
          <button type="button" disabled={busy} onClick={reset}>Choose another image</button>
          <button type="button" disabled={busy || !confirmed} onClick={()=>void submitImage()}>Submit image for analysis</button>
        </div>
      </div>}
      {step==='processing' && <div className="import-panel import-wait">
        <h2>Analyzing tournament results</h2>
        <p>This may take a moment. The image is private; no results will be published automatically.</p>
        {preview && <img className="import-preview import-processing-preview" src={preview} alt="Screenshot being analyzed"/>}
      </div>}
      {(step==='review'||step==='saved') && <div className="import-panel">
        <div className="import-review-head">
          <div><h2>{step==='saved'?'Review saved':'Review extracted results'}</h2>
            <p>{step==='saved'?'The reviewed draft is stored privately.':'Compare these values with your screenshot. Empty fields mean the image did not establish an answer.'}</p></div>
          {preview && <img className="import-thumb" src={preview} alt="Original screenshot for comparison"/>}
        </div>
        {preview && <details className="import-original"><summary>View full screenshot for comparison</summary><img className="import-preview" src={preview} alt="Original uploaded tournament screenshot"/></details>}
        {assets.length>0 && step==='review' && <button type="button" disabled={busy} onClick={()=>void perform(()=>analyze(draft!.importId,assets[0]))}>Retry image analysis</button>}
        {values && <>
          <div className="import-event-fields">
            <label>Event name<input disabled={!correcting || busy || step==='saved'} value={values.tournament.name} onChange={e=>updateTournament({name:e.target.value})}/></label>
            <label>Date<input type="date" disabled={!correcting || busy || step==='saved'} value={values.tournament.date} onChange={e=>updateTournament({date:e.target.value,year:e.target.value?Number(e.target.value.slice(0,4)):0})}/></label>
            <label>Event type<select disabled={!correcting || busy || step==='saved'} value={values.tournament.kind} onChange={e=>updateTournament({kind:e.target.value as Tournament['kind']})}><option value="">Unknown</option><option value="regular">Regular</option><option value="seasonal">Season championship</option><option value="annual">Annual championship</option></select></label>
          </div>
          <div className="import-table-scroll"><table className="import-results-table"><thead><tr><th>Player</th><th>W</th><th>L</th><th>D</th><th>Place</th>{correcting && <th/>}</tr></thead>
            <tbody>{values.results.map((row,i)=><tr key={row.rowId}>
              <td><input aria-label={`Player ${i+1} name`} disabled={!correcting||busy||step==='saved'} value={row.importedName} onChange={e=>updateResult(i,{importedName:e.target.value})}/></td>
              {(['wins','losses','draws','finalPosition'] as const).map(key=><td key={key}><input aria-label={`Player ${i+1} ${key}`} type="number" min="0" disabled={!correcting||busy||step==='saved'} value={row[key]??''} onChange={e=>updateResult(i,{[key]:numberOrNull(e.target.value)})}/></td>)}
              {correcting && <td><button aria-label={`Remove player ${i+1}`} disabled={busy||step==='saved'} onClick={()=>setValues(v=>v?{...v,results:v.results.filter((_,n)=>n!==i)}:v)}>Remove</button></td>}
            </tr>)}</tbody></table></div>
          {!values.results.length && <p>No readable player rows were extracted. Use Make corrections to enter results manually.</p>}
          {correcting && step==='review' && <div className="import-actions">
            <button type="button" disabled={busy} onClick={suggestNameCorrections}>Suggest name capitalization</button>
            <button type="button" disabled={busy} onClick={addResult}>Add player</button>
          </div>}
          {step==='review' && <>
            <div className="import-actions">
              <button type="button" disabled={busy} onClick={()=>{setCorrecting(true);setReviewed(false)}}>Make corrections</button>
            </div>
            <label className="import-consent"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/>
              I checked the player names, match records, and other populated fields against the screenshot. Unclear fields are left blank.
            </label>
            {correcting && <label>Review notes (optional)<textarea rows={2} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
            <button type="button" disabled={busy||!reviewed||!canReview} onClick={()=>void saveReview()}>
              {correcting?'Save corrected results':'Approve extracted results'}</button>
            <p className="import-hint">Approval here records your review; it does not publish standings.</p>
          </>}
          {step==='saved' && <div className="import-actions">
            {draft?.corrections.length ? <button type="button" disabled={busy} onClick={()=>navigate(`/test-workspace?draft=${encodeURIComponent(draft.importId)}`)}>Continue to player matching</button> : null}
            <button type="button" disabled={busy} onClick={() => {setStep('review');setCorrecting(true);setReviewed(false);setNotice('Editing a saved test draft will append another review revision; the previous version remains in the audit trail.');}}>Edit saved draft</button>
            <button type="button" disabled={busy} onClick={reset}>Upload another result</button>
          </div>}
        </>}
        {!values && <p>No results are available yet. Retry analysis or select another image.</p>}
      </div>}
      <details className="import-secondary"><summary>Previous imports and maintenance</summary>
        <div className="import-secondary-content">
          <label>Open an earlier draft <select disabled={busy} value="" onChange={e=>{if(e.target.value)void loadDraft(e.target.value)}}>
            <option value="">Select saved draft</option>{drafts.map(item=><option key={item.id} value={item.id}>{item.id}</option>)}
          </select></label>
          {draft && <p>Saved review revisions: {draft.corrections.length}</p>}
          <button disabled={busy} onClick={()=>void perform(async()=>{
            const response=await api!('retention-preview',crypto.randomUUID());
            setCandidates(response.candidates??[]);setNotice('Retention candidates refreshed.');
          })}>Check retention eligibility</button>
          {candidates && <><p>{candidates.length} source files qualify for retention review.</p>
            <ul>{candidates.map(item=><li key={item.object_path}>{item.retention_reason} — {item.object_path.split('/').at(-1)?.slice(0,12)}
              {item.retention_reason==='orphan_24h' && <button disabled={busy||!cleanupConfirmed||!cleanupReason.trim()} onClick={()=>void perform(async()=>{
                await api!('retention-delete-orphan',crypto.randomUUID(),{objectPath:item.object_path,reason:cleanupReason,confirm:true});
                const response=await api!('retention-preview',crypto.randomUUID());
                setCandidates(response.candidates??[]);setCleanupConfirmed(false);setNotice('Abandoned upload deleted and audited.');
              })}>Delete orphan</button>}
            </li>)}</ul>
            <label>Cleanup reason<textarea value={cleanupReason} onChange={e=>{setCleanupReason(e.target.value);setCleanupConfirmed(false)}}/></label>
            <label><input type="checkbox" checked={cleanupConfirmed} onChange={e=>setCleanupConfirmed(e.target.checked)}/> I reviewed this orphan and authorize permanent deletion.</label>
          </>}
        </div>
      </details>
    </>}
  </section>;
}
