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
