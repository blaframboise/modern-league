# Official publication audit — 2026-11-08

Scope: source-code review only. No official results were published or modified. This does **not** certify the deployed Supabase instance or complete launch testing.

## Verified from repository

- `src/pages/PublishResultsPage.tsx` requires an administrator session, explicit confirmation, a reviewed draft, an event classified against the configured 2027 calendar, complete match records, and reviewed player matching. It invokes `publish_reviewed_tournament`; no browser-side direct insert to the official ledger is used.
- `supabase/migrations/20261108050921_championship_tie_group_publication.sql` implements the current publication RPC, using database-side checks and writes to approval history, scheduled events, tournament results, player records, and the public snapshot. Publication requires an authenticated administrator and is guarded against reused source/date.
- `supabase/migrations/202611060001_foundation.sql` configures RLS and immutable update/delete triggers for the official history and public results. Public access is restricted to a published snapshot projection.
- `src/data/publicStandings.ts` parses public snapshots using an allowlist and reconstructs standings from published records, not from sandbox results.
- `src/pages/EditTournamentResultsPage.tsx` and `correct_sandbox_tournament_results` are private-test-only, separate from official results.
- Retention candidate rules in `202611060004_screenshot_retention_review.sql` include 24-hour orphan uploads, 90-day abandoned unapproved sources, and later published-source reviews. The current deletion RPC in `202611060005_screenshot_orphan_cleanup.sql` is restricted to eligible **unlinked** orphan files. It does not delete tournament records.

## Launch blocker: no post-publication corrections

The official result and published snapshot tables are immutable. No versioned official correction RPC, audited corrected-public-snapshot selection, or administrative correction page exists in the audited code. Edits to screenshot reviews and the private TEST STANDINGS cannot alter the official ledger. Published results should be considered permanent under the current implementation. **Do not test this by publishing fictitious results to the live 2027 ledger.**

### Required before launch

1. Design an append-only official correction record keyed by published tournament and revision, with actor, reason, original values, corrected values, and timestamp.
2. Implement administrator-only, concurrency-checked database correction with server-side validation of complete player records and championship placements. Preserve the original approval, original public snapshot, and immutable history.
3. Publish an effective current projection that applies only the latest accepted correction for each tournament; public leaderboard must consume this projection without duplicating the original event.
4. Add a dedicated correction UI with an explicit before/after comparison, required reason, confirmation, and visible audit history.
5. Test in isolated ephemeral PostgreSQL: permissions (anon/other users denied), rollback on invalid data, duplicate/competing corrections, season scoring recalculation, championship placement ties, and unchanged history.
6. Complete a non-production browser end-to-end publication/correction test before allowing real 2027 publication.

## Additional launch checks

- Confirm the deployed database migrations, administrator membership, grants, and RLS match source control; this repository audit cannot verify deployment state.
- Validate screenshot uploads and official player matching on an actual phone, including accessibility and small-screen table scrolling.
- Reconcile and remove sandbox records through a separately reviewed, administrator-authorized cleanup procedure. **Do not delete official 2027 tables, approval history, screenshots under hold, or published results.** No bulk sandbox cleanup was performed by this audit.
- Record and verify the final official calendar before opening official publication.

## Status

Private tournament result correction and test standings recalculation: manually confirmed by the organizer. Official publication correction: **not implemented / not validated**. No production mutation performed.

## Implementation update — 2026-11-08

The launch blocker identified in the original audit has been addressed in the source code and database migrations:

- `20261108184615_official_result_corrections.sql`: immutable, append-only revision history; administrator-only correction RPC; guarded full-record validation and competition-rank checks.
- `20261108185004_secure_official_correction_projection.sql`: security-invoker public standings view with column-restricted correction data and administrator-checked audit history RPC.
- The public leaderboard, Top 16, and TV screens now consume effective corrected result snapshots, preserving tournament identity and recalculating standings from the latest accepted revision.
- The `/correct-official-results` administrator page presents current vs corrected records, requires a reason and explicit acknowledgement, and shows the audit trail.
- The connected Modern League Supabase project has both migrations applied. A read-only verification found zero official publications and zero official corrections at rollout. No fictitious official results were inserted.
- Automated PGlite coverage verifies revisions, denial of anonymous correction and audit access, original snapshot immutability, regular event re-ranking and championship tie scoring. Existing test suites and secure screenshot browser smoke tests passed on the implementation branch. Local Supabase integration verifies migration application.

Remaining checks: verify the actual deployed web UI on a phone, run a browser end-to-end test against isolated *published* results (without inserting them into the real official ledger), and confirm year-end cleanup and schedule readiness. Original approval and player_records are historical, immutable evidence; the effective public snapshot is the current published projection. Changes to player identities or event metadata are intentionally not supported in the score-correction interface.
