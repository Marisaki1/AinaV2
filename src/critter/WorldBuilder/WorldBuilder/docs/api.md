# Local API, version 0.6

Base: `http://127.0.0.1:8767/api`. This documents the implementation, not compatibility with World Anvil's API. All data endpoints require the local owner session. Bootstrap, initial setup and login are the only unauthenticated operations.

GET `/bootstrap` sets a CSRF cookie and reports its name in `csrf_cookie`. Send that value as `X-CSRFToken` on mutations and retain the session cookie. Cookie names are specific to the data directory so original, QA and restored installations can coexist on different ports. Setup/login rotate authentication state.

| Path | Methods | Behavior |
| --- | --- | --- |
| `/bootstrap` | GET | Version, installation identity, auth/setup state, templates; owned worlds when authenticated |
| `/setup` | POST | First owner/world: `name`, `world_name`, `password`; refused after setup |
| `/login`, `/logout` | POST | Owner password authentication / logout |
| `/worlds` | GET, POST | List owned worlds / create with `name`, optional `tagline` |
| `/worlds/{id}` | GET, PATCH | Settings, counts and recent activity |
| `/worlds/{id}/resources` | GET, POST | List/search / create typed entry |
| `/resources/{id}` | GET, PATCH, DELETE | Read / revision-checked edit / soft-delete |
| `/resources/{id}/revisions` | GET | Last 100 saved snapshots |
| `/resources/{id}/restore` | POST | Restore revision `number` or Trash state as a new revision |
| `/resources/{id}/publish` | POST | Save reader snapshot, still local |
| `/resources/{id}/roll` | POST | Weighted result, dice column evaluation and activity log |
| `/worlds/{id}/reorder` | POST | Atomic `entries: [{id, position, revision}]` reorder |
| `/worlds/{id}/connections` | GET, POST, DELETE | Relationships; ancestry cycles rejected; DELETE by `id` |
| `/worlds/{id}/assets` | GET, POST | List / multipart `file`, optional `credit` |
| `/worlds/{id}/export` | GET | Private owner world archive and portable HTML |
| `/import/archive` | POST | Multipart `file`; restore WorldBuilder archive as a new world |
| `/import/scan` | POST | Preview selected allowed campaign `folders` |
| `/worlds/{id}/import` | POST | Copy up to 200 scanned `files`, checking preview hashes |
| `/backups` | GET, POST | List / create complete installation backup |
| `/backups/{filename}` | GET | Download backup |
| `/backups/{filename}/verify` | POST | Verify every checksum |
| `/tools/dice` | POST | `world_id`, bounded `formula`; persist roll |
| `/tools/csv` | POST | Preview `text`, without changing an entry |
| `/tools/calendar` | POST | Validate `calendar`, signed `year`, `month`, `day`; compute ordinal/grid |

Media uses authenticated `GET /media/{asset-id}`, without exposing disk paths.

List options: `q`, `kind`, `trash=1`, `audience=reader`. Detail GET also accepts `audience=reader`. Reader responses use published snapshots and strip private GM text, but remain owner-authenticated. Player/group authorization is future work.

PATCH, DELETE, restore and publish require `expected_revision`. Stale writes return 409 with `code: revision_conflict`; the browser retains its draft and offers reload or recovery into a new entry. Other statuses: validation 400, authentication 401, policy/CSRF 403, unavailable/foreign objects 404, unsupported methods 405, size limits 413.

Entry fields: `title`, `summary`, immutable `kind`, `template`, structured `document`, original `source`, `private_notes`, `tags`, `aliases`, module `data`, `parent`, `position`, `visibility` (`private`/`public`), and `status` (`draft`/`wip`/`done`). Here `public` means eligible for a local reader snapshot; no internet endpoint is enabled.

## Organization and media metadata in 0.2

- `GET /worlds/{world}/collections/{collection}` returns the collection, matching `resources`, matching `assets`, and breadcrumbs. `recursive=1` includes descendants of physical folders. `audience=reader` uses published snapshots and excludes media, which does not yet have independent reader grants.
- `POST /worlds/{world}/organize` accepts `entries: [{id, revision, parent, position}]` (up to 500). The whole batch rolls back if a revision, parent or final hierarchy is invalid. Omit `parent` to retain it; use null to unfile. Destinations must be active physical folder collections in the same world. Moving a folder retains its descendants' IDs and references.
- Folder `data.collection_type` is `folder` or `smart`. Smart `data.rules` supports `tags`, `tag_mode` (`all`/`any`), `kinds` (including `media`), `templates`, `statuses`, and `query`. Empty lists do not restrict that dimension. Tags are NFKC/casefold-normalized on the server. Saved filters cannot be physical parents; move existing children before converting a folder.
- `GET/PATCH /media/{asset}` reads or changes metadata. PATCH accepts `name`, `credit`, `tags` and `expected_revision`. A stale revision returns 409. Metadata edits preserve image bytes, digest, storage identity and links.
- Multipart asset upload accepts `tags` as a JSON list. Duplicate uploads reuse the existing image and preserve its metadata.

