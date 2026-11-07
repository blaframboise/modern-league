import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedBody, unresolvedOriginal, uuid, validateImageBytes } from '../src/importInfrastructure/validation.ts';
import { fieldPaths, validateHumanEvidence } from '../src/importInfrastructure/evidence.ts';
import { configuredExtractionAdapter } from '../src/importInfrastructure/provider.ts';
import { importHandler } from '../supabase/functions/screenshot-import/handler.ts';
import { reconstructImportDraft } from '../src/data/reconstruction.ts';

const actor = '00000000-0000-4000-8000-000000000001';
const id = 'abcdefab-1234-4abc-8def-abcdef123456';
const source = '00000000-0000-4000-8000-000000000003';
const png = new Uint8Array([137,80,78,71,13,10,26,10,0]);
function harness({ user = true, admin = true, owner = actor, failAttach = false, failUpload = false, rateLimited = false, rateUnavailable = false } = {}) {
  const original = { id, original: unresolvedOriginal(), created_by: owner };
  const rows: any[] = []; const assets: any[] = []; const objects = new Map();
  let attachments = 0; let uploads = 0; let reads = 0;
  const service: any = {
    from(table: string) {
      let mode = 'select'; let payload: any; const filters: Record<string, unknown> = {};
      const q: any = {
        select() { return q; }, eq(k: string, v: unknown) { filters[k] = v; return q; }, order() { return q; },
        insert(value: any) { mode = 'insert'; payload = value; return q; },
        single() { return q; }, maybeSingle() { return q; },
        then(resolve: any) {
          if (mode === 'insert') {
            if (table === 'import_corrections') {
              if (rows.some(r => r.revision === payload.revision)) return resolve({ error: { message: 'conflict' } });
              rows.push({ id: String(rows.length + 1), ...payload });
            }
            return resolve({ data: null, error: null });
          }
          reads++;
          return resolve({ data: table === 'import_drafts' ? (String(filters.id).toLowerCase() === id ? original : null) : table === 'import_corrections' ? rows : assets, count: rows.length, error: null });
        },
      };
      return q;
    },
    storage: { from() { return { async upload(path: string, bytes: Uint8Array) {
      uploads++; if (failUpload) return { error: { message: 'failed', statusCode: '503' } };
      if (objects.has(path)) return { error: { statusCode: '409' } };
      objects.set(path, bytes); return { error: null };
    } }; } },
    async rpc(name: string, args: any) {
      if (name === 'consume_screenshot_request') return rateUnavailable ? { data: null, error: { message: 'unavailable' } } : { data: rateLimited ? 0 : 10, error: null };
      if (name === 'create_screenshot_draft') {
        if (args.p_actor !== owner) return { error: { message: 'Draft unavailable' } };
        return { data: args.p_draft, error: null };
      }
      if (name === 'append_screenshot_review') {
        rows.push({ id: String(rows.length + 1), draft_id: args.p_draft, revision: args.p_revision, snapshot: args.p_snapshot, reason: args.p_reason, actor: args.p_actor });
        return { error: null };
      }
      attachments++; if (failAttach && attachments === 1) return { error: { message: 'failed' } };
      const asset = { id: source, sha256: args.p_hash, object_path: `${actor}/${id}/${args.p_hash}` };
      assets.push(asset); return { data: asset, error: null };
    },
  };
  const userClient = { auth: { async getUser() { return { data: { user: user ? { id: actor } : null }, error: null }; } }, async rpc() { return { data: admin, error: null }; } };
  const handler = importHandler(name => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'service', IMPORT_ALLOWED_ORIGIN: 'https://league.example' })[name], (_url, key) => key === 'service' ? service : userClient);
  async function request(action: string, body?: any, authorization = true, draftId = id) {
    const response = await handler(new Request(`https://edge.example/screenshot-import?action=${action}`, { method: 'POST', headers: { ...(authorization ? { authorization: 'Bearer test' } : {}), 'x-draft-id': draftId, 'content-type': body instanceof Uint8Array ? 'image/png' : 'application/json', origin: 'https://league.example' }, body: body instanceof Uint8Array ? new Uint8Array(body).buffer : JSON.stringify(body ?? {}) }));
    return { status: response.status, body: await response.json() };
  }
  return { request, rows, assets, original, objects, stats: () => ({ uploads, reads }) };
}

