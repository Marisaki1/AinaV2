# Implementation status - 0.23.0

Reviewed 12 November 2026 for the current single-owner Windows installation. The 139 original scope rows are broader than individual controls. A partial row can contain useful tools while still missing some promised behavior.

**30 verified local acceptance rows; 66 partial rows; 43 planned rows.** Full World Anvil parity remains unfinished.

Release 0.23 validation is recorded in [validation-0.23.md](validation-0.23.md).
This release adds owner-scoped revision previews with saved text comparison and
changed-field summaries before restoring, alongside the note-taking continuation below.

Current evidence is in [validation-0.22.md](validation-0.22.md); previous evidence is in [validation-0.21.md](validation-0.21.md); previous evidence is in [validation-0.20.md](validation-0.20.md); previous evidence is in [validation-0.19.md](validation-0.19.md); previous evidence is in [validation-0.18.md](validation-0.18.md); previous evidence is in [validation-0.17.md](validation-0.17.md); previous evidence is in [validation-0.16.md](validation-0.16.md); previous evidence is in [validation-0.15.md](validation-0.15.md) and [audit-0.15.md](audit-0.15.md); previous evidence is in [validation-0.14.md](validation-0.14.md) and [validation-0.13.md](validation-0.13.md); previous evidence is in [validation-0.12.md](validation-0.12.md); previous evidence is in [validation-0.11.md](validation-0.11.md); previous evidence is in [validation-0.10.md](validation-0.10.md); previous evidence is in [validation-0.9.md](validation-0.9.md); earlier evidence is in [validation-0.8.md](validation-0.8.md); previous evidence is in [validation-0.7.md](validation-0.7.md); the previous continuation audit is in [audit-0.7.md](audit-0.7.md). Earlier releases remain in [validation-0.6.md](validation-0.6.md), [validation-0.5.md](validation-0.5.md), [validation-0.4.md](validation-0.4.md), [validation-0.3.md](validation-0.3.md), [validation-0.2.md](validation-0.2.md) and [validation.md](validation.md). The machine-readable [inventory](feature-inventory.json) is canonical. Read [project-tracker.md](project-tracker.md) for persistent user decisions, the current continuation point and the later online-sharing checklist.

The additional user requirement USER-01 is verified separately: every application dropdown uses text filtering on opening. All 97 select locations share one control, with a build/check guard for future code. This is tracked alongside the original 139 rows rather than changing their total.

## Current priority

Aina note-taking continuation: notebook and campaign quick-capture forms retain
unfinished drafts in local recovery storage scoped to their world and notebook
or campaign. Reopening the form offers Restore draft; successful creation clears
recovery. Notebook capture retains its idempotency key across recovery. Notebook
search/filter/sort choices survive navigation and reload within the browser tab,
with a Clear filters control. Ctrl/Cmd+S flushes the open entry editor immediately.
These extend existing partial workflow rows; they do not imply full feature parity.

Campaign essentials now take precedence: notes, day-to-day records, sessions/progression, characters, places and maps. The campaign workspace connects these records. Further calendar expansion is deferred. Visual guides and notes are the user's explicit preference. Campaign affinity webs now connect portraits, lore, relationship notes and daily records. Character/NPC dossiers now connect progression, sessions, journals, relationships and focused maps. Session guides now connect plans, outcomes, cast and maps, with private records during play and previous-session follow-up. Location guides now connect residents, map pins, session visits and place-specific notes. Delivered in one related batch: saved GM desk layouts/live reference pins, a quest/story board with objectives/outcomes, and full-body campaign notebook search/quick capture. Continue substantial related workflow batches with integrated validation. Continue practical visual campaign workflows before numerical automation.

USER-02 records this visual-first preference separately. Release 0.19 adds the ten-feature adventure/session/review/handout batch and cross-editor reference tray to the existing affinity webs, maps and character/location guides; broader visual campaign workflows remain partial.

Release 0.20 adds the fourteen-part party/equipment/consequence batch: original cast roles and progression, transactional stock/loot/transfers, objective dependencies, relationship events, journey/location notes, ordered session media, wrap-up and continuity overview. Source identity and server-side database persistence remain authoritative. C-02 now passes its local NPC-promotion acceptance; broader player/online work remains partial or planned.