SQLite transactions use IMMEDIATE mode, with graph validation inside the write transaction. This prevents simultaneous parent edits from passing against the same obsolete hierarchy. If a lock still exceeds the wait limit, mutations return a retryable 503 with `code: write_busy` rather than an unhandled error.

## Maps and history in 0.3

Map `data` supports `groups: [{id, name, visible, private}]`, normalized marker coordinates/vertices, `hotspot` markers with a width-relative `radius`, and `layers: [{id, name, asset_id, visible, private, opacity}]`. Layer opacity is 0–1. `default_view: {x, y, zoom_delta}` stores a normalized center and zoom relative to the fitted image. Removing a private group without explicitly moving its markers to another group preserves their private flag. Reader projections exclude private groups, their markers and private layers, and redact unavailable linked targets.

- `GET /worlds/{world}/history` accepts `calendar=none|all|unavailable|{id}`, optional `timeline={id}`, `q` and `audience=reader`. It returns filtered events with date labels/ordinals, lanes, calendar definitions, timeline definitions and axis ticks. A configured timeline selects its own calendar. Unrelated calendars never share an inferred time axis. Recorded dates invalidated by calendar edits remain in the list with warnings.
- A `timeline` resource stores `calendar_id`, optional default `map_id`, `selection: all|selected`, `event_ids`, `tags`, `tag_mode: all|any`, and `lanes: [{id, name, private}]`. Lane IDs are integers from -1000 to 1000; up to 40 configured lanes are supported. Reader views use published snapshots and omit private lanes and their placements. Private lanes apply to that timeline; they do not change an event's independent entry visibility.
- Events support `year`, `month`, `day`, optional `end_year/end_month/end_day`, `lane`, `era`, `calendar_id`, `map_id` and `marker_id`. Dates include astronomical year zero and negative years. New dates must fit their custom calendar, and an end must not precede its start. Existing historical snapshots retain recorded dates when calendar rules change.
- `POST /worlds/{world}/history/events` accepts `title`, `data`, optional `calendar_id`, or `timeline_id` plus `timeline_revision`. It creates a private event and atomically adds it to a manually selected timeline. Stale timeline revisions return 409 and create no event. Configured timeline tags/calendar are inherited.

These endpoints remain owner-authenticated local authoring APIs. Online player accounts and selective sharing are a later deployment phase, documented in [project-tracker.md](project-tracker.md).

## Historical maps in 0.4

Map `data.calendar_id` selects its historical calendar. Empty means recorded year/month/day slots. `data.versions` holds up to 100 records `{id, name, year, month, day, private, scene}` with unique IDs and effective dates. Each scene is an independent snapshot of `asset_id`, `markers`, `groups`, `layers` and optional `default_view`; nested versions and unrelated scene fields are rejected. Coordinates remain normalized to the selected image. The ordinary map data is its base state before the first version.

`GET /resources/{map}/map-state?event={event}&audience=reader` selects the latest version whose date is on or before the event's start. The optional audience flag uses both published snapshots and removes private versions/groups/layers/markers/references first. The response contains one flat `data` scene, optional selected `version` metadata, `effective_label` and `warnings`. A private version does not replace a reader's latest shared state. Unshared, foreign or deleted maps/events are unavailable.

Map and event must belong to the same world and calendar. Calendar mismatch, deletion or a date invalidated by changed calendar rules produces a base-state warning, or skips an invalid map version. Recorded dates survive unrelated edits, archive restoration and revisions. New or changed dates must validate against an available calendar. Historical scene references and images remain in portable archives and complete backups.

Versions use the map's existing revision and publication controls. Draft changes do not change the saved reader snapshot. Scene group deletion retains privacy on its formerly grouped markers. Event location pickers include locations across all map versions; a location is displayed only when it exists in the chosen date's scene.

## Family and hierarchy projections in 0.5

