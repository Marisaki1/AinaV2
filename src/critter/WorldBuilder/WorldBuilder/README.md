# WorldBuilder in Aina - local milestone 1.4.0

This is the daily notes workspace milestone, with checklists, reviewed knowledge links, find/replace, capture/recovery, notebook organization and revision review. Full World Anvil platform parity remains unfinished. See docs/validation-1.0.md and docs/implementation-status.md for tested scope and remaining work.

## New in 1.3: world search and private research

Press **Ctrl+K** or click **Search your world**. Search now spans entry titles, aliases, prose, GM notes and structured details; image names, credits and tags; and relationship labels, endpoints and connection notes. Words match together across fields; use double quotes for a phrase. Unicode normalization supports equivalent-width names. Results have matching excerpts, scope counts, 20-result pages and relevance/title/recent ordering. Recent means entry/connection modification time and image upload time. This is owner-only search; it is not a new public/player-search service or a large-world performance certification.

Choose a result to preview it alongside the result list without replacing the current editor. Arrow keys select results; Enter opens the selected original after saving pending edits. Escape returns to the editor. **Filters** holds entry type, tag, writing state, visibility and ordering controls. Advanced filters are collapsible, and current filters/panel state are remembered per world in this browser. Filters with no corresponding field (such as writing state on an image) exclude that result type.

**Save search** stores a named definition in the world database. **Manage saved searches** edits names/definitions or deletes them. The definitions survive restarts and world archives. Saves check their workspace revision; a conflicting form retains its name/filters and can reload definitions in place. Ordinary world-settings forms cannot replace a newer saved-search list. Up to 30 definitions are supported. Saving a search does not create or rewrite articles.

In an entry sidebar, **Research notes** creates private source-linked editorial notes. Select passage text in the writer/linked-reading pane and use the scissors button to prefill **Source excerpt**, or press **+** to start an unquoted note. The title, body and optional excerpt remain a recoverable local draft until saved or explicitly discarded. Creation saves pending source edits first, captures its current revision and uses a replay key so retrying a lost response does not create a duplicate.

Research notes are ordinary original note records with native backlinks and History, listed ten per page. **Edit note** opens their full editor; the sidebar can resolve/reopen them or send them to recoverable Trash. They remain private, and their captured source/identity cannot be stripped or reassigned by a normal edit. Reader projection/public links and notebook reader HTML exclude them, including legacy incorrectly published records. Copy the desired prose into another article when you intentionally want to publish it. Multi-author discussion threads are not implemented by this owner-only feature.

This release does not change campaign notes or relationships automatically. Restart Aina after updating backend code, then refresh WorldBuilder. No separate process is needed.

## New in 1.2: live source blocks and clickable dice

In an entry's notes toolbar, choose **Insert live source**, search for an original table, generator, map, timeline or saved relationship view, then insert it at the cursor. The reference preserves its source UUID and ordinary backlinks. Tables filter and page through ten rows at a time; **Generate** runs the saved original, including conditional linked steps, and **Insert result below** writes a separate text snapshot into your note. Individual dice cells are clickable.

Map blocks use the existing pan/zoom/popups; timeline and relationship blocks use their existing interactive views. Headers provide collapse, refresh, expand and open-original controls. Collapsed state is a per-browser preference. Blocks start loading near the viewport rather than initializing every distant map at once. Once opened, their components stay mounted while that document view remains open. The source stays independent: embedding or rolling it never changes its base data.

**Insert dice button** validates a label/formula before insertion, without rolling or logging activity. Click the inserted button to roll; the result shows kept/discarded dice, modifier and total. Supported formulas use the existing bounded engine, such as `2d6+3`, `4d6kh3`, `2d20kl1`, `d%` and `4dF`. Results stay in the current view unless explicitly inserted/copied. Duplicate in-flight submissions are disabled. No Discord commands/messages are sent by these controls.

