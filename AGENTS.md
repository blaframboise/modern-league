# Modern League project requirements

## League structure
- Four seasons per calendar year; regular Modern tournaments generally on Monday and Friday.
- Each season ends with a special championship tournament. The annual championship is in December.
- Tentative league start: January 4, 2027.

## Regular event scoring
- Points = 10 × (3 × wins + draws) / (3 × scheduled rounds), maximum 10 per event.
- Identical records in tournaments of equal length earn identical points.
- Use full numerical precision internally; round only for presentation.
- Only each player's best eight regular results count per season, maximum 80 points.
- Seasonal cumulative-title eligibility requires six regular events; annual cumulative-title eligibility requires 20 regular events across the year.
- Players below these minimums must remain on public leaderboards.
- Keep points earned, leaderboard ranking, and championship eligibility distinct. Cumulative-title eligibility does not establish tournament admission eligibility.
- Use official event results and standings; individual match records are not required.
- Accept byes and intentional draws as recorded in official results.

## Championships
- Seasonal Tournament Champion: winner according to official championship standings.
- Regular Season Champion: cumulative leader before the seasonal championship.
- Overall Season Champion: cumulative leader after seasonal championship points.
- 2027 championship scoring: 75% Swiss match performance and 25% official final placement.
- Match points = maximum × 0.75 × (3 × Swiss wins + Swiss draws) / (3 × scheduled Swiss rounds). Exclude elimination results; accept official byes and intentional draws without adjustments. Drops receive zero for unplayed rounds.
- Placement points = maximum × 0.25 × (N − P) / (N − 1). Require N >= 2. Official ties average all occupied positions; use competition ranks (1, 2, 3, 3, 5). Reject invalid or inconsistent standings.
- Total points are the sum of unrounded components. Display two decimal places only. Validate nonnegative safe integer Swiss wins/draws/losses and positive scheduled rounds; recorded rounds cannot exceed scheduled rounds.
- 2027 annual championship maximum: 120 points; seasonal maximum: 40. Keep configuration explicit by year; reject unconfigured years.
- Annual Tournament Champion and Annual Overall Champion are separate titles.
- Annual championship participation is not automatically limited to the top eight or sixteen.

## Cumulative standings tiebreakers
Apply in this order: championship points; number of perfect regular-event finishes; overall regular-event match-point percentage; shared title if still tied unless a playoff rule is adopted.

## Website
- Public leaderboards, events, seasons, and rules.
- Administrator tools to import official tournament results.
- Supabase for persistence and future administrator authentication.
- Responsive React and TypeScript application.
- Additional non-scoring awards for attendance, sportsmanship, improvement, mentoring, community contributions, and deck creativity.

## Development
- Preserve working functionality. Keep scoring separate from UI and database code.
- Add automated scoring and eligibility tests. Document assumptions and unresolved decisions; do not invent rules.
- Do not connect Supabase or implement authentication yet.
- Preserve regular-event scoring and best-eight aggregation. The approved 2027 championship rules are implemented independently in src/scoring/championship.ts; keep automated tests for both modules.

## Current assumptions and unresolved decisions
- This repository initially contained only a README heading; no React application or database integration existed.
- Scoring inputs are official aggregate wins/draws and scheduled rounds. Fewer recorded wins/draws than scheduled rounds are allowed (losses or unplayed rounds do not earn points). No individual matches or bye/intentional-draw adjustments are inferred.
- A seasonal aggregation call receives regular results for exactly one player and season. The caller handles event classification, season assignment, official participation, and corrections. Duplicate event IDs are rejected to avoid double counting.
- Every supplied distinct regular event counts toward attendance, including zero-point results; attendance includes results beyond the best eight. Confirm attendance handling for drops, disqualifications, and cancelled events before importing them.
- Numerical calculations use unrounded JavaScript numbers. Equal-point results retain input order for selection only; this is not a standings tiebreaker.
- Pending: exact season boundaries and event calendar; tournament admission criteria; optional authorized playoff rules; award selection procedures.
- Championship input requires complete official standings, unique player IDs, explicit Swiss wins/draws/losses, and official competition ranks for every participant including drops. Fewer than two participants throws rather than awarding points. Do not infer missing ranks for disqualifications or non-finishers; official import policy remains unresolved.
- Do not derive championship scoring from regular-event scoring or publish a completed league ruleset while remaining league decisions are unresolved.