- `GET /worlds/{world}/family` accepts optional `root`, optional `partner`, `direction=family|ancestors|descendants`, `depth=1..30`, `adoptive=1` and `audience=reader`. Returns minimal `nodes`, filtered `edges`, available root `choices` and warnings. Partner selection intersects descendants of the two roots and retains the roots themselves. Each identity has one node, even with multiple parent paths. Ordinary parent links are followed by default; adoptive parent links require the explicit option. Kinship labels describe nearest recorded ancestry and explicit social links.
- `GET /worlds/{world}/connections?audience=reader` removes private connections and connections with unavailable/unpublished endpoints. Node labels come from the saved reader entries. Relationship notes are always omitted in reader projections. Root choices, counts and traversal all use the same filtered graph.
- Connection creation accepts `visibility=private|public` (default private). Parent/adoptive-parent ancestry checks run within the write transaction and have no fixed generation cutoff. Guardian, spouse and sibling types are available alongside existing social/diplomacy types. Shared connection visibility takes effect immediately; connections do not yet have independent published revisions.
- `GET /resources/{tree}/hierarchy` accepts `audience=reader` and returns ordered minimal nodes with `parent`, `depth`, entry `revision`, warnings and tree identity. A hidden or unselected parent detaches the visible child to the root; private ancestor IDs are not returned or bypassed.

A `tree` resource uses `data.items` (manual references), `selection=manual|tags|both`, `tags`, `tag_mode=all|any`, optional `order` (preferred entry order), and `parents: {child_id: parent_id|null}`. Lists and parent mappings support up to 5,000 entries, subject to existing record size limits. Parent links are independent of library collections, checked for cycles and same-world references, and preserved when reparenting a branch. Empty tag criteria gather no automatic members. Legacy trees without `parents` retain their collection-derived parent display. Saving explicit parent links makes the hierarchy independent.

Saved reader hierarchies use published tree definitions and published membership tags; direct tree JSON also filters unavailable IDs from items/order/parents. Portable archives remap both dictionary keys and values in hierarchy parent links. All these routes remain local-owner authenticated. Player grants and online self-hosting remain later P5 work.

## Saved relationship views and graph artifacts in 0.6

`relationship` is a Resource kind with normal revision, publication, Trash and archive behavior. Its data supports `mode=family|all|diplomacy`, optional `root_id` and `partner_id`, `direction=family|ancestors|descendants`, `depth=1..30`, boolean `adoptive` and `include_isolated`, `tags`, `tag_mode=all|any`, and `kinds` (connection-type filters). Empty tags/types impose no restriction. Tag/type filtering precedes traversal; a filtered or unavailable root yields an empty graph with a warning. Reader definitions use published settings/tags/names and redact private root/partner IDs. Connections still use live visibility.

- `GET /resources/{id}/graph[?audience=reader]` projects saved relationship views or content hierarchies into `nodes`, `edges`, `warnings`, `mode` and `view` identity/title. Relationship notes and article/GM bodies are absent for both audiences.
- `GET /resources/{id}/graph-export?format=svg|html|json[&audience=reader]` returns an authenticated attachment with `Cache-Control: no-store`. Reader exports use the same filtered projection as reader display. Exports over 5,000 entries return 413 so the owner can filter the graph first.
- SVG retains full names in accessible titles, internal anchors and directional parent/diplomacy arrows. Spouse/sibling links are undirected. JSON uses `format: worldbuilder-graph-v1`; it is a graph artifact, not a world backup/import archive.
- Offline HTML embeds the SVG and matching full-name/connection lists, with zoom/reset/search controls. It uses no external scripts, fonts or media; a hash-based meta CSP permits only its fixed control script. It can be opened as a local file or embedded as a static HTML artifact under a separate host's policy. It does not provide live app access, permissions or revocation after copying.

The local app still denies public/iframe hosting of its authenticated pages. Online player accounts and protected live embeds remain later P5 work.

## Calendars and map icons in 0.7

Calendar arithmetic remains independent of Gregorian dates. `months` supports 1-60 named base lengths of 1-1000 days; `weekdays` supports 1-40 names. `day_offset` is a signed weekday offset from -100000 to 100000. `week_mode` is `continuous` (default), `reset_month`, or `reset_year`.

Optional `leap_rules` holds up to 12 `{id, name, interval, offset, month, days, except_every, except_unless}` records. A rule adds 1-10 days to its month when `(year-offset)` is divisible by `interval`. `except_every` skips matching multiples; `except_unless` restores multiples of that exception. Both exceptions share the year offset. Intervals are 1-10000; zero disables exceptions; skip must be a multiple of interval, and restoration a multiple of skip. Unique IDs are required. Explicit `leap_rules: []` disables legacy leaps; absence preserves `leap_every`/`leap_month` behavior. Overlapping rules add together.

Optional `moons` holds up to eight `{id, name, period, offset}` cycles. Period is 1-1000000 days; offset is the ordinal of a new phase. Phase indices 0-7 divide each period into eight equal integer buckets. Explicit `[]` disables celestial display; absence preserves the legacy `moon_cycle`. Years and cycle/leap offsets use signed integers up to one billion in magnitude, including year zero.

