import { useState } from 'react';
import { correctImport, decideImport, effectiveValues, importStandings, markReady, potentialPlayers, validateImport } from '../results/index.ts';
import type { EventKind, ImportDraft, ImportValues } from '../results/index.ts';
import { demoContext, demoImport } from '../results/demo.ts';
import { CumulativeLeaderboard } from './LeaderboardPage';

export function ResultsReviewPage() {
  const [draft, setDraft] = useState<ImportDraft>(() => demoImport());
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const values = effectiveValues(draft);
  const issues = validateImport(draft, demoContext);
  const editable = draft.state === 'draft' || draft.state === 'ready for approval';
  function edit(next: ImportValues) {
    try { setDraft(correctImport(draft, next, reason)); setMessage('Correction recorded; validation refreshed.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to edit'); }
  }
  function transition(action: 'ready' | 'approved' | 'rejected') {
    try {
      setDraft(action === 'ready' ? markReady(draft, demoContext) : decideImport(draft, action, 'Fictional demo reviewer', new Date().toISOString(), reason, demoContext));
      setMessage(action === 'approved' ? 'Approved in this demonstration only. No data was published.' : `Import marked ${action}.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to transition'); }
  }
  const standings = importStandings([draft], demoContext);
  return <div className="container placeholder-page results-review">
    <p className="eyebrow">PHASE 6 / FICTIONAL DEMONSTRATION</p><h1>Results review<span className="gold">.</span></h1>
    <p className="calendar-notice"><strong>Fictional demonstration.</strong> These players and results are invented samples. This is not an operational administrator system. Changes exist only in this page’s memory and reset on reload. Nothing is published.</p>
    <div className="review-actions"><label>Load example<select value={values.tournament.kind} onChange={e => { setDraft(demoImport(e.target.value as EventKind)); setMessage('Example reset.'); }}>{['regular', 'seasonal', 'annual'].map(k => <option key={k}>{k}</option>)}</select></label><button onClick={() => { setDraft(demoImport(values.tournament.kind)); setMessage('Example reset.'); }}>Reset example</button></div>
    <section className="calendar-card"><h2>{values.tournament.name}</h2><p>State: <strong>{draft.state}</strong> · {draft.importId}</p>
      <label>Correction / decision reason<input value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain your correction or decision" /></label>
      <p className="muted">Enter a reason before editing. Championship records contain Swiss totals only. Fewer played rounds are allowed; placements must cover the complete field.</p>
      <fieldset disabled={!editable || !reason.trim()}><legend>Tournament corrections</legend><div className="review-fields">
        {(['eventId', 'sourceKey', 'name', 'date', 'year', 'seasonId', 'scheduledRounds'] as const).filter(k => k !== 'seasonId' || values.tournament.kind !== 'annual').map(key => <label key={key}>{key}<input type={key === 'date' ? 'date' : ['year', 'scheduledRounds'].includes(key) ? 'number' : 'text'} value={values.tournament[key] ?? ''} onChange={e => edit({ ...values, tournament: { ...values.tournament, ...(key === 'date' && values.tournament.start ? { start: { ...values.tournament.start, date: e.target.value } } : {}), [key]: ['year', 'scheduledRounds'].includes(key) ? e.target.value === '' ? null : Number(e.target.value) : e.target.value } })} /></label>)}
      </div><div className="review-fields">{(['date', 'time', 'timeZone', 'offset'] as const).map(key => <label key={key}>Start {key}<input value={values.tournament.start?.[key] ?? ''} placeholder={key === 'timeZone' ? 'America/Detroit (default)' : key === 'offset' ? 'DST fold offset, e.g. -04:00' : ''} onChange={e => edit({ ...values, tournament: { ...values.tournament, start: { date: values.tournament.start?.date ?? '', time: values.tournament.start?.time ?? '', ...values.tournament.start, [key]: e.target.value || (key === 'offset' || key === 'timeZone' ? undefined : '') } } })} /></label>)}</div></fieldset>
    </section>
    <section aria-label="Extracted results"><h2>Extracted results</h2><div className="review-grid">{values.results.map((row, i) => <article className="calendar-card" key={row.rowId}>
      <h3>{row.importedName}</h3><p>Potential identities: {potentialPlayers(row.importedName, demoContext.players).map(p => `${p.displayName} (${p.playerId})`).join(', ') || 'No exact name or alias matches'}. Choose an ID explicitly; names never merge players.</p>
      <fieldset disabled={!editable || !reason.trim()}><legend>Correct row {i + 1}</legend><label>Registry player<select value={row.playerId ?? ''} onChange={e => edit({ ...values, results: values.results.map((r, n) => n === i ? { ...r, playerId: e.target.value || null } : r) })}><option value="">Unresolved identity</option>{demoContext.players.map(p => <option key={p.playerId} value={p.playerId}>{p.displayName} ({p.playerId})</option>)}</select></label><div className="review-fields">{(['wins', 'losses', 'draws', ...(values.tournament.kind !== 'regular' ? ['finalPosition'] as const : [])] as const).map(key => <label key={key}>{key}<input type="number" min={key === 'finalPosition' ? 1 : 0} step="1" value={row[key] ?? ''} onChange={e => edit({ ...values, results: values.results.map((r, n) => n === i ? { ...r, [key]: e.target.value === '' ? null : Number(e.target.value) } : r) })} /></label>)}</div></fieldset>
    </article>)}</div></section>
    <section className="calendar-card" aria-label="Validation"><h2>Validation</h2>{issues.length ? <ul>{issues.map((issue, i) => <li key={i}>{issue.path}: {issue.message}</li>)}</ul> : <p>{draft.state === 'approved' ? 'Validation passed. This sample import is approved.' : draft.state === 'rejected' ? 'This sample import is rejected and excluded from scoring.' : 'All checks pass. Explicit approval is still required.'}</p>}
      <div className="review-actions"><button disabled={draft.state !== 'draft' || issues.length > 0} onClick={() => transition('ready')}>Mark ready for approval</button><button disabled={draft.state !== 'ready for approval' || issues.length > 0 || !reason.trim()} onClick={() => transition('approved')}>Explicitly approve demo results</button><button disabled={!editable || !reason.trim()} onClick={() => transition('rejected')}>Reject demo import</button></div>
      <p role="status">{message}</p>{draft.decision && <p>{draft.decision.reviewer} · {draft.decision.at} · {draft.decision.reason}</p>}
    </section>
    <details className="calendar-card"><summary>Original imported values and correction history ({draft.corrections.length})</summary><h3>Original — preserved</h3><pre>{JSON.stringify(draft.original, null, 2)}</pre>{draft.corrections.map((c, i) => <div key={i}><h3>Correction {i + 1}: {c.reason}</h3><pre>{JSON.stringify(c.values, null, 2)}</pre></div>)}</details>
    <p className="calendar-notice">Approval-gated preview: only approved sample records contribute below. Existing scoring, ranking, best-eight, and participation rules apply.</p>
    <CumulativeLeaderboard title="Fictional approved results — annual preview" snapshot={standings.annual} />
  </div>;
}
