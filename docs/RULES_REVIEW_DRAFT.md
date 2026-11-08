# Modern League — 2027 Competition Rules (review draft)

**Status: DRAFT FOR LEAGUE OWNER APPROVAL. NOT PUBLISHED RULES.**

This draft distinguishes scoring rules already encoded and tested in the application from league policies that still need an explicit decision. It must not be displayed as the league's official Rules page until adopted.

## A. Competition structure — implemented in scoring/calendar model

- Four competitive seasons make up the league year, with a seasonal championship for each season and a separate annual championship.
- The nominal planning windows are January–March, April–June, July–September and October–December. **These are not automatic cutoffs.**
- A regular tournament is assigned to a season using its confirmed start and the actual start of the season's championship. A tournament at or after that championship start belongs to the next season.
- Following the Season 4 or annual championship cutoff, regular tournaments belong to the next league year's first season when its schedule is configured. This can happen in December.
- Official calendar dates and venues are not yet approved. The tentative league start is January 4, 2027, not a confirmed event announcement.

## B. Regular tournament points — implemented and tested

For a tournament with `R` scheduled Swiss rounds, `W` official wins and `D` official draws:

**League points = 10 × (3W + D) / (3R)**

- Maximum ten points per event.
- Losses and unplayed rounds earn zero; the scheduled number of rounds remains the denominator.
- Officially recorded byes and intentional draws count as recorded; no inferred adjustments.
- Points retain full precision for standings, with two decimal places displayed.
- Only the best eight regular-tournament scores in each season count toward that season's cumulative point total; maximum 80 regular points per season.
- **Every attended regular tournament** still counts for the attendance minimum and cumulative tiebreaker statistics, including events outside the best eight.

## C. Participation minima for cumulative titles — implemented and tested

- **Regular Season Champion**: highest-ranked *eligible* player in cumulative regular-season standings before the seasonal championship, requiring at least six regular events in that season.
- **Overall Season Champion**: highest-ranked *eligible* player in cumulative standings after the seasonal championship, using the same seasonal six-event minimum.
- **Annual Overall Champion**: highest-ranked *eligible* player in annual cumulative standings, requiring at least twenty regular events across the year.
- Players who have not met the minimum retain their earned points and leaderboard rank; they cannot be awarded these cumulative titles while ineligible.
- These attendance minimums **do not determine who may enter championship tournaments**.

## D. Championship tournament scoring — implemented and tested

- Maximum additional points: **40** per seasonal championship, **120** for the annual championship.
- For a championship with `R` scheduled Swiss rounds, `W` wins, `D` draws, `N` competitors and official final competition placement `P`:

  - Swiss match component = maximum × 75% × (3W + D) / (3R).
  - Placement component = maximum × 25% × (N − P) / (N − 1).
  - Total = match component + placement component.

- Final placement uses official competition ranks. For ties, the points from the occupied positions are averaged.
- All recorded official competitors must be supplied; fewer than two competitors do not produce championship scores.
- The scoring model uses Swiss matches for the match component, not elimination match results.
- The **Seasonal Tournament Champion** and **Annual Tournament Champion** are the winner(s) recorded in the official event standings; these are separate from the cumulative season/annual titles.
- Maximum possible season total is **120** points (80 regular + 40 seasonal championship); maximum annual total is **600** points (four seasons × 120 + annual championship 120).

## E. Cumulative standings tiebreakers — implemented and tested

For players on equal *unrounded* cumulative points, compare in order:

1. Total championship points.
2. Number of perfect regular-event finishes (winning every scheduled round with no draws).
3. Weighted regular match-point percentage over **all** attended regular events, including those beyond the best eight.
4. If still tied, share the cumulative rank and eligible title unless a separate playoff rule is adopted.

Eligibility does not remove or reorder players from rankings.

## F. Required decisions before approval — currently **unresolved**

| Policy | Approval needed |
|---|---|
| Championship entry | Admission criteria, registration limits, invitations, alternates and deadlines |
| Player membership | Official player identity enrollment, aliases, name disputes and guest eligibility |
| Event inclusion | Participating stores, qualifying formats and minimum event conditions |
| Attendance edge cases | Drops, disqualifications, canceled rounds and no-shows |
| Standings disputes | Error reporting deadlines, corrections after publication, appeals and administrator authority |
| Finality | When regular season and annual results become final; whether playoff tiebreaks can supersede shared cumulative titles |
| Championship procedures | Swiss/top-cut policy, unusual finishes and official standings handling |
| Awards | How non-scoring community awards are nominated and determined |
| Scheduling | Confirmed start date, event calendar, championship dates and time zones |
| Personal information | Player-name display consent, record retention and public leaderboard privacy |

## G. Publication controls — not yet implemented

- Current screenshot imports and test standings are private preseason simulations.
- An official registry/calendar/approval/publication pipeline must validate identities, event assignments, duplicate records, and current rules before making any standings public.
- Changes to published results require a separate audited correction/republication policy; the sandbox correction button is not a public publication mechanism.
- Until the required decisions above are approved and the official pipeline tested, public leaderboards and schedules must remain in their explicit pending states.

**Approval gate:** Adopt the unresolved policies, reconcile them with the code, review for internal consistency, and only then replace the website's Rules placeholder with an authorized version of this document.
