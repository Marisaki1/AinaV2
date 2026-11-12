# Validation record - 0.13.0

Date: 5 November 2026. Single-owner Windows browser installation. Synthetic campaign data, browser profile and recovery checks stayed under `.preview`.

## Visual campaign guides and notes

The user's preference for visual guides and notes is recorded as USER-02 and in the continuation tracker. Campaign affinity webs are available through Campaigns > campaign > Affinity web; world webs are under Relationships > Affinity web. No calendar expansion or numeric progression automation was added.

The chart uses existing character/lore/map/quest entries and connection identities. Portraits or initials, labelled directional curves and relationship colours form the guide. Selecting a node shows its original text, GM notes and related campaign records alongside the chart. Selecting a line shows direction, strength and owner notes. Connection creation/editing uses the existing revision-checked history API. Portraits can be chosen from local media; private notes can be written and linked directly from the inspector.

Node dragging saves positions in the versioned relationship entry. Background panning, zoom/fit, automatic arrangement, name/summary search, type filtering and one-hop focus are supported. Keyboard Enter/Space inspects a node; arrow keys move an editable node. Multiple webs are independently named, saved and selectable.

Campaign charts derive membership from party, related lore and linked session/note records. Reader membership uses published campaign/source definitions. Server projections remove private/deleted nodes and links, owner notes, private layout keys and unavailable campaign IDs. An unavailable campaign produces an empty graph rather than expanding to the whole world. Published layouts remain independent from draft arrangements and portraits. Reader inspection fetches reader entry data and offers no owner-edit action.

## Verification

- **308 backend tests passed**, including all 293 prior tests and 15 affinity cases. New cases cover campaign boundaries, linked session lore without copied entries, reader filtering of cast/edges/layout IDs/party references, private-campaign fallback, published summaries/layouts/membership, hidden edges, tag filters, malformed/foreign coordinates and campaigns, stale writes, revision restoration, deleted-node layout retention and archive remapping of dictionary keys and published snapshots. Evidence: `backend/studio/test_affinity.py`, `.preview/backend-tests-0.13.txt`, `.preview/affinity-tests-0.13.txt`.
- Browser workflows pass for chart creation, eight campaign nodes/six edges, entry inspection, linked journals, search/type/focus filtering, relationship label/strength/note editing with retained ID, portrait selection and directly created private linked notes. `.preview/affinity-ui-0.13.json`.
- **Actual CDP mouse and keyboard events** verify node dragging saves, positions survive full browser reload, keyboard movement saves, background pan changes the camera and zoom changes its scale. `.preview/affinity-interactions-0.13.json`, `scripts/qa/affinity-interactions.mjs`.
- Reader browser preview shows seven published nodes/five public edges; hidden NPC/relationship, GM notes, private notes, layout IDs and an unpublished portrait remain excluded. Reader inspector stays within reader data. `.preview/affinity-reader-0.13.json`.
- At **390, 1024 and 1440 pixels**, chart/inspector layouts fit, notes remain accessible, filters focus their search fields and relationship-editor dropdowns stay within the modal and viewport. Screenshots inspected. `.preview/affinity-mobile-0.13.json`, `.preview/affinity-tablet-0.13.json`, `.preview/affinity-desktop-0.13.json` and matching PNGs.
- The existing **31-route smoke suite** and campaign association-preservation workflow pass on the final bundle. All final positive browser-check reports contain no JavaScript exceptions or failed requests/assets. `.preview/smoke-0.13.json`, `.preview/campaign-regression-0.13.json`.
- TypeScript, Prettier, targeted Python checks, Django checks and production build pass. The AST guard counts **64 searchable dropdown locations**. No dependency or schema migration was added; migration generation reports no changes.
- Complete backup/download/checksum, restored counts/image hashes, SQLite integrity, protected destination and portable-world checks pass. QA recovery retained **210 entries, 350 entry revisions, two images, 36 connections and 47 connection revisions**. `.preview/recovery-0.13.json`.

Testing corrected native image dragging interfering with node movement and scrollable chart containers shifting during focus. Portrait hit testing now reaches the node and chart containers use clipped, non-scrollable viewports. The initial pan harness also aimed above the visible viewport after keyboard focus; it now targets an actual visible background point. Archived position dictionary keys are explicitly remapped. Review found that reader campaign party IDs needed the same filtering as related-entry IDs; this is corrected and covered by tests.

## Boundaries and continuation

USER-02 remains partial because broader visual progression, maps and campaign guides remain to implement. This is an affinity-style guide, not a claim to reproduce every Xenoblade mechanic. Charts display at most 250 entries with an explicit notice; larger saved graphs should be narrowed by campaign/tag filters. Arrangement coordinates are saved, while pan/zoom reset on reopening. Existing SVG/offline HTML exports retain the standard graph-diagram appearance; JSON and portable worlds retain affinity positions. Full affinity artwork/export fidelity and broader load/accessibility testing remain.

All 139 original inventory rows remain accounted for: **27 verified local acceptance, 68 partial, 44 planned**. The status table was reconciled with its canonical inventory, including the previously verified R-03 row. Online player accounts/grants remain later P5. Continue with visual character/NPC progression, location/map notes and campaign navigation; calendar completeness and numeric automation must not displace these priorities.

## Local installation

Created and checksum-verified real backup **2026-11-05_20-58-29_d467f9.wbbackup.zip** before replacing the browser bundle. Previous bundle retained at `.preview/dist-previous-20261105-205849`. The installed server reports **0.13.0**, `test_workspace: false`, at `http://127.0.0.1:8767/`. All **22 table counts and full content hashes**, media hashes and SQLite integrity match the pre-upgrade baseline. Real data remains **two worlds, three entries, zero connections and no images**. Evidence: `.preview/main-0.13-before.json`, `.preview/upgrade-0.13-result.json`.

The installed login page also loads without JavaScript exceptions or failed assets/requests. Evidence: `.preview/main-0.13-browser.json`, `.preview/main-0.13-login.png`. The isolated QA server/browser were closed after testing; the main local server remains running.
