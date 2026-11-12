# Sources and research boundaries

Reviewed on **28 October 2026**. Sources S01–S48 are World Anvil's public pages. T01–T10 are official implementation references. The descriptions below are brief research notes; implementation proposals in the other documents are our design, not claims about World Anvil internals.

This is a documentation audit. No paid account, authenticated editor, World Anvil API account, export archive, or external integration was exercised. Public documentation can be outdated or inconsistent. Exact UI parity, every game-system template, every markup tag and undocumented behavior remain verification work. The feature inventory is a coverage baseline, not certification of exhaustive parity. This source audit predates implementation; current delivery is recorded in [implementation-status.md](implementation-status.md).

| ID | Source | Research purpose / limitation |
| --- | --- | --- |
| S01 | [Pricing and current tiers](https://www.worldanvil.com/pricing) | Cross-check current tier boundaries; limits are not WorldBuilder quotas. |
| S02 | [Features by Guild level](https://www.worldanvil.com/learn/account/list-features) | Broad feature discovery, including professional, privacy, API and legacy tier details. |
| S03 | [Learning center](https://www.worldanvil.com/learn) | Documentation topic index; guide counts do not equal feature or template counts. |
| S04 | [Article template guides](https://www.worldanvil.com/learn/article-templates) | Template families and domain distinctions. |
| S05 | [Articles and World Manager](https://www.worldanvil.com/learn/article-guides/athena) | Tree/list organization, article states, inline reference editing and reader preview. |
| S06 | [Visual editor](https://www.worldanvil.com/learn/interface/visual-text-editor) | Blocks, mentions, placeholder creation, embeds and dice controls. |
| S07 | [BBCode formatting](https://www.worldanvil.com/learn/bbcode-tutorials/basic-bbcode) | Markup categories; exact import tag compatibility still needs a tag-by-tag fixture suite. |
| S08 | [Automatic article linking](https://www.worldanvil.com/features/article-automatic-linking) | Automatic and reviewed cross-link suggestions. |
| S09 | [Categories](https://www.worldanvil.com/learn/categories/categories-guide) | Nested organization and category presentation. |
| S10 | [Tags](https://www.worldanvil.com/learn/tags/tags) | Cross-resource tags and automatically populated lists. |
| S11 | [Search and exploration](https://www.worldanvil.com/features/search-explore) | World-wide resource search, cross-references and quick creation. |
| S12 | [Images](https://www.worldanvil.com/learn/images/images) | Folders, galleries, replacement, credits, private images and batch editing. |
| S13 | [Interactive maps](https://www.worldanvil.com/learn/map-making/maps) | Uploaded image annotations, layers, marker types and visibility; map artwork creation is separate. |
| S14 | [Timelines](https://www.worldanvil.com/learn/timelines/timelines) | Events, eras, lanes, list/timescale views and event visibility. |
| S15 | [Chronicles](https://www.worldanvil.com/learn/chronicles/chronicles) | Linked map/time exploration, evolving maps, calendar and timeline configuration. |
| S16 | [Calendars](https://www.worldanvil.com/learn/calendars/calendars) | Custom recurring calendar structure and celestial cycles; distinct from historical timelines. |
| S17 | [Family trees and bloodlines](https://www.worldanvil.com/learn/family-trees/family-trees-guide) | Kinship, descendants and extended character relationships. |
| S18 | [Diplomacy webs](https://www.worldanvil.com/learn/diplomacy-webs/diplomacy-webs) | Directional relationship scores and official diplomatic labels. |
| S19 | [Content trees](https://www.worldanvil.com/learn/content-trees/content-trees) | Interactive/static/text hierarchy views, tagged population and item access. |
| S20 | [Whiteboards](https://www.worldanvil.com/learn/whiteboards/whiteboards-guide) | Free-form shapes, text, connectors and world-resource cards. |
| S21 | [Interactive tables](https://www.worldanvil.com/learn/interactive-tables/interactive-tables) | Typed columns, weighted rolls, dice buttons, CSV and embeds. |
| S22 | [Random generators](https://www.worldanvil.com/learn/random-generators/random-generators) | Weighted inputs, composed outputs, variables, conditional routers and article creation. |
| S23 | [Variables](https://www.worldanvil.com/learn/variables/variables) | Reusable content and tooltips; JSON Array type is explicitly unimplemented in this guide. |
| S24 | [Notebook](https://www.worldanvil.com/learn/notebook/notebook) | Account-private notebooks, sections, notes, metadata and note templates. |
| S25 | [To-do list](https://www.worldanvil.com/learn/todo-list/todo-list) | Priorities and work states linked to article creation/progress; tier text conflicts with S02. |
| S26 | [World meta](https://www.worldanvil.com/learn/meta/meta) | Creative goals, scope, themes, setting principles and inspiration. |
| S27 | [Campaign manager](https://www.worldanvil.com/learn/rpg/campaign-manager) | World campaigns, cast, parties, quests, equipment, plots, sessions and primer. |
| S28 | [Digital storyteller screen](https://www.worldanvil.com/learn/rpg/dsts) | Party/dice stream, reference library, session plan, handouts and media; music is not broadcast to players. |
| S29 | [Player character manager](https://www.worldanvil.com/learn/player/character-manager) | Profiles, character posts, sheets, equipment, scrapbook, galleries, journals and history. |
| S30 | [Statblocks](https://www.worldanvil.com/learn/rpg/statblocks) | System-specific sheets, collections, article embeds and community library. |
| S31 | [Custom statblock templates](https://www.worldanvil.com/learn/rpg/custom-blocks) | Field configuration and custom presentation; WA uses HTML/CSS/Twig, with YAML field import. |
| S32 | [Subscribers and access groups](https://www.worldanvil.com/learn/access-rights/subscribers) | Group access, item/section restrictions, defaults and optional self-enrolment. |
| S33 | [Co-authors](https://www.worldanvil.com/learn/access-rights/co-authors) | Different authoring roles; guide says Manuscripts do not support co-writing. |
| S34 | [Secrets](https://www.worldanvil.com/learn/secrets/secrets) | Reusable restricted snippets, reveal actions and separately private GM notes. |
| S35 | [Discussion boards](https://www.worldanvil.com/learn/discussion-boards/discussion-boards) | Boards/threads, moderation, posting as characters and play-by-post dice fields. |
| S36 | [Manuscripts](https://www.worldanvil.com/learn/manuscripts-guides/manuscripts) | Scene/chapter structure, writing/review/corkboard/read modes, goals, versions and publishing. |
| S37 | [Publication](https://www.worldanvil.com/features/publication) | Reader interface, serialized releases, engagement and supporter/store links. |
| S38 | [Creative Studio](https://www.worldanvil.com/features/creative-studio) | Custom pins, custom article/sheet tooling; not an image-generation feature. |
| S39 | [CSS and styling](https://www.worldanvil.com/learn/styling/css-basics) | Scoped styling and presentation controls. |
| S40 | [World export](https://www.worldanvil.com/learn/world/export) | Printable export and advanced JSON/basic-HTML archive; exact resource completeness needs sample exports. |
| S41 | [API access](https://www.worldanvil.com/learn/account/get-api-key) | Distinguishes user tokens from application keys. |
| S42 | [API reference](https://www.worldanvil.com/api/aragorn/documentation) | Published v1 contract and pagination; not evidence every UI feature is exposed. |
| S43 | [Foundry integration](https://www.worldanvil.com/learn/rpg/foundry-integration) | External module imports/reads lore; not a built-in full VTT. |
| S44 | [D&D Beyond import](https://www.worldanvil.com/learn/rpg/dndbeyond-importer) | Documented importer is for 2014 5e characters; it replaces sheet contents. |
| S45 | [Community](https://www.worldanvil.com/learn/community/community-guide) | Community activities, discovery and challenges; a network cannot be reproduced by code alone. |
| S46 | [Supporter batch import](https://www.worldanvil.com/learn/access-rights/import-subscribers) | Email-list membership import, not proof of automatic payment synchronisation. |
| S47 | [Custom domains](https://www.worldanvil.com/learn/world/custom-domain) | Domain configuration; public guide documents restrictions on logged-in features. |
| S48 | [Product FAQ](https://www.worldanvil.com/faq) | Advertises sheets for over a hundred systems; individual system/template availability still needs enumeration. |
| T01 | [Django database support](https://docs.djangoproject.com/en/5.2/ref/databases/) | SQLite and PostgreSQL support, with backend differences. |
| T02 | [Django object permissions](https://docs.djangoproject.com/en/5.2/topics/auth/customizing/#handling-object-permissions) | Object-level enforcement is not automatically supplied by Django core. |
| T03 | [Waitress](https://docs.pylonsproject.org/projects/waitress/en/latest/) | Native Windows-compatible WSGI serving. |
| T04 | [SQLite FTS5](https://www.sqlite.org/fts5.html) | Local search indexing and tokenizer capabilities. |
| T05 | [SQLite backup API](https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup) | Consistent database snapshot capability; media consistency must also be handled. |
| T06 | [Leaflet image coordinates](https://leafletjs.com/examples/crs-simple/crs-simple.html) | Non-geographical image-coordinate maps. |
| T07 | [Tiptap core license](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md) | MIT-licensed core; paid services/extensions are not assumed free. |
| T08 | [React Flow](https://reactflow.dev/learn) | Graph editor library; MIT license link confirmed on official documentation. |
| T09 | [Excalidraw license](https://github.com/excalidraw/excalidraw/blob/master/LICENSE) | MIT-licensed whiteboard core; hosted collaboration is a separate integration task. |
| T10 | [PostgreSQL JSON](https://www.postgresql.org/docs/current/datatype-json.html) | Optional future server database, not required for the Windows-only first deployment. |

