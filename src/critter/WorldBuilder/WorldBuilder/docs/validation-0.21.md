# Validation - 0.21.0

Reviewed 6 November 2026 for the single-owner Windows browser installation. This release prioritizes practical note-taking as one connected batch. Real data and QA remain separate.

## Delivered note-taking workflow

Open **Notebooks**. Capture a private note, optionally file it into a notebook section, and write directly in the original rich editor. Create ordered nested sections; file existing originals into more than one section or notebook without duplicating lore. Remove references while retaining the original note. The unfiled inbox, favorites and facts/open-or-resolved questions support daily organization.

Reusable templates copy original rich documents and typed field definitions independently, retaining provenance. Six starter presets cover blank, session, NPC conversation, investigation, location discovery and encounter notes. Custom fields support text, numbers and checkboxes. Search matches original body text, tags and metadata labels/values with excerpts, category/campaign/tag filters and pagination. Bulk actions file originals, add tags and set favorites.

The embedded editor puts writing first. Metadata/full-editor actions expose detailed source fields, history and Trash. Preview another original beside the draft without unmounting the writer; closing the preview restores the cursor. Existing automatic source hyperlinks and explicit UUID references remain available in linked reading views.

Visual notebook boards arrange original-source cards and portraits with captions, colors, saved positions and labeled connections. Drag or keyboard-position cards, inspect the original, and explicitly save the board. Navigation/conflict guards retain drafts; explicitly reload the saved board to discard local changes.

Download a private owner HTML notebook with current drafts, GM notes and custom metadata, or a published-source HTML copy with published source prose and generic notebook/section labels. Published copies exclude private organization, metadata, GM blocks and unpublished edits. Repeated sources use one article anchor. Downloads embed same-world images and do not publish anything online. The source audit reports unavailable explicit references and ambiguous names; it never automatically merges or rewrites notes.

## Database and preservation

SQLite at **data/worldbuilder.sqlite3**, accessed through Django, remains the authoritative store. Notebook/template containers, section UUID references, rich documents, custom fields and board geometry use validated Resource data and existing Revision history. No dependencies, models, tables or migrations were added; schema 0003 remains current.

Capture creation and optional notebook filing commit in one transaction. A capture UUID and input fingerprint make identical retries return the same original and reject changed-input replays. Stale book revisions cannot create orphan captures. Bulk actions validate all source revisions before writes. Metadata-only changes preserve rich documents. New sources begin private; reader serialization removes notebook organization, template/default/capture information and custom metadata.

An actual QA server restart plus removal of app browser preferences/recovery copies preserved original note/template IDs, rich prose, nested sections, favorites, typed fields, question status and board sources/connections. A separate read-only SQLite inspection confirmed all **22 table counts and content hashes** unchanged across that restart, with integrity passing. See .preview/notebook-persistence-0.21.json and .preview/database-persistence-0.21.json. Browser storage is not the campaign database.

## Verification

