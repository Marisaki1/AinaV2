# Historical project tracker, retained 13 November 2026

This is the pre-audit narrative. Counts, ports, paths and terminal IDs below are historical, not current deployment facts or fresh test evidence. Use project-tracker.md and implementation-status.md for current decisions/status.

# WorldBuilder project tracker

Updated 13 November 2026. Keep this file current when continuing work. The complete 139-row scope and delivery evidence live in [feature-inventory.json](feature-inventory.json) and [implementation-status.md](implementation-status.md).

## User decisions

- **12 November 2026:** provide natural mouse controls (wheel zoom, middle drag, relevant right-click menus), working Markdown image links and direct portrait URLs. Preserve original rich documents and reader privacy. User also needs to move the whole project to another bot/machine later; provide a verified transfer package including database/media and clear destination setup/restore steps. Delivered together in 0.22; linked assets retain external URLs and require their host.

- **6 November 2026: prioritize using this as a note-taking tool now.** Continue substantial connected implementations; avoid speculative completion schedules, expanding wishlists and calendar work. Release 0.21 delivers practical capture, organization, templates, writing, source previews and visual notebooks as one batch.

- **6 November 2026: all fourteen continuity features approved, with proper database persistence and tests.** Deliver the whole related batch, retain source identities/history, and verify transactional stock operations. Browser storage must not be the campaign database. Delivered in 0.20; keep this expectation active.

- **6 November 2026: implement substantial related batches.** Group connected campaign workflows into one release, integrate them, and run appropriate feature/integration/privacy/recovery tests. Do not return to one small guide per release. Delivered together in 0.18: configurable GM desk and saved pinned layouts, quest/story board with objectives/outcomes, unified searchable notebook/quick capture, and connected session/character/location/map navigation. Keep this batching preference active for future continuations.

- The application belongs in `TouhouDND/WorldBuilder` and runs in a browser.
- The present installation is for one owner on this Windows PC. Preserve existing world data and keep browser fixtures in `.preview/qa-data`.
- The user prefers visual guides and notes: connected campaign webs, portraits, maps and readable notes take priority over numeric automation. An affinity chart inspired by Xenoblade Chronicles 1 is the current requested direction.
- Full documented feature coverage remains the destination. Do not describe a partial release as complete parity.
- Add optional online self-hosting later, after the local feature scope is accounted for. Other players must have their own accounts and see only the parts of the world that the owner shares, including characters, relationships and other lore.
- Record the online requirements now; do not enable network access as part of the current local release.
- Automatically link matching entry names and aliases to their source entries; preserve existing links and avoid ambiguous guesses. Requested during the map-guide increment on 5 November 2026.
- Every application dropdown must offer a filterable text field. Use SearchableSelect for new select controls; npm check/build enforces this. Existing reference/search pickers retain their text search. This is USER-01, requested on 5 November 2026.

## Current delivery

13 November: the connected manuscript batch advances B-01 through B-07. Delivered
nested chapter/scene/research structure and original-record moves; write/corkboard/
read/review modes; full-prose search and docked world references; stage/goal/count
summaries; named reviewed draft restoration; explicit snapshot publication and
selection; and standalone HTML/text books with embedded local images. Five rows
(B-01/02/04/05/07) meet local acceptance. B-03 retains daily-history work, B-06
retains online/group/scheduled releases. Current original inventory: 40 verified,
57 partial, 42 planned. Complete evidence and limits remain in validation-1.0.md;
no cosmetic version bump or platform-complete claim is made.

13 November: W-02 continuation connects the Overview to daily campaign work.
Eight configurable sections cover pinned entries, notes, tasks, recent entries,
favorites, activity, counts and quick actions. Ordering, visibility, width and limits
are saved in SQLite, with conflict checks and archive pin remapping. Original task
completion uses revisions/history. Browser tests cover failed-save recovery, two-tab
conflicts, refresh, managed restart, account switching and narrow/desktop layouts.
Original inventory: 35 verified local acceptance rows, 62 partial, 42 planned.
The milestone version remains unchanged. See validation-1.0.md.