Release 0.21 prioritizes immediate note-taking: nested notebooks and original-source filing, inbox/favorites, rich templates and starter prompts, typed metadata and search, bulk organization, in-place writing/source previews, visual note boards, knowledge questions and HTML notebook snapshots. N-02 passes metadata/tag/template acceptance; N-01 remains partial for cross-world account notebooks. The reference audit is read-only; no automatic merge is claimed. SQLite remains authoritative and the 22-table schema is unchanged.

Release 0.22 corrects natural mouse navigation/context menus, Markdown insertion/paste, external image/portrait URLs and whole-project portability. These enhance existing rows; original scope counts remain 30 verified, 66 partial, 43 planned. New user requirements USER-04/05/06 are tracked separately. Rich documents remain canonical; external linked files are not downloaded into backups. Full online account/sharing support remains P5.

## Remaining platform work

Online self-hosting with separate player accounts and selective sharing of lore, characters and relationships is a confirmed later P5 requirement. Local reader previews do not provide player access. Hosting, invitations, grants, revocation, protected media and relationship-edge filtering will be implemented after the local feature scope is accounted for.

Public websites/themes/custom domains, co-author groups, community/discussion/moderation, supporter integrations, external adapters, World Anvil archive/advanced-markup compatibility, dictionaries, professional rules catalogues and simultaneous editing also remain.

Local tools still need explicit year-zero policies, relative era-year numbering, individual recurrence exceptions and advanced repeat patterns, arbitrary map marker HTML, composed generators, full sheet design, cross-world notebooks, rich snippet collections, manuscript review/release/compilation and broader accessibility/load testing.

## Coverage by requirement

