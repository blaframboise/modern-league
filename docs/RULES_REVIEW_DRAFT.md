# Modern League — 2027 Rules policy decisions

**Status:** Adopted operational policies. The authoritative public wording appears in `src/pages/RulesPage.tsx` at `/#/rules`. The scoring implementation is in `src/scoring/`. This file documents administrative decisions and implementation implications, not a separate conflicting rules draft.

## Tournament authority and inclusion

- Eternal Games determines event admission, capacity, registration, player participation, disqualifications, byes, match outcomes, event rankings and official results.
- No additional Modern League registration or admission requirement is imposed for participation. Eligibility for **cumulative league titles** is separate: six regular-event appearances in the season, or twenty across the year for the annual cumulative title.
- Only designated Eternal Games Modern League events count; results from unrelated stores are outside this league's scoring.
- The organizer's editable 2027 working calendar is published on the Events page. Any calendar dates marked TBD remain unresolved.

## Rounds and scoring

- Official event records supplied by the store determine the number of rounds in the tournament. Store-canceled rounds are already reflected in that official count; the league does not independently subtract canceled rounds.
- For a player who drops, rounds not played earn zero except for any win or draw officially recorded by the store. Store-recorded disqualifications are taken as supplied, without independent penalties invented by the league.
- Regular points = `10 * (3W + D) / (3R)`. Best eight regular events count toward seasonal points; all attended events count toward participation and weighted-match tiebreaks.
- Seasonal championships award up to 40 points and the League Championship up to 120, with Swiss 75% / final placement 25%; separate tournament-winner and cumulative titles are preserved.

## Results and corrections

- Players report disputes to Eternal Games, and notify the Modern League administrator **within seven calendar days after the tournament**.
- Only store-verified corrections alter league records.
- A store-verified error discovered after a week may still be corrected by the administrator, including recalculating affected standings. The week is a reporting expectation, not a ban on fixing known factual errors.
- The official results publication pipeline and audit history still need implementation; existing screenshot and sandbox workflows do not publish results.

## Privacy and records

- Maintain only data necessary to identify players, associate official results and calculate standings. A private canonical name or alias can be retained for identity matching.
- Public leaderboard display can use a requested nickname without altering the underlying identity or points.
- Data is not sold or shared for advertising.
- Historical tournament results and league standings may be retained to maintain correct records. Remove unnecessary personal information and source screenshots once no longer required for verification, corrections or recordkeeping.
- Players can request display-name changes, personal-data corrections and removal of unnecessary personal information; verified tournament history may be preserved where required for accuracy.
- The actual retention/deletion workflow must be designed and tested before activating public player records.

## Season and annual recognition

- Four seasonal cumulative **Overall Season Champions** will eventually receive numbered crown badges on the public leaderboard, assigned only after the relevant championship and published results are final.
- The **Annual Overall Champion** will receive a glowing reigning-champion crown during the following league year. Historical titles remain recorded.
- Tournament champions and cumulative points champions are distinct titles. Crown assignment is deferred until official results and title-recipient computations are published.
- A tied eligible cumulative title remains shared under the current tiebreak rules, and any badge assignment should support more than one qualifying recipient.

## Remaining implementation work

Admin nickname requests and privacy processes; official event-to-results linking; auditing and publishing verified result corrections; leaderboard title-recipient badge rendering; screenshot/data retention procedures; and final operational validation. These are implementation tasks, not reasons to keep the already-adopted policies labeled unresolved.
