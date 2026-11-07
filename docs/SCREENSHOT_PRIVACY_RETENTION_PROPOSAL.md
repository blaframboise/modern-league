# Proposed screenshot privacy and retention policy — operator approval required

Status: **Policy defaults approved by league organizer. Retention review/audit code is in draft PR #12; no live cleanup or deletion is enabled.**
Applies only to official Modern League tournament screenshots; the fictional demo remains separate.

## Data and access

- Only administrators may upload screenshots and review their contents.
- A screenshot may contain player names, match records, standings, timestamps and other information visible in the source. Avoid uploading contact details, addresses, account credentials, unrelated faces or other unnecessary identifying information.
- Original screenshots and correction evidence remain in private Supabase Storage. Access requires a currently authenticated administrator and ownership of the draft.
- Publishing **never** publishes the raw screenshot. The separately reviewed public results projection contains only fields explicitly approved for publication.
- Before real participant data is uploaded, the organizer must verify that participants have been informed of screenshot processing, any third-party AI provider, and what public results will display.

## Default retention proposal

| Category | Suggested rule | Status |
| --- | --- | --- |
| Unlinked object left by a failed upload | Eligible for operator-reviewed cleanup after 24 hours without an asset link, after repeated checks that no retry is in flight | Not enabled |
| Abandoned, unapproved screenshot draft | Keep source bytes for 90 days after last source/review activity, then notify/review before deleting | Not enabled |
| Approved result supporting screenshots | Keep source bytes until 1 year after the relevant competitive year ends, subject to an appeal/retention hold | Not enabled |
| Immutable review metadata | Preserve source identifiers, hashes, revisions, actor/reason and deletion tombstones under a separately approved schedule | Not enabled |
| Backups and third-party copies | Must be covered by a separate documented retention/erasure review | Not verified |

Deletion must be auditable: record actor, authorization, reason, source path/hash, date, attempted action, outcome and retries in an append-only tombstone. Never rewrite or silently discard prior correction history. A deleted source must display as unavailable, not be reassigned or treated as proof it was never uploaded.

The pending database migration `202611060003_screenshot_retention_audit.sql`
adds an immutable, private event journal for operator holds, hold releases, deletion
requests and their outcomes. Browser roles cannot write it; only a trusted
server role can invoke the audited recording function.

`supabase/verification/screenshot-retention-eligibility.sql` now reports
**candidate** orphans and sources past the approved 90-day / one-year rules.
It excludes active holds and pending requests, and never deletes bytes.
An approved result that has not been published does not become eligible as an
abandoned unapproved draft.

**There is no purge worker or deletion endpoint in this release.** Deletion
requires implementation and separate verification of two-stage deletion,
in-flight upload locking, backups/appeals, immutable outcome evidence and
operator approval before it is safe to enable. The current controls create a
reviewable foundation, not a claim of automatic expiration or erasure.

## AI provider decision (not yet authorized)

No screenshot may be sent to an external image-understanding provider until the organizer approves:

1. Which provider receives the image and its data-processing terms.
2. The permitted data and confirmation that participants have been appropriately informed.
3. Budget / usage ceilings and a fail-closed response to exhausted limits.
4. Whether source images may be retained or used for training by that provider; prefer zero training and minimum available retention.
5. Human confirmation of every suggested player identity, match result and published field.

AI extraction is a proposed draft aid, never an official result or authorization to publish. Uploading must continue to function without AI.

## Operational launch gate

- Real Auth, Storage, PostgREST and Edge integration tests must pass on an isolated environment.
- Owner quota, per-draft quota and durable per-hour request limits must pass regression checks.
- Baseline migration history and deployment procedure must be reconciled before modifying production.
- Approved retention/deletion controls and participant notice must be in place before processing real screenshots.
- The administrator must explicitly authorize production deployment; do not deploy by merging PR #12 or by applying migrations automatically.
