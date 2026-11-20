# 1.0.0 — Notes & Knowledge

## Tracker K-08 — reusable rich snippets

K-08 now passes the reusable-term/fragment acceptance. Notebooks → Reusable snippets
opens the world-scoped library. Create named snippets, assign/edit a collection,
search source prose/tags/names, preview the source and inspect direct usages.
Snippets are ordinary private article resources with rich documents and normal
autosave/history/Trash. The editor provides Snippets and Save selection controls.
Live insertion stores the source UUID; copied insertion expands nested snippets
into the draft rather than sharing those snippet nodes. Other explicit world links,
terms and media references in copied prose retain their ordinary reference semantics.

Live snippets appear as linked tokens while writing and expand in Read linked notes,
reader previews and HTML exports. Owner reads resolve saved source content. Reader
reads resolve only published source snapshots, omit private blocks and hide unavailable
source/link identities. Editing an unpublished source draft does not change reader
output. These are refreshed reads, not a simultaneous-editing or push-update service.
Deleting a source produces an unavailable marker; copying rejects missing/cyclic
nested sources. Rendering is bounded by depth, node and text budgets. No implicit
relationships are created. Collections remain world-scoped string labels.

Source and consumer documents remain distinct, with stable IDs and direct backlinks.
World export/import remaps snippet IDs. Private notebook HTML expands current sources;
published-source HTML expands only eligible published snippets. Plain-text draft
downloads retain snippet labels rather than expanding live bodies; rich archives and
HTML snapshots are the appropriate complete/source-preserving export paths.

Validation: full 620-test Django suite passes. Cases cover live updates, source draft
versus published snapshots, hidden nested content and marked links, cycles, deleted
sources, copy expansion/independence, owner-only access/backlinks, collection marker
validation, render limits, archive ID remapping and private/published notebook HTML.
Browser integration passes source creation/editing, full-text lookup, live and copied
insertion, reading-view expansion and selection-to-snippet capture, alongside the
existing task, board, recovery and account workflows. TypeScript, production build
and 102 searchable-dropdown checks pass. All test writes use isolated data.

Restart Aina and refresh once for the new document node/renderer. Saved snippets and
insertions then use the existing account/database; no additional service is required.

## Tracker-driven task and visual-board batch

N-03 now passes its stated acceptance: creating a private article from a task
copies the task's rich prose and tags and atomically updates its related-entry ID.
Repeat activation reuses the linked entry; task progress/priority and original
identity remain unchanged. Both the task and created article expose navigation to
the other original. Existing progress, priority and related-entry controls remain.

R-07 advances while staying partial. Boards support rectangles, ellipses, text
boxes, freehand strokes, shape movement and numeric size/position/text/color editing,
stroke removal and deletion. Undo/redo retains 40 prior board states; dragging is
grouped into one state. Unsubmitted board drafts can be recovered after reload;
recovered stale revisions reject saving rather than silently replacing the saved
board. Save visual board explicitly commits the draft to ordinary entry history.

JSON export retains source IDs and all board elements. Import validates the full
board on the server before replacing the draft and accepts only the same world;
whole-world archives remain the supported cross-world transport and remap original
source IDs. SVG export contains text/shapes/strokes/connections and complete board
metadata, with escaped labels. It uses caption excerpts visually and omits portraits;
the JSON/world archive retains full original references and captions. Limits are
150 cards, 300 connections, 100 shapes, 100 strokes and 1,000 points per stroke.
Advanced grouping, general whiteboard parity and standalone cross-world remapping
remain unfinished. Browser-local recovery is not the authoritative saved board.

Validation: all 607 Django backend tests pass, including legacy notebook behavior,
task creation/reuse, invalid shape/stroke rejection, cross-world import denial,
stale board saves and world-archive drawing/source-ID round trips. Pure SVG tests
verify escaping and recoverable metadata. Browser integration exercises actual
pointer drawing/shapes, undo/redo, recovery after reload, save, JSON round-trip,
SVG download and task/article navigation alongside existing account/note workflows.
TypeScript and 101 searchable-dropdown checks pass; production bundle builds.

Open Notebooks, create/select a notebook and choose Visual board. Use Board tool
to draw; select a shape to edit it. Save visual board commits changes. For tasks,
open the task's editor and choose Create linked article from task beside its
related-entry control. Restart Aina and refresh once to load the backend additions.

## Ongoing notes-workspace continuation