## Approved cumulative standings implementation
- `src/scoring/standings.ts` composes the existing scoring modules; do not alter approved formulas.
- Count best eight regular scores per season; aggregate four seasons plus championships annually (maximum 600).
- Every attended regular event counts toward eligibility, perfect finishes, and round-weighted match-point percentage, including results beyond the best eight. Exclude championship matches from regular statistics.
- Perfect means all scheduled rounds won, no draws or unplayed rounds. Percentage is total earned match points / total possible match points. No appearances returns null, compared as zero; never NaN.
- Rank all players by total, championship points, perfect finishes, then weighted percentage. Eligibility must never filter or reorder rankings. Unresolved ties use competition ranks and share cumulative titles among the highest-ranked eligible players.
- Seasonal minimum is six appearances; annual minimum is 20. Engine returns eligibility and separate cumulative title recipient IDs; official tournament winners are independent of cumulative eligibility.
- Presentation alone adds asterisks. Beneath every cumulative leaderboard show "* Has not yet met the participation requirement for the cumulative title." Explicitly completed periods may show "* Not eligible for the cumulative title." Never apply these markers to individual championship tournament standings.
- Keep explicit player/year/season/event IDs; reject duplicates and inconsistent identifiers. Missing championships score zero with explicit recorded flags. No automatic season dates or completion detection.
- Recipient lists describe each snapshot's current eligible leaders; final conferment requires externally confirmed period completion.
- Demo standings are clearly labeled sample data; no official imports or live results are implied. No tournament admission criteria are inferred.
- Preserve scoring tests and cover ineligible first-place players retaining rank while eligible players receive titles in seasonal and annual standings.

## Approved competitive calendar foundation
- Four competitive seasons per league year target January–March, April–June, July–September, and October–December. These are flexible windows, never assignment boundaries.
- Manually schedule named-zone championship starts; never infer weekends, quarter-end dates, or recurring Monday/Friday events. Regular tournaments generally begin January 4, 2027 and occur Mondays/Fridays when explicitly scheduled.
- Seasonal regular scoring ends at the exact championship start. Events at or after that instant enter the next season even before quarter end. Championships retain their explicit owner year/season.
- Season 4 and annual championships are distinct; Season 4 must precede annual. A regular event at or after either cutoff enters the next competitive league year, including December 2027 entering 2028 Season 1. No double counting or offseason classification.
- `src/calendar/` is pure scheduling code plus separate fictional fixtures. Default zone is America/Detroit. Store local date/time/zone, compare actual instants, reject DST gaps and require matching explicit offsets for repeated times.
- Competitive year/season IDs are separate from calendar dates. Supply an explicit initial lower bound, consecutive configured years, and four ordered seasons. Missing cutoffs yield unresolved assignments; do not invent dates.
- Events and Seasons use clearly labeled fictional samples. Do not publish those as announcements. Status is shown only when explicitly supplied.
- Filter regular assignments by both league year and season before passing one player's official results to the existing scoring aggregator. Preserve the existing cumulative standings module and all scoring formulas.
- Official schedule editing, persistence, corrections/cancellations, tournament imports, authentication, Supabase, admission policy, and 2028 scoring approval remain unresolved or out of scope.
- The earlier pending item “exact season boundaries and event calendar” is superseded by championship-start boundaries above; actual official championship dates remain unconfirmed. Earlier wording “per calendar year” describes target windows, not strict competitive boundaries.


## Results import foundation (Phase 6)
- `src/results/index.ts` contains pure registry, tournament, import-state, correction, validation, and approval-gated standings adapters. React is confined to `ResultsReviewPage.tsx`; fixtures are explicitly fictional in `src/results/demo.ts`.
- Stable player IDs identify people; names and aliases suggest candidates only. Equal names can represent distinct players and never cause automatic merges. Explicit registry selection resolves ambiguity.
- Source snapshots and correction snapshots are independently copied and deeply frozen. Every correction needs a reason and resets readiness. Approved/rejected imports are terminal; replacement/revocation policy remains undecided.
- Only valid ready imports can be explicitly approved. Revalidate duplicates against other imports at approval and against all approved records at scoring. Rejected imports do not reserve events. Never pass drafts, ready, or rejected records to official scoring.
- Source key, event ID, same date/name, and championship period collisions block approval pending resolution. Heuristics are conservative, not evidence that two events are identical.
- Tournament year/season assignment is explicit and must reconcile through `src/calendar/index.ts` before readiness, approval and approved-only scoring. Require `Tournament.start` (date/time, named zone defaulting to America/Detroit, optional matching fold offset); null starts remain editable but cannot be approved. Legacy date must match start.date.
- Regular imports must match the engine's resolved competitive year/season at the exact start instant. Missing/unresolved cutoffs block approval with calendar issues; all four seasonal and annual starts in the reviewed competitive year must be configured. Never infer assignments from quarters. Championships must match configured ID, owner period and start instant. Preserve DST rules and do not treat 2028 calendar configuration as 2028 scoring approval.
- Source and corrections survive failed reconciliation. Revalidate against the supplied calendar at scoring, including after schedule changes. The review context has a complete fictional 2027–2028 schedule; this demo is not an official schedule editor. Provenance verification remains necessary before operational imports.
- Regular and Swiss records require explicit wins/losses/draws and scheduled rounds; drops can have fewer recorded rounds. Championship complete-field rank validation delegates to the existing scorer. No scoring formulas or eligibility rules change.
- `/results-review` is an in-memory fictional demonstration. No persistence, database writes, authentication, OCR, AI service, or official publication exists. Existing public demo standings remain independent.
- Remaining decisions: durable source event keys and player ID allocation; identity merge/alias governance; trusted source formats and complete-field evidence; official calendar maintenance and schedule-change governance; authorization/audit retention; atomic duplicate reservation; correction/revocation of approved records; treatment of cancellations/disqualifications/unranked finishers. Pure state checks are not a security boundary.

