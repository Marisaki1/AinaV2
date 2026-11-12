# Validation record - 0.17.0

6 November 2026. Single-owner Windows browser application. Synthetic fixtures, browser tests and restoration checks remain separate in .preview/qa-data.

## Location guides

Settlements, buildings and geographical articles now have a location guide. Open it from the original editor's Open location guide button, Campaign > Characters & places > View location guide, session cast cards or a map inspector. Stable routes are #/locations/{entry UUID}/{optional campaign UUID}.

The guide reuses the character dossier's source-preserving reading, note and map components. Its six sections are Overview, People & connections, Visits & journal, Changes & progression, Maps & places and All notes. Original lore, custom fields, GM notes and an optional image remain on the original entry. Unresolved tasks/quests and recent changes are visible beside the lore.

People cards distinguish an incoming Located in connection (resident) from other connections, retaining labels and direction. The direct relationship web and relationship notes use existing connection IDs. Character buttons open their original dossiers. Maps show pins for the place and directly connected places; selecting one opens the existing focused map guide. Returning to the guide already underneath a map inspector now closes the inspector even when the destination hash is unchanged.

Records are connected through explicit related entries, stable references, unambiguous names/aliases and map/pin pairs whose current visible marker links to the location. Related journals can bring in their session. Campaign context follows existing membership and also accepts a location reached through a campaign map. Other campaign records and people outside that context are excluded. World context remains available.

Write private notes, journals and milestones with real/in-world dates and a related session, or link an existing record without copying it. Source documents and stored prose links are not rewritten by reading. Notes created in the location guide explicitly retain the place UUID; use the map guide for a note specific to one pin. Session records open the session guide. All dropdowns retain searchable text fields.

## Reader and save behavior

Reader guides use published location templates/names/aliases/images, filtered relationships and map markers. GM location/relationship/planning text, private residents, records and draft images are excluded on the server. A published record whose hidden pin was removed from the reader projection is not reinterpreted as a general place visit, including when a journal links its session. Only visible map pins can establish campaign location context. Cached reader results are hidden while context/revisions change.

The shared dossier composer now guards unsaved text on Escape, cancel, app navigation and browser unload. Failed saves retain input. A successful write followed by refresh failure closes the saved form and reports the refresh problem, avoiding a misleading invitation to create the record again. Editing is disabled during the write.

Map-guide type checking now follows the projected record type consistently. Normal resource APIs already reject changing an existing module type. The backend test that constructs a map/current-type mismatch directly represents inconsistent legacy data; it is not a supported editor workflow. The same qualification applies to the snapshot-type defensive tests in 0.16. Article template changes remain a supported workflow, and location readers retain the published template until republished.

## Evidence

- **402 backend tests passed**: all 380 previous tests and 22 new location cases. Coverage includes original lore/no writes, residence direction, visitors, pin-bound visits, map-wide/other-place exclusion, explicit and alias associations/ambiguity, related sessions, map-derived campaign membership, other-campaign isolation, private people/notes/pins, published template/name/alias, hidden-pin scope and linked-session protection, removed markers, wrong-kind/deleted/foreign/unpublished locations, all three supported templates, archive remapping, authentication and inconsistent legacy map-type projection. Evidence: backend/studio/test_location_guide.py and .preview/backend-tests-0.17.txt. The initial targeted location/character run passed 40 tests before the additional legacy-map case.
- Actual editor/campaign/context navigation, resident/visitor cards, relationship web, character and session guides, pin visits, private milestone creation, linking an existing task, image selection without lore rewrites and focused map return: .preview/location-ui-0.17.json.
- Published reader lore/visits, private residents/relationships/notes/pins/identities, draft image exclusion, automatic source links, campaign scope and nested-map Escape: .preview/location-reader-0.17.json.
- Simulated offline/refresh failures verify retained unsaved text, discard guards and exactly one actual private write after a successful save followed by a simulated refresh failure: .preview/location-errors-0.17.json. These connection failures are injected by the QA script.
- All six guide sections fit at **390, 1024 and 1440 pixels**. Note-type/session dropdown search focus and popup bounds within the viewport/modal pass. Screenshots inspected. Evidence: .preview/location-mobile-0.17.json, location-tablet-0.17.json and location-desktop-0.17.json and corresponding PNGs.
- Existing **31-route smoke**, character dossier reader/mobile layout, session reader/save-error UI, map reader, affinity reader, source-reference workflow and latest-unsaved-text Trash/restore checks pass. Evidence: .preview/smoke-0.17.json, dossier-reader-regression-0.17.json, dossier-mobile-regression-0.17.json, session-reader-regression-0.17.json, session-errors-regression-0.17.json, map-reader-regression-0.17.json, affinity-reader-regression-0.17.json, references-regression-0.17.json and recovery-ui-regression-0.17.json.
- TypeScript, Prettier, targeted Python checks, no-change migration generation and production build pass. The AST guard counts **75 searchable code locations**, reused by both dossier modes. No dependencies or migrations were added; schema 0003 remains current.
- Complete backup/download/checksum, restored table counts/media, SQLite integrity, destination protection and portable-world roundtrip: .preview/recovery-0.17.json. The location backend case separately checks remapped place/note/session/pin/resident identities.

An early browser assertion was corrected to tolerate the intended loading state during a context switch. The actual same-route map-return issue was fixed and rerun with fresh fixtures. An attempted browser module-type mutation was rejected by the existing API; its unsupported test was removed. Final positive reports are authoritative.

## Boundaries

This supports settlement/building/geography articles, not an automatic census, geographical distance calculation or full region hierarchy editor. Residence is explicit and directional; other relations are not guessed as residence. The web is a direct neighborhood of at most 80 nodes; relationship/record lists cap at 200 each; people and map pins at 100 each, with totals. Same-day records use update time. Campaign filters continue existing membership rules rather than including every person in the world.

Pin-derived visits reflect the current map, or the published map in reader mode. Removing/relinking a marker can remove that inferred association; original records and pin metadata remain intact. Explicitly link the location UUID to preserve the place association through future pin edits. Reading does not persist inferred visits or add stored backlinks. These limits and broader load/accessibility testing remain unfinished.

The original inventory remains **27 verified local acceptance rows, 68 partial and 44 planned** out of 139. USER-01 and USER-03 remain separately verified; broader visual campaign work USER-02 remains partial. Online player hosting remains later P5 work.

## Installation

The verified real backup, previous bundle and all-table/media comparison are recorded in .preview/upgrade-0.17-result.json and [project-tracker.md](project-tracker.md).

Installed at http://127.0.0.1:8767/. Verified real backup: `2026-11-06_09-18-33_d46113.wbbackup.zip`; retained previous bundle: `.preview/dist-previous-20261106-091833`. All 22 table counts/content hashes and media hashes match the pre-upgrade baseline, SQLite integrity passes, bootstrap reports 0.17.0 outside the QA workspace, and the installed login page has no browser errors or failed assets. Real baseline: two worlds, three entries, no connections/images. QA restoration retained 294 entries, 472 entry revisions, two images, 49 connections and 60 connection revisions.