K-02/K-07 continuation: versioned custom fields now connect template design,
article/character editing, reader views, references, revision history and exports.
Seven types, ordered sections, required/GM-only fields and explicit reviewed schema
upgrades are implemented. Renames retain values; removed/incompatible values remain
recoverable. Template edits do not silently migrate existing entries. Original
inventory: 34 verified local acceptance rows, 63 partial, 42 planned. The milestone
version is unchanged; broader World Anvil parity remains unfinished. See
validation-1.0.md for tested workflows and limits.

K-08 continuation: reusable rich snippet collections now pass local acceptance,
including selected-text capture, source editing, full-text search, live/copy insertion,
direct usages, published-source privacy and archive ID preservation. Live snippets
expand on refreshed reading views; editor tokens link to their source. Cross-world
snippet libraries and simultaneous push updates are not claimed. Full 620-test
backend suite plus integrated browser workflow pass. Current original inventory:
32 verified acceptance rows, 65 partial, 42 planned. See validation-1.0.md.

Tracker-driven task/board continuation: N-03 passes task-to-article local acceptance
with preserved originals, status, repeat protection and navigation in both directions.
R-07 advances with freehand/shapes, property editing, undo/redo, recovery and validated
JSON/SVG portability; broader grouping and standalone cross-world import remain
partial. All 607 backend tests pass; browser workflow evidence is in validation-1.0.md.
Current inventory: 31 verified acceptance rows, 66 partial, 42 planned. These figures
describe the original acceptance scope, not full World Anvil feature completion.

Notes-workspace continuation stays within milestone 1.0 rather than generating
another cosmetic version bump. Delivered: original-entry checklist aggregation,
completion controls with optimistic UI/rollback and revision conflicts, note
selection/Trash/Undo, direct Trashed notes recovery, bulk tag removal/unfavorite,
and last-route recovery on refresh. Keep the focus on original data, account/world
isolation and transactional bulk changes. The validation-1.0 document holds the
combined evidence and explicit boundaries.

**1.0.0 — Notes & Knowledge** is the first named daily notes workspace milestone.
Future minor versions group completed workflows; patch versions are fixes. Do not
use version bumps as substitutes for substantive implementations. Version 1.0 does
not claim complete World Anvil platform parity. This batch connects interactive
checklists, checked-state import/render/history preservation, reviewed name/alias
links, formatting-safe search and replace, plus the capture/recovery/history tools
from 0.23/0.24. See validation-1.0.md for actual acceptance evidence and boundaries.

Release **0.24.0** delivers a connected capture/navigation/writing batch: global
capture and shortcut, recent-note access, quick-submit, interactive outlines,
in-note search, live writing metrics and clipboard/plain-text draft export. The
browser integration checks the actual workflows using isolated account data.
Continue note organization and interactive reference workflows in substantial
batches; do not revert to isolated cosmetic release increments.

Release **0.23.0** continues the note-taking priority: recoverable quick captures,
remembered notebook filters, explicit filter reset, keyboard saving and saved-entry
revision previews. The preview shows earlier/current prose and changed field names
before the existing explicit restore operation. Private snapshots remain owner-only.
No schema migration or character-content changes are required. Continue connected
note-taking and reference-navigation workflows; broader parity counts stay unchanged.

Release **0.22.0** adds wheel zoom at the pointer, middle-drag panning and contextual graph menus to affinity/shared relationship, family and hierarchy diagrams. Left/keyboard arrangement remains available. Markdown insert/paste with preview converts into the existing rich-document format; direct linked images and portrait URLs now validate, render and persist. Published reader projections retain the published portrait. Markdown drafts have failure/navigation/reload protection, and graph menu Escape does not dismiss reader dialogs. See [validation-0.22.md](validation-0.22.md): 583 backend tests, real browser mouse gestures, live cross-origin image rendering, GUI persistence/guards, narrow/desktop menus, reader regressions and verified transfer/recovery.

**Prepare WorldBuilder Transfer.cmd** packages source/built app and a verified complete backup in `transfers`. Environments are recreated on the destination with Setup; the package includes a restore launcher that refuses existing data. Do not copy QA fixtures or rely on copying `.venv`. Linked images remain URLs rather than embedded backup files. This local portability work does not enable online player sharing.

Installed at http://127.0.0.1:8767/. Verified backup: 2026-11-12_11-58-44_fa8485.wbbackup.zip. Previous bundle: .preview/dist-previous-20261112-115845. All 22 real database table counts/hashes and media hashes are unchanged; actual baseline is two worlds/six entries/zero uploaded images. Main session at completion: 55712; verify process on continuation. QA is stopped.

