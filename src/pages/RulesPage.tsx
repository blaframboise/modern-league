import { Link } from 'react-router-dom';
import { ANNUAL_MINIMUM_EVENTS, SEASON_COUNTED_RESULTS, SEASON_MINIMUM_EVENTS } from '../scoring/regular';
import { CHAMPIONSHIP_RULES } from '../scoring/championship';

const championship=CHAMPIONSHIP_RULES[2027];
function jumpToRulesSection(sectionId:string){
  const section=document.getElementById(sectionId);
  if(!section)return;
  section.scrollIntoView({behavior:'smooth',block:'start'});
  section.focus({preventScroll:true});
}
export function RulesPage(){
  return <div className="container rules-page">
    <header className="rules-intro">
      <p className="eyebrow">2027 / LEAGUE RULES</p>
      <h1>The rules<span className="gold">.</span></h1>
      <p className="page-description">How league points, standings, championships, and seasonal titles work. These scoring rules govern the 2027 series. Eternal Games administers tournament play and official match results; Modern League calculates league standings using those results.</p>
      <nav className="rules-jump" aria-label="On this page">
        <button type="button" onClick={()=>jumpToRulesSection('rules-regular')}>Regular events</button>
        <button type="button" onClick={()=>jumpToRulesSection('rules-season')}>Seasons &amp; eligibility</button>
        <button type="button" onClick={()=>jumpToRulesSection('rules-championship')}>Championships</button>
        <button type="button" onClick={()=>jumpToRulesSection('rules-ties')}>Tiebreakers</button>
        <button type="button" onClick={()=>jumpToRulesSection('rules-pending')}>Administration &amp; privacy</button>
      </nav>
    </header>
    <div className="rules-sections">
      <section id="rules-overview" className="rules-section" tabIndex={-1}>
        <p className="eyebrow">01 / THE STRUCTURE</p><h2>Four seasons. One league year.</h2>
        <p>The 2027 Modern League is divided into four competitive seasons. Each season ends with its own seasonal championship. A separate League Championship concludes the competitive year.</p>
        <p>The official league schedule determines the boundaries—not the last calendar day of March, June, September, or December. Regular events held on or after a season's championship date count toward the following season.</p>
        <p>Under the current 2027 schedule, Season 4 ends with its championship on December 10. Regular Modern beginning Monday, December 13 counts toward <strong>2028 Season 1</strong>. The December 17 League Championship remains part of the 2027 championship year.</p>
        <p><Link to="/events">View the current event calendar</Link>. Dates can change as the organizer updates the schedule.</p>
      </section>
      <section id="rules-regular" className="rules-section" tabIndex={-1}>
        <p className="eyebrow">02 / REGULAR EVENTS</p><h2>Earn up to 10 points per event.</h2>
        <div className="rules-formula"><span>REGULAR EVENT POINTS</span><strong>10 × (3W + D) ÷ (3R)</strong></div>
        <p><strong>W</strong> is wins, <strong>D</strong> is draws, and <strong>R</strong> is the event's scheduled number of Swiss rounds. Losses earn no match points. An unplayed round for an individual player earns zero unless the official store result records a win or draw. If the store cancels a round for the entire event, its final reported round count determines the denominator.</p>
        <p>For example, in a four-round tournament, a 3–1–0 record earns 7.50 league points; a 3–0–1 record earns 8.33 league points.</p>
        <p>Byes, draws, drops, and disqualifications are treated according to the store's official records. Modern League does not independently change tournament outcomes. Points are calculated without intermediate rounding and displayed to two decimal places.</p>
      </section>
      <section id="rules-season" className="rules-section" tabIndex={-1}>
        <p className="eyebrow">03 / SEASONAL STANDINGS</p><h2>Your best {SEASON_COUNTED_RESULTS} regular events count.</h2>
        <p>Only each player's highest {SEASON_COUNTED_RESULTS} regular-event point totals count toward their seasonal regular-event score. The maximum is <strong>80 regular-event points per season</strong>.</p>
        <p>Every regular event played still counts toward participation requirements and the match-percentage tiebreaker—even if that event falls outside the best eight.</p>
        <div className="rules-metrics">
          <div><strong>{SEASON_MINIMUM_EVENTS}</strong><span>Regular events required for a cumulative seasonal title</span></div>
          <div><strong>{ANNUAL_MINIMUM_EVENTS}</strong><span>Regular events required for the annual cumulative title</span></div>
        </div>
        <p>The <strong>Regular Season Champion</strong> is the highest-ranked eligible player before that season's championship. The <strong>Season Champion</strong> is the highest-ranked eligible player after championship points are added. The <strong>League Champion</strong> is the highest-ranked eligible player across the league year.</p>
        <p>Players below the participation minimum still appear in standings and earn points, but cannot receive the corresponding cumulative title. These minimums do <strong>not</strong> restrict participation in any tournament or championship. Eternal Games determines admission, registration, capacity, and participation. Eligibility to win a cumulative league title is a separate matter.</p>
      </section>
      <section id="rules-championship" className="rules-section" tabIndex={-1}>
        <p className="eyebrow">04 / CHAMPIONSHIPS</p><h2>Swiss performance and final placement.</h2>
        <div className="rules-metrics">
          <div><strong>{championship.maximumPoints.seasonal}</strong><span>Maximum seasonal championship points</span></div>
          <div><strong>{championship.maximumPoints.annual}</strong><span>Maximum League Championship points</span></div>
        </div>
        <p>Championship points combine <strong>{Math.round(championship.matchWeight*100)}% Swiss match performance</strong> and <strong>{Math.round(championship.placementWeight*100)}% final placement</strong>. The Swiss portion uses the same win/draw formula as regular events, scaled to the championship's maximum.</p>
        <div className="rules-formula">
          <span>CHAMPIONSHIP POINTS</span>
          <p>Match component = maximum × 0.75 × (3W + D) ÷ (3R)</p>
          <p>Placement component = maximum × 0.25 × (N − P) ÷ (N − 1)</p>
        </div>
        <p><strong>N</strong> is the number of competitors and <strong>P</strong> is a competitor's official final placement. Ties are calculated using the average of the occupied positions. At least two recorded competitors are required for championship points to be calculated.</p>
        <p>Elimination-match records do not count toward the Swiss component. The winner of a season's championship tournament is the <strong>Season Tournament Winner</strong>; the winner of the year-end tournament is the <strong>League Tournament Winner</strong>. These are separate from the cumulative Season Champion and League Champion titles.</p>
        <p>The theoretical maximum is <strong>120 points per season</strong> (80 regular + 40 championship), or <strong>600 points for the year</strong> (four seasons plus the League Championship).</p>
      </section>
      <section id="rules-ties" className="rules-section" tabIndex={-1}>
        <p className="eyebrow">05 / RANKING RULES</p><h2>How ties are broken.</h2>
        <p>Standings use exact, unrounded point totals. When totals are tied, apply these comparisons in order:</p>
        <ol>
          <li>More cumulative championship points.</li>
          <li>More perfect regular-event finishes (wins in every scheduled round, no draws).</li>
          <li>Higher weighted regular match-point percentage across <em>all</em> regular events.</li>
          <li>If still tied, players share the same cumulative rank; eligible players tied for the highest eligible place share the cumulative title unless a different title-resolution procedure is adopted.</li>
        </ol>
      </section>
      <section id="rules-pending" className="rules-section rules-policy" tabIndex={-1}>
        <p className="eyebrow">06 / ADMINISTRATION &amp; PLAYER PRIVACY</p><h2>Store results are authoritative.</h2>
        <h3>Tournament participation</h3>
        <p>Eternal Games determines whether a player may enter a regular event or championship, including registration, participation limits, and tournament procedures. Modern League does not impose additional entry conditions. Only tournaments included on the Modern League event calendar count toward league standings; play at other stores does not count.</p>
        <h3>Official results and reporting errors</h3>
        <p>Eternal Games determines official match results, standings, and the number of rounds in each tournament. Modern League uses the final records supplied by the store, without separately adjusting canceled rounds. Unplayed individual rounds earn no points unless the store records a win or draw.</p>
        <p>Players should report disputed results to Eternal Games and notify the league administrator <strong>within seven calendar days after the event</strong>. Only store-verified corrections will change league records. When the store verifies an error after that reporting period, the administrator may still correct the record and recalculate standings.</p>
        <h3>Player names and records</h3>
        <p>Modern League records the minimum information needed to identify players, match official results across events, and calculate and preserve league standings. Public leaderboards display a player's tournament name or a requested nickname. The administrator may retain the corresponding official name privately for accurate result matching; changing a displayed name does not reset earned points.</p>
        <p>League information is not sold or shared for advertising. Historical tournament results and standings may be retained to preserve league records. Unneeded personal information and source screenshots are removed when no longer needed for verification, corrections, or recordkeeping.</p>
        <p>Players may ask the administrator to change their leaderboard nickname, correct inaccurate personal information, or remove unnecessary personal information. Official results may be retained where necessary to preserve accurate historical standings.</p>
        <p>Championship scoring and cumulative title eligibility are explained above. <Link to="/seasons">See how champions are recognized</Link>.</p>
      </section>
    </div>
    <div className="rules-back"><Link to="/events">Explore the event calendar</Link></div>
  </div>;
}
