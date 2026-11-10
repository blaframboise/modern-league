import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production includes build metadata and an update check for installed home-screen apps', async()=>{
  const vite=await readFile('vite.config.ts','utf8');
  const page=await readFile('src/pages/HomePage.tsx','utf8');
  const panel=await readFile('src/components/AppVersionPanel.tsx','utf8');
  assert.match(vite,/version\.json/);
  assert.match(vite,/GITHUB_SHA/);
  assert.match(page,/<AppVersionPanel\s*\/>/);
  assert.match(panel,/cache: 'no-store'/);
  assert.match(panel,/visibilitychange/);
  assert.match(panel,/window\.location\.replace/);
  assert.match(panel,/Check for updates/);
  assert.match(panel,/Refresh app/);
});
test('GitHub Pages recovers old direct links to hash routes',async()=>{
  const html=await readFile('public/404.html','utf8');
  assert.match(html,/\/modern-league\//);
  assert.match(html,/window\.location\.pathname/);
  assert.match(html,/window\.location\.search/);
  assert.match(html,/window\.location\.replace/);
});
