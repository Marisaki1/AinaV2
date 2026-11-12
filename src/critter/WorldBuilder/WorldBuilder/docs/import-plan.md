# Existing TouhouDND content: import implementation and target

Status: previewed copy-import is implemented in 0.1.0. One selected real note was copied into the isolated QA workspace and all 34 scanned source hashes stayed unchanged. Your real WorldBuilder database remains empty. Relative links, advanced markup and live synchronization remain future work. The mappings below remain the full migration target.

## What the workspace tells us

The campaign includes folders for `Bestiary`, `DM Notes`, `Main Story`, `NPC Catalogue`, `Shops`, `Tower` and `images`, alongside the separate `Character Creator` project. The sampled file list contains many extensionless text documents as well as Markdown and HTML.

The repository's `.gitignore` excludes `images/`, `DM Notes/`, `Bestiary/` and part of the NPC catalogue. A default `rg --files` or Git inventory is therefore not a complete campaign inventory. An actual importer must scan the user-selected campaign folders directly, with explicit exclusions for application code/runtime directories. Git-ignored campaign content must not be silently skipped or accidentally added to Git.

## Proposed mapping, to be previewed

| Source | Suggested destination | Important qualification |
| --- | --- | --- |
| NPC Catalogue | Character articles, aliases, affiliations and optional statblocks. | Detect duplicates and separate lore from a player-owned profile. |
| Bestiary | Species/creature lore and linked mechanical statblocks. | A monster type and a named individual are different records. |
| DM Notes | Private notebooks, session plans or restricted blocks. | Default to private; any later reveal is explicit. |
| Main Story | Plot articles and optionally manuscript chapters/scenes. | Preserve source ordering and distinguish drafts from final prose. |
| Shops | Place/organization articles and inventory tables where appropriate. | Do not infer item prices or ownership rules from filenames alone. |
| Tower | Nested locations, room/building articles, plots and session material. | A floor's geography, encounters and secrets should retain distinct roles. |
| images | Shared media library with original filenames and source paths. | Preserve original bytes, credits where present and relative references. |
| Character Creator | Selected finished portrait images, if wanted later. | Do not execute or import its application code as world content. |

## Import stages

1. **Select and scan.** Limit scanning to the selected root/subfolders. Classify by content as well as extension; inspect encodings and file signatures. Skip `.git`, environments, dependencies, application runtime and the WorldBuilder project itself. Do not execute scripts or imported HTML.
2. **Preview.** Show counts, proposed types, destination hierarchy, relative image-link resolution, encodings, duplicates and unsupported files. Ambiguous notes remain generic/private unless the user chooses a mapping.
3. **Record provenance.** Store original relative path, content hash, encoding, raw source and import-run ID. Create an external-to-internal ID map before linking references.
4. **Copy and translate.** Import text, Markdown and sanitized HTML into versioned documents. Copy media into app-owned storage; retain raw originals for export/recovery. A failed file should have a precise visible error rather than disappearing.
5. **Resolve links.** Rewrite relative links through the import map. Resolve cross-article mentions and report ambiguous or missing targets; do not create duplicate entities silently.
6. **Validate and report.** Compare source hashes before/after and imported resource/asset counts. Show all warnings and unresolved items. Keep imports private until publication is deliberately chosen.
7. **Support later re-import.** Match prior source path/hash, preview changed files and detect divergent application edits. A re-import must not overwrite an edited article automatically.

Live bidirectional synchronization with existing files is a separate design choice. The proposed first version uses previewed copy-import and regular Markdown/HTML/JSON export because that has a clearer ownership and conflict model.

## World Anvil migration

The [documented advanced export](https://www.worldanvil.com/learn/world/export) provides JSON and basic HTML in a structured archive. The exact resource set, attachment handling and schema need representative user-owned archives before promising fidelity. Treat API access as an optional adapter rather than a requirement to use WorldBuilder. A user can work entirely from their existing local files without a World Anvil account.

The archive importer must preserve source IDs, map them to local IDs, retain unrecognized data and produce a loss report. Rich export import and static HTML import are different compatibility levels; static pages may not contain editable relationship, map or timeline metadata.
