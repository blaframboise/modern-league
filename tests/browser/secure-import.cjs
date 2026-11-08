// Synthetic API interception only. Start the second dev server with:
// VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic npm run dev -- --host 127.0.0.1 --port 5174
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true, args: ['--no-sandbox'] });
  const actor = '00000000-0000-4000-8000-000000000001';
  const assetId = '00000000-0000-4000-8000-000000000003';
  try {
    for (const width of [390,1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(String(error)));
      const drafts = []; const corrections = []; const assets = []; const sandboxPlayers = []; const sandboxAliases=[]; const sandboxTournaments=[]; const sandboxResults=[]; let admin = true; let requests = 0; let orphanPresent = true; let extractFailures = 1;
      const user = { id: actor, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      const token = { access_token: 'synthetic-token', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000) + 3600, expires_in: 3600, user };
      await page.addInitScript(token => { localStorage.setItem('sb-127-auth-token', JSON.stringify(token)); }, token);
      await page.route('http://127.0.0.1:54321/**', async route => {
        const request = route.request(); const url = new URL(request.url());
        const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `0-${corrections.length-1}/${corrections.length}` };
        const reply = (data, status=200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/auth/v1/user') return reply(user);
        if (url.pathname === '/rest/v1/rpc/is_administrator') return reply(admin);
        if (url.pathname === '/rest/v1/sandbox_players') {
          if (request.method()==='POST') {
            const row={id:'00000000-0000-4000-8000-000000000009',display_name:request.postDataJSON().display_name,created_at:new Date().toISOString()};
            sandboxPlayers.push(row); return reply(row,201);
          }
          return reply(sandboxPlayers);
        }
        if (url.pathname === '/rest/v1/sandbox_player_aliases') {
          if (request.method()==='POST') { sandboxAliases.push(request.postDataJSON()); return reply([],201); }
          return reply(sandboxAliases);
        }
        if (url.pathname === '/rest/v1/sandbox_tournaments') return reply(sandboxTournaments);
        if (url.pathname === '/rest/v1/sandbox_results') return reply(sandboxResults);
        if (url.pathname === '/rest/v1/rpc/correct_sandbox_tournament_results') {
          if(!admin)return reply({message:'Administrator required'},403);
          const body=request.postDataJSON();
          const event=sandboxTournaments.find(x=>x.id===body.p_tournament);
          if(!event||event.edit_revision!==body.p_expected_edit_revision)return reply({message:'Stale edit revision'},409);
          if(body.p_results.length!==sandboxResults.filter(x=>x.tournament_id===event.id).length)return reply({message:'Missing rows'},400);
          for(const change of body.p_results){
            const result=sandboxResults.find(x=>x.tournament_id===event.id&&x.row_id===change.row_id);
            if(!result)return reply({message:'Unknown row'},400);
            Object.assign(result,{wins:change.wins,losses:change.losses,draws:change.draws});
          }
          event.edit_revision++;
          return reply(event.edit_revision);
        }
        if (url.pathname === '/rest/v1/rpc/import_sandbox_tournament_with_players') {
          const args=request.postDataJSON();
          const id='00000000-0000-4000-8000-000000000010';
          const existingIndex=sandboxTournaments.findIndex(row=>row.draft_id===args.p_draft);
          const nextTournament={id,draft_id:args.p_draft,revision:args.p_revision,event_name:args.p_name,season_ordinal:args.p_season,scheduled_rounds:args.p_rounds,edit_revision:existingIndex>=0?sandboxTournaments[existingIndex].edit_revision:0,created_at:new Date().toISOString()};
          if(existingIndex>=0)sandboxTournaments[existingIndex]=nextTournament;else sandboxTournaments.push(nextTournament);
          for(let i=sandboxResults.length-1;i>=0;i--)if(sandboxResults[i].tournament_id===id)sandboxResults.splice(i,1);
          args.p_links.forEach((row,index)=>{
            let playerId=row.player_id;
            if(!playerId){
              playerId=`00000000-0000-4000-8000-${String(index+20).padStart(12,'0')}`;
              sandboxPlayers.push({id:playerId,display_name:row.display_name,created_at:new Date().toISOString()});
            }
            sandboxResults.push({tournament_id:id,row_id:row.row_id,player_id:playerId,wins:row.wins,losses:row.losses,draws:row.draws});
          });
          return reply(id);
        }
        if (url.pathname === '/rest/v1/proposed_calendar_settings')
          return reply({year:2027,revision:0,overrides:{}});
        if (url.pathname === '/rest/v1/import_drafts') return reply(url.searchParams.has('id') ? drafts.find(d => `eq.${d.id}` === url.searchParams.get('id')) : drafts);
        if (url.pathname === '/rest/v1/import_corrections') return reply(corrections);
        if (url.pathname === '/rest/v1/screenshot_assets') return reply(assets);
        if (url.pathname.startsWith('/storage/v1/object/')) return route.fulfill({ headers, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=', 'base64') });
        if (url.pathname === '/functions/v1/screenshot-import') {
          requests++; const id = request.headers()['x-draft-id']; const action = url.searchParams.get('action');
          if (action === 'retention-delete-orphan') { orphanPresent=false; return reply({deleted:true,auditId:'synthetic-success'}); }
          if (action === 'retention-preview') return reply({candidates:orphanPresent ? [{object_path:`${actor}/${id}/${'c'.repeat(64)}`,asset_id:null,draft_id:null,retention_reason:'orphan_24h',activity_at:'2026-10-01T00:00:00Z'}] : []});
          if (action === 'extract') {
            if (extractFailures-- > 0) return reply({error:'OpenAI rejected the image analysis request (400). Check model access and request compatibility.'},400);
            const sourceId=request.postDataJSON().sourceId;
            const mk=(value)=>({value,status:value===null?'missing':'suggested',sources:value===null?[]:[sourceId],warnings:[]});
            const metadata=['name','eventId','sourceKey','date','time','timeZone','offset','year','seasonId','kind','scheduledRounds'];
            const tournament=Object.fromEntries(metadata.map(k=>[k,mk(k==='name'?'AI synthetic event':null)]));
            const fields=Object.fromEntries(['importedName','wins','losses','draws','finalPosition'].map(k=>[k,mk(k==='importedName'?'AI synthetic name':null)]));
            return reply({report:{version:1,provider:'OpenAI test fixture',fictional:false,warnings:['Synthetic preview'],tournament,results:[{rowId:'suggested-1',fields}]},usage:{input_tokens:1,output_tokens:1}});
          }
          if (action === 'create') { drafts.push({ id, created_by: actor, original: { tournament: { eventId:'',sourceKey:'',name:'',date:'',start:null,year:0,kind:'',scheduledRounds:null }, results:[] } }); return reply({ id }); }
          if (action === 'upload') { assets.push({ id: assetId, draft_id: id, object_path: `${actor}/${id}/synthetic`, mime_type:'image/png',byte_size:68,sha256:'a'.repeat(64) }); return reply(assets[0]); }
          if (action === 'correct') {
            const body = request.postDataJSON();
            corrections.push({ id: `revision-${body.revision}`, draft_id:id, revision:body.revision, snapshot:{ values:body.values, reason:body.reason, extractionConfirmations:[] }, reason:body.reason }); return reply({ revision:body.revision });
          }
        }
        throw new Error(`Unexpected synthetic request ${url.pathname}`);
      });
      await page.goto(`${process.env.SECURE_BASE_URL || 'http://127.0.0.1:5174'}/official-import`);
      await page.getByRole('heading',{name:'Upload Results'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Create private draft'}).count(),0);
      await page.getByLabel('Choose tournament screenshot').setInputFiles({
        name:'synthetic.png',mimeType:'image/png',
        buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=','base64')
      });
      await page.getByRole('heading',{name:'Confirm your screenshot'}).waitFor();
      await page.getByRole('img',{name:'Tournament screenshot selected for analysis'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Submit image for analysis'}).isDisabled(),true);
      await page.getByRole('checkbox',{name:/I have permission to process this screenshot/}).check();
      await page.getByRole('button',{name:'Submit image for analysis'}).click();
      await page.getByRole('heading',{name:'Review extracted results'}).waitFor();
      await page.getByText('OpenAI rejected the image analysis request',{exact:false}).waitFor();
      assert.equal(corrections.length,0);
      await page.getByRole('button',{name:'Retry image analysis'}).click();
      await page.getByText('Extraction complete.',{exact:false}).waitFor();
      assert.equal(await page.getByLabel('Event name').inputValue(),'AI synthetic event');
      assert.equal(await page.getByLabel('Player 1 name').inputValue(),'AI synthetic name');
      assert.equal(corrections.length,0);
      assert.equal(await page.getByLabel('Player 1 name').isDisabled(),true);
      assert.equal(await page.getByLabel('Event type',{exact:true}).count(),0);
      await page.getByText('Calendar classification',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Make corrections'}).click();
      await page.getByLabel('Event name').fill('Human-checked result');
      await page.getByLabel('Date',{exact:true}).fill('2027-02-01');
      await page.getByText('REG · 2027 Season 1 regular Modern').waitFor();
      await page.getByLabel('Player 1 name').fill('jane doe');
      await page.getByRole('button',{name:'Suggest name capitalization'}).click();
      assert.equal(await page.getByLabel('Player 1 name').inputValue(),'Jane Doe');
      await page.getByLabel('Player 1 name').fill('Verified player');
      await page.getByLabel('Player 1 wins').fill('2');
      await page.getByLabel('Player 1 losses').fill('0');
      await page.getByLabel('Player 1 draws').fill('0');
      await page.getByRole('checkbox',{name:/I checked the tournament date/}).check();
      await page.getByRole('button',{name:'Save corrected results'}).click();
      await page.getByRole('heading',{name:'Review saved'}).waitFor({timeout:6000}).catch(async failure=>{throw new Error(`Second correction failed: ${await page.locator('.import-feedback').allTextContents()} ${String(failure)}`)});
      assert.equal(corrections.length,1);
      assert.equal(corrections[0].snapshot.values.tournament.name,'Human-checked result');
      assert.equal(corrections[0].snapshot.values.tournament.year,2027);
      assert.equal(corrections[0].snapshot.values.tournament.kind,'regular');
      assert.equal(corrections[0].snapshot.values.tournament.seasonId,'s1');
      assert.equal(corrections[0].snapshot.values.results[0].playerId,null);
      await page.getByRole('button',{name:'Continue to player matching (test only)'}).click();
      await page.getByRole('heading',{name:'Test workspace'}).waitFor();
      await page.getByRole('heading',{name:'Confirm players and test results'}).waitFor();
      await page.getByLabel('Match Verified player').waitFor();
      assert.equal(await page.getByLabel('Reviewed screenshot').inputValue(),drafts[0].id);
      assert.equal(await page.getByLabel('Match Verified player').inputValue(),'');
      assert.equal(await page.getByLabel('Display name for Verified player').inputValue(),'Verified Player');
      await page.getByText('Projected points',{exact:true}).waitFor();
      await page.getByRole('checkbox',{name:/I verified player identities/}).check();
      await page.getByRole('button',{name:'Save tournament and update test standings'}).click();
      await page.getByText('Test tournament saved.',{exact:false}).waitFor();
      await page.getByRole('heading',{name:'2027 scoring simulation'}).waitFor();
      await page.getByRole('cell',{name:'Verified Player',exact:true}).waitFor();
      assert.equal(sandboxPlayers.length,1);
      assert.equal(sandboxResults.length,1);
      assert.equal(sandboxTournaments.length,1);
      assert.equal(sandboxTournaments[0].event_name,'Human-checked result - 020127');
      await page.goto(`${process.env.SECURE_BASE_URL || 'http://127.0.0.1:5174'}/official-import`);
      await page.getByRole('heading',{name:'Choose a tournament screenshot'}).waitFor();
      await page.locator('details.import-secondary > summary').click();
      await page.getByLabel('Open an earlier draft').selectOption(drafts[0].id);
      await page.getByRole('heading',{name:'Review saved'}).waitFor();
      assert.equal(await page.getByLabel('Event name').inputValue(),'Human-checked result');
      await page.getByRole('button',{name:'Edit saved draft'}).click();
      await page.getByRole('button',{name:'Suggest name capitalization'}).waitFor();
      assert.equal(await page.getByLabel('Player 1 name').isEnabled(),true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(`${process.env.SECURE_BASE_URL || 'http://127.0.0.1:5174'}/admin`);
      await page.getByRole('link',{name:'Test players, tournament matching and leaderboard'}).waitFor();
      await page.getByRole('link',{name:'Edit a Tournament’s Results'}).click();
      await page.getByRole('heading',{name:'Edit a Tournament’s Results'}).waitFor();
      await page.getByRole('button',{name:/Human-checked result - 020127/}).click();
      await page.getByRole('heading',{name:'Human-checked result - 020127'}).waitFor();
      assert.equal(await page.getByRole('checkbox',{name:/screenshot/}).count(),0);
      assert.equal(await page.getByRole('button',{name:'Continue to player matching (test only)'}).count(),0);
      await page.getByLabel('Verified Player wins').fill('1');
      await page.getByLabel('Verified Player losses').fill('1');
      await page.getByRole('button',{name:'Save Changes'}).click();
      await page.getByText('Changes saved.',{exact:false}).waitFor();
      assert.equal(sandboxTournaments.length,1);
      assert.equal(sandboxTournaments[0].revision,1);
      assert.equal(sandboxTournaments[0].edit_revision,1);
      assert.equal(sandboxResults.length,1);
      assert.equal(sandboxResults[0].wins,1);
      await page.goto(`${process.env.SECURE_BASE_URL || 'http://127.0.0.1:5174'}/admin`);
      if (width < 600) await page.getByRole('button',{name:'Open navigation'}).click();
      await page.getByRole('link',{name:'Admin',exact:true}).waitFor();
      await page.getByRole('link',{name:'Test players, tournament matching and leaderboard'}).click();
      await page.getByRole('heading',{name:'Test workspace'}).waitFor();
      await page.getByRole('button',{name:'Tournament matching'}).click();
      await page.getByLabel('Reviewed screenshot').selectOption(drafts[0].id);
      await page.getByRole('heading',{name:'Confirm players and test results'}).waitFor();
      await page.getByRole('cell',{name:'Verified player',exact:true}).waitFor();
      admin = false; const before = requests;
      await page.reload();
      await page.getByText('Administrator sign-in required.').waitFor();
      assert.equal(await page.getByLabel('Choose tournament screenshot').count(),0);
      assert.equal(await page.getByRole('link',{name:'Admin',exact:true}).count(),0);
      assert.equal(requests,before);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Private draft workflow: synthetic upload/review/recovery, session preservation, non-admin gate, mobile/desktop passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