**Read linked notes** keeps the same source blocks in place. Local **Reader preview** loads published source snapshots, omits private/unpublished references and disables rolls/generation. This is a local owner preview, not online player access. Other specialized guide/export surfaces may show the static fallback. HTML exports include an escaped table preview (up to 12 rows/8 columns), source links and readable dice labels; they do not embed an executable generator or depend on an editor session. Native backups retain/remap the live references.

Failed saves retain the note's local draft, native block IDs and unrelated fields. A failed source refresh has its own retry control and does not replace the note. Current acceptance tests cover interrupted-save recovery, reconnect, published/draft separation, map zoom/popups, timeline/graph controls and 390/1024/1500 layouts. The mobile header now keeps search/create controls separate. Refresh restoration observes late-loaded live content as well as the fixed scrolling viewport.

## New in 1.1: campaign briefing and table generation

Overview can link your current situation, open leads, reference notes and up to 12 characters/groups. Configure these through **Edit briefing**; previews load original notes. Entry sidebars create source-linked private follow-ups and open connected records. Relationship cards edit existing connections with conflict protection.

In **Creative tools ? Roll tables / Generators**, create columns and rows, filter the matrix (50 rows per page), reorder rows/columns, and choose weighted selection or inclusive dice ranges. Weights apply only to weighted selection; ranges must not overlap. A roll in an uncovered range fails explicitly. Optional seeds replay the same output for unchanged source data and step order.

**Linked generation steps** roll other tables in order, optionally when a selected cell equals an exact value. For booleans match `true` or `false`; numbers use their stored JSON form; entry links match the UUID. Cycles, unavailable sources, more than eight levels or 32 table rolls fail with no successful activity entry. Generation runs only for the authenticated owner. Published reader snapshots omit linked-step configuration and private entry references; they do not offer interactive generation.

**Import** previews CSV or WorldBuilder table JSON before replacement. CSV type selectors require validation before use. Errors identify the row/column. CSV exports contain cells, with true/false booleans and entry UUIDs; select the matching types when reimporting. CSV replaces weights with 1 and clears ranges/linked steps. **Table JSON** retains types, IDs, unknown table data, weights, ranges and steps; linked originals must already exist in the same world. Use **Copy & move** or a world archive to transfer dependencies to another world.

**Keep as article** saves the displayed rolls and linked results as an independent private article. Later source edits/rerolls do not change it. Imports and edits use ordinary autosave, revision conflicts and History. Restart Aina after updating backend code, then refresh; no separate service is required.

# Aina integration

## Campaign editing and relationship board

Notes open directly below the entry title. Optional template fields and the short description are under **Details & short description**; their values are retained. The selected read/write mode, details panel, last route and reading position are remembered locally per world/entry.

In **Relationships → All connections**, search for a person or group to explore its connections at readable size. Left-drag cards to arrange them, drag empty canvas to pan, and use the wheel or zoom buttons to zoom. **Fit** brings the visible cards into view; **Reset layout** resets that entry's arrangement. Additional neighbors are paginated, with full relationship notes below the canvas. Positions, zoom, filters, selected entry and expanded connection notes survive refresh in this browser and world. These view preferences do not change the relationships themselves.

Start the combined application with `npm start` in the Aina project root, then select **WorldBuilder**. Aina manages its backend; no separate routine launch is required. Log in with your existing local account or use **Create account** for a separate local account/world. **Log out** is in the top-right account menu. Account names and data paths are installation-specific; this guide does not assume your username or inspect your database.

The managed backend defaults to port 8777 and can be overridden with WORLDBUILDER_PORT. Data selection uses WORLDBUILDER_DATA or aina-data.json, falling back to data. Keep the selected existing data directory when transferring or restarting. Only WorldBuilder uses the compact Aina tool menu; other Aina tabs retain their usual navigation. The editor remains mounted when switching Aina tools.

The standalone launchers below remain available for independent use. Close a standalone instance before starting the integrated version.

# WorldBuilder

A private worldbuilding and campaign workspace that runs in your browser on this Windows PC. Code, database, images and backups live here. Normal use requires no cloud account or subscription.