test('bounded trusted image signature/MIME/size/identifier checks', async () => {
  validateImageBytes(png, 'image/png');
  for (const [bytes, mime] of [[png, 'image/jpeg'], [png, 'image/svg+xml'], [new Uint8Array(), 'image/png'], [new Uint8Array(10485761), 'image/png']] as const) assert.throws(() => validateImageBytes(bytes, mime));
  assert.throws(() => uuid('../path')); assert.equal(uuid(id), id);
  assert.equal(uuid('ABCDEFAB-1234-4ABC-8DEF-ABCDEF123456'), 'abcdefab-1234-4abc-8def-abcdef123456');
  await assert.rejects(boundedBody(new Request('http://localhost', { method: 'POST', body: png }), 2));
  assert.deepEqual(await boundedBody(new Request('http://localhost', { method: 'POST', body: png })), png);
});
test('draft creation calls the trusted service RPC and keeps the same request ID', async () => {
  const h = harness();
  const first = await h.request('create');
  const retry = await h.request('create');
  assert.equal(first.status,200);
  assert.equal(first.body.id,id);
  assert.equal(retry.status,200);
  assert.equal(retry.body.id,id);
  assert.equal(h.stats().uploads,0);
  assert.equal((await harness({ owner: source }).request('create')).status,409);
});
test('actual server handler rejects anonymous/non-administrators before any data or storage access', async () => {
  for (const h of [harness({ user: false }), harness({ admin: false })]) {
    assert.ok([401,403].includes((await h.request('upload', png)).status));
    assert.deepEqual(h.stats(), { uploads: 0, reads: 0 });
  }
  const h = harness(); assert.equal((await h.request('upload', png, false)).status, 401);
  assert.equal((await harness({ owner: source }).request('upload', png)).status, 404);
});
test('durable per-operator rate boundary denies excess writes before any storage or table access', async () => {
  const limited = harness({ rateLimited: true });
  const response = await limited.request('upload', png);
  assert.equal(response.status,429);
  assert.deepEqual(limited.stats(),{uploads:0,reads:0});
  const unavailable = harness({ rateUnavailable: true });
  assert.equal((await unavailable.request('create')).status,503);
  assert.deepEqual(unavailable.stats(),{uploads:0,reads:0});
});
test('server upload validates bytes, recovers partial failure, and deduplicates committed retries', async () => {
  const h = harness({ failAttach: true });
  assert.equal((await h.request('upload', new Uint8Array([1,2]))).status, 400);
  assert.equal(h.stats().uploads, 0);
  assert.equal((await h.request('upload', png)).status, 400);
  assert.equal(h.objects.size, 1); assert.equal(h.assets.length, 0);
  assert.equal((await h.request('upload', png)).status, 200);
  assert.equal((await h.request('upload', png)).status, 200);
  assert.equal(h.assets.length, 1); assert.equal(h.objects.size, 1); assert.equal(h.stats().uploads, 2);
  assert.equal((await harness({ failUpload: true }).request('upload', png)).status, 400);
  assert.equal((await h.request('extract')).status, 501);
});
test('uppercase UUID uploads use the same canonical Storage path as PostgreSQL metadata', async () => {
  const h = harness();
  assert.equal((await h.request('upload', png, true, id.toUpperCase())).status,200);
  assert.ok(h.objects.has(h.assets[0].object_path));
  assert.equal((await h.request('upload', png)).status,200);
  assert.equal(h.objects.size,1);
});
test('field evidence is complete, explicit and tied to owned sources', () => {
  const empty = unresolvedOriginal(); const values = { ...empty, tournament: { ...empty.tournament, name: 'Read by human' } };
  const evidence = fieldPaths(values).map(path => ({ path, sources: [source], note: 'Reviewed source field' }));
  assert.equal(validateHumanEvidence(evidence, values, [source]).length, evidence.length);
  assert.throws(() => validateHumanEvidence([], values, [source]));
  assert.throws(() => validateHumanEvidence(evidence, values, []));
  assert.throws(() => validateHumanEvidence([...evidence, evidence[0]], values, [source]));
  assert.throws(() => configuredExtractionAdapter(), /NOT_CONFIGURED/);
});
test('server corrections replay history, recognize identical retries, reject stale writes and recover immutable drafts', async () => {
  const h = harness(); await h.request('upload', png);
  const empty = unresolvedOriginal(); const values = { ...empty, tournament: { ...empty.tournament, name: 'Human transcribed' } };
  const body = { revision: 1, values, reason: 'Transcribed visible name; all other fields unresolved', confirm: [], sources: [source], evidence: fieldPaths(values).map(path => ({ path, sources: [source], note: 'Visible source field' })) };
  assert.equal((await h.request('correct', body)).status, 200);
  assert.equal((await h.request('correct', body)).status, 200); assert.equal(h.rows.length, 1);
  assert.equal((await h.request('correct', { ...body, reason: 'Overwrite history' })).status, 409);
  assert.equal((await h.request('correct', { ...body, revision: 3 })).status, 409);
  assert.equal((await h.request('correct', { ...body, revision: 2, evidence: [] })).status, 400);
  assert.equal((await h.request('correct', { ...body, revision: 2, reason: ' ' })).status, 400);
  const recovered = reconstructImportDraft(h.original, h.rows, h.rows.length);
  assert.equal(recovered.original.tournament.name, '');
  assert.equal(recovered.corrections[0].values.tournament.name, 'Human transcribed');
  assert.ok(Object.isFrozen(recovered.original));
  assert.equal(JSON.parse(recovered.corrections[0].reason).fields[0].sources[0], source);
});
