# Modern League — Launch Readiness and Recovery Runbook

Last reviewed: 2026-11-08. Project: `modern-league` (Supabase project ref `nfoxebeikricksbvbutl`).

## Completed verification

- Official publication and post-publication correction were exercised end to end using a disposable local Supabase project, not the real 2027 ledger.
- Administrator publication/correction UI and public, Top 16, and TV leaderboards passed browser testing at phone and desktop viewport widths.
- GitHub Pages static routes, refresh and history, TypeScript, unit tests, and build are in automated CI.
- The organizer completed real-iPhone testing of administration and corrected private test results, including calendar display.
- 2027 calendar database revision 1: six prereleases as agreed; December 24 and 31 explicitly `none`; January 1 baseline regular Modern; no officially published events.
- Confirmed source-control migrations support the official correction audit and restricted public projection.

## Backup and restore — incomplete until a verified backup exists

The connected Supabase organization is on the **Free** tier as checked on November 8, 2026. Guaranteed daily database backups are for paid plans; a Free project must have a user-managed off-site backup procedure. Schema migrations in GitHub are **not** a backup of tournament data.

Owner action before league launch:
1. Decide between upgrading the Supabase organization to a paid plan with dashboard-managed daily backups, or keeping Free and setting up recurring off-site database dumps.
2. For Free: on a trusted computer, install the official Supabase CLI, use its documented `db dump` workflow for this project, and store the backup in a protected location outside GitHub. Keep database credentials out of screenshots, code, chat messages and GitHub Actions artifacts.
3. Confirm a restore **to an isolated local or duplicate database**, never directly over production; verify row counts and calendar settings in the restored copy.
4. Establish a backup cadence at least after every official tournament and after every correction if no reliable daily automation exists.
5. Remember Supabase database backups do **not** contain binary Storage objects; private tournament screenshot files require a separate, access-controlled retention/export plan.
6. Enable Supabase Auth leaked-password protection if available on the chosen plan, and review administrator MFA.

Source: https://supabase.com/docs/guides/platform/backups

## Production data inventory (read-only, November 8, 2026)

| Record category | Count |
| --- | ---: |
| Official published tournaments | 0 |
| Official corrections | 0 |
| Official players | 0 |
| Official approvals | 0 |
| Private test tournaments | 3 |
| Private test results | 34 |
| Private test players | 19 |
| Saved screenshot drafts | 5 |
| Screenshot assets | 5 |

The private test workspace is separate from the official ledger. **There is no requirement to delete private test data to make official 2027 standings start at zero.**

## Proposed preseason cleanup — NOT AUTHORIZED OR EXECUTED

Default: retain private test tournaments and their screenshot evidence until after the first successful live 2027 publication. This preserves an independently useful regression test workspace.

If the organizer explicitly approves cleanup after backup verification:
1. Take and verify a restorable backup and screenshot evidence inventory.
2. Re-query the database for exact draft, player, tournament and storage-object counts. Fail closed if any official publication, correction or approval exists that would be included in deletion.
3. Choose the scope explicitly: **sandbox-only** (3 test tournaments / results / aliases / players / edit history) OR sandbox plus screenshot source histories. Do not silently include saved screenshot drafts or uploaded images.
4. Review dependent foreign keys; `sandbox_results` and `sandbox_result_edits` reference tournaments; `sandbox_player_aliases` and results reference players. Use a migration explicitly limited to approved IDs, a single transaction, checked row counts, no cascade into official records.
5. Private screenshot audit tables (`import_drafts`, `import_corrections`, `screenshot_assets`, `extraction_evidence`) have immutability triggers. Never disable those triggers to reset a test workspace. Source-object removal must respect retention rules and preserve audit evidence.
6. Validate public and official leaderboards, selected 2027 calendar, admin access and post-cleanup counts.

**No cleanup SQL should run until the organizer explicitly authorizes the precise scope and a verified backup exists.**

## Final pending items for organizer

- Verify and document a tested database backup/restore mechanism. Free plan currently has no guaranteed automatic backup.
- Confirm whether the three sandbox tournaments should remain available through the first real tournament (recommended), or approve an explicit narrow deletion scope after backup.
- Confirm the five proposed 2027 championship dates, if not already separately approved.
- Confirm January 1 as planned; it can be changed later via the scheduler.

## Security status

The live security advisor still notes callable `SECURITY DEFINER` RPCs; published-correction and publication functions enforce administrator membership in their bodies and automated tests reject unauthenticated or non-admin calls. The screenshot access function is used in the Storage read policy and checks the signed-in administrator and owning draft. Private tables with RLS enabled and no direct policies are intentionally not end-user readable. Auth leaked-password protection requires dashboard evaluation. Recheck advisors after any authentication or RLS change.

## Completion criterion

The launch is ready when the owner signs off on the rules/calendar, backup-and-restore is demonstrated, and the official 2027 ledger still starts with zero fictitious publications. Private test data can remain isolated without interfering with official results.
