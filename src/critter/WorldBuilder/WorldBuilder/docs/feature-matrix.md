# World Anvil capability inventory and WorldBuilder implementation matrix

Research baseline: **28 October 2026**. Target: the publicly documented free, Master, Grandmaster, Sage, player and retained legacy capabilities. User preference: **one person on this Windows PC first**. Later deployment phases retain the collaboration/publishing capabilities without enabling internet access now.

**This table preserves the original requirements. Current delivery status is tracked in [implementation-status.md](implementation-status.md) and [feature-inventory.json](feature-inventory.json).** Phases indicate delivery order, not a reduction of the requested full scope. A capability is complete only after its acceptance check and a real workflow review pass. One row may cover several related controls; this is not a count of World Anvil's individual UI features.

Evidence codes: **D** = capability documented publicly; **U** = compatibility/details remain unresolved; **E** = proposed WorldBuilder enhancement; **X** = external service/network rather than software parity. D confirms documentation, not live account verification. Read [sources and boundaries](sources.md), [architecture](architecture.md), [delivery plan](delivery-plan.md), and [open questions](open-questions.md).

P1: 30 scope items · P2: 26 scope items · P3: 16 scope items · P4: 21 scope items · P5: 34 scope items · P6: 12 scope items.

## Worlds and organization

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| W-01 | D / P1 | Multiple worlds and campaigns | Separate world IDs and a fast world switcher. | Changing world never mixes data. | [S01], [S27] |
| W-02 | D / P1 | World dashboard and navigation | Configurable dashboard widgets, menus and quick creation. | Reordered widgets persist after restart. | [S05], [S11] |
| W-03 | D / P1 | Nested categories and article parents | Ordered trees with cycle prevention and saved list views. | Move a subtree without breaking links. | [S05], [S09] |
| W-04 | D / P1 | Tags and generated collections | One tagging model for articles, maps and assets. | A tagged collection updates after a tag edit. | [S10] |
| W-05 | D / P1 | World meta and creative prompts | Editable scope, tone, setting rules and inspiration sections. | Meta exports alongside the world. | [S26] |
| W-06 | D / P1 | Draft, published, WIP and completed states | Store publication and work status independently. | Draft changes do not publish accidentally. | [S05] |
| W-07 | D / P5 | World branding, announcements and credits | Configurable homepage, notices, copyright and navigation blocks. | Preview matches the published presentation. | [S02], [S39] |
| W-08 | D / P5 | World and article URLs | Stable IDs with editable slugs, aliases and redirect records. | Old links still resolve after a rename. | [S02], [S47] |
| W-09 | D / P5 | World statistics and feeds | Permission-filtered counts and an optional RSS feed. | Private updates never enter a public feed. | [S02] |

## Articles and knowledge editing

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| K-01 | D / P1 | Built-in article families | Original schemas for the documented template families; see template catalogue. | Each family can save its structured fields. | [S04] |
| K-02 | D / P4 | Custom article templates | Versioned field schemas with reusable sections and validation. | Schema changes preserve existing article values. | [S01], [S38] |
| K-03 | D / P1 | Visual block editor | Tiptap core with headings, lists, tables, quotes and slash commands. | Pasted and edited content survives reload. | [S06] |
| K-04 | D / P1 | Mentions and placeholder articles | Insert ID-based links and create unresolved topics inline. | Rename a target without breaking its mentions. | [S06], [S11] |
| K-05 | D / P1 | Automatic cross-link suggestions | Match aliases; preview and accept suggestions before committing. | Ambiguous names require a chosen target. | [S08] |
| K-06 | D / P1 | Backlinks, tooltips and quick preview | Index references and open linked records beside the editor. | Link edits update the backlink list. | [S02], [S05] |
| K-07 | D / P1 | Structured fields and sidebars | Typed field values alongside free prose and relationship pickers. | A selected location resolves to one location record. | [S04], [S06] |
| K-08 | D / P4 | Reusable variables and rich snippets | ID-based terms, tooltips, numeric values, links and fragments. | Edit one variable and refresh every reference. | [S23] |
| K-09 | D / P4 | Language dictionaries | Language-linked word entries with lookup and embeddable lists. | Search and export preserve spelling and Unicode. | [S02], [S04] |
| K-10 | D / P1 | Focus writing and keyboard commands | Distraction-free editor and accessible command palette. | Writing and navigation work from the keyboard. | [S05], [S06] |
| K-11 | D / P5 | Rich embeds and page layouts | Reusable components for media, graphs, tables and read-aloud blocks. | A component renders only permitted referenced data. | [S06], [S07] |
| K-12 | U / P5 | Advanced markup compatibility | Parse imported BBCode into the internal document model; preserve unknown tags. | Every supported tag has an import/render fixture. | [S07] |
| K-13 | D / P5 | Article and category presentation | Headers, footers, tables of contents and book-style category cards. | Nested navigation matches the configured order. | [S02], [S09] |
| K-14 | D / P5 | Move content between worlds | Transactional transfer with reference and access remapping. | Transfer report identifies external references. | [S02] |
| K-15 | D / P1 | Article scrapbook and private comments | Private editorial notes separated from published content. | A reader export contains no editorial notes. | [S02] |