Previous note-taking batch:

Release 0.21.0 adds the note-taking batch at `http://127.0.0.1:8767/`: **Notebooks** opens nested ordered sections, unfiled inbox, private quick capture, rich-text templates/six starter presets, typed metadata/search/favorites, facts/questions, bulk filing/tags, in-place rich writing and side-by-side original references. Visual boards retain original sources with captions/positions/labeled connections. Private and published-source HTML snapshots have distinct privacy handling. Audit unavailable references/ambiguous names without automatic merge. Previous campaign continuity, guides, maps, relationships and automatic source links remain connected. All 97 select locations are searchable.

SQLite at `data/worldbuilder.sqlite3` remains authoritative for notes/sections/templates/metadata/boards. Original Resource/Revision identities/history are retained; capture retries and bulk/book mutations are transactional and revision-checked. No tables, migrations or dependencies were added. Schema 0003 remains current. See [validation-0.21.md](validation-0.21.md): 573 backend tests including 40 notebook cases, browser writing/organization/board/export/failure checks, three screen sizes, existing-workflow regressions, actual server restart/browser storage clearing and complete recovery. Installation preservation evidence and verified backup are recorded there.

All 139 original scope rows remain accounted for: **30 verified local acceptance rows, 66 partial, 43 planned**. N-02 now passes tag/typed metadata/template search acceptance. N-01 remains partial for cross-world account-owned notebooks. USER-01 and USER-03 remain verified; USER-02 remains partial for broader visual workflows. Full World Anvil parity and player accounts/selective online sharing remain unfinished.

## Next local work

Installation continuation: inspect the actual process on port 8767 and bootstrap version before relying on prior terminal session IDs. QA uses port 8768 and `.preview/qa-data`; never write test fixtures to real data. See the latest validation record for backup, retained bundle and preservation evidence.

**User priority correction, 5 November 2026:** campaign essentials take precedence over calendar completeness. Focus on notes, day-to-day campaign records, sessions and progression, characters/NPCs, locations, maps and their connections. Do not resume year-numbering/calendar expansion unless the user requests it or a concrete campaign workflow requires it.

Delivered in 0.12: a connected campaign workspace, session plans/outcomes, daily journal, notes/tasks, progression milestones/quests and linked characters/places/maps. Ordinary versioned entries remain the source of truth; campaign/session membership, reader privacy, history and archive recovery are tested.

Delivered in 0.13: interactive affinity webs for campaign characters, relationships and notes, with saved layouts and campaign scope. Delivered in 0.14: a campaign map/location note guide and automatic source links from entry names/aliases in reading views. Delivered in 0.15: the continuous campaign workflow audit and character/NPC dossiers with relationships, places, session appearances and progression notes. Confirmed fixes cover GM-screen next-session suggestions, explicitly cleared campaign membership and readable consequence-only progression. Same-day dossier records follow update order. Pending editor text already survived Trash/restore; this was verified, not newly fixed. Delivered in 0.16: a session preparation/play guide, scoped record writer, cast/map navigation and explicit previous-session follow-up, plus snapshot-type privacy and nested-dialog keyboard corrections. Delivered in 0.17: location guides for settlement/building/geography entries, explicit residents/other connections, map-pin visits, source-preserving place notes and integrated session/character/map navigation. Delivered in 0.18 as one connected batch: saved configurable GM layouts/live pins, quest/story board and objective/outcome guides, campaign notebook/full-body search, shared quick capture and prepare/play/review navigation. Delivered in 0.19: the ten-feature adventure/session/review/handout batch and persistent cross-editor reference tray. Delivered in 0.20: the complete approved fourteen-part party/equipment/consequence/continuity batch. Next local work must also be a substantial related batch, scoped against actual campaign use and the remaining inventory rather than isolated calendar tasks. Keep advanced media/audio, broader guide/search accessibility and later player-sharing requirements accounted for; choose the next scope with the user. Do not split this back into isolated small guide releases. Preserve source UUIDs, campaign scope, autosave/history and reader filtering. Avoid numerical/calendar expansion. Keep provenance and original note identities visible. Continue practical visual campaign work. Preserve existing notebooks, imported notes, session reports and map links. Full platform coverage remains a longer-term destination; it must not displace the user's campaign priorities. Advanced calendar policies, recurrence exceptions, general embed/layout options and writing catalogues are deferred.