The same milestone now includes a cross-note Checklist desk in Notebooks. It
indexes task items in original entries, with text/title search, Open/Complete/All
filters and pagination. Toggling changes only the chosen original document node,
creates a normal revision and rejects stale versions rather than overwriting
another editor. Failed changes restore the displayed state and show the error.

Notebook results support page selection, clearing selection, bulk Trash with Undo,
a Trashed notes view with direct and bulk restore, bulk unfavorite, and removing
tags alongside adding them. Bulk mutations check every original revision first
and commit as one transaction; notebook references stay available for recovery.
Trashed notes lists include note/task entries; trashed general lore remains
recoverable through Settings. Undo is available for the last Trash operation in
the current mounted notebook workspace; Settings and Trashed notes survive reload.
WorldBuilder also remembers each world's last route so a refresh can reopen it.

Validation: 17 isolated backend tests pass for accounts, history, checklist
filtering/toggling, invalid/stale paths, world isolation, bulk rollback, Trash/restore,
tag removal and unfavorite. Browser checks pass cross-note completion, bulk Trash
and direct restore, alongside the existing notes/capture/link/history workflows.
Production build and TypeScript pass with 99 searchable dropdown locations.
The database schema and feature inventory parity claims remain unchanged.

12 November 2026. Named notes-workspace milestone; full World Anvil platform parity
remains unfinished. Subsequent minor releases group substantive related workflows;
patch releases fix bugs without new feature claims.

## Delivered together

- Interactive checklist blocks: create with Checklist, click to complete, Enter
  creates an unchecked item; completion progress updates while writing.
- Checklist state persists in original rich documents, revision snapshots and
  structured world exports. Markdown task lists and typed checklist HTML import
  preserve completion state. Reader views present disabled boxes.
- Reviewed name/alias mentions link to original IDs; longest names win, ambiguous
  matches require an explicit source, and unambiguous mentions can be linked in bulk.
  Existing formatting, links, code and URL/email text are protected.
- Find spans formatting boundaries within a paragraph; previous/next selects the
  actual match. Replace match/all is editable, undoable and uses ordinary autosave.
- Clipboard/text export retains checkbox markers and inline reference labels.
- Existing global capture, recent notes, notebook filters, draft recovery,
  structured organization and revision preview are included in the milestone.

## Validation

Production build, TypeScript and 98 searchable-dropdown checks pass. Eight isolated
Django account/document/history tests pass, including checklist Markdown/HTML
round trips, checked-state save/revision preservation, private-block filtering and
invalid checked-state rejection. Pure draft-transform tests verify longest matching,
ambiguous aliases, original text/marks, existing links and unchanged input documents.
Browser integration checks reviewed linking, checkbox persistence, cross-format
search/replacement, outline navigation, capture/recovery, recent notes, keyboard
save/submit, revision previews, filters and account isolation. Test data is isolated.

## Remaining boundaries

Mention suggestions currently match within text runs, so names split by formatting
need the existing manual reference picker. Find spans formatting within a block,
not across separate paragraphs. Automatic suggestions do not create relationships.
Mixed Markdown bullet/task lists remain ordinary lists unless the list contains
only task items. Reader boxes are display-only. Rich world archives preserve the
complete document; plain-text downloads retain prose and checkbox markers only.
Large-library performance and arbitrary cross-format mention matching remain partial.

The real database was backed up before the milestone. Restart Aina once and refresh
WorldBuilder to load the new checklist validator and renderer. Open an entry and
use Checklist in the formatting bar, Review suggested links below the editor, or
Find in note → Replace text above it. These edit the signed-in account's original
entry and use its existing autosave, recovery and revision system.


## Versioned custom templates and structured entry fields

12 November 2026. K-02 and K-07 meet their stated local acceptance. This is a
connected continuation of the existing milestone, with no cosmetic version bump.

Custom templates now support short text, long text, finite numbers, checkboxes,
choice lists, same-world entry references and repeatable text lists. Fields have
stable IDs, section labels, ordering, required flags and GM-only flags. Entries
keep a snapshot of the selected template schema: changing the source template
never silently changes existing entries. Required checks apply to publication;
incomplete drafts remain editable, and zero/false count as actual values.

