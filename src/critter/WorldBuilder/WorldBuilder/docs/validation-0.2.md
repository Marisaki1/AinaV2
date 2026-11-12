# Validation record — WorldBuilder 0.2.0

29 October 2026, on this Windows PC. The 0.1 baseline remains in [validation.md](validation.md); the current full scope is tracked in [implementation-status.md](implementation-status.md).

## Automated and browser results

- **68 Django tests passed.** The additional cases cover atomic subtree/bulk moves, stale revisions, final-tree cycle checks, ordering, world boundaries, smart-filter rules, reader-snapshot membership/ancestry, media metadata conflicts, deduplication, archive preservation, transient lock errors, reusable values, and renamed/removed references and backlinks.
- TypeScript, the staged production build, Python lint, formatting, and migration consistency checks passed.
- The existing **31-route** browser smoke check and table/calendar/whiteboard/manuscript/search interaction suite passed again.
- `scripts/qa/organization-ui.js` exercised actual collection creation, nested parents, bulk moves, preserved descendants, breadcrumbs, collapse/expand, drag/drop and reordering.
- `scripts/qa/smart-media-ui.js` edited image names/credits/tags, checked the unchanged image digest, created an entry/image tag collection, removed/restored membership by editing a tag, checked global image search and saved list/sort preferences. A fresh page load retained those preferences.
- `scripts/qa/reference-ui.js` created and linked a missing article while preserving the paragraph; checked hover/in-place previews, term insertion, pasted reference IDs, flushing pending edits on navigation, renamed labels/backlinks and preview cache refresh.
- `scripts/qa/parallel-edits.js` sent six simultaneous writes at revision 1: exactly one returned 200, five returned 409, and the entry ended at revision 2. Simultaneous reciprocal parent edits returned 200 and 400, preserving an acyclic hierarchy.
- Reviewed collection layouts at 1440×1000, 1024×768 and 390×844: no horizontal document overflow, failed assets or runtime errors in the normal workflows.
- Complete backup/restore and a portable-world round trip passed with the expanded fixture set, including nested collections, rules, tagged images, published snapshots and all present module kinds. Every restored image digest was checked.

The generic browser network logger reports deliberate 400/409 conflict cases as failures; the parallel-edit script's assertions explicitly require those responses. Ordinary screen and editing runs reported no errors. ProseMirror's source-less cursor separator images are excluded from image-load diagnostics; actual image requests remain checked.

Clipboard testing caught a parser-order defect: generic links were winning over structured references. Explicit parse priority fixed it. Rapid consecutive view changes also exposed an overwrite in preference persistence; a synchronous preference reference fixed it. Both workflows passed after correction.

## Upgrade and privacy boundaries

The existing 0.1 QA database was upgraded through the native launcher, which created a full backup before applying migration `0002_asset_revision_asset_tags`. Existing image IDs, hashes and resource references remained intact. Older images receive empty tags and metadata revision 1.

All test mutations used the guarded `.preview/qa-data` installation on port 8768. Saved-filter reader responses use published rules/tags/parents and omit owner media membership. Existing campaign files were not rewritten by this release.

The main application receives the checked bundle and database migration only after QA. Its launcher backs up existing data before migration. These checks cover the delivered single-owner workflows; full reader/group hosting, larger-world performance, complete accessibility and the remaining platform modules are still unfinished.

The main upgrade completed successfully. Its pre-migration backup passed checksum verification, and all original values in the user, world, resource, revision, connection, asset and activity tables matched after migration. SQLite integrity passed. The normal installation served version 0.2.0 with its existing account; its login screen had no runtime errors or failed assets. The previous browser bundle was retained under `.preview`.

## Reproduction

Use the setup/Edge commands in the baseline record, then:

```powershell
.venv\Scripts\python.exe backend\manage.py test studio --noinput
.venv\Scripts\ruff.exe check backend scripts --select F
npm.cmd run check
npm.cmd run build
npm.cmd run format:check
node scripts\browser-check.mjs --url http://127.0.0.1:8768/ --port 9225 --evaluate scripts\qa\organization-ui.js
node scripts\browser-check.mjs --url http://127.0.0.1:8768/ --port 9225 --evaluate scripts\qa\smart-media-ui.js
node scripts\browser-check.mjs --url http://127.0.0.1:8768/ --port 9225 --evaluate scripts\qa\reference-ui.js
node scripts\browser-check.mjs --url http://127.0.0.1:8768/ --port 9225 --evaluate scripts\qa\parallel-edits.js
```

The organization script establishes fixtures used by the following scripts. Set `WORLDBUILDER_DATA` to the isolated QA directory when running `scripts/verify_recovery.py`. The parallel-edit helper exits nonzero because its expected rejected requests are included in the generic network diagnostics; assess its returned assertions and expected-status list.
