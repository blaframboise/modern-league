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
   let published=[],history=[],publishes=0,corrects=0;
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
   await page.getByRole('heading',{name:'Publish Results'}).waitFor();
   await page.getByLabel('Reviewed tournament').selectOption(draft);
   await page.getByText('Synthetic FNM',{exact:true}).first().waitFor();
   await page.getByLabel('Publication reason').fill('Reviewed original result');
   await page.getByRole('checkbox',{name:/I verified the store.s results/}).check();
   const publish=page.getByRole('button',{name:'Publish Results',exact:true});
   assert.equal(await publish.isEnabled(),true);
   await publish.click();
   await page.getByText('Published official tournament result',{exact:false}).waitFor();
   assert.equal(publishes,1);
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
   assert.equal(await page.getByText('3–0–0').count(),0);
   assert.deepEqual(errors,[]);
   console.log('PASS synthetic official publish and correction UI at viewport '+width);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
