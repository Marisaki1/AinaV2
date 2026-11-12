# Aina integration

Start the combined application with `npm start` in the Aina project root, then select **WorldBuilder** in Aina. The backend is managed by Aina. Existing owner credentials and `data/` remain valid. Log in with username `owner` and the existing password, or use **Create account** for a separate local account and worlds. **Log out** is in the top-right account menu. In the integrated layout the Aina hamburger switches tools, and WorldBuilder occupies the entire window. The recovered transferred account also accepts its unique saved display name `a` as a login; its password has not changed. Aina preserves the loaded editor when changing tabs. See the Aina root README for combined startup and verification.

The standalone launchers below remain available for independent use. Close a standalone instance before starting the integrated version.

# WorldBuilder

A private worldbuilding and campaign workspace that runs in your browser on this Windows PC. Code, database, images and backups live here. Normal use requires no cloud account or subscription.

**Release 0.22.0 - 12 November 2026.** This is a working local authoring application. The original 139-item World Anvil scope remains the long-term target; this release does **not** implement that entire platform. See [current coverage and remaining work](docs/implementation-status.md).

## Open it

Double-click **[Open WorldBuilder.cmd](<Open WorldBuilder.cmd>)** and use **http://127.0.0.1:8767/**. Keep its window open while working; Ctrl+C stops the server. Launching again opens the existing instance.

This PC already has the Python environment and compiled browser bundle. On another Windows installation, run **[Setup WorldBuilder.cmd](<Setup WorldBuilder.cmd>)** first. Setup requires Python 3.12+, Node.js 22+ and internet for dependency downloads. Everyday use needs only the installed Python environment and built browser files.

First launch asks for your name, first world, and a local password of at least eight characters. Your real database contains no seeded campaigns. Browser tests use a separate `.preview/qa-data` installation.

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

## Verification and scope

**583 backend tests** pass in 0.22, including linked-image/Markdown/policy tests. Current browser, transfer and recovery evidence is in [validation-0.22.md](docs/validation-0.22.md). Historical 0.6 validation follows: **148 backend tests** passed, along with TypeScript checking, targeted Python error/unused-code checks and a production build. Browser verification covers 31 general routes plus saved-view creation/filtering/reopening, source tag changes, reader previews, actual SVG/HTML/JSON downloads and desktop/narrow layouts. The downloaded HTML was opened as a local file and its zoom/search tested without HTTP resources. Complete backup restoration and portable world archives were checked with database integrity, counts and asset hashes. [Validation details](docs/validation-0.6.md).

These checks establish the tested workflows, not a guarantee of zero defects. Collaboration, public publishing, external integrations, proprietary system catalogues and advanced parity features remain on the [delivery plan](docs/delivery-plan.md).

- [Project tracker and later player-sharing requirements](docs/project-tracker.md)
- [Implementation status](docs/implementation-status.md) and [feature inventory](docs/feature-inventory.json)
- [Capability matrix](docs/feature-matrix.md), [sources](docs/sources.md) and [template catalogue](docs/template-catalogue.md)
- [Architecture](docs/architecture.md), [API](docs/api.md), [import plan](docs/import-plan.md), [validation](docs/validation.md)

WorldBuilder is independent of `Character Creator`; existing portraits can be attached through Media.
