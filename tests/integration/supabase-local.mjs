import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { unresolvedOriginal } from '../../src/importInfrastructure/validation.ts';
import { fieldPaths } from '../../src/importInfrastructure/evidence.ts';

// Run exclusively against the disposable local Supabase instance in GitHub Actions.
// No project ref, credentials, users or production Storage objects are hardcoded.
const output = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
const settings = Object.fromEntries(output.split(/\r?\n/).map(line => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  return match ? [match[1], match[2].replace(/^["']|["']$/g, '')] : [];
}).filter(entry => entry.length));
const apiUrl = settings.API_URL;
const anonKey = settings.ANON_KEY ?? settings.PUBLISHABLE_KEY;
const serviceKey = settings.SERVICE_ROLE_KEY ?? settings.SECRET_KEY;
assert.ok(apiUrl && /^(http:\/\/127\.0\.0\.1|http:\/\/localhost):/.test(apiUrl), 'Refusing to test against a remote Supabase API');
assert.ok(anonKey && serviceKey, 'Local Supabase credentials are required');
const authless = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(apiUrl, serviceKey, authless);
const anon = createClient(apiUrl, anonKey, authless);
const ids = [];
const password = 'Test-Only-' + randomUUID() + '-Strong!';
const dbContainer = execFileSync('docker', ['ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}'], { encoding: 'utf8' }).trim().split('\n').find(Boolean);
assert.ok(dbContainer, 'Disposable Supabase Postgres container was not found');
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Ve8AAAAASUVORK5CYII=', 'base64'));

async function createUser(admin) {
  const email = `local-ci-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  assert.ok(data.user?.id);
  ids.push(data.user.id);
  if (admin) {
    assert.match(data.user.id, /^[a-f0-9-]{36}$/i);
    execFileSync('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c',
      `insert into private.administrators(user_id,reason) values ('${data.user.id}','disposable CI fixture');`],
    { stdio: 'pipe' });
  }
  const client = createClient(apiUrl, anonKey, authless);
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  assert.ok(signed.data.session?.access_token);
  return { client, token: signed.data.session.access_token, id: data.user.id };
}

async function api(action, user, draft, { body = {}, mime = 'application/json', origin = 'https://league.example' } = {}) {
  const response = await fetch(`${apiUrl}/functions/v1/screenshot-import?action=${action}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      ...(user ? { authorization: `Bearer ${user.token}` } : {}),
      origin, 'x-draft-id': draft,
      'content-type': mime,
    },
    body: body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function main() {
  // Let the local Edge runtime finish booting, without relying on arbitrary sleep.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const result = await api('create', null, randomUUID());
      if (result.status === 401) break;
    } catch { /* local runtime not ready */ }
    if (attempt === 39) throw new Error('Local Edge Function did not become available');
    await delay(750);
  }
  const owner = await createUser(true);
  const otherAdmin = await createUser(true);
  const nonAdmin = await createUser(false);
  const draft = randomUUID();
  // Private retention candidates are available only after JWT/admin checks.
  assert.equal((await api('retention-preview', nonAdmin, draft)).status,403);
  const retentionPreview = await api('retention-preview', owner, draft);
  assert.equal(retentionPreview.status,200,JSON.stringify(retentionPreview));
  assert.ok(Array.isArray(retentionPreview.payload.candidates));


  const publicRpc = await anon.rpc('is_administrator');
  assert.ok(publicRpc.error, 'Anonymous clients should not execute the privileged administrator RPC');
  assert.equal((await owner.client.rpc('is_administrator')).data, true);
  assert.equal((await nonAdmin.client.rpc('is_administrator')).data, false);
  assert.equal((await api('create', null, draft)).status, 401);
  assert.equal((await api('create', nonAdmin, draft)).status, 403);
  assert.equal((await api('create', owner, draft, { origin: 'https://attacker.invalid' })).status, 403);

  const created = await api('create', owner, draft);
  assert.equal(created.status, 200, JSON.stringify(created));
  assert.equal(created.payload.id, draft);
  assert.equal((await api('create', owner, draft)).status, 200);
  assert.equal((await api('create', otherAdmin, draft)).status, 409);
  const bypass = await owner.client.from('import_drafts').insert({ id: randomUUID(), original: unresolvedOriginal(), created_by: owner.id });
  assert.ok(bypass.error, 'Direct browser draft INSERT must be rejected');

  const uploaded = await api('upload', owner, draft, { body: png, mime: 'image/png' });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded));
  const path = uploaded.payload.object_path;
  const sourceId = uploaded.payload.id;
  assert.ok(path && sourceId);
  assert.equal((await api('upload', owner, draft, { body: png, mime: 'image/png' })).payload.id, sourceId);
  assert.equal((await api('upload', otherAdmin, draft, { body: png, mime: 'image/png' })).status, 404);

  const owned = await owner.client.storage.from('tournament-sources').download(path);
  assert.ifError(owned.error);
  assert.deepEqual(new Uint8Array(await owned.data.arrayBuffer()), png);
  assert.ok((await otherAdmin.client.storage.from('tournament-sources').download(path)).error, 'Other admin must not download private source');
  assert.ok((await anon.storage.from('tournament-sources').download(path)).error, 'Anonymous download must fail');
  const directUpload = await owner.client.storage.from('tournament-sources').upload(`${owner.id}/forged.png`, png);
  assert.ok(directUpload.error, 'Browser Storage INSERT must fail');

  const values = unresolvedOriginal();
  values.tournament.name = 'Reviewed from synthetic PNG fixture';
  const evidence = fieldPaths(values).map(path => ({ path, sources: [sourceId], note: 'Reviewed field in synthetic CI test' }));
  const correction = { revision: 1, values, reason: 'Synthetic integration review only', confirm: [], sources: [sourceId], evidence };
  const revised = await api('correct', owner, draft, { body: correction });
  assert.equal(revised.status, 200, JSON.stringify(revised));
  assert.equal((await api('correct', owner, draft, { body: correction })).status, 200);
  assert.equal((await api('correct', owner, draft, { body: { ...correction, reason: 'Overwriting earlier review' } })).status, 409);
  const saved = await owner.client.from('import_corrections').select('*').eq('draft_id', draft);
  assert.ifError(saved.error);
  assert.equal(saved.data.length, 1);
  assert.equal((await api('extract', owner, draft)).status, 501);
  assert.equal((await anon.from('published_results').select('result_id')).error, null);
  console.log('PASS local Auth, private Storage, draft RPC, upload/dedup, owner isolation, immutable corrections, extraction disabled');
}

try {
  await main();
} finally {
  // Users and all sources reside only in the disposable runner.
  // Supabase services are discarded with the job.
}