## Accounts, privacy and authoring rights

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| A-01 | D / P1 | Private worlds and resources | One policy service for world, object and asset access. | Direct URLs enforce the same rule as navigation. | [S32], [S34] |
| A-02 | D / P5 | Co-author roles | Owner, co-owner, editor, own-content writer and draft-only writer roles. | Each role passes create/edit/publish tests. | [S33] |
| A-03 | D / P5 | Reader groups and memberships | Resource grants, defaults and explicitly opt-in self-enrolment. | Revoking membership removes access immediately. | [S32] |
| A-04 | D / P1 | Private sections within public pages | Store restricted blocks separately and filter on the server. | Restricted text is absent from HTML and JSON. | [S32] |
| A-05 | D / P1 | Reusable secrets and controlled reveals | Secret records with independent audience and GM-only notes. | Revealing a secret never reveals its GM notes. | [S34] |
| A-06 | D / P5 | Visibility of markers, events and graph items | Apply the same policy to child objects and their media. | Hidden titles never leak through a tooltip. | [S13], [S14], [S19] |
| A-07 | D / P5 | View as reader or group | Evaluate the real read policy in a marked preview session. | Preview and actual reader responses agree. | [S05], [S32] |
| A-08 | D / P5 | Passwords and access codes | Hashed article passwords and revocable, scoped access grants. | Expired or revoked codes cannot open content. | [S01], [S02] |
| A-09 | D / P5 | Access-denied and restricted link presentation | Configurable denial pages without leaking private metadata. | Unknown and private objects reveal no extra detail. | [S02] |
| A-10 | D / P5 | Content warnings and social controls | Resource warnings and optional comments, follows and sharing controls. | Disabled controls stop the associated API actions. | [S02], [S45] |
| A-11 | D / P5 | Author credits and ownership management | Authorship attribution separated from permission and ownership. | Changing a byline does not change access. | [S02], [S33] |

## Interactive maps

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| M-01 | D / P2 | Map image upload and navigation | Leaflet image coordinates with pan, zoom and image bounds. | Markers remain aligned at all zoom levels. | [S13] |
| M-02 | D / P2 | Pins, labels and invisible hotspots | Typed markers with icons, styling and linked content. | Each marker opens its configured target. | [S13] |
| M-03 | D / P2 | Routes, circles and polygons | Persist editable geometry and display order. | Reload preserves vertices and style values. | [S13] |
| M-04 | D / P2 | Image layers and marker groups | Named overlays with toggles and independent permissions. | A hidden layer is not downloaded by readers. | [S13] |
| M-05 | D / P2 | Custom and HTML marker appearance | Custom image pins and sanitized marker layouts. | A marker cannot execute injected script. | [S13], [S38] |
| M-06 | D / P3 | Player-draggable markers | Separate marker-move permission and persisted positions. | Moving a token cannot edit the map itself. | [S13] |
| M-07 | D / P2 | Linked maps and linked articles | Navigate world to region to settlement with stable references. | Returning preserves the previous map viewport. | [S13], [S11] |
| M-08 | D / P2 | Popups, default views and map controls | Editable descriptions, bounds, zoom, compass and startup view. | Settings survive closing and reopening the map. | [S13] |
| M-09 | D / P2 | Embedded and standalone map views | Reuse one map renderer in articles and map pages. | Both views resolve the same marker data. | [S13] |
| M-10 | E / P2 | Image replacement alignment | Keep normalized coordinates and preview aspect-ratio changes. | Replacement offers a visible remapping preview. | [S13] |

