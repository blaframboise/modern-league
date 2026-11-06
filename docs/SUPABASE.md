# Phase 8A — Supabase foundation

Phase 8A’s foundation was already applied manually in the production SQL Editor (operator-provided context). Its CLI migration ledger is not yet verified. This implementation has not applied any remote migrations. No production credentials, real screenshot data, live extraction or publication were used for this delivery. New private upload infrastructure is documented in the Phase 8B guide. All existing public pages and fictional import/review demonstrations still use their explicitly fictional in-memory data, even when Supabase is configured. Administrator sign-in is at `/admin` (also linked in the footer).

## Connect the existing modern-league project

1. In the Supabase dashboard select **modern-league**. From its Connect/API settings copy the project URL and **publishable** key (`sb_publishable_…`). Never use a secret or service-role key in this app. This implementation deliberately accepts only the new publishable format.
2. Run `cp .env.example .env.local`. Replace both placeholders locally with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Restart Vite (`npm run dev`). Vite embeds these public values at build time; configure the same two variables in the eventual build environment. Do not paste keys into issues or commit environment files. `.env`, `.env.*`, and `*.local` are ignored except `.env.example`.
3. Missing configuration leaves all demonstrations working and shows a configuration notice on `/admin`. Partial/invalid configuration fails closed. Configuration never changes the demo into official data or triggers writes.

### Deployment environment

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the hosting
provider's build environment, or in the CI job that runs `npm run build`.
Configure preview and production builds separately as appropriate. If you build
locally and upload `dist/`, set them on the build machine instead.

Vite embeds these public values into browser assets at build time. Runtime-only
variables on a static host cannot update an existing bundle; rebuild and redeploy
after changing either value. Never use secret/service-role keys, database
passwords, or AI provider secrets in `VITE_*` variables. The placeholder-only
`.env.example` is safe to track; `.env.local` belongs beside `package.json`, is
ignored by Git, and must not be committed. Restart Vite after local changes.

Environment configuration does not apply migrations, change database permissions,
or enable official approval or publication.

## Review and apply migrations manually

Use a current Supabase CLI on your workstation. Start with a disposable local database, not the live project:

```sh
npm ci
npx supabase init  # once, if supabase/config.toml is absent
npx supabase start
npx supabase db reset --local
npm run typecheck
npm test
npm run build
```

The checked-in migration is `supabase/migrations/202611060001_foundation.sql`. `db reset --local` destroys only the local database; never pass a linked/remote option. The automated database suite uses embedded PostgreSQL (PGlite), with minimal Auth role/UID stubs; it does not substitute for testing the real local Supabase Auth/PostgREST stack.

### Existing production Phase 8A: reconcile before any push

