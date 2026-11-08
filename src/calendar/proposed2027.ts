/** Tentative planning calendar. Not confirmed store events or published official league schedule. */
export type ProposedSlot = {date:string;kind:'modern'|'prerelease'|'seasonal'|'annual';title:string;season:number;releaseDate?:string};
export const releaseDates2027 = [
  {name:'Nauctis: The Sunken Realm',date:'2027-02-05'},
  {name:'Marvel: Darkhold Destiny',date:'2027-04-09'},
  {name:'Kamigawa: Titanbreach',date:'2027-06-04'},
  {name:'Universes Beyond (title not announced)',date:'2027-08-06'},
  {name:'Zhalfir',date:'2027-10-01'},
  {name:'Universes Beyond (title not announced)',date:'2027-11-19'},
] as const;
/** Suggested championship Friday dates; deliberately not published as confirmations.
 * September 24 is reserved for a likely Zhalfir prerelease.
 * December 31 is New Year's Eve, a high-risk placeholder needing store approval.
 */
export const proposedChampionships2027 = [
  {date:'2027-03-26',kind:'seasonal' as const,title:'Season 1 Championship (proposed)',season:1},
  {date:'2027-06-25',kind:'seasonal' as const,title:'Season 2 Championship (proposed)',season:2},
  {date:'2027-09-17',kind:'seasonal' as const,title:'Season 3 Championship (proposed)',season:3},
  {date:'2027-12-17',kind:'seasonal' as const,title:'Season 4 Championship (proposed)',season:4},
  {date:'2027-12-31',kind:'annual' as const,title:'Annual Championship (high-risk holiday proposal)',season:4},
] as const;
export function proposedCalendar2027():ProposedSlot[] {
  const prereleases=new Map(releaseDates2027.map(set=>{
    const when=new Date(set.date+'T12:00:00Z');when.setUTCDate(when.getUTCDate()-7);
    return [when.toISOString().slice(0,10),set] as const;
  }));
  const champs=new Map<string,(typeof proposedChampionships2027)[number]>(proposedChampionships2027.map(s=>[s.date,s]));
  const slots:ProposedSlot[]=[];
  for(let i=0;i<365;i++){
    const date=new Date(Date.UTC(2027,0,1+i));
    const weekday=date.getUTCDay();
    if(weekday!==1&&weekday!==5)continue;
    const iso=date.toISOString().slice(0,10);
    const pre=prereleases.get(iso),champ=champs.get(iso);
    const season=proposedChampionships2027.filter(c=>c.kind==='seasonal'&&iso>=c.date).length+1;
    if(pre)slots.push({date:iso,kind:'prerelease',title:`Likely prerelease — ${pre.name} (no Modern assumed)`,season,releaseDate:pre.date});
    else if(champ)slots.push({date:iso,kind:champ.kind,title:champ.title,season:champ.season});
    else slots.push({date:iso,kind:'modern',title:'Modern — proposed 6:00 p.m.',season});
  }
  return slots;
}
