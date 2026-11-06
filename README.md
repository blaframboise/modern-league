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

For optional Supabase configuration, copy `.env.example` to `.env.local` beside
`package.json` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
`.env.local` is ignored by Git; the example contains placeholders only. Restart
Vite after local changes. For deployment, configure both variables in the **build
environment** and rebuild/redeploy; Vite embeds them in the browser bundle.
Use only the public publishable key. See [environment setup](docs/SUPABASE.md#deployment-environment).

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The build runs strict TypeScript checks and creates optimized static assets in `dist/`. Preview serves that production build locally; it is not a production hosting server. Production builds use hash routing so static hosting supports direct visits and refreshes without a server rewrite. See the GitHub Pages instructions below.

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

The import year and season are explicit competitive assignments checked against
`ReviewContext.calendar` using the existing pure calendar engine. Each tournament
now includes `start` (local date/time, optional named time zone and DST-fold offset);
the legacy `date` must match its local start date. Missing starts remain editable
but block approval. The default zone is America/Detroit; DST gaps and ambiguous
folds without a matching offset are rejected by `startInstant`.

Regular events must match `assignRegularEvents` by both competitive year and season,
including exact championship cutoffs, March rollover and December entry into the
following league year. Seasonal and annual imports must match the configured
championship ID, owner period and actual start instant. All four seasonal cutoffs
and the annual start for the reviewed competitive year must be scheduled before
approval, even when a partial calendar can locate an individual event. Unresolved
assignments, invalid calendars and mismatches produce `tournament.calendar` issues;
source snapshots and corrections remain available. The scoring adapter revalidates
against the supplied calendar, so changed or incomplete schedules block previously
approved records too. A 2028 calendar assignment does not configure 2028 scoring.

The fictional review context supplies a complete compatible 2027–2028 calendar;
regular, seasonal and annual review examples continue to support approval. No database writes, Supabase,
authentication, external AI, image recognition, or file extraction are implemented.
A future trusted parser should construct import values and retain source evidence;
these TypeScript types are not an untrusted JSON parser or authorization boundary.

Remaining decisions include stable source-key and player-ID allocation, identity
merge governance, trusted import formats and complete-field verification, official calendar
maintenance and schedule-change governance, approval authorization and audit retention, atomic duplicate
reservation, approved-result replacement/revocation, and treatment of cancellations,
disqualifications, and unranked finishers. Duplicate event heuristics deliberately
block review until resolved; they do not establish official event identity.

Run `npm run typecheck`, `npm test`, and `npm run build`. Import tests cover valid
records, missing/invalid values, duplicate identities/events, source preservation,
corrections, transitions, approval gating, calendar cutoffs/rollovers, championship
identity, DST behavior, schedule revalidation, and compatibility with existing scoring.

## Phase 7: mobile screenshot import demonstration

Open `/results-import` (the **Import images** navigation link). Use **Take a photo**
for the phone's rear-camera picker or **Choose photos or screenshots** for multiple
existing images, or **Load fictional source image** for a generated sample without
selecting a personal photo. Browser and device settings determine the actual picker; no native
app is needed. JPEG, PNG and WebP are supported; convert HEIC first. Select up to
eight images, at most 10 MiB each. Previews preserve orientation, and each image can
be removed or replaced. Changing the selection discards the current extraction and
review; originals remain accessible and open at full size throughout review.

**Real:** browser capture/selection, local previews, file MIME/size/count checks,
bounded runtime parsing, correction history, registry selection, calendar validation,
and the existing Phase 6 readiness/approval state machine. **Simulated:** extraction
is a fixed, explicitly fictional fixture; it does not read pixels, perform OCR, or
interpret the contents of your photograph. All suggested fixture values require
human confirmation or correction. Use **Simulate extraction failure** to exercise
the failure/retry flow without credentials. The registry and calendar are fictional,
and in-memory approvals do not publish or change public standings.

Enter a correction reason before editing or confirming. Each field shows its original
value, observed/suggested/missing status, source-image references and warnings. Blank
records are not zero-filled. Choose a stable registry ID for every player, including
exact name matches. Correct missing values, confirm suggestions, and reconcile the
explicit tournament start/year/season with the calendar. Swiss totals and official
competition placements are required for championships. Only then can you mark the
draft ready and separately approve it. Every correction resets readiness. Terminal
approved/rejected drafts cannot be edited. Original extraction and every correction
snapshot remain separately available. Draft, ready and rejected imports remain
excluded by the existing approval-gated standings adapter.

### Provider integration boundary

`src/extraction/index.ts` defines `ExtractionProvider.extract(images, signal)` and
version 1 `ExtractionReport`. A value carries `value`, `status`, `sources` (image IDs),
and `warnings`. Missing values use `null` with status `missing`; observed values need
at least one valid source reference. Text, array lengths, numeric types, row IDs,
event kind and references are runtime-validated by `parseExtraction` before the
Phase 6 adapter (`src/extraction/draft.ts`) creates a draft. Provider code never
calculates scoring or standings. `ImportValues.extraction` retains the original
report, the exact allowed field paths and value-bound confirmations (`{ path, value }`).
Unchanged observed source evidence is initially value-bound; suggested/missing values
need explicit human review. Registry identity selection is always separate.

`src/results/extractionEvidence.ts` manages this evidence through the shared Phase 6
correction boundary. Generic `correctImport(draft, nextValues, reason)` requires the
current audit unchanged as input and automatically invalidates confirmations for any
changed values. Reverting a value does not resurrect an earlier confirmation.
`correctExtraction(draft, nextValues, reason, path)` explicitly confirms the new value
in the same correction; equivalently, the shared API accepts the documented fourth
argument `{ confirmExtraction: [path] }`. Each such action is recorded in immutable
`Correction.extractionConfirmations` with its exact reviewed values and reason.
Do not write `extraction.confirmed` directly: audit injection/removal/replacement is
rejected. Empty/missing fields, duplicate paths, unknown/nonexistent paths and registry
ID paths cannot be confirmed. Extracted row identities and order stay fixed; changing
the source row set requires a separate evidence policy.

Readiness, approval and approved-only scoring independently re-parse the original
report and replay every correction/confirmation action, checking snapshots and current
values. A previously approved import with invalid evidence/history is rejected at the
scoring boundary. Optional placements, annual season and absent DST offset fields are
handled by event kind; missing required values still block validation. The UI explicitly describes valid field edits as correcting and confirming the new
value in one recorded action; clearing a field leaves it unresolved. It shows
current value confirmations, disables confirmation of missing values, and displays
reviewed values/actions in the preserved correction history. These in-memory consistency
checks are not authentication or cryptographic proof of a human review.

This repository remains a **static Vite app with no server endpoint**. There is no
live-provider configuration switch and no API key is needed for the demonstration.
Do not add provider SDKs or secrets to browser code or `VITE_*` variables. A future
provider must implement a same-origin server endpoint (for example
`POST /api/results-extraction` with multipart images and their IDs), with a browser
adapter implementing `ExtractionProvider`. The endpoint must return the version 1
report; the browser still calls `parseExtraction`. Configure credentials such as
`AI_VISION_API_KEY` and provider/model selection only in the chosen server runtime's
secret environment. Actual variable names, model and vendor await a server/provider
decision; none are read by this static app.

The server must authorize administrators, enforce image count/byte and request-size
limits, verify MIME **and file signatures**, safely decode images, impose pixel and
time limits, and runtime-validate provider responses. Its extraction instruction
must treat all image text as untrusted data, ignore instructions in images, never
invent missing facts, and return evidence/warnings. No extracted text is rendered as
HTML or executed. Do not log image data, extracted personal information or credentials.
Browser MIME checks are usability checks, not a server security boundary. Images
are local object URLs revoked on replacement/removal/unmount; neither images nor
results use localStorage, a database, or durable uploads. Navigating away/reloading
loses this session. No external provider receives images in this phase.

### Phase 8 dependencies and verification

A server/runtime and provider selection, administrator authorization, request abuse
controls, source-event keys, registry governance, complete-field evidence, official
calendar ownership, consent/retention and secure storage design, atomic duplicate
checks, audit retention and approved-result revocation remain unresolved. Do not
use this demonstration for official publication. Supabase, authentication and durable
publication are deliberately deferred.

Run the standard `npm run typecheck`, `npm test`, and `npm run build`. Extraction
tests additionally cover image limits, multi-image references, provider failures and
cancellation, malformed output, ambiguous names, missing fields, original values,
confirmation history, calendar mismatches and approval-only scoring. Browser checks
should exercise `/results-import` at 390×844, 844×390 and 1440×1000: camera input
attributes, multi-selection, preview/remove/replace, invalid/oversized rejection,
failure/retry, metadata/record corrections, identity matching, confirmations,
approval, no horizontal overflow, single/dual-column layout and reload clearing.
Real iOS/Android camera permission dialogs and hardware capture still require device
verification; desktop emulation cannot establish those behaviors.

The repeatable browser smoke test is included in `tests/browser/results-import.cjs`.
With Vite running in another terminal, install Playwright's browser once and run:

```sh
npx playwright-core install chromium
npm run test:browser
```

Alternatively set `BROWSER_EXECUTABLE_PATH` to an installed Chromium executable.
`BASE_URL` overrides `http://127.0.0.1:5173` (and can target `npm run preview`).
Optional `BROWSER_SCREENSHOT_DIR=work/browser-import` saves full-page screenshots.
These tests exercise three viewport sizes and the complete fictional review path.

## Phase 8A — Supabase foundation

Optional Supabase client, administrator password sign-in at `/admin`, private draft persistence API, RLS migrations and local PostgreSQL policy tests are now available. Existing demonstrations remain fictional and in-memory. Official approval, publication and uploads are disabled pending trusted server validation and governance decisions. See [Supabase setup and manual migration instructions](docs/SUPABASE.md).

## GitHub Pages deployment

The deployment target is https://blaframboise.github.io/modern-league/.

1. In the repository's **Settings → Pages → Build and deployment**, select
   **GitHub Actions** as the source.
2. In **Settings → Secrets and variables → Actions → Variables**, add repository
   variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using your
   project's URL and browser-safe publishable key. Never use a service-role key,
   database password, or AI provider secret: Vite variables are public build inputs.
3. Merge the deployment configuration into `main`. The **Deploy GitHub Pages**
   workflow installs dependencies, typechecks, tests, builds and deploys `dist/`.
   Subsequent pushes/merges to `main` deploy automatically; **Run workflow** also
   supports manual deployment. Allow the `github-pages` environment to deploy from
   `main` if repository environment protection rules require it.
4. Follow the workflow's deployment URL after it succeeds. Changing build variables
   requires another workflow run to rebuild the static site.

Vite uses `/modern-league/` for production assets and `/` for local development.
Production React Router navigation uses hashes: share internal links such as
`https://blaframboise.github.io/modern-league/#/events` or
`https://blaframboise.github.io/modern-league/#/results-import`. Opening or refreshing
these URLs requests the site's root document, avoiding GitHub Pages 404s. Plain
`/modern-league/events` URLs are not supported; no custom 404 redirect is needed.
Local `npm run dev` retains paths such as `/events`. To check production routing,
run `npm run build && npm run preview` and open the printed origin followed by
`/modern-league/#/events`.

The workflow passes both Supabase repository variables only to the production build.
The existing optional Supabase client consumes these public build inputs. Database
permissions, authentication requirements, and disabled official browser writes
remain unchanged; configuration does not apply migrations or enable official
publication or live extraction. Fictional demonstrations remain independent.

Deployment configuration checks run with `npm test`. After `npm run build`, run
`npm run test:deployment` to verify production direct visits, refreshes, assets,
navigation, back history and skip links against a static server with no SPA
fallback. This uses Playwright Chromium (install with
`npx playwright-core install chromium`, or set `BROWSER_EXECUTABLE_PATH` to an
installed Chromium executable). The test starts and stops its own static server.
