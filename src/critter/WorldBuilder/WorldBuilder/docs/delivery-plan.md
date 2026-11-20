# Delivery plan and acceptance gates

Audited 13 November 2026. [feature-inventory.json](feature-inventory.json) is canonical; [implementation-status.md](implementation-status.md) is generated. The original 139 IDs remain traceable, but they are unequal scope rows, not a completion percentage.

## Current delivery contract

- Delivery states: planned, partial, implemented, external_boundary.
- Verification states: not_verified, subset_passed, passed_local, external_dependency. Passing a related test does not complete a broad capability.
- Separate local application work, mixed/later online work, named external integrations, and non-software service/content boundaries. Preserve original phase labels as history, not a priority schedule.
- Each row has concrete acceptance checks, source/test evidence, known remaining work, confidence and dependencies. Old one-line acceptance statements remain as originalAcceptance only.
- Prioritize connected local notes, campaign records, maps, search and recovery. Online membership/grants/deployment precede online social/public capabilities. Physical offline use, load, interruptions and accessibility are explicit quality gates.
- External communities, human services and unavailable proprietary catalogues cannot be completed by local code. Named adapters need supported format/version fixtures and actual integration tests when required.
- Keep immutable source IDs, rich prose, unknown fields, revision/Trash recovery and owner/reader isolation. No status/documentation operation should change production account/world data.

Evidence must name the tested application/source snapshot, commands, fixtures, outcomes and boundaries. Historical reports are not fresh verification. See [status-audit.md](status-audit.md) and the per-file index. A successful API response or existing UI control is not sufficient evidence for the capability named on it.

## Historical phase baseline

The following phase plan preserves the original intent. Its full-suite aspirations are not delivered status; current scope/priority/dependencies in the canonical inventory supersede its ordering. External services remain prerequisites, not mandatory software-completion rows.

## P0 — This research and discussion

Deliverables: public-source register, capability matrix, article-family catalogue, Windows-first architecture, migration approach, unresolved details and this build sequence. No runtime or external deployment is part of P0. Public-documentation coverage is broad, while authenticated UI behavior, exact markup and system-pack completeness remain explicitly unresolved.

## P1 — A trustworthy local knowledge workspace

Deliver the native Windows launcher, local owner account, SQLite/media storage, world switching, readable article editor, documented article families, categories, tags, stable links, cross-reference previews, search, private notes/blocks, to-do capture, revision checks, copy-import, backups and basic export. Implement common identity, access, dates and revision contracts before specialized modules depend on them.

End-to-end proof: import a user-selected copy of representative TouhouDND material; open an NPC and its location, edit and link them, search by alias, restart the app, restore an earlier revision, export the world, and restore the full backup into a clean directory. Compare original source hashes before/after. Simulate two stale editing tabs. Exercise reader/outsider policy tests even though only the owner uses the local release.

This is the first useful release, not completion of World Anvil parity. No empty advanced-module screens should be represented as delivered features.

## P2 — Maps, history and relationships

Deliver image maps and geometry, private layers/groups, linked map navigation, family and bloodline queries, directional diplomacy, content hierarchies, calendars, historical timelines and Chronicles. Reuse the shared asset, date, permission and identity models.

End-to-end proof: connect a character to relatives and factions, place a linked location on a map, add an event in a custom calendar with a leap rule, show it in multiple timeline lanes, and scrub a Chronicle through an image/border change. Verify a hidden relative/marker/event does not reveal its title through another view. Check all graph/map controls with a keyboard-accessible alternative.

## P3 — Campaign and player tools

Deliver parties, cast, quests, inventory, plots, session scheduling/reports, the GM workspace, dice log, handouts, local media, player profiles, journals and actual working sheets for the first named rules packs. Distinguish real-world session time from fictional chronology.

End-to-end proof: prepare and run a representative session locally, reference an NPC/statblock, resolve a roll, update party inventory and a quest, reveal a handout in the reader window, and record a session report. Test GM/player views with separate sessions. A sheet is complete only when its named rules/edition fixtures pass; no claim of a hundred-system catalogue at this stage.

## P4 — Creation and writing tools

Deliver original custom article schemas, a homebrew sheet designer, interactive tables, weighted and conditional generators, reusable variables, notebook templates/metadata, whiteboards and the writing workspace: chapters/scenes, outline, corkboard, goals, labels, reference lookup, versions and recovery.