**Do not reapply `202611060001_foundation.sql`. Do not run `supabase db push` yet.**
The foundation was already manually applied. Follow the ledger reconciliation and
manual approval checklist in [Phase 8B setup](SCREENSHOT_IMPORT.md#manual-approval-checklist).
This is a prerequisite even for recommending a remote push. A fresh disposable local
database still applies both migrations in order. No live SQL or CLI history repair
was executed for this delivery.

## Configure administrator authentication

1. In Authentication settings enable email/password sign-in. Disable public sign-ups for this administration-only flow. The app supports password recovery email requests and password updates; it does not offer signup. Configure the exact recovery URLs below and an MFA policy before production administration.
2. Create the initial administrator account manually through the dashboard Authentication user management and set a strong password through your organization's approved process. Copy its Auth user UUID; do not confuse it with a player ID.
3. A database operator, through the SQL editor with elevated privileges, grants access explicitly:

```sql
insert into private.administrators (user_id, reason)
values ('ACTUAL_AUTH_USER_UUID', 'Initial administrator authorized by league owner');
```

4. Sign in at `/admin`. An account without the database grant receives no administrator access. User metadata and claims supplied by the user do not grant access. Neither ordinary users nor administrators can mutate the administrator table through the API. To revoke access, an operator deletes its row and disables the Auth account/sessions as appropriate; RLS rechecks the database grant on each request.
5. Verify with separate anonymous, ordinary-authenticated, and administrator sessions against a **local/staging** Supabase instance: only the public projection is publicly readable; drafts/corrections are administrator-only; role escalation, impersonated audit actors, direct approval/publication, and private record reads fail. Do not publish live data during this verification.

## Schema and API boundary

UUID player IDs and a separate nonunique identity/alias table prevent name-based merges. Seasons have explicit competitive years/ordinals; events preserve local date/time, named zone, fold offset and actual instant. No official calendar, players or championship dates are seeded. Calendar consistency, DST and standings validation remain in the existing pure domain modules, not inferred in SQL.

### Draft correction storage and reconstruction

`import_drafts.original` contains exactly one immutable Phase 6/7 `ImportValues`. Each `import_corrections.snapshot` contains **one individual `Correction`**, not an `ImportDraft` or cumulative history:

```ts
{
  values: ImportValues,             // corrected values, including the resulting extraction audit
  reason: string,                   // nonblank; must equal the row's reason column
  extractionConfirmations?: [      // only explicit actions performed in THIS revision
    { path: string, value: string | number }
  ]
}
```

Revision numbers start at 1. `values.extraction`, when present, retains the domain's source report, required field paths and resulting value-bound confirmations. This audit is part of the individual correction's values; neither the draft's `original` nor its cumulative `corrections` array is embedded in a correction row. The source original is never overwritten. Actor/time metadata stays in database columns under the existing authorization and append-only controls.

`leagueRepository.loadDraft(id)` loads the immutable original, requests correction rows ordered by revision with an **exact database count**, and calls the typed `reconstructImportDraft(originalRow, correctionRows, expectedRevision)` in `src/data/reconstruction.ts`. The expected revision is the full database count, never the returned page length. A missing count or API page-limit truncation fails closed. The loader does not sort, deduplicate, skip or repair history: every row must have a unique row ID, the same draft ID, and the exact next revision `1..N`, with exactly N rows. Missing prefixes, gaps, duplicates, reordering and omitted trailing rows relative to the count all fail. A large history exceeding the API limit must be fetched in full with a reviewed consistent pagination implementation before it can be loaded; partial histories are never accepted.

Every JSON object is parsed from untrusted data into the precise domain shape. Missing required fields, wrong types, unknown fields (including old cumulative draft payloads), blank/mismatched reasons and malformed confirmation actions are rejected. Editable null/missing-value sentinels remain editable: reconstruction does not claim the draft is ready. Parsing rebuilds audit object keys in domain order because PostgreSQL JSONB can reorder keys; arrays, row identities, revisions and actions retain their original order. `validateExtractionEvidence(draft, false)` replays the original evidence and **every** intermediate correction/action using the existing Phase 7 integrity rules. Removed/forged audits, altered action paths/values, duplicate actions and inconsistent intermediate confirmations fail closed. The resulting `ImportDraft` has `state: 'draft'`, no decision, and deeply frozen independently copied original/corrections. Persistence never restores approval or readiness.

Before appending, `appendCorrection` validates the candidate history, reloads the persisted history, and compares its original and entire correction prefix with the candidate. Only the last individual correction is serialized. Stale or rewritten prefixes fail before insert; a race after comparison is rejected by the existing unique sequential revision constraint/policy. Reload and reconcile conflicts rather than silently overwriting or dropping another administrator's work. `createDraft` also validates the original's structure and source evidence before saving.

These are consistency/integrity checks backed by database immutability, not cryptographic attestations: a database owner able to bypass those controls and rewrite an entire self-consistent history (or remove its tail and change its count) cannot be detected from that database alone. JSON also cannot prove that an administrator actually reviewed a source. Official authorization/publication remains disabled, and a later trusted service must perform full registry/calendar/duplicate/readiness validation before approval. The repository remains separate from the fictional UI.

The pending foundation migration's comment now specifies this format; its SQL structure, RLS, grants and triggers are unchanged. No live migration or conversion was run. Any local experimental rows using the previous cumulative format are rejected and require explicit operator review/export and recreation in a disposable local database, never silent conversion or history loss.

Approval history, normalized tournament/player records, evidence and screenshot metadata, and a separate public snapshot table establish future storage boundaries. Foreign keys require approved decisions for results; unique source/event identities prevent duplicate official events. Record counts are nonnegative and bounded by scheduled rounds. All audit/official rows are immutable. No browser grant enables approvals, publication, calendar/registry writes, extraction evidence writes or screenshot writes. In the Phase 8A baseline, administrators could read private records and create/append drafts; Phase 8B narrows reads to owners and moves correction appends behind the server. This is a deliberate Phase 8A safety gate, not a complete operational import system.

Only `published_results.public_snapshot` is the public league projection (plus its result ID and publication time; publisher UUID is excluded by column privileges). Never place screenshots, extraction reports, aliases or sensitive data there. Public player/season/event information will be embedded in a reviewed projection rather than exposing private registry/calendar tables. Public projection payload shape and attribution/privacy require governance review before enabling publication.

The Phase 8A migration alone creates no Storage bucket or upload policy. Phase 8B supplies a reviewed private bucket migration and trusted upload function; see SCREENSHOT_IMPORT.md for limits, policies, retention proposals and required manual steps. Existing unrelated project buckets are outside this migration; audit them separately before connecting any upload workflow.

`src/data/database.ts` is an intentionally narrow, typed API subset, not a full generated database schema. Expand it from `supabase gen types typescript --local` after applying locally when adding further endpoints; review generated changes. There is no secret-key client or approval/publish method.

## Decisions still required before official operation

- League authority for administrator provisioning/removal, MFA/recovery and audit retention; whether approval requires a second administrator. No two-person policy is invented here.
- Registry ID allocation/merges, trusted source formats and durable source keys, complete-field evidence, official calendar ownership and schedule-change handling.
- Approval/publication transaction: trusted server-side replay of extraction confirmations and immutable corrections, current registry/calendar reconciliation, complete standings, source/date/name and championship-period collision checks with atomic reservations. SQL uniqueness alone does not implement all conservative duplicate checks.
- Approved result correction/revocation/replacement and publication payload/version/privacy policy. Until decided, no browser can create or change official records or public projections.
- Screenshot consent, retention, deletion exceptions to audit immutability, abuse controls and secure upload implementation. Live AI extraction remains Phase 8B.
- Drops, cancellations, disqualifications, unranked finishers, period completion and future-year scoring remain governed by existing unresolved rules.

Do not remove the publication gate until these controls have a reviewed server implementation and authorization/integrity tests against actual Supabase. Scoring, calendar, confirmation and approval domain rules are unchanged by Phase 8A.

## Password recovery on GitHub Pages

In **Authentication → URL Configuration**, set:

- **Site URL:** `https://blaframboise.github.io/modern-league/`
- **Redirect URLs:** add exactly `https://blaframboise.github.io/modern-league/?recovery=1`
- For local development only, optionally add `http://localhost:5173/?recovery=1` (or the exact origin/port used). Do not add broad production wildcards.

Keep the Reset Password email template's Supabase `{{ .ConfirmationURL }}` link. It must go through Supabase verification, preserving the request's redirect target; do not replace it with a bare app URL, a hash route, or a custom token-hash template. The client explicitly uses the implicit flow. Successful verification returns to the root above with `#access_token=…&refresh_token=…&type=recovery`. Errors may return an error fragment. A `#/reset-password` redirect would compete for the same fragment and is not supported. PKCE `?code=` and custom token-hash callbacks are not implemented.

The entrypoint captures and removes the callback fragment with `history.replaceState` **before mounting HashRouter**, then uses a dedicated in-memory Auth client (no persistence, auto-refresh, or cross-tab broadcasting), calls `auth.setSession` and server-verifies the user with `auth.getUser`. Only that successful recovery attempt displays the new-password form. A query marker, an existing login, or visiting the reset route alone does not unlock it. The form requires matching passwords of at least 12 characters; Supabase's configured password policy remains authoritative. `auth.updateUser({ password })` changes the password, then the app signs out the isolated recovery session. Session establishment/verification and password-update failures also clear that recovery session with local-scope sign-out, including thrown errors and partially saved sessions. Correctable password mismatch/length errors retain the recovery attempt for retry. The normal administrator client and its existing persisted session are never used or signed out by recovery. Abandoning or refreshing the page discards the in-memory recovery session. Password recovery never grants administrator membership; existing database authorization and RLS remain unchanged. Other-device session revocation follows Supabase policy; local sign-out does not promise revocation of all sessions.

At administrator sign-in, enter the account email and select **Send password recovery email**. The response avoids confirming account existence. Invalid/expired links require a new email. Refreshing the scrubbed reset page also requires a new link; recovery state is deliberately not persisted separately. Open the email in a trusted browser and avoid sharing recovery URLs. No application logs contain callback tokens or passwords.

Audit: the original client disabled URL detection and had neither recovery handling nor a reset form, so email links could not complete recovery. Automatic URL detection stays disabled to prevent HashRouter races; the callback is handled explicitly instead. The Pages build retains its `/modern-league/` asset base and existing hash routes. Automated tests exercise the installed Supabase SDK with mocked Auth HTTP responses, including session verification, update, expiration and mismatch. No live Supabase dashboard settings were inspected or changed, and no real email was sent. An operator must apply the URL/template configuration above and smoke-test a real recovery email on staging/Pages after separately approving deployment. SMTP delivery, expiry/rate limits, MFA, and the live project's actual redirect allowlist remain operational checks.

To reproduce the production callback browser tests without a live Auth account:

```sh
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npm run build -- --outDir work/recovery-dist
npm exec vite preview -- --outDir work/recovery-dist --base /modern-league/ --host 127.0.0.1 --port 4174
# In another terminal (set BROWSER_EXECUTABLE_PATH if Chromium is elsewhere):
node tests/browser/password-recovery.cjs
```

The browser suite intercepts Auth requests and checks the real production entrypoint before HashRouter, password mismatch without a write, successful update, invalid/expired links, and refresh failure at 390px and 1440px. This test build uses placeholders and belongs only in `work/`; do not deploy it. The regular `npm test` includes SDK-level recovery tests.

## Phase 8B superseding boundaries

See [secure screenshot import](SCREENSHOT_IMPORT.md). `/official-import` is the separate
private draft workflow; `/results-import` remains fictional and in memory. Phase 8B
restricts draft and source reads to their creating administrator and removes browser
correction INSERT privileges. The legacy repository `appendCorrection` helper will
therefore fail closed after migration; operational saves use the trusted Edge Function.
No scoring, readiness, approval, or publication authorization is introduced.
