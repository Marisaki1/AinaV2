# Confirmed choices, unresolved details and research findings

Historical research baseline: 28 October 2026. External links/product descriptions below were not re-verified live during the 13 November local status audit. Current installation decisions and delivery classifications are in project-tracker.md and implementation-status.md. Unresolved items remain in scope; they are not silently excluded or marked complete.

## Confirmed with the user

- Project location: `TouhouDND/WorldBuilder`.
- Target: a self-hosted alternative covering World Anvil's features, with improvements.
- First deployment: only the user on this Windows PC.
- Browser implementation authorized on 29 October 2026. A working 0.1.0 local release is available; the full replacement scope remains tracked in implementation-status.md.

## Public documentation conflicts and limits

| Finding | Evidence | Planning consequence |
| --- | --- | --- |
| The map guide's quantity description conflicts with the pricing/free-tier summary. | [Maps](https://www.worldanvil.com/learn/map-making/maps), [pricing](https://www.worldanvil.com/pricing). | Do not use tutorial text as a definitive entitlement table. WorldBuilder has no subscription map quota. |
| The to-do guide says Guild access while the tier list includes a free to-do list. | [To-do guide](https://www.worldanvil.com/learn/todo-list/todo-list), [tier inventory](https://www.worldanvil.com/learn/account/list-features). | Implement the capability, not the contradictory billing restriction. |
| Maps annotate uploaded images; they do not draw the base map artwork. | [Map guide](https://www.worldanvil.com/learn/map-making/maps). | Map painters/procedural terrain are extra scope rather than a prerequisite for equivalent map tooling. |
| Calendars are repeating structures; timelines are historical sequences; Chronicles combine time with maps. | [Calendars](https://www.worldanvil.com/learn/calendars/calendars), [timelines](https://www.worldanvil.com/learn/timelines/timelines), [Chronicles](https://www.worldanvil.com/learn/chronicles/chronicles). | Specify three workflows backed by one date engine. One date-picker widget is insufficient. |
| Map and Chronicle images are separate from the regular image library in the documented product. | [Images](https://www.worldanvil.com/learn/images/images). | A unified WorldBuilder asset library is a concrete improvement target. |
| Manuscript co-writing is explicitly unavailable in the co-author guide. | [Co-authors](https://www.worldanvil.com/learn/access-rights/co-authors). | Real-time co-writing is an enhancement, not a prerequisite for documented parity. |
| Manuscript versioning is described as copying scenes; export is HTML with external conversion suggestions. | [Manuscripts](https://www.worldanvil.com/learn/manuscripts-guides/manuscripts). | Genuine revision snapshots and optional direct conversion are additional work; do not call the original's exports native DOCX/EPUB generation. |
| The D&D Beyond importer is documented for 2014 rules, not the 2024 sheet. | [Importer](https://www.worldanvil.com/learn/rpg/dndbeyond-importer). | Track the edition and actual adapter support; additional editions need their own verified importers. |
| Foundry uses an external module and an API token. | [Foundry guide](https://www.worldanvil.com/learn/rpg/foundry-integration). | Our adapter needs a compatible module and test environment; an API button alone is not integration. |
| Session media is embedded locally; background music is not broadcast to players. | [GM screen](https://www.worldanvil.com/learn/rpg/dsts). | Shared audio streaming is additional scope. Local playback can work offline for local files. |
| Supporter import is an email-list workflow. | [Subscriber import](https://www.worldanvil.com/learn/access-rights/import-subscribers). | Automatic payment synchronisation cannot be assumed to be part of that capability. |
| The Variables guide lists JSON Array as unimplemented. | [Variables](https://www.worldanvil.com/learn/variables/variables). | Do not count it as a working competitor feature. Typed collections could be an enhancement. |
| Public custom-domain setup documents limits on logged-in features. | [Custom domains](https://www.worldanvil.com/learn/world/custom-domain). | Later self-hosted domain/auth support should be tested together, rather than inheriting that restriction. |

## Details requiring further evidence during implementation

1. **Live UI completeness.** Public pages do not prove every option, edge case or release-specific behavior. Use a legitimate account walkthrough if exhaustive control-level matching is needed. No paid account was accessed in this research.
2. **Every article field and markup tag.** The documentation identifies the tools; complete field-level/markup compatibility needs a versioned mapping and input fixtures. Preserve unsupported originals.
3. **Every game system and sheet.** Enumerate the actual system/edition/block catalogue and the required data sources. A framework is not the finished catalogue.
4. **World Anvil migration fidelity.** Obtain representative user-owned archives to verify which records, links, media and settings are present. Do not advertise a lossless importer based only on the export guide.
5. **External adapters.** Foundry versions, public character-export formats, provider APIs and notification delivery need their own test environments. The Windows-only owner release can work without enabling them.
6. **Published versus draft changes.** Our design uses separate published snapshots; verify the desired behavior for edits, restores and partial chapter releases with real examples.
7. **Catalogue and community data.** We can supply software for catalogues, forums, challenges and discovery. World Anvil's users, staff, existing submissions and promotional reach are not a software deliverable.
8. **Actual hardware and performance.** The first release needs measurements on this PC. There is no measured storage capacity, map-size budget, import throughput or maximum world size yet.

## Discussion items; proposed defaults are not blockers

| Decision | Proposed default | Why it matters |
| --- | --- | --- |
| Content ownership | Application-owned database with previewed copy-import and regular open-format exports. | Live two-way editing of existing files adds conflict and synchronization work; it should be an explicit choice. |
| Import coverage | Existing campaign text/Markdown/HTML and images first, including extensionless text files. | Many current campaign files have no extension; filename-only import would miss them. |
| First RPG pack | Generic statblocks plus the user's actual Touhou/D&D rules. | Avoid a decorative character sheet that omits the mechanics used at the table. |
| Interface density | Readable desktop workspace with adjustable panels and strong search. | Validate with long articles, dense tables, maps and real session notes, not only a landing page. |
| Future player access | Keep the data/permission model ready; leave networking disabled. | All-feature scope remains intact without imposing server administration now. |
| Open-source distribution | Prefer an openly licensed application with recorded dependency licenses. | The user should retain the ability to maintain and extend their own installation. Exact project license remains a decision. |

No hosted service has been registered, no port opened, no package installed and no campaign files migrated by this research task.
