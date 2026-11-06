import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Brand } from '../components/Brand';
import { LeaderboardPage } from '../pages/LeaderboardPage';
import { HomePage } from '../pages/HomePage';
import { PlaceholderPage, sectionContent } from '../pages/PlaceholderPage';
import { EventsPage, SeasonsPage } from '../pages/CalendarPages';
import { ResultsReviewPage } from '../pages/ResultsReviewPage';
import { ResultsImportPage } from '../pages/ResultsImportPage';
import { navigation } from './navigation';

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
    document.title = `${navigation.find(item => item.path === pathname)?.label ?? 'Page not found'} | Modern League`;
    if (!firstRender.current) mainRef.current?.focus();
    firstRender.current = false;
  }, [pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="container header-inner">
      <Link to="/" aria-label="Modern League home"><Brand /></Link>
      <button className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="primary-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav id="primary-nav" aria-label="Main navigation" className={menuOpen ? 'navigation open' : 'navigation'} onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false); }}>
        {navigation.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'}>{item.label}</NavLink>)}
      </nav>
      <span className="header-season"><span className="status-dot" />2027 SEASON</span>
    </div></header>
    <main id="main" tabIndex={-1} ref={mainRef}><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/results-import" element={<ResultsImportPage />} />
      <Route path="/results-review" element={<ResultsReviewPage />} />
      <Route path="/leaderboards" element={<LeaderboardPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/seasons" element={<SeasonsPage />} />
      {Object.entries(sectionContent).filter(([path]) => !['/leaderboards', '/events', '/seasons'].includes(path)).map(([path, content]) => <Route key={path} path={path} element={<PlaceholderPage {...content} />} />)}
      <Route path="*" element={<PlaceholderPage eyebrow="404 / OFF THE MAP" title="Page not found" description="This page isn’t part of the league. Head home to find your next destination." icon="rules" />} />
    </Routes></main>
    <footer className="site-footer container"><div><Link to="/" aria-label="Modern League home"><Brand /></Link><p>A community built for the competition.</p></div><div className="footer-right"><Link to="/rules">League rules <ArrowUpRight size={14} /></Link><p>Independent community league. Not affiliated with Wizards of the Coast.</p><span>© 2027 Modern League</span></div></footer>
  </div>;
}
