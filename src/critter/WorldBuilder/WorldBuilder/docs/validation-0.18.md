# Validation record - 0.18.0

6 November 2026. This release groups campaign preparation, play and review into one connected batch. The owner's Windows browser installation remains local; QA fixtures and recovery data stay in .preview/qa-data.

## Delivered workflow

Open a campaign and choose Open GM desk, Quest & story board or Campaign notebook. Session guides can open the desk with that original session selected. View navigation retains the session context in its stable route; saving a layout can retain its preferred session.

### GM desk and references

Save named layouts with one, two or three columns; choose visible panels, reorder them and collapse/expand them. The six current panel types are pinned references, active session, quick capture, recent notes, open threads and campaign maps. Copy, rename, switch and remove saved layouts. Small screens reduce the column count for readability; a selected single-column layout remains single-column.

Pin original notes, characters, locations, quests/tasks, sessions or maps. Reorder pins, change standard/wide card presentation and unpin them. Cards show current source content and image/map thumbnails. Pins retain UUIDs rather than copied prose. Removed or out-of-campaign record references show an unavailable placeholder; moving/removing a layout does not delete originals. World lore outside campaign membership opens its world guide and is labeled World reference. Campaign map inspectors retain campaign filtering.

### Quests and story threads

The board shows Open, Active, Done and Failed lanes. Move cards by drag/drop or the searchable progress dropdown. Search threads and filter story arcs; server filters apply before lane totals and pagination. Quest/task guides combine original lore, ordered objectives, outcomes, GM next actions, connected lore and linked updates/session reports. Original editors expose the same objective/outcome fields. Objective completion and thread completion remain independent choices.

Metadata editing uses a captured revision and preserves the original rich document. Captured thread updates retain thread/session UUIDs and can be pinned to the selected campaign desk. Outcomes and supported prose fields receive reading-time automatic source links with escaped HTML; documents are not rewritten.

### Campaign notebook and capture

The notebook searches full original note bodies, tags and campaign fields, including text beyond the summary. Filter notes, daily journals, milestones and session reports, and choose a campaign session or all sessions. Results use server pagination with 100 entries per page. Pin a result or open its original editor/guide. Related session reports expose their recorded sections.

Quick capture creates a private note, journal, milestone, task or quest with tags and selected session, thread, map/pin and related lore. Notes can retain a real record date and a free-text in-world day/chapter. It is available from the desk, board/notebook header and thread guide. Original editor/history/Trash/archive support remains the source of truth.

## Integrity and privacy

- Desk settings are stored in the campaign's versioned gm_workspace field. Layout and pin references are validated against the owned world, bounded and remapped in portable archives. Layout sessions must belong to the campaign; unchanged unavailable references can be retained. Historical restoration supports removed source entries without inventing replacement content.
- The workbench endpoint is owner-only and rejects reader mode. Reader serialization and reader search remove gm_workspace entirely, including layout names and private pinned UUIDs, even if the campaign was published after configuring the desk.
- Objectives, story arcs and outcomes follow published snapshots. gm_next_step remains GM-only. Thread updates are filtered by publication and campaign identity; a note cannot newly bind to another campaign's thread. Reader guides contain no edit/capture controls. This is local reader simulation; online players/grants remain later P5 work.
- Forms guard unsaved input on cancel, Escape, app navigation and browser unload. Stale saves reject without replacing newer data. Network-error tests retain draft text. A successful record write followed by refresh failure is treated as saved; retrying capture is not offered as if the write failed. Pinning is a separate follow-up action; a failed pin cannot undo the saved original record.
- The legacy GM quest/session lists now use the same explicit campaign-membership rule as the workbench and other guides. Clearing campaign_id no longer falls back to an old parent in those lists.

## Checks and evidence