## Calendars, timelines and Chronicles

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| T-01 | D / P2 | Custom weekdays, months and year layouts | A calendar definition model independent of Gregorian dates. | An invented calendar converts dates consistently. | [S16] |
| T-02 | D / P2 | Celestial cycles and recurring events | Cycle periods, phase offsets, festivals and repeat rules. | A known date produces the expected moon phases. | [S16] |
| T-03 | D / P2 | Calendar sharing and definition import/export | Versioned calendar files and embeddable calendar views. | Export/import preserves all calendar settings. | [S16] |
| T-04 | D / P2 | Historical events and eras | Typed events with ranges, precision and open-ended eras. | Negative and uncertain dates sort correctly. | [S14] |
| T-05 | D / P2 | Parallel timeline lanes | Event placements reference shared events rather than copying them. | One event edit updates every timeline placement. | [S14] |
| T-06 | D / P2 | Timescale, list, filters and navigation | Timeline canvas, condensed lists, search and overview navigation. | A large time gap remains navigable. | [S14] |
| T-07 | D / P2 | Event and era presentation | Importance, type, images, linked articles and visibility. | Public and author views use the correct event set. | [S14] |
| T-08 | D / P2 | Chronicle map/event synchronization | Connect timeline selection and map markers in both directions. | Selecting either reveals the matching event/location. | [S15] |
| T-09 | D / P2 | Evolving historical maps | Map versions and territory states activated by historical intervals. | Scrubbing time selects the expected map version. | [S15] |
| T-10 | D / P2 | Chronicle calendar and track configuration | Share the calendar engine while allowing per-view tracks and settings. | A leap day works in both calendar and Chronicle. | [S15] |

## Relationships and visual planning

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| R-01 | D / P2 | Family trees and extended relationships | Typed kinship and social edges referencing character records. | Complex families render without duplicated people. | [S17] |
| R-02 | D / P2 | Bloodlines and descendant views | Ancestor/descendant queries with root and couple selection. | A bloodline excludes unrelated branches. | [S17] |
| R-03 | D / P2 | Directional diplomacy | Separate A-to-B and B-to-A scores, labels and notes. | Asymmetric relations keep their two values. | [S18] |
| R-04 | D / P2 | Filtered relationship webs | React Flow views over selected records and tags. | Changing a tag updates the eligible graph nodes. | [S18] |
| R-05 | D / P2 | Content hierarchies | Ordered, cycle-checked trees with manual and tag-selected items. | Reparenting preserves all descendants. | [S19] |
| R-06 | D / P5 | Interactive, static and textual graph embeds | Render the same authorized graph into each format. | Exports and accessible lists contain the same nodes. | [S17], [S19] |
| R-07 | D / P4 | Whiteboards and linked resource cards | Excalidraw core plus application-owned resource references. | Reopening preserves layout and working resource links. | [S20] |

## Campaigns and the GM screen

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| C-01 | D / P3 | Campaign setup and invitations | World-linked campaigns with system selection, cast and membership. | A campaign remains attached to the correct world. | [S27] |
| C-02 | D / P3 | PC and NPC campaign participation | Link character entities to cast and party roles. | Promoting an NPC does not duplicate its lore. | [S27] |
| C-03 | D / P3 | Parties, quests and shared equipment | Party records, quest status/importance and inventory ownership. | Party changes appear consistently on GM and player views. | [S27], [S28] |
| C-04 | D / P3 | Plot preparation and campaign primer | Link plot articles and player-safe introduction material. | Session prep can open every referenced resource. | [S27] |
| C-05 | D / P3 | Session scheduling and reports | Real-world session times, session state and linked reports. | Session time remains distinct from fictional dates. | [S27] |
| C-06 | D / P3 | Digital GM workspace | Resizable panels for library, current plot, party and references. | Saved workspace layout restores on restart. | [S28] |
| C-07 | D / P3 | Dice and campaign activity stream | Validated dice grammar and stored roll/message events. | A roll retains its formula, result and visibility. | [S28] |
| C-08 | D / P3 | Handout presentation | Dedicated reader-safe image window and reveal state. | A GM-only image cannot be sent accidentally. | [S28] |
| C-09 | D / P3 | Session media collection | Persistent external embeds and local audio/image references. | Unavailable online media fails without blocking the session. | [S28] |
| C-10 | D / P3 | GM-only campaign and quest notes | Private text linked to shared campaign objects. | Player payloads contain none of the private notes. | [S28] |

