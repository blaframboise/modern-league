import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveConfig } from 'vite';

test('Vite scopes production assets to the repository but keeps development at root', async () => {
  assert.equal((await resolveConfig({}, 'build')).base, '/modern-league/');
  assert.equal((await resolveConfig({}, 'serve')).base, '/');
});

test('Pages workflow builds main with public repository variables and deploys only the build artifact', async () => {
  const workflow = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
  assert.match(workflow, /push:\s+branches: \[main\]/);
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
    assert.ok(workflow.includes(`${name}: \u0024{{ vars.${name} }}`));
  }
  for (const command of ['npm ci', 'npm run typecheck', 'npm test', 'npm run build']) assert.ok(workflow.includes(command));
  assert.match(workflow, /actions\/upload-pages-artifact@v3\s+with:\s+path: dist/);
  assert.match(workflow, /needs: build/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