**Current status audited 14 November 2026; runtime milestone 1.4.0.** This is a working local authoring application. The original 139-item World Anvil scope remains the long-term target; this release does **not** implement that entire platform. See [current coverage and remaining work](docs/implementation-status.md).

## Open it

Double-click **[Open WorldBuilder.cmd](<Open WorldBuilder.cmd>)** and use **http://127.0.0.1:8777/**. Keep its window open while working; Ctrl+C stops the server. Launching again opens the existing instance.

This PC already has the Python environment and compiled browser bundle. On another Windows installation, run **[Setup WorldBuilder.cmd](<Setup WorldBuilder.cmd>)** first. Setup requires Python 3.12+, Node.js 22+ and internet for dependency downloads. Everyday use needs only the installed Python environment and built browser files.

A new installation supports local account creation; an existing installation supports login to its existing accounts. Tests use isolated temporary data. No claim is made here about the contents of your real database.

## New in 0.22: mouse controls, Markdown and linked images

Affinity webs and the shared family/hierarchy/relationship diagrams support **mouse-wheel zoom at the pointer** and **middle-button drag to pan**. Right-click a source, relationship or background for relevant graph actions. Menus support keyboard navigation and Escape; Shift + right-click retains the browser menu. Left-drag arrangement and keyboard node movement remain available in affinity guides.

The editor stores rich documents, not Markdown source files. Use the **MD** toolbar button to insert Markdown with a preview, or paste Markdown into the writer to open that dialog. Headings, lists, tables, links, code and `![description](https://example.com/image.png)` convert into editable content at the cursor while retaining existing notes. Pending Markdown has failure/navigation/reload protection.

**Insert image** accepts a direct HTTP/HTTPS image URL as well as uploaded media. **Linked portrait URL** is available in the original editor, affinity inspector and character/location dossier. Linked portraits appear in guides, cards, party views, notebook boards and reference pins. Reader views use the published portrait, excluding later draft changes. External images require their original host; upload a copy for offline use. Notebook HTML snapshots retain external URLs and require network access for those images.

To move this project to another bot/machine, run **[Prepare WorldBuilder Transfer.cmd](<Prepare WorldBuilder Transfer.cmd>)**. It creates a verified ZIP in `transfers` with the built app, source, setup scripts and a complete database/uploaded-media backup. On the other Windows PC, extract it, run **Setup WorldBuilder.cmd**, then **Restore transferred data.cmd**, then **Open WorldBuilder.cmd**. Sign in with your existing local password. Python/Node environments are rebuilt there. The restore refuses existing data folders. The ZIP contains private campaign data; linked images retain their URLs. See [validation and transfer checks](docs/validation-0.22.md).

## New in 0.21: notebooks for daily campaign writing

Open **Notebooks** in the left navigation. Use **Quick note** to capture a private note, then write directly beside your note list. Create notebooks with ordered, nested sections; file existing sources into multiple sections without making duplicate lore. Open another source beside your draft to keep writing in place.

The connected batch adds an unfiled inbox, favorites, facts/open or resolved questions, reusable rich-text templates, six starter presets, typed text/number/checkbox metadata, body/tag/metadata search and bulk tags/favorites/filing. A visual board arranges original notes, portraits and lore with captions and labeled connections. Each board has an explicit save and conflict recovery. The full editor remains available for advanced source details, history and Trash.

Download a private owner HTML notebook with current notes/GM text/metadata, or a published-source HTML copy that excludes unpublished edits, GM content and private notebook labels. These are standalone reading snapshots; player accounts/selective online sharing remain later work. Notes, templates, sections, board positions and metadata persist in SQLite, with revisions and backup recovery. See [tests and limits](docs/validation-0.21.md).

## New in 0.20: party, equipment and campaign continuity

Open **Campaigns > your campaign > Party & campaign continuity**. The connected batch includes party portraits/roles/current situation, character progression journals, equipment ownership/storage/transfers, loot and consumption history, quest/objective/scene dependencies, consequences and relationship developments, drawn map journeys, location situations, session media collections, unified wrap-up and a continuity overview. Original character/location guides, affinity webs and the GM screen show those same sources.