Review template update previews additions, removals, renames, type/option/privacy
changes and ordering. Applying checks both entry and template revisions. Renames
retain values by ID. Removed or incompatible values remain in a recoverable section;
a later compatible field with the same ID can recover its old value. Original
prose, unknown owner fields and legacy aliases survive upgrades. Historical restore
restores the saved schema along with its values. Archive import remaps template and
reference IDs while retaining schema versions and values.

Readers see typed values and ordered sections. GM-only values, retired values,
unknown metadata and private source-template configuration are removed from reader
projections, including search/list responses. Reference labels resolve to the same
world's original record; unavailable reader targets do not expose their UUIDs.
Structured references participate in backlinks and notebook audits. HTML/notebook
exports render structured fields, while complete archives retain recoverable data.
Published entries keep their pinned schema until explicitly republished.

Final backend regression: all 636 Django tests passed (87 seconds), including
16 structured-field tests covering permissions, validation, conflict detection,
privacy, history, archives, HTML exports, backlinks and broken-reference audits.

The integrated headless browser workflow passed source-template editing, typed
entry editing, explicit upgrade review, rename preservation, incompatible-value
retention and original-prose preservation, alongside existing notes, snippets,
checklist, board, login and restart workflows. Production build, TypeScript and
103 searchable-select checks passed. Tests use isolated accounts/data; they do not
change the signed-in owner's content. The live SQLite file was backed up through
SQLite's backup API and checked for integrity and matching counts across 22 tables.

Open Creative tools > Custom templates to design fields. Select that template on
an article or character, then edit the generated fields alongside its prose. When
the source changes, use Review template update on the entry to preview/apply it.
Restart Aina once and refresh WorldBuilder for the new backend endpoints/build.

Limits: repeaters contain text, not nested objects. Layout means ordered sections
and fields, not a drag-and-drop page designer. Upgrades are explicit per entry,
not automatic bulk migrations. Browser workflow verification is local; it does not
claim remote hosting or simultaneous multi-user editing acceptance.


## Configurable daily Overview ? 13 November 2026

W-02 now meets its local acceptance: reordered sections remain in the saved order
through browser refresh, account switches and Aina-managed backend restart.
Eight built-in sections provide pinned original entries, recent notes, tasks,
recently edited entries, favorite notes, activity, world counts and quick actions.
Configure show/hide, full-width layout, entry limits (1?24), section order and up
to 24 ordered pins. Reordering uses keyboard-accessible buttons, without requiring
drag gestures. The save controls remain accessible at the bottom of the dialog.

The authoritative layout is stored in the world's SQLite JSON settings. Opening
the Overview does not write a default layout. Saves require the current layout
revision; whole-world JSON compare-and-swap also catches concurrent settings writes
under SQLite. Ordinary world settings saves preserve the independently managed
Overview. Failed saves leave the draft open. A stale layout must be reloaded
explicitly before replacing it. All sections cannot be hidden accidentally.

Pins refer to original records: source renames and edits update the Overview,
trashed records show an unavailable placeholder and can be restored or unpinned.
Complete world archives retain layout and remap pins to the restored originals,
including trashed records. Invalid imported layouts or foreign pins reject the
entire restore transaction. Unrelated world settings remain unchanged.

The task section supports filtering, completed-task inclusion and completion/
reopening of original tasks using their existing expected revision and history.
Saving disables task controls to avoid duplicate clicks. No task clone, remote
message, account content seeding or public reader dashboard is created.

Validation: all 649 isolated Django tests passed, including 13 Overview-specific
cases covering permissions, input validation, data preservation, stale/concurrent
writes, archive remapping/rollback and original task history. TypeScript, all 103
searchable-select locations and the production build passed. The integrated
headless browser passed keyboard reorder, section visibility/width/limits, pinning,
task completion/reopening, refresh persistence, simulated network failure retaining
edits, two actual browser tabs with a rejected stale save, explicit saved-layout
reload, 390/1024/1500 pixel bounds, and managed restart/account-switch persistence.
Existing notes, checklists, snippets, versioned fields, visual boards, account
isolation and startup/shutdown checks also passed. Final visual polish is checked
with the rebuilt browser bundle. These tests use temporary databases and accounts.

The live database has a verified pre-update SQLite backup under the existing
backups folder, with integrity check and matching counts for all 22 tables. No
existing owner entries or credentials were changed for testing.

Use Overview > Customize overview, adjust sections and pins, then Save overview.
Quick note uses the existing recoverable capture form. The task list changes the
original task; open its normal editor for other details or revision history.
Restart Aina once with npm start and refresh WorldBuilder to load the new endpoint
and production frontend.

