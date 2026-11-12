# Validation record - WorldBuilder 0.1.0

Date: 29 October 2026. Platform: this Windows PC, Python 3.13.3, Node 22.15.1, installed Microsoft Edge. Scope: single local owner, native Waitress server, compiled React interface. This record establishes the checks below; it does not certify zero defects or full World Anvil parity.

## Automated backend checks

`50` Django tests passed. Coverage includes:

- Initial setup, repeat setup refusal, weak password rejection, anonymous access, foreign-owner objects, loopback/host checks and CSRF.
- Creation/editing, expected-revision conflicts, restoration as a new revision, Trash, parent/ancestry cycles and atomic reorder rollback.
- Unicode/CJK/alias/body/structured-field search, stable references, renamed labels, backlinks and cross-world reference rejection.
- Saved reader snapshots: drafts, private notes/blocks, hidden map pins and unpublished variable values stay excluded. Private reference labels are redacted.
- Document depth/shape, malformed links, unsafe imported markup, non-finite values, invalid map coordinates, invalid module data and incomplete formulas.
- Real image validation, authenticated media, hash deduplication, quoted/malformed CSV, bounded dice, dice table cells, weighted selection and signed/leap-calendar dates.
- Import preview hashes, extensionless files, unchanged sources, duplicate prevention, changed-source conflict and path traversal rejection.
- World archive round trip, published snapshots, historical dates preserved across calendar-definition changes, remapped IDs/media/parents/relationships, readable HTML with notes/fields/links, corruption and unsafe archive paths.

Reproduce from WorldBuilder:

```powershell
.venv\Scripts\python.exe backend\manage.py test studio --noinput
.venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
.venv\Scripts\ruff.exe check backend scripts --select F
npm.cmd run check
npm.cmd run build
npm.cmd run format:check
```

`requirements-dev.txt` installs the optional Python formatter/linter. Build dependencies are locked. No migrations were missing. Django's ordinary system check passed. Its internet-deployment check reports the expected HTTPS/HSTS/secure-cookie warnings for this intentionally HTTP loopback profile; this profile must not be exposed to a network as a public deployment.

## Browser verification

Tests use `.preview/qa-data` and port **8768**, separate from real `data` on **8767**. QA evaluators refuse other data directories/ports. QA fixtures are synthetic except for one explicitly selected copy-import. No fixtures or test accounts were inserted into the real installation.

The Edge/CDP helper is [scripts/browser-check.mjs](../scripts/browser-check.mjs). It inspects runtime errors, failed requests/images, dimensions and screenshots. It supports same-document hash navigation. A hidden Edge process uses a separate `.preview/edge-profile` with remote debugging on 9225; no browser package is required.

Passed workflows:

| Scenario | Evidence |
| --- | --- |
| Fresh setup, actual create dialog and rich-text autosave | `scripts/qa/setup-ui.js`; saved text and summary re-read through API |
| 31 screen/editor routes | `scripts/qa/smoke.js`; overview, library, maps, history, relationships, campaigns/GM, writing/scenes, notes/tasks, tools, media, import, settings and 17 typed editors |
| Real map pin placement, naming and save | `scripts/qa/interactions.js`; marker count and persisted label checked |
| Comma-separated tags, reader version/preview and revision history | Same interaction script; stored tag array and rendered dialogs checked |
| GM dice/activity and Chronicle map | Same interaction script; real API result and rendered image overlay |
| Weighted table roll and quoted CSV replacement | `scripts/qa/tools-ui.js`; preview, quoted cell content and persisted rows checked |
| Calendar grid/moon display, whiteboard note persistence | Same tools script; displayed grid/card counts and saved data |
| Manuscript editor/corkboard and global search | Same tools script; scene editor and search result assertions |
| Stale-tab conflict and recovery | `scripts/qa/conflict-ui.js`; newer save preserved, local draft retained, recovered copy opened |
| Real campaign copy-import | `scripts/qa/import-ui.js`; one selected file copied into QA, all **34** scanned NPC Catalogue source hashes unchanged |
| Responsive layouts | Screenshots inspected at 1440x1000, 1024x768 and 390x844; no horizontal document overflow in the reviewed overview layouts |

Normal route and interaction runs reported no runtime errors or failed assets. The conflict test deliberately generates **HTTP 409**, which the generic network logger reports as an error; its assertions passed and confirmed the intended recovery behavior. That expected conflict is not counted as a successful network response.

Local screenshot artifacts are in `.preview`: `setup.png`, `editor.png`, `overview.png`, `overview-1024.png`, `overview-mobile.png`, `map.png`, `conflict-recovered.png` and `import-verified.png`. These files and QA data are ignored by Git.

Example isolated run:

```powershell
$env:WORLDBUILDER_DATA = Join-Path (Get-Location) '.preview\qa-data'
.venv\Scripts\python.exe scripts\launch.py --port 8768 --no-browser
# In a separate terminal, with the isolated Edge debug session on port 9225:
node scripts\browser-check.mjs --url http://127.0.0.1:8768/ --port 9225 --evaluate scripts\qa\setup-ui.js
node scripts\browser-check.mjs --url http://127.0.0.1:8768/ --port 9225 --evaluate scripts\qa\fixtures.js
node scripts\browser-check.mjs --url http://127.0.0.1:8768/ --port 9225 --evaluate scripts\qa\smoke.js
```

Run setup before fixtures against a fresh QA directory. Further scripts modify that QA campaign as their assertions require. Conflict verification intentionally returns a nonzero generic helper exit because of the expected 409; inspect its assertion result separately. Avoid concurrent helper runs against the same browser target.

## Complete backup restoration

[scripts/verify_recovery.py](../scripts/verify_recovery.py) refuses the real data directory. It creates a backup of the isolated installation, verifies the manifest, checks authenticated verification/download, restores into a new temporary directory, runs SQLite integrity/foreign-key checks, compares world/entry/revision/media counts and hashes **every restored asset against its database digest**. Reusing an existing destination is rejected.

The same check also round-trips the populated world's portable archive across all present module kinds, compares relationship/media/published-snapshot counts, validates imported image hashes and rolls back the test copy. The final fixture installation contained 1 world, 23 entries, 30 revisions and 1 image.

```powershell
$env:WORLDBUILDER_DATA = Join-Path (Get-Location) '.preview\qa-data'
.venv\Scripts\python.exe scripts\verify_recovery.py
```

Restarting the QA server retained saved data. Original and restored installations use different cookie names and different ports. Production setup remains unconfigured for the owner.

## Boundaries still requiring work

No physical network-adapter disconnection, formal accessibility audit, large-world load test, multi-user permission test, public deployment, external integration or complete third-party content compatibility test has passed. Long jobs/streaming archives are not implemented. The source/archive limits are documented in README. Most 139-item parity rows are consequently marked partial or planned in [implementation-status.md](implementation-status.md).
