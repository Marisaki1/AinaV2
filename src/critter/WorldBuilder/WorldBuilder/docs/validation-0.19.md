# Validation - 0.19.0

Reviewed 6 November 2026 for the single-owner Windows browser installation. This release delivers the approved ten-feature campaign batch. Online accounts and selective player sharing remain later P5 work.

## Delivered together

1. Persistent reference tray alongside editors, with original note/lore/map sources, per-world pinned UUID preferences and draft/cursor restoration when folded.
2. Versioned adventures with grouped and ordered scene/encounter cards; original rich notes remain intact during metadata edits.
3. Saved scene diagram positions, directional routes and prerequisites. Branch conditions are GM guidance; prerequisites do not automatically block play or complete objectives.
4. Encounter preparation with stakes, environment, possible outcomes, GM preparation, cast/statblock references and map/pin context.
5. Per-session agenda of original scenes, encounters, notes, reminders and quest/task threads, with ordering, preparation and planned/active/paused/completed/skipped states.
6. Running view with current item, encounter notes, branch selection, cast/statblock/map links, completion/skip and scene/session-aware private event capture.
7. Chronological campaign activity journal with full-body text, session, character, location and quest/task filters; separate record change log.
8. Campaign follow-up inbox, scheduling without moving origin history, resolve action and atomic private task creation linking the original note.
9. Selected-note recap assembly into an editable draft, explicit save without publication, and atomic handoff of selected unfinished references/follow-ups to an existing or new private session.
10. Player handout source/image selection, safe preview and downloaded standalone HTML with embedded images. Source bodies come from published reader snapshots; unpublished/private selections and GM fields/private blocks are excluded.

Open **Campaigns > campaign > Adventure & session workflow**. Existing campaign/session guides and GM desks also link to this workflow. Existing original editors, revision history, Trash and archives remain authoritative; manuscript scenes retain their existing module kind.

## Checks and evidence

- **472 backend tests pass**, including 35 new planning cases. Coverage includes campaign/session/world isolation, type and bounded-input validation, duplicate agenda/route rejection, one-active-item consistency, per-session state independence, scene-aware capture, journal filters/activity history, stale/replayed writes, transaction rollback, linked-task provenance, existing/new-session handoff, published reader privacy, handout escaping/embedded images, removed references, nested archive remapping and legacy parent-based membership. Evidence: backend/studio/test_planning.py, .preview/planning-tests-0.19.txt and .preview/backend-tests-0.19.txt.
- Actual browser adventure/scene/encounter creation, inherited adventure selection, metadata editing without rich-document replacement, route/prerequisite creation and saved ordering: .preview/planning-preparation-0.19.json. Saved graph positions, cast/statblock links, inherited event context, reopening and later-session play without changing earlier session states: .preview/planning-integration-0.19.json.
- Agenda preparation, branch-based activation, prerequisite warning, event capture, private follow-up flag, skip state, unchanged reusable definitions and independent next session: .preview/planning-agenda-0.19.json.
- Journal full-body/character filters, record change log, follow-up scheduling/conversion/resolution, retained origins, editable recap, unsaved session-switch guard, explicit save without publication and next-session handoff retaining source agenda: .preview/planning-review-0.19.json.
- Reference tray keeps the same mounted editor and unsaved text, restores focus and cursor, resumes typing at that cursor and stores only source IDs: .preview/planning-tray-0.19.json.
- Safe handout preview/export uses the published clue rather than its newer secret draft, omits a private source without its title/content, embeds the explicitly selected image and downloads the attachment: .preview/planning-handout-0.19.json and .preview/handout-download-0.19/campaign-handout.html. Backend tests additionally cover private blocks, reader snapshots and escaped source/introduction content.
- Injected browser conflict/offline responses retain planning, agenda and recap drafts; cancel/navigation guards and explicit reload work: .preview/planning-errors-0.19.json. Actual server-side conflicts and rollback are tested separately against the backend.
- All seven views, encounter/handout forms, reference tray and enabled dropdown focus/bounds fit at **390, 1024 and 1440 pixels**: .preview/planning-mobile-0.19.json, planning-tablet-0.19.json, planning-desktop-0.19.json and corresponding inspected PNGs.
- Existing **31-route smoke**, workbench/location/character/session/map/affinity reader filtering, automatic/explicit source links and latest-unsaved-text Trash/restore regressions pass: .preview/smoke-0.19.json, workbench-reader-regression-0.19.json, location-reader-regression-0.19.json, dossier-reader-regression-0.19.json, session-reader-regression-0.19.json, map-reader-regression-0.19.json, affinity-reader-regression-0.19.json, references-regression-0.19.json and recovery-ui-regression-0.19.json.
- TypeScript, Prettier, focused Python checks, no-pending-migration check and production build pass. **85 searchable select code locations** share the guarded control. No dependencies, tables or migrations were added; schema 0003 remains current.
- Complete backup/download/checksums, SQLite integrity, restored data/media, destination protection and portable-world roundtrip: .preview/recovery-0.19.json. The real-installation backup and all-table/media preservation comparison are recorded in .preview/upgrade-0.19-result.json and project-tracker.md.

Actual corrections caught during verification include three request handlers using the wrong JSON helper name, legacy parent-based handoff normalization, a viewport calculation that included scrollbar width, and relationship-specific diagram wording replaced with scene/route guidance. Test harness corrections wait for the rendered view, allow existing repeated milestone fixtures and accept both timeline presentations. Final positive reports are authoritative.

## Limits and remaining scope

The tray supports 12 sources, stored as browser-local per-world UUID preferences, outside portable archives. The workflow returns up to 500 planning records, 200 matching journal/follow-up records and 100 activity events with totals. The planner displays up to 100 graph nodes. An agenda permits 200 unique originals and one active item; a scene permits 40 branches. Recap assembly accepts 100 selected records. Larger-world performance/accessibility testing remains unfinished.

Handouts permit 30 selected sources, 10 explicitly approved images and 30 MB of embedded image bytes. The introduction and selected images are owner-approved content; no automatic redaction of ordinary prose is claimed. Exported source text/images are standalone; internal app reference navigation is not an offline app. No arbitrary pane plugins/free resizing, automatic combat/XP, online player accounts, invitations or selective sharing are introduced.

The 139 original scope rows remain accounted for: **28 verified local acceptance rows, 68 partial, 43 planned**. N-04 passes its stated unsaved-draft/cursor acceptance. Broader campaign/media/player features remain partial. This is not complete World Anvil parity or a guarantee that every possible issue has been eliminated.

## Installation

Installed at http://127.0.0.1:8767/. Verified real backup: `2026-11-06_11-35-53_85d3a8.wbbackup.zip`; previous browser bundle retained in `.preview/dist-previous-20261106-113607`. All 22 real database table counts/content hashes and media hashes match the pre-upgrade baseline; SQLite integrity passes. Bootstrap reports 0.19.0 outside QA and the installed login page has no browser errors/failed assets. Real baseline remains two worlds, three entries, zero connections/images. Isolated QA restore retained 337 entries, 573 entry revisions, two images, 49 connections and 60 connection revisions.