- **573 backend tests pass**, including **40 notebook cases**: .preview/backend-tests-0.21.txt, .preview/notebook-tests-0.21.txt and backend/studio/test_notebooks.py. Coverage includes ownership/authentication, world/type/reference validation, section ordering/nesting/cycles/self-filing, source identity, removed references, rich templates and independent captures, replay/fingerprint checks, stale capture rollback, metadata types/favorites/search, questions, pagination, atomic bulk rollback, board validation, reference audit, privacy/published snapshots/private blocks, escaped exports/deduplicated anchors and portable nested-reference remapping.
- Rich capture, in-place writing, editor preservation across filters and source preview, cursor restoration and saved original prose: .preview/notebook-writing-0.21.json.
- Rich template creation/capture, typed metadata editing/search, favorites, original-source filing, bulk tags and nested section organization: .preview/notebook-organize-0.21.json.
- Original-source board cards, keyboard positioning/captions/labeled edges, untouched source prose, actual private/published downloads, unfiling without deletion and resolved questions: .preview/notebook-board-export-0.21.json. Downloaded HTML is retained in .preview/notebook-download-0.21.
- Injected capture conflicts/offline responses retain form text, Escape/navigation guards preserve drafts, and board conflicts preserve local geometry/captions until explicit reload: .preview/notebook-errors-0.21.json. Real backend conflict/rollback/replay behavior is separately covered by backend tests.
- Actual unavailable explicit source and ambiguous name appear in read-only audit without merging: .preview/notebook-audit-0.21.json.
- Writer/reference bounds, capture dropdown search focus/bounds, board internal scrolling and page overflow checks pass at **390, 1024 and 1440 pixels**: .preview/notebook-mobile-0.21.json, notebook-tablet-0.21.json and notebook-desktop-0.21.json, with inspected screenshots. The writing screenshot after restart shows the final compact editor.
- Existing **31-route smoke**, workbench/location/character/session/map/affinity reader privacy, latest unsaved text through Trash/restore, reference-tray cursor preservation, published handout safety and campaign continuity/source integration pass: .preview/smoke-0.21.json, workbench-reader-regression-0.21.json, location-reader-regression-0.21.json, dossier-reader-regression-0.21.json, session-guide-reader-regression-0.21.json, guide-reader-regression-0.21.json, affinity-reader-regression-0.21.json, audit-recovery-regression-0.21.json, planning-tray-regression-0.21.json, planning-handout-regression-0.21.json and continuity-integration-regression-0.21.json.
- Complete backup/download/checksums, clean database/media restore, SQLite integrity, protected existing destinations and portable-world roundtrip pass: .preview/recovery-0.21.json. Restored QA contains 371 entries, 657 entry revisions, two images, 50 connections and 62 connection revisions.
- TypeScript, Prettier, focused Ruff checks, migration check and production build pass. The AST guard verifies **97 searchable select code locations**. No raw application selects were introduced.

Corrections during verification: keep the embedded editor mounted while changing notebook scopes/search/reference previews; restore the cursor after preview; separate board drafts from the original editor navigation guard; use the freshest saved notebook revision and provide explicit board reload; preserve template rich documents during metadata-only changes; omit private notebook labels from published exports and use one anchor for repeated originals; put writing ahead of advanced source details. The affinity reader regression now waits for rendered nodes rather than a fixed delay; final reports have no browser errors or failed assets.

## Boundaries and tracking

Notebooks are per world. Limits: 100 sections, eight nesting levels, 500 references per section; 100 results/page and 100 originals/bulk action; 30 custom fields of three types; 150 board cards/300 connections with finite positions 0..5000; export 500 unique originals/30 MB images. Audit returns the first 200 findings with totals. Unfile removes selected references from all sections of the chosen notebook. Board pins do not count as filing for inbox membership.

Snapshots are standalone HTML reading copies, not full offline app navigation, PDF/DOCX compilation or audio support. Duplicate review is read-only. Cross-world account notebooks, simultaneous collaboration, broader accessibility/load testing and later online player accounts/selective grants remain unfinished. The local owner may still explicitly publish a source through the existing publishing workflow; notebook capture never publishes automatically.

All original 139 scope rows remain accounted for: **30 verified, 66 partial, 43 planned**. N-02 passes tag/metadata/template search acceptance. N-01 remains partial for cross-world account notebooks; N-04 and USER-01/USER-03 remain verified. USER-02 remains partial for the broader visual platform. This is a usable local note-taking release, not full World Anvil parity.

## Installed instance

Installed at **http://127.0.0.1:8767/**, bootstrap 0.21.0 outside QA. Verified pre-upgrade backup: `2026-11-06_17-17-39_61ef88.wbbackup.zip`. Previous bundle retained at `.preview/dist-previous-20261106-171739`. Main server session at completion: 65355; verify the actual process on continuation.

After installation, all 22 real database table counts/content hashes and media hashes match the pre-upgrade baseline; SQLite integrity passes. Real data remains two worlds, three entries, zero connections/images. Evidence: .preview/main-0.21-before.json, .preview/upgrade-0.21-result.json and .preview/bundle-install-0.21.json. QA fixtures remain isolated. The installed login page is checked separately without changing real world data.
