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
- Seasonal championship maximum: 40 points.
- Annual championship maximum: undecided between 80 and 120; make configurable without silently choosing a value.
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
- Implement and test regular-event scoring and best-eight aggregation first. Report results and unresolved rules before implementing championship scoring.

## Current assumptions and unresolved decisions
- This repository initially contained only a README heading; no React application or database integration existed.
- Scoring inputs are official aggregate wins/draws and scheduled rounds. Fewer recorded wins/draws than scheduled rounds are allowed (losses or unplayed rounds do not earn points). No individual matches or bye/intentional-draw adjustments are inferred.
- A seasonal aggregation call receives regular results for exactly one player and season. The caller handles event classification, season assignment, official participation, and corrections. Duplicate event IDs are rejected to avoid double counting.
- Every supplied distinct regular event counts toward attendance, including zero-point results; attendance includes results beyond the best eight. Confirm attendance handling for drops, disqualifications, and cancelled events before importing them.
- Numerical calculations use unrounded JavaScript numbers. Equal-point results retain input order for selection only; this is not a standings tiebreaker.
- Pending: championship placement-to-points schedules (including ties, cuts, Swiss versus elimination results, and non-finishers); annual maximum of 80 or 120; annual cumulative aggregation; exact season boundaries and event calendar; tournament admission criteria; scope/denominator for overall match-point percentage and perfect-finish counts (all events versus counted eight); optional playoff rules; award selection procedures.
- Do not derive championship scoring from regular-event scoring or publish a completed league ruleset until these decisions are resolved.
