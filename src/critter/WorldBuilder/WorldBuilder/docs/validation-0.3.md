# Validation record — 0.3.0

Date: 5 November 2026. Deployment: Windows, one local owner, Waitress bound to `127.0.0.1`. Browser: isolated headless Edge, staged production Vite bundle. All browser mutations used `.preview/qa-data` on port 8768; the real world was not used as a test fixture.

## Delivered and checked

- Maps: marker group creation, assignment and visible/private controls; image overlays, opacity and visibility; hotspot placement and numeric coordinates/radius; line/polygon/circle drawing; saved default center and zoom; fit/restore; geometry and settings after reopening. Layer order controls and normalized asset references are implemented. Browser and archive tests preserve geometry/style.
- Privacy: published snapshots exclude private groups, their pins, private layers and private linked target IDs. Deleting a private group keeps its markers private. Actual reader preview omits private timeline lane names and events, and draws reader hotspots with zero fill/stroke opacity. Local reader previews remain owner-authenticated.
- History: named timelines, manual selection/tag/query filters, configured lanes and default map, aligned same-date events in different lanes, duration bars, zoom/pan, event list, Chronicle next/play/pause/speed/scrub controls, and atomic creation into a selected timeline. A shared event edit updates both timeline placements.
- Dates: negative years, year zero, large years, leap days and inverse calendar conversion. Unrelated calendars are not plotted on an assumed common axis. Dates invalidated by changed calendar rules remain recorded with warnings. A private calendar stays hidden; its shared events remain selectable in the reader's fallback list.
- Interface: map editor, timeline editor, Chronicle controls and saved reader embeds at 1440, 1024 and 390 pixels. No page-width overflow in those checks. Timeline overflow is contained within its scrolling chart. Screenshots were inspected; card/lane spacing and narrow-screen tick density were corrected.

The verified local inventory now has 16 acceptance rows, including M-03 geometry, M-08 saved map views, and T-05 parallel shared-event placements. The remaining rows retain partial/planned boundaries in the inventory.

## Automated evidence

- `backend/manage.py test studio --noinput`: **89 tests passed**, including 21 map/history tests. Expected 400/401/403/404/409/503 responses in negative cases are asserted.
- `npm run check`: TypeScript passed.
- Targeted Python checks: `ruff check --isolated --select E9,F63,F7,F82,F401,F841 backend` passed. This is an error/unused-code check, not a claim that every optional style rule passes.
- Production Vite build completed with local runtime assets.
- `scripts/qa/smoke.js`: 31 existing routes rendered without runtime errors or failed requests.
- `scripts/qa/maps-history-fixtures.js` and `maps-history-ui.js`: eight interaction groups passed on isolated data.
- `scripts/qa/maps-history-reopen.js`: saved zoom, geometry and timeline persistence passed.
- `scripts/qa/maps-history-layout.js`: layout and real reader-preview checks passed at the three widths above.
- `scripts/qa/history-private-calendar.js`: two shared events remain selectable without exposing private calendar names.
- `scripts/verify_recovery.py`: complete backup verification/download, SQLite integrity, restoration counts, all image hashes, existing-destination protection and portable world roundtrips across module kinds passed. Map/history archive tests also verify remapped timeline/event/map/calendar IDs.

QA fixture scripts deliberately create test resources and are guarded against execution outside the isolated workspace. The older general fixture script encountered an already-existing relationship when reused; the release smoke/interactions use the existing fixture IDs and completed without unexpected HTTP failures.

## Installation and data protection

Before replacing the installed browser bundle, a complete real-data backup was created and checksum-verified: `2026-11-05_11-37-36_1c6e5b.wbbackup.zip`. A separate baseline recorded every application/database table's row count and content hash, plus media hashes, in `.preview/main-0.3-before.json`. It contained one world and one entry, with no images. There is no schema migration in 0.3.

Installation verification is recorded in `.preview/upgrade-0.3-result.json`. All database table counts/content hashes and media hashes matched the baseline after upgrade; SQLite integrity passed. The restarted application reports 0.3.0 at `http://127.0.0.1:8767/`, and its login page rendered without browser errors or failed assets. The previous browser bundle is retained at `.preview/dist-previous-20261105-114022` for rollback. The final isolated recovery test preserved one world, 60 entries, 109 revisions and one image.

## Remaining boundaries

Historical map versions and changing territorial overlays, reverse map-to-event selection, uncertain dates, explicit cross-calendar epochs, advanced era/calendar configuration, custom map icon libraries and full relationship/bloodline tools remain unfinished. Keyboard numeric geometry controls are present; formal screen-reader certification and broad load testing remain future work.

Online self-hosting, separate player accounts and individual/group sharing of characters, relationships and other lore are confirmed later P5 work. No network publication was enabled in this release. See [project-tracker.md](project-tracker.md). These checks do not establish zero defects or full World Anvil parity.