Data lives in **SQLite at data/worldbuilder.sqlite3**, accessed through Django. Validated structured details use database JSON columns on versioned entries. Inventory actions save balances and movement history in one transaction, with stale-write/replay checks. Restoring item notes keeps current quantities; use stock actions to change them. Existing shared equipment can be converted while preserving its values and campaign history.

Party/equipment views show current state; the session selector filters recorded developments. Progression is readable campaign notes rather than automatic XP/stat calculations. Session media currently supports local images and original references, not audio/remote embeds. Online player accounts/sharing remain P5. See [validation, database evidence and limits](docs/validation-0.20.md).

## New in 0.19: adventures, session running and review

Open **Campaigns > your campaign > Adventure & session workflow**. Prepare adventures with ordered scene/encounter cards, a branching route/prerequisite graph, original cast/statblocks and map links. Build a session agenda of those originals plus notes, reminders and quests/tasks. **Run session** tracks the active item and its states on that session, with scene-aware private event capture.

Use **Activity journal**, **Follow-up inbox** and **Review & handoff** to find events, schedule loose ends, turn notes into linked tasks, edit a recap and deliberately carry unfinished references into another session. Previous session states and source notes remain intact. Branch prerequisites are GM guidance rather than automatic rules.

The **References** tray is available alongside editors. Pin original notes/lore/maps, inspect them, then fold the tray to return to your draft and cursor. Its 12 reference IDs are browser preferences scoped to the current world.

**Handouts** combines explicitly selected published sources and approved images. Preview and download standalone HTML before sharing the file; unpublished/private sources and GM fields/blocks are excluded. This does not enable online player accounts or hosting. See [validation and limits](docs/validation-0.19.md).

## New in 0.18: connected campaign preparation, play and review

Open your campaign, then **Open GM desk**, **Quest & story board** or **Campaign notebook**.

- Save named GM layouts with column choices, visible/reordered/collapsible panels and a preferred session. Pin original notes, characters, locations, threads, sessions and maps; reorder/widen cards and follow source edits. World references open in world context; campaign maps keep campaign scope.
- Move quests/tasks between board lanes by drag/drop or searchable progress controls. Thread guides edit ordered objectives, story arcs, outcomes and GM next actions while preserving original lore. Capture linked thread updates and pin them to the desk.
- Search full campaign note bodies, tags and fields; filter journals, milestones and reports by session/type. Quick capture writes private notes, journals, milestones, tasks or quests with session/thread/map/pin/lore links and optional pinning.

Session guides can open the desk at their original session. Desk/board/notebook navigation retains that session context. Reader snapshots exclude desk settings/private pins and GM next actions; objectives/outcomes follow normal publication. Existing history, Trash, backups and portable worlds retain the original records and saved references.

This is one related workflow batch. See [validation and remaining limits](docs/validation-0.18.md); online player accounts and selective hosting remain later work.

## New in 0.17: location guides and session visits

Open **Open location guide** in a settlement/building/geography editor, **Campaign > Characters & places > View location guide**, a session cast card or a map inspector.

Read original lore and fields beside unresolved threads and recent changes. **People & connections** distinguishes residents from other connected characters and displays the relationship web. **Visits & journal** connects session reports, journals and linked map pins. **Maps & places** opens focused map inspectors.

Write private location notes, journals and milestones, or link an existing record. Notes retain original location/session IDs and history. Campaign context filters records; reader previews exclude GM notes, hidden residents/pins, private records and draft images. Normal reading preserves documents and adds automatic source hyperlinks.

Pin-derived visits follow the current/published map. Explicitly link a location to a record to retain the association if its pin later changes. See [validation and limits](docs/validation-0.17.md).

## New in 0.16: session preparation and play guide

Open **Campaigns > your campaign > Sessions > Open session guide**, or **Open session guide** in a session editor. **Plan & outcomes**, **Session notes**, **Cast & lore** and **Maps & places** bring original campaign records together.