## Player characters and RPG systems

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| S-01 | D / P3 | Player profiles and character ownership | Profiles connected to lore, campaign membership and user ownership. | An owner can edit only their permitted characters. | [S29] |
| S-02 | D / P3 | Character journals, history and posts | Typed character entries with real and fictional dates. | An entry appears in the intended character history. | [S29] |
| S-03 | D / P3 | Equipment, scrapbook and galleries | Character-owned collections and permitted shared assets. | Moving equipment updates its owner consistently. | [S29] |
| S-04 | D / P3 | System-specific sheets and statblocks | A registry of versioned system packs, fields and calculations. | Every installed pack passes its own sheet fixtures. | [S30], [S48] |
| S-05 | D / P4 | Custom sheet and statblock designer | Typed field schemas, repeaters and a bounded expression engine. | Homebrew sheets save, render and calculate deterministically. | [S31] |
| S-06 | D / P3 | Statblock embedding and collections | Reference one statblock from articles, characters and GM panels. | Editing a block updates all referenced views. | [S30] |
| S-07 | D / P5 | Shared sheet/template catalogue | Import/export packages with authorship and dependency metadata. | An installed package records its source and version. | [S30], [S31] |
| S-08 | U / P6 | Full World Anvil system catalogue coverage | Enumerate actual systems and block types before producing compatible packs. | A named pack counts only after concrete fixtures pass. | [S30], [S48] |

## Notes, tasks and personal organization

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| N-01 | D / P1 | Personal notebooks, sections and notes | Account-owned notebooks with fast capture and ordered sections. | Personal notes never enter public world output. | [S24] |
| N-02 | D / P4 | Notebook tags, metadata and templates | Reusable typed metadata keys, starred notes and note presets. | Search can find notes by metadata and tags. | [S24] |
| N-03 | D / P1 | Article-linked to-do items | Priorities and workflow states linked to article progress. | Creating the target article updates the task. | [S25] |
| N-04 | D / P4 | Pinned notes and overlays | Reference notes while editing without losing cursor state. | Opening a note preserves the unsaved draft. | [S05], [S24] |
| N-05 | E / P4 | Convert notes into world content | Preview conversion to an article while keeping provenance. | Conversion neither deletes nor silently publishes the note. | Our proposal |

## Tables, dice, generators and reusable content

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| G-01 | D / P4 | Typed interactive tables | Text, numbers, checks, images, links, articles and nested table references. | Column types validate edited and imported values. | [S21] |
| G-02 | D / P4 | Weighted table rolls and dice buttons | Validated weights and bounded formula evaluation. | Zero-weight rows are never selected. | [S21] |
| G-03 | D / P4 | CSV table import and editing | Previewed CSV mapping, sorting, resizing and row/column ordering. | Import errors report precise rows without partial overwrite. | [S21] |
| G-04 | D / P4 | Weighted and range generators | Versioned generator definitions for strings, numbers and resource picks. | A fixed test seed gives repeatable output. | [S22] |
| G-05 | D / P4 | Composed generators and conditional routers | Reference variables and bounded, typed branch expressions. | Cycles or excessive recursion stop with a useful error. | [S22] |
| G-06 | D / P4 | Generated article creation | Preview generated fields and persist as an ordinary editable article. | The saved result no longer changes when rerolled. | [S22] |
| G-07 | D / P4 | Embedded generators and table views | Use the normal editor component registry for generator controls. | Embedded output respects permissions on referenced records. | [S21], [S22] |
| G-08 | D / P4 | Variable collections and CSV import | Named collections and stable variable IDs with editable aliases. | Renaming a collection does not break its embeds. | [S23] |