## Mobile screenshot interpretation (Phase 7)
- `/results-import` is an in-memory fictional demonstration. Capture/file selection and review are real; `mockProvider` returns fixed invented records and never interprets pixels. Keep that distinction prominent. No server, live AI, credentials, authentication, Supabase, persistence or official publication was added.
- `src/extraction/index.ts` owns a provider-independent versioned evidence contract, strict bounded runtime parser, image limits, and mock. Preserve observed/suggested/missing states, source IDs and warnings; missing is null, never zero. Treat all uploaded data/provider text as untrusted. Future live integration must be server-side; secrets must never use VITE variables. README documents endpoint and security requirements; this static app cannot validate server uploads.
- `src/extraction/draft.ts` adapts extraction to Phase 6 drafts. Original reports/requirements are immutable source provenance. `validateImport` checks required human confirmations from the original snapshot at readiness, approval and approved-only scoring; source audit cannot be removed through corrections. Explicit registry matching is always required. Every correction/confirmation needs a reason and resets readiness. Keep approval an explicit separate step.
- Images remain local object URLs; revoke them on removal/replacement/unmount and cancel stale requests. A changed image selection clears review so provenance never refers to replaced images. Support JPEG/PNG/WebP, eight images, 10 MiB each; browser MIME checks are not a security boundary. HEIC conversion is explicit, not silently simulated.
- Preserve all scoring/calendar formulas and existing tests. Verify typechecking, tests, build, and mobile/desktop layouts. Browser emulation tests picker attributes and uploads; real camera UI needs physical-device verification.
- Phase 8 still needs server/provider choice, authorization, secure storage/retention/consent, abuse controls, official registry/calendar governance, complete-field evidence, durable audit and atomic duplicates, and approved-result revocation/publication policy. No provider or persistence configuration should imply these decisions are settled.

## Extraction confirmation integrity
- Confirmations bind exact `{ path, value }` pairs. `src/results/extractionEvidence.ts` derives the field allowlist from original metadata/rows; registry IDs are excluded. Missing/empty values and unknown/nonexistent/duplicate paths cannot be confirmed. Original reports and extracted row identities/order remain unchanged.
- All extraction corrections pass through `correctImport`: require the previous audit unchanged in caller input, invalidate confirmations when values change, and record explicit fourth-argument `confirmExtraction` actions as value-bound `Correction.extractionConfirmations` with a reason. `correctExtraction` is the UI wrapper for that explicit action. A generic correction cannot inject/remove/rewrite audit state. Reverting a value does not revive a confirmation.
- Readiness, approval and approved-only scoring must replay original evidence plus the entire immutable correction/action history and compare current values. Reject invalid approved evidence too. Original observed evidence is initially value-bound; registry identity resolution always remains an independent explicit selection. Preserve the existing mobile workflow, scoring and calendar rules. State consistency does not replace future server authorization.

## Phase 8A foundation
- The Phase 8A request supersedes earlier prohibitions on adding Supabase/authentication. Optional configuration, `/admin`, typed draft access, and version-controlled migrations are implemented; demos remain fictional.
- Keep official browser writes disabled until trusted server replay of the existing approval/evidence/calendar checks, atomic conservative duplicate checks and publication governance are reviewed. No live migration or publication is authorized by implementation alone.
- See docs/SUPABASE.md for manual setup, schema boundaries and unresolved governance.