Edit preparation, recap, consequences, rewards and follow-up; reference or append the previous session's follow-up. Write private journals, notes, milestones, tasks and quests linked to the session, selected lore and available map location. Update task/quest progress, open character dossiers and explore focused map pins. Previous/next navigation stays in the campaign.

Saving plans keeps published reader snapshots separate. Conflicts retain your text and offer an explicit reload of the latest plan. Reader guides exclude private planning, records, portraits and pins. See [validation](docs/validation-0.16.md) for checks and boundaries.

## New in 0.15: character dossiers and progression

Open **Campaigns > your campaign > Characters & places > View character dossier**, or **Open character dossier** in a character editor. Explore the original portrait/lore, relationship web, progression, sessions and journal, places/maps and linked notes. Map cards open the associated pin in the existing guide.

Write a private character note, journal entry or milestone, or link an existing record. The dossier connects explicit associations and unambiguous mentions without copying lore. Campaign filters preserve scope; reader previews use published snapshots and exclude private records and GM planning. All dropdowns remain searchable.

The continuous campaign workflow was audited, including session preparation/outcomes, journals, quest progression and restoring a note with its latest unsaved text. GM-screen session numbering and cleared campaign membership were corrected. This is a visual notes guide; automatic character rules and separate player accounts remain unfinished. See [audit](docs/audit-0.15.md) and [validation](docs/validation-0.15.md).

## New in 0.14: map/location notes and automatic source links

Open **Campaigns > your campaign > Maps**. Choose a map, then click a pin or location button to read its lore, connected characters, sessions, journal records and progression notes beside the image. **Write location note** creates a private note, journal entry or milestone linked to that map/pin and optionally a session. Pins without source entries can still have notes. The regular note editor can change map/location associations.

The map editor's **Explore map guide** button opens the same guide. For notes created outside a campaign workspace, choose a campaign in the note form or keep them in the world notebook. Reader previews filter private locations, records and GM text on the server.

**Read linked notes** automatically hyperlinks matching entry titles and aliases to their sources, with source previews on click. Map, affinity and reader prose also receive automatic links. Your words and formatting remain intact. Ambiguous names, existing hyperlinks, code, URLs and self-matches are skipped. World settings can turn this off.

Automatic links are generated from current names/aliases when reading; they do not rewrite documents or add stored backlinks. Keep old names as aliases after a rename, or insert an explicit entry reference for a permanent association. Matching is within a text span and uses whole-word boundaries and names of at least two characters. See [validation](docs/validation-0.14.md).

## New in 0.13: visual affinity webs

Open **Campaigns > your campaign > Affinity web > New affinity web**, or **Relationships > Affinity web** for a world-wide guide. Campaign charts follow the party and linked characters, places, maps and quests.

Select a portrait or initial badge to read the entry and its linked campaign notes beside the web. Select a relationship line for its direction, strength and owner notes; edit it directly or connect the selected entry to another. Choose portraits from your local images and write private linked notes without leaving the chart.

Drag nodes to save their positions, drag the background to pan, and use zoom/fit or Arrange web. Arrow keys move a focused node; Enter inspects it. Search names/summaries, filter relationship types, or focus on one entry and its neighbours. Saved web entries retain their own notes, revision history and reader preview. Private endpoints/edges/notes are filtered by the server.

This is a campaign affinity guide inspired by the requested style. Further visual progression and map/location workflows stay ahead of numerical automation. Existing SVG/offline graph exports retain their standard diagram appearance; graph JSON and portable worlds retain affinity positions. See [validation](docs/validation-0.13.md).

## New in 0.12: campaign workspace

Open **Campaigns**, then choose your campaign. Its workspace now groups **Sessions**, **Day-to-day journal**, **Notes & tasks**, **Progression**, **Characters & places** and **Maps**. **Run session** opens the existing GM screen, dice, party, quests and shared equipment.

Create a session plan with the next session number, then record preparation, recap, consequences, rewards and next-session follow-up. Session status is independent of article writing status. Preparation, consequences and follow-up fields are GM-only; published reader previews can show the recap and rewards.

