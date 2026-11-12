# Validation - 0.20.0

Reviewed 6 November 2026 for the single-owner Windows browser installation. This is the approved fourteen-part campaign continuity batch. Real data and QA remain separate.

## Delivered batch

| Requested feature | Delivered behavior |
| --- | --- |
| Party dashboard | Original portraits, current location, goals, conditions and character-guide links. |
| PC/NPC participation | PC, NPC, companion and inactive campaign profiles; promotion keeps the same character/lore and updates active party membership. |
| Character progression | Readable milestone, ability and personal-development records linked to original characters and sessions; existing dossiers show them. |
| Party inventory | Searchable original item notes with quantities per character, party storage or location. |
| Item transfers | Revision-checked stock movement between holders of the same original item with transactionally stored history. |
| Loot distribution | Create an item reward or add/distribute an existing item, retaining session and movement provenance. Consumption uses recorded stock adjustments. |
| Quest dependencies | Navigable quest/task/scene and objective nodes, source/target objective references, saved diagram positions and original-note inspection. |
| Consequence tracking | Open/resolved decisions and repercussions with affected originals and optional campaign follow-ups. |
| Relationship developments | Session events attached to an original relationship; optional edge changes and event creation commit together. Affinity web inspectors expose the event history. |
| Campaign map routes | Click maps or pins to draw ordered journeys, or use numeric coordinates/location pickers; saved routes retain session/map/place links. |
| Location status | Discoveries, threats, control/ownership and unfinished-business records with source location/controller/status and history. |
| Session media | Ordered portrait/map/illustration/handout source references, thumbnails, captions and original-source access; handouts retain safe preview. |
| Unified wrap-up | Five review sections combine stock/rewards, progression, relationship changes, consequences and follow-ups. Reviewed source UUID/revision pairs and the session reference save together. |
| Continuity overview | Current party situation, counts, recent developments and navigation into the same original records/workflows. |

Open **Campaigns > campaign > Party & campaign continuity**. Existing GM desks, session review, character dossiers, map guides, affinity webs and the original GM screen link to the same data. Party/equipment views show current state; session selection filters recorded developments and media.

## Database use and integrity

The real database is **WorldBuilder/data/worldbuilder.sqlite3**, accessed through Django. Resource structured details and documents use JSON database columns; Resource/Revision, World, Connection/ConnectionRevision, Asset and Activity are real database models. Browser storage is not authoritative for campaign state or stock. New references are application-validated against original world/type/campaign identities.

Stock updates and their private movement resources use one IMMEDIATE SQLite transaction, locks and expected revisions. New-item rewards also check/bump campaign revision to reject replay duplicates. Underflow, invalid recipients, stale changes or invalid history notes roll everything back. Movement facts and inventory identity cannot be erased through ordinary metadata edits. Item-note version restoration keeps current stock; quantity corrections use a transfer or adjustment. Trashing a movement note does not undo stock.

Relationship mutation/history and the session event commit atomically. Wrap-up note/source revisions and session reference also commit atomically; explicit completion finishes the active agenda item while preserving other agenda states. No automatic publication, party lore duplication, numerical XP/stat calculation or player access is introduced.

## Tests and evidence

