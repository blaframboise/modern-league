# PR #12 migration readiness and security review

This review compares the **checked-in** `202611060001_foundation.sql` with the
**pending** `202611060002_secure_screenshot_import.sql`. It does not certify the
production schema or ledger. No remote database was contacted or modified. All
write, role-switch, failure and truncation tests use disposable local PGlite databases.
Phase 8A is known to have been manually applied; its ledger status remains unknown.

## Findings and fixes

| Area | Checked-in Phase 8A | Reviewed Phase 8B / outcome |
| --- | --- | --- |
| Authenticated table grants | SELECT on every application table except `published_results`, which grants only three public columns. INSERT on drafts and corrections. | SELECT grants are **preserved** when owner policies replace `admin_read`; removing the policy does not remove SELECT. Correction INSERT is deliberately revoked. Browser `leagueRepository.appendCorrection` therefore fails closed; operational saves use the Edge handler. Draft INSERT remains allowed only by the original administrator/self-owner policy. |
| Owner isolation | Any administrator can read another administrator's private drafts and journals; corrections can reference any visible draft. | Draft/correction/evidence/asset reads require the creating administrator. Direct correction INSERT is removed. This is an intentional access change. Existing drafts retain `created_by`; no transfer or reassignment occurs. Unexpected permissive app-table policies could reopen access and are a migration blocker until reviewed. |
| Append-only history | Eight journals have BEFORE UPDATE/DELETE row triggers. These do **not** intercept TRUNCATE; RLS does not protect TRUNCATE either. | **Confirmed and fixed:** pending 8B now revokes TRUNCATE from PUBLIC/API/service roles and adds BEFORE TRUNCATE statement triggers to the same eight tables. Tested both accidental broad service grants and database-owner attempts. Historical 8A is unchanged. Operator/table-owner powers to disable triggers are outside browser security. |
| Service RPCs | No screenshot RPCs exist; service-role table defaults depend on the actual project. | `attach_screenshot` and `append_screenshot_review` are SECURITY DEFINER with empty search paths and explicit EXECUTE for `service_role` only. PUBLIC/anon/authenticated EXECUTE is revoked. They require trusted owners, recheck actor admin membership and draft ownership, and lock the draft. Tests now actually `SET ROLE service_role` in the disposable database; previous SQL tests exercised calls as owner. |
| Storage path | Foundation metadata has a path/hash but no bucket, Storage policy or uploader. | **Confirmed and fixed:** uppercase accepted UUID headers previously created uppercase Storage paths while the RPC generated lowercase UUID paths. IDs now canonicalize before upload. Regression verifies the uploaded object matches its persisted reference and lowercase retry deduplicates. |
| Private downloads | No app Storage permissions. | Bucket is private; authenticated owner SELECT permits the application's Blob download. The read helper uses SECURITY DEFINER so anon policy evaluation does not need metadata table SELECT. Unlinked objects remain unreadable through browser policy. Restrictive guards prevent unrelated permissive Storage policies from enabling this bucket's browser writes/foreign reads. |
| Official results | Browser approval/publication/registry/calendar writes closed. | Unchanged. Neither RPC grants official browser writes; server routes only create/upload/correct or return extraction-unavailable. Service-role secrets remain powerful and must stay server-side. |
| Administrator-check RPC | Phase 8A grants anonymous and authenticated EXECUTE on `public.is_administrator()`; function reads `auth.uid()` and does not expose administrator rows. | Pending 8B revokes anonymous EXECUTE to reduce public RPC exposure while preserving authenticated EXECUTE for sign-in and server checks. PostgreSQL regression checks both effective grants. This change is pending only; the production advisor may still flag anonymous execution until 8B is applied. |

This is a review of the un-applied PR migration, so fixes are in that pending file.
Do not replay or edit the historical foundation. If any version of 8B has already
been applied elsewhere, stop: that environment needs separately reviewed forward
changes, not a ledger entry claiming this revised file ran there.

## Read-only production dashboard checklist

Follow these steps in order. You can stop after any step. **Do not paste migration
SQL into the production editor. Do not click Run on INSERT, UPDATE, DELETE, TRUNCATE,
CREATE, ALTER, DROP, GRANT, REVOKE, history repair or role-switch commands.** Testing a
write followed by ROLLBACK is also outside this production checklist. You do not need
service-role keys, database passwords or real tournament screenshots for these checks.

