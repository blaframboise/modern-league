import { AppVersionPanel } from '../components/AppVersionPanel';
import { ArrowRight, ArrowUpRight, CalendarDays, Flag, Layers3, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';

const destinations = [
  { number: '01', icon: Trophy, title: 'The standings', text: 'Follow the players making their mark on the league.', label: 'Explore leaderboards', to: '/leaderboards' },
  { number: '02', icon: CalendarDays, title: 'Your next challenge', text: 'Find your next tournament and a seat at the table.', label: 'Explore events', to: '/events' },
  { number: '03', icon: Layers3, title: 'Championships & Titles', text: 'Discover the four seasons, championship dates, and who earns each title.', label: 'Explore championships', to: '/seasons' },
];

export function HomePage() {
  return <div className="container home">
    <section className="hero" aria-labelledby="home-title">
      <div className="hero-copy"><p className="eyebrow"><span className="short-line" /> THE NEXT CHAPTER OF COMPETITIVE MODERN</p><h1 id="home-title">Modern League<span className="gold">.</span></h1><p className="hero-subtitle">2027 Modern Championship Series.</p><p className="hero-description">Your deck. Your community. Your shot at the title.<br className="desktop-break" /> A season of competition, one match at a time.</p><div className="hero-actions"><Link className="button button-primary" to="/events">Explore events <ArrowRight size={17} /></Link><Link className="button button-secondary" to="/rules">How the league works <ArrowUpRight size={16} /></Link></div><p className="hero-footnote"><span className="status-dot" /> A new season is taking shape. Stay ready.</p></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="art-cross cross-one">+</span><span className="art-cross cross-two">+</span><div className="game-card card-back" /><div className="game-card card-mid" /><div className="game-card card-front"><span className="card-corner">ML / 27</span><div className="diamond"><Trophy size={55} strokeWidth={1} /></div><span className="card-name">THE MODERN<br />CHAMPIONSHIP</span><span className="card-bottom">PLAY FOR THE TITLE</span></div><span className="art-caption">BUILT FOR THE LONG GAME.</span></div>
    </section>
    <section className="season-strip" aria-label="Season overview"><div className="strip-label"><Flag size={20} /><div><span className="eyebrow">THE 2027 SERIES</span><strong>One league. A whole year of possibility.</strong></div></div><div className="strip-item"><span>FORMAT</span><strong>Modern</strong></div><div className="strip-item"><span>COMPETITION</span><strong>Seasonal & annual</strong></div><div className="strip-item"><span>SEASON STATUS</span><strong className="gold">Preparing for launch</strong></div></section>
    <section className="explore-section" aria-labelledby="explore-title"><div className="section-heading"><div><p className="eyebrow">YOUR LEAGUE, AT A GLANCE</p><h2 id="explore-title">Every match is part of a bigger story.</h2></div><span className="muted section-aside">Find your place in the series.</span></div><div className="destination-grid">{destinations.map(({ number, icon: Icon, title, text, label, to }) => <Link className="destination-card" to={to} key={to}><div className="card-top"><Icon size={23} strokeWidth={1.5} /><span>{number}</span></div><h3>{title}</h3><p>{text}</p><span className="card-link">{label}<ArrowRight size={16} /></span></Link>)}</div></section>
    <section className="launch-note"><div className="launch-icon"><Flag size={21} /></div><div><h2>A fresh season starts here.</h2><p>Events, player standings, and championship details will appear as the league takes shape.</p></div><span className="pill">PRESEASON</span></section>
    <AppVersionPanel />
  </div>;
}
