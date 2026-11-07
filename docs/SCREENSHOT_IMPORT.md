# Phase 8B Part 1: secure screenshot import

Status: implementation and SQL review artifacts. No production changes, real screenshots,
provider credentials, extraction, approval or publication were used/enabled.

`/official-import` is a separate administrator workflow linked from `/admin`. The
existing `/results-import` remains an explicitly fictional, deterministic mock demo.
Configuring Supabase never turns the demo into an official import. Public leaderboards
remain independent; draft values never enter scoring or public projections.

## Audit and reuse

- Phase 6 `src/results/index.ts`: immutable originals and reasoned append-only
  corrections. Server saves call `correctImport`, never `markReady`/`decideImport`.
- `src/data/reconstruction.ts`: strict complete history reconstruction and Phase 7
  extraction evidence replay before every server correction. Exact counts detect
  truncated histories; no revisions are silently discarded.
- `src/results/extractionEvidence.ts` and `src/extraction/draft.ts`: preserve observed,
  suggested, missing, original report versions and value-bound confirmations. Existing
  extraction drafts can be recovered without stripping their evidence. Manual import
  drafts have no extraction report because no interpretation has occurred.
- `src/calendar/index.ts` and all `src/scoring/` modules are unchanged. Existing
  `validateImport` still delegates calendar/DST, championship and aggregate validation.
  Drafts may be incomplete/invalid; no operational readiness/approval endpoint exists.
  Human source review does not establish calendar assignment or official registry identity.

## Trust and private data

The migration creates `tournament-sources`, a **private** bucket: 10 MiB per image,
eight metadata-linked images per draft, JPEG/PNG/WebP only. No original filenames
are persisted. Object paths are `user UUID/draft UUID/SHA-256`, generated server-side.
The browser never obtains a public or signed URL. Authenticated Storage download
returns a Blob; temporary local object URLs are revoked on replacement, unmount and
session change. A downloaded copy cannot be revoked; operators must secure their device.

RLS requires both current `is_administrator()` and draft ownership for drafts,
corrections, evidence, metadata and Storage reads. Other administrators cannot read
someone else's drafts. Restrictive Storage guards also deny writes and foreign/private
reads when an unrelated permissive Storage policy exists. Public/anonymous downloads
are denied. Keep the bucket private in dashboard settings; a future dashboard change
can invalidate the design and must be reviewed.

Only the Edge Function can upload or append operational corrections. It validates
JWTs with `auth.getUser`, then checks `public.is_administrator()` using that caller's
JWT on **every** request, then verifies draft ownership before using its server-only
service role. `verify_jwt=false` supports publishable-key clients; it does not remove
the handler's mandatory JWT/admin checks. Missing origin configuration fails closed;
CORS allows only `IMPORT_ALLOWED_ORIGIN` (scheme/host/port, no URL path). Origin is an
additional browser control; JWT/admin/ownership checks are the authority.

Browser MIME/count/size checks are usability checks. Trusted code bounds streamed
request bytes before buffering, validates MIME and PNG/JPEG/WebP signatures, hashes
bytes, sets Storage content type and generates paths. Storage enforces size and MIME
again. These are signature checks, **not full image decoding or malware scanning**.
Files are untrusted binary data; any future provider must decode under pixel/memory/
time limits, reject malformed files and defend against decompression bombs before
sending images externally. SVG/HEIC and arbitrary path/user-ID inputs are rejected.

Server limits correction payloads to 1 MiB and reasons/field notes to 2,000 characters.
Storage count enforcement locks the parent draft in `attach_screenshot`, rechecks
administrator membership and ownership, and deduplicates `(draft_id, sha256)` atomically.
The RPC now locks the administrator membership row before attaching, enforcing a
**200 MiB owner-wide quota on linked source bytes** across all drafts in addition
to the eight-images-per-draft limit. Existing hash retries do not consume quota.
Simultaneous uploads for the same owner serialize this check; an over-quota attach
fails without adding metadata. A storage object already uploaded before such a
failure can remain an orphan and needs separate cleanup. The quota does **not**
count unlinked objects or limit the number of drafts, requests, or independent
upload attempts; do not claim full billing/abuse containment before rate limits,
per-user draft quotas, cleanup and monitoring are implemented.
No browser gets execution permission on that service-only function. Original and
correction UPDATE/DELETE triggers remain in place; 8B also blocks TRUNCATE with
statement triggers and explicit privilege revocation; approval/publication grants remain
closed. Do not expose service-role keys, database passwords or provider secrets in
frontend code or `VITE_*`. Only public URL/publishable key belong there.

## Review provenance, recovery and concurrency

1. Create an empty unresolved draft. The client retains a request UUID across retries
   of a failed creation; the server recognizes a committed UUID owned by that user.
   No date, year, tournament kind, rounds, player or record is inferred.
2. Select images. Upload progress is per file. Content hashes make same-draft image
   retries idempotent (cross-draft duplicates stay separate to avoid leaking existence).
   Cross-draft/event duplication is not official deduplication or approval reservation.
3. View private sources. Enter verified values in the advanced JSON review editor.
   Preserve null/empty missing values; year 0 and empty kind are existing invalid
   unresolved sentinels. Player IDs need explicit independent registry verification.