### 1. Confirm the project and preserve a private review record

1. Open Supabase Dashboard and select the existing **modern-league** production
   project. Open **Project Settings → General** and note its project reference.
   Confirm it matches the project URL configured for the production app; do not
   copy secret keys. A project name alone is not sufficient identification.
2. Open **SQL Editor → New query**. Use the default trusted dashboard database role
   (normally `postgres`). The SQL Editor is privileged and **does not simulate a
   signed-in browser administrator**. `is_administrator()` returning false there
   would not prove that production authentication is broken.
3. Use only the read-only query files linked below. Save the outputs privately with
   project reference, date and PR commit. Do not post tokens, auth user rows, source
   images or connection strings. Export all rows; a truncated editor result cannot
   establish equivalence. Permission errors mean unverified, not absent; stop rather
   than changing grants to make a query work. Do not change dashboard switches.

### 2. Compare the actual foundation schema, not just its migration name

Open [phase8a-inventory.sql](../supabase/verification/phase8a-inventory.sql), copy the
entire SELECT into the new SQL Editor tab, then click **Run**. It reads PostgreSQL
catalogs only, not application records. Compare the result's `section`, `object_name`
and `definition` columns against **all 287 normalized rows** in
[PHASE8A_REFERENCE.json](PHASE8A_REFERENCE.json). That reference is generated from the
unchanged checked-in foundation in a fresh local database, and an automated test
checks that the SELECT works inside a read-only transaction and matches the reference.

#### PostgreSQL catalog normalization: NOT NULL

The previous PGlite reference contained 352 rows. The operator reports that the
production export contains 287 exact matches, no conflicting definitions, no extra
objects, and exactly 65 reference-only constraint entries named `*_not_null`. All
68 column definitions, including their `not_null` flags, match. This review uses
that supplied comparison; it has not independently downloaded the production export
or connected to production.

Local inspection confirms PostgreSQL **18.6 (PGlite 0.5.15)** records 65 NOT NULL
constraints in `pg_constraint` with **`contype = 'n'`**, in addition to the existing
`pg_attribute.attnotnull` flags. PostgreSQL 18 introduced these catalog entries;
earlier PostgreSQL versions expose column nullability through `attnotnull` without
those additional constraint rows. These are generated representations of real
NOT NULL enforcement, not 65 additional independent safeguards. The production
version was not supplied; the read-only environment inventory reports it separately.

The inventory SELECT now excludes **only validated** `pg_constraint.contype = 'n'`
entries. Its column section still includes all 68 definitions and all 65 true NOT NULL flags. The updated
reference therefore has **287 rows**, matching the reported production export.
Unvalidated NOT NULL entries remain visible as potential validation drift.
CHECK (`c`), primary-key (`p`), unique (`u`) and foreign-key (`f`) constraints remain
included. Do not ignore a row solely because its name ends with `_not_null`: a real
CHECK constraint can have that name. A changed/missing `not_null` column flag remains
a genuine schema difference requiring investigation.

For an export already produced with the old SELECT, the reported 287 production
rows can be compared directly with the updated 287-row reference; no production
SQL needs to be changed or rerun for this known difference. If comparing an old
352-row reference/export, normalize only the 65 confirmed validated `contype='n'` entries
(the old reference renders them as `NOT NULL <column>; validated=true`) and require
the complete column definitions/nullability flags to match. Investigate any other
missing, changed or extra row; row counts alone never establish equivalence.

Under the supplied exact comparison, the 65 omitted constraint rows are **not a
missing-safeguard blocker**. This resolves that inventory comparison discrepancy
only. It does not verify owners, environment-specific RPC/Storage policies, actual
ledger state, or authorize migration/ledger repair, push, merge or deployment.

The reference has these expectations:

- 13 tables: `private.administrators` plus 12 public application tables. Each is a
  regular table with RLS enabled. All listed column definitions, CHECK/primary-key/
  unique/foreign-key constraints, indexes, triggers and policies must match. `screenshot_assets.created_at`, the hash uniqueness
  constraint and all 8B helpers must **not yet** exist in a pure 8A schema.
- Original `admin_read` policies are permissive SELECT for authenticated on all
  12 public application tables. `published_results` additionally has `public_read`
  for anon/authenticated. Its actual table grant is column-limited, so this extra
  admin policy does not expose actor columns. Draft and correction INSERT policies
  must match the exact reference expressions, including administrator and actor checks.