End-to-end proof: define a custom Touhou entity template, generate a named NPC into a saved article, reuse a variable in several pages, import a CSV encounter table, reopen a linked whiteboard, and reorganize a manuscript. Show that generated results persist as editable records and that saved manuscripts recover after interruption.

## P5 — Complete reader, collaboration and integration surfaces

Deliver public/private reader rendering, themes, scoped CSS, author roles/groups, visibility previews, published snapshots, codes/passwords, forums and play-by-post, notifications/feeds, publishing metadata, supporter membership import, documented API, export formats, Foundry adapter and an optional shared-server profile. Simultaneous editing is an explicit enhancement and can ship after revision-conflict handling is stable.

The owner-only local deployment remains available without Docker or network sharing. Publication controls must not enable public access by themselves. The later shared profile needs real HTTPS/auth/media tests, a PostgreSQL migration verification and a deployment/restore runbook before being used for players.

Confirmed user requirement, 5 November 2026: after the local scope is accounted for, support online self-hosting with separate player accounts and selective sharing of lore, characters and relationships. Include per-world memberships, invitations and revocation, individual/group grants, permission-filtered graph edges and endpoints, media/download checks, and an owner preview as a particular player. Verify owner, differently authorized players, revoked players and outsiders in separate sessions. This is planned P5 work; the current saved reader preview does not implement it. See the detailed checklist in [project-tracker.md](project-tracker.md).

End-to-end proof: compare owner, writer, two different reader groups and outsider access across every renderer/API; publish a snapshot and continue editing privately; revoke a reader and a token; restore backups with permissions intact. Verify the Foundry adapter against a named supported Foundry version. A successful API response alone is not a verified integration.

## P6 — Resolve compatibility and catalogue breadth

Complete the tag-by-tag markup mapping, real World Anvil archive adapters, named game-system/edition catalogue, supported character importers, package catalogue and independent community/challenge tools. External providers require their own adapters and actual test evidence.

Every object omitted by a migration must appear in the report and retain its raw original. System support must list concrete pack names, block types, editions, versions and remaining limitations. Documented service/network benefits remain X: software cannot deliver World Anvil's established audience, staff seminars or promotional placement.

P6 is required scope, not a place to hide unresolved promises. It cannot be marked complete while U items remain unexamined or supported systems are unnamed.

## Cross-module verification

| Area | Required evidence |
| --- | --- |
| Disk persistence | Restart, interruption, atomic save and stale-tab scenarios on Windows. |
| Recovery | Restore an archive into an empty installation; verify content, asset hashes, relationships and grants. |
| Privacy | Direct URLs, APIs, embeds, source markup, media, search snippets/counts, graphs, exports and notifications. |
| Dates | Negative years, no-year-zero policy, precision/uncertainty, leap/intercalary rules, celestial phases and explicit cross-calendar epochs. |
| Maps | Zoom alignment, layer permissions, editable geometry, image replacement and historical versions. |
| Import | Extensionless text, encoding, nested paths, image links, duplicate detection and unsupported-format reporting. |
| Rules and generators | Edition-specific calculations, bounded expressions, random weights, fixed-seed tests and recursion limits. |
| Editing | Long documents, paste/import, mentions, undo, autosave, recovery and draft/published separation. |
| Interface | Legible desktop layouts, keyboard operation, useful empty states and real campaign screenshots. |
| Offline behavior | Disconnect the network and exercise all core local modules. Remote embeds should fail clearly without blocking the app. |
| Performance | Measure against a disclosed representative dataset on this PC; publish results before setting capacity claims. |
| External integration | Named provider/version, fixture provenance, successful real operation and visible failure handling. |

No calendar estimate is claimed here. The initial implementation should validate the save/edit/link/search/backup foundation before multiplying modules, while retaining the complete checklist as the destination.

## Concrete first workflow for discussion

1. Start WorldBuilder locally and open a Touhou world.
2. Preview a small import from the existing folder tree, with DM notes kept private.
3. Open an NPC in a readable editor and link its location and faction.
4. Search by a second name, inspect backlinks, and preview the reader-safe article.
5. Edit in two browser tabs and demonstrate a visible conflict rather than losing one version.
6. Restart, export and restore into a separate empty directory.

This workflow is the first implementation target. The remaining modules are still required by the full project scope.
