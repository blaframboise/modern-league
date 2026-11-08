# Modern League — Launch readiness register

Status: **not ready for official public competition launch**. The website can operate in preseason preview mode with private screenshot imports and hypothetical standings.

## Implemented and verified
- Private administrator login, screenshot-review workflow, saved tournament matching, one-step correction and audit trail.
- Private sandbox standings and deterministic scoring calculations.
- Automated validation and local Supabase integration.
- Public pages no longer claim fictional schedule/results as official.
- Approved Marcellus/Nunito Sans Modern Table typography is now applied to production pages; the comparison remains on the unlisted `#/type-compare` page.
- The unlisted four-season 2027 calendar preview uses provisional recurring dates with prerelease and holiday/TBD exceptions. Its verification CSV lists every assumption as UNVERIFIED.

## Blocking work — in operational order
1. **League rules sign-off.** Review and approve authoritative written rules for registration, event eligibility, event frequency and season boundaries, league scoring, championship qualification, ties, corrections, disputes and authority. Existing algorithms cover scoring but do not by themselves authorize policy. Do not publish placeholders as final rules.
2. **Official event and player registry.** Create admin workflows to register confirmed events, date/time/time zone and venue, and resolve identities without merging similar names. Private preseason players must not silently become official players.
3. **Official import review and publication.** Separate authoritative import validation, administrator approval and public publication from the existing private simulation. Use server-side authorization, immutable audit records, atomic transactions, duplicate prevention and explicit draft/version checks. Test restricted roles, concurrent edits and replay attempts.
4. **Real public calendar and leaderboard.** Read only approved schedules and published results from the public data projection. Compute seasonal/annual rankings from official records, handle eligibility/championships, and test against independently calculated fixtures.
5. **Launch operations.** Verify a clean public GitHub Pages build and exact routing on mobile/desktop; authenticate from a new session; perform WCAG/readability checks; configure backups, access recovery, monitoring and a rollback plan; verify no fake fixtures or private sandbox data leak.
6. **Typography and accessibility quality gate.** Modern Table is applied. Verify responsive type sizes, contrast, click targets, keyboard navigation and accessible status labeling on real phones and desktops.

## Release gate
Never populate or claim official league standings from fictional fixtures or private sandbox results. Do not enable a publication endpoint until an authorized operator has approved the rules, publication workflow and tested official fixtures. Launch readiness requires a recorded pass on all six blocking items above.

## Current user-visible pages
- Home: preseason status.
- Leaderboards: official results pending, no sample standings.
- Events/Seasons: schedule pending, no fictional event listings.
- Rules: not yet published.
- Admin: private preseason tools only.
