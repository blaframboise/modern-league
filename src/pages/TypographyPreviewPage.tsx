import { Link } from 'react-router-dom';

/**
 * Isolated two-pane typography study. This route intentionally does not replace
 * production typography, and deliberately uses the same layout/copy in both views.
 */
type Theme = 'current' | 'modern';
function Sample({kind}:{kind:Theme}) {
  const modern=kind==='modern';
  return <article className={`type-sample ${modern?'type-modern':'type-current'}`} aria-label={modern?'Modern Table type package':'Current site typography'}>
    <header className="type-sample-header">
      <span className="type-sample-mark" aria-hidden="true">M</span>
      <span className="type-sample-logo">Modern <small>League</small></span>
      <span className="type-sample-nav">Standings&nbsp; / &nbsp;Events</span>
    </header>
    <div className="type-sample-main">
      <p className="type-eyebrow">The 2027 championship series</p>
      <h2 className="type-hero">Modern League<span className="type-dot">.</span></h2>
      <p className="type-lead">Every match is part of a bigger story.</p>
      <p className="type-paragraph">Your deck. Your community. Your shot at the title. Compete across the season, track your progress, and find your place in the series.</p>
      <div className="type-actions"><span className="type-action-primary">Explore events</span><span className="type-action-secondary">How the league works</span></div>
      <section className="type-data">
        <div className="type-data-head"><div><p className="type-eyebrow">Season one</p><h3>Standings snapshot</h3></div><span className="type-data-note">Illustrative only</span></div>
        <div className="type-stats">
          <div><strong>12</strong><span>Players</span></div><div><strong>03</strong><span>Tournaments</span></div><div><strong>21.50</strong><span>Leading points</span></div>
        </div>
        <div className="type-player"><span className="type-rank">01</span><div><h4>Alex Rowan</h4><p>2 events · Season standings</p></div><strong>15.00</strong></div>
        <div className="type-player"><span className="type-rank">02</span><div><h4>Jordan Vale</h4><p>2 events · Season standings</p></div><strong>15.00</strong></div>
      </section>
      <div className="type-footnote">Prototype only. Figures are illustrative, not a live leaderboard.</div>
    </div>
  </article>;
}
export function TypographyPreviewPage(){
  return <main className="container type-preview">
    <div className="type-preview-intro"><p className="eyebrow">DESIGN STUDY / NOT PUBLIC SITE</p><h1>Typography comparison</h1>
      <p>Identical content and colors, shown in two independent panels. The current site remains unchanged.</p>
      <Link to="/" className="back-link">Return to site</Link></div>
    <div className="type-compare">
      <section><div className="type-panel-heading"><span>01 / Current site</span><small>Inter/system UI</small></div><Sample kind="current"/></section>
      <section><div className="type-panel-heading"><span>02 / Modern Table</span><small>Marcellus + Nunito Sans</small></div><Sample kind="modern"/></section>
    </div>
    <p className="type-preview-caption">Marcellus appears only in announcement, heading, names, and feature-number roles. Nunito Sans handles labels, body copy, buttons, and supporting UI. Marcellus is never bold or all-caps.</p>
  </main>;
}
