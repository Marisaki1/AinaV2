# WorldBuilder status audit - 13 November 2026

## Result

The initial tracker repair changed documentation/tooling only. A subsequent local-workflow implementation adds general note conversion and bounded reviewed cross-world transfer; the current evidence below includes that continuation. All 139 original IDs remain. Delivery, verification coverage, scope, confidence, priority and dependencies are separate. There is no platform-completion percentage.

Current delivery: **37 implemented, 61 partial, 38 planned, 3 external boundaries**. Current verification: **10 bounded local acceptances passed, 88 with subset coverage, 38 not verified, 3 external dependencies**. These counts describe different dimensions; subset-covered rows does not mean 87 failing tests.

## Files and analysis boundary

**355 authored text files** were read/indexed, covering the WorldBuilder backend, frontend, migrations, launch/transfer/recovery tools, QA/test sources, configuration/manifests, documentation and listed Aina host/shell integration files. File sizes, SHA-256, line counts, Python definitions/test cases and relevant symbols/headings are retained in [status-file-index.json](status-file-index.json). No included file failed indexing.

| Category | Files |
| --- | ---: |
| application_source | 137 |
| configuration_or_launcher | 12 |
| dependency_manifest | 3 |
| documentation | 40 |
| test_or_qa | 163 |

This is a complete inventory of the included authored scope plus targeted semantic review, not a claim that every line of every file was manually proven correct. Python sources were parsed; frontend files were indexed and checked by TypeScript/browser workflows. Source/registry/model/route/test review was used to check the named status contradictions and broad feature boundaries. Evidence paths identify implementation/test locations, not proof that a test covers every promise in an area.

Third-party dependency trees, virtual environments, build output, caches, databases, credentials, transfer archives, uploaded media and campaign data were excluded from source review. Their directory/binary exclusion classes are recorded; their contents were not inspected. Build behavior was exercised by the existing bundled-app browser suites. Unrelated CritterDB creature records and bot features were outside this WorldBuilder status audit.

## Corrections

| ID | Correction | Confidence |
| --- | --- | --- |
| A-08 | Local account passwords are not per-resource access codes. Delivery changed from partial to planned. | High: account/route/model distinction. |
| T-02 | Known recurrence/phase fixtures do not complete exceptions and advanced repeat patterns. Broad row remains partial. | High for delivered subset; medium for broad remaining semantics. |
| T-03 | Calendar JSON exchange is implemented; independent online sharing is not. Mixed row remains partial. | High: direct export/import tests and no player-membership delivery. |
| T-04 | Signed/uncertain sorting does not complete relative era-year/confidence policies. Broad row remains partial. | Medium: source/test scope and explicit remaining policy. |
| B-07 | HTML/text/raster images are a tested subset; opening one exported book is not full multimedia/structured book-only export conformance. | High for tested subset; medium for entire broad capability. |
| I-07 | Standalone calendar JSON exchange must not be listed as missing. Typed/reference table CSV round trips remain separate. | High: named calendar endpoint and fixtures. |
| O-02 | Transfer packaging exists. Physical network-disconnected core authoring remains unverified. | High: launch/transfer/recovery code and test boundary. |
| N-05 | General note conversion was initially missing and distinct from task conversion N-03; it is now implemented in the following continuation. | High: task-only operation guard. |
| X-01/X-02/X-03 | Existing external audiences, human services and unavailable content/licensing are not ordinary software backlog. IDs retained as external boundaries. | High on category distinction; no external availability claim. |
| USER-01 | Replaced stale 97-location language with the current 107-location source guard and representative UI-test boundary. | High: current checker output. |

Old counts/status/acceptance and report links remain as provenance fields in [feature-inventory.json](feature-inventory.json). The original research matrix is labeled historical; strengthened acceptanceChecks govern current work. Runtime code was not deleted or downgraded by a documentation reclassification.

## Current test evidence

All tests used isolated temporary accounts/data or pure transformations. No live Discord or CritterDB integration was tested or claimed.