- `import_drafts`, `import_corrections`, `extraction_evidence`, `screenshot_assets`,
  `approval_history`, `tournament_results`, `player_records`, `published_results`
  each have the enabled `immutable` BEFORE UPDATE OR DELETE row trigger calling
  `private.immutable_history()`. No 8A truncate guard is expected; 8B adds it.
- `is_administrator()` is stable SQL SECURITY DEFINER, has `search_path=''`, and
  tests `private.administrators.user_id = auth.uid()`. It must not trust user metadata.
  `immutable_history()` raises an exception for mutations. Compare full function
  definitions, not only their names or return types. Unexpected overloads need review.
- Effective authenticated SELECT is present on all private application columns;
  anon has none. The only public read columns are `result_id`, `public_snapshot`,
  `published_at` on `published_results`. Both roles can read those three columns;
  neither can read `published_by`. Authenticated INSERT is allowed on draft and
  correction columns only. No browser UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER.
  `private.administrators` has no browser table/column rights. The inventory includes
  **effective column privileges**, so hidden column grants/inherited rights are not missed.

Only true effective grants are listed in the reference: an extra privilege row is
unexpected access, and a missing row is missing access. Absence of a table-level
SELECT grant on `published_results` is expected; check its column grants instead.
Catalog formatting can differ by PostgreSQL version (parentheses, casts, quoting).
A qualified reviewer must resolve such differences semantically; do not automatically
mark them equivalent. A matching inventory is necessary but not sufficient: also
complete the environment, function ownership, Storage and ledger checks below.

**STOP** for any unexplained difference. Do not rerun 8A to fix it, copy its RLS into
production ad hoc, or mark its ledger applied merely because tables exist.

### 3. Check environment-specific owners, grants, Storage and pending-object collisions

Run [environment-inventory.sql](../supabase/verification/environment-inventory.sql)
in a separate SQL Editor tab. It contains only SELECT queries; SQL Editor shows one
result grid per statement (use the result selector, or run each SELECT separately).
If a required managed schema/table/role is missing, stop and have the operator inspect
it; do not create substitutes in production. Check:

1. `auth.users`, `auth.uid()`, `storage.buckets` and `storage.objects` exist. The
   app schema queries above do not verify Supabase-managed Auth/Storage internals.
2. Application tables and SECURITY DEFINER helpers are owned by trusted operator
   roles, never anon/authenticated/service_role. The owner of `is_administrator`
   must own `private.administrators` or have appropriate trusted RLS bypass; otherwise
   its definer lookup can return false despite an administrator row existing.
   The future screenshot helpers' owner must be able to lock drafts and append assets/
   corrections and read `private.administrators`. An untrusted function owner is unsafe.
3. `anon` and `authenticated` have neither superuser nor BYPASSRLS. `service_role`
   normally has BYPASSRLS. Inspect role memberships: an inherited powerful role can
   defeat simple ACL expectations. API roles must not have CREATE in application
   schemas or access to private administrator membership. `public` schema USAGE
   is needed for API calls; authenticated Storage USAGE is needed for downloads.
   Default grants shown are environment facts, not proof that a specific table is safe.
4. `is_administrator()` is executable by anon/authenticated. Its SECURITY DEFINER
   implementation, owner and private schema boundary provide its safety. Private
   trigger function EXECUTE is not a browser RPC: private schema USAGE is revoked
   and it returns trigger. Review **all extra public/private functions and overloads**
   shown, especially SECURITY DEFINER functions executable by PUBLIC/API roles.
   A definer function or owner-executed exposed view can bypass table RLS. Extra
   functions/views require independent review; the 8A migration cannot certify them.
5. Storage RLS is enabled on `objects`. Inspect **all** Storage policies and their
   target roles/expressions, including broad `USING(true)` / `WITH CHECK(true)` rules.
   The checked-in 8A creates none. Unrelated policies can exist; their interaction
   must be reviewed. Pending 8B restrictive guards protect this bucket specifically,
   not unrelated project buckets or a disabled Storage RLS setting.