Limits: eight built-in sections, not an arbitrary third-party widget designer.
Layouts are shared by the owner of that world across their local browsers. Saved
layout changes in another tab become visible on reload, not by push notification.
Task-list filters are temporary view controls. Online collaboration, public
hosting, broad load testing and remaining platform parity are still unfinished.


## Connected manuscript workspace ? 13 November 2026

This batch delivers the linked B-01/B-02/B-04/B-05/B-07 local acceptance workflows,
while advancing B-03/B-06 with explicit remaining boundaries. Existing sources are
edited in place; no creature data or pre-existing account content was seeded.

Delivered together:

- Ordered nested manuscript, chapter and scene outlines with research folders.
  Create inside a chosen parent; move originals between parents and reorder
  siblings using keyboard-accessible controls. Full ancestor validation rejects
  cycles and stale revision/membership maps reject conflicting structure changes.
- Write, Corkboard, Read and Review modes over the same original records. Mode
  changes and mutations flush the mounted editor first. Chapter reordering changes
  compilation order. Research folders and their descendants stay outside the book.
- Full-prose manuscript search plus a docked, full-world research search/preview.
  Opening source lore keeps the scene editor mounted. Save research links on the
  book without copying their lore; remove a link without deleting the source.
- Word goals, author/subtitle/cover choice, stage summaries and original scene/chapter
  counts. Word totals stay consistent across scene moves and exclude research.
  The Read view reports selected-edition word count separately from draft totals.
- Up to five named draft checkpoints, each retaining at most 200 original nodes,
  subject to the existing 1.5-million-character JSON record limit. Checkpoints keep
  prose, titles, metadata, unknown fields, IDs and parent/order structure. Snapshot
  metadata does not recursively copy prior checkpoints. Preview text, changed
  fields, parent changes, trashed sources and newer nodes before explicit restore.
- Restore checks the complete reviewed revision/membership map and commits in one
  transaction. It creates normal revisions, restores trashed originals, preserves
  current access and published snapshots, and keeps newer subtrees in the library
  outside the restored manuscript. No later writing is deleted. A failed restore
  retains the preview and leaves original data untouched. Named checkpoint removal
  removes that label/snapshot from current book data, not current writing/history.
- Review controls explicitly choose compilation nodes. A chapter must be included
  for its selected descendants to appear. Publish selected snapshots fixes the local
  reader edition without enabling hosting. Later prose/parent edits do not alter
  the published edition. Revoked/private sources and their IDs are removed from
  reader metadata. Checkpoints/research/GM notes never enter reader projections.
- Standalone HTML with contents, safe titles, internal selected-entry links,
  print styles and embedded local images; plain-text compilation is also available.
  A downloaded HTML book was opened via file:// with HTTP/HTTPS requests blocked;
  its contents link navigated to the selected scene without the application URL. Local image embedding is covered by backend tests. Complete
  world archives preserve all structured originals/checkpoints and remap their IDs;
  a restored checkpoint was applied successfully in the copied world.

Verification: the complete backend suite passes 676 tests, including 27 focused
manuscript tests. The combined npm test:worldbuilder command now runs both the
existing integrated regression and the manuscript browser workflow. It checks
unsaved writing alongside source research, full-body search, corkboard reordering,
new chapters, cross-chapter movement, metadata, selection, explicit publication,
local HTML download/open, edition privacy, failed-restore recovery, successful
structure restoration and 390/1024/1500 pixel layouts. Existing login/logout,
account isolation, managed restart, notes, checklists, boards, snippets, custom
fields, Overview persistence and two-tab conflict checks remain in that suite.
TypeScript, production build and all 105 searchable-select locations pass.
Tests run only against isolated temporary databases/accounts. The actual SQLite
file has a pre-update verified backup with integrity and matching counts in all
22 tables; no schema migration or production content rewrite is required.

Use Writing room > open/create a manuscript. Build its outline with Create inside,
Add chapter/scene/research folder and Move selected node. Research & references
opens beside the editor. Review controls compilation and local publication. Read
selects owner or published snapshots and downloads HTML/text. Draft checkpoints
creates a named version and offers Review checkpoint before restoration. Book
settings edits goal/author/subtitle/cover; Book details opens its original editor.
Restart Aina once with npm start and refresh WorldBuilder for the new backend and
production frontend.

