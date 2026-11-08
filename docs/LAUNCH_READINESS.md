# Modern League — Launch readiness register

Status: **public leaderboard reads official published events and applies approved scoring, but no 2027 official tournaments have been published and first-event acceptance testing remains.** Private screenshot imports and test standings remain separate. Event dates are the organizer's working league schedule, not independent confirmation of every venue booking.

## Implemented and verified
- Private administrator login, screenshot-review workflow, saved tournament matching, one-step correction and audit trail.
- Dedicated administrator Publish Results screen reuses the reviewed screenshots, official (not sandbox) player registry and aliases. Unique existing-player matches are suggested; unmatched players are created atomically on successful publication.
- Live database publication RPC checks administrator ownership, review and calendar revisions, 2027 date classification, actual round counts, player mappings and championship tie groups. It atomically writes official event, approval, player records and a public result snapshot. Future events and replayed event dates are rejected.
- Public Leaderboards reads only `published_results`, reconstructs results into the existing deterministic standings engine, supports annual and Season 1–4 filters, event history, points breakdown and participation requirements. It withholds champion crowns until a separate finalization mechanism exists. No sandbox/fictional data is used.
- Private sandbox standings and deterministic scoring calculations.
- Automated validation and local Supabase integration.
- The public Events page now shows the organizer-accepted 2027 working schedule. No fictional results are published.
- Approved Marcellus/Nunito Sans Modern Table typography is now applied to production pages; the comparison remains on the unlisted `#/type-compare` page.
- Private screenshot review now looks up its tournament date in the saved calendar, derives REG/SC/LC and season assignment, previews score formulas, and refuses PR/TBD/unscheduled dates; it rechecks the scheduler revision at save. This is still a private draft, not official publication.
- The 2027 four-season calendar is available on public Events and administrator-managed through the month-by-month scheduler. REG, SC, LC and PR dates are the working schedule; TBD holiday dates are excluded from confirmed event assumptions. The CSV reflects these classifications.

## Blocking work — in operational order
1. **Published operational rules and implementation.** The Rules page now defines store-controlled tournament participation and results, the seven-calendar-day notice deadline (while allowing late store-verified corrections), handling of unplayed and canceled rounds through official records, leaderboard nicknames, minimal information collection and historical record retention. Build nickname requests, correction auditing, retention procedures and operator access into the official workflow before launch.
2. **Official results workflow validation.** The existing official registry and data structures are connected to the private reviewed draft through a single server-authorized Publish Results transaction. Complete a controlled first post-event publication, validate against independent scoring, and document handling for calendar changes after publication. Sandbox players never become official players by implication.
3. **Post-publication corrections.** Initial publication is separate, administrator-confirmed and audited. Implement a second authorized, versioned correction/republication procedure so later store-verified changes update both underlying official records and the public projection.
4. **Title finalization, champion crowns and winner displays.** Public Leaderboards now computes annual/seasonal standings from approved published events only. Create a reviewed finalization decision after each championship and assign numbered seasonal crowns, the next-year glowing League Champion crown and official tournament winners on Championships. Do not confer titles from provisional leaderboards.
5. **Launch operations.** Verify a clean public GitHub Pages build and exact routing on mobile/desktop; authenticate from a new session; perform WCAG/readability checks; configure backups, access recovery, monitoring and a rollback plan; verify no fake fixtures or private sandbox data leak.
6. **Typography and accessibility quality gate.** Modern Table is applied. Verify responsive type sizes, contrast, click targets, keyboard navigation and accessible status labeling on real phones and desktops.

## Release gate
Never populate or claim official league standings from fictional fixtures or private sandbox results. The publication endpoint is administrator-only, requires a previously reviewed official screenshot and blocks future events; it has no records to publish before 2027. Do not declare the first real event published or the public leaderboard live until post-event acceptance testing and the remaining launch checks pass.

## Current user-visible pages
- Home: preseason status.
- Leaderboards: approved official event snapshots automatically recalculate public seasonal/annual standings. Until the first real 2027 publication, the page correctly displays an empty official-results state.
- Events/Seasons: working schedule visible; Seasons explains competition mechanics, winner-versus-champion titles, and crown badges, with 10 empty title slots until official results are published.
- Rules: scoring, standings, championship calculations, store authority, seven-day reporting, late verified corrections and minimal privacy/retention policies published.
- Admin: private screenshot drafts and sandbox tools plus the dedicated official Publish Results screen; future 2027 tournaments cannot be published early.
