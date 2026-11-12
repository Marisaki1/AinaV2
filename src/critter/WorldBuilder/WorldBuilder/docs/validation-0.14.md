# Validation record - 0.14.0

Date: 5 November 2026. Single-owner Windows browser application. Synthetic worlds, browser fixtures and recovery data stayed in `.preview`.

## Campaign map/location guide

Campaigns > campaign > Maps now displays an interactive guide beside a location inspector. Pins and searchable location buttons select existing lore. The inspector shows location text/GM notes, connected campaign characters and related notes, journal records, sessions, quests, tasks, historical events and milestones. Filters select record types. Notes, journal entries and milestones can be created at a linked or unlinked pin with real/in-world dates and a related session. New records start private and retain normal revision/archive support.

The regular note/session/quest/task editor exposes map and location associations, including unavailable recorded pins. The map editor's Explore map guide action and reader preview use the same guide. When writing outside a campaign workspace, the form can associate the note with a campaign or leave it in the world notebook. Campaign guides enforce map membership and record scope on the server.

Reader guides use published map/location/campaign/record definitions. Private markers/groups, private notes, hidden characters and GM fields are filtered. Public notes associated with a hidden pin are not reinterpreted as general map notes when that pin ID is removed from a reader projection. This does not change the independent publication status of the note itself.

## Automatic source links: USER-03

Prose reading views automatically hyperlink matching world entry titles and aliases to source UUIDs. Matching preserves the original words, case and text formatting. Longer names take precedence; ambiguous names are skipped. Existing hyperlinks/explicit references, inline/block code, URLs/email addresses, folders and self-links are not relinked. Reader links consider only visible published titles/aliases; private duplicates do not influence reader matches.

Read linked notes opens the linked reading view in the editor. Clicking a generated owner link opens the existing source preview. Map, affinity and reader prose use the same rendering. A world setting disables/re-enables automatic links. Documents, revisions, stored references and writing mode text are not rewritten.

This is name-based reading-time linking, within each text span, with Unicode word boundaries and names at least two characters long. It does not add stored backlinks or match across formatting splits. To retain an automatic old-name match after renaming a source, keep that name as an alias; explicit references retain their stable association. The broader visual-guide requirement USER-02 remains partial.

## Checks and evidence

- **340 backend tests passed**, including all 308 previous tests and 32 new map-guide/automatic-link cases. Coverage includes names/aliases/case, longest match, punctuation, ambiguity, code/URL/existing-link exclusion, formatting and source immutability, Unicode/escaping, reader visibility/publication/aliases, private duplicates, new sources, world isolation, opt-out and portable regeneration. Map cases cover campaign cast/record scope, private markers/groups and records, published location snapshots, unavailable campaigns, unlinked pins, map-wide records, invalid associations, retained removed-pin metadata, deleted locations, private map IDs, ownership and archive remapping. Evidence: `backend/studio/test_auto_links.py`, `backend/studio/test_map_guide.py`, `.preview/backend-tests-0.14.txt`. The 32 targeted tests also passed after owner reference lookups were reused in guide responses: `.preview/guide-link-tests-0.14.txt`.
- Browser map workflow passes for selection, location text, connected character, journal/session records, source hyperlinks, search, private milestone creation with map/pin/session identity, progression filtering, unlinked pins and switching maps without a stale pin request. `.preview/guide-ui-0.14.json`.
- Browser automatic-link workflow checks all three title/alias matches, original wording/source UUID, source preview on click, unchanged document/revision, read/write switching and the owner map-guide modal. `.preview/auto-links-ui-0.14.json`.
- Actual settings UI disables/re-enables links. Entry navigation resets the reading view without showing the previous entry's text. `.preview/auto-links-settings-0.14.json`.
- Reader browser checks click an actual map pin and verify public location context/source links while excluding private pins, private milestones, GM location/session/relationship text and hidden record identities. `.preview/guide-reader-0.14.json`.
- At **390, 1024 and 1440 pixels**, map/inspector layouts fit, notes remain accessible, and note-type/session dropdowns stay inside their modal/viewport with the filter focused. Screenshots inspected. `.preview/guide-mobile-0.14.json`, `.preview/guide-tablet-0.14.json`, `.preview/guide-desktop-0.14.json` and corresponding PNGs.
- The **31-route smoke suite**, earlier affinity reader workflow and historical-map/timeline layout/privacy checks pass. Final positive reports have no JavaScript exceptions or failed requests/assets. `.preview/smoke-0.14.json`, `.preview/affinity-regression-0.14.json`, `.preview/map-history-regression-0.14.json`.
- TypeScript, Prettier, targeted Python checks, Django checks and production build pass. The dropdown AST guard counts **68 searchable code locations**. No dependency or schema migration was added; migration generation reports no changes.
- Complete backup/download/checksum, restored counts/image hashes, SQLite integrity, existing-destination protection and portable-world checks pass. QA recovery retained **228 entries, 369 entry revisions, two images, 38 connections and 49 connection revisions**. `.preview/recovery-0.14.json`.

Testing corrected a harness that assumed the first campaign map was a particular fixture and an assertion that read records before the inspector refresh finished. Implementation review prevented stale pin selection when switching maps, reading state leaking across entries, duplicate map prose, and hidden-pin records being promoted into an overview. Owner guide serialization reuses already projected references rather than querying them once per note.

## Scope and continuation

All 139 original scope rows remain accounted for: **27 verified local acceptance, 68 partial, 44 planned**. USER-03 is recorded separately as verified for the stated prose-reading workflow. Further visual character progression, richer nested-map navigation, advanced semantic/cross-format linking, automatic backlinks, broader load/accessibility tests and later player sharing remain. The guide shows up to 100 character connections and the latest 200 matching records, with explicit totals; older notes remain in the notebook.

## Local installation

Created and checksum-verified real backup **2026-11-05_21-36-40_b36772.wbbackup.zip** before replacing the browser bundle. Previous bundle retained at `.preview/dist-previous-20261105-213659`. The installed server reports **0.14.0**, `test_workspace: false`, at `http://127.0.0.1:8767/`. All **22 table counts and full content hashes**, media hashes and SQLite integrity match the pre-upgrade baseline. Real data remains **two worlds, three entries, zero connections and no images**. Evidence: `.preview/main-0.14-before.json`, `.preview/upgrade-0.14-result.json`.

The installed login page loads without JavaScript errors or failed assets/requests. Evidence: `.preview/main-0.14-browser.json`, `.preview/main-0.14-login.png`. The isolated QA server/browser were closed; the main local server remains running.
