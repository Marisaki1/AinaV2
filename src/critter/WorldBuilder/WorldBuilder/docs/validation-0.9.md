# Validation record - 0.9.0

Date: 5 November 2026. Profile: Windows owner, browser application and loopback Waitress server. Browser fixtures, images, profile and recovery snapshots stayed under `.preview`; real world content was not used as a fixture.

## Delivered acceptance

**T-02 local acceptance:** daily, weekday-count weekly, monthly and yearly repeat rules support intervals, optional final start year and missing-day skip/last-day policies. Fixed-day durations survive month/year boundaries. Calendar day previews list events and festivals; timeline/Chronicle selections distinguish each occurrence and load its historical map state. Editing still opens the source event series. Generated occurrences create no copied resources or revisions.

Sources are filtered by timeline selection, tags, lanes and audience before expansion. Published rules and saved repeat windows remain independent of draft edits. Private series and calendars stay filtered in reader JSON, calendar lists and map requests. Map occurrence membership is validated directly, including dates beyond list limits.

Repeats use an available custom calendar and exact day dates without circa estimates. Preview windows span at most 200 years, with 2000 generated dates and 20000 candidate checks across series. Truncation is explicit. One-time recorded events remain in the list independently of this repeat window. A week is the number of weekday names in actual days, including when weekday names reset. Individual exceptions, nth-weekday or moon-triggered repeat rules are not delivered.

## Tests and evidence

- **233 backend tests passed**, including the previous 204 and **29 new recurrence tests**. Coverage includes leap skip/clamp, original-anchor retention, negative dates/epoch, daily/weekly/month/year intervals, far-future arithmetic, final years, fixed-duration overlap, malformed rules/windows, precision/era restrictions, source immutability, direct occurrence validation beyond list limits, candidate/global output budgets, source/publication privacy, tags/manual selection/private lanes, saved reader windows, ownership/authentication, compact payloads, stale edits, changed/trashed calendars, era warnings, dated maps, archive remapping and revision restoration. Extreme duration failures retain the original record once with a review warning. Output `.preview/backend-tests-0.9.txt`.
- TypeScript, targeted Python error/unused-code checks, Prettier and production Vite build passed. Migration check found no changes; no dependency or schema migration was required.
- `scripts/qa/recurrence-ui.js`: four workflow groups passed. Browser controls disable/enable repeats, protect exact precision, save final years and preview clamped dates; five owner instances retain one source. Separate timeline/Chronicle selections show distinct date labels and switch between base/later maps. Window changes update the instances without creating entries. Published reader views keep three skip-rule dates, exclude a private series and load the reader occurrence map. Calendar day lists show draft clamp dates to the owner and the published skip behavior to the reader. Evidence `.preview/recurrence-ui-0.9.json`; screenshot `.preview/recurrence-ui-0.9.png` inspected.
- `scripts/qa/recurrence-layout.js`: repeat editor, History controls and calendar editor passed at **390, 1024 and 1440 pixels** without page-width overflow; `.preview/recurrence-mobile-0.9.json`, `.preview/recurrence-tablet-0.9.json`, `.preview/recurrence-desktop-0.9.json`. Mobile screenshot inspected.
- The existing **31-route smoke suite** passed without browser errors or failed requests; `.preview/smoke-0.9.json`. Previous era, graph, map, authoring and calendar regression tests remain passing.
- Complete backup/download/checksums, SQLite integrity, restored counts/image hashes, destination protection and portable world roundtrip checks passed. Final QA snapshot retained **146 entries, 245 revisions and two images** in one isolated world; `.preview/recovery-0.9.json`.

Implementation review separated source UUIDs from occurrence selection keys, removed repeated rich bodies/arbitrary metadata from list payloads, added direct date membership checks independent of truncated lists, and kept invalidated first records with warnings. Generated date errors do not leave a partly expanded duplicate source. These boundaries have regression coverage.

## Scope reconciliation

All **139 unique inventory rows** and prior evidence links remain accounted for: **26 verified local acceptance rows, 69 partial, 44 planned**. T-02 advances to local acceptance for celestial cycles plus regular recurrence. T-06 and T-10 retain partial status with their new window/occurrence behavior described. Individual recurrence exceptions, intercalary/non-month days, alternate year-zero policy, relative era-year numbering and other advanced calendar boundaries remain.

Online self-hosting, separate player accounts, selective lore/relationship grants, protected media and revocation remain the confirmed later P5 work. Local reader previews remain owner-authenticated.

## Installation and preservation

Created and checksum-verified backup **2026-11-05_16-39-13_f5b05f.wbbackup.zip** immediately before upgrading. No migration was needed. Previous browser bundle retained at `.preview/dist-previous-20261105-163915`.

The restarted application reports **0.9.0** at `http://127.0.0.1:8767/`, with `test_workspace: false`. All **21 database table counts/content hashes and all media hashes match the immediate pre-upgrade baseline**, and SQLite integrity passes. The installation retained **two real worlds, three entries and no images**. Evidence `.preview/main-0.9-before.json`, `.preview/upgrade-0.9-result.json`. The login page renders without browser errors or failed assets; `.preview/main-0.9-browser.json` and `.preview/main-0.9-login.png`.

These checks establish the listed tested behavior, not zero defects, complete platform parity or public-hosting readiness.