| Run | Result | Boundary |
| --- | --- | --- |
| Isolated Django runner: run_tests([studio]), WORLDBUILDER_DATA set to a new temporary directory | 702 tests passed in 113.735 seconds; no system-check issues. | Backend assertions across existing modules; not a complete UI/load/accessibility certification. |
| npm run test:worldbuilder | Integrated, manuscript and transfer browser workflows passed. | Isolated headless Edge; account isolation, managed restart, notes/snippets/custom fields/Overview/manuscripts, recovery/conflicts and selected responsive cases. |
| npm run check (WorldBuilder directory) | TypeScript passed; 107 searchable dropdown locations. | Source/type guard; does not prove usability of every control. |
| node --test test/worldbuilder-host.test.js | 1 managed startup-failure lifecycle test passed. | Synthetic failure while stdin remains open; no owner data or real process killed. |
| node scripts/check-worldbuilder-knowledge.js | Mention matching/format preservation and safe board SVG pure checks passed. | Pure transformations; no runtime or account writes. |
| npm run test:worldbuilder:status | 16 tracker invariant tests passed, including source-fingerprint/count drift rejection. | Counts, original IDs, evidence paths, implementation/verification separation, confidence, dependencies and generated summary. |

The exact command outcomes, temporary artifact locations, runtime/test source fingerprint and limitations are in [status-audit-results.json](status-audit-results.json). The checker rejects a source change followed by a stale pass claim; it does not automatically refresh verification when code changes.

## Historical evidence limitations

227 historical QA artifact references were examined for file presence; 0 exist at their recorded paths in this installation. Older reports remain documentary claims with their original dates, not independently reproduced raw evidence. This does not establish that old tests failed, or that artifacts do not exist elsewhere. Current backend/browser results are separate.

CDP-only legacy QA scripts were inspected/indexed but were not blindly executed: some target fixed ports or an existing authenticated browser. There was no reason to attach to the user's browser or seed their real database for a documentation audit. External World Anvil documentation was not refreshed live; its baseline date remains explicit.

Physical network-disconnection, broad load/durability, assistive technologies, real online memberships/groups, external adapters and proprietary catalogue availability remain unverified or unimplemented. A passing code/test inventory does not certify subjective UI quality or zero defects.

## Keeping this repaired

- Canonical data: feature-inventory.json. Generated readable status: implementation-status.md.
- Current decisions/order: project-tracker.md. Pre-audit narrative: project-tracker-history.md, clearly historical.
- Generator/checker: scripts/audit-worldbuilder-status.py, exposed through npm run docs:worldbuilder:generate and npm run docs:worldbuilder:check.
- Tracker tests: npm run test:worldbuilder:status. They reject missing/original IDs, conflated verified delivery, absent evidence, incomplete acceptance, stale counts, missing confidence, cycles, stale source fingerprints and test-count drift.
- The one-time schema migration is retained as scripts/repair-worldbuilder-status.py for review; it refuses an already migrated inventory. Future work edits v2 rather than rerunning it.
- README, architecture, delivery plan, matrix and current tracker now distinguish active installation facts, historical research, implemented local subsets and later online/external work.

Confidence: **high** for file inventory, detected contradictions, current command outcomes and structural consistency. **Medium** for exhaustive feature completeness/absence: semantic review is targeted and not every historical UI scenario, device or external service was exercised.


## Reviewed transfer continuation

General note conversion N-05 now has direct preservation, idempotency, stale-save,
private-origin and browser lost-response evidence. Cross-world K-14 advances to
partial: signed dependency/media/reference review, transactional private copies,
recoverable source Move, dedup-safe rollback and persistent receipt recovery are
implemented. Opaque references and general history migration remain explicit limits.
The 26 related backend tests and final browser fixture use only synthetic data.

Source/type counts now include 355 authored files and 702 backend test definitions.
The combined browser suite contains three workflows, with the final transfer UI
also rerun independently after rebuilding. Current application fingerprint and
actual outcomes are recorded in status-audit-results.json; the preceding audit
runs are retained there as history. The 16 invariant checks cover the new inventory
without treating partial transfers as complete. A pre-update SQLite snapshot passed
integrity and matching counts for all 22 tables; no owner records were changed.

## 14 November 2026 continuation: 1.3.0

Current evidence is recorded in status-audit-results.json: 777 backend tests, production type/build checks and isolated headless integration, campaign, live-block and search/research workflows. The new delivery is owner-only federated search and private source-linked research; it does not establish online player access, multi-author discussion or large-library performance. Earlier run references remain historical where explicitly marked.

## 14 November 2026 continuation: 1.4.0

Owner World explorer and ordered original-reference shelves extend browsing and presentation. Source evidence, the isolated explorer browser workflow, backend fixtures and the current production checks are recorded in status-audit-results.json. K-13 remains partial: this delivery does not certify arbitrary themes or a public player site. Existing original feature IDs and broad verification limits remain intact.
