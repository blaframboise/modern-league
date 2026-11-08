import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { proposedCalendar2027, proposedChampionships2027, releaseDates2027 } from '../calendar/proposed2027';

const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
const format=(date:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export function CalendarPreviewPage(){
  const [month,setMonth]=useState('all');
  const [category,setCategory]=useState('all');
  const all=useMemo(()=>proposedCalendar2027(),[]);
  const matches=all.filter(s=>(month==='all'||s.date.slice(5,7)===month)&&(category==='all'||category===s.kind));
  const totals=all.reduce((result,s)=>{result[s.kind]=(result[s.kind]??0)+1;return result;},{} as Record<string,number>);
  return <div className="container placeholder-page league-calendar-preview">
    <p className="eyebrow">WORKING DRAFT / NOT AN OFFICIAL EVENT CALENDAR</p>
    <h1>2027 Modern calendar proposal<span className="gold">.</span></h1>
    <p className="page-description">A planning model for Eternal Games in Warren. Weekly Modern is listed by the store on Mondays and Fridays at 6:00 p.m. Dates below are generated assumptions, not store-confirmed reservations or event announcements.</p>
    <div className="calendar-proposal-summary">
      <div><strong>{totals.modern??0}</strong><span>Possible regular Modern nights</span></div>
      <div><strong>{totals.prerelease??0}</strong><span>Likely prerelease Fridays excluded</span></div>
      <div><strong>{(totals.seasonal??0)+(totals.annual??0)}</strong><span>Proposed championship Fridays</span></div>
    </div>
    <section className="calendar-proposal-issues">
      <h2>Championship placement</h2>
      <p>Proposals reserve the last suitable Friday of each competitive period. September 24 is held for a probable prerelease; September 17 is proposed instead. December 31 falls on New Year’s Eve and is a high-risk annual championship placeholder. Dates require organizer and store approval.</p>
      <div className="calendar-proposal-anchors">{proposedChampionships2027.map(c=><div key={c.date}><strong>{format(c.date)}</strong><span>{c.title}</span></div>)}</div>
    </section>
    <section className="calendar-proposal-issues">
      <h2>Prerelease planning</h2>
      <p>The Friday seven days before each announced release is temporarily reserved for prerelease. Actual event times and store plans have not been verified.</p>
      <div className="calendar-proposal-anchors">{releaseDates2027.map(r=><div key={r.date}><strong>{format(new Date(Date.parse(r.date+'T12:00:00Z')-7*86400000).toISOString().slice(0,10))}</strong><span>{r.name}<small>Release: {format(r.date)}</small></span></div>)}</div>
    </section>
    <div className="calendar-filters">
      <label>Month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All of 2027</option>{monthNames.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}</select></label>
      <label>Type<select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All proposed slots</option><option value="modern">Modern</option><option value="prerelease">Likely prerelease — excluded</option><option value="seasonal">Seasonal championship</option><option value="annual">Annual championship</option></select></label>
    </div>
    <p className="muted">Showing {matches.length} of {all.length} weekly slots. Regular Modern nights are tentative; public confirmed calendar remains unchanged.</p>
    <div className="calendar-proposal-list">{matches.map(slot=><article key={slot.date} className={`calendar-proposal-row calendar-proposal-${slot.kind}`}>
      <div><time dateTime={slot.date}>{slot.date}</time><small>{new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(slot.date+'T12:00:00Z'))}</small></div>
      <div><strong>{slot.title}</strong><small>{slot.kind==='modern'?'Season '+slot.season+' · Tentative':slot.kind==='prerelease'?'Likely schedule conflict · Unconfirmed by store':'Proposed, not scheduled'} </small></div>
      <span className="pill">{slot.kind==='modern'?'PROPOSED':slot.kind==='prerelease'?'EXCLUDED':'CHAMPIONSHIP'}</span>
    </article>)}</div>
    <p className="calendar-proposal-sources">Sources: <a href="https://eternalgamesllc.com/events" target="_blank" rel="noreferrer">Eternal Games weekly events</a> · <a href="https://magic.wizards.com/en/news/announcements/everything-announced-for-the-magic-multiverse-in-2027" target="_blank" rel="noreferrer">Wizards 2027 announcement</a> · <a href="https://investor.hasbro.com/static-files/a7941780-84de-4269-82dc-1c58d78a5d87" target="_blank" rel="noreferrer">Hasbro 2027 release cadence</a>.</p>
    <Link className="back-link" to="/">Return to site</Link>
  </div>;
}
