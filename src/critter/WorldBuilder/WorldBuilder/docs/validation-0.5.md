# Validation record — 0.5.0

Date: 5 November 2026. Runtime: Windows, one local owner, browser UI, Waitress bound to loopback. Browser/test mutations used isolated `.preview/qa-data` on port 8768. Main user data was not a fixture.

## Acceptance evidence

- **R-01:** extended-family projections and diagrams/lists support multiple parents and shared ancestors without duplicate people. Tests include parent/child, grandparent, siblings, aunt/uncle, cousin, spouse and explicit adoptive links. Recorded kinship labels are useful summaries, not exhaustive genealogy inference.
- **R-02:** ancestor/descendant queries, depth limits and couple shared-descendant intersections exclude unrelated branches. The adoption option changes eligible ancestry explicitly. Browser checks exercised roots, couple filters, depth and kinship labels.
- **R-05:** manual/tag/combined hierarchy selection, normalized all/any tags, cycle checks, independent parent mappings, branch moves, sibling ordering and published reader membership. Browser moves retained descendants and left library parents unchanged; reopened structure matched saved values. Legacy definitions retain collection-derived parent display until explicit links are saved.
- **R-06 remains partial:** local diagrams have zoom/scroll and full-name lists; saved hierarchy reader entries render filtered lists/diagrams. Static graph exports and portable external embeds remain unfinished.

## Technical and browser checks

- Full backend suite: **126 tests passed**, including **22 new graph tests**. These cover extended kinship, root/couple/depth/adoption filtering, ancestry cycles beyond 200 generations, legacy cyclic graph display, ownership/authentication, private endpoints/edges/notes, published names/tags, hierarchy selection/order/moves/cycles, stale edits and portable archive remapping.
- `scripts/verify_graph_concurrency.py` ran against the isolated real SQLite installation. Concurrent opposite parent/adoptive-parent requests returned **201 and 400**, preserving an acyclic result. Competing hierarchy edits using the same revision returned **200 and 409**, preserving one whole edit. Report: `.preview/graph-concurrency-0.5.json`.
- TypeScript, targeted Python error/unused-code checks, Prettier and the production Vite build passed. The checks do not assert compliance with every optional lint/style rule.
- `scripts/qa/graphs-fixtures.js` creates a multi-generation family with a couple, separate branch, adopted child and private endpoint, plus a tagged hierarchy.
- `scripts/qa/graphs-ui.js` passed five workflow groups: bloodline queries, kinship/reader diagrams, subtree moves, ordering/tag membership, and saved reader/reopen behavior. One early automation assertion read React zoom state before its update; waiting for the update corrected the check.
- `scripts/qa/graphs-forms.js` created a guardian connection through the form with a shared label and private notes. Manual hierarchy membership toggles persisted while a tag-selected member remained present.
- `scripts/qa/graphs-layout.js` passed at 390, 1024 and 1440 pixels for family controls/diagrams/lists, hierarchy membership/structure, and saved reader preview. No page-width overflow. Screenshots were inspected; parent arrows are directional, while spouse/sibling links are undirected.
- The existing 31-route browser smoke suite passed without runtime errors or unexpected failed requests.
- Complete backup download/checksum verification, SQLite integrity, restored row counts, all asset hashes, existing-destination protection and portable world roundtrips passed. Report: `.preview/recovery-0.5.json`. That snapshot contained one QA world, 95 entries, 160 revisions and two images.

## Reader boundaries

Reader graph roots, traversal, labels, nodes, edges and counts use only permitted saved entries and currently shared connections. Private notes are stripped. Reader hierarchy definitions remove hidden IDs from manual/order/parent settings, detach hidden parents without disclosing their identity, and use published tags. Browser checks inspect the actual reader surfaces and corresponding direct API responses.

Connections use immediate visibility and have no separate published snapshots. Hierarchy definitions use normal Resource publication. Online hosting, accounts and player/group grants are still the later P5 phase; local reader previews do not provide player access.

## Installation

Before upgrade, created and checksum-verified real-data backup `2026-11-05_12-26-21_ff7b4f.wbbackup.zip`. No schema migration was needed. The previous browser bundle is retained at `.preview/dist-previous-20261105-122641`.

The restarted application reports 0.5.0 at `http://127.0.0.1:8767/`; its login page renders without browser errors or failed assets. All database table counts/content hashes and media hashes match the pre-upgrade baseline, and SQLite integrity passes. The real installation retained one world and one entry, with no images. Records: `.preview/main-0.5-before.json`, `.preview/upgrade-0.5-result.json`, `.preview/main-0.5-login.png`.

## Remaining scope

Saved custom family views, exhaustive kinship inference, independently revisioned connection editing, static graph exports, portable external graph embeds, formal assistive-technology certification and broad load testing remain. Queries support up to 30 generations/connection steps; creation checks ancestry without that display limit. Advanced calendar rules, map icon options and other inventory rows remain unfinished. These tests establish the exercised workflows, not zero defects or full platform parity.
