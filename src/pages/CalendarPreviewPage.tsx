import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { proposedCalendar2027, proposedChampionships2027 } from '../calendar/proposed2027';
import type { ProposedSlot } from '../calendar/proposed2027';

const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
const shortMonth=(month:string)=>monthNames[Number(month)-1].slice(0,3);
const format=(date:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
const weekday=(date:string)=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));

function slotDescription(slot:ProposedSlot){
  if(slot.kind==='prerelease')return `${slot.title}. Tentative exclusion; store event not verified.`;
  if(slot.kind==='seasonal')return `Proposed 2027 Season ${slot.season} Championship, replacing regular Friday Modern. Not confirmed.`;
  if(slot.kind==='annual')return 'Proposed 2027 Annual Championship, replacing regular Friday Modern. Not confirmed.';
  return `Proposed Eternal Games Modern, 6:00 p.m. America/Detroit; counted toward ${slot.season===5?'2028 Season 1':`2027 Season ${slot.season}`}. Store date not independently confirmed.`;
}
function byMonth(slots:ProposedSlot[]) {
  const groups:{month:string;slots:ProposedSlot[]}[]=[];
  for(const slot of slots){
    const month=slot.date.slice(5,7);
    if(groups[groups.length-1]?.month!==month)groups.push({month,slots:[]});
    groups[groups.length-1].slots.push(slot);
  }
  return groups;
}
function Tile({slot,active,onSelect}:{slot:ProposedSlot;active:boolean;onSelect:(slot:ProposedSlot)=>void}){
  return <button type="button" onClick={()=>onSelect(slot)}
    aria-label={`${format(slot.date)}, ${weekday(slot.date)}. ${slotDescription(slot)}`}
    aria-pressed={active}
    title={`${weekday(slot.date)}, ${format(slot.date)} — ${slot.title}`}
    className={`season-date-tile season-date-${slot.kind}${active?' is-selected':''}`}>
    <span className="season-date-day">{Number(slot.date.slice(8,10))}</span>
    <span className="season-date-weekday" aria-hidden="true">{weekday(slot.date)==='Monday'?'M':'F'}</span>
    {slot.kind==='prerelease'&&<span className="season-date-slash" aria-hidden="true">/</span>}
  </button>;
}
function SeasonColumn({season,slots,selected,onSelect}:{
  season:number;slots:ProposedSlot[];selected:string|null;onSelect:(slot:ProposedSlot)=>void;
}){
  const champ=slots.find(slot=>slot.kind==='seasonal');
  const ordinary=slots.filter(slot=>slot.kind!=='seasonal');
  return <section className="season-overview-column" aria-label={`2027 Season ${season}`}>
    <header className="season-overview-heading"><span className="season-overview-index">0{season}</span><h2>Season {season}</h2>
      <span className="season-overview-count">{ordinary.filter(s=>s.kind==='modern').length} regular</span>
    </header>
    <div className="season-month-sections">
      {byMonth(ordinary).map(group=><div className="season-month-group" key={group.month}>
        <span className="season-month-name">{shortMonth(group.month)}</span>
        <div className="season-month-tiles">{group.slots.map(slot=><Tile key={slot.date} slot={slot} active={selected===slot.date} onSelect={onSelect}/>)}</div>
      </div>)}
    </div>
    {champ&&<button className={`season-championship-block${selected===champ.date?' is-selected':''}`}
      onClick={()=>onSelect(champ)} type="button" aria-pressed={selected===champ.date}
      aria-label={`${format(champ.date)}: ${slotDescription(champ)}`}>
      <span>SEASON CHAMPIONSHIP</span><strong>{format(champ.date)}</strong>
    </button>}
  </section>;
}
function DetailedCalendar({slots,onSelect}:{slots:ProposedSlot[];onSelect:(slot:ProposedSlot)=>void}){
  const [month,setMonth]=useState('all');
  const [category,setCategory]=useState('all');
  const filtered=slots.filter(s=>(month==='all'||s.date.slice(5,7)===month)&&(category==='all'||category===s.kind));
  return <section className="season-detail-list" aria-label="Detailed proposed calendar">
    <div className="calendar-filters">
      <label>Month<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All months</option>{monthNames.map((name,i)=><option key={name} value={String(i+1).padStart(2,'0')}>{name}</option>)}</select></label>
      <label>Type<select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All events</option><option value="modern">Modern</option><option value="prerelease">Prerelease hold</option><option value="seasonal">Seasonal championship</option><option value="annual">Annual championship</option></select></label>
    </div>
    <p className="muted">Showing {filtered.length} of {slots.length} proposed slots.</p>
    <div className="calendar-proposal-list">{filtered.map(slot=><button key={slot.date} type="button" onClick={()=>onSelect(slot)} className={`season-detail-row calendar-proposal-${slot.kind}`}>
      <span><strong>{format(slot.date)}</strong><small>{weekday(slot.date)}</small></span>
      <span><strong>{slot.title}</strong><small>{slot.kind==='modern'?`202${slot.season===5?'8':'7'} Season ${slot.season===5?'1':slot.season}`:'Provisional date'}</small></span>
    </button>)}</div>
  </section>;
}
export function CalendarPreviewPage(){
  const [selected,setSelected]=useState<ProposedSlot|null>(null);
  const [view,setView]=useState<'overview'|'details'>('overview');
  const slots=useMemo(()=>proposedCalendar2027(),[]);
  const seasons=[1,2,3,4];
  const annual=slots.find(s=>s.kind==='annual');
  const rollover=slots.filter(s=>s.season===5&&s.kind==='modern');
  const regularCount=slots.filter(s=>s.kind==='modern').length;
  const exclusionCount=slots.filter(s=>s.kind==='prerelease').length;
  const championshipCount=proposedChampionships2027.length;
  const choose=(slot:ProposedSlot)=>setSelected(current=>current?.date===slot.date?null:slot);
  return <div className="container season-overview-page">
    <div className="season-overview-intro">
      <p className="eyebrow">2027 / ETERNAL GAMES / WORKING PROPOSAL</p>
      <h1>The Modern calendar<span className="gold">.</span></h1>
      <p>Four competitive seasons. Every Monday and Friday at 6:00 p.m., subject to store confirmation. Tap a numbered date for details.</p>
      <div className="season-overview-toolbar">
        <div className="season-overview-legend" aria-label="Event color key">
          <span><i className="season-key-modern"/>Regular Modern</span>
          <span><i className="season-key-prerelease"/>Prerelease hold</span>
          <span><i className="season-key-championship"/>Season championship</span>
        </div>
        <div className="season-view-toggle" role="group" aria-label="Calendar presentation">
          <button type="button" aria-pressed={view==='overview'} onClick={()=>setView('overview')}>Year at a glance</button>
          <button type="button" aria-pressed={view==='details'} onClick={()=>setView('details')}>Detailed list</button>
        </div>
      </div>
    </div>
    {selected&&<div className="season-selected-event" role="status">
      <div><span className="eyebrow">SELECTED DATE</span><h2>{weekday(selected.date)}, {format(selected.date)}</h2><p>{slotDescription(selected)}</p></div>
      <button type="button" onClick={()=>setSelected(null)} aria-label="Close selected event details">Close</button>
    </div>}
    {view==='overview'?<>
      <div className="season-overview-grid">
        {seasons.map(season=><SeasonColumn key={season} season={season} slots={slots.filter(s=>s.season===season&&s.kind!=='annual')}
          selected={selected?.date??null} onSelect={choose}/>)}
      </div>
      {annual&&<button className={`season-annual-finale${selected?.date===annual.date?' is-selected':''}`} type="button"
        onClick={()=>choose(annual)} aria-pressed={selected?.date===annual.date}
        aria-label={`${format(annual.date)}: ${slotDescription(annual)}`}>
        <span className="season-annual-kicker">2027 GRAND FINALE</span>
        <strong>Annual Championship</strong>
        <span className="season-annual-date">{format(annual.date)} <span>· Friday</span></span>
      </button>}
      <section className="season-rollover" aria-label="December rollover into 2028">
        <div><span className="eyebrow">NEXT COMPETITIVE YEAR</span><h2>2028 Season 1 begins in December.</h2>
          <p>Regular Modern starting December 13 earns 2028 points. The December 17 annual championship still belongs to 2027.</p></div>
        <div className="season-rollover-tiles">{rollover.map(slot=><Tile key={slot.date} slot={slot} active={selected?.date===slot.date} onSelect={choose}/>)}</div>
      </section>
    </>:<DetailedCalendar slots={slots} onSelect={choose}/>}
    <footer className="season-overview-footer">
      <p>{regularCount} provisional regular nights · {exclusionCount} likely prerelease holds · {championshipCount} proposed championships. Numbers show dates of the month; M/F indicates Monday or Friday.</p>
      <p>These are planning assumptions, not confirmed store events. The public official events page remains unchanged. <a href="https://eternalgamesllc.com/events" target="_blank" rel="noreferrer">Eternal Games schedule</a> · <a href="https://magic.wizards.com/en/news/announcements/everything-announced-for-the-magic-multiverse-in-2027" target="_blank" rel="noreferrer">2027 release announcements</a>.</p>
      <Link className="back-link" to="/">Return to Modern League</Link>
    </footer>
  </div>;
}
