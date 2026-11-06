import { ArrowLeft, CalendarDays, Layers3, ScrollText, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';

const icons = { leaderboards: Trophy, events: CalendarDays, seasons: Layers3, rules: ScrollText };
type SectionContent = { eyebrow: string; title: string; description: string; icon: keyof typeof icons; emptyTitle?: string; emptyDescription?: string };
export const sectionContent: Record<string, SectionContent> = {
  '/leaderboards': { eyebrow: 'THE PLAYERS / THE PURSUIT', title: 'Leaderboards', description: 'Every match moves the story forward. This is where the league’s player standings will live.', icon: 'leaderboards', emptyTitle: 'A clean slate. A new chase.', emptyDescription: 'Player standings will appear once tournament results are available. Seasonal and annual standings are planned.' },
  '/events': { eyebrow: 'FIND YOUR NEXT CHALLENGE', title: 'Events', description: 'Your next seat at the table starts here. Explore the league’s upcoming Modern tournaments.', icon: 'events', emptyTitle: 'The calendar is taking shape.', emptyDescription: 'No events have been announced yet. Tournament schedules and result imports are planned for a future update.' },
  '/seasons': { eyebrow: 'THE ROAD TO THE CHAMPIONSHIP', title: 'Seasons', description: 'A year of competition, with milestones worth playing for.', icon: 'seasons', emptyTitle: 'The 2027 story is yet to be written.', emptyDescription: 'Season schedules, seasonal championships, and the annual championship will be announced here.' },
  '/rules': { eyebrow: 'KNOW THE GAME PLAN', title: 'Rules', description: 'A shared understanding makes for a stronger league. Find league policies and competition details here.', icon: 'rules', emptyTitle: 'The playbook is in progress.', emptyDescription: 'League rules, eligibility, and championship qualification details have not been published yet.' },
};
export function PlaceholderPage({ eyebrow, title, description, icon, emptyTitle, emptyDescription }: SectionContent) {
  const Icon = icons[icon];
  return <div className="container placeholder-page"><p className="eyebrow">{eyebrow}</p><h1>{title}<span className="gold">.</span></h1><p className="page-description">{description}</p>{emptyTitle && <section className="empty-state"><span className="empty-icon"><Icon size={32} strokeWidth={1.3} /></span><span className="pill">COMING SOON</span><h2>{emptyTitle}</h2><p>{emptyDescription}</p></section>}<Link className="back-link" to="/"><ArrowLeft size={16} /> Back to home</Link></div>;
}