- **533 backend tests pass**, including **61 new continuity cases**: .preview/backend-tests-0.20.txt, .preview/continuity-tests-0.20.txt and backend/studio/test_continuity.py. Coverage includes roles/promotion and original identities, profile/type/world/campaign validation, stock conservation/underflow/limits, recipient/storage types, removed-holder recovery, stale/replayed transfers and rewards, rollback after late failures, immutable stock/movement metadata, legacy conversion, item-note restoration, relationship event/edge rollback, progression/consequence provenance, normalized journeys, place status, objective dependencies/positions, media validation, wrap-up completion/replay/conflicts, reader privacy, authentication and portable archive remapping.
- Party role/location/goals/conditions editing, legacy conversion, new/existing loot, character/location transfers and consumption with five source movements: .preview/continuity-party-inventory-0.20.json. Final holdings: party 10, hero 6, location 2 and companion 3; total 21.
- Actual NPC -> PC promotion without duplicate resources/lore, consistent party membership and original GM equipment/party compatibility: .preview/continuity-roles-gm-0.20.json.
- Ability progression, objective-to-scene dependency, saved graph, consequence/follow-up and atomic relationship development: .preview/continuity-developments-0.20.json.
- Objective-node inspection resolves the original quest, compound position persistence, character progression links, location journey/status context and relationship history in the existing affinity web: .preview/continuity-integration-0.20.json.
- Click-drawn journey plus numeric editing/removal, source-linked location control, ordered session media, safe handout preview, reviewed wrap-up/session completion and continuity overview: .preview/continuity-journey-media-wrapup-0.20.json.
- Injected stale/offline browser responses retain transfer/consequence drafts; Escape/navigation guards work and actual database stock remains unchanged: .preview/continuity-errors-0.20.json. Real 409/rollback/replay behavior is separately exercised against the backend.
- Actual item history dialog restores older prose while preserving live holdings and all five movement records: .preview/continuity-item-history-0.20.json.
- **Server restart plus removal of app browser preferences/recovery copies** preserves original item/journey/wrap-up IDs, balances and campaign situation: .preview/continuity-persistence-0.20.json. A separate read-only SQLite inspection confirms all 22 table counts/content hashes and integrity unchanged across restart: .preview/database-persistence-0.20.json. This proof was performed before subsequent deliberate role/history QA mutations.
- All eleven views, party/inventory/journey forms and enabled dropdown filter focus/viewport bounds pass at **390, 1024 and 1440 pixels**: .preview/continuity-mobile-0.20.json, continuity-tablet-0.20.json, continuity-desktop-0.20.json and inspected screenshots.
- Existing **31-route smoke**, workbench/location/character/session/map/affinity reader filtering, source-reference workflows, latest-unsaved-text Trash/restore, editor reference-tray preservation and safe handouts pass: .preview/smoke-0.20.json, workbench-reader-regression-0.20.json, location-reader-regression-0.20.json, dossier-reader-regression-0.20.json, session-reader-regression-0.20.json, map-reader-regression-0.20.json, affinity-reader-regression-0.20.json, references-regression-0.20.json, recovery-ui-regression-0.20.json, reference-tray-regression-0.20.json and handout-regression-0.20.json.
- Complete backup/download/checksums, clean database/media restore, SQLite integrity, protected existing destinations and portable-world roundtrip: .preview/recovery-0.20.json. Archive tests explicitly preserve/remap stock holders, nested media/routes/review references, relationship-event connection IDs and compound objective-position keys. Import allocates relationship IDs before validating event references.
- TypeScript, Prettier, focused Python checks, migration check and production build pass. **91 searchable select code locations** remain guarded by npm check/build. No dependencies, tables or migrations were added; schema 0003 remains current.

Corrections found during verification: recover stock from a removed holder without introducing invalid live links; reject replayed new rewards; protect inventory identity and item-restoration quantities; remap relationship/objective IDs during archive import; accept fractional waypoint inputs and translate clicks through the actual SVG transform; keep clean wrap-up drafts synchronized with newer saved notes. Harness corrections wait for rendered dossier controls and use actual objective field capitalization. Final positive reports are authoritative.

## Boundaries

The projection returns at most 500 items/records/relationships and 200 cast/location/quest/media/follow-up originals, with totals where supplied. The diagram displays up to 100 originals and 100 objective nodes and saves up to 200 positions. Each original has up to 100 advisory dependencies. Profiles are limited to 200. Item stock is whole units, at most 1,000,000 total/item and 75 holders; legacy conversion processes 100 rows at a time. These are practical local tools, not a tested large-server inventory/rules engine.

Journeys have up to 200 normalized waypoints against the current source map; they do not provide GIS/pathfinding or a separate historical map snapshot. Collections hold up to 200 original/image references; audio and remote embeds remain unfinished. Wrap-up snapshots up to 700 source UUID/revision pairs. Current party/stock views do not reconstruct historical balances at an old session; recorded movements and revisions retain history. Progression is notes, not automated XP/stat mutations. Broader accessibility/load testing remains unfinished.

All new records begin private. Reader projection strips GM profiles, ownership, dependency diagrams, relationship IDs, journeys, selected media and review metadata. Explicitly published prose still requires owner review. No online hosting, accounts, invitations or selective player grants are enabled; those remain P5.

Original scope remains **139 rows: 29 verified local acceptance rows, 67 partial, 43 planned**. C-02 passes its local NPC-promotion/source-preservation acceptance. Full World Anvil parity remains unfinished.

## Installation evidence

The verified real backup, previous bundle, all-table/media preservation comparison and final local URL are recorded in .preview/upgrade-0.20-result.json, .preview/bundle-upgrade-0.20.json and project-tracker.md.

Installed at http://127.0.0.1:8767/. Verified real backup: `2026-11-06_15-06-44_2c0a13.wbbackup.zip`; previous bundle retained in `.preview/dist-previous-20261106-150700`. All 22 real database table counts/content hashes and media hashes match the pre-upgrade baseline; SQLite integrity passes. Bootstrap reports 0.20.0 outside QA, and the installed login page has no browser errors/failed assets. Real baseline remains two worlds, three entries, zero connections/images. Final QA restore retained 361 entries, 619 entry revisions, two images, 50 connections and 62 connection revisions.
