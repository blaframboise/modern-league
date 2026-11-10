import { Link } from 'react-router-dom';
const stages=['Upload','Analyze','Verify results','Match players','Submit'] as const;
export type ImportStage=1|2|3|4|5|6;
export function ImportProgress({stage,draftId}:{stage:ImportStage;draftId?:string|null}) {
  return <nav className="league-workflow" aria-label="Tournament submission progress">
    <ol>{stages.map((name,index)=>{
      const number=index+1;
      const done=number<stage;
      const current=number===stage;
      const href=number===3&&draftId?'/official-import?draft='+encodeURIComponent(draftId):
        number===4&&draftId?'/publish-results?draft='+encodeURIComponent(draftId):null;
      return <li key={name} className={done?'is-complete':current?'is-current':'is-upcoming'} aria-current={current?'step':undefined}>
        <span className="league-workflow-step">{done?'✓':number}</span>
        {href&&(done||current)
          ?<Link to={href} className="league-workflow-label">{name}</Link>
          :<span className="league-workflow-label">{name}</span>}
      </li>;
    })}</ol>
    <p role="status">{stage===6?'Submitted and saved':`Step ${stage} of 5`} · Progress can be resumed after closing the app.</p>
  </nav>;
}