## Manuscripts and long-form writing

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| B-01 | D / P4 | Books, chapters, scenes and research folders | Ordered writing hierarchy separate from reference lore. | Only selected publication nodes appear in the reader. | [S36] |
| B-02 | D / P4 | Write, review, read and corkboard modes | Different views over the same scene records and order. | Reordering on the corkboard updates chapter order. | [S36] |
| B-03 | D / P4 | Writing goals, labels and statistics | Word targets, progress, scene labels and daily counts. | Counts update consistently after moving a scene. | [S36] |
| B-04 | D / P4 | World reference and manuscript search | Read linked lore beside text; preview search/replace operations. | Reference lookup does not discard scene edits. | [S36] |
| B-05 | D / P4 | Draft versions, notes and recovery | Named snapshots, editorial notes and a recoverable bin. | Restore an earlier draft with its structure intact. | [S36] |
| B-06 | D / P5 | Chapter publication and restricted releases | Publish explicit revisions with public or group access. | Later draft edits cannot alter the published revision. | [S36], [S37] |
| B-07 | D / P5 | Covers, metadata, multimedia and export | Book presentation, local media, HTML/print and structured export. | A complete exported book opens without the application. | [S36], [S37] |

## Presentation, publication and community tools

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| P-01 | D / P5 | World and article themes | Design tokens, original themes, layout sections and preview. | Theme changes preserve article meaning and navigation. | [S39] |
| P-02 | D / P5 | Advanced per-world and per-article styles | Scoped CSS and reusable presentation components. | A theme cannot style the private management interface. | [S39], [S07] |
| P-03 | D / P5 | White label and custom domains | Application-owned branding and optional configured host names. | Configured hosts can serve the authorized published view. | [S01], [S47] |
| P-04 | D / P5 | Search metadata and optional analytics | Explicit public descriptions, canonical URLs and optional analytics adapters. | Private resources are absent from sitemaps and public metadata. | [S02] |
| P-05 | D / P5 | Comments, follows and notifications | World-local engagement events with per-resource permissions. | Revoked readers cannot receive new private notifications. | [S02], [S37] |
| P-06 | D / P5 | Discussion boards and moderation | Nested boards, threads and separate read/write/moderate rights. | Moderation actions are logged and access checked. | [S35] |
| P-07 | D / P5 | Play-by-post and character identities | Character-authored posts, OOC notes, GM instructions and rolls. | Only permitted identities can be used for a post. | [S35] |
| P-08 | D / P5 | Reader/supporter groups and batch import | Preview email/CSV membership import and grant revocation. | Replacement import shows exactly which grants change. | [S32], [S46] |
| P-09 | D / P5 | Supporter/store links and access offers | Marketing blocks and revocable access entitlements. | Store links never imply payment has been verified. | [S37], [S46] |
| P-10 | D / P6 | Instance discovery and creative challenges | Local showcase, prompts, submissions, deadlines and optional voting. | Only published, permitted submissions enter the showcase. | [S45] |
| P-11 | D / P6 | User profiles and instance activity feed | Instance-local profiles and permission-filtered activity aggregation. | Private activity never appears on a public profile or feed. | [S02], [S45] |
| P-12 | D / P6 | Feature suggestions and voting | An optional local feedback board with suggestions, votes and moderation. | A user cannot duplicate a vote or edit another user's suggestion. | [S02] |
| P-13 | D / P6 | Community reward accounting | Optional instance-local contribution points; separate from World Anvil currency. | Points cannot change content ownership or authoring permissions. | [S02] |

## Import, export and integrations

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| I-01 | D / P1 | Human-readable world export | Export HTML plus versioned structured data and an asset manifest. | An exported article can be read outside WorldBuilder. | [S40] |
| I-02 | U / P6 | World Anvil archive importer | Build adapters from real JSON/HTML export fixtures and preserve source IDs. | Every unsupported object appears in the migration report. | [S40], [S42] |
| I-03 | D / P5 | Documented application API | Versioned endpoints with scoped, revocable local tokens. | A read-only token cannot perform a mutation. | [S41], [S42] |
| I-04 | D / P5 | Foundry adapter | Separate module to read selected lore through WorldBuilder's API. | A supported Foundry release can import and refresh a journal. | [S43] |
| I-05 | D / P6 | D&D Beyond 2014 import equivalent | Preview a supplied or permitted public character export before replacement. | A supported fixture maps values without silent loss. | [S44] |
| I-06 | D / P5 | Webhook and external communication adapters | User-configured delivery with retries, logs and explicit event selection. | Retrying a delivery does not duplicate its application action. | [S02] |
| I-07 | D / P5 | Calendar and table interchange | Schema-versioned JSON and CSV adapters with visible mapping. | Round-trip fixtures retain fields and record references. | [S16], [S21] |
| I-08 | U / P6 | Full advanced markup import | Keep raw originals and report unsupported BBCode/layout constructs. | No unsupported tag is silently discarded. | [S07] |