- **437 backend tests passed**, comprising the previous 402 and 35 new workbench/thread cases. The initial 33 targeted cases passed before two final fallback/history cases were added. Coverage includes original identities/no writes, saved panel/pin/session settings, live source edits, unavailable references, campaign/session isolation, full-body search, type/arc filters and lane counts, pagination, invalid/bounded schemas, foreign-world references and session assignments, reader API/JSON/search privacy, authentication/ownership, real stale saves, archive remapping, thread objectives/outcomes/updates, deleted targets, escaped automatic links, independent objective/thread states, default-layout selection and historical layout restoration. Evidence: backend/studio/test_workbench.py and .preview/backend-tests-0.18.txt.
- Actual desk configuration, current-session activation, pin order/width, panel ordering/collapse and layout copying: .preview/workbench-desk-0.18.json.
- Private journal/milestone/quest capture, session/thread/map/pin/lore/date/tag associations and pin-after-save: .preview/workbench-capture-0.18.json.
- Actual objective/outcome editing without document rewrites, linked thread update and pin, drag status change, story arc filter and unchanged published snapshot: .preview/workbench-threads-0.18.json.
- Full-body search past the summary, type/session filters, campaign exclusion, pinning from the notebook, context across views, map references and removing a layout while preserving source notes: .preview/workbench-notebook-0.18.json.
- World-lore pin navigation and campaign-filtered map notes: .preview/workbench-world-reference-0.18.json. Cross-view campaign/desk/session/character integration and legacy cleared-membership behavior: .preview/workbench-integration-0.18.json.
- Injected conflict/offline/refresh failures verify retained layout/capture/thread drafts, discard/navigation guards and exactly one actual private capture after a successful write followed by simulated refresh failure: .preview/workbench-errors-0.18.json. Actual 409 rejection is separately tested against the backend; the browser responses in this failure script are simulated.
- Reader objectives/outcomes retain their published snapshot. Private next actions, updates, controls and published campaign GM layouts/pinned UUIDs are excluded: .preview/workbench-reader-0.18.json.
- At **390, 1024 and 1440 pixels**, the desk, board, notebook, thread guide and objective editor fit. Enabled capture dropdowns open focused text search within viewport/modal bounds. Screenshots inspected: .preview/workbench-mobile-0.18.json, workbench-tablet-0.18.json and workbench-desktop-0.18.json and corresponding PNGs.
- Existing **31-route smoke**, location/character/session/map/affinity reader, explicit source-reference workflows and latest-unsaved-text Trash/restore checks pass: .preview/smoke-0.18.json, location-reader-regression-0.18.json, dossier-reader-regression-0.18.json, session-reader-regression-0.18.json, map-reader-regression-0.18.json, affinity-reader-regression-0.18.json, references-regression-0.18.json and recovery-ui-regression-0.18.json.
- TypeScript, Prettier, targeted Python checks, migration generation and production build pass. All **83 searchable code locations** use the shared dropdown control. No dependencies, tables or schema migrations were added; schema 0003 remains current.
- Complete backup/checksum/download, restored counts/media, SQLite integrity, destination protection and portable-world roundtrip: .preview/recovery-0.18.json. Backend archive tests specifically remap nested layout sessions/pins and thread-update IDs.

Browser harness corrections waited for committed disabled/loading states between rapid scripted clicks and scoped a legacy quest assertion to its quest list rather than the deliberately world-wide reference picker. Actual integration corrections cover thread-update pinning, world-reference navigation, campaign map scope and legacy campaign membership. Final positive reports are authoritative.

## Boundaries and remaining scope

Layouts currently support six fixed panel types, up to 12 layouts and 40 pinned references per layout. Column/width choices and panel ordering are saved; arbitrary third-party widgets, pixel-resizing and persistent overlays across other editors remain unfinished. Dice/handout/shared-equipment tools remain in the existing campaign screen. Cross-world personal notebooks and notebook section management are not introduced by campaign search.

Boards paginate 100 matching original quests/tasks per page. The thread guide shows the latest 100 related updates; earlier notes remain searchable in the notebook. There are at most 100 objectives per thread. Story-arc grouping is textual; dependency graphs, scene sequencing, automatic XP/combat calculations and automated objective completion remain separate future work. Larger-world load/accessibility testing remains unfinished.

Original scope: **27 verified local acceptance rows, 69 partial and 43 planned** (139 total). N-04 advances from planned to partial for persistent pinned desk references; cross-editor overlays remain open. No online player access is enabled. The user's larger-related-batch preference is retained in [project-tracker.md](project-tracker.md).

## Installation

The verified real backup, retained previous bundle and all-table/media comparison are recorded in .preview/upgrade-0.18-result.json and [project-tracker.md](project-tracker.md).

Installed at http://127.0.0.1:8767/. Verified backup: `2026-11-06_10-35-34_9416c5.wbbackup.zip`; previous bundle retained in `.preview/dist-previous-20261106-103534`. All 22 table counts/content hashes and media hashes match the pre-upgrade baseline; SQLite integrity passes. Bootstrap reports 0.18.0 outside the QA workspace and the installed login page has no browser errors or failed assets. Real baseline: two worlds, three entries, no connections/images. QA restore retained 321 entries, 533 entry revisions, two images, 49 connections and 60 connection revisions.
