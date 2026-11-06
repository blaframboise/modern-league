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
- Leaderboards use clearly labeled fictional sample data; Events and Seasons show fictional scheduling records; Rules retains its placeholder.

Official tournament imports, championship presentation, and Supabase integration remain future work. The existing regular-event scoring module is preserved independently of the UI. Authentication, database access, and Supabase credentials are not included or required. Integration notes are in `src/features/README.md` and `src/lib/README.md`.

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
The regular module remains independent; `standings.ts` composes it with championship scoring for rankings and annual aggregation.

Supabase and authentication have not been connected or implemented.

`npm run typecheck` validates the application with Vite bundler resolution and independently validates the scoring module and tests using the existing NodeNext configuration in `tsconfig.scoring.json`. See `AGENTS.md` for project requirements, assumptions, and unresolved league rules. The leaderboard page demonstrates cumulative standings; the website does not publish a completed ruleset.

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

The approved regular and championship scoring formulas are unchanged. Official imports and remaining league policies are separate future work.

## Cumulative standings API

`calculateStandings` in `src/scoring/standings.ts` accepts an explicitly configured year,
exactly four distinct season IDs, a player roster, regular events with explicit year/season/event
IDs and player results, and complete championship inputs with event IDs. Seasonal championships
require a season ID; annual championships must omit it. A player appears once in the roster and
at most once per event. Unknown player/season IDs, mismatched years, duplicate event IDs across
all event types, and multiple championships for the same period are rejected. Inputs stay immutable.
An omitted championship contributes zero; returned flags distinguish missing results from scored
zero-point results. Include every player who should appear publicly in the roster, including
championship-only players and players with no appearances.

Each season returns `beforeChampionship` and `afterChampionship` snapshots; `annual`
sums the four best-eight regular totals, four seasonal championships, and the annual
championship. Maxima are 80 regular, 120 overall seasonal, and 600 annual points.
Each snapshot exposes all `standings` and separate `cumulativeTitleRecipientIds`.
Seasonal `tournamentChampionIds` and `annualTournamentChampionIds` come directly from official
first positions, regardless of participation or championship scoring totals.

Ranks compare unrounded total points, then championship points, then perfect regular finishes,
then round-weighted regular match-point percentage. All attended events, including those outside
the best eight, count for perfect finishes and percentage. A perfect finish wins every scheduled
round with no draws; remaining rounds otherwise earn zero. Championship matches never enter
regular statistics. No appearances yields an explicit `null` percentage, compared as zero because
no match points were earned. This deterministic convention does not create an extra tiebreaker.
Unresolved ties share competition ranks (1, 1, 3); no ID, name, attendance, or playoff breaks ties.

Eligibility is calculated independently at six seasonal / 20 annual regular appearances.
Ineligible players retain their public positions. The highest-ranked eligible player(s) receive
the cumulative title, including tied eligible players below an ineligible leader. Empty eligible
fields return no recipients. Snapshot recipients are current leaders until the caller confirms
the period is complete; championship-recorded flags do not imply the season or year has ended.

The UI alone adds `*` beside ineligible players and renders this visible explanation beneath
every cumulative table: "* Has not yet met the participation requirement for the cumulative title."
With explicitly supplied `ended=true`, it instead says "* Not eligible for the cumulative title."
Dates and period completion are not inferred. These markers do not apply to individual
championship tournament standings. The demonstration page defaults to active-period wording,
uses only fictional sample records, and has no live database or official results import.

Remaining policy questions: official championship dates and event records; official import treatment
of cancellations, disqualifications, drops and unranked finishers; tournament admission criteria;
and any future authorized playoff or non-scoring award procedures. No admission requirement,
Top 8/16 restriction, playoff, Supabase connection, or authentication is implemented.

## Competitive calendar and scheduling

`src/calendar/index.ts` supplies pure scheduling logic; `src/calendar/demo.ts`
contains separate, explicitly fictional records used by Events and Seasons.
There are no official announcements, generated recurring tournaments, results,
players, or winners in these fixtures. The existing sample leaderboard remains intact; Rules remains a placeholder.

Each configured league year has exactly four distinct season IDs and a separate
annual championship. Target windows are January–March, April–June,
July–September, and October–December. These windows are scheduling targets only.
Championship dates are entered manually, without selecting weekends or quarter ends.
Season 4 and the annual championship are distinct events; Season 4 must precede
annual. Regular tournaments generally occur Mondays and Fridays starting January
4, 2027, but that pattern never creates an official event.

