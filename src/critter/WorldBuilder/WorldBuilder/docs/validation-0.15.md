# Validation record - 0.15.0

5 November 2026. Single-owner Windows browser application. Synthetic fixtures and recovery checks use .preview/qa-data; real world data is backed up and compared separately during installation.

## Character dossiers and progression

Open Campaigns > campaign > Characters & places > View character dossier, or Open character dossier in a character editor. Character articles using the character template also qualify. The dossier has Overview, Relationship web, Progression, Sessions & journal, Places & maps and All notes. Portraits, original lore/fields, owner notes and unresolved quests/tasks stay connected to their original records.

Write private notes, journals and milestones, choose a session/campaign, or link an existing record without duplicating it. Session recaps, rewards and consequences appear in progression; preparation and follow-up are collapsible owner details. Map cards open the existing guide at an associated pin. All new dropdowns use text filtering.

The server derives associations from explicit related entries, stable references and unambiguous names/aliases in readable prose and supported campaign fields. Journals can bring in their related session. Private blocks are removed before reader matching. Reading does not rewrite documents or persist inferred associations. Campaign scope, original identities and published snapshots remain authoritative.

Reader dossiers use published character templates, names, aliases, portraits, records and relationships. GM notes, unpublished records, private pins and relationship notes are removed on the server. Refresh guards hide stale reader projections. This remains an owner reader preview; separate player accounts and online sharing are later P5 work.

## Evidence

- **359 backend tests passed**, including 19 new dossier cases: original-source immutability, direct links, prose/alias matching, ambiguity, journal/session associations, campaign boundaries, missing/null legacy membership, reader projection, published templates/names/portraits, GM fields/private blocks, hidden neighbors/pins, ownership/deletion, structured-text escaping, archive remapping and same-day ordering. Evidence: backend/studio/test_dossiers.py and .preview/backend-tests-0.15.txt.
- The continuous prepare/run/record/reopen/recover workflow and confirmed fixes are recorded in [audit-0.15.md](audit-0.15.md). Browser reports audit-session-0.15.json, dossier-ui-0.15.json and audit-recovery-0.15.json cover actual UI actions.
- Reader privacy passes in dossier-reader-0.15.json; existing map, affinity and explicit source-reference workflows pass in map-reader-regression-0.15.json, affinity-reader-regression-0.15.json and references-regression-0.15.json. Final reports contain no browser exceptions or failed assets.
- All six dossier sections fit at 390, 1024 and 1440 pixels. Modal dropdown filtering/focus and viewport fit are checked. Evidence: dossier-mobile-0.15.json, dossier-tablet-0.15.json, dossier-desktop-0.15.json and corresponding screenshots in .preview.
- The 31-route smoke suite passes: .preview/smoke-0.15.json. Backup/checksum, restored tables/media, SQLite integrity, destination protection and portable-world checks: .preview/recovery-0.15.json.
- TypeScript, Prettier, targeted Python checks, migration generation and the production build pass. The dropdown AST guard counts **71 searchable code locations**. No dependency or schema migration was added; schema 0003 remains current.

## Boundaries

This is a visual guide over existing entries, not automated character XP/level/inventory rules or a full sheet designer. The direct neighborhood is bounded to 80 nodes; relationship detail and recent campaign records to 200 each; places/maps to 100. Responses include total counts where records/places are limited. A dossier is not a replacement for larger saved affinity webs. Inferred mentions depend on current unambiguous names/aliases; explicit references retain stable identity after renames. Same-day ordering uses the record update time, not an immutable creation timestamp. Broader load/accessibility testing and the unfinished inventory remain tracked.

The original scope remains 27 verified local acceptance rows, 68 partial and 44 planned (139 total). USER-01 and USER-03 remain separately verified; USER-02 remains partial. No network hosting is enabled.

## Installation

Installation evidence is recorded in .preview/upgrade-0.15-result.json and [project-tracker.md](project-tracker.md), including the verified backup, previous browser bundle and all-table/media preservation checks.

Installed at http://127.0.0.1:8767/. Verified real backup: `2026-11-05_22-19-32_7d6bd7.wbbackup.zip`; previous bundle: `.preview/dist-previous-20261105-221933`. All 22 table counts/content hashes and media hashes match the pre-upgrade baseline, SQLite integrity passes, bootstrap reports 0.15.0 outside the QA workspace, and the installed login page has no browser errors or failed assets. Real baseline: two worlds, three entries, no connections/images. QA backup restoration retained 241 entries, 396 entry revisions, two images, 41 connections and 52 connection revisions.