6. In **Storage → Buckets**, inspect without editing. A pure 8A deployment has no
   `tournament-sources` bucket. The bucket query must return zero rows. If it already
   exists, record privacy, MIME list and size limit and **stop**: 8B's plain INSERT
   would collide. Do not delete, overwrite, convert to public, or use an upsert.
7. The final collision query must return zero rows before 8B: no screenshot RPCs,
   `tournament_source_*` policies, asset `created_at`, `screenshot_draft_hash`, or
   `immutable_truncate` triggers. Partial results indicate drift or a partial prior
   deployment. Do not rerun 8B blindly or replace named policies/functions.

### 4. Check existing metadata for migration/data incompatibilities

Only after confirming the foundation tables exist, run these read-only aggregate
queries. They reveal no images, names, user IDs or source paths:

```sql
select count(*) as existing_asset_rows from public.screenshot_assets;
select count(*) as duplicate_draft_hash_groups from (
  select draft_id, sha256 from public.screenshot_assets
  group by draft_id, sha256 having count(*) > 1
) duplicates;
select count(*) as over_limit_draft_groups from (
  select draft_id from public.screenshot_assets
  group by draft_id having count(*) > 8
) over_limit;
select count(*) as malformed_asset_rows from public.screenshot_assets
where sha256 !~ '^[0-9a-f]{64}$'
   or byte_size not between 1 and 10485760
   or mime_type not in ('image/jpeg','image/png','image/webp');
```

All should be zero for a foundation that has never received server uploads. Duplicate
hash groups prevent adding `screenshot_draft_hash`. Existing metadata/over-limit
rows require review even without duplicates: 8B does not move source bytes, infer a
bucket, rewrite legacy paths or choose which immutable records to discard. Do not
remove audit rows to make the migration pass. Existing draft/correction data can be
nonempty; structurally invalid or incomplete histories fail recovery closed and need
a separately reviewed append-only resolution, not deletion or rewritten originals.

### 5. Inspect the ledger separately (read only)

First run this query. It works even if the CLI has never created a ledger:

```sql
select to_regclass('supabase_migrations.schema_migrations') as ledger_table;
```

- NULL: record **ledger absent; Phase 8A reconciliation needed**. Do not create a
  ledger or run the next query against a missing table. SQL Editor application does
  not guarantee a CLI ledger row exists.
- A relation name: run the following SELECT to inspect versions without exposing
  the SQL statements stored in the ledger:

```sql
select version::text as version,
       to_jsonb(m)->>'name' as recorded_name,
       case when jsonb_typeof(to_jsonb(m)->'statements') = 'array'
            then jsonb_array_length(to_jsonb(m)->'statements') end as statement_count
from supabase_migrations.schema_migrations m
order by version;
```

Look for **`202611060001`** (not the filename suffix). It may have name `foundation`,
no name, or a manually chosen name; the name does not establish schema equivalence.
For this pending PR, **`202611060002` must be absent**. If present, stop and compare
which 8B revision actually ran. Record every unexpected version; do not remove it.
A version row is not a checksum or proof that its SQL ran, and a statement count is
not an integrity check. Conversely, matching actual tables do not prove a ledger row.

| Foundation inventory | Ledger `202611060001` | Decision |
| --- | --- | --- |
| Equivalent after qualified review | Present | Baseline/ledger aligned; still complete remaining staging/setup approvals. |
| Equivalent after qualified review | Missing or ledger absent | Manually applied baseline likely needs separately approved history-only reconciliation. **No push.** |
| Different, incomplete or unverified | Present or absent | Blocked: investigate drift. Do not mark applied or replay the foundation. |
| Any | `202611060002` present or unexpected versions | Blocked: investigate deployment history before revising/applying this pending SQL. |

This checklist does **not** authorize ledger repair, migration application or `db push`.
Do not press dashboard migration/apply controls. After verified equivalence, an operator
can propose a separate reconciliation plan; repair changes metadata and is not read-only.
No remote dry run or push is recommended until baseline and ledger are reconciled.

### 6. Review deployment prerequisites without changing settings

- View **Project Settings → Data API** (called API in some dashboard versions).
  Confirm the app's `public` schema is exposed, the API is enabled, and `private` is
  not exposed. Record other exposed schemas/views/functions for independent review.
  Do not change or save these settings. Defaults and exposed RPCs are part of the
  attack surface even when application table RLS is correct.