Add journal entries with a real date, a free-text in-world day/chapter and a related session. Record milestones and quest outcomes, keep campaign notes/tasks together, and link existing characters, NPCs, locations and maps without copying their lore. Campaign records start private and retain entry history, Trash recovery and archive support. The existing world notebook remains available.

Campaign essentials are the implementation priority. Automatic character XP/level/inventory calculations and configurable GM panes remain unfinished. Separate online player accounts and selective sharing remain later work. See [validation](docs/validation-0.12.md) and [project tracker](docs/project-tracker.md).

## New in 0.11

Calendars can include named **special days outside months**, before the first month, between months or after the last. Add annual or periodic blocks, leap-style exceptions/restorations and choose whether they participate in weekdays. Days outside the week still advance elapsed time and moon phases. Existing month numbers stay unchanged.

Events, era endpoints, recurring festivals and historical map captures can select these periods through searchable dropdowns. Yearly festivals skip years where their period is absent. Timelines and Chronicles use the actual dates; published reader views retain their saved definitions. Removing a period preserves recorded dates and shows warnings. Calendar files and world archives preserve the stable period IDs.

No schema migration is needed. Explicit year-numbering policies and individual recurrence exceptions are deferred while campaign essentials take priority. See [validation](docs/validation-0.11.md).

## New in 0.10

Every dropdown now opens with a **Type to filter** text field, including world, entry, map, calendar, media, relationship and import choices. Search ignores case and accents. Arrow keys and Enter select; Escape cancels the popup; Tab moves to the next control. The build checks enforce the shared searchable control for future dropdowns.

Open **Relationships > Edit & history** to edit connection endpoints, types, labels, directional strength, visibility and owner notes. Edits keep the same link ID. History can restore an earlier version; removed connections can be recovered. Saves require the current revision, protecting changes made in another tab. Reader graphs follow active shared links; notes/history remain owner-only.

This release adds one database migration. The launcher makes a complete backup before applying it and seeds baseline revisions for existing connections. [Validation](docs/validation-0.10.md) records migration, keyboard, browser, concurrency, recovery and real-data preservation checks.

## New in 0.9

Historical events can repeat daily, weekly, monthly or yearly on a custom calendar. Set an interval, optional final year and whether missing month days are skipped or moved to the month's last day. Preview dates in the event editor, choose a repeating-date window in History, or save that window in a timeline.

Calendar days now list events and festivals. Chronicle stops select each occurrence's historical map state; editing opens the original event series. Occurrences create no copied entries. Reader views retain published rules/windows and exclude private series. Previews are bounded and explicitly report truncation. See [validation](docs/validation-0.9.md).

Individual occurrence exceptions, nth-weekday and moon-triggered rules and alternate year numbering remain future work. Online player sharing remains scheduled for P5.

## New in 0.8

Open **History & calendars > Eras** to create independent periods with dates, lore and optional ends. Link events to an era on the same calendar. Timelines now display era bands, including ongoing eras.

Historical dates can be known to a day, month or year, with an optional circa flag. Timelines show the possible month/year interval; estimates add no assumed numeric margin. Chronicle maps use the earliest stated date for a coarse event and explain the uncertainty. Reader views retain published precision and exclude private era identities. See [validation](docs/validation-0.8.md).

Relative era-year numbering remains future work. Separate online player accounts and selective sharing remain scheduled for P5.

## New in 0.7

Calendars now support offset leap rules, century-style exceptions/restorations, continuous or resetting weekdays and up to eight celestial cycles. Select a day to inspect its phases, or convert a day ordinal back to a date. Standalone calendar JSON files import as new private entries; saved reader previews export their published definitions.

Map pins now offer twelve built-in symbols, local raster images and adjustable icon sizes, including dated scenes. [Validation](docs/validation-0.7.md) records the tests; the [continuation audit](docs/audit-0.7.md) records previous coverage and remaining gaps. Online player accounts and selective sharing remain scheduled for later work.

