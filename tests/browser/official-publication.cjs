// Entirely synthetic browser test of official publication and correction pages.
// No access to real Supabase; every endpoint is intercepted.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.clock.install({time:new Date('2027-01-06T18:00:00Z')});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const actor='00000000-0000-4000-8000-000000000001',draft='00000000-0000-4000-8000-000000000002';
   const original={tournament:{eventId:'',sourceKey:'',name:'Synthetic FNM',date:'2027-01-04',start:null,year:2027,seasonId:'s1',kind:'regular',scheduledRounds:3},
     results:[{rowId:'p1',importedName:'Chris Example',playerId:null,wins:3,losses:0,draws:0,finalPosition:1},
      {rowId:'p2',importedName:'Taylor Example',playerId:null,wins:2,losses:1,draws:0,finalPosition:2}]};
   const user={id:actor,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:'2027-01-06T18:00:00Z'};
   const token={access_token:'synthetic-token',refresh_token:'synthetic-refresh',token_type:'bearer',expires_at:Math.floor(new Date('2027-01-08').getTime()/1000),expires_in:86400,user};
   await page.addInitScript(t=>localStorage.setItem('sb-127-auth-token',JSON.stringify(t)),token);
   let published=[],history=[],publishes=0,corrects=0,testSaves=0,testEvents=[],testResults=[];
   const eventId='00000000-0000-4000-8000-000000000009';
   await page.route('http://127.0.0.1:54321/**',async route=>{
     const request=route.request(),url=new URL(request.url());
     const headers={'access-control-allow-origin':'*','access-control-expose-headers':'content-range','content-range':'0-0/1'};
     const reply=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
     if(url.pathname==='/auth/v1/user')return reply(user);
     if(url.pathname==='/rest/v1/rpc/is_administrator')return reply(true);
     if(url.pathname==='/rest/v1/import_drafts'){
       const row={id:draft,created_by:actor,original,created_at:'2027-01-06T00:00:00Z'};
       return reply(url.searchParams.has('id')?row:[row]);
     }
     if(url.pathname==='/rest/v1/import_corrections')return reply([{id:'00000000-0000-4000-8000-000000000003',draft_id:draft,revision:1,reason:'Verified fixture',snapshot:{values:original,reason:'Verified fixture'},created_at:'2027-01-06T00:00:00Z'}]);
     if(url.pathname==='/rest/v1/players')return reply([]);
     if(url.pathname==='/rest/v1/player_identities')return reply([]);
     if(url.pathname==='/rest/v1/sandbox_players')return reply([{id:'00000000-0000-4000-8000-000000000031',display_name:'Chris Example'}]);
     if(url.pathname==='/rest/v1/sandbox_player_aliases')return reply([]);
     if(url.pathname==='/rest/v1/sandbox_tournaments')return reply(testEvents);
     if(url.pathname==='/rest/v1/sandbox_results')return reply(testResults);
     if(url.pathname==='/rest/v1/rpc/import_sandbox_tournament_with_players'){
       testSaves++;
       const input=request.postDataJSON();
       assert.equal(input.p_draft,draft);
       assert.equal(input.p_revision,1);
       assert.equal(input.p_season,1);
       assert.equal(input.p_links.length,2);
       assert.equal(input.p_links[0].player_id,'00000000-0000-4000-8000-000000000031');
       const id='00000000-0000-4000-8000-000000000099';
       testEvents=[{id,draft_id:draft,event_name:input.p_name,revision:1,season_ordinal:1,scheduled_rounds:input.p_rounds,created_at:new Date().toISOString()}];
       testResults=input.p_links.map((p,i)=>({tournament_id:id,row_id:p.row_id,player_id:p.player_id||'00000000-0000-4000-8000-000000000032',wins:p.wins,losses:p.losses,draws:p.draws}));
       return reply(id);
     }
     if(url.pathname==='/rest/v1/proposed_calendar_settings')return reply({year:2027,revision:0,overrides:{}});
     if(url.pathname==='/rest/v1/effective_published_results')return reply(published);
     if(url.pathname==='/rest/v1/rpc/official_correction_history')return reply(history);
     if(url.pathname==='/rest/v1/rpc/publish_reviewed_tournament'){
       publishes++; const input=request.postDataJSON();
       assert.equal(input.p_confirm,true);assert.equal(input.p_links.length,2);
       published=[{result_id:eventId,published_at:'2027-01-06T19:00:00Z',public_snapshot:{
         version:1,date:'2027-01-04',name:'Synthetic FNM',year:2027,season:1,kind:'regular',scheduledRounds:3,
         players:input.p_links.map((p,i)=>({playerId:i===0?'00000000-0000-4000-8000-000000000011':'00000000-0000-4000-8000-000000000012',
           name:p.displayName,wins:i===0?3:2,losses:i===0?0:1,draws:0,finalPosition:null,points:i===0?10:6.67}))}}];
       return reply(eventId);
     }
     if(url.pathname==='/rest/v1/rpc/correct_official_tournament'){
       corrects++;const input=request.postDataJSON();
       assert.equal(input.p_result,eventId);assert.equal(input.p_confirm,true);assert.equal(input.p_expected_revision,0);
       const previous=published[0].public_snapshot;
       const next={...previous,players:previous.players.map(x=>{
         const change=input.p_players.find(p=>p.playerId===x.playerId);
         return {...x,wins:change.wins,losses:change.losses,draws:change.draws,finalPosition:null,points:change.wins*10/3};
       })};
       history=[{result_id:eventId,revision:1,reason:input.p_reason,actor,created_at:'2027-01-06T20:00:00Z',previous_snapshot:previous,corrected_snapshot:next}];
       published=[{...published[0],public_snapshot:next}];
       return reply(1);
     }
     throw Error('Unhandled synthetic API endpoint '+request.method()+' '+url.pathname);
   });
   await page.goto((process.env.SECURE_BASE_URL||'http://127.0.0.1:5174')+'/publish-results');
   await page.getByRole('heading',{name:'Match and Publish Results'}).waitFor();
   // Native iPhone controls must be unmistakably interactive, not plain text.
   const selector=page.getByLabel('Reviewed tournament');
   await selector.waitFor();
   const appearance=await selector.evaluate(element=>{
     const css=getComputedStyle(element);
     return {border:parseFloat(css.borderTopWidth),background:css.backgroundColor,height:element.getBoundingClientRect().height};
   });
   assert.ok(appearance.border>=2,'Saved-event selector must have a visible border');
   assert.ok(appearance.height>=48,'Saved-event selector needs a full touch target');
   assert.notEqual(appearance.background,'rgba(0, 0, 0, 0)','Select must have a contrasting background');
   await page.getByText('Step 4 of 5',{exact:false}).waitFor();
   await page.getByLabel('Reviewed tournament').selectOption(draft);
   await page.getByText('Synthetic FNM',{exact:true}).first().waitFor();
   await page.getByLabel('Publication reason').fill('Reviewed original result');
   await page.getByRole('checkbox',{name:/I verified the store.s results/}).check();
   const publish=page.getByRole('button',{name:'Publish Results',exact:true});
   assert.equal(await publish.isEnabled(),true);
   await publish.click();
   await page.getByText('Published official tournament result',{exact:false}).waitFor();
   assert.equal(publishes,1);
   await page.getByRole('heading',{name:'Official tournament published'}).waitFor();
   const officialPrimary=page.getByRole('link',{name:'1. View official standings'});
   assert.equal(await officialPrimary.getAttribute('href'),'/leaderboards');
   assert.equal(await page.getByRole('link',{name:'2. Correct official results'}).getAttribute('href'),'/correct-official-results');
   assert.equal(await page.getByRole('link',{name:'Upload another tournament'}).count(),1);
   assert.equal(await page.getByRole('link',{name:'Return to administration'}).count(),1);
   assert.equal(await page.getByLabel('Reviewed tournament').count(),0,'Hide editing form after official publication');
   assert.equal((await officialPrimary.evaluate(el=>getComputedStyle(el).borderTopWidth)),'2px');
   await page.goto((process.env.SECURE_BASE_URL||'http://127.0.0.1:5174')+'/correct-official-results');
   await page.getByRole('heading',{name:'Correct Published Results'}).waitFor();
   await page.getByLabel('Published tournament').selectOption(eventId);
   await page.getByRole('heading',{name:/Synthetic FNM/}).waitFor();
   await page.getByLabel('Chris Example corrected wins').fill('2');
   await page.getByLabel('Chris Example corrected losses').fill('1');
   await page.getByLabel('Taylor Example corrected wins').fill('3');
   await page.getByLabel('Taylor Example corrected losses').fill('0');
   await page.getByLabel('Correction reason (required)').fill('Store verified match record change');
   await page.getByRole('checkbox',{name:/I verified this correction/}).check();
   await page.getByRole('button',{name:'Save audited official correction'}).click();
   await page.getByText('Official correction revision 1 saved.',{exact:false}).waitFor();
   assert.equal(corrects,1);
   assert.equal(await page.getByText('Official correction history (1)').count(),1);
   assert.equal(await page.getByText('2–1–0',{exact:true}).count(),1);
   assert.equal(await page.getByText('3–0–0',{exact:true}).count(),1);
   // Public pages must consume the corrected effective projection, not the original.
   for(const [path,heading] of [
     ['/leaderboards','Overall League Standings'],
     ['/leaderboards/top-16','Annual Leaderboard'],
     ['/leaderboards/tv','Annual Leaderboard']
   ]){
     await page.goto((process.env.SECURE_BASE_URL||'http://127.0.0.1:5174')+path);
     await page.getByRole('heading',{name:heading}).waitFor();
     await page.getByText('Taylor Example',{exact:true}).first().waitFor();
     await page.getByText('Chris Example',{exact:true}).first().waitFor();
     assert.equal(await page.getByText('10.00',{exact:true}).count()>0,true,'Expected corrected winner points on '+path);
   }
   // 2026 results are rehearsal-only: use existing test roster and never write official data.
   original.tournament.date='2026-11-09';
   original.tournament.year=2026;
   original.tournament.name='Synthetic 2026 MNM';
   original.tournament.scheduledRounds=null; // Real 2026 screenshot lacked this field.
   const publishesBeforeRehearsal=publishes;
   await page.goto((process.env.SECURE_BASE_URL||'http://127.0.0.1:5174')+'/publish-results?draft='+draft);
   await page.getByText('2026 preseason rehearsal.',{exact:false}).waitFor();
   await page.getByText('Synthetic 2026 MNM',{exact:true}).first().waitFor();
   await page.getByText('Swiss rounds: select the total rounds played',{exact:false}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Save test tournament and update standings'}).isDisabled(),true);
   await page.getByLabel('Swiss rounds played').selectOption('3');
   assert.equal(await page.getByText('Swiss rounds: select the total rounds played',{exact:false}).count(),0);
   assert.equal(await page.getByLabel('Match Chris Example').inputValue(),'00000000-0000-4000-8000-000000000031');
   assert.equal(await page.getByText('19 existing test players available.').count(),0);
   await page.getByLabel('Rehearsal review note').fill('Store record and names checked');
   const check=page.getByRole('checkbox',{name:/I verified the store results/});
   assert.equal(await check.isEnabled(),true);
   await check.check();
   // A partially matched entry must survive a reload on this same device.
   await page.getByLabel('Name for Taylor Example').fill('Taylor New');
   await page.reload();
   await page.getByText('Synthetic 2026 MNM',{exact:true}).first().waitFor();
   assert.equal(await page.getByLabel('Name for Taylor Example').inputValue(),'Taylor New');
   assert.equal(await page.getByLabel('Swiss rounds played').inputValue(),'3','Round count survives reloading an interrupted matching session');
   await page.getByRole('checkbox',{name:/I verified the store results/}).check();
   await page.getByRole('button',{name:'Save test tournament and update standings'}).click();
   await page.getByRole('heading',{name:'Test tournament saved'}).waitFor();
   assert.equal(await page.getByRole('link',{name:'1. View test standings'}).getAttribute('href'),'/test-workspace?view=standings');
   assert.equal(await page.getByRole('link',{name:'2. Correct saved test results'}).getAttribute('href'),'/edit-tournaments');
   assert.equal(await page.getByRole('link',{name:'Upload another tournament'}).count(),1);
   assert.equal(await page.getByRole('link',{name:'Return to administration'}).count(),1);
   assert.equal(testSaves,1,'Rehearsal must persist the real TEST tournament');
   assert.equal(testEvents.length,1);
   assert.equal(testResults.length,2);
   assert.equal(publishes,publishesBeforeRehearsal,'2026 rehearsal must never invoke official publication');
   assert.equal(await page.getByRole('link',{name:'1. View test standings'}).count(),1);
   assert.deepEqual(errors,[]);
   console.log('PASS synthetic official publish, correction, 2026 test identity rehearsal and leaderboards at viewport '+width);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
