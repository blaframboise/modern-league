import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '../src/data/client.ts';
import { leagueRepository } from '../src/data/repository.ts';
import type { Database } from '../src/data/database.ts';

test('browser client remains optional and rejects incomplete/secret configuration', () => {
  assert.equal(createBrowserClient({}), null);
  for (const key of [undefined, 'sb_secret_test', 'service-role-token']) {
    assert.throws(() => createBrowserClient({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key }));
  }
  assert.throws(() => createBrowserClient({ VITE_SUPABASE_URL: 'http://remote.example', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }));
});
test('repository reads public projection, checks authorization and propagates database errors', async () => {
  const calls: string[] = [];
  let deny = false;
  const client = createClient<Database>('https://example.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      calls.push(String(input));
      if (deny) return new Response(JSON.stringify({ message: 'denied', code: '42501' }), { status: 403 });
      return new Response(JSON.stringify(String(input).includes('/rpc/') ? true : [{ result_id: 'test', public_snapshot: {}, published_at: 'now' }]), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const repository = leagueRepository(client);
  assert.equal(await repository.isAdministrator(), true);
  assert.equal((await repository.publishedResults())?.length, 1);
  assert.match(calls[1], /published_results/);
  assert.ok(!calls[1].includes('original'));
  deny = true;
  await assert.rejects(repository.drafts(), /denied/);
  assert.ok(!('approve' in repository));
  assert.ok(!('publish' in repository));
});
