// Server only. Never bundle this module with Vite.
// SDK injected by the Deno entrypoint; no browser credentials or runtime globals here.
type Factory = (url: string, key: string, options: any) => any;
import { boundedBody, SOURCE_BUCKET, unresolvedOriginal, uuid, validateImageBytes } from '../../../src/importInfrastructure/validation.ts';
import { reconstructImportDraft, parseImportValues, sameHistory } from '../../../src/data/reconstruction.ts';
import { correctImport } from '../../../src/results/index.ts';
import { validateHumanEvidence } from '../../../src/importInfrastructure/evidence.ts';
import { configuredExtractionAdapter } from '../../../src/importInfrastructure/provider.ts';

export function importHandler(env: (name: string) => string | undefined, createClient: Factory) {
  const url = env('SUPABASE_URL')!;
  const key = env('SUPABASE_ANON_KEY')!;
  const service = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  function checked(result: { data: any; error: any }) { if (result.error) throw new Error('Persistence failed. Retry the same request or reload before editing.'); return result.data; }
  return async (request: Request) => {
    const origin = request.headers.get('origin');
    const allowed = env('IMPORT_ALLOWED_ORIGIN');
    const headers = { 'Access-Control-Allow-Origin': allowed ?? 'null', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-draft-id', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
    if (!allowed || (origin && origin !== allowed)) return reply({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    try {
      const authorization = request.headers.get('authorization') ?? '';
      if (!authorization.startsWith('Bearer ')) return reply({ error: 'Authentication required.' }, 401);
      const userClient = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
      const identity = await userClient.auth.getUser();
      if (identity.error || !identity.data.user) return reply({ error: 'Authentication required.' }, 401);
      const actor = identity.data.user.id;
      if (checked(await userClient.rpc('is_administrator')) !== true) return reply({ error: 'Administrator required.' }, 403);
      const action = new URL(request.url).searchParams.get('action');
      if (!['create', 'upload', 'correct', 'extract', 'retention-preview', 'retention-delete-orphan'].includes(action ?? '')) return reply({ error: 'Unsupported action.' }, 400);
      // This rate check is a separate committed database transaction, so failed
      // requests and retries still count. Check before buffering image bytes.
      const allowance = await service.rpc('consume_screenshot_request', { p_actor: actor, p_action: action });
      if (allowance.error) return reply({ error: 'Request limit unavailable. Retry later.' }, 503);
      if (allowance.data === 0) return reply({ error: 'Hourly request limit reached. Retry after the window resets.' }, 429);
      if (action === 'retention-preview') {
        const candidates = checked(await service.rpc('preview_screenshot_retention', { p_actor: actor }));
        return reply({ candidates: candidates ?? [] });
      }
      if (action === 'retention-delete-orphan') {
        const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096)));
        if (body?.confirm !== true || typeof body.objectPath !== 'string'
            || typeof body.reason !== 'string' || !body.reason.trim()
            || body.reason.length > 2000) return reply({ error: 'Operator confirmation and reason required.' }, 400);
        const path = body.objectPath;
        const parts = path.split('/');
        if (parts.length !== 3 || parts[0] !== actor || !/^[0-9a-f]{64}$/.test(parts[2])) {
          return reply({ error: 'Invalid or foreign object path.' }, 400);
        }
        // The database atomically verifies orphan age and absence of a linked
        // immutable asset, locks the operator, and journals a resumable request.
        const requestResult = await service.rpc('prepare_orphan_screenshot_cleanup', {
          p_actor: actor, p_path: path, p_reason: body.reason,
        });
        if (requestResult.error) return reply({ error: 'Source is held, linked or not eligible for cleanup.' }, 409);
        const requestId = requestResult.data;
        // Never delete from storage.objects using SQL: use the Storage API.
        // If the request fails mid-flight, the durable pending journal survives,
        // preventing reattachment. The same authorized action can retry.
        const storage = service.storage.from(SOURCE_BUCKET);
        const folder = parts.slice(0, 2).join('/');
        // A retry may arrive after Storage removed the object but before the
        // success event was written. Verify absence first so a missing-file
        // Storage API error never leaves a successful purge stuck indefinitely.
        const before = await storage.list(folder, { limit: 100, search: parts[2] });
        if (before.error) return reply({ error: 'Storage presence could not be checked; retry cleanup.' }, 503);
        if ((before.data ?? []).some((file: any) => file.name === parts[2])) {
          const removed = await storage.remove([path]);
          if (removed.error) return reply({ error: 'Storage removal unconfirmed; retry the same cleanup.' }, 503);
        }
        const remaining = await storage.list(folder, { limit: 100, search: parts[2] });
        if (remaining.error || (remaining.data ?? []).some((file: any) => file.name === parts[2])) {
          return reply({ error: 'Storage absence could not be verified; retry cleanup.' }, 503);
        }
        const complete = await service.rpc('finish_orphan_screenshot_cleanup', {
          p_actor: actor, p_path: path, p_request: requestId,
        });
        if (complete.error) return reply({ error: 'Storage removed, but audit confirmation is pending; retry cleanup.' }, 503);
        return reply({ deleted: true, auditId: complete.data });
      }
      const id = uuid(request.headers.get('x-draft-id'));
      if (action === 'create') {
        // The service-only RPC holds an administrator lock and enforces the cross-draft
        // count quota atomically. No direct browser or Edge table INSERT is allowed.
        const created = await service.rpc('create_screenshot_draft', {
          p_draft: id, p_actor: actor, p_original: unresolvedOriginal(),
        });
        if (created.error) return reply({ error: 'Unable to create draft. Owner quota or request conflict; reload and retry.' }, 409);
        return reply({ id });
      }
      const original = checked(await service.from('import_drafts').select('*').eq('id', id).maybeSingle());
      if (!original || original.created_by !== actor) return reply({ error: 'Draft unavailable.' }, 404);
      if (action === 'upload') {
        const mime = request.headers.get('content-type') ?? '';
        const bytes = await boundedBody(request);
        validateImageBytes(bytes, mime);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer));
        const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
        const assets = checked(await service.from('screenshot_assets').select('*').eq('draft_id', id));
        const existing = assets.find((a: any) => a.sha256 === hash);
        if (existing) return reply(existing);
        if (assets.length >= 8) return reply({ error: 'Eight image limit reached.' }, 409);
        const path = `${actor}/${id}/${hash}`;
        const upload = await service.storage.from(SOURCE_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
        if (upload.error && !['409', 'Duplicate'].includes(String(upload.error.statusCode)) && upload.error.message !== 'The resource already exists') throw new Error('Storage upload failed. Retry the same image.');
        // Attach may fail after Storage succeeds. Keep the private orphan for retry/retention cleanup.
        return reply(checked(await service.rpc('attach_screenshot', { p_draft: id, p_actor: actor, p_hash: hash, p_mime: mime, p_size: bytes.length })));
      }
      if (action === 'correct') {
        const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 1024 * 1024)));
        if (!Number.isSafeInteger(body.revision) || body.revision < 1 || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 2000 || !Array.isArray(body.confirm) || body.confirm.some((p: unknown) => typeof p !== 'string')) throw new Error('Invalid correction request.');
        const response = await service.from('import_corrections').select('*', { count: 'exact' }).eq('draft_id', id).order('revision');
        const rows = checked(response);
        const draft = reconstructImportDraft(original, rows, response.count!);
        // Retry recognition compares the complete action, including evidence confirmations.
        const prior = rows[body.revision - 1];
        const baseRows = prior ? rows.slice(0, body.revision - 1) : rows;
        if (!prior && body.revision !== rows.length + 1) return reply({ error: 'Stale revision. Reload; your edits have not been saved.' }, 409);
        const base = prior ? reconstructImportDraft(original, baseRows, baseRows.length) : draft;
        const sources = checked(await service.from('screenshot_assets').select('id').eq('draft_id', id));
        if (!sources.length || !Array.isArray(body.sources) || !body.sources.length || body.sources.some((id: unknown) => !sources.some((a: any) => a.id === id)) || (!prior && !sameHistory([...body.sources].sort(), sources.map((a: any) => a.id).sort()))) throw new Error('Review all current source images before saving.');
        const values = parseImportValues(body.values);
        const evidence = validateHumanEvidence(body.evidence, values, body.sources);
        const evidenceReason = JSON.stringify({ version: 1, mode: 'human-review', reason: body.reason, sources: [...body.sources].sort(), fields: evidence });
        const candidate = correctImport(base, values, evidenceReason, { confirmExtraction: body.confirm });
        const correction = candidate.corrections.at(-1)!;
        if (prior) {
          if (!sameHistory(prior.snapshot, correction)) return reply({ error: 'Stale revision. Reload; your edits have not been saved.' }, 409);
          return reply({ revision: body.revision });
        }
        const result = await service.rpc('append_screenshot_review', { p_draft: id, p_actor: actor, p_revision: body.revision, p_snapshot: correction, p_reason: correction.reason, p_sources: body.sources });
        if (result.error) return reply({ error: 'Revision conflict or save failure. Retry the same edit or reload; retain your unsaved text.' }, 409);
        return reply({ revision: body.revision });
      }
      if (action === 'extract') {
        configuredExtractionAdapter(); // Intentionally unavailable; no mock output persisted as real evidence.
      }
      return reply({ error: 'Unsupported action.' }, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed.';
      return reply({ error: message }, message.startsWith('EXTRACTION_NOT_CONFIGURED') ? 501 : 400);
    }
  };
}
