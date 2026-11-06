# Phase 8A — Supabase foundation

No migrations have been applied remotely. No credentials, official data, storage uploads, live extraction, or publication are included. All existing public pages and import/review flows still use their explicitly fictional in-memory data, even when Supabase is configured. Administrator sign-in is at `/admin` (also linked in the footer).

## Connect the existing modern-league project

1. In the Supabase dashboard select **modern-league**. From its Connect/API settings copy the project URL and **publishable** key (`sb_publishable_…`). Never use a secret or service-role key in this app. This implementation deliberately accepts only the new publishable format.
2. Run `cp .env.example .env.local`. Replace both placeholders locally with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Restart Vite (`npm run dev`). Vite embeds these public values at build time; configure the same two variables in the eventual build environment. Do not paste keys into issues or commit environment files. `.env`, `.env.*`, and `*.local` are ignored except `.env.example`.
3. Missing configuration leaves all demonstrations working and shows a configuration notice on `/admin`. Partial/invalid configuration fails closed. Configuration never changes the demo into official data or triggers writes.

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

After reviewing SQL and passing local checks, an operator may apply it to the existing project. Do not create a second project. Back up existing data, inspect existing schemas for conflicts, and use the actual dashboard project reference:

```sh
npx supabase login
npx supabase link --project-ref YOUR_ACTUAL_PROJECT_REF
npx supabase db push --dry-run
# Review the target and migration list; only then, manually:
npx supabase db push
```

Alternatively run the migration once through the project's SQL editor, using a controlled migration ledger. Do not mix workflows without reconciling migration history. Never run either remote application step as part of CI or application startup. No remote command was executed for this delivery.

## Configure administrator authentication

1. In Authentication settings enable email/password sign-in. Disable public sign-ups for this administration-only flow. No signup/reset/email sending is invoked by the app. Configure the Site URL and allowed redirect URLs for the intended app origins before adding any future email/recovery flow. Configure a recovery procedure and MFA policy before production administration.
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

Draft originals and append-only correction snapshots preserve original extraction reports, value-bound confirmations and correction actions. Their JSON is **untrusted draft data**, never an attestation of readiness. The typed repository saves originals and full corrected domain snapshots, reads revisions in order, and propagates errors. It is intentionally separate from the fictional UI. Concurrent corrections use unique sequential revisions; a conflict requires reload/reconciliation rather than retrying over another administrator's work. A later trusted service must replay the complete persisted history using the existing domain validators before approving anything.

Approval history, normalized tournament/player records, evidence and screenshot metadata, and a separate public snapshot table establish future storage boundaries. Foreign keys require approved decisions for results; unique source/event identities prevent duplicate official events. Record counts are nonnegative and bounded by scheduled rounds. All audit/official rows are immutable. No browser grant enables approvals, publication, calendar/registry writes, extraction evidence writes or screenshot writes. Administrators can read those private records and create/append drafts only. This is a deliberate Phase 8A safety gate, not a complete operational import system.

Only `published_results.public_snapshot` is the public league projection (plus its result ID and publication time; publisher UUID is excluded by column privileges). Never place screenshots, extraction reports, aliases or sensitive data there. Public player/season/event information will be embedded in a reviewed projection rather than exposing private registry/calendar tables. Public projection payload shape and attribution/privacy require governance review before enabling publication.

No Storage bucket or upload policy is created. Therefore the app uploads no screenshots and has no public object URLs. Before enabling uploads, provision a private bucket with server-side MIME/signature validation, size/count/rate limits, per-admin policies and retention/deletion rules. Existing unrelated project buckets are outside this migration; audit them separately before connecting any upload workflow.

`src/data/database.ts` is an intentionally narrow, typed API subset, not a full generated database schema. Expand it from `supabase gen types typescript --local` after applying locally when adding further endpoints; review generated changes. There is no secret-key client or approval/publish method.

## Decisions still required before official operation

- League authority for administrator provisioning/removal, MFA/recovery and audit retention; whether approval requires a second administrator. No two-person policy is invented here.
- Registry ID allocation/merges, trusted source formats and durable source keys, complete-field evidence, official calendar ownership and schedule-change handling.
- Approval/publication transaction: trusted server-side replay of extraction confirmations and immutable corrections, current registry/calendar reconciliation, complete standings, source/date/name and championship-period collision checks with atomic reservations. SQL uniqueness alone does not implement all conservative duplicate checks.
- Approved result correction/revocation/replacement and publication payload/version/privacy policy. Until decided, no browser can create or change official records or public projections.
- Screenshot consent, retention, deletion exceptions to audit immutability, abuse controls and secure upload implementation. Live AI extraction remains Phase 8B.
- Drops, cancellations, disqualifications, unranked finishers, period completion and future-year scoring remain governed by existing unresolved rules.

Do not remove the publication gate until these controls have a reviewed server implementation and authorization/integrity tests against actual Supabase. Scoring, calendar, confirmation and approval domain rules are unchanged by Phase 8A.
