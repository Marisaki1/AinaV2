# Validation record - 0.8.0

Date: 5 November 2026. Profile: Windows owner, browser application and loopback Waitress server. QA data and browser profiles stayed under `.preview`; campaign/source files and real lore were not used as fixtures.

## Delivered acceptance

**T-04 local acceptance:** independent era resources have start dates, optional ends, lore, ordinary revisions/publications/Trash and same-calendar event links. Overlapping eras are allowed. New or changed linked event dates must fit the era; later era/calendar changes retain recorded dates with warnings.

Dates support day, month or year precision and optional circa flags. Unknown components are ignored in arithmetic without deleting their stored values. A month/year interval uses its actual final day, including leap rules. Circa marks an estimate without inventing a numeric error margin. Signed dates sort by the earliest stated date. Era bands appear in owner/reader timelines, including ongoing eras and eras-only timelines.

Map history uses the earliest date of a coarse event with a warning; a circa day uses its recorded date without an assumed margin. Reader data removes private/unavailable era identities and uses published era names, calendar definitions and date precision. Existing free-text era labels remain supported.

## Tests and evidence

- **204 backend tests passed**, including the previous 175 and **29 new precision/era tests**. Coverage includes leap-month/year intervals, negative dates and sorting, mixed end precision, circa semantics, ongoing/overlapping eras, kind/world/calendar/containment validation, malformed precision/booleans/months, orphan end fields, HTTP 400 handling, stale edits/ownership, published snapshots, private calendars/era identities, historical warnings after edits/Trash, map selection, archive remapping and revision restoration. Output: `.preview/backend-tests-0.8.txt`.
- TypeScript, targeted Python error/unused-code checks, Prettier and production Vite build passed. Migration check reported no changes. The new Resource kind requires no schema migration or new dependency.
- `scripts/qa/eras-ui.js`: four workflow groups passed, covering owner era library, genuine private era creation, open-end/year controls, event month/year edits, saved reader precision, filtered era bands, uncertain styling, signed-date order and two map-selection outcomes. Evidence: `.preview/eras-ui-0.8.json`, screenshot `.preview/eras-ui-0.8.png`.
- `scripts/qa/eras-layout.js`: era editor, uncertain event editor and timeline passed at **390, 1024 and 1440 pixels**, without page-width overflow. Reports `.preview/eras-mobile-0.8.json`, `.preview/eras-tablet-0.8.json`, `.preview/eras-desktop-0.8.json`. Screenshots inspected; timelines retain their contained horizontal scrolling.
- Existing **31-route smoke tests** passed on the installed browser bundle against isolated QA data, without browser errors or failed requests; `.preview/smoke-0.8.json`.
- `scripts/qa/eras-regressions.js` confirms that legacy free-text era labels remain in reader previews, private linked era labels remain hidden, and era-only timelines render without events; `.preview/eras-regressions-0.8.json`.
- Complete backup creation/download/checksums, SQLite integrity, restored counts/image hashes, existing-destination protection and portable-world roundtrip checks passed, including the new era Resource kind and precision data; `.preview/recovery-0.8.json`. The final isolated snapshot retained 141 entries, 238 revisions and two images in one QA world.

Testing corrected an invalid-month IndexError into a clean validation failure, removed misleading precision controls, retained legacy era labels, distinguished circa-day versus coarse-date map warnings and corrected era-band date separators. Earlier 0.1-0.7 regression tests remain passing. A final smoke rerun was interrupted by stopping its QA server before the browser process finished; it was restarted against the installed bundle and rerun to completion.

## Scope reconciliation and boundaries

The canonical inventory still contains all **139 unique rows**, with prior evidence links intact: **25 verified local acceptance rows, 70 partial, 44 planned**. T-04 advances to verified local acceptance. T-06/T-07/T-10 remain partial with the new behavior described. Existing audit and previous release records remain historical evidence.

Recurring festivals/events, intercalary/non-month days, relative era-year numbering, quantified confidence margins, arbitrary date-range controls and expanded event/era styling remain unfinished. Eras use absolute dates on their selected calendar. Online self-hosting, separate player accounts, selective lore/relationship grants and revocation remain the later P5 requirement; local reader previews do not provide player access.

## Installation and preservation

Created and checksum-verified backup **2026-11-05_15-55-18_e9c05b.wbbackup.zip** immediately before upgrading. Previous browser bundle retained at `.preview/dist-previous-20261105-155613`. The immediate baseline includes the user's latest **two worlds, three entries and no images**.

The restarted application reports **0.8.0** at `http://127.0.0.1:8767/`, with `test_workspace: false`. All **21 database table counts/content hashes and all media hashes matched the pre-upgrade baseline**, and SQLite integrity passed. Records: `.preview/main-0.8-before.json`, `.preview/upgrade-0.8-result.json`. The browser login page renders without errors or failed assets; `.preview/main-0.8-browser.json` and `.preview/main-0.8-login.png`.

These checks establish the listed behavior, not zero defects, full platform parity or readiness for public hosting.
