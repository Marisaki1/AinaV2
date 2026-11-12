# Article and system template catalogue

Status: requirements catalogue, reviewed 28 October 2026. Release 0.1.0 provides 26 original basic article field sets and editable custom fields. Full smart layouts, rule packs and complete system coverage remain future work; see [implementation status](implementation-status.md).

The [article guide index](https://www.worldanvil.com/learn/article-templates) contains 29 guides, including several workflow guides. **29 guides is not a verified count of distinct available article templates.** The following 26 families have a dedicated template guide in that index. This is a documented starting catalogue; a live template-picker audit is still required before asserting exhaustive coverage.

| Family | Proposed WorldBuilder structure |
| --- | --- |
| Character | Identity, descriptions, relationships, affiliations and linked RPG profile. |
| Organization | Membership, leadership, hierarchy, territories and directional diplomacy. |
| Ethnicity / culture | Cultural identity, customs, language and linked communities. |
| Species | Biology, ecology, traits and taxonomy relationships. |
| Geography | Nested natural places and linked maps. |
| Settlement | Population, institutions, districts, locations and relevant groups. |
| Building | Purpose, occupants, rooms, owner and geographical parent. |
| Item | Properties, origin, ownership, materials and linked mechanical block. |
| Material | Properties, sources and referenced uses. |
| Vehicle | Crew, capabilities, dimensions, owner and travel context. |
| Technology | Principles, prerequisites, applications and technology-tree relations. |
| Natural law | World rules, limitations, implications and related systems. |
| Spell | Effects, limits, tradition and optional RPG mechanics. |
| Condition | Symptoms/effects, causes, progression and linked rules. |
| Language | Linguistic notes, speakers, scripts and dictionary references. |
| Tradition | Participants, calendar links, practices and variations. |
| Profession | Responsibilities, training, social context and relevant organizations. |
| Title / rank | Duties, requirements, granting authority and holders. |
| Military formation | Organization, command, composition and deployment context. |
| Conflict | Belligerents, causes, phases, events and outcomes. |
| Document | In-world author, contents, provenance and copies. |
| Myth | Narrative, interpretations, sources and disputed truth. |
| Plot | Stages, participants, hooks and linked sessions/scenes. |
| Prose | Narrative text with normal media and reference components. |
| Session report | Session participants, summary, events, loot and unresolved threads. |
| Generic article | Flexible prose, fields and sections for everything else. |

These are our proposed fields and organization, not copied World Anvil prompt text or a claim that every listed field exists there. The implementation should preserve both structured values and flexible prose. NPC/PC status, religion, locations, clans, shops and Touhou-specific distinctions can be schema variants or linked entities rather than duplicate articles for the same thing.

## System packs are a separate catalogue

The [official FAQ](https://www.worldanvil.com/faq) advertises character sheets for over a hundred systems. A generic schema designer does not supply all those actual sheets, calculations or rule data. The [statblock guide](https://www.worldanvil.com/learn/rpg/statblocks) also explains that template availability varies by system and community contributions.

Planned package contract: system identifier, edition, version, supported block types, field schema, calculation rules, display layout, import adapters, fixtures, provenance and dependency declarations. Treat D&D 5e 2014 and 2024 as separate editions. The user's Touhou homebrew needs its own documented fields and rules; existing campaign notes are useful input, not automatic proof of the rules.

The first usable rules pack should match the campaign actually being run, alongside a generic manual statblock. Full catalogue parity stays unresolved in feature S-08 until the concrete World Anvil system/block list and required pack fixtures are enumerated. No unsupported system will be marked available just because a generic editor exists.
