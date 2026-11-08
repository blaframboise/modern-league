# 2027 Eternal Games Modern — tentative planning calendar

**Source-backed weekly recurrence:** Eternal Games lists Monday Modern at 6:00 p.m. and Friday Modern at 6:00 p.m. at https://eternalgamesllc.com/events. The retrieved public page exposes a weekly schedule, not an independently retrievable calendar feed or individual 2027 confirmations.

**Release source:** Hasbro Q3 2026 investor presentation, page 15: https://investor.hasbro.com/static-files/a7941780-84de-4269-82dc-1c58d78a5d87 (cross-check: Wizards' 2027 announcements and current set page).

**Assumptions — must not be treated as facts about store operation:**
- Tentative first event: **Friday, January 1, 2027**, even though New Year's Day hours have not been confirmed.
- Every Monday and Friday has a tentative Modern slot at **6:00 p.m. America/Detroit**, except conflict holds and championship replacement nights.
- Hold the **Friday seven days before** each of the six announced release Fridays as a likely prerelease replacing regular Modern. These are *planning exclusions*, not verified Eternal Games-specific prerelease listings.
- Championship dates are proposed, not confirmed, and do not represent store bookings.
- This plan does **not** assign events to Supabase official scheduling tables and cannot publish events.

## Six likely prerelease conflicts

| Release | Known announced release | Hold Friday |
|---|---|---|
| Nauctis: The Sunken Realm | Feb 5 | **Jan 29** |
| Marvel: Darkhold Destiny | Apr 9 | **Apr 2** |
| Kamigawa: Titanbreach | Jun 4 | **May 28** |
| Universes Beyond (unannounced title) | Aug 6 | **Jul 30** |
| Zhalfir | Oct 1 | **Sep 24** |
| Universes Beyond (unannounced title) | Nov 19 | **Nov 12** |

All dates 2027. Actual prerelease days may include Saturday/Sunday, and store behavior requires separate confirmation.

## Championship Friday proposals

| Event | Date | Constraint |
|---|---|---|
| Season 1 | **Mar 26** | Last Friday of March |
| Season 2 | **Jun 25** | Last Friday of June |
| Season 3 | **Sep 17** | Sep 24 conflicts with Zhalfir likely prerelease |
| Season 4 | **Dec 17** | Earlier than holiday Fridays |
| Annual | **Dec 31** | **HIGH RISK** — New Year's Eve; move earlier if store closed or attendance poor |

The last two dates should be negotiated together. Alternative: Season 4 on Dec 10, annual Dec 17. That avoids Christmas Eve and New Year's Eve, but no longer uses the final Friday of the year.

The competition engine uses actual championship start instants as *exclusive* prior-season cutoffs: if a Friday hosts a season championship, ordinary Monday/Friday events afterward are assigned to the next season (and those after Season 4 or annual cutoff to next year), subject to the confirmed calendar. **A visually convenient quarter-end date is not itself a scoring cutoff.**

## Size of the provisional calendar

- 52 Mondays + 53 Fridays = **105** weekly slots in 2027.
- Six provisional prerelease conflict holds.
- Four proposed seasonal championships plus one annual championship take five Friday slots.
- **94 remaining proposed regular Modern nights**, before changes for holidays, closures or other store events.
- These counts come from deterministic slot generation, not actual published 2027 event confirmations.

Preview: `https://blaframboise.github.io/modern-league/#/calendar-preview`.

## Next technical gate

Reconcile real store events against the provisional slots using a **store-provided public calendar feed** (e.g. an iCal/ICS link or accessible Google Calendar ID) or individually verified event listings, before marking any proposed event as confirmed. Never silently promote inferred recurrences or set release Fridays into official published events.