## Later: online self-hosting and player sharing

This is a confirmed requirement, assigned to P5. It is not implemented by the local reader-preview switch.

1. Provide a separate shared-server deployment profile with documented HTTPS/reverse-proxy setup, persistent storage, backups, updates and restore. Keep the Windows local profile available.
2. Add distinct owner and player accounts, invitations, account recovery, revocation and per-world memberships. Public registration should be an explicit hosting choice.
3. Let the owner share individual entries, collections, characters, relationships, maps and selected lore with individual players or groups. GM notes, unpublished edits and unshared content remain private.
4. Apply permissions on the server to direct URLs, API responses, images/downloads, references, graph nodes and edges, search results, counts, timeline lanes, map markers/layers and exports. A shared character must not expose a private relationship or its hidden endpoint.
5. Preserve draft/published snapshots, support an owner preview as a specific player, and revoke access immediately when membership or grants change.
6. Verify with separate browser sessions for owner, two players with different grants, revoked player and outsider. Test backup/restore of accounts and grants and the supported shared database/deployment profile before calling hosting ready.

No domain, hosting provider or deployment credentials have been selected. Those decisions belong to that later implementation phase.

## Continuation procedure

Read this tracker and the implementation status first. Inspect current source and running processes instead of trusting a previous terminal session. Update inventory rows only after their actual acceptance checks pass; retain explicit boundaries on partial features. Record tests, bugs fixed, recovery evidence and remaining work in a versioned validation document before updating the installed browser bundle. Back up real data before an upgrade and compare it afterward.

Clarification from the 0.17 audit: normal resource APIs reject module-kind changes. Snapshot/current-kind disagreement tests construct inconsistent legacy data directly; template changes on articles remain supported. Do not describe module-kind changes as an ordinary editor workflow. Pin-derived visits follow current/published map definitions; explicit place links preserve the association through marker edits.

Historical 0.18 boundaries: six desk panel types, at most 12 layouts/40 pins per layout; 100-result notebook/board pages and 100 objectives per thread. GM settings and next actions remain private. Cross-editor overlays and scene dependencies listed as unfinished then are now delivered in 0.19; N-04 advances from partial to verified. Arbitrary pane types/free resizing, cross-world notebooks and automated combat/XP remain unfinished.

0.19 boundaries: 12 tray references (browser-local UUID preferences), 500 planning records/100 displayed graph nodes, 200 agenda/journal/follow-up records, 100 activity/recap sources, 40 routes per scene. Adventure prerequisites remain advisory; combat/XP automation, arbitrary pane plugins/free resizing and larger-world accessibility/load checks remain unfinished. Handouts support 30 published-source selections/10 explicitly approved images/30 MB embedded images, with exported source prose/images rather than full offline app navigation. Online player accounts/selective sharing remain later P5.

0.20 boundaries: current party/inventory state with session-filtered history; progression notes do not calculate XP/stats. At most 200 profiles, 500 items/records, 200 quest/media/location/cast originals and 200 follow-ups per projection. Quest diagram displays 100 originals plus 100 objective nodes, preserving 200 positions; dependencies are advisory (100/source). Items have at most 75 holders and 1,000,000 whole units. Legacy equipment converts 100 at a time. Journeys hold 200 normalized waypoints against the current original map; collections hold 200 ordered original/image references. Wrap-up snapshots at most 700 source UUID/revision pairs. Audio/remote embeds, historical party/stock replay, automated rules, general pane plugins and online grants remain unfinished. Stock changes require inventory actions after initialization; note-version restore preserves live quantities. Trashing a movement note does not reverse stock; use an opposite transfer/adjustment.

0.21 boundaries: per-world notebooks, 100 sections/eight levels/500 references per section, 100 results/page and 100 originals per bulk action; 30 metadata fields of text/number/checkbox types; 150 board cards/300 labeled connections with positions 0..5000; exports at most 500 unique originals and 30 MB images. Audits return the first 200 findings with totals and never auto-merge. Notebook snapshots are HTML reading copies, not a full offline app or PDF/DOCX/audio release. Unfile removes all references from the chosen notebook, preserving originals; board pins do not count as filing into inbox sections. Online accounts/grants, cross-world notebooks and broader accessibility/load checks remain later work.
