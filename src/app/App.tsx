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
import { OfficialImportPage } from '../pages/OfficialImportPage';
import { AdminPage } from '../pages/AdminPage';
import { TestWorkspacePage } from '../pages/TestWorkspacePage';
import { supabaseConfiguration } from '../data/client';
import { leagueRepository } from '../data/repository';
import { navigation } from './navigation';

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const client=supabaseConfiguration.client;
    if(!client) return;
    let active=true;let version=0;
    async function update() {
      const current=++version;
      try {
        const {data}=await client!.auth.getUser();
        const admin=!!data.user && await leagueRepository(client!).isAdministrator();
        if(active&&current===version)setIsAdmin(admin);
      } catch {if(active&&current===version)setIsAdmin(false);}
    }
    void update();
    const {data:{subscription}}=client.auth.onAuthStateChange(() => {
      setTimeout(()=>{if(active)void update();},0);
    });
    return ()=>{active=false;version++;subscription.unsubscribe();};
  },[]);

  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
    document.title = `${navigation.find(item => item.path === pathname)?.label ?? (pathname === '/official-import' ? 'Private screenshot drafts' : pathname === '/admin' ? 'League administration' : pathname === '/test-workspace' ? 'Private test workspace' : pathname === '/edit-tournaments' ? 'Edit test tournament results' : 'Page not found')} | Modern League`;
    if (!firstRender.current) mainRef.current?.focus();
    firstRender.current = false;
  }, [pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.scrollIntoView(); document.getElementById('main')?.focus(); }}>Skip to content</a>
    <header className="site-header"><div className="container header-inner">
      <Link to="/" aria-label="Modern League home"><Brand /></Link>
      <button className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="primary-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav id="primary-nav" aria-label="Main navigation" className={menuOpen ? 'navigation open' : 'navigation'} onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false); }}>
        {navigation.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'}>{item.label}</NavLink>)}
        {isAdmin && <NavLink to="/admin" end={false}>Admin</NavLink>}
      </nav>
      <span className="header-season"><span className="status-dot" />2027 SEASON</span>
    </div></header>
    <main id="main" tabIndex={-1} ref={mainRef}><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/official-import" element={<OfficialImportPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/test-workspace" element={<TestWorkspacePage />} />
      <Route path="/edit-tournaments" element={<TestWorkspacePage editMode />} />
      <Route path="/results-import" element={<ResultsImportPage />} />
      <Route path="/results-review" element={<ResultsReviewPage />} />
      <Route path="/leaderboards" element={<LeaderboardPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/seasons" element={<SeasonsPage />} />
      {Object.entries(sectionContent).filter(([path]) => !['/leaderboards', '/events', '/seasons'].includes(path)).map(([path, content]) => <Route key={path} path={path} element={<PlaceholderPage {...content} />} />)}
      <Route path="*" element={<PlaceholderPage eyebrow="404 / OFF THE MAP" title="Page not found" description="This page isn’t part of the league. Head home to find your next destination." icon="rules" />} />
    </Routes></main>
    <footer className="site-footer container"><div><Link to="/" aria-label="Modern League home"><Brand /></Link><p>A community built for the competition.</p></div><div className="footer-right"><Link to="/rules">League rules <ArrowUpRight size={14} /></Link><Link to="/admin">Administrator sign in</Link><p>Independent community league. Not affiliated with Wizards of the Coast.</p><span>© 2027 Modern League</span></div></footer>
  </div>;
}
