# Validation record — 0.6.0

Date: 5 November 2026. Profile: one Windows owner, browser application and loopback Waitress server. Browser fixtures and verified download artifacts used `.preview`; no real world content was used as a fixture.

## Delivered acceptance

**R-04:** named relationship entries retain root/couple/depth/adoption, tag and connection-type filters, with family/network/diplomacy modes. Browser checks saved a current family view as a private entry, changed mode/tag/type filters, edited a source tag, and reopened the named view. Eligible nodes updated after the source edit. Published reader definitions and published source tags remained distinct from drafts.

**R-06 local acceptance:** saved graph and hierarchy reader entries display diagrams and matching full-name lists. Actual SVG, JSON and offline HTML downloads use the same server projection. Downloaded reader SVG/JSON contained exactly the two displayed reader identities; hierarchy SVG matched its reader list as well. The HTML file opened through `file://`, initialized its hash-authorized script, and passed zoom/reset/search checks with no HTTP resources. The fixed HTML artifact is portable; protected online app embedding remains later hosting work.

## Tests and evidence

- Full backend suite: **148 tests passed**, including **22 new saved-view/export tests**. Cases cover live tag/type/couple/adoption filters, filtered/private roots, source/view snapshots, asymmetric diplomacy values, hidden endpoints/labels/notes, XML/HTML escaping, matching node sets, CSP script hashes, download headers, export bounds, authentication/ownership/Trash, revisions/conflicts and archive remapping.
- TypeScript, targeted Python error/unused-code checks, Prettier and production Vite build passed. Migration check reported no schema changes.
- `scripts/qa/saved-graphs-ui.js`: six workflow groups passed, including creation, filters, source updates, reader publication, actual file downloads and reader embed/reopen behavior.
- `scripts/qa/saved-graphs-layout.js`: 390, 1024 and 1440 pixel checks passed for saved editors, reader graphs, export controls and library navigation, without page-width overflow. It also compares relationship JSON and hierarchy SVG identity sets to their displayed projections. Screenshots inspected.
- Actual browser downloads were directed to `.preview/graph-downloads`. Their parsed membership, file sizes and privacy checks are recorded in `.preview/graph-downloads-0.6.json`.
- `scripts/qa/offline-graph.js`: downloaded local HTML initialized correctly, preserved two reader entries in its SVG/list, and passed search/zoom/reset and private-content checks. Report: `.preview/offline-check-0.6.json`; screenshot: `.preview/offline-graph-0.6.png`.
- The existing 31-route smoke suite passed without browser errors or unexpected failed requests. Earlier family/hierarchy/map workflows remain covered by backend regression tests.
- Complete backup/checksum/download verification, SQLite integrity, restored row counts, image hashes, existing-destination protection and portable world roundtrip checks passed. Final report: `.preview/recovery-0.6.json`, including the new Resource kind.

The browser test helper now explicitly restricts QA downloads to `.preview`, supplies user activation for simulated interactions, and ignores Edge's internal downloads hub when selecting the app target. Repeated fixtures use unique tags to keep earlier QA runs out of membership assertions. These corrections were followed by successful file and offline-browser checks.

The initial browser attempt placed three synthetic files in Downloads. Their exact names and QA contents were verified before removing only those files; cleanup evidence is in `.preview/qa-download-cleanup-0.6.json`. The verified release artifacts remain in `.preview/graph-downloads`.

## Installation

Created and checksum-verified real-data backup `2026-11-05_12-58-22_d37822.wbbackup.zip` before replacing the browser bundle. No schema migration was needed. The prior bundle remains at `.preview/dist-previous-20261105-125842`.

The restarted local application reports 0.6.0 and its login page renders without errors or failed assets. All real database table counts/content hashes and media hashes match the pre-upgrade baseline, and SQLite integrity passes. The installation retained one world and one entry with no images; synthetic graph fixtures stayed separate. Records: `.preview/main-0.6-before.json`, `.preview/upgrade-0.6-result.json`, `.preview/main-0.6-login.png`. The verified QA recovery snapshot retained 113 entries, 188 revisions and two images in one QA world.

## Boundaries

Owner exports may include private entries; reader exports filter them server-side. Both exclude article bodies and relationship/GM notes. Offline copies do not update or revoke after copying. JSON graph artifacts do not replace full world archives or backups. Views use the existing Resource revision/publication model, while connection visibility remains live.

Online self-hosting, player accounts, grants/revocation and protected live embeds remain the confirmed later P5 phase. Advanced calendars/eras, map icons, connection editing/history, broad performance/assistive-technology testing and other inventory items remain unfinished. The tested workflows do not establish zero defects or full platform parity.