## New in 0.6

Use **Save family view** to keep the current root/couple filters, or open **Relationships ? Saved views** to create a named relationship view. Saved views support family, all connections and directional diplomacy, normalized tag/type filters and optional isolated entries. They follow source changes and use ordinary autosave, revisions, Trash and saved reader versions.

Saved graphs and content hierarchies now export **SVG**, **Graph JSON** and **Offline HTML**. HTML files include the diagram, full-name list, zoom and search, and open without the application or network assets. Choose the saved reader view to export its filtered graph. Copies are fixed artifacts and do not update or revoke automatically.

Earlier releases added family/bloodline queries, ordered hierarchies, dated Chronicle maps, nested collections, tagged media and linked writing previews.

## Working features

- Multiple worlds, 26 article template families, custom fields, aliases, tags and collections.
- Rich text, images, tables, stable entry references, backlinks, reusable terms and private GM sections.
- Autosave, local draft recovery, stale-tab protection, saved revisions, restoration and Trash.
- Local image maps with linked pins, labels, hotspots, routes, polygons, circles, marker groups, private overlays, saved default views and dated map versions.
- Custom calendars, leap days, moon display, dated event durations, named parallel timelines and map-linked Chronicle playback.
- Family/bloodline queries, named filtered relationship views, directional diplomacy, ordered hierarchies and offline graph exports; linked note whiteboards.
- Campaigns, parties, sessions, quests, shared equipment, GM references, dice log and a local handout window.
- Notes and tasks; weighted tables, quoted CSV import, generators and homebrew statblock calculations.
- Manuscripts, chapters, scenes, writing goals, scene editing and a reorderable corkboard.
- Validated media with credits and deduplication; search across bodies, aliases, tags and structured details.
- Previewed TouhouDND copy-import, portable world archives and complete database/media backups with verified restoration.

Reader visibility means a **local saved preview**, not internet publication or a separate player account. Later edits remain drafts and private GM text is excluded from that preview. Online self-hosting with separate player accounts and selective sharing of characters, relationships and other lore is confirmed later work, after the local scope is accounted for. See the [project tracker](docs/project-tracker.md).

## Data and recovery

Database: `data/worldbuilder.sqlite3`. Images: `data/media`. Complete backups: `data/backups`. Browser storage supplements the database for interrupted drafts. Copying source code alone does not back up your campaign.

Create and verify a complete backup in **World settings**, then download a copy to another disk. **[Restore WorldBuilder.cmd](<Restore WorldBuilder.cmd>)** restores a selected complete backup into a **new** `data-restored-...` folder and creates a launcher for it on port 8769. Existing destinations are refused. Password hashes and history survive; sign in again after restoration.

World exports contain `world.json`, images, checksums and `readable.html`, including private content. Restore one through Settings to create a separate world with new revision history. Complete backups preserve original identities and history.

Current archive limits: 512 MB compressed, 1 GB expanded and 19,999 payload files. Individual images: 25 MB and 40 million pixels. Larger installations require a filesystem backup while stopped; streaming jobs remain future work.

Campaign files are copied after preview and selection. Original bytes and locations are preserved. Relative links and unsupported markup may need manual repair; the report identifies that limitation. Imports do not synchronize changes back to source files.

## Notes and cross-world organization

In Notebooks, Create linked article previews and copies a saved note into one
independent private article while retaining the source. Copy & move in the sidebar
reviews transfers between your owned worlds, including dependencies/media and
references requiring manual attention. Move retains source originals in Trash.
Committed operations can be recovered after a lost response without duplicate
imports. Read [current validation](docs/validation-1.0.md) for supported remapping,
history behavior and limits; full world archives remain the larger backup path.

## Verification and scope

The current tracker separates implementation, verification, scope and dependencies. See [status audit](docs/status-audit.md) and [generated status](docs/implementation-status.md). Historical release test totals below are not current completion percentages.

