import { useState } from 'react';
import { assignRegularEvents } from '../calendar/index';
import type { CalendarEvent } from '../calendar/index';
import { demoCalendar, demoRegularEvents } from '../calendar/demo';
const assignments = assignRegularEvents(demoCalendar, demoRegularEvents);
const rows = [
  ...demoRegularEvents.map(event => {
    const assignment = assignments.find(a => a.eventId === event.id)!;
    return { event, type: 'regular', year: assignment.status === 'assigned' ? assignment.year : undefined, seasonId: assignment.status === 'assigned' ? assignment.seasonId : undefined };
  }),
  ...demoCalendar.years.flatMap(year => [
    ...year.seasons.map(season => ({ event: season.championship, type: 'seasonal championship', year: year.year, seasonId: season.id })),
    { event: year.annualChampionship, type: 'annual championship', year: year.year, seasonId: undefined },
  ]),
].sort((a, b) => (a.event.start?.date ?? '9999').localeCompare(b.event.start?.date ?? '9999'));
function Start({ event }: { event: CalendarEvent }) {
  return event.start ? <><time dateTime={event.start.date}>{event.start.date}</time> · {event.start.time} {event.start.timeZone ?? 'America/Detroit'}</> : <>Date unconfirmed</>;
}
function Intro({ title }: { title: string }) {
  return <><p className="eyebrow">2027 / COMPETITIVE CALENDAR</p><h1>{title}<span className="gold">.</span></h1><p className="calendar-notice"><strong>Demonstration schedule.</strong> All dates below are fictional samples, not confirmed league events. No official championship dates or venues have been announced here.</p></>;
}
export function EventsPage() {
  const [season, setSeason] = useState('all');
  const [type, setType] = useState('all');
  const filtered = rows.filter(row => (type === 'all' || row.type === type) && (season === 'all' || `${row.year}:${row.seasonId}` === season));
  return <div className="container placeholder-page"><Intro title="Events" /><p className="page-description">Regular tournaments generally run Mondays and Fridays, beginning January 4, 2027. Dates require explicit scheduling; recurring days do not create events.</p>
    <div className="calendar-filters"><label>Competitive season<select value={season} onChange={e => setSeason(e.target.value)}><option value="all">All seasons and annual events</option>{demoCalendar.years.flatMap(year => year.seasons.map((s, i) => <option key={`${year.year}:${s.id}`} value={`${year.year}:${s.id}`}>{year.year} Season {i + 1}</option>))}</select></label><label>Event type<select value={type} onChange={e => setType(e.target.value)}><option value="all">All event types</option>{['regular', 'seasonal championship', 'annual championship'].map(t => <option key={t}>{t}</option>)}</select></label></div>
    <div className="calendar-list">{filtered.map(({ event, type, year, seasonId }) => <article className="calendar-card" key={event.id}><span className="pill">{event.source === 'confirmed' ? 'CONFIRMED' : 'FICTIONAL SAMPLE'}</span><h2>{event.name}</h2><p><Start event={event} /></p><p>{type} · {year ? `${year} ${seasonId ? `Season ${seasonId.slice(1)}` : 'Annual championship'}` : 'Assignment unresolved'}</p>{event.venue && <p>Venue: {event.venue}</p>}{event.description && <p>{event.description}</p>}</article>)}{!filtered.length && <p>No events match these filters.</p>}</div>
  </div>;
}
export function SeasonsPage() {
  return <div className="container placeholder-page"><Intro title="Seasons" /><p className="page-description">Target windows guide scheduling. A regular tournament moves to the next competitive season at the exact championship start, including before a quarter ends. The earlier year-end cutoff starts the next league year.</p>{demoCalendar.years.map(year => <section key={year.year} className="calendar-year"><h2>{year.year} league year</h2><div className="season-grid">{year.seasons.map((season, i) => <article className="calendar-card" key={season.id}><span className="pill">FICTIONAL SAMPLE</span><h3>Season {i + 1}</h3><p>Target: {season.targetWindow}</p><p>Championship: <Start event={season.championship} /></p><p>Regular scoring cutoff: {season.championship.start ? <Start event={season.championship} /> : 'Unresolved until scheduled'}</p>{season.status && <p>Status: {season.status}</p>}</article>)}</div><article className="calendar-card annual-card"><span className="pill">FICTIONAL SAMPLE / SEPARATE EVENT</span><h3>Annual championship</h3><p><Start event={year.annualChampionship} /></p><p>Closes the league scoring year. Regular events at or after either the Season 4 cutoff or this cutoff enter the following league year’s Season 1 when its schedule permits assignment.</p></article></section>)}</div>;
}
