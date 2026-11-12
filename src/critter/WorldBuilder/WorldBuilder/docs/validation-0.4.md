# Validation record — 0.4.0

Date: 5 November 2026. Current deployment remains one owner on Windows, browser UI and Waitress on loopback. All browser fixture mutations used `.preview/qa-data` on port 8768.

## Checked behavior

T-09 historical maps: capture independent dated map states, edit a later state's image, polygon vertices and overlay opacity, and scrub events before/at/after the effective dates. Browser assertions checked actual image URLs and layer counts, restored the base when scrubbing backward, reopened the saved versions and deleted a version without altering earlier scenes. Versions preserve normalized marker positions with different image dimensions.

T-08 Chronicle synchronization: event selection focuses a dated map location; clicking the harbor marker selects its matching flood event and map state. Previous/next, playback/scrubbing and existing timeline routes remain available. Multiple matching events retain the current event if eligible, otherwise select the first matching event in the current filtered sequence.

Privacy: actual saved reader timeline embeds and direct map-state requests skip a private era, retain the latest shared version, and exclude its private names/geometry. Direct reader map JSON and search omit private version content. Nested private marker groups/layers and private target IDs are filtered. Draft changes do not alter reader snapshots. A marker existing only in a shared historical scene can remain the event's reader focus target.

Dates/recovery: exact effective boundaries, negative years, year zero, extreme years, month/day and leap days, calendar mismatch/unavailability and changed calendar rules were tested. Existing historical dates remain editable through unrelated changes; new dates require valid available calendars. Deleted versions restore from entry revisions. Portable archives remap map, event, calendar and scene asset references.

## Evidence

- Full backend suite: **104 tests passed**, including **15 historical-map tests** in `test_map_versions.py` and the preceding 89 tests. Negative authentication/ownership/validation/conflict responses are expected assertions.
- TypeScript check and targeted Python error/unused-code checks passed. Prettier formatting and production Vite build passed.
- `scripts/qa/map-versions-fixtures.js` creates an invented calendar, differently sized map images, border geometry, four events and a timeline in QA only.
- `scripts/qa/map-versions-ui.js` passed five workflow groups: capture/date validation/editing; scene independence/privacy; date and reverse navigation; reader preview/direct API; deletion/reopening.
- `scripts/qa/map-versions-layout.js` checks the version editor, capture dialog and dated Chronicle at 390 and 1024 pixels. Desktop workflow verified at 1440 pixels. No page-width overflow; screenshots inspected.
- `scripts/qa/map-versions-locations.js` created a location only in a later scene, selected/saved it through the event editor, and displayed it on that event's dated Chronicle map.
- The existing 31-route smoke suite passed without unexpected HTTP failures or browser errors. Complete backup verification/download, database integrity, restored counts and image hashes, existing-destination protection and portable world roundtrip checks passed. The final recovery report is retained at `.preview/recovery-0.4.json`.

## Installation

Created and checksum-verified real-data backup `2026-11-05_12-00-12_748d9d.wbbackup.zip` before replacing the browser bundle. No schema migration was needed. The previous bundle remains at `.preview/dist-previous-20261105-120032`.

The restarted local application reports version 0.4.0 and its login screen renders without browser errors or failed assets. All database table counts/content hashes and all media hashes match the pre-upgrade baseline; SQLite integrity passes. Records: `.preview/main-0.4-before.json`, `.preview/upgrade-0.4-result.json`, and `.preview/main-0.4-login.png`. The real installation retained one world and one entry, with no images; synthetic maps stayed in QA.

## Scope limits

This release adds discrete dated snapshots, not interpolated borders, cross-calendar conversion or image-remapping previews. Versions use the map's existing JSON size limit (1.5 MB of module data) and a maximum of 100 versions; large maps may reach the size limit sooner. A private version is skipped for readers, leaving their last shared state visible. Calendar changes never rewrite saved scene dates automatically.

Player accounts, online self-hosting and selective lore/relationship sharing remain the confirmed later P5 phase. Full World Anvil parity, advanced calendar/era rules, bloodline queries and hierarchy visualization remain unfinished. These checks establish tested workflows, not a zero-defect guarantee.