- `POST /tools/calendar` accepts `calendar` plus `year/month/day`, or `ordinal` for inverse conversion. `include_month: true` adds a `days` list with weekday and all moon phases for each date. Results include ordinal, month lengths, weekday index, year length and cycles. Computation counts periodic leaps arithmetically and uses bounded binary search for inverse dates.
- `GET /resources/{calendar}/calendar-export[?audience=reader]` downloads `{format: "worldbuilder-calendar-v1", name, calendar}`. The calendar contains only mathematical settings, including whitelisted month names/lengths. No document, GM, provenance or arbitrary month metadata is exported. Reader exports require an available published calendar and use its snapshot. Attachments have `Cache-Control: no-store`.
- `POST /worlds/{world}/calendars/import` accepts `{definition: ...}` in that format (up to 100 KB). Unknown settings are rejected. Import always creates a new private calendar; it never overwrites an existing entry or imports publication state.

Events and dated map versions now allow day input up to 2000, then validate the actual custom month length (maximum 1120 under current base/rule limits). Unspecified calendars use ordered year/month/day slots of 120000/2000; these are computed positions, not persisted date conversions. Existing stored date fields are unchanged. Invalidated historical dates retain the existing warning behavior.

Pin markers accept `symbol` from `pin`, `castle`, `home`, `temple`, `forest`, `mountain`, `water`, `cave`, `camp`, `treasure`, `danger`, `portal`; optional `icon_asset_id` must refer to a raster asset in the same world. `icon_size` is an integer 16-64 pixels. Raster images take precedence over fixed symbols; unavailable images fall back to a symbol. The browser constructs fixed SVG geometry and DOM nodes; marker `html` and `icon_html` are rejected. These fields are retained in independent dated scenes, revisions/publications, and remapped portable archives. Private markers/groups are removed before reader icons render. Media still uses local owner authentication; online player grants remain later work.

## Eras and historical date precision in 0.8

`era` is a Resource kind using the ordinary revision, publication, Trash and archive APIs. Its data includes `calendar_id`, start `year/month/day`, optional `end_year/end_month/end_day` and the precision fields below. Eras may overlap. An absent end means ongoing; this does not infer a present date. Eras cannot link to another era. Events may store `era_id`; new/changed dates must be contained in that available same-world era on the same calendar. Later era/calendar edits do not rewrite recorded event dates; history retains them with warnings.

Both eras and events support `date_precision: day|month|year` (default day), boolean `date_approximate`, and, with an explicit end year, optional `end_precision` and `end_approximate`. End precision defaults to start precision. Unknown components are ignored in arithmetic without deleting stored fields: a year starts at month/day 1, and a month at day 1. The interval ends on the actual final day of that year/month, including leap rules; unspecified calendars use the existing ordered slots. Circa marks an estimate without expanding its interval by an invented margin. These are absolute calendar years; relative era-year conversion is not implemented.

- History responses add `eras` with audience-filtered identities, labels, date bounds, `open_ended`, `uncertain` and warnings. Events add `era_label`/`era_warning` where applicable and precision-aware labels/bounds. Calendar-specific axes include era bounds; open eras extend visually to the displayed axis end.
- Full resource JSON for eras/events adds computed `date_context`. It follows the requested owner/reader calendar and era projection. Private/unavailable era IDs are removed from reader resource/history JSON. Reader labels use published era names and calendar definitions, excluding draft changes.
- Map-state selection uses the earliest date of a stated year/month and returns an explicit uncertainty warning. Circa day events use the recorded day without inventing a numeric error margin. Map effective dates remain exact dates.
- Portable archives remap `era_id` in draft/published snapshots, and preserve precision, flags and era definitions. No database migration is needed.

## Recurring events and festivals in 0.9

Event `data.recurrence` is `{frequency: daily|weekly|monthly|yearly, interval: 1..10000, invalid_date: skip|last_day, until_year?: integer}`. Remove the field (or use null) for a one-time event. Repeats require an available custom calendar and known day precision without circa estimates; eras cannot repeat. The source date anchors the interval and is never rewritten by previews. The final year limits occurrence starts; a multi-day occurrence may finish later. Duration is preserved in actual calendar days.

Daily repeats step by ordinal days. Weekly repeats step by interval times the number of weekday names, even if weekday names reset monthly/yearly. Monthly repeats retain the original day number and step across the calendar's fixed month count; yearly repeats retain original month/day. Missing dates are skipped or clamped independently, so a clamped month does not shift later anchors. Negative years/year zero follow the same rules. Rules do not yet support one-off exceptions, nth weekdays or moon-triggered dates.