Limits: daily writing trends and professional editorial change tracking remain
unfinished. Checkpoints have record/count limits and are not complete media backups;
use complete world backups for that. Newer nodes retained outside a restored draft
can be found in the library and moved back deliberately. Embedded image bytes are
capped at 32 MB. External image URLs still need their hosts, and non-book lore links
still lead to their world sources. HTML/text are implemented; EPUB/DOCX are not.
Reader publication is local owner preview/export only: no scheduling, online
accounts/groups, public hosting or access grants are introduced. The overall
World Anvil alternative is still in progress.


## General note conversion and reviewed cross-world transfer ? 13 November 2026

N-05 now has a verified bounded local workflow; K-14 advances to partial with
explicit reference/history limitations. Runtime remains managed by Aina npm start.
No new service, account, database table or external connection is required.

Notebooks > Create linked article previews the saved original and offers a title
and builtin/custom template. It creates an independent private article preserving
rich document structure/marks, summary, tags/aliases, private notes, source text and
unknown data. The original stays a note with a link. Repeating after an ambiguous
response returns the same article; invalid/stale creation leaves no orphan. A
trashed linked article must be restored rather than silently duplicated. Capture
replay metadata is not copied, and source-note/task provenance IDs are filtered
from reader data. Open linked article and Source note navigate the originals.

Copy & move selects another owned world and up to 100 source originals. The review
expands selected descendants and referenced same-world records/media, capped at
200 total records, 12 MB serialized content and 32 MB referenced media. It shows
selected/descendant/dependency roles, trashed dependencies, same-title collisions,
internal relationships, source boundary relationships and incoming references for
Move. No records change during preview. It uses a 15-minute signed review tied to
source/dependency/target revisions and settings. Changed/expired review must be
reviewed again before commit.

Known UUID values and supported link/media/custom-template/objective/hierarchy
patterns are remapped. Unknown ID-keyed or embedded source references and references
to other owned worlds are retained literally and explicitly reported; the user
must acknowledge them before commit and correct their intended behavior manually.
No automatic rewriting of unrelated source/target lore is performed. Dynamic
saved filters re-evaluate against the target world's existing contents.

Destination originals/relationships start private with no reader snapshot. Only
current general resource/relationship state is copied; source revision histories
remain at the source, while named manuscript checkpoint data remains in the copied
resource data. Target world settings are retained. Identical local images reuse
target assets without overwriting their existing name/credits; the preview shows
source and reused destination metadata. Missing/changed source bytes reject the
operation. New files are cleaned on rollback without deleting reused target files.

Copy retains source resources unchanged. Move records source revisions then places
only selected originals/descendants in source Trash; supporting dependencies stay
active. Outside links/relationships are not rewritten, and require review. Restore
moved source parents before their children using normal Trash recovery; copied
destination entries remain. This is recoverable movement, not permanent deletion.

A persistent receipt ledger guards each request key. Duplicate/retried commits
return the existing result even if the source moved into Trash. The last 20 receipt
ID maps are retained in detail; older keys remain compact tombstones and never
execute again. Receipt storage shares the world JSON size limit. Ordinary settings
updates cannot overwrite the ledger. Session preference storage retains selection,
mode/target and pending request key; after a lost response/reload the page reads the
backend receipt without automatically sending another transfer.

Validation: all 702 backend tests pass, including 26 conversion/transfer cases for
source preservation, custom templates/typed references, notebook sections, private
copies, subtree moves/recovery, actual relation mapping, stale reviews, outsider
access, literal/outside references, repeated/compacted receipts, media dedup and
rollback. The full browser command passes the existing integration, manuscript and
new transfer workflows. The new workflow deliberately lets conversion and Move
commit, then drops the response: retry/reload recovers without duplicate articles
or imports, including after source Trash. It also checks copied rich links/unknown
fields, source revisions, private target records, reference acknowledgement and
390/1024/1500 pixel layouts. TypeScript, all 107 searchable-select locations and
production build pass. Tests use isolated accounts/data. A consistent pre-update
SQLite backup passed integrity and matching counts for all 22 tables.

Use Notebooks for conversion; use Copy & move from the sidebar for transfer.
Restart Aina and refresh once for the new routes/bundle. This is local test evidence,
not an actual transfer of the user's existing content or online player sharing.
K-14 remains partial: arbitrary opaque application semantics, unconditional UUID
rewriting, full revision-history migration and larger transfers are not supported.
