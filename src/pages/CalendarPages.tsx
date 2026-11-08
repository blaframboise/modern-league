import { useEffect, useState } from 'react';
import { Crown, CalendarDays, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CalendarPreviewPage } from './CalendarPreviewPage';
import { calendarFromOverrides, parseCalendarOverrides } from '../calendar/scheduler';
import { supabaseConfiguration } from '../data/client';
import type { ProposedSlot } from '../calendar/proposed2027';

/** Working league dates can change; standings require a separate verified publication. */
export function EventsPage(){return <CalendarPreviewPage />;}

const shortDate=(date:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export function SeasonsPage(){
  const [slots,setSlots]=useState<ProposedSlot[]|null>(null);
  const [status,setStatus]=useState('Loading the league schedule…');
  useEffect(()=>{
    let active=true;
    const client=supabaseConfiguration.client;
    if(!client){setStatus('Season schedule is currently unavailable.');return;}
    void (async()=>{
      try{
        const {data,error}=await client.from('proposed_calendar_settings').select('overrides').eq('year',2027).single();
        if(error||!data)throw Error('Schedule unavailable');
        const schedule=calendarFromOverrides(parseCalendarOverrides(data.overrides));
        if(active){setSlots(schedule);setStatus('2027 league schedule · Subject to change');}
      }catch{if(active){setSlots(null);setStatus('Season dates could not be loaded. No unverified dates are displayed.');}}
    })();
    return ()=>{active=false;};
  },[]);
  const seasons=[1,2,3,4];
  const seasonalChampionships=slots?.filter(slot=>slot.kind==='seasonal')??[];
  const leagueChampionship=slots?.find(slot=>slot.kind==='annual');
  return <div className="container seasons-page">
    <header className="seasons-intro">
      <p className="eyebrow">2027 / THE CHAMPIONSHIP SERIES</p>
      <h1>Four seasons. One title<span className="gold">.</span></h1>
      <p className="page-description">Every regular Modern event contributes to a season. The season championships award additional points, and the League Championship closes the competitive year.</p>
    </header>
    <p className="seasons-status" role="status">{status}</p>
    <section aria-label="2027 season breakdown">
      <div className="seasons-card-grid">
        {seasons.map(n=>{
          const champ=seasonalChampionships.find(slot=>slot.season===n);
          const regular=slots?.filter(slot=>slot.season===n&&slot.kind==='modern').length;
          return <article className="season-story-card" key={n}>
            <div className="season-story-top"><span>SEASON</span><strong>0{n}</strong></div>
            <h2>Season {n}</h2>
            <p>{regular===undefined?'Dates loading':`${regular} scheduled regular events`}</p>
            <div className="season-story-date"><CalendarDays size={17} aria-hidden="true"/><span>{champ?`Season championship · ${shortDate(champ.date)}`:'Championship date not set'}</span></div>
            <div className="season-story-winner"><Crown size={19} aria-hidden="true"/><span>Overall Season Champion</span><strong>Awaiting results</strong></div>
          </article>;
        })}
      </div>
    </section>
    <section className="season-final-title" aria-label="League Championship">
      <div><p className="eyebrow">THE YEAR-END FINALE</p><h2>League Championship</h2>
        <p>{leagueChampionship?`Scheduled for ${shortDate(leagueChampionship.date)}, 2027.`:'Championship date not set.'} The tournament champion is determined by the store's final standings. The annual cumulative champion is determined by the league's points and eligibility rules.</p></div>
      <Trophy size={56} strokeWidth={1.3} aria-hidden="true"/>
    </section>
    <section className="seasons-recognition" aria-label="Champion recognition">
      <p className="eyebrow">RECOGNITION ON THE LEADERBOARD</p><h2>Champions carry the crown.</h2>
      <div className="seasons-badges">
        <div className="seasons-badge-example"><span className="seasons-badge-icon"><Crown aria-hidden="true" size={31}/><b>1</b></span><div><strong>Season champion</strong><p>After a season is final, its Overall Season Champion will be recognized on the leaderboard with a crown bearing the season number. Champions from more than one season can display multiple crowns.</p></div></div>
        <div className="seasons-badge-example"><span className="seasons-badge-icon seasons-reigning-crown"><Crown aria-hidden="true" size={31}/><b>★</b></span><div><strong>Reigning league champion</strong><p>The Annual Overall Champion will carry a glowing crown through the following league year as the reigning champion. Historical titles remain recorded after that reign ends.</p></div></div>
      </div>
      <p className="seasons-badge-note">Badge designs are previews. Crown assignment will activate only when verified championship results and cumulative standings are publicly published. Nobody has been awarded a crown yet.</p>
    </section>
    <section className="seasons-how-it-works">
      <p className="eyebrow">HOW THE TITLES WORK</p>
      <div className="seasons-how-grid">
        <div><h3>Best eight</h3><p>Each season counts a player's best eight regular-event point totals toward the cumulative score.</p></div>
        <div><h3>Seasonal eligibility</h3><p>Six regular events are required to receive a cumulative seasonal title, not to enter the championship tournament.</p></div>
        <div><h3>Annual eligibility</h3><p>Twenty regular events across the league year are required for the annual cumulative title.</p></div>
        <div><h3>Separate honors</h3><p>A championship tournament winner is distinct from the points-based cumulative title holder.</p></div>
      </div>
      <div className="seasons-links"><Link className="button button-primary" to="/events">2027 event calendar</Link><Link className="button button-secondary" to="/rules">Competition rules</Link></div>
    </section>
  </div>;
}
