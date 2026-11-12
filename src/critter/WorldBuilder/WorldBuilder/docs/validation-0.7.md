# Validation record - 0.7.0

Date: 5 November 2026. Profile: one Windows owner, browser application, loopback Waitress server. QA data, browser profile and downloaded artifacts stayed in `.preview`; real world content was not used as a fixture.

## Delivered acceptance

Calendars now support up to 12 offset leap rules with exceptions/restorations, continuous/month-reset/year-reset weekdays, weekday offsets, inverse date conversion and up to eight named celestial cycles. Selecting a preview day shows its weekday, ordinal and all moon phases. The old leap interval and moon-cycle data remain supported without migration. The date engine is shared by event, history and dated map projections.

**T-03 local acceptance:** versioned standalone JSON exports/imports preserve mathematical calendar settings. Import creates a separate private entry. Published reader calendar previews/exports retain their snapshot; exports exclude arbitrary metadata, including nested month metadata. Online live sharing remains later P5.

**M-05 partial delivery:** twelve fixed symbols, local raster icons and sizes of 16-64 pixels work in base/dated scenes, publications and portable archives. Raw marker HTML remains unsupported and rejected.

## Tests and evidence

- **175 backend tests passed**, including the previous 148 and **27 new calendar/icon tests**. Coverage includes signed years/epoch/extreme inverse dates, brute-force comparison of offset overlapping rules, century exceptions/restoration, legacy arithmetic, weekday modes, multiple moon phases, maximum months, malformed/duplicate/boolean inputs, import ownership/atomicity/private defaults, export allowlisting/snapshots/authentication/Trash, stale edits, cross-world icon references, HTML rejection, private icons, archive remapping and shared event/history/map leap dates. Changed calendars leave recorded invalid dates listed with warnings.
- TypeScript, targeted Python error/unused-code checks, Prettier and production Vite build passed. Migration check reported no schema changes. Final backend output is in `.preview/backend-tests-0.7.txt`.
- `scripts/qa/calendars-icons-ui.js`: six browser workflow groups passed, covering leap exceptions/restoration, resets/offsets/moons, negative ordinal conversion, add/remove/save controls, actual downloads/file imports, published reader calendars, symbol/raster/size edits and private/draft icon filtering. Report `.preview/calendar-ui-0.7.json`; desktop/mobile/map screenshots were inspected.
- `scripts/qa/calendars-boundaries.js`: removing a month remaps leap rules; a **1120-day month**, **40 weekdays** and **eight moons** render in a contained scrolling grid. Report `.preview/calendar-boundaries-0.7.json`.
- `scripts/qa/calendars-icons-layout.js`: standard calendars, maximum-size calendar and map editor passed at **390, 1024 and 1440 pixels**, without page-width overflow. Reports `.preview/calendar-mobile-0.7.json`, `.preview/calendar-tablet-0.7.json`, `.preview/calendar-desktop-0.7.json`.
- Actual owner/reader downloads were parsed from `.preview/calendar-downloads-final`. Separate filenames retain both versions; the owner file has the draft month-reset mode and reader file retains the published continuous mode. Both retain the two celestial cycles. Evidence `.preview/calendar-downloads-0.7.json` and `.preview/calendar-download-ui-0.7.json`. File upload was exercised through the browser input with a JSON File object; backend tests also cover exported-definition roundtrips.
- The existing **31-route** smoke suite passed without browser errors or failed requests; `.preview/smoke-0.7.json`. Earlier specialized graph/offline workflows remain supported by their regression tests and prior evidence, and were not all repeated as new visual acceptance claims.
- Complete backup creation/checksums/download matching, SQLite integrity, restore counts/image hashes, existing-destination protection and portable-world roundtrip checks passed. Final isolated snapshot retained **122 entries, 212 revisions and two images** in one QA world; `.preview/recovery-0.7.json`.

Testing corrected custom icons being overwritten by the legacy dot, undefined styling variables and a help-dialog version label. Export review removed nested arbitrary month metadata; new regression tests protect that boundary. Owner/reader download filenames now differ to preserve both copies. Browser harness assertions were corrected to count rule forms accurately, select a marker by its label and wait for autosave completion; successful reports follow those corrections.

## Continuation audit

All 139 unique inventory rows and their evidence links were reconciled. Current local coverage is **24 verified, 71 partial, 44 planned**. [audit-0.7.md](audit-0.7.md) records prior coverage, omissions addressed and remaining boundaries. Eras/uncertain dates, recurring events, intercalary/non-month days, alternate year-zero policy and raw custom map HTML remain unfinished. Online self-hosting, separate player accounts and selective lore/relationship grants remain explicitly retained for later P5.

## Installation and preservation

Created and checksum-verified real-data backup **2026-11-05_14-09-19_f4d455.wbbackup.zip** before replacing the browser bundle. No database migration was required. Previous bundle retained at `.preview/dist-previous-20261105-140954`.

The restarted application reports **0.7.0** at `http://127.0.0.1:8767/`, with `test_workspace: false`; its login page renders without browser errors or failed assets. **All 21 database table counts/content hashes and all media hashes match the pre-upgrade baseline**, and SQLite integrity passes. Real data retains one world, one entry and no images. QA stayed separate. Evidence: `.preview/main-0.7-before.json`, `.preview/upgrade-0.7-result.json`, `.preview/main-0.7-browser.json`, `.preview/main-0.7-login.png`.

These checks establish the listed tested behavior, not zero defects, complete platform parity or readiness for public hosting.