4. Prepare the field evidence form. For **every populated tournament/record field**,
   explicitly enter one or more source asset UUIDs and a human observation note.
   `rowId` and `playerId` are structural/registry identities, not image interpretation.
   Provide a correction reason and confirm source review before saving.
5. The server checks evidence paths/completeness and that all referenced sources belong
   to this draft. The immutable correction `reason` contains a version-1 human-review
   envelope `{version, mode, reason, sources, fields:[{path,sources,note}]}`. Its `values`
   contains the exact reviewed values. Actor/time/revision remain in existing database
   columns. This is human evidence, never an AI extraction report. Corrections retain
   the entire earlier audit; extraction confirmations, if present, remain value-bound.
6. Refresh and select the saved draft to reconstruct the full history and sources.
   Unsaved JSON text is deliberately not written into localStorage. Refresh loses
   **unsaved** text; save before leaving or copy edits to an approved private location.
   Auth token refresh and duplicate same-user SIGNED_IN events preserve the editor;
   account changes/sign-out clear private state without mutating the existing session.

A stale revision cannot overwrite another action: unique `(draft_id, revision)` rejects
races. The server recognizes an exact replayed correction at the same revision, including
source evidence and explicit extraction confirmations. A different action returns 409;
The service-only append RPC also locks the draft and rechecks current administrator membership, ownership, revision and the exact source set at commit. UI retains unsaved text. Copy it before reloading and reconciling changes. No automatic
merge, name matching, registry identity allocation, calendar inference or audit repair.
For existing long histories the exact-count guard fails closed at API page limits;
consistent pagination is a future enhancement.

Storage and PostgreSQL are not one transaction. Storage writes precede metadata attach.
If metadata fails, bytes stay private and unreadable via owner Storage policy until a
retry attaches them; deterministic hash paths let a retry recover the existing object.
Do **not** immediately delete on attach failure: concurrent retries could have attached
it. A batch failure may leave earlier images successfully stored; reload the draft and
retry the same files. Concurrent ninth uploads may produce unlinked private objects;
SQL never links more than eight. Storage failures do not create misleading metadata.
Metadata linking does not prove full decode validity; provider processing must revalidate.

## Versioned server extraction interface

POST `/functions/v1/screenshot-import?action=...`, `Authorization: Bearer <user JWT>`,
`x-draft-id: <UUID>`. Supported actions:

| Action | Request | Behavior |
| --- | --- | --- |
| create | empty JSON | Idempotently create unresolved owned draft |
| upload | raw bounded image bytes with exact image MIME | Validate/store/link private immutable source |
| correct | `{revision,values,reason,confirm:[],sources,evidence}` | Replay and append human correction; stale conflicts fail |
| extract | empty JSON | Authenticate/authorize then return **501 EXTRACTION_NOT_CONFIGURED** |

No approval, publication, delete or official-write action exists. Do not use a mock in
the real route. `src/importInfrastructure/provider.ts` defines `ServerExtractionAdapterV1`:
versioned provider identity, immutable source IDs/hashes/MIME/bytes, cancellation signal,
and existing Phase 7 `ExtractionReport` v1 output. The deterministic `mockProvider` is
unchanged for tests/demo. No provider has been chosen, configured or tested.

Before enabling a future adapter: review provider privacy/consent/region/retention,
set server-only credentials, add timeouts and usage quotas, parse through
`parseExtraction(report, exactSourceIds)`, reject fictional output, and append a
versioned report linked to immutable source IDs in an atomic reviewed persistence
operation. Preserve field missing/suggested/observed distinctions and explicit player
resolution. Current human originals must not be replaced with later extraction output;
use a separately designed append-only extraction attempt/link. Provider prompt injection
must never influence authorization or publication. This interface is preparation only.

## Retention/deletion proposal — requires operator approval

Proposed, **not scheduled or implemented automatically**:

- Unlinked/orphan objects: quarantine 24 hours, then delete after confirming twice that
  no asset references the path (coordinate with upload traffic; no concurrent attachment).
- Abandoned draft images: retain 90 days since last source/review activity, notify the
  owner through a separately approved process, then an operator may purge source bytes.
- Reviewed/officially retained source bytes: proposed one year after the competitive
  year closes, pending legal/privacy and appeal requirements. No automatic publication.
- Keep minimal immutable metadata (hash, source UUID, MIME/size, actor/time and correction
  history) for audit under a separately approved retention duration; redact personal data
  only through a reviewed governance process, never by rewriting history ad hoc.

A **read-only** aggregate inventory is now checked in as
[`supabase/verification/screenshot-storage-audit.sql`](../supabase/verification/screenshot-storage-audit.sql).
It reports linked/unlinked object counts, approximate byte usage and unlinked objects
older than 24 hours, without exposing image names, hashes or user IDs. It does not
remove objects, prove safe deletion, or prevent creation of new orphans. Use it only
after 8B has been installed in a controlled environment; the bucket and metadata
must exist.