- In **Edge Functions**, view the list. If `screenshot-import` already exists, record
  its deployment revision and configuration; do not deploy or invoke write actions.
  A currently deployed function is not automatically this PR's reviewed version.
- View secret **names only**: Supabase URL, anon and service-role server bindings,
  plus `IMPORT_ALLOWED_ORIGIN`, must be available to the future function. Confirm the
  expected exact origin (e.g. `https://blaframboise.github.io`, without `/modern-league`).
  No secret is entered in frontend code or `VITE_*`. An unavailable anon/service key
  (for example disabled legacy keys) needs a separately tested supported server setup.
- `verify_jwt=false` is deliberate because the handler validates the bearer JWT with
  Auth and checks administrator status for each request. It is unsafe to deploy a
  different/unguarded handler with that setting. Dashboard toggles alone are not proof
  of the handler checks. Missing origin config fails closed; browser CORS is not auth.
- The application calls POST `/functions/v1/screenshot-import?action=create|upload|correct|extract`
  with user JWT, publishable key and `x-draft-id`. Uploads are raw image bytes, not
  direct browser Storage uploads or signed upload URLs. The function's separate service
  client has no caller JWT header; otherwise service calls can unexpectedly become
  caller-scoped. Service RPCs are only callable through the trusted handler, not via
  the browser publishable client.
- Authenticated download uses the same private bucket and exact canonical metadata
  path; the Storage service must honor ownership RLS. Missing objects are visible
  failures, never replaced with a public URL. SELECT can also allow an authorized
  owner to mint signed download URLs through the Storage API. The app does not mint
  them; this migration cannot promise that owners cannot share downloaded bytes or
  bearer URLs. A strict no-signing requirement needs a separately reviewed proxy and
  removal of direct Storage SELECT. Dashboard operators/service credentials bypass
  browser policy and must be trusted.

## Disposable tests and remaining blockers

Local tests reproduce the TRUNCATE gap before the fix, deny it after 8B, verify
service-role RPC EXECUTE and definer behavior, owner/admin versus anonymous access,
column/table grants, private reads despite a deliberately broad Storage policy,
immutable original/corrections, hash/count limits, stale revisions and UUID path
canonicalization. The catalog SELECT is tested in a read-only transaction against
8A, and a column-grant drift case proves that unexpected privileges appear in output.

Still blocked before operational rollout:

1. Actual production inventory, ownership, policies, schema equivalence and ledger
   have **not been verified** by this review; no production connection was used.
2. No hosted Auth/PostgREST/Storage/Edge integration was exercised. On a disposable
   Supabase, test JWT expiry/revocation, admin A versus admin B and ordinary users,
   direct bucket write/public/private/signing endpoints, CORS preflight, actual RPC
   responses, duplicate/counted uploads and concurrent corrections/source attachment.
   PGlite stubs cannot certify managed Storage behavior or PostgREST's exposed schemas.
3. Retention/deletion tombstones, orphan cleanup, quotas/rate limits and screenshot
   consent remain operational decisions. Signature checks are not full decoding.
4. No provider is configured or tested; extraction returns 501. Approval/publication
   remain closed. The original scoring/calendar/evidence rules are unchanged.

Do not merge, deploy, repair ledger history or apply SQL as part of this review.

## Verification results for the follow-up review

Typecheck, all 111 Node/PostgreSQL tests, Vite build, existing browser suite, new
private-import browser suite and Deno checking passed. Browser tests use synthetic
API interception/images, not production. The Vite >500 kB bundle advisory remains.
Catalog, environment, aggregate and ledger SELECTs are exercised in read-only local
transactions. No remote schema/ledger access, writes, migration, merge or deployment
was performed.

### Catalog normalization follow-up

The revised comparison was verified locally against PostgreSQL 18.6/PGlite. It
produces 287 rows, retaining all 68 column definitions and 65 true NOT NULL flags.
Regressions ensure dropping NOT NULL still changes the inventory, unvalidated NOT NULL
entries remain visible, and genuine CHECK constraints named `*_not_null` are retained.
The operator-reported production export was not independently re-read here; no
production SQL, historical migration or ledger was changed.

For this catalog-only follow-up, `npm run typecheck` and `npm test` (111 passed)
were rerun. The build/browser/Deno results above refer to the preceding infrastructure
review; this follow-up changes only verification SQL, its reference, guidance and tests.
