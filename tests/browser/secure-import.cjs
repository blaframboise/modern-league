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
      const drafts = []; const corrections = []; const assets = []; let admin = true; let requests = 0; let orphanPresent = true;
      const user = { id: actor, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      const token = { access_token: 'synthetic-token', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000) + 3600, expires_in: 3600, user };
      await page.addInitScript(token => { localStorage.setItem('sb-127-auth-token', JSON.stringify(token)); }, token);
      await page.route('http://127.0.0.1:54321/**', async route => {
        const request = route.request(); const url = new URL(request.url());
        const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `0-${corrections.length-1}/${corrections.length}` };
        const reply = (data, status=200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/auth/v1/user') return reply(user);
        if (url.pathname === '/rest/v1/rpc/is_administrator') return reply(admin);
        if (url.pathname === '/rest/v1/import_drafts') return reply(url.searchParams.has('id') ? drafts.find(d => `eq.${d.id}` === url.searchParams.get('id')) : drafts);
        if (url.pathname === '/rest/v1/import_corrections') return reply(corrections);
        if (url.pathname === '/rest/v1/screenshot_assets') return reply(assets);
        if (url.pathname.startsWith('/storage/v1/object/')) return route.fulfill({ headers, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=', 'base64') });
        if (url.pathname === '/functions/v1/screenshot-import') {
          requests++; const id = request.headers()['x-draft-id']; const action = url.searchParams.get('action');
          if (action === 'retention-preview') return reply({candidates:[{object_path:`${actor}/${id}/${'c'.repeat(64)}`,asset_id:null,draft_id:null,retention_reason:'orphan_24h',activity_at:'2026-10-01T00:00:00Z'}]});
          if (action === 'create') { drafts.push({ id, created_by: actor, original: { tournament: { eventId:'',sourceKey:'',name:'',date:'',start:null,year:0,kind:'',scheduledRounds:null }, results:[] } }); return reply({ id }); }
          if (action === 'upload') { assets.push({ id: assetId, draft_id: id, object_path: `${actor}/${id}/synthetic`, mime_type:'image/png',byte_size:68,sha256:'a'.repeat(64) }); return reply(assets[0]); }
          if (action === 'correct') {
            const body = request.postDataJSON();
            corrections.push({ id: 'revision-1', draft_id:id, revision:body.revision, snapshot:{ values:body.values, reason:body.reason, extractionConfirmations:[] }, reason:body.reason }); return reply({ revision:1 });
          }
        }
        throw new Error(`Unexpected synthetic request ${url.pathname}`);
      });
      await page.goto(`${process.env.SECURE_BASE_URL || 'http://127.0.0.1:5174'}/official-import`);
      await page.getByRole('button',{name:'Create private draft'}).waitFor();
      await page.getByText('Screenshot retention review (read-only)').click();
      await page.getByRole('button',{name:'Check retention eligibility'}).click();
      await page.getByText('Retention review refreshed.',{exact:false}).waitFor();
      await page.locator('li').filter({hasText:'Abandoned upload — source'}).first().waitFor();

      await page.getByRole('button',{name:'Create private draft'}).click();
      await page.getByText('Empty private draft saved.', {exact:false}).waitFor();
      assert.equal(await page.locator('input[type=file]').isDisabled(),true);
      await page.getByRole('checkbox',{name:/I have permission to upload/}).check();
      assert.equal(await page.locator('input[type=file]').isEnabled(),true);
      await page.locator('input[type=file]').setInputFiles({ name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=', 'base64') });
      await page.getByText('Sources saved privately.',{exact:false}).waitFor();
      await page.getByRole('button',{name:`View source ${assetId}`}).click();
      await page.getByRole('img',{name:'Private tournament source for human evidence review'}).waitFor();
      const editor = page.getByLabel('Review values', {exact:false});
      const values = JSON.parse(await editor.inputValue()); values.tournament.name = 'Synthetic manual name';
      await editor.fill(JSON.stringify(values));
      await page.getByRole('button',{name:'Prepare field evidence form'}).click();
      await page.getByLabel('Field evidence JSON',{exact:false}).fill(JSON.stringify([{ path:'tournament.name',sources:[assetId],note:'Synthetic visible name' }]));
      await page.getByLabel('Reason for this correction').fill('Synthetic manual review');
      await page.getByRole('checkbox',{name:/I reviewed the source images/}).check();
      await page.getByRole('button',{name:'Save review revision'}).click();
      await page.getByText('Append-only review revision saved.',{exact:false}).waitFor();
      const unsaved = JSON.parse(await page.getByLabel('Review values',{exact:false}).inputValue()); unsaved.tournament.name = 'Unsaved survives same-user auth event';
      await page.getByLabel('Review values',{exact:false}).fill(JSON.stringify(unsaved));
      await page.evaluate(() => {
        const key = 'sb-127-auth-token'; const oldValue = localStorage.getItem(key); const token = JSON.parse(oldValue); token.access_token = 'refreshed-synthetic';
        const newValue = JSON.stringify(token); localStorage.setItem(key,newValue);
        window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage}));
      });
      await page.waitForTimeout(150);
      assert.equal(JSON.parse(await page.getByLabel('Review values',{exact:false}).inputValue()).tournament.name, unsaved.tournament.name);
      await page.reload();
      await page.getByRole('button',{name:'Create private draft'}).waitFor();
      await page.getByLabel('Recover saved draft').selectOption(drafts[0].id);
      await page.getByText('Draft and full audit history recovered.').waitFor();
      assert.equal(JSON.parse(await page.getByLabel('Review values',{exact:false}).inputValue()).tournament.name,'Synthetic manual name');
      assert.ok(await page.evaluate(() => !!JSON.parse(localStorage.getItem('sb-127-auth-token')).access_token));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      admin = false; const before = requests;
      await page.reload();
      await page.getByText('Administrator sign-in required.').waitFor();
      assert.equal(await page.getByRole('button',{name:'Create private draft'}).count(),0);
      assert.equal(requests,before);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Private draft workflow: synthetic upload/review/recovery, session preservation, non-admin gate, mobile/desktop passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
