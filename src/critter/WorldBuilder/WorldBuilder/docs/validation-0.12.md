# Validation record - 0.12.0

Date: 5 November 2026. Windows browser application with one local owner. All campaign fixtures and recovery tests ran in `.preview/qa-data`, separately from real worlds.

## Campaign essentials

This release changes the implementation priority to the user's campaign workflow. Calendar expansion is deferred in the tracker. Campaigns now group sessions, day-to-day journal records, notes/tasks, progression, characters/places and maps. Run session opens the existing GM reference/dice/party/quest/equipment screen.

- Session plans choose the next number within the campaign. Preparation, recap, consequences/world changes, rewards/progression and follow-up are separate saved fields. Planned, in-progress, completed and cancelled states remain distinct from article writing status.
- Preparation, consequences and follow-up are GM-only fields. Reader responses and search remove them server-side; published recaps/rewards retain their snapshot. Private campaign/session/related-entry references and parent IDs are filtered.
- Daily journal notes have an actual journal date, a free-text in-world day/chapter, a related session and their own document. Notes, milestones, tasks and quests are independent private entries with normal history, Trash and archive support. They do not mutate or duplicate session reports.
- Campaign-specific notes/tasks, journal entries, milestones, quest outcomes and session rewards can be searched from their relevant sections. Existing world notebook access remains available.
- Party characters and linked NPCs, locations and maps use original entry IDs. Searchable linking/unlinking does not copy lore. Records can return to their campaign workspace; maps open their existing image and location links.

## Verification

**293 backend tests passed**: the previous 278 plus 15 campaign cases. They cover private/versioned journal and milestone records, structured session fields, reader snapshot/privacy, foreign/wrong-kind campaign and session references, campaign/session mismatch, field bounds, malformed dates including empty non-text values, related-entry validation, retained deleted references, optimistic conflicts, revision restoration, legacy parent associations and portable archive remapping. Additional search assertions in the campaign tests verify GM preparation/consequences/follow-up cannot match reader search. Evidence: `backend/studio/test_campaigns.py`, `.preview/backend-tests-0.12.txt`, `.preview/campaign-tests-0.12.txt`.

Actual browser checks passed:

- Create session 2 after an existing session 1, retain private preparation without copying it to a summary, save completed state/recap/consequences/rewards/follow-up, publish a reader recap with GM fields excluded from HTML and JSON, and view session rewards under progression. `.preview/campaign-session-0.12.json`.
- Create journal, milestone, note, task and quest records with body text and correct campaign/session IDs. Search records, exclude another campaign's notes, complete a task and retain an abandoned quest outcome. `.preview/campaign-journal-0.12.json`.
- Show original party/NPC/place entries, search/remove/restore a campaign link, open its map image with the original linked location, retain journal associations and open the existing GM screen/party. `.preview/campaign-links-0.12.json`.
- Selecting an already-selected campaign leaves the record revision and session association unchanged, in both journal and session editors. `.preview/campaign-preservation-0.12.json`.
- All seven campaign sections fit **390, 1024 and 1440 pixels**. Session pickers open a focused text filter inside the modal and viewport. Mobile/desktop screenshots were inspected. `.preview/campaign-mobile-0.12.json`, `.preview/campaign-tablet-0.12.json`, `.preview/campaign-desktop-0.12.json` and matching PNGs.
- The existing **31-route smoke suite** passes on the final bundle. All final positive browser reports have empty JavaScript-error and failed-request lists. `.preview/smoke-0.12.json`.

TypeScript, Prettier, targeted Python checks, Django checks and production Vite build pass. The AST guard counts **60 searchable dropdown locations** and rejects raw select controls. Migration generation reports no changes; no dependency or schema migration was added.

Complete backup/download/checksum, database integrity, restored row counts/image hashes, protected restore destination and portable-world roundtrip checks pass. Recovery retained **198 entries, 324 entry revisions, two images, 30 connections and 40 connection revisions** in the disposable world. `.preview/recovery-0.12.json`.

Testing corrected a browser harness that clicked the global Notes & tasks navigation instead of the campaign tab; its dependent map test was rerun after valid journal fixtures existed. Review also ensured preparation is not copied into reader-facing summaries, invalid empty date containers are rejected, and reselecting the same campaign preserves the related session.

## Remaining work

This provides campaign records and connected navigation, not a finished character-sheet system. Automatic character XP/level/inventory calculations, explicit PC/NPC roles, richer map/location workflows, configurable GM panes and broader load/accessibility testing remain. Online player accounts and selective sharing remain later P5. All 139 original rows remain accounted for at **27 verified local acceptance, 68 partial and 44 planned**; no broad campaign row was promoted prematurely.

Next implementation priority is character/NPC progression and map/location usability for running a campaign. Calendar expansion must not displace this work.

## Local installation

Created and checksum-verified real backup **2026-11-05_18-36-11_d11fa1.wbbackup.zip** before replacing the bundle. Previous bundle retained at `.preview/dist-previous-20261105-183624`. The installed server reports **0.12.0**, `test_workspace: false`, at `http://127.0.0.1:8767/`. All **22 table counts and complete content hashes**, media hashes and SQLite integrity match the pre-upgrade baseline. Real data remains **two worlds, three entries, zero connections and no images**. Evidence: `.preview/main-0.12-before.json`, `.preview/upgrade-0.12-result.json`.

The installed login page loads with no JavaScript errors or failed assets/requests. Evidence: `.preview/main-0.12-browser.json`, `.preview/main-0.12-login.png`. The isolated QA server and browser were closed; the main local server remains running.
