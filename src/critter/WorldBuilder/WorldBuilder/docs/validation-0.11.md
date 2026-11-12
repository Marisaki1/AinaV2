# Validation record - 0.11.0

Date: 5 November 2026. Windows owner profile, browser application and loopback Waitress server. Browser fixtures, disposable database, images and recovery checks stayed under `.preview`.

## Special calendar periods

Calendars support up to 24 named periods outside months, before the first month, between months or after the last. Each has a stable ID, 1–20 days, optional weekday participation, periodic interval/offset and divisible skip/restore rules. Adding or moving a period does not renumber regular months. Days outside weekdays advance elapsed time and celestial phases while pausing the weekday cycle.

Event/era start and end dates, calendar previews, yearly festivals, timelines, Chronicle occurrences and historical map versions share the date engine. Year precision includes special periods at year boundaries. Daily/weekly repeats use elapsed days; yearly special dates skip inactive years. Monthly rules require ordinary months. Removing or changing a definition retains recorded dates and reports unavailable-date warnings. Reader projections use published definitions and redact unavailable private identities. Standalone calendar files, revisions and portable worlds retain period IDs.

## Checks

- **278 backend tests passed**, including 249 prior tests and 29 new special-period cases. New cases cover signed years through ±1 billion, inverse conversion, boundary periods, weekday reset modes, moon progression, rule exceptions/restorations, validation bounds, stable ordering, date precision/era containment, recurring dates and durations, occurrence identities/membership, map chronology, reader privacy, removed definitions, publication, standalone interchange, archive remapping and revision restoration. Evidence: `backend/studio/test_special_days.py`, `.preview/backend-tests-0.11.txt`.
- Actual browser creation/editing passed: add and save a periodic block, preview it in an active year, convert ordinal zero to a year-opening period, rename an existing block, retain stable event references, enforce exact special dates, disable monthly repeats and skip inactive yearly occurrences. Reader snapshots retain prior names/dates. Evidence: `scripts/qa/special-days-ui.js`, `.preview/special-ui-0.11.json`.
- Browser map capture retains the chosen special-period ID/date. Chronicle stops select the correct before/current/later scene; reader occurrence maps retain published dates and exclude an unpublished capture. The version dropdown orders special periods in their calendar position. Evidence: `.preview/special-maps-0.11.json`, `.preview/special-reader-0.11.json`.
- Calendar, event and map editor layouts fit **390, 1024 and 1440 pixels**. New placement/date dropdowns open searchable popups within viewport bounds and focus their text field. Screenshots inspected. Evidence: `.preview/special-mobile-0.11.json`, `.preview/special-tablet-0.11.json`, `.preview/special-desktop-0.11.json` and corresponding PNGs.
- Existing **31-route smoke suite** and prior recurring-event/festival browser workflow passed, with no JavaScript exceptions or failed requests. Evidence: `.preview/smoke-0.11.json`, `.preview/recurrence-regression-0.11.json`.
- TypeScript, the searchable-dropdown AST guard (**56 locations**), Prettier, targeted Python checks, Django system checks and production Vite build passed. Migration generation found no changes. No dependencies were added.
- Complete backup/download/checksum, restored counts and image hashes, SQLite integrity, existing-destination protection and portable-world roundtrip checks passed. QA recovery retained **173 entries, 287 entry revisions, two images, 30 connections and 40 connection revisions** in one disposable world. Evidence: `.preview/recovery-0.11.json`.

Browser testing corrected an assertion that inspected map captions in timeline mode; maps are tested in Chronicles. Review also corrected map-version selector ordering. Existing leap rules with omitted intervals retain their default four-year behavior.

## Scope

All **139 original unique rows** remain accounted for: **27 verified local acceptance rows, 68 partial, 44 planned**. This increment extends existing rows; T-01 remains partial because explicit year-numbering policies remain. Inventory summary counts were recalculated from the actual rows. USER-01 remains separately verified, including all new dropdowns.

Explicit year-zero policies, relative era-year numbering, individual occurrence exceptions, nth-weekday and moon-triggered rules remain. Online self-hosting with separate player accounts and selective lore/relationship grants stays in later P5. These checks establish the listed behavior, not zero defects or full platform parity.

## Local installation

Created and checksum-verified real backup **2026-11-05_18-12-13_534470.wbbackup.zip** before replacing the bundle. Previous bundle retained at `.preview/dist-previous-20261105-181226`. The installed server reports **0.11.0**, `test_workspace: false`, at `http://127.0.0.1:8767/`. All **22 table counts and complete content hashes**, media hashes and SQLite integrity match the pre-upgrade baseline. Real data remains **two worlds, three entries, zero connections and no images**. Evidence: `.preview/main-0.11-before.json`, `.preview/upgrade-0.11-result.json`.

The installed login page also loads without JavaScript errors or failed requests/assets. Evidence: `.preview/main-0.11-browser.json`, `.preview/main-0.11-login.png`. The isolated QA server and Edge profile were closed after validation; the main local server remains running.