- History GET accepts `from_year` and `to_year` for repeating dates, inclusive, with at most 200 years. Timeline data may store both `recurrence_from_year` and `recurrence_to_year`; reader defaults use the published timeline settings. With no window supplied, use ten years starting at the earliest eligible repeating source, or year 1 if none. One-time records remain in the history list independently of the repeating-date window.
- Responses add `occurrence_window`, `occurrences_truncated`, `recurrence_warnings` and per-event `occurrence_id`. `id` remains the source Resource UUID. A repeat identity is `UUID@year:month:day`; it is a projection key, not a Resource URL. Tags, selections, privacy and timeline lanes filter sources before expansion. Each occurrence has its own date projection and era warning. History lists no longer duplicate document/source/GM bodies or arbitrary metadata; full entry content is loaded separately on selection.
- A request generates at most 2000 repeated occurrences and scans at most 20000 candidate dates across its series. Truncation is explicit; narrow the window for completeness. These limits do not silently create records or change stored rules. New/changed rules validate the anchor; unrelated edits and archive/revision restoration preserve historical records with invalidated dates and review warnings.
- `GET /resources/{event-or-calendar}/occurrences?from_year=...&to_year=...[&audience=reader]` returns compact date records, window, limits and warnings. Calendar mode includes eligible one-time records and repeating instances; the calendar view intersects their ordinals with its selected day. Payloads exclude arbitrary data, documents, source text and GM notes. Direct hidden/foreign/unpublished reader resources return 404.
- Map-state GET accepts optional `occurrence=year:month:day` for a repeating event. The server checks that exact start against the audience's source rule, interval, calendar, missing-day policy and final year. Membership checks do not depend on preview limits. Forged/unavailable dates return 400. Reader maps use published repeat definitions. Existing exact/uncertain event behavior remains when no occurrence is supplied.

Repeat definitions and saved windows use ordinary Resource revision/publication/Trash behavior and travel in complete backups and portable world archives. Generated occurrences are never persisted as entries or revisions. No schema migration or external service is required.

## Connection editing and history in 0.10

Connections retain their UUID through edits, recoverable removal and historical restoration. Owner JSON adds `revision`, `created_at`, `updated_at` and nullable `deleted_at`.

- `POST /worlds/{world}/connections` still creates an active connection, now with a created revision.
- `GET/PATCH/DELETE /connections/{id}` reads, edits or removes an owned connection. PATCH accepts `source`, `target`, `kind`, `label`, `strength` (-100..100), `notes`, `visibility` and mandatory integer `expected_revision`. DELETE requires that revision too. The older world-scoped DELETE route remains as a revision-checked soft delete; it no longer permanently removes a link.
- Active same-world, different endpoints and valid visibility are required. Parent/adoptive-parent structural changes and restores are checked against the final active ancestry graph, excluding the replaced edge. A duplicate active tuple returns 409. Stale revisions return 409 without writing or discarding client input.
- `GET /worlds/{world}/connections?trash=1` lists removed links for the owner. Default graph/list projections omit them. A removed link can coexist with a new link having the same tuple; restoration fails safely if the tuple is already active.
- `GET /connections/{id}/revisions` returns immutable numbered snapshots with action and timestamp. `POST /connections/{id}/restore` accepts `expected_revision` and optional `number`; without a number it revives the current removed fields. A chosen active historical snapshot restores its values as a new revision. Deleted historical snapshots cannot be restored as active revisions. Restoring requires active endpoints and revalidates cycles/uniqueness.
- `GET /connections/{id}?audience=reader` uses the same active/public/published-endpoint filtering as reader graphs. Notes and owner revision metadata are omitted. History is unavailable in reader mode. Connection visibility remains live; independent player memberships/grants are later P5 work.

Migration 0003 adds revision/timestamp/removal fields, a conditional unique constraint for active links and ConnectionRevision. Existing links receive baseline revision 1 without changing their IDs or original fields. The launcher makes a complete backup before migrations.

Full backups include history. Portable world archives include removed links and their numbered history/timestamps, remapping historical endpoints to the restored world's IDs. Old archives without history import with a baseline. History must contain all revisions and match its latest state; malformed history rolls back the import. Portable histories are limited to 10000 revisions per connection under existing archive size limits; full database backups preserve the complete database.

## Searchable dropdown requirement USER-01

All application select locations now use SearchableSelect. Every enabled dropdown opens a text filter; matching is case/accent insensitive. Arrow keys, Home/End within the list, Enter, Escape and Tab/Shift+Tab support keyboard operation. Options keep their stored values; filtering/cancelling never changes the selection. Disabled options stay unselectable. Popups remain within the viewport and modal focus scope. Hidden native controls retain form data and existing change-handler behavior.

