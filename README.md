# Modern League

Development for a 2027 Magic: The Gathering Modern league. The initial repository
contained only this heading: no React application, UI, importer, Supabase client,
authentication, or tests were implemented.

The current implementation adds a pure TypeScript regular-event scoring module
in `src/scoring/regular.ts` and automated tests. Website development is still pending.
Project requirements and unresolved league rules are recorded in `AGENTS.md`.

Use Node.js 22.18+ (verified on Node 24), then run:

```sh
npm ci
npm test
npm run typecheck
```

`calculateRegularEventPoints` accepts official aggregate wins, draws, and scheduled
rounds. It returns unrounded points; byes and intentional draws stay as officially
recorded. Losses and individual match data are unnecessary.

`aggregateSeasonRegularResults` takes one player's regular results for one season,
rejects duplicate event IDs, and returns all scored results, all earned points,
best-eight seasonal points, counted/excluded results, attendance, and seasonal
cumulative-title eligibility. It never removes an ineligible player's results.
Callers must select the correct player, season, and regular event type.

`getCumulativeTitleEligibility` checks seasonal or annual attendance thresholds.
Pass a season's event count for its seasonal flag and a year's count for its annual
flag; this does not determine championship tournament admission.

Scores use full JavaScript number precision without intermediate decimal rounding.
The module does not assign leaderboard ranks, resolve cumulative ties, calculate
championship points, or calculate annual totals. Championship allocation rules and
annual aggregation must be decided before those features are implemented.

Supabase and authentication have not been connected or implemented.