A regular event starting strictly before its seasonal championship start counts
in that season. At the exact cutoff it moves into the next season, including
March dates entering Season 2 before April. Championship ownership is explicit
in its containing year/season configuration and is never passed through the
regular-event classifier. At or after the Season 4 cutoff or annual cutoff,
regular events enter the next configured league year's Season 1. Consequently,
a December 2027 event can belong exclusively to 2028 Season 1. League-year and
season identifiers describe competition membership, not the event's calendar year.
No events are classified as an unscored offseason.

`CalendarConfig.begins` explicitly bounds the first configured season. Years must
be consecutive and ordered, with four seasons in competitive order. IDs are
unique across all championship and regular events; season IDs are scoped to a
league year. Championships may omit `start` until scheduled. Invalid configuration
throws; insufficient cutoff information yields `{ status: 'unresolved', eventId,
reason }`. Unknown boundaries are never filled from calendar quarters. A known
annual cutoff proves year rollover even when seasonal dates are missing, but the
next year's Season 1 still needs its upper cutoff for a resolved assignment.

Starts store ISO local `date`, `time` (HH:mm or HH:mm:ss), and an optional named
`timeZone`, defaulting to `America/Detroit`. `startInstant` compares actual UTC
milliseconds using the runtime's IANA zone data, independent of the browser's
zone. Invalid dates and DST gaps are rejected. Repeated DST times require an
explicit matching `offset`, such as `-04:00` or `-05:00`. Keep runtime time-zone
data current. Dates before year 0100 are outside the supported scheduling range.

`assignRegularEvents` returns one discriminated assignment per supplied regular
event. Filter assigned records by **both** `year` and `seasonId`, then join official
results by `eventId` for one player before calling `aggregateSeasonRegularResults`.
The existing aggregator accepts only eventId and official record fields; it does
not enforce calendar membership. Never feed unresolved records or 2028 records
into 2027 aggregation. The assignments match `RegularEvent` in `src/scoring/standings.ts`;
no scoring formulas, eligibility rules, or tiebreakers have been modified.

Official schedule editing, persistence, cancellations/corrections, tournament
imports, authentication, Supabase, admission policy, and 2028 scoring rules remain
future work. Configuring a 2028 calendar does not approve 2028 championship scoring.


## Phase 6: results import foundation

Visit `/results-review` for a responsive **fictional demonstration** of regular,
seasonal, and annual results review. It is not an operational administrator system.
Load an example, enter a correction reason, explicitly select the ambiguous player's
stable registry ID, and fill the missing draws with zero. Validation then permits
“Mark ready for approval”; “Explicitly approve demo results” is a separate action.
Rejecting an import locks it and excludes it from scoring. Reset or reload discards
all in-memory changes. No official players or results are supplied or published.

`src/results/index.ts` is pure TypeScript, independent of React and persistence.
It defines a stable-ID player registry, name/alias candidate matching, tournament
records, import drafts, structured validation issues, immutable original snapshots,
reasoned correction history, and explicit `draft` → `ready for approval` →
`approved` transitions. Editable imports can also become `rejected`; terminal
records cannot be edited. Corrections reset readiness and retain source values.
Duplicate IDs, player rows, event/source keys, same-date/name event candidates,
and championship period collisions are checked before approval. Shared registry
names are allowed and never merged automatically. IDs must be resolved explicitly.

`approvedStandingsInput` accepts only approved imports and revalidates the entire
approved batch before adapting it to `StandingsInput`. `importStandings` delegates
to the existing cumulative standings engine. Regular scoring, championship scoring,
best-eight selection, attendance, eligibility, and tiebreakers are unchanged. The
review page reuses `CumulativeLeaderboard` for an isolated approved-sample preview;
the existing Leaderboards, Events, and Seasons demonstrations remain independent.
Full precision is preserved until display. Championship records contain Swiss
results and complete official competition ranks; elimination records are excluded.

The import year and season are explicit competitive assignments, not derived from
calendar dates. Operational calendar reconciliation is still needed, particularly
for championship cutoffs and December rollovers. No database writes, Supabase,
authentication, external AI, image recognition, or file extraction are implemented.
A future trusted parser should construct import values and retain source evidence;
these TypeScript types are not an untrusted JSON parser or authorization boundary.

Remaining decisions include stable source-key and player-ID allocation, identity
merge governance, trusted import formats and complete-field verification, calendar
reconciliation, approval authorization and audit retention, atomic duplicate
reservation, approved-result replacement/revocation, and treatment of cancellations,
disqualifications, and unranked finishers. Duplicate event heuristics deliberately
block review until resolved; they do not establish official event identity.

Run `npm run typecheck`, `npm test`, and `npm run build`. Import tests cover valid
records, missing/invalid values, duplicate identities/events, source preservation,
corrections, transitions, approval gating, and compatibility with existing scoring.
