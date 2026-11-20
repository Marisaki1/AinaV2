# WorldBuilder project tracker

Updated 14 November 2026. The canonical inventory is [feature-inventory.json](feature-inventory.json); [implementation-status.md](implementation-status.md) is generated from it. [status-audit.md](status-audit.md) explains source coverage, corrections, current tests and limits. Earlier narrative is retained in [project-tracker-history.md](project-tracker-history.md), not used as current deployment instructions.

## Confirmed user decisions

- Build a World Anvil-like application integrated into Aina, with substantial connected implementation batches and evidence from actual workflows.
- Current installation: `src/critter/WorldBuilder/WorldBuilder` within Aina. `npm start` in the Aina root manages the backend; no separate routine service is needed. The old TouhouDND path is historical.
- Preserve source UUIDs, unknown data, rich prose, revision/Trash recovery, world/account isolation and explicit published snapshots. SQLite is authoritative; browser storage is limited to preferences and recoverable unsaved work.
- Current use is local on this Windows PC. Existing local accounts remain usable. Do not seed test fixtures into real worlds or rely on old process IDs, ports, usernames or database counts.
- Prioritize useful notes, campaign records, characters/locations/maps and visual relationships over calendar/numeric expansion. Keep improvements integrated and test their failure/recovery behavior.
- Every application dropdown uses searchable selection. Current source guard: 120 locations; representative keyboard/layout tests do not establish every-device accessibility.
- Diagram interaction uses mouse-wheel pointer zoom, middle-drag pan and relevant context menus with keyboard alternatives. Keep normal input behavior outside those diagrams.
- Whole-project transfer/backup tooling exists. External image URLs still depend on their hosts; local media bytes and supported portable data must be preserved explicitly.
- Later online self-hosting must support player accounts and selective sharing. Local reader preview/export is not online player access. Do not enable networking as part of documentation/status repair.
- External audiences, human services and proprietary content availability are separate dependencies, not ordinary missing local code. Named compatibility adapters require actual permitted fixtures/live service tests.

## Current audit and continuation

All 139 original IDs are retained. Implementation, verification coverage, scope, confidence, priority and dependencies are separate fields. Counts are not a completion percentage. Historical `verified` values and acceptance statements are retained as provenance, not current universal certification.

Current scope split: 97 local rows, 29 mixed/later-online rows, 10 external compatibility/integration rows, and 3 external-service/content boundaries. A row in a later scope may already contain a working owner-only subset; read its delivery notes.

Delivery: 45 implemented, 55 partial, 36 planned, 3 external boundaries. Verification: 18 bounded local workflows marked passed_local, 82 with subset coverage, 36 without a feature-specific verified workflow, and 3 external dependencies. These are classifications, not regression claims or deletion of delivered features.

Source-based corrections: A-08 has no resource-code implementation; T-02/T-03/T-04 and B-07 remain partial for their broader promises. I-07 acknowledges implemented calendar JSON interchange. O-02 acknowledges transfer packaging and retains the unverified physical-disconnection gate. General note conversion N-05 is now implemented separately from task conversion N-03. Cross-world transfer K-14 has a reviewed bounded implementation and remains partial for opaque references and full history migration.

## Current implementation continuation

Notebooks now exposes Create linked article for general notes with a saved-source preview, template choice and independent private result. Copy & move is an integrated navigation item for selecting another owned world, reviewing dependencies and confirming private graph copies or recoverable source moves. Receipts recover committed operations after lost responses; selection/options are browser-session draft preferences. The target data is stored in SQLite, not browser storage.

The combined browser command now includes check-worldbuilder-transfer.js. Source originals, destination settings/media and account boundaries must remain protected. Unknown literal references are preserved/reported rather than guessed. Parent-first source Trash restoration is a documented manual step. Complete world archives remain the larger-batch/history backup path.

## Campaign usability batch ? 13 November 2026

Overview now has a configurable briefing using original notes for the current situation, open leads, day/reference material and cast. Original documents supply previews; no campaign facts are generated. Owner-only layout saves retain existing widgets/pins, reject stale changes and remap briefing references through portable archives. Entry sidebars can create private follow-up tasks with native source links, complete the original tasks, and open connected entries or their board. Relationship cards edit the existing connection in place; a concurrent-write rejection retains the draft.

Verified locally: 707 Django tests; TypeScript and 108-dropdown guard; rebuilt production bundle; managed integration regression; isolated headless browser workflows including follow-ups, saved note previews, inline relationship edits, stale-draft protection, refresh persistence and 390/1024/1500 layouts. These tests use temporary worlds and do not establish online player access. The existing Marisaki/TouhouDND briefing was configured from existing notes after a private SQLite backup; note bodies and relationships were not rewritten. Restart Aina once to load the backend changes.

## Table and generator batch ? 1.1.0

Typed table validation, reviewed CSV type mapping, full table JSON interchange, cell-only CSV export, row/column ordering, filtered 50-row pages, inclusive range rolls, seed replay, ordered conditional generation and frozen generated articles are delivered. Cycle/depth/fan-out limits, world/owner boundaries, stale import writes, archive remapping and private reader projection are covered by direct fixtures. That batch retained G-01/G-02/G-03 as partial and G-07 as planned; the 1.2 continuation below delivers the missing G-02/G-07 local block workflow. No campaign records were generated or rewritten by this update.

Current validation: 730 Django tests pass (23 new table fixtures), production TypeScript/dropdown checks pass, and the table workflow passes in isolated headless Edge at 390/1024/1500 widths. Current evidence and artifact paths are recorded in status-audit-results.json. A version increase records delivery; it does not claim platform completion.

