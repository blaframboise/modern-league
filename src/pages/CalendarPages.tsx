/** Public calendar pages must not present fictional fixture dates as league events.
 * Confirmed event publishing is not implemented yet; do not expose private sandbox data. */
function Intro({title}:{title:string}){
  return <><p className="eyebrow">2027 / COMPETITIVE CALENDAR</p>
    <h1>{title}<span className="gold">.</span></h1></>;
}
export function EventsPage(){
  return <div className="container placeholder-page"><Intro title="Events"/>
    <p className="page-description">League event dates, times, and venues will be listed once they have been officially confirmed.</p>
    <section className="empty-state" aria-label="Official event calendar status"><span className="pill">SCHEDULE PENDING</span>
      <h2>No official events are currently listed.</h2><p>Dates shown during development were fictional examples and have been removed from this public page. This does not affect the private tournament test workspace.</p>
    </section></div>;
}
export function SeasonsPage(){
  return <div className="container placeholder-page"><Intro title="Seasons"/>
    <p className="page-description">The 2027 series will have four competitive seasons and an annual championship.</p>
    <section className="empty-state" aria-label="Championship scheduling status"><span className="pill">CHAMPIONSHIP DATES PENDING</span>
      <h2>Season and championship dates are not yet confirmed.</h2><p>Season boundaries depend on actual scheduled championship events. Their official dates and qualification details must be confirmed before they are published here.</p>
    </section></div>;
}
