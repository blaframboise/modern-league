import { Link } from 'react-router-dom';
import { CalendarPreviewPage } from './CalendarPreviewPage';

/** Dates are accepted as the league's working schedule and remain editable in Admin.
 * This is not evidence that any third-party venue independently confirmed each date.
 * Tournament result publication remains a separate disabled workflow.
 */
export function EventsPage(){return <CalendarPreviewPage />;}

export function SeasonsPage(){
  return <div className="container placeholder-page">
    <p className="eyebrow">2027 / COMPETITIVE SEASONS</p>
    <h1>Seasons<span className="gold">.</span></h1>
    <p className="page-description">Four seasons and a League Championship. The organizer's working championship dates are included in the league calendar and can be revised through the scheduler.</p>
    <section className="empty-state" aria-label="Season details status">
      <h2>Follow the season calendar.</h2>
      <p>Championship dates and regular tournament nights are now listed. Official player standings and championship results remain unpublished until the results workflow is enabled.</p>
      <Link to="/events" className="button button-primary">See the 2027 calendar</Link>
    </section>
  </div>;
}