`npm run check` and `npm run build` include an AST check rejecting raw select elements outside the shared component. Existing search-based reference pickers retain their own search. This user requirement is tracked separately from the original 139-row scope.


## Character dossiers in 0.15

`GET /api/resources/{id}/dossier?campaign={optional campaign UUID}&audience=reader` derives a character guide from existing records; omit audience for owner data. It returns character, campaign/campaigns, graph, relationships, records, locations and totals. Campaign scope requires character membership; unavailable/non-character/foreign targets return 404. Reader mode uses published templates/fields, records and eligible graph/pin projections, filtering GM text and hidden identities before prose matching. No associations are written by this endpoint. Existing revision-checked resource APIs save portraits and explicitly linked notes. The graph is a direct neighborhood (80-node limit), relationships/records each cap at 200 and locations at 100. See [validation](validation-0.15.md).


## Session guide in 0.16

`GET /api/resources/{id}/session-guide?audience=reader` derives a session desk; omit audience for owner data. Returns session, campaign, rendered sections, scoped records, cast/lore cards, locations, previous/following references, owner previous_follow_up and collection totals. Wrong-kind, foreign, deleted or unavailable reader sessions return 404. Membership uses explicit campaign_id with missing/null legacy parent fallback. Records require matching campaign plus session_id, or an explicit link from the session to an unassigned record. Party and record links add cast; maps derive from direct/record associations. Reader calculations use published projections; privacy sanitation follows the snapshot type. Limits: 200 records, 100 cast, 100 locations. Existing revision-checked resource APIs save plans/progress and create private session records; reading writes no associations.


## Location guide in 0.17

`GET /api/resources/{id}/location-guide?campaign={optional UUID}&audience=reader` derives a settlement/building/geography article guide. Omit audience for owner data. Returns location, campaign/campaigns, graph, relationships, records, locations, people and totals. Residence requires an incoming located-in edge from a character. Associations use existing explicit links, source references, unambiguous names/aliases and visible map/pin pairs. A location on an eligible campaign map can establish campaign context; other records/people still follow campaign membership. Reader calculations use published values and exclude hidden-pin records before matching or related-session expansion. Wrong-kind/unavailable/foreign resources return 404. Limits: 80 web nodes, 200 relationships/records, 100 people/pins, with totals. Reading writes no data. Existing revision-checked resource APIs save images and explicit links; new place records use related_entries with the original place UUID.


## Campaign workbench and threads in 0.18

`GET /api/resources/{campaign}/workbench` is owner-only; audience=reader returns 404. Optional query fields: category=all|notes|threads, session UUID, type=note|journal|milestone|session|quest|task, q (up to 300 characters), arc (up to 180), offset (100-result pages) and layout ID. Returns original campaign/settings, sessions, resolved pins or unavailable placeholders, records/total/has_more, filtered lane_counts, recent_notes/open_threads and campaign maps. Body/tag/field search and scope filtering precede pagination. Explicit campaign_id overrides a legacy parent.

Campaign data.gm_workspace stores layouts and selected_layout. Layouts have id, name, columns (1..3), session_id, ordered panels (kind/collapsed) and pins (entry_id/wide). Allowed panels: pins, session, capture, notes, threads, maps. Limits: 12 layouts, 40 pins/layout. Generic revision-checked resource PATCH saves settings; normal history/archive handling preserves and remaps nested IDs. gm_workspace is always removed from reader JSON/search.

`GET /api/resources/{quest-or-task}/thread-guide?audience=reader` returns the audience-projected original thread, campaign, related references and the latest 100 linked notes/session reports, with total. Updates match thread_id or related_entries in the same campaign. Quest/task data adds story_arc, objectives (up to 100 unique id/text/done rows), outcome and GM-only gm_next_step. Reading-time workbench_sections HTML links supported text without rewriting records. Existing resource POST/PATCH creates private captures, links thread_id, saves objectives/outcomes and changes progress; captured expected_revision protects edits. thread_id must reference an available same-campaign quest/task, with unchanged removed links retained. Reader snapshots filter private targets, next actions and updates.

## Adventure lifecycle in 0.19

`GET /api/resources/{campaign}/lifecycle?session={UUID}&q={text}&person={UUID}&place={UUID}&thread={UUID}` is owner-only; reader mode returns 404. It returns the campaign, sessions, selected full session, planning records, matching journal, campaign-wide follow-ups and change log with totals. Limits: 500 planning records, 200 journal/follow-ups, 100 activity events; filters apply before limits. Search covers title/summary/original document; campaign membership is explicit with legacy fallback.