## Native interactive blocks ? 1.2.0

The main entry writer and linked-reading mode now support native live blocks referencing existing tables, generators, maps, timelines and saved relationship views. They have refresh/retry, collapse, expansion and original navigation. Table blocks provide filtering, ten-row pages, dice cells, composed generation and explicit output insertion. Dice atoms validate without rolling before insertion and display actual kept/discarded dice and totals on click. The mobile header separates search/create/account controls.

Source UUIDs/backlinks remain native. Offscreen blocks defer loading; active blocks remain mounted in the document view. Published local previews load source snapshots, hide private/unavailable references and disable execution. Static exports get escaped bounded fallbacks. Source failure does not overwrite notes, and interrupted-save browser checks recover native block IDs, prose and unknown record fields after refresh. Reading-position restoration also observes late-growing page content, keeping deferred source blocks from clamping a saved scroll position during reload. No campaign content or Discord state was modified by this release.

Validation: 749 Django tests pass, including 19 live-block fixtures; managed editing/account/restart regression, table/generator regression and live-block browser acceptance pass. The browser run covers actual map zoom/popups, timeline/relationship controls, draft/source failure recovery, published/draft separation and non-overlapping 390/1024/1500 layouts. G-07 and G-02 are now implemented for this bounded local scope; general page layouts, every specialized guide's interactive rendering and online player access remain unfinished.

## Search and private research ? 1.3.0 (14 November 2026)

Ctrl+K/search now covers current entries, images and relationship records with source excerpts, all-word/quoted-phrase matching, Unicode normalization, scope/type counts, filters, sorting and pagination. Result preview stays alongside the list while the original editor remains mounted. Keyboard selection/opening, collapsed advanced filters and per-world last-query preferences are connected. Named definitions use owner-only revision-checked world storage, portable archives and stale settings protection.

Entry research notes capture selected passages or manually entered excerpts into separate private original notes. Source revision and capture identity remain protected; native backlinks/history, resolve/reopen, full-editor changes and recoverable Trash are connected. Local drafts survive refresh, and an explicit retry after a lost committed response returns the existing capture. Publication, reader links/JSON and reader notebook HTML exclude editorial research records. This does not implement multi-author discussion or player access.

Validation: 777 Django tests pass (28 search/research fixtures), TypeScript/searchable-dropdown checks and the production build pass. Current headless acceptance covers real body/GM/image/connection discovery, type/tag/state/visibility/sort controls, saved-search conflicts with retained form/reload, editor preservation, private clipping, lost-response replay/recovered draft, resolve/reopen/edit/trash, source-data preservation and responsive layouts. General managed editing/account/restart and campaign/relationship-board regressions also pass. Performance at very large library sizes remains unmeasured. No real campaign data was changed by these tests.

## World explorer and reading shelves ? 1.4.0 (14 November 2026)

The sidebar now opens an owner World explorer with artwork-backed cards and list views, subject counts, name/alias/passage search, tag filtering, nested collection navigation, sorting and 24-card pages. Internal transcripts/research remain available through an explicit filter. Original notes open in a contained reading pane with headings, built-in/custom fields, recorded connections, native links, GM notes, interactive maps and direct writer navigation. No generated campaign lore is added.

Ordered shelves store references to up to 120 originals rather than copies. Creation, rename, reading order, sequential navigation and deletion are connected. Browser drafts can be retained/discarded; CAS rejects stale writes while retaining selections. Normal world settings cannot erase shelves; full archives validate and remap source references, including recoverable Trash. Filters, layout, selected reading entry, GM expansion and late-loading reading position restore per world in the same browser. Missing artwork and failed source loads retain usable fallbacks/retry.

Validation is recorded in status-audit-results.json: isolated backend and headless browser workflows cover normal use, nested discovery, original preservation, shelf conflicts/recovery/deletion, account isolation and refresh position at 390/1024/1500 widths. TypeScript checks include 118 searchable dropdown locations. Broad presentation themes, public/player sites, large-library performance and formal assistive-technology certification remain unfinished. No production campaign content or account was changed.

## Campaign floors (19 November 2026)

Campaign floor notes support numbering, status, linked records and original-note editing. The Relationships page can open the campaign-wide union or a single floor. Existing connections are assigned explicitly, and removing an assignment keeps the original connection. The browser check covers creation, assignment, refresh, floor isolation and removal.

## Delivery order

1. Local knowledge/campaign foundations: notes/conversion, map/navigation, visual organization, search, recovery and accessibility. Define finite source-preservation/access cases for each batch.
2. Remaining local tools and statistics: bounded generators, sheet design, advanced writing/history and calendar policies when required by actual campaign work.
3. Online foundations: deployment/HTTPS/protected media, co-author roles and player membership/grants/revocation. These precede public/social features.
4. Named external adapters and licensed catalogue work: test each declared source/version independently. Do not infer an adapter from generic APIs.

## Online acceptance gate

Before player sharing is described as working, verify owner, co-author, differently granted readers, revoked users and outsiders in separate sessions. Cover lore, graph edges/endpoints, media/downloads, search counts/snippets and exports. Add invitations, per-world membership, explicit group/individual grants, immediate revocation and a real audience preview. Verify migration, deployment and restore with permissions intact. No online gate is complete merely because local publication works.

## Maintaining the tracker

Edit feature-inventory.json and its concrete acceptance/evidence fields. Run `npm run docs:worldbuilder:generate`, `npm run test:worldbuilder:status`, and `npm run docs:worldbuilder:check`. Update status-audit-results.json only from actual test outcomes and rerun the relevant runtime suites when implementation changes. Do not promote broad rows because one narrow assertion passed or because a menu exists.