There is currently no browser deletion or retention worker. A production purge needs
an append-only tombstone/deletion audit migration and dry-run operator tooling first;
existing asset immutability intentionally forbids destructive metadata edits. Record
who authorized deletion, paths/hashes, reason, timestamp, policy version, retry outcome;
source references must remain visibly unavailable rather than silently reassigned.
Storage byte deletion does not delete metadata, backups or copies. Confirm backup/log
retention and data subject requests before real use. Until approved, do not onboard
real screenshot data that needs a retention promise. The linked-source byte quota is implemented, but **draft-count quotas, unlinked
object limits, gateway rate limits and monitoring** remain launch requirements.
The linked-only quota does not cap storage billing from orphaned uploads; do not
onboard real screenshots until a reviewed retention and cleanup process exists.

See [migration-readiness review and read-only dashboard checklist](MIGRATION_READINESS.md)
for exact catalog/ledger queries and the checked-in Phase 8A reference.

## Manual approval checklist

No item below was performed against production. **Do not merge or deploy this delivery.**

1. **Reconcile Phase 8A first.** Confirm the production project reference through the
   dashboard. Export/back up schema and inspect tables, functions, RLS, grants and
   immutable triggers against `202611060001_foundation.sql` and a fresh local database.
   Check `supabase migration list --linked` using an authorized workstation. The SQL
   Editor already applied Phase 8A; do not run it again or edit the historical file.
   If its ledger entry is absent and schema equivalence has been verified, stop for
   a separately approved history-only reconciliation plan. This review authorizes
   no repair command. Investigate divergence with separately reviewed forward changes;
   never mark an unverified/different schema as applied.
2. Only after ledger reconciliation, review the pending list with `supabase db push
   --dry-run` and confirm that **only** `202611060002_secure_screenshot_import.sql` is
   pending. Do not recommend/execute a live push beforehand. Stop if foundation appears
   pending or any unexpected migration appears. Remote application needs separate manual
   approval; this PR authorizes none. SQL Editor application of 8B also needs its own
   controlled ledger entry; do not mix application methods silently.
3. On a fresh **disposable local/staging** Supabase, apply migrations in order. Inspect
   bucket privacy, 10 MiB/MIME restrictions and all permissive/restrictive policies.
   Check no browser grants permit corrections, asset writes or official writes. Confirm
   existing admin account/authentication remains unchanged; no auth settings are migrated.
4. Review and approve retention, real screenshot consent, limits/quotas, independent
   registry verification, incident handling and source deletion/tombstone governance.
5. After separate deployment approval, configure Edge Function server secrets:
   Supabase-managed URL/anon/service-role keys and `IMPORT_ALLOWED_ORIGIN` matching the
   exact Pages/custom-domain origin. Never configure provider credentials yet. Review
   function authentication behavior with `verify_jwt=false`, then deploy the function
   only to staging first. Existing frontend public URL/key configuration is unchanged.
6. Using synthetic images and separate ordinary/admin/admin-B users in local/staging,
   test raw function calls (no token, invalid/expired JWT, non-admin, revoked admin,
   foreign draft), direct Storage requests and private/public URL attempts, retries,
   concurrent ninth images, stale corrections, refresh recovery and sign-out. The
   committed test harness covers logic and PostgreSQL policies, not the complete hosted
   Auth/PostgREST/Storage/Edge gateway. Do not declare production integration verified
   until these staging checks pass. Real camera/HEIC flows need device checks separately.

## Verification and limits

`npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser` cover existing
rules and new Node/PGlite/Playwright synthetic workflows. `npm run test:browser:secure`
expects a second dev server with a **fake** Supabase configuration described in that test;
all API requests are intercepted. No real credentials are needed. Tests exercise actual
server handler code through injected SDK clients and actual PostgreSQL policy evaluation
with minimal Auth/Storage stubs. Supabase CLI/Docker and an AI provider are not prerequisites
for these tests, but full local/staging integration and hosted Edge deployment remain separate
verification requirements. See the PR for observed commands/results and any limitations.

### Observed verification for this delivery

- `npm run typecheck`: passed (frontend, domain and TypeScript tests).
- `npm test`: 111 passed (after the follow-up migration/security review), including actual handler requests with injected SDK clients
  and PostgreSQL evaluation of both migrations against synthetic Auth/Storage tables.
- `npm run build`: passed; Vite reports its existing >500 kB chunk advisory.
- `BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`: passed
  (existing fictional import desktop/mobile/landscape and administrator fallback).
- `BROWSER_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser:secure`: passed
  (synthetic API interception, mobile/desktop upload, evidence review, recovery,
  non-admin gate, existing session and same-user auth event preservation).
- Deno 2.9.6 `deno check --no-lock supabase/functions/screenshot-import/index.ts`: passed.
- No full Supabase Auth/PostgREST/Storage/Edge integration or provider interpretation
  was run. Dashboard setup, Phase 8A ledger reconciliation and separate operator
  approval remain mandatory before operational use. No real screenshots were used.

The follow-up review on this branch adds read-only production verification artifacts
and regression coverage for UUID canonicalization, service-role execution and TRUNCATE.
See MIGRATION_READINESS.md for findings, remaining blockers and actual verification scope.