Planning uses ordinary versioned articles with templates/data.planning_type `adventure`, `campaign-scene`, `encounter`, `handout`; existing manuscript `scene` kind is unchanged. Generic revision-checked POST/PATCH stores adventure_id, scene_ids/positions, prerequisites, next_scenes (target_id/label/condition), stakes/environment/possible_outcomes/branch_notes, public_summary, related_entries and map_id/marker_id. Scenes/encounters remain originals; session data.agenda stores entry_id/state/notes and active_scene_id. Maximum 200 agenda items, one active; 40 branches; 200 prerequisites/ordered scene IDs. Invalid type/world/campaign references reject. Unchanged removed refs and historical restoration retain provenance. Scene states are independent per session.

`POST /api/resources/{session}/recap-draft` with ids (at most 100 same-session records) returns text/source_ids without writing or publishing. Private blocks are omitted; this remains a GM-reviewable draft, not an automatic public recap.

`POST /api/resources/{session}/handoff` requires expected_revision, entry_ids and followup_ids. Supply target_id/target_revision for another campaign session, or title for a new private session. Only unfinished source agenda references may carry forward. Target merges without duplicate references and initializes new items as planned; source agenda states remain unchanged. Follow-up scheduling preserves origin session. Source, target and follow-ups update atomically; stale writes/replays reject.

`POST /api/resources/{record}/follow-up-task` requires expected_revision/title. It atomically creates a private task linking the original and marks the original follow-up handled. Scheduling uses follow_up_session_id, state open/scheduled/done; origin_session_id retains provenance. No source body is copied.

`GET /api/resources/{handout}/handout?audience=reader&export=html` supports JSON preview or HTML attachment; omit audience for owner preparation. Sources always use published reader projections; handout reader mode also uses its published selections/introduction. Selection limits: 30 sources/10 explicitly approved images; exported images are embedded with a 30 MB aggregate cap. Owner preview reports omitted selection count without private titles/IDs. Selected image labels are generic. Introductions/titles are escaped; source rich HTML uses common document/reader filtering. Authentication remains local owner-only.

Reader projections remove GM planning fields, agenda/active state, branch conditions/routes, prerequisites, scene ordering/positions and follow-up/handoff metadata. Public summary/body remain subject to normal publication and private-block filtering. All planning references, including nested branches, agenda and graph-position keys, are remapped by portable archives.


## Campaign continuity in 0.20

`GET /api/resources/{campaign}/continuity?session={optional UUID}` is owner-only (reader mode 404). Returns campaign/session/sessions, cast, locations, current items, session media, quests/scenes, recorded developments, relationships, follow-ups, wrap-up and totals. Current party/equipment are not historical snapshots; session filters apply to recorded developments/media. Limits: 500 items/records/relationships, 200 cast/locations/quests/media/follow-ups. Query scope/ownership are checked before returning originals.

`POST` to the same endpoint accepts these actions:

- `party`: expected_revision for campaign, profiles (entry_id, role pc/npc/companion/inactive, location_id, goals, conditions, notes), location_id/goals/conditions. PCs/companions update active party membership; implicit legacy PCs remain unless explicitly reclassified. Maximum 200 profiles.
- `award`: quantity, optional item_id/expected_revision, recipient to_holder, session_id/reason/notes. A new item instead requires title/description and campaign_revision; campaign revision is bumped atomically to prevent replay duplicates.
- `transfer`: item_id/expected_revision, positive whole quantity, from_holder/to_holder and optional session_id/reason/notes. `adjust` uses direction add/remove with the corresponding holder. `party` identifies party storage; other holders are available same-world characters/locations. Stock and private loot/transfer/adjustment Resource records commit together. Maximum 75 holders and 1,000,000 total units/item; underflow, invalid recipient, stale writes and replay reject without partial updates. An existing deleted holder can transfer stock out but cannot receive more.
- `migrate-inventory`: expected_revision converts the first 100 legacy campaign.data.inventory rows into tracked originals, preserving all original values in legacy_item and old campaign revisions. Remaining rows stay available for the next batch; a stale replay rejects.
- `record`: type progression/consequence/relationship-event/journey/place-status/media-collection; title/data, optional text, entry_id/expected_revision. Omitting text on an update preserves the original rich document. Progression uses milestone records and category milestone/ability/development. Consequences retain affected_entries and open/resolved impact_status. Relationship events require connection_id; optional relationship_change (expected_revision/label/strength/notes) commits an edge update and event together. Endpoints are retained as original related entries. Journey route_points (x/y 0..1, label, location_id) require a map; place status requires location_id and supports discovery/threat/control/business plus controlled_by_id. Media collection_items choose exactly one entry_id/asset_id plus caption/category portrait/map/illustration/handout. Maximum 200 points/items, no duplicate media sources.
- `wrap-up`: session_id/expected_revision, note_revision for an existing wrap-up, text, reviewed (five booleans: loot/progression/relationships/consequences/followups), complete. Source UUID/revision pairs (up to 700) and session note reference commit together. Completion requires all sections reviewed and completes the active agenda item/session without rewriting other states or source notes.

