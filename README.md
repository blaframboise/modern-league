# Modern League

A responsive foundation for a Magic: The Gathering Modern tournament league, featuring the **2027 Modern Championship Series**.

## Requirements and installation

Use Node.js 22.18+ (Node 24 LTS recommended) and npm.

```sh
npm ci
```

## Development

```sh
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173). To expose the development server on your local network, use `npm run dev -- --host 0.0.0.0`.

## Validation and production build

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The build runs strict TypeScript checks and creates optimized static assets in `dist/`. Preview serves that production build locally; it is not a production hosting server. For deployment, configure your static host to serve `index.html` for unknown paths so direct visits and refreshes on routes such as `/events` work.

## Project structure

```text
public/             Original favicon and future static assets
src/app/            Application shell, navigation, and route composition
src/components/     Shared presentation components
src/pages/          Home and section placeholder pages
src/scoring/        Pure regular-event and championship scoring, independent of UI and database
tests/              Automated scoring and eligibility tests
src/features/       Future results, standings, seasons, and championship modules
src/lib/            Future shared services and Supabase integration boundary
src/styles.css      Tailwind CSS entry, theme, and responsive styles
```

React 19, TypeScript, Vite, Tailwind CSS 4 (Vite plugin), React Router, and Lucide icons power the application. Tailwind utility classes can be used alongside the shared component styles and theme tokens.

## Current scope

- Home, Leaderboards, Events, Seasons, and Rules routes, plus a not-found page.
- Dark charcoal and gold interface with original CSS card artwork, responsive navigation, active links, keyboard focus styles, and a skip link.
- Explicit placeholder states; no fabricated standings, events, or published league rules.

Tournament imports, player standings, seasonal championships, annual championships, and Supabase integration will be added in future work. The existing regular-event scoring module is preserved independently of the UI. Authentication, database access, and Supabase credentials are not included or required. Integration notes are in `src/features/README.md` and `src/lib/README.md`.

Modern League is an independent community project and is not affiliated with Wizards of the Coast. No copyrighted Magic artwork or logos are included.

## Existing scoring system

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
The regular module does not assign leaderboard ranks, resolve cumulative ties, or
calculate annual totals. Annual cumulative aggregation remains future work.

Supabase and authentication have not been connected or implemented.

`npm run typecheck` validates the application with Vite bundler resolution and independently validates the scoring module and tests using the existing NodeNext configuration in `tsconfig.scoring.json`. See `AGENTS.md` for project requirements, assumptions, and unresolved league rules. The website pages remain placeholders and do not publish a completed ruleset.

## Approved 2027 championship scoring

`src/scoring/championship.ts` is pure TypeScript with no React, Supabase, or persistence
dependencies. `CHAMPIONSHIP_RULES` explicitly configures 2027: seasonal maximum 40,
annual maximum 120, 75% match performance and 25% final placement. Future years
require an explicit configuration entry; there is no implicit fallback.

- Match points = maximum × 0.75 × (3 × Swiss wins + Swiss draws) / (3 × scheduled Swiss rounds).
- Placement points = maximum × 0.25 × (N − P) / (N − 1).
- Total = match points + placement points. Use full JavaScript number precision;
  `formatChampionshipPoints` returns a two-decimal display string only.

Call `calculateChampionshipPoints` with year, kind (`seasonal` or `annual`),
positive integer `scheduledSwissRounds`, and the complete `participants` array.
Each participant supplies a unique `playerId`, official `swiss` wins/draws/losses,
and `finalPosition`. Records must be nonnegative safe integers and cannot exceed
the scheduled rounds. Official Swiss bye wins and intentional draws remain as
recorded. Elimination results are excluded. Drops keep the scheduled denominator;
unplayed rounds earn zero.

At least two participants are required; smaller fields throw and award no points.
Placement uses official competition ranks: two players tied third both have position
3 and occupy positions 3 and 4; the next player has position 5. Their placement
component averages third and fourth. First receives the full placement component
when untied; last receives zero when untied. All-field ties receive half the placement
component each. Gaps, overlaps, dense ranks, duplicate IDs, invalid positions, and
unsupported years are rejected. Input order is preserved and inputs are not mutated.
Do not infer official positions for unranked non-finishers or disqualifications.

The React application and regular scoring are unchanged. Championship UI/imports,
annual cumulative aggregation, and remaining league policies are separate future work.
