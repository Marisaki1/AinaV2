# Validation record - 0.10.0

Date: 5 November 2026. Profile: Windows owner, browser application and loopback Waitress server. QA data/profile/images and recovery fixtures stayed under `.preview`.

## Searchable dropdowns: USER-01

All **52 existing native select locations** and **two new connection-editor locations** now use SearchableSelect across 18 frontend files. Every enabled dropdown opens with a Type to filter field. Matching ignores case/accents; filtering and cancelling retain the saved choice. Existing search-based reference pickers remain searchable. Disabled controls retain their disabled behavior.

Real CDP keyboard checks pass for ArrowDown/Space opening, text insertion, case/accent matching, Enter/Home selection, empty results, Escape cancellation/focus restoration and Tab/Shift+Tab navigation within a modal. Evidence: `scripts/qa/dropdowns-keyboard.mjs`, `.preview/dropdowns-keyboard-0.10.json`.

Runtime coverage opened, filtered, cleared and cancelled **57 dropdown instances across 17 routes**, checking for unconverted native controls and unchanged selection values. This count includes shared controls on different routes; the separate source audit counts 54 code locations. Evidence: `scripts/qa/dropdowns-coverage.js`, `.preview/dropdowns-coverage-0.10.json`.

Open popup bounds/focus checks passed at **390, 1024 and 1440 pixels**, including all four dropdowns in the connection modal. Popups remain within their viewport and modal focus scope. Screenshots inspected. Evidence: `.preview/dropdowns-mobile-0.10.json`, `.preview/dropdowns-tablet-0.10.json`, `.preview/dropdowns-desktop-0.10.json` and corresponding screenshots.

`npm run check` and `npm run build` include an AST guard rejecting raw select elements outside the shared component, including nested JSX/TSX modules. USER-01 is recorded as an additional user requirement alongside the original 139-row inventory.

## Connection editing/history

Connections keep their UUID through endpoint/type/label/strength/note/visibility edits, recoverable removal and revision restoration. Writes require the current revision. History is immutable through the API and stays owner-only; reader graphs/details exclude removed/private links and notes/history metadata. Directional edits do not change the reverse edge. Restores revalidate active endpoints, uniqueness and ancestry.

- **249 backend tests passed**, including the previous 233 and **16 new connection-history tests**. Cases cover stable identities, immutable snapshots, stale/missing/boolean revisions, soft removal/Trash, monotonic restoration, reverse endpoint edits, final-graph ancestry checks, duplicate conflicts/rollback, foreign/self/trashed endpoints, malformed fields, immediate reader visibility, private history/notes, synthetic legacy baselines without read mutations, old delete compatibility, portable deleted/history remapping, malformed imports, old archives and asymmetric diplomacy edits. Output: `.preview/backend-tests-0.10.txt`.
- Browser edit/history workflows passed: labels, strength and notes update; earlier notes remain in history; restore retains the original link ID; reader graphs follow restored values without private notes; removal and recovery retain history. Evidence: `.preview/connections-ui-0.10.json` and screenshot.
- The separate stale-form test produced exactly its expected HTTP **409**, retained typed edits and successfully reloaded the current revision. Its sole network log/failed-response item is that deliberate conflict; no JavaScript exception occurred. Evidence: `.preview/connections-stale-0.10.json`.
- Actual SQLite write races passed: opposite ancestry creates gave 201/400, concurrent hierarchy edits 200/409, concurrent connection edits 200/409, and opposite parent-type edits 200/400. Failed writes left no partial history. Evidence: `.preview/concurrency-0.10.json`.

## Migration, regression and recovery

A disposable database was created at schema 0002, seeded with a non-empty original connection, then migrated to 0003. Original fields/IDs remained equal; baseline revision 1 was seeded and SQLite integrity passed. Evidence: `scripts/verify_connection_migration.py`, `.preview/migration-check-0.10.json`.

The existing **31-route smoke suite** passed without errors or failed requests. The earlier recurring-event/festival workflow also passed with the searchable controls, including source preservation, reader rules, calendar dates and occurrence maps. Evidence: `.preview/smoke-0.10.json`, `.preview/recurrence-regression-0.10.json`.

TypeScript, the dropdown source guard, Prettier, targeted Python checks and production Vite build passed. Migration generation check found no further changes.

Complete backup/checksums/download, restored counts/image hashes, SQLite integrity, existing-destination protection and portable-world checks passed. Recovery now checks Connection and ConnectionRevision tables and removed/history preservation as well. The final QA snapshot retained **160 entries, 262 entry revisions, two images, 30 connections and 40 connection revisions** in one isolated world. Evidence: `.preview/recovery-0.10.json`.

Testing corrected Escape propagation when a dropdown was closed, popup positioning near viewport edges, and browser assertions that ran before list refresh or inspected collapsed graph text. The preservation verifier initially assumed permission-column positions; it was corrected to use captured column names before final verification.

## Scope and installation

All **139 original unique rows** and evidence links remain accounted for: **27 verified local acceptance rows, 68 partial, 44 planned**. R-03 advances to verified local acceptance. USER-01 is verified separately; this does not change the original row total. Full platform parity remains unfinished. Online player accounts, memberships/grants, protected media and revocation remain later P5 work.

Before migration, created and checksum-verified real backup **2026-11-05_17-25-28_ba98da.wbbackup.zip**. The launcher also created its automatic pre-migration backup. Previous browser bundle retained at `.preview/dist-previous-20261105-172530`.

The installed application reports **0.10.0** at `http://127.0.0.1:8767/`, with `test_workspace: false`, and its login page loads without errors or failed assets. All original columns, counts and content hashes across the **21 original tables** were preserved; media hashes and SQLite integrity pass. Only the expected migration/content-type/permission metadata and new connection-history structure were added. Real data retains **two worlds, three entries, zero connections and no images**. The non-empty baseline migration case was verified separately in the disposable database.

Evidence: `.preview/main-0.10-before.json`, `.preview/upgrade-0.10-result.json`, `.preview/main-0.10-browser.json`, `.preview/main-0.10-login.png`.

These checks establish the listed tested behavior, not zero defects, full assistive-technology/browser coverage or public-hosting readiness. Portable connection history is bounded to 10000 revisions per connection; full database backups preserve the complete database. Connection visibility remains live and is distinct from future player/group permissions.