Writing room now connects nested chapters/scenes and research folders, docked lore,
review/read/corkboard modes, named recoverable checkpoints and standalone HTML/text
compilation. Review selects and publishes a local snapshot edition; this does not
enable public hosting. See [current validation](docs/validation-1.0.md) for tested
workflows and checkpoint/export limits. npm run test:worldbuilder runs both browser
regressions; npm run test:worldbuilder:writing runs the isolated manuscript workflow.


Current continuation: configurable Overview, versioned custom fields, snippets and
interactive notes. Open Overview > Customize overview to choose/order sections and
pin original entries. Layouts persist in SQLite and survive restart/portable restore.
Current validation is recorded in [validation-1.0.md](docs/validation-1.0.md).


**583 backend tests** pass in 0.22, including linked-image/Markdown/policy tests. Current browser, transfer and recovery evidence is in [validation-0.22.md](docs/validation-0.22.md). Historical 0.6 validation follows: **148 backend tests** passed, along with TypeScript checking, targeted Python error/unused-code checks and a production build. Browser verification covers 31 general routes plus saved-view creation/filtering/reopening, source tag changes, reader previews, actual SVG/HTML/JSON downloads and desktop/narrow layouts. The downloaded HTML was opened as a local file and its zoom/search tested without HTTP resources. Complete backup restoration and portable world archives were checked with database integrity, counts and asset hashes. [Validation details](docs/validation-0.6.md).

These checks establish the tested workflows, not a guarantee of zero defects. Collaboration, public publishing, external integrations, proprietary system catalogues and advanced parity features remain on the [delivery plan](docs/delivery-plan.md).

- [Project tracker and later player-sharing requirements](docs/project-tracker.md)
- [Implementation status](docs/implementation-status.md) and [feature inventory](docs/feature-inventory.json)
- [Capability matrix](docs/feature-matrix.md), [sources](docs/sources.md) and [template catalogue](docs/template-catalogue.md)
- [Architecture](docs/architecture.md), [API](docs/api.md), [import plan](docs/import-plan.md), [validation](docs/validation.md)

WorldBuilder is independent of `Character Creator`; existing portraits can be attached through Media.

## World explorer (1.4.0)

Choose **World explorer** in the sidebar. Browse People, Places, Factions & groups, Campaign & stories or Reference. Cards reuse existing cover art and summaries; missing artwork has a neutral fallback. Search matches names, aliases and written passages; tags and nested collection breadcrumbs narrow the view. Card/list layout and filters are remembered per world. Raw transcripts and editorial research are hidden from this view until explicitly included, not deleted.

Open a card to read the original notes, existing structured fields and recorded connections. The outline jumps within the reading pane; connections and recently read records open in place. Maps reuse the interactive map guide. Private GM notes are explicitly separated. **Edit original** opens the existing writer; exploration never rewrites lore. Refresh restores the selected entry and reading position, including late-loading artwork. This is an authenticated owner view, not a public player site.

**New shelf** groups up to 120 original references without copying prose. Filter and check entries, arrange reading order, name it and save. Choose the shelf in the toolbar; its reader provides Previous/Next in shelf. You can rename, reorder or delete the shelf without deleting any originals. **Keep draft** retains an unfinished shelf on this browser; **Discard draft** clears it. Stale writes retain the selection and require an explicit settings reload. Shelves are stored with the world, retained by normal settings saves and remapped in whole-world archives; browser layout, reading positions and unfinished drafts are local preferences. Individual cross-world transfers do not copy world shelf settings.

Verify the new workflow with `npm run test:worldbuilder:explorer` in the Aina root. It uses a disposable database and headless Edge. Large-library performance and full assistive-technology certification remain unmeasured.

### Campaign floor records

Open **Campaigns** and select a campaign, then choose **Tower floors**. Floor notes are private on creation and use the normal entry editor. **Edit floor details** changes the number, status and linked records. **Floor relationships** opens the scoped graph. Use **Manage floor connections** to assign or remove existing relationships. Removing a floor assignment leaves the underlying relationship in place. **All tagged floors** shows the campaign-wide union of its floor assignments.
