# Modern League — Launch readiness register

Status: **calendar and scoring rules publicly available; official tournament results not ready for launch**. Private screenshot imports and test standings remain separate. Event dates are the organizer's working league schedule, not independent confirmation of every venue booking.

## Implemented and verified
- Private administrator login, screenshot-review workflow, saved tournament matching, one-step correction and audit trail.
- Private sandbox standings and deterministic scoring calculations.
- Automated validation and local Supabase integration.
- The public Events page now shows the organizer-accepted 2027 working schedule. No fictional results are published.
- Approved Marcellus/Nunito Sans Modern Table typography is now applied to production pages; the comparison remains on the unlisted `#/type-compare` page.
- The 2027 four-season calendar is available on public Events and administrator-managed through the month-by-month scheduler. REG, SC, LC and PR dates are the working schedule; TBD holiday dates are excluded from confirmed event assumptions. The CSV reflects these classifications.

## Blocking work — in operational order
1. **Published operational rules and implementation.** The Rules page now defines store-controlled tournament participation and results, the seven-calendar-day notice deadline (while allowing late store-verified corrections), handling of unplayed and canceled rounds through official records, leaderboard nicknames, minimal information collection and historical record retention. Build nickname requests, correction auditing, retention procedures and operator access into the official workflow before launch.
2. **Official event-to-results linkage and player registry.** Calendar dates are accepted as the league's working schedule; next create event identities linked to results, handle changes/cancellations and resolve official player identities. Private preseason players must not silently become official players.
3. **Official import review and publication.** Separate authoritative import validation, administrator approval and public publication from the existing private simulation. Use server-side authorization, immutable audit records, atomic transactions, duplicate prevention and explicit draft/version checks. Test restricted roles, concurrent edits and replay attempts.
4. **Real public leaderboard, title badges and results linkage.** Public Events uses the administrator-saved schedule. Seasons previews numbered seasonal crowns and the glowing annual reigning-champion crown. Connect only approved results to event identities; compute seasonal/annual standings, determine finalized eligible title recipients and enable badges only after publication.
5. **Launch operations.** Verify a clean public GitHub Pages build and exact routing on mobile/desktop; authenticate from a new session; perform WCAG/readability checks; configure backups, access recovery, monitoring and a rollback plan; verify no fake fixtures or private sandbox data leak.
6. **Typography and accessibility quality gate.** Modern Table is applied. Verify responsive type sizes, contrast, click targets, keyboard navigation and accessible status labeling on real phones and desktops.

## Release gate
Never populate or claim official league standings from fictional fixtures or private sandbox results. Do not enable a publication endpoint until an authorized operator has approved the rules, publication workflow and tested official fixtures. Launch readiness requires a recorded pass on all six blocking items above.

## Current user-visible pages
- Home: preseason status.
- Leaderboards: official results pending, no sample standings.
- Events/Seasons: working schedule visible; Seasons explains season mechanics and previews crown badges, but has no invented champions.
- Rules: scoring, standings, championship calculations, store authority, seven-day reporting, late verified corrections and minimal privacy/retention policies published.
- Admin: private preseason tools only.