## Local operation and data ownership

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| O-01 | E / P1 | Native Windows launcher | Start a loopback-only Django/Waitress process and open the browser. | Restart on Windows retains all saved content. | Our proposal |
| O-02 | E / P1 | SQLite database and local media | App-owned data directory with no hosted-service dependency. | Core create/edit/search works with the network disconnected. | Our proposal |
| O-03 | E / P1 | Consistent backup and tested restore | Snapshot the database and referenced immutable media as one archive. | Restore into an empty instance and verify every asset hash. | Our proposal |
| O-04 | E / P1 | Existing TouhouDND content import | Read-only scan, format preview and copy-import with source paths/hashes. | Original file bytes remain unchanged after import. | Our proposal |
| O-05 | E / P1 | Atomic changes and recovery history | Transactions, optimistic revision checks and a recoverable trash. | A stale browser tab cannot overwrite newer content silently. | Our proposal |
| O-06 | E / P5 | Future server deployment | Optional PostgreSQL/server profile with explicit database migration. | A verified migration retains IDs, links, grants and files. | Our proposal |

## Specific improvement targets

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| E-01 | E / P1 | Unified search across all resources | One permission-aware search index with aliases and Unicode normalization. | A secret cannot leak through search snippets or counts. | Our proposal |
| E-02 | E / P1 | Single source of truth | Typed relationships and references instead of duplicated profile/map data. | Rename one NPC and every linked view resolves it. | Our proposal |
| E-03 | E / P2 | One fictional-date engine | Integer-based ordering, precision and calendar conversion for all time tools. | Identical dates compare equally across all modules. | Our proposal |
| E-04 | E / P2 | Shared media across tools | One asset library for maps, Chronicles, articles and handouts. | The same source file needs no duplicate upload. | Our proposal |
| E-05 | E / P1 | Reliable autosave and tab conflict handling | Clear save state, revision IDs and recovery snapshots. | Simulated interruption loses no acknowledged save. | Our proposal |
| E-06 | E / P1 | Readable, accessible editing | Legible density, adjustable panels, keyboard control and accessible names. | The core editing workflow passes keyboard-only review. | Our proposal |
| E-07 | E / P5 | Optional simultaneous editing | Isolated collaborative documents per authorized scope; own hosted transport. | An unauthorized editor receives no restricted document data. | Our proposal |
| E-08 | E / P1 | No subscription feature gates | All installed modules usable locally; configurable resource limits only. | No feature requires a billing account to activate. | Our proposal |

## Service boundaries and external dependencies

| ID | Evidence / phase | Capability | Proposed implementation | Acceptance check | Sources |
| --- | --- | --- | --- | --- | --- |
| X-01 | X / P6 | World Anvil's existing audience and discovery network | Provide local community software; growing a community remains separate work. | Never describe an empty showcase as the existing WA network. | [S45] |
| X-02 | X / P6 | Professional seminars, promotion and freelancer network | Offer links or independent community equivalents where wanted. | No promise to reproduce World Anvil's staff or services. | [S01], [S02] |
| X-03 | U / P6 | Proprietary RPG and community content libraries | Track named system packs, permitted sources and individual availability. | No unimplemented or unavailable pack is marked supported. | [S30], [S48] |
| X-04 | U / P6 | Payment-provider automation and external service access | Provider-specific adapters only after actual API and account testing. | An adapter stays unverified until a real integration test passes. | [S46] |

## Source links