| ID | Status | Delivered behavior and remaining boundary |
| --- | --- | --- |
| W-01 | partial | World create/switch and owner/world isolation; multi-campaign records. Broad switch stress testing remains. |
| W-02 | partial | Working overview, real counts, activity and navigation; dashboard widget reordering is absent. |
| W-03 | verified | Nested collection tree, breadcrumbs, recursive browsing, keyboard move dialog, bulk/subtree moves, drag/drop and persisted ordering/view preferences. Final-graph validation prevents cycles; moved subtrees retain IDs and links. |
| W-04 | verified | Entry and media tags share normalization and saved filters. Filters support all/any tags, content types, templates, work states and text; membership updates after edits without moving originals. |
| W-05 | partial | Editable scope, themes, rules and inspiration; exports include world data. Expanded prompts remain. |
| W-06 | verified | Independent work state and immutable reader snapshots; draft edits do not alter the snapshot. |
| W-07 | planned | Not delivered in 0.1.0; retained in the full scope. |
| W-08 | partial | Stable UUID hash routes survive renames; custom slugs and redirects remain. |
| W-09 | partial | Local owner counts and activity feed; public feeds and advanced statistics remain. |
| K-01 | partial | 30 field sets include four campaign planning templates alongside the 26 existing families. Planning metadata preserves rich original notes. Character/location guides connect fields to records and maps; comprehensive family-specific layouts remain. |
| K-02 | partial | Custom text/long-text/number fields and required checks before reader publication; versioned schemas and advanced types remain. |
| K-03 | partial | Rich text, images, tables and stable reference/variable clipboard parsing work. Structured references take priority over generic pasted links; broader document/paste fidelity remains. |
| K-04 | verified | Searchable reference picker creates and inserts missing private articles while preserving the current paragraph. Mentions retain IDs through renames and HTML paste. |
| K-05 | planned | Not delivered in 0.1.0; retained in the full scope. |
| K-06 | verified | Backlinks update after link edits; owner hover cards and in-place previews refresh after target renames. Foreign/unavailable targets are excluded, and reader snapshot surfaces retain their visibility filtering. |
| K-07 | partial | Editable fields and an authoring sidebar; repeaters/layout configuration remain. |
| K-08 | partial | Reusable terms display current values, including zero, in authoring and published values in reader snapshots; inspectable through previews. Rich snippet collections remain. |
| K-09 | planned | Not delivered in 0.1.0; retained in the full scope. |
| K-10 | partial | Focus mode, Ctrl+K search and editor undo; broader commands/preferences remain. |
| K-11 | partial | Images/tables, local map/timeline views and saved graph reader entries are rendered. Portable offline graph HTML and SVG are available; general configurable layouts and external embed policies remain. |
| K-12 | planned | Not delivered in 0.1.0; retained in the full scope. |
| K-13 | partial | Usable article cards, editor and saved reader preview; category presentation themes remain. |
| K-14 | planned | Not delivered in 0.1.0; retained in the full scope. |
| K-15 | partial | Private GM notes; scrapbook and per-article discussion remain. |
| A-01 | verified | Authenticated data and media APIs, direct URL ownership checks, private initial records; no anonymous reader hosting. |
| A-02 | planned | Not delivered in 0.1.0; retained in the full scope. |
| A-03 | planned | Confirmed later P5 requirement: separate player accounts, per-world memberships, individual/group lore grants and immediate revocation. Not implemented by local reader previews. |
| A-04 | verified | GM notes/private blocks are excluded from reader HTML and JSON. Private reference labels are redacted. |
| A-05 | planned | Not delivered in 0.1.0; retained in the full scope. |
| A-06 | partial | Server filtering covers map states, timeline lanes, graph endpoints, saved roots and hierarchy parents. Removed/private connections and their notes/history are excluded from reader surfaces; reader connection detail applies the same projection. Independent player/group grants remain later P5. |
| A-07 | partial | Saved reader preview; distinct audience-group simulation remains. |
| A-08 | partial | Local owner password; per-resource passwords/access codes remain. |
| A-09 | partial | Unavailable resource placeholders and foreign-object 404s; shared reader access presentation remains. |
| A-10 | planned | Not delivered in 0.1.0; retained in the full scope. |
| A-11 | planned | Not delivered in 0.1.0; retained in the full scope. |
| M-01 | partial | Validated local images, zoom/pan and normalized markers; zoom/replacement acceptance needs broader geometry testing. |
| M-02 | partial | Pins, labels and owner-editable invisible reader hotspots have linked popups and focused map guides. Inspectors open original location guides, including same-route return without a stuck modal. Broader nested-navigation acceptance remains. |
| M-03 | verified | Line, polygon and circle drawing, numeric vertex/radius editing, color and normalized geometry validation. Browser reopen and portable archive tests preserve geometry and style. |
| M-04 | partial | Marker groups with visible/private controls, layer images, opacity and reordering. Private groups/layers are absent from reader map data. Separate player media grants remain future work. |
| M-05 | partial | Twelve fixed colorable SVG symbols and local raster marker images with 16-64 pixel sizes, retained in dated scenes, reader snapshots and archives. Arbitrary custom HTML remains unsupported. |
| M-06 | planned | Not delivered in 0.1.0; retained in the full scope. |
| M-07 | partial | Marker links can target maps or articles; richer nested-map navigation remains. |
| M-08 | verified | Popups, fit, zoom and saved normalized default center/relative zoom. Saved zoom survives a browser reload and restores after fitting/reopening the map. |
| M-09 | partial | Local map editor and read-only Chronicle/preview; standalone publication and embeds remain. |
| M-10 | partial | Normalized coordinates and independent historical image/geometry versions preserve prior states. A visible image-remapping preview remains unfinished. |
| T-01 | partial | Custom months/weekdays, weekday offsets/reset modes, offset leap rules and inverse signed-year conversion. Up to 24 stable-ID special periods sit before, between or after months; annual/periodic exception rules and optional weekday participation preserve regular month numbers. Alternate year-zero and relative era-year numbering remain. |
| T-02 | verified | Up to eight celestial cycles plus daily/weekly/monthly/yearly recurrence, intervals, final years, missing-day skip/clamp and fixed-duration ends. Special days advance moon phases and elapsed repeats; yearly special festivals skip inactive years. Monthly repeats require ordinary months. One-off exceptions, nth-weekday and moon-triggered recurrence remain outside local acceptance. |
| T-03 | verified | Standalone calendar JSON imports/exports preserve settings including stable special-period IDs, ordering and rules. Saved reader previews and exports use published definitions and exclude private metadata. Online sharing remains later P5. |
| T-04 | verified | Independent eras with optional ends, calendar-matched links/containment, day/month/year precision, circa labels and signed sorting. Special-period dates use actual ordinals; whole-year precision includes boundary specials. Removed/inactive periods retain recorded data with warnings. Relative era-year numbering and quantified confidence margins remain. |
| T-05 | verified | Named timelines reference shared event IDs, with parallel visual lanes and same-date alignment. An event edit updates both timeline placements; private lanes are excluded from saved reader embeds. |
| T-06 | partial | Zoomable time axis with era/uncertainty bands, list/search/tag/manual filters, calendar isolation and bounded repeating-date windows. Occurrences have independent selection keys while retaining source entry identity. Arbitrary range controls for one-time records and expanded era filters remain. |
| T-07 | partial | Event details show era links, precision and recorded-date/era warnings; saved reader timelines show filtered era bands and uncertainty intervals. Rich importance/type/era styling remains. |
| T-08 | verified | Chronicle event selection, playback and scrubbing focus the dated map location; selecting an associated map marker selects its matching event. Browser checks covered both directions and restoration of earlier images/overlays. |
| T-09 | verified | Dated independent map scenes retain images, geometry, groups, overlays and views. Chronicle scrubbing and recurring occurrences select the latest eligible scene, including special-period dates; base applies before first scene and reader snapshots exclude private/unavailable scenes. Capture/edit controls and map-state ordering are tested. |
| T-10 | partial | Calendar/track configuration, leap, special-period and precision arithmetic drive dated maps. Repeated Chronicle stops use validated occurrence dates/IDs. Reader windows, rules and calendar names use published snapshots. Unavailable dates retain warnings. Broader Chronicle configuration remains. |
| R-01 | verified | Typed family/social edges support diagrams and shared ancestry. Affinity charts add portrait/initial nodes, labelled directional lines, colour cues, inspection, editing and linked notes over the same connection IDs/history. Existing family/couple/adoption queries remain available. |
| R-02 | verified | Root ancestors/descendants and couple shared-descendant queries exclude unrelated branches. Adoption is explicit, depth is configurable, and private endpoints/edges are removed before reader traversal. Shared ancestry and couple filters passed backend and browser checks. |
| R-03 | verified | Separate directional diplomacy values, labels and private notes can be edited without changing the reverse edge. Immutable revisions, restore, recoverable removal and live reader visibility are verified. Player/group grants remain later P5. |
| R-04 | verified | Saved family/network/diplomacy definitions follow source filters and revisions. Campaign/world affinity webs add persistent draggable positions, pan/zoom, one-hop focus, name/type filters, portraits and side-by-side entry/relationship notes. Campaign membership follows party and linked lore; reader layouts use published definitions and filtered nodes/edges. |
| R-05 | verified | Independent ordered content hierarchies combine manual and normalized tag selection. Parent moves preserve descendant links without changing library parents; cycle-safe controls, sibling ordering, reader list/diagram and archive remapping are verified. Legacy trees retain collection-derived parent display until explicit parent links are saved. |
| R-06 | verified | Saved graphs offer interactive diagrams, affinity exploration and full-name lists. SVG, JSON and offline HTML exports use the authorized server projection; existing SVG/offline visual layout remains the standard diagram rather than the affinity portrait layout. Position data is retained in graph JSON and portable worlds. Protected online embeds remain later work. |
| R-07 | partial | Local draggable note/resource cards and connectors; freehand drawing, shape tools and portable board formats remain. |
| C-01 | partial | Campaign workspace groups sessions, daily journal, notes/tasks, progression, characters/places and maps. Records use explicit campaign membership with legacy parent fallback. Separate invited player accounts and selective lore grants remain later P5. |
| C-02 | verified | Campaign profiles distinguish PCs, NPCs, companions and inactive characters, retaining original UUIDs/lore. Promotion updates active party membership without duplicating resources. Profiles record current location/goals/conditions; character progression journals link abilities, milestones and personal developments to original characters/sessions. Local promotion acceptance passes; online account permissions remain P5. |
| C-03 | partial | Party dashboard/current situation, quest/objective/scene dependency graph, tracked equipment holdings, character/location storage transfers, loot distribution and stock adjustment history are delivered. Stock and movement records commit atomically with revision checks; replayed rewards/transfers reject. Existing shared equipment converts without losing its original values/history. Original GM screen displays the same party and balances. Player account/grant acceptance remains P5. |
| C-04 | partial | Adventures/scenes and session agendas now connect to a saved quest/objective/scene dependency graph with original-note inspection. Consequence notes retain affected characters/places and unresolved follow-ups. Journey routes and location discoveries/threats/control/business form linked campaign preparation. Dependencies are advisory; dedicated player primer remains. |
| C-05 | partial | Session-scoped progression, relationship events, consequences, journeys, ownership movements and media collections now feed a unified five-section wrap-up. It stores reviewed source UUID/revision pairs, preserves prior sessions and can explicitly complete the active agenda item/session. Editable recap and next-session handoff remain integrated. Invitations/calendar subscriptions remain. |
| C-06 | partial | Existing GM desks, campaign/session/character/location/map guides and affinity webs now connect to party/continuity views. Relationship developments can update an edge and write its source event atomically; the affinity inspector exposes that history. Cross-editor references and saved scene/quest layouts remain. Arbitrary pane types/free resizing and unified equipment/dice widgets remain. |
| C-07 | partial | Bounded logged dice with retained formula/result; multiplayer visibility policies remain. |
| C-08 | partial | Player handout selection, safe preview and standalone HTML export use published source snapshots and explicitly selected owner-approved images. Private/unpublished sources and GM fields/blocks are excluded; selection does not publish or open networking. Distinct online player sessions/reveal policy remain later P5. |
| C-09 | partial | Versioned session media collections retain ordered original portrait/map/illustration/handout references, captions and categories. Thumbnails and source links use the same assets; handout previews retain published-source filtering. Original images/maps remain available without copies. Audio playback, external embeds and remote-media failure policies remain unfinished. |
| C-10 | partial | New campaign records start private. Session GM fields are removed from reader responses using the published content type, including after a draft changes type. Session guide excludes private records, cast identities and pins. Player accounts/grants remain later P5. |
| S-01 | planned | Not delivered in 0.1.0; retained in the full scope. |
| S-02 | partial | Character dossiers connect original lore/history, private journals/milestones, session appearances, relationship notes and a visual progression timeline. Reader projections exclude private records and GM planning. Independent player-owned journals/posts remain later work. |
| S-03 | partial | Rich character images and campaign equipment; owned character scrapbook/gallery workflows remain. |
| S-04 | planned | Not delivered in 0.1.0; retained in the full scope. |
| S-05 | partial | Editable homebrew numeric fields and bounded formulas; visual sheet/layout designer remains. |
| S-06 | planned | Not delivered in 0.1.0; retained in the full scope. |
| S-07 | planned | Not delivered in 0.1.0; retained in the full scope. |
| S-08 | planned | Not delivered in 0.1.0; retained in the full scope. |
| N-01 | partial | Per-world owner notebooks now have ordered nested sections, an unfiled inbox, private quick capture and in-place rich writing with side-by-side original previews. Filing stores original UUID references, supports multiple sections/notebooks and never duplicates lore. Sections, boards and templates retain history/Trash/archive recovery. Cross-world account-owned notebooks remain unfinished; broader row stays partial. |
| N-02 | verified | Reusable rich-document templates and six starter presets, editable template defaults, favorites, typed text/number/checkbox fields, tag and metadata filtering, matching body/metadata excerpts and bulk tag/favorite actions pass local acceptance. Templates copy content independently while retaining source provenance; metadata edits preserve original rich prose. |
| N-03 | partial | Campaign tasks and quests have objective lists, outcomes, independent status, story arcs and linked update capture. Original editor fields and visual board remain consistent; stale saves preserve current data. Automatic task-to-new-article workflow and complete entry-sidebar management remain. |
| N-04 | verified | Persistent owner reference tray pins source UUIDs while the editor stays mounted. Folding restores draft focus/cursor; typing continues at the original position. Note content and saved desk references remain source-based. Tray IDs/selection are per-world browser preferences, not portable world data; 12 tray references maximum. |
| N-05 | planned | Not delivered in 0.1.0; retained in the full scope. |
| G-01 | partial | Text/number/checkbox/entry/dice table columns; advanced views and validation/presentation remain. |
| G-02 | partial | Weighted selection, dice columns and logging; full embedded dice controls remain. |
| G-03 | partial | Quoted CSV preview and confirmed replacement with saved history; broader CSV edge cases remain. |
| G-04 | partial | Weighted generators work; range-driven generator definitions remain. |
| G-05 | planned | Not delivered in 0.1.0; retained in the full scope. |
| G-06 | partial | A rolled result can be copied into a new article; broader composed-result coverage remains. |
| G-07 | planned | Not delivered in 0.1.0; retained in the full scope. |
| G-08 | partial | Reusable term collection field; bulk CSV variable import remains. |
| B-01 | partial | Manuscript/chapter/scene parents and scene list; research folders and nested manuscript tree remain. |
| B-02 | partial | Scene writing and corkboard; dedicated review/read modes remain. |
| B-03 | partial | Word goals, stage labels and aggregate word counts; writing history/statistical views remain. |
| B-04 | partial | Global search and stable world links in scene editor; dedicated docked manuscript reference pane remains. |
| B-05 | partial | Shared revision history, GM notes and draft recovery; named manuscript draft sets remain. |
| B-06 | partial | Individual entries have reader snapshots; scheduled/restricted chapter release remains. |
| B-07 | partial | Metadata, images and whole-world HTML/archive export; book-specific compilation/cover/export formats remain. |
| P-01 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-02 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-03 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-04 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-05 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-06 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-07 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-08 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-09 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-10 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-11 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-12 | planned | Not delivered in 0.1.0; retained in the full scope. |
| P-13 | planned | Not delivered in 0.1.0; retained in the full scope. |
| I-01 | partial | Portable world HTML/archive exports and self-contained graph HTML, SVG and JSON are available. Reader graph artifacts exclude private endpoints and GM/article bodies; specialized full-world module renderers remain. |
| I-02 | planned | Not delivered in 0.1.0; retained in the full scope. |
| I-03 | partial | Authenticated local API includes saved relationship projections and audience-filtered SVG/HTML/JSON graph exports alongside organization/maps/history. External tokens and third-party adapters remain. |
| I-04 | planned | Not delivered in 0.1.0; retained in the full scope. |
| I-05 | planned | Not delivered in 0.1.0; retained in the full scope. |
| I-06 | planned | Not delivered in 0.1.0; retained in the full scope. |
| I-07 | partial | CSV tables and whole-world calendar data; standalone calendar definitions remain. |
| I-08 | planned | Not delivered in 0.1.0; retained in the full scope. |
| O-01 | verified | Native Windows Waitress launcher, repeated open handling and restart persistence have been exercised. |
| O-02 | partial | SQLite/local media and no remote runtime assets; physical network-disconnection testing and packaged portability remain. |
| O-03 | verified | Consistent SQLite snapshot, checksums and restoration into a new directory; database counts and all asset hashes verified. |
| O-04 | verified | Preview/hash-checked copy-import; original bytes preserved in synthetic tests and real campaign UI import. |
| O-05 | verified | Revision-checked atomic resource writes, batch rollback, subtree cycles, restore and Trash. Parent/adoptive cycle checks run inside SQLite IMMEDIATE transactions without the old 200-generation cap. Concurrent opposite-parent and stale hierarchy edits were exercised. |
| O-06 | planned | Not delivered in 0.1.0; retained in the full scope. |
| E-01 | partial | Search covers entry bodies/aliases/tags/structured data; global image search covers names, credits and tags. Dedicated graph-edge and future discussion discovery remain. |
| E-02 | partial | Shared UUID resource registry, graph references and linked editor mentions; all secondary view labels need complete audit. |
| E-03 | partial | Shared forward/inverse fictional-date arithmetic supports signed years, year zero, leap days and timeline positions. Unrelated calendars are kept separate; uncertainty, era records and explicit cross-calendar epochs remain. |
| E-04 | verified | World-level media is reused by maps, documents and handouts; identical uploads deduplicate by hash. |
| E-05 | partial | Autosave/local drafts/conflict recovery work; interruption coverage remains narrower than full durability certification. |
| E-06 | partial | Responsive tree/list layouts, keyboard move/reorder controls, modal focus and entry previews; formal accessibility/assistive-tech testing remains. |
| E-07 | planned | Not delivered in 0.1.0; retained in the full scope. |
| E-08 | verified | No billing account or subscription gates in the delivered local application. |
| X-01 | planned | Not delivered in 0.1.0; retained in the full scope. |
| X-02 | planned | Not delivered in 0.1.0; retained in the full scope. |
| X-03 | planned | Not delivered in 0.1.0; retained in the full scope. |
| X-04 | planned | Not delivered in 0.1.0; retained in the full scope. |