Generic revision-checked Resource PATCH stores `continuity_dependencies` on quests/tasks/scenes (100/source; target_id, source_objective, target_objective, notes). Objective IDs must exist on the selected originals; self/duplicate/cross-campaign dependencies reject. Dependencies are guidance, not automatic completion. Campaign `continuity_graph.positions` stores up to 200 finite positions using UUID or UUID/objective/ID keys; reader projection strips it. The diagram shows up to 100 originals/100 objectives. Plain item metadata edits preserve stock; restoring item-note revisions also keeps current holdings. Movement facts cannot be edited through generic PATCH; use a transfer/adjustment to change quantities. Trash does not undo a movement.

GM profiles, ownership/quantity/holder identities, dependency diagrams, relationship IDs, route/location details, selected collection sources and wrap-up metadata are excluded from reader data. Ordinary prose still follows explicit published snapshots/private-block filtering; no automatic redaction of prose is claimed. Session media remains private preparation and uses the existing player-safe handout preview for selected handouts. No audio/external embeds or online player accounts are enabled.

## Notebooks in 0.21

All notebook endpoints require the local owner. GET `/api/worlds/{world}/notebooks` returns books, templates, selected book, results and pagination/inbox/unavailable counts. Query fields: book, section, view (all/inbox/favorites/knowledge), category, campaign, tag, q, metadata, sort (recent/title/oldest/section), offset. Results are 100 per page; metadata searches labels and formatted typed values. Reader projection is rejected.

POST to that endpoint takes `action` and action-specific input:

- `book`: title, sections; existing id requires expected_revision. Sections contain id/title/parent_id/entry_ids. At most 100 sections, eight levels, 500 original references per section; no cycles, foreign sources, duplicate IDs or self filing.
- `template`: title, optional source_id to copy an original rich document, defaults (tags/category/related_entries), schema and optional text. Existing id requires expected_revision. Omitting text preserves the rich document.
- `capture`: capture_key UUID, optional title/text, preset/template_id, tags/category/campaign_id/session_id, optional book_id/section_id/expected_revision. Same-key identical retries return the same original; changed input rejects. Book filing and private note creation commit together.
- `metadata`: id/expected_revision and supported metadata fields, tags, original campaign/session/related references. Schema defines at most 30 unique id/label/type fields; types text/number/check, matching values only. Favorites are booleans and questions are open/resolved. Rich documents are preserved.
- `file`, `unfile`, `bulk`: entries are id/revision pairs, at most 100. File/unfile require book_id/expected_revision; file selects section_id with optional move. Move removes other references in that destination notebook. Unfile removes the selected references from all of that notebook's sections. Original notes remain. Bulk adds tags and/or sets starred, atomically.
- `board`: book_id/expected_revision and board cards/edges. At most 150 original-source cards and 300 labeled edges; unique card/edge UUIDs, valid endpoints, finite coordinates 0..5000. Captions and colors are validated; source prose is untouched.

GET `/api/worlds/{world}/note-audit` returns at most 200 unavailable-reference/ambiguous-name findings with totals. Read-only owner tool; it does not merge notes or alter links.

GET `/api/resources/{book}/notebook-export?section={optional section UUID}&audience=owner|reader` downloads standalone HTML. Default reader uses published source snapshots and omits private notebook names/section labels/metadata/GM text/draft edits. Owner explicitly includes current private content. Both require owner authentication; no publication occurs. At most 500 unique originals/30 MB embedded images. Repeated originals have one article anchor. Missing or unavailable originals are omitted; archives remain the complete recovery format.

## Markdown and linked images in 0.22

`POST /api/documents/parse` requires an authenticated owner session and accepts `{text: "Markdown source"}` (up to 200,000 characters). Returns `{document, html}` after Markdown parsing, sanitization, block normalization and document validation. It creates no resources or revisions; the original editor saves inserted content normally. Invalid requests reject with 400, unauthenticated requests with 401.

Document image.src accepts validated HTTP/HTTPS URLs in addition to `/media/{UUID}`. Local media references still require an asset in the same world. data.cover_url accepts an empty string or validated HTTP/HTTPS image URL; UI selection of a linked portrait clears cover_asset and selection of an uploaded portrait clears cover_url. Reader projections use published source values. External URLs are stored, not fetched by the server or included as uploaded bytes in archives. Graph node portrait_url is projected alongside portrait_asset_id from the same owner/published source snapshot.