[S01]: https://www.worldanvil.com/pricing "Pricing and current tiers"
[S02]: https://www.worldanvil.com/learn/account/list-features "Features by Guild level"
[S03]: https://www.worldanvil.com/learn "Learning center"
[S04]: https://www.worldanvil.com/learn/article-templates "Article template guides"
[S05]: https://www.worldanvil.com/learn/article-guides/athena "Articles and World Manager"
[S06]: https://www.worldanvil.com/learn/interface/visual-text-editor "Visual editor"
[S07]: https://www.worldanvil.com/learn/bbcode-tutorials/basic-bbcode "BBCode formatting"
[S08]: https://www.worldanvil.com/features/article-automatic-linking "Automatic article linking"
[S09]: https://www.worldanvil.com/learn/categories/categories-guide "Categories"
[S10]: https://www.worldanvil.com/learn/tags/tags "Tags"
[S11]: https://www.worldanvil.com/features/search-explore "Search and exploration"
[S12]: https://www.worldanvil.com/learn/images/images "Images"
[S13]: https://www.worldanvil.com/learn/map-making/maps "Interactive maps"
[S14]: https://www.worldanvil.com/learn/timelines/timelines "Timelines"
[S15]: https://www.worldanvil.com/learn/chronicles/chronicles "Chronicles"
[S16]: https://www.worldanvil.com/learn/calendars/calendars "Calendars"
[S17]: https://www.worldanvil.com/learn/family-trees/family-trees-guide "Family trees and bloodlines"
[S18]: https://www.worldanvil.com/learn/diplomacy-webs/diplomacy-webs "Diplomacy webs"
[S19]: https://www.worldanvil.com/learn/content-trees/content-trees "Content trees"
[S20]: https://www.worldanvil.com/learn/whiteboards/whiteboards-guide "Whiteboards"
[S21]: https://www.worldanvil.com/learn/interactive-tables/interactive-tables "Interactive tables"
[S22]: https://www.worldanvil.com/learn/random-generators/random-generators "Random generators"
[S23]: https://www.worldanvil.com/learn/variables/variables "Variables"
[S24]: https://www.worldanvil.com/learn/notebook/notebook "Notebook"
[S25]: https://www.worldanvil.com/learn/todo-list/todo-list "To-do list"
[S26]: https://www.worldanvil.com/learn/meta/meta "World meta"
[S27]: https://www.worldanvil.com/learn/rpg/campaign-manager "Campaign manager"
[S28]: https://www.worldanvil.com/learn/rpg/dsts "Digital storyteller screen"
[S29]: https://www.worldanvil.com/learn/player/character-manager "Player character manager"
[S30]: https://www.worldanvil.com/learn/rpg/statblocks "Statblocks"
[S31]: https://www.worldanvil.com/learn/rpg/custom-blocks "Custom statblock templates"
[S32]: https://www.worldanvil.com/learn/access-rights/subscribers "Subscribers and access groups"
[S33]: https://www.worldanvil.com/learn/access-rights/co-authors "Co-authors"
[S34]: https://www.worldanvil.com/learn/secrets/secrets "Secrets"
[S35]: https://www.worldanvil.com/learn/discussion-boards/discussion-boards "Discussion boards"
[S36]: https://www.worldanvil.com/learn/manuscripts-guides/manuscripts "Manuscripts"
[S37]: https://www.worldanvil.com/features/publication "Publication"
[S38]: https://www.worldanvil.com/features/creative-studio "Creative Studio"
[S39]: https://www.worldanvil.com/learn/styling/css-basics "CSS and styling"
[S40]: https://www.worldanvil.com/learn/world/export "World export"
[S41]: https://www.worldanvil.com/learn/account/get-api-key "API access"
[S42]: https://www.worldanvil.com/api/aragorn/documentation "API reference"
[S43]: https://www.worldanvil.com/learn/rpg/foundry-integration "Foundry integration"
[S44]: https://www.worldanvil.com/learn/rpg/dndbeyond-importer "D&D Beyond import"
[S45]: https://www.worldanvil.com/learn/community/community-guide "Community"
[S46]: https://www.worldanvil.com/learn/access-rights/import-subscribers "Supporter batch import"
[S47]: https://www.worldanvil.com/learn/world/custom-domain "Custom domains"
[S48]: https://www.worldanvil.com/faq "Product FAQ"

